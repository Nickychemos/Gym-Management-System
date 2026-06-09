"""Personal-training packages + sessions for the admin frontend.

PT Package and PT Session are both submittable. Selling a package creates +
submits a PT Package (price and session count fetched from a PT-type
Membership Plan); the package then "burns down" as sessions are completed or
no-showed (each decrements sessions_remaining; hitting zero flips the package
to Completed). The session complete/no-show transitions already exist on the
PT Session controller — this module adds the read + create surfaces:

  - list_packages(...)      : enriched, filterable, paginated package list
  - package_detail(pkg)     : header + session burndown
  - sell_package(...)       : create + submit a PT Package
  - schedule_session(...)   : create + submit a Scheduled PT Session
  - cancel_session(...)     : cancel a session (reverses any decrement)
  - form_options()          : trainers + PT plans for the sell form
"""

from __future__ import annotations

import frappe
from frappe.utils import add_days, flt, today

from gym_management.branches import resolve_branch_filter
from gym_management.rbac import ANY_STAFF, FRONTDESK, requires

_ACTIVE_SESSION_STATES = ["Scheduled", "Completed", "No-Show", "Rescheduled"]


def _employee_names(ids: list[str]) -> dict:
	ids = [i for i in ids if i]
	if not ids:
		return {}
	return {
		e.name: e.employee_name
		for e in frappe.get_all(
			"Employee", filters={"name": ["in", ids]}, fields=["name", "employee_name"]
		)
	}


def _customer_names(ids: list[str]) -> dict:
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
@requires(ANY_STAFF)
def list_packages(
	status: str | None = None,
	search: str | None = None,
	trainer: str | None = None,
	branch: str | None = None,
	limit_start: int = 0,
	limit_page_length: int = 25,
) -> dict:
	"""Enriched, paginated PT Package list (docstatus 1 only)."""
	limit_start = int(limit_start)
	limit_page_length = int(limit_page_length)
	branch = resolve_branch_filter(branch)

	filters: dict = {"docstatus": 1}
	if status:
		filters["status"] = status
	if trainer:
		filters["trainer"] = trainer
	if branch:
		filters["branch"] = branch

	or_filters = None
	if search:
		or_filters = {
			"name": ["like", f"%{search}%"],
			"customer": ["like", f"%{search}%"],
		}

	total = len(
		frappe.get_all(
			"PT Package",
			filters=filters,
			or_filters=or_filters,
			fields=["name"],
			limit_page_length=0,
		)
	)

	rows = frappe.get_all(
		"PT Package",
		filters=filters,
		or_filters=or_filters,
		fields=[
			"name",
			"customer",
			"trainer",
			"branch",
			"status",
			"start_date",
			"expiry_date",
			"price",
			"sessions_purchased",
			"sessions_used",
			"sessions_remaining",
			"payment_status",
		],
		order_by="modified desc",
		limit_start=limit_start,
		limit_page_length=limit_page_length,
	)

	cust = _customer_names([r.customer for r in rows])
	emp = _employee_names([r.trainer for r in rows])
	out = []
	for r in rows:
		out.append(
			{
				"name": r.name,
				"customer": r.customer,
				"customer_name": cust.get(r.customer, r.customer),
				"trainer": r.trainer,
				"trainer_name": emp.get(r.trainer, r.trainer),
				"branch": r.branch,
				"status": r.status,
				"start_date": str(r.start_date) if r.start_date else None,
				"expiry_date": str(r.expiry_date) if r.expiry_date else None,
				"price": flt(r.price),
				"sessions_purchased": int(r.sessions_purchased or 0),
				"sessions_used": int(r.sessions_used or 0),
				"sessions_remaining": int(r.sessions_remaining or 0),
				"payment_status": r.payment_status,
			}
		)
	return {
		"rows": out,
		"total": int(total),
		"limit_start": limit_start,
		"limit_page_length": limit_page_length,
	}


