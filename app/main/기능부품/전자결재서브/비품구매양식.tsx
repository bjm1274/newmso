'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import {
  buildSupplyRequestMonthlySuggestions,
  normalizeInventoryUnit,
  normalizeSupplyRequestCategory,
  normalizeSupplyRequestItems,
  SUPPLY_REQUEST_CATEGORY_OPTIONS,
  type SupplyRequestCategory,
  type SupplyRequestItemUnit,
  type SupplyRequestMonthlySuggestion,
} from '@/app/main/inventory-utils';
import SuppliesPurchaseGrid from './비품구매양식Grid';

export type SupplyRow = {
  name: string;
  qty: number;
  unit: SupplyRequestItemUnit;
  currentStock: number | null;
  category: SupplyRequestCategory | '';
  purpose: string;
  suggestions: InventoryCatalogItem[];
};

export type InventoryCatalogItem = {
  name: string;
  stock: number;
  min_stock: number;
  unit: SupplyRequestItemUnit;
  spec: string;
  category: SupplyRequestCategory | '';
};

type SuppliesFormProps = {
  setExtraData: (value: Record<string, unknown>) => void;
  initialItems?: unknown[];
  user?: Record<string, unknown> | null;
};

const MONTHLY_STATS_VISIBLE_LIMIT = 8;
const MONTHLY_STATS_FETCH_LIMIT = 200;

