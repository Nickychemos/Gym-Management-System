"""Coaching surfaces for the admin frontend: diet plans, training plans, and
coaching notes.

Diet Plan and Training Prescription are parents with child tables (meals +
food items; exercise sets). The builders POST the whole structure, so the save
endpoints accept the full plan and rewrite the child rows. Plans are kept at
docstatus 0 (the `status` field carries the Draft/Active/Completed lifecycle)
so trainers can keep editing them.

Public API:
  Diet:     list_diet_plans, get_diet_plan, save_diet_plan
  Training: list_training_plans, get_training_plan, save_training_plan
  Notes:    list_coaching_notes, create_coaching_note
  Options:  coaching_trainers
"""

from __future__ import annotations

import json

import frappe
from frappe.utils import flt, now_datetime, today


def _parse(value):
	if isinstance(value, str):
		return json.loads(value)
	return value or {}


def _names(doctype: str, ids: list[str], field: str) -> dict:
	ids = [i for i in ids if i]
	if not ids:
		return {}
	return {
		r.name: r.get(field)
		for r in frappe.get_all(doctype, filters={"name": ["in", ids]}, fields=["name", field])
	}


@frappe.whitelist()
def coaching_trainers() -> list[dict]:
	return [
		{"value": e.name, "label": e.employee_name or e.name}
		for e in frappe.get_all(
			"Employee", filters={"status": "Active"}, fields=["name", "employee_name"], limit_page_length=100
		)
	]


# ---------------------------------------------------------------------------
# Diet plans
# ---------------------------------------------------------------------------


@frappe.whitelist()
def list_diet_plans(member: str | None = None) -> list[dict]:
	filters = {"docstatus": ["<", 2]}
	if member:
		customer = frappe.db.get_value("Member Profile", member, "customer") or member
		filters["member"] = customer
	rows = frappe.get_all(
		"Diet Plan",
		filters=filters,
		fields=["name", "plan_name", "member", "trainer", "status", "start_date", "end_date", "daily_kcal_target"],
		order_by="modified desc",
	)
	cust = _names("Customer", [r.member for r in rows], "customer_name")
	emp = _names("Employee", [r.trainer for r in rows], "employee_name")
	for r in rows:
		r["member_name"] = cust.get(r.member, r.member)
		r["trainer_name"] = emp.get(r.trainer, r.trainer)
		r["start_date"] = str(r.start_date) if r.start_date else None
		r["end_date"] = str(r.end_date) if r.end_date else None
		r["item_count"] = frappe.db.count("Diet Plan Item", {"parent": r.name})
	return rows


@frappe.whitelist()
def get_diet_plan(name: str) -> dict:
	doc = frappe.get_doc("Diet Plan", name)
	meals = [
		{"meal_slot": m.meal_slot, "target_time": str(m.target_time) if m.target_time else None, "target_kcal": int(m.target_kcal or 0), "notes": m.notes}
		for m in doc.meals
	]
	items = [
		{
			"meal_slot": i.meal_slot, "food_name": i.food_name, "portion_qty": flt(i.portion_qty),
			"portion_unit": i.portion_unit, "kcal": flt(i.kcal), "protein_g": flt(i.protein_g),
			"carbs_g": flt(i.carbs_g), "fat_g": flt(i.fat_g),
		}
		for i in doc.items
	]
	totals = {
		"kcal": sum(x["kcal"] for x in items),
		"protein_g": sum(x["protein_g"] for x in items),
		"carbs_g": sum(x["carbs_g"] for x in items),
		"fat_g": sum(x["fat_g"] for x in items),
	}
	return {
		"name": doc.name, "plan_name": doc.plan_name, "member": doc.member, "trainer": doc.trainer,
		"member_name": _names("Customer", [doc.member], "customer_name").get(doc.member, doc.member),
		"status": doc.status,
		"start_date": str(doc.start_date) if doc.start_date else None,
		"end_date": str(doc.end_date) if doc.end_date else None,
		"daily_kcal_target": int(doc.daily_kcal_target or 0),
		"daily_protein_g": int(doc.daily_protein_g or 0),
		"daily_carbs_g": int(doc.daily_carbs_g or 0),
		"daily_fat_g": int(doc.daily_fat_g or 0),
		"meals": meals, "items": items, "totals": totals,
	}


@frappe.whitelist()
def save_diet_plan(plan) -> dict:
	"""Create or update a diet plan from the builder payload."""
	p = _parse(plan)
	member = p.get("member")
	if member and frappe.db.exists("Member Profile", member):
		member = frappe.db.get_value("Member Profile", member, "customer")

	doc = frappe.get_doc("Diet Plan", p["name"]) if p.get("name") else frappe.new_doc("Diet Plan")
	doc.plan_name = p.get("plan_name") or "Diet Plan"
	doc.member = member
	doc.trainer = p.get("trainer")
	doc.status = p.get("status") or "Active"
	doc.start_date = p.get("start_date") or today()
	doc.end_date = p.get("end_date")
	for k in ("daily_kcal_target", "daily_protein_g", "daily_carbs_g", "daily_fat_g"):
		doc.set(k, int(p.get(k) or 0))
	doc.set("meals", [])
	for m in p.get("meals", []):
		doc.append("meals", {"meal_slot": m.get("meal_slot"), "target_time": m.get("target_time"), "target_kcal": int(m.get("target_kcal") or 0), "notes": m.get("notes")})
	doc.set("items", [])
	for i in p.get("items", []):
		doc.append("items", {
			"meal_slot": i.get("meal_slot"), "food_name": i.get("food_name"),
			"portion_qty": flt(i.get("portion_qty")), "portion_unit": i.get("portion_unit"),
			"kcal": flt(i.get("kcal")), "protein_g": flt(i.get("protein_g")),
			"carbs_g": flt(i.get("carbs_g")), "fat_g": flt(i.get("fat_g")),
		})
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True, "name": doc.name}


