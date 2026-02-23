-- 당직수당(야간) 비과세 항목 추가 (참고 자료 구조 반영)
-- staff_members: 기본값(월별 고정 당직수당), payroll_records: 해당 월 입력/정산값

ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS night_duty_allowance BIGINT DEFAULT 0;
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS night_duty_allowance BIGINT DEFAULT 0;

COMMENT ON COLUMN staff_members.night_duty_allowance IS '당직수당(야간) 비과세 - 월 기본값';
COMMENT ON COLUMN payroll_records.night_duty_allowance IS '당직수당(야간) 비과세 - 해당 월 정산값';
