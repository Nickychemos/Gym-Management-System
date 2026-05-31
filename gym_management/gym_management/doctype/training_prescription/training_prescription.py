# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate


class TrainingPrescription(Document):
	def validate(self):
		self._check_dates()
		self._check_session_block_refs()
		self._check_exercise_session_refs()

	# ---------- validations ----------

	def _check_dates(self):
		if self.end_date and getdate(self.end_date) < getdate(self.start_date):
			frappe.throw(
				_("End Date ({0}) cannot be before Start Date ({1}).").format(
					self.end_date, self.start_date
				)
			)

	def _check_session_block_refs(self):
		"""Each Training Session Template's block_name must match a row in
		the blocks table."""
		block_names = {(b.block_name or "").strip() for b in (self.blocks or []) if b.block_name}
		for s in self.sessions or []:
			block = (s.block_name or "").strip()
			if not block:
				continue
			if block not in block_names:
				frappe.throw(
					_(
						"Session '{0}' references block '{1}' which is not in the "
						"Blocks table."
					).format(s.session_name, block)
				)

	def _check_exercise_session_refs(self):
		"""Each Training Exercise Set's session_name must match a Sessions row."""
		session_names = {
			(s.session_name or "").strip() for s in (self.sessions or []) if s.session_name
		}
		for e in self.exercise_sets or []:
			sess = (e.session_name or "").strip()
			if not sess:
				continue
			if sess not in session_names:
				frappe.throw(
					_(
						"Exercise '{0}' references session '{1}' which is not in the "
						"Sessions table."
					).format(e.exercise_name, sess)
				)
