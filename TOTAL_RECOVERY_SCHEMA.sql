-- ============================================================
-- SY INC. MSO 통합 관리 시스템 - 마스터 통합 스키마 (최종 복구용 v2)
-- 작성일: 2026-02-27
-- 목적: 유실된 모든 테이블과 제약 조건을 초기화하고 수납/인사/재고/채팅 기능을 복구합니다.
-- v2 수정사항: staff_members 테이블에 shift_id, resident_no 등 필수 컬럼 추가
-- ============================================================

-- 0. 확장 기능 활성화
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 기존 테이블 삭제 (의존성 순서 고려)
DROP TABLE IF EXISTS daily_checks CASCADE;
DROP TABLE IF EXISTS daily_closure_items CASCADE;
DROP TABLE IF EXISTS daily_closures CASCADE;
DROP TABLE IF EXISTS payroll CASCADE;
DROP TABLE IF EXISTS board_post_comments CASCADE;
DROP TABLE IF EXISTS board_posts CASCADE;
DROP TABLE IF EXISTS message_reads CASCADE;
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS chat_rooms CASCADE;
DROP TABLE IF EXISTS approvals CASCADE;
DROP TABLE IF EXISTS purchase_orders CASCADE;
DROP TABLE IF EXISTS inventory_receipts CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS system_configs CASCADE;
DROP TABLE IF EXISTS work_shifts CASCADE;
DROP TABLE IF EXISTS staff_members CASCADE;
DROP TABLE IF EXISTS companies CASCADE;

-- 1. 회사 마스터 (companies)
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('MSO','HOSPITAL','CLINIC')),
    mso_id UUID REFERENCES companies(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 근무 형태 (work_shifts)
CREATE TABLE work_shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    break_start_time TIME,
    break_end_time TIME,
    description TEXT,
    company_name VARCHAR(100),
    shift_type VARCHAR(50),
    weekly_work_days INT DEFAULT 5,
    is_weekend_work BOOLEAN DEFAULT false,
    is_shift BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 직원 정보 테이블 (staff_members)
CREATE TABLE staff_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_no VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(50) NOT NULL,
    company VARCHAR(50) NOT NULL,
    company_id UUID REFERENCES companies(id),
    department VARCHAR(50),
    position VARCHAR(50),
    team VARCHAR(50),
    email VARCHAR(100),
    phone VARCHAR(20),
    resident_no VARCHAR(20), -- 주민번호
    address TEXT, -- 주소
    license TEXT, -- 면허사항
    bank_account TEXT, -- 계좌정보
    salary_info TEXT, -- 임금(합의)정보
    join_date DATE, -- 입사일
    joined_at DATE, -- 입사일(alias)
    resigned_at DATE, -- 퇴사일
    status VARCHAR(20) DEFAULT '재직',
    role VARCHAR(20) DEFAULT 'user',
    permissions JSONB DEFAULT '{}',
    password TEXT,
    annual_leave_total DECIMAL(4,1) DEFAULT 15.0,
    annual_leave_used DECIMAL(4,1) DEFAULT 0.0,
    shift_id UUID REFERENCES work_shifts(id), -- 근무형태ID
    base_salary BIGINT DEFAULT 0,
    other_taxfree BIGINT DEFAULT 0,
    position_allowance BIGINT DEFAULT 0,
    overtime_allowance BIGINT DEFAULT 0,
    night_work_allowance BIGINT DEFAULT 0,
    holiday_work_allowance BIGINT DEFAULT 0,
    annual_leave_pay BIGINT DEFAULT 0,
    last_seen_at TIMESTAMPTZ,
    presence_status VARCHAR(20) DEFAULT 'away',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 시스템 설정 (system_configs)
CREATE TABLE system_configs (
    "key" VARCHAR(50) PRIMARY KEY,
    value TEXT,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 재고/물품 관리 관련
CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    contact TEXT,
    phone TEXT,
    address TEXT,
    email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id),
    company VARCHAR(50), 
    category VARCHAR(50) DEFAULT '일반',
    item_name VARCHAR(100) NOT NULL,
    quantity INT DEFAULT 0,
    min_quantity INT DEFAULT 5,
    unit_price BIGINT DEFAULT 0,
    expiry_date DATE,
    lot_number VARCHAR(50),
    is_udi BOOLEAN DEFAULT FALSE,
    udi_code VARCHAR(100),
    location VARCHAR(100),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE inventory_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID REFERENCES inventory(id) ON DELETE RESTRICT,
    qty INTEGER NOT NULL,
    unit_price DECIMAL(10, 2),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    receipt_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    receipt_type TEXT DEFAULT '수동',
    lot_number TEXT,
    expiry_date DATE,
    invoice_number TEXT,
    notes TEXT,
    created_by UUID REFERENCES staff_members(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT,
    items JSONB NOT NULL,
    status TEXT DEFAULT '대기',
    total_amount DECIMAL(12, 2),
    notes TEXT,
    created_by UUID REFERENCES staff_members(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES staff_members(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. 전자결재 (approvals)
CREATE TABLE approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id),
    sender_id UUID REFERENCES staff_members(id),
    sender_name VARCHAR(50),
    sender_company VARCHAR(50),
    type VARCHAR(50),
    title VARCHAR(200) NOT NULL,
    content TEXT,
    status VARCHAR(20) DEFAULT '대기',
    current_approver_id UUID,
    meta_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. 채팅/메신저 관련
CREATE TABLE chat_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100),
    type VARCHAR(20),
    members UUID[],
    is_announcement BOOLEAN DEFAULT FALSE,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES chat_rooms(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES staff_members(id),
    content TEXT NOT NULL,
    type VARCHAR(20) DEFAULT 'text',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE message_reads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE,
    reader_id UUID REFERENCES staff_members(id),
    read_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(message_id, reader_id)
);

-- 8. 게시판 관련
CREATE TABLE board_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id),
    board_type VARCHAR(50),
    title VARCHAR(200) NOT NULL,
    content TEXT,
    author_id UUID,
    author_name VARCHAR(50),
    company VARCHAR(50),
    views INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE board_post_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID REFERENCES board_posts(id) ON DELETE CASCADE,
    author_id UUID REFERENCES staff_members(id),
    author_name VARCHAR(50),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. 인사/급여 관련
CREATE TABLE payroll (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES staff_members(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    base_salary NUMERIC(12,0) NOT NULL,
    total_salary NUMERIC(12,0) NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('DRAFT','CONFIRMED','PAID')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (company_id, staff_id, month)
);

-- 10. 원무과 마감 관련
CREATE TABLE daily_closures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id),
    date DATE NOT NULL,
    total_amount BIGINT DEFAULT 0,
    petty_cash_start BIGINT DEFAULT 0,
    petty_cash_end BIGINT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'draft',
    created_by UUID REFERENCES staff_members(id),
    memo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, date)
);

