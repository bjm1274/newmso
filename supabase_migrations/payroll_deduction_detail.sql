-- 공제 상세 저장 (국민연금·건강·장기요양·고용·소득세·지방세 항목별)
-- 학습 문서 §8 공제 / §14.3 참고

ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS deduction_detail JSONB DEFAULT '{}';

COMMENT ON COLUMN payroll_records.deduction_detail IS '공제 항목별 금액: national_pension, health_insurance, long_term_care, employment_insurance, income_tax, local_tax';
