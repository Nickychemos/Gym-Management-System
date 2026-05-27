# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class FamilyGroup(Document):
	def validate(self):
		self._check_head_not_in_members()
		self._check_no_duplicate_members()
		self._compute_member_count()
		self._check_within_max()

	# ---------- validations ----------

	def _check_head_not_in_members(self):
		for row in self.members or []:
			if row.customer == self.head_customer:
				frappe.throw(
					_("Head Customer {0} cannot also appear as a family member row").format(
						self.head_customer
					)
				)

	def _check_no_duplicate_members(self):
		seen = set()
		for row in self.members or []:
			if row.customer in seen:
				frappe.throw(
					_("Customer {0} appears more than once in this family").format(row.customer)
				)
			seen.add(row.customer)

	def _compute_member_count(self):
		active_children = sum(1 for row in (self.members or []) if row.is_active)
		self.current_member_count = active_children + 1  # +1 for the head

	def _check_within_max(self):
		if self.max_members and self.current_member_count > self.max_members:
			frappe.throw(
				_("Family has {0} active members; the plan caps at {1}").format(
					self.current_member_count, self.max_members
				)
			)
