-- 멱등 보장 DO 블록 — 통합본에서는 불필요. 참고용 보관.

-- 블록 54개



-- from: 2026-05-11_001_staff_licenses_enhance.sql
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

-- from: 2026-05-11_004_leave_balances.sql
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

-- from: 2026-05-11_006_companies_leave_policy.sql
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

-- from: 2026-05-11_006_companies_leave_policy.sql
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

-- from: 2026-05-11_007_annual_leave_promotion_logs.sql
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

-- from: 2026-05-12_001_license_continuing_education.sql
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

-- from: 00_full_schema_and_migrations.sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory') THEN
    ALTER TABLE inventory ADD COLUMN IF NOT EXISTS name VARCHAR(100);
    ALTER TABLE inventory ADD COLUMN IF NOT EXISTS stock INT DEFAULT 0;
    ALTER TABLE inventory ADD COLUMN IF NOT EXISTS min_stock INT DEFAULT 10;
    ALTER TABLE inventory ADD COLUMN IF NOT EXISTS department VARCHAR(50);
    UPDATE inventory SET name = COALESCE(name, item_name), stock = COALESCE(NULLIF(stock,0), quantity) WHERE name IS NULL OR stock = 0;
  END IF;
END $$;

-- from: 00_full_schema_and_migrations.sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_logs') THEN
    ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS inventory_id UUID REFERENCES inventory(id);
    ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS change_type VARCHAR(20);
    ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS prev_quantity INT;
    ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS next_quantity INT;
    ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS actor_name TEXT;
    ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS company TEXT;
  END IF;
END $$;

-- from: 00_full_schema_and_migrations.sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'staff_members_shift_id_fkey' AND table_name = 'staff_members') THEN
    ALTER TABLE staff_members ADD CONSTRAINT staff_members_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES work_shifts(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- from: 20260325_chat_push_queue_hardening.sql
do $$
begin
  if to_regclass('public.chat_push_jobs') is not null then
    alter table public.chat_push_jobs
      add column if not exists next_attempt_at timestamptz,
      add column if not exists dead_lettered_at timestamptz;

    update public.chat_push_jobs
    set next_attempt_at = coalesce(next_attempt_at, created_at, now())
    where next_attempt_at is null;

    alter table public.chat_push_jobs
      alter column next_attempt_at set default now();

    alter table public.chat_push_jobs
      alter column next_attempt_at set not null;
  end if;
end
$$;

-- from: 20260325_chat_push_queue_hardening.sql
do $$
begin
  if to_regclass('public.chat_push_jobs') is not null then
    execute '
      create index if not exists idx_chat_push_jobs_ready
      on public.chat_push_jobs (next_attempt_at, created_at)
      where processed_at is null and dead_lettered_at is null
    ';
  end if;
end
$$;

-- from: 20260330_advanced_ops_foundation.sql
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'todo_reminder_logs_status_check'
  ) then
    alter table public.todo_reminder_logs
      add constraint todo_reminder_logs_status_check
      check (status in ('sent', 'duplicate', 'failed'));
  end if;
end $$;

-- from: 20260330_advanced_ops_foundation.sql
do $$
begin
  if to_regclass('public.wiki_documents') is not null then
    create table if not exists public.wiki_document_versions (
      id uuid primary key default gen_random_uuid(),
      document_id uuid not null references public.wiki_documents(id) on delete cascade,
      version_no integer not null,
      title text not null,
      summary text null,
      content text not null default '',
      tags text[] not null default '{}'::text[],
      editor_ids uuid[] not null default '{}'::uuid[],
      company_id uuid null,
      company_name text not null default '전체',
      change_summary text null,
      restore_of_version_id uuid null,
      created_by uuid null references public.staff_members(id) on delete set null,
      created_at timestamptz not null default now(),
      unique(document_id, version_no)
    );

    if not exists (
      select 1
      from pg_constraint
      where conname = 'wiki_document_versions_restore_of_version_id_fkey'
    ) then
      alter table public.wiki_document_versions
        add constraint wiki_document_versions_restore_of_version_id_fkey
        foreign key (restore_of_version_id)
        references public.wiki_document_versions(id)
        on delete set null;
    end if;

    create index if not exists idx_wiki_document_versions_document_created
      on public.wiki_document_versions(document_id, created_at desc);
  end if;
