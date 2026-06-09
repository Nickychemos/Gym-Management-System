# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, getdate, today


class MemberSubscription(Document):
	def validate(self):
		self._check_dates()
		self._check_no_overlap()
		self._check_sessions()
		self._compute_sessions_remaining()

	def before_submit(self):
		if self.status not in ("Draft", "Active"):
			frappe.throw(_("Cannot submit a {0} subscription").format(self.status))

	def on_submit(self):
		self.db_set("status", "Active")

	def on_cancel(self):
		self.db_set("status", "Cancelled")
		if not self.cancelled_on:
			self.db_set("cancelled_on", today())
		self._disable_credentials_if_no_other_active_sub()

	# ---------- validations ----------

	def _check_dates(self):
		# A same-day pass (e.g. a 1-day Day Pass) is valid, so end may equal
		# start; only an end strictly before start is wrong.
		if getdate(self.end_date) < getdate(self.start_date):
			frappe.throw(_("End Date cannot be before Start Date"))

	def _check_no_overlap(self):
		overlap = frappe.db.exists(
			"Member Subscription",
			{
				"customer": self.customer,
				"docstatus": 1,
				"status": ["in", ["Active", "Frozen"]],
				"name": ["!=", self.name or ""],
				"start_date": ["<=", self.end_date],
				"end_date": [">=", self.start_date],
			},
		)
		if overlap:
			frappe.throw(
				_(
					"Customer {0} already has an active subscription ({1}) "
					"overlapping this period."
				).format(self.customer, overlap)
			)

	def _check_sessions(self):
		if self.plan_type in ("Class Pack", "PT Package"):
			if not self.sessions_total or self.sessions_total <= 0:
				frappe.throw(
					_(
						"Plan type {0} requires sessions_total > 0. "
						"Set Session Count on the Membership Plan."
					).format(self.plan_type)
				)

	def _compute_sessions_remaining(self):
		self.sessions_remaining = (self.sessions_total or 0) - (self.sessions_used or 0)

	# ---------- side effects ----------

	def _disable_credentials_if_no_other_active_sub(self):
		"""On cancel, disable this customer's Active credentials only if they
		have NO other Active/Frozen subscription. Receptionist can re-enable
		manually if needed (e.g. on amend)."""
		other_active = frappe.db.exists(
			"Member Subscription",
			{
				"customer": self.customer,
				"docstatus": 1,
				"status": ["in", ["Active", "Frozen"]],
				"name": ["!=", self.name],
			},
		)
		if other_active:
			return

		creds = frappe.get_all(
			"Member Credential",
			filters={"customer": self.customer, "status": "Active"},
			pluck="name",
		)
		for cred in creds:
			frappe.db.set_value("Member Credential", cred, "status", "Disabled")


# ============================================================================
# Scheduled tasks (registered in hooks.py)
# ============================================================================


def auto_lapse_expired():
	"""Daily task: flip submitted Active subscriptions to Lapsed once
	end_date + Gym Settings.default_grace_period_days has passed."""
	grace = frappe.db.get_single_value("Gym Settings", "default_grace_period_days") or 0
	cutoff = add_days(today(), -int(grace))

	expired = frappe.get_all(
		"Member Subscription",
		filters={
			"docstatus": 1,
			"status": "Active",
			"end_date": ["<", cutoff],
		},
		pluck="name",
	)
	for name in expired:
		try:
			frappe.db.set_value("Member Subscription", name, "status", "Lapsed")
			frappe.db.commit()
		except Exception:
			frappe.log_error(frappe.get_traceback(), f"auto_lapse_expired: {name}")
