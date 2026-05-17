-- ============================================================
-- D1 이관 사전 측정 SQL (Supabase SQL Editor에서 실행)
-- Phase 0-1: D1 가능 여부 판정용 4개 측정
-- 결과를 Claude에게 전달하면 다음 단계 진입 결정 가능
-- ============================================================

-- [1] 전체 DB 사이즈 (D1 Paid Plan 한도: 10GB)
SELECT pg_size_pretty(pg_database_size(current_database())) AS db_total_size,
       pg_database_size(current_database()) AS db_total_bytes;

-- [2] 테이블별 row count + 디스크 사이즈 (큰 순)
SELECT
  relname AS table_name,
  n_live_tup AS rows,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  pg_total_relation_size(relid) AS total_bytes
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(relid) DESC;

-- [3] 가장 큰 TEXT 컬럼 길이 (D1 statement 한도: 100KB 점검)
SELECT 'employment_contracts.content'     AS col,
       MAX(LENGTH(content))               AS max_len,
       AVG(LENGTH(content))::INT          AS avg_len,
       COUNT(*)                           AS rows_with_data
FROM employment_contracts WHERE content IS NOT NULL
UNION ALL
SELECT 'board_posts.content',         MAX(LENGTH(content)), AVG(LENGTH(content))::INT, COUNT(*)
FROM board_posts WHERE content IS NOT NULL
UNION ALL
SELECT 'chat_messages.content',       MAX(LENGTH(content)), AVG(LENGTH(content))::INT, COUNT(*)
FROM chat_messages WHERE content IS NOT NULL
UNION ALL
SELECT 'approvals.content',           MAX(LENGTH(content)), AVG(LENGTH(content))::INT, COUNT(*)
FROM approvals WHERE content IS NOT NULL
UNION ALL
SELECT 'contract_templates.template_content', MAX(LENGTH(template_content)), AVG(LENGTH(template_content))::INT, COUNT(*)
FROM contract_templates WHERE template_content IS NOT NULL
UNION ALL
SELECT 'notifications.body',          MAX(LENGTH(body)), AVG(LENGTH(body))::INT, COUNT(*)
FROM notifications WHERE body IS NOT NULL
ORDER BY max_len DESC NULLS LAST;

-- [4] 빠르게 자라는 테이블의 최근 7일 insertion rate
--     D1 write throughput ~50/s/DB 한도 vs 현재 평균
SELECT 'chat_messages' AS table_name,
       COUNT(*)        AS last_7d_rows,
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
UNION ALL
SELECT 'staff_trainings', COUNT(*),
       ROUND(COUNT(*)::NUMERIC / 7 / 24 / 60, 2)
FROM staff_trainings WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY last_7d_rows DESC;

-- [5] 한글 테이블명 "사업체" 존재 여부 (D1 호환성 확인)
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('사업체', 'companies');

-- [6] BYTEA 컬럼 존재 여부 (있으면 D1으로 옮길 때 별도 처리 필요)
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND data_type IN ('bytea', 'blob');
