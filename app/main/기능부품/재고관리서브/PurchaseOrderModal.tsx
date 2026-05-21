'use client';
/**
 * PurchaseOrderModal — MSO 본사 전용 발주서 생성 모달
 *
 * 책임: 거래처별 발주서 초안을 보여주고, 수량 수정·메모 입력·거래처별/일괄 발송을 처리.
 * 발송 = purchase_orders 테이블에 거래처별 1행 insert (발주관리.tsx 패턴 동일).
 *
 * JM: 단일책임(발주서 모달 UI + 발송 핸들러만)
 * JM3: try/catch 에러 처리, toast 분리
 * JM4: SupplierGroup / OrderDraftItem 타입 명시
 * JM6: dialog role, label 연결, 키보드 접근(button type="button")
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';

export interface OrderDraftItem {
  itemId: string;
  name: string;
  qty: number;
  unitPrice: number;
  currentStock: number;
  supplierName: string;
  supplierId: string | null;
}

export interface SupplierGroup {
  supplierId: string | null;
  supplierName: string;
  memo: string;
  items: OrderDraftItem[];
  selected: boolean;
  sending: boolean;
}

interface Props {
  supplierGroups: SupplierGroup[];
  onGroupsChange: (groups: SupplierGroup[]) => void;
  onDraftChange: (updater: (prev: OrderDraftItem[]) => OrderDraftItem[]) => void;
  onClose: () => void;
  userId: string | null | undefined;
  effectiveDept: string;
}

export default function PurchaseOrderModal({
  supplierGroups,
  onGroupsChange,
  onDraftChange,
  onClose,
  userId,
  effectiveDept,
}: Props) {
  const [globalSending, setGlobalSending] = useState(false);

  // 수량 수정
  const handleQtyChange = useCallback(
    (itemId: string, newQty: number) => {
      const safeQty = Math.max(1, newQty);
      onDraftChange((prev) =>
        prev.map((d) => (d.itemId === itemId ? { ...d, qty: safeQty } : d))
      );
      onGroupsChange(
        supplierGroups.map((g) => ({
          ...g,
          items: g.items.map((d) => (d.itemId === itemId ? { ...d, qty: safeQty } : d)),
        }))
      );
    },
    [supplierGroups, onGroupsChange, onDraftChange]
  );

  // 거래처 메모 수정
  const handleMemoChange = useCallback(
    (supplierName: string, memo: string) => {
      onGroupsChange(
        supplierGroups.map((g) => (g.supplierName === supplierName ? { ...g, memo } : g))
      );
    },
    [supplierGroups, onGroupsChange]
  );

  // 거래처 선택 토글
  const handleSelectToggle = useCallback(
    (supplierName: string) => {
      onGroupsChange(
        supplierGroups.map((g) =>
          g.supplierName === supplierName ? { ...g, selected: !g.selected } : g
        )
      );
    },
    [supplierGroups, onGroupsChange]
  );

  // 단일 거래처 발송
  const handleSendGroup = useCallback(
    async (supplierName: string) => {
      const group = supplierGroups.find((g) => g.supplierName === supplierName);
      if (!group) return;

      onGroupsChange(
        supplierGroups.map((g) =>
          g.supplierName === supplierName ? { ...g, sending: true } : g
        )
      );

      try {
        const items = group.items.map((d) => ({
          item_id: d.itemId,
          name: d.name,
          qty: d.qty,
          unit_price: d.unitPrice,
        }));
        const totalAmount = items.reduce((sum, it) => sum + it.qty * it.unit_price, 0);

        const { error } = await supabase.from('purchase_orders').insert([
          {
            supplier_name: group.supplierName,
            items,
            status: '대기',
            total_amount: totalAmount,
            created_by: userId ?? null,
            notes: group.memo
              ? `[${effectiveDept}] ${group.memo}`
              : `[${effectiveDept}] 자동 발주서 (부서별 재고 화면)`,
          },
        ]);

        if (error) throw error;
        toast(`${group.supplierName} 발주서가 생성되었습니다.`, 'success');

        const remaining = supplierGroups.filter((g) => g.supplierName !== supplierName);
        onGroupsChange(remaining);
        onDraftChange((prev) => prev.filter((d) => d.supplierName !== supplierName));
      } catch {
        toast(`${group.supplierName} 발주서 생성에 실패했습니다.`, 'error');
        onGroupsChange(
          supplierGroups.map((g) =>
            g.supplierName === supplierName ? { ...g, sending: false } : g
          )
        );
      }
    },
    [supplierGroups, onGroupsChange, onDraftChange, userId, effectiveDept]
  );

  // 선택 거래처 일괄 발송
  const handleSendSelected = useCallback(async () => {
    const selected = supplierGroups.filter((g) => g.selected);
    if (selected.length === 0) {
      toast('발송할 거래처를 선택하세요.', 'warning');
      return;
    }
    setGlobalSending(true);
    for (const g of selected) {
      await handleSendGroup(g.supplierName);
    }
    setGlobalSending(false);
  }, [supplierGroups, handleSendGroup]);

  const selectedCount = supplierGroups.filter((g) => g.selected).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="발주서 생성"
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-base font-bold text-[var(--foreground)]">발주서 생성</h2>
            <p className="text-[11px] text-[var(--toss-gray-3)] mt-0.5">
              거래처별로 묶인 발주서를 검토하고 발송하세요.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="모달 닫기"
            className="p-1.5 rounded-[var(--radius-md)] text-[var(--toss-gray-3)] hover:bg-[var(--muted)] transition"
          >
            ✕
          </button>
        </div>

        {/* 거래처 그룹 목록 */}
        <div className="px-5 py-4 space-y-4">
          {supplierGroups.length === 0 ? (
            <p className="text-sm text-[var(--toss-gray-3)] text-center py-8">
              모든 발주서가 발송되었습니다.
            </p>
          ) : (
            supplierGroups.map((group) => (
              <SupplierGroupCard
                key={group.supplierName}
                group={group}
                onSelectToggle={handleSelectToggle}
                onMemoChange={handleMemoChange}
                onQtyChange={handleQtyChange}
                onSend={handleSendGroup}
              />
            ))
          )}
        </div>

        {/* 하단 일괄 발송 CTA */}
        {supplierGroups.length > 0 && (
          <div className="px-5 pb-5">
            <button
              type="button"
              onClick={() => { void handleSendSelected(); }}
              disabled={selectedCount === 0 || globalSending}
              className="w-full py-2.5 bg-[var(--accent)] text-white text-sm font-bold rounded-[var(--radius-lg)] transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              선택된 거래처 일괄 발송 ({selectedCount}개)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- 거래처 그룹 카드 (내부 컴포넌트, 재사용 없어 동일 파일에 유지) ----
interface CardProps {
  group: SupplierGroup;
  onSelectToggle: (supplierName: string) => void;
  onMemoChange: (supplierName: string, memo: string) => void;
  onQtyChange: (itemId: string, qty: number) => void;
  onSend: (supplierName: string) => Promise<void>;
}

function SupplierGroupCard({ group, onSelectToggle, onMemoChange, onQtyChange, onSend }: CardProps) {
  const groupTotal = group.items.reduce((sum, d) => sum + d.qty * d.unitPrice, 0);
  const totalQty = group.items.reduce((s, d) => s + d.qty, 0);

  return (
    <div
      className={`rounded-[var(--radius-lg)] border p-4 transition ${
        group.selected
          ? 'border-[var(--accent)] bg-[var(--card)]'
          : 'border-[var(--border)] bg-[var(--muted)] opacity-60'
      }`}
    >
      {/* 카드 헤더 */}
      <div className="flex items-center gap-3 mb-3">
        <input
          type="checkbox"
          id={`group-select-${group.supplierName}`}
          checked={group.selected}
          onChange={() => onSelectToggle(group.supplierName)}
          className="w-4 h-4 accent-[var(--accent)]"
        />
        <label
          htmlFor={`group-select-${group.supplierName}`}
          className="flex-1 text-sm font-bold text-[var(--foreground)] cursor-pointer"
        >
          {group.supplierName}
        </label>
        <span className="text-[11px] text-[var(--toss-gray-3)]">
          {group.items.length}종 / 총 {totalQty}개
        </span>
        {groupTotal > 0 && (
          <span className="text-xs font-bold text-[var(--accent)]">
            {groupTotal.toLocaleString('ko-KR')}원
          </span>
        )}
      </div>

      {/* 품목 표 */}
      <div className="overflow-x-auto mb-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] text-[10px] uppercase text-[var(--toss-gray-3)]">
              <th className="px-2 py-1.5 text-left font-semibold">품목</th>
              <th className="px-2 py-1.5 text-right font-semibold">현재고</th>
              <th className="px-2 py-1.5 text-right font-semibold">발주수량</th>
              <th className="px-2 py-1.5 text-right font-semibold">단가</th>
              <th className="px-2 py-1.5 text-right font-semibold">합계</th>
            </tr>
          </thead>
          <tbody>
            {group.items.map((d) => (
              <tr key={d.itemId} className="border-b border-[var(--border)] last:border-0">
                <td className="px-2 py-1.5 font-semibold text-[var(--foreground)]">{d.name}</td>
                <td className="px-2 py-1.5 text-right text-[var(--toss-gray-4)] tabular-nums">{d.currentStock}</td>
                <td className="px-2 py-1.5 text-right">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={d.qty}
                    onChange={(e) => onQtyChange(d.itemId, Number(e.target.value))}
                    aria-label={`${d.name} 발주수량`}
                    className="w-16 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-right text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                </td>
                <td className="px-2 py-1.5 text-right text-[var(--toss-gray-4)] tabular-nums">
                  {d.unitPrice > 0 ? `${d.unitPrice.toLocaleString('ko-KR')}원` : '-'}
                </td>
                <td className="px-2 py-1.5 text-right font-bold text-[var(--foreground)] tabular-nums">
                  {d.unitPrice > 0 ? `${(d.qty * d.unitPrice).toLocaleString('ko-KR')}원` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 메모 + 발송 */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
        <label htmlFor={`memo-${group.supplierName}`} className="sr-only">
          {group.supplierName} 담당자 메모
        </label>
        <input
          id={`memo-${group.supplierName}`}
          type="text"
          placeholder="담당자 메모 (선택)"
          value={group.memo}
          onChange={(e) => onMemoChange(group.supplierName, e.target.value)}
          className="flex-1 border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-1.5 text-xs bg-[var(--card)] text-[var(--foreground)] placeholder:text-[var(--toss-gray-3)]"
        />
        <button
          type="button"
          onClick={() => { void onSend(group.supplierName); }}
          disabled={group.sending || !group.selected}
          className="px-4 py-1.5 bg-[var(--accent)] text-white text-xs font-bold rounded-[var(--radius-md)] transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {group.sending ? '발송 중...' : '발송'}
        </button>
      </div>
    </div>
  );
}
