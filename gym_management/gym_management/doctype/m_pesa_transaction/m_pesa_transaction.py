# Copyright (c) 2026, Nicky and contributors
# For license information, please see license.txt

import json

import frappe
from gym_management.rbac import FRONTDESK, requires
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, now_datetime, today


# Daraja result_code values that mean success
DARAJA_SUCCESS_CODES = ("0", 0)

# Final statuses — once here, the transaction is closed
TERMINAL_STATUSES = ("Success", "Failed", "Timeout", "Reversed")


class MPesaTransaction(Document):
	def validate(self):
		self._check_phone_format()
		self._check_amount_positive()
		self._stamp_status_from_result_code()

	def before_submit(self):
		# Cannot submit a Pending transaction — must be Success / Failed / Timeout / Reversed
		if self.status == "Pending":
			frappe.throw(
				_("Cannot submit a Pending M-Pesa Transaction. Wait for the Daraja callback or mark it Failed/Timeout.")
			)

	def on_submit(self):
		"""On successful inbound payment, create a Payment Entry against the
		linked Sales Invoice (if any). For B2C refunds, the Refund Request
		controller handles the reversal accounting."""
		if self.status != "Success":
			return
		if self.direction == "Inbound" and self.linked_invoice and not self.linked_payment_entry:
			self._auto_create_payment_entry()

	# ---------- validations ----------

	def _check_phone_format(self):
		"""MSISDN must be 12 digits starting with 254 (Kenya)."""
		if not self.phone_number:
			return
		stripped = "".join(c for c in self.phone_number if c.isdigit())
		if len(stripped) == 12 and stripped.startswith("254"):
			self.phone_number = stripped
		elif len(stripped) == 9 and stripped.startswith("7"):
			# Allow shorthand "7XXXXXXXX" → "2547XXXXXXXX"
			self.phone_number = "254" + stripped
		elif len(stripped) == 10 and stripped.startswith("07"):
			# Allow shorthand "07XXXXXXXX" → "2547XXXXXXXX"
			self.phone_number = "254" + stripped[1:]
		else:
			frappe.throw(
				_("Phone number {0} is not a valid Kenyan MSISDN (expected 2547XXXXXXXX)").format(
					self.phone_number
				)
			)

	def _check_amount_positive(self):
		if flt(self.amount) <= 0:
			frappe.throw(_("Amount must be greater than zero"))

	def _stamp_status_from_result_code(self):
		"""If result_code is set and status is still Pending, infer status from
		the Daraja result_code. 0 = Success; other codes = Failed."""
		if not self.result_code or self.status != "Pending":
			return
		if str(self.result_code) in DARAJA_SUCCESS_CODES or self.result_code == 0:
			self.status = "Success"
		else:
			self.status = "Failed"

	# ---------- side effects ----------

	def _auto_create_payment_entry(self):
		"""Create an ERPNext Payment Entry for a successful inbound payment
		linked to a Sales Invoice. This is what makes the money show up in
		the gym's accounting."""
		try:
			from erpnext.accounts.doctype.payment_entry.payment_entry import (
				get_payment_entry,
			)

			pe = get_payment_entry("Sales Invoice", self.linked_invoice)
			pe.paid_amount = self.amount
			pe.received_amount = self.amount
			pe.reference_no = self.mpesa_receipt_number or self.checkout_request_id
			pe.reference_date = today()
			pe.mode_of_payment = "M-Pesa"
			pe.insert(ignore_permissions=True)
			pe.submit()
			self.db_set("linked_payment_entry", pe.name)
		except Exception:
			frappe.log_error(
				frappe.get_traceback(),
				f"mpesa_transaction.auto_create_payment_entry: {self.name}",
			)


# ============================================================================
# Public API — Daraja callbacks land here
# ============================================================================


