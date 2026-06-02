"""Equipment register + maintenance for the admin frontend.

Two surfaces, both backed here:

  • Equipment register — every machine the gym owns (an ERPNext Asset), with a
    gym-friendly *operational status* derived from its open tickets and its
    preventive-maintenance schedules: Out of Service > Maintenance Due >
    Operational.
  • Maintenance — tickets (issues/breakdowns) and preventive schedules.

Equipment is created from the gym UI without exposing ERPNext's asset/accounting
machinery: we keep one fixed-asset Item per category (flagged
custom_prevent_etims_registration=1 so the KRA/eTIMS validation is skipped —
gym machines aren't sold), reuse a single Asset Category per gym category, and
register each machine as an Asset at a branch Location.

Public API:
  Register:  list_equipment, equipment_detail, equipment_summary,
             create_equipment, list_categories
  Schedules: create_schedule, mark_serviced
  Tickets:   list_tickets, ticket_summary, create_ticket, set_ticket_status,
             list_assets
  (Resolve a ticket via the doctype's mark_resolved.)
"""

from __future__ import annotations

import frappe
from frappe.utils import add_days, flt, getdate, now_datetime, today

_OPEN_STATES = ("Open", "Acknowledged", "In Progress", "Awaiting Parts")
_NUDGE_STATES = ("Acknowledged", "In Progress", "Awaiting Parts", "Closed", "Cancelled")

DEFAULT_CATEGORIES = [
	"Cardio",
	"Strength",
	"Free Weights",
	"Functional",
	"Other",
]


# ---------------------------------------------------------------------------
# Setup helpers (idempotent) — hide ERPNext Asset plumbing from the gym UI
# ---------------------------------------------------------------------------


def _company() -> str:
	return frappe.defaults.get_user_default("Company") or frappe.get_all(
		"Company", fields=["name"], limit=1
	)[0].name


def _account(company: str, account_types: list[str]) -> str | None:
	for t in account_types:
		a = frappe.get_all(
			"Account",
			filters={"company": company, "account_type": t, "is_group": 0},
			fields=["name"],
			limit=1,
		)
		if a:
			return a[0].name
	a = frappe.get_all(
		"Account", filters={"company": company, "is_group": 0}, fields=["name"], limit=1
	)
	return a[0].name if a else None


def _ensure_location(branch: str | None) -> str | None:
	if not branch:
		branch = frappe.get_all("Branch", fields=["name"], limit=1)
		branch = branch[0].name if branch else None
	if not branch:
		return None
	if not frappe.db.exists("Location", branch):
		frappe.get_doc({"doctype": "Location", "location_name": branch}).insert(
			ignore_permissions=True
		)
	return branch


def _ensure_asset_category(label: str) -> str:
	name = f"Gym {label}"
	if frappe.db.exists("Asset Category", name):
		return name
	company = _company()
	frappe.get_doc(
		{
			"doctype": "Asset Category",
			"asset_category_name": name,
			"accounts": [
				{
					"company_name": company,
					"fixed_asset_account": _account(company, ["Fixed Asset"]),
					"accumulated_depreciation_account": _account(
						company, ["Accumulated Depreciation", "Fixed Asset"]
					),
					"depreciation_expense_account": _account(
						company, ["Depreciation", "Expense Account"]
					),
				}
			],
		}
	).insert(ignore_permissions=True)
	return name


def _ensure_equipment_item(category: str) -> str:
	"""One shared fixed-asset Item per category, opted out of eTIMS."""
	code = f"GYM-EQUIP-{category.upper().replace(' ', '-')}"
	if frappe.db.exists("Item", code):
		return code
	asset_category = _ensure_asset_category(category)
	item = frappe.get_doc(
		{
			"doctype": "Item",
			"item_code": code,
			"item_name": f"Gym Equipment - {category}",
			"item_group": frappe.get_all(
				"Item Group", filters={"is_group": 0}, fields=["name"], limit=1
			)[0].name,
			"is_fixed_asset": 1,
			"is_stock_item": 0,
			"asset_category": asset_category,
			# Supported opt-out: gym equipment is never sold, so skip eTIMS.
			"custom_prevent_etims_registration": 1,
		}
	)
	item.insert(ignore_permissions=True)
	return code


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------


