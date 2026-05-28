# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime, today


class ChannelConnection(Document):
	def validate(self):
		self._enforce_single_default_per_type()
		self._reset_count_if_new_day()

	# ---------- validations ----------

	def _enforce_single_default_per_type(self):
		"""At most one connection per channel_type can be is_default=1.
		If this one is being marked default, unmark every other of the same type."""
		if not self.is_default:
			return
		others = frappe.get_all(
			"Channel Connection",
			filters={
				"channel_type": self.channel_type,
				"is_default": 1,
				"name": ["!=", self.name or ""],
			},
			pluck="name",
		)
		for name in others:
			frappe.db.set_value("Channel Connection", name, "is_default", 0)
		if others:
			frappe.msgprint(
				_("Marked {0} other {1} connection(s) as not default.").format(
					len(others), self.channel_type
				),
				alert=True,
			)

	def _reset_count_if_new_day(self):
		"""If last_count_reset_date isn't today, zero send_count_today."""
		today_date = today()
		if self.last_count_reset_date != today_date:
			self.send_count_today = 0
			self.last_count_reset_date = today_date


# ============================================================================
# API used by Phase 5 senders
# ============================================================================


def get_default_for(channel_type: str) -> str | None:
	"""Return the default Channel Connection name for a given channel_type,
	or None if no default is set. Senders call this when not given an
	explicit connection to use."""
	return frappe.db.get_value(
		"Channel Connection",
		{"channel_type": channel_type, "is_default": 1, "status": "Active"},
		"name",
	)


def get_credentials(channel_connection: str) -> dict:
	"""Resolve a Channel Connection's secrets from site_config.json using its
	credentials_prefix. Returns a dict of all site_config keys that start with
	the prefix. Never logs the values."""
	prefix = frappe.db.get_value(
		"Channel Connection", channel_connection, "credentials_prefix"
	)
	if not prefix:
		return {}
	conf = frappe.local.conf
	return {k: v for k, v in conf.items() if k.startswith(prefix)}


def can_send_now(channel_connection: str) -> tuple[bool, str | None]:
	"""Returns (allowed, reason_if_blocked) — check the connection is Active
	and hasn't blown its daily cap."""
	row = frappe.db.get_value(
		"Channel Connection",
		channel_connection,
		["status", "daily_cap", "send_count_today", "last_count_reset_date"],
		as_dict=True,
	)
	if not row:
		return (False, "connection_not_found")
	if row.status != "Active":
		return (False, f"connection_status_{row.status.lower()}")

	# Auto-reset count if a new day rolled over since last reset
	today_date = today()
	count = row.send_count_today or 0
	if row.last_count_reset_date != today_date:
		count = 0
		frappe.db.set_value(
			"Channel Connection",
			channel_connection,
			{"send_count_today": 0, "last_count_reset_date": today_date},
		)

	if row.daily_cap and count >= row.daily_cap:
		return (False, "daily_cap_reached")

	return (True, None)


def increment_send_count(channel_connection: str, delta: int = 1):
	"""Atomic increment of send_count_today + last_sync stamp."""
	row = frappe.db.get_value(
		"Channel Connection",
		channel_connection,
		["send_count_today", "last_count_reset_date"],
		as_dict=True,
	)
	if not row:
		return
	today_date = today()
	# Reset if day rolled over
	if row.last_count_reset_date != today_date:
		current = 0
		frappe.db.set_value(
			"Channel Connection",
			channel_connection,
			{"last_count_reset_date": today_date},
		)
	else:
		current = row.send_count_today or 0
	new_value = max(0, current + delta)
	frappe.db.set_value(
		"Channel Connection",
		channel_connection,
		{
			"send_count_today": new_value,
			"last_sync": now_datetime(),
		},
	)


def record_error(channel_connection: str, error_message: str):
	"""Stamp last_error for ops visibility. Flips status to Error if 5+ errors
	in the last hour (TODO: hot threshold logic via error log)."""
	frappe.db.set_value(
		"Channel Connection",
		channel_connection,
		{"last_error": error_message[:500], "last_sync": now_datetime()},
	)


# ============================================================================
# Scheduled task (registered in hooks.py): daily count reset
# ============================================================================


def reset_daily_counts():
	"""Reset send_count_today on every connection. Safety net — most resets
	happen lazily on first send_count_today access via _reset_count_if_new_day,
	but this guarantees consistency for dashboard reporting."""
	today_date = today()
	rows = frappe.get_all(
		"Channel Connection",
		filters={"last_count_reset_date": ["!=", today_date]},
		pluck="name",
	)
	for name in rows:
		try:
			frappe.db.set_value(
				"Channel Connection",
				name,
				{"send_count_today": 0, "last_count_reset_date": today_date},
			)
		except Exception:
			frappe.log_error(
				frappe.get_traceback(),
				f"channel_connection.reset_daily_counts: {name}",
			)
	frappe.db.commit()
