-- Keep chat room preview metadata in sync for inserts, edits, and soft deletes.

alter table public.chat_rooms
  add column if not exists last_message_at timestamptz;

alter table public.chat_rooms
  add column if not exists last_message_preview text;

create or replace function public.refresh_chat_room_last_message()
returns trigger
language plpgsql
as $$
declare
  target_room_id uuid;
begin
  if tg_op = 'DELETE' then
    target_room_id := old.room_id;
  else
    target_room_id := new.room_id;
  end if;

  if target_room_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  update public.chat_rooms
  set
    last_message_at = (
      select m.created_at
      from public.messages as m
      where m.room_id = target_room_id
        and coalesce(m.is_deleted, false) = false
      order by m.created_at desc nulls last, m.id desc
      limit 1
    ),
    last_message_preview = (
      select left(
        coalesce(
          nullif(btrim(m.content), ''),
          nullif(btrim(m.file_name), ''),
          '(file)'
        ),
        80
      )
      from public.messages as m
      where m.room_id = target_room_id
        and coalesce(m.is_deleted, false) = false
      order by m.created_at desc nulls last, m.id desc
      limit 1
    )
  where id = target_room_id;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_messages_update_room_last on public.messages;

create trigger trigger_messages_update_room_last
  after insert or delete or update of content, file_name, file_url, is_deleted
  on public.messages
  for each row
  execute function public.refresh_chat_room_last_message();

update public.chat_rooms as room
set
  last_message_at = (
    select m.created_at
    from public.messages as m
    where m.room_id = room.id
      and coalesce(m.is_deleted, false) = false
    order by m.created_at desc nulls last, m.id desc
    limit 1
  ),
  last_message_preview = (
    select left(
      coalesce(
        nullif(btrim(m.content), ''),
        nullif(btrim(m.file_name), ''),
        '(file)'
      ),
      80
    )
    from public.messages as m
    where m.room_id = room.id
      and coalesce(m.is_deleted, false) = false
    order by m.created_at desc nulls last, m.id desc
    limit 1
  );
