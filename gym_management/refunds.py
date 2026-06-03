"""Refund Request aggregation + creation for the admin frontend.

Refund Request is a workflow DocType moving through an 8-state approval chain
(Draft → Pending Manager → [Pending Owner] → Approved → Refund Initiated →
Refunded, with Rejected/Failed branches). The transitions themselves already
live as whitelisted methods on the doctype controller — the frontend calls
those directly. This module adds the read + create surfaces:

  - list_refunds(...)   : enriched, filterable, paginated list
  - summary()           : counts per workflow stage for the header strip
  - create_refund(...)  : insert a Draft Refund Request (auto-resolves the
                          requesting Employee + branch)
"""

from __future__ import annotations

import frappe
from frappe.utils import flt, today

from gym_management.rbac import FRONTDESK, MANAGER, requires

# Stages that still need someone to act, grouped for the header KPIs.
_AWAITING_APPROVAL = ("Pending Manager", "Pending Owner")
_AWAITING_PAYOUT = ("Approved", "Refund Initiated")


@frappe.whitelist()
@requires(FRONTDESK)
def list_refunds(
	status: str | None = None,
	search: str | None = None,
	branch: str | None = None,
	limit_start: int = 0,
	limit_page_length: int = 25,
) -> dict:
	"""Enriched, paginated refund list. `search` matches the refund name or
	customer name."""
	limit_start = int(limit_start)
	limit_page_length = int(limit_page_length)

	conds = ["1=1"]
	params: dict = {}
	if status:
		conds.append("r.status = %(status)s")
		params["status"] = status
	if branch:
		conds.append("r.branch = %(branch)s")
		params["branch"] = branch
	if search:
		conds.append("(r.name LIKE %(s)s OR c.customer_name LIKE %(s)s)")
		params["s"] = f"%{search}%"
	where = " AND ".join(conds)

	base = """
		FROM `tabRefund Request` r
		LEFT JOIN `tabCustomer` c ON c.name = r.customer
		WHERE {where}
	""".format(where=where)

	total = frappe.db.sql(f"SELECT COUNT(*) {base}", params)[0][0]
	rows = frappe.db.sql(
		f"""
		SELECT
			r.name, r.customer, c.customer_name, r.status, r.refund_reason,
			r.source_type, r.refund_method, r.requested_refund_amount,
			r.original_amount_paid, r.requested_on, r.branch
		{base}
		ORDER BY r.modified DESC
		LIMIT %(limit_page_length)s OFFSET %(limit_start)s
		""",
		{**params, "limit_page_length": limit_page_length, "limit_start": limit_start},
		as_dict=True,
	)
	for r in rows:
		r["customer_name"] = r.customer_name or r.customer
		r["requested_refund_amount"] = flt(r.requested_refund_amount)
		r["original_amount_paid"] = flt(r.original_amount_paid)
		r["requested_on"] = str(r.requested_on) if r.requested_on else None

	return {
		"rows": rows,
		"total": int(total),
		"limit_start": limit_start,
		"limit_page_length": limit_page_length,
	}


@frappe.whitelist()
@requires(MANAGER)
def summary() -> dict:
	"""Counts per workflow stage for the page header."""
	rows = frappe.db.sql(
		"SELECT status, COUNT(*) FROM `tabRefund Request` GROUP BY status"
	)
	by_status = {s: int(n) for s, n in rows}
	awaiting_approval = sum(by_status.get(s, 0) for s in _AWAITING_APPROVAL)
	awaiting_payout = sum(by_status.get(s, 0) for s in _AWAITING_PAYOUT)
	refunded_total = frappe.db.sql(
		"""
		SELECT COALESCE(SUM(requested_refund_amount), 0)
		FROM `tabRefund Request` WHERE status = 'Refunded'
		"""
	)[0][0]
	return {
		"by_status": by_status,
		"awaiting_approval": awaiting_approval,
		"awaiting_payout": awaiting_payout,
		"refunded_total": flt(refunded_total),
		"require_dual_control": int(
			frappe.db.get_single_value(
				"Gym Settings", "require_dual_control_for_refunds"
			)
			or 0
		),
	}


def _resolve_employee(requested_by: str | None) -> str | None:
	"""Employee for the requester: explicit → session user's Employee → any."""
	if requested_by:
		return requested_by
	emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
	if emp:
		return emp
	return frappe.db.get_value("Employee", {"status": "Active"}, "name") or frappe.db.get_value(
		"Employee", {}, "name"
	)


def _resolve_branch(branch: str | None, customer: str) -> str | None:
	if branch:
		return branch
	mp_branch = frappe.db.get_value(
		"Member Profile", {"customer": customer}, "home_branch"
	)
	return mp_branch or frappe.db.get_value("Branch", {}, "name")


@frappe.whitelist()
@requires(FRONTDESK)
def create_refund(
	customer: str,
	refund_reason: str,
	source_type: str,
	original_amount_paid: float,
	requested_refund_amount: float,
	refund_method: str,
	justification: str,
	branch: str | None = None,
	requested_by: str | None = None,
	refund_account_phone: str | None = None,
	bank_details: str | None = None,
	linked_subscription: str | None = None,
	linked_pt_package: str | None = None,
	linked_class_booking: str | None = None,
	linked_invoice: str | None = None,
) -> dict:
	"""Create a Draft Refund Request. It then moves through the approval chain
	via the doctype's transition methods. Returns {ok, refund}."""
	doc = frappe.get_doc(
		{
			"doctype": "Refund Request",
			"customer": customer,
			"refund_reason": refund_reason,
			"requested_on": today(),
			"requested_by": _resolve_employee(requested_by),
			"branch": _resolve_branch(branch, customer),
			"source_type": source_type,
			"original_amount_paid": flt(original_amount_paid),
			"requested_refund_amount": flt(requested_refund_amount),
			"refund_method": refund_method,
			"justification": justification,
			"refund_account_phone": refund_account_phone,
			"bank_details": bank_details,
			"linked_subscription": linked_subscription,
			"linked_pt_package": linked_pt_package,
			"linked_class_booking": linked_class_booking,
			"linked_invoice": linked_invoice,
		}
	)
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True, "refund": doc.name, "status": doc.status}
