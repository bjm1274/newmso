'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import {
  buildSupplyRequestMonthlySuggestions,
  INVENTORY_SUPPORT_COMPANY,
  INVENTORY_SUPPORT_DEPARTMENT,
  normalizeInventoryUnit,
  normalizeSupplyRequestItems,
  type SupplyRequestItemUnit,
  type SupplyRequestMonthlySuggestion,
} from '@/app/main/inventory-utils';

type SupplyRow = {
  name: string;
  qty: number;
  unit: SupplyRequestItemUnit;
  currentStock: number | null;
  dept: string;
  purpose: string;
  suggestions: InventoryCatalogItem[];
};

type InventoryCatalogItem = {
  name: string;
  stock: number;
  min_stock: number;
  unit: SupplyRequestItemUnit;
  spec: string;
};

type SuppliesFormProps = {
  setExtraData: (value: Record<string, unknown>) => void;
  initialItems?: unknown[];
  user?: Record<string, unknown> | null;
};

const MONTHLY_STATS_LIMIT = 8;
const DEPARTMENTS = ['병동부', '수술부', '외래부', '검사실', '총무부', '원무부', '진료부', '관리팀', '영양팀'];

function defaultRow(overrides: Partial<Omit<SupplyRow, 'suggestions'>> = {}): SupplyRow {
  return {
    name: '',
    qty: 1,
    unit: 'EA',
    currentStock: null,
    dept: '',
    purpose: '',
    suggestions: [],
    ...overrides,
  };
}

function sanitizeQuantity(value: unknown) {
  return Math.max(1, Number(value) || 1);
}

function getInventoryItemName(row: any) {
  return String(row?.item_name || row?.name || '').trim();
}

function getInventoryStock(row: any) {
  return Number(row?.quantity ?? row?.stock ?? 0) || 0;
}

function getInventoryMinStock(row: any) {
  return Number(row?.min_quantity ?? row?.min_stock ?? 0) || 0;
}

function getInventoryUnit(row: any): SupplyRequestItemUnit {
  return normalizeInventoryUnit(row?.unit);
}

function getInventorySpec(row: any) {
  return String(row?.spec || '').trim();
}

function isTargetInventory(row: any) {
  return (
    String(row?.company || '').trim() === INVENTORY_SUPPORT_COMPANY &&
    String(row?.department || '').trim() === INVENTORY_SUPPORT_DEPARTMENT
  );
}

function buildRowFromUnknown(input: unknown): SupplyRow {
  const row = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return defaultRow({
    name: String(row.name || row.item_name || '').trim(),
    qty: sanitizeQuantity(row.qty || row.quantity),
    unit: normalizeInventoryUnit(row.unit),
    currentStock: row.currentStock == null ? null : Number(row.currentStock) || 0,
    dept: String(row.dept || row.department || '').trim(),
    purpose: String(row.purpose || row.reason || '').trim(),
  });
}

function hasMeaningfulRow(row: SupplyRow) {
  return Boolean(row.name.trim() || row.dept.trim() || row.purpose.trim() || row.qty > 1);
}

