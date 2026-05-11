-- ================================================================
-- MSO 2026-05-11 — 전체 적용 SQL (마이그레이션 + Seed + 백필)
-- 단일 파일 통합본 — Supabase SQL Editor 한 번 실행으로 완료
-- 모두 idempotent — 중복 실행 안전
-- ================================================================

-- ================================================================
-- MSO 2026-05-11 통합 마이그레이션 + Seed (v3)
-- 변경: 001/004/007 의 인덱스를 컬럼 존재 체크 + DO 블록으로 감쌈
-- 변경: 001 에 staff_licenses CREATE TABLE + 모든 컬럼 ADD COLUMN IF NOT EXISTS
-- 변경: 007 에 expiry_date/stage 등 모든 컬럼 ADD COLUMN IF NOT EXISTS
-- 모두 idempotent — 중복 실행 안전
-- ================================================================


-- ============================================================
-- FILE: supabase/migrations/2026-05-11_001_staff_licenses_enhance.sql
-- ============================================================
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


-- ============================================================
-- FILE: supabase/migrations/2026-05-11_002_job_categories.sql
-- ============================================================
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


-- ============================================================
-- FILE: supabase/migrations/2026-05-11_003_job_category_required_trainings.sql
-- ============================================================
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


-- ============================================================
-- FILE: supabase/migrations/2026-05-11_004_leave_balances.sql
-- ============================================================
-- ============================================================
-- 2026-05-11_004_leave_balances.sql
-- 연차 잔여 일수 테이블 생성 또는 컬럼 보완 (idempotent)
-- ============================================================
-- [마이그레이션 실행 전 점검 안내]
--
-- 아래 SQL로 기존 테이블 존재 여부를 먼저 확인하세요.
--   SELECT table_name
--   FROM information_schema.tables
--   WHERE table_schema = 'public'
--     AND table_name IN ('leave_balances', 'annual_leave_balances');
--
-- 결과에 따른 조치:
--   A) 둘 다 없음         → 이 파일을 그대로 실행 (신규 생성)
--   B) leave_balances만   → 이 파일을 그대로 실행 (IF NOT EXISTS 로 무해)
--   C) annual_leave_balances만 → 아래 ALTER 블록을 참고해 컬럼 보완 후,
--                                leave_balances 는 뷰/별칭으로 처리하거나
--                                테이블 이름 변경 결정 필요
--   D) 둘 다 있음         → 중복 여부 확인 후 사용자 결정 필요
--      예) SELECT COUNT(*) FROM annual_leave_balances;
--          SELECT COUNT(*) FROM leave_balances;
--
-- 이 파일은 case A/B 를 전제로 작성됨.
-- ============================================================

-- 신규 생성 (이미 있으면 무시)
CREATE TABLE IF NOT EXISTS leave_balances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  year            INT NOT NULL,
  total_days      NUMERIC(5, 2) DEFAULT 0,
  used_days       NUMERIC(5, 2) DEFAULT 0,
  remaining_days  NUMERIC(5, 2) DEFAULT 0,
  expiry_date     DATE,
  expired_days    NUMERIC(5, 2) DEFAULT 0,
  expired_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (staff_id, year)
);

-- --------------------------------------------------------
-- 기존 leave_balances 가 이미 있지만 컬럼이 누락된 경우 보완
-- (annual_leave_balances → leave_balances 로 통합한 케이스)
-- --------------------------------------------------------
ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS expiry_date     DATE;
ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS expired_days    NUMERIC(5, 2) DEFAULT 0;
ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS expired_at      TIMESTAMPTZ;
ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT NOW();

-- --------------------------------------------------------
-- 인덱스 (idempotent + 컬럼 존재 체크)
-- --------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'leave_balances'
      AND column_name = 'staff_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_leave_balances_staff_id
      ON leave_balances (staff_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'leave_balances'
      AND column_name = 'expiry_date'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_leave_balances_expiry_date
      ON leave_balances (expiry_date);
  END IF;
END $$;


-- ============================================================
-- FILE: supabase/migrations/2026-05-11_005_staff_shift_assignments.sql
-- ============================================================
-- ============================================================
-- 2026-05-11_005_staff_shift_assignments.sql
-- 직원별 근무조 배정 테이블 생성 (idempotent)
-- ============================================================
-- 전제: work_shifts 테이블이 존재해야 함.
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name = 'work_shifts';
-- ============================================================

CREATE TABLE IF NOT EXISTS staff_shift_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  shift_id      UUID NOT NULL REFERENCES work_shifts(id),
  is_primary    BOOLEAN DEFAULT FALSE,
  priority      INT DEFAULT 0,
  effective_from DATE,
  effective_to   DATE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (staff_id, shift_id)
);

