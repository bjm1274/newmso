-- ============================================================================
-- SY INC. MSO 통합 시스템 - Supabase 전체 스키마 및 마이그레이션
-- 실행: Supabase Dashboard > SQL Editor > New query > 붙여넣기 > Run
-- 작성일: 2026-02-10
-- ============================================================================

-- UUID 확장 활성화
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. 기본 테이블
-- ============================================================================

-- 직원 정보
CREATE TABLE IF NOT EXISTS staff_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_no VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(50) NOT NULL,
  company VARCHAR(50) NOT NULL,
  department VARCHAR(50),
  position VARCHAR(50),
  email VARCHAR(100),
  phone VARCHAR(20),
  join_date DATE,
  status VARCHAR(20) DEFAULT '재직',
  role VARCHAR(20) DEFAULT 'user',
  annual_leave_total DECIMAL(4,1) DEFAULT 0.0,
  annual_leave_used DECIMAL(4,1) DEFAULT 0.0,
  base_salary BIGINT DEFAULT 0,
  shift_id UUID,
  meal_allowance BIGINT DEFAULT 0,
  vehicle_allowance BIGINT DEFAULT 0,
  childcare_allowance BIGINT DEFAULT 0,
  research_allowance BIGINT DEFAULT 0,
  other_taxfree BIGINT DEFAULT 0,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 회사
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('MSO','HOSPITAL','CLINIC')),
  mso_id UUID REFERENCES companies(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 채팅방
CREATE TABLE IF NOT EXISTS chat_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100),
  type VARCHAR(20) DEFAULT 'group',
  members UUID[],
  is_announcement BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES staff_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 웹 푸시 구독 (브라우저 푸시 토큰 저장용)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES staff_members(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_staff_endpoint
  ON push_subscriptions(staff_id, endpoint);

-- 메시지 (앱에서 사용하는 messages)
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES staff_members(id),
  content TEXT,
  file_url TEXT,
  reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  is_deleted BOOLEAN DEFAULT false,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);

-- 공지사항/게시글 (posts - 메신저 공지용)
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_type VARCHAR(50) DEFAULT '공지사항',
  title VARCHAR(200) NOT NULL,
  content TEXT,
  author_id UUID REFERENCES staff_members(id),
  author_name VARCHAR(50),
  company VARCHAR(50),
  views INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 게시판
CREATE TABLE IF NOT EXISTS board_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_type VARCHAR(50),
  title VARCHAR(200) NOT NULL,
  content TEXT,
  author_id UUID,
  author_name VARCHAR(50),
  company VARCHAR(50),
  views INT DEFAULT 0,
  likes_count INT DEFAULT 0,
  tags JSONB DEFAULT '[]'::jsonb,
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 전자결재
CREATE TABLE IF NOT EXISTS approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES staff_members(id),
  sender_name VARCHAR(50),
  sender_company VARCHAR(50),
  type VARCHAR(50),
  title VARCHAR(200) NOT NULL,
  content TEXT,
  status VARCHAR(20) DEFAULT '대기',
  current_approver_id UUID REFERENCES staff_members(id),
  approver_line JSONB,
  current_step INT DEFAULT 0,
  rejection_comment TEXT,
  meta_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 재고
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company VARCHAR(50) NOT NULL,
  category VARCHAR(50),
  item_name VARCHAR(100),
  name VARCHAR(100),
  quantity INT DEFAULT 0,
  stock INT DEFAULT 0,
  min_quantity INT DEFAULT 5,
  min_stock INT DEFAULT 10,
  unit_price BIGINT DEFAULT 0,
  expiry_date DATE,
  lot_number VARCHAR(50),
  is_udi BOOLEAN DEFAULT false,
  udi_code VARCHAR(100),
  location VARCHAR(100),
  last_updated TIMESTAMPTZ DEFAULT NOW()
);
-- inventory 호환: name/stock 동기화 (item_name/quantity → name/stock)
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
CREATE OR REPLACE FUNCTION sync_inventory_name_stock() RETURNS TRIGGER AS $$
BEGIN
  NEW.name := COALESCE(NEW.name, NEW.item_name);
  NEW.stock := COALESCE(NULLIF(NEW.stock,0), NEW.quantity);
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS tr_inventory_sync ON inventory;
CREATE TRIGGER tr_inventory_sync BEFORE INSERT OR UPDATE ON inventory FOR EACH ROW EXECUTE FUNCTION sync_inventory_name_stock();

