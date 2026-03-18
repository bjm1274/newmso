'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  getItemMinQuantity,
  getItemName,
  getItemQuantity,
  getItemUnitPrice,
  getRecommendedOrderQuantity,
} from '@/app/main/inventory-utils';

type OrderRecord = {
  id: string;
  sourceType: 'purchase_order' | 'approval';
  created_at: string;
  supplier_name: string;
  items: any[];
  status: string;
  total_amount: number;
  notes: string | null;
  requestTitle?: string | null;
  requesterName?: string | null;
  sourceApprovalId?: string | null;
  sourceRequestIndex?: number | null;
};

function buildSourceKey(sourceApprovalId?: string | null, sourceRequestIndex?: number | null) {
  if (!sourceApprovalId || !Number.isInteger(sourceRequestIndex)) return null;
  return `${sourceApprovalId}:${sourceRequestIndex}`;
}

function normalizePurchaseOrderRecord(order: any): OrderRecord {
  const items = Array.isArray(order?.items) ? order.items : [];

  return {
    id: String(order?.id || ''),
    sourceType: 'purchase_order',
    created_at: order?.created_at || new Date().toISOString(),
    supplier_name: String(order?.supplier_name || '미정'),
    items,
    status: String(order?.status || '대기'),
    total_amount: Number(order?.total_amount || 0),
    notes: typeof order?.notes === 'string' ? order.notes : null,
    sourceApprovalId: items[0]?.source_supply_approval_id ? String(items[0].source_supply_approval_id) : null,
    sourceRequestIndex: Number.isInteger(Number(items[0]?.source_supply_request_index))
      ? Number(items[0].source_supply_request_index)
      : null,
  };
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
        source_supply_request_index: meta?.source_supply_request_index ?? null,
      },
    ],
    status: String(approval?.status || '대기'),
    total_amount: Number(meta?.total_amount || quantity * unitPrice),
    notes: typeof approval?.content === 'string' ? approval.content : null,
    requestTitle: typeof meta?.source_supply_title === 'string' ? meta.source_supply_title : null,
    requesterName: typeof meta?.source_requester_name === 'string' ? meta.source_requester_name : null,
    sourceApprovalId: meta?.source_supply_approval_id ? String(meta.source_supply_approval_id) : null,
    sourceRequestIndex: Number.isInteger(Number(meta?.source_supply_request_index))
      ? Number(meta.source_supply_request_index)
      : null,
  };
}

function getStatusTone(status: string, sourceType: OrderRecord['sourceType']) {
  if (status === '승인') return 'bg-emerald-50 text-emerald-600';
  if (status === '반려') return 'bg-red-50 text-red-600';
  if (sourceType === 'approval') return 'bg-orange-50 text-orange-600';
  return 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]';
}

