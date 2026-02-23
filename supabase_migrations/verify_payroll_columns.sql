-- payroll_records 새 컬럼 적용 여부 확인 (Supabase SQL Editor에서 실행)
-- 두 컬럼이 모두 있으면 1행 1열에 true 반환

SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'payroll_records' AND column_name = 'deduction_detail'
) AS deduction_detail_있음,
EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'payroll_records' AND column_name = 'advance_pay'
) AS advance_pay_있음;
