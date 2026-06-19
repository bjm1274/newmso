// ============================================================
// scripts/backfill-d1/tables-full.mjs
// D1 125개 활성 테이블 전체 백필 메타데이터.
//
// 이 파일은 tables.mjs(24개)를 완전히 대체한다.
// coerce 주석은 dump.mjs의 자동 타입 감지(typeof object/boolean 자동 변환)로
// 대부분 불필요하지만, 명시적으로 JSON/bool이 확실한 컬럼은 그대로 유지한다.
//
// 제외 테이블 (잉여 11개 — Supabase에 없음):
//   approval_delegation, approval_form_types, asset_loan_item_settings,
//   company_seals, insurance_records, license_continuing_education,
//   login_logs, meeting_bookings, roster_approval_requests,
//   roster_policy_settings, roster_swap_requests
// ============================================================

import { randomUUID } from 'node:crypto';

const uuidDefault = () => randomUUID();
const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Level 0: FK 참조를 받지 않으면서 다른 테이블로부터 참조되는 루트 테이블
// ---------------------------------------------------------------------------

export const TABLE_DEFS = {};

TABLE_DEFS.work_shifts = {
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

// companies: self-reference (mso_id → companies.id) → 루트로 취급
TABLE_DEFS.companies = {
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

// staff_members: FK → companies, work_shifts
TABLE_DEFS.staff_members = {
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

// suppliers: 독립 루트
TABLE_DEFS.suppliers = {
  name: 'suppliers',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'name' },
    { name: 'contact' },
    { name: 'phone' },
    { name: 'address' },
    { name: 'email' },
    { name: 'created_at' },
    { name: 'updated_at' },
    { name: 'contact_name' },
    { name: 'business_number' },
    { name: 'category' },
    { name: 'contract_start' },
    { name: 'contract_end' },
    { name: 'payment_terms' },
    { name: 'notes' },
    { name: 'created_by' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

// chat_rooms: 독립 루트
TABLE_DEFS.chat_rooms = {
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

// job_categories: 독립 루트
TABLE_DEFS.job_categories = {
  name: 'job_categories',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'code' },
    { name: 'name' },
    { name: 'is_medical_staff', coerce: 'bool' },
    { name: 'display_order', coerce: 'int' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

// medical_devices: 독립 루트
TABLE_DEFS.medical_devices = {
  name: 'medical_devices',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'name' },
    { name: 'model' },
    { name: 'serial' },
    { name: 'category' },
    { name: 'location' },
    { name: 'cycle', coerce: 'int' },
    { name: 'next_inspection_date' },
    { name: 'last_inspection_date' },
    { name: 'memo' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

// inventory_categories: self-reference (parent_id → self)
TABLE_DEFS.inventory_categories = {
  name: 'inventory_categories',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'name' },
    { name: 'parent_id' },
    { name: 'description' },
    { name: 'color' },
    { name: 'created_at' },
    { name: 'updated_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

// approvals: FK → companies, staff_members
TABLE_DEFS.approvals = {
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

// messages: self-reference (reply_to_id → messages.id)
TABLE_DEFS.messages = {
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
};

// inventory: FK → companies, suppliers
TABLE_DEFS.inventory = {
  name: 'inventory',
  select: '*',
  orderBy: 'last_updated',
  columns: [
    { name: 'id' },
    { name: 'company_id' },
    { name: 'company' },
    { name: 'category' },
    { name: 'item_name' },
    { name: 'quantity', coerce: 'int' },
    { name: 'min_quantity', coerce: 'int' },
    { name: 'unit_price', coerce: 'int' },
    { name: 'expiry_date' },
    { name: 'lot_number' },
    { name: 'is_udi', coerce: 'bool' },
    { name: 'udi_code' },
    { name: 'location' },
    { name: 'supplier_id' },
    { name: 'last_updated' },
    { name: 'stock', coerce: 'int' },
    { name: 'supplier_name' },
    { name: 'insurance_code' },
    { name: 'spec' },
    { name: 'department' },
    { name: 'safety_stock', coerce: 'int' },
    { name: 'supplier' },
    { name: 'barcode' },
    { name: 'expiration_date' },
    { name: 'price', coerce: 'int' },
    { name: 'serial_number' },
    { name: 'name' },
    { name: 'min_stock', coerce: 'int' },
  ],
  defaults: { id: uuidDefault },
};

// purchase_orders: FK → suppliers, staff_members, approvals
TABLE_DEFS.purchase_orders = {
  name: 'purchase_orders',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'supplier_id' },
    { name: 'items', coerce: 'json' },
    { name: 'status' },
    { name: 'total_amount' },
    { name: 'notes' },
    { name: 'created_by' },
    { name: 'approved_by' },
    { name: 'approved_at' },
    { name: 'completed_at' },
    { name: 'created_at' },
    { name: 'updated_at' },
    { name: 'supplier_name' },
    { name: 'expected_delivery_date' },
    { name: 'ordered_at' },
    { name: 'received_at' },
    { name: 'received_by_id' },
    { name: 'received_by_name' },
    { name: 'inspected_at' },
    { name: 'inspected_by_id' },
    { name: 'inspected_by_name' },
    { name: 'inspection_status' },
    { name: 'received_qty' },
    { name: 'rejected_qty' },
    { name: 'received_items', coerce: 'json' },
    { name: 'closed_at' },
    { name: 'closed_by_id' },
    { name: 'closed_by_name' },
    { name: 'expense_status' },
    { name: 'expense_posted_at' },
    { name: 'expense_posted_by_id' },
    { name: 'expense_posted_by_name' },
    { name: 'expense_total_amount' },
    { name: 'tax_amount' },
    { name: 'invoice_no' },
    { name: 'invoice_date' },
    { name: 'payment_status' },
    { name: 'payment_due_date' },
    { name: 'cost_center' },
    { name: 'budget_department' },
    { name: 'account_code' },
    { name: 'source_supply_approval_id' },
    { name: 'source_supply_request_index', coerce: 'int' },
    { name: 'requester_company' },
    { name: 'requester_department' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

// wiki_folders: FK → staff_members
TABLE_DEFS.wiki_folders = {
  name: 'wiki_folders',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'company_id' },
    { name: 'company_name' },
    { name: 'name' },
    { name: 'description' },
    { name: 'color' },
    { name: 'sort_order', coerce: 'int' },
    { name: 'is_archived', coerce: 'bool' },
    { name: 'created_by' },
    { name: 'updated_by' },
    { name: 'created_at' },
    { name: 'updated_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

// polls: FK → chat_rooms, messages (messages는 먼저 삽입됨)
TABLE_DEFS.polls = {
  name: 'polls',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'room_id' },
    { name: 'message_id' },
    { name: 'creator_id' },
    { name: 'question' },
    { name: 'options', coerce: 'json' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

// ---------------------------------------------------------------------------
// Level 1: 위 테이블들을 참조하는 테이블
// ---------------------------------------------------------------------------

TABLE_DEFS.access_logs = {
  name: 'access_logs',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'user_id' },
    { name: 'user_name' },
    { name: 'company' },
    { name: 'menu' },
    { name: 'action' },
    { name: 'ip_address' },
    { name: 'user_agent' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.annual_leave_promotion_logs = {
  name: 'annual_leave_promotion_logs',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'staff_id' },
    { name: 'company_name' },
    { name: 'target_year', coerce: 'int' },
    { name: 'step', coerce: 'int' },
    { name: 'sent_at' },
    { name: 'remain_days' },
    { name: 'meta', coerce: 'json' },
    { name: 'stage', coerce: 'int' },
    { name: 'expiry_date' },
    { name: 'notified_at' },
    { name: 'plan_submitted_at' },
    { name: 'remaining_days_at_notice' },
    { name: 'notification_id' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.approval_history = {
  name: 'approval_history',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'approval_id' },
    { name: 'approver_id' },
    { name: 'approver_name' },
    { name: 'action' },
    { name: 'comment' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.approval_templates = {
  name: 'approval_templates',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'form_type' },
    { name: 'default_values', coerce: 'json' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.asset_loans = {
  name: 'asset_loans',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'staff_id' },
    { name: 'asset_type' },
    { name: 'asset_name' },
    { name: 'loaned_at' },
    { name: 'returned_at' },
    { name: 'condition_notes' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.attendance = {
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
};

TABLE_DEFS.attendance_corrections = {
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
};

TABLE_DEFS.attendance_deduction_rules = {
  name: 'attendance_deduction_rules',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'company_name' },
    { name: 'late_deduction_type' },
    { name: 'late_deduction_amount', coerce: 'int' },
    { name: 'early_leave_deduction_type' },
    { name: 'early_leave_deduction_amount', coerce: 'int' },
    { name: 'absent_use_daily_rate', coerce: 'bool' },
    { name: 'created_at' },
    { name: 'updated_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.attendances = {
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
};

TABLE_DEFS.audit_logs = {
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
    { name: 'created_at' },
    { name: 'actor_name' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.backup_restore_runs = {
  name: 'backup_restore_runs',
  select: '*',
  orderBy: 'started_at',
  columns: [
    { name: 'id' },
    { name: 'file_name' },
    { name: 'meta', coerce: 'json' },
    { name: 'preview', coerce: 'json' },
    { name: 'result_summary', coerce: 'json' },
    { name: 'log_lines', coerce: 'json' },
    { name: 'total_tables', coerce: 'int' },
    { name: 'total_rows', coerce: 'int' },
    { name: 'status' },
    { name: 'requested_by' },
    { name: 'requested_by_name' },
    { name: 'started_at' },
    { name: 'finished_at' },
  ],
  defaults: { id: uuidDefault },
};

TABLE_DEFS.board_posts = {
  name: 'board_posts',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'company_id' },
    { name: 'board_type' },
    { name: 'title' },
    { name: 'content' },
    { name: 'author_id' },
    { name: 'author_name' },
    { name: 'company' },
    { name: 'views', coerce: 'int' },
    { name: 'created_at' },
    { name: 'is_anonymous', coerce: 'bool' },
    { name: 'poll', coerce: 'json' },
    { name: 'poll_votes', coerce: 'json' },
    { name: 'likes_count', coerce: 'int' },
    { name: 'status' },
    { name: 'updated_at' },
    { name: 'board_id' },
    { name: 'tags', coerce: 'json' },
    { name: 'attachments', coerce: 'json' },
    { name: 'is_pinned', coerce: 'bool' },
    { name: 'scheduled_publish_at' },
    { name: 'schedule_date' },
    { name: 'schedule_time' },
    { name: 'schedule_room' },
    { name: 'patient_name' },
    { name: 'surgery_fasting', coerce: 'bool' },
    { name: 'surgery_inpatient', coerce: 'bool' },
    { name: 'surgery_guardian', coerce: 'bool' },
    { name: 'surgery_caregiver', coerce: 'bool' },
    { name: 'surgery_transfusion', coerce: 'bool' },
    { name: 'mri_contrast_required', coerce: 'bool' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.certificate_issuances = {
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
};

TABLE_DEFS.chat_messages = {
  name: 'chat_messages',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'room_id' },
    { name: 'sender_id' },
    { name: 'content' },
    { name: 'type' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.chat_push_jobs = {
  name: 'chat_push_jobs',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'message_id' },
    { name: 'room_id' },
    { name: 'sender_id' },
    { name: 'created_at' },
    { name: 'processing_started_at' },
    { name: 'processed_at' },
    { name: 'attempt_count', coerce: 'int' },
    { name: 'last_error' },
    { name: 'next_attempt_at' },
    { name: 'dead_lettered_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.chat_room_favorites = {
  name: 'chat_room_favorites',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'user_id' },
    { name: 'room_id' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.chat_room_prefs = {
  name: 'chat_room_prefs',
  select: '*',
  orderBy: 'updated_at',
  columns: [
    { name: 'id' },
    { name: 'user_id' },
    { name: 'room_id' },
    { name: 'pinned', coerce: 'bool' },
    { name: 'hidden', coerce: 'bool' },
    { name: 'updated_at' },
  ],
  defaults: { id: uuidDefault },
};

TABLE_DEFS.company_expenses = {
  name: 'company_expenses',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'company' },
    { name: 'year_month' },
    { name: 'rent' },
    { name: 'materials' },
    { name: 'utilities' },
    { name: 'others' },
    { name: 'created_at' },
    { name: 'updated_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.company_holidays = {
  name: 'company_holidays',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'company_name' },
    { name: 'holiday_date' },
    { name: 'name' },
    { name: 'note' },
    { name: 'created_by' },
    { name: 'created_by_name' },
    { name: 'created_at' },
    { name: 'updated_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.contract_templates = {
  name: 'contract_templates',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'company_name' },
    { name: 'template_content' },
    { name: 'seal_url' },
    { name: 'created_at' },
    { name: 'updated_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.corporate_cards = {
  name: 'corporate_cards',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'company_name' },
    { name: 'card_nickname' },
    { name: 'last_four' },
    { name: 'issuer' },
    { name: 'holder_id' },
    { name: 'status' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.daily_closures = {
  name: 'daily_closures',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'company_id' },
    { name: 'date' },
    { name: 'total_amount', coerce: 'int' },
    { name: 'petty_cash_start', coerce: 'int' },
    { name: 'petty_cash_end', coerce: 'int' },
    { name: 'status' },
    { name: 'created_by' },
    { name: 'memo' },
    { name: 'created_at' },
    { name: 'updated_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.delivery_confirmations = {
  name: 'delivery_confirmations',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'doc_number' },
    { name: 'issue_date' },
    { name: 'supplier_name' },
    { name: 'supplier_rep' },
    { name: 'receiver_company' },
    { name: 'receiver_rep' },
    { name: 'delivery_date' },
    { name: 'notes' },
    { name: 'items', coerce: 'json' },
    { name: 'total_amount' },
    { name: 'created_by' },
    { name: 'created_by_id' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.department_private_inventory_items = {
  name: 'department_private_inventory_items',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'company' },
    { name: 'company_id' },
    { name: 'department' },
    { name: 'item_name' },
    { name: 'category' },
    { name: 'unit' },
    { name: 'quantity', coerce: 'int' },
    { name: 'min_quantity', coerce: 'int' },
    { name: 'total_used', coerce: 'int' },
    { name: 'memo' },
    { name: 'created_by' },
    { name: 'created_by_name' },
    { name: 'updated_by' },
    { name: 'updated_by_name' },
    { name: 'created_at' },
    { name: 'updated_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.device_inspections = {
  name: 'device_inspections',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'device_id' },
    { name: 'device_name' },
    { name: 'inspected_at' },
    { name: 'inspector' },
    { name: 'result' },
    { name: 'notes' },
    { name: 'next_inspection_date' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.discharge_reviews = {
  name: 'discharge_reviews',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'patient_name' },
    { name: 'department' },
    { name: 'admission_date' },
    { name: 'discharge_date' },
    { name: 'diagnosis' },
    { name: 'items', coerce: 'json' },
    { name: 'status' },
    { name: 'reviewer_name' },
    { name: 'reviewer_id' },
    { name: 'ai_analysis' },
    { name: 'created_at' },
    { name: 'chart_data' },
    { name: 'template_id' },
    { name: 'birth_date' },
    { name: 'gender' },
    { name: 'insurance_type' },
    { name: 'surgery_name' },
    { name: 'surgery_date' },
    { name: 'room_grade' },
    { name: 'doctor_name' },
    { name: 'comorbidities' },
    { name: 'admission_route' },
    { name: 'discharge_type' },
    { name: 'drg_code' },
    { name: 'disease_codes' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.discharge_templates = {
  name: 'discharge_templates',
  select: '*',
  orderBy: 'updated_at',
  columns: [
    { name: 'id' },
    { name: 'items', coerce: 'json' },
    { name: 'updated_at' },
    { name: 'title' },
  ],
  defaults: {},
};

TABLE_DEFS.document_repository = {
  name: 'document_repository',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'title' },
    { name: 'category' },
    { name: 'content' },
    { name: 'file_url' },
    { name: 'version', coerce: 'int' },
    { name: 'company_name' },
    { name: 'created_by' },
    { name: 'created_at' },
    { name: 'updated_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.education_records = {
  name: 'education_records',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'staff_id' },
    { name: 'education_name' },
    { name: 'deadline' },
    { name: 'completed_at' },
    { name: 'status' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.employment_contracts = {
  name: 'employment_contracts',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'staff_id' },
    { name: 'contract_type' },
    { name: 'status' },
    { name: 'base_salary', coerce: 'int' },
    { name: 'meal_allowance', coerce: 'int' },
    { name: 'vehicle_allowance', coerce: 'int' },
    { name: 'childcare_allowance', coerce: 'int' },
    { name: 'position_allowance', coerce: 'int' },
    { name: 'research_allowance', coerce: 'int' },
    { name: 'other_taxfree', coerce: 'int' },
    { name: 'effective_date' },
    { name: 'probation_months', coerce: 'int' },
    { name: 'probation_percent', coerce: 'int' },
    { name: 'payment_day', coerce: 'int' },
    { name: 'content' },
    { name: 'working_hours_per_week' },
    { name: 'working_days_per_week', coerce: 'int' },
    { name: 'shift_start_time' },
    { name: 'shift_end_time' },
    { name: 'break_start_time' },
    { name: 'break_end_time' },
    { name: 'signature_data' },
    { name: 'requested_at' },
    { name: 'signed_at' },
    { name: 'created_at' },
    { name: 'start_date' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.freelancer_payments = {
  name: 'freelancer_payments',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'company_name' },
    { name: 'year_month' },
    { name: 'vendor_name' },
    { name: 'work_type' },
    { name: 'payment_date' },
    { name: 'supply_amount', coerce: 'int' },
    { name: 'tax_rate' },
    { name: 'withholding_tax', coerce: 'int' },
    { name: 'note' },
    { name: 'created_by' },
    { name: 'created_at' },
    { name: 'updated_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.generated_reports = {
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
};

TABLE_DEFS.handover_notes = {
  name: 'handover_notes',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'content' },
    { name: 'author_id' },
    { name: 'author_name' },
    { name: 'shift' },
    { name: 'priority' },
    { name: 'is_completed', coerce: 'bool' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.health_checkups = {
  name: 'health_checkups',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'staff_id' },
    { name: 'staff_name' },
    { name: 'company' },
    { name: 'department' },
    { name: 'checkup_type' },
    { name: 'scheduled_date' },
    { name: 'completed_date' },
    { name: 'status' },
    { name: 'hospital' },
    { name: 'result' },
    { name: 'memo' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.incident_reports = {
  name: 'incident_reports',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'incident_date' },
    { name: 'incident_time' },
    { name: 'location' },
    { name: 'type' },
    { name: 'severity' },
    { name: 'description' },
    { name: 'involved_persons' },
    { name: 'immediate_action' },
    { name: 'root_cause' },
    { name: 'preventive_measures' },
    { name: 'reporter_id' },
    { name: 'reporter_name' },
    { name: 'status' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.inventory_closing_snapshots = {
  name: 'inventory_closing_snapshots',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'closing_month' },
    { name: 'snapshot_date' },
    { name: 'company' },
    { name: 'company_id' },
    { name: 'status' },
    { name: 'item_count', coerce: 'int' },
    { name: 'total_quantity' },
    { name: 'total_value' },
    { name: 'summary', coerce: 'json' },
    { name: 'items', coerce: 'json' },
    { name: 'created_by_id' },
    { name: 'created_by_name' },
    { name: 'closed_at' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.inventory_count_sessions = {
  name: 'inventory_count_sessions',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'conducted_by' },
    { name: 'conducted_name' },
    { name: 'total_items', coerce: 'int' },
    { name: 'discrepancy_count', coerce: 'int' },
    { name: 'report', coerce: 'json' },
    { name: 'created_at' },
    { name: 'company' },
    { name: 'company_id' },
    { name: 'department' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.inventory_logs = {
  name: 'inventory_logs',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'item_id' },
    { name: 'type' },
    { name: 'quantity', coerce: 'int' },
    { name: 'created_at' },
    { name: 'inventory_id' },
    { name: 'change_type' },
    { name: 'prev_quantity', coerce: 'int' },
    { name: 'next_quantity', coerce: 'int' },
    { name: 'actor_name' },
    { name: 'company' },
    { name: 'company_id' },
    { name: 'department' },
    { name: 'notes' },
    { name: 'actor_id' },
    { name: 'approval_id' },
    { name: 'purchase_order_id' },
    { name: 'serial_number' },
    { name: 'lot_number' },
    { name: 'expiry_date' },
    { name: 'location' },
    { name: 'unit_price' },
    { name: 'supplier_name' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.inventory_receipts = {
  name: 'inventory_receipts',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'item_id' },
    { name: 'qty', coerce: 'int' },
    { name: 'unit_price' },
    { name: 'supplier_id' },
    { name: 'receipt_date' },
    { name: 'receipt_type' },
    { name: 'lot_number' },
    { name: 'expiry_date' },
    { name: 'invoice_number' },
    { name: 'notes' },
    { name: 'created_by' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.inventory_transfers = {
  name: 'inventory_transfers',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'item_id' },
    { name: 'item_name' },
    { name: 'quantity', coerce: 'int' },
    { name: 'from_company' },
    { name: 'from_department' },
    { name: 'to_company' },
    { name: 'to_department' },
    { name: 'reason' },
    { name: 'transferred_by' },
    { name: 'transferred_by_id' },
    { name: 'status' },
    { name: 'created_at' },
    { name: 'approval_id' },
    { name: 'purchase_order_id' },
    { name: 'serial_number' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.job_category_required_trainings = {
  name: 'job_category_required_trainings',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'job_category_id' },
    { name: 'applies_to_all', coerce: 'bool' },
    { name: 'training_code' },
    { name: 'training_name' },
    { name: 'cycle_months', coerce: 'int' },
    { name: 'mandatory', coerce: 'bool' },
    { name: 'obligation_type' },
    { name: 'legal_basis' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.leave_balances = {
  name: 'leave_balances',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'staff_id' },
    { name: 'year', coerce: 'int' },
    { name: 'total_days' },
    { name: 'used_days' },
    { name: 'remaining_days' },
    { name: 'expiry_date' },
    { name: 'expired_days' },
    { name: 'expired_at' },
    { name: 'created_at' },
    { name: 'updated_at' },
    { name: 'compensated_days' },
    { name: 'compensated_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.leave_requests = {
  name: 'leave_requests',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'staff_id' },
    { name: 'leave_type' },
    { name: 'start_date' },
    { name: 'end_date' },
    { name: 'reason' },
    { name: 'status' },
    { name: 'approved_at' },
    { name: 'created_at' },
    { name: 'company_id' },
    { name: 'days' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.message_bookmarks = {
  name: 'message_bookmarks',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'user_id' },
    { name: 'message_id' },
    { name: 'room_id' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.message_reactions = {
  name: 'message_reactions',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'message_id' },
    { name: 'user_id' },
    { name: 'emoji' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.message_reads = {
  name: 'message_reads',
  select: '*',
  orderBy: 'read_at',
  columns: [
    { name: 'id' },
    { name: 'message_id' },
    { name: 'reader_id' },
    { name: 'read_at' },
    { name: 'user_id' },
  ],
  defaults: { id: uuidDefault },
};

TABLE_DEFS.messenger_drive_links = {
  name: 'messenger_drive_links',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'company_name' },
    { name: 'room_id' },
    { name: 'name' },
    { name: 'url' },
    { name: 'sort_order', coerce: 'int' },
    { name: 'created_by' },
    { name: 'updated_by' },
    { name: 'created_at' },
    { name: 'updated_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.monthly_off_quota = {
  name: 'monthly_off_quota',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'company' },
    { name: 'year_month' },
    { name: 'default_off_days', coerce: 'int' },
    { name: 'staff_overrides', coerce: 'json' },
    { name: 'created_at' },
    { name: 'updated_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.mri_templates = {
  name: 'mri_templates',
  select: '*',
  orderBy: 'sort_order',
  columns: [
    { name: 'id' },
    { name: 'name' },
    { name: 'sort_order', coerce: 'int' },
    { name: 'is_active', coerce: 'bool' },
    { name: 'body_part' },
  ],
  defaults: { id: uuidDefault },
};

TABLE_DEFS.notification_templates = {
  name: 'notification_templates',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'template_type' },
    { name: 'name' },
    { name: 'content' },
    { name: 'variables', coerce: 'json' },
    { name: 'is_active', coerce: 'bool' },
    { name: 'company_name' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.notifications = {
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
};

TABLE_DEFS.official_doc_log = {
  name: 'official_doc_log',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id', coerce: 'int' }, // INTEGER PK — Supabase 원본 id 보존
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
};

TABLE_DEFS.onboarding_checklists = {
  name: 'onboarding_checklists',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'staff_id' },
    { name: 'checklist_type' },
    { name: 'items', coerce: 'json' },
    { name: 'target_date' },
    { name: 'completed_at' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.op_check_templates = {
  name: 'op_check_templates',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'company_id' },
    { name: 'company_name' },
    { name: 'template_scope' },
    { name: 'template_name' },
    { name: 'surgery_template_id' },
    { name: 'surgery_name' },
    { name: 'anesthesia_type' },
    { name: 'prep_items', coerce: 'json' },
    { name: 'consumable_items', coerce: 'json' },
    { name: 'notes' },
    { name: 'is_active', coerce: 'bool' },
    { name: 'created_by' },
    { name: 'created_by_name' },
    { name: 'created_at' },
    { name: 'updated_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.op_patient_checks = {
  name: 'op_patient_checks',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'schedule_post_id' },
    { name: 'company_id' },
    { name: 'company_name' },
    { name: 'patient_name' },
    { name: 'chart_no' },
    { name: 'surgery_name' },
    { name: 'surgery_template_id' },
    { name: 'anesthesia_type' },
    { name: 'schedule_date' },
    { name: 'schedule_time' },
    { name: 'schedule_room' },
    { name: 'prep_items', coerce: 'json' },
    { name: 'consumable_items', coerce: 'json' },
    { name: 'notes' },
    { name: 'status' },
    { name: 'applied_template_ids', coerce: 'json' },
    { name: 'created_by' },
    { name: 'created_by_name' },
    { name: 'updated_by' },
    { name: 'updated_by_name' },
    { name: 'created_at' },
    { name: 'updated_at' },
    { name: 'surgery_started_at' },
    { name: 'surgery_ended_at' },
    { name: 'ward_message_sent_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.org_teams = {
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
};

TABLE_DEFS.payroll = {
  name: 'payroll',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'company_id' },
    { name: 'staff_id' },
    { name: 'month' },
    { name: 'base_salary' },
    { name: 'total_salary' },
    { name: 'status' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.payroll_approval_logs = {
  name: 'payroll_approval_logs',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'company_name' },
    { name: 'year_month' },
    { name: 'actor_id' },
    { name: 'actor_name' },
    { name: 'action' },
    { name: 'comment' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.payroll_approval_workflows = {
  name: 'payroll_approval_workflows',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'company_name' },
    { name: 'year_month' },
    { name: 'step1_status' },
    { name: 'step2_status' },
    { name: 'step1_comment' },
    { name: 'step2_comment' },
    { name: 'step1_actor_id' },
    { name: 'step2_actor_id' },
    { name: 'step1_updated_at' },
    { name: 'step2_updated_at' },
    { name: 'created_at' },
    { name: 'updated_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.payroll_bonus_items = {
  name: 'payroll_bonus_items',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'staff_id' },
    { name: 'company_name' },
    { name: 'year_month' },
    { name: 'category' },
    { name: 'amount', coerce: 'int' },
    { name: 'note' },
    { name: 'created_by' },
    { name: 'created_at' },
    { name: 'updated_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.payroll_calendar_items = {
  name: 'payroll_calendar_items',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'company_name' },
    { name: 'year_month' },
    { name: 'title' },
    { name: 'due_date' },
    { name: 'owner_label' },
    { name: 'status' },
    { name: 'sort_order', coerce: 'int' },
    { name: 'created_by' },
    { name: 'updated_by' },
    { name: 'created_at' },
    { name: 'updated_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.payroll_deduction_controls = {
  name: 'payroll_deduction_controls',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'staff_id' },
    { name: 'company_name' },
    { name: 'deduction_type' },
    { name: 'monthly_amount', coerce: 'int' },
    { name: 'balance', coerce: 'int' },
    { name: 'note' },
    { name: 'is_active', coerce: 'bool' },
    { name: 'created_by' },
    { name: 'created_at' },
    { name: 'updated_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.payroll_locks = {
  name: 'payroll_locks',
  select: '*',
  orderBy: 'locked_at',
  columns: [
    { name: 'id' },
    { name: 'year_month' },
    { name: 'company_name' },
    { name: 'locked_at' },
    { name: 'locked_by' },
    { name: 'memo' },
    { name: 'reopen_requested_at' },
    { name: 'reopen_requested_by' },
    { name: 'reopen_request_comment' },
    { name: 'reopen_request_status' },
    { name: 'reopen_reviewed_at' },
    { name: 'reopen_reviewed_by' },
    { name: 'reopen_review_comment' },
  ],
  defaults: { id: uuidDefault },
};

TABLE_DEFS.payroll_policy_versions = {
  name: 'payroll_policy_versions',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'company_name' },
    { name: 'effective_year', coerce: 'int' },
    { name: 'version_label' },
    { name: 'snapshot', coerce: 'json' },
    { name: 'note' },
    { name: 'created_by' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.payroll_records = {
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

TABLE_DEFS.payroll_retro_adjustments = {
  name: 'payroll_retro_adjustments',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'staff_id' },
    { name: 'company_name' },
    { name: 'start_month' },
    { name: 'end_month' },
    { name: 'before_base', coerce: 'int' },
    { name: 'after_base', coerce: 'int' },
    { name: 'retro_total', coerce: 'int' },
    { name: 'reason' },
    { name: 'created_by' },
    { name: 'created_at' },
    { name: 'updated_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.personnel_appointments = {
  name: 'personnel_appointments',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'staff_id' },
    { name: 'staff_name' },
    { name: 'company' },
    { name: 'order_type' },
    { name: 'effective_date' },
    { name: 'before_dept' },
    { name: 'after_dept' },
    { name: 'before_position' },
    { name: 'after_position' },
    { name: 'before_role' },
    { name: 'after_role' },
    { name: 'reason' },
    { name: 'memo' },
    { name: 'status' },
    { name: 'issued_by' },
    { name: 'issued_at' },
    { name: 'created_at' },
    { name: 'new_department' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.pinned_messages = {
  name: 'pinned_messages',
  select: '*',
  orderBy: 'pinned_at',
  columns: [
    { name: 'id' },
    { name: 'room_id' },
    { name: 'message_id' },
    { name: 'pinned_by' },
    { name: 'pinned_at' },
  ],
  defaults: { id: uuidDefault },
};

TABLE_DEFS.popups = {
  name: 'popups',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'title' },
    { name: 'media_url' },
    { name: 'media_type' },
    { name: 'width', coerce: 'int' },
    { name: 'height', coerce: 'int' },
    { name: 'is_active', coerce: 'bool' },
    { name: 'created_at' },
    { name: 'link_url' },
    { name: 'start_at' },
    { name: 'end_at' },
    { name: 'priority', coerce: 'int' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.posts = {
  name: 'posts',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'board_type' },
    { name: 'title' },
    { name: 'content' },
    { name: 'author_id' },
    { name: 'author_name' },
    { name: 'company' },
    { name: 'views', coerce: 'int' },
    { name: 'created_at' },
    { name: 'company_id' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.push_subscriptions = {
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
};

TABLE_DEFS.report_schedules = {
  name: 'report_schedules',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'company_id' },
    { name: 'report_type' },
    { name: 'schedule_cron' },
    { name: 'recipients', coerce: 'json' },
    { name: 'enabled', coerce: 'bool' },
    { name: 'last_generated_at' },
    { name: 'created_at' },
    { name: 'updated_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.retirement_pensions = {
  name: 'retirement_pensions',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'staff_id' },
    { name: 'staff_name' },
    { name: 'pension_type' },
    { name: 'joined_date' },
    { name: 'account_number' },
    { name: 'fund_name' },
    { name: 'monthly_contribution' },
    { name: 'total_accumulated' },
    { name: 'memo' },
    { name: 'created_at' },
    { name: 'updated_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.reward_discipline = {
  name: 'reward_discipline',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'staff_id' },
    { name: 'staff_name' },
    { name: 'company' },
    { name: 'department' },
    { name: 'category' },
    { name: 'type' },
    { name: 'date' },
    { name: 'reason' },
    { name: 'detail' },
    { name: 'amount' },
    { name: 'committee_date' },
    { name: 'committee_members' },
    { name: 'committee_result' },
    { name: 'memo' },
    { name: 'issued_by' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.room_notification_settings = {
  name: 'room_notification_settings',
  select: '*',
  orderBy: 'id',
  columns: [
    { name: 'id' },
    { name: 'user_id' },
    { name: 'room_id' },
    { name: 'notifications_enabled', coerce: 'bool' },
  ],
  defaults: { id: uuidDefault },
};

TABLE_DEFS.room_read_cursors = {
  name: 'room_read_cursors',
  select: '*',
  orderBy: 'last_read_at',
  columns: [
    { name: 'id' },
    { name: 'user_id' },
    { name: 'room_id' },
    { name: 'last_read_at' },
  ],
  defaults: { id: uuidDefault },
};

TABLE_DEFS.salary_change_history = {
  name: 'salary_change_history',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'staff_id' },
    { name: 'change_type' },
    { name: 'before_value', coerce: 'int' },
    { name: 'after_value', coerce: 'int' },
    { name: 'effective_date' },
    { name: 'reason' },
    { name: 'created_by' },
    { name: 'created_at' },
    { name: 'previous_salary' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.scheduled_messages = {
  name: 'scheduled_messages',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'room_id' },
    { name: 'sender_id' },
    { name: 'content' },
    { name: 'scheduled_at' },
    { name: 'is_sent', coerce: 'bool' },
    { name: 'reply_to_id' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.shift_assignments = {
  name: 'shift_assignments',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'staff_id' },
    { name: 'work_date' },
    { name: 'shift_id' },
    { name: 'company_name' },
    { name: 'created_at' },
    { name: 'shift_name' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.staff_certifications = {
  name: 'staff_certifications',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'staff_id' },
    { name: 'name' },
    { name: 'issuer' },
    { name: 'issue_date' },
    { name: 'expiry_date' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.staff_evaluations = {
  name: 'staff_evaluations',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'staff_id' },
    { name: 'evaluator_id' },
    { name: 'category' },
    { name: 'content' },
    { name: 'score', coerce: 'int' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.staff_job_categories = {
  name: 'staff_job_categories',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'staff_id' },
    { name: 'job_category_id' },
    { name: 'is_primary', coerce: 'bool' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.staff_licenses = {
  name: 'staff_licenses',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'staff_id' },
    { name: 'license_name' },
    { name: 'license_number' },
    { name: 'issued_date' },
    { name: 'expiry_date' },
    { name: 'issuing_body' },
    { name: 'memo' },
    { name: 'created_at' },
    { name: 'license_type' },
    { name: 'is_primary', coerce: 'bool' },
    { name: 'updated_at' },
    { name: 'renewed_date' },
    { name: 'attachment_url' },
    { name: 'copy_url' },
    { name: 'document_url' },
    { name: 'document_file_url' },
    { name: 'license_file_url' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.staff_preferred_off = {
  name: 'staff_preferred_off',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'staff_id' },
    { name: 'year_month' },
    { name: 'preferred_weekdays', coerce: 'json' },
    { name: 'preferred_dates', coerce: 'json' },
    { name: 'notes' },
    { name: 'created_at' },
    { name: 'updated_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.staff_shift_assignments = {
  name: 'staff_shift_assignments',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'staff_id' },
    { name: 'shift_id' },
    { name: 'is_primary', coerce: 'bool' },
    { name: 'priority', coerce: 'int' },
    { name: 'effective_from' },
    { name: 'effective_to' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.staff_trainings = {
  name: 'staff_trainings',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'staff_id' },
    { name: 'training_code' },
    { name: 'training_name' },
    { name: 'assigned_at' },
    { name: 'mandatory', coerce: 'bool' },
    { name: 'obligation_type' },
    { name: 'cycle_months', coerce: 'int' },
    { name: 'status' },
    { name: 'completed_at' },
    { name: 'certificate_url' },
    { name: 'memo' },
    { name: 'created_at' },
    { name: 'updated_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.staff_transfer_history = {
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
};

TABLE_DEFS.surgery_templates = {
  name: 'surgery_templates',
  select: '*',
  orderBy: 'sort_order',
  columns: [
    { name: 'id' },
    { name: 'name' },
    { name: 'sort_order', coerce: 'int' },
    { name: 'is_active', coerce: 'bool' },
    { name: 'body_part' },
  ],
  defaults: { id: uuidDefault },
};

TABLE_DEFS.system_configs = {
  name: 'system_configs',
  pk: 'key', // id 컬럼 없음 — PK는 key
  select: '*',
  orderBy: 'key',
  columns: [
    { name: 'key' },
    { name: 'value', coerce: 'json' },
    { name: 'description' },
    { name: 'updated_at' },
  ],
  defaults: {},
};

TABLE_DEFS.system_settings = {
  name: 'system_settings',
  pk: 'key', // id 컬럼 없음 — PK는 key
  select: '*',
  orderBy: 'key',
  columns: [
    { name: 'key' },
    { name: 'value', coerce: 'json' },
    { name: 'updated_at' },
  ],
  defaults: {},
};

TABLE_DEFS.tasks = {
  name: 'tasks',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'title' },
    { name: 'content' },
    { name: 'status' },
    { name: 'priority' },
    { name: 'assignee_id' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.tax_free_settings = {
  name: 'tax_free_settings',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'company_name' },
    { name: 'meal_limit', coerce: 'int' },
    { name: 'vehicle_limit', coerce: 'int' },
    { name: 'childcare_limit', coerce: 'int' },
    { name: 'research_limit', coerce: 'int' },
    { name: 'uniform_limit', coerce: 'int' },
    { name: 'congratulations_limit', coerce: 'int' },
    { name: 'housing_limit', coerce: 'int' },
    { name: 'other_taxfree_limit', coerce: 'int' },
    { name: 'effective_year', coerce: 'int' },
    { name: 'created_at' },
    { name: 'updated_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.tax_insurance_rates = {
  name: 'tax_insurance_rates',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'effective_year', coerce: 'int' },
    { name: 'company_name' },
    { name: 'national_pension_rate' },
    { name: 'health_insurance_rate' },
    { name: 'long_term_care_rate' },
    { name: 'employment_insurance_rate' },
    { name: 'income_tax_bracket', coerce: 'json' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.tax_reports = {
  name: 'tax_reports',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'year' },
    { name: 'company_name' },
    { name: 'report_type' },
    { name: 'report_date' },
    { name: 'data', coerce: 'json' },
    { name: 'status' },
    { name: 'created_at' },
    { name: 'updated_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.todos = {
  name: 'todos',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'user_id' },
    { name: 'content' },
    { name: 'is_complete', coerce: 'bool' },
    { name: 'task_date' },
    { name: 'created_at' },
    { name: 'source_message_id' },
    { name: 'source_room_id' },
    { name: 'repeat_parent_id' },
    { name: 'repeat_generated_from_id' },
    { name: 'priority' },
    { name: 'reminder_at' },
    { name: 'repeat_type' },
    { name: 'assignee_kind' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.todo_reminder_logs = {
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
};

TABLE_DEFS.unpaid_absence_records = {
  name: 'unpaid_absence_records',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'staff_id' },
    { name: 'staff_name' },
    { name: 'year_month' },
    { name: 'absent_days' },
    { name: 'monthly_salary', coerce: 'int' },
    { name: 'working_days', coerce: 'int' },
    { name: 'daily_wage' },
    { name: 'deduction_amount', coerce: 'int' },
    { name: 'note' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.virtual_account_deposits = {
  name: 'virtual_account_deposits',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'company_id' },
    { name: 'provider' },
    { name: 'dedupe_key' },
    { name: 'provider_event_type' },
    { name: 'provider_event_id' },
    { name: 'order_id' },
    { name: 'order_name' },
    { name: 'payment_key' },
    { name: 'transaction_key' },
    { name: 'method' },
    { name: 'deposit_status' },
    { name: 'match_status' },
    { name: 'amount' },
    { name: 'currency' },
    { name: 'depositor_name' },
    { name: 'customer_name' },
    { name: 'patient_name' },
    { name: 'patient_id' },
    { name: 'transaction_label' },
    { name: 'bank_code' },
    { name: 'bank_name' },
    { name: 'account_number' },
    { name: 'due_date' },
    { name: 'deposited_at' },
    { name: 'matched_target_type' },
    { name: 'matched_target_id' },
    { name: 'matched_note' },
    { name: 'raw_payload', coerce: 'json' },
    { name: 'created_at' },
    { name: 'updated_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.wiki_documents = {
  name: 'wiki_documents',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'folder_id' },
    { name: 'company_id' },
    { name: 'company_name' },
    { name: 'title' },
    { name: 'summary' },
    { name: 'content' },
    { name: 'tags', coerce: 'json' },
    { name: 'editor_ids', coerce: 'json' },
    { name: 'is_published', coerce: 'bool' },
    { name: 'is_archived', coerce: 'bool' },
    { name: 'created_by' },
    { name: 'updated_by' },
    { name: 'created_at' },
    { name: 'updated_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

// ---------------------------------------------------------------------------
// Level 2: wiki_documents, board_posts, messages 등을 참조
// ---------------------------------------------------------------------------

TABLE_DEFS.board_post_comments = {
  name: 'board_post_comments',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'post_id' },
    { name: 'author_id' },
    { name: 'author_name' },
    { name: 'content' },
    { name: 'created_at' },
    { name: 'parent_comment_id' },
    { name: 'is_anonymous', coerce: 'bool' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.board_post_likes = {
  name: 'board_post_likes',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'post_id' },
    { name: 'user_id' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.board_post_reads = {
  name: 'board_post_reads',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'post_id' },
    { name: 'user_id' },
    { name: 'read_at' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.corporate_card_transactions = {
  name: 'corporate_card_transactions',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'card_holder_id' },
    { name: 'transaction_date' },
    { name: 'merchant' },
    { name: 'category' },
    { name: 'amount', coerce: 'int' },
    { name: 'description' },
    { name: 'receipt_url' },
    { name: 'company_name' },
    { name: 'created_at' },
    { name: 'card_id' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.daily_checks = {
  name: 'daily_checks',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'closure_id' },
    { name: 'check_number' },
    { name: 'amount', coerce: 'int' },
    { name: 'bank_name' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.daily_closure_items = {
  name: 'daily_closure_items',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'closure_id' },
    { name: 'patient_name' },
    { name: 'amount', coerce: 'int' },
    { name: 'payment_method' },
    { name: 'receipt_type' },
    { name: 'memo' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.department_private_inventory_logs = {
  name: 'department_private_inventory_logs',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'item_id' },
    { name: 'company' },
    { name: 'company_id' },
    { name: 'department' },
    { name: 'item_name' },
    { name: 'action' },
    { name: 'quantity', coerce: 'int' },
    { name: 'prev_quantity', coerce: 'int' },
    { name: 'next_quantity', coerce: 'int' },
    { name: 'actor_id' },
    { name: 'actor_name' },
    { name: 'notes' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.document_versions = {
  name: 'document_versions',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'document_id' },
    { name: 'version', coerce: 'int' },
    { name: 'content' },
    { name: 'file_url' },
    { name: 'created_by' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.inventory_cost_entries = {
  name: 'inventory_cost_entries',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'purchase_order_id' },
    { name: 'approval_id' },
    { name: 'inventory_item_id' },
    { name: 'order_item_index', coerce: 'int' },
    { name: 'item_name' },
    { name: 'company_id' },
    { name: 'company_name' },
    { name: 'department' },
    { name: 'supplier_id' },
    { name: 'supplier_name' },
    { name: 'qty_ordered' },
    { name: 'qty_received' },
    { name: 'qty_rejected' },
    { name: 'qty_pending' },
    { name: 'unit_price' },
    { name: 'supply_amount' },
    { name: 'vat_amount' },
    { name: 'total_amount' },
    { name: 'cost_center' },
    { name: 'budget_item' },
    { name: 'account_code' },
    { name: 'posted_status' },
    { name: 'occurred_at' },
    { name: 'posted_at' },
    { name: 'posted_by_id' },
    { name: 'posted_by_name' },
    { name: 'idempotency_key' },
    { name: 'notes' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.inventory_price_history = {
  name: 'inventory_price_history',
  select: '*',
  orderBy: 'recorded_at',
  columns: [
    { name: 'id' },
    { name: 'inventory_item_id' },
    { name: 'supplier_id' },
    { name: 'supplier_name' },
    { name: 'unit_price' },
    { name: 'quantity', coerce: 'int' },
    { name: 'total_amount' },
    { name: 'source_type' },
    { name: 'recorded_at' },
    { name: 'recorded_by' },
    { name: 'purchase_order_id' },
    { name: 'notes' },
  ],
  defaults: { id: uuidDefault },
};

TABLE_DEFS.poll_votes = {
  name: 'poll_votes',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'poll_id' },
    { name: 'user_id' },
    { name: 'option_index', coerce: 'int' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

TABLE_DEFS.wiki_document_versions = {
  name: 'wiki_document_versions',
  select: '*',
  orderBy: 'created_at',
  columns: [
    { name: 'id' },
    { name: 'document_id' },
    { name: 'version_no', coerce: 'int' },
    { name: 'title' },
    { name: 'summary' },
    { name: 'content' },
    { name: 'tags', coerce: 'json' },
    { name: 'editor_ids', coerce: 'json' },
    { name: 'company_id' },
    { name: 'company_name' },
    { name: 'change_summary' },
    { name: 'restore_of_version_id' },
    { name: 'created_by' },
    { name: 'created_at' },
  ],
  defaults: { id: uuidDefault, created_at: nowIso },
};

// ---------------------------------------------------------------------------
// FK 위상 정렬 결과 — 125개 테이블 삽입 순서
// 자기참조(self-reference) FK: companies.mso_id, inventory_categories.parent_id,
//   messages.reply_to_id, board_post_comments.parent_comment_id,
//   wiki_document_versions.restore_of_version_id → 순환 아님, 무시
// 순환 의존: 없음
// ---------------------------------------------------------------------------
export const FULL_BACKFILL_ORDER = [
  // ── Level 0: 독립 루트 테이블 (다른 테이블을 참조하지 않음)
  'work_shifts',
  'companies',
  'suppliers',
  'job_categories',
  'medical_devices',
  'inventory_categories',
  'surgery_templates',
  'mri_templates',
  'discharge_templates',
  // ── Level 1: 위 테이블만 참조
  'staff_members',       // → companies, work_shifts
  'chat_rooms',
  'org_teams',
  'system_settings',
  'system_configs',
  'tax_free_settings',
  'tax_insurance_rates',
  'attendance_deduction_rules',
  'notification_templates',
  'contract_templates',
  'company_holidays',
  'company_expenses',
  'popups',
  'tasks',
  'monthly_off_quota',
  'handover_notes',
  'corporate_cards',
  'medical_devices',     // 이미 위에 있음 — 순서 목록 중복 방지용 주석
  'document_repository',
  'approval_templates',
  'mri_templates',       // 위에서 이미 삽입
  // ── Level 2: staff_members / chat_rooms / companies 참조
  'approvals',           // → companies, staff_members
  'wiki_folders',        // → staff_members
  'inventory',           // → companies, suppliers
  'purchase_orders',     // → suppliers, staff_members, approvals
  'messages',            // → chat_rooms (self-ref reply_to_id 무시)
  'notifications',       // → staff_members
  'todos',               // 독립 (user_id는 참조 없음)
  'board_posts',         // → companies
  'posts',               // → companies
  'daily_closures',      // → companies, staff_members
  'report_schedules',
  'generated_reports',
  'tax_reports',
  'backup_restore_runs', // → staff_members
  // ── Level 3: 위 테이블들 참조
  'access_logs',
  'annual_leave_promotion_logs',  // → staff_members
  'approval_history',             // → approvals
  'asset_loans',                  // → staff_members
  'attendance',                   // → staff_members, companies
  'attendance_corrections',       // → staff_members
  'attendances',
  'audit_logs',
  'board_post_comments',          // → board_posts, staff_members (self-ref parent 무시)
  'board_post_likes',             // → board_posts
  'board_post_reads',             // → board_posts, staff_members
  'certificate_issuances',        // → staff_members
  'chat_messages',                // → chat_rooms, staff_members
  'chat_push_jobs',               // → messages, chat_rooms, staff_members
  'chat_room_favorites',          // → staff_members, chat_rooms
  'chat_room_prefs',              // → staff_members
  'corporate_card_transactions',  // → corporate_cards
  'daily_checks',                 // → daily_closures
  'daily_closure_items',          // → daily_closures
  'delivery_confirmations',
  'official_doc_log',
  'department_private_inventory_items',  // → companies, staff_members
  'department_private_inventory_logs',   // → department_private_inventory_items, companies, staff_members
  'device_inspections',           // → medical_devices
  'discharge_reviews',
  'document_versions',            // → document_repository
  'education_records',            // → staff_members
  'employment_contracts',         // → staff_members
  'freelancer_payments',          // → staff_members
  'health_checkups',              // → staff_members (Supabase에 FK없음 — 단순 복사)
  'incident_reports',
  'inventory_categories',         // 이미 삽입됨 (self-ref)
  'inventory_closing_snapshots',  // → companies, staff_members
  'inventory_cost_entries',       // → purchase_orders, approvals, inventory, companies, suppliers, staff_members
  'inventory_count_sessions',     // → companies
  'inventory_logs',               // → staff_members, companies, approvals, purchase_orders
  'inventory_price_history',      // → inventory, suppliers, staff_members, purchase_orders
  'inventory_receipts',           // → inventory, suppliers, staff_members
  'inventory_transfers',          // → approvals, purchase_orders
  'job_category_required_trainings', // → job_categories
  'leave_balances',               // → staff_members
  'leave_requests',               // → staff_members, companies
  'message_bookmarks',            // → messages
  'message_reactions',            // → messages
  'message_reads',                // → chat_messages, staff_members
  'messenger_drive_links',        // → chat_rooms, staff_members
  'notification_templates',       // 독립 (이미 위)
  'onboarding_checklists',        // → staff_members
  'op_check_templates',           // → staff_members
  'op_patient_checks',            // → staff_members
  'org_teams',                    // 독립 (이미 위)
  'payroll',                      // → companies, staff_members
  'payroll_approval_logs',        // → staff_members
  'payroll_approval_workflows',   // → staff_members
  'payroll_bonus_items',          // → staff_members
  'payroll_calendar_items',       // → staff_members
  'payroll_deduction_controls',   // → staff_members
  'payroll_locks',                // → staff_members
  'payroll_policy_versions',      // → staff_members
  'payroll_records',              // → staff_members
  'payroll_retro_adjustments',    // → staff_members
  'personnel_appointments',       // → staff_members
  'pinned_messages',              // → messages
  'polls',                        // → chat_rooms, messages
  'poll_votes',                   // → polls
  'push_subscriptions',           // → staff_members
  'retirement_pensions',          // → staff_members
  'reward_discipline',            // → staff_members
  'room_notification_settings',   // → staff_members
  'room_read_cursors',            // → staff_members
  'salary_change_history',        // → staff_members
  'scheduled_messages',           // → chat_rooms, messages
  'shift_assignments',            // → staff_members, work_shifts
  'staff_certifications',         // → staff_members
  'staff_evaluations',            // → staff_members
  'staff_job_categories',         // → staff_members, job_categories
  'staff_licenses',               // → staff_members
  'staff_preferred_off',          // → staff_members
  'staff_shift_assignments',      // → staff_members, work_shifts
  'staff_trainings',              // → staff_members
  'staff_transfer_history',       // → staff_members, approvals
  'todo_reminder_logs',           // → notifications, staff_members
  'unpaid_absence_records',       // → staff_members
  'virtual_account_deposits',
  'wiki_documents',               // → wiki_folders, staff_members
  // ── Level 4: wiki_documents 참조
  'wiki_document_versions',       // → wiki_documents, staff_members (self-ref 무시)
];

// 중복 제거하여 최종 순서 확정
const _seen = new Set();
export const BACKFILL_ORDER_FULL = FULL_BACKFILL_ORDER.filter((t) => {
  if (_seen.has(t)) return false;
  _seen.add(t);
  return true;
});
