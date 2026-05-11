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