end $$;

-- from: 20260330_advanced_ops_foundation.sql
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'backup_restore_runs_status_check'
  ) then
    alter table public.backup_restore_runs
      add constraint backup_restore_runs_status_check
      check (status in ('preview', 'running', 'completed', 'failed'));
  end if;
end $$;

-- from: 20260330_advanced_ops_foundation.sql
do $$
begin
  if to_regclass('public.wiki_document_versions') is not null then
    alter table public.wiki_document_versions enable row level security;

    drop policy if exists wiki_document_versions_select_scope on public.wiki_document_versions;
    drop policy if exists wiki_document_versions_insert_scope on public.wiki_document_versions;
    drop policy if exists wiki_document_versions_update_scope on public.wiki_document_versions;
    drop policy if exists wiki_document_versions_delete_scope on public.wiki_document_versions;

    create policy wiki_document_versions_select_scope
    on public.wiki_document_versions
    for select
    using (
      public.erp_is_admin()
      or company_id is null
      or public.erp_company_matches(company_id)
    );

    create policy wiki_document_versions_insert_scope
    on public.wiki_document_versions
    for insert
    with check (
      public.erp_is_admin()
      or company_id is null
      or public.erp_company_matches(company_id)
    );

    create policy wiki_document_versions_update_scope
    on public.wiki_document_versions
    for update
    using (
      public.erp_is_admin()
      or company_id is null
      or public.erp_company_matches(company_id)
    )
    with check (
      public.erp_is_admin()
      or company_id is null
      or public.erp_company_matches(company_id)
    );

    create policy wiki_document_versions_delete_scope
    on public.wiki_document_versions
    for delete
    using (
      public.erp_is_admin()
      or company_id is null
      or public.erp_company_matches(company_id)
    );
  end if;
end $$;

-- from: 20260330_wiki_todo_foundation.sql
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'todos_priority_check'
  ) then
    alter table public.todos
      add constraint todos_priority_check
      check (priority in ('low', 'medium', 'high', 'urgent'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'todos_repeat_type_check'
  ) then
    alter table public.todos
      add constraint todos_repeat_type_check
      check (repeat_type in ('none', 'daily', 'weekly', 'monthly'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'todos_assignee_kind_check'
  ) then
    alter table public.todos
      add constraint todos_assignee_kind_check
      check (assignee_kind in ('self', 'team', 'follow_up'));
  end if;
end $$;

-- from: 20260331_inventory_unit_support.sql
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'inventory'
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_unit_check'
  ) then
    alter table public.inventory
      add constraint inventory_unit_check
      check (unit in ('EA', 'BOX'));
  end if;
end $$;

-- from: 20260331_op_check_foundation.sql
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'op_check_templates_scope_check'
  ) then
    alter table public.op_check_templates
      add constraint op_check_templates_scope_check
      check (template_scope in ('surgery', 'anesthesia'));
  end if;
end $$;

-- from: 20260331_op_check_foundation.sql
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'op_patient_checks_status_check'
  ) then
    alter table public.op_patient_checks
      add constraint op_patient_checks_status_check
      check (status in ('준비중', '준비완료', '수술중', '완료'));
  end if;
end $$;

-- from: 20260403_roster_policy_settings.sql
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'roster_policy_settings_policy_type_check'
  ) then
    alter table public.roster_policy_settings
      add constraint roster_policy_settings_policy_type_check
      check (policy_type in ('pattern_profile', 'generation_rule'));
  end if;
end $$;

