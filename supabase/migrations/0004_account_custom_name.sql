-- =============================================================================
-- Add accounts.custom_name for user-set display names.
--
-- Connected accounts get their `name` from the broker (via SnapTrade) and it is
-- overwritten on every sync. `custom_name` lets the user override that label;
-- the UI shows `custom_name` when set, otherwise the broker `name`. It is never
-- touched by the sync upsert, so it survives resyncs. Null = use broker name.
-- =============================================================================

alter table public.accounts
  add column if not exists custom_name text;
