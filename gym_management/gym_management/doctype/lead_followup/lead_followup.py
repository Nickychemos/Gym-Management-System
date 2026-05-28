# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class LeadFollowup(Document):
	def validate(self):
		self._require_one_subject()

	def _require_one_subject(self):
		"""A follow-up must reference at least one of Lead / Customer / Trial Pass —
		otherwise we don't know who it's about."""
		if not (self.lead or self.customer or self.trial_pass):
			frappe.throw(
				_(
					"Set at least one of Lead, Customer, or Trial Pass — a "
					"Follow-up must be about someone."
				)
			)
