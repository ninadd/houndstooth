# Houndstooth — UX Audit

_Audit of the user experience across the dashboard, accounts, account detail, daily
summary, auth (login / MFA), and security surfaces. Findings are organized by the three
questions: what works, what feels broken (especially navigation), and what's missing from
the main dashboard. Severity: 🔴 high · 🟠 medium · 🟡 low._

---

## 1. What works

### Information hierarchy — strong
- **Dashboard reads top-down correctly** ([src/app/page.tsx](src/app/page.tsx)): daily
  summary banner → hero charts (Net Worth + Investments) → summary cards → accounts table.
  The most important number (net worth) is the largest, most prominent element.
- **Hero charts** ([hero-charts.tsx](src/components/dashboard/hero-charts.tsx)) use a
  clear size ladder: big value (`text-3xl/4xl`) → signed delta + % → muted range label.
  The dashed reference line at the range's starting value makes "change vs. start" legible.
- **Rows are well-structured**: account name (medium) over institution/mask (muted,
  small); holding ticker (medium) over security name (muted, small). Consistent
  primary/secondary pairing everywhere.
- **Summary page** ([src/app/summary/page.tsx](src/app/summary/page.tsx)) has a clean
  hierarchy: date (small, uppercase, primary) → headline (large) → stat tiles → prose
  sections → holdings table.

### Importance — well-signaled
- **Net worth is the hero** and is always the largest figure on the dashboard.
- **Color semantics are consistent**: green = gain / tax-advantaged, red = loss / debt,
  blue (`chart-2`) = taxable. The same tokens are reused in charts, badges, tiles, and
  tables, so "green is good, red is bad" never flips.
- **The daily summary banner** sits at the very top of the dashboard with a distinct
  primary-tinted treatment, so it's high-visibility without being noisy.
- **Movers** are split into "Top winners" / "Top losers" with tone-coded percentages,
  which quickly tells you what moved and why.

### Visibility — good
- **Sticky top nav** with backdrop blur keeps navigation reachable while scrolling.
- **Empty states are handled** with dashed cards and actionable copy (no accounts, no
  holdings, no summary, no data for a chart range).
- **Focus-visible rings** on interactive elements; `tabular-nums` keeps numbers aligned.
- **Responsive handling is thoughtful**: mobile gets a tabbed single chart +
  horizontally-scrolling range pills; desktop gets two side-by-side charts. Tables drop
  lower-priority columns (Type/Tax, Units/Cost basis) on small screens.
- **Loading/disabled states** exist on buttons (`Signing in…`, `Verifying…`, `Saving…`)
  and range pills are disabled when there's no data.

### Consistency / repetition — mostly good
- **One card pattern** (`Card` + `rounded-xl border`) is repeated across all surfaces.
- **Gain/loss color coding** is repeated identically in hero charts, summary tiles,
  holdings tables, and movers.
- **Sort headers** share the same affordance (chevron icons, muted→foreground on
  active) across the accounts, holdings, and summary tables.
- **Back links** (`← Dashboard`, `← Accounts`) use the same muted style.
- **Toast feedback** (sonner) is the consistent mechanism for action results
  (`Synced N accounts`, `Account added.`, `Sync failed.`).

---

## 2. Flows that feel weird or broken (navigation especially)

### 🔴 2.1 Primary onboarding action is buried, and the dashboard's empty state can't do it
The two "get started" actions — **Connect a brokerage** and **Add a manual account** —
both live only on `/accounts` ([src/app/accounts/page.tsx](src/app/accounts/page.tsx)),
which is hidden inside the avatar dropdown. But the **dashboard** (the landing page)
renders `<AccountActions … syncOnly />`, so it shows **only a "Sync" button** — no
Connect, no Add. Meanwhile the dashboard's empty state says:

> "No accounts yet. **Connect a brokerage** with SnapTrade to pull in balances…"
> ([src/app/page.tsx](src/app/page.tsx))

So the landing page tells you to connect, but gives you no button to do it. A first-time
user has to (1) guess that "Accounts" is in the avatar menu, (2) open it, (3) find
"Connect account." The single most important first action is two levels deep and not
reachable from the page that asks for it.

### 🔴 2.2 Core navigation is hidden in the avatar menu
The top nav ([top-nav.tsx](src/components/dashboard/top-nav.tsx)) exposes **only one**
visible destination: "Daily summary." **Accounts** (where all management happens) and
**Security** (where 2FA is set up) are tucked into the avatar dropdown. For an app whose
whole job is managing accounts, "Accounts" being a dropdown item rather than a first-class
nav link is a discoverability problem.

### 🔴 2.3 The Security page is a navigation dead-end
The Security page ([src/app/account/security/page.tsx](src/app/account/security/page.tsx))
renders **no `<TopNav>` and no back link** — just a bare `<main>` with one card. Every
other authenticated surface (dashboard, accounts, account detail, summary) renders the
top nav. So from Security there is no logo, no "Daily summary" link, no avatar menu, and
no sign-out. The only way out is the browser back button. This is the most visibly
inconsistent page in the app.

### 🟠 2.4 No active/current-page indicator in the nav
The "Daily summary" button and the dropdown items never indicate which page you're on.
There's no `usePathname()`-driven active state, so the nav gives no orientation once you've
left the dashboard.

### 🟠 2.5 The "Accounts" hub doesn't link to account detail — only the dashboard does
- The **dashboard** accounts table is `linkRows` (rows navigate to `/accounts/[id]`).
- The **`/accounts`** tables are `editable` but **not** `linkRows`, and are
  `showBalance={false}`.

