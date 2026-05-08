-- Runtime cleanup for Supabase/Postgres errors observed on 2026-05-08.
-- Safe to run more than once.

begin;

create extension if not exists pgcrypto;

create table if not exists public.chat_push_jobs (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  sender_id uuid null references public.staff_members(id) on delete set null,
  created_at timestamptz not null default now(),
  processing_started_at timestamptz null,
  processed_at timestamptz null,
  attempt_count integer not null default 0,
  last_error text null,
  next_attempt_at timestamptz not null default now(),
  dead_lettered_at timestamptz null
);

alter table if exists public.chat_push_jobs
  add column if not exists processing_started_at timestamptz,
  add column if not exists processed_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_error text,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists dead_lettered_at timestamptz;

update public.chat_push_jobs
set next_attempt_at = coalesce(next_attempt_at, created_at, now())
where next_attempt_at is null;

alter table if exists public.chat_push_jobs
  alter column next_attempt_at set default now(),
  alter column next_attempt_at set not null;

create unique index if not exists idx_chat_push_jobs_message_id
  on public.chat_push_jobs(message_id);

create index if not exists idx_chat_push_jobs_ready
  on public.chat_push_jobs(next_attempt_at, created_at)
  where processed_at is null and dead_lettered_at is null;

create index if not exists idx_chat_push_jobs_processing_started_at
  on public.chat_push_jobs(processing_started_at desc);

alter table if exists public.staff_members
  add column if not exists password text,
  add column if not exists passwd text,
  add column if not exists employment_type text;

do $$
begin
  if to_regclass('public.staff_members') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'staff_members' and column_name = 'password'
     ) then
    update public.staff_members
    set passwd = coalesce(passwd, password)
    where passwd is null;
  end if;
end $$;

alter table if exists public.inventory
  add column if not exists name text,
  add column if not exists stock integer default 0,
  add column if not exists min_stock integer default 10;

do $$
begin
  if to_regclass('public.inventory') is not null then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'inventory' and column_name = 'item_name'
    ) then
      update public.inventory set name = coalesce(name, item_name) where name is null;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'inventory' and column_name = 'quantity'
    ) then
      update public.inventory set stock = coalesce(stock, quantity, 0) where stock is null;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'inventory' and column_name = 'min_quantity'
    ) then
      update public.inventory set min_stock = coalesce(min_stock, min_quantity, 10) where min_stock is null;
    end if;
  end if;
end $$;

alter table if exists public.approvals
  add column if not exists approval_line jsonb,
  add column if not exists approver_line jsonb,
  add column if not exists name text,
  add column if not exists doc_type text;

do $$
begin
  if to_regclass('public.approvals') is not null then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'approvals' and column_name = 'approver_line'
    ) then
      update public.approvals
      set approval_line = coalesce(approval_line, approver_line)
      where approval_line is null;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'approvals' and column_name = 'title'
    ) then
      update public.approvals set name = coalesce(name, title) where name is null;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'approvals' and column_name = 'type'
    ) then
      update public.approvals set doc_type = coalesce(doc_type, "type") where doc_type is null;
    end if;
  end if;
end $$;

alter table if exists public.attendance_corrections
  add column if not exists attendance_date date,
  add column if not exists requested_at timestamptz default now();

do $$
begin
  if to_regclass('public.attendance_corrections') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'attendance_corrections' and column_name = 'original_date'
     ) then
    update public.attendance_corrections
    set attendance_date = coalesce(attendance_date, original_date)
    where attendance_date is null;
  end if;
end $$;

alter table if exists public.payroll_records
  add column if not exists gross_pay numeric(14,0) default 0,
  add column if not exists national_pension numeric(14,0) default 0,
  add column if not exists health_insurance numeric(14,0) default 0,
  add column if not exists long_term_care numeric(14,0) default 0,
  add column if not exists employment_insurance numeric(14,0) default 0,
  add column if not exists income_tax numeric(14,0) default 0,
  add column if not exists local_tax numeric(14,0) default 0;

alter table if exists public.companies
  add column if not exists business_number text,
  add column if not exists seal_url text;

alter table if exists public.chat_rooms
  add column if not exists member_ids uuid[] default '{}';

update public.chat_rooms
set member_ids = coalesce(member_ids, members, '{}')
where member_ids is null;

alter table if exists public.audit_logs
  add column if not exists actor_name text;

alter table if exists public.leave_requests
  add column if not exists days numeric;

alter table if exists public.salary_change_history
  add column if not exists previous_salary numeric(14,0);

alter table if exists public.employment_contracts
  add column if not exists start_date date;

alter table if exists public.personnel_appointments
  add column if not exists new_department text;

create schema if not exists supabase_migrations;

create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);

do $$
begin
  if to_regclass('public.system_configs') is not null then
    alter table public.system_configs enable row level security;
    drop policy if exists system_configs_runtime_read on public.system_configs;
    create policy system_configs_runtime_read
      on public.system_configs
      for select
      to anon, authenticated
      using (true);
  end if;

  if to_regclass('public.popups') is not null then
    alter table public.popups enable row level security;
    drop policy if exists popups_runtime_all on public.popups;
    create policy popups_runtime_all
      on public.popups
      for all
      to anon, authenticated
      using (true)
      with check (true);
  end if;

  if to_regclass('public.messages') is not null then
    alter table public.messages enable row level security;
    drop policy if exists messages_runtime_all on public.messages;
    create policy messages_runtime_all
      on public.messages
      for all
      to anon, authenticated
      using (true)
      with check (true);
  end if;

  if to_regclass('public.notifications') is not null then
    alter table public.notifications enable row level security;
    drop policy if exists notifications_runtime_all on public.notifications;
    create policy notifications_runtime_all
      on public.notifications
      for all
      to anon, authenticated
      using (true)
      with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
