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
