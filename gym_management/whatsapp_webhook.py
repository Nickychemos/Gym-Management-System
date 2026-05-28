"""WhatsApp Cloud API inbound webhook.

Two whitelisted endpoints expose at:
  GET  /api/method/gym_management.whatsapp_webhook.verify
  POST /api/method/gym_management.whatsapp_webhook.receive

GET (verify):
  Meta calls this once when you subscribe a webhook URL in the App dashboard.
  Query string carries hub.mode=subscribe, hub.verify_token=<our token>,
  hub.challenge=<random>. If verify_token matches what we have in
  site_config.json, we echo hub.challenge back as a plain integer.

POST (receive):
  Meta posts JSON every time:
    1. A user sends us a message (text / button / interactive reply)
    2. A message we sent changes status (sent → delivered → read, or failed)
  We verify the X-Hub-Signature-256 HMAC, parse the envelope, and dispatch:
    - Messages → chatbot.handle_inbound() → send replies back
    - Statuses → update the matching Campaign Send Log (if found)

Per-tenant: which tenant this is comes from the Host header (Frappe site
resolution) — frappe.local.conf is already scoped to the tenant by the time
the whitelist function runs. Each tenant has their own phone_number_id +
verify_token in their site_config.json.
"""

from __future__ import annotations

import json

import frappe

from gym_management.whatsapp_client import (
	WhatsAppAPIError,
	WhatsAppClient,
	WhatsAppConfigError,
)


# ============================================================================
# GET verify — Meta's webhook handshake
# ============================================================================


@frappe.whitelist(allow_guest=True, methods=["GET"])
def verify():
	"""Echo hub.challenge if hub.verify_token matches our shared secret.

	Meta calls this only when an admin configures the webhook URL in the
	Meta App dashboard. After subscription, all real traffic comes to receive().
	"""
	form = frappe.local.form_dict
	mode = form.get("hub.mode")
	token = form.get("hub.verify_token")
	challenge = form.get("hub.challenge")

	expected = frappe.local.conf.get("whatsapp_verify_token")
	if not expected:
		frappe.local.response["http_status_code"] = 503
		return "WhatsApp not configured for this site"

	if mode == "subscribe" and token == expected:
		# Meta wants the challenge echoed verbatim as the response body
		frappe.local.response["type"] = "binary"
		frappe.local.response["filename"] = None
		frappe.local.response["filecontent"] = str(challenge).encode("utf-8")
		return

	frappe.local.response["http_status_code"] = 403
	return "verify_token mismatch"


# ============================================================================
# POST receive — inbound messages + status updates
# ============================================================================


@frappe.whitelist(allow_guest=True, methods=["POST"])
def receive():
	"""Receive a WhatsApp webhook event.

	Always returns 200 quickly — Meta retries with exponential backoff if we
	return non-2xx, and retries would cause duplicate processing. We log any
	internal failure and still return 200, except for signature failures
	(403) and config failures (503).
	"""
	# 1. Read the raw body (we need exact bytes for HMAC verification, not
	# the parsed form_dict which may reorder/normalize)
	raw_body = frappe.request.get_data() if frappe.request else b""
	signature = (
		frappe.get_request_header("X-Hub-Signature-256") if frappe.request else None
	)

	# 2. Resolve tenant client + verify signature
	try:
		client = WhatsAppClient.for_current_site()
	except WhatsAppConfigError as e:
		frappe.local.response["http_status_code"] = 503
		frappe.log_error(str(e), "whatsapp_webhook.receive")
		return {"ok": False, "reason": "not_configured"}

	if not client.verify_signature(raw_body, signature):
		frappe.local.response["http_status_code"] = 403
		frappe.log_error(
			f"signature mismatch (header={signature!r})",
			"whatsapp_webhook.receive",
		)
		return {"ok": False, "reason": "bad_signature"}

	# 3. Parse the envelope
	try:
		envelope = json.loads(raw_body.decode("utf-8"))
	except json.JSONDecodeError:
		frappe.log_error("invalid JSON body", "whatsapp_webhook.receive")
		return {"ok": True}  # 200 so Meta doesn't retry

	if envelope.get("object") != "whatsapp_business_account":
		# Wrong object type — log and ack
		frappe.log_error(
			f"unexpected object={envelope.get('object')!r}",
			"whatsapp_webhook.receive",
		)
		return {"ok": True}

	# 4. Walk entries → changes → process messages and statuses
	for entry in envelope.get("entry", []):
		for change in entry.get("changes", []):
			if change.get("field") != "messages":
				continue
			value = change.get("value", {})
			for message in value.get("messages", []) or []:
				try:
					_handle_message(client, message)
				except Exception:
					frappe.log_error(
						frappe.get_traceback(),
						"whatsapp_webhook._handle_message",
					)
			for status in value.get("statuses", []) or []:
				try:
					_handle_status(status)
				except Exception:
					frappe.log_error(
						frappe.get_traceback(),
						"whatsapp_webhook._handle_status",
					)

	return {"ok": True}


