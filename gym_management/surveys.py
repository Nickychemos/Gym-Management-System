"""Survey + NPS analytics.

Whitelisted functions for the admin dashboard:
  - compute_nps_score(survey_template, days=30): rolling NPS score
  - submit_response(...): create a Survey Response from external channel (used
    by chatbot/portal/webhook integrations)

NPS formula (Bain & Company, 2003):
    NPS = (%Promoters) - (%Detractors)
    where Promoters = score 9-10, Passives = 7-8, Detractors = 0-6

Reasonable benchmarks for a Kenyan gym:
    > 50  : excellent (top-tier hospitality)
    30-50 : great
     0-30 : okay
    < 0   : urgent intervention needed
"""

from __future__ import annotations

import json

import frappe
from frappe.utils import add_to_date, now_datetime


@frappe.whitelist()
def compute_nps_score(survey_template: str, days: int = 30) -> dict:
	"""Rolling NPS for a survey over the last N days.

	Returns:
	    {
	        "survey": "<survey name>",
	        "window_days": 30,
	        "total_responses": 42,
	        "promoters": 22,
	        "passives": 12,
	        "detractors": 8,
	        "nps_score": 33.3,   # promoters% - detractors%
	    }

	Returns nps_score=None when total_responses is 0 (avoid /0).
	"""
	days = int(days)
	since = add_to_date(now_datetime(), days=-days)

	rows = frappe.get_all(
		"Survey Response",
		filters={
			"survey_template": survey_template,
			"submitted_on": [">=", since],
			"nps_category": ["in", ["Promoter", "Passive", "Detractor"]],
		},
		fields=["nps_category"],
	)
	total = len(rows)
	if total == 0:
		return {
			"survey": survey_template,
			"window_days": days,
			"total_responses": 0,
			"promoters": 0,
			"passives": 0,
			"detractors": 0,
			"nps_score": None,
		}

	promoters = sum(1 for r in rows if r.nps_category == "Promoter")
	passives = sum(1 for r in rows if r.nps_category == "Passive")
	detractors = sum(1 for r in rows if r.nps_category == "Detractor")
	nps = round((promoters / total - detractors / total) * 100, 1)

	return {
		"survey": survey_template,
		"window_days": days,
		"total_responses": total,
		"promoters": promoters,
		"passives": passives,
		"detractors": detractors,
		"nps_score": nps,
	}


@frappe.whitelist(allow_guest=False)
def submit_response(
	survey_template: str,
	member: str,
	submitted_via: str = "Portal",
	nps_score: int | None = None,
	comment: str | None = None,
	answers: dict | str | None = None,
) -> str:
	"""Create a Survey Response from an external channel (chatbot, portal,
	WhatsApp interactive form, etc.). Returns the Survey Response name.

	`answers` accepts a dict (JSON-serializable) or a JSON string.
	"""
	if isinstance(answers, dict):
		answers_json = json.dumps(answers, indent=2)
	elif isinstance(answers, str):
		# Validate it parses
		try:
			json.loads(answers)
			answers_json = answers
		except json.JSONDecodeError:
			frappe.throw("answers must be valid JSON")
	else:
		answers_json = None

	doc = frappe.new_doc("Survey Response")
	doc.survey_template = survey_template
	doc.member = member
	doc.submitted_via = submitted_via
	doc.submitted_on = now_datetime()
	if nps_score is not None:
		doc.nps_score = int(nps_score)
	if comment:
		doc.comment = comment
	if answers_json:
		doc.answers = answers_json
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return doc.name
