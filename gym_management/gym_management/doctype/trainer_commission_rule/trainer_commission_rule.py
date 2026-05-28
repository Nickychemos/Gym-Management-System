# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, today


class TrainerCommissionRule(Document):
	def validate(self):
		self._check_date_range()
		self._check_commission_inputs_per_type()
		self._check_tier_table_if_tiered()

	# ---------- validations ----------

	def _check_date_range(self):
		if self.valid_to and getdate(self.valid_to) < getdate(self.valid_from):
			frappe.throw(_("Valid To must be on or after Valid From"))

	def _check_commission_inputs_per_type(self):
		if self.commission_type == "Percent of Revenue":
			if self.commission_percent is None or not (0 <= self.commission_percent <= 100):
				frappe.throw(_("Commission % must be set between 0 and 100"))
		elif self.commission_type == "Fixed Per Session":
			if self.commission_fixed_amount is None or self.commission_fixed_amount < 0:
				frappe.throw(_("Fixed Amount Per Session must be set and non-negative"))

	def _check_tier_table_if_tiered(self):
		if self.commission_type != "Tiered":
			return
		if not self.tier_table:
			frappe.throw(_("Tiered commission requires at least one row in the Tiers table"))

		# Validate each row and ensure tiers don't overlap or leave gaps.
		rows = sorted(
			self.tier_table, key=lambda r: r.sessions_min or 0
		)
		for i, row in enumerate(rows):
			if row.sessions_min is None or row.sessions_min < 0:
				frappe.throw(_("Row {0}: Sessions Min must be >= 0").format(i + 1))
			if row.sessions_max is not None and row.sessions_max < row.sessions_min:
				frappe.throw(
					_("Row {0}: Sessions Max ({1}) must be >= Sessions Min ({2})").format(
						i + 1, row.sessions_max, row.sessions_min
					)
				)
			if row.commission_percent is None or not (0 <= row.commission_percent <= 100):
				frappe.throw(_("Row {0}: Commission % must be between 0 and 100").format(i + 1))
			# Check overlap with previous row
			if i > 0:
				prev = rows[i - 1]
				if prev.sessions_max is None:
					frappe.throw(
						_("Row {0}: Cannot follow a row with empty Sessions Max (open-ended tier must be last)").format(
							i + 1
						)
					)
				if row.sessions_min <= prev.sessions_max:
					frappe.throw(
						_("Row {0}: Sessions Min ({1}) overlaps with previous tier ending at {2}").format(
							i + 1, row.sessions_min, prev.sessions_max
						)
					)


# ============================================================================
# API: compute commission for a trainer + session count + revenue
# ============================================================================


def calculate_commission(
	trainer: str,
	applies_to: str,
	sessions_count: int,
	revenue: float,
	on_date: str | None = None,
) -> dict:
	"""Pick the most-specific active rule for (trainer, applies_to) on the given
	date and compute the commission amount.

	Rule priority: trainer-specific rule > global rule (trainer is empty).
	Within same specificity, the most recently modified active rule wins.

	Returns {amount, rule_name, basis, percent_or_fixed} or empty dict if
	no rule matches.
	"""
	on = getdate(on_date or today())

	# Trainer-specific first
	rule = _find_rule(trainer=trainer, applies_to=applies_to, on_date=on)
	if not rule:
		# Fallback to global (no trainer)
		rule = _find_rule(trainer="", applies_to=applies_to, on_date=on)
	if not rule:
		return {}

	if rule.commission_type == "Percent of Revenue":
		amount = (revenue or 0) * (rule.commission_percent or 0) / 100.0
		return {
			"amount": round(amount, 2),
			"rule_name": rule.name,
			"basis": "Percent of Revenue",
			"percent_or_fixed": rule.commission_percent,
		}

	if rule.commission_type == "Fixed Per Session":
		amount = (sessions_count or 0) * (rule.commission_fixed_amount or 0)
		return {
			"amount": round(amount, 2),
			"rule_name": rule.name,
			"basis": "Fixed Per Session",
			"percent_or_fixed": rule.commission_fixed_amount,
		}

	# Tiered — pick the matching band
	if rule.commission_type == "Tiered":
		pct = _resolve_tier_percent(rule.name, sessions_count)
		amount = (revenue or 0) * (pct or 0) / 100.0
		return {
			"amount": round(amount, 2),
			"rule_name": rule.name,
			"basis": f"Tiered ({sessions_count} sessions)",
			"percent_or_fixed": pct,
		}

	return {}


def _find_rule(trainer: str, applies_to: str, on_date):
	"""Match either the trainer-specific or all-trainer rule, current on on_date,
	for applies_to (or 'Both')."""
	filters = {
		"trainer": trainer or "",
		"is_active": 1,
		"valid_from": ["<=", on_date],
		"applies_to": ["in", [applies_to, "Both"]],
	}
	row = frappe.db.get_value(
		"Trainer Commission Rule",
		filters,
		["name", "commission_type", "commission_percent", "commission_fixed_amount", "valid_to"],
		as_dict=True,
		order_by="modified desc",
	)
	if not row:
		return None
	# Honour valid_to if set
	if row.valid_to and getdate(row.valid_to) < on_date:
		return None
	return row


def _resolve_tier_percent(rule_name: str, sessions_count: int) -> float:
	"""Walk the Commission Tier child rows and return the % for the band that
	contains sessions_count."""
	tiers = frappe.get_all(
		"Commission Tier",
		filters={"parent": rule_name, "parenttype": "Trainer Commission Rule"},
		fields=["sessions_min", "sessions_max", "commission_percent"],
		order_by="sessions_min asc",
	)
	for t in tiers:
		if (sessions_count or 0) >= (t.sessions_min or 0):
			if t.sessions_max is None or (sessions_count or 0) <= t.sessions_max:
				return t.commission_percent or 0
	return 0
