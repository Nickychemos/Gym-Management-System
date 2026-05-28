# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate


class ComplianceRenewal(Document):
	def validate(self):
		self._check_dates()
		self._snapshot_old_expiry_if_blank()

	def before_submit(self):
		# At submit time, freeze the old_expiry as the current parent value
		# (the form may have been opened weeks before submit).
		current = frappe.db.get_value(
			"Compliance Item", self.compliance_item, "expires_on"
		)
		if current and current != self.old_expiry_date:
			self.old_expiry_date = current

	def on_submit(self):
		"""Push the new dates / document / reference into the parent
		Compliance Item via the helper."""
		from gym_management.gym_management.doctype.compliance_item.compliance_item import (
			apply_renewal,
		)

		apply_renewal(
			compliance_item=self.compliance_item,
			new_expiry_date=self.new_expiry_date,
			new_reference_number=self.new_reference_number,
			new_document=self.new_document,
		)

	def on_cancel(self):
		"""If a renewal is cancelled, roll the parent Compliance Item's
		expires_on back to old_expiry_date so the status recomputes correctly.
		The new_document/reference are NOT rolled back — keep them as a record."""
		try:
			from gym_management.gym_management.doctype.compliance_item.compliance_item import (
				apply_renewal,
			)

			apply_renewal(
				compliance_item=self.compliance_item,
				new_expiry_date=self.old_expiry_date,
			)
		except Exception:
			frappe.log_error(
				frappe.get_traceback(),
				f"compliance_renewal.on_cancel rollback failed: {self.name}",
			)

	# ---------- validations ----------

	def _check_dates(self):
		if getdate(self.new_expiry_date) <= getdate(self.old_expiry_date):
			frappe.throw(_("New Expiry Date must be after Old Expiry Date"))
		if getdate(self.renewed_on) > getdate(self.new_expiry_date):
			frappe.throw(_("Renewed On cannot be after the New Expiry Date"))

	def _snapshot_old_expiry_if_blank(self):
		"""Auto-fill old_expiry_date from the parent if user left it blank."""
		if self.old_expiry_date or not self.compliance_item:
			return
		current = frappe.db.get_value(
			"Compliance Item", self.compliance_item, "expires_on"
		)
		if current:
			self.old_expiry_date = current
