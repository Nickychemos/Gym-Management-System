# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from gym_management.rbac import MANAGER, requires
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime, today


# Status values that count as "the work is done" — triggers the parent
# schedule's last_performed_on update and clears out_of_service.
RESOLVED_STATUSES = ("Resolved", "Closed")


class EquipmentMaintenanceTicket(Document):
	def validate(self):
		self._auto_stamp_resolution()
		self._toggle_out_of_service_on_resolve()

	def on_submit(self):
		"""When ticket is first submitted (typically status=Open), no side-effect.
		Status transitions Open → Resolved happen via amendments or db_set; see
		validate()."""
		pass

	def on_cancel(self):
		self.db_set("status", "Cancelled")

	# ---------- behaviour ----------

	def _auto_stamp_resolution(self):
		"""When status flips into Resolved/Closed and the stamps are blank,
		fill them in."""
		if self.status not in RESOLVED_STATUSES:
			return
		if not self.resolved_at:
			self.resolved_at = now_datetime()
		if not self.resolved_by:
			# Try the assignee; else current user's Employee record; else current user.
			if self.assigned_to:
				self.resolved_by = self.assigned_to
			else:
				emp = frappe.db.get_value(
					"Employee", {"user_id": frappe.session.user}, "name"
				)
				self.resolved_by = emp or frappe.session.user

	def _toggle_out_of_service_on_resolve(self):
		"""When ticket resolves, the asset is back online — clear the flag."""
		if self.status in RESOLVED_STATUSES and self.out_of_service:
			self.out_of_service = 0

	def after_save(self):
		"""After save, if just resolved, bump the linked schedule's
		last_performed_on so the recurrence resets."""
		if self.status not in RESOLVED_STATUSES:
			return
		if not self.linked_schedule:
			return
		try:
			from gym_management.gym_management.doctype.equipment_maintenance_schedule.equipment_maintenance_schedule import (
				mark_performed,
			)

			mark_performed(self.linked_schedule, today())
		except Exception:
			frappe.log_error(
				frappe.get_traceback(),
				f"equipment_maintenance_ticket.after_save: schedule={self.linked_schedule}",
			)


# ============================================================================
# API: quick "mark resolved" used by the reception / maintenance staff UI
# ============================================================================


@frappe.whitelist(allow_guest=False)
@requires(MANAGER)
def mark_resolved(
	ticket: str,
	resolution_notes: str | None = None,
	parts_used: str | None = None,
	cost: float | None = None,
) -> dict:
	"""Resolve a ticket in one call: status=Resolved, stamp timestamps,
	clear out_of_service, and update the linked schedule."""
	doc = frappe.get_doc("Equipment Maintenance Ticket", ticket)
	if doc.docstatus != 1:
		frappe.throw(_("Ticket must be submitted before it can be resolved"))
	if doc.status in RESOLVED_STATUSES:
		return {"ok": False, "reason": "already_resolved"}
	doc.db_set("status", "Resolved")
	doc.db_set("resolved_at", now_datetime())
	if not doc.resolved_by:
		emp = frappe.db.get_value(
			"Employee", {"user_id": frappe.session.user}, "name"
		)
		doc.db_set("resolved_by", emp or frappe.session.user)
	doc.db_set("out_of_service", 0)
	if resolution_notes:
		doc.db_set("resolution_notes", resolution_notes)
	if parts_used:
		doc.db_set("parts_used", parts_used)
	if cost is not None:
		doc.db_set("cost", cost)

	# Bump the schedule
	if doc.linked_schedule:
		try:
			from gym_management.gym_management.doctype.equipment_maintenance_schedule.equipment_maintenance_schedule import (
				mark_performed,
			)

			mark_performed(doc.linked_schedule, today())
		except Exception:
			frappe.log_error(
				frappe.get_traceback(),
				f"mark_resolved: schedule={doc.linked_schedule}",
			)
	return {"ok": True, "resolved_at": str(now_datetime())}
