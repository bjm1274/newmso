-- Safe Supabase SQL Editor apply script for:
-- supabase_migrations/20260423_z_inventory_scope_accounting_closing_rls.sql
--
-- Run this after docs/supabase_inventory_procurement_apply.sql.
-- This version intentionally splits multi-column ALTER statements and
-- separates FOR ALL policies into INSERT/UPDATE/DELETE policies.
-- It also avoids dollar-quoted function bodies because some SQL Editor
-- paste/run modes can split those blocks and raise "no function body specified".

create or replace function public.erp_claim_text(claim_key text)
returns text
language sql
stable
as 'select nullif(btrim(coalesce(auth.jwt() ->> claim_key, '''')), '''')';

create or replace function public.erp_company_name()
returns text
language sql
stable
as 'select public.erp_claim_text(''erp_company_name'')';

create or replace function public.erp_department_name()
returns text
language sql
stable
as 'select public.erp_claim_text(''erp_department_name'')';

create or replace function public.erp_claim_bool(claim_key text)
returns boolean
language sql
stable
as 'select coalesce(nullif(auth.jwt() ->> claim_key, '''')::boolean, false)';

create or replace function public.erp_can_view_all_department_inventory()
returns boolean
language sql
stable
as 'select public.erp_claim_bool(''erp_can_view_all_department_inventory'')';

create or replace function public.erp_can_manage_department_inventory()
returns boolean
language sql
stable
as 'select public.erp_claim_bool(''erp_can_manage_department_inventory'')';

create or replace function public.erp_can_view_all_inventory_companies()
returns boolean
language sql
stable
as 'select public.erp_claim_bool(''erp_can_view_all_inventory_companies'')';

create or replace function public.erp_can_manage_all_inventory_companies()
returns boolean
language sql
stable
as 'select public.erp_claim_bool(''erp_can_manage_all_inventory_companies'')';

create or replace function public.erp_inventory_company_scope_matches(
  target_company text,
  target_company_id uuid
)
returns boolean
language sql
stable
as 'select
    public.erp_can_view_all_inventory_companies()
    or (
      public.erp_company_id() is not null
      and target_company_id is not null
      and public.erp_company_id() = target_company_id
    )
    or (
      public.erp_company_name() is not null
      and nullif(btrim(coalesce(target_company, '''')), '''') is not null
      and lower(public.erp_company_name()) = lower(btrim(target_company))
    )';

create or replace function public.erp_inventory_scope_matches(
  target_company text,
  target_company_id uuid,
  target_department text
)
returns boolean
language sql
stable
as 'select
    public.erp_can_view_all_inventory_companies()
    or (
      public.erp_inventory_company_scope_matches(target_company, target_company_id)
      and (
        public.erp_can_view_all_department_inventory()
        or nullif(btrim(coalesce(target_department, '''')), '''') is null
        or (
          public.erp_department_name() is not null
          and lower(public.erp_department_name()) = lower(btrim(target_department))
        )
      )
    )';

alter table if exists public.inventory_logs
  add column if not exists department text;

alter table if exists public.inventory_count_sessions
  add column if not exists company text;

alter table if exists public.inventory_count_sessions
  add column if not exists company_id uuid references public.companies(id) on delete set null;

alter table if exists public.inventory_count_sessions
  add column if not exists department text;

update public.inventory_logs as l
set department = i.department
from public.inventory as i
where l.department is null
  and coalesce(l.inventory_id, l.item_id) = i.id
  and nullif(btrim(coalesce(i.department, '')), '') is not null;

create index if not exists idx_inventory_company_department
  on public.inventory(company_id, department);

create index if not exists idx_inventory_logs_scope_created_at
  on public.inventory_logs(company_id, department, created_at desc);

create index if not exists idx_inventory_count_sessions_scope_created_at
  on public.inventory_count_sessions(company_id, department, created_at desc);

alter table if exists public.inventory enable row level security;
alter table if exists public.inventory_logs enable row level security;
alter table if exists public.inventory_transfers enable row level security;
alter table if exists public.purchase_orders enable row level security;
alter table if exists public.delivery_confirmations enable row level security;
alter table if exists public.inventory_price_history enable row level security;
alter table if exists public.inventory_count_sessions enable row level security;
alter table if exists public.inventory_cost_entries enable row level security;
alter table if exists public.inventory_closing_snapshots enable row level security;

drop policy if exists inventory_select_scope on public.inventory;
drop policy if exists inventory_insert_scope on public.inventory;
drop policy if exists inventory_update_scope on public.inventory;
drop policy if exists inventory_delete_scope on public.inventory;

create policy inventory_select_scope on public.inventory
for select
using (public.erp_inventory_scope_matches(company, company_id, department));

create policy inventory_insert_scope on public.inventory
for insert
with check (
  public.erp_can_manage_all_inventory_companies()
  or (
    public.erp_can_manage_department_inventory()
    and public.erp_inventory_scope_matches(company, company_id, department)
  )
);

create policy inventory_update_scope on public.inventory
for update
using (public.erp_inventory_scope_matches(company, company_id, department))
with check (
  public.erp_can_manage_all_inventory_companies()
  or (
    public.erp_can_manage_department_inventory()
    and public.erp_inventory_scope_matches(company, company_id, department)
  )
);

create policy inventory_delete_scope on public.inventory
for delete
using (public.erp_can_manage_all_inventory_companies());

drop policy if exists inventory_logs_select_scope on public.inventory_logs;
drop policy if exists inventory_logs_insert_scope on public.inventory_logs;

create policy inventory_logs_select_scope on public.inventory_logs
for select
using (public.erp_inventory_scope_matches(company, company_id, department));

create policy inventory_logs_insert_scope on public.inventory_logs
for insert
with check (public.erp_inventory_scope_matches(company, company_id, department));

drop policy if exists inventory_transfers_select_scope on public.inventory_transfers;
drop policy if exists inventory_transfers_insert_scope on public.inventory_transfers;

create policy inventory_transfers_select_scope on public.inventory_transfers
for select
using (
  public.erp_inventory_scope_matches(from_company, null, from_department)
  or public.erp_inventory_scope_matches(to_company, null, to_department)
);

create policy inventory_transfers_insert_scope on public.inventory_transfers
for insert
with check (
  public.erp_inventory_scope_matches(from_company, null, from_department)
  and public.erp_inventory_scope_matches(to_company, null, to_department)
);

drop policy if exists purchase_orders_select_scope on public.purchase_orders;
drop policy if exists purchase_orders_write_scope on public.purchase_orders;
drop policy if exists purchase_orders_insert_scope on public.purchase_orders;
drop policy if exists purchase_orders_update_scope on public.purchase_orders;
drop policy if exists purchase_orders_delete_scope on public.purchase_orders;

create policy purchase_orders_select_scope on public.purchase_orders
for select
using (
  public.erp_can_view_all_inventory_companies()
  or public.erp_inventory_scope_matches(requester_company, null, requester_department)
);

create policy purchase_orders_insert_scope on public.purchase_orders
for insert
with check (
  public.erp_can_manage_all_inventory_companies()
  or public.erp_inventory_scope_matches(requester_company, null, requester_department)
);

create policy purchase_orders_update_scope on public.purchase_orders
for update
using (
  public.erp_can_manage_all_inventory_companies()
  or public.erp_inventory_scope_matches(requester_company, null, requester_department)
)
with check (
  public.erp_can_manage_all_inventory_companies()
  or public.erp_inventory_scope_matches(requester_company, null, requester_department)
);

create policy purchase_orders_delete_scope on public.purchase_orders
for delete
using (public.erp_can_manage_all_inventory_companies());

drop policy if exists delivery_confirmations_select_scope on public.delivery_confirmations;
drop policy if exists delivery_confirmations_write_scope on public.delivery_confirmations;
drop policy if exists delivery_confirmations_insert_scope on public.delivery_confirmations;
drop policy if exists delivery_confirmations_update_scope on public.delivery_confirmations;
drop policy if exists delivery_confirmations_delete_scope on public.delivery_confirmations;

create policy delivery_confirmations_select_scope on public.delivery_confirmations
for select
using (public.erp_inventory_company_scope_matches(receiver_company, null));

create policy delivery_confirmations_insert_scope on public.delivery_confirmations
for insert
with check (public.erp_inventory_company_scope_matches(receiver_company, null));

create policy delivery_confirmations_update_scope on public.delivery_confirmations
for update
using (public.erp_inventory_company_scope_matches(receiver_company, null))
with check (public.erp_inventory_company_scope_matches(receiver_company, null));

create policy delivery_confirmations_delete_scope on public.delivery_confirmations
for delete
using (public.erp_can_manage_all_inventory_companies());

drop policy if exists inventory_price_history_select_scope on public.inventory_price_history;
drop policy if exists inventory_price_history_insert_scope on public.inventory_price_history;

create policy inventory_price_history_select_scope on public.inventory_price_history
for select
using (
  exists (
    select 1
    from public.inventory as i
    where i.id = inventory_price_history.inventory_item_id
      and public.erp_inventory_scope_matches(i.company, i.company_id, i.department)
  )
);

create policy inventory_price_history_insert_scope on public.inventory_price_history
for insert
with check (
  exists (
    select 1
    from public.inventory as i
    where i.id = inventory_price_history.inventory_item_id
      and public.erp_inventory_scope_matches(i.company, i.company_id, i.department)
  )
);

drop policy if exists inventory_count_sessions_select_scope on public.inventory_count_sessions;
drop policy if exists inventory_count_sessions_insert_scope on public.inventory_count_sessions;

create policy inventory_count_sessions_select_scope on public.inventory_count_sessions
for select
using (public.erp_inventory_scope_matches(company, company_id, department));

create policy inventory_count_sessions_insert_scope on public.inventory_count_sessions
for insert
with check (public.erp_inventory_scope_matches(company, company_id, department));

drop policy if exists inventory_cost_entries_select_scope on public.inventory_cost_entries;
drop policy if exists inventory_cost_entries_insert_scope on public.inventory_cost_entries;

create policy inventory_cost_entries_select_scope on public.inventory_cost_entries
for select
using (public.erp_inventory_scope_matches(company_name, company_id, department));

create policy inventory_cost_entries_insert_scope on public.inventory_cost_entries
for insert
with check (public.erp_inventory_scope_matches(company_name, company_id, department));

drop policy if exists inventory_closing_snapshots_select_scope on public.inventory_closing_snapshots;
drop policy if exists inventory_closing_snapshots_insert_scope on public.inventory_closing_snapshots;

create policy inventory_closing_snapshots_select_scope on public.inventory_closing_snapshots
for select
using (public.erp_inventory_company_scope_matches(company, company_id));

create policy inventory_closing_snapshots_insert_scope on public.inventory_closing_snapshots
for insert
with check (public.erp_inventory_company_scope_matches(company, company_id));