-- --------------------------------------------------------
-- 인덱스 (idempotent)
-- --------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_staff_shift_assignments_staff_id
  ON staff_shift_assignments (staff_id);

CREATE INDEX IF NOT EXISTS idx_staff_shift_assignments_staff_id_is_primary
  ON staff_shift_assignments (staff_id, is_primary);

CREATE INDEX IF NOT EXISTS idx_staff_shift_assignments_shift_id
  ON staff_shift_assignments (shift_id);


-- ============================================================
-- FILE: supabase/migrations/2026-05-11_006_companies_leave_policy.sql
-- ============================================================
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


-- ============================================================
-- FILE: supabase/migrations/2026-05-11_007_annual_leave_promotion_logs.sql
-- ============================================================
-- ============================================================
-- 2026-05-11_007_annual_leave_promotion_logs.sql
-- 연차촉진 알림 로그 테이블 생성 및 컬럼 보완 (idempotent)
-- ============================================================

-- 신규 생성 (이미 있으면 무시)
CREATE TABLE IF NOT EXISTS annual_leave_promotion_logs (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id                  UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  stage                     INT NOT NULL,   -- 1=1차촉진, 2=2차촉진, 3=소멸
  expiry_date               DATE NOT NULL,
  notified_at               TIMESTAMPTZ DEFAULT NOW(),
  plan_submitted_at         TIMESTAMPTZ,
  remaining_days_at_notice  NUMERIC(5, 2),
  notification_id           UUID,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (staff_id, stage, expiry_date)
);

-- --------------------------------------------------------
-- 기존 테이블이 이미 있지만 컬럼이 누락된 경우 보완 (NULLABLE 로 추가)
-- --------------------------------------------------------
ALTER TABLE annual_leave_promotion_logs
  ADD COLUMN IF NOT EXISTS stage                     INT;

ALTER TABLE annual_leave_promotion_logs
  ADD COLUMN IF NOT EXISTS expiry_date               DATE;

ALTER TABLE annual_leave_promotion_logs
  ADD COLUMN IF NOT EXISTS notified_at               TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE annual_leave_promotion_logs
  ADD COLUMN IF NOT EXISTS plan_submitted_at         TIMESTAMPTZ;

ALTER TABLE annual_leave_promotion_logs
  ADD COLUMN IF NOT EXISTS remaining_days_at_notice  NUMERIC(5, 2);

ALTER TABLE annual_leave_promotion_logs
  ADD COLUMN IF NOT EXISTS notification_id           UUID;

ALTER TABLE annual_leave_promotion_logs
  ADD COLUMN IF NOT EXISTS created_at                TIMESTAMPTZ DEFAULT NOW();

