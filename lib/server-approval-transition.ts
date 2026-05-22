import type { SupabaseClient } from '@supabase/supabase-js';
import {
  appendApprovalHistory,
  getApprovalRevision,
  lockApprovalMeta,
  resolveApprovalDelegateConfig,
} from '@/lib/approval-workflow';
import { notificationMatchesApprovalId } from '@/lib/notification-metadata';
import { processFinalApprovalEffects } from '@/lib/server-approval-processing';
import {
  approvals as approvalsTable,
  staff_members as staffMembersTable,
  notifications as notificationsTable,
  eq,
  inArray,
  getD1Binding,
  getD1Drizzle,
} from '@/lib/db';

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

function normalizeApprovalLineIds(line: unknown): string[] {
  if (!Array.isArray(line)) return [];
  const ids = line
    .map((entry) => {
      if (entry == null) return null;
      if (typeof entry === 'string' || typeof entry === 'number') return String(entry);
      if (typeof entry === 'object' && 'id' in (entry as Record<string, unknown>)) {
        const record = entry as Record<string, unknown>;
        return record.id != null ? String(record.id) : null;
      }
      return null;
    })
    .filter(Boolean) as string[];
  return Array.from(new Set(ids));
}

function resolveApprovalLineIds(item: ApprovalRow): string[] {
  const metaData = item.meta_data as Record<string, unknown> | null | undefined;
  const explicitLineIds = normalizeApprovalLineIds(item.approver_line ?? metaData?.approver_line);
  if (explicitLineIds.length > 0) return explicitLineIds;
  if (item.current_approver_id != null) return [String(item.current_approver_id)];
  return [];
}

function resolveStoredCurrentApproverId(item: ApprovalRow): string | null {
  const metaData = item.meta_data as Record<string, unknown> | null | undefined;
  if (item.current_approver_id != null) {
    const currentApproverId = String(item.current_approver_id);
    const delegatedToId = String(metaData?.delegated_to_id || '');
    const delegatedFromId = String(metaData?.delegated_from_id || '');
    if (delegatedToId && delegatedToId === currentApproverId && delegatedFromId) {
      return delegatedFromId;
    }
    return currentApproverId;
  }

  const lineIds = resolveApprovalLineIds(item);
  return lineIds[0] ?? null;
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
  const delegateConfig = resolveApprovalDelegateConfig(
    matchedStaff ? ({ permissions: matchedStaff.permissions || {} } as Record<string, unknown>) : null
  );
  if (delegateConfig.active && delegateConfig.delegateId) {
    return String(delegateConfig.delegateId);
  }
  return String(approverId);
}

function buildApprovalHistoryEntry(
  actor: ActorContext,
  action: 'approved_step' | 'approved_final' | 'rejected' | 'delegated' | 'locked',
  note?: string | null
) {
  return {
    action,
    actor_id: actor.id,
    actor_name: actor.name,
    note: note ?? null,
  };
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
    revision: options?.revision ?? null,
  });

  if (options?.lock) {
    nextMetaData = appendApprovalHistory(lockApprovalMeta(nextMetaData, actor.id), {
      ...buildApprovalHistoryEntry(actor, 'locked', '결재 완료 문서 잠금'),
      revision: options?.revision ?? null,
    });
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
      delegated_at: new Date().toISOString(),
    },
    {
      ...buildApprovalHistoryEntry(actor, 'delegated', `${currentApproverId} -> ${effectiveApproverId}`),
      current_approver_id: effectiveApproverId,
      revision: getApprovalRevision(metaData),
    }
  );
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

