-- ============================================================
-- 2026-05-11_006_companies_leave_policy.sql
-- 회사/사업체 테이블에 연차 정책 컬럼 추가 (idempotent)
-- ============================================================
-- [마이그레이션 실행 전 점검 안내]
--
-- 아래 SQL로 회사 테이블명을 먼저 확인하세요.
--   SELECT table_name
--   FROM information_schema.tables
--   WHERE table_schema = 'public'
--     AND table_name IN ('companies', '사업체');
--
-- 결과에 따라 아래 두 블록 중 해당하는 것만 실행해도 됩니다.
-- 이 파일은 양쪽 모두 시도(ADD COLUMN IF NOT EXISTS)하므로
-- 한 테이블만 존재하는 경우 나머지 블록은 오류 없이 무시됩니다.
-- ============================================================

-- ── companies 테이블 (영문명) ──────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'companies'
  ) THEN
    -- 연차 부여 기준: '입사일' 또는 '회계연도'
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'companies'
        AND column_name = 'leave_policy'
    ) THEN
      ALTER TABLE companies ADD COLUMN leave_policy TEXT DEFAULT '입사일';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'companies'
        AND constraint_name = 'chk_companies_leave_policy'
    ) THEN
      ALTER TABLE companies ADD CONSTRAINT chk_companies_leave_policy
        CHECK (leave_policy IN ('입사일', '회계연도'));
    END IF;

    -- 미사용 연차 보상 여부
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'companies'
        AND column_name = 'unused_leave_compensation'
    ) THEN
      ALTER TABLE companies ADD COLUMN unused_leave_compensation BOOLEAN DEFAULT FALSE;
    END IF;

    -- 회계연도 기준 시작 월 (1~12)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'companies'
        AND column_name = 'fiscal_year_start_month'
    ) THEN
      ALTER TABLE companies ADD COLUMN fiscal_year_start_month INT DEFAULT 1;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'companies'
        AND constraint_name = 'chk_companies_fiscal_month'
    ) THEN
      ALTER TABLE companies ADD CONSTRAINT chk_companies_fiscal_month
        CHECK (fiscal_year_start_month BETWEEN 1 AND 12);
    END IF;
  END IF;
END $$;

-- ── 사업체 테이블 (한글명) ────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = '사업체'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = '사업체'
        AND column_name = 'leave_policy'
    ) THEN
      EXECUTE '
        ALTER TABLE "사업체" ADD COLUMN leave_policy TEXT DEFAULT ''입사일'';
      ';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = '사업체'
        AND column_name = 'unused_leave_compensation'
    ) THEN
      EXECUTE 'ALTER TABLE "사업체" ADD COLUMN unused_leave_compensation BOOLEAN DEFAULT FALSE;';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = '사업체'
        AND column_name = 'fiscal_year_start_month'
    ) THEN
      EXECUTE 'ALTER TABLE "사업체" ADD COLUMN fiscal_year_start_month INT DEFAULT 1;';
    END IF;
  END IF;
END $$;
