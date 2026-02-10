-- ==========================================
-- 병원 ERP 통합 데이터베이스 스키마 (v4.5 사번체계 적용)
-- 테이블 충돌 방지를 위해 테이블명을 staff_members로 변경
-- 사번 체계: 관리자(1-10), 부서장(11-20), 직원(21-9999)
-- ==========================================

-- 1. 기존 테이블 삭제 (참조 관계 고려)
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS approvals CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS staff_members CASCADE;

-- 2. 직원 정보 테이블 (staff_members)
CREATE TABLE staff_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_no INTEGER UNIQUE NOT NULL, -- 사번 (아이디로 사용)
    name TEXT NOT NULL,                  -- 이름 (아이디로 사용 가능)
    password TEXT NOT NULL DEFAULT '1234',
    position TEXT,                       -- 직급
    department TEXT,                     -- 부서
    company TEXT,                        -- 소속 회사
    role TEXT DEFAULT 'staff',           -- admin, manager, staff
    email TEXT,
    phone TEXT,
    permissions JSONB DEFAULT '{"inventory": true, "hr": false, "approval": true, "admin": false}', -- 상세 권한
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. 재고 정보 테이블
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

-- 4. 전자결재 테이블
CREATE TABLE approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    content TEXT,
    sender_id UUID REFERENCES staff_members(id),
    sender_name TEXT,
    status TEXT DEFAULT '대기',
    meta_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. 알림 테이블
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES staff_members(id),
    type TEXT,
    title TEXT,
    body TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. 거래처 테이블
CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    contact_person TEXT,
    phone TEXT,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. 초기 필수 데이터 (박철홍 병원장 - 사번 1번)
INSERT INTO staff_members (id, employee_no, name, password, position, department, company, role)
VALUES (
    '00000000-0000-4000-a000-000000000001', 
    1,             -- 사번 1번 (관리자)
    '박철홍', 
    'qkrcjfghd!!', 
    '병원장', 
    '행정팀', 
    '박철홍정형외과', 
    'admin'
);

-- 초기 관리자 권한 설정
UPDATE staff_members SET permissions = '{"inventory": true, "hr": true, "approval": true, "admin": true}' WHERE employee_no = 1;


-- 8. 인덱스 설정
CREATE INDEX idx_staff_members_no ON staff_members(employee_no);
CREATE INDEX idx_staff_members_name ON staff_members(name);
CREATE INDEX idx_inventory_stock ON inventory(stock, min_stock);
