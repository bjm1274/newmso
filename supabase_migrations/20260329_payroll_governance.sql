create table if not exists public.payroll_policy_versions (
  id uuid primary key default gen_random_uuid(),
  company_name text not null default '전체',
  effective_year integer not null,
  version_label text not null,
  snapshot jsonb not null default '{}'::jsonb,
  note text,
  created_by uuid references public.staff_members(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_payroll_policy_versions_scope
  on public.payroll_policy_versions(company_name, effective_year, created_at desc);

alter table if exists public.payroll_locks
  add column if not exists reopen_requested_at timestamptz,
  add column if not exists reopen_requested_by uuid references public.staff_members(id) on delete set null,
  add column if not exists reopen_request_comment text,
  add column if not exists reopen_request_status text,
  add column if not exists reopen_reviewed_at timestamptz,
  add column if not exists reopen_reviewed_by uuid references public.staff_members(id) on delete set null,
  add column if not exists reopen_review_comment text;

create index if not exists idx_payroll_locks_reopen_status
  on public.payroll_locks(year_month, company_name, reopen_request_status);
