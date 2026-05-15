'use client';

import { useMemo, type ReactNode } from 'react';
import type { InventoryItem } from '@/types';
import { isExpirySoon } from '@/app/main/inventory-utils';
import { ResponsiveTable, type Column } from '@/app/components/ResponsiveTable';

// ─────────────────────────────────────────────────────
// Helpers (local, parity with parent)
// ─────────────────────────────────────────────────────
function qty(item: InventoryItem): number {
  const ex = item as Record<string, unknown>;
  return Number(item.quantity ?? ex.stock ?? 0);
}
function minQty(item: InventoryItem): number {
  const ex = item as Record<string, unknown>;
  return Number(
    ex.min_quantity ??
      ex.min_stock ??
      ex.minimum_quantity ??
      item.min_quantity ??
      0,
  );
}
function itemName(item: InventoryItem): string {
  return String((item as Record<string, unknown>).item_name || item.name || '');
}
function dept(item: InventoryItem): string {
  return String((item as Record<string, unknown>).department || '');
}

export type InventoryStatusGridProps = {
  items: InventoryItem[];
  expiryThreshold: number;
  batchMode: boolean;
  batchSelectedIds: string[];
  toggleBatchItem: (id: string) => void;
  toggleBatchAll: (allIds: string[]) => void;
  onOpenDetail: (item: InventoryItem) => void;
  onReorder: (item: InventoryItem) => void;
};

/**
 * 재고현황뷰 메인 표 — ResponsiveTable selection 활용.
 *
 * - batchMode 일 때만 selection prop 전달 → 체크박스 컬럼이 자동 노출됨.
 * - 행 클릭 = 상세 모달 오픈 (onRowClick). 셀 액션 버튼은 stopPropagation.
 * - LOT/SN/UDI 칩은 품목명 render 내부 유지.
 */
export default function InventoryStatusGrid({
  items,
  expiryThreshold,
  batchMode,
  batchSelectedIds,
  toggleBatchItem,
  toggleBatchAll,
  onOpenDetail,
  onReorder,
}: InventoryStatusGridProps) {
  const selectedSet = useMemo(
    () => new Set(batchSelectedIds),
    [batchSelectedIds],
  );

  const allSelected =
    items.length > 0 && items.every((i) => selectedSet.has(i.id));
  const someSelected =
    !allSelected && items.some((i) => selectedSet.has(i.id));

  const columns: Column<InventoryItem>[] = [
    {
      key: 'name',
      label: '품목명',
      primary: true,
      render: (item) => renderNameCell(item),
    },
    {
      key: 'category',
      label: '카테고리',
      render: (item) => (
        <span className="erp-chip">{item.category || '미분류'}</span>
      ),
    },
    {
      key: 'company',
      label: '회사',
      render: (item) => (
        <div>
          <p className="font-semibold text-[var(--zinc-600)]">
            {item.company || '-'}
          </p>
          {dept(item) && (
            <p className="text-[10px] text-[var(--zinc-400)]">{dept(item)}</p>
          )}
        </div>
      ),
    },
    {
      key: 'quantity',
      label: '현재 재고',
      align: 'center',
      render: (item) => {
        const q = qty(item);
        const isLow = q <= minQty(item);
        const isOos = q === 0;
        return (
          <span
            className={`font-black ${
              isOos || isLow ? 'text-red-500' : 'text-[var(--foreground)]'
            }`}
          >
            {q}
          </span>
        );
      },
    },
    {
      key: 'unit',
      label: '단위',
      render: (item) => {
        const unit = String(
          (item as Record<string, unknown>).unit || '개',
        );
        return (
          <span className="font-semibold text-[var(--foreground)]">{unit}</span>
        );
      },
    },
    {
      key: 'min_quantity',
      label: '최소 재고',
      align: 'center',
      render: (item) => (
        <span className="font-semibold text-[var(--foreground)]">
          {minQty(item)}
        </span>
      ),
    },
    {
      key: 'status',
      label: '상태',
      render: (item) => renderStatusCell(item, expiryThreshold),
    },
    {
      key: 'actions',
      label: '관리',
      align: 'right',
      // 모바일 카드는 자체가 <button> 이라 내부 액션 버튼이 nested-button 이 됨.
      // 모바일에서는 카드 탭 → 상세 모달에서 추가 작업하도록 숨김.
      showOnMobile: false,
      render: (item) => renderActionsCell(item, onOpenDetail, onReorder),
    },
  ];

  return (
    <ResponsiveTable<InventoryItem>
      columns={columns}
      rows={items}
      keyField="id"
      onRowClick={(row) => onOpenDetail(row)}
      emptyMessage="조건에 맞는 품목이 없습니다."
      selection={
        batchMode
          ? {
              selected: selectedSet,
              onToggle: (key) => toggleBatchItem(key),
              onToggleAll: () =>
                toggleBatchAll(allSelected ? [] : items.map((i) => i.id)),
              allSelected,
              indeterminate: someSelected,
              getRowAriaLabel: (key) => {
                const found = items.find((i) => i.id === key);
                return found ? `${itemName(found)} 선택` : `${key} 선택`;
              },
            }
          : undefined
      }
    />
  );
}

