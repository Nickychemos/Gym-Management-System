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

	# ---------- Meta submission ----------

	def submit_to_meta(self) -> dict:
		"""Push this template to Meta for approval.

		Builds the Meta-shaped `components` list from header_text / body_text /
		footer_text + example_values, then POSTs via WhatsAppClient.submit_template.
		On success, stores Meta's returned template ID and flips status → Pending
		(Meta returns 'PENDING' for new submissions; approval comes later).

		Raises:
		  - WhatsAppConfigError if the tenant lacks whatsapp_business_account_id
		  - WhatsAppAPIError if Meta rejects the submission outright
		"""
		from gym_management.whatsapp_client import WhatsAppClient

		client = WhatsAppClient.for_current_site()
		components = self._build_meta_components()
		resp = client.submit_template(
			name=self.template_name,
			category=self.category,
			language=self.language,
			components=components,
		)
		# Meta returns {"id": "...", "status": "PENDING", "category": "..."}
		self.meta_template_id = resp.get("id")
		self.status = _map_meta_status(resp.get("status") or "PENDING")
		self.meta_status_synced_on = now_datetime()
		self.save(ignore_permissions=True)
		frappe.db.commit()
		return resp

	def _build_meta_components(self) -> list[dict]:
		"""Translate our header/body/footer fields into Meta's components schema.

		Meta requires `example` blocks for any text containing {{n}} placeholders.
		For body_text with N placeholders we pull N values from example_values
		(comma-separated). If example_values is missing/short, we use 'sample'
		for the missing ones so the submit doesn't fail validation.
		"""
		components: list[dict] = []

		if self.header_text:
			header_comp: dict = {
				"type": "HEADER",
				"format": "TEXT",
				"text": self.header_text,
			}
			# If header has placeholders, Meta wants an example too
			if PLACEHOLDER_PATTERN.search(self.header_text):
				count = len(
					{
						int(m.group(1))
						for m in PLACEHOLDER_PATTERN.finditer(self.header_text)
					}
				)
				header_comp["example"] = {
					"header_text": [self._examples_for(count)]
				}
			components.append(header_comp)

		# Body is required for all non-AUTHENTICATION templates
		body_comp: dict = {
			"type": "BODY",
			"text": self.body_text or "",
		}
		body_placeholders = len(
			{
				int(m.group(1))
				for m in PLACEHOLDER_PATTERN.finditer(self.body_text or "")
			}
		)
		if body_placeholders > 0:
			body_comp["example"] = {
				"body_text": [self._examples_for(body_placeholders)]
			}
		components.append(body_comp)

		if self.footer_text:
			components.append({"type": "FOOTER", "text": self.footer_text})

		return components

	def _examples_for(self, count: int) -> list[str]:
		"""Return `count` example values, padding from example_values (CSV) and
		falling back to 'sample' for any missing."""
		raw = (self.example_values or "").split(",")
		values = [v.strip() for v in raw if v.strip()]
		while len(values) < count:
			values.append("sample")
		return values[:count]


def _map_meta_status(meta_status: str) -> str:
	"""Meta returns UPPER_CASE statuses; map to our Select options."""
	return {
		"APPROVED": "Approved",
		"PENDING": "Pending",
		"REJECTED": "Rejected",
		"PAUSED": "Paused",
		"DISABLED": "Disabled",
	}.get((meta_status or "").upper(), "Pending")


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
# Meta sync — submit + status pull
# ============================================================================


@frappe.whitelist()
def submit(template_name: str) -> dict:
	"""Whitelisted endpoint for the UI 'Submit to Meta' button.

	Loads the template, calls submit_to_meta(), and returns the Meta response.
	Errors propagate to the UI as Frappe alerts.
	"""
	doc = frappe.get_doc("WhatsApp Template", template_name)
	return doc.submit_to_meta()


