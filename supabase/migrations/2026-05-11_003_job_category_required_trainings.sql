-- ============================================================
-- 2026-05-11_003_job_category_required_trainings.sql
-- 직종별 필수 교육 항목 테이블 생성 (idempotent)
-- ============================================================
-- 설계 규칙:
--   applies_to_all = TRUE  → job_category_id 는 NULL 허용 (전 직종 공통)
--   applies_to_all = FALSE → job_category_id 는 NOT NULL 이어야 함
--   CHECK 제약으로 obligation_type 값 강제
-- ============================================================

CREATE TABLE IF NOT EXISTS job_category_required_trainings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_category_id UUID REFERENCES job_categories(id),
  applies_to_all  BOOLEAN DEFAULT FALSE,
  training_code   TEXT NOT NULL,
  training_name   TEXT NOT NULL,
  cycle_months    INT,
  mandatory       BOOLEAN DEFAULT TRUE,
  obligation_type TEXT NOT NULL DEFAULT 'legal',
  legal_basis     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  -- obligation_type 허용 값 제한
  CONSTRAINT chk_obligation_type
    CHECK (obligation_type IN ('legal', 'recommended')),

  -- applies_to_all=FALSE 이면 job_category_id 필수
  CONSTRAINT chk_job_category_required
    CHECK (
      applies_to_all = TRUE
      OR job_category_id IS NOT NULL
    )
);

-- --------------------------------------------------------
-- 인덱스 (idempotent)
-- --------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_jcrt_job_category_id
  ON job_category_required_trainings (job_category_id);

CREATE INDEX IF NOT EXISTS idx_jcrt_applies_to_all
  ON job_category_required_trainings (applies_to_all);
