"""Staff user lifecycle + role-based access for the admin frontend.

Owners/managers invite staff into their gym's site. Frappe owns the auth
plumbing — we reuse it rather than reinvent:

  - invite = create/reuse a System User + assign a gym role, then generate a
    set-password link via `User._reset_password(send_email=False)` (which does
    NOT send mail), rebuilt as a branded SPA link `/gym/accept-invite?key=...`.
    If outgoing email is configured we also send a branded invite email; either
    way we return the link so the UI can offer a "copy invite link" fallback.
  - the invitee sets their password on the SPA accept-invite page, which calls
    Frappe's `update_password(key=...)` — that sets the password AND logs them
    in.

Gym roles are **app-only** (`desk_access=0`): staff use the /gym app, never the
raw Frappe Desk.

Public API:
  current_user, seed_gym_roles, list_staff, list_roles,
  invite_user, resend_invite, set_user_enabled, set_user_role, remove_user
"""

from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import frappe
from frappe import _
from frappe.utils import get_url

GYM_ROLES = ["Gym Owner", "Gym Manager", "Receptionist", "Trainer"]
MANAGER_ROLES = ("System Manager", "Gym Owner", "Gym Manager")
INVITE_ROUTE = "/gym/accept-invite"
_SYSTEM_USERS = ("Administrator", "Guest")
_HIDDEN_ROLES = {"Administrator", "All", "Guest", "Desk User", "Report Manager"}


# ---------------------------------------------------------------------------
# Helpers (not whitelisted)
# ---------------------------------------------------------------------------


def _require_role(*roles: str) -> None:
	"""Light guard: pass if the current user has any of `roles` or is a System
	Manager. Used on sensitive endpoints (full backend RBAC is a later phase)."""
	allowed = set(roles) | {"System Manager"}
	if not (allowed & set(frappe.get_roles())):
		frappe.throw(_("You are not permitted to perform this action"), frappe.PermissionError)


def _is_email_configured() -> bool:
	return bool(
		frappe.db.exists("Email Account", {"default_outgoing": 1, "awaiting_password": 0})
	)


def _extract_key(reset_link: str) -> str | None:
	"""Pull the `key` query param out of a /update-password?key=... link."""
	qs = parse_qs(urlparse(reset_link).query)
	vals = qs.get("key")
	return vals[0] if vals else None


def _generate_invite_link(user_doc) -> str:
	"""Branded SPA set-password link. Isolated as the ONLY place that touches the
	private `_reset_password` — if Frappe changes it, only this helper breaks."""
	reset_link = user_doc._reset_password(send_email=False)
	key = _extract_key(reset_link)
	return f"{get_url(INVITE_ROUTE)}?key={key}"


def _send_invite_email(email: str, full_name: str, invite_link: str) -> bool:
	"""Send a branded invite email. Never let a mail failure break the invite."""
	brand = (
		frappe.db.get_single_value("Brand Settings", "gym_display_name")
		or "Gym Management"
	)
	html = f"""
		<p>Hi {frappe.utils.escape_html(full_name or "there")},</p>
		<p>You've been invited to <b>{frappe.utils.escape_html(brand)}</b>.
		Click below to set your password and sign in:</p>
		<p><a href="{invite_link}"
			style="background:#5469d4;color:#fff;padding:10px 18px;border-radius:6px;
			text-decoration:none;display:inline-block">Set your password</a></p>
		<p>Or paste this link into your browser:<br>
		<a href="{invite_link}">{invite_link}</a></p>
	"""
	try:
		frappe.sendmail(recipients=[email], subject=f"You're invited to {brand}", message=html, now=True)
		return True
	except Exception:
		frappe.log_error(frappe.get_traceback(), "users.invite_email")
		return False


def _assignable_roles() -> list[str]:
	"""Gym roles first, then other assignable, non-system roles."""
	standard = [
		r.name
		for r in frappe.get_all(
			"Role",
			filters={"disabled": 0, "name": ["not in", tuple(_HIDDEN_ROLES)]},
			fields=["name"],
			order_by="name asc",
		)
	]
	gym = [r for r in GYM_ROLES if r in standard]
	rest = [r for r in standard if r not in GYM_ROLES]
	return gym + rest


# ---------------------------------------------------------------------------
# Identity
# ---------------------------------------------------------------------------


@frappe.whitelist()
def current_user() -> dict:
	"""The logged-in user's identity + roles (drives the SPA's role gating)."""
	roles = [r for r in frappe.get_roles() if r not in ("All", "Guest")]
	user = frappe.session.user
	full_name = frappe.db.get_value("User", user, "full_name") or user
	return {
		"user": user,
		"full_name": full_name,
		"roles": roles,
		"is_admin": "System Manager" in roles or user == "Administrator",
	}


# ---------------------------------------------------------------------------
# Roles
# ---------------------------------------------------------------------------


@frappe.whitelist()
def seed_gym_roles() -> dict:
	"""Create the gym roles (app-only: desk_access=0). Idempotent; also wired to
	the after_migrate hook so fresh sites get them automatically."""
	created, existing = [], []
	for name in GYM_ROLES:
		if frappe.db.exists("Role", name):
			existing.append(name)
			continue
		frappe.get_doc(
			{"doctype": "Role", "role_name": name, "desk_access": 0}
		).insert(ignore_permissions=True)
		created.append(name)
	frappe.db.commit()
	return {"created": created, "existing": existing}


