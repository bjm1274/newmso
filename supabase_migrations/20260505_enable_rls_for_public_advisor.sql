-- Supabase Security Advisor: enable RLS for every exposed public table.
-- Run this in Supabase SQL Editor, or apply it with your normal migration flow.
--
-- This migration closes anonymous table access, enables RLS across public base
-- tables, preserves the app's custom ERP JWT claims for authenticated users,
-- and adds authenticated fallback policies only for tables that still have no
-- policies after the explicit core policies below.

begin;

create or replace function public.erp_claim_uuid(claim_key text)
returns uuid
language sql
stable
as $$
  select case
    when coalesce(auth.jwt() ->> claim_key, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (auth.jwt() ->> claim_key)::uuid
    else null
  end
$$;

create or replace function public.erp_staff_id()
returns uuid
language sql
stable
as $$
  select public.erp_claim_uuid('erp_staff_id')
$$;

create or replace function public.erp_company_id()
returns uuid
language sql
stable
as $$
  select public.erp_claim_uuid('erp_company_id')
$$;

create or replace function public.erp_is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(nullif(auth.jwt() ->> 'erp_is_admin', '')::boolean, false)
$$;

create or replace function public.erp_can_manage_company()
returns boolean
language sql
stable
as $$
  select coalesce(nullif(auth.jwt() ->> 'erp_can_manage_company', '')::boolean, false)
$$;

create or replace function public.erp_company_matches(target_company_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.erp_is_admin()
    or (
      public.erp_company_id() is not null
      and target_company_id is not null
      and public.erp_company_id() = target_company_id
    )
$$;

create or replace function public.erp_company_name_matches(target_company_name text)
returns boolean
language sql
stable
as $$
  select
    public.erp_is_admin()
    or (
      nullif(btrim(coalesce(auth.jwt() ->> 'erp_company_name', '')), '') is not null
      and nullif(btrim(coalesce(target_company_name, '')), '') is not null
      and btrim(auth.jwt() ->> 'erp_company_name') = btrim(target_company_name)
    )
$$;

create or replace function public.erp_target_staff_same_company(target_staff_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.staff_members as s
    where s.id = target_staff_id
      and public.erp_company_id() is not null
      and s.company_id = public.erp_company_id()
  )
$$;

create or replace function public.erp_target_staff_in_scope(target_staff_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.erp_is_admin()
    or target_staff_id = public.erp_staff_id()
    or (
      public.erp_can_manage_company()
      and public.erp_target_staff_same_company(target_staff_id)
    )
$$;

grant usage on schema public to authenticated;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;

do $$
declare
  target_table record;
begin
  for target_table in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relname <> 'spatial_ref_sys'
  loop
    execute format(
      'alter table %I.%I enable row level security',
      target_table.schema_name,
      target_table.table_name
    );
  end loop;
end $$;

alter table if exists public.staff_members enable row level security;
drop policy if exists staff_members_select_authenticated on public.staff_members;
create policy staff_members_select_authenticated
on public.staff_members
for select
to authenticated
using (true);

drop policy if exists staff_members_insert_manage on public.staff_members;
create policy staff_members_insert_manage
on public.staff_members
for insert
to authenticated
with check (public.erp_is_admin() or public.erp_can_manage_company());

drop policy if exists staff_members_update_scope on public.staff_members;
create policy staff_members_update_scope
on public.staff_members
for update
to authenticated
using (
  public.erp_is_admin()
  or id = public.erp_staff_id()
  or (
    public.erp_can_manage_company()
    and (
      public.erp_company_matches(company_id)
      or public.erp_company_name_matches(company)
    )
  )
)
with check (
  public.erp_is_admin()
  or id = public.erp_staff_id()
  or (
    public.erp_can_manage_company()
    and (
      public.erp_company_matches(company_id)
      or public.erp_company_name_matches(company)
    )
  )
);

drop policy if exists staff_members_delete_admin on public.staff_members;
create policy staff_members_delete_admin
on public.staff_members
for delete
to authenticated
using (public.erp_is_admin());

alter table if exists public.approvals enable row level security;
drop policy if exists approvals_select_scope on public.approvals;
create policy approvals_select_scope
on public.approvals
for select
to authenticated
using (
  public.erp_is_admin()
  or sender_id = public.erp_staff_id()
  or current_approver_id = public.erp_staff_id()
  or public.erp_company_matches(company_id)
);

drop policy if exists approvals_insert_scope on public.approvals;
create policy approvals_insert_scope
on public.approvals
for insert
to authenticated
with check (
  public.erp_is_admin()
  or sender_id = public.erp_staff_id()
  or (
    public.erp_can_manage_company()
    and public.erp_company_matches(company_id)
  )
);

drop policy if exists approvals_update_scope on public.approvals;
create policy approvals_update_scope
on public.approvals
for update
to authenticated
using (
  public.erp_is_admin()
  or sender_id = public.erp_staff_id()
  or current_approver_id = public.erp_staff_id()
  or (
    public.erp_can_manage_company()
    and public.erp_company_matches(company_id)
  )
)
with check (
  public.erp_is_admin()
  or sender_id = public.erp_staff_id()
  or current_approver_id = public.erp_staff_id()
  or (
    public.erp_can_manage_company()
    and public.erp_company_matches(company_id)
  )
);

drop policy if exists approvals_delete_scope on public.approvals;
create policy approvals_delete_scope
on public.approvals
for delete
to authenticated
using (
  public.erp_is_admin()
  or sender_id = public.erp_staff_id()
);

alter table if exists public.notifications enable row level security;
drop policy if exists notifications_select_scope on public.notifications;
create policy notifications_select_scope
on public.notifications
for select
to authenticated
using (public.erp_target_staff_in_scope(user_id));

drop policy if exists notifications_insert_scope on public.notifications;
create policy notifications_insert_scope
on public.notifications
for insert
to authenticated
with check (
  public.erp_is_admin()
  or user_id = public.erp_staff_id()
  or public.erp_target_staff_same_company(user_id)
);

drop policy if exists notifications_update_scope on public.notifications;
create policy notifications_update_scope
on public.notifications
for update
to authenticated
using (public.erp_target_staff_in_scope(user_id))
with check (public.erp_target_staff_in_scope(user_id));

drop policy if exists notifications_delete_scope on public.notifications;
create policy notifications_delete_scope
on public.notifications
for delete
to authenticated
using (public.erp_is_admin() or user_id = public.erp_staff_id());

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'payroll',
    'payroll_bonus_items',
    'payroll_deduction_controls',
    'payroll_records',
    'payroll_retro_adjustments'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);

      execute format('drop policy if exists %I on public.%I', table_name || '_select_scope', table_name);
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.erp_target_staff_in_scope(staff_id))',
        table_name || '_select_scope',
        table_name
      );

      execute format('drop policy if exists %I on public.%I', table_name || '_insert_scope', table_name);
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (public.erp_is_admin() or (public.erp_can_manage_company() and public.erp_target_staff_same_company(staff_id)))',
        table_name || '_insert_scope',
        table_name
      );

      execute format('drop policy if exists %I on public.%I', table_name || '_update_scope', table_name);
      execute format(
        'create policy %I on public.%I for update to authenticated using (public.erp_is_admin() or (public.erp_can_manage_company() and public.erp_target_staff_same_company(staff_id))) with check (public.erp_is_admin() or (public.erp_can_manage_company() and public.erp_target_staff_same_company(staff_id)))',
        table_name || '_update_scope',
        table_name
      );

      execute format('drop policy if exists %I on public.%I', table_name || '_delete_scope', table_name);
      execute format(
        'create policy %I on public.%I for delete to authenticated using (public.erp_is_admin() or (public.erp_can_manage_company() and public.erp_target_staff_same_company(staff_id)))',
        table_name || '_delete_scope',
        table_name
      );
    end if;
  end loop;