@frappe.whitelist(allow_guest=True)
def stk_callback(**kwargs) -> dict:
	"""Daraja STK Push callback endpoint.

	Expected payload shape (Daraja schema):
	    Body.stkCallback.MerchantRequestID, CheckoutRequestID, ResultCode,
	    ResultDesc, CallbackMetadata.Item[...] (Amount, MpesaReceiptNumber,
	    TransactionDate, PhoneNumber)

	Idempotency: dedupes by CheckoutRequestID — the same callback firing
	twice updates the existing row instead of creating a duplicate.

	allow_guest=True because Safaricom doesn't authenticate; we rely on the
	shortcode + AccountReference for routing + verification.
	"""
	try:
		# Get the raw request body
		raw_body = frappe.request.get_data(as_text=True) if frappe.request else ""
		if raw_body:
			try:
				payload = json.loads(raw_body)
			except json.JSONDecodeError:
				payload = kwargs
		else:
			payload = kwargs

		stk = (payload.get("Body") or {}).get("stkCallback") or {}
		checkout_id = stk.get("CheckoutRequestID")
		merchant_id = stk.get("MerchantRequestID")
		result_code = stk.get("ResultCode")
		result_desc = stk.get("ResultDesc")

		if not checkout_id:
			frappe.log_error(
				f"stk_callback received with no CheckoutRequestID: {raw_body[:500]}",
				"mpesa_transaction.stk_callback",
			)
			return {"ResultCode": 1, "ResultDesc": "Missing CheckoutRequestID"}

		# Extract metadata items into a flat dict
		meta = {}
		for item in (stk.get("CallbackMetadata") or {}).get("Item", []):
			name = item.get("Name")
			value = item.get("Value")
			if name:
				meta[name] = value

		# Idempotency: find by CheckoutRequestID
		existing = frappe.db.get_value(
			"M-Pesa Transaction",
			{"checkout_request_id": checkout_id},
			"name",
		)
		if existing:
			doc = frappe.get_doc("M-Pesa Transaction", existing)
			# If already submitted with a terminal status, refuse to overwrite
			if doc.docstatus == 1 and doc.status in TERMINAL_STATUSES:
				return {"ResultCode": 0, "ResultDesc": "Already recorded"}
		else:
			doc = frappe.new_doc("M-Pesa Transaction")
			doc.transaction_type = "STK Push"
			doc.direction = "Inbound"
			doc.checkout_request_id = checkout_id

		doc.merchant_request_id = merchant_id
		doc.result_code = str(result_code) if result_code is not None else None
		doc.result_description = result_desc
		doc.callback_payload = json.dumps(payload, indent=2)
		if meta.get("Amount"):
			doc.amount = flt(meta["Amount"])
		if meta.get("MpesaReceiptNumber"):
			doc.mpesa_receipt_number = meta["MpesaReceiptNumber"]
		if meta.get("PhoneNumber"):
			doc.phone_number = str(meta["PhoneNumber"])
		# status will be inferred in validate()

		if not doc.name:
			doc.insert(ignore_permissions=True)
		else:
			doc.save(ignore_permissions=True)

		# Auto-submit on terminal status
		if doc.status in TERMINAL_STATUSES and doc.docstatus == 0:
			doc.submit()

		return {"ResultCode": 0, "ResultDesc": "Accepted"}

	except Exception:
		frappe.log_error(frappe.get_traceback(), "mpesa_transaction.stk_callback")
		return {"ResultCode": 1, "ResultDesc": "Internal error"}


@frappe.whitelist(allow_guest=False)
@requires(FRONTDESK)
def initiate_stk_push(
	customer: str,
	amount: float,
	phone_number: str,
	account_reference: str,
	description: str | None = None,
	linked_invoice: str | None = None,
	linked_subscription: str | None = None,
) -> dict:
	"""Create a Pending M-Pesa Transaction row representing an STK Push the
	app is about to send. The actual HTTP call to Daraja is performed by a
	separate integration helper (lives in a future mpesa_client.py module);
	this function just persists the intent so the callback can find it later.

	Returns the M-Pesa Transaction name; the caller (UI / API) is responsible
	for actually invoking Daraja and updating the row with response_payload
	and checkout_request_id."""
	doc = frappe.new_doc("M-Pesa Transaction")
	doc.transaction_type = "STK Push"
	doc.direction = "Inbound"
	doc.status = "Pending"
	doc.customer = customer
	doc.amount = flt(amount)
	doc.phone_number = phone_number
	doc.account_reference = account_reference
	doc.transaction_desc = description or f"Payment for {account_reference}"
	doc.linked_invoice = linked_invoice
	doc.linked_subscription = linked_subscription
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True, "transaction": doc.name}


def find_by_receipt(mpesa_receipt_number: str) -> str | None:
	"""Lookup a transaction by Safaricom's authoritative receipt number.
	Used by reconciliation tools."""
	return frappe.db.get_value(
		"M-Pesa Transaction", {"mpesa_receipt_number": mpesa_receipt_number}, "name"
	)
