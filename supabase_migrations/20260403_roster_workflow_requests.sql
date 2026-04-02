create table if not exists public.roster_approval_requests (
  id uuid primary key default gen_random_uuid(),
  company_name text null,
  team_name text null,
  year_month varchar(7) not null,
  assignments jsonb not null default '[]'::jsonb,
  requested_by uuid null references public.staff_members(id) on delete set null,
  requested_by_name text null,
  status varchar(20) not null default 'pending',
  approved_by uuid null references public.staff_members(id) on delete set null,
  approved_at timestamptz null,
  rejected_by uuid null references public.staff_members(id) on delete set null,
  rejected_at timestamptz null,
  reject_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roster_approval_requests_status_check
    check (status in ('pending', 'approved', 'rejected'))
);

create index if not exists idx_roster_approval_requests_status_created_at
  on public.roster_approval_requests(status, created_at desc);

create index if not exists idx_roster_approval_requests_year_month_team
  on public.roster_approval_requests(year_month, team_name);

create table if not exists public.roster_swap_requests (
  id uuid primary key default gen_random_uuid(),
  company_name text null,
  team_name text null,
  requested_by uuid null references public.staff_members(id) on delete set null,
  requested_by_name text null,
  staff_id uuid null references public.staff_members(id) on delete cascade,
  work_date date not null,
  target_date date not null,
  current_shift_id uuid null references public.work_shifts(id) on delete set null,
  reason text null,
  status varchar(20) not null default 'pending',
  approved_by uuid null references public.staff_members(id) on delete set null,
  approved_at timestamptz null,
  rejected_by uuid null references public.staff_members(id) on delete set null,
  rejected_at timestamptz null,
  reject_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roster_swap_requests_status_check
    check (status in ('pending', 'approved', 'rejected'))
);

create index if not exists idx_roster_swap_requests_status_created_at
  on public.roster_swap_requests(status, created_at desc);

create index if not exists idx_roster_swap_requests_staff_date
  on public.roster_swap_requests(staff_id, work_date, target_date);

create or replace function public.erp_is_roster_approver()
returns boolean
language sql
stable
as $$
  select
    public.erp_is_admin()
    or exists (
      select 1
      from public.staff_members as s
      where s.id = public.erp_staff_id()
        and (
          coalesce(s.role, '') in ('admin', 'master')
          or coalesce(s.position, '') in ('총무부장', '이사')
          or (
            coalesce(s.company, '') = 'SY INC.'
            and coalesce(s.position, '') = '이사'
          )
        )
    )
$$;

drop trigger if exists trg_roster_approval_requests_updated_at on public.roster_approval_requests;
create trigger trg_roster_approval_requests_updated_at
before update on public.roster_approval_requests
for each row
execute function public.set_row_updated_at();

drop trigger if exists trg_roster_swap_requests_updated_at on public.roster_swap_requests;
create trigger trg_roster_swap_requests_updated_at
before update on public.roster_swap_requests
for each row
execute function public.set_row_updated_at();

alter table public.roster_approval_requests enable row level security;
alter table public.roster_swap_requests enable row level security;

drop policy if exists roster_approval_requests_select_scope on public.roster_approval_requests;
drop policy if exists roster_approval_requests_insert_scope on public.roster_approval_requests;
drop policy if exists roster_approval_requests_update_scope on public.roster_approval_requests;
drop policy if exists roster_approval_requests_delete_scope on public.roster_approval_requests;

create policy roster_approval_requests_select_scope
on public.roster_approval_requests
for select
using (
  requested_by = public.erp_staff_id()
  or public.erp_is_roster_approver()
);

create policy roster_approval_requests_insert_scope
on public.roster_approval_requests
for insert
with check (
  requested_by = public.erp_staff_id()
  or public.erp_is_roster_approver()
);

create policy roster_approval_requests_update_scope
on public.roster_approval_requests
for update
using (public.erp_is_roster_approver())
with check (public.erp_is_roster_approver());

create policy roster_approval_requests_delete_scope
on public.roster_approval_requests
for delete
using (public.erp_is_admin() or requested_by = public.erp_staff_id());

drop policy if exists roster_swap_requests_select_scope on public.roster_swap_requests;
drop policy if exists roster_swap_requests_insert_scope on public.roster_swap_requests;
drop policy if exists roster_swap_requests_update_scope on public.roster_swap_requests;
drop policy if exists roster_swap_requests_delete_scope on public.roster_swap_requests;

create policy roster_swap_requests_select_scope
on public.roster_swap_requests
for select
using (
  requested_by = public.erp_staff_id()
  or staff_id = public.erp_staff_id()
  or public.erp_is_roster_approver()
);

create policy roster_swap_requests_insert_scope
on public.roster_swap_requests
for insert
with check (
  requested_by = public.erp_staff_id()
  or staff_id = public.erp_staff_id()
  or public.erp_is_roster_approver()
);

create policy roster_swap_requests_update_scope
on public.roster_swap_requests
for update
using (public.erp_is_roster_approver())
with check (public.erp_is_roster_approver());

create policy roster_swap_requests_delete_scope
on public.roster_swap_requests
for delete
using (public.erp_is_admin() or requested_by = public.erp_staff_id());
