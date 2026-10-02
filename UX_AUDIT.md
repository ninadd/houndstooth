# Houndstooth UX audit and fix plan

_Audit date: 2026-10-01_

## Context

This audit covers usability, repeated content on the dashboard, feedback after actions, awkward navigation, and any other pain points. No code was changed as part of it. It used two sources:

- **Code review** of every page, component, server action, and route under `src/`.
- **A read-only walkthrough of the live deployment** at desktop (1280px), tablet (832px), and phone (375px) widths. It only involved navigating, toggling chart ranges, and opening dialogs, which were closed with Escape. Sync, Connect, Save, and Delete were never clicked on the live site, so those flows were checked from the code only.

Severity: **H** means it costs data or trust, or blocks a task. **M** means it's a real friction or confusion. **L** means polish.

---

## Findings

### 1. Repeated content on the dashboard

- **D1 · H: The same numbers appear more than once.**
  - Net worth shows twice: the hero with cents and the card without.
  - Investments shows twice: the hero chart, plus the card labelled "Investable assets".
  - Total assets shows in both the Net worth card and the Investable card.
  - Code: `src/app/page.tsx:116-124`, `src/components/dashboard/summary-cards.tsx:29-56`.
  - Fix: each figure appears once (see Phase 3).
- **D2 · M: The two desktop charts look nearly identical.** Net worth minus investments equals property minus debts, and that barely moves. On live data, both charts showed the exact same dollar change for 1D, and the 1W and ALL curves look the same. Code: `hero-charts.tsx:122-138`. Fix: one chart with a Net worth / Investments switch.
- **D3 · L: Every chart is rendered twice in the page.** There is a phone version and a desktop version, with one hidden by CSS. That makes three chart instances for two visible ones, and the console shows Recharts "width(0) and height(0)" warnings. Code: `hero-charts.tsx:91-138`.
- **D4 · M: The "Investable assets" card only restates arithmetic** (total assets minus property) and adds nothing new.
- **D5 · L: One metric has two names.** It is "Investments" in the hero and on the summary page, but "Investable assets" on the card.

### 2. Feedback on actions

- **F1 · H: Deleting a manual account takes one click with no confirmation.**
  - The delete also removes the account's holdings and its value history (`account_balances` has `ON DELETE CASCADE`, `0006_account_balances.sql:11`).
  - The server action returns nothing, so the "Account deleted." toast appears even if the delete failed.
  - Code: `manual-account-dialog.tsx:437-446,482-490`, `lib/actions/manual-accounts.ts:215-231`.
- **F2 · H: A mistyped ticker can wipe or duplicate manual accounts.**
  - Edit: the action deletes all holdings and sets the balance to 0 before it checks the tickers. If one ticker fails, the account is left with $0 or only some holdings, and the snapshot isn't recalculated.
  - Add: the account row is inserted first. A bad ticker leaves a $0 orphan account, and resubmitting the still-open form creates a duplicate.
  - Code: `manual-accounts.ts:114-146, 171-207`.
- **F3 · M: Sync gives weak feedback.**
  - The button only greys out; there's no "Syncing…" label.
  - Success shows counts only.
  - If SnapTrade isn't set up, it reports "Synced 0 accounts, 0 holdings." as a success (`sync.ts:27-30`).
  - Failure says only "Sync failed.", with no reason or next step.
  - The dashboard Sync doesn't refresh manual holding prices; that's a separate button on the Accounts page.
  - Code: `account-actions.tsx:34-53`.
- **F4 · M: Nothing shows how fresh the data is.** `connections.last_synced_at` is saved (`sync.ts:56-59`) but never shown, and there's no "as of" time anywhere.
- **F5 · M: Database errors look like empty data.** Pages never check Supabase's `.error`, so a failed query shows "No accounts yet. Connect a brokerage…" (`page.tsx:54`). There is no `error.tsx` anywhere.
- **F6 · M: Navigating gives no loading feedback.** There's no `loading.tsx`. Every page waits on 2–4 queries, so clicking an account row looks like nothing happened. `ui/skeleton.tsx` exists but isn't used.
- **F7 · M: The summary banner flashes and has stale wording.**
  - The "seen" state lives in localStorage, which the server can't read, so the server always renders the banner. JavaScript then removes it after the page loads, which makes the page jump on every load. This was visible on mobile.
  - It also says "Your daily summary is ready" when the summary is yesterday's.
  - Code: `daily-summary.tsx:12-35`.
