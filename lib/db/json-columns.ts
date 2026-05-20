// ============================================================
// lib/db/json-columns.ts  (자동 생성 — gen-json-columns.mjs)
// 생성일: 2026-05-20T14:23:51.308Z
//
// Supabase jsonb/json/배열 컬럼 목록. D1(SQLite)은 TEXT로 저장/반환하므로
// /api/d1/query가 반환 직전 이 컬럼들을 JSON.parse 해 객체/배열로 복원한다.
// (Supabase 클라이언트가 원래 객체/배열로 돌려주던 것과 동작 일치시킴)
// ============================================================

export const JSON_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  annual_leave_promotion_logs: ['meta'],
  approval_templates: ['default_values'],
  approvals: ['meta_data', 'approver_line', 'approval_line'],
  audit_logs: ['details'],
  backup_restore_runs: ['meta', 'preview', 'result_summary', 'log_lines'],
  board_posts: ['poll', 'poll_votes', 'tags', 'attachments'],
  chat_rooms: ['members', 'member_ids'],
  delivery_confirmations: ['items'],
  discharge_reviews: ['items'],
  discharge_templates: ['items'],
  generated_reports: ['summary'],
  inventory_closing_snapshots: ['summary', 'items'],
  inventory_count_sessions: ['report'],
  monthly_off_quota: ['staff_overrides'],
  notification_templates: ['variables'],
  notifications: ['metadata'],
  onboarding_checklists: ['items'],
  op_check_templates: ['prep_items', 'consumable_items'],
  op_patient_checks: ['prep_items', 'consumable_items', 'applied_template_ids'],
  payroll_policy_versions: ['snapshot'],
  payroll_records: ['attendance_deduction_detail', 'deduction_detail'],
  polls: ['options'],
  purchase_orders: ['items', 'received_items'],
  report_schedules: ['recipients'],
  staff_members: ['permissions'],
  staff_preferred_off: ['preferred_weekdays', 'preferred_dates'],
  system_settings: ['value'],
  tax_insurance_rates: ['income_tax_bracket'],
  tax_reports: ['data'],
  virtual_account_deposits: ['raw_payload'],
  wiki_document_versions: ['tags', 'editor_ids'],
  wiki_documents: ['tags', 'editor_ids'],
};
