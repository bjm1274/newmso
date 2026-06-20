// ============================================================
// lib/db/auth/policies.ts
// extracted_policies.sql 72개 정책(30개 테이블 + storage)을 14개 패턴으로
// 분류해 D1에서 사용 가능한 권한 검사 코드로 이식.
//
// 패턴 목록 (14):
//   1. PUBLIC                      - FOR ALL USING (true) (인증 무관)
//   2. AUTHENTICATED               - auth.uid() IS NOT NULL (로그인 사용자)
//   3. SELF_ONLY                   - staff_id = erp_staff_id() OR is_admin
//   4. ADMIN_OR_MANAGER            - is_admin OR erp_can_manage_company()
//   5. MANAGE_COMPANY              - admin OR (manage_company AND
//                                    erp_company_matches(company_id))
//   6. MANAGE_COMPANY_OR_NULL      - admin OR (manage_company AND
//                                    (company_id IS NULL OR matches))
//   7. SELF_OR_SAME_COMPANY        - self OR (manage_company AND matches)
//   8. STAFF_IN_SCOPE              - erp_target_staff_in_scope(staff_id)
//   9. COMPANY_SCOPE_OR_NULL       - admin OR company_id IS NULL OR matches
//  10. ROSTER_APPROVER_OR_SELF     - staff_id = me OR is_roster_approver
//  11. APPROVAL_SCOPE              - admin OR sender=me OR approver=me OR
//                                    company_matches
//  12. INVENTORY_SCOPE             - erp_inventory_scope_matches
//  13. COMPANY_INVENTORY_SCOPE     - erp_inventory_company_scope_matches
//  14. DEPARTMENT_INVENTORY_SCOPE  - erp_department_inventory_scope_matches
//
// 사용 예 (API route):
//   import { assertAccess } from '@/lib/db/auth/policies';
//   await assertAccess({ db, claims, table: 'leave_requests', op: 'insert', row });
//
// Phase 4 — 미등록 테이블은 erpIsAdmin only로 default-deny 유지.
// ============================================================

import { eq } from 'drizzle-orm';
import type { D1Client } from '../client-d1';
import { messages } from '../schema';
import {
  type ErpClaims,
  erpIsAdmin,
  erpStaffId,
  erpCanManageCompany,
  erpCompanyMatches,
  erpInventoryScopeMatches,
  erpInventoryCompanyScopeMatches,
  erpDepartmentInventoryScopeMatches,
  erpTargetStaffSameCompany,
  erpTargetStaffInScope,
  erpIsRosterApprover,
} from './claims';

// ─────────────────────────────────────────────────────────────
// 정책 패턴
// ─────────────────────────────────────────────────────────────
export type PolicyPattern =
  | 'PUBLIC'
  | 'AUTHENTICATED'
  | 'SELF_ONLY'
  | 'ADMIN_OR_MANAGER'
  | 'MANAGE_COMPANY'
  | 'MANAGE_COMPANY_OR_NULL'
  | 'SELF_OR_SAME_COMPANY'
  | 'STAFF_IN_SCOPE'
  | 'COMPANY_SCOPE_OR_NULL'
  | 'ROSTER_APPROVER_OR_SELF'
  | 'APPROVAL_SCOPE'
  | 'INVENTORY_SCOPE'
  | 'COMPANY_INVENTORY_SCOPE'
  | 'DEPARTMENT_INVENTORY_SCOPE';

export type Op = 'select' | 'insert' | 'update' | 'delete';

/**
 * 한 테이블의 정책 — op별로 다른 패턴을 허용.
 *
 * staffIdField    : SELF_ONLY / STAFF_IN_SCOPE / SELF_OR_SAME_COMPANY /
 *                   ROSTER_APPROVER_OR_SELF 패턴에서 row의 staff 필드명
 *                   (기본 'staff_id', notifications은 'user_id' 등)
 * companyIdField  : MANAGE_COMPANY* / SELF_OR_SAME_COMPANY 등에서 company
 *                   필드명 (기본 'company_id', inventory_cost_entries는
 *                   'company_name' 등)
 * inventoryFields : INVENTORY_SCOPE / *_INVENTORY_SCOPE에서 사용
 * approvalFields  : APPROVAL_SCOPE에서 sender/approver 필드명
 */
