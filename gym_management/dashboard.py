"""Admin dashboard aggregation.

The React admin dashboard (the landing screen at /gym) needs a handful of
headline numbers plus a few live lists. Rather than have the frontend fan out
a dozen REST queries and stitch them together, this module exposes a single
`summary()` whitelisted method that does the aggregation server-side and
returns everything the dashboard renders in one round-trip.

Everything is optionally scoped to a `branch` (the top-bar branch switcher).
Monetary figures are based on *successful inbound M-Pesa transactions* — the
dominant payment channel for Kenyan gyms. Cash-drawer takings can be folded in
later once the POS flow lands.
"""

from __future__ import annotations

import frappe
from frappe.utils import add_days, get_first_day, now_datetime, today

from gym_management.rbac import ANY_STAFF, MANAGER, has_tier, requires


def _money(value) -> float:
	"""Coerce a possibly-None SQL SUM result to a float."""
	return float(value or 0)


def _kpis(branch: str | None) -> dict:
	"""Headline numbers for the KPI tiles."""
	sub_branch = {"branch": branch} if branch else {}

	# Active members — distinct customers holding an Active subscription, so a
	# member with two active subs isn't double-counted.
	active_members = frappe.db.sql(
		"""
		SELECT COUNT(DISTINCT customer)
		FROM `tabMember Subscription`
		WHERE status = 'Active' {branch_clause}
		""".format(branch_clause="AND branch = %(branch)s" if branch else ""),
		{"branch": branch},
	)[0][0]

	# New members this calendar month (by join date).
	month_start = get_first_day(today())
	new_this_month = frappe.db.count(
		"Member Profile",
		{
			"joined_on": [">=", month_start],
			**({"home_branch": branch} if branch else {}),
		},
	)

	# Renewals due in the next 7 days — active subs ending within the window.
	renewals_due = frappe.db.count(
		"Member Subscription",
		{
			"status": "Active",
			"end_date": ["between", [today(), add_days(today(), 7)]],
			**sub_branch,
		},
	)

	# Revenue — successful inbound M-Pesa today and month-to-date.
	today_rev = frappe.db.sql(
		"""
		SELECT COALESCE(SUM(amount), 0), COUNT(*)
		FROM `tabM-Pesa Transaction`
		WHERE status = 'Success' AND direction = 'Inbound'
		  AND DATE(creation) = %(today)s
		""",
		{"today": today()},
	)[0]
	mtd_rev = frappe.db.sql(
		"""
		SELECT COALESCE(SUM(amount), 0)
		FROM `tabM-Pesa Transaction`
		WHERE status = 'Success' AND direction = 'Inbound'
		  AND creation >= %(month_start)s
		""",
		{"month_start": month_start},
	)[0][0]

	return {
		"active_members": active_members,
		"new_this_month": new_this_month,
		"renewals_due": renewals_due,
		"todays_revenue": _money(today_rev[0]),
		"todays_payment_count": int(today_rev[1]),
		"mtd_revenue": _money(mtd_rev),
	}


def _todays_classes(branch: str | None) -> list[dict]:
	"""Class sessions scheduled for today, with fill levels."""
	start = f"{today()} 00:00:00"
	end = f"{today()} 23:59:59"
	filters = {
		"start_time": ["between", [start, end]],
		"status": ["in", ["Scheduled", "In Progress", "Completed"]],
	}
	if branch:
		filters["branch"] = branch

	rows = frappe.get_all(
		"Class Session",
		filters=filters,
		fields=[
			"name",
			"class_type",
			"trainer",
			"start_time",
			"capacity",
			"bookings_count",
			"status",
		],
		order_by="start_time asc",
		limit=8,
	)
	# Resolve trainer display names in one pass.
	trainer_ids = list({r.trainer for r in rows if r.trainer})
	trainer_names = (
		{
			e.name: e.employee_name
			for e in frappe.get_all(
				"Employee",
				filters={"name": ["in", trainer_ids]},
				fields=["name", "employee_name"],
			)
		}
		if trainer_ids
		else {}
	)

	out = []
	for r in rows:
		out.append(
			{
				"name": r.name,
				"class_type": r.class_type,
				"trainer": trainer_names.get(r.trainer, r.trainer),
				"start_time": str(r.start_time),
				"booked": int(r.bookings_count or 0),
				"capacity": int(r.capacity or 0),
				"status": r.status,
			}
		)
	return out


