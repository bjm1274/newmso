-- ============================================================
-- 누락 테이블 DDL (information_schema 추출 자동 변환)
-- 생성일: 2026-05-17T05:46:35.212Z
-- 테이블 수: 125
-- 제외: attendances_20260513_bulk_backup
-- ============================================================

PRAGMA foreign_keys = ON;

-- ── access_logs
CREATE TABLE IF NOT EXISTS access_logs (
  id TEXT NOT NULL,
  user_id TEXT,
  user_name TEXT,
  company TEXT,
  menu TEXT,
  action TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT access_logs_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_access_logs_company_menu_created_at ON access_logs (company, menu, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_created_at ON access_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_user_created_at ON access_logs (user_id, created_at DESC);

-- ── annual_leave_promotion_logs
CREATE TABLE IF NOT EXISTS annual_leave_promotion_logs (
  id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  company_name TEXT,
  target_year INTEGER NOT NULL,
  step INTEGER NOT NULL,
  sent_at TEXT DEFAULT CURRENT_TIMESTAMP,
  remain_days REAL,
  meta TEXT,
  stage INTEGER,
  expiry_date TEXT,
  notified_at TEXT DEFAULT CURRENT_TIMESTAMP,
  plan_submitted_at TEXT,
  remaining_days_at_notice REAL,
  notification_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT annual_leave_promotion_logs_pkey PRIMARY KEY (id),
  CONSTRAINT annual_leave_promotion_logs_step_check CHECK ((step  IN (1, 2)))
);

CREATE INDEX IF NOT EXISTS idx_alpl_expiry_date ON annual_leave_promotion_logs (expiry_date);
CREATE INDEX IF NOT EXISTS idx_alpl_staff_id ON annual_leave_promotion_logs (staff_id);
CREATE INDEX IF NOT EXISTS idx_alpl_stage ON annual_leave_promotion_logs (stage);
CREATE INDEX IF NOT EXISTS idx_annual_leave_promotion_logs_staff_year ON annual_leave_promotion_logs (staff_id, target_year, step);

-- ── approval_history
CREATE TABLE IF NOT EXISTS approval_history (
  id TEXT NOT NULL,
  approval_id TEXT NOT NULL,
  approver_id TEXT,
  approver_name TEXT,
  action TEXT NOT NULL,
  comment TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT approval_history_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_approval_history_approval ON approval_history (approval_id);

-- ── approval_templates
CREATE TABLE IF NOT EXISTS approval_templates (
  id TEXT NOT NULL,
  form_type TEXT NOT NULL,
  default_values TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT approval_templates_form_type_key UNIQUE (form_type),
  CONSTRAINT approval_templates_pkey PRIMARY KEY (id)
);


-- ── approvals
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT NOT NULL,
  company_id TEXT,
  sender_id TEXT,
  sender_name TEXT,
  sender_company TEXT,
  type TEXT,
  title TEXT NOT NULL,
  content TEXT,
  status TEXT DEFAULT '대기',
  current_approver_id TEXT,
  meta_data TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  sender_department TEXT,
  approver_line TEXT,
  doc_number TEXT,
  approval_line TEXT,
  name TEXT,
  doc_type TEXT,
  CONSTRAINT approvals_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT approvals_pkey PRIMARY KEY (id),
  CONSTRAINT approvals_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES staff_members(id)
);

CREATE INDEX IF NOT EXISTS idx_approvals_company_id_status_created_at ON approvals (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approvals_doc_number ON approvals (doc_number) WHERE (doc_number IS NOT NULL);

-- ── asset_loans
CREATE TABLE IF NOT EXISTS asset_loans (
  id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  asset_name TEXT,
  loaned_at TEXT NOT NULL,
  returned_at TEXT,
  condition_notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT asset_loans_asset_type_check CHECK ((asset_type  IN ('노트북', 'PC', '모니터', '키보드', '마우스', '회의실키', '기타'))),
  CONSTRAINT asset_loans_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_asset_staff ON asset_loans (staff_id);

-- ── attendance
CREATE TABLE IF NOT EXISTS attendance (
  id TEXT NOT NULL,
  staff_id TEXT,
  date TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  status TEXT DEFAULT '정상',
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  company_id TEXT,
  CONSTRAINT attendance_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT attendance_pkey PRIMARY KEY (id),
  CONSTRAINT attendance_staff_id_date_key UNIQUE (staff_id, date),
  CONSTRAINT attendance_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff_members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attendance_company_id ON attendance (company_id);
CREATE INDEX IF NOT EXISTS idx_attendance_staff_date ON attendance (staff_id, date);

-- ── attendance_corrections
CREATE TABLE IF NOT EXISTS attendance_corrections (
  id TEXT NOT NULL,
  staff_id TEXT,
  original_date TEXT,
  correction_type TEXT,
  reason TEXT,
  status TEXT DEFAULT '대기',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  attendance_date TEXT,
  requested_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT attendance_corrections_pkey PRIMARY KEY (id)
);


-- ── attendance_deduction_rules
CREATE TABLE IF NOT EXISTS attendance_deduction_rules (
  id TEXT NOT NULL,
  company_name TEXT DEFAULT '전체',
  late_deduction_type TEXT DEFAULT 'fixed',
  late_deduction_amount INTEGER DEFAULT 10000,
  early_leave_deduction_type TEXT DEFAULT 'fixed',
  early_leave_deduction_amount INTEGER DEFAULT 10000,
  absent_use_daily_rate INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT attendance_deduction_rules_company_name_key UNIQUE (company_name),
  CONSTRAINT attendance_deduction_rules_early_leave_deduction_type_check CHECK ((early_leave_deduction_type  IN ('hourly', 'fixed'))),
  CONSTRAINT attendance_deduction_rules_late_deduction_type_check CHECK ((late_deduction_type  IN ('hourly', 'fixed'))),
  CONSTRAINT attendance_deduction_rules_pkey PRIMARY KEY (id)
);


-- ── attendances
CREATE TABLE IF NOT EXISTS attendances (
  id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  company_id TEXT,
  company_name TEXT,
  work_date TEXT NOT NULL,
  check_in_time TEXT,
  check_out_time TEXT,
  status TEXT DEFAULT 'present',
  work_hours_minutes INTEGER,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT attendances_pkey PRIMARY KEY (id),
  CONSTRAINT attendances_staff_id_work_date_key UNIQUE (staff_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_attendances_staff_date ON attendances (staff_id, work_date);
CREATE INDEX IF NOT EXISTS idx_attendances_work_date ON attendances (work_date);

-- ── audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT NOT NULL,
  user_id TEXT,
  user_name TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details TEXT,
  ip_address TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  actor_name TEXT,
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC);

-- ── backup_restore_runs
CREATE TABLE IF NOT EXISTS backup_restore_runs (
  id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  meta TEXT DEFAULT '{}',
  preview TEXT DEFAULT '[]',
  result_summary TEXT DEFAULT '{}',
  log_lines TEXT DEFAULT '{}',
  total_tables INTEGER DEFAULT 0,
  total_rows INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running',
  requested_by TEXT,
  requested_by_name TEXT,
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  CONSTRAINT backup_restore_runs_pkey PRIMARY KEY (id),
  CONSTRAINT backup_restore_runs_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT backup_restore_runs_status_check CHECK ((status  IN ('preview', 'running', 'completed', 'failed')))
);

CREATE INDEX IF NOT EXISTS idx_backup_restore_runs_started ON backup_restore_runs (started_at DESC);

-- ── board_post_comments
CREATE TABLE IF NOT EXISTS board_post_comments (
  id TEXT NOT NULL,
  post_id TEXT,
  author_id TEXT,
  author_name TEXT,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  parent_comment_id TEXT,
  is_anonymous INTEGER DEFAULT 0,
  CONSTRAINT board_post_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES staff_members(id),
  CONSTRAINT board_post_comments_parent_comment_id_fkey FOREIGN KEY (parent_comment_id) REFERENCES board_post_comments(id) ON DELETE CASCADE,
  CONSTRAINT board_post_comments_pkey PRIMARY KEY (id),
  CONSTRAINT board_post_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES board_posts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_board_post_comments_parent_comment_id ON board_post_comments (parent_comment_id);

-- ── board_post_likes
CREATE TABLE IF NOT EXISTS board_post_likes (
  id TEXT NOT NULL,
  post_id TEXT,
  user_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT board_post_likes_pkey PRIMARY KEY (id),
  CONSTRAINT board_post_likes_post_id_user_id_key UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_board_post_likes_user_id ON board_post_likes (user_id);

-- ── board_post_reads
CREATE TABLE IF NOT EXISTS board_post_reads (
  id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  read_at TEXT DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT board_post_reads_pkey PRIMARY KEY (id),
  CONSTRAINT board_post_reads_post_id_fkey FOREIGN KEY (post_id) REFERENCES board_posts(id) ON DELETE CASCADE,
  CONSTRAINT board_post_reads_post_id_user_id_key UNIQUE (post_id, user_id),
  CONSTRAINT board_post_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES staff_members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_board_post_reads_post_id ON board_post_reads (post_id);
CREATE INDEX IF NOT EXISTS idx_board_post_reads_user_id ON board_post_reads (user_id);

-- ── board_posts
CREATE TABLE IF NOT EXISTS board_posts (
  id TEXT NOT NULL,
  company_id TEXT,
  board_type TEXT,
  title TEXT NOT NULL,
  content TEXT,
  author_id TEXT,
  author_name TEXT,
  company TEXT,
  views INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  is_anonymous INTEGER DEFAULT 0,
  poll TEXT,
  poll_votes TEXT DEFAULT '{}',
  likes_count INTEGER DEFAULT 0,
  status TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  board_id TEXT,
  tags TEXT DEFAULT '[]',
  attachments TEXT DEFAULT '[]',
  is_pinned INTEGER DEFAULT 0,
  scheduled_publish_at TEXT,
  schedule_date TEXT,
  schedule_time TEXT,
  schedule_room TEXT,
  patient_name TEXT,
  surgery_fasting INTEGER DEFAULT 0,
  surgery_inpatient INTEGER DEFAULT 0,
  surgery_guardian INTEGER DEFAULT 0,
  surgery_caregiver INTEGER DEFAULT 0,
  surgery_transfusion INTEGER DEFAULT 0,
  mri_contrast_required INTEGER DEFAULT 0,
  CONSTRAINT board_posts_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT board_posts_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_board_posts_board_id_created_at ON board_posts (board_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_board_posts_board_type_created_desc ON board_posts (board_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_board_posts_company_id ON board_posts (company_id);
CREATE INDEX IF NOT EXISTS idx_board_posts_company_id_board_type_created_at ON board_posts (company_id, board_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_board_posts_schedule_date ON board_posts (schedule_date);

-- ── certificate_issuances
CREATE TABLE IF NOT EXISTS certificate_issuances (
  id TEXT NOT NULL,
  staff_id TEXT,
  cert_type TEXT NOT NULL,
  serial_no TEXT,
  purpose TEXT,
  issued_by TEXT,
  issued_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT certificate_issuances_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT certificate_issuances_pkey PRIMARY KEY (id),
  CONSTRAINT certificate_issuances_serial_no_key UNIQUE (serial_no),
  CONSTRAINT certificate_issuances_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff_members(id) ON DELETE CASCADE
);


-- ── chat_messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT NOT NULL,
  room_id TEXT,
  sender_id TEXT,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'text',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chat_messages_pkey PRIMARY KEY (id),
  CONSTRAINT chat_messages_room_id_fkey FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
  CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES staff_members(id)
);


-- ── chat_push_jobs
CREATE TABLE IF NOT EXISTS chat_push_jobs (
  id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  sender_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  processing_started_at TEXT,
  processed_at TEXT,
  attempt_count INTEGER DEFAULT 0,
  last_error TEXT,
  next_attempt_at TEXT DEFAULT CURRENT_TIMESTAMP,
  dead_lettered_at TEXT,
  CONSTRAINT chat_push_jobs_message_id_fkey FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT chat_push_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT chat_push_jobs_room_id_fkey FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
  CONSTRAINT chat_push_jobs_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES staff_members(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_push_jobs_message_id ON chat_push_jobs (message_id);
CREATE INDEX IF NOT EXISTS idx_chat_push_jobs_pending ON chat_push_jobs (processed_at, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_push_jobs_processing_started_at ON chat_push_jobs (processing_started_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_push_jobs_ready ON chat_push_jobs (next_attempt_at, created_at) WHERE ((processed_at IS NULL) AND (dead_lettered_at IS NULL));

-- ── chat_room_favorites
CREATE TABLE IF NOT EXISTS chat_room_favorites (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chat_room_favorites_pkey PRIMARY KEY (id),
  CONSTRAINT chat_room_favorites_user_id_room_id_key UNIQUE (user_id, room_id)
);


-- ── chat_room_prefs
CREATE TABLE IF NOT EXISTS chat_room_prefs (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  pinned INTEGER DEFAULT 0,
  hidden INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chat_room_prefs_pkey PRIMARY KEY (id),
  CONSTRAINT chat_room_prefs_user_id_fkey FOREIGN KEY (user_id) REFERENCES staff_members(id) ON DELETE CASCADE,
  CONSTRAINT chat_room_prefs_user_id_room_id_key UNIQUE (user_id, room_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_room_prefs_room_id ON chat_room_prefs (room_id);
CREATE INDEX IF NOT EXISTS idx_chat_room_prefs_user_id ON chat_room_prefs (user_id);

-- ── chat_rooms
CREATE TABLE IF NOT EXISTS chat_rooms (
  id TEXT NOT NULL,
  name TEXT,
  type TEXT,
  members TEXT,
  is_announcement INTEGER DEFAULT 0,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_message_at TEXT,
  last_message TEXT,
  last_message_preview TEXT,
  member_ids TEXT DEFAULT '{}',
  CONSTRAINT chat_rooms_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_chat_rooms_last_message_at_desc ON chat_rooms (last_message_at DESC, created_at DESC);

-- ── companies
CREATE TABLE IF NOT EXISTS companies (
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  mso_id TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  ceo_name TEXT,
  business_no TEXT,
  address TEXT,
  phone TEXT,
  memo TEXT,
  payment_day INTEGER DEFAULT 7,
  business_number TEXT,
  seal_url TEXT,
  leave_policy TEXT DEFAULT '입사일',
  unused_leave_compensation INTEGER DEFAULT 0,
  fiscal_year_start_month INTEGER DEFAULT 1,
  CONSTRAINT chk_companies_fiscal_month CHECK (((fiscal_year_start_month >= 1) AND (fiscal_year_start_month <= 12))),
  CONSTRAINT chk_companies_leave_policy CHECK ((leave_policy  IN ('입사일', '회계연도'))),
  CONSTRAINT companies_mso_id_fkey FOREIGN KEY (mso_id) REFERENCES companies(id),
  CONSTRAINT companies_name_key UNIQUE (name),
  CONSTRAINT companies_payment_day_check CHECK (((payment_day >= 1) AND (payment_day <= 31))),
  CONSTRAINT companies_pkey PRIMARY KEY (id),
  CONSTRAINT companies_type_check CHECK (((type)  IN ('MSO', 'HOSPITAL', 'CLINIC')))
);


-- ── company_expenses
CREATE TABLE IF NOT EXISTS company_expenses (
  id TEXT NOT NULL,
  company TEXT NOT NULL,
  year_month TEXT NOT NULL,
  rent REAL DEFAULT 0,
  materials REAL DEFAULT 0,
  utilities REAL DEFAULT 0,
  others REAL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT company_expenses_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_expenses_company_month ON company_expenses (company, year_month);

-- ── company_holidays
CREATE TABLE IF NOT EXISTS company_holidays (
  id TEXT NOT NULL,
  company_name TEXT DEFAULT '전체',
  holiday_date TEXT NOT NULL,
  name TEXT NOT NULL,
  note TEXT,
  created_by TEXT,
  created_by_name TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT company_holidays_company_date_unique UNIQUE (company_name, holiday_date),
  CONSTRAINT company_holidays_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_company_holidays_scope_date ON company_holidays (company_name, holiday_date);

-- ── contract_templates
CREATE TABLE IF NOT EXISTS contract_templates (
  id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  template_content TEXT,
  seal_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT contract_templates_company_name_key UNIQUE (company_name),
  CONSTRAINT contract_templates_pkey PRIMARY KEY (id)
);


-- ── corporate_card_transactions
CREATE TABLE IF NOT EXISTS corporate_card_transactions (
  id TEXT NOT NULL,
  card_holder_id TEXT,
  transaction_date TEXT NOT NULL,
  merchant TEXT,
  category TEXT,
  amount INTEGER DEFAULT 0,
  description TEXT,
  receipt_url TEXT,
  company_name TEXT DEFAULT '전체',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  card_id TEXT,
  CONSTRAINT corporate_card_transactions_card_id_fkey FOREIGN KEY (card_id) REFERENCES corporate_cards(id) ON DELETE SET NULL,
  CONSTRAINT corporate_card_transactions_category_check CHECK ((category  IN ('식비', '교통', '경비', '복리후생', '의료', '기타'))),
  CONSTRAINT corporate_card_transactions_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_card_category ON corporate_card_transactions (category);
CREATE INDEX IF NOT EXISTS idx_card_date ON corporate_card_transactions (transaction_date);

-- ── corporate_cards
CREATE TABLE IF NOT EXISTS corporate_cards (
  id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  card_nickname TEXT,
  last_four TEXT,
  issuer TEXT,
  holder_id TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT corporate_cards_pkey PRIMARY KEY (id),
  CONSTRAINT corporate_cards_status_check CHECK ((status  IN ('active', 'inactive')))
);

CREATE INDEX IF NOT EXISTS idx_corporate_cards_company ON corporate_cards (company_name);

-- ── daily_checks
CREATE TABLE IF NOT EXISTS daily_checks (
  id TEXT NOT NULL,
  closure_id TEXT,
  check_number TEXT NOT NULL,
  amount INTEGER NOT NULL,
  bank_name TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT daily_checks_closure_id_fkey FOREIGN KEY (closure_id) REFERENCES daily_closures(id) ON DELETE CASCADE,
  CONSTRAINT daily_checks_pkey PRIMARY KEY (id)
);


-- ── daily_closure_items
CREATE TABLE IF NOT EXISTS daily_closure_items (
  id TEXT NOT NULL,
  closure_id TEXT,
  patient_name TEXT,
  amount INTEGER NOT NULL,
  payment_method TEXT,
  receipt_type TEXT,
  memo TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT daily_closure_items_closure_id_fkey FOREIGN KEY (closure_id) REFERENCES daily_closures(id) ON DELETE CASCADE,
  CONSTRAINT daily_closure_items_pkey PRIMARY KEY (id)
);


-- ── daily_closures
CREATE TABLE IF NOT EXISTS daily_closures (
  id TEXT NOT NULL,
  company_id TEXT,
  date TEXT NOT NULL,
  total_amount INTEGER DEFAULT 0,
  petty_cash_start INTEGER DEFAULT 0,
  petty_cash_end INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft',
  created_by TEXT,
  memo TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT daily_closures_company_id_date_key UNIQUE (company_id, date),
  CONSTRAINT daily_closures_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT daily_closures_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff_members(id),
  CONSTRAINT daily_closures_pkey PRIMARY KEY (id)
);


-- ── delivery_confirmations
CREATE TABLE IF NOT EXISTS delivery_confirmations (
  id TEXT NOT NULL,
  doc_number TEXT,
  issue_date TEXT,
  supplier_name TEXT,
  supplier_rep TEXT,
  receiver_company TEXT,
  receiver_rep TEXT,
  delivery_date TEXT,
  notes TEXT,
  items TEXT DEFAULT '[]',
  total_amount REAL DEFAULT 0,
  created_by TEXT,
  created_by_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT delivery_confirmations_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_confirmations_created_at ON delivery_confirmations (created_at DESC);

-- ── department_private_inventory_items
CREATE TABLE IF NOT EXISTS department_private_inventory_items (
  id TEXT NOT NULL,
  company TEXT NOT NULL,
  company_id TEXT,
  department TEXT NOT NULL,
  item_name TEXT NOT NULL,
  category TEXT,
  unit TEXT DEFAULT 'EA',
  quantity INTEGER DEFAULT 0,
  min_quantity INTEGER DEFAULT 0,
  total_used INTEGER DEFAULT 0,
  memo TEXT,
  created_by TEXT,
  created_by_name TEXT,
  updated_by TEXT,
  updated_by_name TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT department_private_inventory_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT department_private_inventory_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT department_private_inventory_items_min_quantity_check CHECK ((min_quantity >= 0)),
  CONSTRAINT department_private_inventory_items_pkey PRIMARY KEY (id),
  CONSTRAINT department_private_inventory_items_quantity_check CHECK ((quantity >= 0)),
  CONSTRAINT department_private_inventory_items_total_used_check CHECK ((total_used >= 0)),
  CONSTRAINT department_private_inventory_items_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES staff_members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS department_private_inventory_scope_idx ON department_private_inventory_items (company_id, department, item_name);
CREATE UNIQUE INDEX IF NOT EXISTS department_private_inventory_unique_item ON department_private_inventory_items (lower(company), lower(department), lower(item_name));

-- ── department_private_inventory_logs
CREATE TABLE IF NOT EXISTS department_private_inventory_logs (
  id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  company TEXT NOT NULL,
  company_id TEXT,
  department TEXT NOT NULL,
  item_name TEXT NOT NULL,
  action TEXT DEFAULT 'consume',
  quantity INTEGER DEFAULT 0,
  prev_quantity INTEGER,
  next_quantity INTEGER,
  actor_id TEXT,
  actor_name TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT department_private_inventory_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT department_private_inventory_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT department_private_inventory_logs_item_id_fkey FOREIGN KEY (item_id) REFERENCES department_private_inventory_items(id) ON DELETE CASCADE,
  CONSTRAINT department_private_inventory_logs_pkey PRIMARY KEY (id),
  CONSTRAINT department_private_inventory_logs_quantity_check CHECK ((quantity >= 0))
);

CREATE INDEX IF NOT EXISTS department_private_inventory_logs_item_idx ON department_private_inventory_logs (item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS department_private_inventory_logs_scope_idx ON department_private_inventory_logs (company_id, department, created_at DESC);

-- ── device_inspections
CREATE TABLE IF NOT EXISTS device_inspections (
  id TEXT NOT NULL,
  device_id TEXT,
  device_name TEXT,
  inspected_at TEXT DEFAULT CURRENT_TIMESTAMP,
  inspector TEXT,
  result TEXT,
  notes TEXT,
  next_inspection_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT device_inspections_device_id_fkey FOREIGN KEY (device_id) REFERENCES medical_devices(id) ON DELETE CASCADE,
  CONSTRAINT device_inspections_pkey PRIMARY KEY (id)
);


-- ── discharge_reviews
CREATE TABLE IF NOT EXISTS discharge_reviews (
  id TEXT NOT NULL,
  patient_name TEXT NOT NULL,
  department TEXT NOT NULL,
  admission_date TEXT NOT NULL,
  discharge_date TEXT NOT NULL,
  diagnosis TEXT DEFAULT '',
  items TEXT DEFAULT '[]',
  status TEXT DEFAULT 'pending',
  reviewer_name TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  ai_analysis TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  chart_data TEXT DEFAULT '',
  template_id TEXT DEFAULT '',
  birth_date TEXT DEFAULT '',
  gender TEXT DEFAULT '',
  insurance_type TEXT DEFAULT '',
  surgery_name TEXT DEFAULT '',
  surgery_date TEXT DEFAULT '',
  room_grade TEXT DEFAULT '',
  doctor_name TEXT DEFAULT '',
  comorbidities TEXT DEFAULT '',
  admission_route TEXT DEFAULT '',
  discharge_type TEXT DEFAULT '',
  drg_code TEXT DEFAULT '',
  disease_codes TEXT DEFAULT '',
  CONSTRAINT discharge_reviews_pkey PRIMARY KEY (id)
);


-- ── discharge_templates
CREATE TABLE IF NOT EXISTS discharge_templates (
  id TEXT DEFAULT 'default',
  items TEXT DEFAULT '[]',
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  title TEXT DEFAULT '',
  CONSTRAINT discharge_templates_pkey PRIMARY KEY (id)
);


-- ── document_repository
CREATE TABLE IF NOT EXISTS document_repository (
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  content TEXT,
  file_url TEXT,
  version INTEGER DEFAULT 1,
  company_name TEXT DEFAULT '전체',
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT document_repository_category_check CHECK ((category  IN ('규정', '양식', '계약서', '기타'))),
  CONSTRAINT document_repository_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_document_repo_category ON document_repository (category);
CREATE INDEX IF NOT EXISTS idx_document_repo_company ON document_repository (company_name);

-- ── document_versions
CREATE TABLE IF NOT EXISTS document_versions (
  id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  content TEXT,
  file_url TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT document_versions_document_id_fkey FOREIGN KEY (document_id) REFERENCES document_repository(id) ON DELETE CASCADE,
  CONSTRAINT document_versions_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_document_versions_doc ON document_versions (document_id);

-- ── education_records
CREATE TABLE IF NOT EXISTS education_records (
  id TEXT NOT NULL,
  staff_id TEXT,
  education_name TEXT NOT NULL,
  deadline TEXT,
  completed_at TEXT,
  status TEXT DEFAULT '대기',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT education_records_pkey PRIMARY KEY (id),
  CONSTRAINT education_records_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff_members(id) ON DELETE CASCADE
);


-- ── employment_contracts
CREATE TABLE IF NOT EXISTS employment_contracts (
  id TEXT NOT NULL,
  staff_id TEXT,
  contract_type TEXT,
  status TEXT DEFAULT '서명대기',
  base_salary INTEGER DEFAULT 0,
  meal_allowance INTEGER DEFAULT 0,
  vehicle_allowance INTEGER DEFAULT 0,
  childcare_allowance INTEGER DEFAULT 0,
  position_allowance INTEGER DEFAULT 0,
  research_allowance INTEGER DEFAULT 0,
  other_taxfree INTEGER DEFAULT 0,
  effective_date TEXT,
  probation_months INTEGER DEFAULT 3,
  probation_percent INTEGER DEFAULT 90,
  payment_day INTEGER DEFAULT 7,
  content TEXT,
  working_hours_per_week REAL DEFAULT 40,
  working_days_per_week INTEGER DEFAULT 5,
  shift_start_time TEXT DEFAULT '09:00:00',
  shift_end_time TEXT DEFAULT '18:00:00',
  break_start_time TEXT DEFAULT '12:00:00',
  break_end_time TEXT DEFAULT '13:00:00',
  signature_data TEXT,
  requested_at TEXT DEFAULT CURRENT_TIMESTAMP,
  signed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  start_date TEXT,
  CONSTRAINT employment_contracts_pkey PRIMARY KEY (id),
  CONSTRAINT employment_contracts_staff_id_contract_type_key UNIQUE (staff_id, contract_type),
  CONSTRAINT employment_contracts_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff_members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_contracts_staff_id ON employment_contracts (staff_id);

-- ── freelancer_payments
CREATE TABLE IF NOT EXISTS freelancer_payments (
  id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  year_month TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  work_type TEXT,
  payment_date TEXT NOT NULL,
  supply_amount INTEGER DEFAULT 0,
  tax_rate REAL DEFAULT 3.30,
  withholding_tax INTEGER DEFAULT 0,
  note TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT freelancer_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT freelancer_payments_pkey PRIMARY KEY (id),
  CONSTRAINT freelancer_payments_supply_amount_check CHECK ((supply_amount >= 0))
);

CREATE INDEX IF NOT EXISTS idx_freelancer_payments_company_month ON freelancer_payments (company_name, year_month, payment_date DESC);

-- ── generated_reports
CREATE TABLE IF NOT EXISTS generated_reports (
  id TEXT NOT NULL,
  schedule_id TEXT,
  report_type TEXT NOT NULL,
  period TEXT NOT NULL,
  status TEXT DEFAULT 'completed',
  summary TEXT DEFAULT '{}',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT generated_reports_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_generated_reports_schedule_created ON generated_reports (schedule_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_reports_type_period ON generated_reports (report_type, period);

-- ── handover_notes
CREATE TABLE IF NOT EXISTS handover_notes (
  id TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  shift TEXT NOT NULL,
  priority TEXT DEFAULT 'Normal',
  is_completed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT handover_notes_pkey PRIMARY KEY (id)
);


-- ── health_checkups
CREATE TABLE IF NOT EXISTS health_checkups (
  id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  staff_name TEXT,
  company TEXT,
  department TEXT,
  checkup_type TEXT,
  scheduled_date TEXT,
  completed_date TEXT,
  status TEXT DEFAULT '예정',
  hospital TEXT,
  result TEXT,
  memo TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT health_checkups_pkey PRIMARY KEY (id)
);


-- ── incident_reports
CREATE TABLE IF NOT EXISTS incident_reports (
  id TEXT NOT NULL,
  incident_date TEXT,
  incident_time TEXT,
  location TEXT,
  type TEXT,
  severity TEXT,
  description TEXT,
  involved_persons TEXT,
  immediate_action TEXT,
  root_cause TEXT,
  preventive_measures TEXT,
  reporter_id TEXT,
  reporter_name TEXT,
  status TEXT DEFAULT '보고완료',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT incident_reports_pkey PRIMARY KEY (id)
);


-- ── inventory
CREATE TABLE IF NOT EXISTS inventory (
  id TEXT NOT NULL,
  company_id TEXT,
  company TEXT,
  category TEXT DEFAULT '일반',
  item_name TEXT NOT NULL,
  quantity INTEGER DEFAULT 0,
  min_quantity INTEGER DEFAULT 5,
  unit_price INTEGER DEFAULT 0,
  expiry_date TEXT,
  lot_number TEXT,
  is_udi INTEGER DEFAULT 0,
  udi_code TEXT,
  location TEXT,
  supplier_id TEXT,
  last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
  stock INTEGER DEFAULT 0,
  supplier_name TEXT,
  insurance_code TEXT,
  spec TEXT,
  department TEXT,
  safety_stock INTEGER DEFAULT 0,
  supplier TEXT,
  barcode TEXT,
  expiration_date TEXT,
  price INTEGER DEFAULT 0,
  serial_number TEXT,
  name TEXT,
  min_stock INTEGER DEFAULT 10,
  CONSTRAINT inventory_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT inventory_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_company_department ON inventory (company_id, department);
CREATE INDEX IF NOT EXISTS idx_inventory_company_id ON inventory (company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_company_id_item_name ON inventory (company_id, item_name);
CREATE INDEX IF NOT EXISTS idx_inventory_location ON inventory (location);
CREATE INDEX IF NOT EXISTS idx_inventory_lot_number ON inventory (lot_number);

-- ── inventory_categories
CREATE TABLE IF NOT EXISTS inventory_categories (
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_id TEXT,
  description TEXT,
  color TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT inventory_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES inventory_categories(id) ON DELETE CASCADE,
  CONSTRAINT inventory_categories_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_categories_parent_id ON inventory_categories (parent_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_categories_parent_name ON inventory_categories (COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'), lower(name));

-- ── inventory_closing_snapshots
CREATE TABLE IF NOT EXISTS inventory_closing_snapshots (
  id TEXT NOT NULL,
  closing_month TEXT NOT NULL,
  snapshot_date TEXT,
  company TEXT,
  company_id TEXT,
  status TEXT DEFAULT 'locked',
  item_count INTEGER DEFAULT 0,
  total_quantity REAL DEFAULT 0,
  total_value REAL DEFAULT 0,
  summary TEXT DEFAULT '{}',
  items TEXT DEFAULT '[]',
  created_by_id TEXT,
  created_by_name TEXT,
  closed_at TEXT DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT inventory_closing_snapshots_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  CONSTRAINT inventory_closing_snapshots_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT inventory_closing_snapshots_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_closing_snapshots_company_month ON inventory_closing_snapshots (company, closing_month DESC);

-- ── inventory_cost_entries
CREATE TABLE IF NOT EXISTS inventory_cost_entries (
  id TEXT NOT NULL,
  purchase_order_id TEXT,
  approval_id TEXT,
  inventory_item_id TEXT,
  order_item_index INTEGER DEFAULT 0,
  item_name TEXT NOT NULL,
  company_id TEXT,
  company_name TEXT,
  department TEXT,
  supplier_id TEXT,
  supplier_name TEXT,
  qty_ordered REAL DEFAULT 0,
  qty_received REAL DEFAULT 0,
  qty_rejected REAL DEFAULT 0,
  qty_pending REAL DEFAULT 0,
  unit_price REAL DEFAULT 0,
  supply_amount REAL DEFAULT 0,
  vat_amount REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  cost_center TEXT,
  budget_item TEXT,
  account_code TEXT,
  posted_status TEXT DEFAULT 'posted',
  occurred_at TEXT DEFAULT CURRENT_TIMESTAMP,
  posted_at TEXT,
  posted_by_id TEXT,
  posted_by_name TEXT,
  idempotency_key TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT inventory_cost_entries_approval_id_fkey FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE SET NULL,
  CONSTRAINT inventory_cost_entries_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  CONSTRAINT inventory_cost_entries_idempotency_key_key UNIQUE (idempotency_key),
  CONSTRAINT inventory_cost_entries_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES inventory(id) ON DELETE SET NULL,
  CONSTRAINT inventory_cost_entries_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_cost_entries_posted_by_id_fkey FOREIGN KEY (posted_by_id) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT inventory_cost_entries_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL,
  CONSTRAINT inventory_cost_entries_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_cost_entries_company_month ON inventory_cost_entries (company_name, occurred_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_cost_entries_idempotency_key ON inventory_cost_entries (idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_inventory_cost_entries_purchase_order ON inventory_cost_entries (purchase_order_id);

-- ── inventory_count_sessions
CREATE TABLE IF NOT EXISTS inventory_count_sessions (
  id TEXT NOT NULL,
  conducted_by TEXT,
  conducted_name TEXT,
  total_items INTEGER DEFAULT 0,
  discrepancy_count INTEGER DEFAULT 0,
  report TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  company TEXT,
  company_id TEXT,
  department TEXT,
  CONSTRAINT inventory_count_sessions_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  CONSTRAINT inventory_count_sessions_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_count_sessions_created_at ON inventory_count_sessions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_count_sessions_scope_created_at ON inventory_count_sessions (company_id, department, created_at DESC);

-- ── inventory_logs
CREATE TABLE IF NOT EXISTS inventory_logs (
  id TEXT NOT NULL,
  item_id TEXT,
  type TEXT,
  quantity INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  inventory_id TEXT,
  change_type TEXT,
  prev_quantity INTEGER,
  next_quantity INTEGER,
  actor_name TEXT,
  company TEXT,
  company_id TEXT,
  department TEXT,
  notes TEXT,
  actor_id TEXT,
  approval_id TEXT,
  purchase_order_id TEXT,
  serial_number TEXT,
  lot_number TEXT,
  expiry_date TEXT,
  location TEXT,
  unit_price REAL,
  supplier_name TEXT,
  CONSTRAINT inventory_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT inventory_logs_approval_id_fkey FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE SET NULL,
  CONSTRAINT inventory_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT inventory_logs_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_logs_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_logs_approval_id ON inventory_logs (approval_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_company_department_created_at ON inventory_logs (company_id, department, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_company_id_created_at ON inventory_logs (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_lot_number ON inventory_logs (lot_number);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_purchase_order_id ON inventory_logs (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_scope_created_at ON inventory_logs (company_id, department, created_at DESC);

-- ── inventory_price_history
CREATE TABLE IF NOT EXISTS inventory_price_history (
  id TEXT NOT NULL,
  inventory_item_id TEXT NOT NULL,
  supplier_id TEXT,
  supplier_name TEXT,
  unit_price REAL DEFAULT 0,
  quantity INTEGER DEFAULT 0,
  total_amount REAL DEFAULT 0,
  source_type TEXT DEFAULT 'manual',
  recorded_at TEXT DEFAULT CURRENT_TIMESTAMP,
  recorded_by TEXT,
  purchase_order_id TEXT,
  notes TEXT,
  CONSTRAINT inventory_price_history_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES inventory(id) ON DELETE CASCADE,
  CONSTRAINT inventory_price_history_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_price_history_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL,
  CONSTRAINT inventory_price_history_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT inventory_price_history_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_price_history_item_recorded_at ON inventory_price_history (inventory_item_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_price_history_purchase_order_id ON inventory_price_history (purchase_order_id);

-- ── inventory_receipts
CREATE TABLE IF NOT EXISTS inventory_receipts (
  id TEXT NOT NULL,
  item_id TEXT,
  qty INTEGER NOT NULL,
  unit_price REAL,
  supplier_id TEXT,
  receipt_date TEXT DEFAULT CURRENT_TIMESTAMP,
  receipt_type TEXT DEFAULT '수동',
  lot_number TEXT,
  expiry_date TEXT,
  invoice_number TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT inventory_receipts_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT inventory_receipts_item_id_fkey FOREIGN KEY (item_id) REFERENCES inventory(id) ON DELETE RESTRICT,
  CONSTRAINT inventory_receipts_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_receipts_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
);


-- ── inventory_transfers
CREATE TABLE IF NOT EXISTS inventory_transfers (
  id TEXT NOT NULL,
  item_id TEXT,
  item_name TEXT,
  quantity INTEGER DEFAULT 0,
  from_company TEXT,
  from_department TEXT,
  to_company TEXT,
  to_department TEXT,
  reason TEXT,
  transferred_by TEXT,
  transferred_by_id TEXT,
  status TEXT DEFAULT '완료',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  approval_id TEXT,
  purchase_order_id TEXT,
  serial_number TEXT,
  CONSTRAINT inventory_transfers_approval_id_fkey FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE SET NULL,
  CONSTRAINT inventory_transfers_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_transfers_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_transfers_approval_id ON inventory_transfers (approval_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_created_at ON inventory_transfers (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_purchase_order_id ON inventory_transfers (purchase_order_id);

-- ── job_categories
CREATE TABLE IF NOT EXISTS job_categories (
  id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_medical_staff INTEGER DEFAULT 1,
  display_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT job_categories_code_key UNIQUE (code),
  CONSTRAINT job_categories_pkey PRIMARY KEY (id)
);


-- ── job_category_required_trainings
CREATE TABLE IF NOT EXISTS job_category_required_trainings (
  id TEXT NOT NULL,
  job_category_id TEXT,
  applies_to_all INTEGER DEFAULT 0,
  training_code TEXT NOT NULL,
  training_name TEXT NOT NULL,
  cycle_months INTEGER,
  mandatory INTEGER DEFAULT 1,
  obligation_type TEXT DEFAULT 'legal',
  legal_basis TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_job_category_required CHECK (((applies_to_all = true) OR (job_category_id IS NOT NULL))),
  CONSTRAINT chk_obligation_type CHECK ((obligation_type  IN ('legal', 'recommended'))),
  CONSTRAINT job_category_required_trainings_job_category_id_fkey FOREIGN KEY (job_category_id) REFERENCES job_categories(id),
  CONSTRAINT job_category_required_trainings_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_jcrt_applies_to_all ON job_category_required_trainings (applies_to_all);
CREATE INDEX IF NOT EXISTS idx_jcrt_job_category_id ON job_category_required_trainings (job_category_id);

-- ── leave_balances
CREATE TABLE IF NOT EXISTS leave_balances (
  id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  total_days REAL DEFAULT 0,
  used_days REAL DEFAULT 0,
  remaining_days REAL DEFAULT 0,
  expiry_date TEXT,
  expired_days REAL DEFAULT 0,
  expired_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  compensated_days REAL DEFAULT 0,
  compensated_at TEXT,
  CONSTRAINT leave_balances_pkey PRIMARY KEY (id),
  CONSTRAINT leave_balances_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff_members(id) ON DELETE CASCADE,
  CONSTRAINT leave_balances_staff_id_year_key UNIQUE (staff_id, year)
);

CREATE INDEX IF NOT EXISTS idx_leave_balances_expiry_date ON leave_balances (expiry_date);
CREATE INDEX IF NOT EXISTS idx_leave_balances_staff_id ON leave_balances (staff_id);

-- ── leave_requests
CREATE TABLE IF NOT EXISTS leave_requests (
  id TEXT NOT NULL,
  staff_id TEXT,
  leave_type TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reason TEXT,
  status TEXT DEFAULT '대기',
  approved_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  company_id TEXT,
  days REAL,
  CONSTRAINT leave_requests_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT leave_requests_pkey PRIMARY KEY (id),
  CONSTRAINT leave_requests_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff_members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_company_id ON leave_requests (company_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_staff_id ON leave_requests (staff_id);

-- ── medical_devices
CREATE TABLE IF NOT EXISTS medical_devices (
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  model TEXT,
  serial TEXT,
  category TEXT,
  location TEXT,
  cycle INTEGER DEFAULT 12,
  next_inspection_date TEXT,
  last_inspection_date TEXT,
  memo TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT medical_devices_pkey PRIMARY KEY (id)
);


-- ── message_bookmarks
CREATE TABLE IF NOT EXISTS message_bookmarks (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT message_bookmarks_message_id_fkey FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT message_bookmarks_pkey PRIMARY KEY (id),
  CONSTRAINT message_bookmarks_user_id_message_id_key UNIQUE (user_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_message_bookmarks_user_message ON message_bookmarks (user_id, message_id);

-- ── message_reactions
CREATE TABLE IF NOT EXISTS message_reactions (
  id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  emoji TEXT DEFAULT '👍',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT message_reactions_message_id_user_id_emoji_key UNIQUE (message_id, user_id, emoji),
  CONSTRAINT message_reactions_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_msg ON message_reactions (message_id);

-- ── message_reads
CREATE TABLE IF NOT EXISTS message_reads (
  id TEXT NOT NULL,
  message_id TEXT,
  reader_id TEXT,
  read_at TEXT DEFAULT CURRENT_TIMESTAMP,
  user_id TEXT,
  CONSTRAINT message_reads_message_id_fkey FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  CONSTRAINT message_reads_message_id_reader_id_key UNIQUE (message_id, reader_id),
  CONSTRAINT message_reads_pkey PRIMARY KEY (id),
  CONSTRAINT message_reads_reader_id_fkey FOREIGN KEY (reader_id) REFERENCES staff_members(id)
);


-- ── messages
CREATE TABLE IF NOT EXISTS messages (
  id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  sender_id TEXT,
  content TEXT,
  file_url TEXT,
  reply_to_id TEXT,
  is_deleted INTEGER DEFAULT 0,
  edited_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  file_size_bytes INTEGER,
  file_kind TEXT,
  file_name TEXT,
  album_id TEXT,
  album_index INTEGER,
  album_total INTEGER,
  message_type TEXT DEFAULT 'text',
  sender_name TEXT,
  CONSTRAINT messages_pkey PRIMARY KEY (id),
  CONSTRAINT messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_room ON messages (room_id);
CREATE INDEX IF NOT EXISTS idx_messages_room_created_id_desc ON messages (room_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_room_unread_count ON messages (room_id, created_at DESC) WHERE (is_deleted = false);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages (sender_id);

-- ── messenger_drive_links
CREATE TABLE IF NOT EXISTS messenger_drive_links (
  id TEXT NOT NULL,
  company_name TEXT DEFAULT '전체',
  room_id TEXT,
  name TEXT NOT NULL,
  url TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT messenger_drive_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT messenger_drive_links_pkey PRIMARY KEY (id),
  CONSTRAINT messenger_drive_links_room_id_fkey FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
  CONSTRAINT messenger_drive_links_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES staff_members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_messenger_drive_links_company ON messenger_drive_links (company_name, sort_order, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messenger_drive_links_room ON messenger_drive_links (room_id);

-- ── monthly_off_quota
CREATE TABLE IF NOT EXISTS monthly_off_quota (
  id TEXT NOT NULL,
  company TEXT NOT NULL,
  year_month TEXT NOT NULL,
  default_off_days INTEGER DEFAULT 8,
  staff_overrides TEXT DEFAULT '{}',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT monthly_off_quota_company_year_month_key UNIQUE (company, year_month),
  CONSTRAINT monthly_off_quota_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_monthly_off_quota_company ON monthly_off_quota (company);
CREATE INDEX IF NOT EXISTS idx_monthly_off_quota_year_month ON monthly_off_quota (year_month);

-- ── mri_templates
CREATE TABLE IF NOT EXISTS mri_templates (
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  body_part TEXT,
  CONSTRAINT mri_templates_pkey PRIMARY KEY (id)
);


-- ── notification_templates
CREATE TABLE IF NOT EXISTS notification_templates (
  id TEXT NOT NULL,
  template_type TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  variables TEXT DEFAULT '[]',
  is_active INTEGER DEFAULT 1,
  company_name TEXT DEFAULT '전체',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT notification_templates_pkey PRIMARY KEY (id),
  CONSTRAINT notification_templates_template_type_check CHECK ((template_type  IN ('급여명세', '휴가승인', '휴가반려', '입사안내', '퇴사안내', '기타')))
);


-- ── notifications
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT NOT NULL,
  user_id TEXT,
  type TEXT,
  title TEXT,
  body TEXT,
  metadata TEXT,
  read_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES staff_members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id);

-- ── official_doc_log
CREATE TABLE IF NOT EXISTS official_doc_log (
  id INTEGER NOT NULL,
  sent_date TEXT NOT NULL,
  doc_number TEXT DEFAULT '',
  title TEXT DEFAULT '',
  recipient TEXT DEFAULT '',
  manager TEXT DEFAULT '',
  is_received INTEGER DEFAULT 0,
  note TEXT DEFAULT '',
  company TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT official_doc_log_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_official_doc_log_company ON official_doc_log (company);
CREATE INDEX IF NOT EXISTS idx_official_doc_log_sent_date ON official_doc_log (sent_date DESC);

-- ── onboarding_checklists
CREATE TABLE IF NOT EXISTS onboarding_checklists (
  id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  checklist_type TEXT NOT NULL,
  items TEXT DEFAULT '[]',
  target_date TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT onboarding_checklists_checklist_type_check CHECK ((checklist_type  IN ('입사', '퇴사'))),
  CONSTRAINT onboarding_checklists_pkey PRIMARY KEY (id),
  CONSTRAINT onboarding_checklists_staff_id_checklist_type_key UNIQUE (staff_id, checklist_type)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_staff ON onboarding_checklists (staff_id);

-- ── op_check_templates
CREATE TABLE IF NOT EXISTS op_check_templates (
  id TEXT NOT NULL,
  company_id TEXT,
  company_name TEXT DEFAULT '전체',
  template_scope TEXT DEFAULT 'surgery',
  template_name TEXT NOT NULL,
  surgery_template_id TEXT,
  surgery_name TEXT,
  anesthesia_type TEXT,
  prep_items TEXT DEFAULT '[]',
  consumable_items TEXT DEFAULT '[]',
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_by TEXT,
  created_by_name TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT op_check_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT op_check_templates_pkey PRIMARY KEY (id),
  CONSTRAINT op_check_templates_scope_check CHECK ((template_scope  IN ('surgery', 'anesthesia')))
);

CREATE INDEX IF NOT EXISTS idx_op_check_templates_anesthesia ON op_check_templates (lower(COALESCE(anesthesia_type, '')));
CREATE INDEX IF NOT EXISTS idx_op_check_templates_company_scope ON op_check_templates (company_id, template_scope, is_active);
CREATE INDEX IF NOT EXISTS idx_op_check_templates_surgery_name ON op_check_templates (lower(COALESCE(surgery_name, '')));

-- ── op_patient_checks
CREATE TABLE IF NOT EXISTS op_patient_checks (
  id TEXT NOT NULL,
  schedule_post_id TEXT NOT NULL,
  company_id TEXT,
  company_name TEXT DEFAULT '전체',
  patient_name TEXT DEFAULT '',
  chart_no TEXT,
  surgery_name TEXT DEFAULT '',
  surgery_template_id TEXT,
  anesthesia_type TEXT,
  schedule_date TEXT,
  schedule_time TEXT,
  schedule_room TEXT,
  prep_items TEXT DEFAULT '[]',
  consumable_items TEXT DEFAULT '[]',
  notes TEXT,
  status TEXT DEFAULT '준비중',
  applied_template_ids TEXT DEFAULT '{}',
  created_by TEXT,
  created_by_name TEXT,
  updated_by TEXT,
  updated_by_name TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  surgery_started_at TEXT,
  surgery_ended_at TEXT,
  ward_message_sent_at TEXT,
  CONSTRAINT op_patient_checks_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT op_patient_checks_pkey PRIMARY KEY (id),
  CONSTRAINT op_patient_checks_schedule_post_id_key UNIQUE (schedule_post_id),
  CONSTRAINT op_patient_checks_status_check CHECK ((status  IN ('준비중', '준비완료', '수술중', '완료'))),
  CONSTRAINT op_patient_checks_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES staff_members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_op_patient_checks_company_date ON op_patient_checks (company_id, schedule_date DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_op_patient_checks_patient_name ON op_patient_checks (lower(patient_name));

-- ── org_teams
CREATE TABLE IF NOT EXISTS org_teams (
  id TEXT NOT NULL,
  company_name TEXT DEFAULT '전체',
  division TEXT NOT NULL,
  team_name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT org_teams_company_name_division_team_name_key UNIQUE (company_name, division, team_name),
  CONSTRAINT org_teams_division_check CHECK ((division  IN ('진료부', '간호부', '총무부'))),
  CONSTRAINT org_teams_pkey PRIMARY KEY (id)
);


-- ── payroll
CREATE TABLE IF NOT EXISTS payroll (
  id TEXT NOT NULL,
  company_id TEXT,
  staff_id TEXT,
  month TEXT NOT NULL,
  base_salary REAL NOT NULL,
  total_salary REAL NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payroll_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT payroll_company_id_staff_id_month_key UNIQUE (company_id, staff_id, month),
  CONSTRAINT payroll_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff_members(id) ON DELETE CASCADE,
  CONSTRAINT payroll_status_check CHECK ((status  IN ('DRAFT', 'CONFIRMED', 'PAID')))
);


-- ── payroll_approval_logs
CREATE TABLE IF NOT EXISTS payroll_approval_logs (
  id TEXT NOT NULL,
  company_name TEXT DEFAULT '전체',
  year_month TEXT NOT NULL,
  actor_id TEXT,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  comment TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payroll_approval_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT payroll_approval_logs_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_approval_logs_scope ON payroll_approval_logs (company_name, year_month, created_at DESC);

-- ── payroll_approval_workflows
CREATE TABLE IF NOT EXISTS payroll_approval_workflows (
  id TEXT NOT NULL,
  company_name TEXT DEFAULT '전체',
  year_month TEXT NOT NULL,
  step1_status TEXT DEFAULT '대기',
  step2_status TEXT DEFAULT '대기',
  step1_comment TEXT,
  step2_comment TEXT,
  step1_actor_id TEXT,
  step2_actor_id TEXT,
  step1_updated_at TEXT,
  step2_updated_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payroll_approval_workflows_company_name_year_month_key UNIQUE (company_name, year_month),
  CONSTRAINT payroll_approval_workflows_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_approval_workflows_step1_actor_id_fkey FOREIGN KEY (step1_actor_id) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT payroll_approval_workflows_step1_status_check CHECK ((step1_status  IN ('대기', '승인', '보류'))),
  CONSTRAINT payroll_approval_workflows_step2_actor_id_fkey FOREIGN KEY (step2_actor_id) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT payroll_approval_workflows_step2_status_check CHECK ((step2_status  IN ('대기', '승인', '보류')))
);

CREATE INDEX IF NOT EXISTS idx_payroll_approval_workflows_scope ON payroll_approval_workflows (company_name, year_month);

-- ── payroll_bonus_items
CREATE TABLE IF NOT EXISTS payroll_bonus_items (
  id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  year_month TEXT NOT NULL,
  category TEXT DEFAULT '상여',
  amount INTEGER DEFAULT 0,
  note TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payroll_bonus_items_amount_check CHECK ((amount >= 0)),
  CONSTRAINT payroll_bonus_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT payroll_bonus_items_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_bonus_items_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff_members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payroll_bonus_items_company_month ON payroll_bonus_items (company_name, year_month, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_bonus_items_staff ON payroll_bonus_items (staff_id, year_month);

-- ── payroll_calendar_items
CREATE TABLE IF NOT EXISTS payroll_calendar_items (
  id TEXT NOT NULL,
  company_name TEXT DEFAULT '전체',
  year_month TEXT NOT NULL,
  title TEXT NOT NULL,
  due_date TEXT NOT NULL,
  owner_label TEXT NOT NULL,
  status TEXT DEFAULT '대기',
  sort_order INTEGER DEFAULT 0,
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payroll_calendar_items_company_name_year_month_title_key UNIQUE (company_name, year_month, title),
  CONSTRAINT payroll_calendar_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT payroll_calendar_items_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_calendar_items_status_check CHECK ((status  IN ('대기', '진행', '완료'))),
  CONSTRAINT payroll_calendar_items_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES staff_members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payroll_calendar_items_scope ON payroll_calendar_items (company_name, year_month, sort_order);

-- ── payroll_deduction_controls
CREATE TABLE IF NOT EXISTS payroll_deduction_controls (
  id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  deduction_type TEXT NOT NULL,
  monthly_amount INTEGER DEFAULT 0,
  balance INTEGER DEFAULT 0,
  note TEXT,
  is_active INTEGER DEFAULT 1,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payroll_deduction_controls_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT payroll_deduction_controls_monthly_amount_check CHECK ((monthly_amount >= 0)),
  CONSTRAINT payroll_deduction_controls_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_deduction_controls_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff_members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payroll_deduction_controls_company ON payroll_deduction_controls (company_name, is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_deduction_controls_staff ON payroll_deduction_controls (staff_id, is_active);

-- ── payroll_locks
CREATE TABLE IF NOT EXISTS payroll_locks (
  id TEXT NOT NULL,
  year_month TEXT NOT NULL,
  company_name TEXT DEFAULT '전체',
  locked_at TEXT DEFAULT CURRENT_TIMESTAMP,
  locked_by TEXT,
  memo TEXT,
  reopen_requested_at TEXT,
  reopen_requested_by TEXT,
  reopen_request_comment TEXT,
  reopen_request_status TEXT,
  reopen_reviewed_at TEXT,
  reopen_reviewed_by TEXT,
  reopen_review_comment TEXT,
  CONSTRAINT payroll_locks_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_locks_reopen_requested_by_fkey FOREIGN KEY (reopen_requested_by) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT payroll_locks_reopen_reviewed_by_fkey FOREIGN KEY (reopen_reviewed_by) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT payroll_locks_year_month_company_name_key UNIQUE (year_month, company_name)
);

CREATE INDEX IF NOT EXISTS idx_payroll_locks_reopen_status ON payroll_locks (year_month, company_name, reopen_request_status);

-- ── payroll_policy_versions
CREATE TABLE IF NOT EXISTS payroll_policy_versions (
  id TEXT NOT NULL,
  company_name TEXT DEFAULT '전체',
  effective_year INTEGER NOT NULL,
  version_label TEXT NOT NULL,
  snapshot TEXT DEFAULT '{}',
  note TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payroll_policy_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT payroll_policy_versions_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_policy_versions_scope ON payroll_policy_versions (company_name, effective_year, created_at DESC);

-- ── payroll_records
CREATE TABLE IF NOT EXISTS payroll_records (
  id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  year_month TEXT NOT NULL,
  base_salary INTEGER DEFAULT 0,
  meal_allowance INTEGER DEFAULT 0,
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
  record_type TEXT DEFAULT 'regular',
  severance_pay INTEGER DEFAULT 0,
  settlement_reason TEXT,
  settlement_date TEXT,
  advance_pay INTEGER DEFAULT 0,
  deduction_detail TEXT DEFAULT '{}',
  night_duty_allowance INTEGER DEFAULT 0,
  gross_pay REAL DEFAULT 0,
  national_pension REAL DEFAULT 0,
  health_insurance REAL DEFAULT 0,
  long_term_care REAL DEFAULT 0,
  employment_insurance REAL DEFAULT 0,
  income_tax REAL DEFAULT 0,
  local_tax REAL DEFAULT 0,
  CONSTRAINT payroll_records_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_records_staff_id_year_month_key UNIQUE (staff_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_payroll_records_staff_ym ON payroll_records (staff_id, year_month);

-- ── payroll_retro_adjustments
CREATE TABLE IF NOT EXISTS payroll_retro_adjustments (
  id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  start_month TEXT NOT NULL,
  end_month TEXT NOT NULL,
  before_base INTEGER DEFAULT 0,
  after_base INTEGER DEFAULT 0,
  retro_total INTEGER DEFAULT 0,
  reason TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payroll_retro_adjustments_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT payroll_retro_adjustments_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_retro_adjustments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff_members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payroll_retro_adjustments_company ON payroll_retro_adjustments (company_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_retro_adjustments_staff ON payroll_retro_adjustments (staff_id, start_month, end_month);

-- ── personnel_appointments
CREATE TABLE IF NOT EXISTS personnel_appointments (
  id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  staff_name TEXT,
  company TEXT,
  order_type TEXT,
  effective_date TEXT,
  before_dept TEXT,
  after_dept TEXT,
  before_position TEXT,
  after_position TEXT,
  before_role TEXT,
  after_role TEXT,
  reason TEXT,
  memo TEXT,
  status TEXT DEFAULT '발령완료',
  issued_by TEXT,
  issued_at TEXT DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  new_department TEXT,
  CONSTRAINT personnel_appointments_pkey PRIMARY KEY (id)
);


-- ── pinned_messages
CREATE TABLE IF NOT EXISTS pinned_messages (
  id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  pinned_by TEXT,
  pinned_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pinned_messages_pkey PRIMARY KEY (id),
  CONSTRAINT pinned_messages_room_id_message_id_key UNIQUE (room_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_pinned_room ON pinned_messages (room_id);

-- ── poll_votes
CREATE TABLE IF NOT EXISTS poll_votes (
  id TEXT NOT NULL,
  poll_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  option_index INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT poll_votes_pkey PRIMARY KEY (id),
  CONSTRAINT poll_votes_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
  CONSTRAINT poll_votes_poll_id_user_id_key UNIQUE (poll_id, user_id)
);


-- ── polls
CREATE TABLE IF NOT EXISTS polls (
  id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  message_id TEXT,
  creator_id TEXT,
  question TEXT NOT NULL,
  options TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT polls_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_polls_room ON polls (room_id);

-- ── popups
CREATE TABLE IF NOT EXISTS popups (
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  media_url TEXT,
  media_type TEXT DEFAULT 'image',
  width INTEGER DEFAULT 400,
  height INTEGER DEFAULT 500,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  link_url TEXT,
  start_at TEXT,
  end_at TEXT,
  priority INTEGER DEFAULT 0,
  CONSTRAINT popups_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_popups_active_created ON popups (is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_popups_schedule_priority ON popups (is_active, priority DESC, created_at DESC);

-- ── posts
CREATE TABLE IF NOT EXISTS posts (
  id TEXT NOT NULL,
  board_type TEXT DEFAULT '공지사항',
  title TEXT NOT NULL,
  content TEXT,
  author_id TEXT,
  author_name TEXT,
  company TEXT,
  views INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  company_id TEXT,
  CONSTRAINT posts_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT posts_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_posts_company_id_created_at ON posts (company_id, created_at DESC);

-- ── purchase_orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT NOT NULL,
  supplier_id TEXT,
  items TEXT NOT NULL,
  status TEXT DEFAULT '대기',
  total_amount REAL,
  notes TEXT,
  created_by TEXT,
  approved_by TEXT,
  approved_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  supplier_name TEXT,
  expected_delivery_date TEXT,
  ordered_at TEXT,
  received_at TEXT,
  received_by_id TEXT,
  received_by_name TEXT,
  inspected_at TEXT,
  inspected_by_id TEXT,
  inspected_by_name TEXT,
  inspection_status TEXT,
  received_qty REAL DEFAULT 0,
  rejected_qty REAL DEFAULT 0,
  received_items TEXT DEFAULT '[]',
  closed_at TEXT,
  closed_by_id TEXT,
  closed_by_name TEXT,
  expense_status TEXT DEFAULT 'pending',
  expense_posted_at TEXT,
  expense_posted_by_id TEXT,
  expense_posted_by_name TEXT,
  expense_total_amount REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  invoice_no TEXT,
  invoice_date TEXT,
  payment_status TEXT DEFAULT 'unpaid',
  payment_due_date TEXT,
  cost_center TEXT,
  budget_department TEXT,
  account_code TEXT,
  source_supply_approval_id TEXT,
  source_supply_request_index INTEGER,
  requester_company TEXT,
  requester_department TEXT,
  CONSTRAINT purchase_orders_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT purchase_orders_closed_by_id_fkey FOREIGN KEY (closed_by_id) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT purchase_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT purchase_orders_expense_posted_by_id_fkey FOREIGN KEY (expense_posted_by_id) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT purchase_orders_inspected_by_id_fkey FOREIGN KEY (inspected_by_id) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT purchase_orders_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_orders_received_by_id_fkey FOREIGN KEY (received_by_id) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT purchase_orders_source_supply_approval_id_fkey FOREIGN KEY (source_supply_approval_id) REFERENCES approvals(id) ON DELETE SET NULL,
  CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_expense_status ON purchase_orders (expense_status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_inspection_status ON purchase_orders (inspection_status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_source_supply_approval ON purchase_orders (source_supply_approval_id, source_supply_request_index);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders (status);

-- ── push_subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT NOT NULL,
  staff_id TEXT,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  fcm_token TEXT,
  device_id TEXT,
  platform TEXT,
  user_agent TEXT,
  CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_fcm_token ON push_subscriptions (fcm_token) WHERE (fcm_token IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_fcm_token_unique ON push_subscriptions (fcm_token) WHERE (fcm_token IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_staff_device_unique ON push_subscriptions (staff_id, device_id) WHERE ((staff_id IS NOT NULL) AND (device_id IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_staff_endpoint ON push_subscriptions (staff_id, endpoint);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_staff_id ON push_subscriptions (staff_id);

-- ── report_schedules
CREATE TABLE IF NOT EXISTS report_schedules (
  id TEXT NOT NULL,
  company_id TEXT,
  report_type TEXT NOT NULL,
  schedule_cron TEXT,
  recipients TEXT DEFAULT '[]',
  enabled INTEGER DEFAULT 1,
  last_generated_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT report_schedules_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_report_schedules_enabled ON report_schedules (enabled, report_type);

-- ── retirement_pensions
CREATE TABLE IF NOT EXISTS retirement_pensions (
  id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  staff_name TEXT,
  pension_type TEXT DEFAULT 'unregistered',
  joined_date TEXT,
  account_number TEXT,
  fund_name TEXT,
  monthly_contribution REAL DEFAULT 0,
  total_accumulated REAL DEFAULT 0,
  memo TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT retirement_pensions_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_retirement_pensions_staff_id ON retirement_pensions (staff_id);
CREATE INDEX IF NOT EXISTS idx_retirement_pensions_type ON retirement_pensions (pension_type);

-- ── reward_discipline
CREATE TABLE IF NOT EXISTS reward_discipline (
  id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  staff_name TEXT,
  company TEXT,
  department TEXT,
  category TEXT,
  type TEXT,
  date TEXT,
  reason TEXT,
  detail TEXT,
  amount REAL DEFAULT 0,
  committee_date TEXT,
  committee_members TEXT,
  committee_result TEXT,
  memo TEXT,
  issued_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT reward_discipline_category_check CHECK ((category  IN ('포상', '징계'))),
  CONSTRAINT reward_discipline_pkey PRIMARY KEY (id)
);


-- ── room_notification_settings
CREATE TABLE IF NOT EXISTS room_notification_settings (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  notifications_enabled INTEGER DEFAULT 1,
  CONSTRAINT room_notification_settings_pkey PRIMARY KEY (id),
  CONSTRAINT room_notification_settings_user_id_room_id_key UNIQUE (user_id, room_id)
);


-- ── room_read_cursors
CREATE TABLE IF NOT EXISTS room_read_cursors (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  last_read_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT room_read_cursors_pkey PRIMARY KEY (id),
  CONSTRAINT room_read_cursors_user_id_room_id_key UNIQUE (user_id, room_id)
);

CREATE INDEX IF NOT EXISTS idx_room_read_cursors_room_user ON room_read_cursors (room_id, user_id);

-- ── salary_change_history
CREATE TABLE IF NOT EXISTS salary_change_history (
  id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  change_type TEXT NOT NULL,
  before_value INTEGER,
  after_value INTEGER,
  effective_date TEXT NOT NULL,
  reason TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  previous_salary REAL,
  CONSTRAINT salary_change_history_change_type_check CHECK ((change_type  IN ('base_salary', 'meal', 'meal_allowance', 'night_duty_allowance', 'vehicle', 'vehicle_allowance', 'childcare', 'childcare_allowance', 'research', 'research_allowance', 'other', 'other_taxfree', 'position_allowance', 'overtime_allowance', 'night_work_allowance', 'holiday_work_allowance', 'annual_leave_pay'))),
  CONSTRAINT salary_change_history_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_salary_change_date ON salary_change_history (effective_date);
CREATE INDEX IF NOT EXISTS idx_salary_change_staff ON salary_change_history (staff_id);
CREATE INDEX IF NOT EXISTS idx_salary_change_staff_date ON salary_change_history (staff_id, effective_date);

-- ── scheduled_messages
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  content TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  is_sent INTEGER DEFAULT 0,
  reply_to_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT scheduled_messages_pkey PRIMARY KEY (id),
  CONSTRAINT scheduled_messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL,
  CONSTRAINT scheduled_messages_room_id_fkey FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_sender ON scheduled_messages (sender_id, is_sent, scheduled_at);

-- ── shift_assignments
CREATE TABLE IF NOT EXISTS shift_assignments (
  id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  work_date TEXT NOT NULL,
  shift_id TEXT,
  company_name TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  shift_name TEXT,
  CONSTRAINT shift_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT shift_assignments_staff_id_work_date_key UNIQUE (staff_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_shift_assignments_staff ON shift_assignments (staff_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_work_date ON shift_assignments (work_date);

-- ── staff_certifications
CREATE TABLE IF NOT EXISTS staff_certifications (
  id TEXT NOT NULL,
  staff_id TEXT,
  name TEXT NOT NULL,
  issuer TEXT,
  issue_date TEXT,
  expiry_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT staff_certifications_pkey PRIMARY KEY (id),
  CONSTRAINT staff_certifications_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff_members(id) ON DELETE CASCADE
);


-- ── staff_evaluations
CREATE TABLE IF NOT EXISTS staff_evaluations (
  id TEXT NOT NULL,
  staff_id TEXT,
  evaluator_id TEXT,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  score INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT staff_evaluations_evaluator_id_fkey FOREIGN KEY (evaluator_id) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT staff_evaluations_pkey PRIMARY KEY (id),
  CONSTRAINT staff_evaluations_score_check CHECK (((score >= 1) AND (score <= 5))),
  CONSTRAINT staff_evaluations_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff_members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_staff_evaluations_staff_id ON staff_evaluations (staff_id);

-- ── staff_job_categories
CREATE TABLE IF NOT EXISTS staff_job_categories (
  id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  job_category_id TEXT NOT NULL,
  is_primary INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT staff_job_categories_job_category_id_fkey FOREIGN KEY (job_category_id) REFERENCES job_categories(id),
  CONSTRAINT staff_job_categories_pkey PRIMARY KEY (id),
  CONSTRAINT staff_job_categories_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff_members(id) ON DELETE CASCADE,
  CONSTRAINT staff_job_categories_staff_id_job_category_id_key UNIQUE (staff_id, job_category_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_job_categories_job_category_id ON staff_job_categories (job_category_id);
CREATE INDEX IF NOT EXISTS idx_staff_job_categories_staff_id ON staff_job_categories (staff_id);

-- ── staff_licenses
CREATE TABLE IF NOT EXISTS staff_licenses (
  id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  license_name TEXT,
  license_number TEXT,
  issued_date TEXT,
  expiry_date TEXT,
  issuing_body TEXT,
  memo TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  license_type TEXT,
  is_primary INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  renewed_date TEXT,
  attachment_url TEXT,
  copy_url TEXT,
  document_url TEXT,
  document_file_url TEXT,
  license_file_url TEXT,
  CONSTRAINT staff_licenses_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_staff_licenses_expiry_date ON staff_licenses (expiry_date);
CREATE INDEX IF NOT EXISTS idx_staff_licenses_staff_id ON staff_licenses (staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_licenses_staff_id_is_primary ON staff_licenses (staff_id, is_primary);
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_licenses_staff_number ON staff_licenses (staff_id, license_number) WHERE (license_number IS NOT NULL);

-- ── staff_members
CREATE TABLE IF NOT EXISTS staff_members (
  id TEXT NOT NULL,
  employee_no TEXT NOT NULL,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  company_id TEXT,
  department TEXT,
  position TEXT,
  team TEXT,
  email TEXT,
  phone TEXT,
  resident_no TEXT,
  address TEXT,
  license TEXT,
  bank_account TEXT,
  salary_info TEXT,
  join_date TEXT,
  joined_at TEXT,
  resigned_at TEXT,
  status TEXT DEFAULT '재직',
  role TEXT DEFAULT 'user',
  permissions TEXT DEFAULT '{}',
  password TEXT,
  annual_leave_total REAL DEFAULT 15.0,
  annual_leave_used REAL DEFAULT 0.0,
  shift_id TEXT,
  base_salary INTEGER DEFAULT 0,
  other_taxfree INTEGER DEFAULT 0,
  position_allowance INTEGER DEFAULT 0,
  overtime_allowance INTEGER DEFAULT 0,
  night_work_allowance INTEGER DEFAULT 0,
  holiday_work_allowance INTEGER DEFAULT 0,
  annual_leave_pay INTEGER DEFAULT 0,
  working_hours_per_week REAL DEFAULT 40,
  working_days_per_week INTEGER DEFAULT 5,
  last_seen_at TEXT,
  presence_status TEXT DEFAULT 'away',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  auth_user_id TEXT,
  meal_allowance INTEGER DEFAULT 0,
  night_duty_allowance INTEGER DEFAULT 0,
  vehicle_allowance INTEGER DEFAULT 0,
  childcare_allowance INTEGER DEFAULT 0,
  research_allowance INTEGER DEFAULT 0,
  birth_date TEXT,
  is_system_master INTEGER DEFAULT 0,
  avatar_url TEXT,
  photo_url TEXT,
  profile_photo_path TEXT,
  profile_photo_updated_at TEXT,
  force_logout_at TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  hire_date TEXT,
  resign_date TEXT,
  bank_name TEXT,
  passwd TEXT,
  employment_type TEXT,
  staff_email TEXT,
  annual_days REAL,
  annual_used REAL,
  gender TEXT,
  salary REAL,
  extension TEXT,
  contract_type TEXT,
  CONSTRAINT staff_members_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT staff_members_employee_no_key UNIQUE (employee_no),
  CONSTRAINT staff_members_pkey PRIMARY KEY (id),
  CONSTRAINT staff_members_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES work_shifts(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_members_auth_user_id ON staff_members (auth_user_id) WHERE (auth_user_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_staff_members_company_id ON staff_members (company_id);
CREATE INDEX IF NOT EXISTS idx_staff_members_shift_id ON staff_members (shift_id);

-- ── staff_preferred_off
CREATE TABLE IF NOT EXISTS staff_preferred_off (
  id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  year_month TEXT NOT NULL,
  preferred_weekdays TEXT DEFAULT '{}',
  preferred_dates TEXT DEFAULT '{}',
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT staff_preferred_off_pkey PRIMARY KEY (id),
  CONSTRAINT staff_preferred_off_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff_members(id) ON DELETE CASCADE,
  CONSTRAINT staff_preferred_off_staff_id_year_month_key UNIQUE (staff_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_staff_preferred_off_staff_id ON staff_preferred_off (staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_preferred_off_year_month ON staff_preferred_off (year_month);

-- ── staff_shift_assignments
CREATE TABLE IF NOT EXISTS staff_shift_assignments (
  id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  shift_id TEXT NOT NULL,
  is_primary INTEGER DEFAULT 0,
  priority INTEGER DEFAULT 0,
  effective_from TEXT,
  effective_to TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT staff_shift_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT staff_shift_assignments_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES work_shifts(id),
  CONSTRAINT staff_shift_assignments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff_members(id) ON DELETE CASCADE,
  CONSTRAINT staff_shift_assignments_staff_id_shift_id_key UNIQUE (staff_id, shift_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_shift_assignments_shift_id ON staff_shift_assignments (shift_id);
CREATE INDEX IF NOT EXISTS idx_staff_shift_assignments_staff_id ON staff_shift_assignments (staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_shift_assignments_staff_id_is_primary ON staff_shift_assignments (staff_id, is_primary);

-- ── staff_trainings
CREATE TABLE IF NOT EXISTS staff_trainings (
  id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  training_code TEXT NOT NULL,
  training_name TEXT NOT NULL,
  assigned_at TEXT DEFAULT CURRENT_TIMESTAMP,
  mandatory INTEGER DEFAULT 1,
  obligation_type TEXT DEFAULT 'legal',
  cycle_months INTEGER,
  status TEXT DEFAULT '미이수',
  completed_at TEXT,
  certificate_url TEXT,
  memo TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_st_obligation_type CHECK ((obligation_type  IN ('legal', 'recommended'))),
  CONSTRAINT chk_st_status CHECK ((status  IN ('미이수', '이수완료', '면제', '진행중'))),
  CONSTRAINT staff_trainings_pkey PRIMARY KEY (id),
  CONSTRAINT staff_trainings_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff_members(id) ON DELETE CASCADE,
  CONSTRAINT staff_trainings_staff_id_training_code_key UNIQUE (staff_id, training_code)
);

CREATE INDEX IF NOT EXISTS idx_staff_trainings_staff_id ON staff_trainings (staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_trainings_status ON staff_trainings (status);
CREATE INDEX IF NOT EXISTS idx_staff_trainings_training_code ON staff_trainings (training_code);

-- ── staff_transfer_history
CREATE TABLE IF NOT EXISTS staff_transfer_history (
  id TEXT NOT NULL,
  staff_id TEXT,
  transfer_type TEXT,
  before_value TEXT,
  after_value TEXT,
  effective_date TEXT,
  approval_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT staff_transfer_history_approval_id_fkey FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE SET NULL,
  CONSTRAINT staff_transfer_history_pkey PRIMARY KEY (id),
  CONSTRAINT staff_transfer_history_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff_members(id) ON DELETE CASCADE
);


-- ── suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  contact TEXT,
  phone TEXT,
  address TEXT,
  email TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  contact_name TEXT,
  business_number TEXT,
  category TEXT,
  contract_start TEXT,
  contract_end TEXT,
  payment_terms TEXT,
  notes TEXT,
  created_by TEXT,
  CONSTRAINT suppliers_name_key UNIQUE (name),
  CONSTRAINT suppliers_pkey PRIMARY KEY (id)
);


-- ── surgery_templates
CREATE TABLE IF NOT EXISTS surgery_templates (
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  body_part TEXT,
  CONSTRAINT surgery_templates_pkey PRIMARY KEY (id)
);


-- ── system_configs
CREATE TABLE IF NOT EXISTS system_configs (
  key TEXT NOT NULL,
  value TEXT,
  description TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT system_configs_pkey PRIMARY KEY (key)
);


-- ── system_settings
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT NOT NULL,
  value TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT system_settings_pkey PRIMARY KEY (key)
);


-- ── tasks
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  status TEXT DEFAULT 'todo',
  priority TEXT DEFAULT 'medium',
  assignee_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT tasks_pkey PRIMARY KEY (id)
);


-- ── tax_free_settings
CREATE TABLE IF NOT EXISTS tax_free_settings (
  id TEXT NOT NULL,
  company_name TEXT DEFAULT '전체',
  meal_limit INTEGER DEFAULT 200000,
  vehicle_limit INTEGER DEFAULT 200000,
  childcare_limit INTEGER DEFAULT 100000,
  research_limit INTEGER DEFAULT 200000,
  uniform_limit INTEGER DEFAULT 300000,
  congratulations_limit INTEGER DEFAULT 500000,
  housing_limit INTEGER DEFAULT 700000,
  other_taxfree_limit INTEGER DEFAULT 0,
  effective_year INTEGER DEFAULT 2025,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT tax_free_settings_company_name_effective_year_key UNIQUE (company_name, effective_year),
  CONSTRAINT tax_free_settings_pkey PRIMARY KEY (id)
);


-- ── tax_insurance_rates
CREATE TABLE IF NOT EXISTS tax_insurance_rates (
  id TEXT NOT NULL,
  effective_year INTEGER NOT NULL,
  company_name TEXT DEFAULT '전체',
  national_pension_rate REAL DEFAULT 0.045,
  health_insurance_rate REAL DEFAULT 0.03545,
  long_term_care_rate REAL DEFAULT 0.00459,
  employment_insurance_rate REAL DEFAULT 0.009,
  income_tax_bracket TEXT DEFAULT '[]',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT tax_insurance_rates_effective_year_company_name_key UNIQUE (effective_year, company_name),
  CONSTRAINT tax_insurance_rates_pkey PRIMARY KEY (id)
);


-- ── tax_reports
CREATE TABLE IF NOT EXISTS tax_reports (
  id TEXT NOT NULL,
  year TEXT NOT NULL,
  company_name TEXT,
  report_type TEXT NOT NULL,
  report_date TEXT,
  data TEXT DEFAULT '[]',
  status TEXT DEFAULT 'draft',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT tax_reports_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_tax_reports_year_company ON tax_reports (year, company_name, report_type);

-- ── todo_reminder_logs
CREATE TABLE IF NOT EXISTS todo_reminder_logs (
  id TEXT NOT NULL,
  todo_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reminder_at TEXT NOT NULL,
  notification_id TEXT,
  status TEXT DEFAULT 'sent',
  title TEXT,
  body TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT todo_reminder_logs_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE SET NULL,
  CONSTRAINT todo_reminder_logs_pkey PRIMARY KEY (id),
  CONSTRAINT todo_reminder_logs_status_check CHECK ((status  IN ('sent', 'duplicate', 'failed'))),
  CONSTRAINT todo_reminder_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES staff_members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_todo_reminder_logs_created ON todo_reminder_logs (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_todo_reminder_logs_unique ON todo_reminder_logs (user_id, todo_id, reminder_at);

-- ── todos
CREATE TABLE IF NOT EXISTS todos (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  is_complete INTEGER DEFAULT 0,
  task_date TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  source_message_id TEXT,
  source_room_id TEXT,
  repeat_parent_id TEXT,
  repeat_generated_from_id TEXT,
  priority TEXT DEFAULT 'medium',
  reminder_at TEXT,
  repeat_type TEXT DEFAULT 'none',
  assignee_kind TEXT DEFAULT 'self',
  CONSTRAINT todos_assignee_kind_check CHECK ((assignee_kind  IN ('self', 'team', 'follow_up'))),
  CONSTRAINT todos_pkey PRIMARY KEY (id),
  CONSTRAINT todos_priority_check CHECK ((priority  IN ('low', 'medium', 'high', 'urgent'))),
  CONSTRAINT todos_repeat_type_check CHECK ((repeat_type  IN ('none', 'daily', 'weekly', 'monthly')))
);

CREATE INDEX IF NOT EXISTS idx_todos_priority_date ON todos (user_id, priority, task_date DESC);
CREATE INDEX IF NOT EXISTS idx_todos_reminder_at ON todos (reminder_at) WHERE (reminder_at IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_todos_repeat_parent_date ON todos (user_id, repeat_parent_id, task_date DESC) WHERE (repeat_parent_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_todos_source_message ON todos (user_id, source_room_id, source_message_id) WHERE (source_message_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_todos_user_date ON todos (user_id, task_date);

-- ── unpaid_absence_records
CREATE TABLE IF NOT EXISTS unpaid_absence_records (
  id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  staff_name TEXT,
  year_month TEXT NOT NULL,
  absent_days REAL DEFAULT 0,
  monthly_salary INTEGER DEFAULT 0,
  working_days INTEGER DEFAULT 0,
  daily_wage REAL DEFAULT 0,
  deduction_amount INTEGER DEFAULT 0,
  note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unpaid_absence_records_pkey PRIMARY KEY (id)
);


-- ── virtual_account_deposits
CREATE TABLE IF NOT EXISTS virtual_account_deposits (
  id TEXT NOT NULL,
  company_id TEXT,
  provider TEXT DEFAULT 'generic',
  dedupe_key TEXT NOT NULL,
  provider_event_type TEXT,
  provider_event_id TEXT,
  order_id TEXT,
  order_name TEXT,
  payment_key TEXT,
  transaction_key TEXT,
  method TEXT,
  deposit_status TEXT DEFAULT 'issued',
  match_status TEXT DEFAULT 'unmatched',
  amount REAL DEFAULT 0,
  currency TEXT DEFAULT 'KRW',
  depositor_name TEXT,
  customer_name TEXT,
  patient_name TEXT,
  patient_id TEXT,
  transaction_label TEXT,
  bank_code TEXT,
  bank_name TEXT,
  account_number TEXT,
  due_date TEXT,
  deposited_at TEXT,
  matched_target_type TEXT,
  matched_target_id TEXT,
  matched_note TEXT,
  raw_payload TEXT DEFAULT '{}',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT virtual_account_deposits_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_virtual_account_deposits_company_created_at ON virtual_account_deposits (company_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_virtual_account_deposits_dedupe_key ON virtual_account_deposits (dedupe_key);
CREATE INDEX IF NOT EXISTS idx_virtual_account_deposits_deposited_at ON virtual_account_deposits (deposited_at DESC);
CREATE INDEX IF NOT EXISTS idx_virtual_account_deposits_status ON virtual_account_deposits (deposit_status, match_status);

-- ── wiki_document_versions
CREATE TABLE IF NOT EXISTS wiki_document_versions (
  id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  version_no INTEGER NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  content TEXT DEFAULT '',
  tags TEXT DEFAULT '{}',
  editor_ids TEXT DEFAULT '{}',
  company_id TEXT,
  company_name TEXT DEFAULT '전체',
  change_summary TEXT,
  restore_of_version_id TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT wiki_document_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT wiki_document_versions_document_id_fkey FOREIGN KEY (document_id) REFERENCES wiki_documents(id) ON DELETE CASCADE,
  CONSTRAINT wiki_document_versions_document_id_version_no_key UNIQUE (document_id, version_no),
  CONSTRAINT wiki_document_versions_pkey PRIMARY KEY (id),
  CONSTRAINT wiki_document_versions_restore_of_version_id_fkey FOREIGN KEY (restore_of_version_id) REFERENCES wiki_document_versions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_wiki_document_versions_document_created ON wiki_document_versions (document_id, created_at DESC);

-- ── wiki_documents
CREATE TABLE IF NOT EXISTS wiki_documents (
  id TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  company_id TEXT,
  company_name TEXT DEFAULT '전체',
  title TEXT NOT NULL,
  summary TEXT,
  content TEXT DEFAULT '',
  tags TEXT DEFAULT '{}',
  editor_ids TEXT DEFAULT '{}',
  is_published INTEGER DEFAULT 1,
  is_archived INTEGER DEFAULT 0,
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT wiki_documents_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT wiki_documents_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES wiki_folders(id) ON DELETE CASCADE,
  CONSTRAINT wiki_documents_pkey PRIMARY KEY (id),
  CONSTRAINT wiki_documents_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES staff_members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_wiki_documents_company_title ON wiki_documents (company_id, title);
CREATE INDEX IF NOT EXISTS idx_wiki_documents_folder_updated ON wiki_documents (folder_id, updated_at DESC);

-- ── wiki_folders
CREATE TABLE IF NOT EXISTS wiki_folders (
  id TEXT NOT NULL,
  company_id TEXT,
  company_name TEXT DEFAULT '전체',
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  sort_order INTEGER DEFAULT 0,
  is_archived INTEGER DEFAULT 0,
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT wiki_folders_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff_members(id) ON DELETE SET NULL,
  CONSTRAINT wiki_folders_pkey PRIMARY KEY (id),
  CONSTRAINT wiki_folders_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES staff_members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_wiki_folders_company_sort ON wiki_folders (company_id, sort_order, created_at DESC);

-- ── work_shifts
CREATE TABLE IF NOT EXISTS work_shifts (
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  break_start_time TEXT,
  break_end_time TEXT,
  description TEXT,
  company_name TEXT,
  shift_type TEXT,
  weekly_work_days INTEGER DEFAULT 5,
  is_weekend_work INTEGER DEFAULT 0,
  is_shift INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT work_shifts_pkey PRIMARY KEY (id)
);

