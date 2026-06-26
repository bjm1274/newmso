-- 1. 백정민 입사일 및 올해 연차 총량, 사용량 정정
UPDATE staff_members 
SET hire_date = '2023-11-01', 
    join_date = '2023-11-01',
    annual_leave_total = 15,
    annual_leave_used = 5
WHERE id = '38bd18fa-36ce-46d5-bb51-b9c55ac166e7';

-- 2. 잘못 발생했던 1~5월 월차 내역 삭제
DELETE FROM leave_accruals 
WHERE staff_id = '38bd18fa-36ce-46d5-bb51-b9c55ac166e7' 
  AND kind = 'monthly' 
  AND period_key LIKE '2026-%';

-- 3. 만 1년차 및 만 2년차 연차 자동 부여 내역 날짜 정정 (또는 없으면 INSERT)
INSERT OR IGNORE INTO leave_accruals (id, staff_id, company_id, kind, period_key, days, year, source_date, note, created_at)
VALUES ('e72d1948-d120-4b96-9609-d633423f5b01', '38bd18fa-36ce-46d5-bb51-b9c55ac166e7', '81eecc3a-2aa0-424a-a70b-6697e83e0d1a', 'annual', 'annual:1', 15, 2026, '2024-11-01', '만 1년차 연차 15일 자동부여', '2024-11-01T00:00:00.000Z');

INSERT OR IGNORE INTO leave_accruals (id, staff_id, company_id, kind, period_key, days, year, source_date, note, created_at)
VALUES ('3fa1ff2d-7cbd-4ad1-924d-66d0ca22837e', '38bd18fa-36ce-46d5-bb51-b9c55ac166e7', '81eecc3a-2aa0-424a-a70b-6697e83e0d1a', 'annual', 'annual:2', 15, 2026, '2025-11-01', '만 2년차 연차 15일 자동부여', '2025-11-01T00:00:00.000Z');

UPDATE leave_accruals 
SET source_date = '2024-11-01', 
    created_at = '2024-11-01T00:00:00.000Z'
WHERE staff_id = '38bd18fa-36ce-46d5-bb51-b9c55ac166e7' AND period_key = 'annual:1';

UPDATE leave_accruals 
SET source_date = '2025-11-01', 
    created_at = '2025-11-01T00:00:00.000Z'
WHERE staff_id = '38bd18fa-36ce-46d5-bb51-b9c55ac166e7' AND period_key = 'annual:2';

-- 4. 실제 1년 미만 시기(2023-11-01 ~ 2024-10-31) 동안의 만근 월차 11건 생성
INSERT OR IGNORE INTO leave_accruals (id, staff_id, company_id, kind, period_key, days, year, source_date, note, created_at)
VALUES ('b01b0001-c102-4304-8505-a606707a0001', '38bd18fa-36ce-46d5-bb51-b9c55ac166e7', '81eecc3a-2aa0-424a-a70b-6697e83e0d1a', 'monthly', '2023-11', 1, 2026, '2023-12-01', '1개월차 만근 +1일', '2023-12-01T09:00:00.000Z');

INSERT OR IGNORE INTO leave_accruals (id, staff_id, company_id, kind, period_key, days, year, source_date, note, created_at)
VALUES ('b01b0002-c102-4304-8505-a606707a0002', '38bd18fa-36ce-46d5-bb51-b9c55ac166e7', '81eecc3a-2aa0-424a-a70b-6697e83e0d1a', 'monthly', '2023-12', 1, 2026, '2024-01-01', '2개월차 만근 +1일', '2024-01-01T09:00:00.000Z');

INSERT OR IGNORE INTO leave_accruals (id, staff_id, company_id, kind, period_key, days, year, source_date, note, created_at)
VALUES ('b01b0003-c102-4304-8505-a606707a0003', '38bd18fa-36ce-46d5-bb51-b9c55ac166e7', '81eecc3a-2aa0-424a-a70b-6697e83e0d1a', 'monthly', '2024-01', 1, 2026, '2024-02-01', '3개월차 만근 +1일', '2024-02-01T09:00:00.000Z');

