"""In-app notifications for staff, delivered in real time over Frappe socketio.

A `Gym Notification` row is created per recipient (so read-state is per-user) and
`frappe.publish_realtime("gym_notification", ...)` pushes it live to that user's
browser. Recipients are resolved by role tier + branch: managers/owners get
everything, restricted staff only their own branch.

Event sources are wired in hooks.py (doc_events + a daily scheduler job).
The whitelisted list/unread/mark-read methods are self-service (own rows only).
"""

from __future__ import annotations

import frappe
from frappe.utils import add_days, flt, getdate, today

from gym_management.rbac import MANAGER

# Roles that oversee every branch (so they receive branch events regardless of
# their own gym_branch assignment).
_ALL_BRANCH_ROLES = set(MANAGER) | {"System Manager", "Administrator"}


def _recipients(tier: frozenset, branch: str | None) -> list[str]:
	"""Staff users in `tier` who should see an event for `branch`.

	Managers/owners see all branches; restricted staff only when their
	gym_branch matches. Administrator/Guest are excluded."""
	# "Has Role" is a child table used by Reports/Pages too, so restrict to Users.
	role_users = set(
		frappe.get_all(
			"Has Role",
			filters={"role": ["in", list(tier)], "parenttype": "User"},
			pluck="parent",
		)
	)
	role_users.discard("Guest")
	if not role_users:
		return []
	enabled = frappe.get_all(
		"User",
		filters={"name": ["in", list(role_users)], "enabled": 1},
		pluck="name",
	)
	out = []
	for u in enabled:
		u_roles = set(frappe.get_roles(u))
		if u_roles & _ALL_BRANCH_ROLES:
			out.append(u)
		elif not branch or frappe.db.get_value("User", u, "gym_branch") == branch:
			out.append(u)
	return out


def notify(
	tier: frozenset,
	title: str,
	body: str | None = None,
	kind: str = "info",
	link: str | None = None,
	branch: str | None = None,
	source_doctype: str | None = None,
	source_name: str | None = None,
) -> None:
	"""Create a notification per recipient and push it live. Safe to call from a
	doc event: the rows commit with the surrounding transaction and the realtime
	push fires after commit."""
	for user in _recipients(tier, branch):
		doc = frappe.get_doc(
			{
				"doctype": "Gym Notification",
				"recipient": user,
				"title": title,
				"body": body,
				"kind": kind,
				"link": link,
				"branch": branch,
				"source_doctype": source_doctype,
				"source_name": source_name,
			}
		).insert(ignore_permissions=True)
		frappe.publish_realtime(
			"gym_notification",
			{
				"name": doc.name,
				"title": title,
				"body": body,
				"kind": kind,
				"link": link,
				"creation": str(doc.creation),
			},
			user=user,
		)


# ---------------------------------------------------------------------------
# Event handlers (wired in hooks.doc_events)
# ---------------------------------------------------------------------------


def on_new_member(doc, method=None):
	from gym_management.rbac import FRONTDESK

	notify(
		FRONTDESK,
		title=f"New member: {doc.member_full_name or doc.name}",
		body=doc.phone,
		kind="info",
		link=f"/members/{doc.name}",
		branch=doc.home_branch,
		source_doctype="Member Profile",
		source_name=doc.name,
	)


def on_refund_request(doc, method=None):
	notify(
		MANAGER,
		title=f"Refund requested: {doc.name}",
		body=f"{doc.customer} · KSh {flt(getattr(doc, 'original_amount_paid', 0)):,.0f}",
		kind="warning",
		link="/refunds",
		branch=getattr(doc, "branch", None),
		source_doctype="Refund Request",
		source_name=doc.name,
	)


def on_equipment_ticket(doc, method=None):
	notify(
		MANAGER,
		title=f"Equipment issue: {getattr(doc, 'title', doc.name)}",
		body=getattr(doc, "priority", None),
		kind="danger" if getattr(doc, "priority", "") == "Critical" else "warning",
		link="/equipment",
		branch=getattr(doc, "branch", None),
		source_doctype="Equipment Maintenance Ticket",
		source_name=doc.name,
	)


# ---------------------------------------------------------------------------
# Daily digest (wired in hooks.scheduler_events daily)
# ---------------------------------------------------------------------------


def daily_digest():
	"""One summary notification per branch for renewals due this week, plus a
	compliance-expiring summary for managers. Summaries (not one-per-record) so
	staff are not spammed every day."""
	from gym_management.rbac import FRONTDESK

	week = add_days(getdate(today()), 7)
	# Renewals due, grouped by branch.
	due = frappe.get_all(
		"Member Subscription",
		filters={
			"docstatus": 1,
			"status": ["in", ["Active", "Frozen"]],
			"end_date": ["between", [today(), week]],
		},
		fields=["branch", "count(name) as n"],
		group_by="branch",
	)
	for row in due:
		if not row.n:
			continue
		notify(
			FRONTDESK,
			title=f"{row.n} renewal(s) due this week",
			body="Memberships ending in the next 7 days.",
			kind="warning",
			link="/members?status=Expiring",
			branch=row.branch,
			source_doctype="Member Subscription",
		)

	expiring = frappe.db.count(
		"Compliance Item", {"status": ["in", ["Expiring Soon", "Expired"]]}
	)
	if expiring:
		notify(
			MANAGER,
			title=f"{expiring} compliance item(s) need attention",
			body="Some certifications or permits are expiring or expired.",
			kind="warning",
			link="/compliance",
			source_doctype="Compliance Item",
		)
	frappe.db.commit()


# ---------------------------------------------------------------------------
# Self-service API (own notifications only)
# ---------------------------------------------------------------------------


@frappe.whitelist()
def list_notifications(limit: int = 20) -> list[dict]:
	rows = frappe.get_all(
		"Gym Notification",
		filters={"recipient": frappe.session.user},
		fields=["name", "title", "body", "kind", "link", "is_read", "creation"],
		order_by="creation desc",
		limit_page_length=int(limit),
	)
	for r in rows:
		r["creation"] = str(r["creation"])
	return rows


@frappe.whitelist()
def unread_count() -> int:
	return frappe.db.count(
		"Gym Notification", {"recipient": frappe.session.user, "is_read": 0}
	)


@frappe.whitelist()
def mark_read(name: str) -> dict:
	if frappe.db.get_value("Gym Notification", name, "recipient") == frappe.session.user:
		frappe.db.set_value("Gym Notification", name, "is_read", 1)
		frappe.db.commit()
	return {"ok": True}


@frappe.whitelist()
def mark_all_read() -> dict:
	frappe.db.sql(
		"UPDATE `tabGym Notification` SET is_read = 1 WHERE recipient = %s AND is_read = 0",
		frappe.session.user,
	)
	frappe.db.commit()
	return {"ok": True}
