# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, getdate, today


# Frequency → days mapping for next_due_on computation
FREQUENCY_DAYS = {
	"Daily": 1,
	"Weekly": 7,
	"Bi-Weekly": 14,
	"Monthly": 30,
	"Quarterly": 90,
	"Half-Yearly": 180,
	"Annually": 365,
}


class EquipmentMaintenanceSchedule(Document):
	def validate(self):
		self._compute_next_due_on()

	# ---------- helpers ----------

	def _compute_next_due_on(self):
		"""next_due_on = last_performed_on + frequency_days, or today if never done."""
		days = FREQUENCY_DAYS.get(self.frequency, 30)
		base = getdate(self.last_performed_on) if self.last_performed_on else getdate(today())
		self.next_due_on = add_days(base, days)


# ============================================================================
# Scheduled task: auto-create Equipment Maintenance Tickets when schedules
# come due. Wired in hooks.py once Equipment Maintenance Ticket exists.
# ============================================================================


def create_due_tickets():
	"""Daily: for every active schedule where next_due_on <= today and
	auto_create_ticket=1, create one Equipment Maintenance Ticket (Open,
	preventive) UNLESS one is already open for this schedule.

	The ticket creator (Phase 3 next DocType) is called by name — at this
	commit Equipment Maintenance Ticket doesn't exist yet, so this function
	is a no-op safe-guarded by frappe.db.exists()."""
	if not frappe.db.exists("DocType", "Equipment Maintenance Ticket"):
		return  # Ticket DocType not built yet — silent no-op

	today_date = today()
	due_schedules = frappe.get_all(
		"Equipment Maintenance Schedule",
		filters={
			"is_active": 1,
			"auto_create_ticket": 1,
			"next_due_on": ["<=", today_date],
		},
		fields=[
			"name",
			"schedule_name",
			"asset",
			"branch",
			"task_type",
			"assigned_to",
			"checklist",
			"estimated_duration_minutes",
		],
	)
	for sched in due_schedules:
		# Skip if there's already an open ticket for this schedule
		existing = frappe.db.exists(
			"Equipment Maintenance Ticket",
			{
				"linked_schedule": sched.name,
				"status": ["in", ["Open", "Acknowledged", "In Progress", "Awaiting Parts"]],
			},
		)
		if existing:
			continue
		try:
			doc = frappe.new_doc("Equipment Maintenance Ticket")
			doc.title = f"PM: {sched.schedule_name}"
			doc.asset = sched.asset
			doc.branch = sched.branch
			doc.linked_schedule = sched.name
			doc.ticket_type = "Preventive"
			doc.priority = "Medium"
			doc.description = sched.checklist or f"Scheduled {sched.task_type or 'maintenance'} per schedule {sched.schedule_name}"
			doc.assigned_to = sched.assigned_to
			doc.reported_at = frappe.utils.now_datetime()
			doc.status = "Open"
			doc.insert(ignore_permissions=True)
			doc.submit()
			frappe.db.commit()
		except Exception:
			frappe.log_error(
				frappe.get_traceback(),
				f"create_due_tickets failed: schedule={sched.name}",
			)


# ============================================================================
# Helper used by the ticket resolution flow
# ============================================================================


def mark_performed(schedule_name: str, performed_on: str | None = None):
	"""Called when a maintenance ticket completes — updates last_performed_on
	and recomputes next_due_on on the schedule."""
	performed = getdate(performed_on or today())
	doc = frappe.get_doc("Equipment Maintenance Schedule", schedule_name)
	doc.last_performed_on = performed
	doc._compute_next_due_on()
	doc.save(ignore_permissions=True)
