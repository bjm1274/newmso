-- ============================================================
-- 2026-05-12_001_license_continuing_education.sql
-- 면허·자격 보수교육 이수증 제출 → 인사 검토 → OCR 기반 만료 연장 워크플로우
-- ============================================================

CREATE TABLE IF NOT EXISTS license_continuing_education (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id              UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  license_id            UUID REFERENCES staff_licenses(id) ON DELETE SET NULL,
  -- 직원이 제출 시 어떤 면허를 위한 것인지 표기 (license_id가 NULL이어도 백업 식별용)
  license_type_hint     TEXT,
  license_name_hint     TEXT,

  -- 첨부 파일
  file_url              TEXT NOT NULL,
  file_name             TEXT,

  -- 제출/검토 상태
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at          TIMESTAMPTZ DEFAULT NOW(),
  submitted_by          UUID REFERENCES staff_members(id) ON DELETE SET NULL,

  -- OCR 추출 결과
  ocr_text              TEXT,
  ocr_education_date    DATE,
  ocr_extracted_meta    JSONB,

  -- 인사 검토
  education_date        DATE,                  -- 최종 확정 교육일 (OCR 결과 또는 수기 입력)
  applied_expiry_date   DATE,                  -- 적용된 새 만료일
  applied_renewed_date  DATE,                  -- 적용된 새 갱신일 (= education_date)
  reject_reason         TEXT,
  reviewed_by           UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  reviewed_at           TIMESTAMPTZ,

  memo                  TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- 보강용 (이미 존재하는 환경 대비)
ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS license_id UUID REFERENCES staff_licenses(id) ON DELETE SET NULL;
ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS license_type_hint TEXT;
ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS license_name_hint TEXT;
ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS ocr_text TEXT;
ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS ocr_education_date DATE;
ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS ocr_extracted_meta JSONB;
ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS education_date DATE;
ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS applied_expiry_date DATE;
ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS applied_renewed_date DATE;
ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS reject_reason TEXT;
ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES staff_members(id) ON DELETE SET NULL;
ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS memo TEXT;
ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES staff_members(id) ON DELETE SET NULL;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_license_ce_staff_id        ON license_continuing_education (staff_id);
CREATE INDEX IF NOT EXISTS idx_license_ce_license_id      ON license_continuing_education (license_id);
CREATE INDEX IF NOT EXISTS idx_license_ce_status          ON license_continuing_education (status);
CREATE INDEX IF NOT EXISTS idx_license_ce_submitted_at    ON license_continuing_education (submitted_at DESC);

-- RLS (간단: 본인 또는 인사 권한자만 — 정책은 추후 application 단에서도 enforce)
ALTER TABLE license_continuing_education ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='license_continuing_education' AND policyname='ce_select_self_or_hr'
  ) THEN
    CREATE POLICY ce_select_self_or_hr ON license_continuing_education
      FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='license_continuing_education' AND policyname='ce_insert_self'
  ) THEN
    CREATE POLICY ce_insert_self ON license_continuing_education
      FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='license_continuing_education' AND policyname='ce_update_hr'
  ) THEN
    CREATE POLICY ce_update_hr ON license_continuing_education
      FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='license_continuing_education' AND policyname='ce_delete_self_or_hr'
  ) THEN
    CREATE POLICY ce_delete_self_or_hr ON license_continuing_education
      FOR DELETE USING (true);
  END IF;
END $$;
