"""Outbound campaign sender.

Wraps gym_management.whatsapp_client.send_template() with per-recipient
logging into Campaign Send Item rows (child of Campaign Send Log). The
parent log aggregates counters (target_count, delivered, delivery_rate);
the child rows hold per-message state (wamid, status, timestamps).

Sending flow:
  1. send_template_to_member() appends a Campaign Send Item with status=Queued
  2. Calls whatsapp_client.send_template() → Meta returns a wamid
  3. Item is updated: provider_message_id=wamid, status=Sent, sent_at=now
  4. Later, whatsapp_webhook receives Meta callbacks and walks
     Campaign Send Item by provider_message_id → updates status →
     calls recompute_stats() to roll up into parent counters

Scheduled campaign tasks (run from daily hooks):
  - run_renewal_reminders: members whose subscription ends in 3 days

Future scheduled tasks (not implemented yet — same pattern):
  - run_birthday_greetings
  - run_winback_campaign (lapsed > 30 days)
  - run_class_reminders (booked for tomorrow)
"""

from __future__ import annotations

import frappe
from frappe.utils import add_days, getdate, now_datetime

from gym_management.whatsapp_client import (
	WhatsAppAPIError,
	WhatsAppClient,
	WhatsAppConfigError,
)


# ============================================================================
# Per-recipient send
# ============================================================================


def send_template_to_member(
	campaign_log_name: str,
	customer: str | None,
	phone: str,
	template_name: str,
	language: str = "en",
	components: list[dict] | None = None,
) -> str:
	"""Send one template message to one phone, append a Campaign Send Item to
	the named Campaign Send Log, and return the item's row name.

	Raises WhatsAppConfigError if the tenant hasn't configured WhatsApp at all
	(caller decides whether to skip the whole campaign). Per-recipient send
	errors are caught and recorded on the item — they don't propagate.
	"""
	client = WhatsAppClient.for_current_site()
	log = frappe.get_doc("Campaign Send Log", campaign_log_name)
	item = log.append(
		"items",
		{
			"customer": customer,
			"phone_number": phone,
			"template_name": template_name,
			"language": language,
			"status": "Queued",
		},
	)
	log.save(ignore_permissions=True)

	try:
		resp = client.send_template(phone, template_name, language, components)
		messages = resp.get("messages") or []
		wamid = messages[0].get("id") if messages else None
		item.provider_message_id = wamid
		item.status = "Sent"
		item.sent_at = now_datetime()
	except WhatsAppAPIError as e:
		item.status = "Failed"
		item.failed_at = now_datetime()
		item.error_message = str(e)[:140]

	log.save(ignore_permissions=True)
	frappe.db.commit()
	return item.name


# ============================================================================
# Aggregate stats — called from webhook on every status callback
# ============================================================================


def recompute_stats(campaign_log_name: str) -> None:
	"""Roll up Campaign Send Item rows into parent counters.

	'delivered' counts items in (Delivered, Read) — Meta promotes Sent → Delivered
	once the device confirms, then Delivered → Read on blue ticks. We treat
	Read as a superset of Delivered for the delivery counter.
	"""
	log = frappe.get_doc("Campaign Send Log", campaign_log_name)
	total = len(log.items or [])
	if total == 0:
		return
	delivered = sum(1 for i in log.items if i.status in ("Delivered", "Read"))
	failed = sum(1 for i in log.items if i.status == "Failed")
	log.target_count = total
	log.delivered = delivered
	log.bounced = failed
	log.delivery_rate = round(delivered / total * 100, 2)
	# Status: if nothing is still Queued, the batch is done sending
	queued = sum(1 for i in log.items if i.status == "Queued")
	if queued == 0:
		log.status = "Sent"
	log.save(ignore_permissions=True)
	frappe.db.commit()


# ============================================================================
# Find-or-create today's Campaign Send Log for a given campaign
# ============================================================================


def _get_or_create_campaign_log(
	campaign_name: str,
	segment: str,
	template_name: str,
) -> str:
	today = getdate()
	existing = frappe.db.get_value(
		"Campaign Send Log",
		{
			"campaign_name": campaign_name,
			"channel": "WhatsApp",
			"sent_at": [">=", today],
		},
		"name",
		order_by="sent_at desc",
	)
	if existing:
		return existing
	log = frappe.new_doc("Campaign Send Log")
	log.campaign_name = campaign_name
	log.channel = "WhatsApp"
	log.status = "Sending"
	log.segment = segment
	log.sent_at = now_datetime()
	log.linked_whatsapp_template = template_name
	log.target_count = 0
	log.insert(ignore_permissions=True)
	frappe.db.commit()
	return log.name


# ============================================================================
# Scheduled task: renewal reminders (T-3 days)
# ============================================================================


def run_renewal_reminders():
	"""Daily: find Member Subscriptions ending in exactly 3 days and send the
	renewal-reminder WhatsApp template to each member's phone.

	Skips silently if:
	  - site_config has no whatsapp_* keys (tenant not on WhatsApp yet)
	  - the renewal_reminder template isn't Approved in WhatsApp Template
	"""
	template_name = "wp_renewal_reminder_t_minus_3"

	try:
		WhatsAppClient.for_current_site()
	except WhatsAppConfigError:
		return  # tenant not configured — silent skip

	approved = frappe.db.exists(
		"WhatsApp Template",
		{"template_name": template_name, "is_active": 1, "status": "Approved"},
	)
	if not approved:
		frappe.logger().info(
			f"campaigns.run_renewal_reminders: template {template_name!r} "
			"not approved yet — skipping"
		)
		return

	target_date = getdate(add_days(getdate(), 3))
	subs = frappe.get_all(
		"Member Subscription",
		filters={
			"end_date": target_date,
			"docstatus": 1,
			"status": "Active",
		},
		fields=["name", "customer", "end_date", "membership_plan"],
	)
	if not subs:
		return

	campaign_log = _get_or_create_campaign_log(
		campaign_name="Renewal Reminder T-3",
		segment="Active subscriptions ending in 3 days",
		template_name=template_name,
	)

	sent = 0
	for sub in subs:
		phone = frappe.db.get_value(
			"Member Profile", {"customer": sub.customer}, "phone"
		)
		if not phone:
			continue
		# Skip if we already sent this template to this customer today
		# (idempotent re-run protection — scheduler may fire twice on retries)
		already_sent = frappe.db.exists(
			"Campaign Send Item",
			{
				"parent": campaign_log,
				"customer": sub.customer,
				"template_name": template_name,
			},
		)
		if already_sent:
			continue
		try:
			send_template_to_member(
				campaign_log_name=campaign_log,
				customer=sub.customer,
				phone=phone,
				template_name=template_name,
				language="en",
				components=[
					{
						"type": "body",
						"parameters": [
							{"type": "text", "text": str(sub.end_date)},
						],
					},
				],
			)
			sent += 1
		except Exception:
			frappe.log_error(
				frappe.get_traceback(),
				"campaigns.run_renewal_reminders",
			)

	recompute_stats(campaign_log)
	frappe.logger().info(
		f"campaigns.run_renewal_reminders: sent {sent} renewal reminders "
		f"into Campaign Send Log {campaign_log}"
	)
