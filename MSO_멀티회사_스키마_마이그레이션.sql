-- ============================================================
-- SY INC. MSO 멀티회사(경영지원) 스키마 마이그레이션
-- 목적: 3~5개 회사(병원)를 회사별 데이터 분리로 관리, MSO는 통합 조회/설정
-- 실행: Supabase SQL Editor에서 순서대로 실행
-- ============================================================

-- 1. 회사 마스터
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('MSO','HOSPITAL','CLINIC')),
  mso_id UUID REFERENCES companies(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 기존 staff_members에 company_id, permissions, password 추가
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}';
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS password TEXT;

-- 3. 회사별 설정
CREATE TABLE IF NOT EXISTS company_settings (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  payroll_day INT NOT NULL DEFAULT 25,
  work_hours_per_week INT NOT NULL DEFAULT 40,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 회사별 휴가/연차 정책
CREATE TABLE IF NOT EXISTS leave_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL,
  accrual_rule JSONB NOT NULL DEFAULT '{}',
  promotion_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 직원별 연차 잔액 (회사별·연도별)
CREATE TABLE IF NOT EXISTS annual_leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  year INT NOT NULL,
  earned_days NUMERIC(5,2) NOT NULL DEFAULT 0,
  used_days NUMERIC(5,2) NOT NULL DEFAULT 0,
  remaining_days NUMERIC(5,2) NOT NULL DEFAULT 0,
  UNIQUE (company_id, staff_id, year)
);

-- 6. 연차사용촉진 이벤트 (법적 증거용)
CREATE TABLE IF NOT EXISTS leave_promotion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  year INT NOT NULL,
  phase INT NOT NULL CHECK (phase IN (1,2)),
  notice_sent_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  document_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, staff_id, year, phase)
);

-- 7. 급여 테이블 (company_id 포함)
CREATE TABLE IF NOT EXISTS payroll (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  base_salary NUMERIC(12,0) NOT NULL,
  overtime_pay NUMERIC(12,0) NOT NULL DEFAULT 0,
  allowances JSONB NOT NULL DEFAULT '[]'::jsonb,
  deductions JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_salary NUMERIC(12,0) NOT NULL,
  tax_amount NUMERIC(12,0) NOT NULL,
  insurance_amount NUMERIC(12,0) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT','CONFIRMED','PAID')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, staff_id, month)
);

-- 8. 기존 테이블에 company_id 추가 (선택적, 단계별 적용 가능)
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- 9. 초기 데이터: MSO + 병원 2곳 (이미 있으면 건너뜀)
INSERT INTO companies (name, type, mso_id, is_active)
SELECT 'SY INC.', 'MSO', NULL, true WHERE NOT EXISTS (SELECT 1 FROM companies WHERE name = 'SY INC.');
INSERT INTO companies (name, type, mso_id, is_active)
SELECT '박철홍정형외과', 'HOSPITAL', (SELECT id FROM companies WHERE name = 'SY INC.' LIMIT 1), true WHERE NOT EXISTS (SELECT 1 FROM companies WHERE name = '박철홍정형외과');
INSERT INTO companies (name, type, mso_id, is_active)
SELECT '수연의원', 'HOSPITAL', (SELECT id FROM companies WHERE name = 'SY INC.' LIMIT 1), true WHERE NOT EXISTS (SELECT 1 FROM companies WHERE name = '수연의원');

-- 10. staff_members company_id 백필 (회사명으로 매칭)
UPDATE staff_members sm SET company_id = (SELECT id FROM companies c WHERE c.name = sm.company LIMIT 1) WHERE sm.company_id IS NULL AND sm.company IS NOT NULL;

-- 11. 회사별 기본 설정
INSERT INTO company_settings (company_id, payroll_day, work_hours_per_week)
SELECT id, 25, 40 FROM companies ON CONFLICT (company_id) DO NOTHING;

-- 12. 인덱스 (회사별 조회 성능)
CREATE INDEX IF NOT EXISTS idx_staff_members_company_id ON staff_members(company_id);
CREATE INDEX IF NOT EXISTS idx_annual_leave_balances_company_year ON annual_leave_balances(company_id, year);
CREATE INDEX IF NOT EXISTS idx_payroll_company_month ON payroll(company_id, month);
CREATE INDEX IF NOT EXISTS idx_leave_promotion_events_company_year ON leave_promotion_events(company_id, year);
