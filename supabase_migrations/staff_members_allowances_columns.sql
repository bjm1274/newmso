-- 직원 등록/수정 시 사용하는 컬럼 추가 (night_duty_allowance, position_allowance)
-- 오류: Could not find the 'night_duty_allowance' column of 'staff_members'
-- 실행: Supabase Dashboard > SQL Editor > New query > 붙여넣기 > Run

-- staff_members: 당직수당(야간) 비과세
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS night_duty_allowance BIGINT DEFAULT 0;
COMMENT ON COLUMN staff_members.night_duty_allowance IS '당직수당(야간) 비과세 - 월 기본값';

-- staff_members: 직책수당
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS position_allowance BIGINT DEFAULT 0;
COMMENT ON COLUMN staff_members.position_allowance IS '직책수당 (월)';

-- payroll_records: 당직수당(야간) - 급여정산 시 사용
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS night_duty_allowance BIGINT DEFAULT 0;
COMMENT ON COLUMN payroll_records.night_duty_allowance IS '당직수당(야간) 비과세 - 해당 월 정산값';