function defaultRow(overrides: Partial<Omit<SupplyRow, 'suggestions'>> = {}): SupplyRow {
  return {
    name: '',
    qty: 1,
    unit: 'EA',
    currentStock: null,
    category: '',
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

function normalizeInventoryKey(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function getInventoryCompany(row: any) {
  return String(row?.company || row?.company_name || '').trim();
}

function getInventoryDepartment(row: any) {
  return String(row?.department || row?.team || row?.dept || '').trim();
}

function buildRowFromUnknown(input: unknown): SupplyRow {
  const row = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return defaultRow({
    name: String(row.name || row.item_name || '').trim(),
    qty: sanitizeQuantity(row.qty || row.quantity),
    unit: normalizeInventoryUnit(row.unit),
    currentStock: row.currentStock == null ? null : Number(row.currentStock) || 0,
    category: normalizeSupplyRequestCategory(row.category || row.item_category || row.classification),
    purpose: String(row.purpose || row.reason || '').trim(),
  });
}

function hasMeaningfulRow(row: SupplyRow) {
  return Boolean(row.name.trim() || row.category.trim() || row.purpose.trim() || row.qty > 1);
}

export default function SuppliesForm({ setExtraData, initialItems, user }: SuppliesFormProps) {
  const [items, setItems] = useState<SupplyRow[]>(() => {
    if (Array.isArray(initialItems) && initialItems.length > 0) {
      return initialItems.map(buildRowFromUnknown);
    }
    return [defaultRow()];
  });
  const [inventory, setInventory] = useState<any[]>([]);
  const [monthlySuggestions, setMonthlySuggestions] = useState<SupplyRequestMonthlySuggestion[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [sortKey, setSortKey] = useState<'category' | 'name' | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const requesterDepartment = useMemo(() => {
    const currentDepartment = String(user?.department || user?.team || '').trim();
    if (currentDepartment) {
      return currentDepartment;
    }
    return normalizeSupplyRequestItems(Array.isArray(initialItems) ? (initialItems as any[]) : [])
      .map((item) => item.dept)
      .find(Boolean) || '';
  }, [initialItems, user?.department, user?.team]);
  const requesterCompany = useMemo(() => String(user?.company || '').trim(), [user?.company]);
  const requesterInventoryLabel = useMemo(() => {
    const labelParts = [requesterCompany, requesterDepartment].filter(Boolean);
    return labelParts.length > 0 ? `${labelParts.join(' ')} 재고 기준` : '소속 부서 재고 기준';
  }, [requesterCompany, requesterDepartment]);

  const inventoryCatalog = useMemo(() => {
    const merged = new Map<string, InventoryCatalogItem>();

    inventory.forEach((row) => {
      const name = getInventoryItemName(row);
      if (!name) return;

      const key = normalizeInventoryKey(name);
      const rowUnit = getInventoryUnit(row);
      const rowSpec = getInventorySpec(row);
      const rowCategory = normalizeSupplyRequestCategory(row?.category);
      const current = merged.get(key) || {
        name,
        stock: 0,
        min_stock: 0,
        unit: rowUnit,
        spec: rowSpec,
        category: rowCategory,
      };

      current.stock += getInventoryStock(row);
      current.min_stock = Math.max(current.min_stock, getInventoryMinStock(row));
      if (!current.spec && rowSpec) {
        current.spec = rowSpec;
      }
      if (!current.category && rowCategory) {
        current.category = rowCategory;
      }
      if (current.unit !== 'BOX' && rowUnit === 'BOX') {
        current.unit = rowUnit;
      }

      merged.set(key, current);
    });

    return Array.from(merged.values()).sort((left, right) => left.name.localeCompare(right.name, 'ko'));
  }, [inventory]);

  const departmentStockByName = useMemo(() => {
    const merged = new Map<string, number>();
    if (!requesterDepartment) {
      return merged;
    }

    inventory.forEach((row) => {
      const name = getInventoryItemName(row);
      if (!name) return;
      if (normalizeInventoryKey(getInventoryDepartment(row)) !== normalizeInventoryKey(requesterDepartment)) {
        return;
      }
      if (
        requesterCompany &&
        normalizeInventoryKey(getInventoryCompany(row)) !== normalizeInventoryKey(requesterCompany)
      ) {
        return;
      }

      const key = normalizeInventoryKey(name);
      merged.set(key, (merged.get(key) || 0) + getInventoryStock(row));
    });

    return merged;
  }, [inventory, requesterCompany, requesterDepartment]);

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
        MONTHLY_STATS_FETCH_LIMIT,
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
        const itemKey = normalizeInventoryKey(item.name);
        const matched = inventoryCatalog.find((entry) => normalizeInventoryKey(entry.name) === itemKey);
        const departmentStock = departmentStockByName.get(itemKey);
        return {
          ...item,
          currentStock: matched || departmentStockByName.has(itemKey) ? departmentStock ?? 0 : null,
          unit: matched ? matched.unit : item.unit,
        };
      }),
    );
  }, [departmentStockByName, inventoryCatalog]);

  useEffect(() => {
    const normalizedItems = normalizeSupplyRequestItems(
      items.map((item) => ({
        ...item,
        dept: requesterDepartment,
      })),
    );

    setExtraData({
      items: normalizedItems,
      requester_department: requesterDepartment || null,
      inventory_source_company: requesterCompany || null,
      inventory_source_department: requesterDepartment || null,
    });
  }, [items, requesterCompany, requesterDepartment, setExtraData]);

  const visibleMonthlySuggestions = useMemo(
    () => monthlySuggestions.slice(0, MONTHLY_STATS_VISIBLE_LIMIT),
    [monthlySuggestions],
  );

  const statsSummaryText = useMemo(() => {
    if (statsLoading) {
      return '최근 30일 물품신청 통계를 불러오는 중입니다.';
    }
    if (visibleMonthlySuggestions.length === 0) {
      return '최근 30일 통계가 없습니다.';
    }
    return `최근 30일 추천 ${visibleMonthlySuggestions.length}개`;
  }, [statsLoading, visibleMonthlySuggestions.length]);

  const handleSearch = (index: number, value: string) => {
    const keyword = normalizeInventoryKey(value);
    setItems((prev) =>
      prev.map((item, itemIndex) => {
        if (itemIndex !== index) return item;

        const exactMatch = keyword
          ? inventoryCatalog.find((entry) => normalizeInventoryKey(entry.name) === keyword)
          : null;
        const departmentStock = keyword ? departmentStockByName.get(keyword) : null;

        return {
          ...item,
          name: value,
          currentStock: exactMatch || departmentStockByName.has(keyword) ? departmentStock ?? 0 : null,
          unit: exactMatch ? exactMatch.unit : item.unit,
          category: exactMatch && exactMatch.category ? exactMatch.category : item.category,
          suggestions: keyword
            ? inventoryCatalog
                .filter((entry) => {
                  const name = normalizeInventoryKey(entry.name);
                  return name.startsWith(keyword) || name.includes(keyword);
                })
                .map((entry) => ({
                  ...entry,
                  stock: departmentStockByName.get(normalizeInventoryKey(entry.name)) ?? entry.stock,
                }))
                .slice(0, 8)
            : [],
        };
      }),
    );
  };

  const selectItem = (index: number, selected: InventoryCatalogItem) => {
    setActiveDropdownIndex(null);
    const itemKey = normalizeInventoryKey(selected.name);
    setItems((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              name: selected.name,
              currentStock: departmentStockByName.get(itemKey) ?? 0,
              unit: selected.unit,
              category: selected.category || item.category,
              suggestions: [],
            }
          : item,
      ),
    );
  };

  const updateItemField = (index: number, key: 'qty' | 'category' | 'purpose' | 'unit', value: unknown) => {
    setItems((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [key]:
                key === 'qty'
                  ? sanitizeQuantity(value)
                  : key === 'category'
                    ? normalizeSupplyRequestCategory(value)
                    : key === 'unit'
                      ? normalizeInventoryUnit(value)
                      : value,
            }
          : item,
      ),
    );
  };

  const inputRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [activeDropdownIndex, setActiveDropdownIndex] = useState<number | null>(null);

  const updateDropdownPosition = useCallback((index: number) => {
    const el = inputRefs.current.get(index);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropdownHeight = 240;
    const showAbove = spaceBelow < dropdownHeight && rect.top > dropdownHeight;
    setDropdownPos({
      top: showAbove ? rect.top - dropdownHeight : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
    setActiveDropdownIndex(index);
  }, []);

  // 바깥 클릭 시 드롭다운 닫기 + 리사이즈/스크롤 시 위치 갱신
  useEffect(() => {
    if (activeDropdownIndex === null) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-supply-dropdown]') || target.closest('[data-supply-input]')) return;
      setActiveDropdownIndex(null);
    };
    const handleReposition = () => updateDropdownPosition(activeDropdownIndex);
    const handleClose = () => setActiveDropdownIndex(null);
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleClose, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleClose, true);
    };
  }, [activeDropdownIndex, updateDropdownPosition]);

  const handleSort = (key: 'category' | 'name') => {
    const nextAsc = sortKey === key ? !sortAsc : true;
    setSortKey(key);
    setSortAsc(nextAsc);

    setItems((prev) => {
      const sorted = [...prev].sort((a, b) => {
        const av = key === 'category' ? (a.category || '기타') : a.name;
        const bv = key === 'category' ? (b.category || '기타') : b.name;
        const cmp = av.localeCompare(bv, 'ko');
        return nextAsc ? cmp : -cmp;
      });
      return sorted;
    });
  };

  const addItemRow = () => {
    setItems((prev) => [...prev, defaultRow()]);
  };

  const removeLastItemRow = () => {
    setItems((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  };

  const removeItemAt = (rowIndex: number) => {
    setItems((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, index) => index !== rowIndex);
    });
  };

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

        nextRows.push(
          defaultRow({
            name: suggestion.name,
            qty: suggestion.average_qty,
            unit: matchedInventory ? matchedInventory.unit : 'EA',
            category: normalizeSupplyRequestCategory(suggestion.category),
            purpose: suggestion.purpose,
            currentStock:
              matchedInventory || departmentStockByName.has(normalizeInventoryKey(suggestion.name))
                ? departmentStock
                : null,
          }),
        );
      });

      return nextRows.length > 0 ? nextRows : [defaultRow()];
    });

    toast('최근 신청 통계 기준으로 자주 신청한 물품을 채웠습니다.', 'success');
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm animate-in fade-in duration-300">
      <div className="flex flex-col gap-3 border-b border-[var(--toss-blue-light)] bg-[var(--toss-blue-light)]/50 p-3 md:flex-row md:items-center md:justify-between">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:flex-wrap md:items-center">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-[var(--accent)]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
            {requesterInventoryLabel}
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
            className="inline-flex items-center justify-center rounded-[var(--radius-md)] bg-red-500/10 px-3 py-1.5 text-[11px] font-bold text-red-500 transition-colors hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            항목 삭제
          </button>
          <button
            type="button"
            data-testid="supplies-stats-fill-button"
            onClick={applyMonthlyStats}
            disabled={statsLoading || visibleMonthlySuggestions.length === 0}
            className="inline-flex items-center justify-center gap-1 rounded-full bg-[var(--accent)] px-3 py-1.5 text-[11px] font-bold text-white shadow-sm transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            통계치 입력
          </button>
        </div>
        <div className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
          <span>신청부서</span>
          <span
            data-testid="supplies-requester-department"
            className="inline-flex min-h-[44px] items-center rounded-[var(--radius-md)] bg-[var(--card)] px-3 py-2 text-[13px] font-black text-[var(--foreground)] shadow-sm"
          >
            {requesterDepartment || '미지정'}
          </span>
        </div>
      </div>

      <div className="border-b border-[var(--border)] bg-[var(--background)]/35 px-3 py-3">
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
          <span className="shrink-0 rounded-full bg-[var(--card)] px-3 py-1.5 text-[11px] font-bold text-[var(--accent)] shadow-sm">
            {statsExpanded ? '접기' : '펼치기'}
          </span>
        </button>

        {statsExpanded ? (
          <div data-testid="supplies-stats-panel" className="mt-3">
            {statsLoading ? (
              <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                최근 신청 기준 추천 품목을 불러오는 중입니다.
              </div>
            ) : visibleMonthlySuggestions.length === 0 ? (
              <div
                data-testid="supplies-stats-empty"
                className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)]"
              >
                최근 30일 추천 통계가 없습니다.
              </div>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {visibleMonthlySuggestions.map((suggestion, index) => (
                  <div
                    key={suggestion.key}
                    data-testid={`supplies-stats-item-${index}`}
                    className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-black text-[var(--foreground)]">{suggestion.name}</p>
                        <p className="mt-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                          {suggestion.category || '품목구분 미지정'}
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
      </div>

      <div className="bg-[var(--tab-bg)]/20 p-2 md:p-3">
        <div className="space-y-3 md:hidden">
          {items.map((item, index) => (
            <div
              key={`mobile-reordered-${index}`}
              className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-[12px] font-black text-[var(--foreground)]">항목 {index + 1}</span>
                <button
                  type="button"
                  data-testid={`supplies-item-remove-mobile-${index}`}
                  onClick={() => removeItemAt(index)}
                  disabled={items.length <= 1}
                  aria-label={`항목 ${index + 1} 삭제`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--toss-gray-4)] transition-colors hover:border-red-300 hover:bg-red-500/10 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
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
                                  ? 'bg-red-500/20 text-red-600'
                                  : 'bg-green-500/20 text-green-600'
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
                    <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">품목구분</span>
                    <select
                      data-testid={`supplies-item-category-mobile-${index}`}
                      value={item.category}
                      onChange={(event) => updateItemField(index, 'category', event.target.value)}
                      className="h-12 w-full rounded-[var(--radius-md)] border-none bg-[var(--muted)] px-3 text-sm font-bold text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                    >
                      <option value="">품목구분 선택</option>
                      {SUPPLY_REQUEST_CATEGORY_OPTIONS.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">현재 재고</span>
                    <div
                      data-testid={`supplies-item-current-stock-mobile-${index}`}
                      className={`flex h-12 items-center justify-center rounded-[var(--radius-md)] px-3 text-sm font-black ${
                        item.currentStock === null
                          ? 'bg-[var(--muted)] text-[var(--toss-gray-3)]'
                          : item.currentStock <= 5
                            ? 'bg-red-500/10 text-red-600'
                            : 'bg-blue-500/10 text-blue-600'
                      }`}
                    >
                      {item.currentStock === null ? '-' : `${item.currentStock} ${item.unit}`}
                    </div>
                  </label>
                </div>

                <label className="block space-y-1.5">
                  <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">신청 수량 ({item.unit})</span>
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

        <SuppliesPurchaseGrid
          items={items}
          inputRefs={inputRefs}
          dropdownPos={dropdownPos}
          activeDropdownIndex={activeDropdownIndex}
          setActiveDropdownIndex={setActiveDropdownIndex}
          sortKey={sortKey}
          sortAsc={sortAsc}
          handleSearch={handleSearch}
          selectItem={selectItem}
          updateItemField={updateItemField}
          updateDropdownPosition={updateDropdownPosition}
          handleSort={handleSort}
          removeItemAt={removeItemAt}
        />

      </div>
    </div>
  );
}
