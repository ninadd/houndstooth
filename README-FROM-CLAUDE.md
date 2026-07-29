# Houndstooth

[![CI](https://github.com/ninadd/houndstooth/actions/workflows/ci.yml/badge.svg)](https://github.com/ninadd/houndstooth/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A self-hosted investment tracker built around three design pillars:

- **Privacy-first.** Your financial data lives in *your* Supabase project. The daily AI
  summary only ever sees anonymized aggregates (sector weights, % moves, tax split) —
  never dollar balances, share counts, or position values.
- **Single-user.** One person, one instance. No multi-tenant mode, no shared backend,
  nothing sent to anyone else.
- **Free / low-cost.** Runs on free tiers end to end — Vercel Hobby, Supabase free,
  SnapTrade's free tier, and Google AI Studio.

It aggregates accounts across institutions, separates taxable vs tax-advantaged holdings,
charts your investments over time, and generates a privacy-preserving daily AI market
summary.

> **On the name:** Stripe and Plaid were taken — so Houndstooth it is, the next pattern in
> the drawer.

**Stack:** Next.js (App Router) · Supabase (Postgres + Auth + RLS) · SnapTrade · Gemini ·
Tailwind v4 + shadcn/ui · Recharts. Deployed on Vercel.

> **Self-hosting:** Houndstooth is single-user by design — you run your **own** instance
> with your **own** Supabase project and API keys (Gemini, SnapTrade). Nothing is shared
> with anyone else. Bug reports are welcome; PRs are not accepted — see
> [CONTRIBUTING.md](CONTRIBUTING.md).

<!--
  TODO (not added yet): drop a screenshot or short GIF of the dashboard here, e.g.
  ![Houndstooth dashboard](docs/screenshot-dashboard.png)
  A first-time visitor deciding whether to spend 20+ minutes on setup usually wants to
  see the payoff before reading further.
-->

## Contents

- [Requirements](#requirements)
- [Quick start (mock mode)](#quick-start-mock-mode--no-credentials-needed)
- [Environment variables](#environment-variables)
- [Full setup (live data)](#full-setup-live-data)
- [Two-factor authentication](#two-factor-authentication)
- [Deploy to Vercel](#deploy-to-vercel)
- [Daily snapshot cron](#daily-snapshot-cron)
- [AI daily summary](#ai-daily-summary)
- [SnapTrade connection flow](#snaptrade-connection-flow)
- [Architecture](#architecture)
- [Conventions](#conventions)

## Requirements

- **Node ≥ 20** and **npm** (see `.nvmrc`).
- A Supabase project (free tier is fine) — required even for mock mode, since login always
  goes through Supabase Auth.
- SnapTrade + Gemini keys are optional — the app runs fully in **mock mode** without them.

**Accounts you may need to create**, so you can do it all up front instead of one at a time:

| Account | Required? | What it's for |
| --- | --- | --- |
| [Supabase](https://supabase.com) | Always | Database, auth, and row-level security (Postgres access rules scoped to your user) |
| [SnapTrade](https://snaptrade.com) | Only for live brokerage data | Pulls real account/holdings data |
| [Google AI Studio](https://aistudio.google.com) | Only for the AI daily summary | Powers the Gemini-based market summary |

All three have free tiers usable end-to-end for this project.

## Quick start (mock mode — no external service keys needed)

*(~5 minutes.)* Try the full UI with mock brokerage data. You still need a Supabase project
for login — mock mode only skips SnapTrade and Gemini keys, not auth.

```bash
git clone https://github.com/ninadd/houndstooth.git && cd houndstooth
npm install
cp .env.example .env.local        # set DATA_PROVIDER=mock in it
npm run dev                        # http://localhost:3000
```

In `.env.local`, set `DATA_PROVIDER=mock` and leave the SnapTrade/Gemini values blank. You'll
still need to fill in the Supabase variables and create one user — see
[Full setup](#full-setup-live-data) steps 1–3 — since `/login` requires a real Supabase Auth
user even in mock mode.

Cloning the original repo directly is fine for running locally. You only need your own fork
if you plan to deploy your own instance to Vercel from your own GitHub account.

## Environment variables

Copy `.env.example` → `.env.local` and fill these in. The same variables are set in your
Vercel project for deployment.

| Variable | Scope | Required | Where to get it |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | public | yes | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | yes | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only | yes | Supabase → Project Settings → API (bypasses RLS — never expose) |
| `DATA_PROVIDER` | server | yes | `mock` (no creds) or `snaptrade` (live) |
| `SNAPTRADE_CLIENT_ID` | server-only | live only | SnapTrade Dashboard → API Keys |
| `SNAPTRADE_CONSUMER_KEY` | server-only | live only | SnapTrade Dashboard → API Keys |
| `SNAPTRADE_USER_ID` | server-only | live only | SnapTrade Dashboard → Settings → Security |
| `SNAPTRADE_USER_SECRET` | server-only | live only | SnapTrade Dashboard → Settings → Security |
| `GEMINI_API_KEY` | server-only | AI summary | Google AI Studio (enable Search grounding) |
| `CRON_SECRET` | server-only | deploy only | Any random string; set in Vercel for cron auth |
| `MFA_TRUST_SECRET` | server-only | recommended (see [2FA](#two-factor-authentication)) | `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `NEXT_PUBLIC_ENABLE_ANALYTICS` | public | optional | Set to `true` to enable Vercel Web Analytics; **off by default** (privacy-first) |

## Full setup (live data)

*(~20–30 minutes, including creating accounts.)*

1. **Create a Supabase project**, then copy its URL + keys into `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (Settings → API)

2. **Apply the schema.** Run every file in `supabase/migrations/` in ascending order,
   either by pasting each into the Supabase SQL editor or via the Supabase CLI
   (`supabase db push`). This includes `0002_security_prices.sql`, needed for the AI summary
   below — there's no separate migration step for it.

3. **Create your single user** in Supabase → Authentication → Users → "Add user"
   (email + password). The `on_auth_user_created` trigger creates the profile row.

4. **Set the SnapTrade credentials** (see [SnapTrade connection flow](#snaptrade-connection-flow)):
   `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_KEY`, `SNAPTRADE_USER_ID`, `SNAPTRADE_USER_SECRET`,
   and set `DATA_PROVIDER=snaptrade`.

5. **Set `GEMINI_API_KEY`** for the daily AI summary (optional; enable Google Search
   grounding for the key).

6. **Run it:**
   ```bash
   npm run dev      # http://localhost:3000  → redirects to /login
   npm run lint     # code style checks
   npm test         # unit tests (adapter mapping, webhook, classification, …)
   npm run build    # production build
   ```

## Two-factor authentication

2FA is **optional but recommended** — this app holds real financial data. It's off by
default; nothing forces you to set it up.

- **Enable it:** log in, go to **Account → Security** (`/account/security`), click **Enable
  2FA**, and scan the QR code with an authenticator app (e.g. Google Authenticator, 1Password,
  Authy). Enter the 6-digit code it shows to confirm. You can disable it any time from the
  same page.
- **Logging in afterward:** once enabled, every login prompts for a 6-digit code at `/mfa`
  before you reach the dashboard.
- **`MFA_TRUST_SECRET` and "trust this device":** the 2FA prompt has a "trust this device for
  30 days" checkbox so you're not re-entering a code on every login from your own laptop. That
  checkbox only works if `MFA_TRUST_SECRET` is set — **without it, the checkbox silently does
  nothing and you'll be asked for a code on every single login.** This isn't a bug; generate
  the value with the command in the [env var table](#environment-variables) and set it before
  enabling 2FA if you want the "trust this device" option to actually work.
- **Losing access:** there's no backup-code flow yet — if you lose the authenticator, disable
  2FA directly in Supabase (Authentication → Users → your user → remove the MFA factor) or via
  the SQL editor.

## Deploy to Vercel

1. Import the repo into Vercel.
2. Set **all** the [environment variables](#environment-variables) in the Vercel project
   (including `CRON_SECRET` for the daily cron and `MFA_TRUST_SECRET`).
3. Cron is configured in [vercel.json](vercel.json) (two weekday runs; the handler gates
   on PT wall-clock — Pacific Time, checked in application code since Vercel Cron itself only
   understands UTC). Vercel Hobby allows exactly the 2 daily jobs used here.
4. After deploying, point your **SnapTrade webhook** (a callback SnapTrade sends to your app
   when brokerage data changes) at `https://<your-domain>/api/snaptrade/webhook` — webhooks
   can't reach `localhost`.

## Daily snapshot cron

A daily snapshot of your accounts is recorded once per day at **1:10 PM Pacific**.

- Runs **weekdays only** (markets are closed weekends).
- Vercel Cron is UTC-only and can't follow DST, so [vercel.json](vercel.json) schedules
  **two** weekday runs (20:10 and 21:10 UTC, Mon–Fri). The handler at `/api/cron/daily`
  gates on PT wall-clock and only does work when it's the 1 PM PT hour — so exactly one
  run fires per weekday year-round.
- **Set `CRON_SECRET`** in Vercel project env. Vercel automatically sends it as
  `Authorization: Bearer <CRON_SECRET>`; the route rejects requests without it.
- The cron re-syncs each user from SnapTrade, then upserts (inserts, or updates if a row for
  today already exists) today's `net_worth_snapshots` row — idempotent, meaning re-running it
  the same day overwrites rather than duplicating. After a one-time brokerage connect, no
  manual pull is needed.
- **Local testing:** `curl "http://localhost:3000/api/cron/daily?force=1"` bypasses the
  PT gate. `?days=` seeding lives in the dev-only `/api/dev/backfill` route.
- Note: Vercel Hobby allows 2 cron jobs at daily granularity — this uses exactly 2.

## AI daily summary

A privacy-preserving daily briefing, generated after the snapshot in the same cron.

- **Privacy:** [`buildGeminiContext`](src/lib/holdings-report.ts) is the only data that
  reaches Gemini — sector weights, per-ticker % moves, and the tax split. It **never**
  contains dollar balances, share counts, or position values (enforced by a test). The
  dollar figures you see in the lightbox are computed locally and never sent.
- **Grounding:** [`gemini.ts`](src/lib/gemini.ts) calls `gemini-2.5-flash` with Google
  Search grounding (letting the model pull in current web results) so macro/sector drivers
  reflect the actual day. Output is strictly descriptive — never buy/sell/hold advice.
- **% moves** come from SnapTrade: each sync appends close prices to `security_prices`, and
  the report computes day-over-day change (`(today − prior) / prior`). Flat with a static
  sandbox brokerage; real movement appears with a live connection.
- **UI:** a notification banner with a **View** button opens a lightbox (tiles, macro
  summary, portfolio drivers, what-to-watch, and a holdings table with 🚀/🔻 mover
  flags + per-mover reasons). Dismissal is persisted in `localStorage`.
- **Setup:** apply migration `supabase/migrations/0002_security_prices.sql` (see
  [Full setup](#full-setup-live-data) step 2), then set `GEMINI_API_KEY` in env (and enable
  Google Search grounding for the key).
- **Local testing:** `curl -X POST "http://localhost:3000/api/dev/summary?mock=1"` seeds
  a canned summary without an API key (drop `?mock=1` once the key is set).

## SnapTrade connection flow

Brokerages are connected through SnapTrade's hosted Connection Portal. The integration
runs entirely on **SnapTrade's free tier** — no paid plan required. The flow:

- The data layer is provider-abstracted ([src/lib/providers](src/lib/providers)): a
  `DataProvider` interface with a `SnapTradeProvider` and a `MockProvider`. The active one
  is chosen by `DATA_PROVIDER` (`snaptrade` default, `mock` for offline/no-creds testing).
- **Personal tier:** these are personal SnapTrade keys (`clientId` `PERS-…`), which
  auto-provision a single user at signup — there is no `registerUser`. The fixed
  `SNAPTRADE_USER_ID` + `SNAPTRADE_USER_SECRET` (from env) are used for every call.
- **Connect:** clicking *Connect account* POSTs to
  [`/api/snaptrade/connect`](src/app/api/snaptrade/connect/route.ts), which generates a
  Connection Portal URL from the env credentials and redirects the browser to it. (You can
  also connect brokerages directly in the SnapTrade dashboard.)
- **Completion:** once a brokerage is connected, SnapTrade POSTs a signed webhook to
  [`/api/snaptrade/webhook`](src/app/api/snaptrade/webhook/route.ts) (`CONNECTION_ADDED`,
  `ACCOUNT_HOLDINGS_UPDATED`). The route verifies the `Signature` header (base64
  HMAC-SHA256 — a keyed hash used to prove the request really came from SnapTrade — of the
  raw body, keyed by the consumer key) and calls `syncUser`. **Locally** (webhooks can't
  reach `localhost`) use the **Sync** button, which runs the same pull.

**Setup:**
1. SnapTrade Dashboard → **API Keys** → set `SNAPTRADE_CLIENT_ID` and
   `SNAPTRADE_CONSUMER_KEY` (Vercel + `.env.local`).
2. SnapTrade Dashboard → **Settings → Security** → set `SNAPTRADE_USER_ID` and
   `SNAPTRADE_USER_SECRET` (the auto-provisioned personal user).
3. SnapTrade Dashboard → **Webhooks** → point the listener at
   `https://<your-domain>/api/snaptrade/webhook` (deployed only).

## Architecture

- Next.js + Tailwind + shadcn scaffold with a dark-first theme.
- Supabase clients: browser (RLS), server (RLS), admin (service-role, server-only).
- Single-user email auth + `proxy.ts` route protection.
- Full schema migration with RLS (row-level security — Postgres access rules scoped to the
  logged-in user) on every table (`supabase/migrations/0001_initial_schema.sql`).
- Dashboard shell with **two hero charts** (Net Worth + Investments), shared range
  pills, and allocation cards.

## Conventions

- Never expose the SnapTrade `userSecret` to the browser — it stays server-only (env),
  used exclusively by Route Handlers (Next.js server-side API endpoints) / cron via the
  service-role client.
- Net worth is computed server-side and snapshotted; the frontend only reads derived data.
