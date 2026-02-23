-- 날짜별 근무형태 편성 (인사 근태에서 미리 입력, 게시판 등에서 열람)
CREATE TABLE IF NOT EXISTS shift_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  shift_id UUID REFERENCES work_shifts(id) ON DELETE SET NULL,
  company_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, work_date)
);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_work_date ON shift_assignments(work_date);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_staff ON shift_assignments(staff_id);
