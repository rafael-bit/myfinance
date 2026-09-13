create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  primary_currency text not null default 'BRL',
  locale text not null default 'pt-BR',
  timezone text not null default 'America/Sao_Paulo',
  created_at text not null,
  updated_at text not null
);

create table if not exists public.settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value text not null,
  unique(user_id, key)
);

create table if not exists public.currencies (
  code text primary key,
  name text not null,
  symbol text not null,
  decimal_places integer not null,
  active integer not null default 1
);

create table if not exists public.fx_rates (
  id text primary key,
  base text not null,
  quote text not null,
  rate_unscaled text not null,
  scale integer not null,
  as_of text not null,
  source text not null
);

create table if not exists public.institutions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  version integer not null default 1,
  device_id text not null default 'cloud',
  name text not null,
  type text not null,
  country text not null default 'BR',
  external_code text
);

create table if not exists public.accounts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  version integer not null default 1,
  device_id text not null default 'cloud',
  institution_id text,
  name text not null,
  type text not null,
  currency text not null,
  initial_balance_minor integer not null default 0,
  stated_balance_minor integer,
  include_in_net_worth integer not null default 1,
  status text not null default 'active',
  system integer not null default 0,
  notes text,
  external_id text
);

create table if not exists public.categories (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  version integer not null default 1,
  device_id text not null default 'cloud',
  name text not null,
  kind text not null,
  parent_id text,
  icon text,
  color text,
  active integer not null default 1,
  system integer not null default 0
);

create table if not exists public.tags (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  version integer not null default 1,
  device_id text not null default 'cloud',
  name text not null,
  color text
);

create table if not exists public.transactions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  version integer not null default 1,
  device_id text not null default 'cloud',
  type text not null,
  status text not null default 'cleared',
  description text not null,
  payee text,
  date text not null,
  competency_date text not null,
  account_id text not null,
  counterparty_account_id text,
  category_id text,
  card_id text,
  invoice_id text,
  recurrence_id text,
  installment_plan_id text,
  installment_number integer,
  notes text,
  origin text not null default 'manual',
  external_id text,
  idempotency_key text not null,
  unique(user_id, idempotency_key)
);

create table if not exists public.postings (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  version integer not null default 1,
  device_id text not null default 'cloud',
  transaction_id text not null,
  account_id text not null,
  amount_minor integer not null,
  currency text not null,
  fx_rate_id text
);

create table if not exists public.transaction_tags (
  transaction_id text not null,
  tag_id text not null,
  unique(transaction_id, tag_id)
);

create table if not exists public.recurrence_rules (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  version integer not null default 1,
  device_id text not null default 'cloud',
  template_json text not null,
  freq text not null,
  interval integer not null default 1,
  by_month_day integer,
  start_date text not null,
  end_date text,
  auto_generate integer not null default 1,
  generate_days_ahead integer not null default 60,
  last_generated_date text
);

create table if not exists public.installment_plans (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  version integer not null default 1,
  device_id text not null default 'cloud',
  total_minor integer not null,
  installments_count integer not null,
  first_date text not null,
  last_date text not null,
  description text not null,
  card_id text
);

create table if not exists public.credit_cards (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  version integer not null default 1,
  device_id text not null default 'cloud',
  account_id text not null,
  name text not null,
  limit_minor integer not null,
  closing_day integer not null,
  due_day integer not null,
  payment_account_id text,
  currency text not null,
  status text not null default 'active'
);

create table if not exists public.credit_card_invoices (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  version integer not null default 1,
  device_id text not null default 'cloud',
  card_id text not null,
  period_start text not null,
  period_end text not null,
  closing_date text not null,
  due_date text not null,
  status text not null default 'open',
  paid_minor integer not null default 0
);

create table if not exists public.instruments (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  version integer not null default 1,
  device_id text not null default 'cloud',
  symbol text not null,
  name text not null,
  class text not null,
  currency text not null,
  exchange text,
  metadata text
);

create table if not exists public.investment_events (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  version integer not null default 1,
  device_id text not null default 'cloud',
  custody_account_id text not null,
  instrument_id text not null,
  type text not null,
  date text not null,
  quantity_unscaled integer not null default 0,
  quantity_scale integer not null default 0,
  price_minor integer not null default 0,
  amount_minor integer not null,
  linked_transaction_id text
);

