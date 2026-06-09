# Go-Live Checklist (per tenant)

Run this for **every** production tenant site. Config lives in each site's
`site_config.json`, so a clean result on one site says nothing about another.

## 1. Run the automated preflight

```bash
bench --site <tenant-site> execute gym_management.preflight.run
```

It audits platform, RBAC, M-Pesa, and WhatsApp config and prints
`PASS / WARN / FAIL`. **Resolve every FAIL before going live; confirm each WARN
is intentional.** It is read-only and safe to run anytime.

## 2. M-Pesa (Daraja) — money path

Set in `site_config.json` (use `bench --site <site> set-config <key> <value>`,
add `-g`/global only if shared):

| Key | Notes |
|---|---|
| `mpesa_env` | `production` (not `sandbox`) |
| `mpesa_consumer_key` / `mpesa_consumer_secret` | from the Daraja **production** app |
| `mpesa_passkey` | production passkey (NOT the public sandbox one) |
| `mpesa_shortcode` | the tenant's real paybill/till (NOT `174379`) |
| `mpesa_initiator_name` / `mpesa_initiator_password` | only if disbursing refunds via B2C |
| `mpesa_callback_base_url` | `https://<tenant-host>` (must be https) |
| **`mpesa_callback_token`** | **a long random secret — see below** |

### Callback source authentication (the forged-payment defense)

Daraja does not authenticate its callbacks. We defend in three layers; the
first two you must turn on:

1. **Shared-secret token (do this).** Generate a random token and set
   `mpesa_callback_token`. The app automatically appends `?token=...` to every
   callback URL it registers with Daraja, and **rejects any callback whose token
   doesn't match** — without touching any transaction.
   ```bash
   bench --site <site> set-config mpesa_callback_token "$(openssl rand -hex 24)"
   ```
   After setting it, **re-register your C2B URLs** (so Daraja stores the
   tokenized URL) and confirm STK/B2C callback URLs include the token.

2. **IP allow-list (do this at nginx, ideally).** Restrict the callback paths to
   Safaricom's published source IPs. Either enforce in-app
   (`mpesa_callback_enforce_ip: true`, optional `mpesa_callback_allowed_ips`) or,
   preferred, at the proxy:
   ```nginx
   location ~ ^/api/method/gym_management\..*(stk_callback|b2c_result_callback|b2c_timeout_callback|c2b_confirmation|c2b_validation) {
       allow 196.201.214.0/24;   # CONFIRM current ranges with Safaricom
       allow 196.201.212.0/24;
       allow 196.201.213.0/24;
       deny  all;
       try_files $uri @webserver;   # hand back to the Frappe upstream
   }
   ```

3. **Semantic checks (already enforced in code).** STK callbacks are
   *reconcile-only* — they only update a Pending row the app created when it
   initiated the push, and the paid amount must equal the requested amount; an
   unknown `CheckoutRequestID` or a mismatched amount is rejected, never created.
   C2B confirmations must be positive and addressed to our own shortcode.

## 3. WhatsApp (skip if unused)

`whatsapp_phone_number_id`, `whatsapp_access_token`, `whatsapp_app_secret`,
`whatsapp_verify_token`, `whatsapp_business_account_id`. The webhook already
verifies the Meta `X-Hub-Signature-256` HMAC using `whatsapp_app_secret`.

## 4. Platform

- `developer_mode` **off** (it relaxes CSRF and permission checks).
- `encryption_key` set (encrypted fields/stored passwords depend on it).
- A **Default Outgoing Email Account** enabled (staff invites + renewal reminders).
- Confirm **automated DB backups** are on and you have **test-restored once**.

## 5. Abuse protection (guest endpoints)

The public chatbot endpoint already throttles **direct** hits per source IP in
app code (`chatbot._enforce_inbound_rate_limit`, 20 req / 60 s). That catches a
single abuser but not one rotating IPs. Add an nginx limit on the guest paths as
the stronger outer layer:

```nginx
# in the http{} block
limit_req_zone $binary_remote_addr zone=gymguest:10m rate=10r/s;

# in the server{} block, on the chatbot + webhook entrypoints
location ~ ^/api/method/gym_management\..*(handle_inbound|whatsapp_webhook\.receive) {
    limit_req zone=gymguest burst=20 nodelay;
    try_files $uri @webserver;
}
```

The M-Pesa callback and WhatsApp webhook paths are authenticated (callback token
/ HMAC), so do **not** rate-limit those aggressively — Daraja/Meta retry and you
could drop real payment/message events.

## 6. Error monitoring (recommended before launch)

The frontend has an error boundary that calls an optional `window.__reportError`
hook; the backend logs to **Error Log**. To get alerted on production errors,
wire a monitor (e.g. Sentry): set `window.__reportError` in `index.html`/app
bootstrap, and add a Frappe logging handler or the Sentry Frappe integration.
Until then, watch **Error Log** (Desk) and the M-Pesa callback-auth entries.

## 7. RBAC

The preflight verifies this, but to (re)apply the roles + DocType permissions:

```bash
bench --site <site> execute gym_management.users.seed_gym_roles
bench --site <site> execute gym_management.rbac.seed_doctype_permissions
```

These also run automatically on `after_migrate` / `after_install`. Every gym
role must have `desk_access=0`, and at least one enabled user must hold
**Gym Owner** or **Gym Manager** or nobody can administer the SPA.
