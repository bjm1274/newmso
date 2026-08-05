import {
  appendApprovalHistory,
  getApprovalRevision,
  lockApprovalMeta } from '@/lib/approval-workflow';
import { hasPermission } from '@/lib/access-control';
import { notificationMatchesApprovalId } from '@/lib/notification-metadata';
import { processFinalApprovalEffects } from '@/lib/server-approval-processing';
import {
  normalizeApprovalLineIds,
  resolveStoredCurrentApproverId,
  resolveEffectiveApproverIdCore,
  buildApprovalHistoryEntryCore } from '@/lib/approval-shared';
import {
  approvals as approvalsTable,
  staff_members as staffMembersTable,
  notifications as notificationsTable,
  eq,
  inArray,
  getD1Binding,
  getD1Drizzle } from '@/lib/db';
import { insertNotificationsOrThrow, type NotificationRow } from '@/lib/notification-utils';

type ApprovalRow = Record<string, unknown>;

type ApprovalAction = 'approve' | 'reject';

type ActorContext = {
  id: string | null;
  name: string | null;
  company: string | null;
  isAdmin: boolean;
};

type StaffRow = {
  id: string;
  permissions?: Record<string, unknown> | null;
};

export type ApprovalTransitionResult = {
  approvalId: string;
  action: ApprovalAction;
  ok: boolean;
  status: string;
  finalApproval: boolean;
  nextApproverId: string | null;
  alreadyProcessed: boolean;
  warnings: string[];
  supplySummary: Record<string, unknown> | null;
  error?: string;
};

export type ApprovalTransitionSummary = {
  total: number;
  successCount: number;
  failCount: number;
  finalApprovalCount: number;
  warningCount: number;
};

function resolveApprovalLineIds(item: ApprovalRow): string[] {
  const metaData = item.meta_data as Record<string, unknown> | null | undefined;
  const explicitLineIds = normalizeApprovalLineIds(item.approver_line ?? metaData?.approver_line);
  if (explicitLineIds.length > 0) return explicitLineIds;
  if (item.current_approver_id != null) return [String(item.current_approver_id)];
  return [];
}

async function fetchStaffMap(staffIds: string[]) {
  const uniqueIds = Array.from(new Set(staffIds.map((id) => String(id || '').trim()).filter(Boolean)));
  if (uniqueIds.length === 0) {
    return new Map<string, StaffRow>();
  }

  const d1 = await getD1Binding();
  if (!d1) throw new Error('[server-approval-transition] D1 binding not available (fetchStaffMap)');
  const db = getD1Drizzle(d1);
  const rows = await db
    .select({ id: staffMembersTable.id, permissions: staffMembersTable.permissions })
    .from(staffMembersTable)
    .where(inArray(staffMembersTable.id, uniqueIds));
  // D1에서 permissions는 TEXT(JSON) → 파싱
  return new Map(
    rows.map((row) => {
      let parsedPermissions: Record<string, unknown> | null = null;
      if (typeof row.permissions === 'string' && row.permissions.length > 0) {
        try {
          const parsed = JSON.parse(row.permissions) as unknown;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            parsedPermissions = parsed as Record<string, unknown>;
          }
        } catch {
          parsedPermissions = null;
        }
      }
      return [String(row.id), { id: String(row.id), permissions: parsedPermissions }];
    })
  );
}

function resolveEffectiveApproverId(
  approverId: string | null | undefined,
  staffMap: Map<string, StaffRow>
) {
  if (!approverId) return null;
  const matchedStaff = staffMap.get(String(approverId));
  return resolveEffectiveApproverIdCore(
    approverId,
    matchedStaff ? ({ permissions: matchedStaff.permissions || {} } as Record<string, unknown>) : null
  );
}

function buildApprovalHistoryEntry(
  actor: ActorContext,
  action: 'approved_step' | 'approved_final' | 'rejected' | 'delegated' | 'locked',
  note?: string | null
) {
  return buildApprovalHistoryEntryCore(actor.id, actor.name, action, note);
}

