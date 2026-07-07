# Contributing to Houndstooth

Houndstooth is a personal, **single-user** project that I build for my own use and share
as source-available. To keep it focused, **I'm not accepting pull requests** — but
**bug reports are very welcome.**

## Found a bug?

Please [open a bug report](../../issues/new?template=bug_report.md) with:

- Steps to reproduce, and expected vs. actual behavior.
- Your environment: Node version, deploy target (local / Vercel), data provider
  (`mock` / `snaptrade`).

**Never paste real secrets, account IDs, or tokens** into an issue.

## Security vulnerabilities

Please don't open a public issue for security problems — see [SECURITY.md](SECURITY.md)
for private reporting via GitHub Security Advisories.

## Want to change something?

You're welcome to **fork** Houndstooth and adapt it under the terms of the
[MIT license](LICENSE). I'm just not merging external contributions back into this repo.

If you fork, a couple of invariants are worth preserving:

- **Never expose secrets to the browser** — the SnapTrade `userSecret`, the Supabase
  service-role key, and other server-only secrets stay in env vars.
- **AI privacy** — only anonymized aggregates (`buildGeminiContext`) may reach Gemini,
  never dollar balances, share counts, or position values (there's a test enforcing this).
