# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime


class MemberRequest(Document):
	def validate(self):
		self._stamp_resolution_fields()

	def _stamp_resolution_fields(self):
		"""When status flips to Resolved/Rejected, auto-stamp resolved_on/by
		if the user didn't fill them."""
		if self.status not in ("Resolved", "Rejected"):
			return
		if not self.resolved_on:
			self.resolved_on = now_datetime()
		if not self.resolved_by:
			self.resolved_by = frappe.session.user
