# README feedback & recommendations (draft — not applied)

Review of `README.md` for a first-time / non-expert reader trying to self-host Houndstooth
on their own. This is a standalone notes file — `README.md` itself hasn't been touched.

I cross-checked the instructions against `.env.example`, `package.json`, `.nvmrc`,
`CONTRIBUTING.md`, and `supabase/migrations/`. Everything in the README is factually accurate
— the issues below are about clarity, ordering, and assumed knowledge for a newcomer, not
wrong information.

## What already works well

- The three-pillar intro (privacy-first / single-user / free) sets expectations fast.
- The env var table is accurate and complete, with a "where to get it" column.
- Each subsystem (cron, AI summary, SnapTrade) documents its own local-testing shortcut
  (`?force=1`, `?mock=1`, dev backfill route) — genuinely useful and often skipped in READMEs.
- "Full setup" is a clean, consolidated numbered checklist even though some steps restate
  things covered earlier — repetition here is a feature for a newcomer, not a bug.

## Issues found (beginner lens)

1. **Quick Start contradicts itself on credentials.** The heading promises "mock mode — no
   credentials needed," but the very next line says Supabase auth is still required to log
   in. A newcomer will run `npm run dev`, hit `/login`, and get stuck with no account and no
   idea why, since they were told no credentials were needed.
   *Why it matters:* this is the very first thing a new user does — a stumble here loses
   people before they see anything working.

2. **No screenshot or demo of the actual app.** The `public/` folder only has logo SVGs. A
   newcomer deciding whether to invest 20+ minutes in setup usually wants to see the dashboard
   first.
   *Why it matters:* README is a sales pitch as much as a manual for a self-hosted project;
   showing the payoff up front motivates finishing the setup.

3. **"Foundation" section interrupts the setup flow.** Order today is: Quick Start → Env
   vars → **Foundation** (architecture description) → Daily cron → AI summary → SnapTrade
   flow → Full setup → Deploy. A reader trying to go from zero to running has to wade through
   an architecture summary sandwiched in the middle of setup-relevant sections.
   *Why it matters:* newcomers scan top-to-bottom expecting each section to build on the last;
   an architecture aside in the middle reads as "did I miss a step?"

4. **No prerequisite accounts checklist up front.** The Requirements section only mentions
   Node/npm and Supabase; SnapTrade and Google AI Studio accounts are only introduced deep in
   their respective sections. A newcomer doesn't know at a glance everything they might need
   to go create accounts for before starting.
   *Why it matters:* creating accounts is the slowest part of setup — surfacing all of them
   at once lets a newcomer batch that work instead of getting interrupted mid-setup each time
   a new required account shows up.

5. **Jargon without inline definition:** RLS, HMAC, "PT wall-clock gate," "webhook," "Route
   Handler," "idempotent" all appear without a parenthetical for a reader new to the stack.
   *Why it matters:* each one is a small stop-and-Google moment; a 3-4 word parenthetical
   costs nothing and keeps momentum.

6. **No Table of Contents.** At ~190 lines / 11 sections, a newcomer skimming for "how do I
   just get this running" has to read serially.
   *Why it matters:* self-hosters often return to the README later just to find one setup
   step (e.g. "what was that curl command for testing the cron") — a ToC makes it a reference
   doc, not just a first-read narrative.

7. **`git clone <your-fork-url>` placeholder isn't explained.** Since `CONTRIBUTING.md` says
   PRs aren't accepted but forking is expected, a newcomer may not realize they can clone the
   original repo directly to just run it locally, and only need to fork if they want their own
   GitHub remote to deploy from.
   *Why it matters:* avoids an unnecessary "do I need to fork first?" detour for someone who
   just wants to try it locally.

8. **No mention of `npm run lint`** in the "Run it" step, even though it's a defined script.
   Minor, but for consistency with `npm test` / `npm run build` being called out.

9. **No expectations on setup time.** Distinguishing "mock mode: ~5 min" vs "full live setup:
   ~20-30 min (accounts + migrations + webhook)" lets a newcomer choose the right on-ramp for
   the time they have.

## Proposed content plan (ordered by impact)

1. **Fix the Quick Start contradiction.** Either (a) rename the heading to something like
   "Quick start (mock data, still requires a Supabase login)" and move the one-line Supabase
   requirement above the code block, not after it, or (b) add the minimal Supabase auth steps
   (create project, add one user) directly into Quick Start so it's genuinely credential-light
   end-to-end. Recommend (a) — smallest change, sets correct expectations immediately.

2. **Add a short "what you'll need" checklist** near the top of Requirements: GitHub, Supabase
   (free), SnapTrade (free, optional), Google AI Studio (optional) — each with a one-line why.
   Lets a newcomer batch account creation before diving into steps.

3. **Move "Foundation" to the end of the document** (just before "Conventions"), reframed as
   an "Architecture" section for readers who want the internals, not as required setup reading.
   Keeps the setup path (Quick Start → Env vars → Full setup → Deploy) uninterrupted.

4. **Add a Table of Contents** right under the intro pillars, before "Requirements."

5. **Add inline parentheticals** for RLS, HMAC, webhook, idempotent, Route Handler on first
   use — one clause each, no new sections needed.

6. **Add one screenshot or GIF of the dashboard** near the top (after the intro, before Quick
   Start). Doesn't require new infra — a single PNG in `public/` or a `docs/` folder referenced
   via markdown image syntax.

7. **Clarify the `git clone` line**: change the `<your-fork-url>` guidance to note that
   cloning the original repo works fine for local/mock use, and forking is only needed if
   deploying your own instance to Vercel from your own GitHub.

8. **Add `npm run lint`** to the "Run it" command block in Full Setup, alongside `test`/`build`.

9. **Add rough time estimates** next to the Quick Start and Full Setup headings (e.g. "~5 min,"
   "~20-30 min").

## Not recommended

- No change to the env var table itself — it's accurate and appropriately detailed as a
  reference; the fix is contextual (checklist above it), not restructuring the table.
- No change to the SnapTrade/cron/AI-summary technical detail — that content is correct and
  useful, it just needs to stay out of the way of the top-to-bottom setup path (see #3).
