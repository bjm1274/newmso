-- [측정 1] 전체 DB 사이즈 (D1 한도 10GB)
-- 결과 컬럼: db_total_size (예: '450 MB'), db_total_bytes
SELECT pg_size_pretty(pg_database_size(current_database())) AS db_total_size,
       pg_database_size(current_database()) AS db_total_bytes;
