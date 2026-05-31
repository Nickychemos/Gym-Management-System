# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import json

import frappe
from frappe import _
from frappe.model.document import Document


# Bain & Co's standard NPS bucketing
PROMOTER_MIN = 9  # 9-10
PASSIVE_MIN = 7   # 7-8
# 0-6 = Detractor


class SurveyResponse(Document):
	def validate(self):
		self._check_nps_for_nps_survey()
		self._categorize_nps()
		self._compute_avg_csat()

	# ---------- validations ----------

	def _check_nps_for_nps_survey(self):
		"""If the linked Survey Template is NPS, nps_score must be set and 0-10."""
		survey_type = frappe.db.get_value(
			"Survey Template", self.survey_template, "survey_type"
		)
		if survey_type != "NPS":
			return
		if self.nps_score is None or self.nps_score == "":
			frappe.throw(
				_("nps_score is required for responses to NPS-type surveys.")
			)
		score = int(self.nps_score)
		if not (0 <= score <= 10):
			frappe.throw(
				_("nps_score must be between 0 and 10 (got {0}).").format(score)
			)

	def _categorize_nps(self):
		"""Auto-fill nps_category from nps_score whenever score is set."""
		if self.nps_score is None or self.nps_score == "":
			self.nps_category = ""
			return
		score = int(self.nps_score)
		if score >= PROMOTER_MIN:
			self.nps_category = "Promoter"
		elif score >= PASSIVE_MIN:
			self.nps_category = "Passive"
		else:
			self.nps_category = "Detractor"

	def _compute_avg_csat(self):
		"""Average any 1-5 rating answers in `answers` JSON into avg_csat."""
		if not self.answers:
			return
		try:
			data = json.loads(self.answers)
		except json.JSONDecodeError:
			return
		if not isinstance(data, dict):
			return
		ratings: list[float] = []
		for value in data.values():
			if isinstance(value, (int, float)) and 1 <= value <= 5:
				ratings.append(float(value))
		if ratings:
			self.avg_csat = round(sum(ratings) / len(ratings), 2)
