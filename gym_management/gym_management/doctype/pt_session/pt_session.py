# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from gym_management.rbac import ANY_STAFF, requires
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_datetime


# Statuses that count against the PT Package's session balance.
DECREMENTING_STATUSES = ("Completed", "No-Show")


class PTSession(Document):
	def validate(self):
		self._check_package_state()
		self._compute_duration()

	def before_submit(self):
		self._check_package_has_sessions_if_decrementing()

	def on_submit(self):
		if self.status in DECREMENTING_STATUSES and self.decremented_from_package:
			self._bump_package(+1)

	def on_cancel(self):
		# Reverse the decrement only if we previously did one
		if self.status in DECREMENTING_STATUSES and self.decremented_from_package:
			self._bump_package(-1)

	# ---------- validations ----------

	def _check_package_state(self):
		pkg = frappe.db.get_value(
			"PT Package",
			self.pt_package,
			["docstatus", "status"],
			as_dict=True,
		)
		if not pkg:
			frappe.throw(_("PT Package {0} not found").format(self.pt_package))
		if pkg.docstatus != 1:
			frappe.throw(_("PT Package must be submitted before sessions can be logged"))
		# Allow logging against a Completed package only if not decrementing
		# (e.g. logging makeup sessions retroactively). Block Cancelled/Refunded.
		if pkg.status in ("Cancelled", "Refunded", "Expired"):
			frappe.throw(
				_("Cannot log a session against a {0} PT Package").format(pkg.status)
			)

	def _compute_duration(self):
		if self.actual_start_time and self.actual_end_time:
			delta = get_datetime(self.actual_end_time) - get_datetime(
				self.actual_start_time
			)
			self.duration_minutes = int(delta.total_seconds() // 60)
		else:
			self.duration_minutes = 0

	def _check_package_has_sessions_if_decrementing(self):
		"""Block submitting a Completed/No-Show session when the package has
		zero sessions remaining (and we're trying to decrement)."""
		if not self.decremented_from_package:
			return
		if self.status not in DECREMENTING_STATUSES:
			return
		from gym_management.gym_management.doctype.pt_package.pt_package import (
			has_sessions_remaining,
		)

		if not has_sessions_remaining(self.pt_package):
			frappe.throw(
				_(
					"PT Package {0} has no sessions remaining. Either uncheck "
					"'Decrement From Package' (free makeup session) or renew the "
					"package first."
				).format(self.pt_package)
			)

	# ---------- side effects ----------

	def _bump_package(self, delta: int):
		from gym_management.gym_management.doctype.pt_package.pt_package import (
			bump_sessions_used,
		)

		bump_sessions_used(self.pt_package, delta)


# ============================================================================
# Reception / trainer APIs
# ============================================================================


@frappe.whitelist(allow_guest=False)
@requires(ANY_STAFF)
def mark_completed(pt_session: str, actual_start: str | None = None, actual_end: str | None = None) -> dict:
	"""Trainer marks the session completed after it happens. Optionally stamps
	actual_start_time and actual_end_time so duration_minutes computes."""
	doc = frappe.get_doc("PT Session", pt_session)
	if doc.docstatus == 0:
		# Still in draft — set fields then submit
		doc.status = "Completed"
		if actual_start:
			doc.actual_start_time = actual_start
		if actual_end:
			doc.actual_end_time = actual_end
		doc.submit()
		return {"ok": True, "submitted": True}
	if doc.docstatus == 1:
		# Already submitted — can only update via db_set and trigger the bump
		# manually because Submittable docs can't change status via .submit() twice
		previous = doc.status
		if previous in DECREMENTING_STATUSES:
			return {"ok": False, "reason": "already_recorded"}
		doc.db_set("status", "Completed")
		if actual_start:
			doc.db_set("actual_start_time", actual_start)
		if actual_end:
			doc.db_set("actual_end_time", actual_end)
		# If was Scheduled, now we're decrementing
		if doc.decremented_from_package:
			doc._bump_package(+1)
		return {"ok": True, "submitted": False, "status_changed_from": previous}
	frappe.throw(_("Cannot mark a cancelled session as completed"))


@frappe.whitelist(allow_guest=False)
@requires(ANY_STAFF)
def mark_no_show(pt_session: str) -> dict:
	"""Trainer / receptionist marks the member as no-show. Session still counts
	against the package (default policy)."""
	doc = frappe.get_doc("PT Session", pt_session)
	if doc.docstatus == 0:
		doc.status = "No-Show"
		doc.submit()
		return {"ok": True, "submitted": True}
	if doc.docstatus == 1:
		if doc.status in DECREMENTING_STATUSES:
			return {"ok": False, "reason": "already_recorded"}
		doc.db_set("status", "No-Show")
		if doc.decremented_from_package:
			doc._bump_package(+1)
		return {"ok": True, "submitted": False}
	frappe.throw(_("Cannot mark a cancelled session as no-show"))
