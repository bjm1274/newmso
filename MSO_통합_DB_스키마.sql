-- ==========================================
-- SY INC. MSO 통합 시스템 데이터베이스 스키마 (v5.0)
-- 작성일: 2026-02-07
-- 특징: SY INC.(MSO), 박철홍정형외과, 수연의원 3사 통합 관리 구조
-- ==========================================

-- 1. 기존 테이블 삭제 (참조 관계 고려하여 순차 삭제)
DROP TABLE IF EXISTS inventory_logs CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS staff_members CASCADE;
DROP TABLE IF EXISTS approvals CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS attendance CASCADE;

-- 2. 직원 정보 테이블 생성 (회사 구분 및 MSO 권한 포함)
CREATE TABLE staff_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_no INTEGER UNIQUE NOT NULL,         -- 사번
    name TEXT NOT NULL,                          -- 성함
    password TEXT NOT NULL,                      -- 비밀번호
    position TEXT,                               -- 직급
    department TEXT,                             -- 부서
    company TEXT NOT NULL,                       -- 소속 회사 (SY INC., 박철홍정형외과, 수연의원)
    role TEXT DEFAULT 'staff',                   -- admin, manager, staff
    email TEXT,
    phone TEXT,
    annual_leave INTEGER DEFAULT 15,             -- 연차 잔여일수
    permissions JSONB DEFAULT '{"inventory": true, "hr": false, "approval": true, "admin": false, "mso": false}', -- mso 권한 추가
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
    min_quantity INTEGER DEFAULT 10,             -- 최소 재고량
    expiry_date DATE,                            -- 유효기간
    lot_number TEXT,                             -- LOT 번호
    is_udi BOOLEAN DEFAULT false,                -- UDI 대상 여부
    company TEXT NOT NULL,                       -- 관리 회사 (박철홍정형외과, 수연의원 등)
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
    company TEXT,                                -- 발생 회사
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. 전자결재 테이블
CREATE TABLE approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES staff_members(id),
    sender_name TEXT,
    sender_company TEXT,
    approver_id UUID REFERENCES staff_members(id), -- 현재 결재자
    approver_line JSONB,                         -- 결재선 (ID 배열)
    type TEXT,                                   -- 연차/휴가, 물품신청, 업무기안 등
    title TEXT,
    content TEXT,
    status TEXT DEFAULT '대기',                  -- 대기, 승인, 반려
    meta_data JSONB,                             -- 추가 데이터 (연차일자, 물품목록 등)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. 알림 테이블
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES staff_members(id),
    type TEXT,
    title TEXT,
    body TEXT,
    is_read BOOLEAN DEFAULT false,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. 근태 테이블
CREATE TABLE attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID REFERENCES staff_members(id),
    date DATE NOT NULL,
    status TEXT,                                 -- 출근, 휴가, 지각, 조퇴
    is_approved BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(staff_id, date)
);

-- 8. 초기 필수 데이터 입력

-- SY INC. 관리자 (MSO 총괄)
INSERT INTO staff_members (employee_no, name, password, position, department, company, role, permissions) 
VALUES (100, 'MSO관리자', 'syinc!!', '본부장', '경영지원팀', 'SY INC.', 'admin', '{"inventory": true, "hr": true, "approval": true, "admin": true, "mso": true}');

-- 박철홍정형외과 원장
INSERT INTO staff_members (employee_no, name, password, position, department, company, role, permissions) 
VALUES (1, '박철홍', 'qkrcjfghd!!', '병원장', '행정팀', '박철홍정형외과', 'admin', '{"inventory": true, "hr": true, "approval": true, "admin": true, "mso": false}');

-- 수연의원 원장
INSERT INTO staff_members (employee_no, name, password, position, department, company, role, permissions) 
VALUES (2, '수연원장', 'sy1234!!', '원장', '행정팀', '수연의원', 'admin', '{"inventory": true, "hr": true, "approval": true, "admin": true, "mso": false}');

-- 9. 인덱스 설정
CREATE INDEX idx_staff_members_company ON staff_members(company);
CREATE INDEX idx_inventory_company ON inventory(company);
CREATE INDEX idx_approvals_status ON approvals(status);
