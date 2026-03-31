-- OP check 타임스탬프 컬럼 추가:
-- 수술 시작/종료 시간, 병동 메시지 발송 시간

alter table public.op_patient_checks
  add column if not exists surgery_started_at timestamptz null,
  add column if not exists surgery_ended_at   timestamptz null,
  add column if not exists ward_message_sent_at timestamptz null;

comment on column public.op_patient_checks.surgery_started_at   is '수술 시작 시각 (수술중 상태 전환 시 자동 기록)';
comment on column public.op_patient_checks.surgery_ended_at     is '수술 종료 시각 (완료 상태 전환 시 자동 기록)';
comment on column public.op_patient_checks.ward_message_sent_at is '병동팀 메시지 발송 시각';

create index if not exists idx_op_patient_checks_started_at
  on public.op_patient_checks(surgery_started_at desc)
  where surgery_started_at is not null;
