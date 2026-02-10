-- 인사/급여 고도화 전체 기능 마이그레이션
-- 실행: Supabase SQL Editor

-- 1. 급여월 마감 잠금
CREATE TABLE IF NOT EXISTS payroll_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month VARCHAR(7) NOT NULL,
  company_name TEXT DEFAULT '전체',
  locked_at TIMESTAMPTZ DEFAULT NOW(),
  locked_by UUID REFERENCES staff_members(id),
  memo TEXT,
  UNIQUE(year_month, company_name)
);

-- 2. 급여 변경 이력
CREATE TABLE IF NOT EXISTS salary_change_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL CHECK (change_type IN ('base_salary','meal','vehicle','childcare','research','position_allowance','other')),
  before_value BIGINT,
  after_value BIGINT,
  effective_date DATE NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES staff_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_salary_change_staff ON salary_change_history(staff_id);
CREATE INDEX IF NOT EXISTS idx_salary_change_date ON salary_change_history(effective_date);

-- 3. 입사/퇴사 온보딩 체크리스트
CREATE TABLE IF NOT EXISTS onboarding_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  checklist_type TEXT NOT NULL CHECK (checklist_type IN ('입사','퇴사')),
  items JSONB NOT NULL DEFAULT '[]',  -- [{label, done, done_at}]
  target_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, checklist_type)
);
CREATE INDEX IF NOT EXISTS idx_onboarding_staff ON onboarding_checklists(staff_id);

-- 4. 인사이동 이력
CREATE TABLE IF NOT EXISTS staff_transfer_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  transfer_type TEXT NOT NULL CHECK (transfer_type IN ('부서이동','직급변경','직책변경','발령')),
  before_value TEXT,
  after_value TEXT,
  effective_date DATE NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES staff_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transfer_staff ON staff_transfer_history(staff_id);

-- 5. 교육·자격 현황
CREATE TABLE IF NOT EXISTS staff_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  issuer TEXT,
  issue_date DATE,
  expiry_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_certs_staff ON staff_certifications(staff_id);

-- 6. 세율·보험요율 버전
CREATE TABLE IF NOT EXISTS tax_insurance_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_year INT NOT NULL,
  company_name TEXT DEFAULT '전체',
  national_pension_rate DECIMAL(5,4) DEFAULT 0.045,
  health_insurance_rate DECIMAL(5,4) DEFAULT 0.03545,
  long_term_care_rate DECIMAL(5,4) DEFAULT 0.00459,
  employment_insurance_rate DECIMAL(5,4) DEFAULT 0.009,
  income_tax_bracket JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(effective_year, company_name)
);

-- 7. 알림톡/메일 템플릿
CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_type TEXT NOT NULL CHECK (template_type IN ('급여명세','휴가승인','휴가반려','입사안내','퇴사안내','기타')),
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  variables JSONB DEFAULT '[]',  -- [{name: "name", desc: "직원명"}]
  is_active BOOLEAN DEFAULT true,
  company_name TEXT DEFAULT '전체',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. 교대제 패턴 (work_shifts 확장용)
ALTER TABLE work_shifts ADD COLUMN IF NOT EXISTS shift_type TEXT DEFAULT 'day';  -- day, swing, night, custom
ALTER TABLE work_shifts ADD COLUMN IF NOT EXISTS rotation_days INT;  -- 2교대: 1, 3교대: 1
ALTER TABLE work_shifts ADD COLUMN IF NOT EXISTS rest_days_after INT DEFAULT 0;

-- 9. staff_members 보완
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS joined_at DATE;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS resigned_at DATE;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS bank_account TEXT;

-- joined_at 백필 (join_date가 있으면)
UPDATE staff_members SET joined_at = join_date WHERE joined_at IS NULL AND join_date IS NOT NULL;

-- 10. 세율/보험 초기 데이터
INSERT INTO tax_insurance_rates (effective_year, company_name)
SELECT 2025, '전체'
WHERE NOT EXISTS (SELECT 1 FROM tax_insurance_rates WHERE effective_year = 2025 AND company_name = '전체');
INSERT INTO tax_insurance_rates (effective_year, company_name)
SELECT 2024, '전체'
WHERE NOT EXISTS (SELECT 1 FROM tax_insurance_rates WHERE effective_year = 2024 AND company_name = '전체');