# ---------------------------------------------------------------------------
# Training plans
# ---------------------------------------------------------------------------


@frappe.whitelist()
def list_training_plans(member: str | None = None) -> list[dict]:
	filters = {"docstatus": ["<", 2]}
	if member:
		customer = frappe.db.get_value("Member Profile", member, "customer") or member
		filters["member"] = customer
	rows = frappe.get_all(
		"Training Prescription",
		filters=filters,
		fields=["name", "plan_name", "member", "trainer", "goal", "status", "start_date", "end_date"],
		order_by="modified desc",
	)
	cust = _names("Customer", [r.member for r in rows], "customer_name")
	emp = _names("Employee", [r.trainer for r in rows], "employee_name")
	for r in rows:
		r["member_name"] = cust.get(r.member, r.member)
		r["trainer_name"] = emp.get(r.trainer, r.trainer)
		r["start_date"] = str(r.start_date) if r.start_date else None
		r["end_date"] = str(r.end_date) if r.end_date else None
		r["set_count"] = frappe.db.count("Training Exercise Set", {"parent": r.name})
	return rows


@frappe.whitelist()
def get_training_plan(name: str) -> dict:
	doc = frappe.get_doc("Training Prescription", name)
	sets = [
		{
			"session_name": s.session_name, "exercise_name": s.exercise_name, "sets": int(s.sets or 0),
			"reps": s.reps, "weight_kg": flt(s.weight_kg), "rest_seconds": int(s.rest_seconds or 0), "tempo": s.tempo,
		}
		for s in doc.exercise_sets
	]
	return {
		"name": doc.name, "plan_name": doc.plan_name, "member": doc.member, "trainer": doc.trainer,
		"member_name": _names("Customer", [doc.member], "customer_name").get(doc.member, doc.member),
		"goal": doc.goal, "status": doc.status,
		"start_date": str(doc.start_date) if doc.start_date else None,
		"end_date": str(doc.end_date) if doc.end_date else None,
		"exercise_sets": sets,
	}


@frappe.whitelist()
def save_training_plan(plan) -> dict:
	p = _parse(plan)
	member = p.get("member")
	if member and frappe.db.exists("Member Profile", member):
		member = frappe.db.get_value("Member Profile", member, "customer")

	doc = frappe.get_doc("Training Prescription", p["name"]) if p.get("name") else frappe.new_doc("Training Prescription")
	doc.plan_name = p.get("plan_name") or "Training Plan"
	doc.member = member
	doc.trainer = p.get("trainer")
	doc.goal = p.get("goal")
	doc.status = p.get("status") or "Active"
	doc.start_date = p.get("start_date") or today()
	doc.end_date = p.get("end_date")

	exercise_sets = p.get("exercise_sets", [])
	# Auto-build the blocks + sessions tables the controller validates against,
	# derived from the session names used by the exercises (the builder groups
	# exercises by session).
	session_names = []
	for s in exercise_sets:
		sn = (s.get("session_name") or "Session 1").strip()
		if sn not in session_names:
			session_names.append(sn)
	if not session_names:
		session_names = ["Session 1"]

	doc.set("blocks", [{"block_name": "Main", "focus": doc.goal, "sessions_per_week": len(session_names)}])
	doc.set("sessions", [{"block_name": "Main", "session_name": sn, "day_of_week": "Any"} for sn in session_names])
	doc.set("exercise_sets", [])
	for s in exercise_sets:
		doc.append("exercise_sets", {
			"session_name": (s.get("session_name") or "Session 1").strip(), "exercise_name": s.get("exercise_name"),
			"sets": int(s.get("sets") or 0), "reps": s.get("reps"), "weight_kg": flt(s.get("weight_kg")),
			"rest_seconds": int(s.get("rest_seconds") or 0), "tempo": s.get("tempo"),
		})
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True, "name": doc.name}


# ---------------------------------------------------------------------------
# Coaching notes
# ---------------------------------------------------------------------------


@frappe.whitelist()
def list_coaching_notes(member: str | None = None, limit: int = 50) -> list[dict]:
	filters = {}
	if member:
		customer = frappe.db.get_value("Member Profile", member, "customer") or member
		filters["member"] = customer
	rows = frappe.get_all(
		"Coaching Note",
		filters=filters,
		fields=["name", "member", "trainer", "note_date", "category", "note_text", "linked_diet_plan", "linked_training_prescription"],
		order_by="note_date desc",
		limit=int(limit),
	)
	cust = _names("Customer", [r.member for r in rows], "customer_name")
	emp = _names("Employee", [r.trainer for r in rows], "employee_name")
	for r in rows:
		r["member_name"] = cust.get(r.member, r.member)
		r["trainer_name"] = emp.get(r.trainer, r.trainer)
		r["note_date"] = str(r.note_date) if r.note_date else None
	return rows


@frappe.whitelist()
def create_coaching_note(
	member: str,
	note_text: str,
	category: str = "General",
	trainer: str | None = None,
	linked_diet_plan: str | None = None,
	linked_training_prescription: str | None = None,
) -> dict:
	if member and frappe.db.exists("Member Profile", member):
		member = frappe.db.get_value("Member Profile", member, "customer")
	doc = frappe.get_doc(
		{
			"doctype": "Coaching Note",
			"member": member,
			"trainer": trainer,
			"note_date": now_datetime(),
			"category": category,
			"note_text": note_text,
			"linked_diet_plan": linked_diet_plan,
			"linked_training_prescription": linked_training_prescription,
		}
	)
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True, "name": doc.name}
