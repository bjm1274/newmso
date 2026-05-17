// ============================================================
// scripts/backfill-d1/tables.mjs
// Phase 2 dual-write 적용 테이블 → D1 컬럼/변환 메타데이터.
//
// 컬럼 정의는 lib/db/schema.ts(D1 스키마) 기준.
// Supabase에만 있는 컬럼은 자동 제외 (예: payroll_records.company_id).
//
// coerce:
//   - 'json' : Supabase jsonb/json → JSON.stringify 후 TEXT
//   - 'bool' : Supabase boolean → 0|1
//   - 'int'  : INTEGER 강제 (null 허용)
//   - undef  : 자동 추론 (string/number는 그대로, object는 JSON)
//
// defaults:
//   - id 누락 시 randomUUID() 같은 기본값 부여
//   - dual-write에서 PK를 명시했으므로 보통 불필요
// ============================================================

import { randomUUID } from 'node:crypto';

const uuidDefault = () => randomUUID();
const nowIso = () => new Date().toISOString();

/**
 * 각 테이블의 D1 backfill 정의.
 * - name: D1 테이블명
 * - select: Supabase에서 가져올 컬럼 (보통 '*'이지만 명시 가능)
 * - orderBy: 페이지네이션용 정렬 키 (PK 권장)
 * - columns: D1 INSERT 컬럼 순서 + 변환 규칙
 * - defaults: 누락 시 기본값
 * - onConflict: 'ignore' (default) | 'replace'
 *   replace는 Supabase 진실 우선, ignore는 D1 진실 우선
 */
export const BACKFILL_TABLES = {
  notifications: {
    name: 'notifications',
    select: '*',
    orderBy: 'created_at',
    columns: [
      { name: 'id' },
      { name: 'user_id' },
      { name: 'type' },
      { name: 'title' },
      { name: 'body' },
      { name: 'metadata', coerce: 'json' },
      { name: 'read_at' },
      { name: 'created_at' },
    ],
    defaults: { id: uuidDefault, created_at: nowIso },
  },

  audit_logs: {
    name: 'audit_logs',
    select: '*',
    orderBy: 'created_at',
    columns: [
      { name: 'id' },
      { name: 'user_id' },
      { name: 'user_name' },
      { name: 'action' },
      { name: 'target_type' },
      { name: 'target_id' },
      { name: 'details', coerce: 'json' },
      { name: 'ip_address' },
      { name: 'actor_name' },
      { name: 'created_at' },
    ],
    defaults: { id: uuidDefault, created_at: nowIso },
  },

  todo_reminder_logs: {
    name: 'todo_reminder_logs',
    select: '*',
    orderBy: 'created_at',
    columns: [
      { name: 'id' },
      { name: 'user_id' },
      { name: 'todo_id' },
      { name: 'reminder_at' },
      { name: 'sent_at' },
      { name: 'status' },
      { name: 'error_message' },
      { name: 'created_at' },
    ],
    defaults: { id: uuidDefault, created_at: nowIso },
  },

  org_teams: {
    name: 'org_teams',
    select: '*',
    orderBy: 'created_at',
    columns: [
      { name: 'id' },
      { name: 'company_name' },
      { name: 'department_name' },
      { name: 'team_name' },
      { name: 'sort_order', coerce: 'int' },
      { name: 'created_at' },
    ],
    defaults: { id: uuidDefault, created_at: nowIso },
  },

  system_settings: {
    name: 'system_settings',
    select: '*',
    orderBy: 'key',
    columns: [
      { name: 'key' },
      { name: 'value', coerce: 'json' },
      { name: 'updated_at' },
    ],
  },

  generated_reports: {
    name: 'generated_reports',
    select: '*',
    orderBy: 'generated_at',
    columns: [
      { name: 'id' },
      { name: 'schedule_id' },
      { name: 'report_type' },
      { name: 'period_start' },
      { name: 'period_end' },
      { name: 'generated_at' },
      { name: 'summary', coerce: 'json' },
      { name: 'recipients', coerce: 'json' },
      { name: 'status' },
      { name: 'error_message' },
    ],
    defaults: { id: uuidDefault, generated_at: nowIso },
  },

  official_doc_log: {
    name: 'official_doc_log',
    select: '*',
    orderBy: 'created_at',
    columns: [
      { name: 'doc_number' },
      { name: 'title' },
      { name: 'sender_name' },
      { name: 'receiver_name' },
      { name: 'is_received', coerce: 'bool' },
      { name: 'received_at' },
      { name: 'sent_at' },
      { name: 'body' },
      { name: 'attachments', coerce: 'json' },
      { name: 'created_at' },
    ],
    defaults: { created_at: nowIso },
  },

  attendance: {
    name: 'attendance',
    select: '*',
    orderBy: 'date',
    columns: [
      { name: 'id' },
      { name: 'staff_id' },
      { name: 'date' },
      { name: 'check_in_at' },
      { name: 'check_out_at' },
      { name: 'status' },
      { name: 'note' },
      { name: 'created_at' },
    ],
    defaults: { id: uuidDefault, created_at: nowIso },
  },

  attendances: {
    name: 'attendances',
    select: '*',
    orderBy: 'work_date',
    columns: [
      { name: 'id' },
      { name: 'staff_id' },
      { name: 'work_date' },
      { name: 'work_type' },
      { name: 'status' },
      { name: 'reason' },
      { name: 'hours' },
      { name: 'created_at' },
      { name: 'updated_at' },
    ],
    defaults: { id: uuidDefault, created_at: nowIso },
  },

  attendance_corrections: {
    name: 'attendance_corrections',
    select: '*',
    orderBy: 'attendance_date',
    columns: [
      { name: 'id' },
      { name: 'staff_id' },
      { name: 'attendance_date' },
      { name: 'corrected_check_in_at' },
      { name: 'corrected_check_out_at' },
      { name: 'reason' },
      { name: 'status' },
      { name: 'created_at' },
    ],
    defaults: { id: uuidDefault, created_at: nowIso },
  },

  staff_transfer_history: {
    name: 'staff_transfer_history',
    select: '*',
    orderBy: 'transfer_date',
    columns: [
      { name: 'id' },
      { name: 'staff_id' },
      { name: 'transfer_date' },
      { name: 'from_company' },
      { name: 'from_department' },
      { name: 'to_company' },
      { name: 'to_department' },
      { name: 'reason' },
      { name: 'decided_by' },
      { name: 'created_at' },
    ],
    defaults: { id: uuidDefault, created_at: nowIso },
  },

  certificate_issuances: {
    name: 'certificate_issuances',
    select: '*',
    orderBy: 'created_at',
    columns: [
      { name: 'id' },
      { name: 'staff_id' },
      { name: 'cert_type' },
      { name: 'issued_at' },
      { name: 'document_url' },
      { name: 'issued_by' },
      { name: 'notes' },
      { name: 'created_at' },
    ],
    defaults: { id: uuidDefault, created_at: nowIso },
  },

  roster_policy_settings: {
    name: 'roster_policy_settings',
    select: '*',
    orderBy: 'policy_type',
    columns: [
      { name: 'policy_type' },
      { name: 'policy_id' },
      { name: 'payload', coerce: 'json' },
      { name: 'updated_at' },
    ],
    defaults: { updated_at: nowIso },
  },

  messages: {
    name: 'messages',
    select: '*',
    orderBy: 'created_at',
    columns: [
      { name: 'id' },
      { name: 'room_id' },
      { name: 'sender_id' },
      { name: 'content' },
      { name: 'file_url' },
      { name: 'reply_to_id' },
      { name: 'is_deleted', coerce: 'bool' },
      { name: 'edited_at' },
      { name: 'created_at' },
      { name: 'file_size_bytes', coerce: 'int' },
      { name: 'file_kind' },
      { name: 'file_name' },
      { name: 'album_id' },
      { name: 'album_index', coerce: 'int' },
      { name: 'album_total', coerce: 'int' },
      { name: 'message_type' },
      { name: 'sender_name' },
    ],
    defaults: { id: uuidDefault, created_at: nowIso },
  },

  push_subscriptions: {
    name: 'push_subscriptions',
    select: '*',
    orderBy: 'created_at',
    columns: [
      { name: 'id' },
      { name: 'staff_id' },
      { name: 'endpoint' },
      { name: 'p256dh' },
      { name: 'auth' },
      { name: 'created_at' },
      { name: 'fcm_token' },
      { name: 'device_id' },
      { name: 'platform' },
      { name: 'user_agent' },
    ],
    defaults: { id: uuidDefault, created_at: nowIso },
  },
};