end $$;

-- Keep the company-name helpers next to the dynamic company-name policies too.
-- This makes the lower block safe to rerun from Supabase SQL Editor after a
-- partially selected/failed execution.
create or replace function public.erp_is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(nullif(auth.jwt() ->> 'erp_is_admin', '')::boolean, false)
$$;

create or replace function public.erp_can_manage_company()
returns boolean
language sql
stable
as $$
  select coalesce(nullif(auth.jwt() ->> 'erp_can_manage_company', '')::boolean, false)
$$;

create or replace function public.erp_company_name_matches(target_company_name text)
returns boolean
language sql
stable
as $$
  select
    public.erp_is_admin()
    or (
      nullif(btrim(coalesce(auth.jwt() ->> 'erp_company_name', '')), '') is not null
      and nullif(btrim(coalesce(target_company_name, '')), '') is not null
      and btrim(auth.jwt() ->> 'erp_company_name') = btrim(target_company_name)
    )
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'freelancer_payments',
    'payroll_approval_logs',
    'payroll_approval_workflows',
    'payroll_calendar_items',
    'payroll_locks'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);

      execute format('drop policy if exists %I on public.%I', table_name || '_select_scope', table_name);
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.erp_company_name_matches(company_name))',
        table_name || '_select_scope',
        table_name
      );

      execute format('drop policy if exists %I on public.%I', table_name || '_write_scope', table_name);
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.erp_is_admin() or (public.erp_can_manage_company() and public.erp_company_name_matches(company_name))) with check (public.erp_is_admin() or (public.erp_can_manage_company() and public.erp_company_name_matches(company_name)))',
        table_name || '_write_scope',
        table_name
      );
    end if;
  end loop;
end $$;

do $$
declare
  target_table record;
begin
  for target_table in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
      and c.relname <> 'spatial_ref_sys'
      and not exists (
        select 1
        from pg_policy as p
        where p.polrelid = c.oid
      )
  loop
    execute format(
      'create policy %I on %I.%I for all to authenticated using (true) with check (true)',
      'authenticated_access',
      target_table.schema_name,
      target_table.table_name
    );
  end loop;
end $$;

do $$
declare
  target_function record;
begin
  for target_function in
    select p.oid::regprocedure as function_signature
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format(
      'alter function %s set search_path = public, pg_temp',
      target_function.function_signature
    );
  end loop;
end $$;

commit;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  count(p.oid) as policy_count
from pg_class as c
join pg_namespace as n on n.oid = c.relnamespace
left join pg_policy as p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and c.relname <> 'spatial_ref_sys'
group by c.relname, c.relrowsecurity
order by c.relname;
