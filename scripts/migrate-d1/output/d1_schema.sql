-- ============================================================
-- D1 통합 스키마 (자동 생성)
-- 생성일: 2026-05-17T05:28:51.378Z
-- 원본: supabase/migrations/ + supabase_migrations/ (107개 파일)
-- 테이블 수: 116
-- 주의: 함수·트리거·정책은 별도 파일로 추출됨
-- ============================================================

PRAGMA foreign_keys = ON;

-- ── access_logs (from: 20260508_required_operational_feature_tables.sql)
create table if not exists access_logs (
  id uuid primary key DEFAULT (''),
  user_id text,
  user_name text,
  company text,
  menu text,
  action text,
  ip_address text,
  user_agent text,
  created_at TEXT not null DEFAULT CURRENT_TIMESTAMP
);

-- ── annual_leave_promotion_logs (from: annual_leave_promotion_logs.sql)
create table if not exists annual_leave_promotion_logs (
  id uuid primary key DEFAULT (''),
  staff_id uuid not null references staff_members(id) on delete cascade,
  company_name text,
  target_year integer not null,
  step INTEGER not null check (step in (1, 2)),
  sent_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
  remain_days REAL,
  meta TEXT
);

-- ── approval_delegation (from: 01_additional_features.sql)
CREATE TABLE IF NOT EXISTS approval_delegation (
  id TEXT PRIMARY KEY NOT NULL,
  delegator_id TEXT REFERENCES staff_members(id),
  delegate_id TEXT REFERENCES staff_members(id),
  start_date TEXT,
  end_date TEXT,
  is_active INTEGER DEFAULT true,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── approval_form_types (from: approval_form_types.sql)
CREATE TABLE IF NOT EXISTS approval_form_types (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INT DEFAULT 0,
  is_active INTEGER DEFAULT true,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── approval_history (from: additional_features.sql)
CREATE TABLE IF NOT EXISTS approval_history (
  id TEXT PRIMARY KEY NOT NULL,
  approval_id TEXT NOT NULL,
  approver_id TEXT,
  approver_name TEXT,
  action TEXT NOT NULL,  -- '승인','반려','요청'
  comment TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── approval_templates (from: additional_features.sql)
CREATE TABLE IF NOT EXISTS approval_templates (
  id TEXT PRIMARY KEY NOT NULL,
  form_type TEXT NOT NULL UNIQUE,  -- 휴가신청, 출결정정 등
  default_values TEXT,  -- {leave_type:'연차', ...}
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── approvals (from: 00_full_schema_and_migrations.sql)
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY NOT NULL,
  sender_id TEXT REFERENCES staff_members(id),
  sender_name TEXT,
  sender_company TEXT,
  type TEXT,
  title TEXT NOT NULL,
  content TEXT,
  status TEXT DEFAULT '대기',
  current_approver_id TEXT REFERENCES staff_members(id),
  approver_line TEXT,
  current_step INT DEFAULT 0,
  rejection_comment TEXT,
  meta_data TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── asset_loan_item_settings (from: 20260327_asset_loan_item_settings.sql)
create table if not exists asset_loan_item_settings (
  company_name text primary key,
  items TEXT not null default '[]',
  updated_at TEXT not null DEFAULT CURRENT_TIMESTAMP
);

-- ── asset_loans (from: hr_cert_asset_card_calendar.sql)
CREATE TABLE IF NOT EXISTS asset_loans (
  id TEXT PRIMARY KEY NOT NULL,
  staff_id TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('노트북','PC','모니터','키보드','마우스','회의실키','기타')),
  asset_name TEXT,
  loaned_at TEXT NOT NULL,
  returned_at TEXT,
  condition_notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── attendance (from: 00_full_schema_and_migrations.sql)
CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY NOT NULL,
  staff_id TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  status TEXT DEFAULT '정상',
  location_lat REAL,
  location_lon REAL,
  location_lat_out REAL,
  location_lon_out REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(staff_id, date)
);

-- ── attendance_corrections (from: 00_full_schema_and_migrations.sql)
CREATE TABLE IF NOT EXISTS attendance_corrections (
  id TEXT PRIMARY KEY NOT NULL,
  staff_id TEXT REFERENCES staff_members(id),
  original_date TEXT,
  correction_type TEXT,
  reason TEXT,
  status TEXT DEFAULT '대기',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── attendance_deduction_rules (from: attendance_payroll_integration.sql)
CREATE TABLE IF NOT EXISTS attendance_deduction_rules (
  id TEXT PRIMARY KEY NOT NULL,
  company_name TEXT NOT NULL DEFAULT '전체',
  -- 지각: 'hourly' = 시급×시간, 'fixed' = 회당 고정금액
  late_deduction_type TEXT NOT NULL DEFAULT 'fixed' CHECK (late_deduction_type IN ('hourly', 'fixed')),
  late_deduction_amount INT DEFAULT 10000,  -- fixed일 때 회당 금액(원)
  -- 조퇴: 동일
  early_leave_deduction_type TEXT NOT NULL DEFAULT 'fixed' CHECK (early_leave_deduction_type IN ('hourly', 'fixed')),
  early_leave_deduction_amount INT DEFAULT 10000,
  -- 결근: 일당 차감 (기본급/근로일수)
  absent_use_daily_rate INTEGER DEFAULT true,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_name)
);

-- ── attendances (from: hr_phase1_attendance_leave_shifts.sql)
CREATE TABLE IF NOT EXISTS attendances (
  id TEXT PRIMARY KEY NOT NULL,
  staff_id TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  company_id TEXT,
  company_name TEXT,
  work_date TEXT NOT NULL,
  check_in_time TEXT,
  check_out_time TEXT,
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent','late','early_leave','sick_leave','annual_leave','holiday','half_leave')),
  work_hours_minutes INT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(staff_id, work_date)
);

-- ── audit_logs (from: additional_features.sql)
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT,
  user_name TEXT,
  action TEXT NOT NULL,  -- '급여수정','결재승인','연차차감','인사변경' 등
  target_type TEXT,     -- 'payroll','approval','leave_request','staff'
  target_id TEXT,
  details TEXT,
  ip_address TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── backup_restore_runs (from: 20260330_advanced_ops_foundation.sql)
create table if not exists backup_restore_runs (
  id uuid primary key DEFAULT (''),
  file_name text not null,
  meta TEXT not null default '{}',
  preview TEXT not null default '[]',
  result_summary TEXT not null default '{}',
  log_lines text[] not null default '{}',
  total_tables integer not null default 0,
  total_rows INTEGER not null default 0,
  status text not null default 'running',
  requested_by uuid null references staff_members(id) on delete set null,
  requested_by_name text null,
  started_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT null
);

-- ── board_post_comments (from: board_workboard_updates.sql)
CREATE TABLE IF NOT EXISTS board_post_comments (
  id TEXT PRIMARY KEY NOT NULL,
  post_id TEXT REFERENCES board_posts(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES staff_members(id) ON DELETE SET NULL,
  author_name TEXT,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── board_post_likes (from: board_workboard_updates.sql)
CREATE TABLE IF NOT EXISTS board_post_likes (
  id TEXT PRIMARY KEY NOT NULL,
  post_id TEXT REFERENCES board_posts(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES staff_members(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(post_id, user_id)
);

-- ── board_post_reads (from: 20260329_board_post_status_reads.sql)
create table if not exists board_post_reads (
  id uuid primary key DEFAULT (''),
  post_id uuid not null references board_posts(id) on delete cascade,
  user_id uuid not null references staff_members(id) on delete cascade,
  read_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
  unique (post_id, user_id)
);

-- ── board_posts (from: 00_full_schema_and_migrations.sql)
CREATE TABLE IF NOT EXISTS board_posts (
  id TEXT PRIMARY KEY NOT NULL,
  board_type TEXT,
  title TEXT NOT NULL,
  content TEXT,
  author_id TEXT,
  author_name TEXT,
  company TEXT,
  views INT DEFAULT 0,
  likes_count INT DEFAULT 0,
  tags TEXT DEFAULT '[]',
  is_pinned INTEGER DEFAULT false,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── certificate_issuances (from: hr_cert_asset_card_calendar.sql)
CREATE TABLE IF NOT EXISTS certificate_issuances (
  id TEXT PRIMARY KEY NOT NULL,
  staff_id TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  cert_type TEXT NOT NULL CHECK (cert_type IN ('재직증명서','경력증명서','퇴직증명서','급여인증서','근무확인서','원천징수영수증','소득금액증명원')),
  serial_no TEXT UNIQUE NOT NULL,
  purpose TEXT,
  issued_at TEXT DEFAULT CURRENT_TIMESTAMP,
  issued_by TEXT REFERENCES staff_members(id),
  pdf_url TEXT
);

-- ── chat_messages (from: TOTAL_RECOVERY_SCHEMA.sql)
CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY NOT NULL,
    room_id TEXT REFERENCES chat_rooms(id) ON DELETE CASCADE,
    sender_id TEXT REFERENCES staff_members(id),
    content TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── chat_push_jobs (from: 20260508_runtime_log_error_cleanup.sql)
create table if not exists chat_push_jobs (
  id uuid primary key DEFAULT (''),
  message_id uuid not null references messages(id) on delete cascade,
  room_id uuid not null references chat_rooms(id) on delete cascade,
  sender_id uuid null references staff_members(id) on delete set null,
  created_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
  processing_started_at TEXT null,
  processed_at TEXT null,
  attempt_count integer not null default 0,
  last_error text null,
  next_attempt_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
  dead_lettered_at TEXT null
);

-- ── chat_room_prefs (from: 20260415_chat_room_prefs_and_message_columns.sql)
create table if not exists chat_room_prefs (
  id uuid primary key DEFAULT (''),
  user_id uuid not null references staff_members(id) on delete cascade,
  room_id uuid not null,
  pinned INTEGER not null default false,
  hidden INTEGER not null default false,
  updated_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
  unique (user_id, room_id)
);

-- ── chat_rooms (from: 00_full_schema_and_migrations.sql)
CREATE TABLE IF NOT EXISTS chat_rooms (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT,
  type TEXT DEFAULT 'group',
  members TEXT,
  is_announcement INTEGER DEFAULT FALSE,
  created_by TEXT REFERENCES staff_members(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── companies (from: 00_full_schema_and_migrations.sql)
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('MSO','HOSPITAL','CLINIC')),
  mso_id TEXT REFERENCES companies(id),
  is_active INTEGER DEFAULT true,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── company_expenses (from: 20260508_required_operational_feature_tables.sql)
create table if not exists company_expenses (
  id uuid primary key DEFAULT (''),
  company text not null,
  year_month text not null,
  rent REAL not null default 0,
  materials REAL not null default 0,
  utilities REAL not null default 0,
  others REAL not null default 0,
  created_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT not null DEFAULT CURRENT_TIMESTAMP
);

-- ── company_holidays (from: 20260510_company_holidays.sql)
create table if not exists company_holidays (
  id uuid primary key DEFAULT (''),
  company_name text not null default '전체',
  holiday_date date not null,
  name text not null,
  note text,
  created_by text,
  created_by_name text,
  created_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
  constraint company_holidays_company_date_unique unique (company_name, holiday_date)
);

-- ── company_seals (from: 20260510_company_scoped_approval_forms.sql)
CREATE TABLE IF NOT EXISTS company_seals (
  id TEXT PRIMARY KEY NOT NULL,
  company TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT '대표인',
  image_url TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT true,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── contract_templates (from: contract_templates_seal_url.sql)
CREATE TABLE contract_templates (
      company_name TEXT PRIMARY KEY,
      template_content TEXT,
      updated_at TEXT,
      seal_url TEXT
    );

-- ── corporate_card_transactions (from: hr_cert_asset_card_calendar.sql)
CREATE TABLE IF NOT EXISTS corporate_card_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  card_holder_id TEXT REFERENCES staff_members(id),
  transaction_date TEXT NOT NULL,
  merchant TEXT,
  category TEXT CHECK (category IN ('식비','교통','경비','복리후생','의료','기타')),
  amount INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  receipt_url TEXT,
  company_name TEXT DEFAULT '전체',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── corporate_cards (from: corporate_cards_company.sql)
CREATE TABLE IF NOT EXISTS corporate_cards (
  id TEXT PRIMARY KEY NOT NULL,
  company_name TEXT NOT NULL,
  card_nickname TEXT,
  last_four TEXT,
  issuer TEXT,
  holder_id TEXT REFERENCES staff_members(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── daily_checks (from: 20260227_daily_closure.sql)
CREATE TABLE IF NOT EXISTS daily_checks (
    id TEXT PRIMARY KEY NOT NULL,
    closure_id TEXT REFERENCES daily_closures(id) ON DELETE CASCADE,
    check_number TEXT NOT NULL,
    amount INTEGER NOT NULL,
    bank_name TEXT,
    issuer_name TEXT,
    issue_date TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── daily_closure_items (from: 20260227_daily_closure.sql)
CREATE TABLE IF NOT EXISTS daily_closure_items (
    id TEXT PRIMARY KEY NOT NULL,
    closure_id TEXT REFERENCES daily_closures(id) ON DELETE CASCADE,
    patient_name TEXT,
    amount INTEGER NOT NULL,
    payment_method TEXT, -- 현금, 카드, 계좌이체 등
    receipt_type TEXT, -- 진료비, 제증명 등
    memo TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── daily_closures (from: 20260227_daily_closure.sql)
CREATE TABLE IF NOT EXISTS daily_closures (
    id TEXT PRIMARY KEY NOT NULL,
    company_id TEXT REFERENCES companies(id),
    date TEXT NOT NULL,
    total_amount INTEGER DEFAULT 0, -- 총 수납 금액
    petty_cash_start INTEGER DEFAULT 0, -- 기초 시재
    petty_cash_end INTEGER DEFAULT 0, -- 기말 시재
    status TEXT DEFAULT 'draft', -- draft, completed
    created_by TEXT REFERENCES staff_members(id),
    memo TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, date)
);

-- ── delivery_confirmations (from: 20260423_inventory_workflow_automation_and_procurement.sql)
create table if not exists delivery_confirmations (
  id uuid primary key DEFAULT (''),
  doc_number text,
  issue_date date,
  supplier_name text,
  supplier_rep text,
  receiver_company text,
  receiver_rep text,
  delivery_date date,
  notes text,
  items TEXT not null default '[]',
  total_amount REAL default 0,
  created_at TEXT not null DEFAULT CURRENT_TIMESTAMP
);

-- ── department_private_inventory_items (from: 20260422_department_private_inventory.sql)
create table if not exists department_private_inventory_items (
  id uuid primary key DEFAULT (''),
  company text not null,
  company_id uuid null references companies(id),
  department text not null,
  item_name text not null,
  category text null,
  unit text not null default 'EA',
  quantity integer not null default 0 check (quantity >= 0),
  min_quantity integer not null default 0 check (min_quantity >= 0),
  total_used integer not null default 0 check (total_used >= 0),
  memo text null,
  created_by uuid null references staff_members(id) on delete set null,
  created_by_name text null,
  updated_by uuid null references staff_members(id) on delete set null,
  updated_by_name text null,
  created_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT not null DEFAULT CURRENT_TIMESTAMP
);

-- ── department_private_inventory_logs (from: 20260422_department_private_inventory.sql)
create table if not exists department_private_inventory_logs (
  id uuid primary key DEFAULT (''),
  item_id uuid not null references department_private_inventory_items(id) on delete cascade,
  company text not null,
  company_id uuid null references companies(id),
  department text not null,
  item_name text not null,
  action text not null default 'consume',
  quantity integer not null default 0 check (quantity >= 0),
  prev_quantity integer null,
  next_quantity integer null,
  actor_id uuid null references staff_members(id) on delete set null,
  actor_name text null,
  notes text null,
  created_at TEXT not null DEFAULT CURRENT_TIMESTAMP
);

-- ── education_records (from: TOTAL_RECOVERY_SCHEMA.sql)
CREATE TABLE education_records (
    id TEXT PRIMARY KEY NOT NULL,
    staff_id TEXT REFERENCES staff_members(id) ON DELETE CASCADE,
    education_name TEXT NOT NULL,
    deadline TEXT,
    completed_at TEXT,
    status TEXT DEFAULT '대기',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── employment_contracts (from: 00_full_schema_and_migrations.sql)
CREATE TABLE IF NOT EXISTS employment_contracts (
  id TEXT PRIMARY KEY NOT NULL,
  staff_id TEXT REFERENCES staff_members(id) ON DELETE CASCADE,
  contract_type TEXT,
  start_date TEXT,
  end_date TEXT,
  content TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── freelancer_payments (from: 20260308_messenger_payroll_persistence.sql)
CREATE TABLE IF NOT EXISTS freelancer_payments (
  id TEXT PRIMARY KEY NOT NULL,
  company_name TEXT NOT NULL,
  year_month TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  work_type TEXT,
  payment_date TEXT NOT NULL,
  supply_amount INTEGER NOT NULL DEFAULT 0 CHECK (supply_amount >= 0),
  tax_rate REAL NOT NULL DEFAULT 3.30,
  withholding_tax INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_by TEXT REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── generated_reports (from: 20260508_required_operational_feature_tables.sql)
create table if not exists generated_reports (
  id uuid primary key DEFAULT (''),
  schedule_id uuid,
  report_type text not null,
  period text not null,
  status text not null default 'completed',
  summary TEXT not null default '{}',
  created_at TEXT not null DEFAULT CURRENT_TIMESTAMP
);

-- ── insurance_records (from: 20260506_insurance_records.sql)
CREATE TABLE IF NOT EXISTS insurance_records (
  id TEXT PRIMARY KEY NOT NULL,
  staff_id TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  staff_name TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  insurance_type TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  effective_date TEXT NOT NULL DEFAULT CURRENT_DATE,
  reported_at TEXT,
  status TEXT NOT NULL DEFAULT '',
  resident_no TEXT,
  memo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── inventory (from: 00_full_schema_and_migrations.sql)
CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY NOT NULL,
  company TEXT NOT NULL,
  category TEXT,
  item_name TEXT,
  name TEXT,
  quantity INT DEFAULT 0,
  stock INT DEFAULT 0,
  min_quantity INT DEFAULT 5,
  min_stock INT DEFAULT 10,
  unit_price INTEGER DEFAULT 0,
  expiry_date TEXT,
  lot_number TEXT,
  is_udi INTEGER DEFAULT false,
  udi_code TEXT,
  location TEXT,
  last_updated TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── inventory_categories (from: 20260508_required_operational_feature_tables.sql)
create table if not exists inventory_categories (
  id uuid primary key DEFAULT (''),
  name text not null,
  parent_id uuid references inventory_categories(id) on delete cascade,
  description text,
  color text,
  created_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT not null DEFAULT CURRENT_TIMESTAMP
);

-- ── inventory_closing_snapshots (from: 20260423_inventory_workflow_automation_and_procurement.sql)
create table if not exists inventory_closing_snapshots (
  id uuid primary key DEFAULT (''),
  closing_month text not null,
  snapshot_date date,
  company text,
  company_id uuid references companies(id) on delete set null,
  status text default 'locked',
  item_count integer default 0,
  total_quantity REAL default 0,
  total_value REAL default 0,
  summary TEXT default '{}',
  items TEXT default '[]',
  created_by_id uuid references staff_members(id) on delete set null,
  created_by_name text,
  closed_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT not null DEFAULT CURRENT_TIMESTAMP
);

-- ── inventory_cost_entries (from: 20260423_inventory_workflow_automation_and_procurement.sql)
create table if not exists inventory_cost_entries (
  id uuid primary key DEFAULT (''),
  purchase_order_id uuid references purchase_orders(id) on delete set null,
  approval_id uuid references approvals(id) on delete set null,
  inventory_item_id uuid references inventory(id) on delete set null,
  order_item_index integer default 0,
  item_name text not null,
  company_id uuid references companies(id) on delete set null,
  company_name text,
  department text,
  supplier_id uuid references suppliers(id) on delete set null,
  supplier_name text,
  qty_ordered REAL default 0,
  qty_received REAL default 0,
  qty_rejected REAL default 0,
  qty_pending REAL default 0,
  unit_price REAL default 0,
  supply_amount REAL default 0,
  vat_amount REAL default 0,
  total_amount REAL default 0,
  cost_center text,
  budget_item text,
  account_code text,
  posted_status text default 'posted',
  occurred_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
  posted_at TEXT,
  posted_by_id uuid references staff_members(id) on delete set null,
  posted_by_name text,
  idempotency_key text unique,
  notes text,
  created_at TEXT not null DEFAULT CURRENT_TIMESTAMP
);

-- ── inventory_count_sessions (from: 20260423_inventory_workflow_automation_and_procurement.sql)
create table if not exists inventory_count_sessions (
  id uuid primary key DEFAULT (''),
  conducted_by uuid references staff_members(id) on delete set null,
  conducted_name text,
  total_items integer not null default 0,
  discrepancy_count integer not null default 0,
  report TEXT not null default '[]',
  created_at TEXT not null DEFAULT CURRENT_TIMESTAMP
);

-- ── inventory_logs (from: 00_full_schema_and_migrations.sql)
CREATE TABLE IF NOT EXISTS inventory_logs (
  id TEXT PRIMARY KEY NOT NULL,
  item_id TEXT REFERENCES inventory(id),
  inventory_id TEXT REFERENCES inventory(id),
  type TEXT,
  change_type TEXT,
  quantity INT,
  prev_quantity INT,
  next_quantity INT,
  actor_name TEXT,
  company TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── inventory_price_history (from: 20260423_inventory_workflow_automation_and_procurement.sql)
create table if not exists inventory_price_history (
  id uuid primary key DEFAULT (''),
  inventory_item_id uuid not null references inventory(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete set null,
  supplier_name text,
  unit_price REAL not null default 0,
  quantity integer default 0,
  total_amount REAL default 0,
  source_type text default 'manual',
  recorded_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
  recorded_by uuid references staff_members(id) on delete set null,
  purchase_order_id uuid references purchase_orders(id) on delete set null,
  notes text
);

-- ── inventory_receipts (from: TOTAL_RECOVERY_SCHEMA.sql)
CREATE TABLE inventory_receipts (
    id TEXT PRIMARY KEY NOT NULL,
    item_id TEXT REFERENCES inventory(id) ON DELETE RESTRICT,
    qty INTEGER NOT NULL,
    unit_price REAL,
    supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
    receipt_date TEXT DEFAULT CURRENT_TIMESTAMP,
    receipt_type TEXT DEFAULT '수동',
    lot_number TEXT,
    expiry_date TEXT,
    invoice_number TEXT,
    notes TEXT,
    created_by TEXT REFERENCES staff_members(id) ON DELETE SET NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── inventory_transfers (from: 20260423_inventory_workflow_automation_and_procurement.sql)
create table if not exists inventory_transfers (
  id uuid primary key DEFAULT (''),
  item_id uuid references inventory(id) on delete set null,
  item_name text not null,
  quantity integer not null default 0,
  from_company text,
  from_department text,
  to_company text,
  to_department text,
  reason text,
  transferred_by text,
  transferred_by_id uuid references staff_members(id) on delete set null,
  status text default 'completed',
  approval_id uuid references approvals(id) on delete set null,
  purchase_order_id uuid references purchase_orders(id) on delete set null,
  serial_number text,
  created_at TEXT not null DEFAULT CURRENT_TIMESTAMP
);

-- ── job_categories (from: 2026-05-11_002_job_categories.sql)
CREATE TABLE IF NOT EXISTS job_categories (
  id              TEXT PRIMARY KEY NOT NULL,
  code            TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  is_medical_staff INTEGER DEFAULT TRUE,
  display_order   INT DEFAULT 0,
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── job_category_required_trainings (from: 2026-05-11_003_job_category_required_trainings.sql)
CREATE TABLE IF NOT EXISTS job_category_required_trainings (
  id              TEXT PRIMARY KEY NOT NULL,
  job_category_id TEXT REFERENCES job_categories(id),
  applies_to_all  INTEGER DEFAULT FALSE,
  training_code   TEXT NOT NULL,
  training_name   TEXT NOT NULL,
  cycle_months    INT,
  mandatory       INTEGER DEFAULT TRUE,
  obligation_type TEXT NOT NULL DEFAULT 'legal',
  legal_basis     TEXT,
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP,

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

-- ── leave_balances (from: 2026-05-11_004_leave_balances.sql)
CREATE TABLE IF NOT EXISTS leave_balances (
  id              TEXT PRIMARY KEY NOT NULL,
  staff_id        TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  year            INT NOT NULL,
  total_days      REAL DEFAULT 0,
  used_days       REAL DEFAULT 0,
  remaining_days  REAL DEFAULT 0,
  expiry_date     TEXT,
  expired_days    REAL DEFAULT 0,
  expired_at      TEXT,
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (staff_id, year)
);

-- ── leave_requests (from: hr_phase1_attendance_leave_shifts.sql)
CREATE TABLE IF NOT EXISTS leave_requests (
  id TEXT PRIMARY KEY NOT NULL,
  staff_id TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  company_id TEXT,
  company_name TEXT,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('연차','반차','병가','경조','특별휴가','기타')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT '대기' CHECK (status IN ('대기','승인','반려')),
  approved_by TEXT REFERENCES staff_members(id),
  approved_at TEXT,
  rejection_reason TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── license_continuing_education (from: 2026-05-12_001_license_continuing_education.sql)
CREATE TABLE IF NOT EXISTS license_continuing_education (
  id                    TEXT PRIMARY KEY NOT NULL,
  staff_id              TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  license_id            TEXT REFERENCES staff_licenses(id) ON DELETE SET NULL,
  -- 직원이 제출 시 어떤 면허를 위한 것인지 표기 (license_id가 NULL이어도 백업 식별용)
  license_type_hint     TEXT,
  license_name_hint     TEXT,

  -- 첨부 파일
  file_url              TEXT NOT NULL,
  file_name             TEXT,

  -- 제출/검토 상태
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at          TEXT DEFAULT CURRENT_TIMESTAMP,
  submitted_by          TEXT REFERENCES staff_members(id) ON DELETE SET NULL,

  -- OCR 추출 결과
  ocr_text              TEXT,
  ocr_education_date    TEXT,
  ocr_extracted_meta    TEXT,

  -- 인사 검토
  education_date        TEXT,                  -- 최종 확정 교육일 (OCR 결과 또는 수기 입력)
  applied_expiry_date   TEXT,                  -- 적용된 새 만료일
  applied_renewed_date  TEXT,                  -- 적용된 새 갱신일 (= education_date)
  reject_reason         TEXT,
  reviewed_by           TEXT REFERENCES staff_members(id) ON DELETE SET NULL,
  reviewed_at           TEXT,

  memo                  TEXT,
  created_at            TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at            TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── login_logs (from: 01_additional_features.sql)
CREATE TABLE IF NOT EXISTS login_logs (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT,
  user_name TEXT,
  action TEXT,
  ip_address TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── meeting_bookings (from: 01_additional_features.sql)
CREATE TABLE IF NOT EXISTS meeting_bookings (
  id TEXT PRIMARY KEY NOT NULL,
  room TEXT NOT NULL,
  date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  booker_id TEXT REFERENCES staff_members(id),
  booker_name TEXT,
  status TEXT DEFAULT '예약',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── message_reactions (from: advanced_features.sql)
CREATE TABLE IF NOT EXISTS message_reactions (
  id TEXT PRIMARY KEY NOT NULL,
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL DEFAULT '👍',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(message_id, user_id, emoji)
);

-- ── message_reads (from: advanced_features.sql)
CREATE TABLE IF NOT EXISTS message_reads (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  read_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, message_id)
);

-- ── messages (from: 00_full_schema_and_migrations.sql)
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY NOT NULL,
  room_id TEXT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id TEXT REFERENCES staff_members(id),
  content TEXT,
  file_url TEXT,
  file_size_bytes INTEGER,
  file_kind TEXT,
  reply_to_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  is_deleted INTEGER DEFAULT false,
  edited_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── messenger_drive_links (from: 20260308_messenger_payroll_persistence.sql)
CREATE TABLE IF NOT EXISTS messenger_drive_links (
  id TEXT PRIMARY KEY NOT NULL,
  company_name TEXT NOT NULL DEFAULT '전체',
  room_id TEXT REFERENCES chat_rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES staff_members(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── monthly_off_quota (from: 20260408_preferred_off_monthly_quota.sql)
CREATE TABLE IF NOT EXISTS monthly_off_quota (
  id TEXT PRIMARY KEY NOT NULL,
  company TEXT NOT NULL,
  year_month TEXT NOT NULL, -- '2026-04'
  default_off_days INTEGER NOT NULL DEFAULT 8, -- 기본 휴무일 수
  staff_overrides TEXT DEFAULT '{}',          -- {staff_id: days}
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company, year_month)
);

-- ── notification_templates (from: hr_full_features.sql)
CREATE TABLE IF NOT EXISTS notification_templates (
  id TEXT PRIMARY KEY NOT NULL,
  template_type TEXT NOT NULL CHECK (template_type IN ('급여명세','휴가승인','휴가반려','입사안내','퇴사안내','기타')),
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  variables TEXT DEFAULT '[]',  -- [{name: "name", desc: "직원명"}]
  is_active INTEGER DEFAULT true,
  company_name TEXT DEFAULT '전체',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── notifications (from: 00_full_schema_and_migrations.sql)
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT REFERENCES staff_members(id) ON DELETE CASCADE,
  type TEXT,
  title TEXT,
  body TEXT,
  is_read INTEGER DEFAULT false,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── onboarding_checklists (from: hr_full_features.sql)
CREATE TABLE IF NOT EXISTS onboarding_checklists (
  id TEXT PRIMARY KEY NOT NULL,
  staff_id TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  checklist_type TEXT NOT NULL CHECK (checklist_type IN ('입사','퇴사')),
  items TEXT NOT NULL DEFAULT '[]',  -- [{label, done, done_at}]
  target_date TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(staff_id, checklist_type)
);

-- ── op_check_templates (from: 20260331_op_check_foundation.sql)
create table if not exists op_check_templates (
  id uuid primary key DEFAULT (''),
  company_id uuid null,
  company_name text not null default '전체',
  template_scope text not null default 'surgery',
  template_name text not null,
  surgery_template_id uuid null,
  surgery_name text null,
  anesthesia_type text null,
  prep_items TEXT not null default '[]',
  consumable_items TEXT not null default '[]',
  notes text null,
  is_active INTEGER not null default true,
  created_by uuid null references staff_members(id) on delete set null,
  created_by_name text null,
  created_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT not null DEFAULT CURRENT_TIMESTAMP
);

-- ── op_patient_checks (from: 20260331_op_check_foundation.sql)
create table if not exists op_patient_checks (
  id uuid primary key DEFAULT (''),
  schedule_post_id text not null,
  company_id uuid null,
  company_name text not null default '전체',
  patient_name text not null default '',
  chart_no text null,
  surgery_name text not null default '',
  surgery_template_id uuid null,
  anesthesia_type text null,
  schedule_date date null,
  schedule_time text null,
  schedule_room text null,
  prep_items TEXT not null default '[]',
  consumable_items TEXT not null default '[]',
  notes text null,
  status text not null default '준비중',
  applied_template_ids uuid[] not null default '{}',
  created_by uuid null references staff_members(id) on delete set null,
  created_by_name text null,
  updated_by uuid null references staff_members(id) on delete set null,
  updated_by_name text null,
  created_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
  unique(schedule_post_id)
);

-- ── org_teams (from: org_structure.sql)
CREATE TABLE IF NOT EXISTS org_teams (
  id TEXT PRIMARY KEY NOT NULL,
  company_name TEXT NOT NULL DEFAULT '전체',
  division TEXT NOT NULL CHECK (division IN ('진료부','간호부','총무부')),
  team_name TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_name, division, team_name)
);

-- ── payroll (from: TOTAL_RECOVERY_SCHEMA.sql)
CREATE TABLE payroll (
    id TEXT PRIMARY KEY NOT NULL,
    company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
    staff_id TEXT REFERENCES staff_members(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    base_salary REAL NOT NULL,
    total_salary REAL NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('DRAFT','CONFIRMED','PAID')),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (company_id, staff_id, month)
);

-- ── payroll_approval_logs (from: 20260308_messenger_payroll_persistence.sql)
CREATE TABLE IF NOT EXISTS payroll_approval_logs (
  id TEXT PRIMARY KEY NOT NULL,
  company_name TEXT NOT NULL DEFAULT '전체',
  year_month TEXT NOT NULL,
  actor_id TEXT REFERENCES staff_members(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  comment TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── payroll_approval_workflows (from: 20260308_messenger_payroll_persistence.sql)
CREATE TABLE IF NOT EXISTS payroll_approval_workflows (
  id TEXT PRIMARY KEY NOT NULL,
  company_name TEXT NOT NULL DEFAULT '전체',
  year_month TEXT NOT NULL,
  step1_status TEXT NOT NULL DEFAULT '대기'
    CHECK (step1_status IN ('대기', '승인', '보류')),
  step2_status TEXT NOT NULL DEFAULT '대기'
    CHECK (step2_status IN ('대기', '승인', '보류')),
  step1_comment TEXT,
  step2_comment TEXT,
  step1_actor_id TEXT REFERENCES staff_members(id) ON DELETE SET NULL,
  step2_actor_id TEXT REFERENCES staff_members(id) ON DELETE SET NULL,
  step1_updated_at TEXT,
  step2_updated_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_name, year_month)
);

-- ── payroll_bonus_items (from: 20260308_messenger_payroll_persistence.sql)
CREATE TABLE IF NOT EXISTS payroll_bonus_items (
  id TEXT PRIMARY KEY NOT NULL,
  staff_id TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  year_month TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '상여',
  amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
  note TEXT,
  created_by TEXT REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── payroll_calendar_items (from: 20260308_messenger_payroll_persistence.sql)
CREATE TABLE IF NOT EXISTS payroll_calendar_items (
  id TEXT PRIMARY KEY NOT NULL,
  company_name TEXT NOT NULL DEFAULT '전체',
  year_month TEXT NOT NULL,
  title TEXT NOT NULL,
  due_date TEXT NOT NULL,
  owner_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '대기'
    CHECK (status IN ('대기', '진행', '완료')),
  sort_order INT NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES staff_members(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_name, year_month, title)
);

-- ── payroll_deduction_controls (from: 20260308_messenger_payroll_persistence.sql)
CREATE TABLE IF NOT EXISTS payroll_deduction_controls (
  id TEXT PRIMARY KEY NOT NULL,
  staff_id TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  deduction_type TEXT NOT NULL,
  monthly_amount INTEGER NOT NULL DEFAULT 0 CHECK (monthly_amount >= 0),
  balance INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  is_active INTEGER NOT NULL DEFAULT true,
  created_by TEXT REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── payroll_locks (from: hr_full_features.sql)
CREATE TABLE IF NOT EXISTS payroll_locks (
  id TEXT PRIMARY KEY NOT NULL,
  year_month TEXT NOT NULL,
  company_name TEXT DEFAULT '전체',
  locked_at TEXT DEFAULT CURRENT_TIMESTAMP,
  locked_by TEXT REFERENCES staff_members(id),
  memo TEXT,
  UNIQUE(year_month, company_name)
);

-- ── payroll_policy_versions (from: 20260329_payroll_governance.sql)
create table if not exists payroll_policy_versions (
  id uuid primary key DEFAULT (''),
  company_name text not null default '전체',
  effective_year integer not null,
  version_label text not null,
  snapshot TEXT not null default '{}',
  note text,
  created_by uuid references staff_members(id) on delete set null,
  created_at TEXT not null DEFAULT CURRENT_TIMESTAMP
);

-- ── payroll_records (from: 00_full_schema_and_migrations.sql)
CREATE TABLE IF NOT EXISTS payroll_records (
  id TEXT PRIMARY KEY NOT NULL,
  staff_id TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,
  base_salary INTEGER DEFAULT 0,
  meal_allowance INTEGER DEFAULT 0,
  night_duty_allowance INTEGER DEFAULT 0,
  vehicle_allowance INTEGER DEFAULT 0,
  childcare_allowance INTEGER DEFAULT 0,
  research_allowance INTEGER DEFAULT 0,
  other_taxfree INTEGER DEFAULT 0,
  extra_allowance INTEGER DEFAULT 0,
  overtime_pay INTEGER DEFAULT 0,
  bonus INTEGER DEFAULT 0,
  total_taxable INTEGER DEFAULT 0,
  total_taxfree INTEGER DEFAULT 0,
  total_deduction INTEGER DEFAULT 0,
  net_pay INTEGER DEFAULT 0,
  attendance_deduction INTEGER DEFAULT 0,
  attendance_deduction_detail TEXT,
  status TEXT DEFAULT '임시',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(staff_id, year_month)
);

-- ── payroll_retro_adjustments (from: 20260308_messenger_payroll_persistence.sql)
CREATE TABLE IF NOT EXISTS payroll_retro_adjustments (
  id TEXT PRIMARY KEY NOT NULL,
  staff_id TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  start_month TEXT NOT NULL,
  end_month TEXT NOT NULL,
  before_base INTEGER NOT NULL DEFAULT 0,
  after_base INTEGER NOT NULL DEFAULT 0,
  retro_total INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  created_by TEXT REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── pinned_messages (from: advanced_features.sql)
CREATE TABLE IF NOT EXISTS pinned_messages (
  id TEXT PRIMARY KEY NOT NULL,
  room_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  pinned_by TEXT REFERENCES staff_members(id),
  pinned_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(room_id, message_id)
);

-- ── poll_votes (from: advanced_features.sql)
CREATE TABLE IF NOT EXISTS poll_votes (
  id TEXT PRIMARY KEY NOT NULL,
  poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  option_index INT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(poll_id, user_id)
);

-- ── polls (from: advanced_features.sql)
CREATE TABLE IF NOT EXISTS polls (
  id TEXT PRIMARY KEY NOT NULL,
  room_id TEXT NOT NULL,
  message_id TEXT,
  creator_id TEXT REFERENCES staff_members(id),
  question TEXT NOT NULL,
  options TEXT NOT NULL, -- ["찬성", "반대"]
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── popups (from: popups_setup.sql)
CREATE TABLE IF NOT EXISTS popups (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  media_url TEXT,
  media_type TEXT DEFAULT 'image', -- 'image' | 'video'
  width INT DEFAULT 400,
  height INT DEFAULT 500,
  is_active INTEGER DEFAULT TRUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── posts (from: 00_full_schema_and_migrations.sql)
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY NOT NULL,
  board_type TEXT DEFAULT '공지사항',
  title TEXT NOT NULL,
  content TEXT,
  author_id TEXT REFERENCES staff_members(id),
  author_name TEXT,
  company TEXT,
  views INT DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── purchase_orders (from: 00_full_schema_and_migrations.sql)
CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY NOT NULL,
  supplier_id TEXT REFERENCES suppliers(id),
  items TEXT NOT NULL,
  status TEXT DEFAULT '대기',
  total_amount REAL,
  notes TEXT,
  created_by TEXT REFERENCES staff_members(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── push_subscriptions (from: 00_full_schema_and_migrations.sql)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY NOT NULL,
  staff_id TEXT REFERENCES staff_members(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── report_schedules (from: 20260508_required_operational_feature_tables.sql)
create table if not exists report_schedules (
  id uuid primary key DEFAULT (''),
  company_id text,
  report_type text not null,
  schedule_cron text,
  recipients TEXT not null default '[]',
  enabled INTEGER not null default true,
  last_generated_at TEXT,
  created_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT not null DEFAULT CURRENT_TIMESTAMP
);

-- ── retirement_pensions (from: 20260508_required_operational_feature_tables.sql)
create table if not exists retirement_pensions (
  id uuid primary key DEFAULT (''),
  staff_id text not null,
  staff_name text,
  pension_type text not null default 'unregistered',
  joined_date text,
  account_number text,
  fund_name text,
  monthly_contribution REAL not null default 0,
  total_accumulated REAL not null default 0,
  memo text,
  created_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT not null DEFAULT CURRENT_TIMESTAMP
);

-- ── room_notification_settings (from: additional_features.sql)
CREATE TABLE IF NOT EXISTS room_notification_settings (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  notifications_enabled INTEGER DEFAULT true,
  UNIQUE(user_id, room_id)
);

-- ── room_read_cursors (from: advanced_features.sql)
CREATE TABLE IF NOT EXISTS room_read_cursors (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL,
  last_read_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, room_id)
);

-- ── roster_approval_requests (from: 20260403_roster_workflow_requests.sql)
create table if not exists roster_approval_requests (
  id uuid primary key DEFAULT (''),
  company_name text null,
  team_name text null,
  year_month TEXT not null,
  assignments TEXT not null default '[]',
  requested_by uuid null references staff_members(id) on delete set null,
  requested_by_name text null,
  status TEXT not null default 'pending',
  approved_by uuid null references staff_members(id) on delete set null,
  approved_at TEXT null,
  rejected_by uuid null references staff_members(id) on delete set null,
  rejected_at TEXT null,
  reject_reason text null,
  created_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
  constraint roster_approval_requests_status_check
    check (status in ('pending', 'approved', 'rejected'))
);

-- ── roster_policy_settings (from: 20260403_roster_policy_settings.sql)
create table if not exists roster_policy_settings (
  id uuid primary key DEFAULT (''),
  policy_type text not null,
  policy_id text not null,
  company_id uuid null references companies(id) on delete cascade,
  company_name text not null default '전체',
  name text not null,
  payload TEXT not null default '{}',
  created_by uuid null references staff_members(id) on delete set null,
  updated_by uuid null references staff_members(id) on delete set null,
  created_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT not null DEFAULT CURRENT_TIMESTAMP
);

-- ── roster_swap_requests (from: 20260403_roster_workflow_requests.sql)
create table if not exists roster_swap_requests (
  id uuid primary key DEFAULT (''),
  company_name text null,
  team_name text null,
  requested_by uuid null references staff_members(id) on delete set null,
  requested_by_name text null,
  staff_id uuid null references staff_members(id) on delete cascade,
  work_date date not null,
  target_date date not null,
  current_shift_id uuid null references work_shifts(id) on delete set null,
  reason text null,
  status TEXT not null default 'pending',
  approved_by uuid null references staff_members(id) on delete set null,
  approved_at TEXT null,
  rejected_by uuid null references staff_members(id) on delete set null,
  rejected_at TEXT null,
  reject_reason text null,
  created_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
  constraint roster_swap_requests_status_check
    check (status in ('pending', 'approved', 'rejected'))
);

-- ── salary_change_history (from: hr_full_features.sql)
CREATE TABLE IF NOT EXISTS salary_change_history (
  id TEXT PRIMARY KEY NOT NULL,
  staff_id TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL CHECK (change_type IN ('base_salary','meal','vehicle','childcare','research','position_allowance','other')),
  before_value INTEGER,
  after_value INTEGER,
  effective_date TEXT NOT NULL,
  reason TEXT,
  created_by TEXT REFERENCES staff_members(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── shift_assignments (from: shift_assignments_daily.sql)
CREATE TABLE IF NOT EXISTS shift_assignments (
  id TEXT PRIMARY KEY NOT NULL,
  staff_id TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  work_date TEXT NOT NULL,
  shift_id TEXT REFERENCES work_shifts(id) ON DELETE SET NULL,
  company_name TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(staff_id, work_date)
);

-- ── staff_certifications (from: hr_full_features.sql)
CREATE TABLE IF NOT EXISTS staff_certifications (
  id TEXT PRIMARY KEY NOT NULL,
  staff_id TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  issuer TEXT,
  issue_date TEXT,
  expiry_date TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── staff_evaluations (from: TOTAL_RECOVERY_SCHEMA.sql)
CREATE TABLE IF NOT EXISTS staff_evaluations (
    id TEXT PRIMARY KEY NOT NULL,
    staff_id TEXT REFERENCES staff_members(id) ON DELETE CASCADE,
    evaluator_id TEXT REFERENCES staff_members(id) ON DELETE SET NULL,
    category TEXT NOT NULL, -- '성과', '문제사항', '칭찬', '주의', '기타'
    content TEXT NOT NULL,
    score INTEGER CHECK (score >= 1 AND score <= 5),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── staff_job_categories (from: 2026-05-11_002_job_categories.sql)
CREATE TABLE IF NOT EXISTS staff_job_categories (
  id              TEXT PRIMARY KEY NOT NULL,
  staff_id        TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  job_category_id TEXT NOT NULL REFERENCES job_categories(id),
  is_primary      INTEGER DEFAULT FALSE,
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (staff_id, job_category_id)
);

-- ── staff_licenses (from: 2026-05-11_001_staff_licenses_enhance.sql)
CREATE TABLE IF NOT EXISTS staff_licenses (
  id              TEXT PRIMARY KEY NOT NULL,
  staff_id        TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  license_type    TEXT,
  license_name    TEXT,
  license_number  TEXT,
  issued_date     TEXT,
  expiry_date     TEXT,
  issuing_body    TEXT,
  memo            TEXT,
  is_primary      INTEGER DEFAULT FALSE,
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at      TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── staff_members (from: 00_full_schema_and_migrations.sql)
CREATE TABLE IF NOT EXISTS staff_members (
  id TEXT PRIMARY KEY NOT NULL,
  employee_no TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  department TEXT,
  position TEXT,
  email TEXT,
  phone TEXT,
  extension TEXT,
  join_date TEXT,
  status TEXT DEFAULT '재직',
  role TEXT DEFAULT 'user',
  annual_leave_total REAL DEFAULT 0.0,
  annual_leave_used REAL DEFAULT 0.0,
  base_salary INTEGER DEFAULT 0,
  shift_id TEXT,
  meal_allowance INTEGER DEFAULT 0,
  night_duty_allowance INTEGER DEFAULT 0,
  vehicle_allowance INTEGER DEFAULT 0,
  childcare_allowance INTEGER DEFAULT 0,
  research_allowance INTEGER DEFAULT 0,
  other_taxfree INTEGER DEFAULT 0,
  position_allowance INTEGER DEFAULT 0,
  photo_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── staff_preferred_off (from: 20260408_preferred_off_monthly_quota.sql)
CREATE TABLE IF NOT EXISTS staff_preferred_off (
  id TEXT PRIMARY KEY NOT NULL,
  staff_id TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL, -- '2026-04'
  preferred_weekdays TEXT DEFAULT '{}', -- 0=일,1=월,...,6=토
  preferred_dates TEXT DEFAULT '{}',       -- ['2026-04-05','2026-04-12']
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(staff_id, year_month)
);

-- ── staff_shift_assignments (from: 2026-05-11_005_staff_shift_assignments.sql)
CREATE TABLE IF NOT EXISTS staff_shift_assignments (
  id            TEXT PRIMARY KEY NOT NULL,
  staff_id      TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  shift_id      TEXT NOT NULL REFERENCES work_shifts(id),
  is_primary    INTEGER DEFAULT FALSE,
  priority      INT DEFAULT 0,
  effective_from TEXT,
  effective_to   TEXT,
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (staff_id, shift_id)
);

-- ── staff_trainings (from: 2026-05-11_020_staff_trainings.sql)
CREATE TABLE IF NOT EXISTS staff_trainings (
  id              TEXT PRIMARY KEY NOT NULL,
  staff_id        TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,

  -- 교육 식별
  training_code   TEXT NOT NULL,
  training_name   TEXT NOT NULL,

  -- 부여 정보
  assigned_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  mandatory       INTEGER DEFAULT TRUE,
  obligation_type TEXT NOT NULL DEFAULT 'legal',
  cycle_months    INT,

  -- 이수 정보
  status          TEXT NOT NULL DEFAULT '미이수',
  completed_at    TEXT,
  certificate_url TEXT,
  memo            TEXT,

  created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at      TEXT DEFAULT CURRENT_TIMESTAMP,

  -- 직원 × 교육코드 중복 방지
  UNIQUE (staff_id, training_code),

  CONSTRAINT chk_st_obligation_type
    CHECK (obligation_type IN ('legal', 'recommended')),

  CONSTRAINT chk_st_status
    CHECK (status IN ('미이수', '이수완료', '면제', '진행중'))
);

-- ── staff_transfer_history (from: hr_full_features.sql)
CREATE TABLE IF NOT EXISTS staff_transfer_history (
  id TEXT PRIMARY KEY NOT NULL,
  staff_id TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  transfer_type TEXT NOT NULL CHECK (transfer_type IN ('부서이동','직급변경','직책변경','발령')),
  before_value TEXT,
  after_value TEXT,
  effective_date TEXT NOT NULL,
  reason TEXT,
  created_by TEXT REFERENCES staff_members(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── suppliers (from: 00_full_schema_and_migrations.sql)
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  contact TEXT,
  phone TEXT,
  address TEXT,
  email TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── system_configs (from: TOTAL_RECOVERY_SCHEMA.sql)
CREATE TABLE system_configs (
    "key" TEXT PRIMARY KEY,
    value TEXT,
    description TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── tasks (from: 00_full_schema_and_migrations.sql)
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  status TEXT DEFAULT 'todo',
  priority TEXT DEFAULT 'medium',
  assignee_id TEXT REFERENCES staff_members(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── tax_free_settings (from: hr_interim_taxfree_upgrade.sql)
CREATE TABLE IF NOT EXISTS tax_free_settings (
  id TEXT PRIMARY KEY NOT NULL,
  company_name TEXT NOT NULL DEFAULT '전체',
  meal_limit INTEGER DEFAULT 200000,
  vehicle_limit INTEGER DEFAULT 200000,
  childcare_limit INTEGER DEFAULT 100000,
  research_limit INTEGER DEFAULT 200000,
  uniform_limit INTEGER DEFAULT 300000,
  congratulations_limit INTEGER DEFAULT 500000,
  housing_limit INTEGER DEFAULT 700000,
  other_taxfree_limit INTEGER DEFAULT 0,
  effective_year INT DEFAULT 2025,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_name, effective_year)
);

-- ── tax_insurance_rates (from: hr_full_features.sql)
CREATE TABLE IF NOT EXISTS tax_insurance_rates (
  id TEXT PRIMARY KEY NOT NULL,
  effective_year INT NOT NULL,
  company_name TEXT DEFAULT '전체',
  national_pension_rate REAL DEFAULT 0.0475,
  health_insurance_rate REAL DEFAULT 0.03595,
  long_term_care_rate REAL DEFAULT 0.004724,
  employment_insurance_rate REAL DEFAULT 0.009,
  income_tax_bracket TEXT DEFAULT '[]',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(effective_year, company_name)
);

-- ── tax_reports (from: 20260508_required_operational_feature_tables.sql)
create table if not exists tax_reports (
  id uuid primary key DEFAULT (''),
  year text not null,
  company_name text,
  report_type text not null,
  report_date TEXT,
  data TEXT not null default '[]',
  status text not null default 'draft',
  created_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT not null DEFAULT CURRENT_TIMESTAMP
);

-- ── todo_reminder_logs (from: 20260330_advanced_ops_foundation.sql)
create table if not exists todo_reminder_logs (
  id uuid primary key DEFAULT (''),
  todo_id text not null,
  user_id uuid not null references staff_members(id) on delete cascade,
  reminder_at TEXT not null,
  notification_id uuid null references notifications(id) on delete set null,
  status text not null default 'sent',
  title text null,
  body text null,
  created_at TEXT not null DEFAULT CURRENT_TIMESTAMP
);

-- ── virtual_account_deposits (from: 20260508_required_operational_feature_tables.sql)
create table if not exists virtual_account_deposits (
  id uuid primary key DEFAULT (''),
  company_id text,
  provider text not null default 'generic',
  dedupe_key text not null,
  provider_event_type text,
  provider_event_id text,
  order_id text,
  order_name text,
  payment_key text,
  transaction_key text,
  method text,
  deposit_status text not null default 'issued',
  match_status text not null default 'unmatched',
  amount REAL not null default 0,
  currency text not null default 'KRW',
  depositor_name text,
  customer_name text,
  patient_name text,
  patient_id text,
  transaction_label text,
  bank_code text,
  bank_name text,
  account_number text,
  due_date TEXT,
  deposited_at TEXT,
  matched_target_type text,
  matched_target_id text,
  matched_note text,
  raw_payload TEXT not null default '{}',
  created_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT not null DEFAULT CURRENT_TIMESTAMP
);

-- ── wiki_document_versions (from: 20260330_advanced_ops_foundation.sql)
create table if not exists wiki_document_versions (
      id uuid primary key DEFAULT (''),
      document_id uuid not null references wiki_documents(id) on delete cascade,
      version_no integer not null,
      title text not null,
      summary text null,
      content text not null default '',
      tags text[] not null default '{}',
      editor_ids uuid[] not null default '{}',
      company_id uuid null,
      company_name text not null default '전체',
      change_summary text null,
      restore_of_version_id uuid null,
      created_by uuid null references staff_members(id) on delete set null,
      created_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
      unique(document_id, version_no)
    );

-- ── wiki_documents (from: 20260330_wiki_todo_foundation.sql)
create table if not exists wiki_documents (
  id uuid primary key DEFAULT (''),
  folder_id uuid not null references wiki_folders(id) on delete cascade,
  company_id uuid null,
  company_name text not null default '전체',
  title text not null,
  summary text null,
  content text not null default '',
  tags text[] not null default '{}',
  editor_ids uuid[] not null default '{}',
  is_published INTEGER not null default true,
  is_archived INTEGER not null default false,
  created_by uuid null references staff_members(id) on delete set null,
  updated_by uuid null references staff_members(id) on delete set null,
  created_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT not null DEFAULT CURRENT_TIMESTAMP
);

-- ── wiki_folders (from: 20260330_wiki_todo_foundation.sql)
create table if not exists wiki_folders (
  id uuid primary key DEFAULT (''),
  company_id uuid null,
  company_name text not null default '전체',
  name text not null,
  description text null,
  color text null,
  sort_order integer not null default 0,
  is_archived INTEGER not null default false,
  created_by uuid null references staff_members(id) on delete set null,
  updated_by uuid null references staff_members(id) on delete set null,
  created_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT not null DEFAULT CURRENT_TIMESTAMP
);

-- ── work_shifts (from: hr_phase1_attendance_leave_shifts.sql)
CREATE TABLE IF NOT EXISTS work_shifts (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT,
  company_name TEXT, -- 박철홍정형외과, SY INC., 수연의원 등
  name TEXT NOT NULL,
  start_time TEXT NOT NULL DEFAULT '09:00',
  end_time TEXT NOT NULL DEFAULT '18:00',
  description TEXT,
  is_active INTEGER DEFAULT true,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── ALTER TABLE 컬럼 보강 ──
-- 주의: SQLite는 IF NOT EXISTS for ADD COLUMN 미지원. 통합본에서는 위 CREATE에 이미 포함되어 있을 가능성이 큼.
-- 실제 적용 전 중복 여부 확인 필요.
-- ALTER TABLE staff_licenses ADD COLUMN IF NOT EXISTS license_type    TEXT;
-- ALTER TABLE staff_licenses ADD COLUMN IF NOT EXISTS license_name    TEXT;
-- ALTER TABLE staff_licenses ADD COLUMN IF NOT EXISTS license_number  TEXT;
-- ALTER TABLE staff_licenses ADD COLUMN IF NOT EXISTS issued_date     TEXT;
-- ALTER TABLE staff_licenses ADD COLUMN IF NOT EXISTS expiry_date     TEXT;
-- ALTER TABLE staff_licenses ADD COLUMN IF NOT EXISTS issuing_body    TEXT;
-- ALTER TABLE staff_licenses ADD COLUMN IF NOT EXISTS memo            TEXT;
-- ALTER TABLE staff_licenses ADD COLUMN IF NOT EXISTS is_primary      INTEGER DEFAULT FALSE;
-- ALTER TABLE staff_licenses ADD COLUMN IF NOT EXISTS created_at      TEXT DEFAULT CURRENT_TIMESTAMP;
-- ALTER TABLE staff_licenses ADD COLUMN IF NOT EXISTS updated_at      TEXT DEFAULT CURRENT_TIMESTAMP;
-- ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS expiry_date     TEXT;
-- ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS expired_days    REAL DEFAULT 0;
-- ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS expired_at      TEXT;
-- ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS updated_at      TEXT DEFAULT CURRENT_TIMESTAMP;
-- ALTER TABLE companies ADD COLUMN leave_policy TEXT DEFAULT '입사일';
-- ALTER TABLE companies ADD COLUMN unused_leave_compensation INTEGER DEFAULT FALSE;
-- ALTER TABLE companies ADD COLUMN fiscal_year_start_month INT DEFAULT 1;
-- ALTER TABLE "사업체" ADD COLUMN leave_policy TEXT DEFAULT ''입사일'';
-- ALTER TABLE "사업체" ADD COLUMN unused_leave_compensation INTEGER DEFAULT FALSE;
-- ALTER TABLE "사업체" ADD COLUMN fiscal_year_start_month INT DEFAULT 1;
-- ALTER TABLE annual_leave_promotion_logs
--   ADD COLUMN IF NOT EXISTS stage                     INT;
-- ALTER TABLE annual_leave_promotion_logs
--   ADD COLUMN IF NOT EXISTS expiry_date               TEXT;
-- ALTER TABLE annual_leave_promotion_logs
--   ADD COLUMN IF NOT EXISTS notified_at               TEXT DEFAULT CURRENT_TIMESTAMP;
-- ALTER TABLE annual_leave_promotion_logs
--   ADD COLUMN IF NOT EXISTS plan_submitted_at         TEXT;
-- ALTER TABLE annual_leave_promotion_logs
--   ADD COLUMN IF NOT EXISTS remaining_days_at_notice  REAL;
-- ALTER TABLE annual_leave_promotion_logs
--   ADD COLUMN IF NOT EXISTS notification_id           TEXT;
-- ALTER TABLE annual_leave_promotion_logs
--   ADD COLUMN IF NOT EXISTS created_at                TEXT DEFAULT CURRENT_TIMESTAMP;
-- ALTER TABLE leave_balances
--   ADD COLUMN IF NOT EXISTS compensated_days REAL DEFAULT 0;
-- ALTER TABLE leave_balances
--   ADD COLUMN IF NOT EXISTS compensated_at TEXT;
-- ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS license_id TEXT REFERENCES staff_licenses(id) ON DELETE SET NULL;
-- ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS license_type_hint TEXT;
-- ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS license_name_hint TEXT;
-- ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS file_name TEXT;
-- ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS ocr_text TEXT;
-- ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS ocr_education_date TEXT;
-- ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS ocr_extracted_meta TEXT;
-- ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS education_date TEXT;
-- ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS applied_expiry_date TEXT;
-- ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS applied_renewed_date TEXT;
-- ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS reject_reason TEXT;
-- ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS reviewed_by TEXT REFERENCES staff_members(id) ON DELETE SET NULL;
-- ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS reviewed_at TEXT;
-- ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS memo TEXT;
-- ALTER TABLE license_continuing_education ADD COLUMN IF NOT EXISTS submitted_by TEXT REFERENCES staff_members(id) ON DELETE SET NULL;
-- ALTER TABLE inventory ADD COLUMN IF NOT EXISTS name TEXT;
-- ALTER TABLE inventory ADD COLUMN IF NOT EXISTS stock INT DEFAULT 0;
-- ALTER TABLE inventory ADD COLUMN IF NOT EXISTS min_stock INT DEFAULT 10;
-- ALTER TABLE inventory ADD COLUMN IF NOT EXISTS department TEXT;
-- ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS likes_count INT DEFAULT 0;
-- ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS tags TEXT DEFAULT '[]';
-- ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS is_pinned INTEGER DEFAULT false;
-- ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS inventory_id TEXT REFERENCES inventory(id);
-- ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS change_type TEXT;
-- ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS prev_quantity INT;
-- ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS next_quantity INT;
-- ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS actor_name TEXT;
-- ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS company TEXT;
-- ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS is_anonymous INTEGER DEFAULT FALSE;
-- ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS poll TEXT DEFAULT NULL;
-- ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS poll_votes TEXT DEFAULT '{}';
-- ALTER TABLE inventory
--   ADD COLUMN IF NOT EXISTS insurance_code TEXT,
--   ADD COLUMN IF NOT EXISTS spec TEXT;
-- ALTER TABLE staff_members
--   ADD COLUMN IF NOT EXISTS auth_user_id TEXT,
--   ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES companies(id);
-- ALTER TABLE posts
--   ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES companies(id);
-- ALTER TABLE board_posts
--   ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES companies(id);
-- ALTER TABLE approvals
--   ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES companies(id);
-- ALTER TABLE inventory
--   ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES companies(id);
-- ALTER TABLE inventory_logs
--   ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES companies(id);
-- alter table if exists handover_notes
--   add column if not exists patient_name text,
--   add column if not exists patient_key text,
--   add column if not exists note_scope text default 'general';
-- alter table chat_push_jobs
--       add column if not exists next_attempt_at TEXT,
--       add column if not exists dead_lettered_at TEXT;
-- alter table push_subscriptions
--   add column if not exists device_id text,
--   add column if not exists platform text,
--   add column if not exists user_agent text;
-- alter table board_posts
--   add column if not exists status text;
-- alter table if exists payroll_locks
--   add column if not exists reopen_requested_at TEXT,
--   add column if not exists reopen_requested_by uuid references staff_members(id) on delete set null,
--   add column if not exists reopen_request_comment text,
--   add column if not exists reopen_request_status text,
--   add column if not exists reopen_reviewed_at TEXT,
--   add column if not exists reopen_reviewed_by uuid references staff_members(id) on delete set null,
--   add column if not exists reopen_review_comment text;
-- alter table todos
--   add column if not exists repeat_parent_id text null,
--   add column if not exists repeat_generated_from_id text null;
-- alter table chat_rooms
--   add column if not exists last_message_at TEXT;
-- alter table chat_rooms
--   add column if not exists last_message_preview text;
-- alter table if exists inventory
--   add column if not exists serial_number text;
-- alter table if exists inventory_logs
--   add column if not exists serial_number text;
-- alter table if exists inventory_transfers
--   add column if not exists serial_number text;
-- alter table messages
--   add column if not exists album_id   uuid    null,
--   add column if not exists album_index integer null,
--   add column if not exists album_total integer null;
-- alter table todos
--   add column if not exists priority text not null default 'medium',
--   add column if not exists reminder_at TEXT null,
--   add column if not exists repeat_type text not null default 'none',
--   add column if not exists assignee_kind text not null default 'self';
-- alter table if exists inventory
--   add column if not exists unit text;
-- alter table op_patient_checks
--   add column if not exists surgery_started_at TEXT null,
--   add column if not exists surgery_ended_at   TEXT null,
--   add column if not exists ward_message_sent_at TEXT null;
-- alter table if exists staff_members
--   add column if not exists meal_allowance INTEGER default 0,
--   add column if not exists night_duty_allowance INTEGER default 0,
--   add column if not exists vehicle_allowance INTEGER default 0,
--   add column if not exists childcare_allowance INTEGER default 0,
--   add column if not exists research_allowance INTEGER default 0,
--   add column if not exists other_taxfree INTEGER default 0,
--   add column if not exists position_allowance INTEGER default 0,
--   add column if not exists overtime_allowance INTEGER default 0,
--   add column if not exists night_work_allowance INTEGER default 0,
--   add column if not exists holiday_work_allowance INTEGER default 0,
--   add column if not exists annual_leave_pay INTEGER default 0;
-- alter table if exists payroll_records
--   add column if not exists meal_allowance INTEGER default 0,
--   add column if not exists night_duty_allowance INTEGER default 0,
--   add column if not exists vehicle_allowance INTEGER default 0,
--   add column if not exists childcare_allowance INTEGER default 0,
--   add column if not exists research_allowance INTEGER default 0,
--   add column if not exists other_taxfree INTEGER default 0;
-- ALTER TABLE board_post_comments
--   ADD COLUMN IF NOT EXISTS parent_comment_id TEXT REFERENCES board_post_comments(id) ON DELETE CASCADE;
-- alter table messages
--   add column if not exists sender_name TEXT,
--   add column if not exists file_name text,
--   add column if not exists message_type TEXT;
-- alter table staff_members
--   add column if not exists birth_date date,
--   add column if not exists permissions TEXT not null default '{}',
--   add column if not exists presence_status TEXT not null default 'offline',
--   add column if not exists last_seen_at TEXT;
-- alter table approvals
--   add column if not exists sender_department TEXT,
--   add column if not exists approver_line TEXT;
-- alter table push_subscriptions
--   add column if not exists fcm_token text,
--   add column if not exists device_id text,
--   add column if not exists platform text,
--   add column if not exists user_agent text;
-- alter table department_private_inventory_items
--   add column if not exists company text,
--   add column if not exists company_id uuid references companies(id),
--   add column if not exists department text,
--   add column if not exists item_name text,
--   add column if not exists category text,
--   add column if not exists unit text not null default 'EA',
--   add column if not exists quantity integer not null default 0,
--   add column if not exists min_quantity integer not null default 0,
--   add column if not exists total_used integer not null default 0,
--   add column if not exists memo text,
--   add column if not exists created_by uuid references staff_members(id) on delete set null,
--   add column if not exists created_by_name text,
--   add column if not exists updated_by uuid references staff_members(id) on delete set null,
--   add column if not exists updated_by_name text,
--   add column if not exists created_at TEXT not null DEFAULT CURRENT_TIMESTAMP,
--   add column if not exists updated_at TEXT not null DEFAULT CURRENT_TIMESTAMP;
-- alter table department_private_inventory_logs
--   add column if not exists item_id uuid references department_private_inventory_items(id) on delete cascade,
--   add column if not exists company text,
--   add column if not exists company_id uuid references companies(id),
--   add column if not exists department text,
--   add column if not exists item_name text,
--   add column if not exists action text not null default 'consume',
--   add column if not exists quantity integer not null default 0,
--   add column if not exists prev_quantity integer,
--   add column if not exists next_quantity integer,
--   add column if not exists actor_id uuid references staff_members(id) on delete set null,
--   add column if not exists actor_name text,
--   add column if not exists notes text,
--   add column if not exists created_at TEXT not null DEFAULT CURRENT_TIMESTAMP;
-- alter table if exists inventory_logs
--   add column if not exists department text;
-- alter table if exists inventory
--   add column if not exists serial_number text,
--   add column if not exists lot_number text,
--   add column if not exists expiry_date date,
--   add column if not exists location text,
--   add column if not exists unit_price REAL default 0,
--   add column if not exists supplier_name text,
--   add column if not exists is_udi INTEGER default false,
--   add column if not exists udi_code text;
-- alter table if exists inventory_logs
--   add column if not exists notes text,
--   add column if not exists actor_id uuid references staff_members(id) on delete set null,
--   add column if not exists company_id uuid references companies(id) on delete set null,
--   add column if not exists approval_id uuid references approvals(id) on delete set null,
--   add column if not exists purchase_order_id uuid references purchase_orders(id) on delete set null,
--   add column if not exists serial_number text,
--   add column if not exists lot_number text,
--   add column if not exists expiry_date date,
--   add column if not exists location text,
--   add column if not exists unit_price REAL,
--   add column if not exists supplier_name text;
-- alter table if exists purchase_orders
--   add column if not exists supplier_name text,
--   add column if not exists expected_delivery_date date,
--   add column if not exists ordered_at TEXT,
--   add column if not exists approved_at TEXT,
--   add column if not exists received_at TEXT,
--   add column if not exists received_by_id uuid references staff_members(id) on delete set null,
--   add column if not exists received_by_name text,
--   add column if not exists inspected_at TEXT,
--   add column if not exists inspected_by_id uuid references staff_members(id) on delete set null,
--   add column if not exists inspected_by_name text,
--   add column if not exists inspection_status text,
--   add column if not exists received_qty REAL default 0,
--   add column if not exists rejected_qty REAL default 0,
--   add column if not exists received_items TEXT default '[]',
--   add column if not exists closed_at TEXT,
--   add column if not exists closed_by_id uuid references staff_members(id) on delete set null,
--   add column if not exists closed_by_name text,
--   add column if not exists expense_status text default 'pending',
--   add column if not exists expense_posted_at TEXT,
--   add column if not exists expense_posted_by_id uuid references staff_members(id) on delete set null,
--   add column if not exists expense_posted_by_name text,
--   add column if not exists expense_total_amount REAL default 0,
--   add column if not exists tax_amount REAL default 0,
--   add column if not exists invoice_no text,
--   add column if not exists invoice_date date,
--   add column if not exists payment_status text default 'unpaid',
--   add column if not exists payment_due_date date,
--   add column if not exists cost_center text,
--   add column if not exists budget_department text,
--   add column if not exists account_code text,
--   add column if not exists source_supply_approval_id uuid references approvals(id) on delete set null,
--   add column if not exists source_supply_request_index integer,
--   add column if not exists requester_company text,
--   add column if not exists requester_department text;
-- alter table if exists inventory_price_history
--   add column if not exists supplier_name text,
--   add column if not exists total_amount REAL default 0,
--   add column if not exists purchase_order_id uuid references purchase_orders(id) on delete set null,
--   add column if not exists notes text;
-- alter table if exists inventory_logs
--   add column if not exists department text;
-- alter table if exists inventory_count_sessions
--   add column if not exists company text,
--   add column if not exists company_id uuid references companies(id) on delete set null,
--   add column if not exists department text;
-- alter table todos
--   add column if not exists source_message_id text null,
--   add column if not exists source_room_id text null;
-- alter table board_post_comments
--   add column if not exists is_anonymous INTEGER not null default false;
-- alter table inventory
--   add column if not exists keywords text;
-- alter table if exists payroll_records
--   add column if not exists record_type TEXT default 'regular';
-- alter table if exists payroll_records
--   add column if not exists settlement_reason text,
--   add column if not exists settlement_date date,
--   add column if not exists severance_pay INTEGER default 0;
-- alter table board_posts
--   add column if not exists updated_at TEXT DEFAULT CURRENT_TIMESTAMP;
-- ALTER TABLE companies ADD COLUMN IF NOT EXISTS payment_day INTEGER DEFAULT 7;
-- alter table report_schedules add column if not exists company_id text;
-- alter table report_schedules add column if not exists report_type text;
-- alter table report_schedules add column if not exists schedule_cron text;
-- alter table report_schedules add column if not exists recipients TEXT not null default '[]';
-- alter table report_schedules add column if not exists enabled INTEGER not null default true;
-- alter table report_schedules add column if not exists last_generated_at TEXT;
-- alter table report_schedules add column if not exists created_at TEXT not null DEFAULT CURRENT_TIMESTAMP;
-- alter table report_schedules add column if not exists updated_at TEXT not null DEFAULT CURRENT_TIMESTAMP;
-- alter table generated_reports add column if not exists schedule_id uuid;
-- alter table generated_reports add column if not exists report_type text;
-- alter table generated_reports add column if not exists period text;
-- alter table generated_reports add column if not exists status text not null default 'completed';
-- alter table generated_reports add column if not exists summary TEXT not null default '{}';
-- alter table generated_reports add column if not exists created_at TEXT not null DEFAULT CURRENT_TIMESTAMP;
-- alter table virtual_account_deposits add column if not exists company_id text;
-- alter table virtual_account_deposits add column if not exists provider text not null default 'generic';
-- alter table virtual_account_deposits add column if not exists dedupe_key text;
-- alter table virtual_account_deposits add column if not exists provider_event_type text;
-- alter table virtual_account_deposits add column if not exists provider_event_id text;
-- alter table virtual_account_deposits add column if not exists order_id text;
-- alter table virtual_account_deposits add column if not exists order_name text;
-- alter table virtual_account_deposits add column if not exists payment_key text;
-- alter table virtual_account_deposits add column if not exists transaction_key text;
-- alter table virtual_account_deposits add column if not exists method text;
-- alter table virtual_account_deposits add column if not exists deposit_status text not null default 'issued';
-- alter table virtual_account_deposits add column if not exists match_status text not null default 'unmatched';
-- alter table virtual_account_deposits add column if not exists amount REAL not null default 0;
-- alter table virtual_account_deposits add column if not exists currency text not null default 'KRW';
-- alter table virtual_account_deposits add column if not exists depositor_name text;
-- alter table virtual_account_deposits add column if not exists customer_name text;
-- alter table virtual_account_deposits add column if not exists patient_name text;
-- alter table virtual_account_deposits add column if not exists patient_id text;
-- alter table virtual_account_deposits add column if not exists transaction_label text;
-- alter table virtual_account_deposits add column if not exists bank_code text;
-- alter table virtual_account_deposits add column if not exists bank_name text;
-- alter table virtual_account_deposits add column if not exists account_number text;
-- alter table virtual_account_deposits add column if not exists due_date TEXT;
-- alter table virtual_account_deposits add column if not exists deposited_at TEXT;
-- alter table virtual_account_deposits add column if not exists matched_target_type text;
-- alter table virtual_account_deposits add column if not exists matched_target_id text;
-- alter table virtual_account_deposits add column if not exists matched_note text;
-- alter table virtual_account_deposits add column if not exists raw_payload TEXT not null default '{}';
-- alter table virtual_account_deposits add column if not exists created_at TEXT not null DEFAULT CURRENT_TIMESTAMP;
-- alter table virtual_account_deposits add column if not exists updated_at TEXT not null DEFAULT CURRENT_TIMESTAMP;
-- alter table company_expenses add column if not exists company text;
-- alter table company_expenses add column if not exists year_month text;
-- alter table company_expenses add column if not exists rent REAL not null default 0;
-- alter table company_expenses add column if not exists materials REAL not null default 0;
-- alter table company_expenses add column if not exists utilities REAL not null default 0;
-- alter table company_expenses add column if not exists others REAL not null default 0;
-- alter table company_expenses add column if not exists created_at TEXT not null DEFAULT CURRENT_TIMESTAMP;
-- alter table company_expenses add column if not exists updated_at TEXT not null DEFAULT CURRENT_TIMESTAMP;
-- alter table access_logs add column if not exists user_id text;
-- alter table access_logs add column if not exists user_name text;
-- alter table access_logs add column if not exists company text;
-- alter table access_logs add column if not exists menu text;
-- alter table access_logs add column if not exists action text;
-- alter table access_logs add column if not exists ip_address text;
-- alter table access_logs add column if not exists user_agent text;
-- alter table access_logs add column if not exists created_at TEXT not null DEFAULT CURRENT_TIMESTAMP;
-- alter table tax_reports add column if not exists year text;
-- alter table tax_reports add column if not exists company_name text;
-- alter table tax_reports add column if not exists report_type text;
-- alter table tax_reports add column if not exists report_date TEXT;
-- alter table tax_reports add column if not exists data TEXT not null default '[]';
-- alter table tax_reports add column if not exists status text not null default 'draft';
-- alter table tax_reports add column if not exists created_at TEXT not null DEFAULT CURRENT_TIMESTAMP;
-- alter table tax_reports add column if not exists updated_at TEXT not null DEFAULT CURRENT_TIMESTAMP;
-- alter table retirement_pensions add column if not exists staff_id text;
-- alter table retirement_pensions add column if not exists staff_name text;
-- alter table retirement_pensions add column if not exists pension_type text not null default 'unregistered';
-- alter table retirement_pensions add column if not exists joined_date text;
-- alter table retirement_pensions add column if not exists account_number text;
-- alter table retirement_pensions add column if not exists fund_name text;
-- alter table retirement_pensions add column if not exists monthly_contribution REAL not null default 0;
-- alter table retirement_pensions add column if not exists total_accumulated REAL not null default 0;
-- alter table retirement_pensions add column if not exists memo text;
-- alter table retirement_pensions add column if not exists created_at TEXT not null DEFAULT CURRENT_TIMESTAMP;
-- alter table retirement_pensions add column if not exists updated_at TEXT not null DEFAULT CURRENT_TIMESTAMP;
-- alter table inventory_categories add column if not exists name text;
-- alter table inventory_categories add column if not exists parent_id uuid;
-- alter table inventory_categories add column if not exists description text;
-- alter table inventory_categories add column if not exists color text;
-- alter table inventory_categories add column if not exists created_at TEXT not null DEFAULT CURRENT_TIMESTAMP;
-- alter table inventory_categories add column if not exists updated_at TEXT not null DEFAULT CURRENT_TIMESTAMP;
-- alter table if exists chat_push_jobs
--   add column if not exists processing_started_at TEXT,
--   add column if not exists processed_at TEXT,
--   add column if not exists attempt_count integer not null default 0,
--   add column if not exists last_error text,
--   add column if not exists next_attempt_at TEXT,
--   add column if not exists dead_lettered_at TEXT;
-- alter table if exists staff_members
--   add column if not exists password text,
--   add column if not exists passwd text,
--   add column if not exists employment_type text;
-- alter table if exists inventory
--   add column if not exists name text,
--   add column if not exists stock integer default 0,
--   add column if not exists min_stock integer default 10;
-- alter table if exists approvals
--   add column if not exists approval_line TEXT,
--   add column if not exists approver_line TEXT,
--   add column if not exists name text,
--   add column if not exists doc_type text;
-- alter table if exists attendance_corrections
--   add column if not exists attendance_date date,
--   add column if not exists requested_at TEXT DEFAULT CURRENT_TIMESTAMP;
-- alter table if exists payroll_records
--   add column if not exists gross_pay REAL default 0,
--   add column if not exists national_pension REAL default 0,
--   add column if not exists health_insurance REAL default 0,
--   add column if not exists long_term_care REAL default 0,
--   add column if not exists employment_insurance REAL default 0,
--   add column if not exists income_tax REAL default 0,
--   add column if not exists local_tax REAL default 0;
-- alter table if exists companies
--   add column if not exists business_number text,
--   add column if not exists seal_url text;
-- alter table if exists chat_rooms
--   add column if not exists member_ids uuid[] default '{}';
-- alter table if exists audit_logs
--   add column if not exists actor_name text;
-- alter table if exists leave_requests
--   add column if not exists days REAL;
-- alter table if exists salary_change_history
--   add column if not exists previous_salary REAL;
-- alter table if exists employment_contracts
--   add column if not exists start_date date;
-- alter table if exists personnel_appointments
--   add column if not exists new_department text;
-- ALTER TABLE approval_form_types
--     ADD COLUMN IF NOT EXISTS company_name TEXT NOT NULL DEFAULT '전체',
--     ADD COLUMN IF NOT EXISTS base_slug TEXT;
-- ALTER TABLE IF EXISTS companies
--   ADD COLUMN IF NOT EXISTS logo_url TEXT;
-- ALTER TABLE approvals ADD COLUMN IF NOT EXISTS approver_line TEXT;
-- ALTER TABLE approvals ADD COLUMN IF NOT EXISTS current_step INT DEFAULT 0;
-- ALTER TABLE approvals ADD COLUMN IF NOT EXISTS rejection_comment TEXT;
-- ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS attachment_url TEXT;
-- ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS attachment_name TEXT;
-- ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT false;
-- ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TEXT;
-- ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT false;
-- ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS edited_at TEXT;
-- ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_url TEXT;
-- ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id TEXT;
-- ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS file_url TEXT;
-- ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_to_id TEXT;
-- ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_in TEXT;
-- ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_out TEXT;
-- ALTER TABLE attendance ADD COLUMN IF NOT EXISTS location_lat REAL;
-- ALTER TABLE attendance ADD COLUMN IF NOT EXISTS location_lon REAL;
-- ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS annual_leave_used REAL DEFAULT 0;
-- ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS join_date TEXT;
-- ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS base_salary INTEGER DEFAULT 0;
-- ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS join_date TEXT;
-- ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS attendance_deduction INTEGER DEFAULT 0;
-- ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS attendance_deduction_detail TEXT;
-- ALTER TABLE board_post_comments
--   ADD COLUMN IF NOT EXISTS parent_comment_id TEXT REFERENCES board_post_comments(id) ON DELETE CASCADE;
-- ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS attachments TEXT DEFAULT '[]';
-- ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS schedule_date TEXT;
-- ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS schedule_time TEXT;
-- ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS schedule_room TEXT;
-- ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS patient_name TEXT;
-- ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS surgery_fasting INTEGER DEFAULT false;
-- ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS surgery_inpatient INTEGER DEFAULT false;
-- ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS surgery_guardian INTEGER DEFAULT false;
-- ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS surgery_caregiver INTEGER DEFAULT false;
-- ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS surgery_transfusion INTEGER DEFAULT false;
-- ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS likes_count INT DEFAULT 0;
-- ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS tags TEXT DEFAULT '[]';
-- ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS is_pinned INTEGER DEFAULT FALSE;
-- ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium';
-- ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_size_bytes INTEGER;
-- ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_kind TEXT;
-- ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS last_message_at TEXT;
-- ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS last_message_preview TEXT;
-- ALTER TABLE companies ADD COLUMN IF NOT EXISTS ceo_name TEXT;
-- ALTER TABLE companies ADD COLUMN IF NOT EXISTS business_no TEXT;
-- ALTER TABLE companies ADD COLUMN IF NOT EXISTS address TEXT;
-- ALTER TABLE companies ADD COLUMN IF NOT EXISTS phone TEXT;
-- ALTER TABLE companies ADD COLUMN IF NOT EXISTS memo TEXT;
-- ALTER TABLE contract_templates
--   ADD COLUMN IF NOT EXISTS seal_url TEXT;
-- ALTER TABLE corporate_card_transactions ADD COLUMN IF NOT EXISTS card_id TEXT REFERENCES corporate_cards(id) ON DELETE SET NULL;
-- ALTER TABLE work_shifts ADD COLUMN IF NOT EXISTS shift_type TEXT DEFAULT 'day';
-- ALTER TABLE work_shifts ADD COLUMN IF NOT EXISTS rotation_days INT;
-- ALTER TABLE work_shifts ADD COLUMN IF NOT EXISTS rest_days_after INT DEFAULT 0;
-- ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS joined_at TEXT;
-- ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS resigned_at TEXT;
-- ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS bank_name TEXT;
-- ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS bank_account TEXT;
-- ALTER TABLE payroll_records ADD COLUMN record_type TEXT DEFAULT 'regular';
-- ALTER TABLE payroll_records ADD COLUMN severance_pay INTEGER DEFAULT 0;
-- ALTER TABLE payroll_records ADD COLUMN settlement_reason TEXT;
-- ALTER TABLE payroll_records ADD COLUMN settlement_date TEXT;
-- ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_url TEXT;
-- ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id TEXT;
-- ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS file_url TEXT;
-- ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_to_id TEXT;
-- ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata TEXT;
-- ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS advance_pay INTEGER DEFAULT 0;
-- ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS deduction_detail TEXT DEFAULT '{}';
-- ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS night_duty_allowance INTEGER DEFAULT 0;
-- ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS night_duty_allowance INTEGER DEFAULT 0;
-- ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS night_duty_allowance INTEGER DEFAULT 0;
-- ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS position_allowance INTEGER DEFAULT 0;
-- ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS night_duty_allowance INTEGER DEFAULT 0;
-- ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS avatar_url TEXT;
-- ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS extension TEXT;
-- ALTER TABLE surgery_templates ADD COLUMN IF NOT EXISTS body_part TEXT;
-- ALTER TABLE mri_templates ADD COLUMN IF NOT EXISTS body_part TEXT;

-- ── 인덱스 ──
CREATE INDEX idx_staff_members_company_id ON staff_members(company_id);
CREATE INDEX idx_staff_members_shift_id ON staff_members(shift_id);
CREATE INDEX idx_board_posts_company_id ON board_posts(company_id);
CREATE INDEX idx_inventory_company_id ON inventory(company_id);
CREATE INDEX idx_contracts_staff_id ON employment_contracts(staff_id);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_attendance_staff_date ON attendance(staff_id, date);
CREATE INDEX idx_leave_requests_staff_id ON leave_requests(staff_id);
CREATE INDEX idx_staff_evaluations_staff_id ON staff_evaluations(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_licenses_staff_id
      ON staff_licenses (staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_licenses_staff_id_is_primary
      ON staff_licenses (staff_id, is_primary);
CREATE INDEX IF NOT EXISTS idx_staff_licenses_expiry_date
      ON staff_licenses (expiry_date);
CREATE INDEX IF NOT EXISTS idx_staff_job_categories_staff_id
  ON staff_job_categories (staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_job_categories_job_category_id
  ON staff_job_categories (job_category_id);
CREATE INDEX IF NOT EXISTS idx_jcrt_job_category_id
  ON job_category_required_trainings (job_category_id);
CREATE INDEX IF NOT EXISTS idx_jcrt_applies_to_all
  ON job_category_required_trainings (applies_to_all);
CREATE INDEX IF NOT EXISTS idx_leave_balances_staff_id
      ON leave_balances (staff_id);
CREATE INDEX IF NOT EXISTS idx_leave_balances_expiry_date
      ON leave_balances (expiry_date);
CREATE INDEX IF NOT EXISTS idx_staff_shift_assignments_staff_id
  ON staff_shift_assignments (staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_shift_assignments_staff_id_is_primary
  ON staff_shift_assignments (staff_id, is_primary);
CREATE INDEX IF NOT EXISTS idx_staff_shift_assignments_shift_id
  ON staff_shift_assignments (shift_id);
CREATE INDEX IF NOT EXISTS idx_alpl_staff_id
      ON annual_leave_promotion_logs (staff_id);
CREATE INDEX IF NOT EXISTS idx_alpl_expiry_date
      ON annual_leave_promotion_logs (expiry_date);
CREATE INDEX IF NOT EXISTS idx_alpl_stage
      ON annual_leave_promotion_logs (stage);
CREATE INDEX IF NOT EXISTS idx_staff_trainings_staff_id
  ON staff_trainings (staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_trainings_status
  ON staff_trainings (status);
CREATE INDEX IF NOT EXISTS idx_staff_trainings_training_code
  ON staff_trainings (training_code);
CREATE INDEX IF NOT EXISTS idx_license_ce_staff_id        ON license_continuing_education (staff_id);
CREATE INDEX IF NOT EXISTS idx_license_ce_license_id      ON license_continuing_education (license_id);
CREATE INDEX IF NOT EXISTS idx_license_ce_status          ON license_continuing_education (status);
CREATE INDEX IF NOT EXISTS idx_license_ce_submitted_at    ON license_continuing_education (submitted_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_staff_endpoint
  ON push_subscriptions(staff_id, endpoint);
CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_attendance_staff_date ON attendance(staff_id, date);
CREATE INDEX IF NOT EXISTS idx_attendances_staff_date ON attendances(staff_id, work_date);
CREATE INDEX IF NOT EXISTS idx_attendances_work_date ON attendances(work_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_staff ON leave_requests(staff_id);
CREATE INDEX IF NOT EXISTS idx_payroll_records_staff_ym ON payroll_records(staff_id, year_month);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_history_approval ON approval_history(approval_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_message ON message_reads(message_id);
CREATE INDEX IF NOT EXISTS idx_polls_room ON polls(room_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_msg ON message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_pinned_room ON pinned_messages(room_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_members_auth_user_id
  ON staff_members(auth_user_id)
  WHERE auth_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staff_members_company_id
  ON staff_members(company_id);
CREATE INDEX IF NOT EXISTS idx_posts_company_id_created_at
  ON posts(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_board_posts_company_id_board_type_created_at
  ON board_posts(company_id, board_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approvals_company_id_status_created_at
  ON approvals(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_company_id_item_name
  ON inventory(company_id, item_name);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_company_id_created_at
  ON inventory_logs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messenger_drive_links_company
  ON messenger_drive_links(company_name, sort_order, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messenger_drive_links_room
  ON messenger_drive_links(room_id);
CREATE INDEX IF NOT EXISTS idx_payroll_bonus_items_company_month
  ON payroll_bonus_items(company_name, year_month, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_bonus_items_staff
  ON payroll_bonus_items(staff_id, year_month);
CREATE INDEX IF NOT EXISTS idx_payroll_retro_adjustments_company
  ON payroll_retro_adjustments(company_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_retro_adjustments_staff
  ON payroll_retro_adjustments(staff_id, start_month, end_month);
CREATE INDEX IF NOT EXISTS idx_payroll_deduction_controls_company
  ON payroll_deduction_controls(company_name, is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_deduction_controls_staff
  ON payroll_deduction_controls(staff_id, is_active);
CREATE INDEX IF NOT EXISTS idx_freelancer_payments_company_month
  ON freelancer_payments(company_name, year_month, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_calendar_items_scope
  ON payroll_calendar_items(company_name, year_month, sort_order);
CREATE INDEX IF NOT EXISTS idx_payroll_approval_workflows_scope
  ON payroll_approval_workflows(company_name, year_month);
CREATE INDEX IF NOT EXISTS idx_payroll_approval_logs_scope
  ON payroll_approval_logs(company_name, year_month, created_at DESC);
create index if not exists idx_handover_notes_patient_key
  on handover_notes (patient_key);
create index if not exists idx_handover_notes_note_scope
  on handover_notes (note_scope);
create index if not exists idx_virtual_account_deposits_company_created_at
  on virtual_account_deposits (company_id, created_at desc);
create index if not exists idx_virtual_account_deposits_match_status
  on virtual_account_deposits (match_status);
create index if not exists idx_virtual_account_deposits_deposit_status
  on virtual_account_deposits (deposit_status);
create unique index if not exists idx_chat_push_jobs_message_id
  on chat_push_jobs(message_id);
create index if not exists idx_chat_push_jobs_pending
  on chat_push_jobs(processed_at, created_at);
create index if not exists idx_chat_push_jobs_ready
      on chat_push_jobs (next_attempt_at, created_at)
      where processed_at is null and dead_lettered_at is null
    ';
create index if not exists idx_push_subscriptions_staff_device
  on push_subscriptions (staff_id, device_id)
  where device_id is not null;
create index if not exists idx_board_post_reads_post_id
  on board_post_reads(post_id);
create index if not exists idx_board_post_reads_user_id
  on board_post_reads(user_id);
create index if not exists idx_payroll_policy_versions_scope
  on payroll_policy_versions(company_name, effective_year, created_at desc);
create index if not exists idx_payroll_locks_reopen_status
  on payroll_locks(year_month, company_name, reopen_request_status);
create index if not exists idx_todos_repeat_parent_date
  on todos(user_id, repeat_parent_id, task_date desc)
  where repeat_parent_id is not null;
create unique index if not exists idx_todo_reminder_logs_unique
  on todo_reminder_logs(user_id, todo_id, reminder_at);
create index if not exists idx_todo_reminder_logs_created
  on todo_reminder_logs(user_id, created_at desc);
create index if not exists idx_wiki_document_versions_document_created
      on wiki_document_versions(document_id, created_at desc);
create index if not exists idx_backup_restore_runs_started
  on backup_restore_runs(started_at desc);
create index if not exists idx_inventory_serial_number
  on inventory (serial_number);
create index if not exists idx_inventory_logs_serial_number
  on inventory_logs (serial_number);
create index if not exists idx_inventory_transfers_serial_number
  on inventory_transfers (serial_number);
create index if not exists idx_messages_album_id
  on messages(album_id)
  where album_id is not null;
create index if not exists idx_wiki_folders_company_sort
  on wiki_folders(company_id, sort_order, created_at desc);
create index if not exists idx_wiki_documents_folder_updated
  on wiki_documents(folder_id, updated_at desc);
create index if not exists idx_wiki_documents_company_title
  on wiki_documents(company_id, title);
create index if not exists idx_todos_reminder_at
  on todos(reminder_at)
  where reminder_at is not null;
create index if not exists idx_todos_priority_date
  on todos(user_id, priority, task_date desc);
create index if not exists idx_op_check_templates_company_scope
  on op_check_templates(company_id, template_scope, is_active);
create index if not exists idx_op_check_templates_surgery_name
  on op_check_templates(lower(coalesce(surgery_name, '')));
create index if not exists idx_op_check_templates_anesthesia
  on op_check_templates(lower(coalesce(anesthesia_type, '')));
create index if not exists idx_op_patient_checks_company_date
  on op_patient_checks(company_id, schedule_date desc, updated_at desc);
create index if not exists idx_op_patient_checks_patient_name
  on op_patient_checks(lower(patient_name));
create index if not exists idx_op_patient_checks_started_at
  on op_patient_checks(surgery_started_at desc)
  where surgery_started_at is not null;
create unique index if not exists idx_roster_policy_settings_policy_unique
  on roster_policy_settings(policy_type, policy_id);
create index if not exists idx_roster_policy_settings_company_type_updated
  on roster_policy_settings(company_id, policy_type, updated_at desc);
create index if not exists idx_roster_policy_settings_company_name_type_updated
  on roster_policy_settings(company_name, policy_type, updated_at desc);
create index if not exists idx_roster_approval_requests_status_created_at
  on roster_approval_requests(status, created_at desc);
create index if not exists idx_roster_approval_requests_year_month_team
  on roster_approval_requests(year_month, team_name);
create index if not exists idx_roster_swap_requests_status_created_at
  on roster_swap_requests(status, created_at desc);
create index if not exists idx_roster_swap_requests_staff_date
  on roster_swap_requests(staff_id, work_date, target_date);
CREATE INDEX IF NOT EXISTS idx_staff_preferred_off_staff_id ON staff_preferred_off(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_preferred_off_year_month ON staff_preferred_off(year_month);
CREATE INDEX IF NOT EXISTS idx_monthly_off_quota_company ON monthly_off_quota(company);
CREATE INDEX IF NOT EXISTS idx_monthly_off_quota_year_month ON monthly_off_quota(year_month);
CREATE INDEX IF NOT EXISTS idx_board_post_comments_parent_comment_id
  ON board_post_comments(parent_comment_id);
create index if not exists idx_chat_room_prefs_user_id
on chat_room_prefs(user_id);
create index if not exists idx_chat_room_prefs_room_id
on chat_room_prefs(room_id);
create unique index if not exists idx_push_subscriptions_staff_endpoint
  on push_subscriptions (staff_id, endpoint);
create unique index if not exists idx_push_subscriptions_fcm_token_unique
  on push_subscriptions (fcm_token)
  where fcm_token is not null;
create unique index if not exists idx_push_subscriptions_staff_device_unique
  on push_subscriptions (staff_id, device_id)
  where staff_id is not null
    and device_id is not null;
create index if not exists idx_push_subscriptions_staff_id
  on push_subscriptions (staff_id);
create unique index if not exists department_private_inventory_unique_item
  on department_private_inventory_items (lower(company), lower(department), lower(item_name));
create index if not exists department_private_inventory_scope_idx
  on department_private_inventory_items (company_id, department, item_name);
create index if not exists department_private_inventory_logs_item_idx
  on department_private_inventory_logs (item_id, created_at desc);
create index if not exists department_private_inventory_logs_scope_idx
  on department_private_inventory_logs (company_id, department, created_at desc);
create index if not exists idx_inventory_logs_company_department_created_at
  on inventory_logs(company_id, department, created_at desc);
create index if not exists idx_inventory_transfers_created_at
  on inventory_transfers (created_at desc);
create index if not exists idx_inventory_transfers_approval_id
  on inventory_transfers (approval_id);
create index if not exists idx_inventory_transfers_purchase_order_id
  on inventory_transfers (purchase_order_id);
create index if not exists idx_inventory_lot_number
  on inventory (lot_number);
create index if not exists idx_inventory_location
  on inventory (location);
create index if not exists idx_inventory_logs_approval_id
  on inventory_logs (approval_id);
create index if not exists idx_inventory_logs_purchase_order_id
  on inventory_logs (purchase_order_id);
create index if not exists idx_inventory_logs_lot_number
  on inventory_logs (lot_number);
create index if not exists idx_purchase_orders_status
  on purchase_orders (status);
create index if not exists idx_purchase_orders_source_supply_approval
  on purchase_orders (source_supply_approval_id, source_supply_request_index);
create index if not exists idx_purchase_orders_inspection_status
  on purchase_orders (inspection_status);
create index if not exists idx_purchase_orders_expense_status
  on purchase_orders (expense_status);
create index if not exists idx_inventory_cost_entries_purchase_order
  on inventory_cost_entries (purchase_order_id);
create index if not exists idx_inventory_cost_entries_company_month
  on inventory_cost_entries (company_name, occurred_at desc);
create index if not exists idx_inventory_closing_snapshots_company_month
  on inventory_closing_snapshots (company, closing_month desc);
create index if not exists idx_delivery_confirmations_created_at
  on delivery_confirmations (created_at desc);
create index if not exists idx_inventory_price_history_item_recorded_at
  on inventory_price_history (inventory_item_id, recorded_at desc);
create index if not exists idx_inventory_price_history_purchase_order_id
  on inventory_price_history (purchase_order_id);
create index if not exists idx_inventory_count_sessions_created_at
  on inventory_count_sessions (created_at desc);
create index if not exists idx_inventory_company_department
  on inventory(company_id, department);
create index if not exists idx_inventory_logs_scope_created_at
  on inventory_logs(company_id, department, created_at desc);
create index if not exists idx_inventory_count_sessions_scope_created_at
  on inventory_count_sessions(company_id, department, created_at desc);
create index if not exists idx_todos_source_message
  on todos(user_id, source_room_id, source_message_id)
  where source_message_id is not null;
create unique index if not exists payroll_records_staff_ym_record_type_uidx
  on payroll_records(staff_id, year_month, record_type);
create index if not exists idx_chat_rooms_members_gin
  on chat_rooms using gin (members);
create index if not exists idx_chat_rooms_last_message_at_desc on chat_rooms (last_message_at desc nulls last, created_at desc)';
create index if not exists idx_messages_room_created_id_desc
  on messages (room_id, created_at desc, id desc);
create index if not exists idx_messages_room_unread_count
  on messages (room_id, created_at desc)
  where is_deleted = false;
create index if not exists idx_room_read_cursors_room_user
  on room_read_cursors (room_id, user_id);
create index if not exists idx_board_posts_board_type_created_desc
  on board_posts (board_type, created_at desc);
create index if not exists idx_board_posts_board_type_schedule_date_time on board_posts (board_type, schedule_date, schedule_time)';
create index if not exists idx_board_post_likes_user_id on board_post_likes (user_id)';
create index if not exists idx_message_bookmarks_user_message on message_bookmarks (user_id, message_id)';
CREATE INDEX IF NOT EXISTS idx_insurance_records_staff ON insurance_records(staff_id);
CREATE INDEX IF NOT EXISTS idx_insurance_records_company_status ON insurance_records(company, status);
CREATE INDEX IF NOT EXISTS idx_insurance_records_created_at ON insurance_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_salary_change_staff_date
  ON salary_change_history(staff_id, effective_date);
create index if not exists idx_report_schedules_enabled
  on report_schedules(enabled, report_type);
create index if not exists idx_generated_reports_schedule_created
  on generated_reports(schedule_id, created_at desc);
create index if not exists idx_generated_reports_type_period
  on generated_reports(report_type, period);
create unique index if not exists idx_virtual_account_deposits_dedupe_key
  on virtual_account_deposits(dedupe_key);
create index if not exists idx_virtual_account_deposits_company_created_at
  on virtual_account_deposits(company_id, created_at desc);
create index if not exists idx_virtual_account_deposits_deposited_at
  on virtual_account_deposits(deposited_at desc);
create index if not exists idx_virtual_account_deposits_status
  on virtual_account_deposits(deposit_status, match_status);
create unique index if not exists idx_company_expenses_company_month
  on company_expenses(company, year_month);
create index if not exists idx_access_logs_created_at
  on access_logs(created_at desc);
create index if not exists idx_access_logs_user_created_at
  on access_logs(user_id, created_at desc);
create index if not exists idx_access_logs_company_menu_created_at
  on access_logs(company, menu, created_at desc);
create index if not exists idx_tax_reports_year_company
  on tax_reports(year, company_name, report_type);
create unique index if not exists idx_retirement_pensions_staff_id
  on retirement_pensions(staff_id);
create index if not exists idx_retirement_pensions_type
  on retirement_pensions(pension_type);
create index if not exists idx_inventory_categories_parent_id
  on inventory_categories(parent_id);
create unique index if not exists idx_inventory_categories_parent_name
  on inventory_categories(coalesce(parent_id, '00000000-0000-0000-0000-000000000000'), lower(name));
create unique index if not exists idx_chat_push_jobs_message_id
  on chat_push_jobs(message_id);
create index if not exists idx_chat_push_jobs_ready
  on chat_push_jobs(next_attempt_at, created_at)
  where processed_at is null and dead_lettered_at is null;
create index if not exists idx_chat_push_jobs_processing_started_at
  on chat_push_jobs(processing_started_at desc);
create index if not exists idx_company_holidays_scope_date
  on company_holidays(company_name, holiday_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_form_types_company_slug
    ON approval_form_types(company_name, slug);
CREATE INDEX IF NOT EXISTS idx_approval_form_types_company_active
    ON approval_form_types(company_name, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_company_seals_company_active
  ON company_seals(company, is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_approval_history_approval ON approval_history(approval_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_message ON message_reads(message_id);
CREATE INDEX IF NOT EXISTS idx_polls_room ON polls(room_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_msg ON message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_pinned_room ON pinned_messages(room_id);
create index if not exists idx_annual_leave_promotion_logs_staff_year
  on annual_leave_promotion_logs (staff_id, target_year, step);
CREATE INDEX IF NOT EXISTS idx_approval_form_types_active ON approval_form_types(is_active);
CREATE INDEX IF NOT EXISTS idx_corporate_cards_company ON corporate_cards(company_name);
CREATE INDEX IF NOT EXISTS idx_cert_staff ON certificate_issuances(staff_id);
CREATE INDEX IF NOT EXISTS idx_cert_issued ON certificate_issuances(issued_at);
CREATE INDEX IF NOT EXISTS idx_card_date ON corporate_card_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_card_category ON corporate_card_transactions(category);
CREATE INDEX IF NOT EXISTS idx_asset_staff ON asset_loans(staff_id);
CREATE INDEX IF NOT EXISTS idx_salary_change_staff ON salary_change_history(staff_id);
CREATE INDEX IF NOT EXISTS idx_salary_change_date ON salary_change_history(effective_date);
CREATE INDEX IF NOT EXISTS idx_onboarding_staff ON onboarding_checklists(staff_id);
CREATE INDEX IF NOT EXISTS idx_transfer_staff ON staff_transfer_history(staff_id);
CREATE INDEX IF NOT EXISTS idx_certs_staff ON staff_certifications(staff_id);
CREATE INDEX IF NOT EXISTS idx_attendances_staff_date ON attendances(staff_id, work_date);
CREATE INDEX IF NOT EXISTS idx_attendances_work_date ON attendances(work_date);
CREATE INDEX IF NOT EXISTS idx_attendances_company ON attendances(company_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_staff ON leave_requests(staff_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON leave_requests(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_popups_active_created
  ON popups(is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_work_date ON shift_assignments(work_date);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_staff ON shift_assignments(staff_id);