# Supabase 통합 테이블 생성 및 설정 (오류 해결용)

`staffs` 테이블이 없다는 오류를 해결하기 위해, 기초 테이블 생성부터 권한 설정까지 한 번에 처리하는 코드입니다.

## 1. 모든 테이블 생성 (순서대로 실행)

```sql
-- 1. 직원 정보 테이블 (가장 먼저 생성)
CREATE TABLE IF NOT EXISTS staffs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE,
    name TEXT NOT NULL,
    position TEXT, -- '팀장', '부장', '원장', '간호사' 등
    department TEXT, -- '행정팀', '진료부', '간호부' 등
    company TEXT, -- '박철홍정형외과', 'SY INC.', '수연의원' 등
    role TEXT DEFAULT 'staff', -- 'admin' 또는 'staff'
    base_salary INTEGER DEFAULT 0, -- 기본급
    annual_leave INTEGER DEFAULT 15, -- 잔여 연차
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 재고 관리 테이블
CREATE TABLE IF NOT EXISTS inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    spec TEXT,
    stock INTEGER DEFAULT 0,
    min_stock INTEGER DEFAULT 10,
    price INTEGER DEFAULT 0,
    supplier TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 재고 로그 테이블
CREATE TABLE IF NOT EXISTS inventory_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id TEXT,
    type TEXT,
    qty INTEGER,
    worker_id UUID REFERENCES staffs(id),
    dept TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 전자결재 테이블
CREATE TABLE IF NOT EXISTS approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES staffs(id),
    approver_id UUID REFERENCES staffs(id),
    approver_line JSONB,
    type TEXT,
    title TEXT,
    content TEXT,
    meta_data JSONB,
    status TEXT DEFAULT '대기',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. 근태 기록 테이블
CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID REFERENCES staffs(id),
    date DATE DEFAULT CURRENT_DATE,
    check_in TIMESTAMP WITH TIME ZONE,
    check_out TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT '정상',
    is_approved BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 2. 테스트용 관리자 계정 생성 (예시)

실제로 로그인하시는 이메일 주소로 수정하여 실행하시면 해당 계정에 행정팀 권한이 부여됩니다.

```sql
INSERT INTO staffs (email, name, position, department, role, company)
VALUES ('admin@example.com', '관리자', '팀장', '행정팀', 'admin', '박철홍정형외과')
ON CONFLICT (email) DO UPDATE 
SET role = 'admin', department = '행정팀';
```

## 3. 재고 샘플 데이터

```sql
INSERT INTO inventory (name, spec, stock, min_stock, price, supplier)
VALUES 
('1회용 주사기(5cc)', '100ea/box', 150, 50, 150, '메디컬공급'),
('멸균 거즈(대)', '5cm x 5cm', 20, 30, 500, '한양상사')
ON CONFLICT (name) DO NOTHING;
```
