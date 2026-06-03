# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from gym_management.rbac import MANAGER, requires
from frappe.model.document import Document
from frappe.utils import flt


# Rate above which we should flag the campaign for review — too many people
# bailing means we hit them with the wrong message at the wrong time.
HIGH_UNSUBSCRIBE_RATE_THRESHOLD = 2.0  # percent


class CampaignSendLog(Document):
	def validate(self):
		self._recompute_rates()
		self._recompute_cost_per_delivered()

	# ---------- computations ----------

	def _recompute_rates(self):
		"""Auto-compute delivery / open / click / unsubscribe rates from
		raw counters. All zero-safe."""
		target = max(int(self.target_count or 0), 0)
		delivered = max(int(self.delivered or 0), 0)
		opened = max(int(self.opened or 0), 0)
		clicked = max(int(self.clicked or 0), 0)
		unsubscribed = max(int(self.unsubscribed or 0), 0)

		self.delivery_rate = (delivered / target * 100) if target else 0
		self.open_rate = (opened / delivered * 100) if delivered else 0
		self.click_rate = (clicked / opened * 100) if opened else 0
		self.unsubscribe_rate = (unsubscribed / delivered * 100) if delivered else 0

	def _recompute_cost_per_delivered(self):
		delivered = max(int(self.delivered or 0), 0)
		self.cost_per_delivered = (
			flt(self.actual_cost) / delivered if delivered else 0
		)


# ============================================================================
# API: provider webhooks bump counters as deliveries / opens / clicks arrive
# ============================================================================
#
# Africa's Talking SMS, SES email events, Meta WhatsApp Business webhooks,
# and FCM push provide delivery + bounce events. Each provider integration
# (built in Phase 5 polish) calls these helpers as events come in.
# ============================================================================


def _bump(campaign_name: str, field: str, delta: int = 1):
	"""Atomically increment a counter on the campaign. Recomputes rates."""
	doc = frappe.get_doc("Campaign Send Log", campaign_name)
	current = int(getattr(doc, field, 0) or 0)
	new_value = max(0, current + delta)
	frappe.db.set_value("Campaign Send Log", campaign_name, field, new_value)
	# Recompute rates by reloading + saving (uses validate)
	doc = frappe.get_doc("Campaign Send Log", campaign_name)
	doc.save(ignore_permissions=True)


def record_delivered(campaign_name: str, delta: int = 1):
	"""Provider webhook: message delivered to device / inbox."""
	_bump(campaign_name, "delivered", delta)


def record_opened(campaign_name: str, delta: int = 1):
	"""Email tracking pixel / WhatsApp read-receipt / push opened."""
	_bump(campaign_name, "opened", delta)


def record_clicked(campaign_name: str, delta: int = 1):
	"""Tracked link clicked."""
	_bump(campaign_name, "clicked", delta)


def record_bounced(campaign_name: str, delta: int = 1):
	"""Hard or soft bounce."""
	_bump(campaign_name, "bounced", delta)


def record_unsubscribed(campaign_name: str, customer: str | None = None, delta: int = 1):
	"""Recipient unsubscribed in response. Bumps the campaign counter AND
	flips the customer's Communication Preference.globally_unsubscribed flag."""
	_bump(campaign_name, "unsubscribed", delta)
	if customer:
		try:
			from gym_management.gym_management.doctype.communication_preference.communication_preference import (
				record_stop_keyword,
			)

			record_stop_keyword(customer)
		except Exception:
			frappe.log_error(
				frappe.get_traceback(),
				f"record_unsubscribed: stop-keyword flip failed for {customer}",
			)


def record_complaint(campaign_name: str, delta: int = 1):
	"""Spam complaint (email channel only)."""
	_bump(campaign_name, "complaints", delta)


# ============================================================================
# Campaign lifecycle
# ============================================================================


@frappe.whitelist(allow_guest=False)
@requires(MANAGER)
def start_campaign(
	campaign_name: str,
	channel: str,
	segment: str,
	target_count: int,
	estimated_cost: float | None = None,
	linked_email_template: str | None = None,
) -> dict:
	"""Create a new Campaign Send Log row at the moment the broadcast starts.
	Returns the row name so the sender can pass it to each per-recipient send
	for counter aggregation."""
	doc = frappe.new_doc("Campaign Send Log")
	doc.campaign_name = campaign_name
	doc.channel = channel
	doc.segment = segment
	doc.target_count = int(target_count)
	doc.estimated_cost = flt(estimated_cost or 0)
	doc.linked_email_template = linked_email_template
	doc.triggered_by = frappe.session.user
	doc.status = "Sending"
	doc.insert(ignore_permissions=True)
	return {"ok": True, "campaign": doc.name}


@frappe.whitelist(allow_guest=False)
@requires(MANAGER)
def finalize_campaign(campaign_name: str, actual_cost: float | None = None) -> dict:
	"""Flip a Sending campaign to Sent and stamp the actual cost. Called once
	the sender has queued all messages (delivery events keep arriving for hours
	after this point and continue bumping counters)."""
	doc = frappe.get_doc("Campaign Send Log", campaign_name)
	if doc.status != "Sending":
		frappe.throw(
			f"Campaign {campaign_name} is in status {doc.status}; can only finalize from Sending"
		)
	updates = {"status": "Sent"}
	if actual_cost is not None:
		updates["actual_cost"] = flt(actual_cost)
	frappe.db.set_value("Campaign Send Log", campaign_name, updates)
	# Trigger validate() via .save() so rates recompute with the final actual_cost
	doc = frappe.get_doc("Campaign Send Log", campaign_name)
	doc.save(ignore_permissions=True)
	return {"ok": True}


# ============================================================================
# Helper: flag underperforming campaigns for review
# ============================================================================


def flag_high_unsubscribe_campaigns() -> list[dict]:
	"""Returns Sent campaigns whose unsubscribe_rate exceeds the threshold —
	useful for the dashboard 'campaigns to review' widget."""
	return frappe.get_all(
		"Campaign Send Log",
		filters={
			"status": "Sent",
			"unsubscribe_rate": [">", HIGH_UNSUBSCRIBE_RATE_THRESHOLD],
		},
		fields=["name", "campaign_name", "channel", "segment", "unsubscribe_rate", "sent_at"],
		order_by="sent_at desc",
		limit=20,
	)