function buildNextApprovalMetaData(
  baseMetaData: Record<string, unknown> | null | undefined,
  actor: ActorContext,
  action: 'approved_step' | 'approved_final' | 'rejected',
  options?: {
    note?: string | null;
    lock?: boolean;
    currentApproverId?: string | null;
    revision?: number | null;
  }
) {
  let nextMetaData = appendApprovalHistory(baseMetaData, {
    ...buildApprovalHistoryEntry(actor, action, options?.note),
    current_approver_id: options?.currentApproverId ?? null,
    revision: options?.revision ?? null });

  if (options?.lock) {
    nextMetaData = appendApprovalHistory(lockApprovalMeta(nextMetaData, actor.id), {
      ...buildApprovalHistoryEntry(actor, 'locked', '결재 완료 문서 잠금'),
      revision: options?.revision ?? null });
  }

  return nextMetaData;
}

function applyDelegationMeta(
  item: ApprovalRow,
  actor: ActorContext,
  baseMetaData: Record<string, unknown> | null | undefined,
  currentApproverId: string,
  effectiveApproverId: string
) {
  if (currentApproverId === effectiveApproverId) {
    return baseMetaData || {};
  }

  const metaData = (baseMetaData || {}) as Record<string, unknown>;
  if (String(metaData.delegated_to_id || '') === effectiveApproverId) {
    return metaData;
  }

  return appendApprovalHistory(
    {
      ...metaData,
      delegated_from_id: currentApproverId,
      delegated_to_id: effectiveApproverId,
      delegated_at: new Date().toISOString() },
    {
      ...buildApprovalHistoryEntry(actor, 'delegated', `${currentApproverId} -> ${effectiveApproverId}`),
      current_approver_id: effectiveApproverId,
      revision: getApprovalRevision(metaData) }
  );
}

/**
 * 다음 단계로 넘어갈 때 위임(대결) 메타를 "다음 결재자 기준" 으로 다시 쓴다.
 *
 * 예전에는 단계 진행 시 current_approver_id 에 대리자 id 를 그대로 저장하면서
 * delegated_from_id / delegated_to_id 는 손대지 않았다. 그 탓에 두 가지가 깨졌다.
 *  - 저장된 대리자 id 가 approver_line 에 없는 값이 되어, 다음 호출에서
 *    'Current approver is not in approver line.' 로 문서가 영구 정지했다.
 *    이 검사는 관리자 우회보다 앞이라 관리자도 손댈 수 없었다.
 *  - 같은 사람이 연속된 두 결재자를 대행하면 직전 단계의 delegated_to_id 가
 *    남아 있어 resolveStoredCurrentApproverId 가 **이전 결재자** 를 가리켰고,
 *    결재 단계가 뒤로 되감겼다.
 * 그래서 단계마다 이 세 값을 다음 결재자의 것으로 덮어쓰거나, 위임이 없으면 비운다.
 */
function applyNextStepDelegationMeta(
  metaData: Record<string, unknown>,
  nextLineApproverId: string | null,
  nextEffectiveApproverId: string | null,
): Record<string, unknown> {
  const hasDelegation = Boolean(
    nextLineApproverId &&
      nextEffectiveApproverId &&
      String(nextLineApproverId) !== String(nextEffectiveApproverId)
  );

  return {
    ...metaData,
    delegated_from_id: hasDelegation ? nextLineApproverId : null,
    delegated_to_id: hasDelegation ? nextEffectiveApproverId : null,
    delegated_at: hasDelegation ? new Date().toISOString() : null };
}

/**
 * 반려·회수로 결재가 끝났을 때 남는 leave_requests '대기' 행을 정리한다.
 *
 * 모바일 연차신청 폼은 approvals 보다 **먼저** leave_requests 에 status='대기'
 * 행을 넣는다(중복 신청 차단과 오프라인 큐 때문). 그런데 그 행을 '승인' 으로
 * 승격시키는 코드는 최종 승인 경로(ensureApprovedAnnualLeaveRequest)에만 있고,
 * 반려 경로는 attendance_corrections 만 되돌렸다. 그래서 반려된 연차가 인사
 * 화면(휴가관리·LeaveWorkcenter·모바일 연차관리자)에는 계속 '대기' 로 떠 있는
 * 유령 신청으로 남았다 — 그 화면들은 status 필터 없이 조회한다.
 */
