alter table public.push_subscriptions
  add column if not exists fcm_token text,
  add column if not exists device_id text,
  add column if not exists platform text,
  add column if not exists user_agent text;

update public.push_subscriptions
set fcm_token = null
where fcm_token is not null
  and btrim(fcm_token) = '';

update public.push_subscriptions
set device_id = null
where device_id is not null
  and btrim(device_id) = '';

with ranked_staff_endpoint as (
  select
    id,
    row_number() over (
      partition by staff_id, endpoint
      order by coalesce(created_at, 'epoch'::timestamptz) desc, id desc
    ) as rn
  from public.push_subscriptions
  where staff_id is not null
    and endpoint is not null
)
delete from public.push_subscriptions p
using ranked_staff_endpoint r
where p.id = r.id
  and r.rn > 1;

with ranked_fcm_token as (
  select
    id,
    row_number() over (
      partition by fcm_token
      order by coalesce(created_at, 'epoch'::timestamptz) desc, id desc
    ) as rn
  from public.push_subscriptions
  where fcm_token is not null
)
delete from public.push_subscriptions p
using ranked_fcm_token r
where p.id = r.id
  and r.rn > 1;

with ranked_staff_device as (
  select
    id,
    row_number() over (
      partition by staff_id, device_id
      order by coalesce(created_at, 'epoch'::timestamptz) desc, id desc
    ) as rn
  from public.push_subscriptions
  where staff_id is not null
    and device_id is not null
)
delete from public.push_subscriptions p
using ranked_staff_device r
where p.id = r.id
  and r.rn > 1;

create unique index if not exists idx_push_subscriptions_staff_endpoint
  on public.push_subscriptions (staff_id, endpoint);

create unique index if not exists idx_push_subscriptions_fcm_token_unique
  on public.push_subscriptions (fcm_token)
  where fcm_token is not null;

create unique index if not exists idx_push_subscriptions_staff_device_unique
  on public.push_subscriptions (staff_id, device_id)
  where staff_id is not null
    and device_id is not null;

create index if not exists idx_push_subscriptions_staff_id
  on public.push_subscriptions (staff_id);
