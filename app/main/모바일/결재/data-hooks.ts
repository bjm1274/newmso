'use client';

/**
 * 결재 모바일 화면 공용 데이터 훅 + 유틸.
 *   - useApprovalList(): approvals 테이블에서 모든 결재 문서 fetch (한 번에 받고 메모리에서 분할)
 *   - classifyForStaff → lib/approval-inbox SSOT
 *   - resolveLineIds / resolveCurrentApproverId / resolveCcUserIds → approval-inbox/shared
 *   - postTransition: /api/approvals/transition 호출 (승인/반려)
 *   - markRead: approval 알림 읽음 처리
 *
 * JM(파일당 500줄, 단일 책임), JM2(deps 최소·필요 컬럼만), JM3(try/catch + toast),
 * JM4(any 금지, 판별 유니온), JM5(staffId 클라이언트 검증 + RLS 의존)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { db } from '@/lib/db-client';
import { toast } from '@/lib/toast';
import {
  APPROVAL_LIST_SELECT,
  APPROVAL_OPTIONAL_COLUMNS,
  buildApprovalSelect } from '@/lib/approval-query-columns';
import { withMissingColumnsFallback } from '@/lib/db-compat';
import {
  buildApprovalDocNumber,
  resolveApprovalDocNumberConfig } from '@/lib/approval-workflow';
import {
  classifyApprovalsForStaff,
  resolveApprovalCcUserIds,
  normalizeApprovalLineIds,
  resolveApprovalLineIds as resolveLineIdsShared,
  defaultResolveStoredCurrentApproverId,
} from '@/lib/approval-inbox';
import { resolveStoredCurrentApproverId, resolveEffectiveApproverIdCore } from '@/lib/approval-shared';

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────

export type ApprovalStatus = '대기' | '승인' | '반려' | '회수' | string;

export type ApprovalRow = {
  id: string;
  doc_number?: string | null;
  title?: string | null;
  content?: string | null;
  type?: string | null;
  status?: ApprovalStatus | null;
  sender_id?: string | null;
  sender_name?: string | null;
  sender_department?: string | null;
  sender_company?: string | null;
  company_id?: string | null;
  current_approver_id?: string | null;
  approver_line?: unknown;
  meta_data?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ApprovalKind = 'inbox' | 'progress' | 'done' | 'sent' | 'ref';

// ─────────────────────────────────────────────
// 유틸 — approval-inbox / approval-shared SSOT re-export
// ─────────────────────────────────────────────

export { normalizeApprovalLineIds, resolveStoredCurrentApproverId };

export function resolveLineIds(row: ApprovalRow): string[] {
  return resolveLineIdsShared(row as unknown as Parameters<typeof resolveLineIdsShared>[0]);
}

export function resolveCurrentApproverId(row: ApprovalRow): string | null {
  return defaultResolveStoredCurrentApproverId(row);
}

export function resolveCcUserIds(row: ApprovalRow): string[] {
  return resolveApprovalCcUserIds(row.meta_data);
}

// ─────────────────────────────────────────────
// 분류 — 받은 결재함 / 진행 / 완료 / 기안함 / 참조함
// ─────────────────────────────────────────────

export function classifyForStaff(rows: ApprovalRow[], staffId: string) {
  const classified = classifyApprovalsForStaff(rows, staffId, {
    excludeOwnFromApproverBuckets: true,
  });
  return {
    inbox: classified.inbox as ApprovalRow[],
    progress: classified.progress as ApprovalRow[],
    done: classified.done as ApprovalRow[],
    sent: classified.sent as ApprovalRow[],
    ref: classified.ref as ApprovalRow[],
  };
}

// ─────────────────────────────────────────────
// fetch — 한 번에 가져와서 분류
// ─────────────────────────────────────────────

export function useApprovalList(staffId: string | null, company?: string | null) {
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef(false);

  const fetcher = useCallback(async () => {
    if (!staffId) {
      setRows([]);
      return;
    }
    if (inflightRef.current) return;
    inflightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await withMissingColumnsFallback(
        (omittedColumns) => {
          const q = db
            .from('approvals')
            .select(buildApprovalSelect(omittedColumns))
            .order('created_at', { ascending: false })
            .limit(200);
          return q;
        },
        APPROVAL_OPTIONAL_COLUMNS,
        { cacheKey: `approval-list-mobile-${company ?? ''}` }
      );
      if (queryError) throw queryError;
      const next = (data ?? []) as unknown as ApprovalRow[];
      setRows(next);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '결재 목록 조회 실패';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setLoading(false);
      inflightRef.current = false;
    }
  }, [staffId, company]);

  useEffect(() => {
    void fetcher();
  }, [fetcher]);

  return { rows, loading, error, refetch: fetcher };
}

// ─────────────────────────────────────────────
// fetch one — 상세 화면
// ─────────────────────────────────────────────

export async function fetchApprovalById(id: string): Promise<ApprovalRow | null> {
  try {
    const { data, error } = await db
      .from('approvals')
      .select(APPROVAL_LIST_SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as ApprovalRow | null;
  } catch (err) {
    toast(`결재 조회 실패: ${err instanceof Error ? err.message : '오류'}`, 'error');
    return null;
  }
}

// ─────────────────────────────────────────────
// 액션 — /api/approvals/transition
// ─────────────────────────────────────────────

export type TransitionAction = 'approve' | 'reject';

// ─────────────────────────────────────────────
// 액션 — /api/approval/recall
// ─────────────────────────────────────────────

export type RecallResult = { ok: true; approvalId: string } | { ok: false; error: string };

export async function postRecall(params: {
  approvalId: string;
  note?: string | null;
}): Promise<RecallResult> {
  const response = await fetch('/api/approval/recall', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approvalId: params.approvalId, note: params.note ?? null }) });
  const payload = (await response.json().catch(() => null)) as RecallResult | null;
  if (!response.ok || !payload?.ok) {
    const errMsg =
      payload && !payload.ok && payload.error
        ? payload.error
        : response.statusText || '회수 처리 실패';
    return { ok: false, error: errMsg };
  }
  return payload;
}

type TransitionResult = {
  ok: boolean;
  results?: Array<{ ok: boolean; approvalId: string; error?: string; finalApproval?: boolean }>;
  summary?: { successCount: number; failCount: number; finalApprovalCount: number };
};

export async function postTransition(params: {
  action: TransitionAction;
  approvalIds: string[];
  reason?: string | null;
}): Promise<TransitionResult> {
  const response = await fetch('/api/approvals/transition', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params) });
  const payload = (await response.json().catch(() => null)) as TransitionResult | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload && 'results' in payload && payload.results?.[0]?.error
      ? String(payload.results[0].error)
      : response.statusText || '결재 처리 실패');
  }
  return payload;
}

// ─────────────────────────────────────────────
// 메모 헬퍼
// ─────────────────────────────────────────────

export function useClassifiedApprovals(rows: ApprovalRow[], staffId: string | null) {
  const [approverMap, setApproverMap] = useState<Record<string, Record<string, unknown>>>({});

  useEffect(() => {
    let cancelled = false;
    const ids = new Set<string>();
    for (const row of rows) {
      const cur = defaultResolveStoredCurrentApproverId(row);
      if (cur) ids.add(String(cur));
    }
    if (ids.size === 0) {
      setApproverMap({});
      return;
    }
    void (async () => {
      try {
        const { data } = await db
          .from('staff_members')
          .select('id, permissions, role, position')
          .in('id', Array.from(ids));
        if (cancelled) return;
        const map: Record<string, Record<string, unknown>> = {};
        for (const s of data ?? []) {
          map[String((s as { id?: string }).id)] = s as Record<string, unknown>;
        }
        setApproverMap(map);
      } catch {
        if (!cancelled) setApproverMap({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rows]);

  return useMemo(() => {
    if (!staffId) {
      return { inbox: [], progress: [], done: [], sent: [], ref: [] };
    }
    // 대결 반영: 저장된 현재 결재자 → 실효 결재자
    return classifyApprovalsForStaff(rows as unknown as Parameters<typeof classifyApprovalsForStaff>[0], staffId, {
      excludeOwnFromApproverBuckets: true,
      resolveCurrentApproverId: (row) => {
        const stored = defaultResolveStoredCurrentApproverId(row);
        if (!stored) return null;
        return resolveEffectiveApproverIdCore(stored, approverMap[String(stored)] ?? null);
      },
    }) as ReturnType<typeof classifyForStaff>;
  }, [rows, staffId, approverMap]);
}

// ─────────────────────────────────────────────
// doc_number 생성 — PC createStructuredDocNumber와 동일 패턴
//   - 회사 prefix + 양식 type code + 날짜 + 시퀀스 (zero-pad)
//   - 시퀀스: 같은 회사·당일 approvals count + 1
//   - 실패 시 null 반환 (호출측에서 silent fallback)
// ─────────────────────────────────────────────

export async function generateMobileDocNumber(params: {
  formSlug?: string | null;
  typeName?: string | null;
  companyName?: string | null;
  companyId?: string | null;
  departmentName?: string | null;
  userPermissions?: Record<string, unknown> | null;
}): Promise<string | null> {
  try {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    let countQuery = db
      .from('approvals')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', dayStart.toISOString())
      .lt('created_at', dayEnd.toISOString());

    if (params.companyId) countQuery = countQuery.eq('company_id', params.companyId);
    else if (params.companyName) countQuery = countQuery.eq('sender_company', params.companyName);

    const { count, error } = await countQuery;
    if (error) throw error;

    const config = resolveApprovalDocNumberConfig(
      params.userPermissions && typeof params.userPermissions === 'object'
        ? ({ permissions: params.userPermissions } as Record<string, unknown>)
        : null
    );

    return buildApprovalDocNumber({
      companyName: params.companyName ?? null,
      companyId: params.companyId ?? null,
      departmentName: params.departmentName ?? null,
      formSlug: params.formSlug ?? null,
      typeName: params.typeName ?? null,
      createdAt: new Date(),
      sequence: (count || 0) + 1,
      config });
  } catch (err) {
    // silent — 호출측에서 doc_number 없이 insert 진행
    console.warn('[mobile-approval] doc_number generation failed', err);
    return null;
  }
}
