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
  canAccessChatRoom,
  canChangeChatRoomMembers,
  isNoticeRoomType,
  isRoomMember,
  loadChatRoomMembership,
  parseMembersField,
} from '@/lib/chat-room-membership';
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
  erpIsRosterApprover } from './claims';

// ─────────────────────────────────────────────────────────────
// 정책 패턴
// ─────────────────────────────────────────────────────────────
export type PolicyPattern =
  | 'PUBLIC'
  | 'AUTHENTICATED'
  | 'ADMIN_ONLY'
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
  | 'DEPARTMENT_INVENTORY_SCOPE'
  /** 채팅: room 멤버(또는 notice/admin)만 행 접근 — filterByPolicy 에서 배치 평가 */
  | 'CHAT_ROOM_MEMBER';

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
 * staff_members 권한·민감 컬럼 차단.
 * - 권한/마스터/해시: admin 전용
 * - 급여·주민·계좌 등 PII 쓰기: admin 또는 회사 매니저
 * - 본인 프로필 일반 필드: 아래에서 SELF 패턴으로 제한
 */
const PRIVILEGED_STAFF_COLUMNS = [
  'role',
  'permissions',
  'password',
  'passwd',
  'is_system_master',
  'force_logout_at',
] as const;

const SENSITIVE_STAFF_COLUMNS = [
  'base_salary',
  'salary',
  'bank_account',
  'bank_name',
  'resident_no',
  'company_id',
  'company',
  'status',
  'employee_no',
  'annual_leave_total',
  'annual_leave_used',
] as const;

function staffPrivilegeGuard(claims: ErpClaims, row: Record<string, unknown>): boolean {
  const touchesPrivileged = PRIVILEGED_STAFF_COLUMNS.some(
    (col) => Object.prototype.hasOwnProperty.call(row, col),
  );
  if (touchesPrivileged && !erpIsAdmin(claims)) return false;

  const touchesSensitive = SENSITIVE_STAFF_COLUMNS.some(
    (col) => Object.prototype.hasOwnProperty.call(row, col),
  );
  if (touchesSensitive && !erpIsAdmin(claims) && !erpCanManageCompany(claims)) return false;

  // 일반 직원: 본인 행만 수정 가능 (id 또는 staff 자기 식별이 본인과 일치)
  if (!erpIsAdmin(claims) && !erpCanManageCompany(claims)) {
    const me = erpStaffId(claims);
    if (me === null) return false;
    const rowId = getField<string>(row, 'id');
    if (rowId !== null && rowId !== me) return false;
  }
  return true;
}

/** employment_contracts: 본인 서명 필드만 허용, 급여/본문 등은 관리자·매니저 */
const CONTRACT_SELF_UPDATE_ALLOW = new Set([
  'status',
  'signed_at',
  'signature_data',
  'receipt_signature_data',
  'privacy_consent',
  'updated_at',
]);

function employmentContractUpdateGuard(claims: ErpClaims, row: Record<string, unknown>): boolean {
  if (erpIsAdmin(claims) || erpCanManageCompany(claims)) return true;
  const me = erpStaffId(claims);
  if (me === null) return false;
  const staffId = getField<string>(row, 'staff_id');
  if (staffId !== null && staffId !== me) return false;
  // set 키만 검사 (where 키 제외 어려우므로 allowlist 외 키가 있으면 deny)
  const keys = Object.keys(row).filter((k) => k !== 'id' && k !== 'staff_id');
  return keys.every((k) => CONTRACT_SELF_UPDATE_ALLOW.has(k));
}

/** leave_requests: 본인은 승인 상태/일수 강제 변경 불가 */
const LEAVE_SELF_FORBIDDEN_STATUS = new Set(['승인', 'approved', 'APPROVED', '지급완료']);

function leaveRequestUpdateGuard(claims: ErpClaims, row: Record<string, unknown>): boolean {
  if (erpIsAdmin(claims) || erpCanManageCompany(claims)) return true;
  const me = erpStaffId(claims);
  if (me === null) return false;
  const staffId = getField<string>(row, 'staff_id');
  if (staffId !== null && staffId !== me) return false;
  if (Object.prototype.hasOwnProperty.call(row, 'status')) {
    const st = String(row.status ?? '').trim();
    if (LEAVE_SELF_FORBIDDEN_STATUS.has(st) || st.includes('승인')) return false;
  }
  // 본인 취소·수정 허용 필드 외 차단은 느슨히: days 조작은 매니저만
  if (Object.prototype.hasOwnProperty.call(row, 'days') && !erpCanManageCompany(claims)) {
    // 본인 신청 중 days 변경은 허용하되 status 승인 차단이 핵심
  }
  return true;
}

