"""Aggregated, cross-module reports for owners and managers.

Each report is a code-defined builder that returns a generic envelope
(kpis / charts / tables, each keyed) so a single frontend viewer can render any
report and section/column toggles are trivial. Aggregation reuses the SQL
patterns from dashboard.py / payments.py / surveys.py and the branch helper
resolve_branch_filter(). All endpoints are Manager-tier; within a gym a manager
sees every branch (branch is an optional filter/breakdown, default = all).

v1 reports: revenue_summary, membership_mrr, class_attendance, nps, owner_snapshot.
"""

from __future__ import annotations

import csv
import io

import frappe
from frappe.utils import (
    add_days,
    add_to_date,
    flt,
    formatdate,
    get_first_day,
    get_last_day,
    getdate,
    now_datetime,
    today,
)
from frappe.utils.pdf import get_pdf
from frappe.utils.xlsxutils import make_xlsx

from gym_management.branches import resolve_branch_filter
from gym_management.rbac import GYM_ROLES, MANAGER, requires

# Value formats the frontend understands when rendering a cell/KPI.
KSH, NUM, PCT, TEXT, DATE = "ksh", "number", "percent", "text", "date"


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

REPORTS: dict[str, dict] = {
    "revenue_summary": {
        "title": "Revenue Summary",
        "category": "Financial",
        "description": "M-Pesa income by period, branch and method, with trend.",
        "financial": True,
    },
    "membership_mrr": {
        "title": "Membership & MRR",
        "category": "Financial",
        "description": "Active members, new vs churned, MRR by plan and branch.",
        "financial": True,
    },
    "class_attendance": {
        "title": "Class Attendance & Fill",
        "category": "Operations",
        "description": "Sessions, capacity fill, attendance and no-shows.",
        "financial": False,
    },
    "nps": {
        "title": "NPS & Survey",
        "category": "Experience",
        "description": "NPS trend, promoter/detractor mix and recent comments.",
        "financial": False,
    },
    "owner_snapshot": {
        "title": "Owner Monthly Snapshot",
        "category": "Executive",
        "description": "One-page cross-module health: revenue, members, fill, NPS.",
        "financial": True,
    },
}


# ---------------------------------------------------------------------------
# Period resolution
# ---------------------------------------------------------------------------


def _resolve_period(period: str = "this_month", start=None, end=None) -> dict:
    """Return {start, end, label, prev_start, prev_end} for a period selector."""
    t = getdate(today())
    if period == "custom" and start and end:
        s, e = getdate(start), getdate(end)
        label = f"{formatdate(s)} to {formatdate(e)}"
    elif period == "last_month":
        e = add_days(get_first_day(t), -1)
        s = get_first_day(e)
        label = formatdate(s, "MMMM yyyy")
    elif period == "this_quarter":
        q = (t.month - 1) // 3
        s = getdate(f"{t.year}-{q * 3 + 1:02d}-01")
        e = t
        label = f"Q{q + 1} {t.year}"
    elif period == "this_year":
        s = getdate(f"{t.year}-01-01")
        e = t
        label = str(t.year)
    elif period == "last_30_days":
        s, e = add_days(t, -29), t
        label = "Last 30 days"
    else:  # this_month
        s, e = get_first_day(t), t
        label = formatdate(s, "MMMM yyyy")
    span = (getdate(e) - getdate(s)).days
    prev_e = add_days(getdate(s), -1)
    prev_s = add_days(prev_e, -span)
    return {
        "start": str(s),
        "end": str(e),
        "label": label,
        "prev_start": str(prev_s),
        "prev_end": str(prev_e),
    }


def _kpi(key, label, value, fmt=NUM, hint=None, delta=None) -> dict:
    return {"key": key, "label": label, "value": value, "format": fmt,
            "hint": hint, "delta": delta}


def _delta_pct(curr, prev):
    if not prev:
        return None
    return round((curr - prev) / prev * 100, 1)


# ---------------------------------------------------------------------------
# Shared aggregation helpers
# ---------------------------------------------------------------------------


def _revenue_total(s, e, branch):
    """(sum, count) of successful inbound M-Pesa in [s,e], optionally per branch."""
    cond = (
        "t.status='Success' AND t.direction='Inbound' "
        "AND DATE(COALESCE(t.mpesa_timestamp, t.creation)) BETWEEN %(s)s AND %(e)s"
    )
    params = {"s": s, "e": e}
    if branch:
        cond += (
            " AND EXISTS (SELECT 1 FROM `tabMember Profile` mp "
            "WHERE mp.customer = t.customer AND mp.home_branch = %(b)s)"
        )
        params["b"] = branch
    row = frappe.db.sql(
        f"SELECT COALESCE(SUM(t.amount),0), COUNT(*) FROM `tabM-Pesa Transaction` t WHERE {cond}",
        params,
    )[0]
    return flt(row[0]), int(row[1])