create table if not exists public.properties (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  version integer not null default 1,
  device_id text not null default 'cloud',
  kind text not null,
  name text not null,
  currency text not null,
  current_value_minor integer not null,
  valuation_date text not null,
  linked_liability_id text
);

create table if not exists public.liabilities (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  version integer not null default 1,
  device_id text not null default 'cloud',
  kind text not null,
  account_id text not null,
  name text not null,
  principal_minor integer not null,
  rate text,
  indexer text,
  due_date text
);

create table if not exists public.net_worth_snapshots (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  version integer not null default 1,
  device_id text not null default 'cloud',
  year_month text not null,
  gross_minor integer not null,
  debts_minor integer not null,
  net_minor integer not null,
  unique(user_id, year_month)
);

create table if not exists public.goals (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  version integer not null default 1,
  device_id text not null default 'cloud',
  name text not null,
  kind text not null,
  target_minor integer not null,
  current_minor integer not null default 0,
  target_date text not null,
  linked_account_id text,
  status text not null default 'active'
);

create table if not exists public.goal_contributions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  version integer not null default 1,
  device_id text not null default 'cloud',
  goal_id text not null,
  amount_minor integer not null,
  date text not null,
  transaction_id text
);

create table if not exists public.budgets (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  version integer not null default 1,
  device_id text not null default 'cloud',
  category_id text not null,
  year_month text not null,
  limit_minor integer not null,
  unique(user_id, category_id, year_month)
);

create table if not exists public.investor_questions (
  id text primary key,
  questionnaire_version integer not null,
  dimension text not null,
  text text not null,
  weight integer not null,
  options_json text not null
);

create table if not exists public.investor_questionnaires (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  version integer not null default 1,
  device_id text not null default 'cloud',
  questionnaire_version integer not null,
  completed_at text not null
);

create table if not exists public.investor_answers (
  id text primary key,
  questionnaire_id text not null,
  question_id text not null,
  value integer not null
);

create table if not exists public.investor_profiles (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  version integer not null default 1,
  device_id text not null default 'cloud',
  questionnaire_id text not null,
  band text not null,
  score integer not null,
  justification text not null,
  computed_at text not null
);

create table if not exists public.portfolio_analyses (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  version integer not null default 1,
  device_id text not null default 'cloud',
  input_hash text not null,
  result_json text not null
);

create table if not exists public.recommendations (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  version integer not null default 1,
  device_id text not null default 'cloud',
  input_hash text not null,
  result_json text not null
);

create table if not exists public.categorization_rules (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  version integer not null default 1,
  device_id text not null default 'cloud',
  pattern text not null,
  match_type text not null,
  category_id text not null,
  priority integer not null default 0,
  learned_from text not null default 'user'
);

create table if not exists public.import_jobs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  version integer not null default 1,
  device_id text not null default 'cloud',
  source text not null,
  status text not null,
  file_hash text not null,
  file_name text not null
);

create table if not exists public.import_items (
  id text primary key,
  job_id text not null,
  raw_json text not null,
  suggested_json text,
  duplicate_of text,
  decision text not null default 'pending'
);

create table if not exists public.market_quotes (
  id text primary key,
  code text not null,
  price text not null,
  as_of text not null,
  source text not null,
  unique(code, as_of, source)
);

create table if not exists public.notifications (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  version integer not null default 1,
  device_id text not null default 'cloud',
  type text not null,
  title text not null,
  body text not null,
  payload text,
  read_at text,
  scheduled_for text not null
);

create table if not exists public.audit_log (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entity text not null,
  entity_id text not null,
  action text not null,
  before_json text,
  after_json text,
  at text not null
);

create table if not exists public.dashboard_layouts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  widgets_json text not null,
  updated_at text not null
);

create table if not exists public.external_connections (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  version integer not null default 1,
  device_id text not null default 'cloud',
  provider text not null,
  status text not null,
  consent_expires_at text,
  last_sync_at text
);

create table if not exists public.external_transactions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  version integer not null default 1,
  device_id text not null default 'cloud',
  connection_id text not null,
  external_id text not null,
  date text not null,
  description text not null,
  amount_minor integer not null,
  accepted_at text
);

create table if not exists public.devices (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at text not null,
  last_seen_at text not null
);

