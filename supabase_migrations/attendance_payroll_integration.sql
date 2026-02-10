-- 근태·급여 연동 마이그레이션
-- 실행: Supabase SQL Editor

-- 1. 근태 차감 규칙 설정 (회사별)
CREATE TABLE IF NOT EXISTS attendance_deduction_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT '전체',
  -- 지각: 'hourly' = 시급×시간, 'fixed' = 회당 고정금액
  late_deduction_type TEXT NOT NULL DEFAULT 'fixed' CHECK (late_deduction_type IN ('hourly', 'fixed')),
  late_deduction_amount INT DEFAULT 10000,  -- fixed일 때 회당 금액(원)
  -- 조퇴: 동일
  early_leave_deduction_type TEXT NOT NULL DEFAULT 'fixed' CHECK (early_leave_deduction_type IN ('hourly', 'fixed')),
  early_leave_deduction_amount INT DEFAULT 10000,
  -- 결근: 일당 차감 (기본급/근로일수)
  absent_use_daily_rate BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_name)
);

-- 2. staff_members base_salary 확인
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'staff_members') THEN
    ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS base_salary BIGINT DEFAULT 0;
    ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS join_date DATE;
  END IF;
END $$;

-- 3. payroll_records에 근태 차감 필드
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payroll_records') THEN
    ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS attendance_deduction BIGINT DEFAULT 0;
    ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS attendance_deduction_detail JSONB;  -- { late: 2회 20000, absent: 1일 50000 }
  END IF;
END $$;

-- 4. 초기 규칙 (전체)
INSERT INTO attendance_deduction_rules (company_name, late_deduction_type, late_deduction_amount, early_leave_deduction_type, early_leave_deduction_amount)
VALUES ('전체', 'fixed', 10000, 'fixed', 10000)
ON CONFLICT (company_name) DO NOTHING;