-- --------------------------------------------------------
-- 인덱스 (idempotent + 컬럼 존재 체크)
-- --------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'annual_leave_promotion_logs' AND column_name = 'staff_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_alpl_staff_id
      ON annual_leave_promotion_logs (staff_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'annual_leave_promotion_logs' AND column_name = 'expiry_date'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_alpl_expiry_date
      ON annual_leave_promotion_logs (expiry_date);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'annual_leave_promotion_logs' AND column_name = 'stage'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_alpl_stage
      ON annual_leave_promotion_logs (stage);
  END IF;
END $$;


-- ============================================================
-- FILE: supabase/migrations/2026-05-11_010_register_staff_rpc.sql
-- ============================================================
-- ============================================================
-- register_staff_full
-- 직원 등록 트랜잭션 RPC
-- 단계: staff_members → staff_licenses → staff_job_categories
--       → staff_shift_assignments → leave_balances
-- 실패 시 PostgreSQL 트랜잭션으로 전체 롤백
-- ============================================================

CREATE OR REPLACE FUNCTION register_staff_full(
  p_staff        JSONB,
  p_licenses     JSONB,   -- array of LicenseRow
  p_job_cats     JSONB,   -- array of {job_category_id, is_primary}
  p_shift_asgns  JSONB,   -- array of {shift_id, is_primary, priority}
  p_leave_year   INT,
  p_leave_total  NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staff_id  UUID;
  v_license   JSONB;
  v_job       JSONB;
  v_shift     JSONB;
  v_expiry    DATE;
BEGIN
  -- 1) staff_members INSERT
  INSERT INTO staff_members (
    name, phone, company, department, position,
    resident_no, email, address, bank_account, salary_info,
    joined_at, join_date, resigned_at, status,
    shift_id, license, permissions,
    working_hours_per_week, working_days_per_week,
    base_salary, meal_allowance, night_duty_allowance, vehicle_allowance,
    childcare_allowance, research_allowance, other_taxfree,
    position_allowance, overtime_allowance, night_work_allowance,
    holiday_work_allowance, annual_leave_pay,
    annual_leave_total, annual_leave_used,
    role, employee_no
  )
  SELECT
    p_staff->>'name',
    p_staff->>'phone',
    p_staff->>'company',
    p_staff->>'department',
    p_staff->>'position',
    p_staff->>'resident_no',
    p_staff->>'email',
    p_staff->>'address',
    p_staff->>'bank_account',
    p_staff->>'salary_info',
    NULLIF(p_staff->>'joined_at', '')::DATE,
    NULLIF(p_staff->>'join_date', '')::DATE,
    NULLIF(p_staff->>'resigned_at', '')::DATE,
    COALESCE(p_staff->>'status', '재직'),
    NULLIF(p_staff->>'shift_id', '')::UUID,
    p_staff->>'license',
    COALESCE(p_staff->'permissions', '{}'::JSONB),
    NULLIF(p_staff->>'working_hours_per_week', '')::NUMERIC,
    NULLIF(p_staff->>'working_days_per_week', '')::INT,
    COALESCE((p_staff->>'base_salary')::NUMERIC, 0),
    COALESCE((p_staff->>'meal_allowance')::NUMERIC, 0),
    COALESCE((p_staff->>'night_duty_allowance')::NUMERIC, 0),
    COALESCE((p_staff->>'vehicle_allowance')::NUMERIC, 0),
    COALESCE((p_staff->>'childcare_allowance')::NUMERIC, 0),
    COALESCE((p_staff->>'research_allowance')::NUMERIC, 0),
    COALESCE((p_staff->>'other_taxfree')::NUMERIC, 0),
    COALESCE((p_staff->>'position_allowance')::NUMERIC, 0),
    COALESCE((p_staff->>'overtime_allowance')::NUMERIC, 0),
    COALESCE((p_staff->>'night_work_allowance')::NUMERIC, 0),
    COALESCE((p_staff->>'holiday_work_allowance')::NUMERIC, 0),
    COALESCE((p_staff->>'annual_leave_pay')::NUMERIC, 0),
    0, 0,
    COALESCE(p_staff->>'role', 'staff'),
    p_staff->>'employee_no'
  RETURNING id INTO v_staff_id;

  -- 2) staff_licenses INSERT (배열 순회)
  FOR v_license IN SELECT * FROM jsonb_array_elements(COALESCE(p_licenses, '[]'::JSONB))
  LOOP
    -- 빈 row (license_type, license_name, license_number 모두 falsy) 스킵
    CONTINUE WHEN
      COALESCE(v_license->>'license_type', '') = '' AND
      COALESCE(v_license->>'license_name', '') = '' AND
      COALESCE(v_license->>'license_number', '') = '';

    INSERT INTO staff_licenses (
      staff_id, license_type, license_name, license_number,
      issued_date, expiry_date, issuing_body, memo, is_primary
    ) VALUES (
      v_staff_id,
      NULLIF(v_license->>'license_type', ''),
      NULLIF(v_license->>'license_name', ''),
      NULLIF(v_license->>'license_number', ''),
      NULLIF(v_license->>'issued_date', '')::DATE,
      NULLIF(v_license->>'expiry_date', '')::DATE,
      NULLIF(v_license->>'issuing_body', ''),
      NULLIF(v_license->>'memo', ''),
      COALESCE((v_license->>'is_primary')::BOOLEAN, FALSE)
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- 3) staff_job_categories INSERT
  FOR v_job IN SELECT * FROM jsonb_array_elements(COALESCE(p_job_cats, '[]'::JSONB))
  LOOP
    INSERT INTO staff_job_categories (staff_id, job_category_id, is_primary)
    VALUES (
      v_staff_id,
      (v_job->>'job_category_id')::UUID,
      COALESCE((v_job->>'is_primary')::BOOLEAN, FALSE)
    )
    ON CONFLICT (staff_id, job_category_id) DO UPDATE
      SET is_primary = EXCLUDED.is_primary;
  END LOOP;

  -- 4) staff_shift_assignments INSERT
  FOR v_shift IN SELECT * FROM jsonb_array_elements(COALESCE(p_shift_asgns, '[]'::JSONB))
  LOOP
    INSERT INTO staff_shift_assignments (staff_id, shift_id, is_primary, priority)
    VALUES (
      v_staff_id,
      (v_shift->>'shift_id')::UUID,
      COALESCE((v_shift->>'is_primary')::BOOLEAN, FALSE),
      COALESCE((v_shift->>'priority')::INT, 0)
    )
    ON CONFLICT (staff_id, shift_id) DO UPDATE
      SET is_primary = EXCLUDED.is_primary,
          priority   = EXCLUDED.priority;
  END LOOP;

  -- 5) leave_balances 초기 row
  -- expiry_date: 입사일 기준 + 1년 (없으면 해당 연도 12월 31일)
  SELECT COALESCE(
    (NULLIF(p_staff->>'joined_at', '')::DATE + INTERVAL '1 year')::DATE,
    MAKE_DATE(p_leave_year, 12, 31)
  ) INTO v_expiry;

  INSERT INTO leave_balances (
    staff_id, year, total_days, used_days, remaining_days, expiry_date
  ) VALUES (
    v_staff_id,
    p_leave_year,
    COALESCE(p_leave_total, 0),
    0,
    COALESCE(p_leave_total, 0),
    v_expiry
  )
  ON CONFLICT (staff_id, year) DO NOTHING;

  RETURN jsonb_build_object(
    'staff_id', v_staff_id,
    'ok', TRUE
  );
