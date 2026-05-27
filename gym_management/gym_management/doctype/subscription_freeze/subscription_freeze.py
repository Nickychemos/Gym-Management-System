# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import date_diff, getdate, today


class SubscriptionFreeze(Document):
	def validate(self):
		self._check_dates_and_compute_days()
		self._check_subscription_state()
		self._check_within_subscription_window()
		self._check_no_overlap()
		self._check_year_cap()

	def on_submit(self):
		frappe.db.set_value(
			"Member Subscription", self.member_subscription, "status", "Frozen"
		)

	def on_cancel(self):
		self.db_set("status", "Cancelled")
		parent_status = frappe.db.get_value(
			"Member Subscription", self.member_subscription, "status"
		)
		if parent_status == "Frozen":
			frappe.db.set_value(
				"Member Subscription", self.member_subscription, "status", "Active"
			)

	# ---------- validations ----------

	def _check_dates_and_compute_days(self):
		if getdate(self.freeze_end_date) < getdate(self.freeze_start_date):
			frappe.throw(_("Freeze End Date must be on or after Freeze Start Date"))
		self.freeze_days = date_diff(self.freeze_end_date, self.freeze_start_date) + 1

	def _check_subscription_state(self):
		sub = frappe.db.get_value(
			"Member Subscription",
			self.member_subscription,
			["docstatus", "status"],
			as_dict=True,
		)
		if not sub:
			frappe.throw(_("Member Subscription {0} not found").format(self.member_subscription))
		if sub.docstatus != 1:
			frappe.throw(_("Cannot freeze a Member Subscription that has not been submitted"))
		if sub.status not in ("Active", "Frozen"):
			frappe.throw(_("Cannot freeze a {0} subscription").format(sub.status))

	def _check_within_subscription_window(self):
		sub = frappe.db.get_value(
			"Member Subscription",
			self.member_subscription,
			["start_date", "end_date"],
			as_dict=True,
		)
		if not sub:
			return
		if getdate(self.freeze_start_date) < getdate(sub.start_date):
			frappe.throw(_("Freeze cannot start before the subscription Start Date"))
		if getdate(self.freeze_end_date) > getdate(sub.end_date):
			frappe.throw(_("Freeze cannot end after the subscription End Date"))

	def _check_no_overlap(self):
		overlap = frappe.db.exists(
			"Subscription Freeze",
			{
				"member_subscription": self.member_subscription,
				"docstatus": 1,
				"status": "Active",
				"name": ["!=", self.name or ""],
				"freeze_start_date": ["<=", self.freeze_end_date],
				"freeze_end_date": [">=", self.freeze_start_date],
			},
		)
		if overlap:
			frappe.throw(_("Freeze window overlaps with existing freeze {0}").format(overlap))

	def _check_year_cap(self):
		max_per_year = (
			frappe.db.get_single_value("Gym Settings", "default_max_freeze_days_per_year") or 0
		)
		if not max_per_year:
			return

		year = getdate(self.freeze_start_date).year
		year_start = f"{year}-01-01"
		year_end = f"{year}-12-31"

		used = frappe.db.sql(
			"""
			SELECT COALESCE(SUM(freeze_days), 0)
			FROM `tabSubscription Freeze`
			WHERE member_subscription = %s
			AND docstatus = 1
			AND status IN ('Active', 'Completed')
			AND name != %s
			AND freeze_start_date BETWEEN %s AND %s
			""",
			(self.member_subscription, self.name or "", year_start, year_end),
		)[0][0] or 0

		if used + self.freeze_days > max_per_year:
			frappe.throw(
				_(
					"Freeze exceeds yearly cap. Already used {0} days in {1}, "
					"requested {2} more, cap is {3} days/year (Gym Settings)."
				).format(used, year, self.freeze_days, max_per_year)
			)


# ============================================================================
# Scheduled tasks (registered in hooks.py)
# ============================================================================


def auto_resume_expired():
	"""Daily task: flip Active freezes whose freeze_end_date has passed to
	Completed, and flip the parent Member Subscription back to Active if it
	is currently Frozen."""
	expired = frappe.get_all(
		"Subscription Freeze",
		filters={
			"docstatus": 1,
			"status": "Active",
			"freeze_end_date": ["<", today()],
		},
		fields=["name", "member_subscription"],
	)
	for freeze in expired:
		try:
			frappe.db.set_value("Subscription Freeze", freeze.name, "status", "Completed")
			parent_status = frappe.db.get_value(
				"Member Subscription", freeze.member_subscription, "status"
			)
			if parent_status == "Frozen":
				frappe.db.set_value(
					"Member Subscription", freeze.member_subscription, "status", "Active"
				)
			frappe.db.commit()
		except Exception:
			frappe.log_error(frappe.get_traceback(), f"auto_resume_expired: {freeze.name}")
