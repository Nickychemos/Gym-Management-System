"""M-Pesa SecurityCredential RSA encryption.

Safaricom Daraja's B2C, B2B, Reversal, and Account Balance APIs all require
the `initiator_password` to be encrypted as a `SecurityCredential` before
sending. The encryption is:

  1. Take the plaintext initiator password
  2. RSA-encrypt with Safaricom's environment-specific public X.509 certificate
     using PKCS#1 v1.5 padding (NOT OAEP — Daraja rejects OAEP)
  3. Base64-encode the ciphertext
  4. Send as the SecurityCredential field

The public certificates are different per environment:
  - Sandbox:    download from https://developer.safaricom.co.ke
                (look for SandboxCertificate.cer)
  - Production: download from the same portal
                (look for ProductionCertificate.cer)

Both certificates are public Safaricom artifacts — they're embedded in the
Daraja documentation and have no secret value on their own (only the matching
private key, held by Safaricom, can decrypt).

Default cert paths (resolved at call time):
  gym_management/data/safaricom_cert_sandbox.cer
  gym_management/data/safaricom_cert_production.cer

Override per tenant by setting in site_config.json:
  "mpesa_security_cert_path_sandbox":    "/abs/path/to/cert.cer"
  "mpesa_security_cert_path_production": "/abs/path/to/cert.cer"
"""

from __future__ import annotations

import base64
import hmac
import ipaddress
from pathlib import Path

import frappe
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.x509 import load_der_x509_certificate, load_pem_x509_certificate


CERT_DIR = Path(__file__).resolve().parent / "data"


class MPesaSecurityCertError(frappe.ValidationError):
	pass


def encrypt_security_credential(plaintext: str, env: str = "sandbox") -> str:
	"""Encrypt the initiator password using Safaricom's public certificate.

	Returns base64-encoded ciphertext suitable for the Daraja SecurityCredential
	field. Raises MPesaSecurityCertError if the certificate file for the given
	env is missing.
	"""
	if not plaintext:
		raise MPesaSecurityCertError("plaintext initiator password is empty")
	env = (env or "sandbox").lower()
	if env not in ("sandbox", "production"):
		raise MPesaSecurityCertError(
			f"unknown M-Pesa env {env!r} — expected 'sandbox' or 'production'"
		)

	cert = _load_cert(env)
	pubkey = cert.public_key()
	ciphertext = pubkey.encrypt(
		plaintext.encode("utf-8"),
		padding.PKCS1v15(),
	)
	return base64.b64encode(ciphertext).decode("ascii")


def _load_cert(env: str):
	"""Return the parsed X.509 certificate for the given env.

	Resolution order:
	  1. site_config.mpesa_security_cert_path_<env> (per-tenant override)
	  2. gym_management/data/safaricom_cert_<env>.cer (bundled default)
	"""
	override = None
	# frappe.local.conf may not be set when called outside a request context
	try:
		override = frappe.local.conf.get(f"mpesa_security_cert_path_{env}")
	except (AttributeError, RuntimeError):
		pass

	cert_path = Path(override) if override else CERT_DIR / f"safaricom_cert_{env}.cer"
	if not cert_path.exists():
		raise MPesaSecurityCertError(
			f"Safaricom {env} certificate not found at {cert_path}. "
			f"Download it from https://developer.safaricom.co.ke and place "
			f"it at this path, or set site_config."
			f"mpesa_security_cert_path_{env} to a custom absolute path."
		)

	raw = cert_path.read_bytes()
	# Safaricom distributes both PEM and DER variants — try PEM first.
	try:
		return load_pem_x509_certificate(raw)
	except ValueError:
		return load_der_x509_certificate(raw)