async function updateApprovalRecord(
  approvalId: string,
  updateData: Record<string, unknown>
) {
  const d1 = await getD1Binding();
  if (!d1) throw new Error('[server-approval-transition] D1 binding not available (updateApprovalRecord)');
  const db = getD1Drizzle(d1);
  // JSON 컬럼(meta_data, approver_line, approval_line)은 TEXT로 직렬화
  const d1UpdateData = serializeApprovalUpdateForD1(updateData);
  const rows = await db
    .update(approvalsTable)
    .set(d1UpdateData as Parameters<ReturnType<typeof db.update>['set']>[0])
    .where(eq(approvalsTable.id, approvalId))
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
  supabase: SupabaseClient;
  item: ApprovalRow;
  actor: ActorContext;
  action: ApprovalAction;
  rejectReason?: string | null;
  approveComment?: string | null;
}) {
  const { supabase, item, actor, action, rejectReason, approveComment } = params;
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
      error: 'Approval id is missing.',
    } satisfies ApprovalTransitionResult;
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
      error: 'Unauthorized',
    } satisfies ApprovalTransitionResult;
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
      error: 'Approval is not pending.',
    } satisfies ApprovalTransitionResult;
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
      error: 'Current approver is missing.',
    } satisfies ApprovalTransitionResult;
  }

  const lineIds = resolveApprovalLineIds({
    ...item,
    current_approver_id: storedCurrentApproverId,
    approver_line: normalizeApprovalLineIds(item.approver_line ?? (item.meta_data as Record<string, unknown> | null | undefined)?.approver_line).length > 0
      ? (item.approver_line ?? (item.meta_data as Record<string, unknown> | null | undefined)?.approver_line)
      : [storedCurrentApproverId],
  });

  const currentIndex = lineIds.findIndex((id) => String(id) === String(storedCurrentApproverId));
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
      error: 'Current approver is not in approver line.',
    } satisfies ApprovalTransitionResult;
  }

  const staffMap = await fetchStaffMap(
    [storedCurrentApproverId, ...lineIds].filter(Boolean)
  );
  const effectiveCurrentApproverId =
    resolveEffectiveApproverId(storedCurrentApproverId, staffMap) || storedCurrentApproverId;

  if (!actor.isAdmin && String(effectiveCurrentApproverId) !== String(actor.id)) {
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
      error: 'Only the current approver can act on this approval.',
    } satisfies ApprovalTransitionResult;
  }

  const baseMetaData = applyDelegationMeta(
    item,
    actor,
    (item.meta_data as Record<string, unknown> | null | undefined) || {},
    storedCurrentApproverId,
    effectiveCurrentApproverId,
  );
  const revision = getApprovalRevision(baseMetaData);

  if (action === 'reject') {
    const reason = String(rejectReason || '').trim();
    const nextRejectedMetaData = buildNextApprovalMetaData(baseMetaData, actor, 'rejected', {
      note: reason || '반려',
      lock: true,
      currentApproverId: effectiveCurrentApproverId,
      revision,
    });

    await updateApprovalRecord(approvalId, {
      status: '반려',
      meta_data: {
        ...nextRejectedMetaData,
        reject_reason: reason || null,
      },
    });

    return {
      approvalId,
      action,
      ok: true,
      status: '반려',
      finalApproval: false,
      nextApproverId: null,
      alreadyProcessed: false,
      warnings: [],
      supplySummary: null,
    } satisfies ApprovalTransitionResult;
  }

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
            revision,
          }),
          ...(trimmedApproveComment ? { approve_comment: trimmedApproveComment } : {}),
        },
      }
    : {
        current_approver_id: nextApproverId,
        meta_data: {
          ...buildNextApprovalMetaData(baseMetaData, actor, 'approved_step', {
            note: stepApprovalNote,
            currentApproverId: nextApproverId,
            revision,
          }),
          ...(trimmedApproveComment ? { approve_comment: trimmedApproveComment } : {}),
        },
      };

  const updatedApproval = await updateApprovalRecord(approvalId, updateData);

  if (!isFinalApproval) {
    return {
      approvalId,
      action,
      ok: true,
      status: '대기',
      finalApproval: false,
      nextApproverId: nextApproverId || null,
      alreadyProcessed: false,
      warnings: [],
      supplySummary: null,
    } satisfies ApprovalTransitionResult;
  }

  const finalizedApproval = (updatedApproval || {
    ...item,
    ...updateData,
  }) as ApprovalRow;
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
    supplySummary: (processingResult.supplySummary as Record<string, unknown> | null) || null,
  } satisfies ApprovalTransitionResult;
}

export async function transitionApprovals(params: {
  supabase: SupabaseClient;
  approvalIds: string[];
  actor: ActorContext;
  action: ApprovalAction;
  rejectReason?: string | null;
  approveComment?: string | null;
}) {
  const { supabase, approvalIds, actor, action, rejectReason, approveComment } = params;
  const normalizedIds = Array.from(new Set(approvalIds.map((id) => String(id || '').trim()).filter(Boolean)));

  if (normalizedIds.length === 0) {
    return {
      results: [] as ApprovalTransitionResult[],
      summary: {
        total: 0,
        successCount: 0,
        failCount: 0,
        finalApprovalCount: 0,
        warningCount: 0,
      } satisfies ApprovalTransitionSummary,
    };
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
        error: 'Approval not found.',
      });
      continue;
    }

    try {
      results.push(
        await transitionSingleApproval({
          supabase,
          item,
          actor,
          action,
          rejectReason,
          approveComment,
        })
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
        error: error instanceof Error ? error.message : 'Transition failed.',
      });
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
      warningCount,
    } satisfies ApprovalTransitionSummary,
  };
}