-- from: 20260407_staff_working_hours_decimal.sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'staff_members'
      AND column_name = 'working_hours_per_week'
  ) THEN
    EXECUTE '
      ALTER TABLE public.staff_members
      ALTER COLUMN working_hours_per_week TYPE NUMERIC(5,2)
      USING working_hours_per_week::NUMERIC(5,2)
    ';

    EXECUTE '
      ALTER TABLE public.staff_members
      ALTER COLUMN working_hours_per_week SET DEFAULT 40
    ';

    EXECUTE '
      UPDATE public.staff_members
      SET working_hours_per_week = COALESCE(
        NULLIF(permissions -> ''work_conditions'' ->> ''working_hours_per_week'', '''')::NUMERIC(5,2),
        working_hours_per_week
      )
      WHERE permissions ? ''work_conditions''
        AND NULLIF(permissions -> ''work_conditions'' ->> ''working_hours_per_week'', '''') IS NOT NULL
    ';
  END IF;
END $$;

-- from: 20260407_staff_working_hours_decimal.sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'employment_contracts'
      AND column_name = 'working_hours_per_week'
  ) THEN
    EXECUTE '
      ALTER TABLE public.employment_contracts
      ALTER COLUMN working_hours_per_week TYPE NUMERIC(5,2)
      USING working_hours_per_week::NUMERIC(5,2)
    ';

    EXECUTE '
      ALTER TABLE public.employment_contracts
      ALTER COLUMN working_hours_per_week SET DEFAULT 40
    ';
  END IF;
END $$;

-- from: 20260430_payroll_record_type_unique.sql
do $$
declare
  settlement_date_type text;
begin
  select data_type
    into settlement_date_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'payroll_records'
    and column_name = 'settlement_date';

  if settlement_date_type is not null and settlement_date_type <> 'date' then
    alter table public.payroll_records
      alter column settlement_date type date
      using case
        when settlement_date::text ~ '^\d{4}-\d{2}-\d{2}$' then settlement_date::text::date
        when settlement_date::text ~ '^\d{4}-\d{2}$' then (settlement_date::text || '-01')::date
        else null
      end;
  end if;
end $$;

-- from: 20260430_payroll_record_type_unique.sql
do $$
declare
  target_constraint text;
begin
  for target_constraint in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'payroll_records'
      and con.contype = 'u'
      and (
        select array_agg(att.attname order by key_order.ordinality)
        from unnest(con.conkey) with ordinality as key_order(attnum, ordinality)
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = key_order.attnum
      ) = array['staff_id', 'year_month']
  loop
    execute format('alter table public.payroll_records drop constraint %I', target_constraint);
  end loop;
end $$;

-- from: 20260504_chat_board_loading_indexes.sql
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chat_rooms'
      and column_name = 'last_message_at'
  ) then
    execute 'create index if not exists idx_chat_rooms_last_message_at_desc on public.chat_rooms (last_message_at desc nulls last, created_at desc)';
  end if;
end $$;

-- from: 20260504_chat_board_loading_indexes.sql
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'board_posts'
      and column_name = 'schedule_date'
  ) then
    execute 'create index if not exists idx_board_posts_board_type_schedule_date_time on public.board_posts (board_type, schedule_date, schedule_time)';
  end if;
end $$;

-- from: 20260504_chat_board_loading_indexes.sql
do $$
begin
  if to_regclass('public.board_post_likes') is not null then
    execute 'create index if not exists idx_board_post_likes_user_id on public.board_post_likes (user_id)';
  end if;
end $$;

-- from: 20260504_chat_board_loading_indexes.sql
do $$
begin
  if to_regclass('public.message_bookmarks') is not null then
    execute 'create index if not exists idx_message_bookmarks_user_message on public.message_bookmarks (user_id, message_id)';
  end if;
end $$;

-- from: 20260505_enable_rls_for_public_advisor.sql
do $$
declare
  target_table record;
begin
  for target_table in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relname <> 'spatial_ref_sys'
  loop
    execute format(
      'alter table %I.%I enable row level security',
      target_table.schema_name,
      target_table.table_name
    );
  end loop;