# ---------------------------------------------------------------------------
# Inbound callback source authentication
#
# Daraja does NOT sign or authenticate its callbacks, so anyone who learns a
# callback URL could POST forged "successful payment" JSON. We defend with two
# independent layers (either alone is effective; together is belt-and-braces):
#
#   1. A shared-secret token embedded in the callback URL query string
#      (site_config "mpesa_callback_token"). Daraja calls back exactly the URL
#      we registered, so the token rides along on every callback. Fail-closed:
#      once a token is configured, a missing/wrong token is rejected. This layer
#      is infra-independent and is the recommended primary control.
#
#   2. An IP allow-list checked against Safaricom's published callback ranges
#      (site_config "mpesa_callback_allowed_ips"; defaults below). Enforced only
#      when "mpesa_callback_enforce_ip" is truthy, because behind a reverse
#      proxy frappe.local.request_ip is only accurate with trusted-proxy config.
#      Prefer enforcing this at nginx; in-app it is defense in depth.
#
# The semantic protections (reconcile-against-initiated-push, amount/shortcode
# match) live in the callback handlers and do not depend on either layer.
# ---------------------------------------------------------------------------

# Safaricom's published Daraja callback source IPs (production). CONFIRM the
# current list with Safaricom before go-live; override per tenant via
# site_config "mpesa_callback_allowed_ips" (accepts plain IPs or CIDR ranges).
SAFARICOM_CALLBACK_IPS = [
	"196.201.214.200",
	"196.201.214.206",
	"196.201.214.207",
	"196.201.214.208",
	"196.201.213.114",
	"196.201.213.44",
	"196.201.212.127",
	"196.201.212.138",
	"196.201.212.129",
	"196.201.212.136",
	"196.201.212.74",
	"196.201.212.69",
]


def _conf(key: str, default=None):
	"""Read a site_config value, tolerating call outside a request context."""
	try:
		return frappe.local.conf.get(key, default)
	except (AttributeError, RuntimeError):
		return default


def callback_token() -> str | None:
	"""The configured shared-secret callback token, if any."""
	tok = _conf("mpesa_callback_token")
	return str(tok) if tok else None


def append_callback_token(url: str) -> str:
	"""Append the shared-secret token to a callback URL registered with Daraja.

	No-op when no token is configured, so sandbox/dev keeps working unchanged."""
	tok = callback_token()
	if not tok:
		return url
	sep = "&" if "?" in url else "?"
	return f"{url}{sep}token={tok}"


def _request_token() -> str | None:
	req = getattr(frappe.local, "request", None)
	if req is None:
		return None
	try:
		val = req.args.get("token")
	except Exception:
		val = None
	return str(val) if val else None


def _client_ip() -> str | None:
	return getattr(frappe.local, "request_ip", None)


def _ip_allowed(ip: str, allowed) -> bool:
	try:
		addr = ipaddress.ip_address(ip)
	except ValueError:
		return False
	for entry in allowed:
		entry = str(entry).strip()
		if not entry:
			continue
		try:
			if "/" in entry:
				if addr in ipaddress.ip_network(entry, strict=False):
					return True
			elif addr == ipaddress.ip_address(entry):
				return True
		except ValueError:
			continue
	return False


def verify_callback_source(context: str = "mpesa_callback") -> bool:
	"""Return True if the inbound callback passes the configured source checks.

	On failure: logs to the Error Log and returns False so the caller can reject
	with a non-zero ResultCode WITHOUT mutating any transaction. Returns True
	when no checks are configured (the production verification script flags that
	as a go-live gap rather than failing closed and breaking money flow)."""
	# Layer 1 — shared-secret token (fail-closed once configured).
	expected = callback_token()
	if expected:
		got = _request_token()
		if not got or not hmac.compare_digest(str(got), str(expected)):
			frappe.log_error(
				f"{context}: callback token missing/mismatch from IP {_client_ip()}",
				"mpesa callback auth",
			)
			return False

	# Layer 2 — IP allow-list (opt-in via mpesa_callback_enforce_ip).
	if _conf("mpesa_callback_enforce_ip"):
		allowed = _conf("mpesa_callback_allowed_ips") or SAFARICOM_CALLBACK_IPS
		ip = _client_ip()
		if not ip or not _ip_allowed(ip, allowed):
			frappe.log_error(
				f"{context}: callback from non-allowlisted IP {ip}",
				"mpesa callback auth",
			)
			return False

	return True
