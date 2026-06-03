# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from gym_management.rbac import MANAGER, requires
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, getdate, today


# How long a referral stays open before auto-expiring (no signup conversion)
REFERRAL_EXPIRY_DAYS = 90

# Terminal statuses
TERMINAL_STATUSES = ("Reward Paid", "Expired")


class Referral(Document):
	def validate(self):
		self._check_not_self_referral()
		self._check_has_referred_target()

	def before_submit(self):
		if self.status == "Pending":
			frappe.throw(
				_(
					"Cannot submit a Pending referral. Mark it Signed Up / First "
					"Payment / Reward Earned first via the workflow API."
				)
			)

	def on_cancel(self):
		# Submitted referrals can be cancelled (e.g. fraud detected) — flips
		# to a synthetic Expired-like state. Reward Paid ones shouldn't be
		# cancelled cleanly but we don't block — leave that to ops policy.
		self.db_set("status", "Expired")

	# ---------- validations ----------

	def _check_not_self_referral(self):
		"""You can't refer yourself."""
		if self.referrer_customer and self.referred_customer:
			if self.referrer_customer == self.referred_customer:
				frappe.throw(_("Referrer and Referred Customer cannot be the same"))

	def _check_has_referred_target(self):
		"""Must have at least a Lead or a Customer being referred."""
		if not (self.referred_customer or self.referred_lead):
			frappe.throw(
				_(
					"Referral must reference at least a Referred Lead or a Referred "
					"Customer."
				)
			)


# ============================================================================
# Lifecycle APIs — called by hooks on Member Profile / Member Subscription
# ============================================================================


@frappe.whitelist(allow_guest=False)
@requires(MANAGER)
def mark_signed_up(referral: str, customer: str | None = None) -> dict:
	"""Pending → Signed Up. Called when the referred Lead converts to a Customer.
	Optionally captures the new Customer name."""
	doc = frappe.get_doc("Referral", referral)
	if doc.status != "Pending":
		frappe.throw(
			_("Can only mark a Pending referral as Signed Up (current: {0})").format(doc.status)
		)
	doc.db_set("status", "Signed Up")
	doc.db_set("referred_signed_up_on", today())
	if customer:
		doc.db_set("referred_customer", customer)
	return {"ok": True, "new_status": "Signed Up"}


@frappe.whitelist(allow_guest=False)
@requires(MANAGER)
def mark_first_payment(referral: str, linked_subscription: str | None = None) -> dict:
	"""Signed Up → First Payment. Called when the referred member's first paid
	subscription is submitted. Most gyms reward only after first payment to
	discourage churn-and-cash-out gaming."""
	doc = frappe.get_doc("Referral", referral)
	if doc.status not in ("Signed Up", "Pending"):
		frappe.throw(
			_(
				"Can only mark First Payment from Pending/Signed Up (current: {0})"
			).format(doc.status)
		)
	doc.db_set("status", "First Payment")
	doc.db_set("first_payment_date", today())
	if linked_subscription:
		doc.db_set("linked_subscription", linked_subscription)
	# Auto-flip to Reward Earned — qualifying event achieved
	doc.db_set("status", "Reward Earned")
	return {"ok": True, "new_status": "Reward Earned"}


@frappe.whitelist(allow_guest=False)
@requires(MANAGER)
def mark_reward_paid(
	referral: str,
	reward_type: str,
	reward_value: float,
	linked_payment_entry: str | None = None,
) -> dict:
	"""Reward Earned → Reward Paid. Receptionist / accounts uses this once the
	referrer has actually received their free days / cash credit / merch."""
	doc = frappe.get_doc("Referral", referral)
	if doc.status != "Reward Earned":
		frappe.throw(
			_(
				"Can only mark Reward Paid from Reward Earned (current: {0})"
			).format(doc.status)
		)
	doc.db_set("reward_type", reward_type)
	doc.db_set("reward_value", reward_value)
	doc.db_set("reward_paid_on", today())
	if linked_payment_entry:
		doc.db_set("linked_payment_entry", linked_payment_entry)
	doc.db_set("status", "Reward Paid")
	return {"ok": True, "new_status": "Reward Paid"}


# ============================================================================
# Daily scheduled task (wired in hooks.py): expire stale referrals
# ============================================================================


def auto_expire_stale():
	"""Flip Pending referrals older than REFERRAL_EXPIRY_DAYS to Expired.
	Stops the dashboard from filling with stale entries that will never convert."""
	cutoff = add_days(today(), -REFERRAL_EXPIRY_DAYS)
	stale = frappe.get_all(
		"Referral",
		filters={
			"status": "Pending",
			"referred_on": ["<", cutoff],
		},
		pluck="name",
	)
	for name in stale:
		try:
			frappe.db.set_value("Referral", name, "status", "Expired")
			frappe.db.commit()
		except Exception:
			frappe.log_error(frappe.get_traceback(), f"referral.auto_expire_stale: {name}")


# ============================================================================
# Helpers for hooks that auto-create referrals
# ============================================================================


def create_from_lead(
	referrer_customer: str,
	referred_lead: str,
	channel: str | None = None,
	referral_code: str | None = None,
) -> str:
	"""Called when a Lead comes in with a referrer attached (e.g. promo code
	URL parameter resolved to a Customer). Creates a Pending referral."""
	doc = frappe.new_doc("Referral")
	doc.referrer_customer = referrer_customer
	doc.referred_lead = referred_lead
	doc.channel = channel
	doc.referral_code_used = referral_code
	doc.status = "Pending"
	doc.insert(ignore_permissions=True)
	return doc.name


def get_active_referral_for(customer: str | None = None, lead: str | None = None) -> str | None:
	"""Find an open (Pending/Signed Up/First Payment) referral pointing at this
	customer or lead. Used by Member Subscription on_submit to fire
	mark_first_payment automatically."""
	filters = {"status": ["in", ["Pending", "Signed Up", "First Payment"]]}
	if customer:
		filters["referred_customer"] = customer
	elif lead:
		filters["referred_lead"] = lead
	else:
		return None
	return frappe.db.get_value("Referral", filters, "name")