export default function SuppliesForm({ setExtraData, initialItems, user }: SuppliesFormProps) {
  const [items, setItems] = useState<SupplyRow[]>(() => {
    if (Array.isArray(initialItems) && initialItems.length > 0) {
      return initialItems.map(buildRowFromUnknown);
    }
    return [defaultRow()];
  });
  const [bulkDept, setBulkDept] = useState('');
  const [inventory, setInventory] = useState<any[]>([]);
  const [monthlySuggestions, setMonthlySuggestions] = useState<SupplyRequestMonthlySuggestion[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  const inventoryCatalog = useMemo(() => {
    const merged = new Map<string, InventoryCatalogItem>();

    inventory
      .filter(isTargetInventory)
      .forEach((row) => {
        const name = getInventoryItemName(row);
        if (!name) return;

        const key = name.toLowerCase();
        const rowUnit = getInventoryUnit(row);
        const rowSpec = getInventorySpec(row);
        const current = merged.get(key) || {
          name,
          stock: 0,
          min_stock: 0,
          unit: rowUnit,
          spec: rowSpec,
        };

        current.stock += getInventoryStock(row);
        current.min_stock = Math.max(current.min_stock, getInventoryMinStock(row));
        if (!current.spec && rowSpec) {
          current.spec = rowSpec;
        }
        if (current.unit !== 'BOX' && rowUnit === 'BOX') {
          current.unit = rowUnit;
        }

        merged.set(key, current);
      });

    return Array.from(merged.values()).sort((left, right) => left.name.localeCompare(right.name, 'ko'));
  }, [inventory]);

  useEffect(() => {
    const fetchInventory = async () => {
      const { data } = await supabase.from('inventory').select('*');
      if (data) {
        setInventory(data);
      }
    };

    void fetchInventory();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchMonthlySuggestions = async () => {
      setStatsLoading(true);
      const monthWindowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      let query = supabase
        .from('approvals')
        .select('id, created_at, status, sender_company, meta_data')
        .eq('type', '물품신청')
        .gte('created_at', monthWindowStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(200);

      const companyName = String(user?.company || '').trim();
      if (companyName) {
        query = query.eq('sender_company', companyName);
      }

      const { data } = await query;
      if (cancelled) return;

      const nextSuggestions = buildSupplyRequestMonthlySuggestions(
        (data || []).filter((row) => String(row?.status || '').trim() !== '반려'),
        MONTHLY_STATS_LIMIT,
      );
      setMonthlySuggestions(nextSuggestions);
      setStatsLoading(false);
    };

    void fetchMonthlySuggestions();

    return () => {
      cancelled = true;
    };
  }, [user?.company]);

  useEffect(() => {
    setItems((prev) =>
      prev.map((item) => {
        if (!item.name.trim()) return item;
        const matched = inventoryCatalog.find((entry) => entry.name.toLowerCase() === item.name.trim().toLowerCase());
        return {
          ...item,
          currentStock: matched ? matched.stock : null,
          unit: matched ? matched.unit : item.unit,
        };
      }),
    );
  }, [inventoryCatalog]);

  useEffect(() => {
    setExtraData({
      items: normalizeSupplyRequestItems(items),
      inventory_source_company: INVENTORY_SUPPORT_COMPANY,
      inventory_source_department: INVENTORY_SUPPORT_DEPARTMENT,
    });
  }, [items, setExtraData]);

  const handleSearch = (index: number, value: string) => {
    const keyword = value.trim().toLowerCase();
    setItems((prev) =>
      prev.map((item, itemIndex) => {
        if (itemIndex !== index) return item;

        const exactMatch = keyword
          ? inventoryCatalog.find((entry) => entry.name.toLowerCase() === keyword)
          : null;

        return {
          ...item,
          name: value,
          currentStock: exactMatch ? exactMatch.stock : null,
          unit: exactMatch ? exactMatch.unit : item.unit,
          suggestions: keyword
            ? inventoryCatalog
                .filter((entry) => {
                  const name = entry.name.toLowerCase();
                  return name.startsWith(keyword) || name.includes(keyword);
                })
                .slice(0, 8)
            : [],
        };
      }),
    );
  };

  const selectItem = (index: number, selected: InventoryCatalogItem) => {
    setItems((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              name: selected.name,
              currentStock: selected.stock,
              unit: selected.unit,
              suggestions: [],
            }
          : item,
      ),
    );
  };

  const updateItemField = (index: number, key: 'qty' | 'dept' | 'purpose', value: unknown) => {
    setItems((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [key]: key === 'qty' ? sanitizeQuantity(value) : value,
            }
          : item,
      ),
    );
  };

  const addItemRow = () => {
    setItems((prev) => [...prev, defaultRow()]);
  };

  const removeLastItemRow = () => {
    setItems((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  };

  const applyBulkDept = () => {
    if (!bulkDept) return;
    setItems((prev) => prev.map((item) => ({ ...item, dept: bulkDept })));
  };

  const applyMonthlyStats = () => {
    if (monthlySuggestions.length === 0) {
      toast('최근 30일 기준 추천 물품 통계가 아직 없습니다.', 'warning');
      return;
    }

    setItems((prev) => {
      const meaningfulRows = prev.filter(hasMeaningfulRow);
      const nextRows = meaningfulRows.length > 0 ? [...meaningfulRows] : [];

      monthlySuggestions.forEach((suggestion) => {
        const matchedInventory = inventoryCatalog.find(
          (entry) => entry.name.toLowerCase() === suggestion.name.toLowerCase(),
        );
        const existingIndex = nextRows.findIndex(
          (row) =>
            row.name.trim().toLowerCase() === suggestion.name.toLowerCase() &&
            row.dept.trim() === suggestion.dept &&
            row.purpose.trim() === suggestion.purpose,
        );

        if (existingIndex >= 0) {
          nextRows[existingIndex] = {
            ...nextRows[existingIndex],
            qty: Math.max(nextRows[existingIndex].qty, suggestion.average_qty),
            currentStock: matchedInventory ? matchedInventory.stock : nextRows[existingIndex].currentStock,
            unit: matchedInventory ? matchedInventory.unit : nextRows[existingIndex].unit,
          };
          return;
        }

        nextRows.push(
          defaultRow({
            name: suggestion.name,
            qty: suggestion.average_qty,
            unit: matchedInventory ? matchedInventory.unit : 'EA',
            dept: suggestion.dept,
            purpose: suggestion.purpose,
            currentStock: matchedInventory ? matchedInventory.stock : null,
          }),
        );
      });

      return nextRows.length > 0 ? nextRows : [defaultRow()];
    });

    toast('최근 사용 통계 기준으로 자주 신청한 물품을 채웠습니다.', 'success');
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm animate-in fade-in duration-300">
      <div className="flex flex-col gap-3 border-b border-[var(--toss-blue-light)] bg-[var(--toss-blue-light)]/50 p-3 md:flex-row md:items-center md:justify-between">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:flex-wrap md:items-center">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-[var(--accent)]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
            SY INC 경영지원팀 재고 기준
          </p>
          <button
            type="button"
            data-testid="supplies-add-row-button"
            onClick={addItemRow}
            className="inline-flex items-center justify-center gap-1 rounded-[var(--radius-md)] bg-[var(--card)] px-3 py-1.5 text-[11px] font-bold text-[var(--foreground)] shadow-sm transition-colors hover:bg-[var(--muted)]"
          >
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[var(--foreground)] pb-[1px] text-[11px] leading-none">
              +
            </span>
            항목 추가
          </button>
          <button
            type="button"
            data-testid="supplies-remove-row-button"
            onClick={removeLastItemRow}
            disabled={items.length <= 1}
            className="inline-flex items-center justify-center rounded-[var(--radius-md)] bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-500 transition-colors hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            항목 삭제
          </button>
          <button
            type="button"
            data-testid="supplies-stats-fill-button"
            onClick={applyMonthlyStats}
            disabled={statsLoading || monthlySuggestions.length === 0}
            className="inline-flex items-center justify-center gap-1 rounded-full bg-[var(--accent)] px-3 py-1.5 text-[11px] font-bold text-white shadow-sm transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            통계치 입력
          </button>
        </div>
        <div className="flex flex-col gap-2 text-[11px] font-semibold text-[var(--toss-gray-4)] sm:flex-row sm:flex-wrap sm:items-center">
          <span>사용 부서 일괄 적용</span>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:items-center">
            <select
              value={bulkDept}
              onChange={(event) => setBulkDept(event.target.value)}
              className="min-h-[44px] rounded-[var(--radius-md)] border-none bg-[var(--card)] px-3 py-2 text-[13px] font-bold text-[var(--foreground)] shadow-sm outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
            >
              <option value="">선택...</option>
              {DEPARTMENTS.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={applyBulkDept}
              disabled={!bulkDept}
              className="min-h-[44px] rounded-[var(--radius-md)] bg-black px-4 py-2 text-[12px] font-semibold text-white transition-opacity disabled:opacity-40"
            >
              전체 적용
            </button>
          </div>
        </div>
      </div>

      {(statsLoading || monthlySuggestions.length > 0) ? (
        <div className="border-b border-[var(--border)] bg-[var(--background)]/35 px-3 py-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-[12px] font-black text-[var(--foreground)]">통계치 입력</p>
              <p className="mt-1 text-[11px] font-semibold leading-relaxed text-[var(--toss-gray-3)]">
                최근 30일 물품신청 기준으로 자주 쓰는 품목을 평균 수량으로 추천합니다.
              </p>
            </div>
            {!statsLoading && monthlySuggestions.length > 0 ? (
              <p className="text-[11px] font-semibold text-[var(--accent)]">추천 {monthlySuggestions.length}개</p>
            ) : null}
          </div>

          {statsLoading ? (
            <div className="mt-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)]">
              추천 품목을 불러오는 중입니다.
            </div>
          ) : (
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {monthlySuggestions.map((suggestion, index) => (
                <div
                  key={suggestion.key}
                  data-testid={`supplies-stats-item-${index}`}
                  className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-black text-[var(--foreground)]">{suggestion.name}</p>
                      <p className="mt-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                        {suggestion.dept || '부서 미지정'}
                        {suggestion.purpose ? ` · ${suggestion.purpose}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[var(--toss-blue-light)] px-2.5 py-1 text-[11px] font-black text-[var(--accent)]">
                      평균 {suggestion.average_qty}개
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold text-[var(--toss-gray-3)]">
                    <span className="rounded-full bg-[var(--muted)] px-2 py-1">문서 {suggestion.document_count}건</span>
                    <span className="rounded-full bg-[var(--muted)] px-2 py-1">합계 {suggestion.total_qty}개</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className="bg-[var(--tab-bg)]/20 p-2 md:p-3">
        <div className="space-y-3 md:hidden">
          {items.map((item, index) => (
            <div
              key={index}
              className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-[12px] font-black text-[var(--foreground)]">항목 {index + 1}</span>
                {item.currentStock !== null ? (
                  <span
                    className={`shrink-0 rounded-[var(--radius-md)] px-2 py-1 text-[10px] font-bold ${
                      item.currentStock <= 5 ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                    }`}
                  >
                    SY INC 재고 {item.currentStock} {item.unit}
                  </span>
                ) : null}
              </div>

              <div className="space-y-3">
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">물품명</span>
                  <div className="relative">
                    <input
                      data-testid={`supplies-item-name-mobile-${index}`}
                      value={item.name}
                      onChange={(event) => handleSearch(index, event.target.value)}
                      onFocus={(event) => handleSearch(index, event.target.value)}
                      className="h-12 w-full rounded-[var(--radius-md)] border-none bg-[var(--muted)] px-3 text-sm font-bold text-[var(--foreground)] outline-none transition-all focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/20"
                      placeholder="물품명을 입력하세요"
                    />
                    {item.suggestions.length > 0 ? (
                      <div className="absolute left-0 top-full z-[100] mt-1 w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-sm">
                        {item.suggestions.map((suggestion, suggestionIndex) => (
                          <div
                            key={`${suggestion.name}-${suggestionIndex}`}
                            data-testid={`supplies-item-suggestion-mobile-${index}-${suggestionIndex}`}
                            onClick={() => selectItem(index, suggestion)}
                            className="flex cursor-pointer items-center justify-between gap-3 border-b p-3 text-[12px] font-bold transition-colors last:border-none hover:bg-[var(--muted)]"
                          >
                            <div className="min-w-0">
                              <span className="block truncate text-[var(--foreground)]">{suggestion.name}</span>
                              {suggestion.spec ? (
                                <span className="mt-1 block truncate text-[10px] font-semibold text-[var(--toss-gray-3)]">
                                  {suggestion.spec}
                                </span>
                              ) : null}
                            </div>
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                                suggestion.stock <= suggestion.min_stock
                                  ? 'bg-red-100 text-red-600'
                                  : 'bg-green-100 text-green-600'
                              }`}
                            >
                              재고 {suggestion.stock} {suggestion.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">수량 ({item.unit})</span>
                    <div className="flex items-center gap-2">
                      <input
                        data-testid={`supplies-item-qty-mobile-${index}`}
                        type="number"
                        min="1"
                        value={item.qty}
                        onChange={(event) => updateItemField(index, 'qty', event.target.value)}
                        className="h-12 w-full rounded-[var(--radius-md)] border-none bg-[var(--toss-blue-light)]/50 px-3 text-center text-2xl font-black tabular-nums text-[var(--accent)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                      />
                      <span
                        data-testid={`supplies-item-unit-mobile-${index}`}
                        className="shrink-0 rounded-full bg-[var(--muted)] px-3 py-2 text-[11px] font-black text-[var(--accent)]"
                      >
                        {item.unit}
                      </span>
                    </div>
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">사용부서</span>
                    <select
                      data-testid={`supplies-item-dept-mobile-${index}`}
                      value={item.dept}
                      onChange={(event) => updateItemField(index, 'dept', event.target.value)}
                      className="h-12 w-full rounded-[var(--radius-md)] border-none bg-[var(--muted)] px-3 text-sm font-bold text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                    >
                      <option value="">부서 선택</option>
                      {DEPARTMENTS.map((department) => (
                        <option key={department} value={department}>
                          {department}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="block space-y-1.5">
                  <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">용도</span>
                  <input
                    data-testid={`supplies-item-purpose-mobile-${index}`}
                    value={item.purpose}
                    onChange={(event) => updateItemField(index, 'purpose', event.target.value)}
                    className="h-12 w-full rounded-[var(--radius-md)] border-none bg-[var(--muted)] px-3 text-sm font-semibold text-[var(--foreground)] outline-none transition-all focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/20"
                    placeholder="사용 용도를 입력하세요"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] shadow-sm md:block">
          <table className="w-full max-w-full table-fixed border-collapse">
            <colgroup>
              <col className="w-[40%]" />
              <col className="w-[14%]" />
              <col className="w-[32%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead className="bg-[var(--muted)]">
              <tr className="border-b border-[var(--border)]">
                <th className="px-2.5 py-2 text-left text-[11px] font-bold text-[var(--toss-gray-4)]">물품명</th>
                <th className="px-2.5 py-2 text-left text-[11px] font-bold text-[var(--toss-gray-4)]">수량</th>
                <th className="px-2.5 py-2 text-left text-[11px] font-bold text-[var(--toss-gray-4)]">용도</th>
                <th className="px-2.5 py-2 text-left text-[11px] font-bold text-[var(--toss-gray-4)]">사용부서</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={index} className="border-b border-[var(--border)] last:border-b-0">
                  <td className="px-2 py-1.5 align-middle">
                    <div className="relative">
                      <input
                        data-testid={`supplies-item-name-${index}`}
                        value={item.name}
                        onChange={(event) => handleSearch(index, event.target.value)}
                        onFocus={(event) => handleSearch(index, event.target.value)}
                        className={`h-10 w-full rounded-[var(--radius-md)] border-none bg-[var(--muted)] px-2.5 text-xs font-bold text-[var(--foreground)] outline-none transition-all focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/20 ${
                          item.currentStock !== null ? 'pr-28' : 'pr-20'
                        }`}
                        placeholder="물품명을 입력하세요"
                      />
                      {item.currentStock !== null ? (
                        <span
                          className={`pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 rounded-[var(--radius-md)] px-1.5 py-0.5 text-[10px] font-bold ${
                            item.currentStock <= 5 ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                          }`}
                        >
                          재고 {item.currentStock} {item.unit}
                        </span>
                      ) : null}
                      {item.suggestions.length > 0 ? (
                        <div className="absolute left-0 top-full z-[100] mt-1 w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-sm">
                          {item.suggestions.map((suggestion, suggestionIndex) => (
                            <div
                              key={`${suggestion.name}-${suggestionIndex}`}
                              data-testid={`supplies-item-suggestion-${index}-${suggestionIndex}`}
                              onClick={() => selectItem(index, suggestion)}
                              className="flex cursor-pointer items-center justify-between gap-3 border-b p-3 text-[11px] font-bold transition-colors last:border-none hover:bg-[var(--muted)]"
                            >
                              <div className="min-w-0">
                                <span className="block truncate text-[var(--foreground)]">{suggestion.name}</span>
                                {suggestion.spec ? (
                                  <span className="mt-1 block truncate text-[10px] font-semibold text-[var(--toss-gray-3)]">
                                    {suggestion.spec}
                                  </span>
                                ) : null}
                              </div>
                              <span
                                className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                                  suggestion.stock <= suggestion.min_stock
                                    ? 'bg-red-100 text-red-600'
                                    : 'bg-green-100 text-green-600'
                                }`}
                              >
                                재고 {suggestion.stock} {suggestion.unit}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <div className="flex items-center gap-2">
                      <input
                        data-testid={`supplies-item-qty-${index}`}
                        type="number"
                        min="1"
                        value={item.qty}
                        onChange={(event) => updateItemField(index, 'qty', event.target.value)}
                        className="h-10 w-full min-w-[64px] rounded-[var(--radius-md)] border-none bg-[var(--toss-blue-light)]/50 px-2.5 text-center text-sm font-black tabular-nums tracking-tight text-[var(--accent)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                      />
                      <span
                        data-testid={`supplies-item-unit-${index}`}
                        className="shrink-0 rounded-full bg-[var(--muted)] px-2.5 py-1 text-[10px] font-black text-[var(--accent)]"
                      >
                        {item.unit}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <input
                      data-testid={`supplies-item-purpose-${index}`}
                      value={item.purpose}
                      onChange={(event) => updateItemField(index, 'purpose', event.target.value)}
                      className="h-10 w-full rounded-[var(--radius-md)] border-none bg-[var(--muted)] px-2.5 text-xs font-semibold text-[var(--foreground)] outline-none transition-all focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/20"
                      placeholder="사용 용도를 입력하세요"
                    />
                  </td>
                  <td className="px-1.5 py-1.5 align-middle">
                    <select
                      data-testid={`supplies-item-dept-${index}`}
                      value={item.dept}
                      onChange={(event) => updateItemField(index, 'dept', event.target.value)}
                      className="h-10 w-full max-w-[88px] rounded-[var(--radius-md)] border-none bg-[var(--muted)] px-1.5 text-[10px] font-bold text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                    >
                      <option value="">부서 선택</option>
                      {DEPARTMENTS.map((department) => (
                        <option key={department} value={department}>
                          {department}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