def _derive_status(open_tickets: list[dict], schedules: list[dict]) -> dict:
	"""Operational status + signals from a machine's tickets and schedules."""
	out_of_service = any(t.get("out_of_service") for t in open_tickets)
	due = [s for s in schedules if s.get("next_due_on") and getdate(s["next_due_on"]) <= getdate(today())]
	next_due = None
	for s in schedules:
		if s.get("next_due_on"):
			d = str(s["next_due_on"])
			next_due = d if (next_due is None or d < next_due) else next_due
	if out_of_service:
		status = "Out of Service"
	elif due:
		status = "Maintenance Due"
	else:
		status = "Operational"
	return {
		"op_status": status,
		"open_tickets": len(open_tickets),
		"next_service": next_due,
		"out_of_service": 1 if out_of_service else 0,
	}


@frappe.whitelist()
def list_equipment(
	search: str | None = None,
	op_status: str | None = None,
	branch: str | None = None,
	category: str | None = None,
	limit_start: int = 0,
	limit_page_length: int = 50,
) -> dict:
	"""Every machine + derived operational status. `op_status` filters by the
	computed status (Operational / Maintenance Due / Out of Service)."""
	filters: dict = {"docstatus": ["<", 2]}
	if search:
		filters["asset_name"] = ["like", f"%{search}%"]
	if branch:
		filters["location"] = branch
	if category:
		filters["asset_category"] = f"Gym {category}"

	assets = frappe.get_all(
		"Asset",
		filters=filters,
		fields=[
			"name",
			"asset_name",
			"asset_category",
			"location",
			"gross_purchase_amount",
			"purchase_date",
		],
		order_by="asset_name asc",
	)
	names = [a.name for a in assets]

	# Batch tickets + schedules for all assets on this page.
	tickets_by_asset: dict[str, list] = {}
	if names:
		for t in frappe.get_all(
			"Equipment Maintenance Ticket",
			filters={"asset": ["in", names], "docstatus": 1, "status": ["in", list(_OPEN_STATES)]},
			fields=["asset", "out_of_service"],
		):
			tickets_by_asset.setdefault(t.asset, []).append(t)

	sched_by_asset: dict[str, list] = {}
	if names:
		for s in frappe.get_all(
			"Equipment Maintenance Schedule",
			filters={"asset": ["in", names], "is_active": 1},
			fields=["asset", "next_due_on"],
		):
			sched_by_asset.setdefault(s.asset, []).append(s)

	rows = []
	for a in assets:
		derived = _derive_status(
			tickets_by_asset.get(a.name, []), sched_by_asset.get(a.name, [])
		)
		if op_status and derived["op_status"] != op_status:
			continue
		rows.append(
			{
				"name": a.name,
				"asset_name": a.asset_name,
				"category": (a.asset_category or "").replace("Gym ", "") or None,
				"branch": a.location,
				"cost": flt(a.gross_purchase_amount),
				"purchase_date": str(a.purchase_date) if a.purchase_date else None,
				**derived,
			}
		)

	total = len(rows)
	start = int(limit_start)
	end = start + int(limit_page_length)
	return {"rows": rows[start:end], "total": total}


@frappe.whitelist()
def equipment_summary(branch: str | None = None) -> dict:
	res = list_equipment(branch=branch, limit_page_length=10000)
	rows = res["rows"]
	return {
		"total": len(rows),
		"operational": sum(1 for r in rows if r["op_status"] == "Operational"),
		"maintenance_due": sum(1 for r in rows if r["op_status"] == "Maintenance Due"),
		"out_of_service": sum(1 for r in rows if r["op_status"] == "Out of Service"),
	}


@frappe.whitelist()
def equipment_detail(asset: str) -> dict:
	"""Machine header + open/recent tickets + maintenance schedules."""
	a = frappe.db.get_value(
		"Asset",
		asset,
		["name", "asset_name", "asset_category", "location", "gross_purchase_amount", "purchase_date"],
		as_dict=True,
	)
	if not a:
		frappe.throw(frappe._("Asset {0} not found").format(asset))

	tickets = frappe.get_all(
		"Equipment Maintenance Ticket",
		filters={"asset": asset, "docstatus": 1},
		fields=[
			"name", "title", "priority", "status", "out_of_service",
			"ticket_type", "reported_at", "resolved_at", "cost",
		],
		order_by="reported_at desc",
		limit=20,
	)
	for t in tickets:
		t["out_of_service"] = int(t.out_of_service or 0)
		t["cost"] = flt(t.cost)
		t["reported_at"] = str(t.reported_at) if t.reported_at else None
		t["resolved_at"] = str(t.resolved_at) if t.resolved_at else None

	schedules = frappe.get_all(
		"Equipment Maintenance Schedule",
		filters={"asset": asset},
		fields=[
			"name", "schedule_name", "frequency", "task_type", "is_active",
			"last_performed_on", "next_due_on", "assigned_to", "estimated_cost_per_run",
		],
		order_by="next_due_on asc",
	)
	for s in schedules:
		s["is_active"] = int(s.is_active or 0)
		s["last_performed_on"] = str(s.last_performed_on) if s.last_performed_on else None
		s["next_due_on"] = str(s.next_due_on) if s.next_due_on else None
		s["estimated_cost_per_run"] = flt(s.estimated_cost_per_run)
		s["due"] = bool(s["next_due_on"] and getdate(s["next_due_on"]) <= getdate(today()))

	open_tickets = [t for t in tickets if t["status"] in _OPEN_STATES]
	derived = _derive_status(open_tickets, schedules)

	return {
		"asset": {
			"name": a.name,
			"asset_name": a.asset_name,
			"category": (a.asset_category or "").replace("Gym ", "") or None,
			"branch": a.location,
			"cost": flt(a.gross_purchase_amount),
			"purchase_date": str(a.purchase_date) if a.purchase_date else None,
			**derived,
		},
		"tickets": tickets,
		"schedules": schedules,
	}


