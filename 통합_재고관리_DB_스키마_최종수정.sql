-- ==========================================
-- 병원 ERP 통합 데이터베이스 스키마 (v4.4 최종 수정본)
-- 기존 테이블 충돌 해결 및 이름 기반 로그인 지원
-- ==========================================

-- 기존 테이블 삭제 (구조 재설정을 위해 필요)
-- 주의: 기존 데이터가 삭제되므로 초기 설정 시에만 사용하세요.
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS approvals CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS staffs CASCADE;

-- 1. 직원 정보 테이블 (password 컬럼 포함)
CREATE TABLE staffs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE, -- 아이디로 사용
    password TEXT DEFAULT '1234', -- 기본 비밀번호
    position TEXT,
    department TEXT,
    company TEXT,
    role TEXT DEFAULT 'staff',
    email TEXT,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. 재고 정보 테이블
CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_name TEXT NOT NULL,
    category TEXT,
    stock INTEGER DEFAULT 0,
    min_stock INTEGER DEFAULT 10,
    unit TEXT,
    price INTEGER DEFAULT 0,
    supplier TEXT,
    expiry_date DATE,
    lot_number TEXT,
    is_udi_reportable BOOLEAN DEFAULT FALSE,
    company TEXT,
    department TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. 전자결재 테이블
CREATE TABLE approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    type TEXT NOT NULL, -- '물품신청', '인사명령', '양식신청', '출결정정'
    content TEXT,
    sender_id UUID REFERENCES staffs(id),
    sender_name TEXT,
    status TEXT DEFAULT '대기', -- '대기', '승인', '반려', '이동완료'
    meta_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. 알림 테이블
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES staffs(id),
    type TEXT,
    title TEXT,
    body TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. 거래처 테이블
CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    contact_person TEXT,
    phone TEXT,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. 초기 필수 데이터 (박철홍 병원장 계정)
INSERT INTO staffs (id, name, password, position, department, company, role)
VALUES (
    '00000000-0000-4000-a000-000000000001', 
    '박철홍', 
    'qkrcjfghd!!', 
    '병원장', 
    '행정팀', 
    '박철홍정형외과', 
    'admin'
);

-- 7. 인덱스 설정
CREATE INDEX idx_staffs_name ON staffs(name);
CREATE INDEX idx_inventory_company_dept ON inventory(company, department);
CREATE INDEX idx_notifications_user ON notifications(user_id);