end $$;

-- from: 20260505_enable_rls_for_public_advisor.sql
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'payroll',
    'payroll_bonus_items',
    'payroll_deduction_controls',
    'payroll_records',
    'payroll_retro_adjustments'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);

      execute format('drop policy if exists %I on public.%I', table_name || '_select_scope', table_name);
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.erp_target_staff_in_scope(staff_id))',
        table_name || '_select_scope',
        table_name
      );

      execute format('drop policy if exists %I on public.%I', table_name || '_insert_scope', table_name);
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (public.erp_is_admin() or (public.erp_can_manage_company() and public.erp_target_staff_same_company(staff_id)))',
        table_name || '_insert_scope',
        table_name
      );

      execute format('drop policy if exists %I on public.%I', table_name || '_update_scope', table_name);
      execute format(
        'create policy %I on public.%I for update to authenticated using (public.erp_is_admin() or (public.erp_can_manage_company() and public.erp_target_staff_same_company(staff_id))) with check (public.erp_is_admin() or (public.erp_can_manage_company() and public.erp_target_staff_same_company(staff_id)))',
        table_name || '_update_scope',
        table_name
      );

      execute format('drop policy if exists %I on public.%I', table_name || '_delete_scope', table_name);
      execute format(
        'create policy %I on public.%I for delete to authenticated using (public.erp_is_admin() or (public.erp_can_manage_company() and public.erp_target_staff_same_company(staff_id)))',
        table_name || '_delete_scope',
        table_name
      );
    end if;
  end loop;
end $$;

-- from: 20260505_enable_rls_for_public_advisor.sql
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'freelancer_payments',
    'payroll_approval_logs',
    'payroll_approval_workflows',
    'payroll_calendar_items',
    'payroll_locks'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);

      execute format('drop policy if exists %I on public.%I', table_name || '_select_scope', table_name);
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.erp_company_name_matches(company_name))',
        table_name || '_select_scope',
        table_name
      );

      execute format('drop policy if exists %I on public.%I', table_name || '_write_scope', table_name);
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.erp_is_admin() or (public.erp_can_manage_company() and public.erp_company_name_matches(company_name))) with check (public.erp_is_admin() or (public.erp_can_manage_company() and public.erp_company_name_matches(company_name)))',
        table_name || '_write_scope',
        table_name
      );
    end if;
  end loop;
end $$;

-- from: 20260505_enable_rls_for_public_advisor.sql
do $$
declare
  target_table record;
begin
  for target_table in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
      and c.relname <> 'spatial_ref_sys'
      and not exists (
        select 1
        from pg_policy as p
        where p.polrelid = c.oid
      )
  loop
    execute format(
      'create policy %I on %I.%I for all to authenticated using (true) with check (true)',
      'authenticated_access',
      target_table.schema_name,
      target_table.table_name
    );
  end loop;
end $$;

-- from: 20260505_enable_rls_for_public_advisor.sql
do $$
declare
  target_function record;
begin
  for target_function in
    select p.oid::regprocedure as function_signature
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format(
      'alter function %s set search_path = public, pg_temp',
      target_function.function_signature
    );
  end loop;
end $$;

-- from: 20260507_companies_payment_day.sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'companies_payment_day_check'
      AND conrelid = 'companies'::regclass
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT companies_payment_day_check CHECK (payment_day BETWEEN 1 AND 31);
  END IF;
END $$;

-- from: 20260508_runtime_log_error_cleanup.sql
do $$
begin
  if to_regclass('public.staff_members') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'staff_members' and column_name = 'password'
     ) then
    update public.staff_members
    set passwd = coalesce(passwd, password)
    where passwd is null;
  end if;
end $$;