async function cleanupPendingLeaveRequestOnTermination(
  item: ApprovalRow,
  metaData: Record<string, unknown> | null | undefined,
  nextStatus: '반려' | '회수',
) {
  const itemType = String(item.type || '').trim();
  if (itemType !== '연차/휴가' && itemType !== '휴가신청') return;

  const senderId = String(item.sender_id || '').trim();
  if (!senderId) return;

  try {
    const { extractLeaveRequestMeta } = await import('@/lib/leave-notice');
    const leaveSummary = extractLeaveRequestMeta(metaData);
    const startDate = leaveSummary?.startDate || '';
    if (!startDate) return;
    const endDate = leaveSummary?.endDate || startDate;

    const { leaveTypeLookupAliases } = await import('@/lib/leave-type');
    // 승격 경로와 같은 조건(직원 + 유형 별칭 + 기간)으로 찾아야 같은 행을 집는다.
    const typeAliases = leaveTypeLookupAliases(leaveSummary?.leaveType);

    const d1 = await getD1Binding();
    if (!d1) return;
    const db = getD1Drizzle(d1);
    const { leave_requests } = await import('@/lib/db/schema');
    const { and: drizzleAnd, eq: drizzleEq, inArray: drizzleInArray } = await import('drizzle-orm');
    await db
      .update(leave_requests)
      .set({ status: nextStatus })
      .where(
        drizzleAnd(
          drizzleEq(leave_requests.staff_id, senderId),
          drizzleInArray(leave_requests.leave_type, typeAliases),
          drizzleEq(leave_requests.start_date, startDate),
          drizzleEq(leave_requests.end_date, endDate),
          drizzleEq(leave_requests.status, '대기'),
        ),
      );
  } catch (leaveErr) {
    // 결재 상태 전이 자체는 이미 확정됐으므로 정리 실패로 되돌리지 않는다.
    console.error('[server-approval-transition] leave_requests 대기 행 정리 실패:', leaveErr);
  }
}

function serializeApprovalUpdateForD1(updateData: Record<string, unknown>): Record<string, unknown> {
  const d1UpdateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updateData)) {
    if ((key === 'meta_data' || key === 'approver_line' || key === 'approval_line') && value !== null && value !== undefined && typeof value !== 'string') {
      d1UpdateData[key] = JSON.stringify(value);
    } else {
      d1UpdateData[key] = value;
    }
  }
  return d1UpdateData;
}

/**
 * 결재 행 갱신 — 읽은 스냅샷을 조건에 건 낙관적 잠금(CAS).
 *
 * 예전에는 SELECT 로 읽은 status 가 '대기' 인지만 확인하고 UPDATE 는
 * `where id = ?` 하나로 나갔다. D1 은 문장 단위 자동커밋이고 라우트에도
 * 문서 단위 직렬화가 없어서, 승인 버튼 더블클릭이나 PC/모바일 동시 조작이
 * 같은 스냅샷을 읽으면 **둘 다 통과해 둘 다 UPDATE** 했다. 그 결과 최종 승인
 * 후속 처리가 두 번 돌아 증명서·인사이력·알림이 2건씩 생겼다
 * (실측: 동시 승인 2건 → certificate_issuances 2행).
 *
 * 이제 읽은 시점의 status/current_approver_id 를 WHERE 에 함께 걸고,
 * 갱신된 행이 없으면(=그 사이 누가 먼저 처리) 호출측이 충돌로 처리한다.
 */
async function updateApprovalRecord(
  approvalId: string,
  updateData: Record<string, unknown>,
  expected?: { status: string; currentApproverId: unknown }
) {
  const d1 = await getD1Binding();
  if (!d1) throw new Error('[server-approval-transition] D1 binding not available (updateApprovalRecord)');
  const db = getD1Drizzle(d1);
  // JSON 컬럼(meta_data, approver_line, approval_line)은 TEXT로 직렬화
  const d1UpdateData = serializeApprovalUpdateForD1(updateData);
  const { and: drizzleAnd, eq: drizzleEq, isNull: drizzleIsNull } = await import('drizzle-orm');
  const expectedApproverId =
    expected && expected.currentApproverId != null && String(expected.currentApproverId) !== ''
      ? String(expected.currentApproverId)
      : null;
  const whereClause = expected
    ? drizzleAnd(
        drizzleEq(approvalsTable.id, approvalId),
        drizzleEq(approvalsTable.status, expected.status),
        expectedApproverId
          ? drizzleEq(approvalsTable.current_approver_id, expectedApproverId)
          : drizzleIsNull(approvalsTable.current_approver_id),
      )
    : eq(approvalsTable.id, approvalId);
  const rows = await db
    .update(approvalsTable)
    .set(d1UpdateData as Parameters<ReturnType<typeof db.update>['set']>[0])
    .where(whereClause)
    .returning();
  const row = rows[0] ?? null;
  if (!row) return null;
  // meta_data 등 JSON 컬럼 파싱해서 반환
  const result: ApprovalRow = { ...row };
  for (const col of ['meta_data', 'approver_line', 'approval_line'] as const) {
    const raw = result[col];
    if (typeof raw === 'string' && raw.length > 0) {
      try { result[col] = JSON.parse(raw); } catch { /* 파싱 실패는 원본 유지 */ }
    }
  }
  return result;
}

