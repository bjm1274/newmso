import type { SupabaseClient } from '@supabase/supabase-js';
import {
  appendApprovalHistory,
  getApprovalRevision,
  lockApprovalMeta,
  resolveApprovalDelegateConfig,
} from '@/lib/approval-workflow';
import { processFinalApprovalEffects } from '@/lib/server-approval-processing';

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

async function fetchStaffMap(supabase: SupabaseClient, staffIds: string[]) {
  const uniqueIds = Array.from(new Set(staffIds.map((id) => String(id || '').trim()).filter(Boolean)));
  if (uniqueIds.length === 0) {
    return new Map<string, StaffRow>();
  }

  const { data, error } = await supabase
    .from('staff_members')
    .select('id, permissions')
    .in('id', uniqueIds);

  if (error) {
    throw error;
  }

  return new Map(
    ((data || []) as StaffRow[]).map((staff) => [String(staff.id), staff])
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

async function updateApprovalRecord(
  supabase: SupabaseClient,
  approvalId: string,
  updateData: Record<string, unknown>
) {
  const { data, error } = await supabase
    .from('approvals')
    .update(updateData)
    .eq('id', approvalId)
    .select('*')
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data || null) as ApprovalRow | null;
}

async function transitionSingleApproval(params: {
  supabase: SupabaseClient;
  item: ApprovalRow;
  actor: ActorContext;
  action: ApprovalAction;
  rejectReason?: string | null;
}) {
  const { supabase, item, actor, action, rejectReason } = params;
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
    supabase,
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

    await updateApprovalRecord(supabase, approvalId, {
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

  const updateData: Record<string, unknown> = isFinalApproval
    ? {
        status: '승인',
        meta_data: buildNextApprovalMetaData(baseMetaData, actor, 'approved_final', {
          note: '최종 승인',
          lock: true,
          currentApproverId: effectiveCurrentApproverId,
          revision,
        }),
      }
    : {
        current_approver_id: nextApproverId,
        meta_data: buildNextApprovalMetaData(baseMetaData, actor, 'approved_step', {
          note: `${currentIndex + 1}차 승인`,
          currentApproverId: nextApproverId,
          revision,
        }),
      };

  const updatedApproval = await updateApprovalRecord(supabase, approvalId, updateData);

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
    supabase,
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
}) {
  const { supabase, approvalIds, actor, action, rejectReason } = params;
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

  const { data, error } = await supabase
    .from('approvals')
    .select('*')
    .in('id', normalizedIds);

  if (error) {
    throw error;
  }

  const approvalMap = new Map(
    ((data || []) as ApprovalRow[]).map((item) => [String(item.id || ''), item])
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
