"""Chatbot engine — deterministic decision-tree interpreter.

Walks Chatbot Flow + Chatbot Node DocType data, maintaining state in
Chatbot Session, and dispatches to registered Action handlers when the
flow hits an Action node.

Inbound flow (per turn):
  1. Receive inbound message (phone, text, channel)
  2. Find or create Chatbot Session for the phone+channel
  3. If session has no current_flow → match text against active flows'
     trigger_keywords; if no match, send fallback message; if too many
     unmatched, hand over to human.
  4. If session has a current_flow → look up the current node, walk
     according to node_type:
        Message  → send prompt, advance to next_node
        Question → send prompt, wait for user reply
        Branch   → evaluate branch_conditions against user reply
        Action   → call registered action function
        Handover → create Member Request, end session
  5. Return the reply text(s) the engine wants to send back.

Action functions are registered in ACTION_REGISTRY below. Each takes
(session, user_text) and returns either None (continues to next_node)
or a string (sent to user before continuing).
"""

import json
import re
from typing import Callable

import frappe
from frappe.utils import now_datetime


# ============================================================================
# Action registry — Phase 5 ships with stubs; Phase 5 polish wires real logic
# ============================================================================


def _action_lookup_subscription(session, user_text: str) -> str | None:
	"""Action: look up the session.customer's active Member Subscription and
	stamp end_date / status into session_data."""
	if not session.customer:
		return "I need to know who you are first. Can you share your member ID or phone number?"
	sub = frappe.db.get_value(
		"Member Subscription",
		{
			"customer": session.customer,
			"docstatus": 1,
			"status": ["in", ["Active", "Frozen", "Lapsed"]],
		},
		["name", "status", "end_date", "membership_plan"],
		as_dict=True,
		order_by="end_date desc",
	)
	data = _load_session_data(session)
	if sub:
		data["subscription_name"] = sub.name
		data["subscription_status"] = sub.status
		data["subscription_end_date"] = str(sub.end_date)
		data["membership_plan"] = sub.membership_plan
	else:
		data["subscription_status"] = "NONE"
	_save_session_data(session, data)
	return None


def _action_lookup_class_schedule(session, user_text: str) -> str | None:
	"""Action: list active classes for today at the session's branch."""
	from datetime import date

	today = date.today()
	weekday_field = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")[today.weekday()]
	schedules = frappe.get_all(
		"Class Schedule",
		filters={"is_active": 1, weekday_field: 1},
		fields=["schedule_name", "start_time", "class_type"],
		order_by="start_time asc",
		limit=10,
	)
	if not schedules:
		return "No classes scheduled today."
	lines = ["Today's classes:"]
	for s in schedules:
		lines.append(f"• {s.start_time} — {s.class_type} ({s.schedule_name})")
	return "\n".join(lines)


def _action_create_member_request(session, user_text: str) -> str | None:
	"""Action: create a Member Request from the conversation."""
	data = _load_session_data(session)
	doc = frappe.new_doc("Member Request")
	doc.customer = session.customer
	doc.request_type = data.get("request_type", "Other")
	doc.subject = data.get("subject") or "Chatbot inquiry"
	doc.description = data.get("description") or user_text
	doc.channel = "WhatsApp" if session.channel == "WhatsApp" else "Member Portal"
	doc.submitted_on = now_datetime()
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	data["member_request_name"] = doc.name
	_save_session_data(session, data)
	return f"Created request {doc.name}. A team member will follow up shortly."


def _action_register_lead(session, user_text: str) -> str | None:
	"""Action: create an ERPNext Lead from the conversation data.

	Phone falls back to session.phone_number (it's how the user reached us),
	so the flow only needs to ask for name + goal. The captured goal/context
	is left in session_data — staff can read it from the linked Chatbot
	Session, since ERPNext Lead.notes is a child-table field (CRM Note),
	not a free-text field.
	"""
	data = _load_session_data(session)
	name_val = data.get("name")
	phone_val = data.get("phone") or session.phone_number
	if not (name_val and phone_val):
		return "I need your full name first."
	source = "WhatsApp Bot"
	if not frappe.db.exists("Lead Source", source):
		frappe.get_doc({"doctype": "Lead Source", "source_name": source}).insert(
			ignore_permissions=True
		)
	lead = frappe.new_doc("Lead")
	lead.lead_name = name_val
	lead.mobile_no = phone_val
	lead.source = source
	lead.insert(ignore_permissions=True)
	frappe.db.commit()
	data["lead_name"] = lead.name
	_save_session_data(session, data)
	return None


