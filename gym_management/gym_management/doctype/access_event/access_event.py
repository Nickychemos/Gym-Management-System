# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_to_date, get_datetime, now_datetime


class AccessEvent(Document):
	"""Raw, append-only log of every reader scan.

	Access Events are never updated after creation (write=0 in permissions) and
	never deleted by normal users — the audit value depends on immutability.
	"""

	pass


# ============================================================================
# Access resolver — the heart of gym access control
# ============================================================================
#
# A reader device POSTs a scan to /api/method/<this module>.resolve_scan.
# The resolver decides Grant / Deny / Error, persists the decision as an
# Access Event row, and returns the decision to the reader.
#
# This is the canonical implementation of Flow A from the Backend Architecture
# doc — extended to also handle trial passes, family groups, anti-passback,
# and frozen subscriptions.
# ============================================================================


@frappe.whitelist(allow_guest=False)
def resolve_scan(
	reader_device: str,
	credential_value: str,
	timestamp: str | None = None,
) -> dict:
	"""Public API the reader device hits on every scan.

	Args:
		reader_device: device_code of the Reader Device row.
		credential_value: raw credential string the device scanned.
		timestamp: ISO datetime of the scan (defaults to server now).

	Returns:
		dict with keys: decision, reason, customer (or None), access_event_name.
	"""
	ts = get_datetime(timestamp) if timestamp else now_datetime()

	# 1. Verify reader device exists & is operational
	reader = frappe.db.get_value(
		"Reader Device",
		reader_device,
		["name", "branch", "status", "gate_position"],
		as_dict=True,
	)
	if not reader:
		return _log_and_return(
			reader_device=None,
			branch=None,
			credential_value=credential_value,
			timestamp=ts,
			decision="Error",
			decision_reason="Reader Error",
			notes=f"Unknown reader device code: {reader_device}",
		)
	if reader.status in ("Maintenance", "Decommissioned"):
		return _log_and_return(
			reader_device=reader.name,
			branch=reader.branch,
			credential_value=credential_value,
			timestamp=ts,
			decision="Error",
			decision_reason="Reader Error",
			notes=f"Reader {reader.name} status is {reader.status}",
		)

	# 2. Look up the credential
	cred = frappe.db.get_value(
		"Member Credential",
		{"credential_value": credential_value},
		["name", "customer", "status"],
		as_dict=True,
	)
	if not cred:
		return _log_and_return(
			reader_device=reader.name,
			branch=reader.branch,
			credential_value=credential_value,
			timestamp=ts,
			decision="Denied",
			decision_reason="Unknown Credential",
		)
	if cred.status != "Active":
		return _log_and_return(
			reader_device=reader.name,
			branch=reader.branch,
			credential_value=credential_value,
			timestamp=ts,
			matched_credential=cred.name,
			matched_customer=cred.customer,
			decision="Denied",
			decision_reason="Disabled Credential",
			notes=f"Credential status is {cred.status}",
		)

	customer = cred.customer

	# 3. Anti-passback — same credential cannot be granted twice within the
	#    configured gap. Configurable via Gym Settings.
	enabled = frappe.db.get_single_value("Gym Settings", "enable_anti_passback") or 0
	if enabled:
		gap_minutes = (
			frappe.db.get_single_value("Gym Settings", "anti_passback_minutes") or 1
		)
		earliest_allowed = add_to_date(ts, minutes=-int(gap_minutes))
		recent_grant = frappe.db.exists(
			"Access Event",
			{
				"matched_customer": customer,
				"reader_device": reader.name,
				"decision": "Granted",
				"timestamp": [">=", earliest_allowed],
			},
		)
		if recent_grant:
			return _log_and_return(
				reader_device=reader.name,
				branch=reader.branch,
				credential_value=credential_value,
				timestamp=ts,
				matched_credential=cred.name,
				matched_customer=customer,
				decision="Denied",
				decision_reason="Anti-Passback Block",
				notes=f"Same credential granted within last {gap_minutes} min",
			)

	# 4. Active subscription?
	sub = _find_active_subscription(customer, ts.date())
	if sub:
		if sub.status == "Frozen":
			return _log_and_return(
				reader_device=reader.name,
				branch=reader.branch,
				credential_value=credential_value,
				timestamp=ts,
				matched_credential=cred.name,
				matched_customer=customer,
				decision="Denied",
				decision_reason="Frozen",
				notes=f"Subscription {sub.name} is currently Frozen",
			)
		return _log_and_return(
			reader_device=reader.name,
			branch=reader.branch,
			credential_value=credential_value,
			timestamp=ts,
			matched_credential=cred.name,
			matched_customer=customer,
			decision="Granted",
			decision_reason="Active Subscription",
			linked_member_subscription=sub.name,
			reader_gate_position=reader.gate_position,
		)

	# 5. Active trial pass?
	from gym_management.gym_management.doctype.trial_pass.trial_pass import has_active_trial

	trial = has_active_trial(customer)
	if trial:
		return _log_and_return(
			reader_device=reader.name,
			branch=reader.branch,
			credential_value=credential_value,
			timestamp=ts,
			matched_credential=cred.name,
			matched_customer=customer,
			decision="Granted",
			decision_reason="Active Trial",
			linked_trial_pass=trial,
			reader_gate_position=reader.gate_position,
		)

	# 6. Family group — head's subscription covers family members.
	family_head_sub = _find_family_head_active_subscription(customer, ts.date())
	if family_head_sub:
		return _log_and_return(
			reader_device=reader.name,
			branch=reader.branch,
			credential_value=credential_value,
			timestamp=ts,
			matched_credential=cred.name,
			matched_customer=customer,
			decision="Granted",
			decision_reason="Family Plan Access",
			linked_member_subscription=family_head_sub,
			reader_gate_position=reader.gate_position,
		)

	# 7. No grant found — deny.
	#    The reason depends on whether the customer has ANY subscription history.
	any_sub = frappe.db.get_value(
		"Member Subscription",
		{"customer": customer, "docstatus": 1},
		["status"],
		order_by="end_date desc",
	)
	if any_sub == "Lapsed":
		reason = "Lapsed"
	elif any_sub == "Cancelled":
		reason = "Cancelled"
	else:
		reason = "No Subscription"

	return _log_and_return(
		reader_device=reader.name,
		branch=reader.branch,
		credential_value=credential_value,
		timestamp=ts,
		matched_credential=cred.name,
		matched_customer=customer,
		decision="Denied",
		decision_reason=reason,
	)


# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------


def _find_active_subscription(customer: str, on_date) -> dict | None:
	"""Returns the Member Subscription doc for the customer that is currently
	covering on_date with status Active or Frozen, or None."""
	return frappe.db.get_value(
		"Member Subscription",
		{
			"customer": customer,
			"docstatus": 1,
			"status": ["in", ["Active", "Frozen"]],
			"start_date": ["<=", on_date],
			"end_date": [">=", on_date],
		},
		["name", "status"],
		as_dict=True,
	)


def _find_family_head_active_subscription(customer: str, on_date) -> str | None:
	"""If the customer is a row in any Family Group's members table, returns
	the head Customer's Active subscription name, else None."""
	# Find all Family Groups where this customer appears as a member row
	rows = frappe.db.sql(
		"""
		SELECT fg.name AS family_group, fg.head_customer
		FROM `tabFamily Group` fg
		INNER JOIN `tabFamily Group Member` fgm
			ON fgm.parent = fg.name AND fgm.parenttype = 'Family Group'
		WHERE fgm.customer = %s AND fgm.is_active = 1
		""",
		(customer,),
		as_dict=True,
	)
	for row in rows:
		head_sub = _find_active_subscription(row.head_customer, on_date)
		if head_sub and head_sub.status == "Active":
			return head_sub.name
	return None


def _log_and_return(**fields) -> dict:
	"""Insert an Access Event row, side-effect a Visit Log if appropriate,
	and return the decision to the reader."""
	# Pop optional context not stored on Access Event itself
	reader_gate_position = fields.pop("reader_gate_position", None)

	doc = frappe.new_doc("Access Event")
	for k, v in fields.items():
		if v is not None:
			setattr(doc, k, v)
	doc.insert(ignore_permissions=True)

	visit_log_name = None
	if doc.decision == "Granted" and doc.matched_customer:
		visit_log_name = _create_or_close_visit_log(
			customer=doc.matched_customer,
			branch=doc.branch,
			reader_device=doc.reader_device,
			gate_position=reader_gate_position,
			credential=doc.matched_credential,
			subscription=doc.linked_member_subscription,
			access_event_name=doc.name,
		)
		if visit_log_name:
			doc.db_set("linked_visit_log", visit_log_name)

	frappe.db.commit()
	return {
		"decision": doc.decision,
		"reason": doc.decision_reason,
		"customer": doc.matched_customer,
		"access_event_name": doc.name,
		"visit_log_name": visit_log_name,
	}


def _create_or_close_visit_log(
	customer: str,
	branch: str | None,
	reader_device: str | None,
	gate_position: str | None,
	credential: str | None,
	subscription: str | None,
	access_event_name: str,
) -> str | None:
	"""On a Grant, either open a new Visit Log (Entry) or close an existing
	open one (Exit). For "Both" or "Manual Reception" devices, infer from
	whether the customer has an open visit."""
	from gym_management.gym_management.doctype.visit_log.visit_log import (
		get_open_visit,
	)

	open_visit = get_open_visit(customer)

	# Decide entry vs exit based on gate_position + open_visit state
	if gate_position == "Exit":
		intent = "exit"
	elif gate_position == "Entry":
		intent = "entry"
	else:
		# "Both" or unspecified (e.g. Manual Reception) — auto-toggle
		intent = "exit" if open_visit else "entry"

	if intent == "exit" and open_visit:
		# Close the open visit
		from gym_management.gym_management.doctype.visit_log.visit_log import (
			close_visit,
		)

		close_visit(open_visit, exit_reader=reader_device)
		return open_visit

	if intent == "entry":
		# Open a new visit
		visit = frappe.new_doc("Visit Log")
		visit.customer = customer
		visit.branch = branch
		visit.check_in_time = frappe.utils.now_datetime()
		visit.entry_reader = reader_device
		visit.credential_used = credential
		visit.active_subscription = subscription
		visit.linked_access_event = access_event_name
		# infer check_in_method from device type
		device_type = (
			frappe.db.get_value("Reader Device", reader_device, "device_type")
			if reader_device
			else None
		) or "Reception Manual"
		method_map = {
			"Manual Reception": "Reception Manual",
			"RFID": "RFID",
			"QR Scanner": "QR",
			"Face Reader": "Face",
			"Combined": "RFID",
		}
		visit.check_in_method = method_map.get(device_type, "Reception Manual")
		visit.insert(ignore_permissions=True)
		visit.submit()
		return visit.name

	# Exit intent but no open visit — silent no-op (e.g. someone scans exit
	# without ever scanning entry). The Access Event is still logged.
	return None