-- from: 20260508_runtime_log_error_cleanup.sql
do $$
begin
  if to_regclass('public.inventory') is not null then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'inventory' and column_name = 'item_name'
    ) then
      update public.inventory set name = coalesce(name, item_name) where name is null;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'inventory' and column_name = 'quantity'
    ) then
      update public.inventory set stock = coalesce(stock, quantity, 0) where stock is null;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'inventory' and column_name = 'min_quantity'
    ) then
      update public.inventory set min_stock = coalesce(min_stock, min_quantity, 10) where min_stock is null;
    end if;
  end if;
end $$;

-- from: 20260508_runtime_log_error_cleanup.sql
do $$
begin
  if to_regclass('public.approvals') is not null then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'approvals' and column_name = 'approver_line'
    ) then
      update public.approvals
      set approval_line = coalesce(approval_line, approver_line)
      where approval_line is null;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'approvals' and column_name = 'title'
    ) then
      update public.approvals set name = coalesce(name, title) where name is null;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'approvals' and column_name = 'type'
    ) then
      update public.approvals set doc_type = coalesce(doc_type, "type") where doc_type is null;
    end if;
  end if;
end $$;

-- from: 20260508_runtime_log_error_cleanup.sql
do $$
begin
  if to_regclass('public.attendance_corrections') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'attendance_corrections' and column_name = 'original_date'
     ) then
    update public.attendance_corrections
    set attendance_date = coalesce(attendance_date, original_date)
    where attendance_date is null;
  end if;
end $$;

-- from: 20260508_runtime_log_error_cleanup.sql
do $$
begin
  if to_regclass('public.system_configs') is not null then
    alter table public.system_configs enable row level security;
    drop policy if exists system_configs_runtime_read on public.system_configs;
    create policy system_configs_runtime_read
      on public.system_configs
      for select
      to anon, authenticated
      using (true);
  end if;

  if to_regclass('public.popups') is not null then
    alter table public.popups enable row level security;
    drop policy if exists popups_runtime_all on public.popups;
    create policy popups_runtime_all
      on public.popups
      for all
      to anon, authenticated
      using (true)
      with check (true);
  end if;

  if to_regclass('public.messages') is not null then
    alter table public.messages enable row level security;
    drop policy if exists messages_runtime_all on public.messages;
    create policy messages_runtime_all
      on public.messages
      for all
      to anon, authenticated
      using (true)
      with check (true);
  end if;

  if to_regclass('public.notifications') is not null then
    alter table public.notifications enable row level security;
    drop policy if exists notifications_runtime_all on public.notifications;
    create policy notifications_runtime_all
      on public.notifications
      for all
      to anon, authenticated
      using (true)
      with check (true);
  end if;
end $$;

-- from: 20260510_company_scoped_approval_forms.sql
DO $$
BEGIN
  ALTER TABLE public.approval_form_types
    ADD COLUMN IF NOT EXISTS company_name TEXT NOT NULL DEFAULT '전체',
    ADD COLUMN IF NOT EXISTS base_slug TEXT;

  ALTER TABLE public.approval_form_types
    DROP CONSTRAINT IF EXISTS approval_form_types_slug_key;

  DROP INDEX IF EXISTS public.approval_form_types_slug_key;

  CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_form_types_company_slug
    ON public.approval_form_types(company_name, slug);

  CREATE INDEX IF NOT EXISTS idx_approval_form_types_company_active
    ON public.approval_form_types(company_name, is_active, sort_order);
END $$;

-- from: additional_features.sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'approvals') THEN
    ALTER TABLE approvals ADD COLUMN IF NOT EXISTS approver_line JSONB;  -- [{id, name, order}]
    ALTER TABLE approvals ADD COLUMN IF NOT EXISTS current_step INT DEFAULT 0;
    ALTER TABLE approvals ADD COLUMN IF NOT EXISTS rejection_comment TEXT;
  END IF;
END $$;

-- from: additional_features.sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leave_requests') THEN
    ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS attachment_url TEXT;
    ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS attachment_name TEXT;
  END IF;
END $$;

-- from: additional_features.sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messages') THEN
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chat_messages') THEN
    ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
    ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
  END IF;
END $$;

