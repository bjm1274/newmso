alter table public.staff_members
  add column if not exists birth_date date,
  add column if not exists permissions jsonb not null default '{}'::jsonb,
  add column if not exists presence_status varchar(20) not null default 'offline',
  add column if not exists last_seen_at timestamptz;

alter table public.approvals
  add column if not exists sender_department varchar(50),
  add column if not exists approver_line jsonb;

update public.approvals
set approver_line = meta_data -> 'approver_line'
where approver_line is null
  and jsonb_typeof(meta_data -> 'approver_line') = 'array';
