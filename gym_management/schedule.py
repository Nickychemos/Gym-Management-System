"""Class schedule + booking aggregation for the admin frontend.

The schedule page renders a weekly day×time grid of Class Sessions and lets
front-desk staff book members, check them in, and cancel. Class Booking is a
*submittable* DocType with rich logic (capacity → auto-waitlist, grant
resolution from subscription/trial, counter bumps), so the frontend drives it
through these thin wrappers rather than poking at /api/resource directly.

  - week(branch, week_start)        : 7-day grid of sessions with fill levels
  - session_detail(class_session)   : one session + its active bookings
  - book_class(session, customer)   : create + submit a booking (auto-waitlist)
  - cancel_booking(booking, reason)  : cancel a submitted booking
"""

from __future__ import annotations

import frappe
from gym_management.rbac import ANY_STAFF, requires
from frappe.utils import add_days, get_datetime, getdate, today

# Mon..Sun — matches Class Schedule DAY_FIELDS and Python's date.weekday().
DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

_ACTIVE_BOOKING_STATES = ["Booked", "Waitlisted", "Checked-In"]


def _monday_of(date_str: str | None) -> "datetime.date":
	"""The Monday on/before the given date (or today)."""
	d = getdate(date_str) if date_str else getdate(today())
	return add_days(d, -d.weekday())


@frappe.whitelist()
@requires(ANY_STAFF)
def week(branch: str | None = None, week_start: str | None = None) -> dict:
	"""Sessions for the Mon–Sun week containing `week_start` (default: this week).

	Returns:
	    {
	        "week_start": "YYYY-MM-DD", "week_end": "YYYY-MM-DD",
	        "days": [{date, label, weekday}],          # 7 entries, Mon..Sun
	        "sessions": [{name, class_type, color, trainer, start_time,
	                      time_label, day_index, booked, capacity, waitlist,
	                      spots_remaining, status}],
	    }
	"""
	start = _monday_of(week_start)
	end = add_days(start, 6)

	filters = {
		"start_time": ["between", [f"{start} 00:00:00", f"{end} 23:59:59"]],
		"docstatus": 1,
	}
	if branch:
		filters["branch"] = branch

	rows = frappe.get_all(
		"Class Session",
		filters=filters,
		fields=[
			"name",
			"class_type",
			"trainer",
			"start_time",
			"capacity",
			"bookings_count",
			"waitlist_count",
			"spots_remaining",
			"status",
		],
		order_by="start_time asc",
	)

	# Resolve class-type colors and trainer names in two batched lookups.
	type_ids = list({r.class_type for r in rows if r.class_type})
	colors = (
		{
			c.name: c.display_color
			for c in frappe.get_all(
				"Class Type",
				filters={"name": ["in", type_ids]},
				fields=["name", "display_color"],
			)
		}
		if type_ids
		else {}
	)
	trainer_ids = list({r.trainer for r in rows if r.trainer})
	trainers = (
		{
			e.name: e.employee_name
			for e in frappe.get_all(
				"Employee",
				filters={"name": ["in", trainer_ids]},
				fields=["name", "employee_name"],
			)
		}
		if trainer_ids
		else {}
	)

	sessions = []
	for r in rows:
		dt = get_datetime(r.start_time)
		sessions.append(
			{
				"name": r.name,
				"class_type": r.class_type,
				"color": colors.get(r.class_type) or "#5469d4",
				"trainer": trainers.get(r.trainer, r.trainer),
				"start_time": str(r.start_time),
				"time_label": dt.strftime("%H:%M"),
				"day_index": (dt.date() - start).days,
				"booked": int(r.bookings_count or 0),
				"capacity": int(r.capacity or 0),
				"waitlist": int(r.waitlist_count or 0),
				"spots_remaining": int(
					r.spots_remaining
					if r.spots_remaining is not None
					else (r.capacity or 0) - (r.bookings_count or 0)
				),
				"status": r.status,
			}
		)

	days = [
		{
			"date": str(add_days(start, i)),
			"label": DAY_LABELS[i],
			"weekday": i,
		}
		for i in range(7)
	]

	return {
		"week_start": str(start),
		"week_end": str(end),
		"days": days,
		"sessions": sessions,
	}


@frappe.whitelist()
@requires(ANY_STAFF)
def session_detail(class_session: str) -> dict:
	"""One session's header plus its active bookings (for the booking modal)."""
	s = frappe.db.get_value(
		"Class Session",
		class_session,
		[
			"name",
			"class_type",
			"trainer",
			"branch",
			"room",
			"start_time",
			"end_time",
			"capacity",
			"bookings_count",
			"waitlist_count",
			"spots_remaining",
			"status",
		],
		as_dict=True,
	)
	if not s:
		frappe.throw(frappe._("Class Session {0} not found").format(class_session))

	if s.trainer:
		s["trainer_name"] = (
			frappe.db.get_value("Employee", s.trainer, "employee_name") or s.trainer
		)

	booking_rows = frappe.get_all(
		"Class Booking",
		filters={
			"class_session": class_session,
			"docstatus": 1,
			"status": ["in", _ACTIVE_BOOKING_STATES],
		},
		fields=[
			"name",
			"customer",
			"status",
			"waitlist_position",
			"check_in_time",
			"booked_at",
			"payment_required",
		],
		order_by="booked_at asc",
	)
	cust_ids = list({b.customer for b in booking_rows if b.customer})
	cust_names = (
		{
			c.name: c.customer_name
			for c in frappe.get_all(
				"Customer",
				filters={"name": ["in", cust_ids]},
				fields=["name", "customer_name"],
			)
		}
		if cust_ids
		else {}
	)
	bookings = []
	for b in booking_rows:
		bookings.append(
			{
				"name": b.name,
				"customer": b.customer,
				"customer_name": cust_names.get(b.customer, b.customer),
				"status": b.status,
				"waitlist_position": b.waitlist_position,
				"check_in_time": str(b.check_in_time) if b.check_in_time else None,
				"payment_required": int(b.payment_required or 0),
			}
		)

	return {"session": s, "bookings": bookings}


@frappe.whitelist()
@requires(ANY_STAFF)
def book_class(
	class_session: str,
	customer: str,
	payment_required: int | str = 0,
	booking_channel: str = "Reception",
) -> dict:
	"""Create + submit a Class Booking. The controller auto-waitlists when the
	session is full and resolves the access grant (active subscription / trial),
	or treats it as a paid drop-in when payment_required is set.

	Returns {ok, booking, status} where status is "Booked" or "Waitlisted".
	"""
	doc = frappe.new_doc("Class Booking")
	doc.class_session = class_session
	doc.customer = customer
	doc.payment_required = 1 if str(payment_required) in ("1", "True", "true") else 0
	doc.booking_channel = booking_channel
	doc.insert(ignore_permissions=True)
	doc.submit()
	frappe.db.commit()
	return {"ok": True, "booking": doc.name, "status": doc.status}


@frappe.whitelist()
@requires(ANY_STAFF)
def cancel_booking(class_booking: str, reason: str | None = None) -> dict:
	"""Cancel a submitted booking. on_cancel rolls back counters and promotes
	the next waitlisted member."""
	doc = frappe.get_doc("Class Booking", class_booking)
	if reason:
		doc.cancellation_reason = reason
	doc.cancel()
	frappe.db.commit()
	return {"ok": True, "booking": class_booking, "status": doc.status}
