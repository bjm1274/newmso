'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import {
  buildSupplyRequestMonthlySuggestions,
  INVENTORY_SUPPORT_COMPANY,
  INVENTORY_SUPPORT_DEPARTMENT,
  normalizeSupplyRequestItems,
  type SupplyRequestMonthlySuggestion,
} from '@/app/main/inventory-utils';

type SupplyRow = {
  name: string;
  qty: number;
  currentStock: number | null;
  dept: string;
  purpose: string;
  suggestions: InventoryCatalogItem[];
};

type InventoryCatalogItem = {
  name: string;
  stock: number;
  min_stock: number;
};

type SuppliesFormProps = {
  setExtraData: (value: Record<string, unknown>) => void;
  initialItems?: unknown[];
  user?: Record<string, unknown> | null;
};

const MONTHLY_STATS_LIMIT = 8;
const departments = ['병동팀', '수술팀', '외래팀', '검사팀', '총무팀', '원무팀', '진료부', '관리팀', '영양팀'];

function defaultRow(overrides: Partial<Omit<SupplyRow, 'suggestions'>> = {}): SupplyRow {
  return {
    name: '',
    qty: 1,
    currentStock: null,
    dept: '',
    purpose: '',
    suggestions: [],
    ...overrides,
  };
}

function getInventoryItemName(row: any) {
  return String(row?.item_name || row?.name || '').trim();
}

function getInventoryStock(row: any) {
  const raw = row?.quantity ?? row?.stock ?? 0;
  return Number(raw) || 0;
}

function getInventoryMinStock(row: any) {
  const raw = row?.min_quantity ?? row?.min_stock ?? 0;
  return Number(raw) || 0;
}

function isTargetInventory(row: any) {
  return (
    String(row?.company || '').trim() === INVENTORY_SUPPORT_COMPANY &&
    String(row?.department || '').trim() === INVENTORY_SUPPORT_DEPARTMENT
  );
}

function sanitizeQuantity(value: unknown) {
  return Math.max(1, Number(value) || 1);
}

