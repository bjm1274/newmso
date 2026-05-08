-- Required operational feature tables restored on 2026-05-08.
-- Excludes nurse_schedules, insurance_records, and org_chart_nodes by product decision.

create extension if not exists pgcrypto;

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.report_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id text,
  report_type text not null,
  schedule_cron text,
  recipients jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  last_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.report_schedules add column if not exists company_id text;
alter table public.report_schedules add column if not exists report_type text;
alter table public.report_schedules add column if not exists schedule_cron text;
alter table public.report_schedules add column if not exists recipients jsonb not null default '[]'::jsonb;
alter table public.report_schedules add column if not exists enabled boolean not null default true;
alter table public.report_schedules add column if not exists last_generated_at timestamptz;
alter table public.report_schedules add column if not exists created_at timestamptz not null default now();
alter table public.report_schedules add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_report_schedules_enabled
  on public.report_schedules(enabled, report_type);

drop trigger if exists trg_report_schedules_updated_at on public.report_schedules;
create trigger trg_report_schedules_updated_at
before update on public.report_schedules
for each row
execute function public.set_row_updated_at();

create table if not exists public.generated_reports (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid,
  report_type text not null,
  period text not null,
  status text not null default 'completed',
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.generated_reports add column if not exists schedule_id uuid;
alter table public.generated_reports add column if not exists report_type text;
alter table public.generated_reports add column if not exists period text;
alter table public.generated_reports add column if not exists status text not null default 'completed';
alter table public.generated_reports add column if not exists summary jsonb not null default '{}'::jsonb;
alter table public.generated_reports add column if not exists created_at timestamptz not null default now();

create index if not exists idx_generated_reports_schedule_created
  on public.generated_reports(schedule_id, created_at desc);
create index if not exists idx_generated_reports_type_period
  on public.generated_reports(report_type, period);

create table if not exists public.virtual_account_deposits (
  id uuid primary key default gen_random_uuid(),
  company_id text,
  provider text not null default 'generic',
  dedupe_key text not null,
  provider_event_type text,
  provider_event_id text,
  order_id text,
  order_name text,
  payment_key text,
  transaction_key text,
  method text,
  deposit_status text not null default 'issued',
  match_status text not null default 'unmatched',
  amount numeric(14, 0) not null default 0,
  currency text not null default 'KRW',
  depositor_name text,
  customer_name text,
  patient_name text,
  patient_id text,
  transaction_label text,
  bank_code text,
  bank_name text,
  account_number text,
  due_date timestamptz,
  deposited_at timestamptz,
  matched_target_type text,
  matched_target_id text,
  matched_note text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.virtual_account_deposits add column if not exists company_id text;
alter table public.virtual_account_deposits add column if not exists provider text not null default 'generic';
alter table public.virtual_account_deposits add column if not exists dedupe_key text;
alter table public.virtual_account_deposits add column if not exists provider_event_type text;
alter table public.virtual_account_deposits add column if not exists provider_event_id text;
alter table public.virtual_account_deposits add column if not exists order_id text;
alter table public.virtual_account_deposits add column if not exists order_name text;
alter table public.virtual_account_deposits add column if not exists payment_key text;
alter table public.virtual_account_deposits add column if not exists transaction_key text;
alter table public.virtual_account_deposits add column if not exists method text;
alter table public.virtual_account_deposits add column if not exists deposit_status text not null default 'issued';
alter table public.virtual_account_deposits add column if not exists match_status text not null default 'unmatched';
alter table public.virtual_account_deposits add column if not exists amount numeric(14, 0) not null default 0;
alter table public.virtual_account_deposits add column if not exists currency text not null default 'KRW';
alter table public.virtual_account_deposits add column if not exists depositor_name text;
alter table public.virtual_account_deposits add column if not exists customer_name text;
alter table public.virtual_account_deposits add column if not exists patient_name text;
alter table public.virtual_account_deposits add column if not exists patient_id text;
alter table public.virtual_account_deposits add column if not exists transaction_label text;
alter table public.virtual_account_deposits add column if not exists bank_code text;
alter table public.virtual_account_deposits add column if not exists bank_name text;
alter table public.virtual_account_deposits add column if not exists account_number text;
alter table public.virtual_account_deposits add column if not exists due_date timestamptz;
alter table public.virtual_account_deposits add column if not exists deposited_at timestamptz;
alter table public.virtual_account_deposits add column if not exists matched_target_type text;
alter table public.virtual_account_deposits add column if not exists matched_target_id text;
alter table public.virtual_account_deposits add column if not exists matched_note text;
alter table public.virtual_account_deposits add column if not exists raw_payload jsonb not null default '{}'::jsonb;
alter table public.virtual_account_deposits add column if not exists created_at timestamptz not null default now();
alter table public.virtual_account_deposits add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_virtual_account_deposits_dedupe_key
  on public.virtual_account_deposits(dedupe_key);
create index if not exists idx_virtual_account_deposits_company_created_at
  on public.virtual_account_deposits(company_id, created_at desc);
create index if not exists idx_virtual_account_deposits_deposited_at
  on public.virtual_account_deposits(deposited_at desc);
create index if not exists idx_virtual_account_deposits_status
  on public.virtual_account_deposits(deposit_status, match_status);

drop trigger if exists trg_virtual_account_deposits_updated_at on public.virtual_account_deposits;
create trigger trg_virtual_account_deposits_updated_at
before update on public.virtual_account_deposits
for each row
execute function public.set_row_updated_at();

create table if not exists public.company_expenses (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  year_month text not null,
  rent numeric(14, 0) not null default 0,
  materials numeric(14, 0) not null default 0,
  utilities numeric(14, 0) not null default 0,
  others numeric(14, 0) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.company_expenses add column if not exists company text;
alter table public.company_expenses add column if not exists year_month text;
alter table public.company_expenses add column if not exists rent numeric(14, 0) not null default 0;
alter table public.company_expenses add column if not exists materials numeric(14, 0) not null default 0;
alter table public.company_expenses add column if not exists utilities numeric(14, 0) not null default 0;
alter table public.company_expenses add column if not exists others numeric(14, 0) not null default 0;
alter table public.company_expenses add column if not exists created_at timestamptz not null default now();
alter table public.company_expenses add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_company_expenses_company_month
  on public.company_expenses(company, year_month);

drop trigger if exists trg_company_expenses_updated_at on public.company_expenses;
create trigger trg_company_expenses_updated_at
before update on public.company_expenses
for each row
execute function public.set_row_updated_at();

create table if not exists public.access_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  user_name text,
  company text,
  menu text,
  action text,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.access_logs add column if not exists user_id text;
alter table public.access_logs add column if not exists user_name text;
alter table public.access_logs add column if not exists company text;
alter table public.access_logs add column if not exists menu text;
alter table public.access_logs add column if not exists action text;
alter table public.access_logs add column if not exists ip_address text;
alter table public.access_logs add column if not exists user_agent text;
alter table public.access_logs add column if not exists created_at timestamptz not null default now();

create index if not exists idx_access_logs_created_at
  on public.access_logs(created_at desc);
create index if not exists idx_access_logs_user_created_at
  on public.access_logs(user_id, created_at desc);
create index if not exists idx_access_logs_company_menu_created_at
  on public.access_logs(company, menu, created_at desc);

create table if not exists public.tax_reports (
  id uuid primary key default gen_random_uuid(),
  year text not null,
  company_name text,
  report_type text not null,
  report_date timestamptz,
  data jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tax_reports add column if not exists year text;
alter table public.tax_reports add column if not exists company_name text;
alter table public.tax_reports add column if not exists report_type text;
alter table public.tax_reports add column if not exists report_date timestamptz;
alter table public.tax_reports add column if not exists data jsonb not null default '[]'::jsonb;
alter table public.tax_reports add column if not exists status text not null default 'draft';
alter table public.tax_reports add column if not exists created_at timestamptz not null default now();
alter table public.tax_reports add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_tax_reports_year_company
  on public.tax_reports(year, company_name, report_type);

drop trigger if exists trg_tax_reports_updated_at on public.tax_reports;
create trigger trg_tax_reports_updated_at
before update on public.tax_reports
for each row
execute function public.set_row_updated_at();

create table if not exists public.retirement_pensions (
  id uuid primary key default gen_random_uuid(),
  staff_id text not null,
  staff_name text,
  pension_type text not null default 'unregistered',
  joined_date text,
  account_number text,
  fund_name text,
  monthly_contribution numeric(14, 0) not null default 0,
  total_accumulated numeric(14, 0) not null default 0,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.retirement_pensions add column if not exists staff_id text;
alter table public.retirement_pensions add column if not exists staff_name text;
alter table public.retirement_pensions add column if not exists pension_type text not null default 'unregistered';
alter table public.retirement_pensions add column if not exists joined_date text;
alter table public.retirement_pensions add column if not exists account_number text;
alter table public.retirement_pensions add column if not exists fund_name text;
alter table public.retirement_pensions add column if not exists monthly_contribution numeric(14, 0) not null default 0;
alter table public.retirement_pensions add column if not exists total_accumulated numeric(14, 0) not null default 0;
alter table public.retirement_pensions add column if not exists memo text;
alter table public.retirement_pensions add column if not exists created_at timestamptz not null default now();
alter table public.retirement_pensions add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_retirement_pensions_staff_id
  on public.retirement_pensions(staff_id);
create index if not exists idx_retirement_pensions_type
  on public.retirement_pensions(pension_type);

drop trigger if exists trg_retirement_pensions_updated_at on public.retirement_pensions;
create trigger trg_retirement_pensions_updated_at
before update on public.retirement_pensions
for each row
execute function public.set_row_updated_at();

create table if not exists public.inventory_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references public.inventory_categories(id) on delete cascade,
  description text,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.inventory_categories add column if not exists name text;
alter table public.inventory_categories add column if not exists parent_id uuid;
alter table public.inventory_categories add column if not exists description text;
alter table public.inventory_categories add column if not exists color text;
alter table public.inventory_categories add column if not exists created_at timestamptz not null default now();
alter table public.inventory_categories add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_inventory_categories_parent_id
  on public.inventory_categories(parent_id);
create unique index if not exists idx_inventory_categories_parent_name
  on public.inventory_categories(coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

drop trigger if exists trg_inventory_categories_updated_at on public.inventory_categories;
create trigger trg_inventory_categories_updated_at
before update on public.inventory_categories
for each row
execute function public.set_row_updated_at();
