-- ============================================================
-- 2026-05-11_002_job_categories.sql
-- 직종 분류 테이블 및 직원-직종 매핑 테이블 생성 (idempotent)
-- ============================================================

-- 직종 마스터 테이블
CREATE TABLE IF NOT EXISTS job_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  is_medical_staff BOOLEAN DEFAULT TRUE,
  display_order   INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 직원-직종 매핑 테이블 (N:M)
CREATE TABLE IF NOT EXISTS staff_job_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  job_category_id UUID NOT NULL REFERENCES job_categories(id),
  is_primary      BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (staff_id, job_category_id)
);

-- --------------------------------------------------------
-- 인덱스 (idempotent)
-- --------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_staff_job_categories_staff_id
  ON staff_job_categories (staff_id);

CREATE INDEX IF NOT EXISTS idx_staff_job_categories_job_category_id
  ON staff_job_categories (job_category_id);
