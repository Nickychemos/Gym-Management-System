"""Demo data seeder (DEV ONLY).

Populates a member with realistic history (visits, payments, classes, PT, NPS)
so the Member 360 Analytics tab renders full charts for visualization. Run via:

    bench --site <site> execute gym_management.demo.seed_all

Idempotent per member: re-running clears that member's generated rows first.
NOT whitelisted and NOT for production data.
"""

from __future__ import annotations

import random

import frappe
from frappe.utils import add_days, add_to_date, get_datetime, getdate, today

# Gym-goer weekday weighting (Mon..Sun): busy early week, quiet weekends.
_WEEKDAY_W = [0.78, 0.76, 0.72, 0.66, 0.5, 0.3, 0.22]

_CHECKIN_METHODS = ["RFID", "QR", "Reception Manual", "Mobile App", "Face"]
_VISIT_PURPOSES = ["Gym", "Gym", "Gym", "Class", "PT Session"]

# Per-profile shape. `recency` scales the chance of a visit on a given day by how
# recent it is (lambda of day-offset 0..83) so we can model steady vs declining.
_PROFILES = {
    "engaged": {
        "visit_base": 0.85,
        "recency": lambda d: 1.0,
        "nps": [8, 9, 9],
        "pt": (10, 4),
        "class_mix": ["Checked-In"] * 7 + ["No-Show", "Cancelled", "Booked"],
        "addon_chance": 0.5,
    },
    "moderate": {
        "visit_base": 0.5,
        "recency": lambda d: 1.0,
        "nps": [7, 7, 8],
        "pt": (10, 6),
        "class_mix": ["Checked-In"] * 4 + ["No-Show", "Cancelled", "Booked", "Checked-In"],
        "addon_chance": 0.3,
    },
    "at_risk": {
        # Only older days get visits (nothing in the last ~25) -> high churn risk.
        "visit_base": 0.7,
        "recency": lambda d: 1.0 if d >= 25 else 0.0,
        "nps": [6, 5, 4],
        "pt": None,
        "class_mix": ["No-Show", "No-Show", "Cancelled", "Checked-In", "Booked"],
        "addon_chance": 0.15,
    },
}


def _norm_phone(phone: str | None) -> str:
    p = "".join(ch for ch in (phone or "") if ch.isdigit())
    if p.startswith("0"):
        p = "254" + p[1:]
    elif not p.startswith("254"):
        p = "2547" + p[-8:].rjust(8, "0")
    return p[:12] or "254700000000"


def _clear(customer: str) -> None:
    """Wipe this member's generated rows so re-runs don't pile up (direct SQL,
    bypassing controllers — fine for throwaway demo data)."""
    frappe.db.delete("Visit Log", {"customer": customer})
    frappe.db.delete("Class Booking", {"customer": customer})
    frappe.db.delete("PT Package", {"customer": customer})
    frappe.db.delete("Survey Response", {"member": customer})
    frappe.db.delete("M-Pesa Transaction", {"customer": customer, "direction": "Inbound"})


