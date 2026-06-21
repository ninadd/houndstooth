-- =============================================================================
-- Drop the dormant profiles.snaptrade_user_secret_encrypted column.
--
-- The personal-tier SnapTrade integration uses a single fixed userId/userSecret
-- from env (no per-user registration), so this column is never written or read.
-- It was created by the earlier reset of 0001; this migration removes it from
-- live databases without a full reset. (A fresh `db reset` no longer creates it,
-- since 0001 was updated — `drop column if exists` keeps this idempotent.)
-- =============================================================================

alter table public.profiles
  drop column if exists snaptrade_user_secret_encrypted;