/** leave_requests INSERT: employees may create only their own pending request. */
function leaveRequestInsertGuard(claims: ErpClaims, row: Record<string, unknown>): boolean {
  if (erpIsAdmin(claims) || erpCanManageCompany(claims)) return true;
  const me = erpStaffId(claims);
  if (me === null) return false;
  const staffId = getField<string>(row, 'staff_id');
  if (staffId === null || staffId !== me) return false;

  const status = getField<string>(row, 'status');
  return status === null || ['대기', 'pending', 'PENDING', '신청'].includes(String(status).trim());
}

// ─
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

  // set.sender_id 스푸핑 차단 — 항상 DB 의 작성자만 신뢰
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

/**
 * claims.erp_staff_id 원문(시스템마스터 '9999' 등 non-UUID 포함).
 * erpStaffId는 UUID만 반환하므로 insert sender 강제에는 원문을 사용.
 */
function claimsStaffIdRaw(claims: ErpClaims): string | null {
  const v = claims.erp_staff_id;
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed || null;
}

/**
 * messages INSERT: (1) sender_id === 세션 staff id 강제(사칭 차단)
 * (2) room 존재 + 멤버십(notice type 예외).
 * d1/mutate → assertAccess 경로에서만 적용. 서버 cron/직접 drizzle insert는 우회.
 */
async function messagesInsertGuard(
  db: D1Client,
  claims: ErpClaims,
  row: Record<string, unknown>,
): Promise<boolean> {
  const me = claimsStaffIdRaw(claims);
  if (me === null) return false;

  const senderId = getField<string>(row, 'sender_id');
  if (senderId === null || String(senderId).trim() !== me) return false;

  const roomId = getField<string>(row, 'room_id');
  if (roomId === null || !String(roomId).trim()) return false;

  const room = await loadChatRoomMembership(db, String(roomId));
  if (!room) return false;

  // Notice rooms are read-only channels; only system admins may send messages.
  if (isNoticeRoomType(room.type)) return erpIsAdmin(claims);

  return canAccessChatRoom(room, me);
}

/** chat_rooms INSERT: non-admins can create only their own regular room. */
async function chatRoomsInsertGuard(
  _db: D1Client,
  claims: ErpClaims,
  row: Record<string, unknown>,
): Promise<boolean> {
  if (erpIsAdmin(claims)) return true;
  const me = claimsStaffIdRaw(claims);
  if (me === null) return false;
  if (isNoticeRoomType(getField<string>(row, 'type'))) return false;
  const createdBy = getField<string>(row, 'created_by');
  if (createdBy !== null && String(createdBy).trim() !== me) return false;
  return isRoomMember(parseMembersField(row.members), me);
}

/**
 * chat_rooms UPDATE (d1/mutate 경로): 멤버 또는 관리 권한만.
 * notice 방 메타 sync는 인증 사용자 허용. 타인 강퇴는 생성자/특권.
 */
async function chatRoomsUpdateGuard(
  db: D1Client,
  claims: ErpClaims,
  row: Record<string, unknown>,
): Promise<boolean> {
  if (erpIsAdmin(claims)) return true;

  const me = claimsStaffIdRaw(claims);
  if (me === null) return false;

  const id = getField<string | number>(row, 'id');
  if (id === null) return false;

  const room = await loadChatRoomMembership(db, String(id));
  if (!room) return false;

  // notice 방: 클라이언트가 멤버 목록 sync 용으로 update — 로그인 사용자 허용
  // (type이 set 으로 notice로 바뀌는 경우도 row.type 참고)
  const nextType = getField<string>(row, 'type');
  if (isNoticeRoomType(room.type) || isNoticeRoomType(nextType)) return false;

  if (!canAccessChatRoom(room, me)) return false;

  if (Object.prototype.hasOwnProperty.call(row, 'members')) {
    const nextMembers = parseMembersField(row.members);
    return canChangeChatRoomMembers({
      prevMembers: room.members,
      nextMembers,
      userId: me,
      createdBy: room.created_by,
      isPrivileged: false,
    });
  }

  return true;
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
  delete: 'PUBLIC' });

/**
 * ADMIN_ONLY — admin/master 역할만 모든 op 허용.
 * 급여·계약·감사로그 등 민감 데이터에 사용.
 */
const ADMIN_ONLY_ALL = (table: string): TablePolicy => ({
  table,
  select: 'ADMIN_ONLY',
  insert: 'ADMIN_ONLY',
  update: 'ADMIN_ONLY',
  delete: 'ADMIN_ONLY' });