async function markApprovalNotificationsAsRead(
  actorId: string | null,
  approvalIds: string[]
) {
  const normalizedActorId = String(actorId || '').trim();
  const normalizedApprovalIds = Array.from(
    new Set(approvalIds.map((id) => String(id || '').trim()).filter(Boolean))
  );

  if (!normalizedActorId || normalizedApprovalIds.length === 0) {
    return;
  }

  const d1 = await getD1Binding();
  if (!d1) throw new Error('[server-approval-transition] D1 binding not available (markApprovalNotificationsAsRead)');
  const db = getD1Drizzle(d1);
  // D1에서 notifications 조회: user_id 일치 + type in ['approval','inventory'] + read_at IS NULL
  const { and, eq: drizzleEq, inArray: drizzleInArray, isNull } = await import('drizzle-orm');
  const rows = await db
    .select({ id: notificationsTable.id, metadata: notificationsTable.metadata })
    .from(notificationsTable)
    .where(
      and(
        drizzleEq(notificationsTable.user_id, normalizedActorId),
        drizzleInArray(notificationsTable.type, ['approval', 'inventory']),
        isNull(notificationsTable.read_at),
      )
    )
    .limit(500);
  const matchedIds = rows
    .map((row) => {
      // D1의 metadata는 TEXT → JSON.parse
      let metadata: Record<string, unknown> | null = null;
      if (typeof row.metadata === 'string' && row.metadata.length > 0) {
        try {
          const parsed = JSON.parse(row.metadata) as unknown;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            metadata = parsed as Record<string, unknown>;
          }
        } catch { metadata = null; }
      } else if (row.metadata && typeof row.metadata === 'object') {
        metadata = row.metadata as Record<string, unknown>;
      }
      return { id: String(row.id || '').trim(), metadata };
    })
    .filter((row) =>
      normalizedApprovalIds.some((approvalId) => notificationMatchesApprovalId(row.metadata, approvalId))
    )
    .map((row) => row.id)
    .filter(Boolean);

  if (matchedIds.length === 0) return;
  const readAt = new Date().toISOString();
  await db
    .update(notificationsTable)
    .set({ read_at: readAt })
    .where(inArray(notificationsTable.id, matchedIds));
}

