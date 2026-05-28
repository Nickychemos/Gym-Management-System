# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_months, date_diff, getdate, today


# Days remaining at which we flip status to "Expiring Soon".
EXPIRING_SOON_THRESHOLD = 30


class ComplianceItem(Document):
	def validate(self):
		self._check_dates()
		self._compute_days_to_expiry()
		self._compute_status()
		self._compute_next_renewal_due_if_blank()
		self._validate_reminder_days_format()

	# ---------- validations ----------

	def _check_dates(self):
		if self.issued_on and getdate(self.expires_on) <= getdate(self.issued_on):
			frappe.throw(_("Expires On must be after Issued On"))

	def _compute_days_to_expiry(self):
		self.days_to_expiry = date_diff(self.expires_on, today())

	def _compute_status(self):
		# Manual overrides — leave them alone
		if self.status in ("Renewed", "Cancelled"):
			return
		if self.days_to_expiry < 0:
			self.status = "Expired"
		elif self.days_to_expiry <= EXPIRING_SOON_THRESHOLD:
			self.status = "Expiring Soon"
		else:
			self.status = "Active"

	def _compute_next_renewal_due_if_blank(self):
		"""If next_renewal_due isn't set, default to 30 days before expires_on
		(so the owner has time to renew)."""
		if self.next_renewal_due:
			return
		if not self.expires_on:
			return
		from frappe.utils import add_days

		self.next_renewal_due = add_days(self.expires_on, -30)

	def _validate_reminder_days_format(self):
		if not (self.reminder_days_before or "").strip():
			return
		for p in [p.strip() for p in self.reminder_days_before.split(",")]:
			if not p:
				continue
			try:
				val = int(p)
				if val < 0:
					raise ValueError
			except ValueError:
				frappe.throw(
					_(
						"Reminder Days Before must be a comma list of non-negative integers, got: {0}"
					).format(self.reminder_days_before)
				)


# ============================================================================
# Scheduled task (registered in hooks.py)
# ============================================================================


def refresh_statuses():
	"""Daily: recompute days_to_expiry and status on all rows that aren't
	in a manual override state."""
	rows = frappe.get_all(
		"Compliance Item",
		filters={"status": ["not in", ("Renewed", "Cancelled")]},
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
			frappe.db.set_value("Compliance Item", row.name, updates)
		except Exception:
			frappe.log_error(
				frappe.get_traceback(),
				f"compliance_item.refresh_statuses: {row.name}",
			)
	frappe.db.commit()


# ============================================================================
# API used by Compliance Renewal (next DocType) to bump dates on renewal
# ============================================================================


def apply_renewal(
	compliance_item: str,
	new_expiry_date: str,
	new_reference_number: str | None = None,
	new_document: str | None = None,
):
	"""Called when a Compliance Renewal is submitted — bumps the parent's
	expires_on, issued_on (to today), reference_number, document, and resets
	status."""
	doc = frappe.get_doc("Compliance Item", compliance_item)
	doc.issued_on = today()
	doc.expires_on = new_expiry_date
	if new_reference_number:
		doc.reference_number = new_reference_number
	if new_document:
		doc.current_document = new_document
	# Force status recomputation
	doc.status = None
	doc.save(ignore_permissions=True)
