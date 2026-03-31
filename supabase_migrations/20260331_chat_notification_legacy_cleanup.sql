drop trigger if exists tr_messages_to_notifications on public.messages;
drop function if exists public.create_message_notification();

with ranked_chat_notifications as (
  select
    id,
    row_number() over (
      partition by
        user_id,
        coalesce(metadata->>'message_id', metadata->>'id', ''),
        coalesce(metadata->>'room_id', '')
      order by
        case when coalesce(metadata->>'dedupe_key', '') <> '' then 0 else 1 end,
        created_at asc,
        id asc
    ) as rn
  from public.notifications
  where type in ('message', 'mention')
    and coalesce(metadata->>'message_id', metadata->>'id', '') <> ''
)
delete from public.notifications n
using ranked_chat_notifications r
where n.id = r.id
  and r.rn > 1;

update public.notifications
set metadata = coalesce(metadata, '{}'::jsonb)
  || jsonb_build_object(
    'message_id', coalesce(metadata->>'message_id', metadata->>'id'),
    'id', coalesce(metadata->>'id', metadata->>'message_id'),
    'dedupe_key', coalesce(
      nullif(metadata->>'dedupe_key', ''),
      'chat:' || coalesce(metadata->>'message_id', metadata->>'id') || ':' || user_id::text
    )
  )
where type in ('message', 'mention')
  and coalesce(metadata->>'message_id', metadata->>'id', '') <> '';
