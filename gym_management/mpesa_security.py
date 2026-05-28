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
