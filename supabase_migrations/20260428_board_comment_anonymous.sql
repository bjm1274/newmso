alter table public.board_post_comments
  add column if not exists is_anonymous boolean not null default false;

update public.board_post_comments as comments
set is_anonymous = true
from public.board_posts as posts
where comments.post_id = posts.id
  and posts.board_type = '익명소리함'
  and coalesce(comments.is_anonymous, false) = false;

notify pgrst, 'reload schema';