- **F8 · M: A missing or failed daily summary is invisible.** On a weekday afternoon, after both cron runs, the newest summary was still the previous day's. Neither the banner nor the summary page said so. `drivers.generatedAt` is never shown.
- **F9 · M: Connecting a brokerage ends with no confirmation.** You land back on `/` with no message. Locally nothing syncs; in production the webhook can lag, so the new brokerage simply isn't there yet. Code: `api/snaptrade/connect/route.ts:33-37`.
- **F10 · L: The 2FA page gives little feedback.** It shows no toasts and uses the browser's built-in `window.confirm` dialog. "Enable 2FA" flashes while factors load, and `disable()` ignores errors. Code: `account/security/page.tsx:18-30,80-97`.
- **F11 · L: Form problems.** Errors appear only as toasts; the holding row with the bad ticker isn't highlighted. The Edit dialog also keeps unsaved changes after you cancel, unlike the Add dialog, which resets.

### 3. Navigation

- **N1 · H: The Accounts page is hidden in the avatar menu.** The header shows only "Daily summary". Code: `top-nav.tsx:31-61`.
- **N2 · H: You can't add or manage accounts from the dashboard.** The dashboard's Accounts section only has a Sync button. Both empty states say to connect a brokerage but give no button to do it. Code: `page.tsx:126-141`, `hero-charts.tsx:317`.
- **N3 · M: The page hierarchy only works one way.** The detail page's back link says "← Accounts", but rows on the Accounts page don't link to details. You can only reach details from the dashboard. Code: `accounts/page.tsx:114,134`, `accounts/[id]/page.tsx:79-84`.
- **N4 · M: The account detail page has no actions or account info.** It has no rename, edit, tax treatment, type, or last-updated date, so you have to go back to Accounts and find the pencil.
- **N5 · H: The Security page is a dead end, and its layout is broken.**
  - It has no header and no links; the browser Back button is the only way out.
  - `main` shrinks to 181px on an 832px screen because `body` is a flex column and `main` has `mx-auto` without `w-full`.
  - Code: `account/security/page.tsx:100`, `layout.tsx:33`.
- **N6 · M: The 404 page has no navigation.** It's Next's default page. You'd hit it, for example, from a link to an account that a sync removed.
- **N7 · M: The Accounts page has two Sync buttons and two "Add account" buttons that do different things.** One Sync pulls from SnapTrade and the other re-prices from Yahoo. One Add opens the SnapTrade portal and the other opens the manual form. The heading "Manually linked accounts" also contradicts itself.
- **N8 · L: Smaller navigation issues.**
  - On desktop, the range buttons sit under the left chart only, though they control both.
  - On a phone, "ALL" is off-screen in a row with a hidden scrollbar.
  - Screen readers announce the avatar button just as "N".

### 4. Usability and data presentation

- **U1 · H: The headline numbers and the accounts table can disagree.** The cards read the last saved snapshot, but the table reads live balances (`page.tsx:86-97` vs `54-77`). During the afternoon cron sync they differed by about 0.5% until the snapshot caught up.
- **U2 · H: Summary tiles pair the wrong numbers.** Each tile shows the frozen value from the summary's date, next to a change calculated from the two latest snapshots when you view the page, labelled "today". Live, the tile showed Sep 30's value next to the Oct 1 minus Sep 30 change. Code: `summary/page.tsx:31-58,198`.
- **U3 · M: Range labels claim history that doesn't exist.** There are about three months of snapshots, so YTD, 1Y, 5Y and 10Y all show the same data as ALL, but 5Y is labelled "past 5 years". Date cutoffs also mix UTC (`toISOString`) and local time. Code: `hero-charts.tsx:49-71`.
- **U4 · M: Charts exaggerate small moves.** The Y axis is hidden and scaled to the data's own min and max, so a week that moved less than 1% fills the whole chart height and looks like a crash. Code: `hero-charts.tsx:297`.
- **U5 · M: Raw markdown shows in the AI summary text,** for example `[sec.gov](https://…)`. The web search (`:online`) adds citations, and the summary sections render them as plain text. Code: `summary/page.tsx:205-218`, `openrouter.ts:289`.
- **U6 · M: Synced accounts' tax treatment can't be corrected.** The data layer fully supports `tax_treatment_override`: sync preserves it and the totals and table read it. Nothing in the UI writes it, so a misclassified account stays wrong.
- **U7 · M: Cash is counted inconsistently.** The table shows checking and savings as tax "N/A", but the Tax treatment card counts them as Taxable (`snapshot.ts:72-76`). The table's rows don't add up to the card.
- **U8 · L: Formatting glitches.**
  - Schwab account numbers show as "••.771" because the adapter keeps the punctuation (`providers/snaptrade/adapter.ts:35`).
  - Zero-balance debts show "−$0" (`accounts-table.tsx:242-244`).
  - The hero shows cents while the cards don't.
