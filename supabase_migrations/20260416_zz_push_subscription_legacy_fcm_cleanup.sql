delete from public.push_subscriptions legacy
using public.push_subscriptions current
where legacy.staff_id is not null
  and current.staff_id = legacy.staff_id
  and current.id <> legacy.id
  and current.fcm_token is not null
  and btrim(current.fcm_token) <> ''
  and current.device_id is not null
  and btrim(current.device_id) <> ''
  and legacy.fcm_token is not null
  and btrim(legacy.fcm_token) <> ''
  and legacy.device_id is null;
