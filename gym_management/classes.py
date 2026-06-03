"""Class catalog + timetable management for the admin frontend.

Lets gym admins set up their class offering without touching Frappe Desk:
  • Class Type  — the catalog (Spin, Yoga, HIIT…) with default duration/capacity
  • Class Schedule — the recurring weekly template (e.g. Spin, Mon/Wed/Fri 06:00)
    that the daily generator turns into bookable Class Sessions.

Public API:
  Types:     list_class_types, create_class_type, update_class_type,
             set_class_type_active
  Schedules: list_class_schedules, create_class_schedule,
             update_class_schedule, set_class_schedule_active
  Options:   class_form_options (trainers + branches + active types)
"""

from __future__ import annotations

import frappe

DAY_FIELDS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")

CLASS_TYPE_FIELDS = (
	"name",
	"class_type_name",
	"short_code",
	"default_duration_minutes",
	"default_capacity",
	"is_active",
	"display_color",
	"intensity_level",
	"description",
	"equipment_required",
)


# ---------------------------------------------------------------------------
# Class Type
# ---------------------------------------------------------------------------


@frappe.whitelist()
def list_class_types() -> list[dict]:
	"""The full Class Type catalog (active + inactive).

	Whitelisted + frappe.get_all so non-System gym staff (Website Users with
	desk_access=0, e.g. Trainers) can read the catalog without DocType-level
	read permission on Class Type — the generic REST list endpoint can't.
	"""
	return frappe.get_all(
		"Class Type",
		fields=list(CLASS_TYPE_FIELDS),
		order_by="class_type_name asc",
	)


@frappe.whitelist()
def create_class_type(
	class_type_name: str,
	default_duration_minutes: int = 60,
	default_capacity: int = 20,
	display_color: str | None = None,
	intensity_level: str | None = None,
	equipment_required: str | None = None,
	description: str | None = None,
	short_code: str | None = None,
) -> dict:
	doc = frappe.get_doc(
		{
			"doctype": "Class Type",
			"class_type_name": class_type_name,
			"default_duration_minutes": int(default_duration_minutes or 60),
			"default_capacity": int(default_capacity or 20),
			"display_color": display_color,
			"intensity_level": intensity_level,
			"equipment_required": equipment_required,
			"description": description,
			"short_code": short_code,
			"is_active": 1,
		}
	)
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True, "name": doc.name}


@frappe.whitelist()
def update_class_type(name: str, **fields) -> dict:
	allowed = {
		"default_duration_minutes",
		"default_capacity",
		"display_color",
		"intensity_level",
		"equipment_required",
		"description",
		"short_code",
		"is_active",
	}
	doc = frappe.get_doc("Class Type", name)
	for k, v in fields.items():
		if k in allowed:
			doc.set(k, v)
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True, "name": name}


@frappe.whitelist()
def set_class_type_active(name: str, active: int | str) -> dict:
	frappe.db.set_value(
		"Class Type", name, "is_active", 1 if str(active) in ("1", "true", "True") else 0
	)
	frappe.db.commit()
	return {"ok": True, "name": name}


# ---------------------------------------------------------------------------
# Class Schedule (recurring weekly template)
# ---------------------------------------------------------------------------


@frappe.whitelist()
def list_class_schedules(branch: str | None = None) -> list[dict]:
	filters = {}
	if branch:
		filters["branch"] = branch
	rows = frappe.get_all(
		"Class Schedule",
		filters=filters,
		fields=[
			"name",
			"schedule_name",
			"class_type",
			"trainer",
			"branch",
			"room",
			"start_time",
			"duration_minutes",
			"capacity",
			"effective_from",
			"effective_until",
			"is_active",
			*DAY_FIELDS,
		],
		order_by="start_time asc",
	)
	trainer_ids = list({r.trainer for r in rows if r.trainer})
	trainers = (
		{
			e.name: e.employee_name
			for e in frappe.get_all(
				"Employee", filters={"name": ["in", trainer_ids]}, fields=["name", "employee_name"]
			)
		}
		if trainer_ids
		else {}
	)
	out = []
	for r in rows:
		days = [d.upper() for d in DAY_FIELDS if r.get(d)]
		out.append(
			{
				"name": r.name,
				"schedule_name": r.schedule_name,
				"class_type": r.class_type,
				"trainer": r.trainer,
				"trainer_name": trainers.get(r.trainer, r.trainer),
				"branch": r.branch,
				"room": r.room,
				"start_time": str(r.start_time) if r.start_time else None,
				"duration_minutes": int(r.duration_minutes or 0),
				"capacity": int(r.capacity or 0),
				"effective_from": str(r.effective_from) if r.effective_from else None,
				"effective_until": str(r.effective_until) if r.effective_until else None,
				"is_active": int(r.is_active or 0),
				"days": days,
			}
		)
	return out