def _daily_revenue(s, e, branch):
    cond = (
        "t.status='Success' AND t.direction='Inbound' "
        "AND DATE(COALESCE(t.mpesa_timestamp, t.creation)) BETWEEN %(s)s AND %(e)s"
    )
    params = {"s": s, "e": e}
    if branch:
        cond += (
            " AND EXISTS (SELECT 1 FROM `tabMember Profile` mp "
            "WHERE mp.customer = t.customer AND mp.home_branch = %(b)s)"
        )
        params["b"] = branch
    rows = frappe.db.sql(
        f"""SELECT DATE(COALESCE(t.mpesa_timestamp, t.creation)) d, COALESCE(SUM(t.amount),0)
            FROM `tabM-Pesa Transaction` t WHERE {cond} GROUP BY d ORDER BY d""",
        params,
    )
    by_day = {str(d): flt(a) for d, a in rows}
    out, cur = [], getdate(s)
    while cur <= getdate(e):
        out.append({"label": formatdate(cur, "d MMM"), "value": by_day.get(str(cur), 0.0)})
        cur = add_days(cur, 1)
    return out


# ---------------------------------------------------------------------------
# Report builders
# ---------------------------------------------------------------------------


def _revenue_summary(p, branch):
    s, e = p["start"], p["end"]
    total, count = _revenue_total(s, e, branch)
    prev_total, _ = _revenue_total(p["prev_start"], p["prev_end"], branch)
    avg = round(total / count, 0) if count else 0

    by_branch = frappe.db.sql(
        """SELECT COALESCE(mp.home_branch,'Unassigned') br, COALESCE(SUM(t.amount),0) rev, COUNT(*) n
           FROM `tabM-Pesa Transaction` t
           LEFT JOIN `tabMember Profile` mp ON mp.customer = t.customer
           WHERE t.status='Success' AND t.direction='Inbound'
             AND DATE(COALESCE(t.mpesa_timestamp,t.creation)) BETWEEN %(s)s AND %(e)s
           GROUP BY br ORDER BY rev DESC""",
        {"s": s, "e": e},
        as_dict=True,
    )
    by_method = frappe.db.sql(
        """SELECT COALESCE(transaction_type,'Other') method, COALESCE(SUM(amount),0) rev, COUNT(*) n
           FROM `tabM-Pesa Transaction`
           WHERE status='Success' AND direction='Inbound'
             AND DATE(COALESCE(mpesa_timestamp,creation)) BETWEEN %(s)s AND %(e)s
           GROUP BY method ORDER BY rev DESC""",
        {"s": s, "e": e},
        as_dict=True,
    )
    return {
        "kpis": [
            _kpi("total", "Total revenue", total, KSH, delta=_delta_pct(total, prev_total)),
            _kpi("count", "Transactions", count, NUM),
            _kpi("avg", "Avg transaction", avg, KSH),
            _kpi("prev", "Previous period", prev_total, KSH, hint="same length, prior"),
        ],
        "charts": [
            {"key": "trend", "type": "area", "title": "Daily revenue",
             "format": KSH, "data": _daily_revenue(s, e, branch)},
        ],
        "tables": [
            {"key": "by_branch", "title": "By branch",
             "columns": [{"key": "br", "label": "Branch", "format": TEXT},
                         {"key": "rev", "label": "Revenue", "format": KSH},
                         {"key": "n", "label": "Txns", "format": NUM}],
             "rows": [{"br": r.br, "rev": flt(r.rev), "n": int(r.n)} for r in by_branch]},
            {"key": "by_method", "title": "By payment type",
             "columns": [{"key": "method", "label": "Type", "format": TEXT},
                         {"key": "rev", "label": "Revenue", "format": KSH},
                         {"key": "n", "label": "Txns", "format": NUM}],
             "rows": [{"method": r.method, "rev": flt(r.rev), "n": int(r.n)} for r in by_method]},
        ],
    }


def _active_members(branch):
    cond = "status IN ('Active','Frozen') AND docstatus=1"
    params = {}
    if branch:
        cond += " AND branch=%(b)s"
        params["b"] = branch
    return int(frappe.db.sql(
        f"SELECT COUNT(DISTINCT customer) FROM `tabMember Subscription` WHERE {cond}", params
    )[0][0])