def _action_show_hours(session, user_text: str) -> str | None:
	"""Action: read the gym's operating hours from Brand Settings / Gym Settings
	and reply with them."""
	# Phase 5 polish: pull from Gym Settings when operating-hours fields are added.
	# For now, return a placeholder pulled from Brand Settings if available.
	hours = frappe.db.get_single_value("Brand Settings", "physical_address") or ""
	return "Our operating hours: Mon-Fri 5:00 AM - 10:00 PM, Sat-Sun 7:00 AM - 8:00 PM.\nLocation: " + (hours or "see our website")


ACTION_REGISTRY: dict[str, Callable] = {
	"lookup_subscription": _action_lookup_subscription,
	"lookup_class_schedule": _action_lookup_class_schedule,
	"create_member_request": _action_create_member_request,
	"register_lead": _action_register_lead,
	"show_hours": _action_show_hours,
}


# ============================================================================
# Engine — walks the flow per turn
# ============================================================================


@frappe.whitelist(allow_guest=True)
def handle_inbound(phone_number: str, text: str, channel: str = "WhatsApp") -> dict:
	"""Process one inbound message. Returns {replies: [str], session: name}."""
	from gym_management.gym_management.doctype.chatbot_flow.chatbot_flow import (
		find_matching_flow,
		get_node,
	)

	text = (text or "").strip()
	if not text:
		return {"replies": [], "session": None}

	session = _get_or_create_session(phone_number, channel)
	session.last_message_at = now_datetime()
	session.turn_count = (session.turn_count or 0) + 1

	# Universal cancel keyword
	if text.lower() in ("cancel", "stop", "exit", "quit", "menu"):
		session.current_flow = None
		session.current_node_key = None
		session.unmatched_turn_count = 0
		session.save(ignore_permissions=True)
		frappe.db.commit()
		return {
			"replies": ["Got it. How can I help? Try: renew, book class, hours, trial, help"],
			"session": session.name,
		}

	# No active flow → try to match a trigger keyword
	if not session.current_flow:
		flow_name = find_matching_flow(text, channel=channel, language=session.language or "en")
		if not flow_name:
			session.unmatched_turn_count = (session.unmatched_turn_count or 0) + 1
			if session.unmatched_turn_count >= 3:
				return _hand_over(session, "I'm not sure what you need. Connecting you to a team member.")
			session.save(ignore_permissions=True)
			frappe.db.commit()
			return {
				"replies": [
					"I didn't catch that. Try: renew, book class, hours, trial, or type 'help' to talk to staff."
				],
				"session": session.name,
			}
		# Start the matched flow at its start_node_key
		start_key = frappe.db.get_value("Chatbot Flow", flow_name, "start_node_key")
		session.current_flow = flow_name
		session.current_node_key = start_key
		session.unmatched_turn_count = 0

	# Walk nodes until we hit a Question (wait for input) or terminal state.
	replies: list[str] = []
	max_hops = 10  # cap to prevent runaway flows
	for _ in range(max_hops):
		node = get_node(session.current_flow, session.current_node_key)
		if not node:
			# Misconfigured flow — broken pointer
			frappe.log_error(
				f"chatbot.handle_inbound: node {session.current_node_key!r} not found in flow {session.current_flow!r}",
				"chatbot.engine",
			)
			session.status = "Abandoned"
			session.save(ignore_permissions=True)
			frappe.db.commit()
			return {
				"replies": ["Something went wrong on my end. A team member will help shortly."],
				"session": session.name,
			}

		# Render prompt with session_data substitutions
		prompt = _render(node.get("prompt_text") or "", session)

		if node["node_type"] == "Message":
			if prompt:
				replies.append(prompt)
			session.current_node_key = node.get("next_node_key")
			if not session.current_node_key:
				_complete(session)
				break
			continue

		elif node["node_type"] == "Question":
			data = _load_session_data(session)
			awaiting = data.get("_awaiting")
			if awaiting == node["node_key"]:
				# User is replying to this question — capture and advance.
				capture = node.get("capture_key")
				if capture:
					data[capture] = text
				data.pop("_awaiting", None)
				_save_session_data(session, data)
				session.current_node_key = node.get("next_node_key")
				if not session.current_node_key:
					_complete(session)
					break
				continue
			# First entry — send prompt, mark awaiting, exit.
			if prompt:
				replies.append(prompt)
			data["_awaiting"] = node["node_key"]
			_save_session_data(session, data)
			session.save(ignore_permissions=True)
			frappe.db.commit()
			return {"replies": replies, "session": session.name}

		elif node["node_type"] == "Branch":
			next_key = _evaluate_branch(node, text)
			if next_key:
				session.current_node_key = next_key
				continue
			# No branch matched — fall back to default next_node
			session.unmatched_turn_count = (session.unmatched_turn_count or 0) + 1
			if session.unmatched_turn_count >= 3:
				return _hand_over(session, "I'm having trouble understanding. Let me get you to a team member.")
			session.current_node_key = node.get("next_node_key")
			if not session.current_node_key:
				_complete(session)
				break
			continue

		elif node["node_type"] == "Action":
			action_name = node.get("linked_action")
			handler = ACTION_REGISTRY.get(action_name) if action_name else None
			if not handler:
				frappe.log_error(
					f"chatbot: action {action_name!r} not registered (node {node['node_key']!r})",
					"chatbot.engine",
				)
			else:
				try:
					action_reply = handler(session, text)
					if action_reply:
						replies.append(action_reply)
				except Exception:
					frappe.log_error(frappe.get_traceback(), "chatbot.action")
			session.current_node_key = node.get("next_node_key")
			if not session.current_node_key:
				_complete(session)
				break
			continue

		elif node["node_type"] == "Handover":
			return _hand_over(session, prompt or "A team member will help you shortly.")

		else:
			# Unknown node_type — log and end
			frappe.log_error(
				f"chatbot: unknown node_type {node['node_type']!r} in {node['node_key']!r}",
				"chatbot.engine",
			)
			break

	session.save(ignore_permissions=True)
	frappe.db.commit()
	return {"replies": replies, "session": session.name}


