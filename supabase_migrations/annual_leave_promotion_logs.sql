-- 연차 촉진 알림 발송 이력 로그
create table if not exists annual_leave_promotion_logs (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_members(id) on delete cascade,
  company_name text,
  target_year integer not null,
  step smallint not null check (step in (1, 2)),
  sent_at timestamptz not null default now(),
  remain_days numeric,
  meta jsonb
);

create index if not exists idx_annual_leave_promotion_logs_staff_year
  on annual_leave_promotion_logs (staff_id, target_year, step);

