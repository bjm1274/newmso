-- SY INC. MSO 통합 관리 시스템 - 최종 DB 스키마
-- 작성일: 2026-02-07

-- 1. 직원 정보 테이블 (staff_members)
CREATE TABLE staff_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_no VARCHAR(20) UNIQUE NOT NULL, -- 사번
    name VARCHAR(50) NOT NULL,
    company VARCHAR(50) NOT NULL, -- SY INC., 박철홍정형외과, 수연의원
    department VARCHAR(50),
    position VARCHAR(50),
    email VARCHAR(100),
    phone VARCHAR(20),
    join_date DATE,
    status VARCHAR(20) DEFAULT '재직', -- 재직, 휴직, 퇴사
    role VARCHAR(20) DEFAULT 'user', -- admin, user
    annual_leave_total DECIMAL(4,1) DEFAULT 15.0,
    annual_leave_used DECIMAL(4,1) DEFAULT 0.0,
    base_salary BIGINT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 재고 관리 테이블 (inventory)
CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company VARCHAR(50) NOT NULL,
    category VARCHAR(50),
    item_name VARCHAR(100) NOT NULL,
    quantity INT DEFAULT 0,
    min_quantity INT DEFAULT 5, -- 안전재고
    unit_price BIGINT DEFAULT 0, -- 단가
    expiry_date DATE, -- 유효기간
    lot_number VARCHAR(50), -- LOT 번호
    is_udi BOOLEAN DEFAULT FALSE,
    udi_code VARCHAR(100),
    location VARCHAR(100),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 전자결재 테이블 (approvals)
CREATE TABLE approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID REFERENCES staff_members(id),
    sender_name VARCHAR(50),
    sender_company VARCHAR(50),
    type VARCHAR(50), -- 연차신청, 비품구매, 지출결의 등
    title VARCHAR(200) NOT NULL,
    content TEXT,
    status VARCHAR(20) DEFAULT '대기', -- 대기, 승인, 반려
    current_approver_id UUID, -- 현재 결재권자 (MSO 관리자 등)
    meta_data JSONB, -- 추가 정보 (연차 날짜, 물품 목록 등)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 채팅방 테이블 (chat_rooms)
CREATE TABLE chat_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100),
    type VARCHAR(20), -- direct, group
    members UUID[], -- 멤버 ID 배열
    is_announcement BOOLEAN DEFAULT FALSE,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. 채팅 메시지 테이블 (chat_messages)
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES chat_rooms(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES staff_members(id),
    content TEXT NOT NULL,
    type VARCHAR(20) DEFAULT 'text',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. 게시판 테이블 (board_posts)
CREATE TABLE board_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    board_type VARCHAR(50), -- 자유게시판, 공지사항, 수술일정 등
    title VARCHAR(200) NOT NULL,
    content TEXT,
    author_id UUID,
    author_name VARCHAR(50),
    company VARCHAR(50),
    views INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 초기 데이터 예시 (SY INC. 관리자)
-- INSERT INTO staff_members (employee_no, name, company, department, position, role, base_salary)
-- VALUES ('SY001', '관리자', 'SY INC.', '경영지원팀', '팀장', 'admin', 5000000);
