# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime


class MemberRequest(Document):
	def validate(self):
		self._check_customer_or_guest()
		self._stamp_resolution_fields()

	def _check_customer_or_guest(self):
		"""Either a Customer link OR a guest_name + contact_phone pair must be set.

		Without this, the chatbot can't create handover requests for unknown
		phone numbers (which is the common case for trial/prospect inquiries).
		"""
		if self.customer:
			return
		if not (self.guest_name and self.contact_phone):
			frappe.throw(
				_(
					"Set a Customer, OR fill both Guest Name and Contact Phone for "
					"a guest/prospect request."
				)
			)

	def _stamp_resolution_fields(self):
		"""When status flips to Resolved/Rejected, auto-stamp resolved_on/by
		if the user didn't fill them."""
		if self.status not in ("Resolved", "Rejected"):
			return
		if not self.resolved_on:
			self.resolved_on = now_datetime()
		if not self.resolved_by:
			self.resolved_by = frappe.session.user
