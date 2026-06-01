"""Member-centric aggregation for the admin frontend.

The members list and the Member 360 view both need data stitched across
several DocTypes (a member's canonical record lives in Member Profile, but
their plan/status lives on Member Subscription, their spend on M-Pesa
Transactions, their visits on Visit Log, and so on). This module does that
stitching server-side and exposes it as three whitelisted methods:

  - list_members(...)        : enriched, filterable, paginated member rows
  - member_overview(member)  : header + current subscription + at-a-glance
  - member_activity(member)  : unified cross-DocType activity timeline

`member` everywhere is a **Member Profile** name (e.g. MEM-2026-000142).
Most member-facing DocTypes link to the underlying **Customer**, so we resolve
that once and fan out from there.
"""

from __future__ import annotations

import frappe
from frappe.utils import flt, get_first_day, getdate, today


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


@frappe.whitelist()
def list_members(
	search: str | None = None,
	status: str | None = None,
	branch: str | None = None,
	plan: str | None = None,
	limit_start: int = 0,
	limit_page_length: int = 20,
) -> dict:
	"""Enriched, paginated member list.

	Each row carries the member's identity plus their *current* subscription
	(most recent by start date) and outstanding balance, so the list renders
	without any follow-up calls.

	`status` and `plan` filter on the current subscription. Returns:
	    {"rows": [...], "total": <int>, "limit_start": n, "limit_page_length": n}
	"""
	limit_start = int(limit_start)
	limit_page_length = int(limit_page_length)

	conds = ["1=1"]
	params: dict = {}
	if search:
		conds.append(
			"(mp.member_full_name LIKE %(search)s"
			" OR mp.phone LIKE %(search)s"
			" OR mp.email LIKE %(search)s"
			" OR mp.name LIKE %(search)s)"
		)
		params["search"] = f"%{search}%"
	if branch:
		conds.append("mp.home_branch = %(branch)s")
		params["branch"] = branch
	if status:
		conds.append("ms.status = %(status)s")
		params["status"] = status
	if plan:
		conds.append("ms.membership_plan = %(plan)s")
		params["plan"] = plan
	where = " AND ".join(conds)

	# Each member joined to their single most-recent subscription.
	base = """
		FROM `tabMember Profile` mp
		LEFT JOIN `tabMember Subscription` ms
		  ON ms.name = (
			SELECT s.name FROM `tabMember Subscription` s
			WHERE s.customer = mp.customer
			ORDER BY s.start_date DESC, s.creation DESC
			LIMIT 1
		  )
		WHERE {where}
	""".format(where=where)

	total = frappe.db.sql(
		f"SELECT COUNT(*) {base}", params
	)[0][0]

	rows = frappe.db.sql(
		f"""
		SELECT
			mp.name AS member, mp.customer, mp.member_full_name AS full_name,
			mp.phone, mp.email, mp.home_branch AS branch, mp.profile_photo,
			mp.member_status, mp.last_visit, mp.total_visits,
			ms.membership_plan AS plan, ms.status AS sub_status, ms.end_date
		{base}
		ORDER BY mp.member_full_name ASC
		LIMIT %(limit_page_length)s OFFSET %(limit_start)s
		""",
		{**params, "limit_page_length": limit_page_length, "limit_start": limit_start},
		as_dict=True,
	)

	# Outstanding balance per customer (one grouped query for the whole page).
	balances = _outstanding_balances([r.customer for r in rows if r.customer])
	for r in rows:
		r["balance"] = balances.get(r.customer, 0.0)
		r["last_visit"] = str(r.last_visit) if r.last_visit else None
		r["end_date"] = str(r.end_date) if r.end_date else None

	return {
		"rows": rows,
		"total": int(total),
		"limit_start": limit_start,
		"limit_page_length": limit_page_length,
	}


def _outstanding_balances(customers: list[str]) -> dict:
	"""customer -> outstanding amount, from submitted Sales Invoices."""
	customers = [c for c in customers if c]
	if not customers:
		return {}
	try:
		rows = frappe.db.sql(
			"""
			SELECT customer, COALESCE(SUM(outstanding_amount), 0)
			FROM `tabSales Invoice`
			WHERE docstatus = 1 AND outstanding_amount > 0
			  AND customer IN %(customers)s
			GROUP BY customer
			""",
			{"customers": tuple(customers)},
		)
		return {c: flt(amt) for c, amt in rows}
	except Exception:
		# Sales Invoice may be absent in a stripped bench; balance is non-critical.
		return {}


# ---------------------------------------------------------------------------
# Member 360 overview
# ---------------------------------------------------------------------------


