"""Marketing surfaces for the admin frontend: campaigns, WhatsApp templates,
chatbot, and referrals.

Most heavy lifting already lives elsewhere — WhatsApp template submission /
Meta sync on the WhatsApp Template controller, the referral state machine on
the Referral controller, renewal-reminder sending in campaigns.py. This module
adds the read + create surfaces the React app needs and re-exposes a couple of
existing actions under one namespace.

Public API:
  Summary:   marketing_summary
  Campaigns: list_campaigns, create_campaign, run_renewal_reminders
  Templates: list_templates, create_template
             (submit / sync reuse whatsapp_template.{submit,sync_status_from_meta})
  Chatbot:   list_chatbot_flows, flow_detail, list_chatbot_sessions
  Referrals: list_referrals, create_referral
             (advance reuse referral.{mark_signed_up,mark_first_payment,mark_reward_paid})
"""

from __future__ import annotations

import frappe
from frappe.utils import flt, today


def _customer_names(ids: list[str]) -> dict:
	ids = [i for i in ids if i]
	if not ids:
		return {}
	return {
		c.name: c.customer_name
		for c in frappe.get_all(
			"Customer", filters={"name": ["in", ids]}, fields=["name", "customer_name"]
		)
	}


@frappe.whitelist()
def marketing_summary() -> dict:
	return {
		"campaigns_sent": frappe.db.count("Campaign Send Log", {"status": "Sent"}),
		"templates_approved": frappe.db.count("WhatsApp Template", {"status": "Approved"}),
		"active_referrals": frappe.db.count(
			"Referral", {"status": ["in", ["Pending", "Signed Up", "First Payment", "Reward Earned"]]}
		),
		"chatbot_sessions": frappe.db.count("Chatbot Session"),
	}


# ---------------------------------------------------------------------------
# Campaigns
# ---------------------------------------------------------------------------


@frappe.whitelist()
def list_campaigns(limit: int = 50) -> list[dict]:
	rows = frappe.get_all(
		"Campaign Send Log",
		fields=[
			"name", "campaign_name", "channel", "status", "segment", "target_count",
			"sent_at", "delivered", "opened", "clicked", "delivery_rate", "open_rate",
			"click_rate", "estimated_cost", "actual_cost",
		],
		order_by="creation desc",
		limit=int(limit),
	)
	for r in rows:
		r["sent_at"] = str(r.sent_at) if r.sent_at else None
		for k in ("delivery_rate", "open_rate", "click_rate", "estimated_cost", "actual_cost"):
			r[k] = flt(r.get(k))
	return rows


@frappe.whitelist()
def create_campaign(
	campaign_name: str,
	channel: str = "WhatsApp",
	segment: str | None = None,
	target_count: int = 0,
	linked_whatsapp_template: str | None = None,
	estimated_cost: float = 0,
) -> dict:
	doc = frappe.get_doc(
		{
			"doctype": "Campaign Send Log",
			"campaign_name": campaign_name,
			"channel": channel,
			"status": "Draft",
			"segment": segment,
			"target_count": int(target_count or 0),
			"linked_whatsapp_template": linked_whatsapp_template,
			"estimated_cost": flt(estimated_cost),
		}
	)
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True, "name": doc.name}


@frappe.whitelist()
def run_renewal_reminders() -> dict:
	"""Trigger the renewal-reminder campaign (also a daily scheduled task).
	Guarded so a missing WhatsApp channel in dev returns a reason, not a 500."""
	try:
		from gym_management.campaigns import run_renewal_reminders as _run

		result = _run()
		frappe.db.commit()
		return {"ok": True, "result": result}
	except Exception as e:
		return {"ok": False, "reason": str(e)}


# ---------------------------------------------------------------------------
# WhatsApp Templates
# ---------------------------------------------------------------------------


@frappe.whitelist()
def list_templates() -> list[dict]:
	rows = frappe.get_all(
		"WhatsApp Template",
		fields=[
			"name", "template_name", "category", "language", "status", "is_active",
			"body_text", "header_text", "footer_text", "placeholder_count",
			"send_count", "last_used_on", "rejection_reason", "meta_template_id",
		],
		order_by="modified desc",
	)
	for r in rows:
		r["is_active"] = int(r.is_active or 0)
		r["send_count"] = int(r.send_count or 0)
		r["placeholder_count"] = int(r.placeholder_count or 0)
		r["last_used_on"] = str(r.last_used_on) if r.last_used_on else None
	return rows


@frappe.whitelist()
def create_template(
	template_name: str,
	body_text: str,
	category: str = "UTILITY",
	language: str = "en",
	header_text: str | None = None,
	footer_text: str | None = None,
	example_values: str | None = None,
) -> dict:
	doc = frappe.get_doc(
		{
			"doctype": "WhatsApp Template",
			"template_name": template_name,
			"category": category,
			"language": language,
			"status": "Pending",
			"body_text": body_text,
			"header_text": header_text,
			"footer_text": footer_text,
			"example_values": example_values,
			"is_active": 1,
		}
	)
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True, "name": doc.name}