-- from: advanced_features.sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messages') THEN
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_url TEXT;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id UUID;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chat_messages') THEN
    ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS file_url TEXT;
    ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_to_id UUID;
  END IF;
END $$;

-- from: advanced_features.sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'attendance') THEN
    ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_in TIMESTAMPTZ;
    ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_out TIMESTAMPTZ;
    ALTER TABLE attendance ADD COLUMN IF NOT EXISTS location_lat DECIMAL(10, 8);
    ALTER TABLE attendance ADD COLUMN IF NOT EXISTS location_lon DECIMAL(11, 8);
  END IF;
END $$;

-- from: advanced_features.sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'staff_members') THEN
    ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS annual_leave_used DECIMAL(4,1) DEFAULT 0;
    ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS join_date DATE;
  END IF;
END $$;

-- from: attendance_payroll_integration.sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'staff_members') THEN
    ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS base_salary BIGINT DEFAULT 0;
    ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS join_date DATE;
  END IF;
END $$;

-- from: attendance_payroll_integration.sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payroll_records') THEN
    ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS attendance_deduction BIGINT DEFAULT 0;
    ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS attendance_deduction_detail JSONB;  -- { late: 2회 20000, absent: 1일 50000 }
  END IF;
END $$;

-- from: chat_retention_and_file_meta.sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messages') THEN
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_kind VARCHAR(20); -- 'image' | 'video' | 'file'
  END IF;
END $$;

-- from: contract_templates_seal_url.sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'contract_templates'
  ) THEN
    CREATE TABLE public.contract_templates (
      company_name TEXT PRIMARY KEY,
      template_content TEXT,
      updated_at TIMESTAMPTZ,
      seal_url TEXT
    );
  END IF;
END $$;

-- from: hr_certificate_types_expand.sql
DO $$
DECLARE conname text;
BEGIN
  SELECT conname INTO conname FROM pg_constraint 
    WHERE conrelid = 'certificate_issuances'::regclass AND contype = 'c' AND conname LIKE '%cert_type%';
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE certificate_issuances DROP CONSTRAINT %I', conname);
  END IF;
  ALTER TABLE certificate_issuances ADD CONSTRAINT certificate_issuances_cert_type_check 
    CHECK (cert_type IN ('재직증명서','경력증명서','퇴직증명서','급여인증서','근무확인서','원천징수영수증','소득금액증명원'));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- from: hr_interim_taxfree_upgrade.sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll_records' AND column_name = 'record_type') THEN
    ALTER TABLE payroll_records ADD COLUMN record_type VARCHAR(20) DEFAULT 'regular';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll_records' AND column_name = 'severance_pay') THEN
    ALTER TABLE payroll_records ADD COLUMN severance_pay BIGINT DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll_records' AND column_name = 'settlement_reason') THEN
    ALTER TABLE payroll_records ADD COLUMN settlement_reason TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll_records' AND column_name = 'settlement_date') THEN
    ALTER TABLE payroll_records ADD COLUMN settlement_date DATE;
  END IF;
END $$;

-- from: hr_phase1_attendance_leave_shifts.sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM work_shifts LIMIT 1) THEN
    INSERT INTO work_shifts (company_name, name, start_time, end_time, description) VALUES
      ('SY INC.', '데이(일반)', '09:00', '18:00', '일반 행정/외래 근무 (휴게 1시간 포함)'),
      ('박철홍정형외과', '나이트전담', '23:00', '08:00', '입원병동 야간 전담 근무'),
      ('수연의원', '스윙(중간근무)', '13:00', '22:00', '외래/수술 연계 중간 근무');
  END IF;
END $$;

-- from: messenger_enhancements.sql
DO $$
BEGIN
  -- messages 테이블 존재 시 file_url, reply_to_id 추가
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messages') THEN
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_url TEXT;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id UUID;
  END IF;
  
  -- chat_messages 테이블만 있는 경우 (messages 없음) 컬럼 추가
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chat_messages') THEN
    ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS file_url TEXT;
    ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_to_id UUID;
  END IF;
END $$;