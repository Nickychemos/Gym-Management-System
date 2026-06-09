"""Payments aggregation for the admin frontend.

Backs the Payments page (the daily money/reconciliation surface) and the
Member 360 Payments tab. M-Pesa is the dominant rail, so the "stream" is the
M-Pesa Transaction feed; cash-drawer + refund surfaces have their own existing
endpoints and are layered on later.

  - stream(...)            : enriched, filterable, paginated transaction feed
  - summary(branch)        : payment KPIs for the page's header strip
  - member_payments(member): one member's transactions (Member 360 tab)
  - send_stk_push(...)     : trigger an STK Push, degrading to "record intent"
                             when M-Pesa isn't configured (dev / pre-go-live)
"""

from __future__ import annotations

import frappe
from frappe.utils import flt, get_first_day, today

from gym_management.branches import resolve_branch_filter
from gym_management.rbac import FRONTDESK, MANAGER, requires

_TXN_FIELDS = [
	"name",
	"transaction_type",
	"direction",
	"status",
	"amount",
	"phone_number",
	"customer",
	"account_reference",
	"mpesa_receipt_number",
	"mpesa_timestamp",
	"creation",
	"reconciled",
]


@frappe.whitelist()
@requires(MANAGER)
def stream(
	status: str | None = None,
	direction: str | None = None,
	search: str | None = None,
	branch: str | None = None,
	limit_start: int = 0,
	limit_page_length: int = 25,
) -> dict:
	"""Enriched, paginated M-Pesa transaction feed.

	`search` matches phone, receipt number, account reference, or customer name.
	Returns {"rows": [...], "total": n, "limit_start": n, "limit_page_length": n}.
	"""
	limit_start = int(limit_start)
	limit_page_length = int(limit_page_length)
	branch = resolve_branch_filter(branch)

	conds = ["1=1"]
	params: dict = {}
	if status:
		conds.append("t.status = %(status)s")
		params["status"] = status
	if direction:
		conds.append("t.direction = %(direction)s")
		params["direction"] = direction
	if search:
		conds.append(
			"(t.phone_number LIKE %(s)s OR t.mpesa_receipt_number LIKE %(s)s"
			" OR t.account_reference LIKE %(s)s OR c.customer_name LIKE %(s)s)"
		)
		params["s"] = f"%{search}%"
	# M-Pesa Transaction has no branch field; scope through the linked member's
	# home_branch (Member Profile.customer -> home_branch).
	if branch:
		conds.append("mp.home_branch = %(branch)s")
		params["branch"] = branch
	where = " AND ".join(conds)

	base = """
		FROM `tabM-Pesa Transaction` t
		LEFT JOIN `tabCustomer` c ON c.name = t.customer
		LEFT JOIN `tabMember Profile` mp ON mp.customer = t.customer
		WHERE {where}
	""".format(where=where)

	total = frappe.db.sql(f"SELECT COUNT(*) {base}", params)[0][0]

	rows = frappe.db.sql(
		f"""
		SELECT
			t.name, t.transaction_type, t.direction, t.status, t.amount,
			t.phone_number, t.customer, c.customer_name, t.account_reference,
			t.mpesa_receipt_number, t.mpesa_timestamp, t.creation, t.reconciled
		{base}
		ORDER BY t.creation DESC
		LIMIT %(limit_page_length)s OFFSET %(limit_start)s
		""",
		{**params, "limit_page_length": limit_page_length, "limit_start": limit_start},
		as_dict=True,
	)
	for r in rows:
		r["amount"] = flt(r.amount)
		r["at"] = str(r.mpesa_timestamp or r.creation)
		r["customer_name"] = r.customer_name or r.phone_number
		r.pop("mpesa_timestamp", None)
		r.pop("creation", None)

	return {
		"rows": rows,
		"total": int(total),
		"limit_start": limit_start,
		"limit_page_length": limit_page_length,
	}


