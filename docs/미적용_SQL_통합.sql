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
