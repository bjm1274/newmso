-- ============================================================
-- 전체 활성 테이블 (125개)의 컬럼·제약·인덱스 정보 추출
-- 이전 07번은 누락 50개만, 이번 08번은 attendances_20260513_bulk_backup
-- 제외한 모든 활성 테이블의 information_schema 기반 추출
--
-- Supabase SQL Editor에서 Run → Export → CSV
-- ============================================================
WITH excluded_tables AS (
  SELECT 'attendances_20260513_bulk_backup'::text AS t
),
target_tables AS (
  SELECT table_name AS t
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
    AND table_name NOT IN (SELECT t FROM excluded_tables)
)
SELECT
  'COLUMN'                       AS kind,
  c.table_name                   AS table_name,
  lpad(c.ordinal_position::text, 3, '0') AS sort_key,
  jsonb_build_object(
    'column',    c.column_name,
    'type',      c.data_type,
    'udt',       c.udt_name,
    'max_len',   c.character_maximum_length,
    'precision', c.numeric_precision,
    'scale',     c.numeric_scale,
    'nullable',  c.is_nullable,
    'default',   c.column_default
  )::text                        AS info
FROM information_schema.columns c
JOIN target_tables t ON t.t = c.table_name
WHERE c.table_schema = 'public'

UNION ALL

SELECT
  'CONSTRAINT' AS kind,
  c.conrelid::regclass::text     AS table_name,
  c.conname                      AS sort_key,
  jsonb_build_object(
    'type', c.contype,
    'def',  pg_get_constraintdef(c.oid)
  )::text                        AS info
FROM pg_constraint c
JOIN target_tables t ON t.t = c.conrelid::regclass::text
WHERE c.connamespace = 'public'::regnamespace

UNION ALL

SELECT
  'INDEX'                        AS kind,
  i.tablename                    AS table_name,
  i.indexname                    AS sort_key,
  jsonb_build_object('def', i.indexdef)::text AS info
FROM pg_indexes i
WHERE i.schemaname = 'public'
  AND i.tablename IN (SELECT t FROM target_tables)

ORDER BY table_name, kind, sort_key;
