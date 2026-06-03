# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from gym_management.rbac import FRONTDESK, MANAGER, requires
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, now_datetime


# Statuses where the refund has been authorised to disburse
APPROVED_STATUSES = ("Approved", "Refund Initiated", "Refunded")

# Terminal statuses — no further transitions
TERMINAL_STATUSES = ("Refunded", "Rejected", "Failed")


class RefundRequest(Document):
	def validate(self):
		self._check_source_link_matches_type()
		self._check_amounts()
		self._check_method_specific_fields()

	def before_submit(self):
		if self.status == "Draft":
			frappe.throw(
				_(
					"Cannot submit a Draft refund. Move it through the approval "
					"workflow first (submit_for_approval → approve_as_manager → "
					"approve_as_owner)."
				)
			)

	def on_submit(self):
		# Submitted means the workflow has reached an approval-or-better state.
		# If status is "Approved" we haven't disbursed yet; the cash-out is
		# done separately via initiate_refund().
		pass

	def on_cancel(self):
		# Cancelling a submitted refund — rare; only allowed on Approved/Initiated
		# states (not on already-Refunded ones because the money has moved).
		if self.status == "Refunded":
			frappe.throw(
				_(
					"Cannot cancel a Refunded refund — the money has been "
					"disbursed. Create a reversal entry instead."
				)
			)
		self.db_set("status", "Failed")

	# ---------- validations ----------

	def _check_source_link_matches_type(self):
		"""source_type must align with which linked_* field is set."""
		mapping = {
			"Subscription": "linked_subscription",
			"PT Package": "linked_pt_package",
			"Class Booking": "linked_class_booking",
		}
		required_field = mapping.get(self.source_type)
		if required_field and not self.get(required_field):
			frappe.throw(
				_("Source type {0} requires the {1} field to be set").format(
					self.source_type, required_field.replace("_", " ").title()
				)
			)

	def _check_amounts(self):
		if flt(self.original_amount_paid) <= 0:
			frappe.throw(_("Original Amount Paid must be greater than zero"))
		if flt(self.requested_refund_amount) <= 0:
			frappe.throw(_("Requested Refund Amount must be greater than zero"))
		if flt(self.requested_refund_amount) > flt(self.original_amount_paid):
			frappe.throw(
				_(
					"Requested Refund Amount ({0}) cannot exceed Original Amount Paid ({1})"
				).format(self.requested_refund_amount, self.original_amount_paid)
			)

	def _check_method_specific_fields(self):
		if self.refund_method == "M-Pesa B2C" and not self.refund_account_phone:
			frappe.throw(_("M-Pesa B2C refunds require Refund Phone Number"))
		if self.refund_method == "Bank Transfer" and not (self.bank_details or "").strip():
			frappe.throw(_("Bank Transfer refunds require Bank Details"))


# ============================================================================
# Approval workflow APIs
# ============================================================================
#
# We model the approval flow as explicit state-transition functions rather
# than relying on Frappe's Workflow DocType for v1. The Workflow DocType can
# be layered on top later for visual UI buttons, but the rules below are the
# source of truth.
#
# Flow when Gym Settings.require_dual_control_for_refunds = 1 (default):
#   Draft → submit_for_approval → Pending Manager → approve_as_manager →
#   Pending Owner → approve_as_owner → Approved → initiate_refund → Refund
#   Initiated → mark_refund_completed → Refunded
#
# Flow when require_dual_control_for_refunds = 0:
#   Draft → submit_for_approval → Pending Manager → approve_as_manager →
#   Approved → initiate_refund → Refund Initiated → mark_refund_completed →
#   Refunded
#
# Rejection can happen at Pending Manager OR Pending Owner.
# ============================================================================


@frappe.whitelist(allow_guest=False)
@requires(FRONTDESK)
def submit_for_approval(refund_request: str) -> dict:
	"""Receptionist / requester moves Draft → Pending Manager."""
	doc = frappe.get_doc("Refund Request", refund_request)
	if doc.status != "Draft":
		frappe.throw(_("Can only submit a Draft refund for approval (current: {0})").format(doc.status))
	doc.db_set("status", "Pending Manager")
	return {"ok": True, "new_status": "Pending Manager"}


