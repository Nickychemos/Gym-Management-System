# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate


# Day index used by Python's date.weekday() — Monday is 0, Sunday is 6.
DAY_FIELDS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


class ClassSchedule(Document):
	def validate(self):
		self._require_at_least_one_day()
		self._check_date_range()
		self._sanity_check_numbers()

	# ---------- validations ----------

	def _require_at_least_one_day(self):
		if not any(getattr(self, d) for d in DAY_FIELDS):
			frappe.throw(
				_(
					"At least one day of the week must be ticked. Otherwise the "
					"schedule will never generate any sessions."
				)
			)

	def _check_date_range(self):
		if self.effective_until and getdate(self.effective_until) < getdate(
			self.effective_from
		):
			frappe.throw(_("Effective Until must be on or after Effective From"))

	def _sanity_check_numbers(self):
		if self.duration_minutes is not None and self.duration_minutes <= 0:
			frappe.throw(_("Duration (mins) must be greater than zero"))
		if self.capacity is not None and self.capacity <= 0:
			frappe.throw(_("Capacity must be greater than zero"))

	# ---------- helpers ----------

	def get_active_day_indices(self) -> list[int]:
		"""Returns weekday indices (0=Monday … 6=Sunday) for days the schedule runs."""
		return [i for i, fname in enumerate(DAY_FIELDS) if getattr(self, fname)]

	def covers_date(self, on_date) -> bool:
		"""True if this schedule generates a session on the given date."""
		d = getdate(on_date)
		if not self.is_active:
			return False
		if d < getdate(self.effective_from):
			return False
		if self.effective_until and d > getdate(self.effective_until):
			return False
		return d.weekday() in self.get_active_day_indices()


# ============================================================================
# API used by the session-generator scheduled task (added with Class Session)
# ============================================================================


def get_active_schedules(branch: str | None = None) -> list[dict]:
	"""Returns all currently-active Class Schedules, optionally filtered by branch."""
	filters = {"is_active": 1}
	if branch:
		filters["branch"] = branch
	return frappe.get_all(
		"Class Schedule",
		filters=filters,
		fields=[
			"name",
			"schedule_name",
			"class_type",
			"trainer",
			"branch",
			"room",
			"start_time",
			"duration_minutes",
			"capacity",
			"effective_from",
			"effective_until",
			"auto_generate_days_ahead",
			"mon",
			"tue",
			"wed",
			"thu",
			"fri",
			"sat",
			"sun",
			"substitute_trainer",
		],
	)
