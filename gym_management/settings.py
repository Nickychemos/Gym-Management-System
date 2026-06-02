"""Settings surfaces for the admin frontend.

Backs the Settings page: gym operating policies + branding (both Single
DocTypes), Membership Plan CRUD, an integrations status panel (eTIMS / M-Pesa
/ WhatsApp), and basic staff-user management.

Public API:
  Config:   get_settings, update_gym_settings, update_brand_settings
  Plans:    list_plans, create_plan, update_plan, set_plan_active
  Status:   integrations_status
  Users:    list_staff, list_roles, add_staff
"""

from __future__ import annotations

import frappe
from frappe.utils import flt

# Fields the UI may edit on each Single (allow-listed so nothing else leaks).
_GYM_FIELDS = [
	"default_grace_period_days",
	"default_max_freeze_days_per_year",
	"allow_member_self_freeze",
	"subscription_reminder_days_before",
	"auto_lapse_after_grace",
	"require_waiver_for_access",
	"class_cancel_window_hours",
	"class_no_show_fee",
	"class_no_show_blocks_after_n",
	"waitlist_auto_promote",
	"waitlist_response_window_minutes",
	"pt_session_default_duration_minutes",
	"pt_package_default_validity_days",
	"pt_default_trainer_commission_percent",
	"cash_variance_threshold",
	"require_dual_control_for_refunds",
	"operating_hours",
	"location",
]
_BRAND_FIELDS = [
	"gym_legal_name",
	"gym_display_name",
	"tagline",
	"primary_color",
	"secondary_color",
	"logo",
	"support_phone",
	"support_email",
	"physical_address",
	"social_facebook",
	"social_instagram",
	"social_twitter",
	"receipt_footer",
	"receipt_show_logo",
]
_PLAN_FIELDS = [
	"plan_name",
	"plan_type",
	"billing_frequency",
	"price",
	"duration_days",
	"session_count",
	"auto_renew",
	"max_freeze_days_per_year",
	"description",
	"is_active",
]


# ---------------------------------------------------------------------------
# Gym + Brand settings (Single doctypes)
# ---------------------------------------------------------------------------


@frappe.whitelist()
def get_settings() -> dict:
	gym = frappe.get_cached_doc("Gym Settings")
	brand = frappe.get_cached_doc("Brand Settings")
	return {
		"gym": {f: gym.get(f) for f in _GYM_FIELDS},
		"brand": {f: brand.get(f) for f in _BRAND_FIELDS},
	}


def _update_single(doctype: str, allowed: list[str], fields: dict) -> dict:
	doc = frappe.get_doc(doctype)
	for k, v in fields.items():
		if k in allowed:
			doc.set(k, v)
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True}


@frappe.whitelist()
def update_gym_settings(**fields) -> dict:
	return _update_single("Gym Settings", _GYM_FIELDS, fields)


@frappe.whitelist()
def update_brand_settings(**fields) -> dict:
	return _update_single("Brand Settings", _BRAND_FIELDS, fields)


# ---------------------------------------------------------------------------
# Membership Plan CRUD
# ---------------------------------------------------------------------------


@frappe.whitelist()
def list_plans() -> list[dict]:
	rows = frappe.get_all(
		"Membership Plan",
		fields=_PLAN_FIELDS + ["name"],
		order_by="is_active desc, plan_type asc, price asc",
	)
	for r in rows:
		r["price"] = flt(r.price)
		r["is_active"] = int(r.is_active or 0)
		r["auto_renew"] = int(r.auto_renew or 0)
	return rows


@frappe.whitelist()
def create_plan(
	plan_name: str,
	plan_type: str,
	price: float,
	duration_days: int = 30,
	session_count: int = 0,
	billing_frequency: str = "Pre-Pay",
	auto_renew: int | str = 0,
	max_freeze_days_per_year: int = 0,
	description: str | None = None,
) -> dict:
	doc = frappe.get_doc(
		{
			"doctype": "Membership Plan",
			"plan_name": plan_name,
			"plan_type": plan_type,
			"billing_frequency": billing_frequency,
			"price": flt(price),
			"duration_days": int(duration_days or 0),
			"session_count": int(session_count or 0),
			"auto_renew": 1 if str(auto_renew) in ("1", "true", "True") else 0,
			"max_freeze_days_per_year": int(max_freeze_days_per_year or 0),
			"description": description,
			"is_active": 1,
		}
	)
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True, "name": doc.name}