END;
$$;

-- RPC 호출 권한 (authenticated role)
GRANT EXECUTE ON FUNCTION register_staff_full(JSONB, JSONB, JSONB, JSONB, INT, NUMERIC)
  TO authenticated;


-- ============================================================
-- FILE: supabase/migrations/2026-05-11_020_staff_trainings.sql
-- ============================================================
-- ============================================================
-- 2026-05-11_020_staff_trainings.sql
-- staff_trainings 테이블 생성 (idempotent)
-- 직종별 필수교육 자동 부여 및 이수 현황 관리용
-- ============================================================

CREATE TABLE IF NOT EXISTS staff_trainings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,

  -- 교육 식별
  training_code   TEXT NOT NULL,
  training_name   TEXT NOT NULL,

  -- 부여 정보
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mandatory       BOOLEAN DEFAULT TRUE,
  obligation_type TEXT NOT NULL DEFAULT 'legal',
  cycle_months    INT,

  -- 이수 정보
  status          TEXT NOT NULL DEFAULT '미이수',
  completed_at    TIMESTAMPTZ,
  certificate_url TEXT,
  memo            TEXT,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  -- 직원 × 교육코드 중복 방지
  UNIQUE (staff_id, training_code),

  CONSTRAINT chk_st_obligation_type
    CHECK (obligation_type IN ('legal', 'recommended')),

  CONSTRAINT chk_st_status
    CHECK (status IN ('미이수', '이수완료', '면제', '진행중'))
);

-- --------------------------------------------------------
-- 인덱스
-- --------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_staff_trainings_staff_id
  ON staff_trainings (staff_id);

