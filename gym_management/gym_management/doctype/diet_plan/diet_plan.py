# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate


class DietPlan(Document):
	def validate(self):
		self._check_dates()
		self._check_item_meal_slots()

	# ---------- validations ----------

	def _check_dates(self):
		if self.end_date and getdate(self.end_date) < getdate(self.start_date):
			frappe.throw(
				_("End Date ({0}) cannot be before Start Date ({1}).").format(
					self.end_date, self.start_date
				)
			)

	def _check_item_meal_slots(self):
		"""Every Diet Plan Item's meal_slot must match a slot defined in the
		Meals table. Without this rule, items would orphan when meals are renamed."""
		slots = {(m.meal_slot or "").strip() for m in (self.meals or []) if m.meal_slot}
		for row in self.items or []:
			slot = (row.meal_slot or "").strip()
			if not slot:
				continue
			if slot not in slots:
				frappe.throw(
					_(
						"Item '{0}' references meal slot '{1}' which is not defined "
						"in the Meals table. Add a Meals row for it or change the item."
					).format(row.food_name, slot)
				)