// ─────────────────────────────────────────────────────
// Cell renderers (split to keep main component readable)
// ─────────────────────────────────────────────────────
function renderNameCell(item: InventoryItem): ReactNode {
  const ex = item as Record<string, unknown>;
  const lot = ex.lot_number ? String(ex.lot_number) : null;
  const sn = ex.serial_number ? String(ex.serial_number) : null;
  const isUdi = Boolean(ex.is_udi);
  return (
    <div>
      <p className="font-bold text-[var(--foreground)]">{itemName(item)}</p>
      <div className="flex gap-1 mt-1 flex-wrap">
        {lot && (
          <span className="text-[9px] font-semibold bg-[var(--muted)] text-[var(--toss-gray-4)] px-1.5 py-0.5 rounded">
            LOT: {lot}
          </span>
        )}
        {sn && (
          <span className="text-[9px] font-semibold bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 rounded">
            S/N: {sn}
          </span>
        )}
        {isUdi && (
          <span className="text-[9px] font-bold bg-purple-500/10 text-purple-600 px-1.5 py-0.5 rounded uppercase">
            UDI
          </span>
        )}
      </div>
    </div>
  );
}

function renderStatusCell(
  item: InventoryItem,
  expiryThreshold: number,
): ReactNode {
  const q = qty(item);
  const mq = minQty(item);
  const isLow = q <= mq;
  const isOos = q === 0;
  const isExpiry = isExpirySoon(item, expiryThreshold);
  const ex = item as Record<string, unknown>;
  const expiryDate = ex.expiry_date ? String(ex.expiry_date) : null;
  return (
    <div>
      {isOos || isLow ? (
        <span className="erp-status erp-status-red">
          {isOos ? '품절' : '부족'}
        </span>
      ) : isExpiry ? (
        <span className="erp-status erp-status-yellow">임박</span>
      ) : (
        <span className="erp-status erp-status-green">정상</span>
      )}
      {expiryDate && (
        <p className="mt-1 text-[10px] text-[var(--zinc-400)]">{expiryDate}</p>
      )}
    </div>
  );
}

function renderActionsCell(
  item: InventoryItem,
  onOpenDetail: (item: InventoryItem) => void,
  onReorder: (item: InventoryItem) => void,
): ReactNode {
  const q = qty(item);
  const mq = minQty(item);
  const isLow = q <= mq;
  const isOos = q === 0;
  // 액션 버튼은 행 클릭(상세 모달)을 호출하지 않도록 stopPropagation.
  // 모바일 카드에서도 동일하게 동작 — 카드는 button 이므로 nested button 회피 위해
  // span 래퍼에 onClickCapture stopPropagation 사용.
  return (
    <span
      className="inline-flex items-center justify-end gap-1"
      onClick={(e) => e.stopPropagation()}
      onClickCapture={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenDetail(item);
        }}
        className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[11px] font-bold text-[var(--foreground)] shadow-sm hover:bg-[var(--muted)]"
      >
        상세
      </button>
      {(isLow || isOos) && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onReorder(item);
          }}
          className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[11px] font-bold text-[var(--foreground)] shadow-sm hover:bg-[var(--muted)]"
        >
          발주
        </button>
      )}
    </span>
  );
}
