-- [측정 5] BYTEA/BLOB 컬럼 존재 여부 (있으면 R2로 추가 이전 필요)
-- 결과: 비어 있으면 OK, 행이 나오면 해당 컬럼들 알려주세요
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND data_type IN ('bytea', 'blob');
