# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import date_diff, getdate, today


class TrialPass(Document):
	def validate(self):
		self._check_dates_and_compute_days()
		self._check_no_active_subscription()

	# ---------- validations ----------

	def _check_dates_and_compute_days(self):
		if getdate(self.expiry_date) < getdate(self.start_date):
			frappe.throw(_("Expiry Date must be on or after Start Date"))
		self.duration_days = date_diff(self.expiry_date, self.start_date) + 1

	def _check_no_active_subscription(self):
		"""A Customer with an Active or Frozen Member Subscription doesn't need a
		Trial Pass — block to avoid confusing access decisions."""
		active = frappe.db.exists(
			"Member Subscription",
			{
				"customer": self.customer,
				"docstatus": 1,
				"status": ["in", ["Active", "Frozen"]],
			},
		)
		if active:
			frappe.throw(
				_(
					"Customer {0} already has an active Member Subscription ({1}). "
					"Trial Passes are for prospects who haven't subscribed yet."
				).format(self.customer, active)
			)


# ============================================================================
# Scheduled task (registered in hooks.py)
# ============================================================================


def auto_expire():
	"""Daily task: flip Active trial passes whose expiry_date has passed to Expired."""
	expired = frappe.get_all(
		"Trial Pass",
		filters={
			"status": "Active",
			"expiry_date": ["<", today()],
		},
		pluck="name",
	)
	for name in expired:
		try:
			frappe.db.set_value("Trial Pass", name, "status", "Expired")
			frappe.db.commit()
		except Exception:
			frappe.log_error(frappe.get_traceback(), f"trial_pass.auto_expire: {name}")


# ============================================================================
# API used by Phase 2 (Class Booking, Access Event) to grant access via trial
# ============================================================================


def has_active_trial(customer: str) -> str | None:
	"""Returns the Trial Pass name if the customer has an Active trial covering
	today, else None. Used by Phase 2 access checks as an alternative to
	Member Subscription."""
	today_str = today()
	return frappe.db.get_value(
		"Trial Pass",
		{
			"customer": customer,
			"status": "Active",
			"start_date": ["<=", today_str],
			"expiry_date": [">=", today_str],
		},
		"name",
	)
