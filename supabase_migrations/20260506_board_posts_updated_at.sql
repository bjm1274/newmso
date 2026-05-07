alter table public.board_posts
  add column if not exists updated_at timestamptz default now();

update public.board_posts
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

create or replace function public.touch_board_posts_updated_at()
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
execute function public.touch_board_posts_updated_at();
