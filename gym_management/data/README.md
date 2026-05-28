# Safaricom M-Pesa public certificates

This directory holds Safaricom's public X.509 certificates used by
`gym_management.mpesa_security.encrypt_security_credential()` to RSA-encrypt
the `SecurityCredential` field on B2C / B2B / Reversal / Account Balance
Daraja API calls.

These certificates are **public** Safaricom artifacts — they are distributed
in Daraja documentation and have no secret value on their own. Only the
matching private key (held by Safaricom) can decrypt ciphertext produced
with them.

## Expected files

| Environment | Filename                            |
|-------------|-------------------------------------|
| Sandbox     | `safaricom_cert_sandbox.cer`        |
| Production  | `safaricom_cert_production.cer`     |

## How to get them

1. Sign in at <https://developer.safaricom.co.ke>
2. Under each Daraja product (B2C / B2B / Reversal / Account Balance), look
   for "Security Credentials" → download the certificate
3. Sandbox file is sometimes named `SandboxCertificate.cer` and production
   `ProductionCertificate.cer` — rename to match the table above

## Per-tenant override

If a tenant needs a different cert path (e.g. they have a partner-specific
certificate), set in their `site_config.json`:

```json
{
  "mpesa_security_cert_path_sandbox": "/abs/path/to/sandbox_cert.cer",
  "mpesa_security_cert_path_production": "/abs/path/to/production_cert.cer"
}
```

The override takes precedence over the bundled files in this directory.

## Why these aren't checked in by default

Safaricom does occasionally rotate these certificates. Keeping them out of
the repo means tenants who pin a specific version can do so without forking,
and a Safaricom rotation only requires a file drop — no code change.