def _apply_days(doc, days):
	chosen = {str(d).lower() for d in (days or [])}
	for d in DAY_FIELDS:
		doc.set(d, 1 if d in chosen else 0)


@frappe.whitelist()
def create_class_schedule(
	class_type: str,
	trainer: str,
	branch: str,
	start_time: str,
	days: list | str,
	effective_from: str | None = None,
	effective_until: str | None = None,
	room: str | None = None,
	schedule_name: str | None = None,
	capacity: int | None = None,
) -> dict:
	"""Create a recurring schedule and immediately generate its upcoming
	sessions so the Schedule grid populates without waiting for the daily job."""
	if isinstance(days, str):
		days = frappe.parse_json(days) if days.startswith("[") else [d.strip() for d in days.split(",")]

	ct = frappe.db.get_value(
		"Class Type", class_type, ["default_duration_minutes", "default_capacity"], as_dict=True
	)
	duration = int(ct.default_duration_minutes or 60) if ct else 60
	cap = int(capacity) if capacity is not None else (int(ct.default_capacity or 20) if ct else 20)

	if not schedule_name:
		day_label = (days[0].title() if days else "Weekly")
		schedule_name = f"{class_type} {day_label} {str(start_time)[:5]}"
		n, base = 1, schedule_name
		while frappe.db.exists("Class Schedule", schedule_name):
			n += 1
			schedule_name = f"{base} ({n})"

	doc = frappe.get_doc(
		{
			"doctype": "Class Schedule",
			"schedule_name": schedule_name,
			"class_type": class_type,
			"trainer": trainer,
			"branch": branch,
			"room": room,
			"start_time": start_time,
			"duration_minutes": duration,
			"capacity": cap,
			"effective_from": effective_from or frappe.utils.today(),
			"effective_until": effective_until,
			"is_active": 1,
		}
	)
	_apply_days(doc, days)
	doc.insert(ignore_permissions=True)
	frappe.db.commit()

	# Generate upcoming sessions now (idempotent).
	try:
		from gym_management.gym_management.doctype.class_session.class_session import (
			generate_sessions,
		)

		generate_sessions()
		frappe.db.commit()
	except Exception:
		frappe.log_error(frappe.get_traceback(), "classes.create_class_schedule.generate")

	return {"ok": True, "name": doc.name}


@frappe.whitelist()
def update_class_schedule(name: str, **fields) -> dict:
	allowed = {
		"trainer",
		"branch",
		"room",
		"start_time",
		"capacity",
		"effective_from",
		"effective_until",
		"is_active",
	}
	doc = frappe.get_doc("Class Schedule", name)
	for k, v in fields.items():
		if k in allowed:
			doc.set(k, v)
	if "days" in fields:
		days = fields["days"]
		if isinstance(days, str):
			days = frappe.parse_json(days) if days.startswith("[") else days.split(",")
		_apply_days(doc, days)
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True, "name": name}


@frappe.whitelist()
def set_class_schedule_active(name: str, active: int | str) -> dict:
	frappe.db.set_value(
		"Class Schedule", name, "is_active", 1 if str(active) in ("1", "true", "True") else 0
	)
	frappe.db.commit()
	return {"ok": True, "name": name}


# ---------------------------------------------------------------------------
# Form options
# ---------------------------------------------------------------------------


@frappe.whitelist()
def class_form_options() -> dict:
	trainers = [
		{"value": e.name, "label": e.employee_name or e.name}
		for e in frappe.get_all(
			"Employee", filters={"status": "Active"}, fields=["name", "employee_name"], limit_page_length=100
		)
	]
	branches = [b.name for b in frappe.get_all("Branch", fields=["name"], order_by="name asc")]
	types = [
		{"name": c.name, "default_capacity": int(c.default_capacity or 0)}
		for c in frappe.get_all(
			"Class Type", filters={"is_active": 1}, fields=["name", "default_capacity"], order_by="name asc"
		)
	]
	return {"trainers": trainers, "branches": branches, "class_types": types}
