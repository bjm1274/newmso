'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useActionDialog } from '@/app/components/useActionDialog';
import type { StaffMember, InventoryItem } from '@/types';
import { db, d1 } from '@/lib/db-client';
import { subscribeRealtime } from '@/lib/realtime-bus';
import { toast } from '@/lib/toast';
import {
  buildSupplyRequestWorkflowItems,
  createSupportInventoryItem,
  fetchSupportInventoryRows,
  findSupplySourceInventoryItem,
  INVENTORY_SUPPORT_COMPANY,
  INVENTORY_SUPPORT_DEPARTMENT,
  processInventoryIssue,
  requestInventoryReorder,
  reverseInventoryIssue,
  summarizeSupplyRequestWorkflow,
  type SupplyRequestWorkflowItem } from '@/app/main/inventory-utils';
import type { ApprovalRecord, LinkedSupplyOrderTarget } from '@/app/main/기능부품/재고관리서브/types';

function normalizeQueryError(error: unknown) {
  if (error instanceof Error) {
    const e = error as Error & Record<string, unknown>;
    return { message: error.message, details: e.details ?? null, hint: e.hint ?? null, code: e.code ?? null, status: e.status ?? null };
  }
  if (typeof error === 'object' && error !== null) {
    const e = error as Record<string, unknown>;
    return { message: typeof e.message === 'string' ? e.message : JSON.stringify(e), details: e.details ?? null, hint: e.hint ?? null, code: e.code ?? null, status: e.status ?? null };
  }
  return { message: typeof error === 'string' ? error : String(error), details: null, hint: null, code: null, status: null };
}

/**
 * 물품신청 공급 워크플로우 전체를 담당하는 훅.
 * 승인 목록 로딩, 실시간 구독, 출고/발주/취소 핸들러를 포함.
 */