create table if not exists public.sync_outbox (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entity text not null,
  entity_id text not null,
  action text not null,
  payload text not null,
  idempotency_key text not null,
  created_at text not null,
  attempts integer not null default 0,
  last_error text,
  synced_at text
);

create table if not exists public.sync_conflicts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entity text not null,
  entity_id text not null,
  local_json text not null,
  remote_json text not null,
  fields_json text not null,
  resolved_at text,
  created_at text not null
);

create table if not exists public.sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cursor text,
  last_pulled_at text,
  last_pushed_at text,
  last_error text
);

create index if not exists idx_txn_user_date on public.transactions(user_id, date);
create index if not exists idx_postings_account on public.postings(account_id);
create index if not exists idx_postings_txn on public.postings(transaction_id);
create index if not exists idx_accounts_user on public.accounts(user_id);

-- Seed global currencies
insert into public.currencies (code, name, symbol, decimal_places, active) values
  ('BRL', 'Real brasileiro', 'R$', 2, 1),
  ('USD', 'Dólar americano', 'US$', 2, 1),
  ('EUR', 'Euro', '€', 2, 1),
  ('GBP', 'Libra esterlina', '£', 2, 1),
  ('BTC', 'Bitcoin', '₿', 8, 1)
on conflict (code) do nothing;

-- RLS helpers
create or replace function public.is_owner(uid uuid)
returns boolean
language sql
stable
as $$
  select auth.uid() = uid;
$$;

alter table public.users enable row level security;
alter table public.settings enable row level security;
alter table public.currencies enable row level security;
alter table public.fx_rates enable row level security;
alter table public.institutions enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.tags enable row level security;
alter table public.transactions enable row level security;
alter table public.postings enable row level security;
alter table public.transaction_tags enable row level security;
alter table public.recurrence_rules enable row level security;
alter table public.installment_plans enable row level security;
alter table public.credit_cards enable row level security;
alter table public.credit_card_invoices enable row level security;
alter table public.instruments enable row level security;
alter table public.investment_events enable row level security;
alter table public.properties enable row level security;
alter table public.liabilities enable row level security;
alter table public.net_worth_snapshots enable row level security;
alter table public.goals enable row level security;
alter table public.goal_contributions enable row level security;
alter table public.budgets enable row level security;
alter table public.investor_questions enable row level security;
alter table public.investor_questionnaires enable row level security;
alter table public.investor_answers enable row level security;
alter table public.investor_profiles enable row level security;
alter table public.portfolio_analyses enable row level security;
alter table public.recommendations enable row level security;
alter table public.categorization_rules enable row level security;
alter table public.import_jobs enable row level security;
alter table public.import_items enable row level security;
alter table public.market_quotes enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;
alter table public.dashboard_layouts enable row level security;
alter table public.external_connections enable row level security;
alter table public.external_transactions enable row level security;
alter table public.devices enable row level security;
alter table public.sync_outbox enable row level security;
alter table public.sync_conflicts enable row level security;
alter table public.sync_state enable row level security;

-- Drop existing policies if re-applying
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

create policy users_own on public.users for all using (id = auth.uid()) with check (id = auth.uid());
create policy settings_own on public.settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy currencies_read on public.currencies for select using (true);
create policy currencies_write on public.currencies for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy fx_rates_auth on public.fx_rates for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy institutions_own on public.institutions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy accounts_own on public.accounts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy categories_own on public.categories for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy tags_own on public.tags for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy transactions_own on public.transactions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy postings_own on public.postings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy transaction_tags_auth on public.transaction_tags for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy recurrence_own on public.recurrence_rules for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy installments_own on public.installment_plans for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cards_own on public.credit_cards for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy invoices_own on public.credit_card_invoices for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy instruments_own on public.instruments for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy investment_events_own on public.investment_events for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy properties_own on public.properties for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy liabilities_own on public.liabilities for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy nw_own on public.net_worth_snapshots for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy goals_own on public.goals for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy goal_contrib_own on public.goal_contributions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy budgets_own on public.budgets for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy investor_questions_read on public.investor_questions for select using (true);
create policy questionnaires_own on public.investor_questionnaires for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy investor_answers_auth on public.investor_answers for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy profiles_own on public.investor_profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy analyses_own on public.portfolio_analyses for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy recommendations_own on public.recommendations for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cat_rules_own on public.categorization_rules for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy import_jobs_own on public.import_jobs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy import_items_via_job on public.import_items for all using (
  exists (select 1 from public.import_jobs j where j.id = job_id and j.user_id = auth.uid())
) with check (
  exists (select 1 from public.import_jobs j where j.id = job_id and j.user_id = auth.uid())
);
create policy market_quotes_auth on public.market_quotes for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy notifications_own on public.notifications for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy audit_own on public.audit_log for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy dashboard_own on public.dashboard_layouts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ext_conn_own on public.external_connections for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ext_txn_own on public.external_transactions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy devices_own on public.devices for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy outbox_own on public.sync_outbox for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy conflicts_own on public.sync_conflicts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy sync_state_own on public.sync_state for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Signup trigger: profile + system accounts + categories + settings + dashboard
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  at text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  display text := coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'Usuário');
  currency text := coalesce(new.raw_user_meta_data->>'currency', 'BRL');
  cat record;
