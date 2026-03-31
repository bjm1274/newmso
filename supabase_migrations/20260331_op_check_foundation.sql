-- OP check foundation:
-- surgery/anesthesia preparation templates and patient-linked operation checklists

create table if not exists public.op_check_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid null,
  company_name text not null default '전체',
  template_scope text not null default 'surgery',
  template_name text not null,
  surgery_template_id uuid null,
  surgery_name text null,
  anesthesia_type text null,
  prep_items jsonb not null default '[]'::jsonb,
  consumable_items jsonb not null default '[]'::jsonb,
  notes text null,
  is_active boolean not null default true,
  created_by uuid null references public.staff_members(id) on delete set null,
  created_by_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'op_check_templates_scope_check'
  ) then
    alter table public.op_check_templates
      add constraint op_check_templates_scope_check
      check (template_scope in ('surgery', 'anesthesia'));
  end if;
end $$;

create index if not exists idx_op_check_templates_company_scope
  on public.op_check_templates(company_id, template_scope, is_active);

create index if not exists idx_op_check_templates_surgery_name
  on public.op_check_templates(lower(coalesce(surgery_name, '')));

create index if not exists idx_op_check_templates_anesthesia
  on public.op_check_templates(lower(coalesce(anesthesia_type, '')));

create table if not exists public.op_patient_checks (
  id uuid primary key default gen_random_uuid(),
  schedule_post_id text not null,
  company_id uuid null,
  company_name text not null default '전체',
  patient_name text not null default '',
  chart_no text null,
  surgery_name text not null default '',
  surgery_template_id uuid null,
  anesthesia_type text null,
  schedule_date date null,
  schedule_time text null,
  schedule_room text null,
  prep_items jsonb not null default '[]'::jsonb,
  consumable_items jsonb not null default '[]'::jsonb,
  notes text null,
  status text not null default '준비중',
  applied_template_ids uuid[] not null default '{}'::uuid[],
  created_by uuid null references public.staff_members(id) on delete set null,
  created_by_name text null,
  updated_by uuid null references public.staff_members(id) on delete set null,
  updated_by_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(schedule_post_id)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'op_patient_checks_status_check'
  ) then
    alter table public.op_patient_checks
      add constraint op_patient_checks_status_check
      check (status in ('준비중', '준비완료', '수술중', '완료'));
  end if;
end $$;

create index if not exists idx_op_patient_checks_company_date
  on public.op_patient_checks(company_id, schedule_date desc, updated_at desc);

create index if not exists idx_op_patient_checks_patient_name
  on public.op_patient_checks(lower(patient_name));

alter table public.op_check_templates enable row level security;
alter table public.op_patient_checks enable row level security;

drop policy if exists op_check_templates_select_scope on public.op_check_templates;
drop policy if exists op_check_templates_insert_scope on public.op_check_templates;
drop policy if exists op_check_templates_update_scope on public.op_check_templates;
drop policy if exists op_check_templates_delete_scope on public.op_check_templates;

create policy op_check_templates_select_scope
on public.op_check_templates
for select
using (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);

create policy op_check_templates_insert_scope
on public.op_check_templates
for insert
with check (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);

create policy op_check_templates_update_scope
on public.op_check_templates
for update
using (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
)
with check (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);

create policy op_check_templates_delete_scope
on public.op_check_templates
for delete
using (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);

drop policy if exists op_patient_checks_select_scope on public.op_patient_checks;
drop policy if exists op_patient_checks_insert_scope on public.op_patient_checks;
drop policy if exists op_patient_checks_update_scope on public.op_patient_checks;
drop policy if exists op_patient_checks_delete_scope on public.op_patient_checks;

create policy op_patient_checks_select_scope
on public.op_patient_checks
for select
using (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);

create policy op_patient_checks_insert_scope
on public.op_patient_checks
for insert
with check (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);

create policy op_patient_checks_update_scope
on public.op_patient_checks
for update
using (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
)
with check (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);

create policy op_patient_checks_delete_scope
on public.op_patient_checks
for delete
using (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);
