# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import re

import frappe
from frappe import _
from frappe.model.document import Document


class ChatbotFlow(Document):
	def validate(self):
		self._check_unique_node_keys()
		self._check_start_node_exists()
		self._check_next_node_references()

	# ---------- validations ----------

	def _check_unique_node_keys(self):
		"""node_key values must be unique within the flow — they're the identifiers
		the engine uses to walk the conversation tree."""
		seen = set()
		for row in self.nodes or []:
			key = (row.node_key or "").strip()
			if not key:
				frappe.throw(_("Every node must have a node_key"))
			if key in seen:
				frappe.throw(
					_("Duplicate node_key '{0}' — keys must be unique within the flow").format(key)
				)
			seen.add(key)

	def _check_start_node_exists(self):
		if not self.nodes:
			return
		if not self.start_node_key:
			frappe.throw(_("Set start_node_key — the engine needs to know where to start"))
		keys = {row.node_key for row in self.nodes}
		if self.start_node_key not in keys:
			frappe.throw(
				_("start_node_key '{0}' is not a node_key in this flow").format(
					self.start_node_key
				)
			)

	def _check_next_node_references(self):
		"""Every next_node_key reference must point at a real node_key in this flow."""
		keys = {row.node_key for row in (self.nodes or [])}
		for row in self.nodes or []:
			if row.next_node_key and row.next_node_key not in keys:
				frappe.throw(
					_("Node '{0}' references unknown next_node_key '{1}'").format(
						row.node_key, row.next_node_key
					)
				)
			# Branch nodes' branch_conditions also reference next_node_keys
			if row.node_type == "Branch" and row.branch_conditions:
				import json

				try:
					conditions = json.loads(row.branch_conditions)
				except json.JSONDecodeError:
					frappe.throw(
						_("Branch node '{0}' has invalid JSON in branch_conditions").format(
							row.node_key
						)
					)
				if not isinstance(conditions, dict):
					frappe.throw(
						_("Branch node '{0}' branch_conditions must be a JSON object").format(
							row.node_key
						)
					)
				for target in conditions.values():
					if target not in keys:
						frappe.throw(
							_(
								"Branch node '{0}' branch_conditions references unknown "
								"next_node_key '{1}'"
							).format(row.node_key, target)
						)


# ============================================================================
# API used by the chatbot engine to match an inbound message to a flow
# ============================================================================


def find_matching_flow(
	text: str, channel: str = "WhatsApp", language: str = "en"
) -> str | None:
	"""Walk active flows for the given channel + language; return the first
	flow_name whose trigger_keywords match the text.

	Matching is word-boundary prefix: keyword 'renew' matches 'I want to renew'
	and 'renewal' but NOT 'renewable' inside a longer word.
	(Substring matching was too greedy — 'new' as a keyword matched 'renew'.)
	"""
	text_lc = (text or "").lower().strip()
	if not text_lc:
		return None

	candidates = frappe.get_all(
		"Chatbot Flow",
		filters={
			"is_active": 1,
			"channel": ["in", [channel, "Both"]],
			"language": language,
		},
		fields=["name", "trigger_keywords"],
	)
	for flow in candidates:
		keywords = (flow.trigger_keywords or "").lower()
		for kw in [k.strip() for k in keywords.split(",") if k.strip()]:
			if re.search(r"\b" + re.escape(kw), text_lc):
				return flow.name
	return None


def get_node(flow_name: str, node_key: str) -> dict | None:
	"""Returns the Chatbot Node row matching (flow_name, node_key)."""
	rows = frappe.get_all(
		"Chatbot Node",
		filters={
			"parent": flow_name,
			"parenttype": "Chatbot Flow",
			"node_key": node_key,
		},
		fields=[
			"name",
			"node_key",
			"node_type",
			"next_node_key",
			"linked_action",
			"capture_key",
			"prompt_text",
			"branch_conditions",
		],
		limit=1,
	)
	return rows[0] if rows else None