CREATE INDEX IF NOT EXISTS idx_staff_trainings_status
  ON staff_trainings (status);

CREATE INDEX IF NOT EXISTS idx_staff_trainings_training_code
  ON staff_trainings (training_code);


-- ============================================================
-- FILE: supabase/seed/job_categories_seed.sql
-- ============================================================
-- ============================================================
-- supabase/seed/job_categories_seed.sql
-- 직종 마스터 초기 데이터 (idempotent)
-- ============================================================

INSERT INTO job_categories (code, name, is_medical_staff, display_order)
VALUES
  ('doctor',                '의사',       TRUE,  10),
  ('nurse',                 '간호사',     TRUE,  20),
  ('nurse_assistant',       '간호조무사', TRUE,  30),
  ('radiologist',           '방사선사',   TRUE,  40),
  ('physical_therapist',    '물리치료사', TRUE,  50),
  ('occupational_therapist','작업치료사', TRUE,  60),
  ('clinical_pathologist',  '임상병리사', TRUE,  70),
  ('pharmacist',            '약사',       TRUE,  80),
  ('nutritionist',          '영양사',     TRUE,  90),
  ('social_worker',         '사회복지사', TRUE,  100),
  ('admin',                 '사무직',     FALSE, 200),
  ('reception',             '원무행정',   FALSE, 210),
  ('etc',                   '기타',       FALSE, 999)
ON CONFLICT (code) DO NOTHING;


-- ============================================================
-- FILE: supabase/seed/job_category_required_trainings_seed.sql
-- ============================================================
-- ============================================================
-- supabase/seed/job_category_required_trainings_seed.sql
-- 직종별 필수/권장 교육 항목 초기 데이터 (idempotent)
-- ============================================================
-- 실행 전제: job_categories_seed.sql 먼저 실행 완료
-- ============================================================

-- ============================================================
-- A. 법정의무 (obligation_type='legal', mandatory=TRUE)
-- ============================================================

-- ── A-1. 전 직종 공통 (applies_to_all=TRUE) ─────────────────
INSERT INTO job_category_required_trainings
  (applies_to_all, training_code, training_name, cycle_months, mandatory, obligation_type, legal_basis)
VALUES
  (TRUE, 'personal_info',   '개인정보취급자 정기교육',      12, TRUE, 'legal', '개인정보보호법 제28조'),
  (TRUE, 'sexual_harass',   '성희롱예방교육',               12, TRUE, 'legal', '남녀고용평등법 제13조'),
  (TRUE, 'osha',            '산업안전보건교육',             12, TRUE, 'legal', '산업안전보건법 제29조'),
  (TRUE, 'disability_aware','장애인인식개선교육',           12, TRUE, 'legal', '장애인고용촉진 및 직업재활법 제5조의2')
ON CONFLICT DO NOTHING;

-- ── A-2. 간호사 ──────────────────────────────────────────────
INSERT INTO job_category_required_trainings
  (job_category_id, applies_to_all, training_code, training_name, cycle_months, mandatory, obligation_type, legal_basis)
SELECT
  jc.id, FALSE, 'nurse_ceu', '간호사 보수교육 8h', 12, TRUE, 'legal', '의료법 제30조'
FROM job_categories jc
WHERE jc.code = 'nurse'
ON CONFLICT DO NOTHING;

-- ── A-3. 간호조무사 ──────────────────────────────────────────
INSERT INTO job_category_required_trainings
  (job_category_id, applies_to_all, training_code, training_name, cycle_months, mandatory, obligation_type, legal_basis)
SELECT
  jc.id, FALSE, 'nurse_assistant_ceu', '간호조무사 보수교육 8h', 12, TRUE, 'legal', '의료법 시행규칙 제45조'
FROM job_categories jc
WHERE jc.code = 'nurse_assistant'
ON CONFLICT DO NOTHING;

-- ── A-4. 의료기사 4개 직종 (방사선사, 물리치료사, 작업치료사, 임상병리사) ──
INSERT INTO job_category_required_trainings
  (job_category_id, applies_to_all, training_code, training_name, cycle_months, mandatory, obligation_type, legal_basis)
