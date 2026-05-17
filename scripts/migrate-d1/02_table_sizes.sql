-- [측정 2] 테이블별 row 수 + 사이즈 (큰 순, 상위 15개)
-- 결과 컬럼: table_name, rows, total_size, total_bytes
SELECT
  relname AS table_name,
  n_live_tup AS rows,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  pg_total_relation_size(relid) AS total_bytes
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 15;