begin
  insert into public.users (id, display_name, primary_currency, locale, timezone, created_at, updated_at)
  values (new.id, display, currency, 'pt-BR', 'America/Sao_Paulo', at, at)
  on conflict (id) do nothing;

  insert into public.dashboard_layouts (user_id, widgets_json, updated_at)
  values (new.id, '["networth","cashflow","budget","goals","alerts","investments"]', at)
  on conflict (user_id) do nothing;

  insert into public.settings (user_id, key, value) values
    (new.id, 'theme', 'system'),
    (new.id, 'decimalSeparator', ','),
    (new.id, 'thousandSeparator', '.')
  on conflict (user_id, key) do nothing;

  insert into public.accounts (id, user_id, created_at, updated_at, version, device_id, name, type, currency, system, include_in_net_worth, status, initial_balance_minor)
  values
    ('sys-income', new.id, at, at, 1, 'cloud', 'Receitas', 'other', currency, 1, 0, 'active', 0),
    ('sys-expense', new.id, at, at, 1, 'cloud', 'Despesas', 'other', currency, 1, 0, 'active', 0),
    ('sys-equity', new.id, at, at, 1, 'cloud', 'Patrimônio inicial', 'other', currency, 1, 0, 'active', 0)
  on conflict (id) do nothing;

  -- Note: system account ids collide across users if global PK — use per-user ids
  -- Fixed below by using user-prefixed system ids in a corrective update path.
  return new;
end;
$$;

-- Fix: system accounts must be unique per user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  at text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  display text := coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'Usuário');
  currency text := coalesce(new.raw_user_meta_data->>'currency', 'BRL');
