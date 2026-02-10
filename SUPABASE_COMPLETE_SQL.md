# Supabase SQL 전체 설정 명령어

> **⚠️ 중요**: 아래 SQL 명령어를 **순서대로** Supabase SQL Editor에서 실행하세요.

---

## 📋 목차
1. [테이블 생성](#테이블-생성)
2. [인덱스 생성](#인덱스-생성)
3. [권한 설정 (RLS)](#권한-설정-rls)
4. [샘플 데이터](#샘플-데이터)
5. [트리거 및 자동화](#트리거-및-자동화)

---

## 테이블 생성

### 1단계: 거래처(Suppliers) 테이블
```sql
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
```

### 2단계: 재고(Inventory) 테이블 확장
```sql
-- 기존 inventory 테이블에 컬럼 추가
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS lot_number TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS is_udi_reportable BOOLEAN DEFAULT FALSE;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS category TEXT DEFAULT '일반';
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS min_stock INTEGER DEFAULT 10;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 컬럼 설명
COMMENT ON COLUMN inventory.supplier_id IS '공급 거래처';
COMMENT ON COLUMN inventory.expiry_date IS '유효기간';
COMMENT ON COLUMN inventory.lot_number IS '제조 배치 번호';
COMMENT ON COLUMN inventory.is_udi_reportable IS '공급내역 보고 대상 여부';
COMMENT ON COLUMN inventory.category IS '물품 분류';
COMMENT ON COLUMN inventory.min_stock IS '안전재고 수량';
COMMENT ON COLUMN inventory.unit_price IS '단가';
```

### 3단계: 발주서(Purchase Orders) 테이블
```sql
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
```

### 4단계: 입고 이력(Inventory Receipts) 테이블
```sql
CREATE TABLE IF NOT EXISTS inventory_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID REFERENCES inventory(id) ON DELETE RESTRICT,
    qty INTEGER NOT NULL,
    unit_price DECIMAL(10, 2),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    receipt_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    receipt_type TEXT DEFAULT '수동', -- '수동', '스캔', '발주'
    lot_number TEXT,
    expiry_date DATE,
    invoice_number TEXT,
    notes TEXT,
    created_by UUID REFERENCES staffs(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE inventory_receipts IS '물품 입고 이력';
COMMENT ON COLUMN inventory_receipts.receipt_type IS '입고 방식';
COMMENT ON COLUMN inventory_receipts.invoice_number IS '송장 번호';
```

### 5단계: UDI 보고서(UDI Reports) 테이블
```sql
CREATE TABLE IF NOT EXISTS udi_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_date DATE NOT NULL,
    items JSONB NOT NULL, -- UDI 대상 품목 목록
    status TEXT DEFAULT '작성중', -- '작성중', '제출완료', '반려'
    submission_date TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_by UUID REFERENCES staffs(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE udi_reports IS 'UDI 공급내역 보고서';
COMMENT ON COLUMN udi_reports.report_date IS '보고 대상 날짜';
COMMENT ON COLUMN udi_reports.items IS '보고 품목 목록 (JSON)';
```

### 6단계: 재고 조정(Inventory Adjustments) 테이블
```sql
CREATE TABLE IF NOT EXISTS inventory_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID REFERENCES inventory(id) ON DELETE RESTRICT,
    adjustment_qty INTEGER NOT NULL, -- 양수: 증가, 음수: 감소
    reason TEXT NOT NULL, -- '손상', '분실', '폐기', '반품', '기타'
    notes TEXT,
    created_by UUID REFERENCES staffs(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approved_by UUID REFERENCES staffs(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE inventory_adjustments IS '재고 조정 기록';
COMMENT ON COLUMN inventory_adjustments.adjustment_qty IS '조정 수량';
COMMENT ON COLUMN inventory_adjustments.reason IS '조정 사유';
```

---

## 인덱스 생성

```sql
-- 성능 최적화를 위한 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_inventory_supplier ON inventory(supplier_id);
CREATE INDEX IF NOT EXISTS idx_inventory_udi ON inventory(is_udi_reportable);
CREATE INDEX IF NOT EXISTS idx_inventory_stock ON inventory(stock, min_stock);
CREATE INDEX IF NOT EXISTS idx_inventory_expiry ON inventory(expiry_date);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created ON purchase_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_receipts_item ON inventory_receipts(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_receipts_supplier ON inventory_receipts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_inventory_receipts_date ON inventory_receipts(receipt_date DESC);
CREATE INDEX IF NOT EXISTS idx_udi_reports_date ON udi_reports(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_item ON inventory_adjustments(item_id);
```

---

## 권한 설정 (RLS)

### 1. Inventory 테이블 권한
```sql
-- 기존 RLS 정책 확인 및 활성화
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

-- 모든 직원은 재고 조회 가능
CREATE POLICY "Everyone can view inventory" ON inventory
    FOR SELECT USING (true);

-- 행정팀/관리자만 재고 수정 가능
CREATE POLICY "Admin can update inventory" ON inventory
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM staffs 
            WHERE staffs.id = auth.uid() 
            AND (staffs.department = '행정팀' OR staffs.position = '병원장')
        )
    );

-- 행정팀/관리자만 재고 삭제 가능
CREATE POLICY "Admin can delete inventory" ON inventory
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM staffs 
            WHERE staffs.id = auth.uid() 
            AND (staffs.department = '행정팀' OR staffs.position = '병원장')
        )
    );
```

### 2. Suppliers 테이블 권한
```sql
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

-- 모든 직원은 거래처 조회 가능
CREATE POLICY "Everyone can view suppliers" ON suppliers
    FOR SELECT USING (true);

-- 행정팀/관리자만 거래처 관리 가능
CREATE POLICY "Admin can manage suppliers" ON suppliers
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM staffs 
            WHERE staffs.id = auth.uid() 
            AND (staffs.department = '행정팀' OR staffs.position = '병원장')
        )
    );
```

### 3. Purchase Orders 테이블 권한
```sql
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

-- 행정팀/관리자만 발주서 조회 가능
CREATE POLICY "Admin can view purchase orders" ON purchase_orders
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM staffs 
            WHERE staffs.id = auth.uid() 
            AND (staffs.department = '행정팀' OR staffs.position = '병원장')
        )
    );

-- 행정팀/관리자만 발주서 생성/수정 가능
CREATE POLICY "Admin can manage purchase orders" ON purchase_orders
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM staffs 
            WHERE staffs.id = auth.uid() 
            AND (staffs.department = '행정팀' OR staffs.position = '병원장')
        )
    );
```

### 4. Inventory Receipts 테이블 권한
```sql
ALTER TABLE inventory_receipts ENABLE ROW LEVEL SECURITY;

-- 행정팀/의료진은 입고 이력 조회 가능
CREATE POLICY "Staff can view receipts" ON inventory_receipts
    FOR SELECT USING (true);

-- 행정팀/관리자만 입고 기록 생성 가능
CREATE POLICY "Admin can create receipts" ON inventory_receipts
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM staffs 
            WHERE staffs.id = auth.uid() 
            AND (staffs.department = '행정팀' OR staffs.position = '병원장')
        )
    );
```

### 5. UDI Reports 테이블 권한
```sql
ALTER TABLE udi_reports ENABLE ROW LEVEL SECURITY;

-- 행정팀/관리자만 UDI 보고서 관리 가능
CREATE POLICY "Admin can manage udi reports" ON udi_reports
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM staffs 
            WHERE staffs.id = auth.uid() 
            AND (staffs.department = '행정팀' OR staffs.position = '병원장')
        )
    );
```

---

## 샘플 데이터

### 거래처 샘플 데이터
```sql
-- 거래처 추가
INSERT INTO suppliers (name, contact, phone, address, email) VALUES
('의료용품 A사', '김철수', '02-1234-5678', '서울시 강남구 테헤란로 123', 'contact@a-medical.com'),
('약품 B사', '이영희', '031-9876-5432', '경기도 수원시 팔달구 456', 'sales@b-pharma.com'),
('의료기기 C사', '박준호', '051-5555-6666', '부산시 해운대구 789', 'info@c-device.com'),
('소모품 D사', '최민지', '070-1111-2222', '인천시 남동구 321', 'order@d-supplies.com');
```

### 재고 샘플 데이터
```sql
-- 기존 재고에 상세 정보 추가 (예시)
UPDATE inventory SET 
    supplier_id = (SELECT id FROM suppliers WHERE name = '의료용품 A사' LIMIT 1),
    is_udi_reportable = TRUE,
    category = '의료기기',
    min_stock = 50,
    unit_price = 5000,
    expiry_date = '2026-12-31',
    lot_number = 'LOT-2025-001'
WHERE name = '인슐린 주사기';

UPDATE inventory SET 
    supplier_id = (SELECT id FROM suppliers WHERE name = '소모품 D사' LIMIT 1),
    is_udi_reportable = FALSE,
    category = '소모품',
    min_stock = 100,
    unit_price = 2000,
    expiry_date = '2026-06-30',
    lot_number = 'LOT-2025-002'
WHERE name = '수술용 장갑';

-- 신규 물품 추가
INSERT INTO inventory (name, stock, unit_price, supplier_id, is_udi_reportable, category, min_stock, expiry_date, lot_number) VALUES
('소독용 알콜 500ml', 200, 15000, (SELECT id FROM suppliers WHERE name = '약품 B사' LIMIT 1), FALSE, '소모품', 50, '2026-08-31', 'LOT-2025-003'),
('멸균 거즈 10x10cm', 500, 1000, (SELECT id FROM suppliers WHERE name = '소모품 D사' LIMIT 1), FALSE, '소모품', 100, '2026-09-30', 'LOT-2025-004'),
('혈당 측정기', 30, 45000, (SELECT id FROM suppliers WHERE name = '의료기기 C사' LIMIT 1), TRUE, '의료기기', 10, '2027-03-31', 'LOT-2025-005');
```

---

## 트리거 및 자동화

### 1. 발주 승인 시 알림 생성
```sql
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
        WHERE staffs.department = '행정팀' OR staffs.position = '병원장';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성
DROP TRIGGER IF NOT EXISTS purchase_order_approval_trigger ON purchase_orders;
CREATE TRIGGER purchase_order_approval_trigger
AFTER UPDATE ON purchase_orders
FOR EACH ROW
EXECUTE FUNCTION notify_on_purchase_order_approval();
```

### 2. 안전재고 미달 시 자동 알림
```sql
CREATE OR REPLACE FUNCTION check_low_stock()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.stock <= NEW.min_stock THEN
        INSERT INTO notifications (user_id, type, title, body)
        SELECT 
            staffs.id,
            'inventory',
            '안전재고 미달 - ' || NEW.name,
            '현재고: ' || NEW.stock || '개 | 최소: ' || NEW.min_stock || '개'
        FROM staffs 
        WHERE staffs.department = '행정팀' OR staffs.position = '병원장';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성
DROP TRIGGER IF NOT EXISTS low_stock_trigger ON inventory;
CREATE TRIGGER low_stock_trigger
AFTER UPDATE ON inventory
FOR EACH ROW
EXECUTE FUNCTION check_low_stock();
```

### 3. 입고 시 재고 자동 증가
```sql
CREATE OR REPLACE FUNCTION update_inventory_on_receipt()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE inventory 
    SET stock = stock + NEW.qty,
        updated_at = NOW()
    WHERE id = NEW.item_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성
DROP TRIGGER IF NOT EXISTS receipt_update_inventory_trigger ON inventory_receipts;
CREATE TRIGGER receipt_update_inventory_trigger
AFTER INSERT ON inventory_receipts
FOR EACH ROW
EXECUTE FUNCTION update_inventory_on_receipt();
```

### 4. 유효기간 만료 알림 (매일 자정 실행)
```sql
-- 주의: Supabase에서는 cron job이 제한적이므로, 
-- 클라이언트 측에서 주기적으로 확인하는 것을 권장합니다.

-- 만료 임박 물품 조회 쿼리 (30일 이내)
SELECT id, name, expiry_date, stock, lot_number
FROM inventory
WHERE expiry_date IS NOT NULL
  AND expiry_date <= CURRENT_DATE + INTERVAL '30 days'
  AND expiry_date > CURRENT_DATE
  AND stock > 0
ORDER BY expiry_date ASC;
```

---

## 테스트 쿼리

### 1. 안전재고 미달 품목 조회
```sql
SELECT 
    id, name, stock, min_stock, 
    (min_stock - stock) as 부족수량,
    supplier_id
FROM inventory 
WHERE stock <= min_stock
ORDER BY (min_stock - stock) DESC;
```

### 2. UDI 보고 대상 품목
```sql
SELECT 
    id, name, lot_number, expiry_date, stock, 
    supplier_id, category
FROM inventory 
WHERE is_udi_reportable = TRUE
ORDER BY expiry_date ASC;
```

### 3. 발주 현황
```sql
SELECT 
    po.id, 
    s.name as 거래처, 
    po.status, 
    po.total_amount,
    po.created_at,
    staffs.name as 신청자
FROM purchase_orders po
LEFT JOIN suppliers s ON po.supplier_id = s.id
LEFT JOIN staffs ON po.created_by = staffs.id
ORDER BY po.created_at DESC;
```

### 4. 최근 입고 이력
```sql
SELECT 
    ir.id,
    inv.name as 제품명,
    ir.qty,
    ir.unit_price,
    ir.receipt_type,
    ir.lot_number,
    ir.expiry_date,
    s.name as 거래처,
    ir.receipt_date
FROM inventory_receipts ir
LEFT JOIN inventory inv ON ir.item_id = inv.id
LEFT JOIN suppliers s ON ir.supplier_id = s.id
ORDER BY ir.receipt_date DESC
LIMIT 50;
```

### 5. 유효기간 만료 임박 품목 (30일 이내)
```sql
SELECT 
    id, name, expiry_date, stock, lot_number,
    (expiry_date - CURRENT_DATE) as 남은일수
FROM inventory
WHERE expiry_date IS NOT NULL
  AND expiry_date <= CURRENT_DATE + INTERVAL '30 days'
  AND expiry_date > CURRENT_DATE
  AND stock > 0
ORDER BY expiry_date ASC;
```

### 6. 재고 조정 이력
```sql
SELECT 
    ia.id,
    inv.name as 제품명,
    ia.adjustment_qty,
    ia.reason,
    ia.notes,
    staffs.name as 신청자,
    ia.created_at
FROM inventory_adjustments ia
LEFT JOIN inventory inv ON ia.item_id = inv.id
LEFT JOIN staffs ON ia.created_by = staffs.id
ORDER BY ia.created_at DESC;
```

---

## 실행 순서 가이드

1. **테이블 생성** (1단계 ~ 6단계)
   - 거래처 → 재고 확장 → 발주서 → 입고이력 → UDI보고 → 재고조정

2. **인덱스 생성**
   - 성능 최적화

3. **권한 설정 (RLS)**
   - 보안 강화

4. **샘플 데이터**
   - 테스트 데이터 추가

5. **트리거 및 자동화**
   - 자동 알림 및 업데이트

---

## ⚠️ 주의사항

- **순서 중요**: 테이블은 반드시 위 순서대로 생성하세요.
- **외래키**: 참조 관계가 있으므로 순서 변경 금지
- **RLS 활성화**: 권한 설정 후 데이터 접근 제한
- **백업**: 중요한 데이터이므로 정기적 백업 필수
- **테스트**: 프로덕션 전 테스트 환경에서 먼저 실행

---

## 🆘 문제 해결

| 오류 | 원인 | 해결 방법 |
|:---|:---|:---|
| `relation does not exist` | 테이블이 없음 | 테이블 생성 단계 재실행 |
| `foreign key violation` | 참조 테이블 없음 | 순서대로 실행 확인 |
| `permission denied` | RLS 권한 없음 | 권한 설정 확인 |
| `duplicate key` | 중복 데이터 | 기존 데이터 확인 후 삽입 |

---

**마지막 업데이트**: 2026년 2월
**버전**: 1.0
