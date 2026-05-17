-- =====================================================================
-- Migration 0001: dual-write upsert를 위한 unique index 보완
--
-- 배경: Phase 2.7에서 server-approval-processing.ts의 attendance/attendances/
-- attendance_corrections upsert와 roster-policy-storage.ts의 roster_policy_settings
-- upsert를 D1에 미러하려면 onConflict 절을 사용해야 하는데, 자동 introspect한
-- D1 스키마에는 unique index가 누락되어 있었음.
--
-- Supabase Postgres에서는 이 인덱스들이 존재하는 것으로 가정해 코드가 동작했음.
-- D1 production data 적용 전(빈 상태)에 안전하게 추가.
-- =====================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_staff_date_unique
  ON attendance (staff_id, date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendances_staff_date_unique
  ON attendances (staff_id, work_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_corrections_staff_date_unique
  ON attendance_corrections (staff_id, attendance_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_roster_policy_settings_type_id_unique
  ON roster_policy_settings (policy_type, policy_id);