def _membership_mrr(p, branch):
    s, e = p["start"], p["end"]
    active = _active_members(branch)

    bcond = " AND branch=%(b)s" if branch else ""
    params = {"s": s, "e": e}
    if branch:
        params["b"] = branch

    new = int(frappe.db.sql(
        f"""SELECT COUNT(*) FROM `tabMember Subscription`
            WHERE docstatus=1 AND DATE(creation) BETWEEN %(s)s AND %(e)s{bcond}""",
        params,
    )[0][0])
    churned = int(frappe.db.sql(
        f"""SELECT COUNT(*) FROM `tabMember Subscription`
            WHERE status IN ('Lapsed','Cancelled')
              AND DATE(modified) BETWEEN %(s)s AND %(e)s{bcond}""",
        params,
    )[0][0])

    # MRR: sum of active subs' price normalised to a 30-day month.
    mrr_rows = frappe.db.sql(
        f"""SELECT COALESCE(SUM(price * 30.0 / GREATEST(duration_days,1)),0)
            FROM `tabMember Subscription`
            WHERE status IN ('Active','Frozen') AND docstatus=1{bcond}""",
        params,
    )
    mrr = flt(mrr_rows[0][0])

    by_plan = frappe.db.sql(
        f"""SELECT membership_plan plan, COUNT(DISTINCT customer) members,
                   COALESCE(SUM(price*30.0/GREATEST(duration_days,1)),0) mrr
            FROM `tabMember Subscription`
            WHERE status IN ('Active','Frozen') AND docstatus=1{bcond}
            GROUP BY plan ORDER BY mrr DESC""",
        params,
        as_dict=True,
    )
    by_branch = frappe.db.sql(
        """SELECT COALESCE(branch,'Unassigned') br, COUNT(DISTINCT customer) members
           FROM `tabMember Subscription`
           WHERE status IN ('Active','Frozen') AND docstatus=1
           GROUP BY br ORDER BY members DESC""",
        as_dict=True,
    )
    return {
        "kpis": [
            _kpi("active", "Active members", active, NUM),
            _kpi("new", "New (period)", new, NUM),
            _kpi("churned", "Churned (period)", churned, NUM),
            _kpi("net", "Net change", new - churned, NUM),
            _kpi("mrr", "MRR", mrr, KSH, hint="monthly recurring"),
        ],
        "charts": [
            {"key": "by_plan", "type": "bar", "title": "Members by plan", "format": NUM,
             "data": [{"label": r.plan or "—", "value": int(r.members)} for r in by_plan]},
        ],
        "tables": [
            {"key": "plans", "title": "By plan",
             "columns": [{"key": "plan", "label": "Plan", "format": TEXT},
                         {"key": "members", "label": "Members", "format": NUM},
                         {"key": "mrr", "label": "MRR", "format": KSH}],
             "rows": [{"plan": r.plan, "members": int(r.members), "mrr": flt(r.mrr)} for r in by_plan]},
            {"key": "branches", "title": "By branch",
             "columns": [{"key": "br", "label": "Branch", "format": TEXT},
                         {"key": "members", "label": "Members", "format": NUM}],
             "rows": [{"br": r.br, "members": int(r.members)} for r in by_branch]},
        ],
    }


def _class_attendance(p, branch):
    s, e = p["start"], p["end"]
    bcond = " AND cs.branch=%(b)s" if branch else ""
    params = {"s": s, "e": e}
    if branch:
        params["b"] = branch

    sess = frappe.db.sql(
        f"""SELECT COUNT(*) sessions, COALESCE(SUM(capacity),0) cap,
                   COALESCE(SUM(bookings_count),0) booked
            FROM `tabClass Session` cs
            WHERE cs.docstatus=1 AND DATE(cs.start_time) BETWEEN %(s)s AND %(e)s{bcond}""",
        params,
        as_dict=True,
    )[0]
    bk = frappe.db.sql(
        f"""SELECT cb.status st, COUNT(*) n
            FROM `tabClass Booking` cb JOIN `tabClass Session` cs ON cs.name=cb.class_session
            WHERE cb.docstatus=1 AND DATE(cs.start_time) BETWEEN %(s)s AND %(e)s{bcond}
            GROUP BY cb.status""",
        params,
    )
    bs = {st: int(n) for st, n in bk}
    attended = bs.get("Checked-In", 0)
    no_show = bs.get("No-Show", 0)
    cancelled = bs.get("Cancelled", 0)
    seen = attended + no_show
    att_rate = round(100 * attended / seen, 1) if seen else None
    fill = round(100 * int(sess.booked) / int(sess.cap), 1) if sess.cap else None

    by_type = frappe.db.sql(
        f"""SELECT cs.class_type ct, COUNT(DISTINCT cs.name) sessions, COUNT(cb.name) bookings,
                   SUM(CASE WHEN cb.status='Checked-In' THEN 1 ELSE 0 END) attended
            FROM `tabClass Session` cs
            LEFT JOIN `tabClass Booking` cb ON cb.class_session=cs.name AND cb.docstatus=1
            WHERE cs.docstatus=1 AND DATE(cs.start_time) BETWEEN %(s)s AND %(e)s{bcond}
            GROUP BY cs.class_type ORDER BY bookings DESC""",
        params,
        as_dict=True,
    )
    return {
        "kpis": [
            _kpi("sessions", "Sessions held", int(sess.sessions), NUM),
            _kpi("bookings", "Bookings", attended + no_show + cancelled + bs.get("Booked", 0), NUM),
            _kpi("att_rate", "Attendance rate", att_rate, PCT),
            _kpi("no_shows", "No-shows", no_show, NUM),
            _kpi("fill", "Avg fill", fill, PCT, hint="booked vs capacity"),
        ],
        "charts": [
            {"key": "by_type", "type": "bar", "title": "Bookings by class type", "format": NUM,
             "data": [{"label": r.ct or "—", "value": int(r.bookings)} for r in by_type]},
        ],
        "tables": [
            {"key": "types", "title": "By class type",
             "columns": [{"key": "ct", "label": "Class", "format": TEXT},
                         {"key": "sessions", "label": "Sessions", "format": NUM},
                         {"key": "bookings", "label": "Bookings", "format": NUM},
                         {"key": "attended", "label": "Attended", "format": NUM}],
             "rows": [{"ct": r.ct, "sessions": int(r.sessions), "bookings": int(r.bookings),
                       "attended": int(r.attended or 0)} for r in by_type]},
        ],
    }


