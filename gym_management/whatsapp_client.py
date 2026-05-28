"""WhatsApp Cloud API client (Meta Graph API v19.0).

Per-tenant credentials live in site_config.json (NOT in a DocType row):
  - whatsapp_phone_number_id     : the sender's phone number ID
  - whatsapp_business_account_id : the WABA ID (for template management)
  - whatsapp_access_token        : long-lived access token from Meta
  - whatsapp_verify_token        : our shared secret echoed during webhook handshake
  - whatsapp_app_secret          : Meta app secret used to verify X-Hub-Signature-256

This matches the M-Pesa pattern: site_config.json is the single source of truth
for tenant credentials. Channel Connection rows track *which* channels a tenant
has enabled and their status, not the secrets themselves.
"""

from __future__ import annotations

import hashlib
import hmac
from typing import Any

import frappe
import requests


GRAPH_API_VERSION = "v19.0"
GRAPH_API_BASE = f"https://graph.facebook.com/{GRAPH_API_VERSION}"


class WhatsAppConfigError(frappe.ValidationError):
	pass


class WhatsAppAPIError(frappe.ValidationError):
	pass


class WhatsAppClient:
	"""Per-site WhatsApp Cloud API client.

	Construct via WhatsAppClient.for_current_site() — never read credentials
	directly elsewhere; this keeps the multi-tenant boundary clean.
	"""

	def __init__(
		self,
		phone_number_id: str,
		access_token: str,
		app_secret: str,
		verify_token: str,
		business_account_id: str | None = None,
	):
		self.phone_number_id = phone_number_id
		self.access_token = access_token
		self.app_secret = app_secret
		self.verify_token = verify_token
		# WABA ID is only needed for template management (submit/list/delete);
		# the message-sending endpoints route via phone_number_id instead.
		self.business_account_id = business_account_id

	@classmethod
	def for_current_site(cls) -> "WhatsAppClient":
		conf = frappe.local.conf
		missing = [
			k for k in (
				"whatsapp_phone_number_id",
				"whatsapp_access_token",
				"whatsapp_app_secret",
				"whatsapp_verify_token",
			)
			if not conf.get(k)
		]
		if missing:
			raise WhatsAppConfigError(
				f"site_config.json is missing WhatsApp keys: {', '.join(missing)}"
			)
		return cls(
			phone_number_id=conf["whatsapp_phone_number_id"],
			access_token=conf["whatsapp_access_token"],
			app_secret=conf["whatsapp_app_secret"],
			verify_token=conf["whatsapp_verify_token"],
			business_account_id=conf.get("whatsapp_business_account_id"),
		)

	def _require_waba(self) -> str:
		if not self.business_account_id:
			raise WhatsAppConfigError(
				"site_config.json is missing whatsapp_business_account_id — "
				"required for template management endpoints"
			)
		return self.business_account_id

	# ----- Signature verification (Meta posts X-Hub-Signature-256) -----

	def verify_signature(self, raw_body: bytes, signature_header: str | None) -> bool:
		"""Verify Meta's HMAC-SHA256 signature.

		signature_header looks like 'sha256=<hex>'. Returns True on match.
		"""
		if not signature_header or not signature_header.startswith("sha256="):
			return False
		expected = signature_header.split("=", 1)[1]
		computed = hmac.new(
			self.app_secret.encode("utf-8"),
			raw_body,
			hashlib.sha256,
		).hexdigest()
		return hmac.compare_digest(expected, computed)

	# ----- Outbound message helpers -----

	def _post(self, payload: dict[str, Any]) -> dict:
		url = f"{GRAPH_API_BASE}/{self.phone_number_id}/messages"
		headers = {
			"Authorization": f"Bearer {self.access_token}",
			"Content-Type": "application/json",
		}
		resp = requests.post(url, json=payload, headers=headers, timeout=15)
		try:
			data = resp.json()
		except Exception:
			data = {"error": {"message": resp.text}}
		if not resp.ok:
			err = data.get("error", {}).get("message", "unknown")
			raise WhatsAppAPIError(f"WhatsApp API {resp.status_code}: {err}")
		return data

	def send_text(self, to_phone: str, body: str) -> dict:
		"""Send a free-form text reply (only valid within the 24h customer
		service window after the user last messaged us)."""
		payload = {
			"messaging_product": "whatsapp",
			"recipient_type": "individual",
			"to": to_phone,
			"type": "text",
			"text": {"body": body},
		}
		return self._post(payload)

	def send_template(
		self,
		to_phone: str,
		template_name: str,
		language_code: str = "en",
		components: list[dict] | None = None,
	) -> dict:
		"""Send an approved template message (works outside the 24h window —
		this is what we use for renewal reminders, class reminders, etc.)."""
		payload = {
			"messaging_product": "whatsapp",
			"recipient_type": "individual",
			"to": to_phone,
			"type": "template",
			"template": {
				"name": template_name,
				"language": {"code": language_code},
			},
		}
		if components:
			payload["template"]["components"] = components
		return self._post(payload)

	def mark_read(self, message_id: str) -> dict:
		"""Mark an inbound message as read (shows blue ticks to the user)."""
		payload = {
			"messaging_product": "whatsapp",
			"status": "read",
			"message_id": message_id,
		}
		return self._post(payload)

	# ----- Template management (WABA-scoped) -----

	def submit_template(
		self,
		name: str,
		category: str,
		language: str,
		components: list[dict],
	) -> dict:
		"""Submit a template to Meta for approval.

		Endpoint: POST /v19.0/{waba_id}/message_templates
		Returns Meta's response which includes {'id': '<meta_template_id>',
		'status': 'PENDING', 'category': '...'}.

		`components` is the Meta-shaped list — see WhatsAppTemplate.submit_to_meta()
		for how we build it from header_text/body_text/footer_text fields.
		"""
		waba_id = self._require_waba()
		url = f"{GRAPH_API_BASE}/{waba_id}/message_templates"
		headers = {
			"Authorization": f"Bearer {self.access_token}",
			"Content-Type": "application/json",
		}
		payload = {
			"name": name,
			"category": category,
			"language": language,
			"components": components,
		}
		resp = requests.post(url, json=payload, headers=headers, timeout=15)
		try:
			data = resp.json()
		except Exception:
			data = {"error": {"message": resp.text}}
		if not resp.ok:
			err = data.get("error", {}).get("message", "unknown")
			raise WhatsAppAPIError(
				f"Meta template submit {resp.status_code}: {err}"
			)
		return data

	def list_templates(self, limit: int = 200) -> list[dict]:
		"""Fetch all message templates for this WABA.

		Endpoint: GET /v19.0/{waba_id}/message_templates
		Returns a list of dicts with at minimum: id, name, status, category,
		language, rejected_reason. Meta paginates with cursors — we walk pages
		until exhausted or until `limit` is hit.
		"""
		waba_id = self._require_waba()
		url = f"{GRAPH_API_BASE}/{waba_id}/message_templates"
		params: dict = {
			"fields": "id,name,status,category,language,rejected_reason",
			"limit": min(100, limit),
		}
		headers = {"Authorization": f"Bearer {self.access_token}"}
		out: list[dict] = []
		while url and len(out) < limit:
			resp = requests.get(url, params=params, headers=headers, timeout=15)
			try:
				data = resp.json()
			except Exception:
				data = {"error": {"message": resp.text}}
			if not resp.ok:
				err = data.get("error", {}).get("message", "unknown")
				raise WhatsAppAPIError(
					f"Meta template list {resp.status_code}: {err}"
				)
			out.extend(data.get("data") or [])
			# Cursor pagination — Meta returns paging.next as a full URL with cursors baked in
			next_url = (data.get("paging") or {}).get("next")
			url = next_url
			params = {}  # subsequent pages embed all params in the next URL
		return out[:limit]

	def delete_template(self, name: str) -> dict:
		"""Delete a template from Meta by name.

		Endpoint: DELETE /v19.0/{waba_id}/message_templates?name={name}
		Used when a template is rejected and we want to resubmit with edits, or
		when retiring an old template.
		"""
		waba_id = self._require_waba()
		url = f"{GRAPH_API_BASE}/{waba_id}/message_templates"
		params = {"name": name}
		headers = {"Authorization": f"Bearer {self.access_token}"}
		resp = requests.delete(url, params=params, headers=headers, timeout=15)
		try:
			data = resp.json()
		except Exception:
			data = {"error": {"message": resp.text}}
		if not resp.ok:
			err = data.get("error", {}).get("message", "unknown")
			raise WhatsAppAPIError(
				f"Meta template delete {resp.status_code}: {err}"
			)
		return data
