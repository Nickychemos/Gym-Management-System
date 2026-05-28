# eTIMS Onboarding Runbook (per tenant gym)

This is the step-by-step you walk every new tenant gym through to make their
Sales Invoices flow into KRA via eTIMS.

The actual KRA submission is handled by Navari Ltd's
[`kenya_compliance_via_slade`](https://github.com/navariltd/kenya-compliance-via-slade)
Frappe app — once installed and configured, every Sales Invoice gets auto-
submitted on `on_submit`. gym_management only owns the readiness probe
(`gym_management.etims.status`) and the silent-failure monitor.

## Prerequisites (tenant side, before we touch anything)

1. **KRA PIN** for the gym (or sole proprietor). Required for VAT-registered
   AND non-VAT businesses (eTIMS is mandatory for all from 2024).
2. **Savannah Informatics (Slade360) account** — eTIMS submissions go through
   them as the approved KRA intermediary. Tenant emails
   `etims@savannahinformatics.com` with KRA PIN + business name to get
   credentials. Turnaround is typically 1-3 business days.
3. Tenant has a Slade360 username, password, and the assigned **branch ID**
   (sometimes called bhfId) ready.

## One-time bench setup (you, the SaaS operator, do this once)

```bash
cd ~/Frappe/frappe-bench
bench get-app https://github.com/navariltd/kenya-compliance-via-slade.git
bench build --app kenya_compliance_via_slade
```

This downloads the Navari app into `apps/kenya_compliance_via_slade/` but
does NOT install it into any specific site yet. The app stays inactive
until you install it per tenant.

## Per-tenant install (whenever a tenant opts in to eTIMS)

```bash
bench --site <tenant.example.com> install-app kenya_compliance_via_slade
bench --site <tenant.example.com> migrate
```

Navari registers ~28 DocTypes including:

- `Navari KRA eTIMS Settings` (Single) — credentials
- `eTIMS Sales Ledger Entry` — per-invoice submission record (this is the
  table gym_management's monitor uses)
- Various lookups: `Navari eTIMS Country`, `Navari KRA eTIMS Item Classification`,
  `Navari KRA eTIMS Taxation Type`, etc.

It also adds custom fields to Sales Invoice, Item, Customer, BOM,
Supplier, Branch, and Stock Ledger Entry (visible in those forms after
install + reload).

## Per-tenant configuration (after install)

Login to the tenant site as Administrator. Open
**Navari KRA eTIMS Settings** (Awesome Bar → search "etims settings"). Fill:

| Field                 | Source                                   |
|-----------------------|------------------------------------------|
| KRA PIN / Company PIN | tenant's certificate                     |
| Slade360 Username     | from etims@savannahinformatics.com email |
| Slade360 Password     | from etims@savannahinformatics.com email |
| Branch ID (bhfId)     | from Slade onboarding                    |
| Environment           | Sandbox first, Production once tested    |
| API Endpoint URL      | per Navari's wiki — varies by env        |

Save the form. Navari's "Test Connection" button (if present) confirms the
credentials work against Slade360.

## First-invoice acceptance test

1. Create a test Customer with tax ID populated.
2. Create a test Item — open it after save, fill the eTIMS-specific fields
   Navari added (Item Classification Code, Tax Code, UOM Code).
3. Create a Sales Invoice with that customer + item, submit it.
4. Re-open the submitted invoice. Navari adds a section with the **KRA
   Control Number** and a **QR code** — both should populate within seconds.
5. Check **eTIMS Sales Ledger Entry** list — there should be a row for
   this invoice with status = success.

If step 4 stays blank for more than 5 minutes:
- Check Navari's "ETIMS Job Queue" DocType for the pending job
- Check Frappe **Error Log** for tracebacks
- Check **Navari KRA eTIMS Notices** for any warnings

## Day-2 operations (gym_management's role kicks in)

`gym_management.etims.monitor_etims_health` runs on the daily scheduler.
It scans Sales Invoices older than 1 hour and logs an Error Log entry if
any lack a matching `eTIMS Sales Ledger Entry` row.

Operators watch:
- **Error Log** for entries from `etims.monitor_etims_health`
- The gym dashboard tile that calls `gym_management.etims.status` — should
  show "green / ready" with submissions in the last 24h

## When something breaks

| Symptom                                            | First check                                     |
|----------------------------------------------------|--------------------------------------------------|
| Invoice submits but no QR code appears             | Navari ETIMS Job Queue → look for failed job    |
| Error Log: "submission missing for N invoices"     | Manually click "Retry Submission" on each Sales Invoice |
| All submissions failing                            | Slade360 password rotated? Run "Test Connection" |
| `gym_management.etims.status` returns `not_installed` | `bench --site … install-app kenya_compliance_via_slade` was skipped |

## Removing eTIMS from a tenant (rollback)

```bash
bench --site <tenant.example.com> uninstall-app kenya_compliance_via_slade
```

This removes Navari's DocTypes but **keeps** the historical eTIMS Sales
Ledger Entry rows on disk (the table is dropped but Sales Invoices retain
their custom field values). Re-install reconstructs the table.

## Support contacts

- Navari (app maintainer): support@navari.co.ke
- Slade360 / Savannah (KRA intermediary): etims@savannahinformatics.com
- Navari wiki: https://github.com/navariltd/kenya-compliance-via-slade/wiki
