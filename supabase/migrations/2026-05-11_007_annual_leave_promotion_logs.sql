-- ============================================================
-- 2026-05-11_007_annual_leave_promotion_logs.sql
-- 연차촉진 알림 로그 테이블 생성 및 컬럼 보완 (idempotent)
-- ============================================================

-- 신규 생성 (이미 있으면 무시)
CREATE TABLE IF NOT EXISTS annual_leave_promotion_logs (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id                  UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  stage                     INT NOT NULL,   -- 1=1차촉진, 2=2차촉진, 3=소멸
  expiry_date               DATE NOT NULL,
  notified_at               TIMESTAMPTZ DEFAULT NOW(),
  plan_submitted_at         TIMESTAMPTZ,
  remaining_days_at_notice  NUMERIC(5, 2),
  notification_id           UUID,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (staff_id, stage, expiry_date)
);

-- --------------------------------------------------------
-- 기존 테이블이 이미 있지만 컬럼이 누락된 경우 보완 (NULLABLE 로 추가)
-- --------------------------------------------------------
ALTER TABLE annual_leave_promotion_logs
  ADD COLUMN IF NOT EXISTS stage                     INT;

ALTER TABLE annual_leave_promotion_logs
  ADD COLUMN IF NOT EXISTS expiry_date               DATE;

ALTER TABLE annual_leave_promotion_logs
  ADD COLUMN IF NOT EXISTS notified_at               TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE annual_leave_promotion_logs
  ADD COLUMN IF NOT EXISTS plan_submitted_at         TIMESTAMPTZ;

ALTER TABLE annual_leave_promotion_logs
  ADD COLUMN IF NOT EXISTS remaining_days_at_notice  NUMERIC(5, 2);

ALTER TABLE annual_leave_promotion_logs
  ADD COLUMN IF NOT EXISTS notification_id           UUID;

ALTER TABLE annual_leave_promotion_logs
  ADD COLUMN IF NOT EXISTS created_at                TIMESTAMPTZ DEFAULT NOW();

-- --------------------------------------------------------
-- 인덱스 (idempotent + 컬럼 존재 체크)
-- --------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'annual_leave_promotion_logs' AND column_name = 'staff_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_alpl_staff_id
      ON annual_leave_promotion_logs (staff_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'annual_leave_promotion_logs' AND column_name = 'expiry_date'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_alpl_expiry_date
      ON annual_leave_promotion_logs (expiry_date);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'annual_leave_promotion_logs' AND column_name = 'stage'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_alpl_stage
      ON annual_leave_promotion_logs (stage);
  END IF;
END $$;
