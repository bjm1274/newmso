create table if not exists public.chat_room_prefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.staff_members(id) on delete cascade,
  room_id uuid not null,
  pinned boolean not null default false,
  hidden boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, room_id)
);

create index if not exists idx_chat_room_prefs_user_id
on public.chat_room_prefs(user_id);

create index if not exists idx_chat_room_prefs_room_id
on public.chat_room_prefs(room_id);

alter table public.messages
  add column if not exists sender_name varchar(50),
  add column if not exists file_name text,
  add column if not exists message_type varchar(20);

update public.messages as messages
set sender_name = staff_members.name
from public.staff_members
where messages.sender_name is null
  and messages.sender_id = staff_members.id
  and nullif(btrim(staff_members.name), '') is not null;

update public.messages
set message_type = case
  when coalesce(nullif(btrim(file_kind), ''), '') = 'image' then 'image'
  when coalesce(nullif(btrim(file_kind), ''), '') = 'video' then 'file'
  when coalesce(nullif(btrim(file_kind), ''), '') = 'file' then 'file'
  else 'text'
end
where message_type is null;

alter table public.messages
  alter column message_type set default 'text';
