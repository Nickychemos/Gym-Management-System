# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_datetime, now_datetime


class VisitLog(Document):
	def validate(self):
		self._check_out_after_in()
		self._compute_duration()

	# ---------- validations ----------

	def _check_out_after_in(self):
		if not self.check_out_time:
			return
		if get_datetime(self.check_out_time) < get_datetime(self.check_in_time):
			frappe.throw(_("Check-Out Time cannot be earlier than Check-In Time"))

	def _compute_duration(self):
		if not self.check_out_time:
			self.duration_minutes = 0
			return
		delta = get_datetime(self.check_out_time) - get_datetime(self.check_in_time)
		self.duration_minutes = int(delta.total_seconds() // 60)


# ============================================================================
# API used by the access resolver and the reception UI to close a visit
# ============================================================================


def get_open_visit(customer: str) -> str | None:
	"""Returns the most recent submitted Visit Log for the customer that has
	no check_out_time yet (i.e. the member is still inside). Used by Exit
	scans to close the right visit."""
	return frappe.db.get_value(
		"Visit Log",
		{
			"customer": customer,
			"docstatus": 1,
			"check_out_time": ["is", "not set"],
		},
		"name",
		order_by="check_in_time desc",
	)


@frappe.whitelist(allow_guest=False)
def close_visit(visit_log: str, exit_reader: str | None = None) -> dict:
	"""Mark a visit as checked-out. Called by the reception UI or an Exit
	reader. Uses db_set to update fields on a submitted document."""
	doc = frappe.get_doc("Visit Log", visit_log)
	if doc.docstatus != 1:
		frappe.throw(_("Cannot close a Visit Log that is not submitted"))
	if doc.check_out_time:
		return {
			"ok": False,
			"reason": "already_closed",
			"check_out_time": doc.check_out_time,
		}
	now = now_datetime()
	delta = now - get_datetime(doc.check_in_time)
	mins = int(delta.total_seconds() // 60)
	doc.db_set("check_out_time", now)
	doc.db_set("duration_minutes", mins)
	if exit_reader:
		doc.db_set("exit_reader", exit_reader)
	frappe.db.commit()
	return {"ok": True, "duration_minutes": mins, "check_out_time": str(now)}
