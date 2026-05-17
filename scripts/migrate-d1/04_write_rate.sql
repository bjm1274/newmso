-- [측정 4] 최근 7일 insertion rate (D1 write throughput ~50/s 한도 점검)
-- 결과 컬럼: table_name, last_7d_rows, rows_per_min_avg
SELECT table_name, last_7d_rows, rows_per_min_avg FROM (
  SELECT 'chat_messages' AS table_name,
         COUNT(*) AS last_7d_rows,
         ROUND(COUNT(*)::NUMERIC / 7 / 24 / 60, 2) AS rows_per_min_avg
  FROM chat_messages WHERE created_at > NOW() - INTERVAL '7 days'
  UNION ALL
  SELECT 'notifications', COUNT(*),
         ROUND(COUNT(*)::NUMERIC / 7 / 24 / 60, 2)
  FROM notifications WHERE created_at > NOW() - INTERVAL '7 days'
  UNION ALL
  SELECT 'attendance', COUNT(*),
         ROUND(COUNT(*)::NUMERIC / 7 / 24 / 60, 2)
  FROM attendance WHERE created_at > NOW() - INTERVAL '7 days'
  UNION ALL
  SELECT 'message_reads', COUNT(*),
         ROUND(COUNT(*)::NUMERIC / 7 / 24 / 60, 2)
  FROM message_reads WHERE read_at > NOW() - INTERVAL '7 days'
) t
ORDER BY last_7d_rows DESC;