def _nps(p, branch):
    s, e = p["start"], p["end"]
    # Branch scoping for surveys goes through the member's home branch.
    join = ""
    bcond = ""
    params = {"s": s, "e": e}
    if branch:
        join = "JOIN `tabMember Profile` mp ON mp.customer = sr.member"
        bcond = " AND mp.home_branch=%(b)s"
        params["b"] = branch

    rows = frappe.db.sql(
        f"""SELECT sr.nps_category cat, COUNT(*) n
            FROM `tabSurvey Response` sr {join}
            WHERE sr.nps_score IS NOT NULL
              AND DATE(sr.submitted_on) BETWEEN %(s)s AND %(e)s{bcond}
            GROUP BY sr.nps_category""",
        params,
    )
    counts = {c: int(n) for c, n in rows}
    promoters = counts.get("Promoter", 0)
    passives = counts.get("Passive", 0)
    detractors = counts.get("Detractor", 0)
    total = promoters + passives + detractors
    nps = round((promoters - detractors) / total * 100) if total else None

    comments = frappe.db.sql(
        f"""SELECT sr.member, sr.nps_score sc, sr.nps_category cat, sr.comment cmt, sr.submitted_on dt
            FROM `tabSurvey Response` sr {join}
            WHERE sr.nps_score IS NOT NULL AND COALESCE(sr.comment,'')<>''
              AND DATE(sr.submitted_on) BETWEEN %(s)s AND %(e)s{bcond}
            ORDER BY sr.submitted_on DESC LIMIT 10""",
        params,
        as_dict=True,
    )
    return {
        "kpis": [
            _kpi("nps", "NPS", nps, NUM, hint="promoters minus detractors"),
            _kpi("responses", "Responses", total, NUM),
            _kpi("promoters", "Promoters", promoters, NUM),
            _kpi("detractors", "Detractors", detractors, NUM),
        ],
        "charts": [
            {"key": "mix", "type": "bar", "title": "Promoter / Passive / Detractor", "format": NUM,
             "data": [{"label": "Promoters", "value": promoters},
                      {"label": "Passives", "value": passives},
                      {"label": "Detractors", "value": detractors}]},
        ],
        "tables": [
            {"key": "comments", "title": "Recent comments",
             "columns": [{"key": "cat", "label": "Type", "format": TEXT},
                         {"key": "sc", "label": "Score", "format": NUM},
                         {"key": "cmt", "label": "Comment", "format": TEXT},
                         {"key": "dt", "label": "When", "format": DATE}],
             "rows": [{"cat": r.cat, "sc": int(r.sc), "cmt": r.cmt, "dt": str(r.dt)} for r in comments]},
        ],
    }


def _owner_snapshot(p, branch):
    rev = _revenue_summary(p, branch)
    mem = _membership_mrr(p, branch)
    cls = _class_attendance(p, branch)
    nps = _nps(p, branch)

    def find(sections, key):
        for k in sections["kpis"]:
            if k["key"] == key:
                return k["value"]
        return None

    return {
        "kpis": [
            _kpi("revenue", "Revenue", find(rev, "total"), KSH),
            _kpi("active", "Active members", find(mem, "active"), NUM),
            _kpi("net", "Net member change", find(mem, "net"), NUM),
            _kpi("mrr", "MRR", find(mem, "mrr"), KSH),
            _kpi("fill", "Avg class fill", find(cls, "fill"), PCT),
            _kpi("nps", "NPS", find(nps, "nps"), NUM),
        ],
        "charts": rev["charts"],
        "tables": [mem["tables"][1], rev["tables"][0]],  # members by branch, revenue by branch
    }


_BUILDERS = {
    "revenue_summary": _revenue_summary,
    "membership_mrr": _membership_mrr,
    "class_attendance": _class_attendance,
    "nps": _nps,
    "owner_snapshot": _owner_snapshot,
}


# ---------------------------------------------------------------------------
# Whitelisted API
# ---------------------------------------------------------------------------


def _catalogue_config() -> dict:
    """Per-site enable/order config: {report_key: {enabled, order}}."""
    raw = frappe.db.get_single_value("Report Settings", "catalogue")
    cfg = frappe.parse_json(raw) if raw else {}
    return cfg if isinstance(cfg, dict) else {}


@frappe.whitelist()
@requires(MANAGER)
def list_reports() -> list[dict]:
    """The catalogue of enabled reports (for the Reports home), in saved order."""
    cfg = _catalogue_config()
    items = []
    for i, (k, v) in enumerate(REPORTS.items()):
        c = cfg.get(k, {})
        if c.get("enabled", True) is False:
            continue
        items.append({
            "key": k, "title": v["title"], "category": v["category"],
            "description": v["description"], "financial": v["financial"],
            "_order": c.get("order", i),
        })
    items.sort(key=lambda x: x["_order"])
    for it in items:
        it.pop("_order", None)
    return items


