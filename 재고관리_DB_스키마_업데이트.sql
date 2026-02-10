-- 재고관리 시스템 데이터베이스 스키마 업데이트
-- Supabase SQL Editor에서 순서대로 실행하세요

-- ============================================
-- 1. 거래처(Suppliers) 테이블 생성
-- ============================================
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    contact TEXT,
    phone TEXT,
    address TEXT,
    email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE suppliers IS '의료용품 거래처 정보';
COMMENT ON COLUMN suppliers.name IS '거래처명';
COMMENT ON COLUMN suppliers.contact IS '담당자명';
COMMENT ON COLUMN suppliers.phone IS '연락처';
COMMENT ON COLUMN suppliers.address IS '주소';

-- ============================================
-- 2. 재고(Inventory) 테이블 확장
-- ============================================
-- 기존 inventory 테이블에 컬럼 추가
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS lot_number TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS is_udi_reportable BOOLEAN DEFAULT FALSE;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS category TEXT DEFAULT '일반';
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS min_stock INTEGER DEFAULT 10;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS manufacturer TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS storage_location TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES staffs(id) ON DELETE SET NULL;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 컬럼 설명
COMMENT ON COLUMN inventory.supplier_id IS '공급 거래처';
COMMENT ON COLUMN inventory.expiry_date IS '유효기간';
COMMENT ON COLUMN inventory.lot_number IS '제조 배치 번호';
COMMENT ON COLUMN inventory.is_udi_reportable IS '공급내역 보고 대상 여부 (UDI)';
COMMENT ON COLUMN inventory.category IS '물품 분류 (의료기기, 소모품, 약품 등)';
COMMENT ON COLUMN inventory.min_stock IS '안전재고 수량 (이하로 떨어지면 발주 알림)';
COMMENT ON COLUMN inventory.unit_price IS '단가';
COMMENT ON COLUMN inventory.barcode IS '바코드';
COMMENT ON COLUMN inventory.manufacturer IS '제조사';
COMMENT ON COLUMN inventory.storage_location IS '보관 위치';
COMMENT ON COLUMN inventory.notes IS '비고';