async function transitionSingleApproval(params: {
  item: ApprovalRow;
  actor: ActorContext;
  action: ApprovalAction;
  rejectReason?: string | null;
  approveComment?: string | null;
}) {
  const { item, actor, action, rejectReason, approveComment } = params;
  const approvalId = String(item.id || '').trim();
  const itemStatus = String(item.status || '').trim();

  if (!approvalId) {
    return {
      approvalId: '',
      action,
      ok: false,
      status: itemStatus || '',
      finalApproval: false,
      nextApproverId: null,
      alreadyProcessed: false,
      warnings: [],
      supplySummary: null,
      error: 'Approval id is missing.' } satisfies ApprovalTransitionResult;
  }

  if (!actor.id) {
    return {
      approvalId,
      action,
      ok: false,
      status: itemStatus || '',
      finalApproval: false,
      nextApproverId: null,
      alreadyProcessed: false,
      warnings: [],
      supplySummary: null,
      error: 'Unauthorized' } satisfies ApprovalTransitionResult;
  }

  if (itemStatus !== '대기') {
    return {
      approvalId,
      action,
      ok: false,
      status: itemStatus,
      finalApproval: false,
      nextApproverId: null,
      alreadyProcessed: false,
      warnings: [],
      supplySummary: null,
      error: 'Approval is not pending.' } satisfies ApprovalTransitionResult;
  }

  const storedCurrentApproverId = resolveStoredCurrentApproverId(item);
  if (!storedCurrentApproverId) {
    return {
      approvalId,
      action,
      ok: false,
      status: itemStatus,
      finalApproval: false,
      nextApproverId: null,
      alreadyProcessed: false,
      warnings: [],
      supplySummary: null,
      error: 'Current approver is missing.' } satisfies ApprovalTransitionResult;
  }

  const lineIds = resolveApprovalLineIds({
    ...item,
    current_approver_id: storedCurrentApproverId,
    approver_line: normalizeApprovalLineIds(item.approver_line ?? (item.meta_data as Record<string, unknown> | null | undefined)?.approver_line).length > 0
      ? (item.approver_line ?? (item.meta_data as Record<string, unknown> | null | undefined)?.approver_line)
      : [storedCurrentApproverId] });

  const staffMap = await fetchStaffMap(
    [storedCurrentApproverId, ...lineIds, actor.id || ''].filter(Boolean)
  );

  /**
   * 결재선에서 현재 결재자의 위치를 찾는다.
   *
   * 대결이 걸린 문서는 예전 저장 경로 탓에 current_approver_id 에 결재선에 없는
   * **대리자 id** 가 그대로 들어가 있을 수 있고, 그러면 이 검사에서 걸려 승인도
   * 반려도 되지 않았다(회수 외 복구 수단이 없었다). 저장 경로는
   * applyNextStepDelegationMeta 로 고쳤지만 이미 그렇게 굳은 문서가 남아 있으므로,
   * "결재선의 누군가가 위임한 대리자" 인 경우 그 위임자 자리로 되돌려 복구한다.
   */
  let currentApproverLineId = storedCurrentApproverId;
  let currentIndex = lineIds.findIndex((id) => String(id) === String(storedCurrentApproverId));
  if (currentIndex === -1) {
    const delegatedIndex = lineIds.findIndex(
      (id) => String(resolveEffectiveApproverId(id, staffMap) || id) === String(storedCurrentApproverId)
    );
    if (delegatedIndex >= 0) {
      currentIndex = delegatedIndex;
      currentApproverLineId = String(lineIds[delegatedIndex]);
    }
  }

  if (currentIndex === -1) {
    return {
      approvalId,
      action,
      ok: false,
      status: itemStatus,
      finalApproval: false,
      nextApproverId: null,
      alreadyProcessed: false,
      warnings: [],
      supplySummary: null,
      error: 'Current approver is not in approver line.' } satisfies ApprovalTransitionResult;
  }

  let effectiveCurrentApproverId =
    resolveEffectiveApproverId(currentApproverLineId, staffMap) || currentApproverLineId;

  const isDirectApprover = String(currentApproverLineId) === String(actor.id);
  const isEffectiveApprover = String(effectiveCurrentApproverId) === String(actor.id);

  if (!actor.isAdmin && !isDirectApprover && !isEffectiveApprover) {
    try {
      const d1 = await getD1Binding();
      if (d1) {
        const db = getD1Drizzle(d1);
        const { approval_delegation } = await import('@/lib/db/schema');
        const { and: drizzleAnd, eq: drizzleEq } = await import('drizzle-orm');
        const delegationRows = await db
          .select()
          .from(approval_delegation)
          .where(
            drizzleAnd(
              drizzleEq(approval_delegation.delegator_id, currentApproverLineId),
              drizzleEq(approval_delegation.delegate_id, String(actor.id)),
              drizzleEq(approval_delegation.is_active, 1),
            ),
          )
          .limit(1);
        if (delegationRows.length > 0) {
          const delegation = delegationRows[0];
          const now = new Date().toISOString().slice(0, 10);
          const startDate = String(delegation.start_date || '').slice(0, 10);
          const endDate = String(delegation.end_date || '').slice(0, 10);
          // SEC-P0-01 fix: 위임 기간 검증 (시작일 ≤ 오늘 ≤ 종료일)
          if (
            (!startDate || startDate <= now) &&
            (!endDate || endDate >= now)
          ) {
            effectiveCurrentApproverId = String(actor.id);
          }
        }
      }
    } catch {
      // delegation DB lookup failure is non-blocking
    }
  }

  /**
   * 강제 반려는 '현재 결재자' 검사를 면제한다 — 정체된 결재를 인사/관리 담당자가
   * 끊어 줄 수 있어야 하기 때문. 승인에는 적용하지 않는다.
   *
   * PC 는 approval_반려권한('강제 반려/회수') 이 있으면 현재 결재자가 아니어도
   * 반려를 진행시키는데, 서버는 이 권한을 **아예 참조하지 않고** 무조건 거부했다.
   * 그래서 해당 권한자는 사유 입력까지 마친 뒤 항상 서버 오류 토스트만 봤고,
   * 권한 설정 화면의 그 항목은 사실상 아무 효과가 없었다.
   *
   * 권한은 세션이 아니라 DB(staff_members.permissions)에서 읽는다 — 세션 토큰은
   * 크기 때문에 일부 접두사(menu_/hr_/inventory_ …)만 담고 approval_ 계열은
   * 버리므로, 세션에서 읽으면 영원히 false 다.
   */
  const isForcedReject =
    action === 'reject' &&
    hasPermission(
      { permissions: staffMap.get(String(actor.id))?.permissions || {} } as Record<string, unknown>,
      'approval_반려권한',
    );

  if (
    !actor.isAdmin &&
    !isForcedReject &&
    String(currentApproverLineId) !== String(actor.id) &&
    String(effectiveCurrentApproverId) !== String(actor.id)
  ) {
    return {
      approvalId,
      action,
      ok: false,
      status: itemStatus,
      finalApproval: false,
      nextApproverId: null,
      alreadyProcessed: false,
      warnings: [],
      supplySummary: null,
      error: 'Only the current approver or active delegate can act on this approval.' } satisfies ApprovalTransitionResult;
  }

  const baseMetaData = applyDelegationMeta(
    item,
    actor,
    (item.meta_data as Record<string, unknown> | null | undefined) || {},
    currentApproverLineId,
    effectiveCurrentApproverId,
  );
  const revision = getApprovalRevision(baseMetaData);

  if (action === 'reject') {
    const reason = String(rejectReason || '').trim();
    // 현재 결재자가 아닌 사람이 권한으로 끊은 반려는 이력에서 구분되어야 한다.
    const isForcedRejectByPermission =
      isForcedReject &&
      String(currentApproverLineId) !== String(actor.id) &&
      String(effectiveCurrentApproverId) !== String(actor.id);
    const rejectNote = isForcedRejectByPermission
      ? `[강제 반려] ${reason || '반려'}`
      : reason || '반려';
    const nextRejectedMetaData = buildNextApprovalMetaData(baseMetaData, actor, 'rejected', {
      note: rejectNote,
      lock: true,
      currentApproverId: effectiveCurrentApproverId,
      revision });

    const rejectedRow = await updateApprovalRecord(
      approvalId,
      {
        status: '반려',
        meta_data: {
          ...nextRejectedMetaData,
          reject_reason: reason || null } },
      { status: itemStatus, currentApproverId: item.current_approver_id },
    );

    if (!rejectedRow) {
      return {
        approvalId,
        action,
        ok: false,
        status: itemStatus,
        finalApproval: false,
        nextApproverId: null,
        alreadyProcessed: true,
        warnings: [],
        supplySummary: null,
        error: 'Approval was already processed by another request.' } satisfies ApprovalTransitionResult;
    }

    // Fix A: 기안자에게 반려 알림 전송
    try {
      const senderId = String(item.sender_id || '').trim();
      if (senderId) {
        const approvalTitle = String(item.title || '전자결재 문서');
        const actorName = actor.name ? `${actor.name}님이 ` : '';
        await insertNotificationsOrThrow([{
          user_id: senderId,
          type: 'approval',
          title: '결재 반려',
          body: `${actorName}${approvalTitle} 문서를 반려했습니다.`,
          metadata: {
            approval_id: approvalId,
            actor_id: actor.id,
            actor_name: actor.name } } satisfies NotificationRow]);
      }
    } catch {
      // 알림 실패는 결재 처리에 영향 없음
    }

    // 출결정정 문서인 경우 attendance_corrections 테이블의 '대기' 항목을 '반려'로 갱신 (재신청 허용)
    const correctionDates = Array.isArray((baseMetaData as Record<string, unknown> | null)?.correction_dates) ? ((baseMetaData as Record<string, unknown>).correction_dates as string[]) : [];
    const senderIdForCorrection = String(item.sender_id || '').trim();
    if (correctionDates.length > 0 && senderIdForCorrection) {
      try {
        const d1 = await getD1Binding();
        if (d1) {
          const db = getD1Drizzle(d1);
          const { attendance_corrections } = await import('@/lib/db/schema');
          const { and: drizzleAnd, eq: drizzleEq, inArray: drizzleInArray } = await import('drizzle-orm');
          await db
            .update(attendance_corrections)
            .set({ status: '반려' })
            .where(
              drizzleAnd(
                drizzleEq(attendance_corrections.staff_id, senderIdForCorrection),
                drizzleInArray(attendance_corrections.attendance_date, correctionDates),
                drizzleEq(attendance_corrections.status, '대기'),
              ),
            );
        }
      } catch (attErr) {
        console.error('[server-approval-transition] attendance_corrections 반려 상태 갱신 실패:', attErr);
      }
    }

    await cleanupPendingLeaveRequestOnTermination(item, baseMetaData, '반려');

    return {
      approvalId,
      action,
      ok: true,
      status: '반려',
      finalApproval: false,
      nextApproverId: null,
      alreadyProcessed: false,
      warnings: [],
      supplySummary: null } satisfies ApprovalTransitionResult;
  }

  /**
   * 최종 승인은 결재선의 마지막 차례일 때만 성립한다.
   *
   * 예전에는 승인 코멘트에 '[전결]' 이 들어 있거나 문서 meta_data 에
   * is_arbitrary 가 심어져 있으면 남은 결재선을 통째로 건너뛰고 최종 승인으로
   * 처리했다. 둘 다 검증 없는 입력이다 — 코멘트는 요청 본문의 자유 문자열이라
   * 1차 결재자가 승인 사유에 그 네 글자를 적기만 하면 원장·대표 결재가
   * 생략됐고, is_arbitrary 는 기안 메타가 화이트리스트 없이 병합돼 저장되므로
   * **기안자가 자기 문서에 미리 심어 둘 수 있었다.** 그 경우 1차 결재자는
   * 평범하게 승인만 눌러도 자신이 최종 승인을 했다는 사실을 알지 못한다.
   *
   * 전결 권한을 검증할 상수도 함수도 저장소에 없고, 이 두 값을 만들어 내는
   * 코드도 앱 어디에도 없다(소비하는 이 자리뿐). 즉 기능이 아니라 우회로였다.
   * 전결을 다시 도입한다면 권한 판정을 갖춘 별도 액션이어야 한다.
   */
  const isFinalApproval = currentIndex === lineIds.length - 1;
  const nextLineApproverId = !isFinalApproval ? lineIds[currentIndex + 1] : null;
  const nextApproverId = nextLineApproverId
    ? (resolveEffectiveApproverId(nextLineApproverId, staffMap) || nextLineApproverId)
    : null;

  const trimmedApproveComment = String(approveComment || '').trim();
  const finalApprovalNote = trimmedApproveComment
    ? `최종 승인: ${trimmedApproveComment}`
    : '최종 승인';
  const stepApprovalNote = trimmedApproveComment
    ? `${currentIndex + 1}차 승인: ${trimmedApproveComment}`
    : `${currentIndex + 1}차 승인`;

  const updateData: Record<string, unknown> = isFinalApproval
    ? {
        status: '승인',
        meta_data: {
          ...buildNextApprovalMetaData(baseMetaData, actor, 'approved_final', {
            note: finalApprovalNote,
            lock: true,
            currentApproverId: effectiveCurrentApproverId,
            revision }),
          ...(trimmedApproveComment ? { approve_comment: trimmedApproveComment } : {}) } }
    : {
        current_approver_id: nextApproverId,
        meta_data: {
          ...applyNextStepDelegationMeta(
            buildNextApprovalMetaData(baseMetaData, actor, 'approved_step', {
              note: stepApprovalNote,
              currentApproverId: nextApproverId,
              revision }),
            nextLineApproverId,
            nextApproverId,
          ),
          ...(trimmedApproveComment ? { approve_comment: trimmedApproveComment } : {}) } };

  const updatedApproval = await updateApprovalRecord(approvalId, updateData, {
    status: itemStatus,
    currentApproverId: item.current_approver_id });

  if (!updatedApproval) {
    // CAS 실패 = 같은 스냅샷을 읽은 다른 요청이 먼저 처리했다.
    // 여기서 멈추지 않으면 최종 승인 후속 처리가 두 번 실행된다.
    return {
      approvalId,
      action,
      ok: false,
      status: itemStatus,
      finalApproval: false,
      nextApproverId: null,
      alreadyProcessed: true,
      warnings: [],
      supplySummary: null,
      error: 'Approval was already processed by another request.' } satisfies ApprovalTransitionResult;
  }

  if (!isFinalApproval) {
    // Fix D: 다음 결재자에게 결재 차례 알림 전송
    try {
      const nextId = String(nextApproverId || '').trim();
      if (nextId) {
        const approvalTitle = String(item.title || '전자결재 문서');
        await insertNotificationsOrThrow([{
          user_id: nextId,
          type: 'approval',
          title: '결재 차례',
          body: `${approvalTitle} 결재가 도착했습니다.`,
          metadata: {
            approval_id: approvalId,
            actor_id: actor.id,
            actor_name: actor.name } } satisfies NotificationRow]);
      }
    } catch {
      // 알림 실패는 결재 처리에 영향 없음
    }

    return {
      approvalId,
      action,
      ok: true,
      status: '대기',
      finalApproval: false,
      nextApproverId: nextApproverId || null,
      alreadyProcessed: false,
      warnings: [],
      supplySummary: null } satisfies ApprovalTransitionResult;
  }

  const finalizedApproval = (updatedApproval || {
    ...item,
    ...updateData }) as ApprovalRow;
  const processingResult = await processFinalApprovalEffects(
    finalizedApproval,
    actor.id
  );

  return {
    approvalId,
    action,
    ok: true,
    status: '승인',
    finalApproval: true,
    nextApproverId: null,
    alreadyProcessed: processingResult.alreadyProcessed,
    warnings: processingResult.warnings,
    supplySummary: (processingResult.supplySummary as Record<string, unknown> | null) || null } satisfies ApprovalTransitionResult;
}

