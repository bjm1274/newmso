-- Runtime missing-column patch for Supabase project rtleqrtcqucntnygzudv.
-- Run in Supabase Dashboard > SQL Editor. Safe to re-run.

begin;

alter table if exists public.board_posts
  add column if not exists board_id text,
  add column if not exists updated_at timestamptz default now(),
  add column if not exists company_id uuid references public.companies(id),
  add column if not exists tags jsonb default '[]'::jsonb,
  add column if not exists attachments jsonb default '[]'::jsonb,
  add column if not exists likes_count integer default 0,
  add column if not exists is_pinned boolean default false,
  add column if not exists status text,
  add column if not exists scheduled_publish_at timestamptz,
  add column if not exists schedule_date text,
  add column if not exists schedule_time text,
  add column if not exists schedule_room text,
  add column if not exists patient_name text,
  add column if not exists surgery_fasting boolean default false,
  add column if not exists surgery_inpatient boolean default false,
  add column if not exists surgery_guardian boolean default false,
  add column if not exists surgery_caregiver boolean default false,
  add column if not exists surgery_transfusion boolean default false,
  add column if not exists mri_contrast_required boolean default false;

update public.board_posts
set board_id = coalesce(board_id, board_type)
where board_id is null;

alter table if exists public.board_post_comments
  add column if not exists parent_comment_id uuid references public.board_post_comments(id) on delete cascade,
  add column if not exists is_anonymous boolean not null default false;

alter table if exists public.staff_members
  add column if not exists is_system_master boolean not null default false,
  add column if not exists avatar_url text,
  add column if not exists photo_url text,
  add column if not exists profile_photo_path text,
  add column if not exists profile_photo_updated_at timestamptz,
  add column if not exists force_logout_at timestamptz,
  add column if not exists updated_at timestamptz default now(),
  add column if not exists hire_date date,
  add column if not exists resign_date date,
  add column if not exists bank_name text,
  add column if not exists bank_account text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'staff_members'
      and column_name = 'join_date'
  ) then
    update public.staff_members
    set hire_date = join_date
    where hire_date is null
      and join_date is not null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'staff_members'
      and column_name = 'joined_at'
  ) then
    update public.staff_members
    set hire_date = joined_at
    where hire_date is null
      and joined_at is not null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'staff_members'
      and column_name = 'resigned_at'
  ) then
    update public.staff_members
    set resign_date = resigned_at
    where resign_date is null
      and resigned_at is not null;
  end if;
end $$;

alter table if exists public.approvals
  add column if not exists doc_number text,
  add column if not exists updated_at timestamptz default now();

alter table if exists public.shift_assignments
  add column if not exists shift_name text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'work_shifts'
      and column_name = 'name'
  ) then
    update public.shift_assignments as assignments
    set shift_name = shifts.name
    from public.work_shifts as shifts
    where assignments.shift_name is null
      and assignments.shift_id = shifts.id;
  end if;
end $$;

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_board_posts_updated_at on public.board_posts;
create trigger trg_board_posts_updated_at
before update on public.board_posts
for each row
execute function public.set_row_updated_at();

drop trigger if exists trg_staff_members_updated_at on public.staff_members;
create trigger trg_staff_members_updated_at
before update on public.staff_members
for each row
execute function public.set_row_updated_at();

drop trigger if exists trg_approvals_updated_at on public.approvals;
create trigger trg_approvals_updated_at
before update on public.approvals
for each row
execute function public.set_row_updated_at();

create index if not exists idx_board_posts_board_id_created_at
  on public.board_posts(board_id, created_at desc);

create index if not exists idx_board_posts_schedule_date
  on public.board_posts(schedule_date);

create index if not exists idx_approvals_doc_number
  on public.approvals(doc_number)
  where doc_number is not null;

notify pgrst, 'reload schema';

commit;
