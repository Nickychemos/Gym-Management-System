# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class TrainerProfile(Document):
	def validate(self):
		self._sanity_check_numbers()
		self._refresh_active_client_count()

	# ---------- validations ----------

	def _sanity_check_numbers(self):
		if self.commission_percent is not None and not (
			0 <= self.commission_percent <= 100
		):
			frappe.throw(_("Commission percent must be between 0 and 100"))
		if self.max_clients is not None and self.max_clients < 0:
			frappe.throw(_("Max Active Clients cannot be negative"))
		if self.pt_hourly_rate is not None and self.pt_hourly_rate < 0:
			frappe.throw(_("PT Hourly Rate cannot be negative"))
		if self.class_rate is not None and self.class_rate < 0:
			frappe.throw(_("Class Rate cannot be negative"))
		if self.years_experience is not None and self.years_experience < 0:
			frappe.throw(_("Years Experience cannot be negative"))

	def _refresh_active_client_count(self):
		"""Count distinct customers with an Active PT Package under this trainer."""
		count = frappe.db.sql(
			"""
			SELECT COUNT(DISTINCT customer)
			FROM `tabPT Package`
			WHERE trainer = %s AND docstatus = 1 AND status = 'Active'
			""",
			(self.employee,),
		)[0][0]
		self.current_active_clients = count or 0


# ============================================================================
# Helper used by Class Schedule / PT Package booking flows
# ============================================================================


def is_accepting_new_clients(employee: str) -> bool:
	"""Returns True if the trainer's profile says they're open to new clients
	AND they're under their max_clients cap."""
	tp = frappe.db.get_value(
		"Trainer Profile",
		employee,
		[
			"accepts_new_clients",
			"max_clients",
			"current_active_clients",
		],
		as_dict=True,
	)
	if not tp:
		# No Trainer Profile yet — assume any Employee can take clients
		return True
	if not tp.accepts_new_clients:
		return False
	if tp.max_clients and (tp.current_active_clients or 0) >= tp.max_clients:
		return False
	return True