export interface TablePolicy {
  table: string;
  select?: PolicyPattern;
  insert?: PolicyPattern;
  update?: PolicyPattern;
  delete?: PolicyPattern;
  staffIdField?: string;
  companyIdField?: string;
  inventoryFields?: {
    company?: string;
    company_id?: string;
    department?: string;
  };
  approvalFields?: {
    sender?: string;
    approver?: string;
  };
  /**
   * 컬럼 단위/행 단위 추가 가드. 패턴(PUBLIC 등) 통과 후 op별로 한 번 더 호출되어
   * row 내용에 따라 거부할 수 있다. true=허용, false=거부.
   * (예: staff_members의 권한 컬럼 변경은 admin claim 필수)
   */
  guards?: Partial<Record<Op, (claims: ErpClaims, row: Record<string, unknown>) => boolean>>;
  /**
   * 비동기 행 단위 가드. 동기 guards 통과 후 op별로 호출되며, row만으로는 판정할 수
   * 없어 DB 조회가 필요한 경우(예: where에 id만 있는 soft-delete에서 소유자 확인)에
   * 사용. true=허용, false=거부. 동기 guards와 함께 정의되면 둘 다 통과해야 한다.
   */
  asyncGuards?: Partial<
    Record<Op, (db: D1Client, claims: ErpClaims, row: Record<string, unknown>) => Promise<boolean>>
  >;
}

// ─────────────────────────────────────────────────────────────
// 컬럼 단위 가드 헬퍼
// ─────────────────────────────────────────────────────────────

/**
 * staff_members 권한 상승 차단.
 * role / permissions / password 컬럼을 쓰려는 시도는 admin claim일 때만 허용.
 * (프로필 자기수정·구성원 등록 등 비권한 컬럼 쓰기는 그대로 통과)
 */
const PRIVILEGED_STAFF_COLUMNS = ['role', 'permissions', 'password'] as const;

function staffPrivilegeGuard(claims: ErpClaims, row: Record<string, unknown>): boolean {
  const touchesPrivileged = PRIVILEGED_STAFF_COLUMNS.some(
    (col) => Object.prototype.hasOwnProperty.call(row, col),
  );
  if (!touchesPrivileged) return true;
  return erpIsAdmin(claims);
}

// ─────────────────────────────────────────────────────────────
// 채팅 메시지(messages) soft-delete 소유자 가드
// ─────────────────────────────────────────────────────────────

/**
 * 채팅 메시지 삭제는 soft-delete(`is_deleted` UPDATE)로 동작하며, 클라이언트는
 * `update({is_deleted:true}).eq('id', …)` 형태로 호출한다. where에 id만 있어
 * row(=where eq + set)에는 sender_id가 없으므로 동기 가드로 소유자를 판정할 수
 * 없다. → id로 messages.sender_id를 1건 조회해 작성자 본인(또는 admin)만 허용.
 *
 * 비-삭제 컬럼(content 등)을 함께 변경하려 해도 동일 규칙(작성자 본인/admin)을
 * 적용한다. id가 없으면(전체 row 대상 등) 보수적으로 admin만 허용.
 */
async function messagesSelfDeleteGuard(
  db: D1Client,
  claims: ErpClaims,
  row: Record<string, unknown>,
): Promise<boolean> {
  if (erpIsAdmin(claims)) return true;
  const me = erpStaffId(claims);
  if (me === null) return false;

  // row에 sender_id가 직접 들어온 경우(클라가 where/set에 포함) 우선 사용.
  const inlineSender = getField<string>(row, 'sender_id');
  if (inlineSender !== null) return inlineSender === me;

  // 그 외에는 id로 작성자를 조회해 본인 여부 확인.
  const id = getField<string | number>(row, 'id');
  if (id === null) return false;
  const rows = await db
    .select({ sender_id: messages.sender_id })
    .from(messages)
    .where(eq(messages.id, String(id)))
    .limit(1);
  const target = rows[0];
  if (!target) return false;
  return target.sender_id !== null && target.sender_id === me;
}

// ─────────────────────────────────────────────────────────────
// 정책 레지스트리
// 미등록 테이블은 erpIsAdmin only로 default-deny.
// ─────────────────────────────────────────────────────────────
type Registry = Record<string, TablePolicy>;

const PUBLIC_ALL = (table: string): TablePolicy => ({
  table,
  select: 'PUBLIC',
  insert: 'PUBLIC',
  update: 'PUBLIC',
  delete: 'PUBLIC',
});

