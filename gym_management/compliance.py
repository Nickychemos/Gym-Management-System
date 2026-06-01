"""Compliance + certification dashboard for the admin frontend.

Compliance Item (licenses/permits/tax/insurance) and Certification Register
(staff certs) both carry an `expires_on` and a status that a scheduler
refreshes daily. To keep the dashboard accurate between scheduler runs, this
module computes `days_to_expiry` + a severity bucket fresh on every read.

  - list_compliance(...)     : compliance items with fresh expiry
  - list_certifications(...)  : staff certs with fresh expiry
  - summary()                : expiring-soon / expired counts across both
"""

from __future__ import annotations

import frappe
from frappe.utils import date_diff, flt, getdate, today

# Days-to-expiry threshold that counts as "expiring soon".
SOON_DAYS = 30


def _severity(expires_on) -> tuple[int | None, str]:
	"""(days_to_expiry, bucket) where bucket is expired/soon/ok."""
	if not expires_on:
		return None, "ok"
	days = date_diff(getdate(expires_on), getdate(today()))
	if days < 0:
		return days, "expired"
	if days <= SOON_DAYS:
		return days, "soon"
	return days, "ok"


@frappe.whitelist()
def list_compliance(
	bucket: str | None = None,
	category: str | None = None,
	search: str | None = None,
	limit_start: int = 0,
	limit_page_length: int = 50,
) -> dict:
	"""Compliance items with freshly computed expiry. `bucket` filters by
	expired/soon/ok (computed, applied after the DB read)."""
	filters: dict = {}
	if category:
		filters["compliance_category"] = category
	if search:
		filters["compliance_name"] = ["like", f"%{search}%"]

	rows = frappe.get_all(
		"Compliance Item",
		filters=filters,
		fields=[
			"name",
			"compliance_name",
			"compliance_authority",
			"compliance_category",
			"branch",
			"issued_on",
			"expires_on",
			"reference_number",
			"cost",
			"next_renewal_due",
		],
		order_by="expires_on asc",
	)
	out = []
	for r in rows:
		days, sev = _severity(r.expires_on)
		if bucket and sev != bucket:
			continue
		out.append(
			{
				"name": r.name,
				"compliance_name": r.compliance_name,
				"authority": r.compliance_authority,
				"category": r.compliance_category,
				"branch": r.branch,
				"issued_on": str(r.issued_on) if r.issued_on else None,
				"expires_on": str(r.expires_on) if r.expires_on else None,
				"days_to_expiry": days,
				"severity": sev,
				"reference_number": r.reference_number,
				"cost": flt(r.cost),
			}
		)

	total = len(out)
	start = int(limit_start)
	end = start + int(limit_page_length)
	return {"rows": out[start:end], "total": total}


@frappe.whitelist()
def list_certifications(
	bucket: str | None = None, search: str | None = None
) -> list[dict]:
	"""Staff certifications with freshly computed expiry."""
	filters: dict = {}
	if search:
		filters["certification_name"] = ["like", f"%{search}%"]
	rows = frappe.get_all(
		"Certification Register",
		filters=filters,
		fields=[
			"name",
			"employee",
			"employee_name",
			"certification_name",
			"issuing_body",
			"certification_number",
			"issued_on",
			"expires_on",
			"verified_by_hr",
		],
		order_by="expires_on asc",
	)
	out = []
	for r in rows:
		days, sev = _severity(r.expires_on)
		if bucket and sev != bucket:
			continue
		out.append(
			{
				"name": r.name,
				"employee": r.employee,
				"employee_name": r.employee_name or r.employee,
				"certification_name": r.certification_name,
				"issuing_body": r.issuing_body,
				"certification_number": r.certification_number,
				"issued_on": str(r.issued_on) if r.issued_on else None,
				"expires_on": str(r.expires_on) if r.expires_on else None,
				"days_to_expiry": days,
				"severity": sev,
				"verified_by_hr": int(r.verified_by_hr or 0),
			}
		)
	return out


@frappe.whitelist()
def summary() -> dict:
	"""Expiring-soon / expired counts across compliance items and certs."""
	def buckets(doctype, date_field):
		rows = frappe.get_all(doctype, fields=[f"{date_field} as expires_on"])
		soon = expired = 0
		for r in rows:
			_, sev = _severity(r.expires_on)
			if sev == "soon":
				soon += 1
			elif sev == "expired":
				expired += 1
		return soon, expired

	c_soon, c_expired = buckets("Compliance Item", "expires_on")
	cert_soon, cert_expired = buckets("Certification Register", "expires_on")
	return {
		"compliance_soon": c_soon,
		"compliance_expired": c_expired,
		"cert_soon": cert_soon,
		"cert_expired": cert_expired,
	}