export async function transitionApprovals(params: {
  approvalIds: string[];
  actor: ActorContext;
  action: ApprovalAction;
  rejectReason?: string | null;
  approveComment?: string | null;
}) {
  const { approvalIds, actor, action, rejectReason, approveComment } = params;
  const normalizedIds = Array.from(new Set(approvalIds.map((id) => String(id || '').trim()).filter(Boolean)));

  if (normalizedIds.length === 0) {
    return {
      results: [] as ApprovalTransitionResult[],
      summary: {
        total: 0,
        successCount: 0,
        failCount: 0,
        finalApprovalCount: 0,
        warningCount: 0 } satisfies ApprovalTransitionSummary };
  }

  const d1 = await getD1Binding();
  if (!d1) throw new Error('[server-approval-transition] D1 binding not available (transitionApprovals)');
  const db = getD1Drizzle(d1);
  const rows = await db
    .select()
    .from(approvalsTable)
    .where(inArray(approvalsTable.id, normalizedIds));
  // JSON 컬럼(meta_data, approver_line, approval_line) 파싱
  const fetchedRows: ApprovalRow[] = rows.map((row) => {
    const result: ApprovalRow = { ...row };
    for (const col of ['meta_data', 'approver_line', 'approval_line'] as const) {
      const raw = result[col];
      if (typeof raw === 'string' && raw.length > 0) {
        try { result[col] = JSON.parse(raw); } catch { /* 파싱 실패는 원본 유지 */ }
      }
    }
    return result;
  });

  const approvalMap = new Map(
    fetchedRows.map((item) => [String(item.id || ''), item])
  );

  const results: ApprovalTransitionResult[] = [];
  for (const approvalId of normalizedIds) {
    const item = approvalMap.get(approvalId);
    if (!item) {
      results.push({
        approvalId,
        action,
        ok: false,
        status: '',
        finalApproval: false,
        nextApproverId: null,
        alreadyProcessed: false,
        warnings: [],
        supplySummary: null,
        error: 'Approval not found.' });
      continue;
    }

    try {
      results.push(
        await transitionSingleApproval({
          item,
          actor,
          action,
          rejectReason,
          approveComment })
      );
    } catch (error) {
      results.push({
        approvalId,
        action,
        ok: false,
        status: String(item.status || ''),
        finalApproval: false,
        nextApproverId: null,
        alreadyProcessed: false,
        warnings: [],
        supplySummary: null,
        error: error instanceof Error ? error.message : 'Transition failed.' });
    }
  }

  const successCount = results.filter((result) => result.ok).length;
  const failCount = results.length - successCount;
  const finalApprovalCount = results.filter((result) => result.ok && result.finalApproval).length;
  const warningCount = results.reduce((sum, result) => sum + result.warnings.length, 0);

  const successfulApprovalIds = results
    .filter((result) => result.ok)
    .map((result) => result.approvalId);

  if (successfulApprovalIds.length > 0) {
    try {
      await markApprovalNotificationsAsRead(actor.id, successfulApprovalIds);
    } catch {
      // Approval state should win even if notification cleanup is delayed.
    }
  }

  return {
    results,
    summary: {
      total: results.length,
      successCount,
      failCount,
      finalApprovalCount,
      warningCount } satisfies ApprovalTransitionSummary };
}
