# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class SurveyTemplate(Document):
	def validate(self):
		self._check_nps_has_nps_question()

	def _check_nps_has_nps_question(self):
		"""If survey_type is NPS, at least one question must be the NPS type —
		otherwise nps_score on Survey Response can never be populated."""
		if self.survey_type != "NPS":
			return
		has_nps = any(q.question_type == "NPS" for q in (self.questions or []))
		if not has_nps:
			frappe.throw(
				_(
					"An NPS survey must have at least one question of type 'NPS' "
					"(the 0-10 'How likely are you to recommend' question)."
				)
			)
