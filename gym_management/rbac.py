"""Role-based access control for the gym admin API.

Every `@frappe.whitelist()` method the /gym SPA calls is the REAL enforcement
boundary: gym roles have `desk_access=0`, so they cannot reach Frappe Desk or
the generic REST API — their only path to data is these methods. This module
centralizes the capability matrix as *tiers* (each tier = a set of allowed
roles) and enforces them with the `@requires(TIER)` decorator.

Usage (decorator goes BELOW @frappe.whitelist() so Frappe registers the wrapper
and still binds kwargs against the preserved signature):

    @frappe.whitelist()
    @requires(MANAGER)
    def create_plan(plan_name, price, ...): ...

⚠️ Keep in sync with frontend/src/lib/roles.ts — if you change who can do what
here, update the nav allow-lists there (and vice-versa).
"""

from __future__ import annotations

import functools

import frappe
from frappe import _

# --- Role names ---
SYSTEM = "System Manager"
OWNER_ROLE = "Gym Owner"
MANAGER_ROLE = "Gym Manager"
RECEPTIONIST_ROLE = "Receptionist"
TRAINER_ROLE = "Trainer"

# Canonical lists (relocated here; re-exported by users.py for back-compat).
GYM_ROLES = [OWNER_ROLE, MANAGER_ROLE, RECEPTIONIST_ROLE, TRAINER_ROLE]
MANAGER_ROLES = (SYSTEM, OWNER_ROLE, MANAGER_ROLE)

# --- Tiers: each expands to the set of allowed roles. System Manager is always
#     included; higher privilege tiers are supersets of lower ones. Receptionist
#     and Trainer are siblings (neither contains the other) — methods open to
#     both use ANY_STAFF. ---
ADMIN = frozenset({SYSTEM})
OWNER = frozenset({SYSTEM, OWNER_ROLE})
MANAGER = frozenset({SYSTEM, OWNER_ROLE, MANAGER_ROLE})
FRONTDESK = frozenset({SYSTEM, OWNER_ROLE, MANAGER_ROLE, RECEPTIONIST_ROLE})
TRAINER = frozenset({SYSTEM, OWNER_ROLE, MANAGER_ROLE, TRAINER_ROLE})
ANY_STAFF = frozenset(
    {SYSTEM, OWNER_ROLE, MANAGER_ROLE, RECEPTIONIST_ROLE, TRAINER_ROLE}
)


def _is_system_context() -> bool:
    """Background jobs, installs and migrations run without a real session role —
    never block them (a guarded method may be called server-side)."""
    flags = frappe.flags
    if (
        flags.get("in_scheduler")
        or flags.get("in_migrate")
        or flags.get("in_install")
        or flags.get("in_patch")
    ):
        return True
    return frappe.session.user == "Administrator"


def has_tier(tier: frozenset) -> bool:
    """Whether the current user satisfies `tier`."""
    if _is_system_context():
        return True
    return bool(set(tier) & set(frappe.get_roles()))


def require(tier: frozenset) -> None:
    """Raise PermissionError unless the current user satisfies `tier`."""
    if not has_tier(tier):
        frappe.throw(
            _("You are not permitted to perform this action"), frappe.PermissionError
        )


def requires(tier: frozenset):
    """Decorator enforcing `tier`. Place it directly BELOW `@frappe.whitelist()`.

    `functools.wraps` preserves the wrapped function's signature so Frappe's
    argspec introspection still filters form_dict down to the real kwargs. The
    `__rbac_tier__` marker lets the coverage test assert every method is guarded.
    """

    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            require(tier)
            return fn(*args, **kwargs)

        wrapper.__rbac_tier__ = tier
        return wrapper

    return decorator


def _require_role(*roles: str) -> None:
    """Back-compat shim for pre-RBAC call sites (users/settings/refund_request).

    Equivalent to requiring a tier of the given roles plus System Manager."""
    require(frozenset(roles) | {SYSTEM})


# ---------------------------------------------------------------------------
# Layer 2 — DocType permissions
#
# Gym roles have NO DocType permissions by default, so methods that do ORM
# operations not fully bypassed by ignore_permissions (e.g. frappe.get_doc +
# .save) get a Frappe PermissionError for those roles even after the method
# guard passes. These rows let the roles actually execute their methods, and
# double as defense-in-depth if Desk/REST is ever opened to staff.
#
# System Manager already has full access via each DocType's JSON. Here we add
# rows for the four gym roles: Owner + Manager get full access to every app
# DocType; Receptionist and Trainer get the scoped clusters below.
# ---------------------------------------------------------------------------

