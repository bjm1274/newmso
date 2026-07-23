-- ?? ?? ?? ??
-- ? ???? ?? ??? ????? ????. leave_balances ?
-- staff_members.annual_leave_* ? ?? ?? ?? ?? ?? ??? ?????? ????.
CREATE TABLE IF NOT EXISTS leave_ledger (
  id          TEXT PRIMARY KEY NOT NULL,
  staff_id    TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  company_id  TEXT,
  entry_type  TEXT NOT NULL,
  days        REAL NOT NULL,
  occurred_on TEXT NOT NULL,
  period_key  TEXT NOT NULL,
  source_id   TEXT,
  note        TEXT,
  created_at  TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_ledger_staff_type_period
  ON leave_ledger (staff_id, entry_type, period_key);
CREATE INDEX IF NOT EXISTS idx_leave_ledger_staff_occurred_on
  ON leave_ledger (staff_id, occurred_on);
CREATE INDEX IF NOT EXISTS idx_leave_ledger_source
  ON leave_ledger (source_id);

-- ?? ?????????????? ??? ?? ???? ????.
-- annual/monthly? ?? ???? ????, manual/substitute? ?? ???? ????.
INSERT OR IGNORE INTO leave_ledger (
  id, staff_id, company_id, entry_type, days, occurred_on, period_key, source_id, note, created_at
)
SELECT
  'legacy-accrual:' || id,
  staff_id,
  company_id,
  CASE kind
    WHEN 'monthly' THEN 'auto_monthly'
    WHEN 'annual' THEN 'auto_annual'
    WHEN 'substitute' THEN 'substitute'
    ELSE 'manual_adjustment'
  END,
  days,
  COALESCE(source_date, substr(created_at, 1, 10), printf('%04d-01-01', year)),
  'legacy-accrual:' || kind || ':' || period_key,
  id,
  COALESCE(note, '?? ?? ?? ?? ??'),
  created_at
FROM leave_accruals;

-- ??? ?? ?? ?? ?? ?? ??? ????.
-- ?? ????(days)? ?? ?? ?? ????? 1?? ????, ???? ???? ??? ? ??.
INSERT OR IGNORE INTO leave_ledger (
  id, staff_id, company_id, entry_type, days, occurred_on, period_key, source_id, note, created_at
)
SELECT
  'legacy-request:' || id,
  staff_id,
  company_id,
  'use',
  -ABS(COALESCE(NULLIF(days, 0), 1)),
  substr(start_date, 1, 10),
  'request:' || id,
  id,
  '?? ?? ?? ?? ??',
  created_at
FROM leave_requests
WHERE status IN ('??', 'approved')
  AND leave_type NOT LIKE '%??%'
  AND leave_type LIKE '%??%';
