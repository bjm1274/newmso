# 재고 테이블(inventory) 컬럼 오류 해결 SQL

현재 `inventory` 테이블에 `stock`이나 `min_stock` 컬럼이 없어 발생하는 오류를 해결하는 두 가지 방법입니다.

## 방법 1: 기존 테이블 삭제 후 새로 만들기 (추천)
기존에 테스트 데이터가 중요하지 않다면, 테이블을 삭제하고 정확한 구조로 다시 만드는 것이 가장 확실합니다.

```sql
-- 1. 기존 테이블 삭제 (로그 테이블이 참조하고 있다면 함께 삭제)
DROP TABLE IF EXISTS inventory_logs;
DROP TABLE IF EXISTS inventory;

-- 2. 정확한 구조로 다시 생성
CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    spec TEXT,
    stock INTEGER DEFAULT 0,       -- 현재고
    min_stock INTEGER DEFAULT 10,  -- 안전재고(최소유지)
    price INTEGER DEFAULT 0,       -- 단가
    supplier TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 로그 테이블 다시 생성 (관계를 위해)
CREATE TABLE inventory_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id TEXT,
    type TEXT,
    qty INTEGER,
    worker_id UUID,
    dept TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 샘플 데이터 삽입
INSERT INTO inventory (name, spec, stock, min_stock, price, supplier)
VALUES 
('1회용 주사기(5cc)', '100ea/box', 150, 50, 150, '메디컬공급'),
('멸균 거즈(대)', '5cm x 5cm', 20, 30, 500, '한양상사');
```

## 방법 2: 기존 테이블에 부족한 컬럼만 추가하기
기존 데이터를 유지해야 하는 경우 아래 코드를 실행하세요.

```sql
-- 부족한 컬럼들 하나씩 추가
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS min_stock INTEGER DEFAULT 10;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS price INTEGER DEFAULT 0;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS spec TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS supplier TEXT;
```
