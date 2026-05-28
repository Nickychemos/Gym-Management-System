# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class WaiverSignature(Document):
	def validate(self):
		self._capture_ip_if_blank()
		self._check_guardian_required()

	def _capture_ip_if_blank(self):
		"""Record the client IP at signing time. Best-effort — None outside request."""
		if not self.ip_address:
			ip = getattr(frappe.local, "request_ip", None)
			if ip:
				self.ip_address = ip

	def _check_guardian_required(self):
		if self.requires_guardian and not (self.guardian_name or "").strip():
			frappe.throw(
				_(
					"This waiver template requires a Guardian Name for minor signers. "
					"Either enter a Guardian Name or use a non-minor waiver template."
				)
			)


# ============================================================================
# API used by Phase 2 access checks
# ============================================================================


def has_signed_current_waiver(customer: str) -> str | None:
	"""Returns the Waiver Signature name if the customer has a submitted
	signature against the CURRENT Waiver Template, else None."""
	current = frappe.db.get_value("Waiver Template", {"is_current": 1}, "name")
	if not current:
		return None
	return frappe.db.get_value(
		"Waiver Signature",
		{
			"customer": customer,
			"waiver_template": current,
			"docstatus": 1,
		},
		"name",
	)


def waiver_check_for_access(customer: str) -> tuple[bool, str | None]:
	"""Called by Phase 2 Class Booking / Access Event before granting access.

	Returns (ok, reason):
	  ok=True  → access not blocked by waiver rules
	  ok=False → block; reason is the human-readable message
	"""
	required = (
		frappe.db.get_single_value("Gym Settings", "require_waiver_for_access") or 0
	)
	if not required:
		return (True, None)  # toggle off → no waiver gating at all

	current = frappe.db.get_value("Waiver Template", {"is_current": 1}, "name")
	if not current:
		# Toggle is on but no template is configured. Fail-safe: allow access,
		# but warn loudly via error log so the operator notices.
		frappe.log_error(
			"Gym Settings.require_waiver_for_access is ON but no Waiver Template "
			"has is_current=1. Access is being granted without a waiver check.",
			"waiver_check_misconfigured",
		)
		return (True, None)

	sig = frappe.db.get_value(
		"Waiver Signature",
		{"customer": customer, "waiver_template": current, "docstatus": 1},
		"name",
	)
	if sig:
		return (True, None)
	return (
		False,
		f"Customer {customer} has not signed the current waiver ({current}).",
	)
