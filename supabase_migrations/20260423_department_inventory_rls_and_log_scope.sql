create or replace function public.erp_claim_text(claim_key text)
returns text
language sql
stable
as $$
  select nullif(btrim(coalesce(auth.jwt() ->> claim_key, '')), '')
$$;

create or replace function public.erp_company_name()
returns text
language sql
stable
as $$
  select public.erp_claim_text('erp_company_name')
$$;

create or replace function public.erp_department_name()
returns text
language sql
stable
as $$
  select public.erp_claim_text('erp_department_name')
$$;

create or replace function public.erp_can_view_all_department_inventory()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'erp_can_view_all_department_inventory')::boolean, false)
$$;

create or replace function public.erp_department_inventory_scope_matches(
  target_company text,
  target_company_id uuid,
  target_department text
)
returns boolean
language sql
stable
as $$
  select
    public.erp_is_admin()
    or (
      (
        (
          public.erp_company_id() is not null
          and target_company_id is not null
          and public.erp_company_id() = target_company_id
        )
        or (
          public.erp_company_name() is not null
          and nullif(btrim(coalesce(target_company, '')), '') is not null
          and lower(public.erp_company_name()) = lower(btrim(target_company))
        )
      )
      and (
        public.erp_can_view_all_department_inventory()
        or (
          public.erp_department_name() is not null
          and nullif(btrim(coalesce(target_department, '')), '') is not null
          and lower(public.erp_department_name()) = lower(btrim(target_department))
        )
      )
    )
$$;

alter table if exists public.inventory_logs
  add column if not exists department text;

update public.inventory_logs as l
set department = i.department
from public.inventory as i
where l.department is null
  and coalesce(l.inventory_id, l.item_id) = i.id
  and nullif(btrim(coalesce(i.department, '')), '') is not null;

create index if not exists idx_inventory_logs_company_department_created_at
  on public.inventory_logs(company_id, department, created_at desc);

drop trigger if exists department_private_inventory_logs_scope_sync
  on public.department_private_inventory_logs;

drop function if exists public.department_private_inventory_log_scope_sync();

alter table public.department_private_inventory_items enable row level security;
alter table public.department_private_inventory_logs enable row level security;

drop policy if exists department_private_inventory_items_select_scope on public.department_private_inventory_items;
drop policy if exists department_private_inventory_items_insert_scope on public.department_private_inventory_items;
drop policy if exists department_private_inventory_items_update_scope on public.department_private_inventory_items;
drop policy if exists department_private_inventory_items_delete_scope on public.department_private_inventory_items;

create policy department_private_inventory_items_select_scope
on public.department_private_inventory_items
for select
using (public.erp_department_inventory_scope_matches(company, company_id, department));

create policy department_private_inventory_items_insert_scope
on public.department_private_inventory_items
for insert
with check (public.erp_department_inventory_scope_matches(company, company_id, department));

create policy department_private_inventory_items_update_scope
on public.department_private_inventory_items
for update
using (public.erp_department_inventory_scope_matches(company, company_id, department))
with check (public.erp_department_inventory_scope_matches(company, company_id, department));

create policy department_private_inventory_items_delete_scope
on public.department_private_inventory_items
for delete
using (public.erp_department_inventory_scope_matches(company, company_id, department));

drop policy if exists department_private_inventory_logs_select_scope on public.department_private_inventory_logs;
drop policy if exists department_private_inventory_logs_insert_scope on public.department_private_inventory_logs;
drop policy if exists department_private_inventory_logs_update_admin on public.department_private_inventory_logs;
drop policy if exists department_private_inventory_logs_delete_admin on public.department_private_inventory_logs;

create policy department_private_inventory_logs_select_scope
on public.department_private_inventory_logs
for select
using (public.erp_department_inventory_scope_matches(company, company_id, department));

create policy department_private_inventory_logs_insert_scope
on public.department_private_inventory_logs
for insert
with check (
  public.erp_department_inventory_scope_matches(company, company_id, department)
  and exists (
    select 1
    from public.department_private_inventory_items as item
    where item.id = department_private_inventory_logs.item_id
      and lower(btrim(item.company)) = lower(btrim(department_private_inventory_logs.company))
      and lower(btrim(item.department)) = lower(btrim(department_private_inventory_logs.department))
      and public.erp_department_inventory_scope_matches(item.company, item.company_id, item.department)
      and (
        item.company_id is null
        or department_private_inventory_logs.company_id is null
        or item.company_id = department_private_inventory_logs.company_id
      )
  )
);

create policy department_private_inventory_logs_update_admin
on public.department_private_inventory_logs
for update
using (public.erp_is_admin())
with check (public.erp_is_admin());

create policy department_private_inventory_logs_delete_admin
on public.department_private_inventory_logs
for delete
using (public.erp_is_admin());
