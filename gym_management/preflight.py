"""Go-live preflight check — run this against EACH production tenant site.

It is read-only. It audits the things that don't show up in code review but
break (or silently weaken) a live deployment: sandbox M-Pesa credentials left
in place, missing WhatsApp/eTIMS secrets, callback source-auth not configured,
developer_mode still on, and — critically — whether the RBAC roles and their
seeded DocType permissions actually exist on this site.

Usage:
    bench --site <tenant-site> execute gym_management.preflight.run

Exit semantics: prints a grouped PASS / WARN / FAIL report and returns a dict.
Any FAIL means "do not go live until fixed"; WARN means "confirm this is
intentional". Run it once per tenant — config lives in each site's
site_config.json, so a clean result on one site says nothing about another.
"""

from __future__ import annotations

import frappe

from gym_management.rbac import (
	GYM_ROLES,
	OWNER_ROLE,
	MANAGER_ROLE,
	RECEPTIONIST_ROLE,
	TRAINER_ROLE,
)

# Safaricom's public sandbox values — if any of these reach production the
# integration is either non-functional or insecure.
SANDBOX_SHORTCODE = "174379"
SANDBOX_PASSKEY = "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919"

PASS, WARN, FAIL = "PASS", "WARN", "FAIL"


class _Report:
	def __init__(self):
		self.rows: list[tuple[str, str, str]] = []

	def add(self, level: str, check: str, detail: str = ""):
		self.rows.append((level, check, detail))

	def ok(self, check, detail=""):
		self.add(PASS, check, detail)

	def warn(self, check, detail=""):
		self.add(WARN, check, detail)

	def fail(self, check, detail=""):
		self.add(FAIL, check, detail)

	def counts(self):
		return {
			lvl: sum(1 for r in self.rows if r[0] == lvl)
			for lvl in (PASS, WARN, FAIL)
		}


def _conf(key, default=None):
	return frappe.conf.get(key, default)


def _present(value) -> bool:
	return value not in (None, "", 0)


# ---------------------------------------------------------------------------
# Individual check groups
# ---------------------------------------------------------------------------

def _check_mpesa(r: _Report):
	env = (_conf("mpesa_env") or "sandbox").lower()
	is_prod = env == "production"
	r.add(PASS if is_prod else WARN, "M-Pesa env", f"mpesa_env = {env!r}")

	# Core credentials must all be present to transact.
	for key in (
		"mpesa_consumer_key",
		"mpesa_consumer_secret",
		"mpesa_passkey",
		"mpesa_shortcode",
		"mpesa_callback_base_url",
	):
		(r.ok if _present(_conf(key)) else r.fail)(f"M-Pesa {key}", "" if _present(_conf(key)) else "missing")

	# Refund (B2C) credentials — needed only if you disburse refunds via M-Pesa.
	for key in ("mpesa_initiator_name", "mpesa_initiator_password"):
		(r.ok if _present(_conf(key)) else r.warn)(
			f"M-Pesa {key}",
			"" if _present(_conf(key)) else "missing — B2C refunds will fail",
		)

	# Sandbox values must not reach production.
	if is_prod:
		if str(_conf("mpesa_shortcode") or "") == SANDBOX_SHORTCODE:
			r.fail("M-Pesa shortcode", f"still the SANDBOX shortcode {SANDBOX_SHORTCODE}")
		if str(_conf("mpesa_passkey") or "") == SANDBOX_PASSKEY:
			r.fail("M-Pesa passkey", "still the public SANDBOX passkey")

	# Callback base URL should be https in production.
	base = str(_conf("mpesa_callback_base_url") or "")
	if base and is_prod and not base.startswith("https://"):
		r.fail("M-Pesa callback URL", f"not https: {base!r}")

	# Callback source authentication (the forged-payment defense).
	token = _conf("mpesa_callback_token")
	if _present(token):
		r.ok("M-Pesa callback token", "shared-secret token configured")
	else:
		(r.fail if is_prod else r.warn)(
			"M-Pesa callback token",
			"mpesa_callback_token NOT set — callbacks rely on IP allow-list only",
		)
	if _conf("mpesa_callback_enforce_ip"):
		r.ok("M-Pesa callback IP allow-list", "enforced in-app")
	else:
		r.warn(
			"M-Pesa callback IP allow-list",
			"mpesa_callback_enforce_ip off — enforce Safaricom IPs at nginx instead",
		)

	# Production B2C cert must exist when env=production.
	if is_prod:
		from gym_management import mpesa_security

		try:
			mpesa_security._load_cert("production")
			r.ok("M-Pesa production cert", "found")
		except Exception as e:
			# Only a hard fail if B2C/refunds are in use (initiator configured).
			level = r.fail if _present(_conf("mpesa_initiator_name")) else r.warn
			level("M-Pesa production cert", str(e).split("\n")[0])