export const POLICY_REGISTRY: Registry = {
  // ── PUBLIC: FOR ALL USING (true) — 인증 무관 또는 to authenticated USING true
  // staff_members: 비권한 컬럼(프로필 자기수정·구성원 등록 등)은 PUBLIC 유지하되,
  // role/permissions/password 같은 권한 컬럼 쓰기는 guard로 admin claim 강제.
  // (권한 상승 차단 — 일반 직원의 self-admin 승격 방지)
  staff_members: {
    ...PUBLIC_ALL('staff_members'),
    guards: {
      insert: staffPrivilegeGuard,
      update: staffPrivilegeGuard,
    },
  },
  companies: {
    table: 'companies',
    select: 'PUBLIC',
    insert: 'ADMIN_OR_MANAGER',
    update: 'ADMIN_OR_MANAGER',
    delete: 'ADMIN_OR_MANAGER',
  },
  board_posts: PUBLIC_ALL('board_posts'),
  daily_closures: PUBLIC_ALL('daily_closures'),
  daily_closure_items: PUBLIC_ALL('daily_closure_items'),
  daily_checks: PUBLIC_ALL('daily_checks'),
  system_configs: PUBLIC_ALL('system_configs'),
  work_shifts: PUBLIC_ALL('work_shifts'),
  contract_templates: PUBLIC_ALL('contract_templates'),
  employment_contracts: PUBLIC_ALL('employment_contracts'),
  staff_evaluations: PUBLIC_ALL('staff_evaluations'),
  staff_preferred_off: PUBLIC_ALL('staff_preferred_off'),
  monthly_off_quota: PUBLIC_ALL('monthly_off_quota'),
  board_post_reads: PUBLIC_ALL('board_post_reads'),
  license_continuing_education: PUBLIC_ALL('license_continuing_education'),
  popups: PUBLIC_ALL('popups'),
  disciplinary_committees: PUBLIC_ALL('disciplinary_committees'),

  // 채팅 메시지: 전송(insert)·조회(select)는 PUBLIC 유지하되, UPDATE(soft-delete)는
  // 작성자 본인 또는 admin만 허용(asyncGuards로 sender_id 확인). 임의 사용자가 남의
  // 메시지를 is_deleted=1로 지우는 권한상승을 차단. hard DELETE는 별도(아래 주석).
  messages: {
    table: 'messages',
    select: 'PUBLIC',
    insert: 'PUBLIC',
    update: 'PUBLIC',
    delete: 'PUBLIC',
    asyncGuards: {
      update: messagesSelfDeleteGuard,
    },
  },

  // ── STAFF_IN_SCOPE / SELF_OR_SAME_COMPANY / SELF_ONLY (직원 단위)
  push_subscriptions: {
    table: 'push_subscriptions',
    select: 'STAFF_IN_SCOPE',
    insert: 'SELF_ONLY',
    update: 'SELF_ONLY',
    delete: 'SELF_ONLY',
  },
  notifications: {
    table: 'notifications',
    select: 'STAFF_IN_SCOPE',
    insert: 'SELF_OR_SAME_COMPANY',
    update: 'STAFF_IN_SCOPE',
    delete: 'SELF_ONLY',
    staffIdField: 'user_id',
  },
  todo_reminder_logs: {
    table: 'todo_reminder_logs',
    select: 'STAFF_IN_SCOPE',
    insert: 'SELF_OR_SAME_COMPANY',
    update: 'STAFF_IN_SCOPE',
    delete: 'SELF_ONLY',
    staffIdField: 'user_id',
  },
  attendance: {
    table: 'attendance',
    select: 'STAFF_IN_SCOPE',
    insert: 'STAFF_IN_SCOPE',
    update: 'STAFF_IN_SCOPE',
    delete: 'SELF_ONLY',
  },
  attendances: {
    table: 'attendances',
    select: 'SELF_OR_SAME_COMPANY',
    insert: 'SELF_OR_SAME_COMPANY',
    update: 'SELF_OR_SAME_COMPANY',
    delete: 'SELF_OR_SAME_COMPANY',
  },
  leave_requests: {
    table: 'leave_requests',
    select: 'SELF_OR_SAME_COMPANY',
    insert: 'SELF_OR_SAME_COMPANY',
    update: 'SELF_OR_SAME_COMPANY',
    delete: 'SELF_OR_SAME_COMPANY',
  },
  insurance_records: {
    table: 'insurance_records',
    select: 'STAFF_IN_SCOPE',
    insert: 'STAFF_IN_SCOPE',
    update: 'STAFF_IN_SCOPE',
    delete: 'STAFF_IN_SCOPE',
  },

  // ── PAYROLL_MANAGE는 별도 패턴이 아니라 select=STAFF_IN_SCOPE,
  //    write=MANAGE_COMPANY + staff_id same_company 조건은 evalPattern에서 처리.
  //    원본 RLS는 admin OR (can_manage_company AND target_staff_same_company)인데
  //    target_staff_same_company는 row.staff_id 기반 DB 조회 필요.
  //    여기서는 MANAGE_COMPANY 패턴 사용 + companyIdField 없음 가정 →
  //    SELF_OR_SAME_COMPANY 패턴 + staffIdField로 처리 (가장 가까운 의미).
  payroll_records: {
    table: 'payroll_records',
    select: 'STAFF_IN_SCOPE',
    insert: 'SELF_OR_SAME_COMPANY',
    update: 'SELF_OR_SAME_COMPANY',
    delete: 'SELF_OR_SAME_COMPANY',
  },

  // ── AUTHENTICATED + ADMIN_OR_MANAGER (회사 단위 단순 회사 관리)
  corporate_cards: {
    table: 'corporate_cards',
    select: 'AUTHENTICATED',
    insert: 'ADMIN_OR_MANAGER',
    update: 'ADMIN_OR_MANAGER',
    delete: 'ADMIN_OR_MANAGER',
  },
  corporate_card_transactions: {
    table: 'corporate_card_transactions',
    select: 'AUTHENTICATED',
    insert: 'ADMIN_OR_MANAGER',
    update: 'ADMIN_OR_MANAGER',
    delete: 'ADMIN_OR_MANAGER',
  },
  company_holidays: {
    table: 'company_holidays',
    select: 'AUTHENTICATED',
    insert: 'ADMIN_OR_MANAGER',
    update: 'ADMIN_OR_MANAGER',
    delete: 'ADMIN_OR_MANAGER',
  },
  company_seals: {
    table: 'company_seals',
    select: 'AUTHENTICATED',
    insert: 'ADMIN_OR_MANAGER',
    update: 'ADMIN_OR_MANAGER',
    delete: 'ADMIN_OR_MANAGER',
  },

  // ── COMPANY_SCOPE_OR_NULL (회사 scope, null company_id는 전사)
  wiki_documents: {
    table: 'wiki_documents',
    select: 'COMPANY_SCOPE_OR_NULL',
    insert: 'COMPANY_SCOPE_OR_NULL',
    update: 'COMPANY_SCOPE_OR_NULL',
    delete: 'COMPANY_SCOPE_OR_NULL',
  },
  wiki_folders: {
    table: 'wiki_folders',
    select: 'COMPANY_SCOPE_OR_NULL',
    insert: 'COMPANY_SCOPE_OR_NULL',
    update: 'COMPANY_SCOPE_OR_NULL',
    delete: 'COMPANY_SCOPE_OR_NULL',
  },
  wiki_document_versions: {
    table: 'wiki_document_versions',
    select: 'COMPANY_SCOPE_OR_NULL',
    insert: 'COMPANY_SCOPE_OR_NULL',
    update: 'COMPANY_SCOPE_OR_NULL',
    delete: 'COMPANY_SCOPE_OR_NULL',
  },
  op_check_templates: {
    table: 'op_check_templates',
    select: 'COMPANY_SCOPE_OR_NULL',
    insert: 'COMPANY_SCOPE_OR_NULL',
    update: 'COMPANY_SCOPE_OR_NULL',
    delete: 'COMPANY_SCOPE_OR_NULL',
  },
  op_patient_checks: {
    table: 'op_patient_checks',
    select: 'COMPANY_SCOPE_OR_NULL',
    insert: 'COMPANY_SCOPE_OR_NULL',
    update: 'COMPANY_SCOPE_OR_NULL',
    delete: 'COMPANY_SCOPE_OR_NULL',
  },

  // ── MANAGE_COMPANY_OR_NULL — roster_policy_settings (can_manage + null/match)
  roster_policy_settings: {
    table: 'roster_policy_settings',
    select: 'MANAGE_COMPANY_OR_NULL',
    insert: 'MANAGE_COMPANY_OR_NULL',
    update: 'MANAGE_COMPANY_OR_NULL',
    delete: 'MANAGE_COMPANY_OR_NULL',
  },

  // ── ROSTER_APPROVER_OR_SELF (근무표 결재 워크플로우)
  roster_approval_requests: {
    table: 'roster_approval_requests',
    select: 'ROSTER_APPROVER_OR_SELF',
    insert: 'ROSTER_APPROVER_OR_SELF',
    update: 'ROSTER_APPROVER_OR_SELF', // update는 approver만 (원본) — 단순화
    delete: 'SELF_ONLY',
    staffIdField: 'requested_by',
  },
  roster_swap_requests: {
    table: 'roster_swap_requests',
    select: 'ROSTER_APPROVER_OR_SELF',
    insert: 'ROSTER_APPROVER_OR_SELF',
    update: 'ROSTER_APPROVER_OR_SELF',
    delete: 'SELF_ONLY',
    staffIdField: 'requested_by',
  },

  // ── APPROVAL_SCOPE (전자결재)
  approvals: {
    table: 'approvals',
    select: 'APPROVAL_SCOPE',
    insert: 'SELF_OR_SAME_COMPANY',
    update: 'APPROVAL_SCOPE',
    delete: 'SELF_ONLY',
    staffIdField: 'sender_id',
    approvalFields: { sender: 'sender_id', approver: 'current_approver_id' },
  },

  // ── INVENTORY_SCOPE
  inventory: {
    table: 'inventory',
    select: 'INVENTORY_SCOPE',
    insert: 'INVENTORY_SCOPE',
    update: 'INVENTORY_SCOPE',
    delete: 'INVENTORY_SCOPE',
    inventoryFields: { company: 'company', company_id: 'company_id', department: 'department' },
  },
  inventory_logs: {
    table: 'inventory_logs',
    select: 'INVENTORY_SCOPE',
    insert: 'INVENTORY_SCOPE',
    inventoryFields: { company: 'company', company_id: 'company_id', department: 'department' },
  },
  inventory_count_sessions: {
    table: 'inventory_count_sessions',
    select: 'INVENTORY_SCOPE',
    insert: 'INVENTORY_SCOPE',
    inventoryFields: { company: 'company', company_id: 'company_id', department: 'department' },
  },
  inventory_cost_entries: {
    table: 'inventory_cost_entries',
    select: 'INVENTORY_SCOPE',
    insert: 'INVENTORY_SCOPE',
    inventoryFields: { company: 'company_name', company_id: 'company_id', department: 'department' },
  },
  purchase_orders: {
    table: 'purchase_orders',
    select: 'INVENTORY_SCOPE',
    insert: 'INVENTORY_SCOPE',
    update: 'INVENTORY_SCOPE',
    delete: 'INVENTORY_SCOPE',
    inventoryFields: { company: 'requester_company', department: 'requester_department' },
  },

  // ── COMPANY_INVENTORY_SCOPE
  inventory_closing_snapshots: {
    table: 'inventory_closing_snapshots',
    select: 'COMPANY_INVENTORY_SCOPE',
    insert: 'COMPANY_INVENTORY_SCOPE',
    inventoryFields: { company: 'company', company_id: 'company_id' },
  },
  delivery_confirmations: {
    table: 'delivery_confirmations',
    select: 'COMPANY_INVENTORY_SCOPE',
    insert: 'COMPANY_INVENTORY_SCOPE',
    update: 'COMPANY_INVENTORY_SCOPE',
    delete: 'COMPANY_INVENTORY_SCOPE',
    inventoryFields: { company: 'receiver_company' },
  },

  // ── DEPARTMENT_INVENTORY_SCOPE
  department_private_inventory_items: {
    table: 'department_private_inventory_items',
    select: 'DEPARTMENT_INVENTORY_SCOPE',
    insert: 'DEPARTMENT_INVENTORY_SCOPE',
    update: 'DEPARTMENT_INVENTORY_SCOPE',
    delete: 'DEPARTMENT_INVENTORY_SCOPE',
    inventoryFields: { company: 'company', company_id: 'company_id', department: 'department' },
  },
  department_private_inventory_logs: {
    table: 'department_private_inventory_logs',
    select: 'DEPARTMENT_INVENTORY_SCOPE',
    insert: 'DEPARTMENT_INVENTORY_SCOPE',
    // update/delete는 admin-only (원본) — 등록 X = default deny (admin only)
    inventoryFields: { company: 'company', company_id: 'company_id', department: 'department' },
  },

  // 미등록 (default deny = admin only):
  //   inventory_transfers (from/to OR — 별도 패턴 필요, 일단 admin-only)
  //   inventory_price_history (sub-select 검사 — admin-only)
  //   backup_restore_runs (admin-only — default deny 처리됨)
};