begin
  insert into public.users (id, display_name, primary_currency, locale, timezone, created_at, updated_at)
  values (new.id, display, currency, 'pt-BR', 'America/Sao_Paulo', at, at)
  on conflict (id) do nothing;

  insert into public.dashboard_layouts (user_id, widgets_json, updated_at)
  values (new.id, '["networth","cashflow","budget","goals","alerts","investments"]', at)
  on conflict (user_id) do nothing;

  insert into public.settings (user_id, key, value) values
    (new.id, 'theme', 'system'),
    (new.id, 'decimalSeparator', ','),
    (new.id, 'thousandSeparator', '.')
  on conflict (user_id, key) do nothing;

  insert into public.accounts (id, user_id, created_at, updated_at, version, device_id, name, type, currency, system, include_in_net_worth, status, initial_balance_minor)
  values
    (new.id::text || ':sys-income', new.id, at, at, 1, 'cloud', 'Receitas', 'other', currency, 1, 0, 'active', 0),
    (new.id::text || ':sys-expense', new.id, at, at, 1, 'cloud', 'Despesas', 'other', currency, 1, 0, 'active', 0),
    (new.id::text || ':sys-equity', new.id, at, at, 1, 'cloud', 'Patrimônio inicial', 'other', currency, 1, 0, 'active', 0)
  on conflict (id) do nothing;

  insert into public.categories (id, user_id, created_at, updated_at, version, device_id, name, kind, icon, color, active, system)
  values
    (gen_random_uuid()::text, new.id, at, at, 1, 'cloud', 'Salário', 'income', 'wallet', '#0f766e', 1, 1),
    (gen_random_uuid()::text, new.id, at, at, 1, 'cloud', 'Freelance', 'income', 'briefcase', '#0369a1', 1, 1),
    (gen_random_uuid()::text, new.id, at, at, 1, 'cloud', 'Rendimentos', 'income', 'trending-up', '#4f46e5', 1, 1),
    (gen_random_uuid()::text, new.id, at, at, 1, 'cloud', 'Outras receitas', 'income', 'plus', '#64748b', 1, 1),
    (gen_random_uuid()::text, new.id, at, at, 1, 'cloud', 'Moradia', 'expense', 'home', '#b45309', 1, 1),
    (gen_random_uuid()::text, new.id, at, at, 1, 'cloud', 'Mercado', 'expense', 'shopping-cart', '#c2410c', 1, 1),
    (gen_random_uuid()::text, new.id, at, at, 1, 'cloud', 'Transporte', 'expense', 'car', '#0369a1', 1, 1),
    (gen_random_uuid()::text, new.id, at, at, 1, 'cloud', 'Saúde', 'expense', 'heart', '#be123c', 1, 1),
    (gen_random_uuid()::text, new.id, at, at, 1, 'cloud', 'Educação', 'expense', 'book', '#7c3aed', 1, 1),
    (gen_random_uuid()::text, new.id, at, at, 1, 'cloud', 'Lazer', 'expense', 'sparkles', '#0f766e', 1, 1),
    (gen_random_uuid()::text, new.id, at, at, 1, 'cloud', 'Assinaturas', 'expense', 'repeat', '#334155', 1, 1),
    (gen_random_uuid()::text, new.id, at, at, 1, 'cloud', 'Contas', 'expense', 'file-text', '#57534e', 1, 1),
    (gen_random_uuid()::text, new.id, at, at, 1, 'cloud', 'Despesas pessoais', 'expense', 'user', '#7c2d12', 1, 1),
    (gen_random_uuid()::text, new.id, at, at, 1, 'cloud', 'Outras despesas', 'expense', 'more-horizontal', '#64748b', 1, 1);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Atomic ledger write
create or replace function public.create_transaction(
  p_id text,
  p_type text,
  p_status text,
  p_description text,
  p_payee text,
  p_date text,
  p_competency_date text,
  p_account_id text,
  p_counterparty_account_id text,
  p_category_id text,
  p_card_id text,
  p_invoice_id text,
  p_recurrence_id text,
  p_installment_plan_id text,
  p_installment_number integer,
  p_notes text,
  p_origin text,
  p_external_id text,
  p_idempotency_key text,
  p_postings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  at text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  existing text;
  posting jsonb;
  posting_id text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select id into existing
  from public.transactions
  where user_id = uid and idempotency_key = p_idempotency_key
  limit 1;

  if existing is not null then
    return jsonb_build_object('id', existing, 'duplicate', true);
  end if;

  insert into public.transactions (
    id, user_id, created_at, updated_at, version, device_id,
    type, status, description, payee, date, competency_date,
    account_id, counterparty_account_id, category_id, card_id, invoice_id,
    recurrence_id, installment_plan_id, installment_number, notes,
    origin, external_id, idempotency_key
  ) values (
    p_id, uid, at, at, 1, 'cloud',
    p_type, coalesce(p_status, 'cleared'), p_description, p_payee, p_date, coalesce(p_competency_date, p_date),
    p_account_id, p_counterparty_account_id, p_category_id, p_card_id, p_invoice_id,
    p_recurrence_id, p_installment_plan_id, p_installment_number, p_notes,
    coalesce(p_origin, 'manual'), p_external_id, p_idempotency_key
  );

  for posting in select * from jsonb_array_elements(p_postings)
  loop
    posting_id := coalesce(posting->>'id', gen_random_uuid()::text);
    insert into public.postings (
      id, user_id, created_at, updated_at, version, device_id,
      transaction_id, account_id, amount_minor, currency
    ) values (
      posting_id, uid, at, at, 1, 'cloud',
      p_id,
      posting->>'accountId',
      (posting->>'amountMinor')::integer,
      posting->>'currency'
    );
  end loop;

  insert into public.audit_log (id, user_id, entity, entity_id, action, after_json, at)
  values (gen_random_uuid()::text, uid, 'transaction', p_id, 'create', p_postings::text, at);

  return jsonb_build_object('id', p_id, 'duplicate', false);
end;
$$;

grant execute on function public.create_transaction to authenticated;
