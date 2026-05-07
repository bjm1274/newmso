begin;

alter table if exists public.board_posts enable row level security;

drop policy if exists authenticated_access on public.board_posts;
drop policy if exists board_posts_select_authenticated on public.board_posts;
drop policy if exists board_posts_insert_authenticated on public.board_posts;
drop policy if exists board_posts_update_authenticated on public.board_posts;
drop policy if exists board_posts_delete_author_admin on public.board_posts;

create policy board_posts_select_authenticated
on public.board_posts
for select
to authenticated
using (true);

create policy board_posts_insert_authenticated
on public.board_posts
for insert
to authenticated
with check (true);

create policy board_posts_update_authenticated
on public.board_posts
for update
to authenticated
using (true)
with check (true);

create policy board_posts_delete_author_admin
on public.board_posts
for delete
to authenticated
using (
  public.erp_is_admin()
  or author_id = public.erp_staff_id()
);

commit;