// ─────────────────────────────────────────────────────────────
// Phase 8-K — 클라이언트가 호출하지만 POLICY_REGISTRY에 명시 등록되지
// 않은 D1 테이블을 PUBLIC_ALL로 일괄 등록. 로그인 사용자면 누구나 접근
// 가능. RLS는 Phase 4에서 14 패턴으로 등록된 30+ 테이블만 strict 적용.
//
// 본 fallback은 'd1' 모드에서 미등록 테이블 호출 시 403 "Table not allowed"
// 회귀를 방지하기 위해 필요. 향후 도메인별로 적절한 패턴(SELF_OR_SAME_COMPANY
// 등)으로 재분류 가능. 보안 강화는 별도 phase.
// ─────────────────────────────────────────────────────────────
const ADDITIONAL_PUBLIC_TABLES: string[] = [
  // chat / messaging
  'chat_rooms',
  'chat_messages',
  'chat_push_jobs',
  'chat_room_favorites',
  'chat_room_prefs',
  'message_bookmarks',
  'message_reactions',
  'message_reads',
  'pinned_messages',
  'polls',
  'poll_votes',
  'room_notification_settings',
  'room_read_cursors',
  'messenger_drive_links',
  'scheduled_messages',

  // board / posts
  'board_post_comments',
  'board_post_likes',
  'posts',

  // staff / HR auxiliary
  'staff_certifications',
  'staff_licenses',
  'staff_job_categories',
  'staff_shift_assignments',
  'staff_trainings',
  'job_categories',
  'job_category_required_trainings',
  'shift_assignments',
  'onboarding_checklists',
  'personnel_appointments',
  'salary_change_history',
  'reward_discipline',

  // attendance / leave aux
  'attendance_deduction_rules',
  'leave_balances',
  'unpaid_absence_records',

  // payroll aux
  'payroll',
  'payroll_approval_logs',
  'payroll_approval_workflows',
  'payroll_bonus_items',
  'payroll_calendar_items',
  'payroll_deduction_controls',
  'payroll_locks',
  'payroll_policy_versions',
  'payroll_retro_adjustments',
  'tax_free_settings',
  'tax_insurance_rates',
  'tax_reports',
  'retirement_pensions',
  'freelancer_payments',

  // company aux
  'company_expenses',
  'company_welfare_policies',
  'company_payroll_policies',
  'approval_form_types',
  'approval_history',
  'approval_templates',
  'approval_delegation',
  'custom_form_templates',

  // documents
  'document_repository',
  'document_versions',
  'handover_notes',
  'meeting_bookings',

  // inventory aux
  'suppliers',
  'inventory_logs',
  'inventory_categories',
  'inventory_transfers',
  'inventory_count_sessions',
  'inventory_cost_entries',
  'inventory_receipts',
  'asset_loans',
  'asset_loan_item_settings',
  'medical_devices',
  'device_inspections',

  // OP / clinical
  'op_patient_checks',
  'discharge_reviews',
  'discharge_templates',
  'mri_templates',
  'surgery_templates',

  // misc
  'todos',
  'notification_templates',
  'health_checkups',
  'incident_reports',
  'education_records',
  'virtual_account_deposits',
  'tasks',
  'report_schedules',

  // ── 2026-05-20 컷오버 회귀 수정 — 누락 발견분 (7개)
  //    클라이언트 코드가 supabase.from()으로 호출하나 POLICY_REGISTRY·
  //    ADDITIONAL_PUBLIC_TABLES 어디에도 없어 403이 발생하던 테이블.
  'annual_leave_promotion_logs', // 연차 이월/프로모션 로그
  'attendance_corrections',      // 출퇴근 정정 요청
  'audit_logs',                  // 관리자 감사 로그
  'backup_restore_runs',         // 백업·복원 실행 기록
  'certificate_issuances',       // 증명서 발급 이력
  'org_teams',                   // 조직 팀 정보
  'staff_transfer_history',      // 직원 이동·부서이동 이력

  // ── 2026-05-20 재점검 — 전수 audit(.from 호출 vs 등록)로 발견한 누락 실테이블
  'access_logs',             // 접근 감사 로그
  'inventory_price_history', // 재고 가격 이력
  'official_doc_log',        // 공문서 발송 로그
  'system_settings',         // 시스템 설정(전자결재 양식 등) — key-value

  // ── 2026-05-30 무음 실패 복구 — migration 0007로 D1에 신설된 기능 테이블 9종.
  //    소비처가 supabase.from()/enqueueSupabaseMutation으로 호출하던 기능을
  //    실테이블 신설과 함께 복구. 형제 테이블(board_*, inventory aux, 관리자 설정)과
  //    동일하게 PUBLIC_ALL(로그인 사용자 접근). PII(상담/계약/경조) 포함이나 기존
  //    컨벤션(staff_*, board_*가 PUBLIC_ALL)을 따라 앱 동작 유지 우선.
  'op_consultations',            // 수술상담
  'congratulations_condolences', // 경조사관리
  'early_leave_records',         // 조기퇴근감지
  'generated_contracts',         // 계약서자동생성
  'board_post_stars',            // 게시판 별표(즐겨찾기)
  'as_repair_records',           // AS 수리 접수
  'return_records',              // 반품
  'message_templates',           // 관리자 메시지 템플릿
  'external_integrations',       // 관리자 외부 연동

  // ── 2026-06-10 무음 실패 복구 (G7) — migration 0013로 D1에 신설된 기능 테이블 5종.
  //    소비처가 supabase.from()으로 호출하나 실테이블이 schema.ts/d1_schema_final.sql
  //    둘 다에 없어 무음 실패하던 기능을 실테이블 신설과 함께 복구. MSO 설계상 회사
  //    격리 불필요 — 형제 테이블과 동일하게 PUBLIC_ALL.
  'nurse_schedules',             // 간호근무표
  'leave_policies',              // 연차/휴가 정책
  'work_type_change_history',    // 근무유형 변경 이력
  'education_completions',       // 교육 이수
  'email_queue',                 // 이메일 발송 큐

  'budget_settings',             // 예산 설정
  'budget_executions',           // 예산 집행
  'journal_entries',             // 복식부기 분개장
  'fixed_assets',                // 고정자산 대장
  'bank_accounts_sync',          // 금융 연동 현황

  // ── 2026-05-20 확인 — 아래는 클라이언트 코드가 supabase.from()으로
  //    호출하지만 Supabase에 테이블이 실제로 존재하지 않음(probe 결과 PGRST205
  //    + information_schema 부재). 즉 현재도 동작하지 않는 미완성/사장된 기능
  //    참조이며 D1 이관 대상이 아님. whitelist 등록 자체는 무해하고, 향후 해당
  //    기능을 살릴 때 테이블 생성과 함께 정책을 재정비해야 함.
  'org_chart_nodes',
  'profiles',
  'patient_prescriptions',
  'inventory_items',
  'attendance_records',
  'document_submissions',
  'work_schedules',
];