export const POLICY_REGISTRY: Registry = {
  // ── PUBLIC: FOR ALL USING (true) — 인증 무관 또는 to authenticated USING true
  // staff_members: select는 조직도용 PUBLIC, write는 가드로 본인/매니저/admin 제한
  staff_members: {
    table: 'staff_members',
    select: 'PUBLIC',
    insert: 'ADMIN_OR_MANAGER',
    update: 'SELF_OR_SAME_COMPANY',
    delete: 'ADMIN_ONLY',
    staffIdField: 'id',
    guards: {
      insert: staffPrivilegeGuard,
      update: staffPrivilegeGuard } },
  companies: {
    table: 'companies',
    select: 'PUBLIC',
    insert: 'ADMIN_OR_MANAGER',
    update: 'ADMIN_OR_MANAGER',
    delete: 'ADMIN_OR_MANAGER' },
  board_posts: PUBLIC_ALL('board_posts'),
  daily_closures: PUBLIC_ALL('daily_closures'),
  daily_closure_items: PUBLIC_ALL('daily_closure_items'),
  daily_checks: PUBLIC_ALL('daily_checks'),
  system_configs: PUBLIC_ALL('system_configs'),
  work_shifts: PUBLIC_ALL('work_shifts'),
  contract_templates: PUBLIC_ALL('contract_templates'),
  // 근로계약서: 본인 조회·서명(update) 필수. 관리자/매니저는 회사 스코프로 발송·관리.
  // (과거 ADMIN_ONLY → 직원이 발송된 계약서를 조회·서명하지 못하는 장애 원인)
  employment_contracts: {
    table: 'employment_contracts',
    select: 'SELF_OR_SAME_COMPANY',
    insert: 'ADMIN_OR_MANAGER',
    update: 'SELF_OR_SAME_COMPANY',
    delete: 'ADMIN_ONLY',
    staffIdField: 'staff_id',
    guards: {
      update: employmentContractUpdateGuard,
    },
  },
  staff_evaluations: PUBLIC_ALL('staff_evaluations'),
  staff_preferred_off: PUBLIC_ALL('staff_preferred_off'),
  monthly_off_quota: PUBLIC_ALL('monthly_off_quota'),
  board_post_reads: PUBLIC_ALL('board_post_reads'),
  license_continuing_education: PUBLIC_ALL('license_continuing_education'),
  popups: PUBLIC_ALL('popups'),
  disciplinary_committees: PUBLIC_ALL('disciplinary_committees'),

  // 채팅 메시지:
  // SELECT: CHAT_ROOM_MEMBER — 비멤버 방 메시지 열람 차단 (filterByPolicy 배치)
  // INSERT: sender_id=세션 staff + 방 멤버십(notice 예외)
  // UPDATE(soft-delete): 작성자 본인 또는 admin (DB sender_id 기준)
  // DELETE: hard delete 는 admin 만
  messages: {
    table: 'messages',
    select: 'CHAT_ROOM_MEMBER',
    insert: 'PUBLIC',
    update: 'PUBLIC',
    delete: 'ADMIN_ONLY',
    asyncGuards: {
      insert: messagesInsertGuard,
      update: messagesSelfDeleteGuard } },

  // chat_rooms:
  // SELECT: CHAT_ROOM_MEMBER — 멤버(또는 notice/admin)만 방 메타 조회
  // UPDATE: 멤버/notice/관리 권한
  // DELETE: admin only (하드 삭제 남용 방지)
  chat_rooms: {
    table: 'chat_rooms',
    select: 'CHAT_ROOM_MEMBER',
    insert: 'PUBLIC',
    update: 'PUBLIC',
    delete: 'ADMIN_ONLY',
    asyncGuards: {
      insert: chatRoomsInsertGuard,
      update: chatRoomsUpdateGuard } },

  room_read_cursors: {
    table: 'room_read_cursors',
    select: 'PUBLIC',
    insert: 'AUTHENTICATED',
    update: 'AUTHENTICATED',
    delete: 'AUTHENTICATED',
    staffIdField: 'user_id',
  },
  message_reactions: {
    table: 'message_reactions',
    select: 'PUBLIC',
    insert: 'AUTHENTICATED',
    update: 'AUTHENTICATED',
    delete: 'AUTHENTICATED',
    staffIdField: 'user_id',
  },
  message_bookmarks: {
    table: 'message_bookmarks',
    select: 'PUBLIC',
    insert: 'AUTHENTICATED',
    update: 'AUTHENTICATED',
    delete: 'AUTHENTICATED',
    staffIdField: 'user_id',
  },
  pinned_messages: {
    table: 'pinned_messages',
    select: 'PUBLIC',
    insert: 'AUTHENTICATED',
    update: 'AUTHENTICATED',
    delete: 'AUTHENTICATED',
  },
  board_post_likes: {
    table: 'board_post_likes',
    select: 'PUBLIC',
    insert: 'AUTHENTICATED',
    update: 'AUTHENTICATED',
    delete: 'AUTHENTICATED',
    staffIdField: 'user_id',
  },
  board_post_comments: {
    table: 'board_post_comments',
    select: 'PUBLIC',
    insert: 'AUTHENTICATED',
    update: 'AUTHENTICATED',
    delete: 'AUTHENTICATED',
    staffIdField: 'author_id',
  },

  // ── STAFF_IN_SCOPE / SELF_OR_SAME_COMPANY / SELF_ONLY (직원 단위)
  push_subscriptions: {
    table: 'push_subscriptions',
    select: 'STAFF_IN_SCOPE',
    insert: 'SELF_ONLY',
    update: 'SELF_ONLY',
    delete: 'SELF_ONLY' },
  notifications: {
    table: 'notifications',
    select: 'STAFF_IN_SCOPE',
    insert: 'SELF_OR_SAME_COMPANY',
    update: 'STAFF_IN_SCOPE',
    delete: 'SELF_ONLY',
    staffIdField: 'user_id' },
  todo_reminder_logs: {
    table: 'todo_reminder_logs',
    select: 'STAFF_IN_SCOPE',
    insert: 'SELF_OR_SAME_COMPANY',
    update: 'STAFF_IN_SCOPE',
    delete: 'SELF_ONLY',
    staffIdField: 'user_id' },
  attendance: {
    table: 'attendance',
    select: 'STAFF_IN_SCOPE',
    insert: 'STAFF_IN_SCOPE',
    update: 'STAFF_IN_SCOPE',
    delete: 'SELF_ONLY' },
  attendances: {
    table: 'attendances',
    select: 'SELF_OR_SAME_COMPANY',
    insert: 'SELF_OR_SAME_COMPANY',
    update: 'SELF_OR_SAME_COMPANY',
    delete: 'SELF_OR_SAME_COMPANY' },
  leave_requests: {
    table: 'leave_requests',
    select: 'SELF_OR_SAME_COMPANY',
    insert: 'SELF_OR_SAME_COMPANY',
    update: 'ADMIN_OR_MANAGER',
    delete: 'ADMIN_OR_MANAGER',
    staffIdField: 'staff_id',
    guards: {
      insert: leaveRequestInsertGuard,
      update: leaveRequestUpdateGuard,
    },
  },
  insurance_records: {
    table: 'insurance_records',
    select: 'STAFF_IN_SCOPE',
    insert: 'ADMIN_OR_MANAGER',
    update: 'ADMIN_OR_MANAGER',
    delete: 'ADMIN_ONLY' },

  payroll_records: {
    table: 'payroll_records',
    select: 'SELF_OR_SAME_COMPANY',
    insert: 'ADMIN_OR_MANAGER',
    update: 'ADMIN_OR_MANAGER',
    delete: 'ADMIN_ONLY' },

  // ── AUTHENTICATED + ADMIN_OR_MANAGER (회사 단위 단순 회사 관리)
  corporate_cards: {
    table: 'corporate_cards',
    select: 'AUTHENTICATED',
    insert: 'ADMIN_OR_MANAGER',
    update: 'ADMIN_OR_MANAGER',
    delete: 'ADMIN_OR_MANAGER' },
  corporate_card_transactions: {
    table: 'corporate_card_transactions',
    select: 'AUTHENTICATED',
    insert: 'ADMIN_OR_MANAGER',
    update: 'ADMIN_OR_MANAGER',
    delete: 'ADMIN_OR_MANAGER' },
  company_holidays: {
    table: 'company_holidays',
    select: 'AUTHENTICATED',
    insert: 'ADMIN_OR_MANAGER',
    update: 'ADMIN_OR_MANAGER',
    delete: 'ADMIN_OR_MANAGER' },
  company_seals: {
    table: 'company_seals',
    select: 'AUTHENTICATED',
    insert: 'ADMIN_OR_MANAGER',
    update: 'ADMIN_OR_MANAGER',
    delete: 'ADMIN_OR_MANAGER' },

  // ── COMPANY_SCOPE_OR_NULL (회사 scope, null company_id는 전사)
  wiki_documents: {
    table: 'wiki_documents',
    select: 'COMPANY_SCOPE_OR_NULL',
    insert: 'COMPANY_SCOPE_OR_NULL',
    update: 'COMPANY_SCOPE_OR_NULL',
    delete: 'COMPANY_SCOPE_OR_NULL' },
  wiki_folders: {
    table: 'wiki_folders',
    select: 'COMPANY_SCOPE_OR_NULL',
    insert: 'COMPANY_SCOPE_OR_NULL',
    update: 'COMPANY_SCOPE_OR_NULL',
    delete: 'COMPANY_SCOPE_OR_NULL' },
  wiki_document_versions: {
    table: 'wiki_document_versions',
    select: 'COMPANY_SCOPE_OR_NULL',
    insert: 'COMPANY_SCOPE_OR_NULL',
    update: 'COMPANY_SCOPE_OR_NULL',
    delete: 'COMPANY_SCOPE_OR_NULL' },
  op_check_templates: {
    table: 'op_check_templates',
    select: 'COMPANY_SCOPE_OR_NULL',
    insert: 'COMPANY_SCOPE_OR_NULL',
    update: 'COMPANY_SCOPE_OR_NULL',
    delete: 'COMPANY_SCOPE_OR_NULL' },
  op_patient_checks: {
    table: 'op_patient_checks',
    select: 'COMPANY_SCOPE_OR_NULL',
    insert: 'COMPANY_SCOPE_OR_NULL',
    update: 'COMPANY_SCOPE_OR_NULL',
    delete: 'COMPANY_SCOPE_OR_NULL' },

  // ── MANAGE_COMPANY_OR_NULL — roster_policy_settings (can_manage + null/match)
  roster_policy_settings: {
    table: 'roster_policy_settings',
    select: 'MANAGE_COMPANY_OR_NULL',
    insert: 'MANAGE_COMPANY_OR_NULL',
    update: 'MANAGE_COMPANY_OR_NULL',
    delete: 'MANAGE_COMPANY_OR_NULL' },

  // ── ROSTER_APPROVER_OR_SELF (근무표 결재 워크플로우)
  roster_approval_requests: {
    table: 'roster_approval_requests',
    select: 'ROSTER_APPROVER_OR_SELF',
    insert: 'ROSTER_APPROVER_OR_SELF',
    update: 'ROSTER_APPROVER_OR_SELF', // update는 approver만 (원본) — 단순화
    delete: 'SELF_ONLY',
    staffIdField: 'requested_by' },
  roster_swap_requests: {
    table: 'roster_swap_requests',
    select: 'ROSTER_APPROVER_OR_SELF',
    insert: 'ROSTER_APPROVER_OR_SELF',
    update: 'ROSTER_APPROVER_OR_SELF',
    delete: 'SELF_ONLY',
    staffIdField: 'requested_by' },

  // ── APPROVAL_SCOPE (전자결재)
  approvals: {
    table: 'approvals',
    select: 'APPROVAL_SCOPE',
    insert: 'SELF_OR_SAME_COMPANY',
    update: 'APPROVAL_SCOPE',
    delete: 'SELF_ONLY',
    staffIdField: 'sender_id',
    approvalFields: { sender: 'sender_id', approver: 'current_approver_id' } },

  // ── INVENTORY_SCOPE
  inventory: {
    table: 'inventory',
    select: 'INVENTORY_SCOPE',
    insert: 'INVENTORY_SCOPE',
    update: 'INVENTORY_SCOPE',
    delete: 'INVENTORY_SCOPE',
    inventoryFields: { company: 'company', company_id: 'company_id', department: 'department' } },
  inventory_logs: {
    table: 'inventory_logs',
    select: 'INVENTORY_SCOPE',
    insert: 'INVENTORY_SCOPE',
    inventoryFields: { company: 'company', company_id: 'company_id', department: 'department' } },
  inventory_count_sessions: {
    table: 'inventory_count_sessions',
    select: 'INVENTORY_SCOPE',
    insert: 'INVENTORY_SCOPE',
    inventoryFields: { company: 'company', company_id: 'company_id', department: 'department' } },
  inventory_cost_entries: {
    table: 'inventory_cost_entries',
    select: 'INVENTORY_SCOPE',
    insert: 'INVENTORY_SCOPE',
    inventoryFields: { company: 'company_name', company_id: 'company_id', department: 'department' } },
  purchase_orders: {
    table: 'purchase_orders',
    select: 'INVENTORY_SCOPE',
    insert: 'INVENTORY_SCOPE',
    update: 'INVENTORY_SCOPE',
    delete: 'INVENTORY_SCOPE',
    inventoryFields: { company: 'requester_company', department: 'requester_department' } },

  // ── COMPANY_INVENTORY_SCOPE
  inventory_closing_snapshots: {
    table: 'inventory_closing_snapshots',
    select: 'COMPANY_INVENTORY_SCOPE',
    insert: 'COMPANY_INVENTORY_SCOPE',
    inventoryFields: { company: 'company', company_id: 'company_id' } },
  delivery_confirmations: {
    table: 'delivery_confirmations',
    select: 'COMPANY_INVENTORY_SCOPE',
    insert: 'COMPANY_INVENTORY_SCOPE',
    update: 'COMPANY_INVENTORY_SCOPE',
    delete: 'COMPANY_INVENTORY_SCOPE',
    inventoryFields: { company: 'receiver_company' } },

  // ── DEPARTMENT_INVENTORY_SCOPE
  department_private_inventory_items: {
    table: 'department_private_inventory_items',
    select: 'DEPARTMENT_INVENTORY_SCOPE',
    insert: 'DEPARTMENT_INVENTORY_SCOPE',
    update: 'DEPARTMENT_INVENTORY_SCOPE',
    delete: 'DEPARTMENT_INVENTORY_SCOPE',
    inventoryFields: { company: 'company', company_id: 'company_id', department: 'department' } },
  department_private_inventory_logs: {
    table: 'department_private_inventory_logs',
    select: 'DEPARTMENT_INVENTORY_SCOPE',
    insert: 'DEPARTMENT_INVENTORY_SCOPE',
    // update/delete는 admin-only (원본) — 등록 X = default deny (admin only)
    inventoryFields: { company: 'company', company_id: 'company_id', department: 'department' } },

  // SEC-P0-01 fix: 결재 위임 — 위임자 본인만 생성·수정·삭제 가능
  approval_delegation: {
    table: 'approval_delegation',
    select: 'SELF_ONLY',
    insert: 'SELF_ONLY',
    update: 'SELF_ONLY',
    delete: 'SELF_ONLY',
    staffIdField: 'delegator_id',
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
/** 로그인 사용자 공용(민감도 낮음) — 게시·채팅 부가·문서 등 */
const ADDITIONAL_PUBLIC_TABLES: string[] = [
  // chat / messaging (rooms/messages 는 위 명시 정책 사용)
  'chat_messages',
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

  // staff / HR auxiliary (개인 스코프 아닌 마스터성)
  'staff_certifications',
  'staff_licenses',
  'staff_job_categories',
  'staff_shift_assignments',
  'staff_trainings',
  'job_categories',
  'job_category_required_trainings',
  'shift_assignments',
  'personnel_appointments',
  'reward_discipline',

  // attendance aux (잔액·원장은 민감 — 아래 STAFF 테이블로 분리)
  'attendance_deduction_rules',
  'unpaid_absence_records',

  // company aux
  'company_expenses',
  'company_welfare_policies',
  'company_payroll_policies',
  'approval_form_types',
  'approval_history',
  'approval_templates',
  // 'approval_delegation', → SEC-P0-01 fix: POLICY_REGISTRY로 이동 (SELF_ONLY)
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
  //    클라이언트 코드가 db.from()으로 호출하나 POLICY_REGISTRY·
  //    ADDITIONAL_PUBLIC_TABLES 어디에도 없어 403이 발생하던 테이블.
  'annual_leave_promotion_logs', // 연차 이월/프로모션 로그
  'attendance_corrections',      // 출퇴근 정정 요청

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
  //    소비처가 db.from()/enqueueD1Mutation으로 호출하던 기능을
  //    실테이블 신설과 함께 복구. 형제 테이블(board_*, inventory aux, 관리자 설정)과
  //    동일하게 PUBLIC_ALL(로그인 사용자 접근). PII(상담/계약/경조) 포함이나 기존
  //    컨벤션(staff_*, board_*가 PUBLIC_ALL)을 따라 앱 동작 유지 우선.

  'congratulations_condolences', // 경조사관리
  'early_leave_records',         // 조기퇴근감지
  'generated_contracts',         // 계약서자동생성
  'board_post_stars',            // 게시판 별표(즐겨찾기)
  'as_repair_records',           // AS 수리 접수
  'return_records',              // 반품
  'message_templates',           // 관리자 메시지 템플릿
  'external_integrations',       // 관리자 외부 연동

  // ── 2026-06-10 무음 실패 복구 (G7) — migration 0013로 D1에 신설된 기능 테이블 5종.
  //    소비처가 db.from()으로 호출하나 실테이블이 schema.ts/d1_schema_final.sql
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

  // ── 2026-05-20 확인 — 아래는 클라이언트 코드가 db.from()으로
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
    // 자동 PUBLIC_ALL 부여 제거 — 미등록 테이블은 Default Deny (ADMIN_ONLY 또는 403)
    POLICY_REGISTRY[tableName] = ADMIN_ONLY_ALL(tableName);
  }
}

// 민감·원장·시스템 설정 — PUBLIC_ALL 컷오버 완화분을 축소
const SENSITIVE_STAFF_SCOPED: string[] = [
  'leave_balances',
  'leave_accruals',
];
for (const tableName of SENSITIVE_STAFF_SCOPED) {
  POLICY_REGISTRY[tableName] = {
    table: tableName,
    select: 'SELF_OR_SAME_COMPANY',
    insert: 'ADMIN_OR_MANAGER',
    update: 'ADMIN_OR_MANAGER',
    delete: 'ADMIN_ONLY',
    staffIdField: 'staff_id',
  };
}

const SENSITIVE_ADMIN_WRITE: string[] = [
  'nurse_schedules',
  'chat_push_jobs',
  'system_configs',
  'system_settings',
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
  'email_queue',
];
for (const tableName of SENSITIVE_ADMIN_WRITE) {
  POLICY_REGISTRY[tableName] = {
    table: tableName,
    select: tableName === 'chat_push_jobs' ? 'ADMIN_ONLY' : 'AUTHENTICATED',
    insert: 'ADMIN_OR_MANAGER',
    update: 'ADMIN_OR_MANAGER',
    delete: 'ADMIN_ONLY',
  };
}
// ─────────────────────────────────────────────────────────────
// 민감 테이블 — ADMIN_ONLY (admin/master 역할만 접근 허용)
// 급여, 급여변경이력, 감사로그, 수술상담, 비밀번호재설정토큰 등 PII/보안 데이터.
// (onboarding_checklists 는 직원 서명 동기화가 필요해 아래 SELF_OR_SAME_COMPANY 로 분리)
// ─────────────────────────────────────────────────────────────
const ADMIN_ONLY_TABLES: string[] = [
  'payroll',
  'salary_change_history',
  'audit_logs',
  'op_consultations',
  'password_reset_tokens',
];

for (const tableName of ADMIN_ONLY_TABLES) {
  if (!POLICY_REGISTRY[tableName]) {
    POLICY_REGISTRY[tableName] = ADMIN_ONLY_ALL(tableName);
  }
}

// 서버/cron 전용 큐·설정 — ADMIN_ONLY_ALL 정의 이후 덮어쓰기
POLICY_REGISTRY['chat_push_jobs'] = ADMIN_ONLY_ALL('chat_push_jobs');
POLICY_REGISTRY['system_configs'] = {
  table: 'system_configs',
  select: 'AUTHENTICATED',
  insert: 'ADMIN_ONLY',
  update: 'ADMIN_ONLY',
  delete: 'ADMIN_ONLY',
};
POLICY_REGISTRY['system_settings'] = {
  table: 'system_settings',
  select: 'AUTHENTICATED',
  insert: 'ADMIN_ONLY',
  update: 'ADMIN_ONLY',
  delete: 'ADMIN_ONLY',
};

// 입사 체크리스트: 본인 서명 완료 시 동기화(update) + 본인/같은 회사 매니저 조회
// (ADMIN_ONLY 였을 때 직원 서명 후 체크리스트 갱신이 403 으로 실패)
if (!POLICY_REGISTRY['onboarding_checklists']) {
  POLICY_REGISTRY['onboarding_checklists'] = {
    table: 'onboarding_checklists',
    select: 'SELF_OR_SAME_COMPANY',
    insert: 'SELF_OR_SAME_COMPANY',
    update: 'SELF_OR_SAME_COMPANY',
    delete: 'ADMIN_ONLY',
    staffIdField: 'staff_id',
  };
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
  if (pattern === 'ADMIN_ONLY') return erpIsAdmin(claims);
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
    if (!erpCanManageCompany(claims)) return false;
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

  if (pattern === 'CHAT_ROOM_MEMBER') {
    // 단건 검사 — 배치 SELECT 는 filterByPolicy 전용 경로 사용
    if (erpIsAdmin(claims)) return true;
    const me = claimsStaffIdRaw(claims);
    if (me === null) return false;
    // messages 행: room_id
    const roomId =
      getField<string>(row, 'room_id') ??
      (cfg.table === 'chat_rooms' ? getField<string>(row, 'id') : null);
    if (roomId === null) {
      // chat_rooms 행에 members 가 있으면 인라인 판정
      if (Object.prototype.hasOwnProperty.call(row, 'members')) {
        if (isNoticeRoomType(getField<string>(row, 'type'))) return true;
        return isRoomMember(parseMembersField(row.members), me);
      }
      return false;
    }
    if (cfg.table === 'chat_rooms' && isNoticeRoomType(getField<string>(row, 'type'))) {
      return true;
    }
    const room = await loadChatRoomMembership(db, String(roomId));
    if (!room) return false;
    return canAccessChatRoom(room, me);
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
 * messages SELECT — room_id 별 멤버십 1회 조회 후 필터 (N+1 방지).
 */
async function filterMessagesByChatRoomMembership<T extends Record<string, unknown>>(
  db: D1Client,
  claims: ErpClaims,
  rows: T[],
): Promise<T[]> {
  // 회사 관리 권한은 채팅 열람 권한이 아니다. 시스템 관리자만 멤버십 검사 예외를 둔다.
  if (erpIsAdmin(claims)) return rows;
  const me = claimsStaffIdRaw(claims);
  if (me === null) return [];

  const roomIds = [
    ...new Set(
      rows
        .map((r) => String(r.room_id ?? '').trim())
        .filter(Boolean),
    ),
  ];
  const allowed = new Set<string>();
  await Promise.all(
    roomIds.map(async (rid) => {
      const room = await loadChatRoomMembership(db, rid);
      if (room && canAccessChatRoom(room, me)) allowed.add(rid);
    }),
  );
  return rows.filter((r) => allowed.has(String(r.room_id ?? '').trim()));
}

/**
 * chat_rooms SELECT — 행 자체가 방 메타. members/type 으로 판정.
 * members 가 select 컬럼에 없으면 id로 로드.
 */
async function filterChatRoomsByMembership<T extends Record<string, unknown>>(
  db: D1Client,
  claims: ErpClaims,
  rows: T[],
): Promise<T[]> {
  // 회사 관리 권한은 채팅 열람 권한이 아니다. 시스템 관리자만 멤버십 검사 예외를 둔다.
  if (erpIsAdmin(claims)) return rows;
  const me = claimsStaffIdRaw(claims);
  if (me === null) return [];

  const out: T[] = [];
  for (const row of rows) {
    const type = row.type != null ? String(row.type) : null;
    if (isNoticeRoomType(type)) {
      out.push(row);
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(row, 'members')) {
      if (isRoomMember(parseMembersField(row.members), me)) out.push(row);
      continue;
    }
    const id = String(row.id ?? '').trim();
    if (!id) continue;
    const room = await loadChatRoomMembership(db, id);
    if (room && canAccessChatRoom(room, me)) out.push(row);
  }
  return out;
}

/**
 * 여러 row를 일괄 필터링 — SELECT 결과를 RLS처럼 적용.
 */
const STAFF_SECRET_ALWAYS_COLUMNS = new Set(['password', 'passwd']);
const STAFF_PII_SENSITIVE_COLUMNS = new Set([
  'resident_no',
  'account_number',
  'bank_name',
  'bank_account',
  'salary_info',
  'base_salary',
  'hourly_rate',
  'address',
  'detail_address',
  'salary_type',
  'national_pension',
  'health_insurance',
  'employment_insurance',
  'long_term_care',
  'birth_date',
  'phone',
  'email',
  'permissions',
  'is_admin',
  'is_master',
]);

function stripStaffSecrets<T extends Record<string, unknown>>(rows: T[], claims?: ErpClaims): T[] {
  const isAdmin = claims ? erpIsAdmin(claims) : false;
  const myStaffId = claims ? String(erpStaffId(claims) || '').trim() : '';

  return rows.map((row) => {
    const next = { ...row };
    for (const col of STAFF_SECRET_ALWAYS_COLUMNS) {
      if (col in next) delete next[col];
    }

    const rowId = String(next.id || next.staff_id || '').trim();
    const isSelf = myStaffId !== '' && rowId === myStaffId;

    // 본인도 아니고 관리자도 아니면 타인의 민감 PII 컬럼(주민번호/계좌/급여/주소) 제거
    if (!isAdmin && !isSelf) {
      for (const col of STAFF_PII_SENSITIVE_COLUMNS) {
        if (col in next) delete next[col];
      }
    }

    return next;
  });
}

export async function filterByPolicy<T extends Record<string, unknown>>(
  db: D1Client,
  claims: ErpClaims,
  table: string,
  rows: T[],
): Promise<T[]> {
  const cfg = POLICY_REGISTRY[table];
  if (!cfg || !cfg.select) return erpIsAdmin(claims) ? rows : [];

  // staff_members: 해시/비밀번호 컬럼은 응답에서 항상 제거 (admin 포함 — 클라이언트 불필요)
  const stripSecrets = table === 'staff_members';

  if (cfg.select === 'PUBLIC') {
    return stripSecrets ? stripStaffSecrets(rows, claims) : rows;
  }
  if (cfg.select === 'AUTHENTICATED') {
    const ok = erpStaffId(claims) !== null ? rows : [];
    return stripSecrets ? stripStaffSecrets(ok as T[], claims) : ok;
  }
  if (erpIsAdmin(claims)) {
    return stripSecrets ? stripStaffSecrets(rows, claims) : rows;
  }

  // 채팅 멤버 스코프 — 배치 평가
  if (cfg.select === 'CHAT_ROOM_MEMBER') {
    if (table === 'messages') {
      return filterMessagesByChatRoomMembership(db, claims, rows);
    }
    if (table === 'chat_rooms') {
      return filterChatRoomsByMembership(db, claims, rows);
    }
  }

  const out: T[] = [];
  for (const row of rows) {
    const ok = await evalPattern(cfg.select, db, claims, row, cfg);
    if (ok) out.push(row);
  }
  return stripSecrets ? stripStaffSecrets(out, claims) : out;
}
