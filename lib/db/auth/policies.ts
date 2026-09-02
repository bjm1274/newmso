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

import { eq, inArray } from 'drizzle-orm';
import type { D1Client } from '../client-d1';
import { messages, board_posts, daily_closures, staff_members } from '../schema';
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
  erpCanManageFinance,
  erpCompanyId,
  erpCompanyName,
  erpCompanyMatches,
  erpCompanyNameMatches,
  erpInventoryScopeMatches,
  erpInventoryCompanyScopeMatches,
  erpDepartmentInventoryScopeMatches,
  erpTargetStaffSameCompany,
  erpTargetStaffInScope,
  erpTargetStaffInScopeBatch,
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
  /** 재무: finance 권한 보유자 + 회사 스코프 (회사 컬럼이 비면 전사 공용으로 간주) */
  | 'FINANCE_SCOPE'
  /**
   * 동료에게도 보여야 하는 근태·휴가 행 — 같은 회사 직원의 행까지 열되,
   * 본인·인사가 아니면 민감 컬럼을 지우고 확정 상태만 남긴다.
   * 범위는 TEAM_VISIBLE_TABLE_RULES 에 테이블별로 명시한다.
   */
  | 'SAME_COMPANY_TEAM_VISIBLE'
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
  /** 회사 **UUID** 컬럼명 (기본 'company_id'). erpCompanyMatches 는 UUID 로만 비교한다. */
  companyIdField?: string;
  /**
   * 회사 **이름** 컬럼명 (예: 'company', 'company_name').
   *
   * D1 이관 과정에서 회사를 UUID 가 아니라 이름 문자열로 들고 있는 테이블이 다수라
   * companyIdField 만으로는 회사 격리를 걸 수 없었다(비관리자에게 항상 false).
   * 이 필드를 주면 회사 스코프 패턴이 erpCompanyNameMatches 로도 일치를 판정한다.
   * companyIdField 와 함께 주면 **둘 중 하나라도 일치**하면 통과한다.
   */
  companyNameField?: string;
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
  /**
   * changedKeys: 이번 mutation 이 **실제로 변경하는 컬럼 집합**(update 는 set 의 키, insert 는 values 의 키).
   * 정책 판정 행(row)에 DB 정본이 병합되면서 "값이 존재한다"와 "이번에 바꾼다"를 구분할 수
   * 없게 되므로, 컬럼 단위 가드는 row 대신 이 집합을 봐야 한다.
   * 미제공(undefined) 시에는 기존 동작대로 row 의 키를 사용한다.
   */
  guards?: Partial<
    Record<
      Op,
      (claims: ErpClaims, row: Record<string, unknown>, changedKeys?: ReadonlySet<string>) => boolean
    >
  >;
  /**
   * 비동기 행 단위 가드. 동기 guards 통과 후 op별로 호출되며, row만으로는 판정할 수
   * 없어 DB 조회가 필요한 경우(예: where에 id만 있는 soft-delete에서 소유자 확인)에
   * 사용. true=허용, false=거부. 동기 guards와 함께 정의되면 둘 다 통과해야 한다.
   */
  asyncGuards?: Partial<
    Record<
      Op,
      (
        db: D1Client,
        claims: ErpClaims,
        row: Record<string, unknown>,
        // 실제로 바뀌는 컬럼. 동기 guards 와 같은 값을 받는다 — 소유자가 아니어도
        // 특정 컬럼(조회수·좋아요·투표)만은 쓸 수 있게 하려면 이 정보가 필요하다.
        changedKeys?: ReadonlySet<string>,
      ) => Promise<boolean>
    >
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
  // 로그인 자격에 직결되는 컬럼. 매니저·인사담당자에게 열려 있으면 안 된다.
  //
  // password_reset_required 는 이름과 달리 단순 표시 플래그가 아니다.
  // master-login 은 이 값이 1 이면 그 로그인에 입력된 비밀번호를 **새 비밀번호로
  // 확정하고 통과시킨다.** 즉 이 플래그를 켤 수 있는 사람은 그 계정의 비밀번호를
  // 자기가 아는 값으로 바꿔 그대로 로그인할 수 있다 — 관리자 계정도 마찬가지다.
  // 예전에는 SENSITIVE 목록에도 없어서 회사 매니저가 임의 직원 행에 켤 수 있었다.
  'password_reset_required',
  // auth_user_id 는 외부 인증 신원과의 연결고리라 바꿔치기하면 사칭이 된다.
  'auth_user_id',
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

/**
 * 이 mutation 이 컬럼 `col` 을 실제로 변경하는지.
 *
 * changedKeys 가 있으면 그것만 본다(정책 판정 행에 DB 정본이 병합돼 있어도 오탐 없음).
 * 없으면 기존 동작(row 키 존재 여부)으로 폴백한다.
 */
function touchesColumn(
  row: Record<string, unknown>,
  changedKeys: ReadonlySet<string> | undefined,
  col: string,
): boolean {
  if (changedKeys) return changedKeys.has(col);
  return Object.prototype.hasOwnProperty.call(row, col);
}

/**
 * 시스템마스터 신원으로 예약된 사번.
 *
 * `lib/d1-api-helpers.ts` 의 userId() 는 employee_no 가 이 값이면 권한 컬럼을
 * 보지도 않고 '9999'(시스템마스터 신원)를 돌려준다. 즉 이 사번을 쓰는 계정은
 * permissions·role 을 전혀 건드리지 않고도 게이트웨이 전체에서 시스템마스터로
 * 인식된다. employee_no 는 SENSITIVE_STAFF_COLUMNS 라 회사 매니저·인사담당자도
 * 쓸 수 있었으므로, 그들이 이 사번의 계정을 만들면 그대로 권한 상승이 됐다.
 */
const RESERVED_SYSTEM_MASTER_EMPLOYEE_NO = '9999';

/**
 * 이 행이 시스템마스터 계정인가.
 *
 * update 판정 행에는 DB 정본이 병합돼 있으므로 대상 계정의 표식을 그대로 읽을 수 있고,
 * insert 는 요청 본문이 그대로 들어오므로 "시스템마스터로 만들려는 시도"가 걸린다.
 */
function isSystemMasterStaffRow(row: Record<string, unknown>): boolean {
  if (String(getField<string>(row, 'employee_no') ?? '').trim() === RESERVED_SYSTEM_MASTER_EMPLOYEE_NO) {
    return true;
  }
  const flag = row.is_system_master;
  if (flag === 1 || flag === true) return true;

  const perms = row.permissions;
  if (perms && typeof perms === 'object' && !Array.isArray(perms)) {
    return (perms as Record<string, unknown>).system_master === true;
  }
  if (typeof perms === 'string' && perms.length > 0) {
    try {
      const parsed = JSON.parse(perms) as Record<string, unknown> | null;
      return Boolean(parsed && typeof parsed === 'object' && parsed.system_master === true);
    } catch {
      return false;
    }
  }
  return false;
}

