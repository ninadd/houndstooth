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
