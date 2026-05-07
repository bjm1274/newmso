-- Chat room and board loading hot-path indexes.

create index if not exists idx_chat_rooms_members_gin
  on public.chat_rooms using gin (members);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chat_rooms'
      and column_name = 'last_message_at'
  ) then
    execute 'create index if not exists idx_chat_rooms_last_message_at_desc on public.chat_rooms (last_message_at desc nulls last, created_at desc)';
  end if;
end $$;

create index if not exists idx_messages_room_created_id_desc
  on public.messages (room_id, created_at desc, id desc);

create index if not exists idx_messages_room_unread_count
  on public.messages (room_id, created_at desc)
  where is_deleted = false;

create index if not exists idx_room_read_cursors_room_user
  on public.room_read_cursors (room_id, user_id);

create index if not exists idx_board_posts_board_type_created_desc
  on public.board_posts (board_type, created_at desc);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'board_posts'
      and column_name = 'schedule_date'
  ) then
    execute 'create index if not exists idx_board_posts_board_type_schedule_date_time on public.board_posts (board_type, schedule_date, schedule_time)';
  end if;
end $$;

do $$
begin
  if to_regclass('public.board_post_likes') is not null then
    execute 'create index if not exists idx_board_post_likes_user_id on public.board_post_likes (user_id)';
  end if;
end $$;

do $$
begin
  if to_regclass('public.message_bookmarks') is not null then
    execute 'create index if not exists idx_message_bookmarks_user_message on public.message_bookmarks (user_id, message_id)';
  end if;
end $$;