function staffPrivilegeGuard(
  claims: ErpClaims,
  row: Record<string, unknown>,
  changedKeys?: ReadonlySet<string>,
): boolean {
  // 시스템마스터 계정은 본인만 건드릴 수 있다.
  //
  // 컬럼 단위로만 막으면 그물이 계속 새 나갔다. 사번 '9999' 는 권한 컬럼이 비어
  // 있어도 게이트웨이가 시스템마스터로 인식하고, password_reset_required 처럼
  // 이름만으로는 위험해 보이지 않는 컬럼이 로그인 우회 수단이 된다. 그래서
  // 컬럼이 아니라 **행**을 기준으로 잠근다 — 만들려는 시도든 고치려는 시도든.
  if (isSystemMasterStaffRow(row) && erpStaffId(claims) !== RESERVED_SYSTEM_MASTER_EMPLOYEE_NO) {
    return false;
  }

  const touchesPrivileged = PRIVILEGED_STAFF_COLUMNS.some(
    (col) => touchesColumn(row, changedKeys, col),
  );
  if (touchesPrivileged && !erpIsAdmin(claims)) return false;

  const touchesSensitive = SENSITIVE_STAFF_COLUMNS.some(
    (col) => touchesColumn(row, changedKeys, col),
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

/**
 * approvals: 결재 상태 전이는 범용 mutate 로 할 수 없다.
 *
 * approvals 정책은 APPROVAL_SCOPE(기안자 또는 현재 결재자면 통과)만 걸려 있고
 * 컬럼 가드가 없었다. 그래서 **기안자가 자기 문서에 status='승인' 을 직접 써서**
 * 결재선을 통째로 건너뛸 수 있었다. 정본 행을 읽어 판정하므로 행 위조는
 * 불가능하지만, 그 행의 sender_id 가 곧 자기 자신이라 범위 검사를 그냥 통과한다.
 * 이후 /api/approvals/process-final 이 '승인' 을 최종 상태로 인정하므로
 * 연차 차감·인사명령 반영·기본급 갱신까지 실제로 커밋된다.
 *
 * 상태 전이는 /api/approvals/transition 전용이다(그 경로는 정책 레지스트리를
 * 거치지 않고 서버에서 직접 쓰므로 이 가드의 영향을 받지 않는다).
 * 결재자 라우팅(current_approver_id·approver_line)과 meta_data 는 클라이언트
 * 위임 동기화가 실제로 쓰고 있어 컬럼 단위로는 막지 않는다 — 대신 아래
 * APPROVAL_FINALIZED_STATUSES 로 **확정된 문서 자체**를 잠근다(10차 DLT-01).
 */
const APPROVAL_TRANSITION_COLUMNS = [
  'status',
  // 기안자·소속을 바꾸면 결재 범위 판정 자체가 바뀐다.
  'sender_id',
  'company_id',
  // 문서번호는 발급 이력과 대조되는 값이라 임의로 덮어쓸 수 없어야 한다.
  'doc_number',
  // type 은 서버 후속처리(processFinalApprovalEffects)가 **어떤 집행을 돌릴지**
  // 고르는 값이다 — '급여인상평가서' 면 base_salary 를, '인사명령' 이면 직급·부서를
  // 실제로 UPDATE 한다. 기안 시점에 정해지고 그 뒤로 바뀔 이유가 없다:
  // 저장소 전체에서 approvals.type 을 update 하는 클라이언트 경로는 0건이고
  // (전부 insert 시 지정), 결재선 변경·위임 동기화도 이 컬럼은 건드리지 않는다.
  'type',
] as const;

/**
 * 확정 계열 status — 이 상태의 문서는 비관리자에게 read-only 다.
 *
 * `isFinalizedApprovalStatus`(lib/server-approval-processing-helpers.ts)가
 * 집행을 여는 값과 같은 집합이어야 한다. 운영 실측(2026-08-27) status 분포는
 * 승인 449 · 회수 178 · 대기 61 · 반려 22 이고 '완료' 는 0건이지만,
 * 집행 쪽이 '완료' 도 확정으로 인정하므로 여기서도 함께 잠근다.
 */
const APPROVAL_FINALIZED_STATUSES = new Set(['승인', '완료']);

/**
 * 확정된 문서에 비관리자가 **그래도** 쓸 수 있는 컬럼 / 문서 종류.
 *
 * 유일한 정상 경로가 물품신청 재고 워크플로다 — app/main/hooks/useSupplyWorkflow.ts
 * 가 `type='물품신청' AND status='승인'` 문서만 골라(:71-74) 불출·발주 진행 상태를
 * meta_data.inventory_workflow 에 기록한다(:130). 그 화면을 쓰는 사람은 MSO 지원부서
 * 소속이면 되고 관리자 등급이 아닐 수 있으므로(재고관리워크센터/StatusWorkcenter.tsx:59)
 * 이 예외가 없으면 불출 처리가 통째로 막힌다.
 *
 * 나머지 update 경로는 전부 확정 전 문서만 건드린다 — 위임 동기화는 '대기' 로 필터하고
 * (전자결재.tsx:704), 지연 알림은 isApprovalOverdue 가 '대기' 만 인정하며
 * (lib/approval-workflow.ts:203), 재상신 seed 는 '회수' 문서다.
 */
const APPROVAL_FINALIZED_UPDATABLE_COLUMNS = new Set(['meta_data']);
const APPROVAL_FINALIZED_UPDATABLE_TYPES = new Set(['물품신청']);

function approvalsUpdateGuard(
  claims: ErpClaims,
  row: Record<string, unknown>,
  changedKeys?: ReadonlySet<string>,
): boolean {
  // 관리자·인사는 예외다. 이 가드가 생기면서 게이트웨이로 status 를 쓰던 유일한
  // 화면(모바일 인사관리 증명서 승인)이 **관리자에게도 항상 실패**했다 —
  // 버튼을 누르면 매번 '처리에 실패했습니다.' 만 떴다(9차 D1-02).
  // 위조를 막으려던 것이지 정상 승인을 막으려던 게 아니다.
  //
  // 인사(erpCanManageCompany)까지 여는 이유: 그 화면의 접근 조건이
  // menu_인사관리 계열이라 인사만 가진 계정도 들어올 수 있다(운영 현재는 8명 전원
  // 관리자지만 권한 배치가 바뀌면 같은 증상이 재발한다). 인사는 base_salary 를
  // 직접 쓸 수 있는 등급이라 여기서 열어도 새로 얻는 권한이 없다 —
  // employmentContractUpdateGuard 도 같은 등급으로 열려 있다.
  if (erpIsAdmin(claims) || erpCanManageCompany(claims)) return true;

  /**
   * 확정(승인·완료)된 문서는 기안자라도 고칠 수 없다 — 10차 DLT-01 의 P0 체인.
   *
   * APPROVAL_SCOPE 는 `sender_id === 나` 면 status 를 보지 않고 통과시킨다. 그래서
   * 9차 FB1 이 insert 를 막은 뒤에도 **이미 승인된 자기 기안 문서**를 update 로
   * 계속 고칠 수 있었고, type·meta_data·current_approver_id 를 덮어쓰면
   * /api/approvals/process-final 이 그 값을 그대로 믿고 staff_members.base_salary 를
   * UPDATE 했다. 컬럼 하나씩 막는 방식은 form_type·form_slug·evaluationType 처럼
   * meta_data 안쪽 키까지 전부 세어야 해서 계속 새 나간다 — 그래서 컬럼이 아니라
   * **행의 확정 여부**로 잠근다.
   *
   * row 는 guardRow(=DB 정본 ∪ set)라 status 를 set 으로 덮어쓰면 이 검사를
   * 비켜갈 수 있어 보이지만, status 자체가 APPROVAL_TRANSITION_COLUMNS 라
   * 아래 검사에서 어차피 막힌다.
   */
  const status = String(getField<string>(row, 'status') ?? '').trim();
  if (APPROVAL_FINALIZED_STATUSES.has(status)) {
    const touchedColumns = changedKeys ? Array.from(changedKeys) : Object.keys(row);
    if (touchedColumns.some((col) => !APPROVAL_FINALIZED_UPDATABLE_COLUMNS.has(col))) return false;
    const docType = String(getField<string>(row, 'type') ?? '').trim();
    if (!APPROVAL_FINALIZED_UPDATABLE_TYPES.has(docType)) return false;
  }

  return !APPROVAL_TRANSITION_COLUMNS.some((col) => touchesColumn(row, changedKeys, col));
}

/**
 * 신규 결재 문서가 가질 수 있는 status.
 *
 * 비어 있는 경우도 허용한다 — 스키마 기본값이 '대기' 라 명시하지 않는 호출부가 있다.
 * 운영 코드의 insert 는 전부 '대기' 를 쓴다(2026-08-27 전수 확인).
 */
const APPROVAL_INSERT_ALLOWED_STATUS = new Set(['', '대기', '진행중', '임시저장', 'pending', 'draft']);

/**
 * approvals insert: **이미 승인된 상태의 문서를 처음부터 만들 수 없게** 한다.
 *
 * 8차에서 status 위조를 막았지만 `guards.update` 에만 걸었다. insert 에는
 * 가드가 없고 정책이 SELF_OR_SAME_COMPANY 라 sender_id 를 자기 id 로 넣으면
 * 통과한다. 그래서 일반 직원이
 *   ① mutate insert → status:'승인', current_approver_id:본인,
 *                     type:'급여인상평가서', meta_data:{targetStaffId, newSalary}
 *   ② /api/approvals/process-final
 * 두 번의 요청으로 자기 기본급을 임의 금액으로 올릴 수 있었다(9차 P0-D05-001).
 * process-final 이 결재 이력 대신 DB 의 status·current_approver_id 만 보는데
 * 둘 다 ①에서 공격자가 채운 값이기 때문이다.
 *
 * 관리자에게도 적용한다 — 결재 문서는 어떤 역할이든 '대기' 로 시작해서
 * 전이 경로(/api/approvals/transition)를 거쳐야 이력이 남는다.
 */
function approvalsInsertGuard(claims: ErpClaims, row: Record<string, unknown>): boolean {
  const status = String(getField<string>(row, 'status') ?? '').trim();
  if (!APPROVAL_INSERT_ALLOWED_STATUS.has(status)) return false;

  // 기안자 위조 방지: 관리자가 아닌 일반 사용자는 sender_id 가 반드시 본인(erpStaffId)이어야 함
  if (!erpIsAdmin(claims)) {
    const senderId = String(getField<string>(row, 'sender_id') ?? '').trim();
    if (senderId && senderId !== erpStaffId(claims)) {
      return false;
    }
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

function employmentContractUpdateGuard(
  claims: ErpClaims,
  row: Record<string, unknown>,
  changedKeys?: ReadonlySet<string>,
): boolean {
  if (erpIsAdmin(claims) || erpCanManageCompany(claims)) return true;
  const me = erpStaffId(claims);
  if (me === null) return false;
  const staffId = getField<string>(row, 'staff_id');
  if (staffId !== null && staffId !== me) return false;
  // 실제로 바뀌는 컬럼만 검사. changedKeys 가 없을 때만 row 키로 폴백한다
  // (폴백 시에는 where 키를 걸러낼 수 없어 id/staff_id 를 제외한다).
  const keys = changedKeys
    ? [...changedKeys]
    : Object.keys(row).filter((k) => k !== 'id' && k !== 'staff_id');
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
 * daily_closure_items: 부모 마감보고(daily_closures)의 회사 스코프를 따른다.
 *
 * 이 테이블에는 company_id 가 없고 closure_id 만 있어서 기존 패턴으로는 회사 격리를
 * 표현할 수 없었고, 그래서 4개 op 가 모두 AUTHENTICATED 였다.
 * 그런데 이 행에는 환자명과 수납금액이 들어 있다 — 로그인만 하면 타 회사 환자 정보를
 * 열람·수정·삭제할 수 있었다. 부모를 한 번 조회해 회사 스코프를 강제한다.
 */
async function dailyClosureItemsScopeGuard(
  db: D1Client,
  claims: ErpClaims,
  row: Record<string, unknown>,
): Promise<boolean> {
  if (erpIsAdmin(claims)) return true;

  const closureId = getField<string | number>(row, 'closure_id');
  // 부모를 알 수 없으면 회사 판정이 불가능하다 — 열어두지 않는다.
  if (closureId === null || String(closureId).trim() === '') return false;

  const rows = await db
    .select({ company_id: daily_closures.company_id })
    .from(daily_closures)
    .where(eq(daily_closures.id, String(closureId)))
    .limit(1);
  const parent = rows[0];
  if (!parent) return false;

  // 부모 정책(COMPANY_SCOPE_OR_NULL)과 같은 기준: 회사가 비어 있으면 전사 공용으로 본다.
  if (parent.company_id === null || String(parent.company_id).trim() === '') return true;
  return erpCompanyMatches(claims, String(parent.company_id));
}

/**
 * board_posts UPDATE/DELETE: 작성자 본인 또는 관리 권한만.
 *
 * PUBLIC_ALL 이던 시절에는 로그인만 하면 누구나 타인의 게시글을, 공지까지 포함해
 * 수정·삭제할 수 있었다. 클라이언트가 보낸 author_id 는 위조 가능하므로
 * 항상 DB 의 작성자만 신뢰한다.
 */
/**
 * 작성자가 아니어도 쓸 수 있는 컬럼.
 *
 * 게시글 본문·제목이 아니라 "다른 사람이 남기는 반응" 이다. 게시판 투표,
 * 좋아요 수, 조회수가 여기 해당한다. 이 가드를 작성자 전용으로 좁히면서
 * 이 쓰기까지 403 이 됐다 — 투표를 누르면 '투표 실패' 토스트가 뜨고,
 * 좋아요는 fire-and-forget 이라 에러조차 안 보인 채 likes_count 가
 * 영원히 갱신되지 않았다(9차 D1-01).
 *
 * updated_at 은 위 컬럼과 함께 실려 오는 동반 컬럼이라 같이 허용한다.
 */
const BOARD_POST_REACTION_COLUMNS = new Set([
  'poll',
  'poll_votes',
  'likes_count',
  'views',
  'updated_at',
]);

async function boardPostsOwnerGuard(
  db: D1Client,
  claims: ErpClaims,
  row: Record<string, unknown>,
  changedKeys?: ReadonlySet<string>,
): Promise<boolean> {
  if (erpIsAdmin(claims)) return true;
  if (erpCanManageCompany(claims)) return true;

  // 반응 컬럼만 건드리는 쓰기는 작성자 확인 없이 통과시킨다.
  // changedKeys 를 못 받은 호출(폴백)에서는 이 완화를 적용하지 않는다 —
  // 무엇이 바뀌는지 모르는 채로 열어 주면 본문 위조를 막을 수 없다.
  if (changedKeys && changedKeys.size > 0) {
    const onlyReactions = [...changedKeys].every((key) => BOARD_POST_REACTION_COLUMNS.has(key));
    if (onlyReactions) return true;
  }

  const me = claimsStaffIdRaw(claims);
  if (me === null) return false;

  const id = getField<string | number>(row, 'id');
  if (id === null) return false;

  const rows = await db
    .select({ author_id: board_posts.author_id })
    .from(board_posts)
    .where(eq(board_posts.id, String(id)))
    .limit(1);
  const target = rows[0];
  if (!target) return false;
  return target.author_id !== null && String(target.author_id).trim() === me;
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
  db: D1Client,
  claims: ErpClaims,
  row: Record<string, unknown>,
): Promise<boolean> {
  if (erpIsAdmin(claims)) return true;
  const me = claimsStaffIdRaw(claims);
  if (me === null) return false;
  if (isNoticeRoomType(getField<string>(row, 'type'))) return false;

  // upsert 는 mutate 경로에서 insert 로 판정된다. 그래서 이미 존재하는 방 id 를
  // 넣으면 이 가드만 통과하고 실제로는 UPDATE 가 돌아 방이 통째로 덮였다.
  // created_by 와 members 를 자기 자신으로 채워 보내면 아래 검사도 전부 통과하므로,
  // 방 id 만 알면 남의 방을 탈취하고 기존 대화 이력을 볼 수 있었다.
  // 기존 행이 있으면 신규 생성이 아니라 수정이므로 update 규칙으로 판정한다.
  const id = getField<string | number>(row, 'id');
  if (id !== null && String(id).trim() !== '') {
    const existing = await loadChatRoomMembership(db, String(id));
    if (existing) {
      return chatRoomsUpdateGuard(db, claims, row);
    }
  }

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
  // 게시판: 목록·본문은 전 직원 열람(PUBLIC), 작성은 로그인 사용자.
  // 수정·삭제는 작성자 본인 또는 관리 권한만 — PUBLIC_ALL 이던 시절에는
  // 로그인만 하면 누구나 타인의 글과 공지를 고치거나 지울 수 있었다.
  board_posts: {
    table: 'board_posts',
    select: 'PUBLIC',
    insert: 'AUTHENTICATED',
    update: 'AUTHENTICATED',
    delete: 'AUTHENTICATED',
    staffIdField: 'author_id',
    asyncGuards: {
      update: boardPostsOwnerGuard,
      delete: boardPostsOwnerGuard } },
  // 마감보고: 환자명·수납금액·수표 정보가 들어 있다. PUBLIC_ALL 이던 시절에는
  // 로그인만 하면 타 회사 마감보고를 조회·삭제할 수 있었다(클라이언트 필터만 존재).
  // company_id 로 회사 스코프를 서버에서 강제한다.
  daily_closures: {
    table: 'daily_closures',
    select: 'COMPANY_SCOPE_OR_NULL',
    insert: 'COMPANY_SCOPE_OR_NULL',
    update: 'COMPANY_SCOPE_OR_NULL',
    delete: 'COMPANY_SCOPE_OR_NULL',
    companyIdField: 'company_id' },
  // 하위 항목에는 company_id 가 없고 closure_id 만 있어 부모로만 스코프할 수 있다.
  // 패턴으로는 표현할 수 없으므로 부모를 조회하는 asyncGuard 로 회사 격리를 건다
  // (예전에는 4개 op 가 모두 AUTHENTICATED 라 환자명·수납금액이 전사 공개였다).
  daily_closure_items: {
    table: 'daily_closure_items',
    select: 'AUTHENTICATED',
    insert: 'AUTHENTICATED',
    update: 'AUTHENTICATED',
    delete: 'AUTHENTICATED',
    asyncGuards: {
      select: dailyClosureItemsScopeGuard,
      insert: dailyClosureItemsScopeGuard,
      update: dailyClosureItemsScopeGuard,
      delete: dailyClosureItemsScopeGuard } },
  daily_checks: {
    table: 'daily_checks',
    select: 'AUTHENTICATED',
    insert: 'AUTHENTICATED',
    update: 'AUTHENTICATED',
    delete: 'AUTHENTICATED',
    asyncGuards: {
      select: dailyClosureItemsScopeGuard,
      insert: dailyClosureItemsScopeGuard,
      update: dailyClosureItemsScopeGuard,
      delete: dailyClosureItemsScopeGuard } },
  system_configs: PUBLIC_ALL('system_configs'),
  // 근무유형 마스터: 전 직원이 읽어야 하지만(근무현황·출퇴근기록·계약서 미리보기·
  // 전자서명·팀관리), 쓰기는 관리자·인사만이다.
  //
  // PUBLIC_ALL 이던 시절에는 로그인한 아무 직원이나
  // `{op:'delete', table:'work_shifts', where:[{id,neq,''}]}` 한 번으로 106행을
  // 전량 지울 수 있었다 — 그러면 shift_assignments 3562행이 고아가 되고 위 화면들이
  // 동시에 깨진다(10차 D1GW-03). 같은 테이블의 전용 라우트 /api/work-shifts 는
  // 이미 admin/mso/hr/hr_근무형태 로 막혀 있어 이 등록이 누락이었음이 분명하다.
  // 클라이언트의 게이트웨이 write 호출은 0건(전부 select)이라 정상 사용은 안 바뀐다.
  work_shifts: {
    table: 'work_shifts',
    select: 'AUTHENTICATED',
    insert: 'ADMIN_OR_MANAGER',
    update: 'ADMIN_OR_MANAGER',
    delete: 'ADMIN_OR_MANAGER' },
  // 계약서 양식·직인: 직원도 읽어야 하지만(증명서·계약서 미리보기), 쓰기는 관리자만.
  // PUBLIC_ALL 이던 시절에는 아무나 근로계약서 본문과 회사 직인 URL 을 바꿀 수 있었다.
  contract_templates: {
    table: 'contract_templates',
    select: 'AUTHENTICATED',
    insert: 'ADMIN_OR_MANAGER',
    update: 'ADMIN_OR_MANAGER',
    delete: 'ADMIN_OR_MANAGER' },
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
  // 인사평가: 평가자는 extra_직원평가 권한으로 게이팅되며 매니저가 아닐 수 있어
  // insert/select 는 AUTHENTICATED 로 둔다. 다만 수정·삭제는 화면이 이미 admin 으로
  // 제한하고 있으므로(직원평가시스템.tsx:141) 서버에서도 같은 규칙을 강제한다.
  // PUBLIC_ALL 이던 시절에는 아무나 타인 평가를 수정·삭제할 수 있었다.
  // 인사평가는 평가 대상 본인과 인사·관리자만 다룰 수 있어야 한다.
  // select/insert 가 AUTHENTICATED 라 로그인만 하면 누구나 타인의 평가를 열람하고,
  // 임의의 staff_id 로 평가를 새로 써 넣을 수도 있었다(update/delete 는 이미 ADMIN_ONLY).
  staff_evaluations: {
    table: 'staff_evaluations',
    select: 'STAFF_IN_SCOPE',
    insert: 'ADMIN_OR_MANAGER',
    update: 'ADMIN_ONLY',
    delete: 'ADMIN_ONLY',
    staffIdField: 'staff_id' },
  staff_preferred_off: PUBLIC_ALL('staff_preferred_off'),
  monthly_off_quota: PUBLIC_ALL('monthly_off_quota'),
  board_post_reads: PUBLIC_ALL('board_post_reads'),
  license_continuing_education: PUBLIC_ALL('license_continuing_education'),
  popups: PUBLIC_ALL('popups'),
  // 징계 기록: 최고 민감 인사 데이터. PUBLIC_ALL 이던 시절에는 로그인한 아무 직원이나
  // 타인의 징계 사유·결과를 열람하고 수정·삭제까지 할 수 있었다.
  // 조회는 본인 또는 인사/관리자(STAFF_IN_SCOPE), 쓰기는 인사/관리자만.
  disciplinary_committees: {
    table: 'disciplinary_committees',
    select: 'STAFF_IN_SCOPE',
    insert: 'ADMIN_OR_MANAGER',
    update: 'ADMIN_OR_MANAGER',
    delete: 'ADMIN_OR_MANAGER',
    staffIdField: 'target_staff_id',
    companyIdField: 'company' },

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

  // 읽음 커서·리액션은 "누가" 가 곧 데이터다. 쓰기가 AUTHENTICATED 라
  // user_id 만 바꿔 보내면 타인의 읽음 상태를 조작하거나 타인 이름으로 리액션을
  // 달고 지울 수 있었다. 본인 행만 쓰도록 좁힌다(열람은 방 UI 표시용이라 유지).
  room_read_cursors: {
    table: 'room_read_cursors',
    select: 'AUTHENTICATED',
    insert: 'SELF_ONLY',
    update: 'SELF_ONLY',
    delete: 'SELF_ONLY',
    staffIdField: 'user_id',
  },
  message_reactions: {
    table: 'message_reactions',
    select: 'AUTHENTICATED',
    insert: 'SELF_ONLY',
    update: 'SELF_ONLY',
    delete: 'SELF_ONLY',
    staffIdField: 'user_id',
  },
  message_bookmarks: {
    table: 'message_bookmarks',
    select: 'SELF_ONLY',
    insert: 'SELF_ONLY',
    update: 'SELF_ONLY',
    delete: 'SELF_ONLY',
    staffIdField: 'user_id',
  },
  pinned_messages: {
    table: 'pinned_messages',
    select: 'AUTHENTICATED',
    insert: 'AUTHENTICATED',
    update: 'AUTHENTICATED',
    delete: 'AUTHENTICATED',
  },
  board_post_likes: {
    table: 'board_post_likes',
    select: 'AUTHENTICATED',
    insert: 'SELF_ONLY',
    update: 'SELF_ONLY',
    delete: 'SELF_ONLY',
    staffIdField: 'user_id',
  },
  board_post_comments: {
    table: 'board_post_comments',
    select: 'AUTHENTICATED',
    insert: 'AUTHENTICATED',
    update: 'SELF_ONLY',
    delete: 'SELF_ONLY',
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
  // 출퇴근 기록: **읽기만** 동료까지 연다(근무현황·조직도의 출근 표시).
  // 쓰기는 그대로다 — 남의 출퇴근을 찍을 수 있게 되면 안 된다.
  // 가리는 컬럼은 TEAM_VISIBLE_TABLE_RULES 참조.
  attendance: {
    table: 'attendance',
    select: 'SAME_COMPANY_TEAM_VISIBLE',
    insert: 'STAFF_IN_SCOPE',
    update: 'STAFF_IN_SCOPE',
    delete: 'SELF_ONLY' },
  attendances: {
    table: 'attendances',
    select: 'SAME_COMPANY_TEAM_VISIBLE',
    insert: 'SELF_OR_SAME_COMPANY',
    update: 'SELF_OR_SAME_COMPANY',
    delete: 'SELF_OR_SAME_COMPANY' },
  // 연차/휴가: 공유캘린더가 '전체직원' 모드로 조회하므로 읽기는 동료까지 열되,
  // 남의 행은 확정('승인')만 + 사유(reason)를 지운다.
  leave_requests: {
    table: 'leave_requests',
    select: 'SAME_COMPANY_TEAM_VISIBLE',
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
  // insert 가 COMPANY_SCOPE_OR_NULL 이라 **company_id 없는 payload 는 무조건 통과**한다
  // (rowCompanyIsNull() → true). 지금 이걸 닫으면 안 된다 — 정상 생성 경로 중 셋이
  // company_id 를 아예 안 보낸다(2026-08-27 전수 확인):
  //   - 모바일 체크리스트 저장  app/main/모바일/추가기능/OP체크상세.tsx:150 (schedule_post_id·prep_items 만)
  //   - 모바일 카드 상태 전환    app/main/모바일/추가기능/data-hooks.ts:1006 (company_name 만 보냄)
  //   - PC 병동메시지 시각 기록  app/main/기능부품/OP체크.tsx:1882 (schedule_post_id·ward_message_sent_at 만)
  // 막는 순간 이 셋이 전부 403 이 된다. 남는 위험은 **회사 없는 행이 만들어지는 것**이고,
  // select 도 OR_NULL 이라 그 행은 전 회사에 보인다. 남의 회사 기존 행을 덮어쓰는 쪽은
  // 이미 닫혀 있다 — upsert 는 mutate 라우트가 충돌 대상 행을 읽어 update 정책으로 한 번 더
  // 검사하고(company_id 가 채워진 남의 행은 거기서 걸린다), 충돌 키를 특정할 수 없는
  // INSERT OR REPLACE 는 UPSERT_CONFLICT_TARGET_UNKNOWN 으로 거부된다.
  // 실제 수정은 위 세 호출부가 company_id 를 채워 보내는 것이고, 그때 insert 를
  // COMPANY_SCOPE 로 좁혀야 한다 — 정책만 먼저 좁히면 기능이 죽는다.
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
    approvalFields: { sender: 'sender_id', approver: 'current_approver_id' },
    guards: { insert: approvalsInsertGuard, update: approvalsUpdateGuard } },

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
/**
 * 아직 도메인별로 재분류하지 못한 테이블 목록.
 *
 * ⚠ 이름에 속지 말 것. 예전 이름은 ADDITIONAL_PUBLIC_TABLES 였는데
 * 아래 루프는 PUBLIC 이 아니라 **ADMIN_ONLY** 를 부여한다 — 이름과 동작이 정반대라
 * "여기 넣으면 공개된다"고 읽고 민감 테이블을 넣으면 반대로 잠기고,
 * 반대로 잠긴 줄 알고 뺐다가 열리는 오해가 생긴다.
 * 실제 의미는 "미분류 → 관리자 전용으로 잠가 둔 테이블"이다.
 */
const UNCLASSIFIED_ADMIN_ONLY_TABLES: string[] = [
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
  //    UNCLASSIFIED_ADMIN_ONLY_TABLES 어디에도 없어 403이 발생하던 테이블.
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
  // board_post_stars 는 아래에서 SELF_ONLY 로 명시 등록한다 (이 목록에 두면 ADMIN_ONLY 가 된다).
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

// ─────────────────────────────────────────────────────────────
// 7차 전수조사 후속 — 미분류 테이블 일괄 ADMIN_ONLY 강등 해소
//
// 아래 루프(`UNCLASSIFIED_ADMIN_ONLY_TABLES` → ADMIN_ONLY_ALL)는 예전 이름과 정반대로
// 85개 테이블을 관리자 전용으로 만들었고, 그중 54개를 살아있는 코드가 호출하고 있었다.
// 비관리자에게 SELECT 는 조용히 빈 배열, 쓰기는 403 이라 **기능이 에러 없이 죽어 있었다**
// (전자서명·할일·결재 양식 목록·증명서 발급·출결정정 등).
//
// 여기서 테이블별로 최소권한 정책을 명시 등록한다. 아래 루프는 `if (!POLICY_REGISTRY[t])`
// 가드가 있으므로 여기 등록된 것은 덮어쓰지 않는다.
// 명시하지 않은 것(access_logs / backup_restore_runs / message_templates /
// external_integrations / company_expenses / budget_settings / budget_executions)은
// 관리자 전용이 맞으므로 루프의 ADMIN_ONLY 를 그대로 둔다.
// ─────────────────────────────────────────────────────────────

// ── 본인 + 인사(STAFF_IN_SCOPE = 본인 OR admin OR 같은 회사 인사) ──
// filterByPolicy 에 배치 경로가 있어 전 직원 조회에서도 N+1 이 나지 않는다.
POLICY_REGISTRY['staff_licenses'] = {
  table: 'staff_licenses',
  select: 'STAFF_IN_SCOPE',
  insert: 'ADMIN_OR_MANAGER',
  update: 'ADMIN_OR_MANAGER',
  delete: 'ADMIN_OR_MANAGER',
  staffIdField: 'staff_id' };
// 증명서: 본인 발급 경로(모바일 cert-issue)가 있어 insert 는 본인도 가능해야 한다.
POLICY_REGISTRY['certificate_issuances'] = {
  table: 'certificate_issuances',
  select: 'STAFF_IN_SCOPE',
  insert: 'SELF_OR_SAME_COMPANY',
  update: 'ADMIN_OR_MANAGER',
  delete: 'ADMIN_ONLY',
  staffIdField: 'staff_id' };
POLICY_REGISTRY['health_checkups'] = {
  table: 'health_checkups',
  select: 'STAFF_IN_SCOPE',
  insert: 'ADMIN_OR_MANAGER',
  update: 'ADMIN_OR_MANAGER',
  delete: 'ADMIN_OR_MANAGER',
  staffIdField: 'staff_id',
  companyNameField: 'company' };
// 교육 이수/이력: 직원 본인이 이수 기록을 남기는 upsert 경로가 있어 insert+update 필요.
POLICY_REGISTRY['education_records'] = {
  table: 'education_records',
  select: 'STAFF_IN_SCOPE',
  insert: 'STAFF_IN_SCOPE',
  update: 'STAFF_IN_SCOPE',
  delete: 'ADMIN_OR_MANAGER',
  staffIdField: 'staff_id' };
POLICY_REGISTRY['education_completions'] = {
  table: 'education_completions',
  select: 'STAFF_IN_SCOPE',
  insert: 'STAFF_IN_SCOPE',
  update: 'STAFF_IN_SCOPE',
  delete: 'ADMIN_OR_MANAGER',
  staffIdField: 'staff_id' };
POLICY_REGISTRY['staff_trainings'] = {
  table: 'staff_trainings',
  select: 'STAFF_IN_SCOPE',
  insert: 'ADMIN_OR_MANAGER',
  update: 'ADMIN_OR_MANAGER',
  delete: 'ADMIN_ONLY',
  staffIdField: 'staff_id' };
// 출결정정: 직원 셀프서비스. 신청은 본인, 승인·수정은 인사.
POLICY_REGISTRY['attendance_corrections'] = {
  table: 'attendance_corrections',
  select: 'STAFF_IN_SCOPE',
  insert: 'SELF_OR_SAME_COMPANY',
  update: 'ADMIN_OR_MANAGER',
  delete: 'ADMIN_OR_MANAGER',
  staffIdField: 'staff_id' };
POLICY_REGISTRY['annual_leave_promotion_logs'] = {
  table: 'annual_leave_promotion_logs',
  select: 'STAFF_IN_SCOPE',
  insert: 'ADMIN_OR_MANAGER',
  update: 'ADMIN_OR_MANAGER',
  delete: 'ADMIN_ONLY',
  staffIdField: 'staff_id',
  companyNameField: 'company_name' };
POLICY_REGISTRY['personnel_appointments'] = {
  table: 'personnel_appointments',
  select: 'STAFF_IN_SCOPE',
  insert: 'ADMIN_OR_MANAGER',
  update: 'ADMIN_OR_MANAGER',
  delete: 'ADMIN_ONLY',
  staffIdField: 'staff_id',
  companyNameField: 'company' };
POLICY_REGISTRY['staff_transfer_history'] = {
  table: 'staff_transfer_history',
  select: 'STAFF_IN_SCOPE',
  insert: 'ADMIN_OR_MANAGER',
  update: 'ADMIN_OR_MANAGER',
  delete: 'ADMIN_ONLY',
  staffIdField: 'staff_id' };
POLICY_REGISTRY['work_type_change_history'] = {
  table: 'work_type_change_history',
  select: 'STAFF_IN_SCOPE',
  insert: 'ADMIN_OR_MANAGER',
  update: 'ADMIN_OR_MANAGER',
  delete: 'ADMIN_ONLY',
  staffIdField: 'staff_id' };
POLICY_REGISTRY['early_leave_records'] = {
  table: 'early_leave_records',
  select: 'STAFF_IN_SCOPE',
  insert: 'ADMIN_OR_MANAGER',
  update: 'ADMIN_OR_MANAGER',
  delete: 'ADMIN_ONLY',
  staffIdField: 'staff_id',
  companyNameField: 'company' };
// 문서보관함: 소유자 컬럼이 staff_id 가 아니라 created_by 다.
// 전자서명이 이 테이블에 선저장하는데 ADMIN_ONLY 라 403 → throw → 계약이 영구 '서명대기' 로
// 남던 장애의 원인. SELF_OR_SAME_COMPANY 를 쓰면 본인 문서는 항상 보이고,
// created_by 가 비어 있는 회사 공용 문서도 같은 회사 관리자에게는 보인다.
POLICY_REGISTRY['document_repository'] = {
  table: 'document_repository',
  select: 'SELF_OR_SAME_COMPANY',
  insert: 'SELF_OR_SAME_COMPANY',
  update: 'ADMIN_OR_MANAGER',
  delete: 'ADMIN_OR_MANAGER',
  staffIdField: 'created_by',
  companyNameField: 'company_name' };

// ── 개인 전용 (인사도 볼 이유 없음) — DB 조회 0건 ──
POLICY_REGISTRY['todos'] = {
  table: 'todos',
  select: 'SELF_ONLY',
  insert: 'SELF_ONLY',
  update: 'SELF_ONLY',
  delete: 'SELF_ONLY',
  staffIdField: 'user_id' };
POLICY_REGISTRY['chat_room_prefs'] = {
  table: 'chat_room_prefs',
  select: 'SELF_ONLY',
  insert: 'SELF_ONLY',
  update: 'SELF_ONLY',
  delete: 'SELF_ONLY',
  staffIdField: 'user_id' };
POLICY_REGISTRY['room_notification_settings'] = {
  table: 'room_notification_settings',
  select: 'SELF_ONLY',
  insert: 'SELF_ONLY',
  update: 'SELF_ONLY',
  delete: 'SELF_ONLY',
  staffIdField: 'user_id' };

// ── 채팅 부속 ──
// polls 에는 room_id 가 있어 방 멤버 스코프가 성립한다.
POLICY_REGISTRY['polls'] = {
  table: 'polls',
  select: 'CHAT_ROOM_MEMBER',
  insert: 'AUTHENTICATED',
  update: 'CHAT_ROOM_MEMBER',
  delete: 'SELF_ONLY',
  staffIdField: 'creator_id' };
// poll_votes: 익명 투표 보호를 위해 select는 SELF_ONLY로 제한 (전체 집계는 서버 전용 라우트 /api/chat/poll-votes 담당)
POLICY_REGISTRY['poll_votes'] = {
  table: 'poll_votes',
  select: 'SELF_ONLY',
  insert: 'SELF_ONLY',
  update: 'SELF_ONLY',
  delete: 'SELF_ONLY',
  staffIdField: 'user_id' };
// 회사 단위 드라이브 링크. 목록이 비면 클라이언트가 기본값을 자동 insert 하는 경로가 있어
// insert 는 AUTHENTICATED 로 둔다(서버 시딩으로 옮기면 ADMIN_OR_MANAGER 로 좁힐 수 있음).
POLICY_REGISTRY['messenger_drive_links'] = {
  table: 'messenger_drive_links',
  select: 'AUTHENTICATED',
  insert: 'AUTHENTICATED',
  update: 'ADMIN_OR_MANAGER',
  delete: 'ADMIN_OR_MANAGER',
  companyNameField: 'company_name' };

// ── 마스터/참조 데이터 — 읽기는 전 직원, 쓰기는 관리 ──
POLICY_REGISTRY['approval_form_types'] = {
  table: 'approval_form_types',
  select: 'AUTHENTICATED',
  insert: 'ADMIN_ONLY',
  update: 'ADMIN_ONLY',
  delete: 'ADMIN_ONLY',
  companyNameField: 'company_name' };
POLICY_REGISTRY['org_teams'] = {
  table: 'org_teams',
  select: 'AUTHENTICATED',
  insert: 'ADMIN_OR_MANAGER',
  update: 'ADMIN_OR_MANAGER',
  delete: 'ADMIN_OR_MANAGER',
  companyNameField: 'company_name' };
POLICY_REGISTRY['job_categories'] = {
  table: 'job_categories',
  select: 'AUTHENTICATED',
  insert: 'ADMIN_OR_MANAGER',
  update: 'ADMIN_OR_MANAGER',
  delete: 'ADMIN_OR_MANAGER' };
POLICY_REGISTRY['job_category_required_trainings'] = {
  table: 'job_category_required_trainings',
  select: 'AUTHENTICATED',
  insert: 'ADMIN_OR_MANAGER',
  update: 'ADMIN_OR_MANAGER',
  delete: 'ADMIN_OR_MANAGER' };
// 직군 매핑·근무유형 배정은 조직 공개 정보이고, 전 직원 매트릭스/시프트 해석이
// 타인 행을 읽어야 정상 동작한다(staff_members.select 가 PUBLIC 인 것과 같은 성격).
POLICY_REGISTRY['staff_job_categories'] = {
  table: 'staff_job_categories',
  select: 'AUTHENTICATED',
  insert: 'ADMIN_OR_MANAGER',
  update: 'ADMIN_OR_MANAGER',
  delete: 'ADMIN_OR_MANAGER',
  staffIdField: 'staff_id' };
POLICY_REGISTRY['staff_shift_assignments'] = {
  table: 'staff_shift_assignments',
  select: 'AUTHENTICATED',
  insert: 'ADMIN_OR_MANAGER',
  update: 'ADMIN_OR_MANAGER',
  delete: 'ADMIN_OR_MANAGER',
  staffIdField: 'staff_id' };
POLICY_REGISTRY['shift_assignments'] = {
  table: 'shift_assignments',
  select: 'AUTHENTICATED',
  insert: 'ADMIN_OR_MANAGER',
  update: 'ADMIN_OR_MANAGER',
  delete: 'ADMIN_OR_MANAGER',
  staffIdField: 'staff_id',
  companyNameField: 'company_name' };
POLICY_REGISTRY['surgery_templates'] = {
  table: 'surgery_templates',
  select: 'AUTHENTICATED',
  insert: 'ADMIN_ONLY',
  update: 'ADMIN_ONLY',
  delete: 'ADMIN_ONLY' };
POLICY_REGISTRY['mri_templates'] = {
  table: 'mri_templates',
  select: 'AUTHENTICATED',
  insert: 'ADMIN_ONLY',
  update: 'ADMIN_ONLY',
  delete: 'ADMIN_ONLY' };
POLICY_REGISTRY['suppliers'] = {
  table: 'suppliers',
  select: 'AUTHENTICATED',
  insert: 'ADMIN_OR_MANAGER',
  update: 'ADMIN_OR_MANAGER',
  delete: 'ADMIN_OR_MANAGER' };
POLICY_REGISTRY['inventory_categories'] = {
  table: 'inventory_categories',
  select: 'AUTHENTICATED',
  insert: 'ADMIN_OR_MANAGER',
  update: 'ADMIN_OR_MANAGER',
  delete: 'ADMIN_OR_MANAGER' };
POLICY_REGISTRY['medical_devices'] = {
  table: 'medical_devices',
  select: 'AUTHENTICATED',
  insert: 'ADMIN_OR_MANAGER',
  update: 'ADMIN_OR_MANAGER',
  delete: 'ADMIN_OR_MANAGER' };
POLICY_REGISTRY['device_inspections'] = {
  table: 'device_inspections',
  select: 'AUTHENTICATED',
  insert: 'ADMIN_OR_MANAGER',
  update: 'ADMIN_OR_MANAGER',
  delete: 'ADMIN_OR_MANAGER' };
// 휴가·복리후생 규정은 직원이 알아야 하는 내용이므로 읽기 개방.
POLICY_REGISTRY['leave_policies'] = {
  table: 'leave_policies',
  select: 'AUTHENTICATED',
  insert: 'ADMIN_OR_MANAGER',
  update: 'ADMIN_OR_MANAGER',
  delete: 'ADMIN_ONLY',
  companyNameField: 'company' };
POLICY_REGISTRY['company_welfare_policies'] = {
  table: 'company_welfare_policies',
  select: 'AUTHENTICATED',
  insert: 'ADMIN_OR_MANAGER',
  update: 'ADMIN_OR_MANAGER',
  delete: 'ADMIN_ONLY',
  companyNameField: 'company_name' };
// 근태 차감 규칙: 직원이 차감 근거를 확인할 수 있어야 하고, 인사 급여정산도 읽는다.
POLICY_REGISTRY['attendance_deduction_rules'] = {
  table: 'attendance_deduction_rules',
  select: 'AUTHENTICATED',
  insert: 'ADMIN_ONLY',
  update: 'ADMIN_ONLY',
  delete: 'ADMIN_ONLY',
  companyNameField: 'company_name' };

// ── 현장 공유 화면 (팀 단위 열람이 업무 전제) ──
POLICY_REGISTRY['handover_notes'] = {
  table: 'handover_notes',
  select: 'AUTHENTICATED',
  insert: 'AUTHENTICATED',
  update: 'SELF_ONLY',
  delete: 'SELF_ONLY',
  staffIdField: 'author_id' };
// discharge_reviews: 환자 PHI(이름·생년월일·진단명·수술기록) 보호를 위해 company_id 스코프 강제
POLICY_REGISTRY['discharge_reviews'] = {
  table: 'discharge_reviews',
  select: 'COMPANY_SCOPE_OR_NULL',
  insert: 'COMPANY_SCOPE_OR_NULL',
  update: 'COMPANY_SCOPE_OR_NULL',
  delete: 'ADMIN_OR_MANAGER',
  companyIdField: 'company_id',
  staffIdField: 'reviewer_id' };
// 템플릿 편집이 일반 심사 화면에서 일어나므로 insert/update 는 열어 둔다.
POLICY_REGISTRY['discharge_templates'] = {
  table: 'discharge_templates',
  select: 'AUTHENTICATED',
  insert: 'AUTHENTICATED',
  update: 'AUTHENTICATED',
  delete: 'ADMIN_OR_MANAGER' };
// 사고 신고는 전 직원이 할 수 있어야 하고, 수정·삭제는 인사가 관리.
POLICY_REGISTRY['incident_reports'] = {
  table: 'incident_reports',
  select: 'AUTHENTICATED',
  insert: 'AUTHENTICATED',
  update: 'ADMIN_OR_MANAGER',
  delete: 'ADMIN_OR_MANAGER',
  staffIdField: 'reporter_id' };

// ── 인사 전용(민감) — ADMIN_ONLY 로는 인사팀(perms.hr)이 막히므로 ADMIN_OR_MANAGER ──
POLICY_REGISTRY['company_payroll_policies'] = {
  table: 'company_payroll_policies',
  select: 'ADMIN_OR_MANAGER',
  insert: 'ADMIN_OR_MANAGER',
  update: 'ADMIN_OR_MANAGER',
  delete: 'ADMIN_ONLY',
  companyNameField: 'company_name' };
POLICY_REGISTRY['congratulations_condolences'] = {
  table: 'congratulations_condolences',
  select: 'ADMIN_OR_MANAGER',
  insert: 'ADMIN_OR_MANAGER',
  update: 'ADMIN_OR_MANAGER',
  delete: 'ADMIN_OR_MANAGER',
  companyNameField: 'company' };
// 급여 정보(salary 컬럼) 포함 → 인사 이상만.
POLICY_REGISTRY['generated_contracts'] = {
  table: 'generated_contracts',
  select: 'ADMIN_OR_MANAGER',
  insert: 'ADMIN_OR_MANAGER',
  update: 'ADMIN_OR_MANAGER',
  delete: 'ADMIN_ONLY',
  staffIdField: 'staff_id',
  companyNameField: 'company_name' };

// ── 재무 ──
// FINANCE_SCOPE = finance 권한 + 회사 스코프. 이 패턴이 없던 시절에는 finance_* 권한이
// claim 으로 변환되지 않아 재무 담당자가 자기 화면 데이터를 전혀 읽지 못했다.
POLICY_REGISTRY['journal_entries'] = {
  table: 'journal_entries',
  select: 'FINANCE_SCOPE',
  insert: 'FINANCE_SCOPE',
  update: 'FINANCE_SCOPE',
  delete: 'ADMIN_ONLY',
  companyIdField: 'company_id' };
POLICY_REGISTRY['fixed_assets'] = {
  table: 'fixed_assets',
  select: 'FINANCE_SCOPE',
  insert: 'FINANCE_SCOPE',
  update: 'FINANCE_SCOPE',
  delete: 'ADMIN_ONLY',
  companyIdField: 'company_id' };
// 계좌번호를 담고 있어 쓰기는 관리자만.
POLICY_REGISTRY['bank_accounts_sync'] = {
  table: 'bank_accounts_sync',
  select: 'FINANCE_SCOPE',
  insert: 'ADMIN_ONLY',
  update: 'ADMIN_ONLY',
  delete: 'ADMIN_ONLY',
  companyIdField: 'company_id' };
// 환자명·계좌번호가 들어 있고 회사 UUID 로 격리 가능. 입금 수신은 서버 웹훅이라 쓰기는 관리자만.
POLICY_REGISTRY['virtual_account_deposits'] = {
  table: 'virtual_account_deposits',
  select: 'MANAGE_COMPANY',
  insert: 'ADMIN_ONLY',
  update: 'ADMIN_ONLY',
  delete: 'ADMIN_ONLY',
  companyIdField: 'company_id' };


for (const tableName of UNCLASSIFIED_ADMIN_ONLY_TABLES) {
  if (!POLICY_REGISTRY[tableName]) {
    // 자동 PUBLIC_ALL 부여 제거 — 미등록 테이블은 Default Deny (ADMIN_ONLY 또는 403)
    POLICY_REGISTRY[tableName] = ADMIN_ONLY_ALL(tableName);
  }
}

// 민감·원장·시스템 설정 — PUBLIC_ALL 컷오버 완화분을 축소
const SENSITIVE_STAFF_SCOPED: string[] = [
  'leave_balances',
  'leave_accruals',
  // leave_ledger 가 빠져 있어 레지스트리 미등록 상태였다. /api/d1/query 는 미등록
  // 테이블을 화이트리스트에서 거부하므로 admin 을 포함한 전원이 403 이었고,
  // 연차원장 계열 화면은 오류 대신 "잔여 0일" 로 보였다 — 조회 실패가 데이터로 둔갑했다.
  // 잔액·발생과 같은 성격(본인+회사 범위 열람, 인사 쓰기)이라 같은 패턴을 준다.
  'leave_ledger',
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
  'op_consultations',
  'password_reset_tokens',
];

// 게시판 별표(즐겨찾기)는 전적으로 개인 상태다.
// 미분류 목록에 있어 ADMIN_ONLY 였고, 일반 직원의 별표 토글이 403 으로 막혔다.
// 본인 행만 다루도록 등록한다.
POLICY_REGISTRY.board_post_stars = {
  table: 'board_post_stars',
  select: 'SELF_ONLY',
  insert: 'SELF_ONLY',
  update: 'SELF_ONLY',
  delete: 'SELF_ONLY',
  staffIdField: 'user_id',
};

// 감사로그: 열람은 관리자만, **기록은 행위자 누구나**.
//
// ADMIN_ONLY 로 묶여 있던 탓에 비관리자 인사 권한자가 수행한 작업은 감사 기록이
// 403 으로 전부 버려졌다. 정작 남겨야 할 사람의 흔적이 남지 않은 것이다.
// 감사로그는 append-only 가 원칙이므로 수정·삭제는 관리자로 유지한다.
//
// 남은 문제: 행위자(user_id/user_name)를 클라이언트가 보낼 수 있다(8차 D08-006).
// 서버 세션에서 강제 주입하는 것이 옳고, 그 작업은 FB10(서버 권위 이전) 소관이다.
// 지금은 "기록이 아예 없는 상태" 보다 "기록은 남되 행위자 위조 여지가 있는 상태" 가 낫다.
POLICY_REGISTRY.audit_logs = {
  table: 'audit_logs',
  select: 'ADMIN_ONLY',
  insert: 'AUTHENTICATED',
  update: 'ADMIN_ONLY',
  delete: 'ADMIN_ONLY',
};

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

  /**
   * 행의 회사가 내 회사인지 — UUID 컬럼과 이름 컬럼을 모두 인정한다.
   *
   * companyIdField 만 보던 시절에는, 회사를 이름 문자열로만 들고 있는 테이블(24개)에서
   * 비관리자에게 항상 false 가 되어 회사 스코프를 아예 걸 수 없었다.
   * 둘 중 하나라도 일치하면 통과. 둘 다 값이 없으면 판단 불가로 false.
   */
  const rowCompanyMatches = (): boolean => {
    const byId = getField<string>(row, companyField);
    if (byId !== null && erpCompanyMatches(claims, byId)) return true;
    if (cfg.companyNameField) {
      const byName = getField<string>(row, cfg.companyNameField);
      if (byName !== null && erpCompanyNameMatches(claims, byName)) return true;
    }
    return false;
  };

  /** 회사 컬럼이 아예 비어 있는가(=전사 공용 행) */
  const rowCompanyIsNull = (): boolean => {
    if (getField<string>(row, companyField) !== null) return false;
    if (cfg.companyNameField && getField<string>(row, cfg.companyNameField) !== null) return false;
    return true;
  };

  if (pattern === 'SELF_ONLY') {
    const rowStaff = getField<string>(row, staffField);
    return rowStaff !== null && rowStaff === erpStaffId(claims);
  }

  if (pattern === 'ADMIN_OR_MANAGER') {
    if (!erpCanManageCompany(claims)) return false;
    if (erpIsAdmin(claims)) return true;
    if (rowCompanyIsNull()) return true;
    return rowCompanyMatches();
  }

  if (pattern === 'MANAGE_COMPANY') {
    if (!erpCanManageCompany(claims)) return false;
    return rowCompanyMatches();
  }

  if (pattern === 'MANAGE_COMPANY_OR_NULL') {
    if (!erpCanManageCompany(claims)) return false;
    if (rowCompanyIsNull()) return true;
    return rowCompanyMatches();
  }

  if (pattern === 'FINANCE_SCOPE') {
    // 재무 데이터(분개장·고정자산·금융연동). finance 권한 보유자 + 회사 스코프.
    // 이 패턴이 없던 시절에는 finance_* 권한이 claim 으로 변환되지 않아
    // 재무 담당자가 정책 레이어에서 일반 직원 취급을 받아 접근 자체가 불가능했다.
    if (!erpCanManageFinance(claims)) return false;
    if (rowCompanyIsNull()) return true;
    return rowCompanyMatches();
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
    return rowCompanyMatches();
  }

  if (pattern === 'STAFF_IN_SCOPE') {
    const rowStaff = getField<string>(row, staffField);
    if (rowStaff === null) return false;
    return erpTargetStaffInScope(db, claims, rowStaff);
  }

  if (pattern === 'SAME_COMPANY_TEAM_VISIBLE') {
    // 단건 판정 — 실제 select 는 filterByPolicy 의 배치 경로가 처리한다.
    const rowStaff = getField<string>(row, staffField);
    if (rowStaff === null) return false;
    if (rowStaff === erpStaffId(claims)) return true;
    const myCompany = String(erpCompanyName(claims) ?? '').trim();
    if (erpCanManageCompany(claims) || myCompany === 'SY INC.' || myCompany === 'SY' || erpIsAdmin(claims)) return true;
    if (cfg.table === 'attendances' || cfg.table === 'attendance') return true;
    return erpTargetStaffSameCompany(db, claims, rowStaff);
  }

  if (pattern === 'COMPANY_SCOPE_OR_NULL') {
    if (rowCompanyIsNull()) return true;
    return rowCompanyMatches();
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
    return rowCompanyMatches();
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
  /**
   * 패턴(SELF_ONLY / APPROVAL_SCOPE / INVENTORY_SCOPE …) 판정에 쓰이는 행.
   *
   * update/delete 에서는 **변경 전 DB 정본**이어야 한다. "이 행을 건드릴 자격이 있는가"는
   * 기존 상태로 판단해야 하며, 클라이언트가 보낸 새 값으로 판단하면
   * `set:{current_approver_id: 내id}` 같은 값으로 소유권을 위조할 수 있다.
   */
  row: Record<string, unknown>;
  /**
   * 컬럼 단위 가드에 넘길 행. 미지정 시 row 를 쓴다.
   *
   * 가드는 패턴과 반대로 **변경 후 상태**를 봐야 하는 경우가 있다
   * (예: leaveRequestUpdateGuard 는 본인이 status 를 '승인' 으로 바꾸는 것을 막는다).
   * 따라서 호출부는 `{...DB정본, ...set}` 을 넘긴다.
   */
  guardRow?: Record<string, unknown>;
  /**
   * 이번 mutation 이 실제로 변경하는 컬럼 집합(update=set 키, insert=values 키).
   * guardRow 에 DB 정본이 병합된 경우 컬럼 단위 가드가 오탐하지 않도록 반드시 전달할 것.
   */
  changedKeys?: ReadonlySet<string>;
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
  // 가드는 패턴과 달리 **변경 후 상태**를 봐야 하므로 guardRow 를 쓴다.
  const guardRow = args.guardRow ?? args.row;
  const guard = cfg.guards?.[args.op];
  if (guard && !guard(args.claims, guardRow, args.changedKeys)) return false;
  // 비동기 행 단위 가드 (예: messages soft-delete 소유자 확인 — DB 조회 필요)
  const asyncGuard = cfg.asyncGuards?.[args.op];
  if (asyncGuard && !(await asyncGuard(args.db, args.claims, guardRow, args.changedKeys))) {
    return false;
  }
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
 * message id 묶음의 room_id 를 한 번에 다시 읽는다 (배치).
 *
 * select 컬럼에 room_id 가 없을 때만 쓰인다. 행마다 조회하면 100건짜리 대화 목록에서
 * 요청당 100 왕복이 되므로 100개씩 IN 으로 묶는다(D1 은 쿼리 1건당 bound parameter 100개 제한).
 */
async function loadMessageRoomIdsBatch(
  db: D1Client,
  messageIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = Array.from(new Set(messageIds.filter((id) => id !== '')));
  if (unique.length === 0) return out;

  const CHUNK = 100;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const found = await db
      .select({ id: messages.id, room_id: messages.room_id })
      .from(messages)
      .where(inArray(messages.id, chunk));
    for (const row of found) {
      const rid = String(row.room_id ?? '').trim();
      if (rid !== '') out.set(String(row.id), rid);
    }
  }
  return out;
}

/**
 * messages SELECT — room_id 별 멤버십 1회 조회 후 필터 (N+1 방지).
 *
 * **room_id 가 select 컬럼에 없으면 id 로 다시 로드한다.** 이 폴백이 없던 시절에는
 * `String(r.room_id ?? '')` 가 전 행에서 '' 가 되어 allowed 집합이 비고, 결과가
 * **조용히 빈 배열**이었다 — 오류도 로그도 없이 "과거 대화가 통째로 사라진" 것처럼 보였다
 * (모바일 채팅 P0). 그때는 호출부(select 에 room_id 추가)를 고쳐 닫았지만, 다음에 누가
 * room_id 없이 messages 를 조회하면 같은 일이 그대로 다시 난다 — 그래서 여기서 막는다.
 * 바로 아래 filterChatRoomsByMembership 이 members 없을 때 id 로 다시 읽는 것과 같은 방식이다.
 *
 * 폴백해도 room_id 를 못 찾은 행(id 가 없거나 그 id 의 행이 DB 에 없음)은 기존대로 거부한다 —
 * 판정 근거가 없는 행을 열어 주면 안 된다.
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

  // room_id 가 비어 있는 행만 id 로 되찾는다 — 정상 경로(room_id 포함)는 추가 쿼리가 0건이다.
  const idsNeedingRoom: string[] = [];
  for (const r of rows) {
    if (String(r.room_id ?? '').trim() !== '') continue;
    const id = String(r.id ?? '').trim();
    if (id !== '') idsNeedingRoom.push(id);
  }
  const roomIdByMessageId =
    idsNeedingRoom.length > 0
      ? await loadMessageRoomIdsBatch(db, idsNeedingRoom)
      : new Map<string, string>();

  const roomIdOf = (r: T): string => {
    const direct = String(r.room_id ?? '').trim();
    if (direct !== '') return direct;
    const id = String(r.id ?? '').trim();
    if (id === '') return '';
    return roomIdByMessageId.get(id) ?? '';
  };

  const roomIds = [...new Set(rows.map(roomIdOf).filter(Boolean))];
  const allowed = new Set<string>();
  await Promise.all(
    roomIds.map(async (rid) => {
      const room = await loadChatRoomMembership(db, rid);
      if (room && canAccessChatRoom(room, me)) allowed.add(rid);
    }),
  );
  return rows.filter((r) => {
    const rid = roomIdOf(r);
    return rid !== '' && allowed.has(rid);
  });
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
/**
 * 응답에서 항상 제거되는 staff_members 컬럼.
 *
 * 주의: 응답 마스킹만으로는 부족하다. `where`/`order`/`count` 로 이 컬럼을 참조하면
 * 결과 유무·개수가 오라클이 되어 값을 이분탐색으로 복원할 수 있다.
 * 따라서 /api/d1/query 가 이 집합을 필터·정렬 필드에서도 차단한다
 * (app/api/d1/query/route.ts assertNoSensitiveFieldAccess).
 */
export const STAFF_SECRET_ALWAYS_COLUMNS = new Set(['password', 'passwd']);
/**
 * 관리자·본인만 볼 수 있는 컬럼.
 *
 * 권한 자체를 드러내는 값이라 인사담당자에게도 열지 않는다. 쓰기 쪽
 * PRIVILEGED_STAFF_COLUMNS 와 같은 등급이다.
 */
const STAFF_ADMIN_ONLY_COLUMNS = new Set([
  'permissions',
  'is_admin',
  'is_master',
]);

/**
 * 관리자·**인사(회사 관리 권한)**·본인이 볼 수 있는 PII.
 *
 * 예전에는 아래 컬럼이 전부 "관리자 또는 본인" 이었다. 그런데 쓰기 가드
 * (SENSITIVE_STAFF_COLUMNS)는 같은 컬럼을 인사담당자에게 이미 열어두고 있었다.
 * 그래서 인사담당자가 **급여를 고칠 수는 있는데 볼 수는 없는** 상태가 됐고,
 * 급여정산·4대보험 화면에서 타 직원 급여가 통째로 비어 보였다. 읽기 등급을
 * 쓰기 등급에 맞춰 그 어긋남을 없앤다.
 */
const STAFF_HR_VISIBLE_PII_COLUMNS = new Set([
  'resident_no',
  'account_number',
  'bank_name',
  'bank_account',
  'salary_info',
  'base_salary',
  'hourly_rate',
  // 급여 본체(base_salary)만 가리고 **수당은 통째로 열려 있었다**(10차 D1GW-05).
  // lib/staff-query-columns.ts 의 STAFF_BOOTSTRAP_COLUMNS 가 이 컬럼들을 그대로
  // 나열하고 PC 메인 진입 때마다 전 직원분을 받아오므로, 조작된 호출도 필요 없이
  // 평사원 브라우저 응답에 동료의 야간당직수당·차량유지비·연차수당 금액이 들어 있었다.
  // 쓰기 가드(SENSITIVE_STAFF_COLUMNS)는 같은 값을 이미 매니저 이상으로 막고 있어
  // 읽기 등급만 어긋나 있었다.
  //
  // 회귀: 이 컬럼들을 읽는 화면(인사관리·급여명세·계약서 렌더)은 **예외 없이
  // base_salary 도 함께 읽는다**(2026-08-27 전수 확인). 즉 base_salary 마스킹으로
  // 이미 인사 등급이 필요한 화면들이라, 같은 등급에 얹어도 새로 깨지는 화면이 없다.
  // 본인 조회(isSelf)와 인사(canManageCompany)는 그대로 통과한다 —
  // 마이페이지 급여명세서는 본인 행이라 영향이 없다.
  'salary',
  'other_taxfree',
  'position_allowance',
  'overtime_allowance',
  'night_work_allowance',
  'holiday_work_allowance',
  'annual_leave_pay',
  'meal_allowance',
  'night_duty_allowance',
  'vehicle_allowance',
  'childcare_allowance',
  'research_allowance',
  'address',
  'detail_address',
  'salary_type',
  'national_pension',
  'health_insurance',
  'employment_insurance',
  'long_term_care',
  'birth_date',
]);

/**
 * phone·email 은 왜 위 목록에 없나.
 *
 * 사내 주소록 항목이다. 구성원 카드가 이름 옆에 연락처·이메일·내선을 함께
 * 보여주고(인사관리서브/구성원현황), 그건 직원끼리 서로 연락하라고 있는 값이다.
 * 마스킹 목록에 넣었더니 일반 직원에게 주소록이 통째로 빈 칸이 됐다.
 *
 * 열람 범위는 여전히 로그인한 직원까지다 — /api/d1/query 가 세션 없는 요청을
 * 401 로 막는다. 값이 누구에게나 보이므로 where/order 오라클도 성립하지 않아
 * 아래 필터 차단 합집합에서도 뺀다(막아봐야 검색만 깨진다).
 */

/**
 * 필터·정렬 차단용 합집합.
 *
 * 등급과 무관하게 전부 막는다 — where/order 로 참조하면 결과 유무가 오라클이
 * 되어 값을 이분탐색으로 복원할 수 있고, 그건 열람 권한과 별개의 문제다.
 */
export const STAFF_PII_SENSITIVE_COLUMNS = new Set([
  ...STAFF_HR_VISIBLE_PII_COLUMNS,
  ...STAFF_ADMIN_ONLY_COLUMNS,
]);

function stripStaffSecrets<T extends Record<string, unknown>>(rows: T[], claims?: ErpClaims): T[] {
  const isAdmin = claims ? erpIsAdmin(claims) : false;
  const canManageCompany = claims ? erpCanManageCompany(claims) : false;
  const myStaffId = claims ? String(erpStaffId(claims) || '').trim() : '';

  return rows.map((row) => {
    const next = { ...row };
    for (const col of STAFF_SECRET_ALWAYS_COLUMNS) {
      if (col in next) delete next[col];
    }

    const rowId = String(next.id || next.staff_id || '').trim();
    const isSelf = myStaffId !== '' && rowId === myStaffId;
    if (isAdmin || isSelf) return next;

    // 권한 컬럼은 인사담당자에게도 감춘다.
    for (const col of STAFF_ADMIN_ONLY_COLUMNS) {
      if (col in next) delete next[col];
    }

    // 급여·계좌·주민번호 등은 인사(회사 관리 권한)까지 열어준다.
    // 쓰기 가드가 이미 같은 등급으로 열려 있어, 읽기만 막으면 "고칠 수는
    // 있는데 볼 수는 없는" 상태가 된다 — 보호가 되지도 않고 화면만 깨진다.
    if (!canManageCompany) {
      for (const col of STAFF_HR_VISIBLE_PII_COLUMNS) {
        if (col in next) delete next[col];
      }
    }

    return next;
  });
}

/**
 * SAME_COMPANY_TEAM_VISIBLE 테이블별 노출 범위.
 *
 * **넓히는 방향의 수정이라 "무엇을 열지"가 아니라 "무엇을 계속 가릴지"를 여기에 적는다.**
 * 동료에게 보여도 되는 것: 출근 여부·출퇴근 시각·근무 상태·연차 종류와 기간.
 * 열면 안 되는 것: 근태 메모(notes)와 휴가 사유(reason) — 병가 사유·개인 사정이 들어간다.
 *
 * `allowedStatusesForOthers` 는 남의 행 중 **확정된 것만** 남긴다. 이 값이 없으면
 * 공유캘린더가 동료의 반려·회수·대기 연차까지 보여 주게 되어(운영 실측 반려 3·회수 2·대기 1)
 * 지금까지 안 보이던 개인 정보가 새로 노출된다.
 *
 * 본인 행과 인사(erp_can_manage_company)·관리자는 이 축소를 받지 않는다 —
 * 마이페이지·인사관리 화면의 기존 동작이 그대로여야 한다.
 */
const TEAM_VISIBLE_TABLE_RULES: Record<
  string,
  { maskedColumnsForOthers: readonly string[]; allowedStatusesForOthers?: ReadonlySet<string> }
> = {
  attendance: { maskedColumnsForOthers: ['notes'] },
  attendances: { maskedColumnsForOthers: ['notes'] },
  leave_requests: {
    maskedColumnsForOthers: ['reason'],
    allowedStatusesForOthers: new Set(['승인', '완료']) },
};

/**
 * staff id 묶음 중 **나와 같은 회사** 인 것만 골라낸다 (배치).
 *
 * 판정 규칙은 erpTargetStaffSameCompany 와 같다(company_id UUID 우선, 없으면 회사명 폴백 —
 * 운영 staff_members.company_id 는 대부분 비어 있어 UUID 단독으로는 성립하지 않는다).
 * 다른 점은 erpCanManageCompany 를 요구하지 않는다는 것뿐이다.
 * 행마다 조회하면 전 직원 화면에서 요청당 수십 쿼리가 되므로 100개씩 IN 으로 묶는다.
 */
async function sameCompanyStaffIdsBatch(
  db: D1Client,
  claims: ErpClaims,
  targetStaffIds: string[],
): Promise<Set<string>> {
  const allowed = new Set<string>();
  if (targetStaffIds.length === 0) return allowed;

  const myId = erpCompanyId(claims);
  const myName = erpCompanyName(claims);
  if (myId === null && myName === null) return allowed;
  const myNameTrimmed = myName === null ? null : myName.trim();

  const unique = Array.from(new Set(targetStaffIds.filter((id) => typeof id === 'string' && id !== '')));
  const CHUNK = 100; // D1 은 쿼리 1건당 bound parameter 100개 제한
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const rows = await db
      .select({
        id: staff_members.id,
        company_id: staff_members.company_id,
        company: staff_members.company })
      .from(staff_members)
      .where(inArray(staff_members.id, chunk));
    for (const row of rows) {
      if (myId !== null && row.company_id != null && String(row.company_id) === myId) {
        allowed.add(row.id);
        continue;
      }
      if (myNameTrimmed !== null && row.company != null && String(row.company).trim() === myNameTrimmed) {
        allowed.add(row.id);
      }
    }
  }
  return allowed;
}

/**
 * SAME_COMPANY_TEAM_VISIBLE 배치 필터.
 *
 * 이 경로가 없던 시절에는 attendance/attendances 가 STAFF_IN_SCOPE·SELF_OR_SAME_COMPANY 라
 * 비관리자에게 **본인 행만** 남았다. 그래서 근무현황의 '현재 근무중' 이 실제로 21명이
 * 근무 중인 날에도 "출근한 직원이 없습니다" 로 뜨고 조직도의 출근 표시가 통째로 비었다
 * (10차 D1GW-01). 공유캘린더도 같은 이유로 동료 연차가 하나도 안 찍혔다(D1GW-02).
 * 오류 토스트가 없고 관리자 화면에서는 정상이라 신고가 원인에 도달하지 못했다.
 */
async function filterTeamVisibleRows<T extends Record<string, unknown>>(
  db: D1Client,
  claims: ErpClaims,
  table: string,
  cfg: TablePolicy,
  rows: T[],
): Promise<T[]> {
  if (rows.length === 0) return rows;

  const rule = TEAM_VISIBLE_TABLE_RULES[table];
  const staffField = cfg.staffIdField ?? 'staff_id';
  const me = erpStaffId(claims);
  const canManageCompany = erpCanManageCompany(claims);
  const myCompany = String(erpCompanyName(claims) ?? '').trim();
  const isMso = myCompany === 'SY INC.' || myCompany === 'SY' || erpIsAdmin(claims);

  const otherStaffIds: string[] = [];
  for (const row of rows) {
    const v = getField<string>(row, staffField);
    if (v !== null && v !== me) otherStaffIds.push(v);
  }
  const sameCompany = otherStaffIds.length > 0
    ? await sameCompanyStaffIdsBatch(db, claims, otherStaffIds)
    : new Set<string>();

  const out: T[] = [];
  for (const row of rows) {
    const rowStaff = getField<string>(row, staffField);
    // staff 필드가 비어 있으면 기존 패턴과 동일하게 거부한다.
    if (rowStaff === null) continue;
    if (me !== null && rowStaff === me) {
      out.push(row);
      continue;
    }
    // 1. 인사관리자(canManageCompany) 또는 MSO본부(SY INC.)인 경우 전체 회사 직원 레코드 허용
    // 2. 출퇴근 현황/달력(attendances, attendance) 조회 시 전사 출근 상태 가시성 제공 (비관리자는 notes 마스킹)
    if (canManageCompany || isMso || table === 'attendances' || table === 'attendance') {
      const masked = { ...row };
      if (!canManageCompany && rule?.maskedColumnsForOthers) {
        for (const col of rule.maskedColumnsForOthers) {
          if (col in masked) delete masked[col];
        }
      }
      out.push(masked);
      continue;
    }

    if (!sameCompany.has(rowStaff)) continue;
    if (!rule) continue;
    if (rule.allowedStatusesForOthers) {
      const status = String(getField<string>(row, 'status') ?? '').trim();
      if (!rule.allowedStatusesForOthers.has(status)) continue;
    }
    const masked = { ...row };
    for (const col of rule.maskedColumnsForOthers) {
      if (col in masked) delete masked[col];
    }
    out.push(masked);
  }
  return out;
}

/**
 * daily_closure_items 를 부모 마감보고의 회사로 거른다 (배치).
 * closure_id 를 모아 부모를 한 번에 조회하므로 쿼리는 1건이다.
 */
async function filterDailyClosureItemsByCompany<T extends Record<string, unknown>>(
  db: D1Client,
  claims: ErpClaims,
  rows: T[],
): Promise<T[]> {
  if (rows.length === 0) return rows;

  const closureIds = [
    ...new Set(
      rows
        .map((row) => getField<string>(row, 'closure_id'))
        .filter((v): v is string => v !== null && v.trim() !== ''),
    ),
  ];
  if (closureIds.length === 0) return [];

  const parents = await db
    .select({ id: daily_closures.id, company_id: daily_closures.company_id })
    .from(daily_closures)
    .where(inArray(daily_closures.id, closureIds));

  const companyByClosure = new Map<string, string | null>();
  for (const p of parents) companyByClosure.set(String(p.id), p.company_id ?? null);

  return rows.filter((row) => {
    const closureId = getField<string>(row, 'closure_id');
    if (closureId === null) return false;
    if (!companyByClosure.has(closureId)) return false; // 부모를 못 찾으면 열지 않는다
    const companyId = companyByClosure.get(closureId) ?? null;
    // 부모 정책(COMPANY_SCOPE_OR_NULL)과 같은 기준 — 회사가 비면 전사 공용.
    if (companyId === null || companyId.trim() === '') return true;
    return erpCompanyMatches(claims, companyId);
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
  // 마감보고 하위 항목은 부모의 회사 스코프를 따른다.
  // 이 테이블에는 company_id 가 없어 패턴으로 표현할 수 없고, select 는 배치 경로라
  // asyncGuards 를 거치지 않는다(아래 AUTHENTICATED 단축 반환). 그래서 여기서
  // 부모 회사 id 를 한 번에 모아 메모리에서 거른다 — 행마다 조회하면 N+1 이 된다.
  if (table === 'daily_closure_items' && !erpIsAdmin(claims)) {
    return filterDailyClosureItemsByCompany(db, claims, rows);
  }

  if (cfg.select === 'AUTHENTICATED') {
    const ok = erpStaffId(claims) !== null ? rows : [];
    return stripSecrets ? stripStaffSecrets(ok as T[], claims) : ok;
  }
  if (erpIsAdmin(claims)) {
    return stripSecrets ? stripStaffSecrets(rows, claims) : rows;
  }

  // 근태·휴가 동료 가시성 — 배치 평가 (행마다 회사 조회하면 N+1 이 된다)
  if (cfg.select === 'SAME_COMPANY_TEAM_VISIBLE') {
    return filterTeamVisibleRows(db, claims, table, cfg, rows);
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

  // STAFF_IN_SCOPE 배치 평가 — 행마다 erpTargetStaffInScope 를 부르면 비본인 행 1건당
  // D1 쿼리 1건이 나가 전 직원 조회 화면에서 요청당 수백 쿼리가 됐다.
  // 대상 staff id 를 모아 한 번에 스코프를 구한 뒤 메모리에서 필터한다.
  if (cfg.select === 'STAFF_IN_SCOPE') {
    const staffField = cfg.staffIdField ?? 'staff_id';
    const targets = new Set<string>();
    for (const row of rows) {
      const v = getField<string>(row, staffField);
      if (v !== null) targets.add(v);
    }
    const allowed = await erpTargetStaffInScopeBatch(db, claims, [...targets]);
    const scoped = rows.filter((row) => {
      const v = getField<string>(row, staffField);
      // 단건 경로와 동일하게, staff 필드가 비어 있으면 거부한다.
      return v !== null && allowed.has(v);
    });
    return stripSecrets ? stripStaffSecrets(scoped, claims) : scoped;
  }

  const out: T[] = [];
  for (const row of rows) {
    const ok = await evalPattern(cfg.select, db, claims, row, cfg);
    if (ok) out.push(row);
  }
  return stripSecrets ? stripStaffSecrets(out, claims) : out;
}