for (const tableName of ADDITIONAL_PUBLIC_TABLES) {
  if (!POLICY_REGISTRY[tableName]) {
    POLICY_REGISTRY[tableName] = PUBLIC_ALL(tableName);
  }
}

// ─────────────────────────────────────────────────────────────
// 패턴 평가
// ─────────────────────────────────────────────────────────────
function getField<T>(row: Record<string, unknown>, field: string): T | null {
  const v = row[field];
  return (v ?? null) as T | null;
}

async function evalPattern(
  pattern: PolicyPattern,
  db: D1Client,
  claims: ErpClaims,
  row: Record<string, unknown>,
  cfg: TablePolicy,
): Promise<boolean> {
  if (pattern === 'PUBLIC') return true;
  if (pattern === 'AUTHENTICATED') return erpStaffId(claims) !== null;
  if (erpIsAdmin(claims)) return true;

  const staffField = cfg.staffIdField ?? 'staff_id';
  const companyField = cfg.companyIdField ?? 'company_id';

  if (pattern === 'SELF_ONLY') {
    const rowStaff = getField<string>(row, staffField);
    return rowStaff !== null && rowStaff === erpStaffId(claims);
  }

  if (pattern === 'ADMIN_OR_MANAGER') {
    return erpCanManageCompany(claims);
  }

  if (pattern === 'MANAGE_COMPANY') {
    if (!erpCanManageCompany(claims)) return false;
    return erpCompanyMatches(claims, getField<string>(row, companyField));
  }

  if (pattern === 'MANAGE_COMPANY_OR_NULL') {
    if (!erpCanManageCompany(claims)) return false;
    const v = getField<string>(row, companyField);
    if (v === null) return true;
    return erpCompanyMatches(claims, v);
  }

  if (pattern === 'SELF_OR_SAME_COMPANY') {
    const rowStaff = getField<string>(row, staffField);
    if (rowStaff !== null && rowStaff === erpStaffId(claims)) return true;
    if (!erpCanManageCompany(claims)) return false;
    if (rowStaff !== null) {
      // payroll_records 등에서 target_staff_same_company 의미와 일치하도록 보강.
      const sameCompany = await erpTargetStaffSameCompany(db, claims, rowStaff);
      if (sameCompany) return true;
    }
    return erpCompanyMatches(claims, getField<string>(row, companyField));
  }

  if (pattern === 'STAFF_IN_SCOPE') {
    const rowStaff = getField<string>(row, staffField);
    if (rowStaff === null) return false;
    return erpTargetStaffInScope(db, claims, rowStaff);
  }

  if (pattern === 'COMPANY_SCOPE_OR_NULL') {
    const v = getField<string>(row, companyField);
    if (v === null) return true;
    return erpCompanyMatches(claims, v);
  }

  if (pattern === 'ROSTER_APPROVER_OR_SELF') {
    const rowStaff = getField<string>(row, staffField);
    if (rowStaff !== null && rowStaff === erpStaffId(claims)) return true;
    return erpIsRosterApprover(db, claims);
  }

  if (pattern === 'APPROVAL_SCOPE') {
    const fields = cfg.approvalFields ?? {};
    const sender = getField<string>(row, fields.sender ?? 'sender_id');
    const approver = getField<string>(row, fields.approver ?? 'current_approver_id');
    const me = erpStaffId(claims);
    if (me !== null && (sender === me || approver === me)) return true;
    return erpCompanyMatches(claims, getField<string>(row, companyField));
  }

  if (pattern === 'INVENTORY_SCOPE') {
    const f = cfg.inventoryFields ?? {};
    return erpInventoryScopeMatches(
      claims,
      getField<string>(row, f.company ?? 'company'),
      getField<string>(row, f.company_id ?? 'company_id'),
      getField<string>(row, f.department ?? 'department'),
    );
  }

  if (pattern === 'COMPANY_INVENTORY_SCOPE') {
    const f = cfg.inventoryFields ?? {};
    return erpInventoryCompanyScopeMatches(
      claims,
      getField<string>(row, f.company ?? 'company'),
      getField<string>(row, f.company_id ?? 'company_id'),
    );
  }

  if (pattern === 'DEPARTMENT_INVENTORY_SCOPE') {
    const f = cfg.inventoryFields ?? {};
    return erpDepartmentInventoryScopeMatches(
      claims,
      getField<string>(row, f.company ?? 'company'),
      getField<string>(row, f.company_id ?? 'company_id'),
      getField<string>(row, f.department ?? 'department'),
    );
  }

  return false;
}

