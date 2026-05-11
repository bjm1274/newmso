-- ============================================================
-- 2026-05-11_005_staff_shift_assignments.sql
-- 직원별 근무조 배정 테이블 생성 (idempotent)
-- ============================================================
-- 전제: work_shifts 테이블이 존재해야 함.
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name = 'work_shifts';
-- ============================================================

CREATE TABLE IF NOT EXISTS staff_shift_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  shift_id      UUID NOT NULL REFERENCES work_shifts(id),
  is_primary    BOOLEAN DEFAULT FALSE,
  priority      INT DEFAULT 0,
  effective_from DATE,
  effective_to   DATE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (staff_id, shift_id)
);

-- --------------------------------------------------------
-- 인덱스 (idempotent)
-- --------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_staff_shift_assignments_staff_id
  ON staff_shift_assignments (staff_id);

CREATE INDEX IF NOT EXISTS idx_staff_shift_assignments_staff_id_is_primary
  ON staff_shift_assignments (staff_id, is_primary);

CREATE INDEX IF NOT EXISTS idx_staff_shift_assignments_shift_id
  ON staff_shift_assignments (shift_id);
