-- 근로계약서 연동: 근무형태 휴게시간, 직원 직책수당, 계약서 급여/통상임금 표시용 컬럼
-- Supabase SQL Editor에서 실행

-- work_shifts: 휴게시간(분)
ALTER TABLE work_shifts ADD COLUMN IF NOT EXISTS break_minutes INT DEFAULT 60;

-- staff_members: 직책수당 (계약/급여 연동)
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS position_allowance BIGINT DEFAULT 0;

-- employment_contracts: 서명대기/완료, 요청일, 서명일, 서명데이터, 급여 스냅샷(통상임금 표용)
ALTER TABLE employment_contracts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT '대기';
ALTER TABLE employment_contracts ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ;
ALTER TABLE employment_contracts ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;
ALTER TABLE employment_contracts ADD COLUMN IF NOT EXISTS signature_data TEXT;
ALTER TABLE employment_contracts ADD COLUMN IF NOT EXISTS base_salary BIGINT DEFAULT 0;
ALTER TABLE employment_contracts ADD COLUMN IF NOT EXISTS meal_allowance BIGINT DEFAULT 0;
ALTER TABLE employment_contracts ADD COLUMN IF NOT EXISTS vehicle_allowance BIGINT DEFAULT 0;
ALTER TABLE employment_contracts ADD COLUMN IF NOT EXISTS childcare_allowance BIGINT DEFAULT 0;
ALTER TABLE employment_contracts ADD COLUMN IF NOT EXISTS research_allowance BIGINT DEFAULT 0;
ALTER TABLE employment_contracts ADD COLUMN IF NOT EXISTS other_taxfree BIGINT DEFAULT 0;
ALTER TABLE employment_contracts ADD COLUMN IF NOT EXISTS position_allowance BIGINT DEFAULT 0;
ALTER TABLE employment_contracts ADD COLUMN IF NOT EXISTS effective_date DATE;

SELECT 'work_shift_break_and_contract_columns done' AS status;
