"""RBAC coverage guard (static).

Asserts that EVERY `@frappe.whitelist()` method in the app is one of:
  - role-guarded with `@requires(...)` (the central decorator), or
  - inline-guarded with `_require_role(...)`, or
  - public (`allow_guest=True`), or
  - on the explicit EXEMPT allowlist below (self-identity / member-portal /
    device-token endpoints that intentionally carry no staff-role guard).

This fails the build if a new whitelisted method is added without a guard,
preventing silent RBAC regressions. It is a pure source scan — no Frappe runtime
needed — so it is fast and import-safe.
"""

import os
import re
import unittest

# Whitelisted methods intentionally without a staff-role guard. Guest methods
# (allow_guest=True) are auto-exempt and need not be listed here.
EXEMPT_NAMES = {
    "current_user",        # returns only the caller's own identity
    "get_my_profile",      # caller's own profile (self-service)
    "update_my_profile",   # caller edits their own name/contact (self-service)
    "change_my_password",  # caller changes their own password (self-service)
    "branch_context",      # the caller's allowed branches for the switcher (self-service)
    "list_notifications",  # caller's own notifications (self-service)
    "unread_count",        # caller's own unread count (self-service)
    "mark_read",           # caller marks their own notification read (self-service)
    "mark_all_read",       # caller marks all their own read (self-service)
    "set_my_avatar",       # caller uploads their own photo (self-service)
    "remove_my_avatar",    # caller clears their own photo (self-service)
    "resolve_scan",        # hardware reader endpoint (device-token auth)
}

_WL = re.compile(r"@frappe\.whitelist\(")
_DEF = re.compile(r"^\s*def\s+(\w+)\s*\(")


def _find_unguarded(app_dir: str) -> list[str]:
    unguarded: list[str] = []
    for root, _dirs, files in os.walk(app_dir):
        if "__pycache__" in root:
            continue
        for fname in files:
            if not fname.endswith(".py"):
                continue
            path = os.path.join(root, fname)
            with open(path, encoding="utf-8") as f:
                lines = f.readlines()
            for i, line in enumerate(lines):
                if not _WL.search(line):
                    continue
                wl_line = line
                decos, name, j = [], None, i + 1
                while j < len(lines) and j < i + 8:
                    m = _DEF.match(lines[j])
                    if m:
                        name = m.group(1)
                        break
                    decos.append(lines[j])
                    j += 1
                if not name:
                    continue
                if "allow_guest=True" in wl_line:
                    continue
                if any("@requires(" in d for d in decos):
                    continue
                if "_require_role(" in "".join(lines[j : j + 40]):
                    continue
                if name in EXEMPT_NAMES:
                    continue
                rel = os.path.relpath(path, app_dir)
                unguarded.append(f"{rel}::{name}")
    return unguarded


class TestRBACCoverage(unittest.TestCase):
    def test_every_whitelisted_method_is_guarded(self):
        app_dir = os.path.dirname(__file__)
        unguarded = _find_unguarded(app_dir)
        self.assertEqual(
            unguarded,
            [],
            "Unguarded @frappe.whitelist() methods found (add @requires(...) or "
            f"extend EXEMPT_NAMES if intentionally public): {unguarded}",
        )
