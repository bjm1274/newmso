-- D1에 적용 불가 — 앱 레이어 TS로 재작성 대상

-- 함수 49개



-- from: 2026-05-11_010_register_staff_rpc.sql
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

-- from: 00_full_schema_and_migrations.sql
CREATE OR REPLACE FUNCTION sync_inventory_name_stock() RETURNS TRIGGER AS $$
BEGIN
  NEW.name := COALESCE(NEW.name, NEW.item_name);
  NEW.stock := COALESCE(NULLIF(NEW.stock,0), NEW.quantity);
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- from: 00_full_schema_and_migrations.sql
CREATE OR REPLACE FUNCTION increment_annual_leave_used(p_staff_id UUID, p_days NUMERIC)
RETURNS VOID AS $$
BEGIN
  UPDATE staff_members
  SET annual_leave_used = COALESCE(annual_leave_used, 0) + p_days
  WHERE id = p_staff_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- from: 00_full_schema_and_migrations.sql
CREATE OR REPLACE FUNCTION increment_post_views(p_post_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE board_posts
  SET views = COALESCE(views, 0) + 1
  WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- from: 00_full_schema_and_migrations.sql
CREATE OR REPLACE FUNCTION atomic_stock_update(
  p_item_id UUID,
  p_delta INTEGER,
  p_min_allowed INTEGER DEFAULT 0
)
RETURNS TABLE(prev_qty INTEGER, next_qty INTEGER) AS $$
DECLARE
  v_prev INTEGER;
  v_next INTEGER;
BEGIN
  SELECT COALESCE(quantity, stock, 0)::INTEGER INTO v_prev
  FROM inventory WHERE id = p_item_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND';
  END IF;

  v_next := v_prev + p_delta;

  IF v_next < p_min_allowed THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK: prev=%, delta=%, next=%', v_prev, p_delta, v_next;
  END IF;

  UPDATE inventory
  SET quantity = v_next, stock = v_next
  WHERE id = p_item_id;

  RETURN QUERY SELECT v_prev, v_next;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- from: 00_full_schema_and_migrations.sql
CREATE OR REPLACE FUNCTION atomic_stock_transfer(
  p_source_id UUID,
  p_dest_id UUID,
  p_quantity INTEGER
)
RETURNS TABLE(src_prev INTEGER, src_next INTEGER, dst_prev INTEGER, dst_next INTEGER) AS $$
DECLARE
  v_src_prev INTEGER;
  v_src_next INTEGER;
  v_dst_prev INTEGER;
  v_dst_next INTEGER;
BEGIN
  -- 출발지 차감 (FOR UPDATE 잠금)
  SELECT COALESCE(quantity, stock, 0)::INTEGER INTO v_src_prev
  FROM inventory WHERE id = p_source_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'SOURCE_NOT_FOUND'; END IF;

  v_src_next := v_src_prev - p_quantity;
  IF v_src_next < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK: prev=%, qty=%', v_src_prev, p_quantity;
  END IF;

  UPDATE inventory SET quantity = v_src_next, stock = v_src_next WHERE id = p_source_id;

  -- 목적지 증가
  SELECT COALESCE(quantity, stock, 0)::INTEGER INTO v_dst_prev
  FROM inventory WHERE id = p_dest_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'DEST_NOT_FOUND'; END IF;

  v_dst_next := v_dst_prev + p_quantity;
  UPDATE inventory SET quantity = v_dst_next, stock = v_dst_next WHERE id = p_dest_id;

  RETURN QUERY SELECT v_src_prev, v_src_next, v_dst_prev, v_dst_next;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- from: 20260308_messenger_payroll_persistence.sql
CREATE OR REPLACE FUNCTION set_row_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE OR REPLACE FUNCTION public.erp_claim_uuid(claim_key TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN COALESCE(auth.jwt() ->> claim_key, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN (auth.jwt() ->> claim_key)::uuid
    ELSE NULL
  END
$$;

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE OR REPLACE FUNCTION public.erp_staff_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT public.erp_claim_uuid('erp_staff_id')
$$;

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE OR REPLACE FUNCTION public.erp_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT public.erp_claim_uuid('erp_company_id')
$$;

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE OR REPLACE FUNCTION public.erp_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE((auth.jwt() ->> 'erp_is_admin')::boolean, false)
$$;

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE OR REPLACE FUNCTION public.erp_can_manage_company()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE((auth.jwt() ->> 'erp_can_manage_company')::boolean, false)
$$;

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE OR REPLACE FUNCTION public.erp_company_matches(target_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT
    public.erp_is_admin()
    OR (
      public.erp_company_id() IS NOT NULL
      AND target_company_id IS NOT NULL
      AND public.erp_company_id() = target_company_id
    )
$$;

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE OR REPLACE FUNCTION public.erp_target_staff_same_company(target_staff_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_members AS s
    WHERE s.id = target_staff_id
      AND public.erp_company_id() IS NOT NULL
      AND s.company_id = public.erp_company_id()
  )
$$;

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE OR REPLACE FUNCTION public.erp_target_staff_in_scope(target_staff_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT
    public.erp_is_admin()
    OR target_staff_id = public.erp_staff_id()
    OR (
      public.erp_can_manage_company()
      AND public.erp_target_staff_same_company(target_staff_id)
    )
$$;

-- from: 20260325_chat_push_jobs.sql
create or replace function public.enqueue_chat_push_job()
returns trigger
language plpgsql
as $$
begin
  insert into public.chat_push_jobs (message_id, room_id, sender_id, created_at)
  values (new.id, new.room_id, new.sender_id, coalesce(new.created_at, now()))
  on conflict (message_id) do nothing;
  return new;
end;
$$;

-- from: 20260327_asset_loan_item_settings.sql
create or replace function public.touch_asset_loan_item_settings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- from: 20260327_staff_member_duplicate_identity_guard.sql
create or replace function public.prevent_duplicate_staff_member_identity()
returns trigger
language plpgsql
as $$
declare
  normalized_name text;
  normalized_resident_no text;
begin
  normalized_name := nullif(btrim(coalesce(new.name, '')), '');
  normalized_resident_no := nullif(regexp_replace(coalesce(new.resident_no, ''), '[^0-9]', '', 'g'), '');

  if normalized_name is null or normalized_resident_no is null then
    return new;
  end if;

  if exists (
    select 1
    from public.staff_members staff
    where staff.id is distinct from new.id
      and btrim(coalesce(staff.name, '')) = normalized_name
      and regexp_replace(coalesce(staff.resident_no, ''), '[^0-9]', '', 'g') = normalized_resident_no
  ) then
    raise exception using
      errcode = '23505',
      message = 'duplicate_staff_identity';
  end if;

  return new;
end;
$$;

-- from: 20260330_chat_room_last_message_resync.sql
create or replace function public.refresh_chat_room_last_message()
returns trigger
language plpgsql
as $$
declare
  target_room_id uuid;
begin
  if tg_op = 'DELETE' then
    target_room_id := old.room_id;
  else
    target_room_id := new.room_id;
  end if;

  if target_room_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  update public.chat_rooms
  set
    last_message_at = (
      select m.created_at
      from public.messages as m
      where m.room_id = target_room_id
        and coalesce(m.is_deleted, false) = false
      order by m.created_at desc nulls last, m.id desc
      limit 1
    ),
    last_message_preview = (
      select left(
        coalesce(
          nullif(btrim(m.content), ''),
          nullif(btrim(m.file_name), ''),
          '(file)'
        ),
        80
      )
      from public.messages as m
      where m.room_id = target_room_id
        and coalesce(m.is_deleted, false) = false
      order by m.created_at desc nulls last, m.id desc
      limit 1
    )
  where id = target_room_id;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- from: 20260403_roster_policy_settings.sql
create or replace function public.touch_roster_policy_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- from: 20260403_roster_workflow_requests.sql
create or replace function public.erp_is_roster_approver()
returns boolean
language sql
stable
as $$
  select
    public.erp_is_admin()
    or exists (
      select 1
      from public.staff_members as s
      where s.id = public.erp_staff_id()
        and (
          coalesce(s.role, '') in ('admin', 'master')
          or coalesce(s.position, '') in ('총무부장', '이사')
          or (
            coalesce(s.company, '') = 'SY INC.'
            and coalesce(s.position, '') = '이사'
          )
        )
    )
$$;

-- from: 20260422_department_private_inventory.sql
create or replace function public.set_department_private_inventory_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- from: 20260423_department_inventory_rls_and_log_scope.sql
create or replace function public.erp_claim_text(claim_key text)
returns text
language sql
stable
as $$
  select nullif(btrim(coalesce(auth.jwt() ->> claim_key, '')), '')
$$;

-- from: 20260423_department_inventory_rls_and_log_scope.sql
create or replace function public.erp_company_name()
returns text
language sql
stable
as $$
  select public.erp_claim_text('erp_company_name')
$$;

-- from: 20260423_department_inventory_rls_and_log_scope.sql
create or replace function public.erp_department_name()
returns text
language sql
stable
as $$
  select public.erp_claim_text('erp_department_name')
$$;

-- from: 20260423_department_inventory_rls_and_log_scope.sql
create or replace function public.erp_can_view_all_department_inventory()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'erp_can_view_all_department_inventory')::boolean, false)
$$;

-- from: 20260423_department_inventory_rls_and_log_scope.sql
create or replace function public.erp_department_inventory_scope_matches(
  target_company text,
  target_company_id uuid,
  target_department text
)
returns boolean
language sql
stable
as $$
  select
    public.erp_is_admin()
    or (
      (
        (
          public.erp_company_id() is not null
          and target_company_id is not null
          and public.erp_company_id() = target_company_id
        )
        or (
          public.erp_company_name() is not null
          and nullif(btrim(coalesce(target_company, '')), '') is not null
          and lower(public.erp_company_name()) = lower(btrim(target_company))
        )
      )
      and (
        public.erp_can_view_all_department_inventory()
        or (
          public.erp_department_name() is not null
          and nullif(btrim(coalesce(target_department, '')), '') is not null
          and lower(public.erp_department_name()) = lower(btrim(target_department))
        )
      )
    )
$$;

-- from: 20260423_z_inventory_scope_accounting_closing_rls.sql
create or replace function public.erp_claim_bool(claim_key text)
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> claim_key)::boolean, false)
$$;

-- from: 20260423_z_inventory_scope_accounting_closing_rls.sql
create or replace function public.erp_can_manage_department_inventory()
returns boolean
language sql
stable
as $$
  select public.erp_claim_bool('erp_can_manage_department_inventory')
$$;

-- from: 20260423_z_inventory_scope_accounting_closing_rls.sql
create or replace function public.erp_can_view_all_inventory_companies()
returns boolean
language sql
stable
as $$
  select public.erp_claim_bool('erp_can_view_all_inventory_companies')
$$;

-- from: 20260423_z_inventory_scope_accounting_closing_rls.sql
create or replace function public.erp_can_manage_all_inventory_companies()
returns boolean
language sql
stable
as $$
  select public.erp_claim_bool('erp_can_manage_all_inventory_companies')
$$;

-- from: 20260423_z_inventory_scope_accounting_closing_rls.sql
create or replace function public.erp_inventory_company_scope_matches(
  target_company text,
  target_company_id uuid
)
returns boolean
language sql
stable
as $$
  select
    public.erp_can_view_all_inventory_companies()
    or (
      public.erp_company_id() is not null
      and target_company_id is not null
      and public.erp_company_id() = target_company_id
    )
    or (
      public.erp_company_name() is not null
      and nullif(btrim(coalesce(target_company, '')), '') is not null
      and lower(public.erp_company_name()) = lower(btrim(target_company))
    )
$$;

-- from: 20260423_z_inventory_scope_accounting_closing_rls.sql
create or replace function public.erp_inventory_scope_matches(
  target_company text,
  target_company_id uuid,
  target_department text
)
returns boolean
language sql
stable
as $$
  select
    public.erp_can_view_all_inventory_companies()
    or (
      public.erp_inventory_company_scope_matches(target_company, target_company_id)
      and (
        public.erp_can_view_all_department_inventory()
        or nullif(btrim(coalesce(target_department, '')), '') is null
        or (
          public.erp_department_name() is not null
          and lower(public.erp_department_name()) = lower(btrim(target_department))
        )
      )
    )
$$;

-- from: 20260505_enable_rls_for_public_advisor.sql
create or replace function public.erp_claim_uuid(claim_key text)
returns uuid
language sql
stable
as $$
  select case
    when coalesce(auth.jwt() ->> claim_key, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (auth.jwt() ->> claim_key)::uuid
    else null
  end
$$;

-- from: 20260505_enable_rls_for_public_advisor.sql
create or replace function public.erp_staff_id()
returns uuid
language sql
stable
as $$
  select public.erp_claim_uuid('erp_staff_id')
$$;

-- from: 20260505_enable_rls_for_public_advisor.sql
create or replace function public.erp_company_id()
returns uuid
language sql
stable
as $$
  select public.erp_claim_uuid('erp_company_id')
$$;

-- from: 20260505_enable_rls_for_public_advisor.sql
create or replace function public.erp_is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(nullif(auth.jwt() ->> 'erp_is_admin', '')::boolean, false)
$$;

-- from: 20260505_enable_rls_for_public_advisor.sql
create or replace function public.erp_can_manage_company()
returns boolean
language sql
stable
as $$
  select coalesce(nullif(auth.jwt() ->> 'erp_can_manage_company', '')::boolean, false)
$$;

-- from: 20260505_enable_rls_for_public_advisor.sql
create or replace function public.erp_company_matches(target_company_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.erp_is_admin()
    or (
      public.erp_company_id() is not null
      and target_company_id is not null
      and public.erp_company_id() = target_company_id
    )
$$;

-- from: 20260505_enable_rls_for_public_advisor.sql
create or replace function public.erp_company_name_matches(target_company_name text)
returns boolean
language sql
stable
as $$
  select
    public.erp_is_admin()
    or (
      nullif(btrim(coalesce(auth.jwt() ->> 'erp_company_name', '')), '') is not null
      and nullif(btrim(coalesce(target_company_name, '')), '') is not null
      and btrim(auth.jwt() ->> 'erp_company_name') = btrim(target_company_name)
    )
$$;

-- from: 20260505_enable_rls_for_public_advisor.sql
create or replace function public.erp_target_staff_same_company(target_staff_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.staff_members as s
    where s.id = target_staff_id
      and public.erp_company_id() is not null
      and s.company_id = public.erp_company_id()
  )
$$;

-- from: 20260505_enable_rls_for_public_advisor.sql
create or replace function public.erp_target_staff_in_scope(target_staff_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.erp_is_admin()
    or target_staff_id = public.erp_staff_id()
    or (
      public.erp_can_manage_company()
      and public.erp_target_staff_same_company(target_staff_id)
    )
$$;

-- from: 20260505_enable_rls_for_public_advisor.sql
create or replace function public.erp_is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(nullif(auth.jwt() ->> 'erp_is_admin', '')::boolean, false)
$$;

-- from: 20260505_enable_rls_for_public_advisor.sql
create or replace function public.erp_can_manage_company()
returns boolean
language sql
stable
as $$
  select coalesce(nullif(auth.jwt() ->> 'erp_can_manage_company', '')::boolean, false)
$$;

-- from: 20260505_enable_rls_for_public_advisor.sql
create or replace function public.erp_company_name_matches(target_company_name text)
returns boolean
language sql
stable
as $$
  select
    public.erp_is_admin()
    or (
      nullif(btrim(coalesce(auth.jwt() ->> 'erp_company_name', '')), '') is not null
      and nullif(btrim(coalesce(target_company_name, '')), '') is not null
      and btrim(auth.jwt() ->> 'erp_company_name') = btrim(target_company_name)
    )
$$;

-- from: 20260506_board_posts_updated_at.sql
create or replace function public.touch_board_posts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- from: 20260508_required_operational_feature_tables.sql
create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- from: chat_retention_and_file_meta.sql
CREATE OR REPLACE FUNCTION cleanup_chat_messages_by_retention()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cnt BIGINT;
  cutoff_5y TIMESTAMPTZ := NOW() - INTERVAL '5 years';
  cutoff_1y TIMESTAMPTZ := NOW() - INTERVAL '1 year';
  cutoff_3m TIMESTAMPTZ := NOW() - INTERVAL '3 months';
BEGIN
  WITH to_delete AS (
    SELECT id FROM messages
    WHERE (file_url IS NULL OR file_url = '') AND created_at < cutoff_5y
    UNION
    SELECT id FROM messages
    WHERE file_url IS NOT NULL AND file_url <> ''
      AND (file_kind = 'image' OR (file_kind = 'file' AND COALESCE(file_size_bytes, 0) <= 10485760))
      AND created_at < cutoff_1y
    UNION
    SELECT id FROM messages
    WHERE file_url IS NOT NULL AND file_url <> ''
      AND (file_kind = 'video' OR COALESCE(file_size_bytes, 0) > 10485760)
      AND created_at < cutoff_3m
  )
  DELETE FROM messages WHERE id IN (SELECT id FROM to_delete);

  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN cnt;
END;
$$;

-- from: chat_rooms_last_message.sql
CREATE OR REPLACE FUNCTION update_chat_room_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chat_rooms
  SET
    last_message_at = NEW.created_at,
    last_message_preview = LEFT(COALESCE(NEW.content, '(파일)'), 80)
  WHERE id = NEW.room_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;