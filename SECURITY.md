# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report privately via GitHub Security Advisories: go to the repository's
**Security → Advisories → Report a vulnerability** tab
([new advisory](https://github.com/ninadd/houndstooth/security/advisories/new)).
You'll get a private thread to share details and coordinate a fix.

Please include:

- A description of the vulnerability and its impact.
- Steps to reproduce (proof of concept if possible).
- Affected version / commit.

I'll acknowledge the report as soon as I can and keep you updated on the fix.

## Scope

Houndstooth is a **self-hosted, single-user** application — each operator runs their own
instance with their own credentials. Reports are most useful when they concern the code
in this repository rather than a specific deployment's misconfiguration. Areas of
particular interest:

- **Secret handling.** The Supabase **service-role key** bypasses RLS and must never
  reach the browser. The **SnapTrade consumer key / user secret** are server-only and
  sign every API call. Any path that could leak these to the client is high severity.
- **Webhook authentication.** The SnapTrade webhook verifies an HMAC-SHA256 `Signature`
  header over the raw request body. Signature-bypass or forgery issues are in scope.
- **Auth & route protection.** The app is single-user; report any way to reach
  authenticated data or admin/cron routes without valid credentials. The cron route
  requires a `CRON_SECRET` bearer token and fails closed.
- **AI privacy boundary.** Only anonymized aggregates may reach Gemini — never dollar
  balances, share counts, or position values. Any leak of raw financial data across this
  boundary is in scope.

## Out of scope

- Vulnerabilities in third-party services (Supabase, SnapTrade, Vercel, Google) — report
  those to the respective vendor.
- Issues that require a misconfigured self-hosted deployment (e.g. an operator exposing
  their own service-role key).