CREATE TABLE daily_closure_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    closure_id UUID REFERENCES daily_closures(id) ON DELETE CASCADE,
    patient_name VARCHAR(50),
    amount BIGINT NOT NULL,
    payment_method VARCHAR(20),
    receipt_type VARCHAR(20),
    memo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE daily_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    closure_id UUID REFERENCES daily_closures(id) ON DELETE CASCADE,
    check_number VARCHAR(20) NOT NULL,
    amount BIGINT NOT NULL,
    bank_name VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. 전자 근로계약 및 템플릿
CREATE TABLE contract_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_name VARCHAR(100) NOT NULL UNIQUE,
    template_content TEXT,
    seal_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE employment_contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id UUID REFERENCES staff_members(id) ON DELETE CASCADE,
    contract_type VARCHAR(50),
    status VARCHAR(20) DEFAULT '서명대기', -- 서명대기, 서명완료
    base_salary BIGINT DEFAULT 0,
    meal_allowance BIGINT DEFAULT 0,
    vehicle_allowance BIGINT DEFAULT 0,
    childcare_allowance BIGINT DEFAULT 0,
    position_allowance BIGINT DEFAULT 0,
    research_allowance BIGINT DEFAULT 0,
    other_taxfree BIGINT DEFAULT 0,
    effective_date DATE,
    probation_months INT DEFAULT 3,
    probation_percent INT DEFAULT 90,
    payment_day INT DEFAULT 7,
    content TEXT, -- 최종 생성된 HTML/텍스트
    signature_data TEXT, -- 서명 이미지 DataURL
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    signed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(staff_id, contract_type, status)
);

-- 12. 초기 데이터 설정
INSERT INTO companies (name, type, is_active)
VALUES 
('SY INC.', 'MSO', true),
('박철홍정형외과', 'HOSPITAL', true),
('수연의원', 'HOSPITAL', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO system_configs ("key", value, description)
VALUES ('min_auth_time', '2026-01-01T00:00:00Z', '로그인 세션 최소 유효 시간')
ON CONFLICT ("key") DO NOTHING;

-- 근로계약서 기본 템플릿
INSERT INTO contract_templates (company_name, template_content)
VALUES ('전체', '근 로 계 약 서 (월급제)

[사용자 기본정보]
회사명: {{company_name}}
대표자: {{company_ceo}}
주  소: {{company_address}}

[근로자 기본정보]
성  명: {{employee_name}}
생년월일: {{birth_date}}
주  소: {{address}}

제1조 [계약기간]
본 계약은 {{join_date}}부터 효력을 발생한다.

제2조 [근무장소 및 업무]
1. 근무장소: {{company_name}} 내 지정 장소
2. 업무내용: {{department}} / {{position}}

제3조 [임금]
1. 임금 구성항목
[임금 구성항목 예시]
- 기본급: {{base_salary}}
- 식대: {{meal_allowance}}

제4조 [서명]
본 계약을 체결함.
{{today}}
') ON CONFLICT DO NOTHING;

-- 13. 인덱스 및 RLS
CREATE INDEX idx_staff_members_company_id ON staff_members(company_id);
CREATE INDEX idx_staff_members_shift_id ON staff_members(shift_id);
CREATE INDEX idx_board_posts_company_id ON board_posts(company_id);
CREATE INDEX idx_inventory_company_id ON inventory(company_id);
CREATE INDEX idx_contracts_staff_id ON employment_contracts(staff_id);

ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access SM" ON staff_members FOR ALL USING (true);
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access CO" ON companies FOR ALL USING (true);
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access IV" ON inventory FOR ALL USING (true);
ALTER TABLE board_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access BP" ON board_posts FOR ALL USING (true);
ALTER TABLE daily_closures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access DC" ON daily_closures FOR ALL USING (true);
ALTER TABLE system_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access SC" ON system_configs FOR ALL USING (true);
ALTER TABLE work_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access WS" ON work_shifts FOR ALL USING (true);
ALTER TABLE contract_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access CT" ON contract_templates FOR ALL USING (true);
ALTER TABLE employment_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access EC" ON employment_contracts FOR ALL USING (true);

