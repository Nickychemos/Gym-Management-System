# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class MemberCredential(Document):
	def validate(self):
		self._check_replacement_chain()
		self._check_credential_cap()

	# ---------- validations ----------

	def _check_replacement_chain(self):
		if self.status == "Replaced" and not self.replaced_by:
			frappe.throw(_("Status 'Replaced' requires the 'Replaced By' field to be set"))

	def _check_credential_cap(self):
		# Cap applies only to Active credentials. Lost/Disabled/Replaced don't count.
		if self.status != "Active":
			return

		max_per_member = (
			frappe.db.get_single_value("Gym Settings", "max_credentials_per_member") or 0
		)
		if not max_per_member:
			return  # cap not configured → no enforcement

		active_count = frappe.db.count(
			"Member Credential",
			{
				"customer": self.customer,
				"status": "Active",
				"name": ["!=", self.name or ""],
			},
		)
		if active_count + 1 > max_per_member:
			frappe.throw(
				_(
					"Customer {0} already has {1} active credentials. Cap is {2} per member "
					"(Gym Settings). Disable or replace an existing credential first."
				).format(self.customer, active_count, max_per_member)
			)
