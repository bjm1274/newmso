'use client';

import { useMemo, type Dispatch, type SetStateAction } from 'react';
import { toast } from '@/lib/toast';
import {
  normalizeSupplyRequestCategory,
  type SupplyRequestMonthlySuggestion,
} from '@/app/main/inventory-utils';
import type { InventoryCatalogItem, SupplyRow } from './비품구매양식';

const MONTHLY_STATS_VISIBLE_LIMIT = 8;

function normalizeInventoryKey(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function hasMeaningfulRow(row: SupplyRow) {
  return Boolean(row.name.trim() || row.category.trim() || row.purpose.trim() || row.qty > 1);
}

type SuppliesMetaSectionProps = {
  requesterInventoryLabel: string;
  requesterDepartment: string;
  itemsLength: number;
  statsExpanded: boolean;
  setStatsExpanded: Dispatch<SetStateAction<boolean>>;
  statsLoading: boolean;
  monthlySuggestions: SupplyRequestMonthlySuggestion[];
  inventoryCatalog: InventoryCatalogItem[];
  departmentStockByName: Map<string, number>;
  setItems: Dispatch<SetStateAction<SupplyRow[]>>;
  addItemRow: () => void;
  removeLastItemRow: () => void;
};

export default function SuppliesMetaSection({
  requesterInventoryLabel,
  requesterDepartment,
  itemsLength,
  statsExpanded,
  setStatsExpanded,
  statsLoading,
  monthlySuggestions,
  inventoryCatalog,
  departmentStockByName,
  setItems,
  addItemRow,
  removeLastItemRow,
}: SuppliesMetaSectionProps) {
  const visibleMonthlySuggestions = useMemo(() => {
    const mergedSuggestions = [...monthlySuggestions];
    const existingKeys = new Set(
      monthlySuggestions.map((suggestion) => normalizeInventoryKey(suggestion.name)),
    );

    for (const entry of inventoryCatalog) {
      if (mergedSuggestions.length >= MONTHLY_STATS_VISIBLE_LIMIT) {
        break;
      }

      const normalizedName = normalizeInventoryKey(entry.name);
      if (!normalizedName || existingKeys.has(normalizedName)) {
        continue;
      }

      existingKeys.add(normalizedName);
      mergedSuggestions.push({
        key: `inventory::${normalizedName}`,
        name: entry.name,
        category: entry.category,
        purpose: '현재 재고 기준 추천',
        total_qty: Math.max(entry.stock, 1),
        line_count: 0,
        document_count: 0,
        average_qty: Math.max(entry.min_stock || 0, 1),
        last_requested_at: null,
      });
    }

    return mergedSuggestions.slice(0, MONTHLY_STATS_VISIBLE_LIMIT);
  }, [inventoryCatalog, monthlySuggestions]);

  const statsSummaryText = useMemo(() => {
    if (statsLoading) {
      return '최근 30일 물품신청 통계를 불러오는 중입니다.';
    }
    if (visibleMonthlySuggestions.length === 0) {
      return '최근 30일 통계가 없습니다.';
    }
    return `최근 30일 추천 ${visibleMonthlySuggestions.length}개`;
  }, [statsLoading, visibleMonthlySuggestions.length]);

  const applyMonthlyStats = () => {
    if (visibleMonthlySuggestions.length === 0) {
      toast('최근 30일 추천 통계가 아직 없습니다.', 'warning');
      return;
    }

    setItems((prev) => {
      const meaningfulRows = prev.filter(hasMeaningfulRow);
      const nextRows = meaningfulRows.length > 0 ? [...meaningfulRows] : [];

      visibleMonthlySuggestions.forEach((suggestion) => {
        const matchedInventory = inventoryCatalog.find(
          (entry) => normalizeInventoryKey(entry.name) === normalizeInventoryKey(suggestion.name),
        );
        const existingIndex = nextRows.findIndex(
          (row) =>
            normalizeInventoryKey(row.name) === normalizeInventoryKey(suggestion.name) &&
            row.category.trim() === suggestion.category &&
            row.purpose.trim() === suggestion.purpose,
        );
        const departmentStock =
          departmentStockByName.get(normalizeInventoryKey(suggestion.name)) ?? 0;

        if (existingIndex >= 0) {
          nextRows[existingIndex] = {
            ...nextRows[existingIndex],
            qty: Math.max(nextRows[existingIndex].qty, suggestion.average_qty),
            currentStock:
              matchedInventory || departmentStockByName.has(normalizeInventoryKey(suggestion.name))
                ? departmentStock
                : nextRows[existingIndex].currentStock,
            unit: matchedInventory ? matchedInventory.unit : nextRows[existingIndex].unit,
          };
          return;
        }

        nextRows.push({
          name: suggestion.name,
          qty: suggestion.average_qty,
          unit: matchedInventory ? matchedInventory.unit : 'EA',
          currentStock:
            matchedInventory || departmentStockByName.has(normalizeInventoryKey(suggestion.name))
              ? departmentStock
              : null,
          category: normalizeSupplyRequestCategory(suggestion.category),
          purpose: suggestion.purpose,
          suggestions: [],
        });
      });

      return nextRows.length > 0 ? nextRows : [{
        name: '',
        qty: 1,
        unit: 'EA',
        currentStock: null,
        category: '',
        purpose: '',
        suggestions: [],
      }];
    });

    toast('최근 신청 통계 기준으로 자주 신청한 물품을 채웠습니다.', 'success');
  };

  return (
    <>
      <div className="erp-toolbar flex-col items-stretch rounded-none border-x-0 border-t-0 bg-[var(--card)] md:flex-row md:items-center md:justify-between">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:flex-wrap md:items-center">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-[var(--accent)]">
            <span className="h-2 w-2 animate-pulse rounded-[var(--radius-sm)] bg-[var(--accent)]" />
            {requesterInventoryLabel}
          </p>
          <button
            type="button"
            data-testid="supplies-add-row-button"
            onClick={addItemRow}
            className="btn-premium-secondary min-h-8 px-3 py-1.5 text-[11px]"
          >
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] pb-[1px] text-[11px] leading-none text-[var(--accent)]">
              +
            </span>
            항목 추가
          </button>
          <button
            type="button"
            data-testid="supplies-remove-row-button"
            onClick={removeLastItemRow}
            disabled={itemsLength <= 1}
            className="inline-flex min-h-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--danger-light)] bg-[var(--danger-light)] px-3 py-1.5 text-[11px] font-bold text-[var(--danger)] transition-colors hover:border-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            항목 삭제
          </button>
          <button
            type="button"
            data-testid="supplies-stats-fill-button"
            onClick={applyMonthlyStats}
            disabled={statsLoading || visibleMonthlySuggestions.length === 0}
            className="btn-premium-primary min-h-8 px-3 py-1.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-40"
          >
            통계치 입력
          </button>
        </div>
        <div className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
          <span>요청부서</span>
          <span
            data-testid="supplies-requester-department"
            className="inline-flex min-h-9 items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-[13px] font-black text-[var(--foreground)]"
          >
            {requesterDepartment || '미지정'}
          </span>
        </div>
      </div>

      <div className="border-b border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-3">
        <button
          type="button"
          data-testid="supplies-stats-toggle"
          aria-expanded={statsExpanded}
          onClick={() => setStatsExpanded((prev) => !prev)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div className="min-w-0">
            <p className="text-[12px] font-black text-[var(--foreground)]">최근 신청 통계치 입력</p>
            <p
              data-testid="supplies-stats-summary"
              className="mt-1 text-[11px] font-semibold leading-relaxed text-[var(--toss-gray-3)]"
            >
              {statsSummaryText}
            </p>
          </div>
          <span className="erp-chip erp-chip-active shrink-0">
            {statsExpanded ? '접기' : '펼치기'}
          </span>
        </button>

        {statsExpanded ? (
          <div data-testid="supplies-stats-panel" className="mt-3">
            {statsLoading ? (
              <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                최근 신청 기준 추천 항목을 불러오는 중입니다.
              </div>
            ) : visibleMonthlySuggestions.length === 0 ? (
              <div
                data-testid="supplies-stats-empty"
                className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)]"
              >
                최근 30일 추천 통계가 없습니다.
              </div>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {visibleMonthlySuggestions.map((suggestion, index) => (
                  <div
                    key={suggestion.key}
                    data-testid={`supplies-stats-item-${index}`}
                    className="erp-panel px-3 py-3 shadow-none"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-black text-[var(--foreground)]">{suggestion.name}</p>
                        <p className="mt-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                          {suggestion.category || '품목구분 미지정'}
                          {suggestion.purpose ? ` · ${suggestion.purpose}` : ''}
                        </p>
                      </div>
                      <span className="erp-chip erp-chip-active shrink-0 text-[11px] font-black">
                        평균 {suggestion.average_qty}개
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold text-[var(--toss-gray-3)]">
                      <span className="erp-chip text-[10px]">문서 {suggestion.document_count}건</span>
                      <span className="erp-chip text-[10px]">합계 {suggestion.total_qty}개</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}
