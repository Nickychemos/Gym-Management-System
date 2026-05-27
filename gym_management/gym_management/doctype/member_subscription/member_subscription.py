# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, today


class MemberSubscription(Document):
	def validate(self):
		self._check_dates()
		self._check_no_overlap()
		self._check_sessions()
		self._compute_sessions_remaining()

	def before_submit(self):
		if self.status not in ("Draft", "Active"):
			frappe.throw(_("Cannot submit a {0} subscription").format(self.status))

	def on_submit(self):
		self.db_set("status", "Active")

	def on_cancel(self):
		self.db_set("status", "Cancelled")
		if not self.cancelled_on:
			self.db_set("cancelled_on", today())

	# ---------- validations ----------

	def _check_dates(self):
		if getdate(self.end_date) <= getdate(self.start_date):
			frappe.throw(_("End Date must be after Start Date"))

	def _check_no_overlap(self):
		overlap = frappe.db.exists(
			"Member Subscription",
			{
				"customer": self.customer,
				"docstatus": 1,
				"status": ["in", ["Active", "Frozen"]],
				"name": ["!=", self.name or ""],
				"start_date": ["<=", self.end_date],
				"end_date": [">=", self.start_date],
			},
		)
		if overlap:
			frappe.throw(
				_(
					"Customer {0} already has an active subscription ({1}) "
					"overlapping this period."
				).format(self.customer, overlap)
			)

	def _check_sessions(self):
		if self.plan_type in ("Class Pack", "PT Package"):
			if not self.sessions_total or self.sessions_total <= 0:
				frappe.throw(
					_(
						"Plan type {0} requires sessions_total > 0. "
						"Set Session Count on the Membership Plan."
					).format(self.plan_type)
				)

	def _compute_sessions_remaining(self):
		self.sessions_remaining = (self.sessions_total or 0) - (self.sessions_used or 0)
