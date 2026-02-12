-- 홈페이지 팝업(popups) 테이블 및 스토리지 전제 설정

-- 1) 홈페이지 팝업 테이블
CREATE TABLE IF NOT EXISTS popups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  media_url TEXT,
  media_type TEXT DEFAULT 'image', -- 'image' | 'video'
  width INT DEFAULT 400,
  height INT DEFAULT 500,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) 향후 확장을 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_popups_active_created
  ON popups(is_active, created_at DESC);

SELECT 'popups_setup done' AS status;

