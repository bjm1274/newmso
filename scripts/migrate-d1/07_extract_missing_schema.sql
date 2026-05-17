-- ============================================================
-- 누락 50개 테이블의 컬럼·제약·인덱스 정보 추출 (한 쿼리)
-- Supabase SQL Editor에서 Run → Export → CSV
-- 결과 컬럼: kind, table_name, sort_key, info (info는 JSON 문자열)
-- ============================================================
WITH missing AS (
  SELECT unnest(ARRAY[
    'access_logs','annual_leave_promotion_logs','attendances_20260513_bulk_backup',
    'backup_restore_runs','board_post_reads','chat_push_jobs','chat_room_favorites',
    'chat_room_prefs','company_expenses','company_holidays','delivery_confirmations',
    'department_private_inventory_items','department_private_inventory_logs',
    'device_inspections','discharge_reviews','discharge_templates','document_repository',
    'document_versions','generated_reports','handover_notes','health_checkups',
    'incident_reports','inventory_categories','inventory_closing_snapshots',
    'inventory_cost_entries','inventory_count_sessions','inventory_price_history',
    'inventory_transfers','medical_devices','message_bookmarks','mri_templates',
    'official_doc_log','op_check_templates','op_patient_checks','payroll_policy_versions',
    'personnel_appointments','report_schedules','retirement_pensions','reward_discipline',
    'scheduled_messages','surgery_templates','system_settings','tax_reports',
    'todo_reminder_logs','todos','unpaid_absence_records','virtual_account_deposits',
    'wiki_document_versions','wiki_documents','wiki_folders'
  ]) AS t
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
JOIN missing m ON m.t = c.table_name
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
JOIN missing m ON m.t = c.conrelid::regclass::text
WHERE c.connamespace = 'public'::regnamespace

UNION ALL

SELECT
  'INDEX'                        AS kind,
  i.tablename                    AS table_name,
  i.indexname                    AS sort_key,
  jsonb_build_object('def', i.indexdef)::text AS info
FROM pg_indexes i
WHERE i.schemaname = 'public'
  AND i.tablename IN (SELECT t FROM missing)

ORDER BY table_name, kind, sort_key;