def seed_member_demo(member: str, profile: str = "engaged", weeks: int = 12) -> dict:
    cfg = _PROFILES[profile]
    rng = random.Random(hash(member) & 0xFFFF)

    mp = frappe.db.get_value(
        "Member Profile", member, ["customer", "home_branch", "phone"], as_dict=True
    )
    if not mp:
        frappe.throw(f"Member {member} not found")
    customer, branch, phone = mp.customer, mp.home_branch, _norm_phone(mp.phone)
    branch = branch or frappe.db.get_value("Branch", {}, "name")
    sub = frappe.db.get_value(
        "Member Subscription",
        {"customer": customer, "docstatus": 1, "status": ["in", ["Active", "Frozen"]]},
        "name",
    )

    _clear(customer)

    # ---- Visits over the trailing `weeks` window ----
    days = weeks * 7
    visits = 0
    last_visit = None
    for d in range(days):
        date = add_days(getdate(today()), -d)
        w = _WEEKDAY_W[date.weekday()]
        if rng.random() < w * cfg["visit_base"] * cfg["recency"](d):
            hour = rng.randint(6, 20)
            minute = rng.choice([0, 15, 30, 45])
            ci = get_datetime(f"{date} {hour:02d}:{minute:02d}:00")
            dur = rng.randint(45, 95)
            co = add_to_date(ci, minutes=dur)
            frappe.get_doc(
                {
                    "doctype": "Visit Log",
                    "customer": customer,
                    "branch": branch,
                    "check_in_time": str(ci),
                    "check_out_time": str(co),
                    "duration_minutes": dur,
                    "check_in_method": rng.choice(_CHECKIN_METHODS),
                    "visit_purpose": rng.choice(_VISIT_PURPOSES),
                    "active_subscription": sub,
                }
            ).insert(ignore_permissions=True)  # draft: analytics counts all rows
            visits += 1
            if last_visit is None or ci > last_visit:
                last_visit = ci

    # Backdate membership start to ~a month before the visit window so tenure and
    # avg/week are realistic (otherwise a member created days ago shows a wild
    # per-week average against 12 weeks of seeded visits).
    joined = add_days(getdate(today()), -(days + 30))
    frappe.db.set_value(
        "Member Profile",
        member,
        {
            "total_visits": visits,
            "last_visit": str(last_visit) if last_visit else None,
            "joined_on": str(joined),
        },
    )

    # ---- Payments across the last 6 months (membership + occasional add-on) ----
    base_price = (
        frappe.db.get_value("Member Subscription", sub, "price") if sub else None
    ) or 6000
    pay_idx = 0
    d0 = getdate(today())
    y, m = d0.year, d0.month
    for _i in range(6):
        when = get_datetime(f"{y:04d}-{m:02d}-07 09:{rng.randint(10,59):02d}:00")
        # Skip the most recent months for at-risk members (lapsing).
        if not (profile == "at_risk" and _i < 2):
            _payment(customer, phone, base_price, when, "STK Push", member, pay_idx)
            pay_idx += 1
            if rng.random() < cfg["addon_chance"]:
                _payment(
                    customer, phone, rng.choice([500, 1500, 3000]), when,
                    "C2B Paybill", member, pay_idx,
                )
                pay_idx += 1
        m -= 1
        if m == 0:
            m, y = 12, y - 1

    # ---- One PT package ----
    if cfg["pt"]:
        purchased, used = cfg["pt"]
        trainer = frappe.db.get_value("Employee", {}, "name")
        if trainer:
            frappe.get_doc(
                {
                    "doctype": "PT Package",
                    "customer": customer,
                    "trainer": trainer,
                    "branch": branch,
                    "start_date": add_days(getdate(today()), -40),
                    "expiry_date": add_days(getdate(today()), 50),
                    "status": "Active",
                    "price": 18000,
                    "sessions_purchased": purchased,
                    "sessions_used": used,
                }
            ).insert(ignore_permissions=True).submit()

    # ---- NPS survey responses ----
    tmpl = frappe.db.get_value("Survey Template", {"survey_type": "NPS"}, "name")
    if tmpl:
        for score, days_ago in zip(cfg["nps"], (75, 35, 6)):
            frappe.get_doc(
                {
                    "doctype": "Survey Response",
                    "survey_template": tmpl,
                    "member": customer,
                    "submitted_on": f"{add_days(getdate(today()), -days_ago)} 10:00:00",
                    "submitted_via": "WhatsApp",
                    "nps_score": score,
                }
            ).insert(ignore_permissions=True)

    # ---- Class bookings against existing sessions (mixed outcomes) ----
    sessions = frappe.get_all(
        "Class Session", filters={"docstatus": 1}, fields=["name"], limit=40
    )
    bookings = 0
    if sessions:
        for i in range(min(16, len(sessions) * 2)):
            sess = rng.choice(sessions).name
            status = rng.choice(cfg["class_mix"])
            booked = add_to_date(get_datetime(str(today())), days=-rng.randint(1, 80))
            doc = frappe.get_doc(
                {
                    "doctype": "Class Booking",
                    "class_session": sess,
                    "customer": customer,
                    "status": status,
                    "booked_at": str(booked),
                    "check_in_time": str(booked) if status == "Checked-In" else None,
                    "payment_required": 1,
                }
            )
            doc.flags.ignore_validate = True
            doc.insert(ignore_permissions=True)
            # Force submitted so the analytics (docstatus=1) counts it; the
            # booking's on_submit side effects are irrelevant for demo history.
            frappe.db.set_value("Class Booking", doc.name, "docstatus", 1)
            bookings += 1

    frappe.db.commit()
    return {"member": member, "profile": profile, "visits": visits, "bookings": bookings}


def _payment(customer, phone, amount, when, txn_type, member, idx):
    frappe.get_doc(
        {
            "doctype": "M-Pesa Transaction",
            "customer": customer,
            "amount": amount,
            "phone_number": phone,
            "direction": "Inbound",
            "status": "Success",
            "transaction_type": txn_type,
            "mpesa_receipt_number": f"D{member.replace('-', '')}{idx:03d}",
            "mpesa_timestamp": str(when),
            "account_reference": "DEMO",
        }
    ).insert(ignore_permissions=True)  # draft: analytics has no docstatus filter


def seed_all() -> list[dict]:
    """Seed the three demo members with contrasting profiles so the analytics
    show variety (engaged / moderate / at-risk)."""
    plan = [
        ("MEM-2026-000002", "engaged"),   # John Mbugua
        ("MEM-2026-000001", "moderate"),  # Test Member
        ("MEM-2026-000003", "at_risk"),   # Michael Wamalwa
    ]
    out = []
    for member, profile in plan:
        if frappe.db.exists("Member Profile", member):
            out.append(seed_member_demo(member, profile))
    return out
