"""M-Pesa Daraja HTTP client — multi-tenant, token-cached, per-tenant credentials.

This is the actual bridge between our M-Pesa Transaction DocType (the LOG)
and Safaricom's Daraja API (where the money actually moves).

Per-tenant credentials live in each tenant's site_config.json:
    {
        "mpesa_env":                 "sandbox" | "production",
        "mpesa_consumer_key":        "...",
        "mpesa_consumer_secret":     "...",
        "mpesa_passkey":             "...",      # STK Push password ingredient
        "mpesa_shortcode":           "174379",   # paybill / till
        "mpesa_initiator_name":      "...",      # B2C initiator
        "mpesa_initiator_password":  "...",      # B2C — must be RSA-encrypted before send
        "mpesa_callback_base_url":   "https://<tenant>.<platform>.co.ke"
    }

Sandbox uses Safaricom's published test credentials — anyone can run STK pushes
with simulated money against shortcode 174379 + the public sandbox passkey.
"""

import base64
import json
from datetime import datetime

import requests

import frappe
from frappe import _


# Daraja endpoints
SANDBOX_BASE = "https://sandbox.safaricom.co.ke"
PRODUCTION_BASE = "https://api.safaricom.co.ke"

OAUTH_PATH = "/oauth/v1/generate?grant_type=client_credentials"
STK_PUSH_PATH = "/mpesa/stkpush/v1/processrequest"
STK_QUERY_PATH = "/mpesa/stkpushquery/v1/query"
B2C_PATH = "/mpesa/b2c/v1/paymentrequest"
REGISTER_URL_PATH = "/mpesa/c2b/v1/registerurl"

# Token cache TTL — Daraja tokens last 1 hour; cache 59 minutes for safety
TOKEN_CACHE_TTL_SECONDS = 59 * 60


class MPesaConfigError(Exception):
	"""Raised when a required M-Pesa credential is missing from site_config."""


class MPesaAPIError(Exception):
	"""Raised when Daraja returns an error or unreachable HTTP."""

	def __init__(self, message: str, response_payload: dict | None = None):
		super().__init__(message)
		self.response_payload = response_payload or {}


