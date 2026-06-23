-- =============================================================================
-- Manually added accounts now live in `accounts` (is_manual = true) instead of
-- the separate `manual_assets` table, so they render in the same AccountsTable
-- as synced accounts and can carry real holdings (ticker, units, cost basis).
-- =============================================================================

alter table public.accounts
  add column manual_category text
    check (manual_category in ('property', 'debt', 'investment'));

drop table public.manual_assets;