@frappe.whitelist()
@requires(ANY_STAFF)
def package_detail(pt_package: str) -> dict:
	"""Package header + its sessions, for the burndown view."""
	p = frappe.db.get_value(
		"PT Package",
		pt_package,
		[
			"name",
			"customer",
			"trainer",
			"branch",
			"status",
			"start_date",
			"expiry_date",
			"price",
			"sessions_purchased",
			"sessions_used",
			"sessions_remaining",
			"payment_status",
			"goals",
		],
		as_dict=True,
	)
	if not p:
		frappe.throw(frappe._("PT Package {0} not found").format(pt_package))

	p["customer_name"] = _customer_names([p.customer]).get(p.customer, p.customer)
	p["trainer_name"] = _employee_names([p.trainer]).get(p.trainer, p.trainer)
	p["price"] = flt(p.price)
	for k in ("start_date", "expiry_date"):
		p[k] = str(p[k]) if p[k] else None

	session_rows = frappe.get_all(
		"PT Session",
		filters={"pt_package": pt_package, "docstatus": 1},
		fields=[
			"name",
			"scheduled_at",
			"status",
			"actual_start_time",
			"actual_end_time",
			"room",
			"workout_focus",
			"rating",
		],
		order_by="scheduled_at desc",
	)
	sessions = []
	for s in session_rows:
		sessions.append(
			{
				"name": s.name,
				"scheduled_at": str(s.scheduled_at) if s.scheduled_at else None,
				"status": s.status,
				"room": s.room,
				"workout_focus": s.workout_focus,
				"rating": s.rating,
			}
		)
	return {"package": p, "sessions": sessions}


@frappe.whitelist()
@requires(FRONTDESK)
def sell_package(
	customer: str,
	trainer: str,
	membership_plan: str,
	start_date: str | None = None,
	expiry_date: str | None = None,
	branch: str | None = None,
	goals: str | None = None,
) -> dict:
	"""Create + submit a PT Package. price + sessions_purchased are fetched
	from the (PT-type) Membership Plan. Returns {ok, package, sessions}."""
	start = start_date or today()
	if not expiry_date:
		validity = (
			frappe.db.get_single_value(
				"Gym Settings", "pt_package_default_validity_days"
			)
			or 90
		)
		expiry_date = add_days(start, int(validity))
	if not branch:
		branch = (
			frappe.db.get_value("Member Profile", {"customer": customer}, "home_branch")
			or frappe.db.get_value("Employee", trainer, "branch")
			or frappe.db.get_value("Branch", {}, "name")
		)

	doc = frappe.get_doc(
		{
			"doctype": "PT Package",
			"customer": customer,
			"trainer": trainer,
			"branch": branch,
			"membership_plan": membership_plan,
			"start_date": start,
			"expiry_date": expiry_date,
			"goals": goals,
		}
	)
	doc.insert(ignore_permissions=True)
	doc.submit()
	frappe.db.commit()
	return {
		"ok": True,
		"package": doc.name,
		"sessions": int(doc.sessions_purchased or 0),
	}


@frappe.whitelist()
@requires(ANY_STAFF)
def schedule_session(
	pt_package: str,
	scheduled_at: str,
	room: str | None = None,
	workout_focus: str | None = None,
) -> dict:
	"""Create + submit a Scheduled PT Session against a package. customer and
	trainer are fetched from the package."""
	doc = frappe.get_doc(
		{
			"doctype": "PT Session",
			"pt_package": pt_package,
			"scheduled_at": scheduled_at,
			"status": "Scheduled",
			"room": room,
			"workout_focus": workout_focus,
		}
	)
	doc.insert(ignore_permissions=True)
	doc.submit()
	frappe.db.commit()
	return {"ok": True, "session": doc.name, "status": doc.status}


@frappe.whitelist()
@requires(ANY_STAFF)
def cancel_session(pt_session: str) -> dict:
	"""Cancel a PT Session. If it had decremented the package, on_cancel
	reverses that."""
	doc = frappe.get_doc("PT Session", pt_session)
	doc.cancel()
	frappe.db.commit()
	return {"ok": True, "session": pt_session, "status": doc.status}


@frappe.whitelist()
@requires(ANY_STAFF)
def form_options() -> dict:
	"""Trainers + PT-type plans to populate the sell form.

	Trainers prefer those with a Trainer Profile; falls back to active
	Employees so the form is usable before profiles are set up.
	"""
	profiles = frappe.get_all(
		"Trainer Profile",
		fields=["employee", "trainer_full_name"],
	)
	if profiles:
		trainers = [
			{"value": p.employee, "label": p.trainer_full_name or p.employee}
			for p in profiles
		]
	else:
		trainers = [
			{"value": e.name, "label": e.employee_name or e.name}
			for e in frappe.get_all(
				"Employee",
				filters={"status": "Active"},
				fields=["name", "employee_name"],
				limit_page_length=50,
			)
		]

	plans = [
		{
			"name": pl.name,
			"price": flt(pl.price),
			"sessions": int(pl.session_count or 0),
		}
		for pl in frappe.get_all(
			"Membership Plan",
			filters={"plan_type": "PT Package", "is_active": 1},
			fields=["name", "price", "session_count"],
			order_by="price asc",
		)
	]
	return {"trainers": trainers, "plans": plans}