SELECT
  jc.id, FALSE, 'medical_technician_ceu', '의료기사 보수교육 8h', 12, TRUE, 'legal', '의료기사 등에 관한 법률 제20조'
FROM job_categories jc
WHERE jc.code IN ('radiologist', 'physical_therapist', 'occupational_therapist', 'clinical_pathologist')
ON CONFLICT DO NOTHING;

-- ── A-5. 약사 ────────────────────────────────────────────────
INSERT INTO job_category_required_trainings
  (job_category_id, applies_to_all, training_code, training_name, cycle_months, mandatory, obligation_type, legal_basis)
SELECT
  jc.id, FALSE, 'pharmacist_ceu', '약사 보수교육 8h', 12, TRUE, 'legal', '약사법 제15조'
FROM job_categories jc
WHERE jc.code = 'pharmacist'
ON CONFLICT DO NOTHING;

-- ============================================================
-- B. 권장/내부 (obligation_type='recommended', mandatory=FALSE)
-- ============================================================

-- ── B-1. 전 직종 공통: 직장 내 괴롭힘 예방 ─────────────────
INSERT INTO job_category_required_trainings
  (applies_to_all, training_code, training_name, cycle_months, mandatory, obligation_type, legal_basis)
VALUES
  (TRUE, 'workplace_bullying', '직장내괴롭힘예방교육', 12, FALSE, 'recommended', NULL)
ON CONFLICT DO NOTHING;

-- ── B-2. 의료 직종 공통: 인증평가 권장 항목 ─────────────────
-- 대상: doctor, nurse, nurse_assistant, radiologist,
--       physical_therapist, occupational_therapist,
--       clinical_pathologist, pharmacist, nutritionist, social_worker
INSERT INTO job_category_required_trainings
  (job_category_id, applies_to_all, training_code, training_name, cycle_months, mandatory, obligation_type, legal_basis)
SELECT
  jc.id, FALSE, 'infection_control', '감염관리 교육', 12, FALSE, 'recommended', NULL
FROM job_categories jc
WHERE jc.is_medical_staff = TRUE
ON CONFLICT DO NOTHING;

INSERT INTO job_category_required_trainings
  (job_category_id, applies_to_all, training_code, training_name, cycle_months, mandatory, obligation_type, legal_basis)
SELECT
  jc.id, FALSE, 'patient_safety', '환자안전 교육', 12, FALSE, 'recommended', NULL
FROM job_categories jc
WHERE jc.is_medical_staff = TRUE
ON CONFLICT DO NOTHING;

INSERT INTO job_category_required_trainings
  (job_category_id, applies_to_all, training_code, training_name, cycle_months, mandatory, obligation_type, legal_basis)
SELECT
  jc.id, FALSE, 'bls', 'BLS (기본소생술)', 24, FALSE, 'recommended', NULL
FROM job_categories jc
WHERE jc.is_medical_staff = TRUE
ON CONFLICT DO NOTHING;

INSERT INTO job_category_required_trainings
  (job_category_id, applies_to_all, training_code, training_name, cycle_months, mandatory, obligation_type, legal_basis)
SELECT
  jc.id, FALSE, 'tb_management', '결핵관리 교육', 12, FALSE, 'recommended', NULL
FROM job_categories jc
WHERE jc.is_medical_staff = TRUE
ON CONFLICT DO NOTHING;


-- ================================================================
-- ===================== BACKFILL (기존 직원 데이터 이전) ==========
-- ================================================================

-- ============================================================
-- scripts/backfill_2026-05-11.sql
-- 기존 데이터 마이그레이션 백필 (idempotent)
-- 실행 순서:
--   1. 마이그레이션 파일 001~007 실행 완료 후 실행
--   2. seed 파일 실행 불필요 (이 스크립트와 독립적)
-- ============================================================
-- 주의: 각 단계는 INSERT ... SELECT ... WHERE NOT EXISTS 패턴으로
--       중복 실행해도 안전합니다.
-- ============================================================

