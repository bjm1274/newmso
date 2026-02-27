-- 원무과 일일 마감보고 테이블
CREATE TABLE IF NOT EXISTS daily_closures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id),
    date DATE NOT NULL,
    total_amount BIGINT DEFAULT 0, -- 총 수납 금액
    petty_cash_start BIGINT DEFAULT 0, -- 기초 시재
    petty_cash_end BIGINT DEFAULT 0, -- 기말 시재
    status VARCHAR(20) DEFAULT 'draft', -- draft, completed
    created_by UUID REFERENCES staff_members(id),
    memo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, date)
);

-- 수납 상세 내역 테이블
CREATE TABLE IF NOT EXISTS daily_closure_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    closure_id UUID REFERENCES daily_closures(id) ON DELETE CASCADE,
    patient_name VARCHAR(50),
    amount BIGINT NOT NULL,
    payment_method VARCHAR(20), -- 현금, 카드, 계좌이체 등
    receipt_type VARCHAR(20), -- 진료비, 제증명 등
    memo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 수표 관리 기록 테이블
CREATE TABLE IF NOT EXISTS daily_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    closure_id UUID REFERENCES daily_closures(id) ON DELETE CASCADE,
    check_number VARCHAR(20) NOT NULL,
    amount BIGINT NOT NULL,
    bank_name VARCHAR(50),
    issuer_name VARCHAR(50),
    issue_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 설정
ALTER TABLE daily_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_closure_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "원무과 마감 조회 권한" ON daily_closures FOR SELECT USING (true);
CREATE POLICY "원무과 마감 입력 권한" ON daily_closures FOR ALL USING (true);
CREATE POLICY "원무과 마감 내역 조회 권한" ON daily_closure_items FOR SELECT USING (true);
CREATE POLICY "원무과 마감 내역 입력 권한" ON daily_closure_items FOR ALL USING (true);
CREATE POLICY "원무과 수표 조회 권한" ON daily_checks FOR SELECT USING (true);
CREATE POLICY "원무과 수표 입력 권한" ON daily_checks FOR ALL USING (true);
