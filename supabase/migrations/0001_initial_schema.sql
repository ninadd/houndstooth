-- =============================================================================
-- Personal Portfolio Tracker — initial schema
-- Single-user app, but every table is RLS-scoped to auth.uid() for safety.
-- =============================================================================

-- ---------- helpers ----------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- profiles ---------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  timezone     text not null default 'America/Los_Angeles',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row whenever a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- plaid_items ------------------------------------------------------

create table public.plaid_items (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users (id) on delete cascade,
  plaid_item_id           text not null unique,
  access_token_encrypted  text not null,
  institution_id          text,
  institution_name        text,
  status                  text not null default 'active',
  last_synced_at          timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index plaid_items_user_id_idx on public.plaid_items (user_id);

create trigger plaid_items_set_updated_at
  before update on public.plaid_items
  for each row execute function public.set_updated_at();

-- The encrypted access token must never be readable by client roles.
-- Only the service-role key (which bypasses RLS) may read/write it.
revoke select (access_token_encrypted) on public.plaid_items from anon, authenticated;

-- ---------- accounts ---------------------------------------------------------

create table public.accounts (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users (id) on delete cascade,
  item_id                uuid references public.plaid_items (id) on delete cascade,
  plaid_account_id       text,
  name                   text not null,
  official_name          text,
  type                   text,
  subtype                text,
  -- Auto-classified by classifyTaxTreatment(); 'taxable' | 'tax_advantaged'.
  tax_treatment          text not null default 'taxable'
                           check (tax_treatment in ('taxable', 'tax_advantaged')),
  -- Optional manual override; when set it wins over tax_treatment.
  tax_treatment_override text
                           check (tax_treatment_override in ('taxable', 'tax_advantaged')),
  is_manual              boolean not null default false,
  is_debt                boolean not null default false,
  current_balance        numeric(18, 2),
  available_balance      numeric(18, 2),
  iso_currency           text not null default 'USD',
  mask                   text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index accounts_user_id_idx on public.accounts (user_id);
create index accounts_item_id_idx on public.accounts (item_id);
create unique index accounts_user_plaid_acct_uidx
  on public.accounts (user_id, plaid_account_id)
  where plaid_account_id is not null;

create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

-- ---------- securities (reference) ------------------------------------------

create table public.securities (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  plaid_security_id  text,
  ticker             text,
  name               text,
  security_type      text,
  sector             text,
  close_price        numeric(18, 6),
  close_price_as_of  date,
  iso_currency       text not null default 'USD',
  is_cash_equivalent boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index securities_user_id_idx on public.securities (user_id);
create unique index securities_user_plaid_sec_uidx
  on public.securities (user_id, plaid_security_id)
  where plaid_security_id is not null;

create trigger securities_set_updated_at
  before update on public.securities
  for each row execute function public.set_updated_at();

-- ---------- holdings ---------------------------------------------------------

create table public.holdings (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  account_id        uuid not null references public.accounts (id) on delete cascade,
  security_id       uuid not null references public.securities (id) on delete cascade,
  quantity          numeric(28, 10),
  cost_basis        numeric(18, 2),
  institution_price numeric(18, 6),
  institution_value numeric(18, 2),
  iso_currency      text not null default 'USD',
  as_of_date        date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index holdings_user_id_idx on public.holdings (user_id);
create unique index holdings_account_security_uidx
  on public.holdings (account_id, security_id);

create trigger holdings_set_updated_at
  before update on public.holdings
  for each row execute function public.set_updated_at();

-- ---------- transactions -----------------------------------------------------

create table public.transactions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  account_id           uuid not null references public.accounts (id) on delete cascade,
  plaid_transaction_id text unique,
  amount               numeric(18, 2),
  date                 date,
  name                 text,
  merchant_name        text,
  category             text,
  pending              boolean not null default false,
  created_at           timestamptz not null default now()
);

create index transactions_user_id_idx on public.transactions (user_id);
create index transactions_account_id_idx on public.transactions (account_id);

-- ---------- manual_assets ----------------------------------------------------
-- Home value + non-Plaid institutions (Solium Shareworks, Black Diamond 529)
-- and any manual debts.

create table public.manual_assets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  label       text not null,
  asset_class text not null
                check (asset_class in ('real_estate', 'equity_comp', '529', 'other')),
  -- 529 / equity_comp are tax-advantaged buckets; surfaced for net-worth math.
  tax_treatment text not null default 'taxable'
                  check (tax_treatment in ('taxable', 'tax_advantaged')),
  is_debt     boolean not null default false,
  value       numeric(18, 2) not null,
  as_of_date  date not null default current_date,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index manual_assets_user_id_idx on public.manual_assets (user_id);

create trigger manual_assets_set_updated_at
  before update on public.manual_assets
  for each row execute function public.set_updated_at();

-- ---------- net_worth_snapshots (Time Machine) ------------------------------

create table public.net_worth_snapshots (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  snapshot_date        date not null,
  total_assets         numeric(18, 2) not null default 0,
  total_debts          numeric(18, 2) not null default 0,
  net_worth            numeric(18, 2) not null default 0,
  investable_assets    numeric(18, 2) not null default 0,
  home_value           numeric(18, 2) not null default 0,
  taxable_total        numeric(18, 2) not null default 0,
  tax_advantaged_total numeric(18, 2) not null default 0,
  created_at           timestamptz not null default now()
);

create index net_worth_snapshots_user_id_idx on public.net_worth_snapshots (user_id);
create unique index net_worth_snapshots_user_date_uidx
  on public.net_worth_snapshots (user_id, snapshot_date);

-- ---------- daily_summaries --------------------------------------------------

create table public.daily_summaries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  summary_date date not null,
  content      text,
  drivers      jsonb not null default '{}'::jsonb,
  model        text,
  snapshot_id  uuid references public.net_worth_snapshots (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index daily_summaries_user_id_idx on public.daily_summaries (user_id);
create unique index daily_summaries_user_date_uidx
  on public.daily_summaries (user_id, summary_date);

-- =============================================================================
-- Row Level Security — owner-only access on every table.
-- =============================================================================

alter table public.profiles            enable row level security;
alter table public.plaid_items         enable row level security;
alter table public.accounts            enable row level security;
alter table public.securities          enable row level security;
alter table public.holdings            enable row level security;
alter table public.transactions        enable row level security;
alter table public.manual_assets       enable row level security;
alter table public.net_worth_snapshots enable row level security;
alter table public.daily_summaries     enable row level security;

-- profiles keyed on id (= auth.uid()); no insert policy (handled by trigger).
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- All other tables: full owner CRUD scoped to user_id.
do $$
declare
  t text;
begin
  foreach t in array array[
    'plaid_items', 'accounts', 'securities', 'holdings',
    'transactions', 'manual_assets', 'net_worth_snapshots', 'daily_summaries'
  ]
  loop
    execute format(
      'create policy %I on public.%I for all
         using (user_id = auth.uid()) with check (user_id = auth.uid());',
      t || '_owner_all', t
    );
  end loop;
end;
$$;
