# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import date_diff, getdate, today


# Days remaining at which we flip status to "Expiring Soon"
EXPIRING_SOON_THRESHOLD = 30


class CertificationRegister(Document):
	def validate(self):
		self._check_dates()
		self._compute_days_to_expiry()
		self._compute_status()
		self._validate_reminder_days_format()

	# ---------- validations ----------

	def _check_dates(self):
		if getdate(self.expires_on) <= getdate(self.issued_on):
			frappe.throw(_("Expires On must be after Issued On"))

	def _compute_days_to_expiry(self):
		self.days_to_expiry = date_diff(self.expires_on, today())

	def _compute_status(self):
		# If a human marked it Revoked, leave it alone
		if self.status == "Revoked":
			return
		if self.days_to_expiry < 0:
			self.status = "Expired"
		elif self.days_to_expiry <= EXPIRING_SOON_THRESHOLD:
			self.status = "Expiring Soon"
		else:
			self.status = "Active"

	def _validate_reminder_days_format(self):
		"""Comma-separated list of integers, e.g. '60,30,7'."""
		if not (self.reminder_days_before or "").strip():
			return
		parts = [p.strip() for p in self.reminder_days_before.split(",")]
		for p in parts:
			if not p:
				continue
			try:
				val = int(p)
				if val < 0:
					raise ValueError
			except ValueError:
				frappe.throw(
					_("Reminder Days Before must be a comma list of non-negative integers, got: {0}").format(
						self.reminder_days_before
					)
				)


# ============================================================================
# Scheduled task (registered in hooks.py)
# ============================================================================


def refresh_statuses():
	"""Daily: recompute days_to_expiry and status on all non-Revoked rows.
	The validate() does this on save, but unsaved rows would otherwise stay
	frozen at the values captured on last edit."""
	rows = frappe.get_all(
		"Certification Register",
		filters={"status": ["!=", "Revoked"]},
		fields=["name", "expires_on", "status"],
	)
	today_date = today()
	for row in rows:
		try:
			days = date_diff(row.expires_on, today_date)
			if days < 0:
				new_status = "Expired"
			elif days <= EXPIRING_SOON_THRESHOLD:
				new_status = "Expiring Soon"
			else:
				new_status = "Active"
			updates = {"days_to_expiry": days}
			if new_status != row.status:
				updates["status"] = new_status
			frappe.db.set_value("Certification Register", row.name, updates)
		except Exception:
			frappe.log_error(
				frappe.get_traceback(),
				f"certification_register.refresh_statuses: {row.name}",
			)
	frappe.db.commit()


# ============================================================================
# Helper used by trainer assignment / hiring flows
# ============================================================================


def has_active_first_aid(employee: str) -> bool:
	"""True if the employee has an Active or Expiring Soon First Aid / CPR cert."""
	return bool(
		frappe.db.exists(
			"Certification Register",
			{
				"employee": employee,
				"status": ["in", ["Active", "Expiring Soon"]],
				"certification_name": ["like", "%First Aid%CPR%"],
			},
		)
	)
