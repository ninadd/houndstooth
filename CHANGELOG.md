# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-07

Initial public release of Houndstooth — a self-hosted, privacy-first investment tracker.

### Added

- **Account aggregation** across institutions via SnapTrade's hosted Connection Portal,
  plus manually-tracked accounts for holdings SnapTrade can't reach.
- **Provider abstraction** (`DataProvider`) with a live `SnapTradeProvider` and an offline
  `MockProvider`, selected by `DATA_PROVIDER` — the full UI runs with no credentials in
  mock mode.
- **Dashboard** with two hero charts (Net Worth + Investments), shared range pills, a
  taxable vs tax-advantaged split, and allocation cards.
- **Per-account holdings pages** with position-level summaries.
- **Daily snapshot cron** (`/api/cron/daily`) that re-syncs from SnapTrade and upserts an
  idempotent daily snapshot; gated on Pacific wall-clock and authorized by a `CRON_SECRET`
  bearer token (fails closed).
- **Privacy-preserving AI daily summary** via Gemini with Google Search grounding — only
  anonymized aggregates (sector weights, per-ticker % moves, tax split) are sent; dollar
  balances, share counts, and position values never leave the server (enforced by a test).
- **Single-user email auth** with route protection and MFA device-trust (HMAC-signed
  cookie; fails closed without `MFA_TRUST_SECRET`).
- **Supabase schema** with row-level security on every table.
- **Opt-in Vercel Web Analytics**, disabled by default (`NEXT_PUBLIC_ENABLE_ANALYTICS`).

[0.1.0]: https://github.com/ninadd/houndstooth/releases/tag/v0.1.0