/**
 * payroll_records는 jsonb 컬럼이 다수라 별도. select 시 jsonb 컬럼 전체.
 * D1 schema에서 omit되는 컬럼: company_id, company_name, updated_at
 * (payroll-record-upsert.ts의 normalizePayrollRecordForD1 패턴과 동일)
 */
BACKFILL_TABLES.payroll_records = {
  name: 'payroll_records',
  select: '*',
  orderBy: 'year_month',
  columns: [
    { name: 'id' },
    { name: 'staff_id' },
    { name: 'year_month' },
    { name: 'record_type' },
    { name: 'base_salary', coerce: 'int' },
    { name: 'overtime_pay', coerce: 'int' },
    { name: 'night_pay', coerce: 'int' },
    { name: 'holiday_pay', coerce: 'int' },
    { name: 'position_allowance', coerce: 'int' },
    { name: 'meal_allowance', coerce: 'int' },
    { name: 'transport_allowance', coerce: 'int' },
    { name: 'other_taxable_allowance', coerce: 'int' },
    { name: 'other_nontax_allowance', coerce: 'int' },
    { name: 'bonus', coerce: 'int' },
    { name: 'gross_pay', coerce: 'int' },
    { name: 'income_tax', coerce: 'int' },
    { name: 'local_tax', coerce: 'int' },
    { name: 'national_pension', coerce: 'int' },
    { name: 'health_insurance', coerce: 'int' },
    { name: 'long_term_care', coerce: 'int' },
    { name: 'employment_insurance', coerce: 'int' },
    { name: 'industrial_accident', coerce: 'int' },
    { name: 'other_deduction', coerce: 'int' },
    { name: 'attendance_deduction', coerce: 'int' },
    { name: 'attendance_deduction_detail', coerce: 'json' },
    { name: 'deduction_detail', coerce: 'json' },
    { name: 'settlement_type' },
    { name: 'settlement_reason', coerce: 'json' },
    { name: 'work_days', coerce: 'int' },
    { name: 'paid_holidays', coerce: 'int' },
    { name: 'work_hours' },
    { name: 'net_pay', coerce: 'int' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso, record_type: () => 'regular' },
};