class MPesaClient:
	"""Per-tenant Daraja client. Construct via `for_current_site()`.

	Stateless after construction — safe to call concurrently from multiple
	request threads. Token is cached in Frappe's shared Redis."""

	def __init__(
		self,
		env: str,
		consumer_key: str,
		consumer_secret: str,
		passkey: str | None,
		shortcode: str,
		initiator_name: str | None = None,
		initiator_password: str | None = None,
		callback_base_url: str | None = None,
	):
		if env not in ("sandbox", "production"):
			raise MPesaConfigError(f"mpesa_env must be 'sandbox' or 'production', got {env!r}")
		self.env = env
		self.base_url = SANDBOX_BASE if env == "sandbox" else PRODUCTION_BASE
		self.consumer_key = consumer_key
		self.consumer_secret = consumer_secret
		self.passkey = passkey
		self.shortcode = shortcode
		self.initiator_name = initiator_name
		self.initiator_password = initiator_password
		self.callback_base_url = callback_base_url or ""

	# ----------------------------------------------------------------------
	# Construction
	# ----------------------------------------------------------------------

	@classmethod
	def for_current_site(cls) -> "MPesaClient":
		"""Load credentials from frappe.local.conf (the current tenant's
		site_config.json). Fails fast if anything required is missing."""
		conf = frappe.local.conf
		missing = [
			k
			for k in (
				"mpesa_env",
				"mpesa_consumer_key",
				"mpesa_consumer_secret",
				"mpesa_shortcode",
			)
			if not conf.get(k)
		]
		if missing:
			raise MPesaConfigError(
				f"site_config.json missing required M-Pesa keys: {', '.join(missing)}"
			)
		return cls(
			env=conf.get("mpesa_env"),
			consumer_key=conf.get("mpesa_consumer_key"),
			consumer_secret=conf.get("mpesa_consumer_secret"),
			passkey=conf.get("mpesa_passkey"),
			shortcode=str(conf.get("mpesa_shortcode")),
			initiator_name=conf.get("mpesa_initiator_name"),
			initiator_password=conf.get("mpesa_initiator_password"),
			callback_base_url=conf.get("mpesa_callback_base_url"),
		)

	# ----------------------------------------------------------------------
	# OAuth — token fetch + Redis caching
	# ----------------------------------------------------------------------

	def _token_cache_key(self) -> str:
		return f"mpesa_token:{self.env}:{self.consumer_key}"

	def get_access_token(self, force_refresh: bool = False) -> str:
		"""Fetch (or return cached) OAuth bearer token."""
		cache_key = self._token_cache_key()
		if not force_refresh:
			cached = frappe.cache().get_value(cache_key)
			if cached:
				return cached

		creds = f"{self.consumer_key}:{self.consumer_secret}"
		encoded = base64.b64encode(creds.encode()).decode()
		headers = {
			"Authorization": f"Basic {encoded}",
			"Content-Type": "application/json",
		}
		resp = requests.get(self.base_url + OAUTH_PATH, headers=headers, timeout=20)
		try:
			body = resp.json()
		except json.JSONDecodeError:
			raise MPesaAPIError(
				f"OAuth response not JSON: {resp.status_code} {resp.text[:200]}"
			)
		token = body.get("access_token")
		if not token:
			raise MPesaAPIError(
				f"OAuth failed: {body.get('error_description', body)}", body
			)
		frappe.cache().set_value(cache_key, token, expires_in_sec=TOKEN_CACHE_TTL_SECONDS)
		return token

	# ----------------------------------------------------------------------
	# STK Push (C2B — inbound payment from member)
	# ----------------------------------------------------------------------

	def _stk_password(self, timestamp: str) -> str:
		"""Daraja's STK password = base64(shortcode + passkey + timestamp)."""
		if not self.passkey:
			raise MPesaConfigError("mpesa_passkey is required for STK Push")
		raw = f"{self.shortcode}{self.passkey}{timestamp}"
		return base64.b64encode(raw.encode()).decode()

	def stk_push(
		self,
		phone_number: str,
		amount: float,
		account_reference: str,
		description: str = "Payment",
		customer: str | None = None,
		linked_invoice: str | None = None,
		linked_subscription: str | None = None,
	) -> dict:
		"""Trigger an STK Push on the member's phone.

		Side effects:
		- Creates a Pending M-Pesa Transaction row BEFORE the HTTP call (so the
		  audit trail exists even if Daraja times out)
		- Stamps checkout_request_id, merchant_request_id, response_payload on
		  the row after a successful Daraja response
		- On error: stamps error_notes and status=Failed, then raises

		Returns the M-Pesa Transaction row's name + the Daraja response.
		Callback (when the member completes the payment) is handled by
		m_pesa_transaction.stk_callback().
		"""
		from gym_management.gym_management.doctype.m_pesa_transaction.m_pesa_transaction import (
			initiate_stk_push as _persist_pending_row,
		)

		# 1. Persist Pending row first (audit before we call Daraja)
		pending = _persist_pending_row(
			customer=customer or "",
			amount=amount,
			phone_number=phone_number,
			account_reference=account_reference,
			description=description,
			linked_invoice=linked_invoice,
			linked_subscription=linked_subscription,
		)
		mpt_name = pending["transaction"]

		# 2. Build request
		timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
		token = self.get_access_token()
		body = {
			"BusinessShortCode": self.shortcode,
			"Password": self._stk_password(timestamp),
			"Timestamp": timestamp,
			"TransactionType": "CustomerPayBillOnline",
			"Amount": int(round(float(amount))),
			"PartyA": phone_number,
			"PartyB": self.shortcode,
			"PhoneNumber": phone_number,
			"CallBackURL": self._stk_callback_url(),
			"AccountReference": account_reference[:12],  # Daraja max 12 chars
			"TransactionDesc": description[:13],  # Daraja max 13 chars
		}
		headers = {
			"Authorization": f"Bearer {token}",
			"Content-Type": "application/json",
		}

		# 3. Fire HTTP and persist response on the row
		try:
			resp = requests.post(
				self.base_url + STK_PUSH_PATH, json=body, headers=headers, timeout=30
			)
			resp_body = resp.json()
		except (requests.RequestException, json.JSONDecodeError) as e:
			frappe.db.set_value(
				"M-Pesa Transaction",
				mpt_name,
				{
					"status": "Failed",
					"error_notes": f"HTTP/JSON error: {e}",
					"request_payload": json.dumps(body, indent=2),
				},
			)
			raise MPesaAPIError(f"Daraja unreachable: {e}")

		# Stamp the response onto the pending row regardless of success
		updates = {
			"request_payload": json.dumps(body, indent=2),
			"response_payload": json.dumps(resp_body, indent=2),
		}
		response_code = resp_body.get("ResponseCode")
		if response_code in ("0", 0):
			updates["checkout_request_id"] = resp_body.get("CheckoutRequestID")
			updates["merchant_request_id"] = resp_body.get("MerchantRequestID")
		else:
			# Daraja itself rejected the request (bad creds, bad shortcode, etc.)
			updates["status"] = "Failed"
			updates["error_notes"] = (
				f"Daraja ResponseCode={response_code}: "
				f"{resp_body.get('errorMessage') or resp_body.get('ResponseDescription')}"
			)
		frappe.db.set_value("M-Pesa Transaction", mpt_name, updates)
		frappe.db.commit()

		if response_code not in ("0", 0):
			raise MPesaAPIError(
				f"Daraja STK Push rejected: {updates['error_notes']}", resp_body
			)

		return {
			"ok": True,
			"transaction": mpt_name,
			"checkout_request_id": resp_body.get("CheckoutRequestID"),
			"merchant_request_id": resp_body.get("MerchantRequestID"),
			"customer_message": resp_body.get("CustomerMessage"),
		}

	def query_stk_status(self, checkout_request_id: str) -> dict:
		"""Query Daraja for the result of an STK Push we sent. Useful when the
		callback hasn't arrived (network blip) and we need to confirm what
		happened."""
		timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
		token = self.get_access_token()
		body = {
			"BusinessShortCode": self.shortcode,
			"Password": self._stk_password(timestamp),
			"Timestamp": timestamp,
			"CheckoutRequestID": checkout_request_id,
		}
		headers = {
			"Authorization": f"Bearer {token}",
			"Content-Type": "application/json",
		}
		resp = requests.post(
			self.base_url + STK_QUERY_PATH, json=body, headers=headers, timeout=30
		)
		return resp.json()

	# ----------------------------------------------------------------------
	# B2C (outbound — refund / commission disbursement)
	# ----------------------------------------------------------------------

	def b2c_payment(
		self,
		phone_number: str,
		amount: float,
		occasion: str,
		command_id: str = "BusinessPayment",
		linked_refund_request: str | None = None,
	) -> dict:
		"""Send money OUT from the gym's paybill to a member's phone.

		Daraja requires `SecurityCredential` to be the initiator password
		RSA-encrypted with Safaricom's env-specific public certificate. We
		call gym_management.mpesa_security.encrypt_security_credential() to
		produce it. The cert must be present at
		gym_management/data/safaricom_cert_<env>.cer or referenced via
		site_config.mpesa_security_cert_path_<env>.
		"""
		from gym_management.mpesa_security import (
			MPesaSecurityCertError,
			encrypt_security_credential,
		)

		if not self.initiator_name or not self.initiator_password:
			raise MPesaConfigError(
				"B2C requires mpesa_initiator_name + mpesa_initiator_password in site_config"
			)
		try:
			security_credential = encrypt_security_credential(
				self.initiator_password, self.env
			)
		except MPesaSecurityCertError as e:
			raise MPesaConfigError(str(e))

		# Persist Pending Outbound row first
		doc = frappe.new_doc("M-Pesa Transaction")
		doc.transaction_type = "B2C Refund"
		doc.direction = "Outbound"
		doc.status = "Pending"
		doc.amount = float(amount)
		doc.phone_number = phone_number
		doc.shortcode = self.shortcode
		doc.transaction_desc = occasion[:13]
		doc.linked_refund_request = linked_refund_request
		doc.insert(ignore_permissions=True)
		frappe.db.commit()
		mpt_name = doc.name

		token = self.get_access_token()
		body = {
			"InitiatorName": self.initiator_name,
			"SecurityCredential": security_credential,
			"CommandID": command_id,
			"Amount": int(round(float(amount))),
			"PartyA": self.shortcode,
			"PartyB": phone_number,
			"Remarks": occasion[:100],
			"QueueTimeOutURL": self._b2c_timeout_url(),
			"ResultURL": self._b2c_result_url(),
			"Occasion": occasion[:100],
		}
		headers = {
			"Authorization": f"Bearer {token}",
			"Content-Type": "application/json",
		}

		try:
			resp = requests.post(
				self.base_url + B2C_PATH, json=body, headers=headers, timeout=30
			)
			resp_body = resp.json()
		except (requests.RequestException, json.JSONDecodeError) as e:
			frappe.db.set_value(
				"M-Pesa Transaction",
				mpt_name,
				{"status": "Failed", "error_notes": f"HTTP/JSON error: {e}"},
			)
			raise MPesaAPIError(f"Daraja unreachable: {e}")

		updates = {
			"request_payload": json.dumps(body, indent=2),
			"response_payload": json.dumps(resp_body, indent=2),
		}
		response_code = resp_body.get("ResponseCode")
		if response_code in ("0", 0):
			updates["conversation_id"] = resp_body.get("ConversationID")
		else:
			updates["status"] = "Failed"
			updates["error_notes"] = (
				f"Daraja ResponseCode={response_code}: "
				f"{resp_body.get('errorMessage') or resp_body.get('ResponseDescription')}"
			)
		frappe.db.set_value("M-Pesa Transaction", mpt_name, updates)
		frappe.db.commit()

		if response_code not in ("0", 0):
			raise MPesaAPIError(
				f"Daraja B2C rejected: {updates['error_notes']}", resp_body
			)

		return {
			"ok": True,
			"transaction": mpt_name,
			"conversation_id": resp_body.get("ConversationID"),
		}

	# ----------------------------------------------------------------------
	# C2B URL Registration (one-time per shortcode)
	# ----------------------------------------------------------------------

	def register_urls(
		self,
		response_type: str = "Completed",
	) -> dict:
		"""Tell Safaricom which URLs to call when a customer pays the paybill
		manually (without an STK push). Run this ONCE per tenant during
		onboarding."""
		token = self.get_access_token()
		body = {
			"ShortCode": self.shortcode,
			"ResponseType": response_type,
			"ConfirmationURL": self._c2b_confirmation_url(),
			"ValidationURL": self._c2b_validation_url(),
		}
		headers = {
			"Authorization": f"Bearer {token}",
			"Content-Type": "application/json",
		}
		resp = requests.post(
			self.base_url + REGISTER_URL_PATH, json=body, headers=headers, timeout=30
		)
		return resp.json()

	# ----------------------------------------------------------------------
	# Callback URL builders
	# ----------------------------------------------------------------------

	def _stk_callback_url(self) -> str:
		return (
			f"{self.callback_base_url.rstrip('/')}"
			f"/api/method/gym_management.gym_management.doctype.m_pesa_transaction.m_pesa_transaction.stk_callback"
		)

	def _b2c_result_url(self) -> str:
		return (
			f"{self.callback_base_url.rstrip('/')}"
			f"/api/method/gym_management.mpesa_client.b2c_result_callback"
		)

	def _b2c_timeout_url(self) -> str:
		return (
			f"{self.callback_base_url.rstrip('/')}"
			f"/api/method/gym_management.mpesa_client.b2c_timeout_callback"
		)

	def _c2b_confirmation_url(self) -> str:
		return (
			f"{self.callback_base_url.rstrip('/')}"
			f"/api/method/gym_management.mpesa_client.c2b_confirmation"
		)

	def _c2b_validation_url(self) -> str:
		return (
			f"{self.callback_base_url.rstrip('/')}"
			f"/api/method/gym_management.mpesa_client.c2b_validation"
		)