- **U9 · L: Account type labels are inconsistent.** Synced credit cards show "Line of credit", manual mortgages and HELOCs show "Other", and both "Investment" and "Investments" appear. Code: `accounts-table.tsx:86-97`, `lib/account-type.ts:72-100`.
- **U10 · L: The holdings table cuts off Gain/Loss on tablets.** The columns are fixed equal widths; at 832px the text needs 197px but the cell is 154px. Code: `account-holdings-table.tsx:91-131`.
- **U11 · L: The summary page's holdings table lists every position,** 100+ including muni bond IDs, with no limit or search.

### 5. Other pain points (data durability and code hygiene)

- **O1 · M (verify first): Reconnecting a brokerage probably erases its accounts.** `reconcileConnections` deletes the old connection before sync can match accounts by `external_account_id`, and the delete cascades to the accounts. That loses custom names, tax overrides and per-account history, and old detail links start returning 404. Code: `sync.ts:141-175`, `ingest.ts:93-104`.
- **O2 · M (future bug): The dashboard will eventually freeze on old numbers.**
  - The snapshot and balance history queries fetch oldest-first with no limit, and Supabase caps responses at 1,000 rows by default.
  - After about 1,000 daily snapshots (2.7 years), the newest rows will be cut off and the headline will show an old value.
  - Code: `page.tsx:40-45`, `accounts/[id]/page.tsx:33-37`.
- **O3 · L: A long manual sync could be cut off.** `/api/sync` doesn't set `maxDuration` (the cron sets 300 seconds), which could leave balances updated but the snapshot stale.
- **O4 · L: Code cleanup.**
  - `ProjectedPortfolioChart` isn't used anywhere.
  - `SortHeader` is duplicated (`accounts-table.tsx:266` vs `ui/sort-header.tsx`).
  - The account-row mapping is duplicated (`page.tsx:54-77` and `accounts/page.tsx:28-51`).
  - The range-button markup is duplicated (`hero-charts.tsx:141-157,185-201`).
  - The dev summary route still checks `GEMINI_API_KEY` (`api/dev/summary/route.ts:38`).
  - README, CHANGELOG and `package.json` still mention Gemini and "allocation cards".
  - The toast component calls the theme hook without a theme provider (`ui/sonner.tsx:8`).

---

## Execution order

Each phase can ship on its own, and the order follows severity. The IDs refer to the findings above.

### Phase 1: Data safety and trustworthy numbers (F1, F2, U1, U2, U3, U5, U8, U9)

1. **Confirm deletes (F1).**
   - In `manual-account-dialog.tsx`, add a confirm step to the Delete button. The footer changes to: "Delete '<name>'? Its holdings and value history are removed too." with Cancel and a red Delete.
   - `deleteManualAccount` returns `ManualAccountActionState`, and the toast reflects the actual result.
2. **Check tickers before writing anything (F2).**
   - In `lib/manual-investments.ts`, split `createManualInvestmentHolding` into two functions: `resolveHoldings`, which looks up every ticker and price and throws with the failing row's number, and `insertHoldings`.
   - In `manual-accounts.ts`, both add and edit resolve everything first. Only after that do they insert the account, or delete and re-add holdings. If add fails afterwards, it deletes the new account row.
   - Return `{ error, holdingIndex }` so the dialog can highlight the failing row (F11).
3. **One source for current numbers (U1).** In `page.tsx`, calculate `figures` from the accounts it already loads, using `computeNetWorth` (`lib/snapshot.ts`). Replace or add today's point in `series` with the live values, using `pacificDate()`. Older history still comes from saved snapshots.
4. **Fix the summary tiles (U2).** In `summary/page.tsx`, fetch the two snapshots on or before the summary's date (`.lte("snapshot_date", summary.date)`, newest first, `limit(2)`). Use them for both the value and the change. Say "today" only when the summary is from today; otherwise say "on <weekday>".
5. **Honest ranges (U3).** In `hero-charts.tsx`:
   - Disable ranges that start before the first snapshot, but keep ALL.
   - Label ALL "since <first date>".
   - Calculate cutoffs as Pacific-time strings so they match snapshot dates.
