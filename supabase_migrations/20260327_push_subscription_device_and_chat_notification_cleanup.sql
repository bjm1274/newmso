alter table public.push_subscriptions
  add column if not exists device_id text,
  add column if not exists platform text,
  add column if not exists user_agent text;

create index if not exists idx_push_subscriptions_staff_device
  on public.push_subscriptions (staff_id, device_id)
  where device_id is not null;

drop trigger if exists tr_messages_to_notifications on public.messages;
drop function if exists public.create_message_notification();

with ranked_chat_notifications as (
  select
    id,
    row_number() over (
      partition by
        user_id,
        type,
        coalesce(metadata->>'message_id', metadata->>'id'),
        coalesce(metadata->>'room_id', '')
      order by created_at asc, id asc
    ) as rn
  from public.notifications
  where type in ('message', 'mention')
    and coalesce(metadata->>'message_id', metadata->>'id', '') <> ''
)
delete from public.notifications n
using ranked_chat_notifications r
where n.id = r.id
  and r.rn > 1;
