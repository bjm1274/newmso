-- HR 1단계: 근태·휴가·근무형태 DB 스키마
-- 실행: Supabase SQL Editor에서 실행 (companies, staff_members 테이블 존재 가정)

-- 1. 근무형태 (work_shifts)
CREATE TABLE IF NOT EXISTS work_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  company_name TEXT, -- 박철홍정형외과, SY INC., 수연의원 등
  name TEXT NOT NULL,
  start_time TIME NOT NULL DEFAULT '09:00',
  end_time TIME NOT NULL DEFAULT '18:00',
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 근태 기록 (attendances)
CREATE TABLE IF NOT EXISTS attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  company_id UUID,
  company_name TEXT,
  work_date DATE NOT NULL,
  check_in_time TIMESTAMPTZ,
  check_out_time TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent','late','early_leave','sick_leave','annual_leave','holiday','half_leave')),
  work_hours_minutes INT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_attendances_staff_date ON attendances(staff_id, work_date);
CREATE INDEX IF NOT EXISTS idx_attendances_work_date ON attendances(work_date);
CREATE INDEX IF NOT EXISTS idx_attendances_company ON attendances(company_id);

-- 3. 휴가 신청 (leave_requests)
CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  company_id UUID,
  company_name TEXT,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('연차','반차','병가','경조','특별휴가','기타')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT '대기' CHECK (status IN ('대기','승인','반려')),
  approved_by UUID REFERENCES staff_members(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_staff ON leave_requests(staff_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON leave_requests(start_date, end_date);

-- 4. work_shifts 초기 데이터 (이미 존재 시 스킵)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM work_shifts LIMIT 1) THEN
    INSERT INTO work_shifts (company_name, name, start_time, end_time, description) VALUES
      ('SY INC.', '데이(일반)', '09:00', '18:00', '일반 행정/외래 근무 (휴게 1시간 포함)'),
      ('박철홍정형외과', '나이트전담', '23:00', '08:00', '입원병동 야간 전담 근무'),
      ('수연의원', '스윙(중간근무)', '13:00', '22:00', '외래/수술 연계 중간 근무');
  END IF;
END $$;