# ============================================================================
# Whitelisted callback endpoints (Safaricom POSTs here)
# ============================================================================


@frappe.whitelist(allow_guest=True)
def b2c_result_callback(**kwargs) -> dict:
	"""Daraja B2C result callback — fires after a refund disbursement completes."""
	try:
		raw = frappe.request.get_data(as_text=True) if frappe.request else ""
		payload = json.loads(raw) if raw else kwargs

		result = (payload.get("Result") or {})
		conversation_id = result.get("ConversationID")
		result_code = result.get("ResultCode")
		result_desc = result.get("ResultDesc")

		if not conversation_id:
			return {"ResultCode": 1, "ResultDesc": "Missing ConversationID"}

		mpt_name = frappe.db.get_value(
			"M-Pesa Transaction", {"conversation_id": conversation_id}, "name"
		)
		if not mpt_name:
			frappe.log_error(
				f"b2c_result_callback: no row for ConversationID {conversation_id}",
				"mpesa_client.b2c_result_callback",
			)
			return {"ResultCode": 1, "ResultDesc": "Unknown ConversationID"}

		# Extract metadata
		meta = {}
		for item in (result.get("ResultParameters") or {}).get("ResultParameter", []):
			name = item.get("Key")
			value = item.get("Value")
			if name:
				meta[name] = value

		updates = {
			"result_code": str(result_code) if result_code is not None else None,
			"result_description": result_desc,
			"callback_payload": json.dumps(payload, indent=2),
		}
		if result_code in (0, "0"):
			updates["status"] = "Success"
			if meta.get("TransactionReceipt"):
				updates["mpesa_receipt_number"] = meta["TransactionReceipt"]
			# Mark the linked Refund Request as Refunded
			doc = frappe.get_doc("M-Pesa Transaction", mpt_name)
			if doc.linked_refund_request:
				from gym_management.gym_management.doctype.refund_request.refund_request import (
					mark_refund_completed,
				)

				try:
					mark_refund_completed(
						refund_request=doc.linked_refund_request,
						mpesa_transaction=mpt_name,
					)
				except Exception:
					frappe.log_error(
						frappe.get_traceback(),
						"b2c_result_callback: mark_refund_completed failed",
					)
		else:
			updates["status"] = "Failed"

		frappe.db.set_value("M-Pesa Transaction", mpt_name, updates)
		# Auto-submit on terminal status
		doc = frappe.get_doc("M-Pesa Transaction", mpt_name)
		if doc.docstatus == 0 and doc.status in ("Success", "Failed"):
			doc.submit()
		frappe.db.commit()
		return {"ResultCode": 0, "ResultDesc": "Accepted"}

	except Exception:
		frappe.log_error(frappe.get_traceback(), "mpesa_client.b2c_result_callback")
		return {"ResultCode": 1, "ResultDesc": "Internal error"}