-- ============================================================
-- 단계 1. staff_members 의 면허 정보 → staff_licenses 백필
-- ============================================================
-- staff_members 에 license 또는 license_no 가 있고,
-- 해당 staff_id 로 staff_licenses 행이 없는 경우에만 삽입.
-- license_type 은 license 컬럼 값을 그대로 사용하되,
--   '간호사' 포함 → '간호사면허'
--   '의사' 포함 → '의사면허'
--   '방사선' 포함 → '방사선사면허'
--   그 외         → '기타자격증'
-- ============================================================

-- 주의: staff_licenses.staff_id 가 TEXT 타입인 환경 대응 — sm.id 를 TEXT 로 캐스팅
INSERT INTO staff_licenses (
  staff_id,
  license_name,
  license_number,
  issued_date,
  license_type,
  is_primary,
  created_at,
  updated_at
)
SELECT
  sm.id::TEXT                    AS staff_id,
  COALESCE(NULLIF(TRIM(sm.license), ''), '면허/자격') AS license_name,
  CASE
    WHEN sm.permissions IS NOT NULL
         AND sm.permissions::jsonb ->> 'license_no' IS NOT NULL
         AND TRIM(sm.permissions::jsonb ->> 'license_no') <> ''
    THEN TRIM(sm.permissions::jsonb ->> 'license_no')
    ELSE NULL
  END                            AS license_number,
  CASE
    WHEN sm.permissions IS NOT NULL
         AND sm.permissions::jsonb ->> 'license_date' IS NOT NULL
         AND TRIM(sm.permissions::jsonb ->> 'license_date') <> ''
    THEN (TRIM(sm.permissions::jsonb ->> 'license_date'))::DATE
    ELSE NULL
  END                            AS issued_date,
  CASE
    WHEN sm.license ILIKE '%간호사%'     THEN '간호사면허'
    WHEN sm.license ILIKE '%의사%'       THEN '의사면허'
    WHEN sm.license ILIKE '%방사선%'     THEN '방사선사면허'
    WHEN sm.license ILIKE '%물리치료%'   THEN '물리치료사면허'
    WHEN sm.license ILIKE '%작업치료%'   THEN '작업치료사면허'
    WHEN sm.license ILIKE '%임상병리%'   THEN '임상병리사면허'
    WHEN sm.license ILIKE '%약사%'       THEN '약사면허'
    WHEN sm.license ILIKE '%영양사%'     THEN '영양사면허'
    WHEN sm.license ILIKE '%사회복지%'   THEN '사회복지사면허'
    WHEN sm.license ILIKE '%간호조무사%' THEN '간호조무사면허'
    ELSE '기타자격증'
  END                            AS license_type,
  TRUE                           AS is_primary,
  NOW()                          AS created_at,
  NOW()                          AS updated_at
FROM staff_members sm
WHERE
  -- 면허 정보가 존재하는 행만
  (
    (sm.license IS NOT NULL AND TRIM(sm.license) <> '')
    OR (
      sm.permissions IS NOT NULL
      AND sm.permissions::jsonb ->> 'license_no' IS NOT NULL
      AND TRIM(sm.permissions::jsonb ->> 'license_no') <> ''
    )
  )
  -- 이미 staff_licenses 에 해당 staff_id 의 is_primary 행이 없는 경우만
  AND NOT EXISTS (
    SELECT 1
    FROM staff_licenses sl
    WHERE sl.staff_id = sm.id::TEXT
      AND sl.is_primary = TRUE
  );

-- ============================================================
-- 단계 2. staff_members.shift_id → staff_shift_assignments 백필
-- ============================================================
-- staff_members 에 shift_id 가 NOT NULL 이고,
-- 이미 staff_shift_assignments 에 (staff_id, shift_id) 행이 없는 경우만 삽입.
-- ============================================================

INSERT INTO staff_shift_assignments (
  staff_id,
  shift_id,
  is_primary,
  priority,
  created_at
)
SELECT
  sm.id       AS staff_id,
  sm.shift_id AS shift_id,
  TRUE        AS is_primary,
  0           AS priority,
  NOW()       AS created_at
FROM staff_members sm
WHERE
  sm.shift_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM staff_shift_assignments ssa
    WHERE ssa.staff_id = sm.id
      AND ssa.shift_id = sm.shift_id
  );

