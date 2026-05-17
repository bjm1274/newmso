-- =====================================================================
-- Migration 0002: payroll_records dual-write upsert를 위한 unique index
--
-- 배경: lib/payroll-record-upsert.ts가 (staff_id, year_month, record_type)
-- 조합으로 upsert. Supabase Postgres에는 이미 unique 제약 존재.
-- D1 빈 상태에서 안전하게 추가.
-- =====================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_records_staff_ym_type_unique
  ON payroll_records (staff_id, year_month, record_type);