export default function PurchaseOrderManagement({
  user,
  inventory,
  suppliers,
  highlightedSource,
  onConsumeHighlightedSource,
}: any) {
  const [orderRecords, setOrderRecords] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [highlightedOrderId, setHighlightedOrderId] = useState<string | null>(null);

  useEffect(() => {
    void fetchPurchaseOrders();
    checkLowStockItems();
  }, [inventory]);

  useEffect(() => {
    const sourceKey = buildSourceKey(
      highlightedSource?.approvalId || null,
      Number.isInteger(Number(highlightedSource?.requestIndex)) ? Number(highlightedSource.requestIndex) : null,
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

    onConsumeHighlightedSource?.();

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
        supabase.from('purchase_orders').select('*').order('created_at', { ascending: false }),
        supabase.from('approvals').select('*').eq('type', '비품구매').order('created_at', { ascending: false }),
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
    const items = inventory.filter((item: any) => getItemQuantity(item) <= getItemMinQuantity(item));
    setLowStockItems(items);
  };

  const handleAutoGeneratePurchaseOrder = async () => {
    if (lowStockItems.length === 0) return alert('발주가 필요한 항목이 없습니다.');
    if (!confirm(`${lowStockItems.length}개 항목에 대한 발주서를 자동으로 생성하시겠습니까?`)) return;

    setLoading(true);
    try {
      const itemsBySupplier = lowStockItems.reduce((acc: any, item: any) => {
        const supplierName =
          String(item?.supplier_name || item?.supplier || '').trim() ||
          supplierNames[0] ||
          '미정';
        if (!acc[supplierName]) acc[supplierName] = [];
        acc[supplierName].push({
          item_id: item.id,
          name: getItemName(item),
          qty: getRecommendedOrderQuantity(item),
          unit_price: getItemUnitPrice(item),
        });
        return acc;
      }, {});

      for (const [supplierName, items] of Object.entries(itemsBySupplier)) {
        const totalAmount = (items as any[]).reduce(
          (sum, item) => sum + Number(item.qty || 0) * Number(item.unit_price || 0),
          0,
        );

        const { error } = await supabase.from('purchase_orders').insert([
          {
            supplier_name: supplierName,
            items,
            status: '대기',
            total_amount: totalAmount,
            created_by: user.id,
            notes: '자동 생성된 발주서 (안전재고 미달)',
          },
        ]);

        if (error) throw error;
      }

      alert(`발주서가 생성되었습니다.\n대상 항목: ${lowStockItems.length}건`);
      await fetchPurchaseOrders();
    } catch (err) {
      alert('발주서 생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleApprovePurchaseOrder = async (orderId: string) => {
    if (!confirm('이 발주서를 확인 처리하시겠습니까?')) return;
    try {
      const { error } = await supabase.from('purchase_orders').update({ status: '승인' }).eq('id', orderId);
      if (error) throw error;
      alert('발주서가 승인 처리되었습니다.');
      await fetchPurchaseOrders();
    } catch (err) {
      alert('발주서 승인 처리에 실패했습니다.');
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-500" data-testid="purchase-order-management-view">
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
          <div className="text-center py-10 bg-green-50 rounded-[var(--radius-md)] border border-dashed border-green-200">
            <p className="text-sm font-semibold text-green-600">현재 모든 품목이 안전재고 이상입니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            {lowStockItems.map((item: any) => (
              <div
                key={item.id}
                className="p-4 bg-orange-50 border border-orange-100 rounded-[var(--radius-md)] flex justify-between items-center"
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
                        {new Date(order.created_at).toLocaleDateString()} | {order.supplier_name || '미정'}
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
                      <div className="rounded-[var(--radius-md)] bg-orange-50 px-3 py-2 text-[11px] font-semibold text-orange-600">
                        {order.status === '승인' ? '전자결재 승인 완료' : '전자결재 승인 대기'}
                      </div>
                    ) : (
                      order.status === '대기' && (
                        <button
                          onClick={() => handleApprovePurchaseOrder(order.id)}
                          data-testid={`purchase-order-approve-${order.id}`}
                          className="w-full md:w-auto py-2 px-4 bg-green-600 text-white rounded-[var(--radius-md)] font-semibold text-xs shadow-sm hover:scale-[0.98] transition-all"
                        >
                          발주 확인
                        </button>
                      )
                    )}
                  </div>

                  <div className="bg-[var(--muted)] p-3 rounded-[var(--radius-md)] mb-3">
                    <div className="space-y-2">
                      {(order.items || []).map((item: any, idx: number) => (
                        <div
                          key={`${order.id}-${idx}`}
                          className="flex justify-between gap-4 text-xs font-bold text-[var(--toss-gray-4)]"
                        >
                          <span className="min-w-0 truncate">{item.name || '품목'}</span>
                          <span className="shrink-0">
                            {item.qty}개
                            {Number(item.unit_price || 0) > 0
                              ? ` / ${Number(item.unit_price || 0).toLocaleString('ko-KR')}원`
                              : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-[var(--border)] flex justify-between items-center">
                      <span className="text-xs font-semibold text-[var(--foreground)]">총 발주액</span>
                      <span className="text-base font-bold text-[var(--accent)]">
                        {Number(order.total_amount || 0).toLocaleString('ko-KR')}원
                      </span>
                    </div>
                  </div>

                  {order.notes && (
                    <p className="text-[11px] leading-5 text-[var(--toss-gray-3)] whitespace-pre-line">
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