export function useSupplyWorkflow({
  user,
  isInventoryOpsUser,
  activeView,
  refreshCurrentInventory,
  fetchLogs,
  onRefresh }: {
  user?: StaffMember;
  isInventoryOpsUser: boolean;
  activeView: string;
  refreshCurrentInventory: () => Promise<void> | void;
  fetchLogs: () => Promise<void>;
  onRefresh?: () => void;
}) {
  const { dialog, openConfirm } = useActionDialog();
  const [pendingSupplyApprovals, setPendingSupplyApprovals] = useState<ApprovalRecord[]>([]);
  const [completedSupplyApprovals, setCompletedSupplyApprovals] = useState<ApprovalRecord[]>([]);
  const [workflowActionKey, setWorkflowActionKey] = useState<string | null>(null);
  const [highlightedSupplyApprovalId, setHighlightedSupplyApprovalId] = useState<string | null>(null);
  const [highlightedSupplyOrderTarget, setHighlightedSupplyOrderTarget] = useState<LinkedSupplyOrderTarget | null>(null);

  // ── 승인 목록 로딩 ──
  const fetchPendingSupplyApprovals = useCallback(async () => {
    if (!isInventoryOpsUser) {
      setPendingSupplyApprovals([]);
      setCompletedSupplyApprovals([]);
      return;
    }
    try {
      const [{ data: approvalsData, error: approvalsError }, { data: supportInventoryRows, error: inventoryError }] =
        await Promise.all([
          db
            .from('approvals')
            .select('*')
            .eq('type', '물품신청')
            .eq('status', '승인')
            .order('created_at', { ascending: false })
            .returns<any[]>(),
          fetchSupportInventoryRows(),
        ]);
      if (approvalsError) { console.error('승인된 물품신청 처리 목록 로드 실패:', { source: 'approvals', ...normalizeQueryError(approvalsError) }); setPendingSupplyApprovals([]); setCompletedSupplyApprovals([]); return; }
      // 레거시 스키마(department 컬럼 없음)에서 오류 발생 시 빈 재고로 계속 처리
      if (inventoryError) { console.warn('승인된 물품신청 처리 — 재고 조회 실패, 빈 재고로 처리:', normalizeQueryError(inventoryError)); }

      const nextPending: ApprovalRecord[] = [];
      const nextCompleted: ApprovalRecord[] = [];

      (approvalsData || []).forEach((approval: Record<string, unknown>) => {
        const meta = approval?.meta_data as Record<string, unknown> | undefined;
        const workflowItems = buildSupplyRequestWorkflowItems(
          (meta?.items as Record<string, unknown>[] | undefined),
          supportInventoryRows || [],
          ((meta?.inventory_workflow as Record<string, unknown> | undefined)?.items as Record<string, unknown>[] | undefined),
        );
        if (workflowItems.length === 0) return;
        const summary = summarizeSupplyRequestWorkflow(workflowItems);
        const next = { ...approval, live_inventory_workflow: { items: workflowItems, summary } } as ApprovalRecord;
        const allHandled = workflowItems.every((w) => w.status === 'issued' || w.status === 'ordered');
        (allHandled ? nextCompleted : nextPending).push(next);
      });

      nextCompleted.sort((a, b) => {
        const getLatest = (ap: ApprovalRecord) => {
          const times = ((ap?.live_inventory_workflow?.items as Record<string, unknown>[] || []).map((i) => i?.processed_at ? new Date(i.processed_at as string).getTime() : 0));
          return times.length > 0 ? Math.max(...times) : 0;
        };
        return getLatest(b) - getLatest(a);
      });

      setPendingSupplyApprovals(nextPending);
      setCompletedSupplyApprovals(nextCompleted);
    } catch (error) {
      console.error('승인된 물품신청 처리 목록 로드 실패:', { source: 'workflow_processing', ...normalizeQueryError(error) });
      setPendingSupplyApprovals([]);
      setCompletedSupplyApprovals([]);
    }
  }, [isInventoryOpsUser]);

  // ── 워크플로우 메타데이터 업데이트 ──
  const updateSupplyApprovalWorkflow = useCallback(async (approval: ApprovalRecord, nextItems: SupplyRequestWorkflowItem[]) => {
    const summary = summarizeSupplyRequestWorkflow(nextItems);
    const workflowStatus = nextItems.every((i) => i.status === 'issued' || i.status === 'ordered') ? 'completed' : 'processing';
    const nextWorkflow = {
      ...(approval?.meta_data?.inventory_workflow || {}),
      status: workflowStatus,
      source_company: INVENTORY_SUPPORT_COMPANY,
      source_department: INVENTORY_SUPPORT_DEPARTMENT,
      updated_at: new Date().toISOString(),
      items: nextItems,
      summary };
    const nextMetaData = { ...(approval?.meta_data || {}), inventory_workflow: nextWorkflow };
    const { error } = await db.from('approvals').update({ meta_data: nextMetaData }).eq('id', approval.id);
    if (error) throw error;
    return nextWorkflow;
  }, []);

  // ── 최종불출 처리 ──
  const handleSupplyIssue = useCallback(async (approval: ApprovalRecord, workflowItem: Record<string, unknown>) => {
    const itemName = String(workflowItem.name || '');
    const itemQty = Number(workflowItem.qty || 0);
    const confirmed = await openConfirm({
      title: '최종불출 처리',
      description: `${itemName} ${itemQty}개를 신청팀으로 불출 처리합니다.\n재고가 SY INC.에서 차감되고 신청팀으로 이동됩니다.`,
      confirmText: '불출 처리',
      tone: 'accent' });
    if (!confirmed) return;

    const actionKey = `${approval.id}:${workflowItem.request_index}:issue`;
    setWorkflowActionKey(actionKey);
    try {
      const { data: supportRows, error: invErr } = await fetchSupportInventoryRows();
      if (invErr) throw invErr;
      const liveItems = buildSupplyRequestWorkflowItems(
        approval?.meta_data?.items, supportRows || [],
        (approval?.meta_data?.inventory_workflow as Record<string, unknown> | undefined)?.items as Record<string, unknown>[] | undefined,
      );
      const cur = liveItems.find((i) => Number(i.request_index) === Number(workflowItem.request_index));
      if (!cur) throw new Error('처리할 물품신청 항목을 찾지 못했습니다.');
      if (cur.status === 'issued') return;
      if (cur.recommended_action !== 'issue') throw new Error('현재 재고가 부족하여 바로 불출할 수 없습니다.');

      const sourceItem = (supportRows || []).find((r) => String(r.id) === String(cur.source_inventory_id))
        || findSupplySourceInventoryItem(supportRows || [], cur.name);
      if (!sourceItem) throw new Error('경영지원팀 원본 재고를 찾지 못했습니다.');

      await processInventoryIssue({
        sourceItem, inventoryRows: supportRows || [],
        quantity: cur.qty,
        toCompany: approval?.sender_company || INVENTORY_SUPPORT_COMPANY,
        toDept: cur.dept || '',
        reason: `전자결재 승인 물품신청 (${approval.title})`,
        user, destinationCompanyId: approval?.company_id ?? null });

      const nextItems: SupplyRequestWorkflowItem[] = liveItems.map((i) =>
        Number(i.request_index) === Number(cur.request_index)
          ? { ...i, status: 'issued' as const, processed_at: new Date().toISOString(), processed_by_id: user?.id || null, processed_by_name: user?.name || null, note: '경영지원팀 재고에서 불출 처리 완료' }
          : i,
      );
      await updateSupplyApprovalWorkflow(approval, nextItems);

      if (approval?.sender_id) {
        await d1.from('notifications').insert([{
          user_id: approval.sender_id, type: 'inventory',
          title: `[불출 완료] ${cur.name}`,
          body: `${cur.name} ${cur.qty}개가 ${cur.dept || '수령부서'}로 불출 처리되었습니다.`,
          metadata: { approval_id: approval.id, request_index: cur.request_index } }]);
      }
      await Promise.all([refreshCurrentInventory(), fetchLogs(), fetchPendingSupplyApprovals()]);
      onRefresh?.();
      toast('불출 처리가 완료되었습니다.', 'success');
    } catch (error: unknown) {
      console.error('물품신청 불출 처리 실패:', error);
      const raw = (error as Error)?.message || '';
      const msg =
        raw === 'INSUFFICIENT_STOCK'
          ? '재고가 부족하여 불출할 수 없습니다.'
          : raw.includes('INVENTORY_PERIOD_LOCKED')
            ? '해당 월 재고가 마감되어 불출할 수 없습니다.'
            : raw || '불출 처리 중 오류가 발생했습니다.';
      toast(msg, 'error');
    } finally {
      setWorkflowActionKey(null);
    }
  }, [fetchLogs, fetchPendingSupplyApprovals, onRefresh, openConfirm, refreshCurrentInventory, updateSupplyApprovalWorkflow, user]);

  // ── 발주 처리 ──
  const handleSupplyOrder = useCallback(async (approval: ApprovalRecord, workflowItem: Record<string, unknown>) => {
    const actionKey = `${approval.id}:${workflowItem.request_index}:order`;
    setWorkflowActionKey(actionKey);
    try {
      const { data: supportRows, error: invErr } = await fetchSupportInventoryRows();
      if (invErr) throw invErr;
      const liveItems = buildSupplyRequestWorkflowItems(
        approval?.meta_data?.items, supportRows || [],
        (approval?.meta_data?.inventory_workflow as Record<string, unknown> | undefined)?.items as Record<string, unknown>[] | undefined,
      );
      const cur = liveItems.find((i) => Number(i.request_index) === Number(workflowItem.request_index));
      if (!cur) throw new Error('처리할 물품신청 항목을 찾지 못했습니다.');
      if (cur.status === 'ordered') return;

      const sourceItem = (supportRows || []).find((r) => String(r.id) === String(cur.source_inventory_id))
        || findSupplySourceInventoryItem(supportRows || [], cur.name);

      let orderRequested = false;
      let note = '기준 재고가 없어 수동 발주가 필요합니다.';

      // SY INC.에 품목이 있으면 기존 로직, 없으면 자동 등록 후 발주
      const effectiveItem = sourceItem || await createSupportInventoryItem(cur);

      if (effectiveItem) {
        const reorderQty = Math.max(cur.shortage_qty || cur.qty, 1);
        const isNewlyCreated = !sourceItem;
        const { error } = await requestInventoryReorder({
          item: effectiveItem, user, quantity: reorderQty,
          reason: isNewlyCreated
            ? `[승인 연동 발주] ${approval.title}\n${cur.name} — SY INC. 미등록 품목 자동 등록 후 발주 / 수령부서: ${cur.dept || '-'}`
            : `[승인 연동 발주] ${approval.title}\n${cur.name} ${reorderQty}개 보충 필요 / 수령부서: ${cur.dept || '-'}`,
          metaData: {
            source_supply_approval_id: approval.id, source_supply_request_index: cur.request_index,
            source_supply_title: approval.title, source_requester_name: approval?.sender_name || null,
            source_requester_company: approval?.sender_company || null, source_requester_department: cur.dept || null,
            source_requested_quantity: cur.qty, source_shortage_quantity: reorderQty,
            auto_created_item: isNewlyCreated } });
        if (error) throw error;
        orderRequested = true;
        note = isNewlyCreated
          ? `SY INC. 신규 품목 등록 + 자동 발주 기안 생성 (${reorderQty}개)`
          : `자동 발주 기안을 생성했습니다. 보충 수량 ${reorderQty}개`;
      }

      const nextItems: SupplyRequestWorkflowItem[] = liveItems.map((i) =>
        Number(i.request_index) === Number(cur.request_index)
          ? { ...i, status: 'ordered' as const, processed_at: new Date().toISOString(), processed_by_id: user?.id || null, processed_by_name: user?.name || null, order_approval_requested: orderRequested, note }
          : i,
      );
      await updateSupplyApprovalWorkflow(approval, nextItems);

      if (approval?.sender_id) {
        await d1.from('notifications').insert([{
          user_id: approval.sender_id, type: 'inventory',
          title: `[발주 진행] ${cur.name}`,
          body: `${cur.name} ${cur.qty}개는 재고가 부족해 발주 절차로 전환되었습니다.`,
          metadata: { approval_id: approval.id, request_index: cur.request_index } }]);
      }
      await fetchPendingSupplyApprovals();
      toast(orderRequested ? '발주 요청을 등록했습니다. 발주 관리 탭에서 이어서 확인할 수 있습니다.' : '자동 발주 기준 재고가 없어 발주 필요 상태로만 표시했습니다.', 'success');
    } catch (error: unknown) {
      console.error('물품신청 발주 처리 실패:', error);
      toast((error as Error)?.message || '발주 처리 중 오류가 발생했습니다.', 'error');
    } finally {
      setWorkflowActionKey(null);
    }
  }, [fetchPendingSupplyApprovals, updateSupplyApprovalWorkflow, user]);

  // ── 발주 취소 ──
  const handleSupplyOrderCancel = useCallback(async (approval: ApprovalRecord, workflowItem: Record<string, unknown>) => {
    if (workflowItem.order_approval_requested) {
      toast('자동으로 생성된 발주 요청이 있으면 발주 관리에서 먼저 확인해 주세요.', 'warning');
      return;
    }
    const confirmed = await openConfirm({
      title: '발주 처리 취소',
      description: '이 항목의 발주 처리 상태를 취소하고 다시 발주 필요 상태로 되돌립니다.',
      confirmText: '되돌리기',
      tone: 'danger' });
    if (!confirmed) return;

    const actionKey = `${approval.id}:${workflowItem.request_index}:order-cancel`;
    setWorkflowActionKey(actionKey);
    try {
      const { data: supportRows, error: invErr } = await fetchSupportInventoryRows();
      if (invErr) throw invErr;
      const liveItems = buildSupplyRequestWorkflowItems(
        approval?.meta_data?.items, supportRows || [],
        (approval?.meta_data?.inventory_workflow as Record<string, unknown> | undefined)?.items as Record<string, unknown>[] | undefined,
      );
      const cur = liveItems.find((i) => Number(i.request_index) === Number(workflowItem.request_index));
      if (!cur) throw new Error('취소할 물품신청 항목을 찾지 못했습니다.');
      if (cur.status !== 'ordered') return;

      const fallbackNote = cur.recommended_action === 'order' && !cur.source_inventory_id ? '기준 재고가 없어 수동 발주가 필요합니다.' : null;
      const nextItems: SupplyRequestWorkflowItem[] = liveItems.map((i) =>
        Number(i.request_index) === Number(cur.request_index)
          ? { ...i, status: (cur.recommended_action === 'issue' ? 'issue_ready' : 'order_required') as SupplyRequestWorkflowItem['status'], processed_at: null, processed_by_id: null, processed_by_name: null, order_approval_requested: false, note: fallbackNote }
          : i,
      );
      await updateSupplyApprovalWorkflow(approval, nextItems);
      await fetchPendingSupplyApprovals();
      toast('발주 처리를 취소했고 다시 발주 필요 상태로 돌려두었습니다.', 'success');
    } catch (error: unknown) {
      console.error('물품신청 발주 처리 취소 실패:', error);
      toast((error as Error)?.message || '발주 처리 취소 중 오류가 발생했습니다.', 'error');
    } finally {
      setWorkflowActionKey(null);
    }
  }, [fetchPendingSupplyApprovals, openConfirm, updateSupplyApprovalWorkflow]);

  // ── 불출 취소 ──
  const handleSupplyIssueCancel = useCallback(async (approval: ApprovalRecord, workflowItem: Record<string, unknown>) => {
    const confirmed = await openConfirm({
      title: '불출 처리 취소',
      description: '이 품목의 불출 처리를 취소하고 재고를 원복합니다.\nSY INC. 재고가 복원되고 수령팀 재고가 차감됩니다.',
      confirmText: '불출 취소',
      tone: 'danger' });
    if (!confirmed) return;

    const actionKey = `${approval.id}:${workflowItem.request_index}:issue-cancel`;
    setWorkflowActionKey(actionKey);
    try {
      const { data: supportRows, error: invErr } = await fetchSupportInventoryRows();
      if (invErr) throw invErr;
      const liveItems = buildSupplyRequestWorkflowItems(
        approval?.meta_data?.items, supportRows || [],
        (approval?.meta_data?.inventory_workflow as Record<string, unknown> | undefined)?.items as Record<string, unknown>[] | undefined,
      );
      const cur = liveItems.find((i) => Number(i.request_index) === Number(workflowItem.request_index));
      if (!cur) throw new Error('취소할 물품신청 항목을 찾지 못했습니다.');
      if (cur.status !== 'issued') return;
      if (!cur.source_inventory_id) throw new Error('원본 재고 정보를 찾을 수 없습니다.');

      await reverseInventoryIssue({
        sourceItemId: cur.source_inventory_id,
        destinationCompany: approval?.sender_company || '',
        destinationDept: cur.dept || '',
        itemName: cur.name,
        quantity: cur.qty,
        reason: `전자결재 물품신청 불출 취소 (${approval.title})`,
        user });

      const nextItems: SupplyRequestWorkflowItem[] = liveItems.map((i) =>
        Number(i.request_index) === Number(cur.request_index)
          ? { ...i, status: 'issue_ready' as const, processed_at: null, processed_by_id: null, processed_by_name: null, note: '불출 취소됨 — 재고 원복 완료' }
          : i,
      );
      await updateSupplyApprovalWorkflow(approval, nextItems);

      if (approval?.sender_id) {
        await d1.from('notifications').insert([{
          user_id: approval.sender_id, type: 'inventory',
          title: `[불출 취소] ${cur.name}`,
          body: `${cur.name} ${cur.qty}개의 불출이 취소되었습니다. 재고가 원복되었습니다.`,
          metadata: { approval_id: approval.id, request_index: cur.request_index } }]);
      }

      await Promise.all([refreshCurrentInventory(), fetchLogs(), fetchPendingSupplyApprovals()]);
      onRefresh?.();
      toast('불출을 취소하고 재고를 원복했습니다.', 'success');
    } catch (error: unknown) {
      console.error('물품신청 불출 취소 실패:', error);
      const raw = (error as Error)?.message || '';
      const msg =
        raw === 'INSUFFICIENT_STOCK'
          ? '수령처 재고가 부족하여 불출을 취소할 수 없습니다. 이미 소모된 경우 수동 조정하세요.'
          : raw.includes('INVENTORY_PERIOD_LOCKED')
            ? '해당 월 재고가 마감되어 불출을 취소할 수 없습니다.'
            : raw || '불출 취소 중 오류가 발생했습니다.';
      toast(msg, 'error');
    } finally {
      setWorkflowActionKey(null);
    }
  }, [fetchLogs, fetchPendingSupplyApprovals, onRefresh, openConfirm, refreshCurrentInventory, updateSupplyApprovalWorkflow, user]);

  // ── 실시간 구독 ──
  useEffect(() => {
    if (!isInventoryOpsUser || activeView !== '현황') return;
    const unsubscribe = subscribeRealtime(
      `inventory-supply-approvals-${user?.id || 'guest'}`,
      [{ table: 'approvals', event: '*' }],
      () => { void fetchPendingSupplyApprovals(); },
      { pollIntervalMs: 5000 },
    );
    return unsubscribe;
  }, [activeView, fetchPendingSupplyApprovals, isInventoryOpsUser, user?.id]);

  // ── 요약 ──
  const pendingSupplyApprovalSummary = useMemo(() =>
    pendingSupplyApprovals.reduce<{ approval_count: number; issue_ready_count: number; order_required_count: number }>(
      (s, a) => {
        const ws = a?.live_inventory_workflow?.summary;
        s.approval_count += 1;
        s.issue_ready_count += Number(ws?.issue_ready_count || 0);
        s.order_required_count += Number(ws?.order_required_count || 0);
        return s;
      },
      { approval_count: 0, issue_ready_count: 0, order_required_count: 0 },
    ),
    [pendingSupplyApprovals],
  );

  const completedSupplyApprovalSummary = useMemo(() =>
    completedSupplyApprovals.reduce<{ approval_count: number; issued_count: number; ordered_count: number }>(
      (s, a) => {
        const ws = a?.live_inventory_workflow?.summary;
        s.approval_count += 1;
        s.issued_count += Number(ws?.issued_count || 0);
        s.ordered_count += Number(ws?.ordered_count || 0);
        return s;
      },
      { approval_count: 0, issued_count: 0, ordered_count: 0 },
    ),
    [completedSupplyApprovals],
  );

  return {
    dialog,
    pendingSupplyApprovals,
    completedSupplyApprovals,
    workflowActionKey,
    highlightedSupplyApprovalId, setHighlightedSupplyApprovalId,
    highlightedSupplyOrderTarget, setHighlightedSupplyOrderTarget,
    fetchPendingSupplyApprovals,
    handleSupplyIssue,
    handleSupplyIssueCancel,
    handleSupplyOrder,
    handleSupplyOrderCancel,
    pendingSupplyApprovalSummary,
    completedSupplyApprovalSummary };
}
