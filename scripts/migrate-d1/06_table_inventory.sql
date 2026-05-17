-- [측정 6] 전체 public 테이블 인벤토리 (실제 D1으로 옮길 테이블 확정용)
-- 결과 컬럼: table_name, rows, total_size
SELECT
  relname AS table_name,
  n_live_tup AS rows,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY relname ASC;
