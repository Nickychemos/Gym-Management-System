"""eTIMS (KRA fiscalization) readiness probe + health monitor.

Architecture note: the actual eTIMS submission is handled entirely by the
`kenya_compliance_via_slade` app from Navari Ltd — once installed on a
tenant's site and configured with their Slade360 + KRA credentials, that
app's own doc_events hooks intercept every Sales Invoice on_submit, submit
to KRA via Slade360, and write an etims_sales_ledger_entry row capturing
the KRA control number, signature, and timestamp.

gym_management's responsibility here is operational, not transactional:
  - probe whether the tenant has Navari installed + configured
  - surface that status to the admin UI (via the whitelisted status endpoint)
  - flag Sales Invoices that should have been submitted but weren't
    (silent KRA failure detection)

See gym_management/data/ETIMS_ONBOARDING.md for the per-tenant install +
configuration runbook.
"""

from __future__ import annotations

import frappe
from frappe.utils import add_to_date, now_datetime


NAVARI_APP = "kenya_compliance_via_slade"
NAVARI_SETTINGS_DOCTYPE = "Navari KRA eTIMS Settings"
NAVARI_LEDGER_DOCTYPE = "eTIMS Sales Ledger Entry"


# ============================================================================
# Readiness probes — call these from gym_management.etims.status()
# ============================================================================


def is_installed() -> bool:
	"""True if Navari's kenya_compliance_via_slade app is installed on this site."""
	return NAVARI_APP in frappe.get_installed_apps()


def is_configured() -> bool:
	"""True if the Navari settings DocType exists and has a non-empty row.

	Navari's settings DocType is a Single — its presence in the schema isn't
	enough; we also check that at least one credential field is filled.
	Different Navari versions name fields slightly differently, so we check
	for any of the typical credential fields.
	"""
	if not is_installed():
		return False
	if not frappe.db.exists("DocType", NAVARI_SETTINGS_DOCTYPE):
		return False
	# Settings is a Single — its row name equals the DocType name
	try:
		settings = frappe.get_single(NAVARI_SETTINGS_DOCTYPE)
	except Exception:
		return False
	# Any of these being populated indicates the tenant has done the onboarding
	for field in ("slade360_username", "slade_user", "kra_pin", "company_pin"):
		if getattr(settings, field, None):
			return True
	return False


# ============================================================================
# Status — structured response for the admin UI
# ============================================================================


@frappe.whitelist()
def status() -> dict:
	"""Whitelisted endpoint — returns eTIMS readiness for the current site.

	UI calls this on the gym dashboard or the Compliance tab to render a
	traffic-light: green if installed + configured + recently submitting,
	amber if installed but not configured (or no recent submissions),
	red if not installed.
	"""
	installed = is_installed()
	configured = is_configured() if installed else False

	if not installed:
		return {
			"installed": False,
			"configured": False,
			"ready": False,
			"reason": "Navari kenya_compliance_via_slade app not installed on this site. "
			"See gym_management/data/ETIMS_ONBOARDING.md for install steps.",
		}
	if not configured:
		return {
			"installed": True,
			"configured": False,
			"ready": False,
			"reason": (
				f"App installed, but {NAVARI_SETTINGS_DOCTYPE} not configured yet — "
				"tenant has not entered their KRA PIN / Slade360 credentials."
			),
		}

	health = submission_health()
	return {
		"installed": True,
		"configured": True,
		"ready": True,
		"submissions_last_24h": health["submitted_count"],
		"unsubmitted_last_24h": health["unsubmitted_count"],
		"reason": health["summary"],
	}


# ============================================================================
# Submission health — has KRA been getting our invoices?
# ============================================================================


def submission_health(window_hours: int = 24) -> dict:
	"""Compare Sales Invoices submitted in the last N hours against the number
	of corresponding eTIMS Sales Ledger Entry rows.

	Why this matters: Navari's autosubmit retries up to its scheduler max, then
	silently gives up. Without a separate check, ops only notices the gap when
	KRA penalizes — by which time hundreds of invoices may be missing.
	"""
	if not is_installed():
		return {
			"submitted_count": 0,
			"unsubmitted_count": 0,
			"summary": "Navari app not installed — no eTIMS submissions tracked.",
		}

	since = add_to_date(now_datetime(), hours=-window_hours)

	# Sales Invoices submitted in the window
	invoices = frappe.get_all(
		"Sales Invoice",
		filters={"docstatus": 1, "creation": [">=", since]},
		pluck="name",
	)
	total = len(invoices)
	if total == 0:
		return {
			"submitted_count": 0,
			"unsubmitted_count": 0,
			"summary": "No Sales Invoices in window — nothing to compare.",
		}

	# Ledger rows are 1:1 with invoices that made it to KRA
	if not frappe.db.exists("DocType", NAVARI_LEDGER_DOCTYPE):
		return {
			"submitted_count": 0,
			"unsubmitted_count": total,
			"summary": (
				f"{total} Sales Invoices in last {window_hours}h but "
				f"{NAVARI_LEDGER_DOCTYPE} table missing — Navari install incomplete."
			),
		}

	ledger_invoices = frappe.get_all(
		NAVARI_LEDGER_DOCTYPE,
		filters={"sales_invoice": ["in", invoices]},
		pluck="sales_invoice",
	)
	submitted = len(set(ledger_invoices))
	unsubmitted = total - submitted
	return {
		"submitted_count": submitted,
		"unsubmitted_count": unsubmitted,
		"summary": (
			f"Last {window_hours}h: {submitted}/{total} invoices reached KRA "
			f"({unsubmitted} still pending or failed)."
		),
	}


# ============================================================================
# Scheduled task — flag silently-failing submissions
# ============================================================================


def monitor_etims_health():
	"""Daily: if any Sales Invoice older than 1 hour has no corresponding
	eTIMS Sales Ledger Entry, log an error (which surfaces in the Frappe
	Error Log UI for ops to triage). Silent skip if Navari isn't installed
	(tenant hasn't onboarded eTIMS yet — nothing to monitor).
	"""
	if not is_installed():
		return
	if not frappe.db.exists("DocType", NAVARI_LEDGER_DOCTYPE):
		return

	one_hour_ago = add_to_date(now_datetime(), hours=-1)
	twenty_four_hours_ago = add_to_date(now_datetime(), hours=-24)

	# Sales Invoices submitted between 24h ago and 1h ago — old enough that
	# Navari's autosubmit retries should have completed, recent enough that
	# we still care.
	candidate_invoices = frappe.get_all(
		"Sales Invoice",
		filters={
			"docstatus": 1,
			"creation": ["between", [twenty_four_hours_ago, one_hour_ago]],
		},
		pluck="name",
	)
	if not candidate_invoices:
		return

	submitted = set(
		frappe.get_all(
			NAVARI_LEDGER_DOCTYPE,
			filters={"sales_invoice": ["in", candidate_invoices]},
			pluck="sales_invoice",
		)
	)
	missing = [inv for inv in candidate_invoices if inv not in submitted]
	if missing:
		frappe.log_error(
			(
				f"eTIMS submission missing for {len(missing)} Sales Invoice(s) "
				f"older than 1 hour: {', '.join(missing[:20])}"
				+ (f" (and {len(missing) - 20} more)" if len(missing) > 20 else "")
				+ "\n\nNavari's autosubmit may have given up. Manually retry from "
				f"each Sales Invoice or inspect {NAVARI_LEDGER_DOCTYPE} for errors."
			),
			"etims.monitor_etims_health",
		)
