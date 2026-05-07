-- Link personal todos back to their source chat message.

alter table public.todos
  add column if not exists source_message_id text null,
  add column if not exists source_room_id text null;

create index if not exists idx_todos_source_message
  on public.todos(user_id, source_room_id, source_message_id)
  where source_message_id is not null;
