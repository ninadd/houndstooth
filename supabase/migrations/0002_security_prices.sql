-- =============================================================================
-- Daily security close-price history.
-- Lets us compute day-over-day % change per holding (today vs prior date),
-- which feeds the daily AI summary's movers table.
-- =============================================================================

create table public.security_prices (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  security_id uuid not null references public.securities (id) on delete cascade,
  price_date  date not null,
  close_price numeric(18, 6),
  created_at  timestamptz not null default now()
);

create index security_prices_user_id_idx on public.security_prices (user_id);
create index security_prices_security_date_idx
  on public.security_prices (security_id, price_date desc);
create unique index security_prices_security_date_uidx
  on public.security_prices (user_id, security_id, price_date);

alter table public.security_prices enable row level security;

create policy "security_prices_owner_all" on public.security_prices
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
