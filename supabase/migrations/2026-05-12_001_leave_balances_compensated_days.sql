-- ============================================================
-- 2026-05-12_001_leave_balances_compensated_days.sql
-- 미사용연차 수당지급 일수 컬럼 추가 (idempotent)
-- ============================================================
-- 목적:
--   잔여연차 산정 공식을
--     remaining = total - used - expired - compensated
--   로 확장. expired(촉진 후 소멸)와 compensated(회사가 수당으로
--   지급한 일수)를 분리해 회계 추적성 확보.
-- ============================================================

ALTER TABLE leave_balances
  ADD COLUMN IF NOT EXISTS compensated_days NUMERIC(5, 2) DEFAULT 0;

ALTER TABLE leave_balances
  ADD COLUMN IF NOT EXISTS compensated_at TIMESTAMPTZ;

COMMENT ON COLUMN leave_balances.compensated_days IS
  '미사용 연차 수당으로 지급된 일수. 잔여=total-used-expired-compensated.';
COMMENT ON COLUMN leave_balances.compensated_at IS
  '수당 지급 처리 시각 (NULL이면 미지급)';