INSERT OR IGNORE INTO leave_accruals (id, staff_id, company_id, kind, period_key, days, year, source_date, note, created_at)
VALUES ('b01b0004-c102-4304-8505-a606707a0004', '38bd18fa-36ce-46d5-bb51-b9c55ac166e7', '81eecc3a-2aa0-424a-a70b-6697e83e0d1a', 'monthly', '2024-02', 1, 2026, '2024-03-01', '4개월차 만근 +1일', '2024-03-01T09:00:00.000Z');

INSERT OR IGNORE INTO leave_accruals (id, staff_id, company_id, kind, period_key, days, year, source_date, note, created_at)
VALUES ('b01b0005-c102-4304-8505-a606707a0005', '38bd18fa-36ce-46d5-bb51-b9c55ac166e7', '81eecc3a-2aa0-424a-a70b-6697e83e0d1a', 'monthly', '2024-03', 1, 2026, '2024-04-01', '5개월차 만근 +1일', '2024-04-01T09:00:00.000Z');

INSERT OR IGNORE INTO leave_accruals (id, staff_id, company_id, kind, period_key, days, year, source_date, note, created_at)
VALUES ('b01b0006-c102-4304-8505-a606707a0006', '38bd18fa-36ce-46d5-bb51-b9c55ac166e7', '81eecc3a-2aa0-424a-a70b-6697e83e0d1a', 'monthly', '2024-04', 1, 2026, '2024-05-01', '6개월차 만근 +1일', '2024-05-01T09:00:00.000Z');

INSERT OR IGNORE INTO leave_accruals (id, staff_id, company_id, kind, period_key, days, year, source_date, note, created_at)
VALUES ('b01b0007-c102-4304-8505-a606707a0007', '38bd18fa-36ce-46d5-bb51-b9c55ac166e7', '81eecc3a-2aa0-424a-a70b-6697e83e0d1a', 'monthly', '2024-05', 1, 2026, '2024-06-01', '7개월차 만근 +1일', '2024-06-01T09:00:00.000Z');

INSERT OR IGNORE INTO leave_accruals (id, staff_id, company_id, kind, period_key, days, year, source_date, note, created_at)
VALUES ('b01b0008-c102-4304-8505-a606707a0008', '38bd18fa-36ce-46d5-bb51-b9c55ac166e7', '81eecc3a-2aa0-424a-a70b-6697e83e0d1a', 'monthly', '2024-06', 1, 2026, '2024-07-01', '8개월차 만근 +1일', '2024-07-01T09:00:00.000Z');

INSERT OR IGNORE INTO leave_accruals (id, staff_id, company_id, kind, period_key, days, year, source_date, note, created_at)
VALUES ('b01b0009-c102-4304-8505-a606707a0009', '38bd18fa-36ce-46d5-bb51-b9c55ac166e7', '81eecc3a-2aa0-424a-a70b-6697e83e0d1a', 'monthly', '2024-07', 1, 2026, '2024-08-01', '9개월차 만근 +1일', '2024-08-01T09:00:00.000Z');

INSERT OR IGNORE INTO leave_accruals (id, staff_id, company_id, kind, period_key, days, year, source_date, note, created_at)
VALUES ('b01b0010-c102-4304-8505-a606707a0010', '38bd18fa-36ce-46d5-bb51-b9c55ac166e7', '81eecc3a-2aa0-424a-a70b-6697e83e0d1a', 'monthly', '2024-08', 1, 2026, '2024-09-01', '10개월차 만근 +1일', '2024-09-01T09:00:00.000Z');

INSERT OR IGNORE INTO leave_accruals (id, staff_id, company_id, kind, period_key, days, year, source_date, note, created_at)
VALUES ('b01b0011-c102-4304-8505-a606707a0011', '38bd18fa-36ce-46d5-bb51-b9c55ac166e7', '81eecc3a-2aa0-424a-a70b-6697e83e0d1a', 'monthly', '2024-09', 1, 2026, '2024-10-01', '11개월차 만근 +1일', '2024-10-01T09:00:00.000Z');

-- 5. leave_balances 테이블 갱신
UPDATE leave_balances
SET total_days = 15,
    used_days = 5,
    remaining_days = 10,
    updated_at = CURRENT_TIMESTAMP
WHERE staff_id = '38bd18fa-36ce-46d5-bb51-b9c55ac166e7' AND year = 2026;
