-- ============================================================
-- 2026-05-21_001_attendances_current_status.sql
-- 근무현황 6상태(휴게/점심/외근) 표시용 컬럼 추가 (idempotent)
-- ============================================================
-- 목적:
--   attendances 테이블은 출근/퇴근 시각만 기록해 근무 중 세부
--   상태(휴게·점심·외근)를 구분할 수 없었다. current_status로
--   근무현황 화면의 6상태 stat bar(근무중/휴게/점심/외근/퇴근/결근)를
--   채운다.
--
--   current_status: NULL = 일반 근무중, 'break' = 휴게,
--                   'lunch' = 점심, 'field' = 외근
--   퇴근/결근은 기존 check_out_time / 레코드 유무로 판별하므로
--   별도 값이 필요 없다.
-- ============================================================

ALTER TABLE attendances
  ADD COLUMN IF NOT EXISTS current_status TEXT;

ALTER TABLE attendances
  ADD COLUMN IF NOT EXISTS current_status_at TIMESTAMPTZ;

COMMENT ON COLUMN attendances.current_status IS
  '근무 중 세부 상태: break(휴게)/lunch(점심)/field(외근). NULL이면 일반 근무중.';
COMMENT ON COLUMN attendances.current_status_at IS
  '세부 상태로 전환한 시각.';
