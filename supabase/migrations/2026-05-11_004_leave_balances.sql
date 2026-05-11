-- ============================================================
-- 2026-05-11_004_leave_balances.sql
-- 연차 잔여 일수 테이블 생성 또는 컬럼 보완 (idempotent)
-- ============================================================
-- [마이그레이션 실행 전 점검 안내]
--
-- 아래 SQL로 기존 테이블 존재 여부를 먼저 확인하세요.
--   SELECT table_name
--   FROM information_schema.tables
--   WHERE table_schema = 'public'
--     AND table_name IN ('leave_balances', 'annual_leave_balances');
--
-- 결과에 따른 조치:
--   A) 둘 다 없음         → 이 파일을 그대로 실행 (신규 생성)
--   B) leave_balances만   → 이 파일을 그대로 실행 (IF NOT EXISTS 로 무해)
--   C) annual_leave_balances만 → 아래 ALTER 블록을 참고해 컬럼 보완 후,
--                                leave_balances 는 뷰/별칭으로 처리하거나
--                                테이블 이름 변경 결정 필요
--   D) 둘 다 있음         → 중복 여부 확인 후 사용자 결정 필요
--      예) SELECT COUNT(*) FROM annual_leave_balances;
--          SELECT COUNT(*) FROM leave_balances;
--
-- 이 파일은 case A/B 를 전제로 작성됨.
-- ============================================================

-- 신규 생성 (이미 있으면 무시)
CREATE TABLE IF NOT EXISTS leave_balances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  year            INT NOT NULL,
  total_days      NUMERIC(5, 2) DEFAULT 0,
  used_days       NUMERIC(5, 2) DEFAULT 0,
  remaining_days  NUMERIC(5, 2) DEFAULT 0,
  expiry_date     DATE,
  expired_days    NUMERIC(5, 2) DEFAULT 0,
  expired_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (staff_id, year)
);

-- --------------------------------------------------------
-- 기존 leave_balances 가 이미 있지만 컬럼이 누락된 경우 보완
-- (annual_leave_balances → leave_balances 로 통합한 케이스)
-- --------------------------------------------------------
ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS expiry_date     DATE;
ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS expired_days    NUMERIC(5, 2) DEFAULT 0;
ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS expired_at      TIMESTAMPTZ;
ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT NOW();

-- --------------------------------------------------------
-- 인덱스 (idempotent + 컬럼 존재 체크)
-- --------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'leave_balances'
      AND column_name = 'staff_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_leave_balances_staff_id
      ON leave_balances (staff_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'leave_balances'
      AND column_name = 'expiry_date'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_leave_balances_expiry_date
      ON leave_balances (expiry_date);
  END IF;
END $$;