@frappe.whitelist()
def list_categories() -> list[str]:
	"""Gym equipment categories (existing Asset Categories + defaults)."""
	existing = [
		c.name.replace("Gym ", "")
		for c in frappe.get_all(
			"Asset Category",
			filters={"name": ["like", "Gym %"]},
			fields=["name"],
		)
	]
	merged = list(dict.fromkeys(DEFAULT_CATEGORIES + existing))
	return merged


@frappe.whitelist()
def create_equipment(
	asset_name: str,
	category: str = "Other",
	branch: str | None = None,
	purchase_date: str | None = None,
	cost: float = 0,
) -> dict:
	"""Register a new machine as an Asset. Hides the Item/category/location
	plumbing. Returns {ok, asset}."""
	asset_name = (asset_name or "").strip()
	if not asset_name:
		frappe.throw(frappe._("Equipment name is required"))

	item_code = _ensure_equipment_item(category)
	location = _ensure_location(branch)
	purchase_date = purchase_date or today()

	asset = frappe.get_doc(
		{
			"doctype": "Asset",
			"asset_name": asset_name,
			"item_code": item_code,
			"company": _company(),
			"location": location,
			"asset_category": f"Gym {category}",
			"purchase_date": purchase_date,
			"available_for_use_date": purchase_date,
			"gross_purchase_amount": flt(cost) or 1,
			"calculate_depreciation": 0,
			"maintenance_required": 0,
		}
	)
	asset.flags.ignore_mandatory = True
	asset.insert(ignore_permissions=True, ignore_mandatory=True)
	frappe.db.commit()
	return {"ok": True, "asset": asset.name, "asset_name": asset_name}


# ---------------------------------------------------------------------------
# Preventive maintenance schedules
# ---------------------------------------------------------------------------


@frappe.whitelist()
def create_schedule(
	asset: str,
	frequency: str,
	schedule_name: str | None = None,
	task_type: str | None = None,
	assigned_to: str | None = None,
	estimated_cost_per_run: float = 0,
	last_performed_on: str | None = None,
) -> dict:
	"""Create a preventive-maintenance schedule for a machine. next_due_on is
	auto-computed from frequency."""
	asset_name = frappe.db.get_value("Asset", asset, "asset_name") or asset
	doc = frappe.get_doc(
		{
			"doctype": "Equipment Maintenance Schedule",
			"schedule_name": schedule_name or f"{asset_name} — {frequency} {task_type or 'service'}",
			"asset": asset,
			"frequency": frequency,
			"task_type": task_type,
			"assigned_to": assigned_to,
			"estimated_cost_per_run": flt(estimated_cost_per_run),
			"last_performed_on": last_performed_on,
			"is_active": 1,
			"auto_create_ticket": 1,
		}
	)
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True, "schedule": doc.name, "next_due_on": str(doc.next_due_on)}


@frappe.whitelist()
def mark_serviced(schedule: str, performed_on: str | None = None) -> dict:
	"""Record that a scheduled service was performed; recomputes next_due_on."""
	doc = frappe.get_doc("Equipment Maintenance Schedule", schedule)
	doc.last_performed_on = performed_on or today()
	doc.save(ignore_permissions=True)  # validate() recomputes next_due_on
	frappe.db.commit()
	return {"ok": True, "schedule": schedule, "next_due_on": str(doc.next_due_on)}


# ---------------------------------------------------------------------------
# Tickets
# ---------------------------------------------------------------------------


