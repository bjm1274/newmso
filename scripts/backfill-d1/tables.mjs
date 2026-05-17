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
      { name: 'todo_id' },
      { name: 'user_id' },
      { name: 'reminder_at' },
      { name: 'notification_id' },
      { name: 'status' },
      { name: 'title' },
      { name: 'body' },
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
      { name: 'division' },
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
    orderBy: 'created_at',
    columns: [
      { name: 'id' },
      { name: 'schedule_id' },
      { name: 'report_type' },
      { name: 'period' },
      { name: 'status' },
      { name: 'summary', coerce: 'json' },
      { name: 'created_at' },
    ],
    defaults: { id: uuidDefault, created_at: nowIso },
  },

  official_doc_log: {
    name: 'official_doc_log',
    select: '*',
    orderBy: 'created_at',
    columns: [
      { name: 'sent_date' },
      { name: 'doc_number' },
      { name: 'title' },
      { name: 'recipient' },
      { name: 'manager' },
      { name: 'is_received', coerce: 'bool' },
      { name: 'note' },
      { name: 'company' },
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
      { name: 'check_in' },
      { name: 'check_out' },
      { name: 'status' },
      { name: 'notes' },
      { name: 'created_at' },
      { name: 'company_id' },
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
      { name: 'company_id' },
      { name: 'company_name' },
      { name: 'work_date' },
      { name: 'check_in_time' },
      { name: 'check_out_time' },
      { name: 'status' },
      { name: 'work_hours_minutes', coerce: 'int' },
      { name: 'notes' },
      { name: 'created_at' },
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
      { name: 'original_date' },
      { name: 'correction_type' },
      { name: 'reason' },
      { name: 'status' },
      { name: 'created_at' },
      { name: 'attendance_date' },
      { name: 'requested_at' },
    ],
    defaults: { id: uuidDefault, created_at: nowIso, requested_at: nowIso },
  },

  staff_transfer_history: {
    name: 'staff_transfer_history',
    select: '*',
    orderBy: 'created_at',
    columns: [
      { name: 'id' },
      { name: 'staff_id' },
      { name: 'transfer_type' },
      { name: 'before_value', coerce: 'json' },
      { name: 'after_value', coerce: 'json' },
      { name: 'effective_date' },
      { name: 'approval_id' },
      { name: 'created_at' },
    ],
    defaults: { id: uuidDefault, created_at: nowIso },
  },

  certificate_issuances: {
    name: 'certificate_issuances',
    select: '*',
    orderBy: 'issued_at',
    columns: [
      { name: 'id' },
      { name: 'staff_id' },
      { name: 'cert_type' },
      { name: 'serial_no' },
      { name: 'purpose' },
      { name: 'issued_by' },
      { name: 'issued_at' },
    ],
    defaults: { id: uuidDefault, issued_at: nowIso },
  },

  // roster_policy_settings — Supabase에 테이블 없음 (마이그레이션 미적용).
  // dual-write는 적용됐으나 backfill 대상이 없으므로 정의 제외.
  // 향후 Supabase에 테이블 생성 시 다시 추가.

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
// payroll_records — D1 schema (33 컬럼) 기준. company_id/company_name/updated_at는
// payroll-record-upsert.ts의 PAYROLL_D1_OMIT_COLUMNS와 동일하게 제외.
// jsonb 3개 컬럼은 coerce:'json' (attendance_deduction_detail, deduction_detail,
// settlement_reason — PAYROLL_JSONB_COLUMNS와 일치).
BACKFILL_TABLES.payroll_records = {
  name: 'payroll_records',
  select: '*',
  orderBy: 'year_month',
  columns: [
    { name: 'id' },
    { name: 'staff_id' },
    { name: 'year_month' },
    { name: 'base_salary', coerce: 'int' },
    { name: 'meal_allowance', coerce: 'int' },
    { name: 'vehicle_allowance', coerce: 'int' },
    { name: 'childcare_allowance', coerce: 'int' },
    { name: 'research_allowance', coerce: 'int' },
    { name: 'other_taxfree', coerce: 'int' },
    { name: 'extra_allowance', coerce: 'int' },
    { name: 'overtime_pay', coerce: 'int' },
    { name: 'bonus', coerce: 'int' },
    { name: 'total_taxable', coerce: 'int' },
    { name: 'total_taxfree', coerce: 'int' },
    { name: 'total_deduction', coerce: 'int' },
    { name: 'net_pay', coerce: 'int' },
    { name: 'attendance_deduction', coerce: 'int' },
    { name: 'attendance_deduction_detail', coerce: 'json' },
    { name: 'status' },
    { name: 'created_at' },
    { name: 'record_type' },
    { name: 'severance_pay', coerce: 'int' },
    { name: 'settlement_reason', coerce: 'json' },
    { name: 'settlement_date' },
    { name: 'advance_pay', coerce: 'int' },
    { name: 'deduction_detail', coerce: 'json' },
    { name: 'night_duty_allowance', coerce: 'int' },
    { name: 'gross_pay' },
    { name: 'national_pension' },
    { name: 'health_insurance' },
    { name: 'long_term_care' },
    { name: 'employment_insurance' },
    { name: 'income_tax' },
    { name: 'local_tax' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso, record_type: () => 'regular' },
};

// ============================================================
// 부모(FK 참조) 테이블 — dual-write 대상은 아니지만 자식 테이블 FK 만족을 위해
// 1회성 backfill 필요. 적용 순서: 이 테이블들을 자식보다 먼저 import.
// 향후 변경분은 D1에 sync 안 되므로 cutover 직전 다시 backfill 권장.
// ============================================================

BACKFILL_TABLES.work_shifts = {
  name: 'work_shifts',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'name' },
    { name: 'start_time' },
    { name: 'end_time' },
    { name: 'break_start_time' },
    { name: 'break_end_time' },
    { name: 'description' },
    { name: 'company_name' },
    { name: 'shift_type' },
    { name: 'weekly_work_days', coerce: 'int' },
    { name: 'is_weekend_work', coerce: 'bool' },
    { name: 'is_shift', coerce: 'bool' },
    { name: 'is_active', coerce: 'bool' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

BACKFILL_TABLES.companies = {
  name: 'companies',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'name' },
    { name: 'type' },
    { name: 'mso_id' },
    { name: 'is_active', coerce: 'bool' },
    { name: 'created_at' },
    { name: 'ceo_name' },
    { name: 'business_no' },
    { name: 'address' },
    { name: 'phone' },
    { name: 'memo' },
    { name: 'payment_day', coerce: 'int' },
    { name: 'business_number' },
    { name: 'seal_url' },
    { name: 'leave_policy' },
    { name: 'unused_leave_compensation', coerce: 'int' },
    { name: 'fiscal_year_start_month', coerce: 'int' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

BACKFILL_TABLES.staff_members = {
  name: 'staff_members',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'employee_no' },
    { name: 'name' },
    { name: 'company' },
    { name: 'company_id' },
    { name: 'department' },
    { name: 'position' },
    { name: 'team' },
    { name: 'email' },
    { name: 'phone' },
    { name: 'resident_no' },
    { name: 'address' },
    { name: 'license' },
    { name: 'bank_account' },
    { name: 'salary_info' },
    { name: 'join_date' },
    { name: 'joined_at' },
    { name: 'resigned_at' },
    { name: 'status' },
    { name: 'role' },
    { name: 'permissions', coerce: 'json' },
    { name: 'password' },
    { name: 'annual_leave_total' },
    { name: 'annual_leave_used' },
    { name: 'shift_id' },
    { name: 'base_salary', coerce: 'int' },
    { name: 'other_taxfree', coerce: 'int' },
    { name: 'position_allowance', coerce: 'int' },
    { name: 'overtime_allowance', coerce: 'int' },
    { name: 'night_work_allowance', coerce: 'int' },
    { name: 'holiday_work_allowance', coerce: 'int' },
    { name: 'annual_leave_pay', coerce: 'int' },
    { name: 'working_hours_per_week' },
    { name: 'working_days_per_week', coerce: 'int' },
    { name: 'last_seen_at' },
    { name: 'presence_status' },
    { name: 'created_at' },
    { name: 'auth_user_id' },
    { name: 'meal_allowance', coerce: 'int' },
    { name: 'night_duty_allowance', coerce: 'int' },
    { name: 'vehicle_allowance', coerce: 'int' },
    { name: 'childcare_allowance', coerce: 'int' },
    { name: 'research_allowance', coerce: 'int' },
    { name: 'birth_date' },
    { name: 'is_system_master', coerce: 'bool' },
    { name: 'avatar_url' },
    { name: 'photo_url' },
    { name: 'profile_photo_path' },
    { name: 'profile_photo_updated_at' },
    { name: 'force_logout_at' },
    { name: 'updated_at' },
    { name: 'hire_date' },
    { name: 'resign_date' },
    { name: 'bank_name' },
    { name: 'passwd' },
    { name: 'employment_type' },
    { name: 'staff_email' },
    { name: 'annual_days' },
    { name: 'annual_used' },
    { name: 'gender' },
    { name: 'salary' },
    { name: 'extension' },
    { name: 'contract_type' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

BACKFILL_TABLES.chat_rooms = {
  name: 'chat_rooms',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'name' },
    { name: 'type' },
    { name: 'members', coerce: 'json' },
    { name: 'is_announcement', coerce: 'bool' },
    { name: 'created_by' },
    { name: 'created_at' },
    { name: 'last_message_at' },
    { name: 'last_message' },
    { name: 'last_message_preview' },
    { name: 'member_ids', coerce: 'json' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

BACKFILL_TABLES.approvals = {
  name: 'approvals',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'company_id' },
    { name: 'sender_id' },
    { name: 'sender_name' },
    { name: 'sender_company' },
    { name: 'type' },
    { name: 'title' },
    { name: 'content' },
    { name: 'status' },
    { name: 'current_approver_id' },
    { name: 'meta_data', coerce: 'json' },
    { name: 'created_at' },
    { name: 'updated_at' },
    { name: 'sender_department' },
    { name: 'approver_line', coerce: 'json' },
    { name: 'doc_number' },
    { name: 'approval_line', coerce: 'json' },
    { name: 'name' },
    { name: 'doc_type' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

// 부모 우선 적용 순서 — 자식 INSERT 시 FK 만족하려면 이 순서 준수.
// 자식 적용은 그 다음 임의 순서.
export const BACKFILL_ORDER_PARENTS = ['companies', 'work_shifts', 'staff_members', 'chat_rooms', 'approvals'];
export const BACKFILL_ORDER_CHILDREN = [
  'system_settings',
  'generated_reports',
  'todo_reminder_logs',
  'staff_transfer_history',
  'org_teams',
  'official_doc_log',
  'certificate_issuances',
  'attendance',
  'attendance_corrections',
  'attendances',
  'push_subscriptions',
  'payroll_records',
  'audit_logs',
  'messages',
  'notifications',
];