-- 할일
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  content TEXT,
  status VARCHAR(20) DEFAULT 'todo',
  priority VARCHAR(20) DEFAULT 'medium',
  assignee_id UUID REFERENCES staff_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 알림
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES staff_members(id) ON DELETE CASCADE,
  type VARCHAR(50),
  title TEXT,
  body TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. 출퇴근 (attendance) - 근태시스템 사용
-- ============================================================================
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT '정상',
  location_lat DECIMAL(10,8),
  location_lon DECIMAL(11,8),
  location_lat_out DECIMAL(10,8),
  location_lon_out DECIMAL(11,8),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_staff_date ON attendance(staff_id, date);

-- ============================================================================
-- 3. HR - 근무형태, 근태(attendances), 휴가
-- ============================================================================
CREATE TABLE IF NOT EXISTS work_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  company_name TEXT,
  name TEXT NOT NULL,
  start_time TIME NOT NULL DEFAULT '09:00',
  end_time TIME NOT NULL DEFAULT '18:00',
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  company_id UUID,
  company_name TEXT,
  work_date DATE NOT NULL,
  check_in_time TIMESTAMPTZ,
  check_out_time TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'present',
  work_hours_minutes INT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, work_date)
);
CREATE INDEX IF NOT EXISTS idx_attendances_staff_date ON attendances(staff_id, work_date);
CREATE INDEX IF NOT EXISTS idx_attendances_work_date ON attendances(work_date);

CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  company_id UUID,
  company_name TEXT,
  leave_type TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT '대기',
  approved_by UUID REFERENCES staff_members(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  attachment_url TEXT,
  attachment_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leave_requests_staff ON leave_requests(staff_id);

-- ============================================================================
-- 4. 급여
-- ============================================================================
CREATE TABLE IF NOT EXISTS payroll_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  year_month VARCHAR(7) NOT NULL,
  base_salary BIGINT DEFAULT 0,
  meal_allowance BIGINT DEFAULT 0,
  vehicle_allowance BIGINT DEFAULT 0,
  childcare_allowance BIGINT DEFAULT 0,
  research_allowance BIGINT DEFAULT 0,
  other_taxfree BIGINT DEFAULT 0,
  extra_allowance BIGINT DEFAULT 0,
  overtime_pay BIGINT DEFAULT 0,
  bonus BIGINT DEFAULT 0,
  total_taxable BIGINT DEFAULT 0,
  total_taxfree BIGINT DEFAULT 0,
  total_deduction BIGINT DEFAULT 0,
  net_pay BIGINT DEFAULT 0,
  attendance_deduction BIGINT DEFAULT 0,
  attendance_deduction_detail JSONB,
  status VARCHAR(20) DEFAULT '임시',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, year_month)
);
CREATE INDEX IF NOT EXISTS idx_payroll_records_staff_ym ON payroll_records(staff_id, year_month);

-- ============================================================================
-- 5. 근태 차감 규칙
-- ============================================================================
CREATE TABLE IF NOT EXISTS attendance_deduction_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT '전체',
  late_deduction_type TEXT NOT NULL DEFAULT 'fixed' CHECK (late_deduction_type IN ('hourly','fixed')),
  late_deduction_amount INT DEFAULT 10000,
  early_leave_deduction_type TEXT NOT NULL DEFAULT 'fixed' CHECK (early_leave_deduction_type IN ('hourly','fixed')),
  early_leave_deduction_amount INT DEFAULT 10000,
  absent_use_daily_rate BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_name)
);

-- ============================================================================
-- 6. 감사 로그, 결재 이력, 템플릿
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  user_name TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS approval_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id UUID NOT NULL,
  approver_id UUID,
  approver_name TEXT,
  action TEXT NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_approval_history_approval ON approval_history(approval_id);

