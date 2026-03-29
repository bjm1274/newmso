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