@frappe.whitelist(allow_guest=False)
def approve_as_manager(refund_request: str) -> dict:
	"""Manager-level approval. Next state depends on dual-control setting."""
	from gym_management.users import MANAGER_ROLES, _require_role

	_require_role(*MANAGER_ROLES)
	doc = frappe.get_doc("Refund Request", refund_request)
	if doc.status != "Pending Manager":
		frappe.throw(
			_("Can only manager-approve a Pending Manager refund (current: {0})").format(doc.status)
		)
	dual = (
		frappe.db.get_single_value("Gym Settings", "require_dual_control_for_refunds") or 0
	)
	if dual:
		doc.db_set("status", "Pending Owner")
		return {"ok": True, "new_status": "Pending Owner"}
	# Single-control — manager approval finalises
	doc.db_set("status", "Approved")
	doc.db_set("approved_by", frappe.session.user)
	doc.db_set("approved_on", now_datetime())
	return {"ok": True, "new_status": "Approved"}


@frappe.whitelist(allow_guest=False)
def approve_as_owner(refund_request: str) -> dict:
	"""Owner-level second approval (only used when dual control is on)."""
	from gym_management.users import _require_role

	_require_role("System Manager", "Gym Owner")
	doc = frappe.get_doc("Refund Request", refund_request)
	if doc.status != "Pending Owner":
		frappe.throw(
			_("Can only owner-approve a Pending Owner refund (current: {0})").format(doc.status)
		)
	doc.db_set("status", "Approved")
	doc.db_set("approved_by", frappe.session.user)
	doc.db_set("approved_on", now_datetime())
	return {"ok": True, "new_status": "Approved"}


@frappe.whitelist(allow_guest=False)
def reject(refund_request: str, reason: str) -> dict:
	"""Reject from any Pending state."""
	from gym_management.users import MANAGER_ROLES, _require_role

	_require_role(*MANAGER_ROLES)
	doc = frappe.get_doc("Refund Request", refund_request)
	if doc.status not in ("Pending Manager", "Pending Owner"):
		frappe.throw(
			_("Can only reject a Pending refund (current: {0})").format(doc.status)
		)
	if not (reason or "").strip():
		frappe.throw(_("Rejection reason is required"))
	doc.db_set("status", "Rejected")
	doc.db_set("rejection_reason", reason)
	return {"ok": True, "new_status": "Rejected"}


@frappe.whitelist(allow_guest=False)
@requires(MANAGER)
def initiate_refund(refund_request: str) -> dict:
	"""Approved → Refund Initiated.

	For M-Pesa B2C refunds, this is where mpesa_client.b2c_payment() will
	be called once Phase 4's mpesa_client.py is built. For Cash refunds,
	the receptionist physically hands cash to the member and clicks this
	to flip status. For other methods, the linked_payment_entry should be
	created externally."""
	doc = frappe.get_doc("Refund Request", refund_request)
	if doc.status != "Approved":
		frappe.throw(_("Can only initiate an Approved refund (current: {0})").format(doc.status))
	doc.db_set("status", "Refund Initiated")
	doc.db_set("refund_initiated_on", now_datetime())
	# TODO Phase 4 polish: if refund_method == 'M-Pesa B2C', call mpesa_client.b2c_payment()
	return {"ok": True, "new_status": "Refund Initiated"}


@frappe.whitelist(allow_guest=False)
@requires(MANAGER)
def mark_refund_completed(
	refund_request: str,
	payment_entry: str | None = None,
	mpesa_transaction: str | None = None,
) -> dict:
	"""Refund Initiated → Refunded — when the cash has actually moved.
	Called by the M-Pesa B2C callback handler (success path) OR manually by
	a receptionist after handing over cash."""
	doc = frappe.get_doc("Refund Request", refund_request)
	if doc.status != "Refund Initiated":
		frappe.throw(
			_("Can only complete a Refund Initiated refund (current: {0})").format(doc.status)
		)
	doc.db_set("status", "Refunded")
	doc.db_set("refund_completed_on", now_datetime())
	if payment_entry:
		doc.db_set("linked_payment_entry", payment_entry)
	if mpesa_transaction:
		doc.db_set("linked_mpesa_transaction", mpesa_transaction)
	return {"ok": True, "new_status": "Refunded"}


@frappe.whitelist(allow_guest=False)
@requires(MANAGER)
def mark_failed(refund_request: str, reason: str | None = None) -> dict:
	"""Refund Initiated → Failed — when M-Pesa B2C callback returns failure
	OR a bank transfer is rejected."""
	doc = frappe.get_doc("Refund Request", refund_request)
	if doc.status not in ("Refund Initiated",):
		frappe.throw(_("Can only mark Refund Initiated as Failed (current: {0})").format(doc.status))
	doc.db_set("status", "Failed")
	if reason:
		# Append to internal_notes
		existing = (doc.internal_notes or "").strip()
		new_note = f"FAILED: {reason}"
		doc.db_set("internal_notes", f"{existing}\n{new_note}" if existing else new_note)
	return {"ok": True, "new_status": "Failed"}
