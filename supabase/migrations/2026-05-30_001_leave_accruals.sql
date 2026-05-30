-- ============================================================
-- 2026-05-30_001_leave_accruals.sql  (Postgres / Supabase 파리티)
-- 연차 자동발생·대체휴무 부여 원장 (멱등성 + 감사)
-- ============================================================
CREATE TABLE IF NOT EXISTS leave_accruals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id     UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  company_id   UUID,
  kind         TEXT NOT NULL,          -- 'monthly' | 'annual' | 'substitute'
  period_key   TEXT NOT NULL,          -- monthly='YYYY-MM' | annual='annual:N' | substitute='YYYY-MM-DD'
  days         NUMERIC(5, 2) NOT NULL,
  year         INT NOT NULL,
  source_date  DATE,
  note         TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (staff_id, kind, period_key)
);

CREATE INDEX IF NOT EXISTS idx_leave_accruals_staff
  ON leave_accruals (staff_id);