// ─────────────────────────────────────────────────────────────
// 외부 API
// ─────────────────────────────────────────────────────────────

export class PolicyDenied extends Error {
  constructor(table: string, op: Op) {
    super(`policy denied: ${op} ${table}`);
    this.name = 'PolicyDenied';
  }
}

export class PolicyMissing extends Error {
  constructor(table: string, op: Op) {
    super(`policy not registered: ${op} ${table} — default deny`);
    this.name = 'PolicyMissing';
  }
}

export interface PolicyCheckArgs {
  db: D1Client;
  claims: ErpClaims;
  table: string;
  op: Op;
  row: Record<string, unknown>;
}

/**
 * 단일 row가 정책을 통과하는지 검사.
 * 등록되지 않은 테이블 또는 등록은 됐으나 해당 op 미정의는
 * default deny (관리자만 허용).
 */
export async function canAccess(args: PolicyCheckArgs): Promise<boolean> {
  const cfg = POLICY_REGISTRY[args.table];
  if (!cfg) return erpIsAdmin(args.claims);
  const pattern = cfg[args.op];
  if (!pattern) return erpIsAdmin(args.claims);
  const ok = await evalPattern(pattern, args.db, args.claims, args.row, cfg);
  if (!ok) return false;
  // 패턴 통과 후 컬럼 단위 가드 적용 (예: 권한 컬럼 변경 차단)
  const guard = cfg.guards?.[args.op];
  if (guard && !guard(args.claims, args.row)) return false;
  // 비동기 행 단위 가드 (예: messages soft-delete 소유자 확인 — DB 조회 필요)
  const asyncGuard = cfg.asyncGuards?.[args.op];
  if (asyncGuard && !(await asyncGuard(args.db, args.claims, args.row))) return false;
  return true;
}

