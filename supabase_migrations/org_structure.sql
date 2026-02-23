-- 조직도 구조: 병원장 → 진료부/간호부/총무부 → 팀

CREATE TABLE IF NOT EXISTS org_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT '전체',
  division TEXT NOT NULL CHECK (division IN ('진료부','간호부','총무부')),
  team_name TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_name, division, team_name)
);

-- 병원 기본 팀 구조
INSERT INTO org_teams (company_name, division, team_name, sort_order) VALUES
  ('박철홍정형외과', '진료부', '진료팀', 1),
  ('박철홍정형외과', '간호부', '병동팀', 1),
  ('박철홍정형외과', '간호부', '수술팀', 2),
  ('박철홍정형외과', '간호부', '외래팀', 3),
  ('박철홍정형외과', '간호부', '외래간호팀', 4),
  ('박철홍정형외과', '간호부', '검사팀', 5),
  ('박철홍정형외과', '총무부', '원무팀', 1),
  ('박철홍정형외과', '총무부', '총무팀', 2),
  ('박철홍정형외과', '총무부', '행정팀', 3),
  ('박철홍정형외과', '총무부', '관리팀', 4)
ON CONFLICT (company_name, division, team_name) DO NOTHING;

INSERT INTO org_teams (company_name, division, team_name, sort_order) VALUES
  ('수연의원', '진료부', '진료팀', 1),
  ('수연의원', '간호부', '간호팀', 1),
  ('수연의원', '총무부', '원무팀', 1),
  ('SY INC.', '진료부', '경영지원팀', 1),
  ('SY INC.', '진료부', '재무팀', 2),
  ('SY INC.', '간호부', '인사팀', 1),
  ('SY INC.', '총무부', '전략기획팀', 1),
  ('SY INC.', '총무부', '마케팅팀', 2)
ON CONFLICT (company_name, division, team_name) DO NOTHING;
