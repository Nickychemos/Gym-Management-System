# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime

from gym_management.rbac import FRONTDESK, requires


# Topics that fire regardless of opt-in state (statutory / legal / financial)
ALWAYS_ON_TOPICS = ("legal", "kra", "data_protection", "payment_receipt")

# Transactional topics — still fire when transactional_only=1
TRANSACTIONAL_TOPICS = (
	"payment_receipt",
	"renewal_due",
	"sub_expiry",
	"freeze_confirmation",
	"refund_confirmation",
	"cancellation_confirmation",
) + ALWAYS_ON_TOPICS

# Marketing topics — blocked when transactional_only=1
MARKETING_TOPICS = (
	"marketing_promotions",
	"class_reminders",
	"birthday_messages",
	"newsletter",
	"new_class_announcement",
	"lead_nurture",
)


class CommunicationPreference(Document):
	pass


# ============================================================================
# API used by Phase 5 senders before dispatching any message
# ============================================================================


def can_send(customer: str, channel: str, topic: str = "marketing_promotions") -> tuple[bool, str | None]:
	"""Returns (allowed, reason_if_blocked) for a planned send.

	channel: 'sms' | 'email' | 'whatsapp' | 'push'
	topic: short topic key — see TRANSACTIONAL_TOPICS / MARKETING_TOPICS constants

	Decision tree:
	  1. If topic is ALWAYS_ON → True
	  2. If pref.globally_unsubscribed → False
	  3. If pref.transactional_only AND topic is marketing → False
	  4. If specific topic toggle is OFF → False
	  5. If channel opt-in is OFF → False
	  6. Else → True
	"""
	channel = channel.lower()
	topic = topic.lower()

	if topic in ALWAYS_ON_TOPICS:
		return (True, None)

	pref = frappe.db.get_value(
		"Communication Preference",
		customer,
		[
			"sms_opt_in",
			"email_opt_in",
			"whatsapp_opt_in",
			"push_opt_in",
			"transactional_only",
			"marketing_promotions",
			"class_reminders",
			"renewal_reminders",
			"birthday_messages",
			"newsletter",
			"globally_unsubscribed",
		],
		as_dict=True,
	)
	# No preference row yet → use safe defaults (assume opted in, marketing OK)
	if not pref:
		return (True, None)

	if pref.globally_unsubscribed:
		return (False, "globally_unsubscribed")

	if pref.transactional_only and topic in MARKETING_TOPICS:
		return (False, "transactional_only")

	# Topic-specific toggle
	topic_field_map = {
		"marketing_promotions": "marketing_promotions",
		"class_reminders": "class_reminders",
		"renewal_due": "renewal_reminders",
		"sub_expiry": "renewal_reminders",
		"birthday_messages": "birthday_messages",
		"newsletter": "newsletter",
	}
	field = topic_field_map.get(topic)
	if field and not pref.get(field):
		return (False, f"topic_{topic}_disabled")

	# Channel opt-in
	channel_field_map = {
		"sms": "sms_opt_in",
		"email": "email_opt_in",
		"whatsapp": "whatsapp_opt_in",
		"push": "push_opt_in",
	}
	channel_field = channel_field_map.get(channel)
	if channel_field and not pref.get(channel_field):
		return (False, f"channel_{channel}_disabled")

	return (True, None)


def record_stop_keyword(customer: str) -> dict:
	"""Inbound STOP/UNSUBSCRIBE keyword received — flip globally_unsubscribed=1
	and stamp the timestamp. Creates a default preference row if none exists."""
	exists = frappe.db.exists("Communication Preference", customer)
	if not exists:
		doc = frappe.new_doc("Communication Preference")
		doc.customer = customer
		doc.insert(ignore_permissions=True)
	frappe.db.set_value(
		"Communication Preference",
		customer,
		{
			"globally_unsubscribed": 1,
			"last_stop_keyword_received": now_datetime(),
		},
	)
	return {"ok": True, "customer": customer}


def get_or_create(customer: str) -> str:
	"""Returns the preference doc name for the customer, creating a default
	row if none exists. Use this when a new Member Profile is created."""
	existing = frappe.db.exists("Communication Preference", customer)
	if existing:
		return existing
	doc = frappe.new_doc("Communication Preference")
	doc.customer = customer
	doc.insert(ignore_permissions=True)
	return doc.name


@frappe.whitelist(allow_guest=False)
@requires(FRONTDESK)
def update_preferences(
	customer: str,
	sms_opt_in: int | None = None,
	email_opt_in: int | None = None,
	whatsapp_opt_in: int | None = None,
	push_opt_in: int | None = None,
	transactional_only: int | None = None,
	marketing_promotions: int | None = None,
	class_reminders: int | None = None,
	renewal_reminders: int | None = None,
	birthday_messages: int | None = None,
	newsletter: int | None = None,
	preferred_language: str | None = None,
	preferred_contact_time: str | None = None,
) -> dict:
	"""Front-desk endpoint to update a member's comms preferences (auto-creates
	the row if missing).

	Guarded: it takes an arbitrary `customer`, so leaving it unguarded let any
	authenticated user edit any member's preferences (IDOR). Members have no
	login accounts today, so front-desk staff are the only callers. If a member
	self-service portal is added later, expose a SEPARATE token-authenticated
	guest endpoint that derives `customer` from a signed token — not a parameter."""
	name = get_or_create(customer)
	doc = frappe.get_doc("Communication Preference", name)
	for field, value in {
		"sms_opt_in": sms_opt_in,
		"email_opt_in": email_opt_in,
		"whatsapp_opt_in": whatsapp_opt_in,
		"push_opt_in": push_opt_in,
		"transactional_only": transactional_only,
		"marketing_promotions": marketing_promotions,
		"class_reminders": class_reminders,
		"renewal_reminders": renewal_reminders,
		"birthday_messages": birthday_messages,
		"newsletter": newsletter,
		"preferred_language": preferred_language,
		"preferred_contact_time": preferred_contact_time,
	}.items():
		if value is not None:
			setattr(doc, field, value)
	doc.save(ignore_permissions=True)
	return {"ok": True}