@frappe.whitelist()
@requires(MANAGER)
def report_settings() -> list[dict]:
    """Every report with its enabled/order, for the catalogue manager."""
    cfg = _catalogue_config()
    out = []
    for i, (k, v) in enumerate(REPORTS.items()):
        c = cfg.get(k, {})
        out.append({
            "key": k, "title": v["title"], "category": v["category"],
            "enabled": c.get("enabled", True) is not False,
            "order": c.get("order", i),
        })
    out.sort(key=lambda x: x["order"])
    return out


@frappe.whitelist()
@requires(MANAGER)
def save_report_settings(items) -> dict:
    """Persist enable/order. `items` is an ordered list of {key, enabled}."""
    items = frappe.parse_json(items) if isinstance(items, str) else items
    cfg = {}
    for i, it in enumerate(items or []):
        if it.get("key") in REPORTS:
            cfg[it["key"]] = {"enabled": bool(it.get("enabled", True)), "order": i}
    doc = frappe.get_single("Report Settings")
    doc.catalogue = frappe.as_json(cfg)
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"ok": True}


def _envelope(report, period, start, end, branch) -> dict:
    """Build a report's generic envelope. Shared by run_report and export."""
    if report not in _BUILDERS:
        frappe.throw(frappe._("Unknown report: {0}").format(report))
    branch = resolve_branch_filter(branch)  # managers: requested branch or all
    p = _resolve_period(period, start, end)
    sections = _BUILDERS[report](p, branch)
    meta = REPORTS[report]
    return {
        "key": report,
        "title": meta["title"],
        "category": meta["category"],
        "period": p,
        "branch": branch,
        "generated_on": str(frappe.utils.now_datetime()),
        "kpis": sections.get("kpis", []),
        "charts": sections.get("charts", []),
        "tables": sections.get("tables", []),
    }


@frappe.whitelist()
@requires(MANAGER)
def run_report(report: str, period: str = "this_month", start=None, end=None,
               branch: str | None = None) -> dict:
    """Run a report and return its generic envelope (kpis/charts/tables)."""
    return _envelope(report, period, start, end, branch)


# ---------------------------------------------------------------------------
# Export (PDF / CSV / Excel) — same service layer, so numbers always match
# ---------------------------------------------------------------------------


def _raw(value, fmt):
    """Value for CSV/Excel cells: keep numbers numeric, others as text."""
    if value is None or value == "":
        return ""
    if fmt in (KSH, NUM, PCT):
        return value
    return str(value)


def _report_rows(env) -> list[list]:
    """Flatten an envelope to spreadsheet rows (title, KPIs, then each table)."""
    rows: list[list] = [[env["title"]], [f"Period: {env['period']['label']}"], []]
    if env["kpis"]:
        rows.append(["Metric", "Value"])
        for k in env["kpis"]:
            rows.append([k["label"], _raw(k["value"], k["format"])])
        rows.append([])
    for t in env["tables"]:
        rows.append([t["title"]])
        rows.append([c["label"] for c in t["columns"]])
        for r in t["rows"]:
            rows.append([_raw(r.get(c["key"]), c["format"]) for c in t["columns"]])
        rows.append([])
    return rows


def _to_csv(env) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    for row in _report_rows(env):
        w.writerow(row)
    return buf.getvalue()


def _to_xlsx(env) -> bytes:
    xlsx = make_xlsx(_report_rows(env), (env["title"] or "Report")[:31])
    return xlsx.getvalue()


def _brand() -> dict:
    try:
        bs = frappe.get_cached_doc("Brand Settings")
        return {
            "name": bs.gym_display_name or bs.gym_legal_name or "Benisho",
            "color": bs.primary_color or "#0f1115",
            "logo": bs.logo,
        }
    except Exception:
        return {"name": "Benisho", "color": "#0f1115", "logo": None}


def _fmt_html(value, fmt) -> str:
    if value is None or value == "":
        return "&mdash;"
    if fmt == KSH:
        try:
            return f"KSh {float(value):,.0f}"
        except (TypeError, ValueError):
            return str(value)
    if fmt == PCT:
        return f"{value}%"
    if fmt == NUM:
        try:
            return f"{float(value):,.0f}"
        except (TypeError, ValueError):
            return str(value)
    return frappe.utils.escape_html(str(value))


