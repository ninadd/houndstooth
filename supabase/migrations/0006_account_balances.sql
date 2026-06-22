-- =============================================================================
-- Per-account balance history, so each account's detail page can chart its own
-- value over time (mirrors net_worth_snapshots, but one row per account/day).
-- Populated going forward by the daily cron, right after computeAndStoreSnapshot
-- recomputes the user-level snapshot from freshly synced balances.
-- =============================================================================

create table public.account_balances (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  account_id   uuid not null references public.accounts (id) on delete cascade,
  balance_date date not null,
  balance      numeric(18, 2) not null default 0,
  created_at   timestamptz not null default now()
);

create index account_balances_user_id_idx on public.account_balances (user_id);
create index account_balances_account_id_idx on public.account_balances (account_id);
create unique index account_balances_account_date_uidx
  on public.account_balances (account_id, balance_date);

alter table public.account_balances enable row level security;

create policy "account_balances_owner_all" on public.account_balances
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Seed today's row for every existing account so its detail page has at least
-- one point immediately, instead of waiting for tomorrow's cron run.
insert into public.account_balances (user_id, account_id, balance_date, balance)
select user_id, id, current_date, coalesce(current_balance, 0)
from public.accounts
on conflict (account_id, balance_date) do nothing;
