"""Branch management + branch scoping for the gym app.

Branches are ERPNext `Branch` docs (a single `branch` name field), extended here
with custom fields (active flag, phone, address). Staff are scoped to a branch
via the `gym_branch` custom field on User: restricted roles (Receptionist,
Trainer) only ever see their own branch, while owners/managers can switch
between all branches or view an "all branches" aggregate.

The key enforcement point is `resolve_branch_filter()` — every branch-aware
endpoint runs the client's requested branch through it, so the server, not the
UI, decides what a caller may see.
"""

from __future__ import annotations

import frappe
from frappe import _

from gym_management.rbac import MANAGER, has_tier, requires

# Sentinel the frontend sends for the managers' "All branches" view.
ALL_BRANCHES = "__all__"


# ---------------------------------------------------------------------------
# Setup (custom fields) — wired to after_install / after_migrate
# ---------------------------------------------------------------------------


def setup_branch_fields() -> None:
	"""Idempotently create the custom fields branches + staff scoping need."""
	from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

	create_custom_fields(
		{
			"Branch": [
				{
					"fieldname": "gym_is_active",
					"label": "Active",
					"fieldtype": "Check",
					"default": "1",
					"insert_after": "branch",
				},
				{
					"fieldname": "gym_phone",
					"label": "Phone",
					"fieldtype": "Data",
					"insert_after": "gym_is_active",
				},
				{
					"fieldname": "gym_address",
					"label": "Address",
					"fieldtype": "Small Text",
					"insert_after": "gym_phone",
				},
			],
			"User": [
				{
					"fieldname": "gym_branch",
					"label": "Gym Branch",
					"fieldtype": "Link",
					"options": "Branch",
					"insert_after": "user_image",
				},
			],
		},
		ignore_validate=True,
	)
	# Existing branches predate the field; treat them as active.
	frappe.db.sql(
		"UPDATE `tabBranch` SET gym_is_active = 1 WHERE gym_is_active IS NULL"
	)
	frappe.db.commit()


# ---------------------------------------------------------------------------
# Scoping helpers (not whitelisted)
# ---------------------------------------------------------------------------


def _all_branch_names() -> list[str]:
	return frappe.get_all("Branch", pluck="name", order_by="branch asc")


def _active_branch_names() -> list[str]:
	rows = frappe.get_all(
		"Branch", filters={"gym_is_active": 1}, pluck="name", order_by="branch asc"
	)
	# If none are flagged active (fresh field), fall back to all branches.
	return rows or _all_branch_names()


def my_branches() -> list[str]:
	"""Branch names the caller may pick in the switcher.

	Owners/managers oversee every branch (active or not). Restricted staff are
	pinned to their assigned branch, falling back to the first active branch."""
	if has_tier(MANAGER):
		return _all_branch_names()
	pinned = frappe.db.get_value("User", frappe.session.user, "gym_branch")
	if pinned and frappe.db.exists("Branch", pinned):
		return [pinned]
	active = _active_branch_names()
	return active[:1]


def resolve_branch_filter(requested: str | None) -> str | None:
	"""Turn a client-requested branch into the branch to actually filter by.

	Restricted staff are always pinned to their own branch. Owners/managers get
	the branch they asked for (any real branch), or `None` (all) for the All view."""
	if not has_tier(MANAGER):
		pinned = my_branches()
		return pinned[0] if pinned else None
	if not requested or requested == ALL_BRANCHES:
		return None
	return requested if frappe.db.exists("Branch", requested) else None


def customers_in_branch(branch: str | None) -> list[str] | None:
	"""Customers whose member home_branch is `branch`, for scoping doctypes that
	link to a member but carry no branch field (payments, surveys, coaching).

	Returns `None` for no filter (all branches); an empty list when the branch
	has no members (caller should then match nothing)."""
	if not branch:
		return None
	return frappe.get_all(
		"Member Profile", filters={"home_branch": branch}, pluck="customer"
	)


# ---------------------------------------------------------------------------
# Whitelisted: context (any staff) + management (managers/owners)
# ---------------------------------------------------------------------------


@frappe.whitelist()
def branch_context() -> dict:
	"""What the top-bar switcher needs: the branches the caller may use, whether
	they can switch (managers/owners) or are pinned (restricted staff), and the
	default selection. Self-service: available to every signed-in user."""
	can_switch = has_tier(MANAGER)
	allowed = my_branches()
	branches = (
		frappe.get_all(
			"Branch",
			filters={"name": ["in", allowed]},
			fields=["name", "branch", "gym_phone", "gym_address"],
			order_by="branch asc",
		)
		if allowed
		else []
	)
	return {
		"can_switch": can_switch,
		# Whether the gym actually has more than one branch — single-branch gyms
		# hide branch pickers entirely.
		"multi_branch": len(_all_branch_names()) > 1,
		"branches": branches,
		"default": None if can_switch else (allowed[0] if allowed else None),
	}


@frappe.whitelist()
@requires(MANAGER)
def list_branches() -> list[dict]:
	return frappe.get_all(
		"Branch",
		fields=["name", "branch", "gym_phone", "gym_address", "gym_is_active"],
		order_by="branch asc",
	)


@frappe.whitelist()
@requires(MANAGER)
def create_branch(
	branch: str, gym_phone: str | None = None, gym_address: str | None = None
) -> dict:
	name = (branch or "").strip()
	if not name:
		frappe.throw(_("Branch name is required."))
	if frappe.db.exists("Branch", name):
		frappe.throw(_("A branch named {0} already exists.").format(name))
	doc = frappe.get_doc(
		{
			"doctype": "Branch",
			"branch": name,
			"gym_is_active": 1,
			"gym_phone": gym_phone,
			"gym_address": gym_address,
		}
	).insert(ignore_permissions=True)
	frappe.db.commit()
	return {"name": doc.name}


@frappe.whitelist()
@requires(MANAGER)
def update_branch(
	name: str, gym_phone: str | None = None, gym_address: str | None = None
) -> dict:
	doc = frappe.get_doc("Branch", name)
	if gym_phone is not None:
		doc.gym_phone = gym_phone
	if gym_address is not None:
		doc.gym_address = gym_address
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True}


@frappe.whitelist()
@requires(MANAGER)
def set_branch_active(name: str, active: bool = True) -> dict:
	on = str(active).lower() in ("1", "true", "yes")
	frappe.db.set_value("Branch", name, "gym_is_active", 1 if on else 0)
	frappe.db.commit()
	return {"ok": True}


@frappe.whitelist()
@requires(MANAGER)
def set_user_branch(user: str, branch: str | None = None) -> dict:
	"""Assign a staff member to a branch (their pinned scope)."""
	if branch and not frappe.db.exists("Branch", branch):
		frappe.throw(_("Unknown branch."))
	frappe.db.set_value("User", user, "gym_branch", branch or None)
	frappe.db.commit()
	return {"ok": True}