def _to_pdf(env) -> bytes:
    b = _brand()
    kpis = "".join(
        f"<div class='kpi'><div class='kl'>{frappe.utils.escape_html(k['label'])}</div>"
        f"<div class='kv'>{_fmt_html(k['value'], k['format'])}</div></div>"
        for k in env["kpis"]
    )
    tables = ""
    for t in env["tables"]:
        head = "".join(f"<th>{frappe.utils.escape_html(c['label'])}</th>" for c in t["columns"])
        body = ""
        for r in t["rows"]:
            cells = "".join(
                f"<td>{_fmt_html(r.get(c['key']), c['format'])}</td>" for c in t["columns"]
            )
            body += f"<tr>{cells}</tr>"
        if not body:
            body = f"<tr><td colspan='{len(t['columns'])}' class='muted'>No data</td></tr>"
        tables += (
            f"<h3>{frappe.utils.escape_html(t['title'])}</h3>"
            f"<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>"
        )
    logo = f"<img class='logo' src='{b['logo']}' style='height:34px'/>" if b["logo"] else ""
    # NB: wkhtmltopdf's WebKit predates flexbox — use inline-block / float only.
    html = f"""<html><head><meta charset="utf-8"><style>
      body{{font-family:Helvetica,Arial,sans-serif;color:#0f1115;font-size:12px;}}
      .head{{overflow:hidden;border-bottom:2px solid {b['color']};
             padding-bottom:8px;margin-bottom:14px;}}
      .logo{{float:right;}}
      .title{{font-size:19px;font-weight:700;}}
      .sub{{color:#6b7280;font-size:11px;margin-top:2px;}}
      .kpis{{margin:12px 0;}}
      .kpi{{display:inline-block;vertical-align:top;border:1px solid #e4e5e7;
            border-radius:6px;padding:8px 12px;min-width:118px;margin:0 6px 6px 0;}}
      .kl{{color:#6b7280;font-size:10px;}}
      .kv{{font-size:17px;font-weight:700;margin-top:2px;}}
      h3{{margin:16px 0 4px;font-size:13px;}}
      table{{width:100%;border-collapse:collapse;margin-bottom:6px;}}
      th,td{{text-align:left;padding:5px 8px;border-bottom:1px solid #eee;font-size:11px;}}
      th{{background:#f7f7f8;color:#525866;}}
      .muted{{color:#9ca0a8;}}
      .foot{{margin-top:18px;color:#9ca0a8;font-size:10px;border-top:1px solid #eee;padding-top:6px;}}
    </style></head><body>
      <div class='head'>
        {logo}
        <div class='title'>{frappe.utils.escape_html(env['title'])}</div>
        <div class='sub'>{frappe.utils.escape_html(b['name'])} &middot; {frappe.utils.escape_html(env['period']['label'])}</div>
      </div>
      <div class='kpis'>{kpis}</div>
      {tables}
      <div class='foot'>Generated {env['generated_on'][:16]} &middot; {frappe.utils.escape_html(b['name'])}</div>
    </body></html>"""
    return get_pdf(html)


@frappe.whitelist()
@requires(MANAGER)
def export_report(report: str, format: str = "pdf", period: str = "this_month",
                  start=None, end=None, branch: str | None = None, config=None):
    """Download a report as pdf / csv / xlsx. Served as a binary attachment.
    `config` (a visibility JSON) hides the same sections/columns as on screen."""
    env = _envelope(report, period, start, end, branch)
    if config:
        cfg = config if isinstance(config, dict) else frappe.parse_json(config)
        env = _apply_visibility(env, cfg or {})
    base = f"{report}_{env['period']['label']}".replace(" ", "_").replace("/", "-")
    if format == "csv":
        content, ext = _to_csv(env), "csv"
    elif format == "xlsx":
        content, ext = _to_xlsx(env), "xlsx"
    else:
        content, ext = _to_pdf(env), "pdf"
    frappe.response["filename"] = f"{base}.{ext}"
    frappe.response["filecontent"] = content
    frappe.response["type"] = "binary"


# ---------------------------------------------------------------------------
# Scheduling + email delivery
# ---------------------------------------------------------------------------

_WEEKDAYS_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
                  "Saturday", "Sunday"]
_PERIODS = ["this_month", "last_month", "last_30_days", "this_quarter", "this_year"]
_FORMATS = ["pdf", "csv", "xlsx"]


def _json_list(value) -> list:
    if not value:
        return []
    if isinstance(value, list):
        return [str(v) for v in value]
    try:
        parsed = frappe.parse_json(value)
        return [str(v) for v in parsed] if isinstance(parsed, list) else []
    except Exception:
        return []


def _attachment(env, fmt) -> dict:
    base = f"{env['key']}_{env['period']['label']}".replace(" ", "_").replace("/", "-")
    if fmt == "csv":
        return {"fname": f"{base}.csv", "fcontent": _to_csv(env)}
    if fmt == "xlsx":
        return {"fname": f"{base}.xlsx", "fcontent": _to_xlsx(env)}
    return {"fname": f"{base}.pdf", "fcontent": _to_pdf(env)}


def _role_recipients(roles: list) -> list[dict]:
    """Enabled users with an email who hold any of `roles`."""
    if not roles:
        return []
    users = set(frappe.get_all(
        "Has Role",
        filters={"role": ["in", roles], "parenttype": "User"},
        pluck="parent",
    ))
    users.discard("Guest")
    out = []
    for u in users:
        info = frappe.db.get_value("User", u, ["enabled", "email", "name"], as_dict=True)
        if info and info.enabled and info.email:
            out.append({"user": info.name, "email": info.email})
    return out


def _email_body(env, brand) -> str:
    kpis = "".join(
        f"<li><b>{frappe.utils.escape_html(k['label'])}:</b> "
        f"{_fmt_html(k['value'], k['format'])}</li>"
        for k in env["kpis"][:6]
    )
    return f"""<div style="font-family:Helvetica,Arial,sans-serif;color:#0f1115">
      <h2 style="margin:0 0 2px">{frappe.utils.escape_html(env['title'])}</h2>
      <p style="color:#6b7280;margin:0 0 12px">{frappe.utils.escape_html(brand['name'])}
         &middot; {frappe.utils.escape_html(env['period']['label'])}</p>
      <ul style="line-height:1.7;padding-left:18px">{kpis}</ul>
      <p style="color:#6b7280;font-size:13px">The full report is attached.</p>
    </div>"""


