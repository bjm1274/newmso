'use client';
import { useActionDialog } from '@/app/components/useActionDialog';
import { toast } from '@/lib/toast';

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db-client';
import {
  getItemMinQuantity,
  getItemName,
  getItemQuantity,
  getItemUnitPrice,
  getRecommendedOrderQuantity } from '@/app/main/inventory-utils';
import {
  formatStockApiError,
  inspectPurchaseOrder,
  receivePurchaseOrder } from '@/lib/inventory-stock-client';
import { OrderStatusStepper } from './InventoryComponents';

type OrderRecord = {
  id: string;
  sourceType: 'purchase_order' | 'approval';
  created_at: string;
  supplier_name: string;
  items: any[];
  status: string;
  total_amount: number;
  notes: string | null;
  expected_delivery_date?: string | null;
  received_qty?: number;
  inspection_status?: string | null;
  inspected_at?: string | null;
  inspected_by_name?: string | null;
  requestTitle?: string | null;
  requesterName?: string | null;
  sourceApprovalId?: string | null;
  sourceRequestIndex?: number | null;
};

/** 발주입고(GRN) 가능 상태 */
function canReceivePurchaseOrder(status: string): boolean {
  const s = status.trim();
  return (
    s === '승인' ||
    s === '확정' ||
    s === '배송' ||
    s === '배송 중' ||
    s === '승인 완료'
  );
}

function lineOrderedQty(item: any): number {
  return Math.max(0, Math.trunc(Number(item?.qty ?? item?.quantity ?? 0) || 0));
}

function lineReceivedQty(item: any): number {
  return Math.max(0, Math.trunc(Number(item?.received_qty ?? item?.receivedQty ?? 0) || 0));
}

function lineRemainingQty(item: any): number {
  return Math.max(0, lineOrderedQty(item) - lineReceivedQty(item));
}

function orderRemainingQty(order: OrderRecord): number {
  return (order.items || []).reduce((sum: number, it: any) => sum + lineRemainingQty(it), 0);
}

function getStepperStatus(status: string, sourceType: 'purchase_order' | 'approval'): '요청' | '검토' | '결재' | '발주' | '입고' | '완료' {
  const s = status.trim();
  if (s === '완료' || s === '납품 완료') return '완료';
  if (s === '배송' || s === '배송 중') return '입고';
  if (s === '확정' || s === '승인' || s === '승인 완료') {
    return '발주';
  }
  if (sourceType === 'approval') {
    return '결재';
  }
  return '요청';
}

function buildSourceKey(sourceApprovalId?: string | null, sourceRequestIndex?: number | null) {
  if (!sourceApprovalId || !Number.isInteger(sourceRequestIndex)) return null;
  return `${sourceApprovalId}:${sourceRequestIndex}`;
}