# ---------------------------------------------------------------------------
# Chatbot
# ---------------------------------------------------------------------------


@frappe.whitelist()
def list_chatbot_flows() -> list[dict]:
	rows = frappe.get_all(
		"Chatbot Flow",
		fields=["name", "flow_name", "channel", "language", "is_active", "trigger_keywords", "start_node_key", "description"],
		order_by="modified desc",
	)
	for r in rows:
		r["is_active"] = int(r.is_active or 0)
		r["node_count"] = frappe.db.count("Chatbot Node", {"parent": r.name})
	return rows


@frappe.whitelist()
def flow_detail(flow: str) -> dict:
	doc = frappe.get_doc("Chatbot Flow", flow)
	nodes = [
		{
			"node_key": n.node_key,
			"node_type": n.node_type,
			"prompt_text": n.prompt_text,
			"next_node_key": n.next_node_key,
			"linked_action": n.linked_action,
			"order_index": n.order_index,
		}
		for n in sorted(doc.nodes, key=lambda x: x.order_index or 0)
	]
	return {
		"name": doc.name,
		"flow_name": doc.flow_name,
		"channel": doc.channel,
		"is_active": int(doc.is_active or 0),
		"trigger_keywords": doc.trigger_keywords,
		"start_node_key": doc.start_node_key,
		"nodes": nodes,
	}


@frappe.whitelist()
def list_chatbot_sessions(limit: int = 50) -> list[dict]:
	rows = frappe.get_all(
		"Chatbot Session",
		fields=[
			"name", "phone_number", "channel", "customer", "status", "current_flow",
			"turn_count", "started_at", "last_message_at",
		],
		order_by="last_message_at desc",
		limit=int(limit),
	)
	cust = _customer_names([r.customer for r in rows if r.customer])
	for r in rows:
		r["customer_name"] = cust.get(r.customer)
		r["turn_count"] = int(r.turn_count or 0)
		r["started_at"] = str(r.started_at) if r.started_at else None
		r["last_message_at"] = str(r.last_message_at) if r.last_message_at else None
	return rows


# ---------------------------------------------------------------------------
# Referrals
# ---------------------------------------------------------------------------


@frappe.whitelist()
def list_referrals(limit: int = 100) -> list[dict]:
	rows = frappe.get_all(
		"Referral",
		fields=[
			"name", "referrer_customer", "referred_customer", "referred_lead",
			"referred_on", "channel", "status", "reward_type", "reward_value",
			"reward_paid_on",
		],
		order_by="referred_on desc",
		limit=int(limit),
	)
	ids = [r.referrer_customer for r in rows] + [r.referred_customer for r in rows]
	names = _customer_names(ids)
	lead_ids = [r.referred_lead for r in rows if r.referred_lead]
	lead_names = (
		{
			l.name: l.lead_name
			for l in frappe.get_all(
				"Lead", filters={"name": ["in", lead_ids]}, fields=["name", "lead_name"]
			)
		}
		if lead_ids
		else {}
	)
	for r in rows:
		r["referrer_name"] = names.get(r.referrer_customer, r.referrer_customer)
		r["referred_name"] = (
			names.get(r.referred_customer)
			or lead_names.get(r.referred_lead)
			or "—"
		)
		r["reward_value"] = flt(r.reward_value)
		r["referred_on"] = str(r.referred_on) if r.referred_on else None
		r["reward_paid_on"] = str(r.reward_paid_on) if r.reward_paid_on else None
	return rows


@frappe.whitelist()
def create_referral(
	referrer_customer: str,
	referred_name: str | None = None,
	referred_phone: str | None = None,
	referred_customer: str | None = None,
	channel: str = "Word of Mouth",
	reward_type: str | None = None,
	reward_value: float = 0,
) -> dict:
	"""A member refers someone. The referred person is usually a prospect, so
	when only a name is given we mint a Lead and link it."""
	referred_lead = None
	if not referred_customer and (referred_name or "").strip():
		lead = frappe.get_doc(
			{
				"doctype": "Lead",
				"lead_name": referred_name.strip(),
				"mobile_no": referred_phone,
			}
		)
		lead.flags.ignore_mandatory = True
		lead.insert(ignore_permissions=True, ignore_mandatory=True)
		referred_lead = lead.name

	doc = frappe.get_doc(
		{
			"doctype": "Referral",
			"referrer_customer": referrer_customer,
			"referred_customer": referred_customer,
			"referred_lead": referred_lead,
			"referred_on": today(),
			"channel": channel,
			"reward_type": reward_type,
			"reward_value": flt(reward_value),
		}
	)
	# Referrals advance through their workflow (Signed Up → … → Reward Paid)
	# while in draft; they're submitted only at the terminal reward stage.
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True, "name": doc.name, "status": doc.status}