@frappe.whitelist()
def list_tickets(
	status: str | None = None,
	search: str | None = None,
	branch: str | None = None,
	limit_start: int = 0,
	limit_page_length: int = 25,
) -> dict:
	limit_start = int(limit_start)
	limit_page_length = int(limit_page_length)
	filters: dict = {"docstatus": 1}
	if status == "Open":
		filters["status"] = ["in", list(_OPEN_STATES)]
	elif status:
		filters["status"] = status
	if branch:
		filters["branch"] = branch
	or_filters = (
		{"title": ["like", f"%{search}%"], "asset": ["like", f"%{search}%"]}
		if search
		else None
	)
	total = len(
		frappe.get_all(
			"Equipment Maintenance Ticket",
			filters=filters,
			or_filters=or_filters,
			fields=["name"],
			limit_page_length=0,
		)
	)
	rows = frappe.get_all(
		"Equipment Maintenance Ticket",
		filters=filters,
		or_filters=or_filters,
		fields=[
			"name", "title", "asset", "branch", "priority", "status",
			"out_of_service", "ticket_type", "assigned_to", "reported_at",
			"target_resolution_date", "cost",
		],
		order_by="reported_at desc",
		limit_start=limit_start,
		limit_page_length=limit_page_length,
	)
	for r in rows:
		r["out_of_service"] = int(r.out_of_service or 0)
		r["cost"] = flt(r.cost)
		r["reported_at"] = str(r.reported_at) if r.reported_at else None
		r["target_resolution_date"] = (
			str(r.target_resolution_date) if r.target_resolution_date else None
		)
	return {
		"rows": rows,
		"total": int(total),
		"limit_start": limit_start,
		"limit_page_length": limit_page_length,
	}


@frappe.whitelist()
def ticket_summary(branch: str | None = None) -> dict:
	base = {"docstatus": 1}
	if branch:
		base["branch"] = branch
	return {
		"open": int(
			frappe.db.count(
				"Equipment Maintenance Ticket",
				{**base, "status": ["in", list(_OPEN_STATES)]},
			)
		),
		"out_of_service": int(
			frappe.db.count(
				"Equipment Maintenance Ticket",
				{**base, "out_of_service": 1, "status": ["in", list(_OPEN_STATES)]},
			)
		),
		"critical": int(
			frappe.db.count(
				"Equipment Maintenance Ticket",
				{**base, "priority": "Critical", "status": ["in", list(_OPEN_STATES)]},
			)
		),
	}


@frappe.whitelist()
def list_assets(search: str | None = None) -> list[dict]:
	filters = {"docstatus": ["<", 2]}
	if search:
		filters["asset_name"] = ["like", f"%{search}%"]
	return [
		{"name": a.name, "asset_name": a.asset_name, "location": a.location}
		for a in frappe.get_all(
			"Asset",
			filters=filters,
			fields=["name", "asset_name", "location"],
			order_by="asset_name asc",
			limit_page_length=20,
		)
	]


@frappe.whitelist()
def create_ticket(
	title: str,
	asset: str,
	priority: str = "Medium",
	description: str | None = None,
	ticket_type: str = "Breakdown",
	out_of_service: int | str = 0,
	assigned_to: str | None = None,
	target_resolution_date: str | None = None,
) -> dict:
	reporter = frappe.db.get_value(
		"Employee", {"user_id": frappe.session.user}, "name"
	) or frappe.db.get_value("Employee", {}, "name")
	doc = frappe.get_doc(
		{
			"doctype": "Equipment Maintenance Ticket",
			"title": title,
			"asset": asset,
			"reported_by": reporter,
			"reported_at": now_datetime(),
			"ticket_type": ticket_type,
			"priority": priority,
			"description": description or title,
			"status": "Open",
			"out_of_service": 1 if str(out_of_service) in ("1", "true", "True") else 0,
			"assigned_to": assigned_to,
			"target_resolution_date": target_resolution_date,
		}
	)
	doc.insert(ignore_permissions=True)
	doc.submit()
	frappe.db.commit()
	return {"ok": True, "ticket": doc.name, "status": doc.status}


@frappe.whitelist()
def set_ticket_status(ticket: str, status: str) -> dict:
	if status not in _NUDGE_STATES:
		frappe.throw(
			frappe._("Use mark_resolved to resolve; got status {0}").format(status)
		)
	doc = frappe.get_doc("Equipment Maintenance Ticket", ticket)
	doc.db_set("status", status)
	if status == "Cancelled":
		doc.db_set("out_of_service", 0)
	return {"ok": True, "ticket": ticket, "status": status}