def sync_all_statuses() -> dict:
	"""Daily scheduler task: pull all templates from Meta and update local
	rows' status + meta_template_id + rejection_reason.

	Silent-skip if WhatsApp not configured (tenant not on WhatsApp yet) or if
	the WABA ID is missing (templates can't be queried without it).

	Matching rule: Meta's (name, language) is unique within a WABA. We match
	local rows on template_name first; if multiple languages exist locally for
	the same name we update each one against its language-matched Meta row.
	"""
	from gym_management.whatsapp_client import (
		WhatsAppAPIError,
		WhatsAppClient,
		WhatsAppConfigError,
	)

	try:
		client = WhatsAppClient.for_current_site()
		client._require_waba()  # raises if WABA ID missing
	except WhatsAppConfigError:
		return {"ok": False, "reason": "not_configured"}

	try:
		remote = client.list_templates()
	except WhatsAppAPIError as e:
		frappe.log_error(str(e), "whatsapp_template.sync_all_statuses")
		return {"ok": False, "reason": "api_error", "error": str(e)}

	# Build a (name, language) → row map for the local templates
	local_rows = frappe.get_all(
		"WhatsApp Template",
		fields=["name", "template_name", "language", "status"],
	)
	local_index = {
		(r.template_name, r.language): r.name for r in local_rows
	}

	now = now_datetime()
	updated = 0
	unknown_remote: list[str] = []
	for tpl in remote:
		key = (tpl.get("name"), tpl.get("language"))
		local_name = local_index.get(key)
		if not local_name:
			unknown_remote.append(f"{key[0]}/{key[1]}")
			continue
		updates = {
			"meta_template_id": tpl.get("id"),
			"status": _map_meta_status(tpl.get("status") or "PENDING"),
			"meta_status_synced_on": now,
		}
		if tpl.get("rejected_reason"):
			updates["rejection_reason"] = tpl["rejected_reason"]
		frappe.db.set_value("WhatsApp Template", local_name, updates)
		updated += 1
	frappe.db.commit()
	if unknown_remote:
		frappe.logger().info(
			f"sync_all_statuses: {len(unknown_remote)} Meta templates have no "
			f"local row (first few: {unknown_remote[:5]})"
		)
	return {
		"ok": True,
		"updated": updated,
		"remote_count": len(remote),
		"unknown_remote": len(unknown_remote),
	}


@frappe.whitelist()
def sync_status_from_meta(template_name: str) -> dict:
	"""Whitelisted endpoint for the per-template 'Sync from Meta' button.

	Pulls all templates from Meta and finds the one matching this row's
	(template_name, language). Updating one template requires a list call
	because Meta's GET-by-name endpoint needs the language too and behaves
	inconsistently for non-Approved templates — list+filter is more reliable.
	"""
	from gym_management.whatsapp_client import (
		WhatsAppAPIError,
		WhatsAppClient,
		WhatsAppConfigError,
	)

	row = frappe.db.get_value(
		"WhatsApp Template", template_name, ["template_name", "language"], as_dict=True
	)
	if not row:
		frappe.throw(_("Template {0} not found").format(template_name))

	try:
		client = WhatsAppClient.for_current_site()
		client._require_waba()
	except WhatsAppConfigError as e:
		frappe.throw(str(e))

	try:
		remote = client.list_templates()
	except WhatsAppAPIError as e:
		frappe.throw(str(e))

	match = next(
		(
			t for t in remote
			if t.get("name") == row.template_name
			and t.get("language") == row.language
		),
		None,
	)
	if not match:
		frappe.db.set_value(
			"WhatsApp Template", template_name, "meta_status_synced_on", now_datetime()
		)
		frappe.db.commit()
		return {"ok": False, "reason": "not_found_on_meta"}

	updates = {
		"meta_template_id": match.get("id"),
		"status": _map_meta_status(match.get("status") or "PENDING"),
		"meta_status_synced_on": now_datetime(),
	}
	if match.get("rejected_reason"):
		updates["rejection_reason"] = match["rejected_reason"]
	frappe.db.set_value("WhatsApp Template", template_name, updates)
	frappe.db.commit()
	return {"ok": True, "status": updates["status"]}
