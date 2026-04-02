create table if not exists public.roster_policy_settings (
  id uuid primary key default gen_random_uuid(),
  policy_type text not null,
  policy_id text not null,
  company_id uuid null references public.companies(id) on delete cascade,
  company_name text not null default '전체',
  name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid null references public.staff_members(id) on delete set null,
  updated_by uuid null references public.staff_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'roster_policy_settings_policy_type_check'
  ) then
    alter table public.roster_policy_settings
      add constraint roster_policy_settings_policy_type_check
      check (policy_type in ('pattern_profile', 'generation_rule'));
  end if;
end $$;

create unique index if not exists idx_roster_policy_settings_policy_unique
  on public.roster_policy_settings(policy_type, policy_id);

create index if not exists idx_roster_policy_settings_company_type_updated
  on public.roster_policy_settings(company_id, policy_type, updated_at desc);

create index if not exists idx_roster_policy_settings_company_name_type_updated
  on public.roster_policy_settings(company_name, policy_type, updated_at desc);

create or replace function public.touch_roster_policy_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_roster_policy_settings_updated_at on public.roster_policy_settings;
create trigger trg_roster_policy_settings_updated_at
before update on public.roster_policy_settings
for each row
execute function public.touch_roster_policy_settings_updated_at();

alter table public.roster_policy_settings enable row level security;

drop policy if exists roster_policy_settings_select_scope on public.roster_policy_settings;
drop policy if exists roster_policy_settings_insert_scope on public.roster_policy_settings;
drop policy if exists roster_policy_settings_update_scope on public.roster_policy_settings;
drop policy if exists roster_policy_settings_delete_scope on public.roster_policy_settings;

create policy roster_policy_settings_select_scope
on public.roster_policy_settings
for select
using (
  public.erp_is_admin()
  or (
    public.erp_can_manage_company()
    and (
      company_id is null
      or public.erp_company_matches(company_id)
    )
  )
);

create policy roster_policy_settings_insert_scope
on public.roster_policy_settings
for insert
with check (
  public.erp_is_admin()
  or (
    public.erp_can_manage_company()
    and (
      company_id is null
      or public.erp_company_matches(company_id)
    )
  )
);

create policy roster_policy_settings_update_scope
on public.roster_policy_settings
for update
using (
  public.erp_is_admin()
  or (
    public.erp_can_manage_company()
    and (
      company_id is null
      or public.erp_company_matches(company_id)
    )
  )
)
with check (
  public.erp_is_admin()
  or (
    public.erp_can_manage_company()
    and (
      company_id is null
      or public.erp_company_matches(company_id)
    )
  )
);

create policy roster_policy_settings_delete_scope
on public.roster_policy_settings
for delete
using (
  public.erp_is_admin()
  or (
    public.erp_can_manage_company()
    and (
      company_id is null
      or public.erp_company_matches(company_id)
    )
  )
);
