-- 사내위키 실사용 전환 + 할일 확장 컬럼

create table if not exists public.wiki_folders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid null,
  company_name text not null default '전체',
  name text not null,
  description text null,
  color text null,
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_by uuid null references public.staff_members(id) on delete set null,
  updated_by uuid null references public.staff_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wiki_folders_company_sort
  on public.wiki_folders(company_id, sort_order, created_at desc);

create table if not exists public.wiki_documents (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references public.wiki_folders(id) on delete cascade,
  company_id uuid null,
  company_name text not null default '전체',
  title text not null,
  summary text null,
  content text not null default '',
  tags text[] not null default '{}'::text[],
  editor_ids uuid[] not null default '{}'::uuid[],
  is_published boolean not null default true,
  is_archived boolean not null default false,
  created_by uuid null references public.staff_members(id) on delete set null,
  updated_by uuid null references public.staff_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wiki_documents_folder_updated
  on public.wiki_documents(folder_id, updated_at desc);

create index if not exists idx_wiki_documents_company_title
  on public.wiki_documents(company_id, title);

alter table public.todos
  add column if not exists priority text not null default 'medium',
  add column if not exists reminder_at timestamptz null,
  add column if not exists repeat_type text not null default 'none',
  add column if not exists assignee_kind text not null default 'self';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'todos_priority_check'
  ) then
    alter table public.todos
      add constraint todos_priority_check
      check (priority in ('low', 'medium', 'high', 'urgent'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'todos_repeat_type_check'
  ) then
    alter table public.todos
      add constraint todos_repeat_type_check
      check (repeat_type in ('none', 'daily', 'weekly', 'monthly'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'todos_assignee_kind_check'
  ) then
    alter table public.todos
      add constraint todos_assignee_kind_check
      check (assignee_kind in ('self', 'team', 'follow_up'));
  end if;
end $$;

create index if not exists idx_todos_reminder_at
  on public.todos(reminder_at)
  where reminder_at is not null;

create index if not exists idx_todos_priority_date
  on public.todos(user_id, priority, task_date desc);

alter table public.wiki_folders enable row level security;
alter table public.wiki_documents enable row level security;

drop policy if exists wiki_folders_select_scope on public.wiki_folders;
drop policy if exists wiki_folders_insert_scope on public.wiki_folders;
drop policy if exists wiki_folders_update_scope on public.wiki_folders;
drop policy if exists wiki_folders_delete_scope on public.wiki_folders;

create policy wiki_folders_select_scope
on public.wiki_folders
for select
using (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);

create policy wiki_folders_insert_scope
on public.wiki_folders
for insert
with check (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);

create policy wiki_folders_update_scope
on public.wiki_folders
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

create policy wiki_folders_delete_scope
on public.wiki_folders
for delete
using (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);

drop policy if exists wiki_documents_select_scope on public.wiki_documents;
drop policy if exists wiki_documents_insert_scope on public.wiki_documents;
drop policy if exists wiki_documents_update_scope on public.wiki_documents;
drop policy if exists wiki_documents_delete_scope on public.wiki_documents;

create policy wiki_documents_select_scope
on public.wiki_documents
for select
using (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);

create policy wiki_documents_insert_scope
on public.wiki_documents
for insert
with check (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);

create policy wiki_documents_update_scope
on public.wiki_documents
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

create policy wiki_documents_delete_scope
on public.wiki_documents
for delete
using (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);
