# Supabase SQL Editor 설정 가이드

이 시스템의 자동화 로직(재고 차감, 급여 연동, 권한 제어)을 활성화하기 위해 아래 SQL 코드를 Supabase SQL Editor에서 실행해 주세요.

## 1. 테이블 스키마 생성 및 확장

```sql
-- 1. 재고 관리 테이블 고도화 (단가 및 안전재고 필드 확인)
CREATE TABLE IF NOT EXISTS inventory (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    spec TEXT,
    stock INTEGER DEFAULT 0,
    min_stock INTEGER DEFAULT 10,
    price INTEGER DEFAULT 0,
    supplier TEXT,
    category TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 재고 입출고 로그 테이블
CREATE TABLE IF NOT EXISTS inventory_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    item_id TEXT, -- inventory 테이블의 name 또는 id와 매칭
    type TEXT, -- '입고', '출고', '출고(결재승인)' 등
    qty INTEGER,
    worker_id UUID REFERENCES auth.users(id),
    dept TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 전자결재 테이블 (메타데이터 활용)
CREATE TABLE IF NOT EXISTS approvals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sender_id UUID REFERENCES auth.users(id),
    approver_id UUID,
    approver_line JSONB, -- 결재선 배열
    type TEXT, -- '물품신청', '연차/휴가', '연장근무' 등
    title TEXT,
    content TEXT,
    meta_data JSONB, -- 물품 목록, 날짜 등 상세 데이터 저장
    status TEXT DEFAULT '대기', -- '대기', '승인', '반려'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 직원 정보 테이블 (권한 및 급여 기초 데이터)
-- 기존 staffs 테이블이 있다면 아래 필드들이 있는지 확인하고 추가해주세요.
ALTER TABLE staffs ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'staff'; -- 'admin', 'staff'
ALTER TABLE staffs ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE staffs ADD COLUMN IF NOT EXISTS base_salary INTEGER DEFAULT 0;
ALTER TABLE staffs ADD COLUMN IF NOT EXISTS annual_leave INTEGER DEFAULT 15;
```

## 2. 보안 정책 (RLS) 설정

행정팀과 일반 직원의 데이터 접근 권한을 분리합니다.

```sql
-- RLS 활성화
ALTER TABLE staffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;

-- 1. 본인 정보 조회 정책 (모든 직원)
CREATE POLICY "Users can view own data" ON staffs 
FOR SELECT USING (auth.uid() = id);

-- 2. 행정팀/관리자 전체 조회 정책
CREATE POLICY "Admins can view all data" ON staffs 
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM staffs 
        WHERE id = auth.uid() AND (role = 'admin' OR department = '행정팀')
    )
);

-- 3. 결재 문서 조회 정책 (기안자 또는 결재자)
CREATE POLICY "View related approvals" ON approvals
FOR SELECT USING (
    auth.uid() = sender_id OR 
    auth.uid()::text = ANY(SELECT jsonb_array_elements_text(approver_line))
);
```

## 3. 샘플 데이터 삽입 (테스트용)

```sql
-- 테스트용 재고 데이터
INSERT INTO inventory (name, spec, stock, min_stock, price, supplier)
VALUES 
('1회용 주사기(5cc)', '100ea/box', 150, 50, 150, '메디컬공급'),
('멸균 거즈(대)', '5cm x 5cm', 20, 30, 500, '한양상사'),
('수술용 마스크', 'KF94', 500, 100, 100, '안전케어')
ON CONFLICT (name) DO NOTHING;
```
