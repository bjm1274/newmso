-- 간호/근무 스케줄 (공유캘린더·간호근무표)
-- 미존재 시 무음 실패 방지용 최소 스키마
CREATE TABLE IF NOT EXISTS nurse_schedules (
  id TEXT PRIMARY KEY NOT NULL,
  staff_id TEXT,
  staff_name TEXT,
  company TEXT,
  department TEXT,
  year_month TEXT NOT NULL,
  day INTEGER,
  shift_code TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_nurse_schedules_ym ON nurse_schedules (year_month);
CREATE INDEX IF NOT EXISTS idx_nurse_schedules_staff_ym ON nurse_schedules (staff_id, year_month);

ALTER TABLE nurse_schedules ADD COLUMN staff_name TEXT;
ALTER TABLE nurse_schedules ADD COLUMN company TEXT;
ALTER TABLE nurse_schedules ADD COLUMN department TEXT;
ALTER TABLE nurse_schedules ADD COLUMN notes TEXT;
ALTER TABLE nurse_schedules ADD COLUMN updated_at TEXT DEFAULT (CURRENT_TIMESTAMP);