# ============================================================================
# Internal helpers
# ============================================================================


def _get_or_create_session(phone_number: str, channel: str):
	"""Find an Active session for the phone+channel; create one if none."""
	existing = frappe.db.get_value(
		"Chatbot Session",
		{
			"phone_number": phone_number,
			"channel": channel,
			"status": "Active",
		},
		"name",
	)
	if existing:
		return frappe.get_doc("Chatbot Session", existing)

	doc = frappe.new_doc("Chatbot Session")
	doc.phone_number = phone_number
	doc.channel = channel
	doc.status = "Active"
	doc.started_at = now_datetime()
	doc.last_message_at = now_datetime()
	doc.turn_count = 0
	doc.unmatched_turn_count = 0
	# Best-effort customer resolution by phone
	customer = _resolve_customer_by_phone(phone_number)
	if customer:
		doc.customer = customer
	doc.insert(ignore_permissions=True)
	return doc


def _resolve_customer_by_phone(phone_number: str) -> str | None:
	"""Find the Customer whose Member Profile has this phone."""
	mp = frappe.db.get_value("Member Profile", {"phone": phone_number}, "customer")
	return mp


def _render(text: str, session) -> str:
	"""Substitute {{var_name}} from session_data into the text."""
	data = _load_session_data(session)
	if not text or "{{" not in text:
		return text or ""

	def _sub(match: re.Match) -> str:
		key = match.group(1).strip()
		return str(data.get(key, match.group(0)))

	return re.sub(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}", _sub, text)


def _evaluate_branch(node: dict, user_text: str) -> str | None:
	"""Walk branch_conditions JSON dict — first matching pattern wins."""
	conditions_raw = node.get("branch_conditions")
	if not conditions_raw:
		return None
	try:
		conditions = json.loads(conditions_raw)
	except json.JSONDecodeError:
		return None
	if not isinstance(conditions, dict):
		return None
	text_lc = user_text.lower()
	for pattern, target in conditions.items():
		# Pattern is pipe-separated keywords; any one substring match wins
		for kw in pattern.lower().split("|"):
			kw = kw.strip()
			if kw and kw in text_lc:
				return target
	return None


def _load_session_data(session) -> dict:
	if not session.session_data:
		return {}
	try:
		return json.loads(session.session_data)
	except json.JSONDecodeError:
		return {}


def _save_session_data(session, data: dict):
	session.session_data = json.dumps(data, indent=2)


def _complete(session):
	session.status = "Completed"
	session.completed_at = now_datetime()
	session.current_flow = None
	session.current_node_key = None


def _hand_over(session, message: str) -> dict:
	"""End the session, create a Member Request for staff to pick up."""
	doc = frappe.new_doc("Member Request")
	doc.customer = session.customer or ""
	doc.request_type = "Other"
	doc.subject = "Chatbot handover"
	doc.description = (
		f"Chatbot session {session.name} reached handover.\n"
		f"Phone: {session.phone_number}\n"
		f"Flow: {session.current_flow}\n"
		f"Captured data: {session.session_data or '{}'}"
	)
	doc.channel = "WhatsApp" if session.channel == "WhatsApp" else "Member Portal"
	doc.submitted_on = now_datetime()
	doc.priority = "Medium"
	if not doc.customer:
		# Skip the link entirely if no customer
		doc.customer = None
	try:
		doc.insert(ignore_permissions=True)
		session.handover_member_request = doc.name
	except Exception:
		frappe.log_error(frappe.get_traceback(), "chatbot._hand_over")

	session.status = "Handed Over"
	session.completed_at = now_datetime()
	session.save(ignore_permissions=True)
	frappe.db.commit()
	return {"replies": [message], "session": session.name}