6. **Render citation links (U5).** Add a small helper that turns `[text](https://…)` into React `<a target="_blank" rel="noopener noreferrer">` links. It accepts only http(s) URLs and never uses `dangerouslySetInnerHTML`. Use it in the summary `Section` and the mover reasons.
7. **Quick formatting fixes (U8, U9).**
   - Remove punctuation from account numbers, both in the adapter and in a display helper, so existing rows also look right.
   - Show no minus sign on zero balances.
   - Label manual debts with `formatAccountType(null, null, name)`, falling back to "Debt".
   - Add a `card` → "Credit card" keyword.
   - Use "Investments" everywhere.

### Phase 2: Navigation (N1–N7, F5, F6, F10)

1. **Header navigation.** In `top-nav.tsx`, add Dashboard, Accounts and Daily summary links, highlighting the current page via `usePathname`. Give the avatar `aria-label="Account menu"`. The avatar menu keeps Security and Sign out.
2. **Dashboard Accounts section.** The header shows "Updated <relative time>", Sync, and an "Add account" menu. Empty states get a real button or link.
3. **Accounts page.**
   - One page header with a single Sync and an "Add account" menu offering "Connect a brokerage" and "Add manually". Move the trigger for `AddManualAccountDialog` into that menu.
   - Rename the sections "Connected" and "Manual".
   - Rows link to details and show balances (`linkRows`, `showBalance`), and the pencil stays.
4. **Account detail page.** Breadcrumb "Accounts / <name>". Header shows type and tax badges, the institution and account number, and when it was last updated. Add an Edit action that reuses `RenameDialog` (or the synced-account dialog from Phase 4) and `ManualAccountEditDialog`.
5. **Security page.**
   - Make `page.tsx` a server component that renders `TopNav` and a back link around a client `SecurityCard`, and fix the width (`w-full` with the standard `max-w-5xl` shell).
   - Show a loading placeholder until factors load.
   - Add success and error toasts.
   - Replace `window.confirm` with an in-app confirm dialog.
6. **App-level error, 404 and loading pages.** These conventions were checked against the docs bundled in `node_modules/next/dist/docs` for this Next.js version.
   - `app/not-found.tsx`: the page shell plus links to Dashboard and Accounts.
   - `app/error.tsx`: a client component. In Next 16 it receives `unstable_retry`, not `reset`.
   - `loading.tsx` for `/`, `/accounts`, `/accounts/[id]` and `/summary`, built from `ui/skeleton.tsx`.
   - Pages throw when Supabase returns `.error`, so the error page shows instead of a false "No accounts yet" (F5).

### Phase 3: Dashboard consolidation (D1–D5, U4, U7, F4, F7, F8)

Target layout, where each figure appears exactly once:

```
Dashboard · Accounts · Daily summary                              (N)
[banner, only if unseen; says "Yesterday's summary" when it's stale]
┌ [Net worth  $X] | [Investments  $Y] ← switch; selected one is shown large
│ ±change (±%) past week · as of 3:14 PM
│ one chart with a light Y-axis scale
│ 1D 1W 1M 3M (YTD 1Y … only when there's data) ALL
└───────────────────────────────────────────────────────────────
┌ Assets · Debts · Property │ tax bar: Tax-advantaged | Taxable | Cash ┐
Accounts                         Updated 3:14 PM · [Sync] [Add ▾]
table (rows open the account's page)
```

1. **One chart.** In `hero-charts.tsx`, use one chart at every screen width. Reuse the current phone tab markup as the Net worth / Investments switch, with each option showing its own value. Delete the side-by-side desktop grid (fixes D2, D3). Pull the range buttons into a `RangePills` component that `SingleHeroChart` also uses.
2. **Breakdown card.** Replace `SummaryCards` with a `BreakdownCard` showing Assets, Debts, Property, and the tax bar with a separate Cash segment.
   - Calculate cash with `isCashType` (`lib/tax-classification.ts`) in its own small function.
   - Don't add it to `SnapshotFigures`: `computeAndStoreSnapshot` writes every field of `figures` into the database insert (`snapshot.ts:130-137`), so a new field would break the insert.
3. **Y axis (U4).** Show 2–3 compact labels such as "$9.4M", and keep a minimum visible range of about 1% of the current value, so flat weeks look flat.
4. **Freshness (F4).** Add `last_synced_at` to the dashboard's `connections(...)` query. Show "Updated …" next to Sync and "as of" in the hero.
5. **Banner (F7, F8).**
   - Replace localStorage with a `summary_seen` cookie. The browser sets it on dismiss or on visiting `/summary`, and `page.tsx` reads it with `await cookies()`. The server then renders the right state, so the banner no longer flashes.
   - When the summary is older than today, the banner says "Yesterday's summary".
   - `/summary` shows "Generated <generatedAt>". On a weekday after about 2 PM PT with no summary for today, it adds a muted note.
