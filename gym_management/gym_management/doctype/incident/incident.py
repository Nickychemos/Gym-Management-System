# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime, today


class Incident(Document):
	def validate(self):
		self._stamp_resolution_fields()
		self._require_camera_attachment_if_flagged()

	def _stamp_resolution_fields(self):
		"""When status flips to a resolved state, auto-stamp resolved_on/by if blank."""
		if self.status not in ("Resolved", "Dismissed", "Escalated"):
			return
		if not self.resolved_on:
			self.resolved_on = today()
		if not self.resolved_by:
			self.resolved_by = frappe.session.user

	def _require_camera_attachment_if_flagged(self):
		if self.camera_footage_attached and not self.attachment:
			frappe.throw(
				_(
					"Camera Footage Attached is checked but no Attachment file is set. "
					"Either uncheck the box or upload the footage."
				)
			)
