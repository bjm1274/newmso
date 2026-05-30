-- ============================================================
-- 0008_leave_accruals.sql  (D1 / SQLite)
-- 연차 자동발생·대체휴무 부여 원장 (멱등성 + 감사)
-- kind: 'monthly' | 'annual' | 'substitute'
-- UNIQUE(staff_id, kind, period_key) 로 동일 기간 중복 부여 차단
-- ============================================================
CREATE TABLE IF NOT EXISTS leave_accruals (
  id           TEXT PRIMARY KEY NOT NULL,
  staff_id     TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  company_id   TEXT,
  kind         TEXT NOT NULL,
  period_key   TEXT NOT NULL,
  days         REAL NOT NULL,
  year         INTEGER NOT NULL,
  source_date  TEXT,
  note         TEXT,
  created_at   TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_accruals_unique
  ON leave_accruals (staff_id, kind, period_key);

CREATE INDEX IF NOT EXISTS idx_leave_accruals_staff
  ON leave_accruals (staff_id);
