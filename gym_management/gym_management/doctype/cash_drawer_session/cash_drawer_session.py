# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from gym_management.rbac import FRONTDESK, requires
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, now_datetime


class CashDrawerSession(Document):
	def validate(self):
		self._compute_variance()
		self._compute_variance_acceptable()
		self._check_close_requirements()

	def before_submit(self):
		"""Cannot submit while still Open — must be Closed or Reconciled first."""
		if self.status == "Open":
			frappe.throw(
				_("Cannot submit a Cash Drawer Session that is still Open. Close it first.")
			)

	def on_submit(self):
		# Stamp closer if not set
		if self.status in ("Closed", "Reconciled") and not self.closed_by:
			emp = frappe.db.get_value(
				"Employee", {"user_id": frappe.session.user}, "name"
			)
			if emp:
				self.db_set("closed_by", emp)

	# ---------- computations ----------

	def _compute_variance(self):
		"""variance = actual_cash_counted - (opening_float + expected_cash_sales
		             - cash_drops - cash_pickups)

		Positive variance = surplus (more cash than expected)
		Negative variance = shortage (less cash than expected)"""
		if self.actual_cash_counted is None:
			self.variance = 0
			return
		expected_in_drawer = (
			flt(self.opening_float)
			+ flt(self.expected_cash_sales)
			- flt(self.cash_drops)
			- flt(self.cash_pickups)
		)
		self.variance = flt(self.actual_cash_counted) - expected_in_drawer

	def _compute_variance_acceptable(self):
		"""variance_acceptable = |variance| <= Gym Settings.cash_variance_threshold."""
		threshold = (
			frappe.db.get_single_value("Gym Settings", "cash_variance_threshold") or 0
		)
		self.variance_acceptable = 1 if abs(flt(self.variance)) <= flt(threshold) else 0

	# ---------- validations ----------

	def _check_close_requirements(self):
		"""When closing (status flips to Closed/Reconciled), enforce dual-control
		rules from Gym Settings."""
		if self.status not in ("Closed", "Reconciled"):
			return

		# closed_at must be set
		if not self.closed_at:
			self.closed_at = now_datetime()
		# actual_cash_counted must be set
		if self.actual_cash_counted is None:
			frappe.throw(
				_("Actual Cash Counted must be entered before the session can be closed")
			)

		# If variance is unacceptable, require explanation + witness
		if not self.variance_acceptable:
			if not (self.variance_explanation or "").strip():
				frappe.throw(
					_(
						"Variance of {0} exceeds the cash_variance_threshold from Gym "
						"Settings. Variance Explanation is required."
					).format(self.variance)
				)
			if not self.supervisor_witness:
				frappe.throw(
					_(
						"Variance of {0} exceeds the threshold. A Supervisor Witness "
						"(dual control) is required to close this session."
					).format(self.variance)
				)


# ============================================================================
# API: open / close a session from the reception UI
# ============================================================================


@frappe.whitelist(allow_guest=False)
@requires(FRONTDESK)
def open_session(
	branch: str,
	cashier: str,
	opening_float: float,
	pos_profile: str | None = None,
	opening_notes: str | None = None,
) -> dict:
	"""Reception clicks 'Open Shift' at start of day. Creates a Draft session.
	Refuses to open a second session for the same cashier+branch if one is
	already Open."""
	existing = frappe.db.exists(
		"Cash Drawer Session",
		{
			"branch": branch,
			"cashier": cashier,
			"status": "Open",
			"docstatus": 0,
		},
	)
	if existing:
		frappe.throw(
			_("Cashier {0} already has an Open Cash Drawer Session at {1}: {2}").format(
				cashier, branch, existing
			)
		)
	doc = frappe.new_doc("Cash Drawer Session")
	doc.branch = branch
	doc.cashier = cashier
	doc.opening_float = flt(opening_float)
	doc.pos_profile = pos_profile
	doc.opening_notes = opening_notes
	doc.opened_at = now_datetime()
	doc.status = "Open"
	doc.insert(ignore_permissions=True)
	return {"ok": True, "session": doc.name}


@frappe.whitelist(allow_guest=False)
@requires(FRONTDESK)
def close_session(
	session_name: str,
	actual_cash_counted: float,
	expected_cash_sales: float | None = None,
	transaction_count: int | None = None,
	cash_drops: float | None = None,
	cash_pickups: float | None = None,
	variance_explanation: str | None = None,
	supervisor_witness: str | None = None,
) -> dict:
	"""Reception clicks 'Close Shift' at end of day. Computes variance,
	enforces dual-control if needed, submits the session."""
	doc = frappe.get_doc("Cash Drawer Session", session_name)
	if doc.docstatus != 0:
		frappe.throw(_("Session {0} is already submitted").format(session_name))

	doc.actual_cash_counted = flt(actual_cash_counted)
	if expected_cash_sales is not None:
		doc.expected_cash_sales = flt(expected_cash_sales)
	if transaction_count is not None:
		doc.transaction_count = int(transaction_count)
	if cash_drops is not None:
		doc.cash_drops = flt(cash_drops)
	if cash_pickups is not None:
		doc.cash_pickups = flt(cash_pickups)
	if variance_explanation:
		doc.variance_explanation = variance_explanation
	if supervisor_witness:
		doc.supervisor_witness = supervisor_witness

	doc.closed_at = now_datetime()
	doc.status = "Closed"
	doc.save(ignore_permissions=True)
	doc.submit()
	return {
		"ok": True,
		"variance": doc.variance,
		"variance_acceptable": bool(doc.variance_acceptable),
	}


# ============================================================================
# Helper: pull cash POS Invoices in the session window (for auto-fill later)
# ============================================================================


def compute_expected_cash_sales(session_name: str) -> float:
	"""Sum POS Invoices for this session's branch + cashier + window where
	mode_of_payment includes 'Cash'. Returns the total for v2 auto-fill.

	Called by the close_session API when expected_cash_sales is not passed in.
	"""
	doc = frappe.db.get_value(
		"Cash Drawer Session",
		session_name,
		["branch", "opened_at", "closed_at"],
		as_dict=True,
	)
	if not doc:
		return 0.0
	end = doc.closed_at or now_datetime()
	# Sum cash mode-of-payment amounts from submitted POS Invoices in the window.
	# Returns 0.0 if ERPNext POS isn't being used.
	total = frappe.db.sql(
		"""
		SELECT COALESCE(SUM(mop.amount), 0)
		FROM `tabSales Invoice Payment` mop
		INNER JOIN `tabSales Invoice` si ON mop.parent = si.name
		WHERE si.docstatus = 1
		AND si.is_pos = 1
		AND si.posting_date BETWEEN DATE(%s) AND DATE(%s)
		AND mop.mode_of_payment LIKE %s
		""",
		(doc.opened_at, end, "%Cash%"),
	)
	return float(total[0][0]) if total and total[0] else 0.0
