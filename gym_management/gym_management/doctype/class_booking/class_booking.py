# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_to_date, get_datetime, now_datetime, today


class ClassBooking(Document):
	def validate(self):
		self._check_session_state()
		self._check_no_duplicate_booking()
		self._check_access_grant()
		self._auto_waitlist_if_full()

	def before_submit(self):
		self._check_cancellation_window_if_cancelling()

	def on_submit(self):
		from gym_management.gym_management.doctype.class_session.class_session import (
			bump_bookings_count,
			bump_waitlist_count,
		)

		if self.status == "Booked":
			bump_bookings_count(self.class_session, +1)
			self._decrement_session_pack_if_applicable()
		elif self.status == "Waitlisted":
			bump_waitlist_count(self.class_session, +1)
			self._compute_waitlist_position()

	def on_cancel(self):
		from gym_management.gym_management.doctype.class_session.class_session import (
			bump_bookings_count,
			bump_waitlist_count,
		)

		# Roll back the counters this booking incremented
		if self.status == "Booked":
			bump_bookings_count(self.class_session, -1)
			self._restore_session_pack_if_applicable()
			# Try to promote the next Waitlisted booking
			self._promote_next_waitlisted()
		elif self.status == "Waitlisted":
			bump_waitlist_count(self.class_session, -1)

		# Stamp cancellation metadata if user hasn't
		self.db_set("status", "Cancelled")
		if not self.cancelled_at:
			self.db_set("cancelled_at", now_datetime())

	# ---------- validations ----------

	def _check_session_state(self):
		session = frappe.db.get_value(
			"Class Session",
			self.class_session,
			["docstatus", "status", "start_time"],
			as_dict=True,
		)
		if not session:
			frappe.throw(_("Class Session {0} not found").format(self.class_session))
		if session.docstatus != 1:
			frappe.throw(_("Cannot book a Class Session that is not submitted"))
		if session.status in ("Cancelled", "Completed"):
			frappe.throw(
				_("Cannot book a {0} Class Session").format(session.status)
			)

	def _check_no_duplicate_booking(self):
		dup = frappe.db.exists(
			"Class Booking",
			{
				"class_session": self.class_session,
				"customer": self.customer,
				"docstatus": 1,
				"status": ["in", ["Booked", "Waitlisted", "Checked-In"]],
				"name": ["!=", self.name or ""],
			},
		)
		if dup:
			frappe.throw(
				_("Customer {0} already has an active booking ({1}) for this session").format(
					self.customer, dup
				)
			)

	def _check_access_grant(self):
		"""Customer must have either an active subscription / trial pass /
		family-group head's sub, OR mark payment_required=1 for a drop-in fee."""
		if self.payment_required:
			return  # Drop-in payment path — no subscription needed
		if self.linked_subscription or self.linked_trial_pass:
			return  # Caller provided the grant explicitly
		# Auto-resolve a grant
		from gym_management.gym_management.doctype.trial_pass.trial_pass import (
			has_active_trial,
		)

		active_sub = frappe.db.get_value(
			"Member Subscription",
			{
				"customer": self.customer,
				"docstatus": 1,
				"status": "Active",
			},
			"name",
			order_by="end_date desc",
		)
		if active_sub:
			self.linked_subscription = active_sub
			return

		trial = has_active_trial(self.customer)
		if trial:
			self.linked_trial_pass = trial
			return

		frappe.throw(
			_(
				"Customer {0} has no Active subscription or trial pass. "
				"Tick 'Payment Required' to book this as a paid drop-in."
			).format(self.customer)
		)

	def _auto_waitlist_if_full(self):
		"""If the session is full and this booking is still in Draft, flip to
		Waitlisted instead of erroring. Submit goes through; waitlist_position
		is computed in on_submit."""
		if self.docstatus != 0:
			return
		if self.status not in ("Booked", "Waitlisted"):
			return
		from gym_management.gym_management.doctype.class_session.class_session import (
			has_spots,
		)

		if not has_spots(self.class_session):
			self.status = "Waitlisted"

	def _check_cancellation_window_if_cancelling(self):
		"""If the user submits a booking with status=Cancelled directly,
		apply the cancellation-window rule from Gym Settings (member must
		cancel ≥ N hours before class)."""
		if self.status != "Cancelled":
			return
		hours = (
			frappe.db.get_single_value("Gym Settings", "class_cancel_window_hours")
			or 0
		)
		if not hours:
			return
		session_start = frappe.db.get_value(
			"Class Session", self.class_session, "start_time"
		)
		if not session_start:
			return
		cutoff = add_to_date(get_datetime(session_start), hours=-int(hours))
		if now_datetime() > cutoff:
			frappe.throw(
				_(
					"Cancellation window has closed. Members must cancel at "
					"least {0} hours before the class start time."
				).format(hours)
			)

	# ---------- side effects ----------

	def _compute_waitlist_position(self):
		"""Position = number of existing Waitlisted bookings for this session + 1."""
		ahead = frappe.db.count(
			"Class Booking",
			{
				"class_session": self.class_session,
				"docstatus": 1,
				"status": "Waitlisted",
				"booked_at": ["<", self.booked_at or now_datetime()],
				"name": ["!=", self.name],
			},
		)
		self.db_set("waitlist_position", ahead + 1)

	def _decrement_session_pack_if_applicable(self):
		"""For Class Pack subscriptions, increment sessions_used on the linked sub."""
		if not self.linked_subscription:
			return
		sub = frappe.db.get_value(
			"Member Subscription",
			self.linked_subscription,
			["plan_type", "sessions_used", "sessions_total"],
			as_dict=True,
		)
		if not sub or sub.plan_type != "Class Pack":
			return
		new_used = (sub.sessions_used or 0) + 1
		frappe.db.set_value(
			"Member Subscription",
			self.linked_subscription,
			{
				"sessions_used": new_used,
				"sessions_remaining": max(0, (sub.sessions_total or 0) - new_used),
			},
		)

	def _restore_session_pack_if_applicable(self):
		"""Reverse the decrement on cancel."""
		if not self.linked_subscription:
			return
		sub = frappe.db.get_value(
			"Member Subscription",
			self.linked_subscription,
			["plan_type", "sessions_used", "sessions_total"],
			as_dict=True,
		)
		if not sub or sub.plan_type != "Class Pack":
			return
		new_used = max(0, (sub.sessions_used or 0) - 1)
		frappe.db.set_value(
			"Member Subscription",
			self.linked_subscription,
			{
				"sessions_used": new_used,
				"sessions_remaining": max(0, (sub.sessions_total or 0) - new_used),
			},
		)

	def _promote_next_waitlisted(self):
		"""When a Booked spot opens, promote the oldest Waitlisted booking."""
		auto_promote = (
			frappe.db.get_single_value("Gym Settings", "waitlist_auto_promote") or 0
		)
		if not auto_promote:
			return
		next_booking = frappe.db.get_value(
			"Class Booking",
			{
				"class_session": self.class_session,
				"docstatus": 1,
				"status": "Waitlisted",
			},
			"name",
			order_by="waitlist_position asc, booked_at asc",
		)
		if not next_booking:
			return
		from gym_management.gym_management.doctype.class_session.class_session import (
			bump_bookings_count,
			bump_waitlist_count,
		)

		frappe.db.set_value("Class Booking", next_booking, "status", "Booked")
		frappe.db.set_value("Class Booking", next_booking, "waitlist_position", 0)
		bump_bookings_count(self.class_session, +1)
		bump_waitlist_count(self.class_session, -1)


