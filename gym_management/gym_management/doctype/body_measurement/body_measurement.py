# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class BodyMeasurement(Document):
	def validate(self):
		self._compute_bmi()
		self._sanity_check_ranges()

	def _compute_bmi(self):
		"""BMI = weight_kg / (height_m)^2"""
		if self.height_cm and self.weight_kg and self.height_cm > 0:
			height_m = self.height_cm / 100.0
			self.bmi = round(self.weight_kg / (height_m * height_m), 2)
		else:
			self.bmi = 0

	def _sanity_check_ranges(self):
		"""Soft guards against typo entries."""
		if self.height_cm and not (50 <= self.height_cm <= 250):
			frappe.throw(
				_("Height {0} cm looks wrong — typical adult range is 50-250 cm.").format(
					self.height_cm
				)
			)
		if self.weight_kg and not (10 <= self.weight_kg <= 400):
			frappe.throw(
				_("Weight {0} kg looks wrong — typical adult range is 10-400 kg.").format(
					self.weight_kg
				)
			)
		if self.body_fat_pct and not (3 <= self.body_fat_pct <= 70):
			frappe.throw(
				_("Body fat {0}% looks wrong — typical range is 3-70%.").format(
					self.body_fat_pct
				)
			)


# ============================================================================
# API used by trainers and member portal
# ============================================================================


def get_latest_for(customer: str) -> dict | None:
	"""Returns the most recent Body Measurement record for the customer, or None."""
	result = frappe.db.get_value(
		"Body Measurement",
		{"customer": customer},
		[
			"name",
			"measured_on",
			"weight_kg",
			"bmi",
			"body_fat_pct",
			"muscle_mass_kg",
			"waist_cm",
		],
		as_dict=True,
		order_by="measured_on desc",
	)
	return result
