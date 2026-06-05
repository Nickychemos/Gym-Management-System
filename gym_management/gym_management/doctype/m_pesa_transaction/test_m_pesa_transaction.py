# Copyright (c) 2026, Nicky and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase

from gym_management.gym_management.doctype.m_pesa_transaction.m_pesa_transaction import (
	stk_callback,
)


def _pending(checkout_id: str, amount: float = 100.0) -> str:
	"""Create a Pending STK Push row as mpesa_client.stk_push would, then return
	its name. This is the row a legitimate callback reconciles against."""
	doc = frappe.new_doc("M-Pesa Transaction")
	doc.transaction_type = "STK Push"
	doc.direction = "Inbound"
	doc.status = "Pending"
	doc.amount = amount
	doc.phone_number = "254712345678"
	doc.account_reference = "TEST"
	doc.checkout_request_id = checkout_id
	doc.insert(ignore_permissions=True)
	return doc.name


def _success_payload(checkout_id: str, amount: float) -> dict:
	return {
		"Body": {
			"stkCallback": {
				"CheckoutRequestID": checkout_id,
				"MerchantRequestID": "m-1",
				"ResultCode": 0,
				"ResultDesc": "ok",
				"CallbackMetadata": {
					"Item": [
						{"Name": "Amount", "Value": amount},
						{"Name": "MpesaReceiptNumber", "Value": "RCPT123"},
						{"Name": "PhoneNumber", "Value": 254712345678},
					]
				},
			}
		}
	}


class TestStkCallbackHardening(FrappeTestCase):
	"""The STK callback is an unauthenticated (allow_guest) money endpoint, so
	these prove the three defenses: reconcile-only, success path, amount match."""

	def test_legitimate_callback_reconciles_pending_row(self):
		checkout = "ws_CO_legit_1"
		name = _pending(checkout, amount=100)
		res = stk_callback(**_success_payload(checkout, amount=100))
		self.assertEqual(res["ResultCode"], 0)
		doc = frappe.get_doc("M-Pesa Transaction", name)
		self.assertEqual(doc.status, "Success")
		self.assertEqual(doc.mpesa_receipt_number, "RCPT123")
		self.assertEqual(doc.docstatus, 1)  # auto-submitted on terminal status

	def test_unknown_checkout_id_is_rejected_and_creates_nothing(self):
		before = frappe.db.count("M-Pesa Transaction")
		res = stk_callback(**_success_payload("ws_CO_forged_unknown", amount=5000))
		self.assertEqual(res["ResultCode"], 1)
		self.assertEqual(res["ResultDesc"], "Unknown CheckoutRequestID")
		# The forged callback must not have created a row.
		self.assertEqual(frappe.db.count("M-Pesa Transaction"), before)

	def test_amount_mismatch_is_rejected_without_mutating(self):
		checkout = "ws_CO_amount_1"
		name = _pending(checkout, amount=100)
		res = stk_callback(**_success_payload(checkout, amount=5000))
		self.assertEqual(res["ResultCode"], 1)
		self.assertEqual(res["ResultDesc"], "Amount mismatch")
		doc = frappe.get_doc("M-Pesa Transaction", name)
		self.assertEqual(doc.status, "Pending")  # untouched
		self.assertEqual(doc.docstatus, 0)
