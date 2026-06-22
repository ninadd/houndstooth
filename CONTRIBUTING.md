# Contributing to Houndstooth

Thanks for your interest! Houndstooth is a **self-hosted, single-user** net-worth and
investment tracker. Each deployment runs one isolated instance backed by the operator's
own Supabase project and API keys — there is no shared/multi-tenant mode by design.

## Getting started

1. Read the [README](README.md) for setup. The fastest path is **mock mode**
   (`DATA_PROVIDER=mock`), which runs with no external credentials.
2. Fork the repo and create a feature branch off `main`:
   ```bash
   git checkout -b my-feature
   ```

## Before opening a pull request

- `npm test` — unit tests (adapter mapping, webhook verification, classification, …) pass.
- `npm run build` — production build succeeds.
- `npm run lint` — no new lint errors.
- Keep PRs focused; describe the change and how you tested it.

## Conventions

- **Never expose secrets to the browser.** The SnapTrade `userSecret`, the Supabase
  service-role key, and all other server-only secrets stay in env vars and are used only
  by Route Handlers / cron via the service-role client. Never log them or send them to
  the client.
- **Privacy of AI context.** Only `buildGeminiContext` data (sector weights, per-ticker
  % moves, tax split) may reach Gemini — never dollar balances, share counts, or position
  values. There is a test enforcing this; keep it passing.
- **Single-user per instance.** Don't add multi-tenant assumptions; net worth is computed
  server-side and snapshotted, and the frontend only reads derived data.
- Match the style and patterns of the surrounding code.

## Reporting issues

Open a GitHub issue with steps to reproduce, expected vs. actual behavior, and your
environment (Node version, deploy target). **Never paste real secrets, account IDs, or
tokens** into issues or PRs.
