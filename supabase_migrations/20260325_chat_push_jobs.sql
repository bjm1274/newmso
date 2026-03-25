create table if not exists public.chat_push_jobs (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  sender_id uuid null references public.staff_members(id) on delete set null,
  created_at timestamptz not null default now(),
  processing_started_at timestamptz null,
  processed_at timestamptz null,
  attempt_count integer not null default 0,
  last_error text null
);

create unique index if not exists idx_chat_push_jobs_message_id
  on public.chat_push_jobs(message_id);

create index if not exists idx_chat_push_jobs_pending
  on public.chat_push_jobs(processed_at, created_at);

create or replace function public.enqueue_chat_push_job()
returns trigger
language plpgsql
as $$
begin
  insert into public.chat_push_jobs (message_id, room_id, sender_id, created_at)
  values (new.id, new.room_id, new.sender_id, coalesce(new.created_at, now()))
  on conflict (message_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trigger_messages_enqueue_chat_push on public.messages;
create trigger trigger_messages_enqueue_chat_push
  after insert on public.messages
  for each row
  execute procedure public.enqueue_chat_push_job();