@frappe.whitelist()
@requires(MANAGER)
def summary(branch: str | None = None) -> dict:
	"""Payment KPIs for the page header: today's collected total + counts by
	state, and month-to-date collected."""
	branch = resolve_branch_filter(branch)
	# M-Pesa Transaction has no branch field; scope through the linked member's
	# home_branch via an EXISTS on Member Profile.
	branch_clause = (
		""" AND EXISTS (
			SELECT 1 FROM `tabMember Profile` mp
			WHERE mp.customer = t.customer AND mp.home_branch = %(branch)s
		)"""
		if branch
		else ""
	)
	today_row = frappe.db.sql(
		"""
		SELECT
			COALESCE(SUM(CASE WHEN status='Success' AND direction='Inbound'
				THEN amount ELSE 0 END), 0) AS collected,
			SUM(status='Success' AND direction='Inbound') AS success_count,
			SUM(status='Pending') AS pending_count,
			SUM(status IN ('Failed','Timeout')) AS failed_count
		FROM `tabM-Pesa Transaction` t
		WHERE DATE(creation) = %(today)s {branch_clause}
		""".format(branch_clause=branch_clause),
		{"today": today(), "branch": branch},
		as_dict=True,
	)[0]

	mtd = frappe.db.sql(
		"""
		SELECT COALESCE(SUM(amount), 0) FROM `tabM-Pesa Transaction` t
		WHERE status='Success' AND direction='Inbound'
		  AND creation >= %(month_start)s {branch_clause}
		""".format(branch_clause=branch_clause),
		{"month_start": get_first_day(today()), "branch": branch},
	)[0][0]

	return {
		"today_collected": flt(today_row.collected),
		"today_success_count": int(today_row.success_count or 0),
		"today_pending_count": int(today_row.pending_count or 0),
		"today_failed_count": int(today_row.failed_count or 0),
		"mtd_collected": flt(mtd),
	}


@frappe.whitelist()
@requires(FRONTDESK)
def member_payments(member: str, limit: int = 50) -> list[dict]:
	"""A single member's transactions for the Member 360 Payments tab.
	`member` is a Member Profile name; resolved to its Customer."""
	customer = frappe.db.get_value("Member Profile", member, "customer")
	if not customer:
		return []
	rows = frappe.get_all(
		"M-Pesa Transaction",
		filters={"customer": customer},
		fields=_TXN_FIELDS,
		order_by="creation desc",
		limit=int(limit),
	)
	out = []
	for r in rows:
		out.append(
			{
				"name": r.name,
				"transaction_type": r.transaction_type,
				"direction": r.direction,
				"status": r.status,
				"amount": flt(r.amount),
				"account_reference": r.account_reference,
				"mpesa_receipt_number": r.mpesa_receipt_number,
				"at": str(r.mpesa_timestamp or r.creation),
			}
		)
	return out


@frappe.whitelist()
@requires(FRONTDESK)
def send_stk_push(
	customer: str,
	amount: float,
	phone_number: str,
	account_reference: str | None = None,
	description: str | None = None,
) -> dict:
	"""Trigger an STK Push to the member's phone.

	In a configured (production) tenant this constructs the M-Pesa client and
	actually fires Daraja. When M-Pesa isn't configured (dev / pre-go-live) we
	degrade gracefully: record a Pending M-Pesa Transaction so the intent shows
	in the stream, and report sent=False with the reason.

	Returns {ok, sent, transaction, status, reason?}.
	"""
	account_reference = account_reference or customer
	from gym_management.mpesa_client import MPesaClient, MPesaConfigError

	try:
		client = MPesaClient.for_current_site()
	except MPesaConfigError as e:
		# Not configured — record the intent only.
		from gym_management.gym_management.doctype.m_pesa_transaction.m_pesa_transaction import (
			initiate_stk_push,
		)

		res = initiate_stk_push(
			customer=customer,
			amount=amount,
			phone_number=phone_number,
			account_reference=account_reference,
			description=description,
		)
		return {
			"ok": True,
			"sent": False,
			"transaction": res["transaction"],
			"status": "Pending",
			"reason": f"M-Pesa not configured ({e}); recorded as Pending.",
		}

	result = client.stk_push(
		phone_number=phone_number,
		amount=amount,
		account_reference=account_reference,
		description=description or f"Payment for {account_reference}",
		customer=customer,
	)
	return {
		"ok": True,
		"sent": True,
		"transaction": result.get("transaction"),
		"status": "Pending",
	}
