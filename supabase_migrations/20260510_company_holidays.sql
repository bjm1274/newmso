create table if not exists public.company_holidays (
  id uuid primary key default gen_random_uuid(),
  company_name text not null default '전체',
  holiday_date date not null,
  name text not null,
  note text,
  created_by text,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_holidays_company_date_unique unique (company_name, holiday_date)
);

create index if not exists idx_company_holidays_scope_date
  on public.company_holidays(company_name, holiday_date);

alter table public.company_holidays enable row level security;

drop policy if exists company_holidays_select on public.company_holidays;
drop policy if exists company_holidays_insert on public.company_holidays;
drop policy if exists company_holidays_update on public.company_holidays;
drop policy if exists company_holidays_delete on public.company_holidays;

create policy company_holidays_select
on public.company_holidays
for select
using (auth.uid() is not null);

create policy company_holidays_insert
on public.company_holidays
for insert
with check (public.erp_is_admin() or public.erp_can_manage_company());

create policy company_holidays_update
on public.company_holidays
for update
using (public.erp_is_admin() or public.erp_can_manage_company())
with check (public.erp_is_admin() or public.erp_can_manage_company());

create policy company_holidays_delete
on public.company_holidays
for delete
using (public.erp_is_admin() or public.erp_can_manage_company());