So the page you'd expect to drill into an account from (`/accounts`) can't — and it also
hides balances. The detail page is only reachable via the dashboard's read-only table.
The detail page's back link then points to `/accounts`, which doesn't link back to the
detail. The loop is: dashboard → detail → `/accounts` (dead end for drilling in).

### 🟠 2.6 Identical button labels, different meanings (two "Sync", two "Add account")
On `/accounts` there are **two "Sync" buttons** and **two "Add account" buttons** that do
unrelated things:
- "Synced accounts" → **Sync** = pull from SnapTrade; **Add account** = SnapTrade connect.
- "Manually linked accounts" → **Sync** = re-price from Yahoo Finance; **Add account** =
  manual entry dialog.

The labels are identical; only the toasts differ (`Synced N accounts` vs `Refreshed N
prices`). A user can't tell which "Sync" they're pressing without reading the section
heading. Consider "Sync brokerage" vs "Refresh prices," and "Connect brokerage" vs
"Add manual account."

### 🟠 2.7 Connect flow leaves with no return path or next-step guidance
"Connect account" does `window.location.href = redirectURI` to SnapTrade's portal
([account-actions.tsx](src/components/dashboard/account-actions.tsx)). After connecting,
the user returns with no in-app acknowledgment, and — locally — the account won't appear
until they manually click **Sync** (webhooks only fire on deploy). There's no "You
connected X — click Sync to pull it in" state. The hand-off is a one-way door.

### 🟡 2.8 No data-freshness signal anywhere
There is no "last synced at" / "as of" timestamp on the dashboard, the accounts page, or
the detail page. For a financial app, the user can't tell if the numbers are 5 minutes or
3 days old. This is a trust/visibility gap (also listed under §3).

### 🟡 2.9 No custom 404 / not-found surface
There's no `not-found.tsx`. An unknown account id (detail page calls `notFound()`) or any
bad route renders Next's bare default 404 — no logo, no nav, no way back. Minor, but it
breaks the otherwise-consistent shell.

### 🟡 2.10 "Seen" state is per-browser (localStorage)
The daily-summary banner dismissal is stored in `localStorage`
([daily-summary.tsx](src/components/dashboard/daily-summary.tsx)). Clearing storage or
switching devices re-surfaces old banners. Acceptable for single-user, but worth knowing.

---

## 3. What's missing from the main dashboard

### 🔴 3.1 No primary CTA / onboarding on the landing page
Tied to §2.1: the dashboard has no "Connect a brokerage" or "Add manual account" action,
and no first-run guidance. A new user lands on an empty dashboard with only a "Sync"
button that does nothing useful until an account exists.

### 🔴 3.2 No data-freshness indicator
No "last synced" / "as of" timestamp. The user can't judge how current the net-worth
figure is. (See §2.8.)

### 🟠 3.3 A fully-built projection feature is never shown
`ProjectedPortfolioChart` ([projected-portfolio-chart.tsx](src/components/dashboard/projected-portfolio-chart.tsx))
and `projectPortfolio` ([projection.ts](src/lib/projection.ts)) are complete — a
bull/base/bear "what will my portfolio be worth in 10/20/30/40 years" chart — but
**nothing imports them**. It's dead code: a genuinely useful dashboard feature that was
built and then left out of the UI.

### 🟠 3.4 No sector / asset-class allocation view
The docs promise "allocation cards" ([README.md](README.md), [CHANGELOG.md](CHANGELOG.md))
and the app computes sectors ([sector-classify.ts](src/lib/sector-classify.ts),
[holdings-report.ts](src/lib/holdings-report.ts)), but the dashboard only shows the
taxable/tax-advantaged split. There's no "where is my money allocated" (by sector or asset
class) visualization on the dashboard — that data only surfaces indirectly in the daily
summary. The "allocation cards" the docs describe don't match what's actually rendered.

### 🟠 3.5 No "today" at a glance
The hero charts default to the **1W** range, so the dashboard's headline delta is
week-over-week, not today's move. Day-over-day change only appears on the `/summary` page.
A user glancing at the dashboard can't see how the portfolio did *today* without clicking
through.

### 🟡 3.6 No quick-add / management shortcuts
You can't add a manual account, rename, or edit anything from the dashboard — all
management requires navigating to `/accounts`. The dashboard is strictly read-only + Sync.

### 🟡 3.7 No settings or preferences
No theme toggle (the layout hard-codes `dark` in [layout.tsx](src/app/layout.tsx), so the
light tokens in `globals.css` are unused), no currency setting (hard-coded USD in
[format.ts](src/lib/format.ts)), and no way to change anything about the presentation.
Fine for a single-user tool, but there's no escape hatch.

### 🟡 3.8 No search/filter for accounts
The dashboard table supports sorting but not filtering/searching. With many accounts,
finding one means scanning or sorting — no type-ahead.

---

## Suggested priorities (if acting on this)

1. **Fix onboarding (§2.1, §3.1):** put a real "Connect a brokerage" CTA on the dashboard
   (especially the empty state), and promote **Accounts** to a first-class nav link (§2.2).
2. **Un-break Security (§2.3):** give it the standard `<TopNav>` + a back link like every
   other page.
3. **Make `/accounts` a real hub (§2.5):** show balances and link rows to the detail page.
4. **Disambiguate buttons (§2.6):** distinct labels for the two Syncs and two Add buttons.
5. **Add freshness (§2.8, §3.2):** a "last synced" timestamp on the dashboard.
6. **Ship the projection chart (§3.3):** it's already built — wire it into the dashboard.
7. **Add an allocation view (§3.4)** to match the docs and the data you already compute.
