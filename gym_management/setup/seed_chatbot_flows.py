"""Seed production-ready Chatbot Flows.

Idempotent — re-running deletes any prior seeded flows (by flow_name) before
recreating them, so this can be run after engine edits without manual cleanup.

Run via:
  bench --site <site> execute gym_management.setup.seed_chatbot_flows.run

Flows seeded:
  menu          — greeting + list of options (triggers: hi, hello, menu, start, options)
  renew         — looks up subscription, confirms, hands off to staff for payment link
  book_class    — shows today's class list, hands off to staff to confirm booking
  hours         — opening hours + location (deterministic, no handover)
  trial         — captures name + goal, creates Lead, confirms
  help          — instant handover with full conversation context
"""

import frappe


# ============================================================================
# Flow definitions — each is a (flow_name, dict-of-fields, [nodes]) tuple
# ============================================================================


FLOWS = [
	# ------------------------------------------------------------------------
	# MENU — first-touch greeting
	# ------------------------------------------------------------------------
	{
		"flow_name": "menu",
		"channel": "Both",
		"language": "en",
		"is_active": 1,
		"trigger_keywords": "hi,hello,hey,menu,options",
		"fallback_to_human": 3,
		"start_node_key": "intro",
		"description": "Greeting + list of available options",
		"nodes": [
			{
				"node_key": "intro",
				"node_type": "Message",
				"prompt_text": (
					"Hi! 👋 How can I help today?\n\n"
					"• *renew* — pay/renew your membership\n"
					"• *book* — book a class\n"
					"• *hours* — opening hours & location\n"
					"• *trial* — get a free trial pass\n"
					"• *help* — talk to a team member\n\n"
					"Just type one of those words."
				),
			},
		],
	},
	# ------------------------------------------------------------------------
	# RENEW — lookup subscription, confirm, handover with payment link
	# ------------------------------------------------------------------------
	{
		"flow_name": "renew",
		"channel": "Both",
		"language": "en",
		"is_active": 1,
		"trigger_keywords": "renew,renewal,pay,payment,subscribe,subscription",
		"fallback_to_human": 3,
		"start_node_key": "greet",
		"description": "Check membership status and route to renewal",
		"nodes": [
			{
				"node_key": "greet",
				"node_type": "Message",
				"prompt_text": "Let me check your membership… one moment.",
				"next_node_key": "lookup",
			},
			{
				"node_key": "lookup",
				"node_type": "Action",
				"linked_action": "lookup_subscription",
				"next_node_key": "show_status",
			},
			{
				"node_key": "show_status",
				"node_type": "Message",
				"prompt_text": (
					"📋 *Membership Status*\n"
					"Plan: {{membership_plan}}\n"
					"Status: {{subscription_status}}\n"
					"Expires: {{subscription_end_date}}\n\n"
					"Reply *YES* to renew now, or *NO* to cancel."
				),
				"next_node_key": "ask_confirm",
			},
			{
				"node_key": "ask_confirm",
				"node_type": "Question",
				"prompt_text": "",
				"next_node_key": "confirm_branch",
			},
			{
				"node_key": "confirm_branch",
				"node_type": "Branch",
				"branch_conditions": (
					'{"yes|y|sure|renew|ok": "do_handover", '
					'"no|n|cancel|stop": "cancel_msg"}'
				),
				"next_node_key": "cancel_msg",
			},
			{
				"node_key": "do_handover",
				"node_type": "Handover",
				"prompt_text": (
					"Got it ✅ A team member will send you the M-Pesa "
					"payment link in the next few minutes."
				),
			},
			{
				"node_key": "cancel_msg",
				"node_type": "Message",
				"prompt_text": "No problem 👍 Type *renew* anytime to start again.",
			},
		],
	},
	# ------------------------------------------------------------------------
	# BOOK CLASS — show schedule, hand over for confirmation
	# ------------------------------------------------------------------------
	{
		"flow_name": "book_class",
		"channel": "Both",
		"language": "en",
		"is_active": 1,
		"trigger_keywords": "book,booking,class,classes,schedule",
		"fallback_to_human": 3,
		"start_node_key": "fetch_schedule",
		"description": "Show today's classes and route booking request",
		"nodes": [
			{
				"node_key": "fetch_schedule",
				"node_type": "Action",
				"linked_action": "lookup_class_schedule",
				"next_node_key": "ask_choice",
			},
			{
				"node_key": "ask_choice",
				"node_type": "Question",
				"prompt_text": (
					"\nReply with the class name you'd like to book "
					"(e.g. 'Spin 6pm'), or type *cancel* to exit."
				),
				"capture_key": "requested_class",
				"next_node_key": "book_handover",
			},
			{
				"node_key": "book_handover",
				"node_type": "Handover",
				"prompt_text": (
					"Booking *{{requested_class}}* for you ✅ "
					"A team member will confirm your slot shortly."
				),
			},
		],
	},
	# ------------------------------------------------------------------------
	# HOURS — fully deterministic, no handover
	# ------------------------------------------------------------------------
	{
		"flow_name": "hours",
		"channel": "Both",
		"language": "en",
		"is_active": 1,
		"trigger_keywords": "hours,open,opening,time,times,location,where,address",
		"fallback_to_human": 3,
		"start_node_key": "show",
		"description": "Operating hours + location",
		"nodes": [
			{
				"node_key": "show",
				"node_type": "Action",
				"linked_action": "show_hours",
				"next_node_key": "outro",
			},
			{
				"node_key": "outro",
				"node_type": "Message",
				"prompt_text": "Anything else? Type *menu* to see all options.",
			},
		],
	},
	# ------------------------------------------------------------------------
	# TRIAL — capture name + goal, create Lead, confirm
	# ------------------------------------------------------------------------
	{
		"flow_name": "trial",
		"channel": "Both",
		"language": "en",
		"is_active": 1,
		"trigger_keywords": "trial,free,signup,join,starter",
		"fallback_to_human": 3,
		"start_node_key": "welcome",
		"description": "Free trial signup — captures name + goal, creates Lead",
		"nodes": [
			{
				"node_key": "welcome",
				"node_type": "Message",
				"prompt_text": (
					"Awesome — let's get you a *free trial pass* 🎉\n"
					"I just need two quick things."
				),
				"next_node_key": "ask_name",
			},
			{
				"node_key": "ask_name",
				"node_type": "Question",
				"prompt_text": "What's your *full name*?",
				"capture_key": "name",
				"next_node_key": "ask_goal",
			},
			{
				"node_key": "ask_goal",
				"node_type": "Question",
				"prompt_text": (
					"Nice to meet you, {{name}}!\n"
					"What's your *fitness goal*? (e.g. lose weight, build muscle, "
					"general fitness, rehab)"
				),
				"capture_key": "goal",
				"next_node_key": "create_lead",
			},
			{
				"node_key": "create_lead",
				"node_type": "Action",
				"linked_action": "register_lead",
				"next_node_key": "confirm",
			},
			{
				"node_key": "confirm",
				"node_type": "Message",
				"prompt_text": (
					"All set ✅\n"
					"A team member will reach out to schedule your *free trial visit*. "
					"See you soon, {{name}}!"
				),
			},
		],
	},
	# ------------------------------------------------------------------------
	# HELP — instant handover
	# ------------------------------------------------------------------------
	{
		"flow_name": "help",
		"channel": "Both",
		"language": "en",
		"is_active": 1,
		"trigger_keywords": "help,staff,agent,human,support,talk,person",
		"fallback_to_human": 3,
		"start_node_key": "do_handover",
		"description": "Direct handover to staff",
		"nodes": [
			{
				"node_key": "do_handover",
				"node_type": "Handover",
				"prompt_text": (
					"Connecting you to a team member now 👤\n"
					"Someone will reply here shortly."
				),
			},
		],
	},
]


# ============================================================================
# Entry point
# ============================================================================


def run():
	"""Idempotently re-seed all flows. Safe to re-run after engine edits."""
	created: list[str] = []
	for spec in FLOWS:
		name = spec["flow_name"]
		# Drop any previous version so re-runs are clean
		if frappe.db.exists("Chatbot Flow", name):
			frappe.delete_doc("Chatbot Flow", name, force=1)
		doc = frappe.new_doc("Chatbot Flow")
		doc.flow_name = name
		doc.channel = spec["channel"]
		doc.language = spec["language"]
		doc.is_active = spec["is_active"]
		doc.trigger_keywords = spec["trigger_keywords"]
		doc.fallback_to_human = spec["fallback_to_human"]
		doc.start_node_key = spec["start_node_key"]
		doc.description = spec.get("description", "")
		for node in spec["nodes"]:
			doc.append("nodes", node)
		doc.insert(ignore_permissions=True)
		created.append(name)
	frappe.db.commit()
	print(f"Seeded {len(created)} chatbot flows: {', '.join(created)}")
	return created
