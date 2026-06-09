"""Global search (the topbar command palette).

One registry, `SOURCES`, drives everything: each entry knows its doctype query,
the role tier allowed to see it, and how to turn a row into a result
(label / sublabel / route). `global_search` runs every source the caller may
access, branch-scoped, and returns grouped results. Adding a new searchable
entity = one entry here; live DB queries mean new records appear automatically.

Page/route navigation ("go to Settings") is handled on the frontend from its nav
registry, so this module only searches data.
"""

from __future__ import annotations

import frappe

from gym_management.branches import resolve_branch_filter
from gym_management.rbac import ANY_STAFF, MANAGER, has_tier, requires


def _members(like: str, branch: str | None, limit: int) -> list[dict]:
	rows = frappe.get_all(
		"Member Profile",
		filters={"home_branch": branch} if branch else None,
		or_filters=[
			["member_full_name", "like", like],
			["phone", "like", like],
			["email", "like", like],
			["name", "like", like],
		],
		fields=["name", "member_full_name", "phone"],
		order_by="modified desc",
		limit_page_length=limit,
	)
	return [
		{
			"label": r.member_full_name or r.name,
			"sublabel": " · ".join(filter(None, [r.phone, r.name])),
			"route": f"/members/{r.name}",
		}
		for r in rows
	]


def _plans(like: str, branch: str | None, limit: int) -> list[dict]:
	rows = frappe.get_all(
		"Membership Plan",
		or_filters=[["plan_name", "like", like], ["name", "like", like]],
		fields=["name", "plan_name", "plan_type", "price"],
		order_by="modified desc",
		limit_page_length=limit,
	)
	return [
		{
			"label": r.plan_name or r.name,
			"sublabel": " · ".join(
				filter(None, [r.plan_type, f"KSh {int(r.price or 0):,}"])
			),
			"route": "/settings?tab=plans",
		}
		for r in rows
	]


def _classes(like: str, branch: str | None, limit: int) -> list[dict]:
	rows = frappe.get_all(
		"Class Schedule",
		filters={"branch": branch} if branch else None,
		or_filters=[["class_type", "like", like], ["name", "like", like]],
		fields=["name", "class_type", "branch"],
		order_by="modified desc",
		limit_page_length=limit,
	)
	return [
		{
			"label": r.class_type or r.name,
			"sublabel": " · ".join(filter(None, [r.branch, r.name])),
			"route": "/classes",
		}
		for r in rows
	]


def _pt(like: str, branch: str | None, limit: int) -> list[dict]:
	rows = frappe.get_all(
		"PT Package",
		filters={"branch": branch} if branch else None,
		or_filters=[["customer", "like", like], ["name", "like", like]],
		fields=["name", "customer", "sessions_purchased"],
		order_by="modified desc",
		limit_page_length=limit,
	)
	return [
		{
			"label": r.customer or r.name,
			"sublabel": " · ".join(
				filter(None, [f"{int(r.sessions_purchased or 0)} sessions", r.name])
			),
			"route": f"/pt/{r.name}",
		}
		for r in rows
	]


def _equipment(like: str, branch: str | None, limit: int) -> list[dict]:
	rows = frappe.get_all(
		"Asset",
		filters={"location": branch} if branch else None,
		or_filters=[["asset_name", "like", like], ["name", "like", like]],
		fields=["name", "asset_name", "location"],
		order_by="modified desc",
		limit_page_length=limit,
	)
	return [
		{
			"label": r.asset_name or r.name,
			"sublabel": " · ".join(filter(None, [r.location, r.name])),
			"route": f"/equipment/{r.name}",
		}
		for r in rows
	]


def _refunds(like: str, branch: str | None, limit: int) -> list[dict]:
	rows = frappe.get_all(
		"Refund Request",
		filters={"branch": branch} if branch else None,
		or_filters=[["name", "like", like], ["customer", "like", like]],
		fields=["name", "customer", "status"],
		order_by="modified desc",
		limit_page_length=limit,
	)
	return [
		{
			"label": r.name,
			"sublabel": " · ".join(filter(None, [r.customer, r.status])),
			"route": "/refunds",
		}
		for r in rows
	]


# The registry. icon = a key the frontend maps to a lucide icon.
SOURCES = [
	{"key": "members", "label": "Members", "icon": "users", "tier": ANY_STAFF, "fn": _members},
	{"key": "plans", "label": "Plans", "icon": "badge", "tier": ANY_STAFF, "fn": _plans},
	{"key": "classes", "label": "Classes", "icon": "dumbbell", "tier": ANY_STAFF, "fn": _classes},
	{"key": "pt", "label": "PT Packages", "icon": "clipboard", "tier": ANY_STAFF, "fn": _pt},
	{"key": "equipment", "label": "Equipment", "icon": "wrench", "tier": MANAGER, "fn": _equipment},
	{"key": "refunds", "label": "Refunds", "icon": "receipt", "tier": MANAGER, "fn": _refunds},
]


@frappe.whitelist()
@requires(ANY_STAFF)
def global_search(
	query: str, branch: str | None = None, limit: int = 6
) -> dict:
	"""Search every source the caller may access, scoped to the selected branch.

	Returns {"groups": [{"key", "label", "icon", "items": [{label, sublabel,
	route}]}]}. Restricted staff are pinned to their branch by resolve_branch_filter."""
	q = (query or "").strip()
	if len(q) < 2:
		return {"groups": []}
	like = f"%{q}%"
	branch = resolve_branch_filter(branch)
	limit = min(int(limit or 6), 12)

	groups = []
	for src in SOURCES:
		if not has_tier(src["tier"]):
			continue
		try:
			items = src["fn"](like, branch, limit)
		except Exception:
			frappe.log_error(frappe.get_traceback(), f"global_search source {src['key']}")
			items = []
		if items:
			groups.append(
				{
					"key": src["key"],
					"label": src["label"],
					"icon": src["icon"],
					"items": items,
				}
			)
	return {"groups": groups}
