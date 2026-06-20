# Houndstooth

Personal net-worth & investment tracker. Aggregates accounts across institutions,
separates taxable vs tax-advantaged holdings, charts Net Worth and Investments over
time ("Time Machine"), and generates a privacy-preserving daily AI market summary.

**Stack:** Next.js (App Router) · Supabase (Postgres + Auth + RLS) · Plaid · Gemini ·
Tailwind v4 + shadcn/ui · Recharts. Deployed on Vercel.

See `.claude/plans/role-you-are-an-kind-blossom.md` for the full architecture & roadmap.

## Milestone 1 status — Foundation ✅

- Next.js + Tailwind + shadcn scaffold with a dark-first, Robinhood-inspired theme.
- Supabase clients: browser (RLS), server (RLS), admin (service-role, server-only).
- Single-user email auth + `proxy.ts` route protection.
- Full schema migration with RLS on every table (`supabase/migrations/0001_initial_schema.sql`).
- AES-256-GCM token encryption helper (`src/lib/crypto.ts`) + tests.
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
- The cron re-syncs each user from Plaid, then upserts today's `net_worth_snapshots`
  row (idempotent — re-running the same day overwrites, never duplicates).
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
- **% moves** come from Plaid: each sync appends close prices to `security_prices`, and
  the report computes day-over-day change (`(today − prior) / prior`). Flat in Sandbox
  (static prices); real movement appears in Production.
- **UI:** a notification banner with a **View** button opens a lightbox (tiles, macro
  summary, portfolio drivers, what-to-watch, and a holdings table with 🚀/🔻 mover
  flags + per-mover reasons). Dismissal is persisted in `localStorage`.
- **Setup:** apply migration `supabase/migrations/0002_security_prices.sql`, then set
  `GEMINI_API_KEY` in env (and enable Google Search grounding for the key).
- **Local testing:** `curl -X POST "http://localhost:3000/api/dev/summary?mock=1"` seeds
  a canned summary without an API key (drop `?mock=1` once the key is set).

## Plaid Link OAuth (Production banks)

Major US banks (Chase, Wells Fargo, BofA) use OAuth in Production. The flow:

- Link is created with a `redirect_uri` ([link-token route](src/app/api/plaid/link-token/route.ts),
  env-gated by `PLAID_REDIRECT_URI`). The `link_token` is persisted to `localStorage`
  ([plaid-link.ts](src/lib/plaid-link.ts)) before opening Link.
- The bank redirects back to **`/plaid-oauth`** ([page](src/app/plaid-oauth/page.tsx)),
  which resumes Link with `receivedRedirectUri = window.location.href` + the stored
  token, auto-opens, then exchanges the public token and returns to `/`.

**Setup:**
1. Plaid Dashboard → **Developers → API → Allowed redirect URIs** → add your exact URL,
   e.g. `https://your-domain.com/plaid-oauth` (and `http://localhost:3000/plaid-oauth`
   for Sandbox testing). No query params, no `#`.
2. Set `PLAID_REDIRECT_URI` to that exact value (Vercel + `.env.local`).
3. Leave it unset to keep simple non-OAuth Sandbox linking working as before.

## Local setup

1. **Create a Supabase project**, then copy its URL + keys into `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (Settings → API)

2. **Generate the token encryption key** and paste into `TOKEN_ENCRYPTION_KEY`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

3. **Apply the schema.** Either paste `supabase/migrations/0001_initial_schema.sql`
   into the Supabase SQL editor, or use the Supabase CLI (`supabase db push`).

4. **Create your single user** in Supabase → Authentication → Users → "Add user"
   (email + password). The `on_auth_user_created` trigger creates the profile row.

5. **Run it:**
   ```bash
   npm run dev      # http://localhost:3000  → redirects to /login
   npm test         # crypto round-trip tests
   npm run build    # production build
   ```

## Conventions

- Never read/write Plaid access tokens from the browser — they live encrypted in
  `plaid_items` and the `access_token_encrypted` column is revoked from client roles.
- Net worth is computed server-side and snapshotted; the frontend only reads derived data.
