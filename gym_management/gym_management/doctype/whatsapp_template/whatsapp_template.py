# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import re

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime


# Pattern for {{1}}, {{2}}, ... placeholders Meta uses
PLACEHOLDER_PATTERN = re.compile(r"\{\{(\d+)\}\}")

# Meta requires lowercase + underscore + digit names
NAME_PATTERN = re.compile(r"^[a-z0-9_]+$")


class WhatsAppTemplate(Document):
	def validate(self):
		self._check_name_format()
		self._count_placeholders()
		self._check_approved_has_meta_id()

	# ---------- validations ----------

	def _check_name_format(self):
		"""Meta requires lowercase + underscore + digit only."""
		if not NAME_PATTERN.match(self.template_name or ""):
			frappe.throw(
				_(
					"Template name must be lowercase letters, digits, and "
					"underscores only — got: {0}"
				).format(self.template_name)
			)

	def _count_placeholders(self):
		"""Auto-compute placeholder_count by counting unique {{n}} occurrences
		across header_text + body_text + footer_text."""
		all_text = " ".join(
			s for s in (self.header_text, self.body_text, self.footer_text) if s
		)
		nums = {int(m.group(1)) for m in PLACEHOLDER_PATTERN.finditer(all_text)}
		self.placeholder_count = len(nums)

	def _check_approved_has_meta_id(self):
		if self.status == "Approved" and not self.meta_template_id:
			frappe.throw(
				_(
					"Approved templates must have a Meta Template ID. Either "
					"set the ID or change status back to Pending."
				)
			)


# ============================================================================
# Public API — render template + record send for downstream senders
# ============================================================================


def get_template(template_name: str) -> dict | None:
	"""Lookup a template by name. Returns dict with body_text + placeholder_count
	+ meta_template_id, or None if not found / not active / not Approved."""
	row = frappe.db.get_value(
		"WhatsApp Template",
		template_name,
		[
			"template_name",
			"category",
			"language",
			"status",
			"is_active",
			"meta_template_id",
			"channel_connection",
			"header_text",
			"body_text",
			"footer_text",
			"placeholder_count",
		],
		as_dict=True,
	)
	if not row:
		return None
	if not row.is_active or row.status != "Approved":
		return None
	return dict(row)


def render(template_name: str, values: list[str] | None = None) -> str:
	"""Substitute {{1}}, {{2}}, ... in body_text with the provided values.

	values: positional list — values[0] replaces {{1}}, values[1] replaces {{2}}.
	If the template has N placeholders and len(values) != N, raises ValueError.
	"""
	tpl = get_template(template_name)
	if not tpl:
		raise ValueError(
			f"WhatsApp template {template_name!r} not found, not active, or not Approved"
		)
	values = values or []
	if tpl["placeholder_count"] != len(values):
		raise ValueError(
			f"Template {template_name!r} expects {tpl['placeholder_count']} "
			f"placeholders, got {len(values)} values"
		)

	def _sub(match: re.Match) -> str:
		idx = int(match.group(1)) - 1
		return str(values[idx]) if 0 <= idx < len(values) else match.group(0)

	body = PLACEHOLDER_PATTERN.sub(_sub, tpl["body_text"] or "")
	return body


def record_send(template_name: str, delta: int = 1):
	"""Bump send_count + last_used_on whenever a sender dispatches this template."""
	row = frappe.db.get_value(
		"WhatsApp Template", template_name, "send_count", as_dict=False
	)
	current = int(row or 0)
	frappe.db.set_value(
		"WhatsApp Template",
		template_name,
		{
			"send_count": max(0, current + delta),
			"last_used_on": now_datetime(),
		},
	)


def find_by_category(category: str, language: str = "en") -> list[dict]:
	"""List active Approved templates of a given category + language. Used
	by the campaign-builder UI to populate a dropdown."""
	return frappe.get_all(
		"WhatsApp Template",
		filters={
			"category": category,
			"language": language,
			"status": "Approved",
			"is_active": 1,
		},
		fields=["template_name", "body_text", "placeholder_count", "send_count"],
		order_by="send_count desc",
	)


# ============================================================================
# Meta sync (placeholder for Phase 5 polish)
# ============================================================================


def sync_status_from_meta(template_name: str) -> dict:
	"""Poll Meta's Graph API for the latest approval status of this template.

	Phase 5 polish — requires the WhatsApp Cloud API integration which calls:
	    GET /v17.0/{whatsapp_business_account_id}/message_templates
	    Authorization: Bearer <access_token>

	For v1 we just stamp meta_status_synced_on; the actual HTTP call is
	deferred until we have a real WhatsApp Business Account to test against.
	"""
	frappe.db.set_value(
		"WhatsApp Template", template_name, "meta_status_synced_on", now_datetime()
	)
	return {"ok": True, "note": "Meta API sync not yet implemented"}
