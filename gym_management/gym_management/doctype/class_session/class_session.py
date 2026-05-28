# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

from datetime import datetime, timedelta

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_to_date, get_datetime, getdate, today


class ClassSession(Document):
	def validate(self):
		self._compute_end_time()
		self._compute_spots_remaining()
		self._check_capacity_sanity()

	# ---------- validations ----------

	def _compute_end_time(self):
		if self.start_time and self.duration_minutes:
			self.end_time = add_to_date(
				get_datetime(self.start_time), minutes=int(self.duration_minutes)
			)

	def _compute_spots_remaining(self):
		self.spots_remaining = (self.capacity or 0) - (self.bookings_count or 0)

	def _check_capacity_sanity(self):
		if self.capacity is not None and self.capacity <= 0:
			frappe.throw(_("Capacity must be greater than zero"))
		if (self.bookings_count or 0) > (self.capacity or 0):
			frappe.throw(
				_("Bookings ({0}) exceed capacity ({1})").format(
					self.bookings_count, self.capacity
				)
			)


# ============================================================================
# Daily scheduled task: generate Class Sessions from active Class Schedules
# ============================================================================


def generate_sessions():
	"""Daily: for every active Class Schedule, ensure Class Session rows exist
	for the next `auto_generate_days_ahead` days.

	Idempotent — re-running on the same day is a no-op for already-existing
	sessions (deduped on class_schedule + start_time)."""
	from gym_management.gym_management.doctype.class_schedule.class_schedule import (
		DAY_FIELDS,
		get_active_schedules,
	)

	today_date = getdate(today())
	created = 0
	skipped = 0

	for sched in get_active_schedules():
		days_ahead = int(sched.get("auto_generate_days_ahead") or 14)
		effective_from = getdate(sched.get("effective_from"))
		effective_until = (
			getdate(sched.get("effective_until")) if sched.get("effective_until") else None
		)

		# Range: max(today, effective_from)  ..  today + days_ahead  (capped by effective_until)
		range_start = max(today_date, effective_from)
		range_end = today_date + timedelta(days=days_ahead)
		if effective_until and range_end > effective_until:
			range_end = effective_until

		active_weekdays = {
			i for i, fname in enumerate(DAY_FIELDS) if sched.get(fname)
		}
		if not active_weekdays:
			continue

		# Iterate day-by-day
		d = range_start
		while d <= range_end:
			if d.weekday() in active_weekdays:
				start_dt = _combine_date_and_time(d, sched.get("start_time"))
				if not _session_exists(sched["name"], start_dt):
					try:
						_create_session(sched, start_dt)
						created += 1
					except Exception:
						frappe.log_error(
							frappe.get_traceback(),
							f"generate_sessions failed: schedule={sched['name']} at={start_dt}",
						)
				else:
					skipped += 1
			d += timedelta(days=1)

	if created or skipped:
		frappe.logger().info(
			f"class_session.generate_sessions: created={created}, skipped={skipped}"
		)


def _combine_date_and_time(d, t) -> datetime:
	"""Combine a date and a Frappe Time field value into a datetime.
	Frappe Time fields come back as datetime.timedelta or string."""
	if isinstance(t, timedelta):
		seconds = int(t.total_seconds())
		hours, rem = divmod(seconds, 3600)
		minutes, secs = divmod(rem, 60)
		return datetime(d.year, d.month, d.day, hours, minutes, secs)
	if isinstance(t, str):
		# "06:00:00" or "06:00"
		parts = t.split(":")
		hours = int(parts[0])
		minutes = int(parts[1]) if len(parts) > 1 else 0
		secs = int(parts[2]) if len(parts) > 2 else 0
		return datetime(d.year, d.month, d.day, hours, minutes, secs)
	# datetime.time fallback
	return datetime(d.year, d.month, d.day, t.hour, t.minute, t.second)


def _session_exists(schedule_name: str, start_dt: datetime) -> bool:
	return bool(
		frappe.db.exists(
			"Class Session",
			{"class_schedule": schedule_name, "start_time": start_dt},
		)
	)


def _create_session(sched: dict, start_dt: datetime):
	doc = frappe.new_doc("Class Session")
	doc.class_schedule = sched["name"]
	doc.class_type = sched["class_type"]
	doc.trainer = sched["trainer"]
	doc.branch = sched["branch"]
	doc.room = sched.get("room")
	doc.start_time = start_dt
	doc.duration_minutes = sched["duration_minutes"]
	doc.capacity = sched["capacity"]
	doc.bookings_count = 0
	doc.waitlist_count = 0
	doc.status = "Scheduled"
	doc.insert(ignore_permissions=True)
	doc.submit()  # Auto-submit so sessions are immediately bookable


# ============================================================================
# Helpers used by Class Booking (next DocType)
# ============================================================================


def has_spots(class_session_name: str) -> bool:
	"""True if the session has at least one open spot."""
	row = frappe.db.get_value(
		"Class Session",
		class_session_name,
		["capacity", "bookings_count", "status"],
		as_dict=True,
	)
	if not row:
		return False
	if row.status in ("Cancelled", "Completed"):
		return False
	return (row.bookings_count or 0) < (row.capacity or 0)


def bump_bookings_count(class_session_name: str, delta: int = 1):
	"""Atomically adjust bookings_count and spots_remaining on a submitted
	Class Session. Used by Class Booking on_submit / on_cancel."""
	row = frappe.db.get_value(
		"Class Session",
		class_session_name,
		["capacity", "bookings_count"],
		as_dict=True,
	)
	if not row:
		return
	new_count = max(0, (row.bookings_count or 0) + delta)
	frappe.db.set_value(
		"Class Session",
		class_session_name,
		{
			"bookings_count": new_count,
			"spots_remaining": max(0, (row.capacity or 0) - new_count),
		},
	)


def bump_waitlist_count(class_session_name: str, delta: int = 1):
	row = frappe.db.get_value(
		"Class Session", class_session_name, ["waitlist_count"], as_dict=True
	)
	if not row:
		return
	frappe.db.set_value(
		"Class Session",
		class_session_name,
		"waitlist_count",
		max(0, (row.waitlist_count or 0) + delta),
	)
