-- 직원별 월간 희망오프 설정 테이블
CREATE TABLE IF NOT EXISTS staff_preferred_off (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  year_month VARCHAR(7) NOT NULL, -- '2026-04'
  preferred_weekdays INTEGER[] DEFAULT '{}', -- 0=일,1=월,...,6=토
  preferred_dates TEXT[] DEFAULT '{}',       -- ['2026-04-05','2026-04-12']
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_staff_preferred_off_staff_id ON staff_preferred_off(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_preferred_off_year_month ON staff_preferred_off(year_month);

-- 월별 회사 기본 휴무일 수 및 직원별 오버라이드 테이블
CREATE TABLE IF NOT EXISTS monthly_off_quota (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  year_month VARCHAR(7) NOT NULL, -- '2026-04'
  default_off_days INTEGER NOT NULL DEFAULT 8, -- 기본 휴무일 수
  staff_overrides JSONB DEFAULT '{}',          -- {staff_id: days}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company, year_month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_off_quota_company ON monthly_off_quota(company);
CREATE INDEX IF NOT EXISTS idx_monthly_off_quota_year_month ON monthly_off_quota(year_month);

-- RLS 활성화 (기존 정책과 동일 수준)
ALTER TABLE staff_preferred_off ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_off_quota ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자 전체 허용 (기존 패턴과 동일)
DROP POLICY IF EXISTS "authenticated_all_staff_preferred_off" ON staff_preferred_off;
CREATE POLICY "authenticated_all_staff_preferred_off"
  ON staff_preferred_off FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_monthly_off_quota" ON monthly_off_quota;
CREATE POLICY "authenticated_all_monthly_off_quota"
  ON monthly_off_quota FOR ALL TO authenticated USING (true) WITH CHECK (true);