CREATE TABLE IF NOT EXISTS approval_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_type TEXT NOT NULL UNIQUE,
  default_values JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 7. 메신저 확장
-- ============================================================================
CREATE TABLE IF NOT EXISTS message_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  message_id UUID NOT NULL,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_message_reads_message ON message_reads(message_id);

CREATE TABLE IF NOT EXISTS room_read_cursors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  room_id UUID NOT NULL,
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, room_id)
);

CREATE TABLE IF NOT EXISTS room_notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  room_id UUID NOT NULL,
  notifications_enabled BOOLEAN DEFAULT true,
  UNIQUE(user_id, room_id)
);

CREATE TABLE IF NOT EXISTS polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL,
  message_id UUID,
  creator_id UUID REFERENCES staff_members(id),
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_polls_room ON polls(room_id);

CREATE TABLE IF NOT EXISTS poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  option_index INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(poll_id, user_id)
);

CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL DEFAULT '👍',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_message_reactions_msg ON message_reactions(message_id);

CREATE TABLE IF NOT EXISTS pinned_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL,
  message_id UUID NOT NULL,
  pinned_by UUID REFERENCES staff_members(id),
  pinned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(room_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_pinned_room ON pinned_messages(room_id);

-- ============================================================================
-- 8. 게시판 확장
-- ============================================================================
ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS likes_count INT DEFAULT 0;
ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;
ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS board_post_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES board_posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES staff_members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS board_post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES board_posts(id) ON DELETE CASCADE,
  author_id UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  author_name VARCHAR(100),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 9. 재고·거래처·발주
-- ============================================================================
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  contact TEXT,
  phone TEXT,
  address TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES suppliers(id),
  items JSONB NOT NULL,
  status TEXT DEFAULT '대기',
  total_amount DECIMAL(12,2),
  notes TEXT,
  created_by UUID REFERENCES staff_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES inventory(id),
  inventory_id UUID REFERENCES inventory(id),
  type VARCHAR(20),
  change_type VARCHAR(20),
  quantity INT,
  prev_quantity INT,
  next_quantity INT,
  actor_name TEXT,
  company TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
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

-- ============================================================================
-- 10. 계약·출결정정 등
-- ============================================================================
CREATE TABLE IF NOT EXISTS employment_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES staff_members(id) ON DELETE CASCADE,
  contract_type VARCHAR(50),
  start_date DATE,
  end_date DATE,
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES staff_members(id),
  original_date DATE,
  correction_type VARCHAR(50),
  reason TEXT,
  status VARCHAR(20) DEFAULT '대기',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 11. staff_members shift_id FK (work_shifts 생성 후)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'staff_members_shift_id_fkey' AND table_name = 'staff_members') THEN
    ALTER TABLE staff_members ADD CONSTRAINT staff_members_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES work_shifts(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ============================================================================
-- 12. 초기 데이터
-- ============================================================================
INSERT INTO attendance_deduction_rules (company_name, late_deduction_type, late_deduction_amount, early_leave_deduction_type, early_leave_deduction_amount)
VALUES ('전체', 'fixed', 10000, 'fixed', 10000)
ON CONFLICT (company_name) DO NOTHING;

INSERT INTO work_shifts (company_name, name, start_time, end_time, description)
SELECT 'SY INC.', '데이(일반)', '09:00', '18:00', '일반 근무'
WHERE NOT EXISTS (SELECT 1 FROM work_shifts LIMIT 1);

-- 공지방 (메신저 기본방) - 존재 시 스킵
INSERT INTO chat_rooms (id, name, type, is_announcement)
SELECT '00000000-0000-0000-0000-000000000000', '공지', 'group', true
WHERE NOT EXISTS (SELECT 1 FROM chat_rooms WHERE id = '00000000-0000-0000-0000-000000000000');

-- ============================================================================
-- 13. RLS 비활성화 (개발 편의 - 프로덕션에서는 활성화 권장)
-- ============================================================================
-- ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
-- ... 각 테이블별 정책 설정

-- 완료
SELECT 'MSO 전체 스키마 마이그레이션 완료' AS status;