-- ============================================
-- 3. 발주서(Purchase Orders) 테이블 생성
-- ============================================
CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT,
    items JSONB NOT NULL, -- [{item_id: UUID, name: TEXT, qty: INTEGER, unit_price: DECIMAL}, ...]
    status TEXT DEFAULT '대기', -- '대기', '승인', '완료', '취소'
    total_amount DECIMAL(12, 2),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES staffs(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    approved_by UUID REFERENCES staffs(id) ON DELETE SET NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE purchase_orders IS '발주서 관리';
COMMENT ON COLUMN purchase_orders.items IS '발주 품목 목록 (JSON)';
COMMENT ON COLUMN purchase_orders.status IS '발주 상태';
COMMENT ON COLUMN purchase_orders.total_amount IS '총 발주액';

-- ============================================
-- 4. 입고 이력(Inventory Receipts) 테이블 생성
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID REFERENCES inventory(id) ON DELETE RESTRICT,
    qty INTEGER NOT NULL,
    unit_price DECIMAL(10, 2),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    receipt_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    receipt_type TEXT DEFAULT '수동', -- '수동', '스캔', '촬영', '발주'
    lot_number TEXT,
    expiry_date DATE,
    invoice_number TEXT,
    notes TEXT,
    created_by UUID REFERENCES staffs(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE inventory_receipts IS '입고 이력 관리';
COMMENT ON COLUMN inventory_receipts.receipt_type IS '입고 방식 (수동, 스캔, 촬영, 발주)';

-- ============================================
-- 5. UDI 보고서(UDI Reports) 테이블 생성
-- ============================================
CREATE TABLE IF NOT EXISTS udi_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reporter_id UUID REFERENCES staffs(id) ON DELETE SET NULL,
    items JSONB NOT NULL, -- UDI 대상 품목 목록
    total_items INTEGER,
    status TEXT DEFAULT '생성완료', -- '생성완료', '제출완료'
    submitted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE udi_reports IS 'UDI 공급내역 보고서';
COMMENT ON COLUMN udi_reports.items IS 'UDI 대상 품목 목록 (JSON)';

-- ============================================
-- 6. 재고 로그(Inventory Logs) 테이블 확장
-- ============================================
-- 기존 inventory_logs 테이블이 없으면 생성
CREATE TABLE IF NOT EXISTS inventory_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID REFERENCES inventory(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- '입고', '출고', '조정'
    qty INTEGER NOT NULL,
    worker_id UUID REFERENCES staffs(id) ON DELETE SET NULL,
    dept TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE inventory_logs IS '재고 입출고 이력';

-- ============================================
-- 7. 알림(Notifications) 테이블 확장
-- ============================================
-- inventory_alert 타입 알림을 위한 메타데이터 지원
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB;

COMMENT ON COLUMN notifications.metadata IS '알림 추가 정보 (JSON)';

-- ============================================
-- 8. 인덱스 생성 (성능 최적화)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_inventory_supplier ON inventory(supplier_id);
CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category);
CREATE INDEX IF NOT EXISTS idx_inventory_udi ON inventory(is_udi_reportable);
CREATE INDEX IF NOT EXISTS idx_inventory_low_stock ON inventory(stock, min_stock);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_inventory_receipts_item ON inventory_receipts(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_receipts_date ON inventory_receipts(receipt_date);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

-- ============================================
-- 9. RLS (Row Level Security) 정책 설정
-- ============================================
-- 모든 사용자가 재고 데이터를 읽을 수 있도록 설정
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "모든 사용자 재고 조회 가능" ON inventory FOR SELECT USING (true);
CREATE POLICY "인증된 사용자 재고 수정 가능" ON inventory FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "모든 사용자 거래처 조회 가능" ON suppliers FOR SELECT USING (true);
CREATE POLICY "인증된 사용자 거래처 수정 가능" ON suppliers FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "모든 사용자 발주서 조회 가능" ON purchase_orders FOR SELECT USING (true);
CREATE POLICY "인증된 사용자 발주서 수정 가능" ON purchase_orders FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE inventory_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "모든 사용자 입고이력 조회 가능" ON inventory_receipts FOR SELECT USING (true);
CREATE POLICY "인증된 사용자 입고이력 수정 가능" ON inventory_receipts FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE udi_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "모든 사용자 UDI보고서 조회 가능" ON udi_reports FOR SELECT USING (true);
CREATE POLICY "인증된 사용자 UDI보고서 수정 가능" ON udi_reports FOR ALL USING (auth.role() = 'authenticated');

-- ============================================
-- 10. 트리거 설정 (자동화)
-- ============================================
-- updated_at 자동 업데이트 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- inventory 테이블 updated_at 트리거
DROP TRIGGER IF EXISTS update_inventory_updated_at ON inventory;
CREATE TRIGGER update_inventory_updated_at
    BEFORE UPDATE ON inventory
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- suppliers 테이블 updated_at 트리거
DROP TRIGGER IF EXISTS update_suppliers_updated_at ON suppliers;
CREATE TRIGGER update_suppliers_updated_at
    BEFORE UPDATE ON suppliers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- purchase_orders 테이블 updated_at 트리거
DROP TRIGGER IF EXISTS update_purchase_orders_updated_at ON purchase_orders;
CREATE TRIGGER update_purchase_orders_updated_at
    BEFORE UPDATE ON purchase_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 11. 샘플 데이터 삽입 (선택사항)
-- ============================================
-- 거래처 샘플 데이터
INSERT INTO suppliers (name, contact, phone, address, email) VALUES
    ('수연메디칼', '홍길동', '02-1234-5678', '서울시 강남구 테헤란로 123', 'contact@suyeon.com'),
    ('메디텍코리아', '김철수', '02-9876-5432', '서울시 송파구 올림픽로 456', 'info@meditech.co.kr')
ON CONFLICT (name) DO NOTHING;

-- 완료 메시지
DO $$
BEGIN
    RAISE NOTICE '재고관리 시스템 데이터베이스 스키마 업데이트가 완료되었습니다.';
END $$;