-- ============================================================
-- 단계 3. 활성 직원 중 leave_balances 없는 행 초기 생성
-- ============================================================
-- 근로기준법 기반 연차 산정:
--   - 입사 1년 미만: 매달 1일 발생 → 최대 11일
--     (근무 개월수 계산: EXTRACT(YEAR FROM AGE(TODAY, hire_date))*12
--      + EXTRACT(MONTH FROM AGE(TODAY, hire_date)))
--   - 1년 이상 ~ 2년 미만: 15일
--   - 2년 이상: 15 + FLOOR((근속년수 - 1) / 2) 가산 (최대 25일)
--
-- 여기서는 '입사일 기준 올해 부여 연차' 를 계산해 삽입합니다.
-- remaining_days 는 total_days - used_days (초기 used=0 이므로 동일).
-- expiry_date 는 hire_date 의 다음 해 당일 기준 만료일.
-- ============================================================

INSERT INTO leave_balances (
  staff_id,
  year,
  total_days,
  used_days,
  remaining_days,
  expiry_date,
  created_at,
  updated_at
)
SELECT
  sm.id                                    AS staff_id,
  EXTRACT(YEAR FROM CURRENT_DATE)::INT     AS year,

  -- 연차 일수 계산
  CASE
    -- 근속 1년 미만: 매 개월 1일 (최대 11일)
    WHEN AGE(CURRENT_DATE, hire_date::DATE) < INTERVAL '1 year'
    THEN LEAST(
           (EXTRACT(YEAR FROM AGE(CURRENT_DATE, hire_date::DATE)) * 12
            + EXTRACT(MONTH FROM AGE(CURRENT_DATE, hire_date::DATE)))::NUMERIC,
           11
         )

    -- 근속 1년 이상: 15일 기본 + 2년 초과분 가산 (최대 25일)
    ELSE LEAST(
           15 + FLOOR(
             (EXTRACT(YEAR FROM AGE(CURRENT_DATE, hire_date::DATE)) - 1) / 2
           ),
           25
         )
  END::NUMERIC(5,2)                        AS total_days,

  0::NUMERIC(5,2)                          AS used_days,

  -- remaining = total (신규 행이므로 used=0)
  CASE
    WHEN AGE(CURRENT_DATE, hire_date::DATE) < INTERVAL '1 year'
    THEN LEAST(
           (EXTRACT(YEAR FROM AGE(CURRENT_DATE, hire_date::DATE)) * 12
            + EXTRACT(MONTH FROM AGE(CURRENT_DATE, hire_date::DATE)))::NUMERIC,
           11
         )
    ELSE LEAST(
           15 + FLOOR(
             (EXTRACT(YEAR FROM AGE(CURRENT_DATE, hire_date::DATE)) - 1) / 2
           ),
           25
         )
  END::NUMERIC(5,2)                        AS remaining_days,

  -- 만료일: 입사 기념일 (올해 또는 내년)
  CASE
    WHEN (DATE_TRUNC('year', CURRENT_DATE)
          + (hire_date::DATE - DATE_TRUNC('year', hire_date::DATE)))
         > CURRENT_DATE
    THEN (DATE_TRUNC('year', CURRENT_DATE)
          + (hire_date::DATE - DATE_TRUNC('year', hire_date::DATE)))::DATE
    ELSE (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 year'
          + (hire_date::DATE - DATE_TRUNC('year', hire_date::DATE)))::DATE
  END                                      AS expiry_date,

  NOW()                                    AS created_at,
  NOW()                                    AS updated_at

FROM staff_members sm
WHERE
  -- 활성 직원만 (퇴사일 없거나 미래)
  (sm.resigned_at IS NULL OR sm.resigned_at::DATE > CURRENT_DATE)
  AND sm.hire_date IS NOT NULL
  AND TRIM(sm.hire_date::TEXT) <> ''
  -- 이미 올해 leave_balances 행이 없는 경우만
  AND NOT EXISTS (
    SELECT 1
    FROM leave_balances lb
    WHERE lb.staff_id = sm.id
      AND lb.year = EXTRACT(YEAR FROM CURRENT_DATE)::INT
  );

-- ============================================================
-- 완료 메시지
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '백필 완료: staff_licenses, staff_shift_assignments, leave_balances';
END $$;