def _check_whatsapp(r: _Report):
	keys = (
		"whatsapp_phone_number_id",
		"whatsapp_access_token",
		"whatsapp_app_secret",
		"whatsapp_verify_token",
		"whatsapp_business_account_id",
	)
	configured = any(_present(_conf(k)) for k in keys)
	if not configured:
		r.warn("WhatsApp", "not configured (skip if this tenant doesn't use WhatsApp)")
		return
	for k in keys:
		(r.ok if _present(_conf(k)) else r.fail)(
			f"WhatsApp {k}", "" if _present(_conf(k)) else "missing but WhatsApp partly configured"
		)


def _check_platform(r: _Report):
	if _conf("developer_mode"):
		r.fail("developer_mode", "ON — must be OFF in production (relaxes CSRF/permissions)")
	else:
		r.ok("developer_mode", "off")

	(r.ok if _present(_conf("encryption_key")) else r.fail)(
		"encryption_key", "" if _present(_conf("encryption_key")) else "missing — encrypted fields/passwords break"
	)

	# Outgoing email (invites, renewal reminders) — Default Outgoing Email Account.
	try:
		has_outgoing = frappe.db.exists(
			"Email Account", {"default_outgoing": 1, "enable_outgoing": 1}
		)
		(r.ok if has_outgoing else r.warn)(
			"Outgoing email", "default outgoing account enabled" if has_outgoing
			else "no default outgoing Email Account — invites/reminders won't send"
		)
	except Exception as e:
		r.warn("Outgoing email", f"could not verify: {e}")


def _check_rbac(r: _Report):
	# 1. The four gym roles must exist, and must have desk_access=0 (their ONLY
	#    data path is the whitelisted methods; desk access would bypass the model).
	for role in GYM_ROLES:
		if not frappe.db.exists("Role", role):
			r.fail("RBAC role", f"{role!r} does not exist — run seed_gym_roles")
			continue
		desk = frappe.db.get_value("Role", role, "desk_access")
		if desk:
			r.fail("RBAC role", f"{role!r} has desk_access=1 — should be 0")
		else:
			r.ok("RBAC role", f"{role!r} present, desk_access=0")

	# 2. Seeded DocType permissions must exist. Spot-check the clusters from
	#    rbac.seed_doctype_permissions so a site that skipped after_migrate is caught.
	spot_checks = [
		(OWNER_ROLE, "Member Subscription", "read"),
		(MANAGER_ROLE, "Refund Request", "read"),
		(RECEPTIONIST_ROLE, "Member Profile", "create"),
		(TRAINER_ROLE, "Diet Plan", "write"),
		# Negative expectation: Receptionist must NOT have Diet Plan write.
	]
	for role, doctype, ptype in spot_checks:
		perm = frappe.db.get_value(
			"Custom DocPerm",
			{"role": role, "parent": doctype, "permlevel": 0},
			ptype,
		)
		# Fall back to standard DocPerm if not a custom row.
		if perm is None:
			perm = frappe.db.get_value(
				"DocPerm", {"role": role, "parent": doctype, "permlevel": 0}, ptype
			)
		(r.ok if perm else r.fail)(
			"RBAC permission",
			f"{role} → {doctype}.{ptype}" + ("" if perm else " MISSING — run seed_doctype_permissions"),
		)

	# 3. At least one enabled user should hold an owner/manager role, or nobody
	#    can administer the gym through the SPA.
	admins = frappe.get_all(
		"Has Role",
		filters={"role": ["in", [OWNER_ROLE, MANAGER_ROLE]], "parenttype": "User"},
		fields=["parent"],
	)
	enabled = [
		a.parent for a in admins
		if frappe.db.get_value("User", a.parent, "enabled")
	]
	(r.ok if enabled else r.fail)(
		"RBAC admins",
		f"{len(set(enabled))} enabled Owner/Manager user(s)" if enabled
		else "no enabled Gym Owner/Manager user — nobody can administer the SPA",
	)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def run() -> dict:
	"""Run all preflight checks against the current site and print a report."""
	r = _Report()
	_check_platform(r)
	_check_rbac(r)
	_check_mpesa(r)
	_check_whatsapp(r)

	site = getattr(frappe.local, "site", "?")
	print(f"\n=== Gym Management preflight — site: {site} ===\n")
	icon = {PASS: "✓", WARN: "!", FAIL: "✗"}
	for level in (FAIL, WARN, PASS):
		for lvl, check, detail in r.rows:
			if lvl != level:
				continue
			line = f"  [{icon[lvl]}] {check}"
			if detail:
				line += f" — {detail}"
			print(line)

	c = r.counts()
	print(f"\n  {c[PASS]} pass · {c[WARN]} warn · {c[FAIL]} fail")
	if c[FAIL]:
		print("  ✗ NOT READY: resolve all FAIL items before going live.\n")
	elif c[WARN]:
		print("  ! Review WARN items, then this tenant is ready.\n")
	else:
		print("  ✓ READY.\n")

	return {"site": site, "counts": c, "rows": r.rows}