function buildRowFromUnknown(input: unknown): SupplyRow {
  const row = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return defaultRow({
    name: String(row.name || '').trim(),
    qty: sanitizeQuantity(row.qty),
    currentStock: row.currentStock == null ? null : Number(row.currentStock) || 0,
    dept: String(row.dept || row.department || '').trim(),
    purpose: String(row.purpose || '').trim(),
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
        const current = merged.get(key) || { name, stock: 0, min_stock: 0 };
        current.stock += getInventoryStock(row);
        current.min_stock = Math.max(current.min_stock, getInventoryMinStock(row));
        merged.set(key, current);
      });

    return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
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

  const handleSearch = (idx: number, value: string) => {
    const keyword = value.trim().toLowerCase();
    setItems((prev) =>
      prev.map((item, itemIdx) => {
        if (itemIdx !== idx) return item;
        const exactMatch = keyword
          ? inventoryCatalog.find((entry) => entry.name.toLowerCase() === keyword)
          : null;
        return {
          ...item,
          name: value,
          currentStock: exactMatch ? exactMatch.stock : null,
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

  const selectItem = (idx: number, selected: InventoryCatalogItem) => {
    setItems((prev) =>
      prev.map((item, itemIdx) =>
        itemIdx === idx
          ? {
              ...item,
              name: selected.name,
              currentStock: selected.stock,
              suggestions: [],
            }
          : item,
      ),
    );
  };

  const applyBulkDept = () => {
    if (!bulkDept) return;
    setItems((prev) => prev.map((item) => ({ ...item, dept: bulkDept })));
  };

  const updateItemField = (idx: number, key: 'qty' | 'dept' | 'purpose', value: unknown) => {
    setItems((prev) =>
      prev.map((item, itemIdx) =>
        itemIdx === idx
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

  const applyMonthlyStats = () => {
    if (monthlySuggestions.length === 0) {
      toast('최근 한 달 기준 추천할 물품 통계가 아직 없습니다.', 'warning');
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
          };
          return;
        }

        nextRows.push(
          defaultRow({
            name: suggestion.name,
            qty: suggestion.average_qty,
            dept: suggestion.dept,
            purpose: suggestion.purpose,
            currentStock: matchedInventory ? matchedInventory.stock : null,
          }),
        );
      });

      return nextRows.length > 0 ? nextRows : [defaultRow()];
    });

    toast('최근 한 달 통계 기준 자주 신청한 물품을 신청서에 채웠습니다.', 'success');
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm animate-in fade-in duration-300">
      <div className="flex flex-col gap-3 border-b border-[var(--toss-blue-light)] bg-[var(--toss-blue-light)]/50 p-3 md:flex-row md:items-center md:justify-between">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:flex-wrap md:items-center">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-[var(--accent)]">
            <span className="h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
            SY INC 경영지원팀 재고
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
            품목 추가하기
          </button>
          <button
            type="button"
            data-testid="supplies-remove-row-button"
            onClick={removeLastItemRow}
            disabled={items.length <= 1}
            className="inline-flex items-center justify-center rounded-[var(--radius-md)] bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-500 transition-colors hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            품목 제거하기
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
              {departments.map((department) => (
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

      <div className="border-b border-[var(--border)] bg-[var(--background)]/35 px-3 py-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[12px] font-black text-[var(--foreground)]">통계치 입력</p>
            <p className="mt-1 text-[11px] font-semibold leading-relaxed text-[var(--toss-gray-3)]">
              최근 한 달 물품신청 기준으로 자주 신청한 품목을 평균 수량으로 한 번에 채웁니다.
            </p>
            <p className="mt-1 text-[11px] font-semibold leading-relaxed text-[var(--accent)]">
              기본 재고 원천: {INVENTORY_SUPPORT_COMPANY} · {INVENTORY_SUPPORT_DEPARTMENT}
            </p>
          </div>
          {!statsLoading && monthlySuggestions.length > 0 ? (
            <p className="text-[11px] font-semibold text-[var(--accent)]">
              추천 {monthlySuggestions.length}개
            </p>
          ) : null}
        </div>

        {statsLoading ? (
          <div className="mt-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)]">
            최근 한 달 물품신청 통계를 불러오는 중입니다.
          </div>
        ) : monthlySuggestions.length === 0 ? (
          <div className="mt-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)]">
            아직 이번 달 통계가 없어 자동으로 채울 추천 품목이 없습니다.
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

      <div className="bg-[var(--tab-bg)]/20 p-2 md:p-3">
        <div className="space-y-3 md:hidden">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-[12px] font-black text-[var(--foreground)]">품목 {idx + 1}</span>
                {item.currentStock !== null && (
                  <span
                    className={`shrink-0 rounded-[var(--radius-md)] px-2 py-1 text-[10px] font-bold ${
                      item.currentStock <= 5 ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                    }`}
                  >
                    SY INC 재고 {item.currentStock}
                  </span>
                )}
              </div>

              <div className="space-y-3">
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">물품명</span>
                  <div className="relative">
                    <input
                      data-testid={`supplies-item-name-mobile-${idx}`}
                      value={item.name}
                      onChange={(event) => handleSearch(idx, event.target.value)}
                      onFocus={(event) => handleSearch(idx, event.target.value)}
                      className="h-12 w-full rounded-[var(--radius-md)] border-none bg-[var(--muted)] px-3 text-sm font-bold text-[var(--foreground)] outline-none transition-all focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/20"
                      placeholder="품목명 입력"
                    />
                    {item.suggestions.length > 0 && (
                      <div className="absolute left-0 top-full z-[100] mt-1 w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-sm">
                        {item.suggestions.map((suggestion, suggestionIndex) => (
                          <div
                            key={`${suggestion.name}-${suggestionIndex}`}
                            onClick={() => selectItem(idx, suggestion)}
                            className="flex cursor-pointer items-center justify-between border-b p-3 text-[12px] font-bold transition-colors last:border-none hover:bg-[var(--muted)]"
                          >
                            <span className="text-[var(--foreground)]">{suggestion.name}</span>
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                                suggestion.stock <= suggestion.min_stock
                                  ? 'bg-red-100 text-red-600'
                                  : 'bg-green-100 text-green-600'
                              }`}
                            >
                              경영지원 재고: {suggestion.stock}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">수량</span>
                    <input
                      data-testid={`supplies-item-qty-mobile-${idx}`}
                      type="number"
                      min="1"
                      value={item.qty}
                      onChange={(event) => updateItemField(idx, 'qty', event.target.value)}
                      className="h-12 w-full rounded-[var(--radius-md)] border-none bg-[var(--toss-blue-light)]/50 px-3 text-center text-2xl font-black tabular-nums text-[var(--accent)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">사용부서</span>
                    <select
                      data-testid={`supplies-item-dept-mobile-${idx}`}
                      className="h-12 w-full rounded-[var(--radius-md)] border-none bg-[var(--muted)] px-3 text-sm font-bold text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                      value={item.dept}
                      onChange={(event) => updateItemField(idx, 'dept', event.target.value)}
                    >
                      <option value="">부서 선택</option>
                      {departments.map((department) => (
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
                    data-testid={`supplies-item-purpose-mobile-${idx}`}
                    value={item.purpose}
                    onChange={(event) => updateItemField(idx, 'purpose', event.target.value)}
                    className="h-12 w-full rounded-[var(--radius-md)] border-none bg-[var(--muted)] px-3 text-sm font-semibold text-[var(--foreground)] outline-none transition-all focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/20"
                    placeholder="용도 입력"
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
              {items.map((item, idx) => (
                <tr key={idx} className="border-b border-[var(--border)] last:border-b-0">
                  <td className="px-2 py-1.5 align-middle">
                    <div className="relative">
                      <input
                        data-testid={`supplies-item-name-${idx}`}
                        value={item.name}
                        onChange={(event) => handleSearch(idx, event.target.value)}
                        onFocus={(event) => handleSearch(idx, event.target.value)}
                        className={`h-10 w-full rounded-[var(--radius-md)] border-none bg-[var(--muted)] px-2.5 text-xs font-bold text-[var(--foreground)] outline-none transition-all focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/20 ${
                          item.currentStock !== null ? 'pr-24' : 'pr-20'
                        }`}
                        placeholder="품목명 입력"
                      />
                      {item.currentStock !== null && (
                        <span
                          className={`pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 rounded-[var(--radius-md)] px-1.5 py-0.5 text-[10px] font-bold ${
                            item.currentStock <= 5 ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                          }`}
                        >
                          SY INC 재고 {item.currentStock}
                        </span>
                      )}
                      {item.suggestions.length > 0 && (
                        <div className="absolute left-0 top-full z-[100] mt-1 w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-sm">
                          {item.suggestions.map((suggestion, suggestionIndex) => (
                            <div
                              key={`${suggestion.name}-${suggestionIndex}`}
                              onClick={() => selectItem(idx, suggestion)}
                              className="flex cursor-pointer items-center justify-between border-b p-3 text-[11px] font-bold transition-colors last:border-none hover:bg-[var(--muted)]"
                            >
                              <span className="text-[var(--foreground)]">{suggestion.name}</span>
                              <span
                                className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                                  suggestion.stock <= suggestion.min_stock
                                    ? 'bg-red-100 text-red-600'
                                    : 'bg-green-100 text-green-600'
                                }`}
                              >
                                경영지원 재고: {suggestion.stock}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <input
                      data-testid={`supplies-item-qty-${idx}`}
                      type="number"
                      min="1"
                      value={item.qty}
                      onChange={(event) => updateItemField(idx, 'qty', event.target.value)}
                      className="h-10 w-full min-w-[64px] rounded-[var(--radius-md)] border-none bg-[var(--toss-blue-light)]/50 px-2.5 text-center text-sm font-black tabular-nums tracking-tight text-[var(--accent)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                    />
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <input
                      data-testid={`supplies-item-purpose-${idx}`}
                      value={item.purpose}
                      onChange={(event) => updateItemField(idx, 'purpose', event.target.value)}
                      className="h-10 w-full rounded-[var(--radius-md)] border-none bg-[var(--muted)] px-2.5 text-xs font-semibold text-[var(--foreground)] outline-none transition-all focus:bg-[var(--card)] focus:ring-2 focus:ring-[var(--accent)]/20"
                      placeholder="용도 입력"
                    />
                  </td>
                  <td className="px-1.5 py-1.5 align-middle">
                    <select
                      data-testid={`supplies-item-dept-${idx}`}
                      className="h-10 w-full max-w-[88px] rounded-[var(--radius-md)] border-none bg-[var(--muted)] px-1.5 text-[10px] font-bold text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                      value={item.dept}
                      onChange={(event) => updateItemField(idx, 'dept', event.target.value)}
                    >
                      <option value="">부서 선택</option>
                      {departments.map((department) => (
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