@frappe.whitelist()
def update_plan(name: str, **fields) -> dict:
	doc = frappe.get_doc("Membership Plan", name)
	for k, v in fields.items():
		if k in _PLAN_FIELDS:
			doc.set(k, v)
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True, "name": name}


@frappe.whitelist()
def set_plan_active(name: str, active: int | str) -> dict:
	frappe.db.set_value(
		"Membership Plan",
		name,
		"is_active",
		1 if str(active) in ("1", "true", "True") else 0,
	)
	frappe.db.commit()
	return {"ok": True, "name": name}


# ---------------------------------------------------------------------------
# Integrations status
# ---------------------------------------------------------------------------


@frappe.whitelist()
def integrations_status() -> dict:
	conf = frappe.local.conf

	# eTIMS — reuse the readiness probe.
	try:
		from gym_management.etims import status as etims_status

		etims = etims_status()
	except Exception as e:
		etims = {"ready": False, "reason": str(e)}

	mpesa_keys = ["mpesa_consumer_key", "mpesa_consumer_secret", "mpesa_shortcode"]
	mpesa_configured = all(conf.get(k) for k in mpesa_keys)

	whatsapp_configured = bool(
		conf.get("whatsapp_access_token")
		or frappe.db.exists("Channel Connection", {"channel": "WhatsApp"})
	)

	return {
		"etims": etims,
		"mpesa": {
			"configured": mpesa_configured,
			"env": conf.get("mpesa_env"),
			"shortcode": conf.get("mpesa_shortcode"),
		},
		"whatsapp": {"configured": whatsapp_configured},
	}


# ---------------------------------------------------------------------------
# Staff users
# ---------------------------------------------------------------------------

_SYSTEM_USERS = ("Administrator", "Guest")


@frappe.whitelist()
def list_staff() -> list[dict]:
	users = frappe.get_all(
		"User",
		filters={"name": ["not in", _SYSTEM_USERS], "user_type": "System User"},
		fields=["name", "full_name", "enabled", "last_login"],
		order_by="full_name asc",
	)
	for u in users:
		u["enabled"] = int(u.enabled or 0)
		u["last_login"] = str(u.last_login) if u.last_login else None
		u["roles"] = [
			r.role
			for r in frappe.get_all(
				"Has Role", filters={"parent": u.name}, fields=["role"]
			)
			if r.role not in ("All", "Guest")
		]
	return users


@frappe.whitelist()
def list_roles() -> list[str]:
	rows = frappe.get_all(
		"Role",
		filters={"disabled": 0, "is_custom": 0, "name": ["not in", ("Administrator", "All", "Guest")]},
		fields=["name"],
		order_by="name asc",
	)
	custom = frappe.get_all(
		"Role", filters={"disabled": 0, "is_custom": 1}, fields=["name"]
	)
	return [r.name for r in custom] + [r.name for r in rows]


@frappe.whitelist()
def add_staff(email: str, full_name: str, role: str | None = None) -> dict:
	"""Create a staff (System User) with an optional role. No welcome email is
	sent (dev-safe); the user resets their password to sign in."""
	if frappe.db.exists("User", email):
		frappe.throw(frappe._("A user with this email already exists"))
	parts = (full_name or "").strip().split(" ", 1)
	doc = frappe.get_doc(
		{
			"doctype": "User",
			"email": email,
			"first_name": parts[0] or email,
			"last_name": parts[1] if len(parts) > 1 else "",
			"user_type": "System User",
			"send_welcome_email": 0,
		}
	)
	if role:
		doc.append("roles", {"role": role})
	doc.flags.no_welcome_mail = True
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True, "user": doc.name}