# ============================================================================
# API: mark check-in / no-show via reception UI or class roster
# ============================================================================


@frappe.whitelist(allow_guest=False)
def mark_checked_in(class_booking: str) -> dict:
	doc = frappe.get_doc("Class Booking", class_booking)
	if doc.docstatus != 1 or doc.status not in ("Booked", "Waitlisted"):
		frappe.throw(
			_("Can only check in a Booked or Waitlisted booking (current: {0})").format(
				doc.status
			)
		)
	doc.db_set("status", "Checked-In")
	doc.db_set("check_in_time", now_datetime())
	return {"ok": True, "class_booking": class_booking}


@frappe.whitelist(allow_guest=False)
def mark_no_show(class_booking: str) -> dict:
	"""Apply no-show penalty from Gym Settings and flip status."""
	doc = frappe.get_doc("Class Booking", class_booking)
	if doc.docstatus != 1 or doc.status != "Booked":
		frappe.throw(
			_("Can only mark No-Show on a Booked booking (current: {0})").format(
				doc.status
			)
		)
	fee = frappe.db.get_single_value("Gym Settings", "class_no_show_fee") or 0
	doc.db_set("status", "No-Show")
	doc.db_set("penalty_applied", fee)
	# Releasing the spot — promote waitlist
	from gym_management.gym_management.doctype.class_session.class_session import (
		bump_bookings_count,
	)

	bump_bookings_count(doc.class_session, -1)
	doc._promote_next_waitlisted()
	return {"ok": True, "penalty_applied": fee}
