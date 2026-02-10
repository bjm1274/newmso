-- ==========================================
-- 병원 ERP 통합 시스템 데이터베이스 스키마 (v4.7)
-- 작성일: 2026-02-07
-- 특징: 사번 체계 적용, 이름 기반 로그인, 상세 권한 제어 포함
-- ==========================================

-- 1. 기존 테이블 삭제 (참조 관계 고려하여 순차 삭제)
DROP TABLE IF EXISTS inventory_logs CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS staff_members CASCADE;
DROP TABLE IF EXISTS approval_requests CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;

-- 2. 직원 정보 테이블 생성 (사번 체계 및 권한 필드 포함)
CREATE TABLE staff_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_no INTEGER UNIQUE NOT NULL,         -- 사번 (관리자 1-10, 부서장 11-20, 직원 21+)
    name TEXT NOT NULL,                          -- 성함 (아이디로 사용 가능)
    password TEXT NOT NULL,                      -- 비밀번호
    position TEXT,                               -- 직급
    department TEXT,                             -- 부서
    company TEXT,                                -- 소속 회사
    role TEXT DEFAULT 'staff',                   -- admin, manager, staff
    email TEXT,
    phone TEXT,
    permissions JSONB DEFAULT '{"inventory": true, "hr": false, "approval": true, "admin": false}', -- 상세 권한
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. 재고 정보 테이블 생성
CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_name TEXT NOT NULL,                     -- 품목명
    category TEXT,                               -- 분류
    quantity INTEGER DEFAULT 0,                  -- 현재 수량
    unit_price INTEGER DEFAULT 0,                -- 단가
    supplier TEXT,                               -- 공급업체
    min_quantity INTEGER DEFAULT 10,             -- 최소 재고량 (발주 알림 기준)
    expiry_date DATE,                            -- 유효기간
    lot_number TEXT,                             -- LOT 번호
    is_udi BOOLEAN DEFAULT false,                -- UDI(공급내역 보고) 대상 여부
    company TEXT,                                -- 관리 회사
    department TEXT,                             -- 관리 부서
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. 재고 변동 로그 테이블
CREATE TABLE inventory_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_id UUID REFERENCES inventory(id),
    change_type TEXT,                            -- 입고, 출고, 이동, 조정
    quantity INTEGER,
    prev_quantity INTEGER,
    next_quantity INTEGER,
    reason TEXT,
    actor_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. 결재 및 알림 테이블
CREATE TABLE approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID REFERENCES staff_members(id),
    title TEXT,
    content TEXT,
    status TEXT DEFAULT 'pending',               -- pending, approved, rejected
    request_type TEXT,                           -- 물품신청, 연차, 지출 등
    target_department TEXT,                      -- 물품 이동 대상 부서
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_role TEXT,                            -- admin, manager, staff
    target_dept TEXT,
    message TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. 초기 필수 데이터 입력 (박철홍 병원장 계정 - 사번 1번)
INSERT INTO staff_members (
    employee_no, 
    name, 
    password, 
    position, 
    department, 
    company, 
    role,
    permissions
) VALUES (
    1, 
    '박철홍', 
    'qkrcjfghd!!', 
    '병원장', 
    '행정팀', 
    '박철홍정형외과', 
    'admin',
    '{"inventory": true, "hr": true, "approval": true, "admin": true}'
);

-- 7. 인덱스 설정
CREATE INDEX idx_staff_members_no ON staff_members(employee_no);
CREATE INDEX idx_staff_members_name ON staff_members(name);
CREATE INDEX idx_inventory_company_dept ON inventory(company, department);
