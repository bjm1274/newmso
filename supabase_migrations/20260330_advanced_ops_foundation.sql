-- Advanced operations foundation:
-- wiki version history, recurring todo tracking, todo reminder logs, backup restore logs

alter table public.todos
  add column if not exists repeat_parent_id text null,
  add column if not exists repeat_generated_from_id text null;

create index if not exists idx_todos_repeat_parent_date
  on public.todos(user_id, repeat_parent_id, task_date desc)
  where repeat_parent_id is not null;

create table if not exists public.todo_reminder_logs (
  id uuid primary key default gen_random_uuid(),
  todo_id text not null,
  user_id uuid not null references public.staff_members(id) on delete cascade,
  reminder_at timestamptz not null,
  notification_id uuid null references public.notifications(id) on delete set null,
  status text not null default 'sent',
  title text null,
  body text null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'todo_reminder_logs_status_check'
  ) then
    alter table public.todo_reminder_logs
      add constraint todo_reminder_logs_status_check
      check (status in ('sent', 'duplicate', 'failed'));
  end if;
end $$;

create unique index if not exists idx_todo_reminder_logs_unique
  on public.todo_reminder_logs(user_id, todo_id, reminder_at);

create index if not exists idx_todo_reminder_logs_created
  on public.todo_reminder_logs(user_id, created_at desc);

do $$
begin
  if to_regclass('public.wiki_documents') is not null then
    create table if not exists public.wiki_document_versions (
      id uuid primary key default gen_random_uuid(),
      document_id uuid not null references public.wiki_documents(id) on delete cascade,
      version_no integer not null,
      title text not null,
      summary text null,
      content text not null default '',
      tags text[] not null default '{}'::text[],
      editor_ids uuid[] not null default '{}'::uuid[],
      company_id uuid null,
      company_name text not null default '전체',
      change_summary text null,
      restore_of_version_id uuid null,
      created_by uuid null references public.staff_members(id) on delete set null,
      created_at timestamptz not null default now(),
      unique(document_id, version_no)
    );

    if not exists (
      select 1
      from pg_constraint
      where conname = 'wiki_document_versions_restore_of_version_id_fkey'
    ) then
      alter table public.wiki_document_versions
        add constraint wiki_document_versions_restore_of_version_id_fkey
        foreign key (restore_of_version_id)
        references public.wiki_document_versions(id)
        on delete set null;
    end if;

    create index if not exists idx_wiki_document_versions_document_created
      on public.wiki_document_versions(document_id, created_at desc);
  end if;
end $$;

create table if not exists public.backup_restore_runs (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  meta jsonb not null default '{}'::jsonb,
  preview jsonb not null default '[]'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  log_lines text[] not null default '{}'::text[],
  total_tables integer not null default 0,
  total_rows bigint not null default 0,
  status text not null default 'running',
  requested_by uuid null references public.staff_members(id) on delete set null,
  requested_by_name text null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'backup_restore_runs_status_check'
  ) then
    alter table public.backup_restore_runs
      add constraint backup_restore_runs_status_check
      check (status in ('preview', 'running', 'completed', 'failed'));
  end if;
end $$;

create index if not exists idx_backup_restore_runs_started
  on public.backup_restore_runs(started_at desc);

alter table public.todo_reminder_logs enable row level security;
alter table public.backup_restore_runs enable row level security;

drop policy if exists todo_reminder_logs_select_scope on public.todo_reminder_logs;
drop policy if exists todo_reminder_logs_insert_scope on public.todo_reminder_logs;
drop policy if exists todo_reminder_logs_update_scope on public.todo_reminder_logs;
drop policy if exists todo_reminder_logs_delete_scope on public.todo_reminder_logs;

create policy todo_reminder_logs_select_scope
on public.todo_reminder_logs
for select
using (public.erp_target_staff_in_scope(user_id));

create policy todo_reminder_logs_insert_scope
on public.todo_reminder_logs
for insert
with check (
  public.erp_is_admin()
  or user_id = public.erp_staff_id()
  or public.erp_target_staff_same_company(user_id)
);

create policy todo_reminder_logs_update_scope
on public.todo_reminder_logs
for update
using (public.erp_target_staff_in_scope(user_id))
with check (public.erp_target_staff_in_scope(user_id));

create policy todo_reminder_logs_delete_scope
on public.todo_reminder_logs
for delete
using (public.erp_is_admin() or user_id = public.erp_staff_id());

do $$
begin
  if to_regclass('public.wiki_document_versions') is not null then
    alter table public.wiki_document_versions enable row level security;

    drop policy if exists wiki_document_versions_select_scope on public.wiki_document_versions;
    drop policy if exists wiki_document_versions_insert_scope on public.wiki_document_versions;
    drop policy if exists wiki_document_versions_update_scope on public.wiki_document_versions;
    drop policy if exists wiki_document_versions_delete_scope on public.wiki_document_versions;

    create policy wiki_document_versions_select_scope
    on public.wiki_document_versions
    for select
    using (
      public.erp_is_admin()
      or company_id is null
      or public.erp_company_matches(company_id)
    );

    create policy wiki_document_versions_insert_scope
    on public.wiki_document_versions
    for insert
    with check (
      public.erp_is_admin()
      or company_id is null
      or public.erp_company_matches(company_id)
    );

    create policy wiki_document_versions_update_scope
    on public.wiki_document_versions
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

    create policy wiki_document_versions_delete_scope
    on public.wiki_document_versions
    for delete
    using (
      public.erp_is_admin()
      or company_id is null
      or public.erp_company_matches(company_id)
    );
  end if;
end $$;

drop policy if exists backup_restore_runs_select_scope on public.backup_restore_runs;
drop policy if exists backup_restore_runs_insert_scope on public.backup_restore_runs;
drop policy if exists backup_restore_runs_update_scope on public.backup_restore_runs;
drop policy if exists backup_restore_runs_delete_scope on public.backup_restore_runs;

create policy backup_restore_runs_select_scope
on public.backup_restore_runs
for select
using (public.erp_is_admin());

create policy backup_restore_runs_insert_scope
on public.backup_restore_runs
for insert
with check (public.erp_is_admin());

create policy backup_restore_runs_update_scope
on public.backup_restore_runs
for update
using (public.erp_is_admin())
with check (public.erp_is_admin());

create policy backup_restore_runs_delete_scope
on public.backup_restore_runs
for delete
using (public.erp_is_admin());
