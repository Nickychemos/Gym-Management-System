"""Cash drawer reconciliation surfaces for the admin frontend.

The open/close shift actions already live on the Cash Drawer Session
controller (open_session / close_session, which compute variance and enforce
dual-control). This module adds the read surfaces and the pickers.

Public API:
  list_sessions, drawer_summary, drawer_options, expected_cash
  (open/close reuse cash_drawer_session.open_session / close_session)
"""

from __future__ import annotations

import frappe
from frappe.utils import flt, today

from gym_management.branches import resolve_branch_filter
from gym_management.rbac import MANAGER, requires

_OPEN = "Open"


@frappe.whitelist()
@requires(MANAGER)
def list_sessions(branch: str | None = None, status: str | None = None, limit: int = 50) -> list[dict]:
	branch = resolve_branch_filter(branch)
	filters: dict = {"docstatus": ["<", 2]}
	if branch:
		filters["branch"] = branch
	if status:
		filters["status"] = status
	rows = frappe.get_all(
		"Cash Drawer Session",
		filters=filters,
		fields=[
			"name", "branch", "cashier", "shift_date", "status", "opening_float",
			"expected_cash_sales", "actual_cash_counted", "variance",
			"variance_acceptable", "opened_at", "closed_at", "transaction_count",
		],
		order_by="opened_at desc, creation desc",
		limit=int(limit),
	)
	emp = {
		e.name: e.employee_name
		for e in frappe.get_all(
			"Employee", filters={"name": ["in", [r.cashier for r in rows if r.cashier]]}, fields=["name", "employee_name"]
		)
	} if rows else {}
	for r in rows:
		r["cashier_name"] = emp.get(r.cashier, r.cashier)
		for k in ("opening_float", "expected_cash_sales", "actual_cash_counted", "variance"):
			r[k] = flt(r.get(k))
		r["variance_acceptable"] = int(r.variance_acceptable or 0)
		r["transaction_count"] = int(r.transaction_count or 0)
		r["shift_date"] = str(r.shift_date) if r.shift_date else None
		r["opened_at"] = str(r.opened_at) if r.opened_at else None
		r["closed_at"] = str(r.closed_at) if r.closed_at else None
	return rows


@frappe.whitelist()
@requires(MANAGER)
def drawer_summary(branch: str | None = None) -> dict:
	branch = resolve_branch_filter(branch)
	base: dict = {"docstatus": ["<", 2]}
	if branch:
		base["branch"] = branch
	open_count = frappe.db.count("Cash Drawer Session", {**base, "status": _OPEN})
	today_variance = frappe.db.sql(
		"""
		SELECT COALESCE(SUM(variance), 0) FROM `tabCash Drawer Session`
		WHERE shift_date = %(today)s AND status != 'Open' {branch_clause}
		""".format(branch_clause="AND branch = %(branch)s" if branch else ""),
		{"today": today(), "branch": branch},
	)[0][0]
	return {"open_drawers": int(open_count), "today_variance": flt(today_variance)}


@frappe.whitelist()
@requires(MANAGER)
def drawer_options() -> dict:
	cashiers = [
		{"value": e.name, "label": e.employee_name or e.name}
		for e in frappe.get_all(
			"Employee", filters={"status": "Active"}, fields=["name", "employee_name"], limit_page_length=100
		)
	]
	branches = [b.name for b in frappe.get_all("Branch", fields=["name"], order_by="name asc")]
	threshold = flt(
		frappe.db.get_single_value("Gym Settings", "cash_variance_threshold") or 0
	)
	return {"cashiers": cashiers, "branches": branches, "variance_threshold": threshold}


@frappe.whitelist()
@requires(MANAGER)
def expected_cash(session_name: str) -> dict:
	"""Best-guess expected cash for the close form (opening float + cash sales)."""
	from gym_management.gym_management.doctype.cash_drawer_session.cash_drawer_session import (
		compute_expected_cash_sales,
	)

	opening = flt(frappe.db.get_value("Cash Drawer Session", session_name, "opening_float"))
	try:
		sales = flt(compute_expected_cash_sales(session_name))
	except Exception:
		sales = 0.0
	return {"opening_float": opening, "cash_sales": sales, "expected_total": opening + sales}