_FULL = (
    "read", "write", "create", "delete",
    "submit", "cancel", "amend",
    "print", "email", "report", "share",
)
_SUBMIT_PTYPES = {"submit", "cancel", "amend"}

# Receptionist — front desk: members, bookings, take payments, raise refunds.
RECEPTIONIST_DOCTYPES = {
    "Member Profile": ("read", "write", "create"),
    "Member Subscription": ("read", "write", "create"),
    "Subscription Freeze": ("read", "write", "create"),
    "Visit Log": ("read", "write", "create"),
    "Member Request": ("read", "write", "create"),
    "Member Credential": ("read", "write", "create"),
    "Family Group": ("read", "write", "create"),
    "Trial Pass": ("read", "write", "create"),
    "Body Measurement": ("read",),
    "Class Type": ("read",),
    "Class Schedule": ("read",),
    "Class Session": ("read",),
    "Class Booking": ("read", "write", "create"),
    "PT Package": ("read", "write", "create"),
    "PT Session": ("read", "write", "create"),
    "Trainer Profile": ("read",),
    "Membership Plan": ("read",),
    "Brand Settings": ("read",),
    "Gym Settings": ("read",),
    "M-Pesa Transaction": ("read", "write", "create"),
    "Cash Drawer Session": ("read", "write", "create"),
    "Refund Request": ("read", "write", "create"),
}

# Trainer — coaching: diet/training plans, notes, measurements + read context.
TRAINER_DOCTYPES = {
    "Member Profile": ("read",),
    "Body Measurement": ("read", "write", "create"),
    "Class Type": ("read",),
    "Class Schedule": ("read",),
    "Class Session": ("read",),
    "Class Booking": ("read", "write", "create"),
    "PT Package": ("read",),
    "PT Session": ("read", "write", "create"),
    "Trainer Profile": ("read",),
    "Diet Plan": ("read", "write", "create"),
    "Training Prescription": ("read", "write", "create"),
    "Coaching Note": ("read", "write", "create"),
    "Membership Plan": ("read",),
    "Brand Settings": ("read",),
    "Gym Settings": ("read",),
}


def _grant(doctype: str, role: str, ptypes, submittable: set) -> None:
    from frappe.permissions import add_permission, update_permission_property

    add_permission(doctype, role, 0)  # idempotent: no-op if the row exists
    valid = set(ptypes)
    # create/write on a submittable doctype implies submit + cancel.
    if doctype in submittable and ("create" in valid or "write" in valid):
        valid |= {"submit", "cancel"}
    # submit/cancel/amend only exist on submittable doctypes.
    if doctype not in submittable:
        valid -= _SUBMIT_PTYPES
    for ptype in valid:
        update_permission_property(doctype, role, 0, ptype, 1, validate=False)


def seed_doctype_permissions() -> dict:
    """Grant the four gym roles their DocType permissions (Layer 2). Idempotent;
    wired to after_install/after_migrate so fresh sites and migrations get them."""
    app_doctypes = frappe.get_all(
        "DocType",
        filters={"module": "Gym Management", "istable": 0},
        fields=["name", "is_submittable"],
    )
    submittable = {d.name for d in app_doctypes if d.is_submittable}

    # Owner + Manager: full access to every app DocType.
    for d in app_doctypes:
        for role in (OWNER_ROLE, MANAGER_ROLE):
            _grant(d.name, role, _FULL, submittable)

    # Receptionist + Trainer: scoped clusters.
    for role, mapping in (
        (RECEPTIONIST_ROLE, RECEPTIONIST_DOCTYPES),
        (TRAINER_ROLE, TRAINER_DOCTYPES),
    ):
        for doctype, ptypes in mapping.items():
            _grant(doctype, role, ptypes, submittable)

    frappe.clear_cache()
    frappe.db.commit()
    return {
        "app_doctypes": len(app_doctypes),
        "receptionist_doctypes": len(RECEPTIONIST_DOCTYPES),
        "trainer_doctypes": len(TRAINER_DOCTYPES),
    }