# ============================================================================
# Internal dispatch
# ============================================================================


def _handle_message(client: WhatsAppClient, message: dict) -> None:
	"""Extract the text from one inbound message and run the chatbot."""
	from gym_management import chatbot

	from_phone = message.get("from")
	if not from_phone:
		return

	msg_id = message.get("id")
	msg_type = message.get("type")
	text = _extract_text(message)
	if text is None:
		# Unsupported type (image/audio/document) — acknowledge politely
		text = ""
		fallback_reply = (
			"I can only handle text and button replies right now. "
			"Type 'help' to talk to a team member."
		)
	else:
		fallback_reply = None

	# Mark as read (best-effort; not critical)
	if msg_id:
		try:
			client.mark_read(msg_id)
		except WhatsAppAPIError:
			pass

	if fallback_reply:
		_safe_send(client, from_phone, fallback_reply)
		return

	# Dispatch to the chatbot engine
	result = chatbot.handle_inbound(
		phone_number=from_phone,
		text=text,
		channel="WhatsApp",
	)
	for reply in result.get("replies", []):
		_safe_send(client, from_phone, reply)


def _extract_text(message: dict) -> str | None:
	"""Pull a string the chatbot can match on, regardless of message type."""
	msg_type = message.get("type")
	if msg_type == "text":
		return (message.get("text") or {}).get("body")
	if msg_type == "button":
		# Quick-reply button from a template
		return (message.get("button") or {}).get("text")
	if msg_type == "interactive":
		interactive = message.get("interactive") or {}
		if interactive.get("type") == "button_reply":
			return (interactive.get("button_reply") or {}).get("title")
		if interactive.get("type") == "list_reply":
			return (interactive.get("list_reply") or {}).get("title")
	return None


def _handle_status(status: dict) -> None:
	"""Update the matching Campaign Send Log when a message status changes.

	Status flow Meta sends: sent → delivered → read (or failed).
	We only act if there's a Campaign Send Log row keyed by the wamid; otherwise
	this was a one-off chatbot reply we don't track per-message.
	"""
	wamid = status.get("id")
	state = status.get("status")  # sent | delivered | read | failed
	if not (wamid and state):
		return

	log = frappe.db.get_value(
		"Campaign Send Log",
		{"provider_message_id": wamid},
		"name",
	)
	if not log:
		return

	updates: dict = {}
	if state == "sent":
		updates["status"] = "Sent"
	elif state == "delivered":
		updates["status"] = "Delivered"
	elif state == "read":
		updates["status"] = "Read"
	elif state == "failed":
		updates["status"] = "Failed"
		errors = status.get("errors") or []
		if errors:
			updates["error_message"] = errors[0].get("title") or str(errors[0])[:140]
	if updates:
		frappe.db.set_value("Campaign Send Log", log, updates)
		frappe.db.commit()


def _safe_send(client: WhatsAppClient, to_phone: str, body: str) -> None:
	"""Send a reply, swallowing API errors (logged) so one bad reply doesn't
	break the rest of the webhook dispatch."""
	try:
		client.send_text(to_phone, body)
	except WhatsAppAPIError:
		frappe.log_error(frappe.get_traceback(), "whatsapp_webhook._safe_send")
