-- ============================================================
-- 2026-05-11_001_staff_licenses_enhance.sql
-- staff_licenses 테이블 생성/컬럼 보강 (idempotent)
-- 기존 테이블이 있더라도 누락 컬럼을 모두 ADD COLUMN IF NOT EXISTS
-- ============================================================

-- 신규 생성 (이미 있으면 무시)
CREATE TABLE IF NOT EXISTS staff_licenses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  license_type    TEXT,
  license_name    TEXT,
  license_number  TEXT,
  issued_date     DATE,
  expiry_date     DATE,
  issuing_body    TEXT,
  memo            TEXT,
  is_primary      BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 기존 테이블 보완: 누락된 컬럼 추가
ALTER TABLE staff_licenses ADD COLUMN IF NOT EXISTS license_type    TEXT;
ALTER TABLE staff_licenses ADD COLUMN IF NOT EXISTS license_name    TEXT;
ALTER TABLE staff_licenses ADD COLUMN IF NOT EXISTS license_number  TEXT;
ALTER TABLE staff_licenses ADD COLUMN IF NOT EXISTS issued_date     DATE;
ALTER TABLE staff_licenses ADD COLUMN IF NOT EXISTS expiry_date     DATE;
ALTER TABLE staff_licenses ADD COLUMN IF NOT EXISTS issuing_body    TEXT;
ALTER TABLE staff_licenses ADD COLUMN IF NOT EXISTS memo            TEXT;
ALTER TABLE staff_licenses ADD COLUMN IF NOT EXISTS is_primary      BOOLEAN DEFAULT FALSE;
ALTER TABLE staff_licenses ADD COLUMN IF NOT EXISTS created_at      TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE staff_licenses ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT NOW();

-- 인덱스 (idempotent + 컬럼 존재 체크)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff_licenses' AND column_name = 'staff_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_staff_licenses_staff_id
      ON staff_licenses (staff_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff_licenses' AND column_name = 'is_primary'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_staff_licenses_staff_id_is_primary
      ON staff_licenses (staff_id, is_primary);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff_licenses' AND column_name = 'expiry_date'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_staff_licenses_expiry_date
      ON staff_licenses (expiry_date);
  END IF;
END $$;
