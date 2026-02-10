-- ============================================================================
-- SY INC. MSO - 미적용 SQL 통합 (한 번에 실행 가능)
-- 실행: Supabase Dashboard > SQL Editor > 붙여넣기 > Run
-- 작성일: 2025-02-10
-- ============================================================================

-- 1. staff_members 필수 컬럼 (로그인·권한·인사)
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}';
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS password TEXT;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS resident_no TEXT;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS license TEXT;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS bank_account TEXT;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS salary_info TEXT;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS joined_at DATE;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS resigned_at DATE;

-- 2. 조직도 - 회사별 팀 (병원장 → 진료부/간호부/총무부 → 팀)
CREATE TABLE IF NOT EXISTS org_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT '전체',
  division TEXT NOT NULL CHECK (division IN ('진료부','간호부','총무부')),
  team_name TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_name, division, team_name)
);

INSERT INTO org_teams (company_name, division, team_name, sort_order) VALUES
  ('박철홍정형외과', '진료부', '진료팀', 1),
  ('박철홍정형외과', '진료부', '외래팀', 2),
  ('박철홍정형외과', '간호부', '병동팀', 1),
  ('박철홍정형외과', '간호부', '수술팀', 2),
  ('박철홍정형외과', '간호부', '외래간호팀', 3),
  ('박철홍정형외과', '간호부', '검사팀', 4),
  ('박철홍정형외과', '총무부', '원무팀', 1),
  ('박철홍정형외과', '총무부', '총무팀', 2),
  ('박철홍정형외과', '총무부', '행정팀', 3),
  ('박철홍정형외과', '총무부', '관리팀', 4),
  ('수연의원', '진료부', '진료팀', 1),
  ('수연의원', '간호부', '간호팀', 1),
  ('수연의원', '총무부', '원무팀', 1),
  ('SY INC.', '진료부', '경영지원팀', 1),
  ('SY INC.', '진료부', '재무팀', 2),
  ('SY INC.', '간호부', '인사팀', 1),
  ('SY INC.', '총무부', '전략기획팀', 1),
  ('SY INC.', '총무부', '마케팅팀', 2)
ON CONFLICT (company_name, division, team_name) DO NOTHING;

-- 3. 법인카드 회사별 등록
CREATE TABLE IF NOT EXISTS corporate_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  card_nickname TEXT,
  last_four TEXT,
  issuer TEXT,
  holder_id UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_corporate_cards_company ON corporate_cards(company_name);

ALTER TABLE corporate_card_transactions ADD COLUMN IF NOT EXISTS card_id UUID REFERENCES corporate_cards(id) ON DELETE SET NULL;

-- Realtime (선택): Supabase > Database > Replication에서 corporate_card_transactions, corporate_cards 활성화
-- ALTER PUBLICATION supabase_realtime ADD TABLE corporate_card_transactions;
-- ALTER PUBLICATION supabase_realtime ADD TABLE corporate_cards;

-- 4. employment_contracts 전자계약·비과세 컬럼 (직원 로그인 시 즉시 서명 표시)
ALTER TABLE employment_contracts ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT '대기';
ALTER TABLE employment_contracts ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ;
ALTER TABLE employment_contracts ADD COLUMN IF NOT EXISTS signature_data TEXT;
ALTER TABLE employment_contracts ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;
ALTER TABLE employment_contracts ADD COLUMN IF NOT EXISTS base_salary BIGINT DEFAULT 0;
ALTER TABLE employment_contracts ADD COLUMN IF NOT EXISTS meal_allowance BIGINT DEFAULT 0;
ALTER TABLE employment_contracts ADD COLUMN IF NOT EXISTS vehicle_allowance BIGINT DEFAULT 0;
ALTER TABLE employment_contracts ADD COLUMN IF NOT EXISTS childcare_allowance BIGINT DEFAULT 0;
ALTER TABLE employment_contracts ADD COLUMN IF NOT EXISTS research_allowance BIGINT DEFAULT 0;
ALTER TABLE employment_contracts ADD COLUMN IF NOT EXISTS other_taxfree BIGINT DEFAULT 0;
ALTER TABLE employment_contracts ADD COLUMN IF NOT EXISTS effective_date DATE;
-- staff_id 1건당 1개 계약(서명대기) 유지용 unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_employment_contracts_staff_id ON employment_contracts(staff_id);

-- 5. 계약서 표준 양식 (관리자 편집·인사관리 연동)
CREATE TABLE IF NOT EXISTS contract_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT '전체',
  template_content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_name)
);
INSERT INTO contract_templates (company_name, template_content) VALUES
  ('전체', '[근로계약서 표준안]\n\n제1조(계약의 목적)\n본 계약은 근로기준법에 따라 사용자와 근로자 간의 근로조건을 정함을 목적으로 한다.\n\n제2조(근로계약기간)\n입사일로부터 정함이 없는 기간\n\n제3조(근무장소)\n소속 병원 내 지정 장소\n\n제4조(업무내용)\n채용 시 결정된 직무 및 부수 업무\n\n제5조(소정근로시간)\n주 40시간 (운영 스케줄에 따름)\n\n제6조(임금)\n연봉계약서 및 급여 규정에 따름\n\n[상기 내용을 확인하였으며 이에 동의합니다]')
ON CONFLICT (company_name) DO NOTHING;