@frappe.whitelist()
def list_roles() -> list[str]:
	_require_role(*MANAGER_ROLES)
	return _assignable_roles()


# ---------------------------------------------------------------------------
# Staff list
# ---------------------------------------------------------------------------


@frappe.whitelist()
def list_staff() -> list[dict]:
	_require_role(*MANAGER_ROLES)
	# App-only gym staff are "Website Users" (their roles have desk_access=0), so
	# we do NOT filter by user_type — we list everyone who holds a gym role.
	# (Members are Customers, not Users, so they never appear here.)
	staff_names = {
		r.parent
		for r in frappe.get_all("Has Role", filters={"role": ["in", GYM_ROLES]}, fields=["parent"])
	}
	staff_names |= {
		u.name
		for u in frappe.get_all(
			"User", filters={"user_type": "System User", "name": ["not in", _SYSTEM_USERS]}, fields=["name"]
		)
	}
	staff_names -= set(_SYSTEM_USERS)
	if not staff_names:
		return []
	users = frappe.get_all(
		"User",
		filters={"name": ["in", list(staff_names)]},
		fields=["name", "full_name", "enabled", "last_login"],
		order_by="full_name asc",
	)
	for u in users:
		u["enabled"] = int(u.enabled or 0)
		u["last_login"] = str(u.last_login) if u.last_login else None
		u["pending"] = u.last_login is None
		u["roles"] = [
			r.role
			for r in frappe.get_all("Has Role", filters={"parent": u.name}, fields=["role"])
			if r.role not in ("All", "Guest")
		]
	return users


# ---------------------------------------------------------------------------
# Invite + manage
# ---------------------------------------------------------------------------


@frappe.whitelist()
def invite_user(email: str, full_name: str, role: str) -> dict:
	"""Create or reuse a System User with a role and return a branded set-password
	invite link (always), emailing it too when SMTP is configured."""
	_require_role(*MANAGER_ROLES)
	email = (email or "").strip().lower()
	if not email:
		frappe.throw(_("Email is required"))
	if not role:
		frappe.throw(_("A role is required"))
	if not frappe.db.exists("Role", role):
		frappe.throw(_("Unknown role {0}").format(role))

	if frappe.db.exists("User", email):
		doc = frappe.get_doc("User", email)
		if doc.user_type != "System User":
			doc.user_type = "System User"
		if role not in [r.role for r in doc.roles]:
			doc.append("roles", {"role": role})
		if not doc.enabled:
			doc.enabled = 1
		doc.save(ignore_permissions=True)
	else:
		parts = (full_name or "").strip().split(" ", 1)
		doc = frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": parts[0] or email,
				"last_name": parts[1] if len(parts) > 1 else "",
				"user_type": "System User",
				"send_welcome_email": 0,
				"enabled": 1,
				"roles": [{"role": role}],
			}
		)
		doc.flags.no_welcome_mail = True
		doc.insert(ignore_permissions=True)

	invite_link = _generate_invite_link(doc)
	email_sent = _send_invite_email(email, full_name or doc.full_name, invite_link) if _is_email_configured() else False
	frappe.db.commit()
	return {"ok": True, "user": doc.name, "invite_link": invite_link, "email_sent": email_sent}


@frappe.whitelist()
def resend_invite(email: str) -> dict:
	"""Regenerate the set-password link (invalidates the previous one) + re-email."""
	_require_role(*MANAGER_ROLES)
	doc = frappe.get_doc("User", email)
	invite_link = _generate_invite_link(doc)
	email_sent = _send_invite_email(email, doc.full_name, invite_link) if _is_email_configured() else False
	frappe.db.commit()
	return {"ok": True, "user": doc.name, "invite_link": invite_link, "email_sent": email_sent}


@frappe.whitelist()
def set_user_enabled(email: str, enabled: int | str) -> dict:
	_require_role(*MANAGER_ROLES)
	if email in _SYSTEM_USERS:
		frappe.throw(_("Cannot modify a system user"))
	frappe.db.set_value("User", email, "enabled", 1 if str(enabled) in ("1", "true", "True") else 0)
	frappe.db.commit()
	return {"ok": True, "user": email}


@frappe.whitelist()
def set_user_role(email: str, role: str) -> dict:
	"""Set the user's single gym role (swap out any existing gym role; leave
	non-gym roles like System Manager untouched)."""
	_require_role(*MANAGER_ROLES)
	if email in _SYSTEM_USERS:
		frappe.throw(_("Cannot modify a system user"))
	if not frappe.db.exists("Role", role):
		frappe.throw(_("Unknown role {0}").format(role))
	doc = frappe.get_doc("User", email)
	present_gym = [r.role for r in doc.roles if r.role in GYM_ROLES]
	if present_gym:
		doc.remove_roles(*present_gym)
	doc.add_roles(role)
	frappe.db.commit()
	return {"ok": True, "user": email, "role": role}


@frappe.whitelist()
def remove_user(email: str) -> dict:
	"""Soft-remove = disable (preserves linked docs / audit). Hard delete is risky."""
	_require_role(*MANAGER_ROLES)
	if email == frappe.session.user:
		frappe.throw(_("You cannot remove yourself"))
	if email in _SYSTEM_USERS:
		frappe.throw(_("Cannot remove a system user"))
	frappe.db.set_value("User", email, "enabled", 0)
	frappe.db.commit()
	return {"ok": True, "user": email}