@frappe.whitelist()
def member_overview(member: str) -> dict:
	"""Header + current subscription + at-a-glance stats for Member 360."""
	mp = frappe.get_doc("Member Profile", member)
	customer = mp.customer

	# Current (most recent) subscription.
	sub_rows = frappe.get_all(
		"Member Subscription",
		filters={"customer": customer},
		fields=[
			"name",
			"membership_plan",
			"status",
			"start_date",
			"end_date",
			"price",
			"auto_renew",
			"next_renewal_date",
			"payment_status",
		],
		order_by="start_date desc, creation desc",
		limit=1,
	)
	subscription = sub_rows[0] if sub_rows else None
	if subscription:
		subscription["start_date"] = str(subscription["start_date"] or "") or None
		subscription["end_date"] = str(subscription["end_date"] or "") or None
		subscription["next_renewal_date"] = (
			str(subscription["next_renewal_date"] or "") or None
		)

	# Visits this month.
	month_start = get_first_day(today())
	visits_this_month = frappe.db.count(
		"Visit Log",
		{"customer": customer, "check_in_time": [">=", month_start]},
	)

	# Lifetime spend — successful inbound M-Pesa.
	lifetime_spend = frappe.db.sql(
		"""
		SELECT COALESCE(SUM(amount), 0) FROM `tabM-Pesa Transaction`
		WHERE customer = %(customer)s AND status = 'Success'
		  AND direction = 'Inbound'
		""",
		{"customer": customer},
	)[0][0]

	# Average visits per week since joining.
	avg_per_week = None
	if mp.joined_on and mp.total_visits:
		days = max((getdate(today()) - getdate(mp.joined_on)).days, 1)
		avg_per_week = round(mp.total_visits / (days / 7), 1)

	return {
		"member": mp.name,
		"customer": customer,
		"full_name": mp.member_full_name,
		"phone": mp.phone,
		"email": mp.email,
		"profile_photo": mp.profile_photo,
		"branch": mp.home_branch,
		"member_status": mp.member_status,
		"joined_on": str(mp.joined_on) if mp.joined_on else None,
		"gender": mp.gender,
		"date_of_birth": str(mp.date_of_birth) if mp.date_of_birth else None,
		"subscription": subscription,
		"at_a_glance": {
			"total_visits": int(mp.total_visits or 0),
			"visits_this_month": int(visits_this_month),
			"last_visit": str(mp.last_visit) if mp.last_visit else None,
			"avg_per_week": avg_per_week,
			"lifetime_spend": flt(lifetime_spend),
		},
	}


# ---------------------------------------------------------------------------
# Member 360 activity timeline
# ---------------------------------------------------------------------------


@frappe.whitelist()
def member_activity(member: str, limit: int = 20) -> list[dict]:
	"""Unified, reverse-chronological activity feed across the member's records.

	Pulls recent rows from Visit Log, M-Pesa Transaction, Class Booking,
	Survey Response, PT Package and Member Subscription, normalises them to a
	common shape, then merges and trims to `limit`.

	Each item: {type, title, at, ref_doctype, ref_name}
	"""
	limit = int(limit)
	customer = frappe.db.get_value("Member Profile", member, "customer")
	if not customer:
		return []

	items: list[dict] = []

	# Check-ins
	for v in frappe.get_all(
		"Visit Log",
		filters={"customer": customer},
		fields=["name", "check_in_time", "branch"],
		order_by="check_in_time desc",
		limit=limit,
	):
		if not v.check_in_time:
			continue
		where = f" at {v.branch}" if v.branch else ""
		items.append(
			{
				"type": "visit",
				"title": f"Checked in{where}",
				"at": str(v.check_in_time),
				"ref_doctype": "Visit Log",
				"ref_name": v.name,
			}
		)

	# Payments
	for p in frappe.get_all(
		"M-Pesa Transaction",
		filters={"customer": customer},
		fields=["name", "amount", "status", "mpesa_timestamp", "creation"],
		order_by="creation desc",
		limit=limit,
	):
		verb = "Payment received" if p.status == "Success" else f"Payment {p.status.lower()}"
		items.append(
			{
				"type": "payment",
				"title": f"{verb} — KSh {flt(p.amount):,.0f}",
				"at": str(p.mpesa_timestamp or p.creation),
				"ref_doctype": "M-Pesa Transaction",
				"ref_name": p.name,
			}
		)

	# Class bookings (resolve class type + time from the session)
	bookings = frappe.get_all(
		"Class Booking",
		filters={"customer": customer},
		fields=["name", "class_session", "status", "booked_at"],
		order_by="booked_at desc",
		limit=limit,
	)
	session_ids = list({b.class_session for b in bookings if b.class_session})
	sessions = (
		{
			s.name: s
			for s in frappe.get_all(
				"Class Session",
				filters={"name": ["in", session_ids]},
				fields=["name", "class_type", "start_time"],
			)
		}
		if session_ids
		else {}
	)
	for b in bookings:
		sess = sessions.get(b.class_session)
		label = sess.class_type if sess else "class"
		items.append(
			{
				"type": "booking",
				"title": f"Booked {label}",
				"at": str(b.booked_at) if b.booked_at else None,
				"ref_doctype": "Class Booking",
				"ref_name": b.name,
			}
		)

	# Survey responses
	for s in frappe.get_all(
		"Survey Response",
		filters={"member": customer},
		fields=["name", "nps_score", "nps_category", "submitted_on"],
		order_by="submitted_on desc",
		limit=limit,
	):
		detail = (
			f"NPS {s.nps_score} ({s.nps_category})"
			if s.nps_score is not None
			else "submitted"
		)
		items.append(
			{
				"type": "survey",
				"title": f"Survey — {detail}",
				"at": str(s.submitted_on) if s.submitted_on else None,
				"ref_doctype": "Survey Response",
				"ref_name": s.name,
			}
		)

	# PT package purchases
	for pt in frappe.get_all(
		"PT Package",
		filters={"customer": customer},
		fields=["name", "sessions_purchased", "start_date"],
		order_by="start_date desc",
		limit=limit,
	):
		items.append(
			{
				"type": "pt",
				"title": f"PT package — {int(pt.sessions_purchased or 0)} sessions",
				"at": str(pt.start_date) if pt.start_date else None,
				"ref_doctype": "PT Package",
				"ref_name": pt.name,
			}
		)

	# Subscriptions (purchase / renewal)
	for sub in frappe.get_all(
		"Member Subscription",
		filters={"customer": customer},
		fields=["name", "membership_plan", "start_date"],
		order_by="start_date desc",
		limit=limit,
	):
		items.append(
			{
				"type": "subscription",
				"title": f"Subscription — {sub.membership_plan}",
				"at": str(sub.start_date) if sub.start_date else None,
				"ref_doctype": "Member Subscription",
				"ref_name": sub.name,
			}
		)

	# Merge: newest first, drop undated, trim.
	dated = [i for i in items if i.get("at")]
	dated.sort(key=lambda i: i["at"], reverse=True)
	return dated[:limit]


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


