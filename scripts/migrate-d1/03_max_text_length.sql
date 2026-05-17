-- [측정 3] 가장 큰 TEXT 컬럼 길이 (D1 statement 한도 100KB = 102400 bytes 점검)
-- 결과 컬럼: col, max_len, avg_len, rows_with_data
SELECT col, max_len, avg_len, rows_with_data FROM (
  SELECT 'employment_contracts.content' AS col,
         MAX(LENGTH(content)) AS max_len,
         AVG(LENGTH(content))::INT AS avg_len,
         COUNT(*) AS rows_with_data
  FROM employment_contracts WHERE content IS NOT NULL
  UNION ALL
  SELECT 'board_posts.content', MAX(LENGTH(content)), AVG(LENGTH(content))::INT, COUNT(*)
  FROM board_posts WHERE content IS NOT NULL
  UNION ALL
  SELECT 'chat_messages.content', MAX(LENGTH(content)), AVG(LENGTH(content))::INT, COUNT(*)
  FROM chat_messages WHERE content IS NOT NULL
  UNION ALL
  SELECT 'approvals.content', MAX(LENGTH(content)), AVG(LENGTH(content))::INT, COUNT(*)
  FROM approvals WHERE content IS NOT NULL
  UNION ALL
  SELECT 'contract_templates.template_content', MAX(LENGTH(template_content)), AVG(LENGTH(template_content))::INT, COUNT(*)
  FROM contract_templates WHERE template_content IS NOT NULL
  UNION ALL
  SELECT 'notifications.body', MAX(LENGTH(body)), AVG(LENGTH(body))::INT, COUNT(*)
  FROM notifications WHERE body IS NOT NULL
) t
ORDER BY max_len DESC NULLS LAST;