def _recent_payments(branch: str | None) -> list[dict]:
	"""Most recent inbound M-Pesa transactions (any status — pending shows live)."""
	rows = frappe.get_all(
		"M-Pesa Transaction",
		filters={"direction": "Inbound"},
		fields=[
			"name",
			"customer",
			"amount",
			"status",
			"phone_number",
			"mpesa_timestamp",
			"creation",
		],
		order_by="creation desc",
		limit=6,
	)
	# Resolve customer display names.
	cust_ids = list({r.customer for r in rows if r.customer})
	cust_names = (
		{
			c.name: c.customer_name
			for c in frappe.get_all(
				"Customer",
				filters={"name": ["in", cust_ids]},
				fields=["name", "customer_name"],
			)
		}
		if cust_ids
		else {}
	)
	out = []
	for r in rows:
		out.append(
			{
				"name": r.name,
				"customer": r.customer,
				"customer_name": cust_names.get(r.customer) or r.phone_number,
				"amount": _money(r.amount),
				"status": r.status,
				"at": str(r.mpesa_timestamp or r.creation),
			}
		)
	return out


def _alerts(branch: str | None) -> list[dict]:
	"""Operational alerts: equipment out of service, compliance + cert expiries."""
	alerts: list[dict] = []

	# Equipment out of service (open tickets flagged out_of_service).
	eq_filters = {
		"out_of_service": 1,
		"status": ["not in", ["Resolved", "Closed", "Cancelled"]],
	}
	if branch:
		eq_filters["branch"] = branch
	for t in frappe.get_all(
		"Equipment Maintenance Ticket",
		filters=eq_filters,
		fields=["name", "title", "priority"],
		order_by="reported_at asc",
		limit=5,
	):
		alerts.append(
			{
				"kind": "danger" if t.priority == "Critical" else "warning",
				"text": f"{t.title} — out of service",
				"link": f"equipment",
				"ref": t.name,
			}
		)

	# Compliance items expiring soon or expired.
	for c in frappe.get_all(
		"Compliance Item",
		filters={"status": ["in", ["Expiring Soon", "Expired"]]},
		fields=["name", "compliance_name", "status", "days_to_expiry"],
		order_by="days_to_expiry asc",
		limit=5,
	):
		when = (
			"expired"
			if c.status == "Expired"
			else f"due in {int(c.days_to_expiry or 0)}d"
		)
		alerts.append(
			{
				"kind": "danger" if c.status == "Expired" else "warning",
				"text": f"{c.compliance_name} — {when}",
				"link": "compliance",
				"ref": c.name,
			}
		)

	# Trainer / facility certifications expiring soon.
	for cert in frappe.get_all(
		"Certification Register",
		filters={"status": "Expiring Soon"},
		fields=["name", "certification_name", "days_to_expiry"],
		order_by="days_to_expiry asc",
		limit=5,
	):
		alerts.append(
			{
				"kind": "info",
				"text": f"{cert.certification_name} cert expires in {int(cert.days_to_expiry or 0)}d",
				"link": "compliance",
				"ref": cert.name,
			}
		)

	return alerts


def _nps() -> dict | None:
	"""NPS tile — rolling 30-day score for the first active NPS survey, if any."""
	from gym_management.surveys import compute_nps_score

	survey = frappe.get_all(
		"Survey Template",
		filters={"survey_type": "NPS", "is_active": 1},
		fields=["name"],
		order_by="modified desc",
		limit=1,
	)
	if not survey:
		return None
	return compute_nps_score(survey[0].name, days=30)


@frappe.whitelist()
@requires(ANY_STAFF)
def summary(branch: str | None = None) -> dict:
	"""Everything the admin dashboard renders, in one round-trip.

	Role-trimmed: only Manager/Owner see financial figures (revenue KPIs, recent
	payments, NPS). Receptionist/Trainer get the operational view (member counts,
	today's classes, alerts) and `can_see_financials: False` — they land on the
	dashboard but never see money, so the method returns a filtered payload rather
	than 403-ing them.

	Returns:
	    {
	        "as_of": "<datetime>",
	        "branch": "<branch or None>",
	        "can_see_financials": bool,
	        "kpis": {active_members, new_this_month, renewals_due,
	                 [todays_revenue, todays_payment_count, mtd_revenue]},
	        "todays_classes": [...],
	        "recent_payments": [...]  # [] for non-managers,
	        "alerts": [...],
	        "nps": {...} | None,      # None for non-managers
	    }
	"""
	branch = branch or None
	can_finance = has_tier(MANAGER)

	kpis = _kpis(branch)
	if not can_finance:
		for k in ("todays_revenue", "todays_payment_count", "mtd_revenue"):
			kpis.pop(k, None)

	return {
		"as_of": str(now_datetime()),
		"branch": branch,
		"can_see_financials": can_finance,
		"kpis": kpis,
		"todays_classes": _todays_classes(branch),
		"recent_payments": _recent_payments(branch) if can_finance else [],
		"alerts": _alerts(branch),
		"nps": _nps() if can_finance else None,
	}
