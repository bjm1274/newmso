-- 퇴직자 중간정산 + 비과세 항목 설정 고도화

-- 1. payroll_records에 record_type, severance_pay 추가
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll_records' AND column_name = 'record_type') THEN
    ALTER TABLE payroll_records ADD COLUMN record_type VARCHAR(20) DEFAULT 'regular';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll_records' AND column_name = 'severance_pay') THEN
    ALTER TABLE payroll_records ADD COLUMN severance_pay BIGINT DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll_records' AND column_name = 'settlement_reason') THEN
    ALTER TABLE payroll_records ADD COLUMN settlement_reason TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll_records' AND column_name = 'settlement_date') THEN
    ALTER TABLE payroll_records ADD COLUMN settlement_date DATE;
  END IF;
END $$;

-- 2. 비과세 항목 설정 테이블 (회사별 법정 한도 커스터마이즈)
CREATE TABLE IF NOT EXISTS tax_free_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT '전체',
  meal_limit BIGINT DEFAULT 200000,
  vehicle_limit BIGINT DEFAULT 200000,
  childcare_limit BIGINT DEFAULT 100000,
  research_limit BIGINT DEFAULT 200000,
  uniform_limit BIGINT DEFAULT 300000,
  congratulations_limit BIGINT DEFAULT 500000,
  housing_limit BIGINT DEFAULT 700000,
  other_taxfree_limit BIGINT DEFAULT 0,
  effective_year INT DEFAULT 2025,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_name, effective_year)
);

-- 초기 데이터 (전체 회사 기본값)
INSERT INTO tax_free_settings (company_name, effective_year)
SELECT '전체', 2025
WHERE NOT EXISTS (SELECT 1 FROM tax_free_settings WHERE company_name = '전체' AND effective_year = 2025);