6. **Wording and precision (D5).** Use "Investments" everywhere, and drop cents from the large totals.
7. **Optional.**
   - Group the accounts table by category with subtotals; the breakdown card could then shrink to just the tax bar.
   - Show sector allocation, which `lib/holdings-report.ts` already calculates for the AI summary, in place of the removed cards.

### Phase 4: Action feedback and editing (F3, F9, U6, F11)

1. **One sync for everything.**
   - `/api/sync` runs `refreshManualHoldingPrices` and then `syncUser`, and returns `{ configured, accounts, holdings, pricesRefreshed }`.
   - When SnapTrade isn't set up, it still recalculates the snapshot. Today `syncUser` returns before reaching `computeAndStoreSnapshot` in that case.
   - Set `export const maxDuration` (O3).
   - The button shows a spinner and "Syncing…" with a loading toast. Use a warning toast when SnapTrade isn't configured, and give the error a next step.
   - The manual Sync button goes away.
2. **Confirm new connections (F9).**
   - The SnapTrade portal returns to `/accounts?connected=1`.
   - The Accounts page then shows "Brokerage connected, syncing…", runs one sync, and removes the parameter from the URL.
3. **Edit dialog for synced accounts (U6).**
   - Fields: display name, plus "Tax treatment: Auto (detected: X) / Taxable / Tax-advantaged". The tax field is hidden for debt and cash accounts.
   - Replace `renameAccount` with `updateAccountSettings` in `lib/actions/accounts.ts`. It writes `custom_name` and `tax_treatment_override`, then recalculates the snapshot and refreshes the affected pages.
4. **Manual edit dialog (F11).** Reset the form each time it opens, mirroring `AddManualAccountDialog.reset()`. Add a Cancel button and show errors on the failing field.

### Phase 5: Durability, cleanup and accessibility (O1, O2, O4, N8)

1. **Keep accounts across reconnects (O1).** First confirm whether SnapTrade keeps account IDs when a brokerage is reconnected. If it does, change the order in `syncUser`: add the new connections, then sync (which moves matching accounts to the new connection by `external_account_id`), then run `pruneAccounts`, and only then delete stale connections. Add a test in `sync.test.ts`.
2. **Row limit (O2).** Fetch snapshots and balances newest first with an explicit limit, then reverse the order, so the newest data is always included. Later, thin out long ranges on the server.
3. **Cleanup (O4).**
   - Delete `ProjectedPortfolioChart`, or put it to use.
   - Use `ui/sort-header.tsx` in `accounts-table.tsx`.
   - Share one account-row mapping helper between the dashboard and Accounts page.
   - Fix the dev route's environment variable.
   - Update the docs.
   - Pass `theme="dark"` to the toast component.
4. **Accessibility (N8).** Proper tab semantics on the metric switch, pressed state on range buttons, sort state on table headers, and autofocus and a 6-character limit on the 2FA code fields.

---

## Verification

- **Commands:** `npm test`, `npm run lint`, `npm run build`.
- **New or updated unit tests:**
  - Account-number cleanup (`adapter.test.ts`).
  - Type labels (`account-type.test.ts`).
  - Live figures and the cash split (`snapshot.test.ts`).
  - Range availability.
  - Picking the summary's snapshots.
  - Ticker checks running before any write (with Yahoo mocked).
- **Local QA in mock mode** (`DATA_PROVIDER=mock`, `npm run dev`):
  - **Dashboard:** each figure appears once; the chart's last point matches the headline; ranges without data are disabled; the banner doesn't flash after visiting `/summary` and hard-reloading.
  - **Accounts:** one Sync and one Add menu; rows open the detail page.
  - **Detail page:** breadcrumb and Edit work.
  - **Security:** has navigation and full width.
  - **404 page:** has navigation.
  - **Error page:** appears and the retry button works.
  - **Loading skeletons:** show on a throttled connection.
  - **Delete:** asks for confirmation.
  - **Bad ticker:** editing with one leaves the account intact.
  - **Sync toasts:** correct, including the "not configured" case.
  - **Widths:** works at 375px and 832px, and Gain/Loss isn't cut off.
- **After deploying:** repeat the read-only walkthrough of the live site at the same three widths.
