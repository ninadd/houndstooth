# Houndstooth

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Self-hosted net-worth & investment tracker. Aggregates accounts across institutions,
separates taxable vs tax-advantaged holdings, charts Net Worth and Investments over
time ("Time Machine"), and generates a privacy-preserving daily AI market summary.

**Stack:** Next.js (App Router) · Supabase (Postgres + Auth + RLS) · SnapTrade · Gemini ·
Tailwind v4 + shadcn/ui · Recharts. Deployed on Vercel.

> **Self-hosting:** Houndstooth is single-user by design — you run your **own** instance
> with your **own** Supabase project and API keys (Gemini, SnapTrade). Nothing is shared
> with anyone else. See [CONTRIBUTING.md](CONTRIBUTING.md) to hack on it.

## Quick start (mock mode — no credentials needed)

Try the full UI with mock data, before wiring up any external services:

```bash
git clone <your-fork-url> houndstooth && cd houndstooth
npm install
cp .env.example .env.local        # set DATA_PROVIDER=mock in it
npm run dev                        # http://localhost:3000
```

In `.env.local`, set `DATA_PROVIDER=mock`. You can leave the SnapTrade/Gemini values
blank in mock mode. (Supabase auth is still required for login — see Full setup.)

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
| `MFA_TRUST_SECRET` | server-only | recommended | `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |

## Milestone 1 status — Foundation ✅

- Next.js + Tailwind + shadcn scaffold with a dark-first, Robinhood-inspired theme.
- Supabase clients: browser (RLS), server (RLS), admin (service-role, server-only).
- Single-user email auth + `proxy.ts` route protection.
- Full schema migration with RLS on every table (`supabase/migrations/0001_initial_schema.sql`).
- Dashboard shell with **two hero charts** (Net Worth + Investments), shared range
  pills, and allocation cards (mock data until M2).

## Daily snapshot cron (Milestone 4)

A snapshot of net worth is recorded once per day at **1:10 PM Pacific**.

- Runs **weekdays only** (markets are closed weekends).
- Vercel Cron is UTC-only and can't follow DST, so [vercel.json](vercel.json) schedules
  **two** weekday runs (20:10 and 21:10 UTC, Mon–Fri). The handler at `/api/cron/daily`
  gates on PT wall-clock and only does work when it's the 1 PM PT hour — so exactly one
  run fires per weekday year-round.
- **Set `CRON_SECRET`** in Vercel project env. Vercel automatically sends it as
  `Authorization: Bearer <CRON_SECRET>`; the route rejects requests without it.
- The cron re-syncs each user from SnapTrade, then upserts today's `net_worth_snapshots`
  row (idempotent — re-running the same day overwrites, never duplicates). After a one-time
  brokerage connect, no manual pull is needed.
- **Local testing:** `curl "http://localhost:3000/api/cron/daily?force=1"` bypasses the
  PT gate. `?days=` seeding lives in the dev-only `/api/dev/backfill` route.
- Note: Vercel Hobby allows 2 cron jobs at daily granularity — this uses exactly 2.

## AI daily summary (Milestone 5)

A privacy-preserving daily briefing, generated after the snapshot in the same cron.

- **Privacy:** [`buildGeminiContext`](src/lib/holdings-report.ts) is the only data that
  reaches Gemini — sector weights, per-ticker % moves, and the tax split. It **never**
  contains dollar balances, share counts, or position values (enforced by a test). The
  dollar figures you see in the lightbox are computed locally and never sent.
- **Grounding:** [`gemini.ts`](src/lib/gemini.ts) calls `gemini-2.5-flash` with Google
  Search grounding so macro/sector drivers reflect the actual day. Output is strictly
  descriptive — never buy/sell/hold advice.
- **% moves** come from SnapTrade: each sync appends close prices to `security_prices`, and
  the report computes day-over-day change (`(today − prior) / prior`). Flat with a static
  sandbox brokerage; real movement appears with a live connection.
- **UI:** a notification banner with a **View** button opens a lightbox (tiles, macro
  summary, portfolio drivers, what-to-watch, and a holdings table with 🚀/🔻 mover
  flags + per-mover reasons). Dismissal is persisted in `localStorage`.
- **Setup:** apply migration `supabase/migrations/0002_security_prices.sql`, then set
  `GEMINI_API_KEY` in env (and enable Google Search grounding for the key).
- **Local testing:** `curl -X POST "http://localhost:3000/api/dev/summary?mock=1"` seeds
  a canned summary without an API key (drop `?mock=1` once the key is set).

## SnapTrade connection flow

Brokerages are connected through SnapTrade's hosted Connection Portal. The flow:

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
  HMAC-SHA256 of the raw body, keyed by the consumer key) and calls `syncUser`. **Locally**
  (webhooks can't reach `localhost`) use the **Sync** button, which runs the same pull.

**Setup:**
1. SnapTrade Dashboard → **API Keys** → set `SNAPTRADE_CLIENT_ID` and
   `SNAPTRADE_CONSUMER_KEY` (Vercel + `.env.local`).
2. SnapTrade Dashboard → **Settings → Security** → set `SNAPTRADE_USER_ID` and
   `SNAPTRADE_USER_SECRET` (the auto-provisioned personal user).
3. SnapTrade Dashboard → **Webhooks** → point the listener at
   `https://<your-domain>/api/snaptrade/webhook` (deployed only).

## Full setup (live data)

1. **Create a Supabase project**, then copy its URL + keys into `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (Settings → API)

2. **Apply the schema.** Run every file in `supabase/migrations/` **in order**
   (`0001` → `0002` → `0003` → `0004`), either by pasting each into the Supabase SQL
   editor or via the Supabase CLI (`supabase db push`).

3. **Create your single user** in Supabase → Authentication → Users → "Add user"
   (email + password). The `on_auth_user_created` trigger creates the profile row.

4. **Set the SnapTrade credentials** (see the SnapTrade connection flow section above):
   `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_KEY`, `SNAPTRADE_USER_ID`, `SNAPTRADE_USER_SECRET`,
   and set `DATA_PROVIDER=snaptrade`.

5. **Set `GEMINI_API_KEY`** for the daily AI summary (optional; enable Google Search
   grounding for the key).

6. **Run it:**
   ```bash
   npm run dev      # http://localhost:3000  → redirects to /login
   npm test         # unit tests (adapter mapping, webhook, classification, …)
   npm run build    # production build
   ```

## Deploy to Vercel

1. Import the repo into Vercel.
2. Set **all** the [environment variables](#environment-variables) in the Vercel project
   (including `CRON_SECRET` for the daily cron and `MFA_TRUST_SECRET`).
3. Cron is configured in [vercel.json](vercel.json) (two weekday runs; the handler gates
   on PT wall-clock). Vercel Hobby allows exactly the 2 daily jobs used here.
4. After deploying, point your **SnapTrade webhook** at
   `https://<your-domain>/api/snaptrade/webhook` (webhooks can't reach `localhost`).

## Conventions

- Never expose the SnapTrade `userSecret` to the browser — it stays server-only (env),
  used exclusively by Route Handlers / cron via the service-role client.
- Net worth is computed server-side and snapshotted; the frontend only reads derived data.
