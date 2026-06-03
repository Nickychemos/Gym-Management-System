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
from gym_management.rbac import MANAGER, requires
from frappe.utils import add_to_date, now_datetime


@frappe.whitelist()
@requires(MANAGER)
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


# ---------------------------------------------------------------------------
# Admin frontend surfaces: templates, NPS dashboard, responses
# ---------------------------------------------------------------------------


def _customer_names(ids):
	ids = [i for i in ids if i]
	if not ids:
		return {}
	return {
		c.name: c.customer_name
		for c in frappe.get_all(
			"Customer", filters={"name": ["in", ids]}, fields=["name", "customer_name"]
		)
	}


@frappe.whitelist()
@requires(MANAGER)
def list_templates() -> list[dict]:
	rows = frappe.get_all(
		"Survey Template",
		fields=["name", "survey_name", "survey_type", "is_active", "trigger_event", "channels"],
		order_by="modified desc",
	)
	for r in rows:
		r["is_active"] = int(r.is_active or 0)
		r["question_count"] = frappe.db.count("Survey Question", {"parent": r.name})
		r["response_count"] = frappe.db.count("Survey Response", {"survey_template": r.name})
	return rows


@frappe.whitelist()
@requires(MANAGER)
def create_template(
	survey_name: str,
	survey_type: str = "NPS",
	trigger_event: str = "Manual",
	channels: str = "WhatsApp Only",
	intro_message: str | None = None,
	thank_you_message: str | None = None,
	questions=None,
) -> dict:
	if isinstance(questions, str):
		questions = json.loads(questions)
	questions = questions or []
	# NPS surveys always carry the standard 0-10 question.
	if survey_type == "NPS" and not questions:
		questions = [
			{"question_text": "How likely are you to recommend us to a friend?", "question_type": "NPS", "is_required": 1, "order_index": 0}
		]
	doc = frappe.get_doc(
		{
			"doctype": "Survey Template",
			"survey_name": survey_name,
			"survey_type": survey_type,
			"trigger_event": trigger_event,
			"channels": channels,
			"intro_message": intro_message,
			"thank_you_message": thank_you_message,
			"is_active": 1,
		}
	)
	for i, q in enumerate(questions):
		doc.append("questions", {
			"question_text": q.get("question_text"),
			"question_type": q.get("question_type", "Text"),
			"is_required": 1 if q.get("is_required", 1) else 0,
			"order_index": q.get("order_index", i),
			"options": q.get("options"),
		})
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True, "name": doc.name}


@frappe.whitelist()
@requires(MANAGER)
def set_template_active(name: str, active) -> dict:
	frappe.db.set_value("Survey Template", name, "is_active", 1 if str(active) in ("1", "true", "True") else 0)
	frappe.db.commit()
	return {"ok": True, "name": name}


def _active_nps_template():
	row = frappe.get_all(
		"Survey Template",
		filters={"survey_type": "NPS", "is_active": 1},
		fields=["name"],
		order_by="modified desc",
		limit=1,
	)
	return row[0].name if row else None


@frappe.whitelist()
@requires(MANAGER)
def list_responses(survey_template: str | None = None, limit: int = 50) -> list[dict]:
	filters = {}
	if survey_template:
		filters["survey_template"] = survey_template
	rows = frappe.get_all(
		"Survey Response",
		filters=filters,
		fields=["name", "survey_template", "member", "submitted_on", "submitted_via", "nps_score", "nps_category", "comment"],
		order_by="submitted_on desc",
		limit=int(limit),
	)
	names = _customer_names([r.member for r in rows])
	for r in rows:
		r["member_name"] = names.get(r.member, r.member)
		r["submitted_on"] = str(r.submitted_on) if r.submitted_on else None
	return rows


@frappe.whitelist()
@requires(MANAGER)
def nps_dashboard(survey_template: str | None = None, days: int = 30) -> dict:
	template = survey_template or _active_nps_template()
	if not template:
		return {"template": None, "score": None}
	score = compute_nps_score(template, days=days)
	recent = list_responses(template, limit=10)
	return {"template": template, "score": score, "recent": recent}


@frappe.whitelist()
@requires(MANAGER)
def record_response(
	survey_template: str,
	member: str,
	nps_score: int | None = None,
	comment: str | None = None,
	submitted_via: str = "In-Person",
) -> dict:
	"""Front-desk manual entry of a survey response. `member` may be a Member
	Profile name (resolved to its Customer)."""
	if member and frappe.db.exists("Member Profile", member):
		member = frappe.db.get_value("Member Profile", member, "customer")
	doc = frappe.new_doc("Survey Response")
	doc.survey_template = survey_template
	doc.member = member
	doc.submitted_via = submitted_via
	doc.submitted_on = now_datetime()
	if nps_score is not None and nps_score != "":
		doc.nps_score = int(nps_score)
	if comment:
		doc.comment = comment
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True, "name": doc.name, "nps_category": doc.nps_category}
