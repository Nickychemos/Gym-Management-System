# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class WaiverTemplate(Document):
	def validate(self):
		self._enforce_single_current()

	def _enforce_single_current(self):
		"""At most one Waiver Template at a time can be is_current=1.
		If this one is being marked current, unmark every other."""
		if not self.is_current:
			return

		other_current = frappe.get_all(
			"Waiver Template",
			filters={"is_current": 1, "name": ["!=", self.name or ""]},
			pluck="name",
		)
		for name in other_current:
			frappe.db.set_value("Waiver Template", name, "is_current", 0)
		if other_current:
			frappe.msgprint(
				_("Marked {0} previous waiver template(s) as not current.").format(
					len(other_current)
				),
				alert=True,
			)


def get_current_template() -> str | None:
	"""Returns the name of the currently-active Waiver Template, or None."""
	return frappe.db.get_value("Waiver Template", {"is_current": 1}, "name")