@frappe.whitelist(allow_guest=True)
def b2c_timeout_callback(**_kwargs) -> dict:
	"""Daraja B2C queue timeout — fires when the disbursement queue stalls.
	Frappe's whitelist passes form data as kwargs; we read from raw body only."""
	try:
		raw = frappe.request.get_data(as_text=True) if frappe.request else ""
		frappe.log_error(
			f"B2C timeout callback received: {raw[:1000]}",
			"mpesa_client.b2c_timeout_callback",
		)
		return {"ResultCode": 0, "ResultDesc": "Accepted"}
	except Exception:
		return {"ResultCode": 1, "ResultDesc": "Internal error"}


@frappe.whitelist(allow_guest=True)
def c2b_confirmation(**kwargs) -> dict:
	"""C2B confirmation — fires when a customer pays our paybill manually.

	Records the payment as an inbound M-Pesa Transaction (matching by AccountReference
	to a linked Sales Invoice / Member Subscription is left to a reconciliation
	task; for v1 we just log the row)."""
	try:
		raw = frappe.request.get_data(as_text=True) if frappe.request else ""
		payload = json.loads(raw) if raw else kwargs

		trans_id = payload.get("TransID")
		if not trans_id:
			return {"ResultCode": 1, "ResultDesc": "Missing TransID"}

		# Idempotency: dedupe on TransID
		existing = frappe.db.get_value(
			"M-Pesa Transaction", {"transaction_id": trans_id}, "name"
		)
		if existing:
			return {"ResultCode": 0, "ResultDesc": "Already recorded"}

		doc = frappe.new_doc("M-Pesa Transaction")
		doc.transaction_type = "C2B Paybill"
		doc.direction = "Inbound"
		doc.status = "Success"
		doc.transaction_id = trans_id
		doc.mpesa_receipt_number = payload.get("TransID")  # C2B uses TransID as receipt
		doc.amount = float(payload.get("TransAmount") or 0)
		doc.phone_number = str(payload.get("MSISDN") or "")
		doc.account_reference = payload.get("BillRefNumber") or ""
		doc.shortcode = str(payload.get("BusinessShortCode") or "")
		doc.callback_payload = json.dumps(payload, indent=2)
		doc.insert(ignore_permissions=True)
		doc.submit()
		frappe.db.commit()
		return {"ResultCode": 0, "ResultDesc": "Accepted"}
	except Exception:
		frappe.log_error(frappe.get_traceback(), "mpesa_client.c2b_confirmation")
		return {"ResultCode": 1, "ResultDesc": "Internal error"}


@frappe.whitelist(allow_guest=True)
def c2b_validation(**form_data) -> dict:
	"""C2B validation — fires BEFORE accepting a manual paybill payment.
	Return ResultCode 0 to accept; non-zero to reject (e.g. unknown account ref).

	For v1, accept everything (logged for debugging). Phase 4 polish can add
	rule-based rejection (unknown member, blocked customer, etc.)."""
	frappe.logger().debug(
		f"c2b_validation incoming keys: {sorted(form_data.keys())}"
	)
	return {"ResultCode": 0, "ResultDesc": "Accepted"}