function parseOrderItems(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizePurchaseOrderRecord(order: any): OrderRecord {
  const items = parseOrderItems(order?.items);

  return {
    id: String(order?.id || ''),
    sourceType: 'purchase_order',
    created_at: order?.created_at || new Date().toISOString(),
    supplier_name: String(order?.supplier_name || '미정'),
    items,
    status: String(order?.status || '대기'),
    total_amount: Number(order?.total_amount || 0),
    notes: typeof order?.notes === 'string' ? order.notes : null,
    expected_delivery_date: typeof order?.expected_delivery_date === 'string' ? order.expected_delivery_date : null,
    received_qty: Number(order?.received_qty || 0) || 0,
    inspection_status: order?.inspection_status ? String(order.inspection_status) : null,
    inspected_at: typeof order?.inspected_at === 'string' ? order.inspected_at : null,
    inspected_by_name: typeof order?.inspected_by_name === 'string' ? order.inspected_by_name : null,
    sourceApprovalId: items[0]?.source_supply_approval_id ? String(items[0].source_supply_approval_id) : null,
    sourceRequestIndex: Number.isInteger(Number(items[0]?.source_supply_request_index))
      ? Number(items[0].source_supply_request_index)
      : null };
}

function calcDday(dateStr: string | null | undefined): { label: string; tone: string } | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const diffDays = Math.round((targetDay.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return { label: `D+${Math.abs(diffDays)} 지연`, tone: 'bg-red-500/10 text-red-600' };
  if (diffDays === 0) return { label: 'D-day 오늘', tone: 'bg-orange-500/10 text-orange-600' };
  if (diffDays <= 3) return { label: `D-${diffDays} 임박`, tone: 'bg-orange-500/10 text-orange-500' };
  return { label: `D-${diffDays}`, tone: 'bg-[var(--muted)] text-[var(--toss-gray-3)]' };
}

function normalizeApprovalOrderRecord(approval: any): OrderRecord {
  const meta = approval?.meta_data || {};
  const quantity = Math.max(1, Number(meta?.quantity) || 1);
  const unitPrice = Number(meta?.unit_price || 0);

  return {
    id: String(approval?.id || ''),
    sourceType: 'approval',
    created_at: approval?.created_at || new Date().toISOString(),
    supplier_name: String(meta?.supplier_name || meta?.supplier || '미정'),
    items: [
      {
        item_id: meta?.inventory_id || null,
        name: meta?.item_name || '품목',
        qty: quantity,
        unit_price: unitPrice,
        source_supply_approval_id: meta?.source_supply_approval_id || null,
        source_supply_request_index: meta?.source_supply_request_index ?? null },
    ],
    status: String(approval?.status || '대기'),
    total_amount: Number(meta?.total_amount || quantity * unitPrice),
    notes: typeof approval?.content === 'string' ? approval.content : null,
    requestTitle: typeof meta?.source_supply_title === 'string' ? meta.source_supply_title : null,
    requesterName: typeof meta?.source_requester_name === 'string' ? meta.source_requester_name : null,
    sourceApprovalId: meta?.source_supply_approval_id ? String(meta.source_supply_approval_id) : null,
    sourceRequestIndex: Number.isInteger(Number(meta?.source_supply_request_index))
      ? Number(meta.source_supply_request_index)
      : null };
}

function getStatusTone(status: string, sourceType: OrderRecord['sourceType']) {
  if (status === '승인') return 'bg-emerald-50 text-emerald-600';
  if (status === '반려') return 'bg-red-500/10 text-red-600';
  if (sourceType === 'approval') return 'bg-orange-500/10 text-orange-600';
  return 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]';
}

export default function PurchaseOrderManagement({
  user,
  inventory,
  suppliers,
  highlightedSource,
  onConsumeHighlightedSource }: Record<string, unknown>) {
  const { dialog, openConfirm } = useActionDialog();
  const [orderRecords, setOrderRecords] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [highlightedOrderId, setHighlightedOrderId] = useState<string | null>(null);
  const [editingDeliveryDateId, setEditingDeliveryDateId] = useState<string | null>(null);
  const [deliveryDateInput, setDeliveryDateInput] = useState('');
  const [savingDeliveryDate, setSavingDeliveryDate] = useState(false);
  const [receivingOrderId, setReceivingOrderId] = useState<string | null>(null);
  /** 부분 입고 편집 중 발주 id */
  const [receiveDraftOrderId, setReceiveDraftOrderId] = useState<string | null>(null);
  /** 라인별 이번 입고 수량 (index → qty) */
  const [receiveDraftQtys, setReceiveDraftQtys] = useState<Record<number, number>>({});
  /** 입고 이력 펼침 */
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);
  const [historyByOrder, setHistoryByOrder] = useState<
    Record<string, Array<{ at: string; qty: number; actor: string; notes: string; item: string }>>
  >({});
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null);
  const [inspectingId, setInspectingId] = useState<string | null>(null);

  useEffect(() => {
    void fetchPurchaseOrders();
    checkLowStockItems();
  }, [inventory]);

  useEffect(() => {
    const _highlightedSource = highlightedSource as Record<string, unknown>;
    const sourceKey = buildSourceKey(
      (_highlightedSource?.approvalId as string) || null,
      Number.isInteger(Number(_highlightedSource?.requestIndex)) ? Number(_highlightedSource.requestIndex) : null,
    );
    if (!sourceKey || orderRecords.length === 0) return;

    const matchedRecord = orderRecords.find(
      (record) => buildSourceKey(record.sourceApprovalId, record.sourceRequestIndex) === sourceKey,
    );
    if (!matchedRecord) return;

    setHighlightedOrderId(matchedRecord.id);

    const selector =
      matchedRecord.sourceApprovalId && Number.isInteger(matchedRecord.sourceRequestIndex)
        ? `[data-testid="purchase-order-linked-${matchedRecord.sourceApprovalId}-${matchedRecord.sourceRequestIndex}"]`
        : `[data-testid="purchase-order-card-${matchedRecord.id}"]`;

    const scrollTimer = window.setTimeout(() => {
      const target = document.querySelector(selector);
      if (target instanceof HTMLElement) {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }, 120);

    const clearTimer = window.setTimeout(() => {
      setHighlightedOrderId((current) => (current === matchedRecord.id ? null : current));
    }, 2600);

    (onConsumeHighlightedSource as (() => void) | undefined)?.();

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [highlightedSource, onConsumeHighlightedSource, orderRecords]);

  const supplierNames = useMemo(
    () =>
      Array.from(
        new Set(
          (Array.isArray(suppliers) ? suppliers : [])
            .map((supplier: any) => String(supplier?.name || supplier?.supplier_name || '').trim())
            .filter(Boolean),
        ),
      ),
    [suppliers],
  );

  const fetchPurchaseOrders = async () => {
    try {
      const [
        { data: purchaseOrderRows, error: purchaseOrderError },
        { data: approvalRows, error: approvalError },
      ] = await Promise.all([
        db
          .from('purchase_orders')
          .select(
            'id, created_at, supplier_name, items, status, total_amount, notes, expected_delivery_date, received_qty, inspection_status, inspected_at, inspected_by_name',
          )
          .order('created_at', { ascending: false }),
        db
          .from('approvals')
          .select('id, created_at, status, content, meta_data, type')
          .eq('type', '비품구매')
          .order('created_at', { ascending: false }),
      ]);

      if (purchaseOrderError) throw purchaseOrderError;
      if (approvalError) throw approvalError;

      const nextRecords = [
        ...(purchaseOrderRows || []).map(normalizePurchaseOrderRecord),
        ...(approvalRows || []).map(normalizeApprovalOrderRecord),
      ].sort(
        (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
      );

      setOrderRecords(nextRecords);
    } catch (err) {
      console.error('발주 목록 조회 실패:', err);
      setOrderRecords([]);
    }
  };

  const checkLowStockItems = () => {
    const items = (inventory as any[]).filter((item: any) => getItemQuantity(item) <= getItemMinQuantity(item));
    setLowStockItems(items);
  };

  const handleAutoGeneratePurchaseOrder = async () => {
    if (lowStockItems.length === 0) return toast('발주가 필요한 항목이 없습니다.', 'warning');
    const confirmed = await openConfirm({
      title: '발주서 자동 생성',
      description: `${lowStockItems.length}개 항목에 대한 발주서를 자동으로 생성합니다.\n공급사별로 묶어 대기 발주로 등록됩니다.`,
      confirmText: '생성',
      tone: 'accent' });
    if (!confirmed) return;

    setLoading(true);
    try {
      const itemsBySupplier = lowStockItems.reduce(
        (acc: Record<string, { supplierId: string | null; items: any[] }>, item: any) => {
          const supplierName =
            String(item?.supplier_name || item?.supplier || '').trim() ||
            supplierNames[0] ||
            '미정';
          if (!acc[supplierName]) acc[supplierName] = { supplierId: null, items: [] };
          // 그룹 내 supplier_id는 첫 유효 값 사용(FK 연결, schema.ts purchase_orders.supplier_id)
          const sid = typeof item?.supplier_id === 'string' ? item.supplier_id.trim() : '';
          if (sid && !acc[supplierName].supplierId) acc[supplierName].supplierId = sid;
          acc[supplierName].items.push({
            item_id: item.id,
            name: getItemName(item),
            qty: getRecommendedOrderQuantity(item),
            unit_price: getItemUnitPrice(item) });
          return acc;
        },
        {},
      );

      for (const [supplierName, group] of Object.entries(itemsBySupplier)) {
        const { supplierId, items } = group;
        const totalAmount = items.reduce(
          (sum, item) => sum + Number(item.qty || 0) * Number(item.unit_price || 0),
          0,
        );

        const { error } = await db.from('purchase_orders').insert([
          {
            supplier_id: supplierId,
            supplier_name: supplierName,
            items,
            status: '대기',
            total_amount: totalAmount,
            created_by: (user as Record<string, unknown>).id,
            notes: '자동 생성된 발주서 (안전재고 미달)' },
        ]);

        if (error) throw error;
      }

      toast(`발주서가 생성되었습니다.\n대상 항목: ${lowStockItems.length}건`);
      await fetchPurchaseOrders();
    } catch (err) {
      toast('발주서 생성에 실패했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApprovePurchaseOrder = async (orderId: string) => {
    const order = orderRecords.find((item) => item.id === orderId);
    const confirmed = await openConfirm({
      title: '발주서 확인 처리',
      description: `${order?.requestTitle || order?.supplier_name || '선택한 발주서'}를 승인 상태로 변경합니다.\n확인 처리 후 발주 진행 현황에 반영됩니다.`,
      confirmText: '확인 처리',
      tone: 'accent' });
    if (!confirmed) return;
    try {
      const { error } = await db.from('purchase_orders').update({ status: '승인' }).eq('id', orderId);
      if (error) throw error;
      toast('발주서가 승인 처리되었습니다.', 'success');
      await fetchPurchaseOrders();
    } catch (err) {
      toast('발주서 승인 처리에 실패했습니다.', 'error');
    }
  };

  const handleSaveDeliveryDate = async (orderId: string) => {
    if (!deliveryDateInput) { setEditingDeliveryDateId(null); return; }
    setSavingDeliveryDate(true);
    try {
      const { error } = await db
        .from('purchase_orders')
        .update({ expected_delivery_date: deliveryDateInput })
        .eq('id', orderId);
      if (error) throw error;
      setOrderRecords((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, expected_delivery_date: deliveryDateInput } : o))
      );
      toast('입고 예정일이 저장되었습니다.', 'success');
    } catch {
      toast('저장에 실패했습니다.', 'error');
    } finally {
      setSavingDeliveryDate(false);
      setEditingDeliveryDateId(null);
      setDeliveryDateInput('');
    }
  };

  /** 부분 입고 패널 열기 — 라인별 기본 수량은 잔여(발주−누적입고) */
  const openReceiveDraft = (orderId: string) => {
    const order = orderRecords.find((item) => item.id === orderId);
    if (!order || order.sourceType !== 'purchase_order') return;
    if (!canReceivePurchaseOrder(order.status)) {
      toast('승인·확정 이후 발주만 입고할 수 있습니다.', 'error');
      return;
    }
    if (orderRemainingQty(order) <= 0) {
      toast('모든 라인이 입고 완료되었습니다.', 'success');
      return;
    }
    const defaults: Record<number, number> = {};
    (order.items || []).forEach((item: any, idx: number) => {
      defaults[idx] = lineRemainingQty(item);
    });
    setReceiveDraftOrderId(orderId);
    setReceiveDraftQtys(defaults);
  };

  const closeReceiveDraft = () => {
    setReceiveDraftOrderId(null);
    setReceiveDraftQtys({});
  };

  const loadReceiveHistory = async (orderId: string) => {
    if (historyOpenId === orderId) {
      setHistoryOpenId(null);
      return;
    }
    setHistoryOpenId(orderId);
    if (historyByOrder[orderId]) return;
    setHistoryLoadingId(orderId);
    try {
      const { data, error } = await db
        .from('inventory_logs')
        .select('quantity,actor_name,notes,created_at,change_type,type,item_id,inventory_id')
        .eq('purchase_order_id', orderId)
        .order('created_at', { ascending: false })
        .limit(40);
      if (error) throw error;
      const rows = (Array.isArray(data) ? data : []).map((r: any) => {
        const notes = String(r?.notes || '');
        const nameMatch = notes.match(/·\s*(.+?)(?:\s*\(|$)/);
        return {
          at: String(r?.created_at || ''),
          qty: Number(r?.quantity || 0) || 0,
          actor: String(r?.actor_name || '—'),
          notes,
          item: nameMatch?.[1]?.trim() || String(r?.change_type || r?.type || '발주입고'),
        };
      });
      setHistoryByOrder((prev) => ({ ...prev, [orderId]: rows }));
    } catch (e) {
      console.error(e);
      toast('입고 이력을 불러오지 못했습니다.', 'error');
    } finally {
      setHistoryLoadingId(null);
    }
  };

  const handleInspectPurchaseOrder = async (
    orderId: string,
    result: '합격' | '불합격',
  ) => {
    const order = orderRecords.find((o) => o.id === orderId);
    if (!order || order.sourceType !== 'purchase_order') return;
    if (orderRemainingQty(order) > 0) {
      toast('전량 입고 후 검수할 수 있습니다. (부분 입고 상태)', 'warning');
      return;
    }
    const confirmed = await openConfirm({
      title: `입고 검수 — ${result}`,
      description:
        result === '합격'
          ? '입고 수량을 검수 합격 처리합니다.'
          : '검수 불합격 시 입고 수량만큼 반품 출고로 재고를 원복합니다.',
      confirmText: result,
      tone: result === '합격' ? 'accent' : 'danger',
    });
    if (!confirmed) return;
    setInspectingId(orderId);
    try {
      const res = await inspectPurchaseOrder({
        purchaseOrderId: orderId,
        result,
        reverseOnFail: result === '불합격',
      });
      if (!res.ok) {
        throw new Error(formatStockApiError(res.error, res.code));
      }
      const reversed = res.data?.reversed?.length ?? 0;
      const reverseErrors = res.data?.reverseErrors?.length ?? 0;
      if (result === '불합격' && reverseErrors > 0) {
        // 예전에는 실패한 반품이 영구히 재시도 불가였다(서버가 검수 상태를 확정해 버려 재호출이
        // '이미 처리됨' 으로 막혔다). 이제 잔여 입고분이 남아 있으면 재실행이 가능하므로 그걸 안내한다.
        toast(
          `검수 불합격 처리됨. 반품 ${reversed}건 성공, ${reverseErrors}건 실패(재고 부족 등). 재고 확보 후 '불합격'을 다시 눌러 잔여분을 반품하세요.`,
          'warning',
        );
      } else if (result === '불합격' && reversed > 0) {
        toast(`검수 불합격 · 입고분 ${reversed}건 반품 처리되었습니다.`, 'success');
      } else {
        toast(`검수 ${result} 처리되었습니다.`, 'success');
      }
      await fetchPurchaseOrders();
    } catch (e) {
      console.error(e);
      toast((e as Error)?.message || '검수 처리에 실패했습니다.', 'error');
    } finally {
      setInspectingId(null);
    }
  };

  /** 승인/확정 발주 부분·전량 입고(GRN) → quantity SSOT + 발주입고 로그 */
  const handleReceivePurchaseOrder = async (orderId: string) => {
    const order = orderRecords.find((item) => item.id === orderId);
    if (!order || order.sourceType !== 'purchase_order') return;
    if (!canReceivePurchaseOrder(order.status)) {
      toast('승인·확정 이후 발주만 입고할 수 있습니다.', 'error');
      return;
    }

    const lines = (order.items || [])
      .map((item: any, idx: number) => {
        const itemName = String(item?.name || item?.item_name || '').trim();
        const remaining = lineRemainingQty(item);
        const draftQty =
          receiveDraftOrderId === orderId && receiveDraftQtys[idx] != null
            ? Math.max(0, Math.trunc(Number(receiveDraftQtys[idx]) || 0))
            : remaining;
        const qty = Math.min(draftQty, remaining);
        if (!itemName || qty <= 0) return null;
        return {
          itemName,
          qty,
          unitPrice: Number(item?.unit_price ?? item?.price ?? 0) || undefined,
          inventoryItemId: item?.item_id || item?.inventory_id || undefined,
        };
      })
      .filter(Boolean) as Array<{
      itemName: string;
      qty: number;
      unitPrice?: number;
      inventoryItemId?: string;
    }>;

    if (lines.length === 0) {
      toast('입고 수량이 0인 품목만 있습니다. 잔여 수량을 입력하세요.', 'error');
      return;
    }

    const totalQty = lines.reduce((sum, l) => sum + l.qty, 0);
    const confirmed = await openConfirm({
      title: '발주 입고 처리',
      description: `${order.supplier_name || '발주서'} · ${lines.length}품목 · 총 ${totalQty}개 입고합니다.\n라인별 누적 입고가 기록되고 전량 완료 시 납품 완료로 전환됩니다.`,
      confirmText: '입고 처리',
      tone: 'accent',
    });
    if (!confirmed) return;

    setReceivingOrderId(orderId);
    try {
      const result = await receivePurchaseOrder({
        purchaseOrderId: orderId,
        lines,
      });
      if (!result.ok) {
        throw new Error(formatStockApiError(result.error, result.code));
      }
      const doneLabel = result.data?.allComplete
        ? ' · 전량 입고 완료'
        : '';
      toast(
        `입고 완료: ${result.data?.received?.length ?? lines.length}품목 · ${totalQty}개${doneLabel}`,
        'success',
      );
      closeReceiveDraft();
      await fetchPurchaseOrders();
    } catch (err) {
      console.error('발주 입고 실패:', err);
      toast((err as Error)?.message || '발주 입고에 실패했습니다.', 'error');
    } finally {
      setReceivingOrderId(null);
    }
  };

  const pendingOrderCount = orderRecords.filter((order) => order.status !== '승인').length;
  const linkedOrderCount = orderRecords.filter((order) => order.sourceType === 'approval').length;
  const totalPendingAmount = orderRecords
    .filter((order) => order.status !== '승인')
    .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

  return (
    <div className="space-y-4 animate-in fade-in duration-500" data-testid="purchase-order-management-view">
      {dialog}
      <div className="bg-[var(--card)] p-4 border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)]">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-3">
          <div>
            <h2 className="text-base font-bold text-[var(--foreground)] tracking-tight">발주 관리</h2>
            <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
              자동 발주 승인안과 일반 발주서를 한 화면에서 확인할 수 있습니다.
            </p>
          </div>
          <button
            onClick={handleAutoGeneratePurchaseOrder}
            disabled={loading || lowStockItems.length === 0}
            data-testid="purchase-order-auto-generate"
            className="w-full md:w-auto px-4 py-2 bg-orange-600 text-white rounded-[var(--radius-md)] text-sm font-semibold shadow-sm shadow-orange-100 hover:scale-[0.98] transition-all disabled:opacity-50"
          >
            부족 품목 자동 발주 생성 ({lowStockItems.length})
          </button>
        </div>

        {lowStockItems.length === 0 ? (
          <div className="text-center py-10 bg-green-500/10 rounded-[var(--radius-md)] border border-dashed border-green-500/20">
            <p className="text-sm font-semibold text-green-600">현재 모든 품목이 안전재고 이상입니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            {lowStockItems.map((item: any) => (
              <div
                key={item.id}
                className="p-4 bg-orange-500/10 border border-orange-100 rounded-[var(--radius-md)] flex justify-between items-center"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">{getItemName(item)}</p>
                  <p className="text-[11px] font-bold text-orange-600 mt-1">
                    현재 {getItemQuantity(item)}개 / 최소 {getItemMinQuantity(item)}개
                  </p>
                </div>
                <span className="px-3 py-1 bg-orange-600 text-white rounded-[var(--radius-md)] text-[11px] font-semibold">
                  보충 필요
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-[var(--card)] p-4 border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)]">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-sm font-bold text-[var(--foreground)] tracking-tight">발주 이력 및 상태</h3>
            <p className="mt-0.5 text-xs text-[var(--toss-gray-3)]">
              물품신청에서 넘어온 자동 발주와 직접 생성한 발주서를 함께 표시합니다.
            </p>
          </div>
          <span className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-1 text-[11px] font-bold text-[var(--toss-gray-4)]">
            총 {orderRecords.length}건
          </span>
        </div>

        {orderRecords.length === 0 ? (
          <div className="text-center py-10 bg-[var(--muted)] rounded-[var(--radius-md)] border border-dashed border-[var(--border)]">
            <p className="text-sm font-semibold text-[var(--toss-gray-3)]">발주 이력이 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {orderRecords.map((order) => {
              const sourceKey = buildSourceKey(order.sourceApprovalId, order.sourceRequestIndex);
              const testId =
                order.sourceApprovalId && Number.isInteger(order.sourceRequestIndex)
                  ? `purchase-order-linked-${order.sourceApprovalId}-${order.sourceRequestIndex}`
                  : `purchase-order-card-${order.id}`;
              const isHighlighted = highlightedOrderId === order.id;

              return (
                <div
                  key={`${order.sourceType}-${order.id}`}
                  className={`p-4 border rounded-[var(--radius-md)] transition-all bg-[var(--card)] ${
                    isHighlighted
                      ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/20 shadow-sm'
                      : 'border-[var(--border)] hover:shadow-sm'
                  }`}
                  data-testid={testId}
                  data-source-key={sourceKey || ''}
                  data-highlighted={isHighlighted ? 'true' : 'false'}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-[var(--foreground)]">
                          {order.sourceType === 'approval' ? '전자결재 연동 발주' : `발주서 #${order.id.slice(0, 8)}`}
                        </p>
                        <span
                          className={`px-2 py-0.5 rounded-[var(--radius-md)] text-[11px] font-semibold ${getStatusTone(order.status, order.sourceType)}`}
                        >
                          {order.status}
                        </span>
                        {order.sourceType === 'approval' && (
                          <span className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-2 py-0.5 text-[11px] font-bold text-[var(--accent)]">
                            물품신청 연동
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--toss-gray-3)] font-bold mt-1 uppercase tracking-widest">
                        {new Date(order.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })} | {order.supplier_name || '미정'}
                      </p>
                      {order.requestTitle && (
                        <p className="mt-1 text-xs font-semibold text-[var(--foreground)]">
                          원본 문서: {order.requestTitle}
                        </p>
                      )}
                      {order.requesterName && (
                        <p className="mt-0.5 text-[11px] text-[var(--toss-gray-3)]">요청자: {order.requesterName}</p>
                      )}
                    </div>
                    {order.sourceType === 'approval' ? (
                      <div className="rounded-[var(--radius-md)] bg-orange-500/10 px-3 py-2 text-[11px] font-semibold text-orange-600">
                        {order.status === '승인' ? '전자결재 승인 완료' : '전자결재 승인 대기'}
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                        {order.status === '대기' && (
                          <button
                            type="button"
                            onClick={() => handleApprovePurchaseOrder(order.id)}
                            data-testid={`purchase-order-approve-${order.id}`}
                            className="w-full md:w-auto py-2 px-4 bg-green-600 text-white rounded-[var(--radius-md)] font-semibold text-xs shadow-sm hover:scale-[0.98] transition-all"
                          >
                            발주 확인
                          </button>
                        )}
                        {canReceivePurchaseOrder(order.status) &&
                          orderRemainingQty(order) > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              receiveDraftOrderId === order.id
                                ? closeReceiveDraft()
                                : openReceiveDraft(order.id)
                            }
                            disabled={receivingOrderId === order.id}
                            data-testid={`purchase-order-receive-${order.id}`}
                            className="w-full md:w-auto py-2 px-4 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-semibold text-xs shadow-sm hover:scale-[0.98] transition-all disabled:opacity-50"
                          >
                            {receiveDraftOrderId === order.id
                              ? '입고 닫기'
                              : Number(order.received_qty || 0) > 0
                                ? `추가 입고 (잔여 ${orderRemainingQty(order)})`
                                : '입고 처리'}
                          </button>
                        )}
                        {order.sourceType === 'purchase_order' &&
                          orderRemainingQty(order) <= 0 &&
                          (order.items || []).length > 0 &&
                          Number(order.received_qty || 0) > 0 && (
                          <span className="rounded-[var(--radius-md)] bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700">
                            전량 입고 완료
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 발주 단계 스테퍼 */}
                  <div className="my-3 py-2 border-y border-[var(--border-subtle)] bg-[var(--surface-subtle)]/30 rounded-xl px-2.5">
                    <OrderStatusStepper currentStatus={getStepperStatus(order.status, order.sourceType)} />
                  </div>

                  <div className="bg-[var(--muted)] p-3 rounded-[var(--radius-md)] mb-3">
                    <div className="space-y-2">
                      {(order.items || []).map((item: any, idx: number) => {
                        const ordered = lineOrderedQty(item);
                        const received = lineReceivedQty(item);
                        const remaining = lineRemainingQty(item);
                        const isDraft = receiveDraftOrderId === order.id;
                        return (
                          <div
                            key={`${order.id}-${idx}`}
                            className="flex justify-between items-center gap-4 text-xs font-bold text-[var(--toss-gray-4)]"
                          >
                            <span className="min-w-0 truncate">{item.name || item.item_name || '품목'}</span>
                            {isDraft ? (
                              <label className="flex items-center gap-1.5 shrink-0 font-semibold text-[var(--foreground)]">
                                <span className="text-[10px] text-[var(--toss-gray-3)] tabular-nums">
                                  발주 {ordered} · 입고 {received} · 잔여 {remaining}
                                </span>
                                <input
                                  type="number"
                                  min={0}
                                  max={remaining || undefined}
                                  step={1}
                                  value={receiveDraftQtys[idx] ?? remaining}
                                  onChange={(e) => {
                                    const n = Math.max(0, Math.trunc(Number(e.target.value) || 0));
                                    setReceiveDraftQtys((prev) => ({
                                      ...prev,
                                      [idx]: remaining > 0 ? Math.min(n, remaining) : 0,
                                    }));
                                  }}
                                  data-testid={`purchase-order-receive-qty-${order.id}-${idx}`}
                                  className="w-16 border border-[var(--border)] rounded-[var(--radius-md)] px-1.5 py-1 text-right text-[11px] bg-[var(--card)] tabular-nums"
                                  aria-label={`${item.name || '품목'} 이번 입고 수량`}
                                />
                                <span className="text-[10px]">개</span>
                              </label>
                            ) : (
                              <span className="shrink-0 tabular-nums">
                                {ordered}개
                                {received > 0 ? ` · 입고 ${received}` : ''}
                                {remaining > 0 && received > 0 ? ` · 잔여 ${remaining}` : ''}
                                {Number(item.unit_price || 0) > 0
                                  ? ` / ${Number(item.unit_price || 0).toLocaleString('ko-KR')}원`
                                  : ''}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 pt-3 border-t border-[var(--border)] flex justify-between items-center">
                      <span className="text-xs font-semibold text-[var(--foreground)]">총 발주액</span>
                      <span className="text-base font-bold text-[var(--accent)]">
                        {Number(order.total_amount || 0).toLocaleString('ko-KR')}원
                      </span>
                    </div>
                    {receiveDraftOrderId === order.id && (
                      <div className="mt-3 pt-3 border-t border-[var(--border)] flex flex-wrap gap-2 justify-end">
                        <button
                          type="button"
                          onClick={closeReceiveDraft}
                          className="px-3 py-1.5 rounded-[var(--radius-md)] text-[11px] font-semibold border border-[var(--border)] text-[var(--toss-gray-3)] hover:bg-[var(--card)]"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReceivePurchaseOrder(order.id)}
                          disabled={receivingOrderId === order.id}
                          data-testid={`purchase-order-receive-confirm-${order.id}`}
                          className="px-3 py-1.5 rounded-[var(--radius-md)] text-[11px] font-semibold bg-[var(--accent)] text-white disabled:opacity-50"
                        >
                          {receivingOrderId === order.id ? '입고 중…' : '이 수량으로 입고'}
                        </button>
                      </div>
                    )}
                    {order.sourceType === 'purchase_order' &&
                      Number(order.received_qty || 0) > 0 && (
                      <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-2">
                        <div className="flex flex-wrap gap-2 items-center justify-between">
                          <button
                            type="button"
                            onClick={() => void loadReceiveHistory(order.id)}
                            data-testid={`purchase-order-history-${order.id}`}
                            className="text-[11px] font-bold text-[var(--accent)] hover:underline"
                          >
                            {historyOpenId === order.id ? '입고 이력 접기' : '입고 이력 보기'}
                          </button>
                          <div className="flex flex-wrap gap-1.5">
                            {orderRemainingQty(order) <= 0 && (
                              <>
                                <button
                                  type="button"
                                  disabled={inspectingId === order.id}
                                  onClick={() => void handleInspectPurchaseOrder(order.id, '합격')}
                                  data-testid={`purchase-order-inspect-pass-${order.id}`}
                                  className="px-2 py-1 rounded-[var(--radius-md)] text-[10px] font-bold bg-emerald-600 text-white disabled:opacity-50"
                                >
                                  검수 합격
                                </button>
                                <button
                                  type="button"
                                  disabled={inspectingId === order.id}
                                  onClick={() => void handleInspectPurchaseOrder(order.id, '불합격')}
                                  data-testid={`purchase-order-inspect-fail-${order.id}`}
                                  className="px-2 py-1 rounded-[var(--radius-md)] text-[10px] font-bold border border-red-200 text-red-600 disabled:opacity-50"
                                >
                                  검수 불합격
                                </button>
                              </>
                            )}
                            {order.inspection_status && (
                              <span className="px-2 py-1 rounded-[var(--radius-md)] text-[10px] font-bold bg-[var(--card)] border border-[var(--border)]">
                                검수: {order.inspection_status}
                                {order.inspected_by_name ? ` · ${order.inspected_by_name}` : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        {historyOpenId === order.id && (
                          <div
                            className="rounded-[var(--radius-md)] bg-[var(--card)] border border-[var(--border)] p-2 max-h-40 overflow-y-auto"
                            data-testid={`purchase-order-history-panel-${order.id}`}
                          >
                            {historyLoadingId === order.id ? (
                              <p className="text-[11px] text-[var(--toss-gray-3)] text-center py-2">불러오는 중…</p>
                            ) : (historyByOrder[order.id] || []).length === 0 ? (
                              <p className="text-[11px] text-[var(--toss-gray-3)] text-center py-2">
                                입고 로그가 없습니다.
                              </p>
                            ) : (
                              <ul className="space-y-1.5">
                                {(historyByOrder[order.id] || []).map((h, i) => (
                                  <li
                                    key={`${order.id}-h-${i}`}
                                    className="flex justify-between gap-2 text-[11px] text-[var(--toss-gray-4)]"
                                  >
                                    <span className="min-w-0 truncate">
                                      <span className="font-bold text-[var(--foreground)]">{h.item}</span>
                                      {' · '}
                                      {h.qty}개 · {h.actor}
                                    </span>
                                    <span className="shrink-0 tabular-nums text-[10px]">
                                      {h.at ? new Date(h.at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : ''}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 입고 예정일 / D-day */}
                  {order.sourceType === 'purchase_order' && (
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {editingDeliveryDateId === order.id ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <label htmlFor={`delivery-date-${order.id}`} className="sr-only">입고 예정일</label>
                          <input
                            id={`delivery-date-${order.id}`}
                            type="date"
                            value={deliveryDateInput}
                            onChange={(e) => setDeliveryDateInput(e.target.value)}
                            className="border border-[var(--border)] rounded-[var(--radius-md)] px-2 py-1 text-[11px] bg-[var(--card)] text-[var(--foreground)]"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveDeliveryDate(order.id)}
                            disabled={savingDeliveryDate}
                            className="px-2 py-1 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-[11px] font-semibold disabled:opacity-50"
                          >{savingDeliveryDate ? '저장 중...' : '저장'}</button>
                          <button
                            type="button"
                            onClick={() => setEditingDeliveryDateId(null)}
                            className="px-2 py-1 bg-[var(--muted)] text-[var(--toss-gray-3)] rounded-[var(--radius-md)] text-[11px]"
                          >취소</button>
                        </div>
                      ) : (
                        <>
                          {order.expected_delivery_date ? (
                            <>
                              <span className="text-[11px] text-[var(--toss-gray-3)]">
                                입고예정: {order.expected_delivery_date}
                              </span>
                              {calcDday(order.expected_delivery_date) && (
                                <span className={`px-2 py-0.5 rounded-[var(--radius-md)] text-[11px] font-bold ${calcDday(order.expected_delivery_date)!.tone}`}>
                                  {calcDday(order.expected_delivery_date)!.label}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-[11px] text-[var(--toss-gray-3)]">입고 예정일 미설정</span>
                          )}
                          <button
                            onClick={() => {
                              setEditingDeliveryDateId(order.id);
                              setDeliveryDateInput(order.expected_delivery_date || '');
                            }}
                            className="px-2 py-0.5 rounded-[var(--radius-md)] text-[11px] border border-[var(--border)] text-[var(--toss-gray-3)] hover:bg-[var(--muted)]"
                          >
                            {order.expected_delivery_date ? '수정' : '날짜 설정'}
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {order.notes && (
                    <p className="text-[11px] leading-5 text-[var(--toss-gray-3)] whitespace-pre-line mt-2">
                      {order.notes}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