def _send_report(sched, override_recipients=None) -> dict:
    """Build the report, render the chosen formats, email each recipient and log
    every delivery. Stamps last_sent_on."""
    formats = [f for f in (_json_list(sched.formats) or ["pdf"]) if f in _FORMATS] or ["pdf"]
    recipients = override_recipients or _role_recipients(_json_list(sched.recipient_roles))

    sent = 0
    if recipients:
        if sched.saved_report and frappe.db.exists("Saved Report", sched.saved_report):
            env = _saved_envelope(frappe.get_doc("Saved Report", sched.saved_report))
        else:
            env = _envelope(sched.report_key, sched.period or "last_month", None, None, sched.branch)
        attachments = [_attachment(env, f) for f in formats]
        brand = _brand()
        subject = f"{env['title']} — {env['period']['label']}"
        body = _email_body(env, brand)
        for r in recipients:
            status, err = "Sent", None
            try:
                frappe.sendmail(
                    recipients=[r["email"]],
                    subject=subject,
                    message=body,
                    attachments=attachments,
                    reference_doctype="Report Schedule",
                    reference_name=sched.name,
                )
                sent += 1
            except Exception as e:  # noqa: BLE001
                status, err = "Failed", str(e)[:500]
            frappe.get_doc({
                "doctype": "Report Delivery Log",
                "report_schedule": sched.name,
                "report_key": sched.report_key,
                "recipient": r["user"],
                "recipient_email": r["email"],
                "status": status,
                "formats": ", ".join(formats),
                "period_label": env["period"]["label"],
                "sent_on": now_datetime(),
                "error": err,
            }).insert(ignore_permissions=True)

    sched.db_set("last_sent_on", now_datetime())
    frappe.db.commit()
    return {"sent": sent, "recipients": len(recipients)}


def _is_due(sched, now) -> bool:
    if not sched.is_active:
        return False
    if int(sched.send_hour or 8) != now.hour:
        return False
    # One send per day max (guards the hourly tick against re-firing).
    if sched.last_sent_on and getdate(sched.last_sent_on) == getdate(now):
        return False
    f = sched.frequency
    if f == "Daily":
        return True
    if f == "Weekly":
        return now.strftime("%A") == (sched.day_of_week or "Monday")
    if f in ("Monthly", "Quarterly"):
        target = min(int(sched.day_of_month or 1), get_last_day(now).day)
        if now.day != target:
            return False
        return now.month in (1, 4, 7, 10) if f == "Quarterly" else True
    return False


def dispatch_scheduled():
    """Hourly job: send every Report Schedule that is due this hour."""
    now = now_datetime()
    for name in frappe.get_all("Report Schedule", filters={"is_active": 1}, pluck="name"):
        sched = frappe.get_doc("Report Schedule", name)
        if _is_due(sched, now):
            try:
                _send_report(sched)
            except Exception:  # noqa: BLE001
                frappe.log_error(
                    f"Report dispatch failed for {name}", "reports.dispatch_scheduled"
                )


# ---------------------------------------------------------------------------
# Schedule management API (SPA-driven)
# ---------------------------------------------------------------------------


@frappe.whitelist()
@requires(MANAGER)
def schedule_options() -> dict:
    """Form options for creating a schedule."""
    return {
        "reports": [{"key": k, "title": v["title"]} for k, v in REPORTS.items()],
        "roles": list(GYM_ROLES) + ["System Manager"],
        "periods": _PERIODS,
        "formats": _FORMATS,
        "weekdays": _WEEKDAYS_FULL,
    }


@frappe.whitelist()
@requires(MANAGER)
def list_schedules() -> list[dict]:
    rows = frappe.get_all(
        "Report Schedule",
        fields=["name", "report_key", "saved_report", "title", "frequency",
                "day_of_week", "day_of_month", "send_hour", "period", "branch",
                "recipient_roles", "formats", "is_active", "last_sent_on"],
        order_by="modified desc",
    )
    for r in rows:
        r["recipient_roles"] = _json_list(r.recipient_roles)
        r["formats"] = _json_list(r.formats) or ["pdf"]
        r["title"] = r.title or REPORTS.get(r.report_key, {}).get("title", r.report_key)
        r["is_active"] = int(r.is_active or 0)
        r["last_sent_on"] = str(r.last_sent_on) if r.last_sent_on else None
    return rows


