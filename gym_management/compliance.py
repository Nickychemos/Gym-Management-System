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
from gym_management.branches import resolve_branch_filter
from gym_management.rbac import MANAGER, requires
from frappe.utils import date_diff, flt, getdate, today

# Placeholder used when a renewal/cert is recorded without a file upload yet.
_DOC_PLACEHOLDER = "/files/compliance-document-pending.txt"

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
@requires(MANAGER)
def list_compliance(
	bucket: str | None = None,
	category: str | None = None,
	search: str | None = None,
	branch: str | None = None,
	limit_start: int = 0,
	limit_page_length: int = 50,
) -> dict:
	"""Compliance items with freshly computed expiry. `bucket` filters by
	expired/soon/ok (computed, applied after the DB read)."""
	branch = resolve_branch_filter(branch)
	filters: dict = {}
	if category:
		filters["compliance_category"] = category
	if branch:
		filters["branch"] = branch
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
@requires(MANAGER)
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
@requires(MANAGER)
def summary(branch: str | None = None) -> dict:
	"""Expiring-soon / expired counts across compliance items and certs."""
	branch = resolve_branch_filter(branch)

	def buckets(doctype, date_field, filters=None):
		rows = frappe.get_all(
			doctype, filters=filters or {}, fields=[f"{date_field} as expires_on"]
		)
		soon = expired = 0
		for r in rows:
			_, sev = _severity(r.expires_on)
			if sev == "soon":
				soon += 1
			elif sev == "expired":
				expired += 1
		return soon, expired

	# Compliance Item is branch-scoped; Certification Register has no branch field
	# (staff certs are gym-wide), so it stays unscoped.
	c_soon, c_expired = buckets(
		"Compliance Item", "expires_on", {"branch": branch} if branch else None
	)
	cert_soon, cert_expired = buckets("Certification Register", "expires_on")
	return {
		"compliance_soon": c_soon,
		"compliance_expired": c_expired,
		"cert_soon": cert_soon,
		"cert_expired": cert_expired,
	}


# ---------------------------------------------------------------------------
# Form options
# ---------------------------------------------------------------------------


@frappe.whitelist()
@requires(MANAGER)
def list_authorities() -> list[str]:
	"""Compliance authorities for the item form."""
	return [
		a.name
		for a in frappe.get_all(
			"Compliance Authority", fields=["name"], order_by="name asc"
		)
	]


@frappe.whitelist()
@requires(MANAGER)
def create_authority(authority_name: str) -> dict:
	"""Register a new compliance authority on the fly."""
	authority_name = (authority_name or "").strip()
	if not authority_name:
		frappe.throw(frappe._("Authority name is required"))
	if not frappe.db.exists("Compliance Authority", authority_name):
		frappe.get_doc(
			{"doctype": "Compliance Authority", "authority_name": authority_name}
		).insert(ignore_permissions=True)
		frappe.db.commit()
	return {"ok": True, "authority": authority_name}


@frappe.whitelist()
@requires(MANAGER)
def list_employees() -> list[dict]:
	"""Active employees for the certification form."""
	return [
		{"name": e.name, "employee_name": e.employee_name or e.name}
		for e in frappe.get_all(
			"Employee",
			filters={"status": "Active"},
			fields=["name", "employee_name"],
			order_by="employee_name asc",
			limit_page_length=200,
		)
	]


# ---------------------------------------------------------------------------
# Compliance Item CRUD + renewal
# ---------------------------------------------------------------------------


@frappe.whitelist()
@requires(MANAGER)
def create_compliance_item(
	compliance_name: str,
	compliance_authority: str,
	expires_on: str,
	compliance_category: str | None = None,
	branch: str | None = None,
	issued_on: str | None = None,
	reference_number: str | None = None,
	cost: float = 0,
) -> dict:
	"""Register a new compliance obligation (license/permit/tax/insurance)."""
	doc = frappe.get_doc(
		{
			"doctype": "Compliance Item",
			"compliance_name": compliance_name,
			"compliance_authority": compliance_authority,
			"compliance_category": compliance_category,
			"branch": branch,
			"issued_on": issued_on,
			"expires_on": expires_on,
			"reference_number": reference_number,
			"cost": flt(cost),
		}
	)
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True, "name": doc.name}


@frappe.whitelist()
@requires(MANAGER)
def update_compliance_item(name: str, **fields) -> dict:
	"""Edit a compliance item. Accepts any of: compliance_name,
	compliance_authority, compliance_category, branch, issued_on, expires_on,
	reference_number, cost."""
	allowed = {
		"compliance_name",
		"compliance_authority",
		"compliance_category",
		"branch",
		"issued_on",
		"expires_on",
		"reference_number",
		"cost",
	}
	doc = frappe.get_doc("Compliance Item", name)
	for k, v in fields.items():
		if k in allowed:
			doc.set(k, v)
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True, "name": name}


@frappe.whitelist()
@requires(MANAGER)
def renew_compliance(
	compliance_item: str,
	new_expiry_date: str,
	renewed_on: str | None = None,
	cost_paid: float = 0,
	payment_method: str | None = None,
	new_reference_number: str | None = None,
	new_document: str | None = None,
) -> dict:
	"""Record a renewal: creates + submits a Compliance Renewal, which pushes
	the item's expires_on to new_expiry_date. Returns the new expiry."""
	old_expiry = frappe.db.get_value("Compliance Item", compliance_item, "expires_on")
	doc = frappe.get_doc(
		{
			"doctype": "Compliance Renewal",
			"compliance_item": compliance_item,
			"old_expiry_date": old_expiry,
			"new_expiry_date": new_expiry_date,
			"renewed_on": renewed_on or today(),
			"new_document": new_document or _DOC_PLACEHOLDER,
			"new_reference_number": new_reference_number,
			"cost_paid": flt(cost_paid),
			"payment_method": payment_method,
		}
	)
	doc.insert(ignore_permissions=True)
	doc.submit()
	frappe.db.commit()
	return {
		"ok": True,
		"renewal": doc.name,
		"compliance_item": compliance_item,
		"new_expiry_date": str(new_expiry_date),
	}


# ---------------------------------------------------------------------------
# Certification CRUD
# ---------------------------------------------------------------------------


@frappe.whitelist()
@requires(MANAGER)
def create_certification(
	employee: str,
	certification_name: str,
	issuing_body: str,
	issued_on: str,
	expires_on: str,
	certification_number: str | None = None,
	certificate_attachment: str | None = None,
	verified_by_hr: int | str = 0,
) -> dict:
	"""Register a staff certification."""
	doc = frappe.get_doc(
		{
			"doctype": "Certification Register",
			"employee": employee,
			"certification_name": certification_name,
			"issuing_body": issuing_body,
			"issued_on": issued_on,
			"expires_on": expires_on,
			"certification_number": certification_number,
			"certificate_attachment": certificate_attachment or _DOC_PLACEHOLDER,
			"verified_by_hr": 1 if str(verified_by_hr) in ("1", "true", "True") else 0,
		}
	)
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True, "name": doc.name}


@frappe.whitelist()
@requires(MANAGER)
def update_certification(name: str, **fields) -> dict:
	"""Edit a certification. Accepts certification_name, issuing_body,
	certification_number, issued_on, expires_on, verified_by_hr."""
	allowed = {
		"certification_name",
		"issuing_body",
		"certification_number",
		"issued_on",
		"expires_on",
		"verified_by_hr",
	}
	doc = frappe.get_doc("Certification Register", name)
	for k, v in fields.items():
		if k in allowed:
			doc.set(k, v)
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True, "name": name}
