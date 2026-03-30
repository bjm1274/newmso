alter table public.board_posts
  add column if not exists status text;

create table if not exists public.board_post_reads (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.board_posts(id) on delete cascade,
  user_id uuid not null references public.staff_members(id) on delete cascade,
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create index if not exists idx_board_post_reads_post_id
  on public.board_post_reads(post_id);

create index if not exists idx_board_post_reads_user_id
  on public.board_post_reads(user_id);

-- RLS 활성화
alter table public.board_post_reads enable row level security;

-- 본인 읽음 기록 삽입/수정 허용
create policy if not exists "board_post_reads_insert_own"
  on public.board_post_reads
  for insert
  with check (true);

create policy if not exists "board_post_reads_update_own"
  on public.board_post_reads
  for update
  using (true);

-- 읽음 현황 조회: 모든 인증 사용자가 전체 조회 가능 (읽음확인 기능)
create policy if not exists "board_post_reads_select_all"
  on public.board_post_reads
  for select
  using (true);

-- Realtime 복제 활성화
alter publication supabase_realtime add table public.board_post_reads;
