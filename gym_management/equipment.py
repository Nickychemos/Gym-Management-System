"""Equipment maintenance tickets for the admin frontend.

Equipment Maintenance Ticket is submittable; its status moves through
Open → Acknowledged → In Progress → Awaiting Parts → Resolved/Closed (with a
Cancelled branch). `out_of_service` flags equipment that's down. The Resolve
transition already exists on the controller (clears out_of_service, stamps the
schedule's last_performed_on); this module adds the read + create surfaces and
the lighter status nudges.

  - list_tickets(...)            : enriched, filterable, paginated tickets
  - ticket_summary(branch)       : open / out-of-service / by-priority counts
  - create_ticket(...)           : raise a ticket against an Asset
  - set_ticket_status(...)       : Acknowledged / In Progress / Awaiting Parts
                                   / Closed / Cancelled (Resolve uses the
                                   doctype's mark_resolved)
  - list_assets(search)          : Assets for the create picker
"""

from __future__ import annotations

import frappe
from frappe.utils import flt, now_datetime

_OPEN_STATES = ("Open", "Acknowledged", "In Progress", "Awaiting Parts")
_NUDGE_STATES = (
	"Acknowledged",
	"In Progress",
	"Awaiting Parts",
	"Closed",
	"Cancelled",
)


@frappe.whitelist()
def list_tickets(
	status: str | None = None,
	search: str | None = None,
	branch: str | None = None,
	limit_start: int = 0,
	limit_page_length: int = 25,
) -> dict:
	"""Enriched, paginated maintenance tickets (docstatus 1)."""
	limit_start = int(limit_start)
	limit_page_length = int(limit_page_length)

	filters: dict = {"docstatus": 1}
	if status == "Open":
		filters["status"] = ["in", list(_OPEN_STATES)]
	elif status:
		filters["status"] = status
	if branch:
		filters["branch"] = branch

	or_filters = None
	if search:
		or_filters = {
			"title": ["like", f"%{search}%"],
			"asset": ["like", f"%{search}%"],
		}

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
			"name",
			"title",
			"asset",
			"branch",
			"priority",
			"status",
			"out_of_service",
			"ticket_type",
			"assigned_to",
			"reported_at",
			"target_resolution_date",
			"cost",
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
	"""Counts for the page header."""
	base = {"docstatus": 1}
	if branch:
		base["branch"] = branch
	open_count = frappe.db.count(
		"Equipment Maintenance Ticket", {**base, "status": ["in", list(_OPEN_STATES)]}
	)
	oos = frappe.db.count(
		"Equipment Maintenance Ticket",
		{**base, "out_of_service": 1, "status": ["in", list(_OPEN_STATES)]},
	)
	critical = frappe.db.count(
		"Equipment Maintenance Ticket",
		{**base, "priority": "Critical", "status": ["in", list(_OPEN_STATES)]},
	)
	return {
		"open": int(open_count),
		"out_of_service": int(oos),
		"critical": int(critical),
	}


@frappe.whitelist()
def list_assets(search: str | None = None) -> list[dict]:
	"""Assets for the create-ticket picker."""
	filters = {}
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
	"""Raise + submit a maintenance ticket against an Asset. reported_by is the
	current user's Employee (falls back to any)."""
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
	"""Move a ticket between working states. For Resolved, call the doctype's
	mark_resolved instead (it clears out_of_service + updates the schedule)."""
	if status not in _NUDGE_STATES:
		frappe.throw(
			frappe._("Use mark_resolved to resolve; got status {0}").format(status)
		)
	doc = frappe.get_doc("Equipment Maintenance Ticket", ticket)
	doc.db_set("status", status)
	if status == "Cancelled":
		doc.db_set("out_of_service", 0)
	return {"ok": True, "ticket": ticket, "status": status}