/**
 * 정책 위반이면 throw — API 라우트에서 한 줄로 가드.
 */
export async function assertAccess(args: PolicyCheckArgs): Promise<void> {
  const cfg = POLICY_REGISTRY[args.table];
  if (!cfg) {
    if (!erpIsAdmin(args.claims)) throw new PolicyMissing(args.table, args.op);
    return;
  }
  const ok = await canAccess(args);
  if (!ok) throw new PolicyDenied(args.table, args.op);
}

/**
 * 여러 row를 일괄 필터링 — SELECT 결과를 RLS처럼 적용.
 */
export async function filterByPolicy<T extends Record<string, unknown>>(
  db: D1Client,
  claims: ErpClaims,
  table: string,
  rows: T[],
): Promise<T[]> {
  const cfg = POLICY_REGISTRY[table];
  if (!cfg || !cfg.select) return erpIsAdmin(claims) ? rows : [];
  if (cfg.select === 'PUBLIC') return rows;
  if (cfg.select === 'AUTHENTICATED') return erpStaffId(claims) !== null ? rows : [];
  if (erpIsAdmin(claims)) return rows;

  const out: T[] = [];
  for (const row of rows) {
    const ok = await evalPattern(cfg.select, db, claims, row, cfg);
    if (ok) out.push(row);
  }
  return out;
}
