'use client';

/**
 * 결재 모바일 화면 공용 데이터 훅 + 유틸.
 *   - useApprovalList(): approvals 테이블에서 모든 결재 문서 fetch (한 번에 받고 메모리에서 분할)
 *   - resolveLineIds / resolveCurrentApproverId : PC format-utils 재사용
 *   - postTransition: /api/approvals/transition 호출 (승인/반려)
 *   - markRead: approval 알림 읽음 처리
 *
 * JM(파일당 500줄, 단일 책임), JM2(deps 최소·필요 컬럼만), JM3(try/catch + toast),
 * JM4(any 금지, 판별 유니온), JM5(staffId 클라이언트 검증 + RLS 의존)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import {
  APPROVAL_LIST_SELECT,
  APPROVAL_OPTIONAL_COLUMNS,
  buildApprovalSelect,
} from '@/lib/approval-query-columns';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import {
  buildApprovalDocNumber,
  resolveApprovalDocNumberConfig,
} from '@/lib/approval-workflow';
import {
  normalizeApprovalLineIds,
  resolveApprovalLineIds as resolveLineIdsPc,
  resolveStoredCurrentApproverId,
} from '@/app/main/기능부품/마이페이지/역할별대시보드/format-utils';

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
// 유틸 — re-export PC normalize/resolve
// ─────────────────────────────────────────────

export { normalizeApprovalLineIds, resolveStoredCurrentApproverId };

export function resolveLineIds(row: ApprovalRow): string[] {
  return resolveLineIdsPc(row as unknown as Parameters<typeof resolveLineIdsPc>[0]);
}

export function resolveCurrentApproverId(row: ApprovalRow): string | null {
  if (row?.current_approver_id != null && String(row.current_approver_id).trim() !== '') {
    return String(row.current_approver_id);
  }
  const ids = resolveLineIds(row);
  return ids[0] ?? null;
}

export function resolveCcUserIds(row: ApprovalRow): string[] {
  const meta = (row.meta_data ?? {}) as Record<string, unknown>;
  const cc = meta.cc_line ?? meta.cc_users ?? meta.references ?? [];
  if (!Array.isArray(cc)) return [];
  return cc
    .map((entry) => {
      if (entry == null) return null;
      if (typeof entry === 'string' || typeof entry === 'number') return String(entry);
      if (typeof entry === 'object' && 'id' in entry) {
        const id = (entry as Record<string, unknown>).id;
        return id == null ? null : String(id);
      }
      return null;
    })
    .filter((v): v is string => v !== null);
}

// ─────────────────────────────────────────────
// 분류 — 받은 결재함 / 진행 / 완료 / 기안함 / 참조함
// ─────────────────────────────────────────────

export function classifyForStaff(rows: ApprovalRow[], staffId: string) {
  const inbox: ApprovalRow[] = [];
  const progress: ApprovalRow[] = [];
  const done: ApprovalRow[] = [];
  const sent: ApprovalRow[] = [];
  const ref: ApprovalRow[] = [];

  for (const row of rows) {
    const status = String(row.status || '');
    const isMine = String(row.sender_id || '') === staffId;
    const currentApprover = resolveCurrentApproverId(row);
    const lineIds = resolveLineIds(row);
    const ccIds = resolveCcUserIds(row);

    // 기안함: 본인이 기안
    if (isMine) {
      sent.push(row);
      if (status === '대기') progress.push(row);
      else if (status === '승인' || status === '반려') done.push(row);
    }

    // 결재함: 본인이 현재 결재자 + 대기
    if (status === '대기' && currentApprover === staffId && !isMine) {
      inbox.push(row);
    }

    // 진행: 본인이 결재선에 포함 + 대기 + 본인 차례 아님
    if (status === '대기' && lineIds.includes(staffId) && currentApprover !== staffId && !isMine) {
      progress.push(row);
    }

    // 완료: 본인이 결재선에 포함 + 승인/반려 종결
    if ((status === '승인' || status === '반려') && lineIds.includes(staffId) && !isMine) {
      done.push(row);
    }

    // 참조함: cc에 본인
    if (ccIds.includes(staffId)) {
      ref.push(row);
    }
  }
  return { inbox, progress, done, sent, ref };
}

// ─────────────────────────────────────────────
// fetch — 한 번에 가져와서 분류
// ─────────────────────────────────────────────

export function useApprovalList(staffId: string | null) {
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
        (omittedColumns) =>
          supabase
            .from('approvals')
            .select(buildApprovalSelect(omittedColumns))
            .order('created_at', { ascending: false })
            .limit(200),
        APPROVAL_OPTIONAL_COLUMNS,
        { cacheKey: 'approval-list-mobile' }
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
  }, [staffId]);

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
    const { data, error } = await supabase
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
    body: JSON.stringify(params),
  });
  const payload = (await response.json().catch(() => null)) as TransitionResult | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload && 'results' in payload && payload.results?.[0]?.error
      ? String(payload.results[0].error)
      : response.statusText || '결재 처리 실패');
  }
  return payload;
}

// ─────────────────────────────────────────────
// 알림 읽음 처리
// ─────────────────────────────────────────────

export async function markApprovalNotificationsRead(staffId: string, approvalIds: string[]) {
  if (!staffId || approvalIds.length === 0) return;
  try {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('staff_id', staffId)
      .in('approval_id', approvalIds);
  } catch {
    // silent — 알림 누락은 치명적 아님
  }
}

// ─────────────────────────────────────────────
// 메모 헬퍼
// ─────────────────────────────────────────────

export function useClassifiedApprovals(rows: ApprovalRow[], staffId: string | null) {
  return useMemo(() => {
    if (!staffId) {
      return { inbox: [], progress: [], done: [], sent: [], ref: [] };
    }
    return classifyForStaff(rows, staffId);
  }, [rows, staffId]);
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

    let countQuery = supabase
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
      config,
    });
  } catch (err) {
    // silent — 호출측에서 doc_number 없이 insert 진행
    console.warn('[mobile-approval] doc_number generation failed', err);
    return null;
  }
}
