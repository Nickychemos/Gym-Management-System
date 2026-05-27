# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


# Plan types that support multi-Customer groupings under one paying head.
GROUPABLE_PLAN_TYPES = ("Family", "Corporate")


class FamilyGroup(Document):
	def validate(self):
		self._check_head_not_in_members()
		self._check_no_duplicate_members()
		self._compute_member_count()
		self._check_within_max()
		self._check_plan_compatibility()
		self._check_head_subscription_plan()

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

	def _check_plan_compatibility(self):
		"""If a Membership Plan is attached to this Family Group, its plan_type
		must be one that supports multi-Customer grouping."""
		if not self.membership_plan:
			return
		plan_type = frappe.db.get_value("Membership Plan", self.membership_plan, "plan_type")
		if plan_type not in GROUPABLE_PLAN_TYPES:
			frappe.throw(
				_(
					"Membership Plan {0} is a {1} plan, which does not support family "
					"groups. Use a Family or Corporate plan."
				).format(self.membership_plan, plan_type)
			)

	def _check_head_subscription_plan(self):
		"""If the head Customer already has an active subscription, it must be
		on a groupable plan type. (No-op if head has no active sub yet.)"""
		active_sub = frappe.db.get_value(
			"Member Subscription",
			{
				"customer": self.head_customer,
				"docstatus": 1,
				"status": ["in", ["Active", "Frozen"]],
			},
			["name", "plan_type"],
			as_dict=True,
		)
		if not active_sub:
			return
		if active_sub.plan_type not in GROUPABLE_PLAN_TYPES:
			frappe.throw(
				_(
					"Head Customer {0} has an active {1} subscription ({2}). Family "
					"Groups require the head to be on a Family or Corporate plan. "
					"Cancel the current sub and issue a Family/Corporate one first."
				).format(self.head_customer, active_sub.plan_type, active_sub.name)
			)
