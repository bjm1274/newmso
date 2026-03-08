CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION set_row_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS messenger_drive_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT '전체',
  room_id UUID REFERENCES chat_rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messenger_drive_links_company
  ON messenger_drive_links(company_name, sort_order, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messenger_drive_links_room
  ON messenger_drive_links(room_id);

DROP TRIGGER IF EXISTS trg_messenger_drive_links_updated_at ON messenger_drive_links;
CREATE TRIGGER trg_messenger_drive_links_updated_at
BEFORE UPDATE ON messenger_drive_links
FOR EACH ROW
EXECUTE FUNCTION set_row_updated_at();

CREATE TABLE IF NOT EXISTS payroll_bonus_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  year_month VARCHAR(7) NOT NULL,
  category TEXT NOT NULL DEFAULT '상여',
  amount BIGINT NOT NULL DEFAULT 0 CHECK (amount >= 0),
  note TEXT,
  created_by UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_bonus_items_company_month
  ON payroll_bonus_items(company_name, year_month, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payroll_bonus_items_staff
  ON payroll_bonus_items(staff_id, year_month);

DROP TRIGGER IF EXISTS trg_payroll_bonus_items_updated_at ON payroll_bonus_items;
CREATE TRIGGER trg_payroll_bonus_items_updated_at
BEFORE UPDATE ON payroll_bonus_items
FOR EACH ROW
EXECUTE FUNCTION set_row_updated_at();

CREATE TABLE IF NOT EXISTS payroll_retro_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  start_month VARCHAR(7) NOT NULL,
  end_month VARCHAR(7) NOT NULL,
  before_base BIGINT NOT NULL DEFAULT 0,
  after_base BIGINT NOT NULL DEFAULT 0,
  retro_total BIGINT NOT NULL DEFAULT 0,
  reason TEXT,
  created_by UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_retro_adjustments_company
  ON payroll_retro_adjustments(company_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payroll_retro_adjustments_staff
  ON payroll_retro_adjustments(staff_id, start_month, end_month);

DROP TRIGGER IF EXISTS trg_payroll_retro_adjustments_updated_at ON payroll_retro_adjustments;
CREATE TRIGGER trg_payroll_retro_adjustments_updated_at
BEFORE UPDATE ON payroll_retro_adjustments
FOR EACH ROW
EXECUTE FUNCTION set_row_updated_at();

CREATE TABLE IF NOT EXISTS payroll_deduction_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  deduction_type TEXT NOT NULL,
  monthly_amount BIGINT NOT NULL DEFAULT 0 CHECK (monthly_amount >= 0),
  balance BIGINT NOT NULL DEFAULT 0,
  note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_deduction_controls_company
  ON payroll_deduction_controls(company_name, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payroll_deduction_controls_staff
  ON payroll_deduction_controls(staff_id, is_active);

DROP TRIGGER IF EXISTS trg_payroll_deduction_controls_updated_at ON payroll_deduction_controls;
CREATE TRIGGER trg_payroll_deduction_controls_updated_at
BEFORE UPDATE ON payroll_deduction_controls
FOR EACH ROW
EXECUTE FUNCTION set_row_updated_at();

CREATE TABLE IF NOT EXISTS freelancer_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  year_month VARCHAR(7) NOT NULL,
  vendor_name TEXT NOT NULL,
  work_type TEXT,
  payment_date DATE NOT NULL,
  supply_amount BIGINT NOT NULL DEFAULT 0 CHECK (supply_amount >= 0),
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 3.30,
  withholding_tax BIGINT NOT NULL DEFAULT 0,
  note TEXT,
  created_by UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_freelancer_payments_company_month
  ON freelancer_payments(company_name, year_month, payment_date DESC);

DROP TRIGGER IF EXISTS trg_freelancer_payments_updated_at ON freelancer_payments;
CREATE TRIGGER trg_freelancer_payments_updated_at
BEFORE UPDATE ON freelancer_payments
FOR EACH ROW
EXECUTE FUNCTION set_row_updated_at();

CREATE TABLE IF NOT EXISTS payroll_calendar_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT '전체',
  year_month VARCHAR(7) NOT NULL,
  title TEXT NOT NULL,
  due_date DATE NOT NULL,
  owner_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '대기'
    CHECK (status IN ('대기', '진행', '완료')),
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_name, year_month, title)
);

CREATE INDEX IF NOT EXISTS idx_payroll_calendar_items_scope
  ON payroll_calendar_items(company_name, year_month, sort_order);

DROP TRIGGER IF EXISTS trg_payroll_calendar_items_updated_at ON payroll_calendar_items;
CREATE TRIGGER trg_payroll_calendar_items_updated_at
BEFORE UPDATE ON payroll_calendar_items
FOR EACH ROW
EXECUTE FUNCTION set_row_updated_at();

CREATE TABLE IF NOT EXISTS payroll_approval_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT '전체',
  year_month VARCHAR(7) NOT NULL,
  step1_status TEXT NOT NULL DEFAULT '대기'
    CHECK (step1_status IN ('대기', '승인', '보류')),
  step2_status TEXT NOT NULL DEFAULT '대기'
    CHECK (step2_status IN ('대기', '승인', '보류')),
  step1_comment TEXT,
  step2_comment TEXT,
  step1_actor_id UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  step2_actor_id UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  step1_updated_at TIMESTAMPTZ,
  step2_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_name, year_month)
);

CREATE INDEX IF NOT EXISTS idx_payroll_approval_workflows_scope
  ON payroll_approval_workflows(company_name, year_month);

DROP TRIGGER IF EXISTS trg_payroll_approval_workflows_updated_at ON payroll_approval_workflows;
CREATE TRIGGER trg_payroll_approval_workflows_updated_at
BEFORE UPDATE ON payroll_approval_workflows
FOR EACH ROW
EXECUTE FUNCTION set_row_updated_at();

CREATE TABLE IF NOT EXISTS payroll_approval_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT '전체',
  year_month VARCHAR(7) NOT NULL,
  actor_id UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_approval_logs_scope
  ON payroll_approval_logs(company_name, year_month, created_at DESC);
