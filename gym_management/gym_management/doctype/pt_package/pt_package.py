# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, today


class PTPackage(Document):
	def validate(self):
		self._check_dates()
		self._check_sessions_positive()
		self._check_plan_compatibility()
		self._compute_sessions_remaining()

	def before_submit(self):
		if self.status not in ("Draft", "Active"):
			frappe.throw(_("Cannot submit a {0} PT Package").format(self.status))

	def on_submit(self):
		self.db_set("status", "Active")

	def on_cancel(self):
		self.db_set("status", "Cancelled")
		if not self.cancelled_on:
			self.db_set("cancelled_on", today())

	# ---------- validations ----------

	def _check_dates(self):
		if getdate(self.expiry_date) <= getdate(self.start_date):
			frappe.throw(_("Expiry Date must be after Start Date"))

	def _check_sessions_positive(self):
		if not self.sessions_purchased or self.sessions_purchased <= 0:
			frappe.throw(_("Sessions Purchased must be greater than zero"))

	def _check_plan_compatibility(self):
		if not self.membership_plan:
			return
		plan_type = frappe.db.get_value(
			"Membership Plan", self.membership_plan, "plan_type"
		)
		if plan_type != "PT Package":
			frappe.throw(
				_(
					"Membership Plan {0} is a {1} plan. PT Packages must link "
					"to a Membership Plan with plan_type = 'PT Package'."
				).format(self.membership_plan, plan_type)
			)

	def _compute_sessions_remaining(self):
		self.sessions_remaining = (self.sessions_purchased or 0) - (
			self.sessions_used or 0
		)


# ============================================================================
# Helpers used by PT Session (next DocType)
# ============================================================================


def has_sessions_remaining(pt_package: str) -> bool:
	"""True if the package is Active and has at least one unused session."""
	row = frappe.db.get_value(
		"PT Package",
		pt_package,
		["status", "sessions_purchased", "sessions_used", "expiry_date"],
		as_dict=True,
	)
	if not row:
		return False
	if row.status != "Active":
		return False
	if row.expiry_date and getdate(row.expiry_date) < getdate(today()):
		return False
	return (row.sessions_used or 0) < (row.sessions_purchased or 0)


def bump_sessions_used(pt_package: str, delta: int = 1):
	"""Atomically adjust sessions_used and sessions_remaining on a submitted
	PT Package. Used by PT Session on_submit / on_cancel.

	When sessions_used hits sessions_purchased, also flips status to Completed."""
	row = frappe.db.get_value(
		"PT Package",
		pt_package,
		["sessions_purchased", "sessions_used", "status"],
		as_dict=True,
	)
	if not row:
		return
	new_used = max(0, (row.sessions_used or 0) + delta)
	remaining = max(0, (row.sessions_purchased or 0) - new_used)
	updates = {"sessions_used": new_used, "sessions_remaining": remaining}

	# Status transitions
	if remaining == 0 and row.status == "Active":
		updates["status"] = "Completed"
	elif remaining > 0 and row.status == "Completed":
		# Reverting a session (PT Session cancelled) — package reopens
		updates["status"] = "Active"

	frappe.db.set_value("PT Package", pt_package, updates)


def get_active_packages(customer: str, trainer: str | None = None) -> list[dict]:
	"""Returns Active packages for the customer (optionally filtered by trainer)."""
	filters = {
		"customer": customer,
		"docstatus": 1,
		"status": "Active",
	}
	if trainer:
		filters["trainer"] = trainer
	return frappe.get_all(
		"PT Package",
		filters=filters,
		fields=[
			"name",
			"trainer",
			"sessions_purchased",
			"sessions_used",
			"sessions_remaining",
			"expiry_date",
		],
		order_by="expiry_date asc",
	)


# ============================================================================
# Scheduled task (registered in hooks.py)
# ============================================================================


def auto_expire():
	"""Daily: flip Active PT Packages past their expiry_date to Expired."""
	expired = frappe.get_all(
		"PT Package",
		filters={
			"docstatus": 1,
			"status": "Active",
			"expiry_date": ["<", today()],
		},
		pluck="name",
	)
	for name in expired:
		try:
			frappe.db.set_value("PT Package", name, "status", "Expired")
			frappe.db.commit()
		except Exception:
			frappe.log_error(frappe.get_traceback(), f"pt_package.auto_expire: {name}")