def _default_customer_group() -> str:
	return (
		frappe.db.get_single_value("Selling Settings", "customer_group")
		or frappe.db.get_value("Customer Group", {"is_group": 0}, "name")
		or "All Customer Groups"
	)


def _default_territory() -> str:
	return (
		frappe.db.get_single_value("Selling Settings", "territory")
		or frappe.db.get_value("Territory", {"is_group": 0}, "name")
		or "All Territories"
	)


@frappe.whitelist()
def create_member(
	full_name: str,
	phone: str,
	emergency_contact_name: str,
	emergency_contact_phone: str,
	email: str | None = None,
	gender: str | None = None,
	date_of_birth: str | None = None,
	home_branch: str | None = None,
	source: str | None = None,
	national_id_type: str | None = None,
	national_id_number: str | None = None,
	emergency_contact_relationship: str | None = None,
	tax_id: str | None = None,
) -> dict:
	"""Create a Customer + Member Profile in one step.

	A Member Profile requires a linked Customer (member_full_name is fetched
	from it), so we mint the Customer first, then the profile. Returns the new
	member's name + customer so the frontend can navigate straight to 360.

	The kenya_compliance app requires a KRA PIN (tax_id) on Customers by
	default. Most individual gym members aren't VAT-registered, so when no
	tax_id is supplied we clear `require_tax_id` (the compliance app's own
	per-customer opt-out) rather than inventing a PIN.
	"""
	full_name = (full_name or "").strip()
	if not full_name:
		frappe.throw("Member name is required")

	tax_id = (tax_id or "").strip()
	customer = frappe.get_doc(
		{
			"doctype": "Customer",
			"customer_name": full_name,
			"customer_type": "Individual",
			"customer_group": _default_customer_group(),
			"territory": _default_territory(),
			"tax_id": tax_id or None,
			"require_tax_id": 1 if tax_id else 0,
		}
	)
	customer.insert(ignore_permissions=True)

	member = frappe.get_doc(
		{
			"doctype": "Member Profile",
			"customer": customer.name,
			"member_full_name": full_name,
			"phone": phone,
			"email": email,
			"gender": gender,
			"date_of_birth": date_of_birth,
			"home_branch": home_branch,
			"source": source,
			"national_id_type": national_id_type,
			"national_id_number": national_id_number,
			"emergency_contact_name": emergency_contact_name,
			"emergency_contact_phone": emergency_contact_phone,
			"emergency_contact_relationship": emergency_contact_relationship,
		}
	)
	member.insert(ignore_permissions=True)
	frappe.db.commit()

	return {"member": member.name, "customer": customer.name}
