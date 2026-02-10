# 재고관리 고도화 - Supabase SQL 설정

## 1. 거래처 테이블
```sql
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    contact TEXT,
    phone TEXT,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 2. 재고 테이블 확장
```sql
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id);
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS lot_number TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS is_udi_reportable BOOLEAN DEFAULT FALSE;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS category TEXT DEFAULT '일반';
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS min_stock INTEGER DEFAULT 10;
```

## 3. 발주서 테이블
```sql
CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES suppliers(id),
    items JSONB, -- [{item_id, name, qty, unit_price}, ...]
    status TEXT DEFAULT '대기', -- '대기', '승인', '완료'
    total_amount DECIMAL(10, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES staffs(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    approved_by UUID REFERENCES staffs(id)
);
```

## 4. 입고 이력 테이블
```sql
CREATE TABLE IF NOT EXISTS inventory_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID REFERENCES inventory(id),
    qty INTEGER NOT NULL,
    unit_price DECIMAL(10, 2),
    supplier_id UUID REFERENCES suppliers(id),
    receipt_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    receipt_type TEXT DEFAULT '스캔', -- '스캔', '수동', '발주'
    lot_number TEXT,
    expiry_date DATE,
    created_by UUID REFERENCES staffs(id)
);
```

## 5. UDI 보고서 테이블
```sql
CREATE TABLE IF NOT EXISTS udi_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_date DATE NOT NULL,
    items JSONB, -- UDI 대상 품목 목록
    status TEXT DEFAULT '작성중', -- '작성중', '제출완료'
    created_by UUID REFERENCES staffs(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 6. 인덱스 생성 (성능 최적화)
```sql
CREATE INDEX idx_inventory_supplier ON inventory(supplier_id);
CREATE INDEX idx_inventory_udi ON inventory(is_udi_reportable);
CREATE INDEX idx_inventory_stock ON inventory(stock, min_stock);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX idx_inventory_receipts_item ON inventory_receipts(item_id);
```

## 7. 샘플 데이터 삽입
```sql
-- 거래처 샘플
INSERT INTO suppliers (name, contact, phone, address) VALUES
('의료용품 A사', '김철수', '02-1234-5678', '서울시 강남구'),
('약품 B사', '이영희', '031-9876-5432', '경기도 수원시'),
('의료기기 C사', '박준호', '051-5555-6666', '부산시 해운대구');

-- 재고 샘플 (UDI 대상)
INSERT INTO inventory (name, stock, unit_price, supplier_id, is_udi_reportable, category, min_stock, expiry_date, lot_number) VALUES
('인슐린 주사기', 500, 5000, (SELECT id FROM suppliers WHERE name='의료용품 A사'), TRUE, '의료기기', 100, '2026-12-31', 'LOT-2025-001'),
('수술용 장갑', 1000, 2000, (SELECT id FROM suppliers WHERE name='의료용품 A사'), FALSE, '소모품', 200, '2026-06-30', 'LOT-2025-002');
```

## 8. 권한 설정 (RLS)
```sql
-- 행정팀만 거래처 정보 수정 가능
CREATE POLICY "Admin can manage suppliers" ON suppliers
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM staffs 
            WHERE staffs.id = auth.uid() 
            AND (staffs.department = '행정팀' OR staffs.position = '병원장')
        )
    );

-- 모든 직원은 재고 조회 가능
CREATE POLICY "Everyone can view inventory" ON inventory
    FOR SELECT USING (true);

-- 행정팀만 발주서 생성/수정 가능
CREATE POLICY "Admin can manage purchase orders" ON purchase_orders
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM staffs 
            WHERE staffs.id = auth.uid() 
            AND (staffs.department = '행정팀' OR staffs.position = '병원장')
        )
    );
```

## 9. 자동화 트리거 (선택사항)
```sql
-- 발주 승인 시 알림 자동 생성
CREATE OR REPLACE FUNCTION notify_on_purchase_order_approval()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = '승인' AND OLD.status != '승인' THEN
        INSERT INTO notifications (user_id, type, title, body)
        SELECT 
            staffs.id,
            'inventory',
            '발주 승인됨',
            '발주 #' || NEW.id::text || '이 승인되었습니다.'
        FROM staffs 
        WHERE staffs.department = '행정팀';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER purchase_order_approval_trigger
AFTER UPDATE ON purchase_orders
FOR EACH ROW
EXECUTE FUNCTION notify_on_purchase_order_approval();
```

## 10. 테스트 쿼리
```sql
-- 안전재고 미달 품목 조회
SELECT id, name, stock, min_stock, supplier_id 
FROM inventory 
WHERE stock <= min_stock;

-- UDI 보고 대상 품목
SELECT id, name, lot_number, expiry_date, stock 
FROM inventory 
WHERE is_udi_reportable = TRUE;

-- 발주 현황
SELECT po.id, s.name as supplier, po.status, po.created_at
FROM purchase_orders po
LEFT JOIN suppliers s ON po.supplier_id = s.id
ORDER BY po.created_at DESC;
```
