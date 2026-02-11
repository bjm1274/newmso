-- inventory 테이블에 보험코드/규격 컬럼 추가 (이미 존재하면 무시)
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS insurance_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS spec VARCHAR(100);