@frappe.whitelist()
@requires(MANAGER)
def save_schedule(name=None, report_key=None, title=None, frequency="Monthly",
                  day_of_week="Monday", day_of_month=1, send_hour=8,
                  period="last_month", branch=None, recipient_roles=None,
                  formats=None, is_active=1, saved_report=None) -> dict:
    # A saved view drives both the report and its period/branch/customisation.
    if saved_report and frappe.db.exists("Saved Report", saved_report):
        sr = frappe.db.get_value("Saved Report", saved_report,
                                 ["report_key", "title", "period", "branch"], as_dict=True)
        report_key = sr.report_key
        title = title or sr.title
        period = sr.period
        branch = sr.branch
    if report_key not in REPORTS:
        frappe.throw(frappe._("Unknown report: {0}").format(report_key))
    roles = _json_list(recipient_roles)
    fmts = [f for f in _json_list(formats) if f in _FORMATS] or ["pdf"]
    doc = frappe.get_doc("Report Schedule", name) if name else frappe.new_doc("Report Schedule")
    doc.update({
        "report_key": report_key,
        "saved_report": saved_report or None,
        "title": title or REPORTS[report_key]["title"],
        "frequency": frequency,
        "day_of_week": day_of_week,
        "day_of_month": int(day_of_month or 1),
        "send_hour": int(send_hour or 8),
        "period": period if period in _PERIODS else "last_month",
        "branch": branch or None,
        "recipient_roles": frappe.as_json(roles),
        "formats": frappe.as_json(fmts),
        "is_active": int(is_active or 0),
    })
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"name": doc.name}


@frappe.whitelist()
@requires(MANAGER)
def set_schedule_active(name: str, active: int) -> dict:
    frappe.db.set_value("Report Schedule", name, "is_active", int(active))
    frappe.db.commit()
    return {"ok": True}


@frappe.whitelist()
@requires(MANAGER)
def delete_schedule(name: str) -> dict:
    frappe.delete_doc("Report Schedule", name, ignore_permissions=True, force=True)
    frappe.db.commit()
    return {"ok": True}


@frappe.whitelist()
@requires(MANAGER)
def send_schedule_now(name: str) -> dict:
    """Send a schedule immediately (for testing a configuration)."""
    return _send_report(frappe.get_doc("Report Schedule", name))


@frappe.whitelist()
@requires(MANAGER)
def delivery_log(limit: int = 30) -> list[dict]:
    rows = frappe.get_all(
        "Report Delivery Log",
        fields=["name", "report_key", "recipient", "recipient_email", "status",
                "formats", "period_label", "sent_on", "error"],
        order_by="creation desc",
        limit_page_length=int(limit),
    )
    for r in rows:
        r["sent_on"] = str(r.sent_on) if r.sent_on else None
    return rows


# ---------------------------------------------------------------------------
# Saved Reports — customised views (section + column selection)
# ---------------------------------------------------------------------------


def _apply_visibility(env: dict, config: dict) -> dict:
    """Drop the sections/columns a saved view hides. `config` lists hidden keys,
    so any section added to a report later shows by default."""
    if not config:
        return env
    hk = set(config.get("hidden_kpis", []))
    hc = set(config.get("hidden_charts", []))
    ht = set(config.get("hidden_tables", []))
    hcol = config.get("hidden_columns", {}) or {}
    env["kpis"] = [k for k in env["kpis"] if k["key"] not in hk]
    env["charts"] = [c for c in env["charts"] if c["key"] not in hc]
    tables = []
    for t in env["tables"]:
        if t["key"] in ht:
            continue
        hidden = set(hcol.get(t["key"], []))
        if hidden:
            t = {**t, "columns": [c for c in t["columns"] if c["key"] not in hidden]}
        tables.append(t)
    env["tables"] = tables
    return env


def _saved_envelope(sr) -> dict:
    config = frappe.parse_json(sr.config) if sr.config else {}
    env = _envelope(sr.report_key, sr.period or "this_month", None, None, sr.branch)
    return _apply_visibility(env, config)


@frappe.whitelist()
@requires(MANAGER)
def list_saved_reports() -> list[dict]:
    rows = frappe.get_all(
        "Saved Report",
        fields=["name", "title", "report_key", "period", "branch", "config"],
        order_by="modified desc",
    )
    for r in rows:
        r["report_title"] = REPORTS.get(r.report_key, {}).get("title", r.report_key)
        r["config"] = frappe.parse_json(r.config) if r.config else {}
    return rows


@frappe.whitelist()
@requires(MANAGER)
def save_saved_report(name=None, title=None, report_key=None, period="this_month",
                      branch=None, config=None) -> dict:
    if report_key not in REPORTS:
        frappe.throw(frappe._("Unknown report: {0}").format(report_key))
    cfg = config if isinstance(config, dict) else (frappe.parse_json(config) if config else {})
    doc = frappe.get_doc("Saved Report", name) if name else frappe.new_doc("Saved Report")
    doc.update({
        "title": title or REPORTS[report_key]["title"],
        "report_key": report_key,
        "period": period if period in _PERIODS else "this_month",
        "branch": branch or None,
        "config": frappe.as_json(cfg),
    })
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"name": doc.name}


@frappe.whitelist()
@requires(MANAGER)
def run_saved_report(name: str) -> dict:
    sr = frappe.get_doc("Saved Report", name)
    env = _saved_envelope(sr)
    env["saved_report"] = sr.name
    env["saved_title"] = sr.title
    env["config"] = frappe.parse_json(sr.config) if sr.config else {}
    return env


@frappe.whitelist()
@requires(MANAGER)
def delete_saved_report(name: str) -> dict:
    frappe.delete_doc("Saved Report", name, ignore_permissions=True, force=True)
    frappe.db.commit()
    return {"ok": True}
