'use client';

/**
 * 비품구매양식 — 비즈니스 로직 훅
 *
 * - state/fetch/effects/콜백을 한 곳에 모아 view 파일(비품구매양식.tsx)을
 *   렌더링 전용으로 유지.
 * - ApprovalComposerView와의 props 계약(setExtraData / initialItems / user)은
 *   유지. 새 필드(note/attachments)는 extraData에 부가 키로만 노출.
 *
 * JM2: fetch는 cancelled 플래그로 race 방지. 재정규화 effect 1회로 모음.
 * JM3: fetch 실패는 사용자 흐름을 막지 않음(빈 상태 fallback).
 * JM4: any 미사용. 외부 입력은 buildRowFromUnknown / sanitizeQuantity.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import {
  buildSupplyRequestMonthlySuggestions,
  normalizeInventoryUnit,
  normalizeSupplyRequestCategory,
  normalizeSupplyRequestItems,
  type SupplyRequestMonthlySuggestion,
} from '@/app/main/inventory-utils';
import {
  buildInventoryLabel,
  buildRowFromUnknown,
  defaultRow,
  formatDraftTime,
  getInventoryCompany,
  getInventoryDepartment,
  getInventoryItemName,
  getInventoryMinStock,
  getInventorySpec,
  getInventoryStock,
  getInventoryUnit,
  hasMeaningfulRow,
  MONTHLY_STATS_FETCH_LIMIT,
  MONTHLY_STATS_VISIBLE_LIMIT,
  normalizeInventoryKey,
  sanitizeQuantity,
  type DropdownPosition,
  type InventoryCatalogItem,
  type SupplyRow,
} from './supplies-helpers';

type UseSuppliesFormArgs = {
  setExtraData: (value: Record<string, unknown>) => void;
  initialItems?: unknown[];
  user?: Record<string, unknown> | null;
};

export type UseSuppliesFormReturn = ReturnType<typeof useSuppliesForm>;

export function useSuppliesForm({ setExtraData, initialItems, user }: UseSuppliesFormArgs) {
  const [items, setItems] = useState<SupplyRow[]>(() => {
    if (Array.isArray(initialItems) && initialItems.length > 0) {
      return initialItems.map(buildRowFromUnknown);
    }
    return [defaultRow()];
  });
  const [inventory, setInventory] = useState<unknown[]>([]);
  const [monthlySuggestions, setMonthlySuggestions] = useState<SupplyRequestMonthlySuggestion[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [sortKey, setSortKey] = useState<'category' | 'name' | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [note, setNote] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  const requesterDepartment = useMemo(() => {
    const currentDepartment = String(user?.department || user?.team || '').trim();
    if (currentDepartment) return currentDepartment;
    return (
      normalizeSupplyRequestItems(
        Array.isArray(initialItems) ? (initialItems as Record<string, unknown>[]) : [],
      )
        .map((item) => item.dept)
        .find(Boolean) || ''
    );
  }, [initialItems, user?.department, user?.team]);

  const requesterCompany = useMemo(() => String(user?.company || '').trim(), [user?.company]);
  const requesterInventoryLabel = useMemo(
    () => buildInventoryLabel(requesterCompany, requesterDepartment),
    [requesterCompany, requesterDepartment],
  );

  const inventoryCatalog = useMemo<InventoryCatalogItem[]>(() => {
    const merged = new Map<string, InventoryCatalogItem>();
    inventory.forEach((row) => {
      const name = getInventoryItemName(row);
      if (!name) return;
      const key = normalizeInventoryKey(name);
      const rowUnit = getInventoryUnit(row);
      const rowSpec = getInventorySpec(row);
      const rowRecord = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
      const rowCategory = normalizeSupplyRequestCategory(rowRecord.category);
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
      if (!current.spec && rowSpec) current.spec = rowSpec;
      if (!current.category && rowCategory) current.category = rowCategory;
      if (current.unit !== 'BOX' && rowUnit === 'BOX') current.unit = rowUnit;
      merged.set(key, current);
    });
    return Array.from(merged.values()).sort((l, r) => l.name.localeCompare(r.name, 'ko'));
  }, [inventory]);

  const departmentStockByName = useMemo(() => {
    const merged = new Map<string, number>();
    if (!requesterDepartment) return merged;
    inventory.forEach((row) => {
      const name = getInventoryItemName(row);
      if (!name) return;
      if (
        normalizeInventoryKey(getInventoryDepartment(row)) !==
        normalizeInventoryKey(requesterDepartment)
      ) {
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

  // --- fetch effects ---
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const { data } = await supabase.from('inventory').select('*');
        if (cancelled) return;
        if (data) setInventory(data as unknown[]);
      } catch {
        /* JM3: 양식 사용 막지 않음 */
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setStatsLoading(true);
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      let query = supabase
        .from('approvals')
        .select('id, created_at, status, sender_company, meta_data')
        .eq('type', '물품신청')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(MONTHLY_STATS_FETCH_LIMIT);
      const companyName = String(user?.company || '').trim();
      if (companyName) query = query.eq('sender_company', companyName);
      try {
        const { data } = await query;
        if (cancelled) return;
        const next = buildSupplyRequestMonthlySuggestions(
          (data || []).filter((r) => String(r?.status || '').trim() !== '반려'),
          MONTHLY_STATS_FETCH_LIMIT,
        );
        setMonthlySuggestions(next);
      } catch {
        if (!cancelled) setMonthlySuggestions([]);
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [user?.company]);

  useEffect(() => {
    setItems((prev) =>
      prev.map((item) => {
        if (!item.name.trim()) return item;
        const itemKey = normalizeInventoryKey(item.name);
        const matched = inventoryCatalog.find(
          (e) => normalizeInventoryKey(e.name) === itemKey,
        );
        const departmentStock = departmentStockByName.get(itemKey);
        return {
          ...item,
          currentStock:
            matched || departmentStockByName.has(itemKey) ? departmentStock ?? 0 : null,
          unit: matched ? matched.unit : item.unit,
        };
      }),
    );
  }, [departmentStockByName, inventoryCatalog]);

  useEffect(() => {
    const normalized = normalizeSupplyRequestItems(
      items.map((i) => ({ ...i, dept: requesterDepartment })),
    );
    setExtraData({
      items: normalized,
      requester_department: requesterDepartment || null,
      inventory_source_company: requesterCompany || null,
      inventory_source_department: requesterDepartment || null,
      note: note.trim() || null,
      attachment_count: attachments.length,
    });
    setDraftSavedAt(formatDraftTime(new Date()));
  }, [items, note, attachments.length, requesterCompany, requesterDepartment, setExtraData]);

  const visibleMonthlySuggestions = useMemo(
    () => monthlySuggestions.slice(0, MONTHLY_STATS_VISIBLE_LIMIT),
    [monthlySuggestions],
  );

  const statsSummaryText = useMemo(() => {
    if (statsLoading) return '최근 30일 물품신청 통계를 불러오는 중입니다.';
    if (visibleMonthlySuggestions.length === 0) return '최근 30일 통계가 없습니다.';
    return `최근 30일 추천 ${visibleMonthlySuggestions.length}개`;
  }, [statsLoading, visibleMonthlySuggestions.length]);

  // --- 자동완성 드롭다운 portal ---
  const inputRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const [dropdownPos, setDropdownPos] = useState<DropdownPosition | null>(null);
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

  // --- 행 편집 핸들러 ---
  const handleSearch = useCallback(
    (index: number, value: string) => {
      const keyword = normalizeInventoryKey(value);
      setItems((prev) =>
        prev.map((item, itemIndex) => {
          if (itemIndex !== index) return item;
          const exactMatch = keyword
            ? inventoryCatalog.find((e) => normalizeInventoryKey(e.name) === keyword)
            : null;
          const departmentStock = keyword ? departmentStockByName.get(keyword) : null;
          return {
            ...item,
            name: value,
            currentStock:
              exactMatch || departmentStockByName.has(keyword) ? departmentStock ?? 0 : null,
            unit: exactMatch ? exactMatch.unit : item.unit,
            category: exactMatch && exactMatch.category ? exactMatch.category : item.category,
            suggestions: keyword
              ? inventoryCatalog
                  .filter((e) => {
                    const n = normalizeInventoryKey(e.name);
                    return n.startsWith(keyword) || n.includes(keyword);
                  })
                  .map((e) => ({
                    ...e,
                    stock: departmentStockByName.get(normalizeInventoryKey(e.name)) ?? e.stock,
                  }))
                  .slice(0, 8)
              : [],
          };
        }),
      );
    },
    [departmentStockByName, inventoryCatalog],
  );

  const selectItem = useCallback(
    (index: number, selected: InventoryCatalogItem) => {
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
    },
    [departmentStockByName],
  );

  const updateItemField = useCallback(
    (index: number, key: 'qty' | 'category' | 'purpose' | 'unit', value: unknown) => {
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
    },
    [],
  );

  const handleSort = useCallback(
    (key: 'category' | 'name') => {
      const nextAsc = sortKey === key ? !sortAsc : true;
      setSortKey(key);
      setSortAsc(nextAsc);
      setItems((prev) =>
        [...prev].sort((a, b) => {
          const av = key === 'category' ? a.category || '기타' : a.name;
          const bv = key === 'category' ? b.category || '기타' : b.name;
          const cmp = av.localeCompare(bv, 'ko');
          return nextAsc ? cmp : -cmp;
        }),
      );
    },
    [sortAsc, sortKey],
  );

  const addItemRow = useCallback(() => setItems((p) => [...p, defaultRow()]), []);
  const removeLastItemRow = useCallback(
    () => setItems((p) => (p.length > 1 ? p.slice(0, -1) : p)),
    [],
  );
  const removeItemAt = useCallback((rowIndex: number) => {
    setItems((p) => (p.length <= 1 ? p : p.filter((_, i) => i !== rowIndex)));
  }, []);

  const insertSuggestionRow = useCallback(
    (suggestion: SupplyRequestMonthlySuggestion) => {
      setItems((prev) => {
        const matched = inventoryCatalog.find(
          (e) => normalizeInventoryKey(e.name) === normalizeInventoryKey(suggestion.name),
        );
        const departmentStock =
          departmentStockByName.get(normalizeInventoryKey(suggestion.name)) ?? 0;
        const newRow = defaultRow({
          name: suggestion.name,
          qty: suggestion.average_qty,
          unit: matched ? matched.unit : 'EA',
          category: normalizeSupplyRequestCategory(suggestion.category),
          purpose: suggestion.purpose,
          currentStock:
            matched || departmentStockByName.has(normalizeInventoryKey(suggestion.name))
              ? departmentStock
              : null,
        });
        const existingIndex = prev.findIndex(
          (row) =>
            normalizeInventoryKey(row.name) === normalizeInventoryKey(suggestion.name) &&
            row.category.trim() === suggestion.category &&
            row.purpose.trim() === suggestion.purpose,
        );
        if (existingIndex >= 0) {
          const next = [...prev];
          next[existingIndex] = {
            ...next[existingIndex],
            qty: Math.max(next[existingIndex].qty, suggestion.average_qty),
            currentStock:
              matched || departmentStockByName.has(normalizeInventoryKey(suggestion.name))
                ? departmentStock
                : next[existingIndex].currentStock,
            unit: matched ? matched.unit : next[existingIndex].unit,
          };
          return next;
        }
        const last = prev[prev.length - 1];
        if (last && !hasMeaningfulRow(last)) {
          return [...prev.slice(0, -1), newRow, last];
        }
        return [...prev, newRow];
      });
      toast(`${suggestion.name} 추가됨`, 'success');
    },
    [departmentStockByName, inventoryCatalog],
  );

  // --- 파생값 ---
  const outOfStockCount = useMemo(
    () => items.filter((i) => i.name.trim() && i.currentStock === 0).length,
    [items],
  );
  const filledItemCount = useMemo(
    () => items.filter((i) => i.name.trim()).length,
    [items],
  );
  const totalQty = useMemo(
    () =>
      items
        .filter((i) => i.name.trim())
        .reduce((sum, i) => sum + (Number(i.qty) || 0), 0),
    [items],
  );

  return {
    items,
    note,
    setNote,
    attachments,
    setAttachments,
    statsExpanded,
    setStatsExpanded,
    statsLoading,
    visibleMonthlySuggestions,
    statsSummaryText,
    requesterDepartment,
    requesterInventoryLabel,
    departmentStockByName,
    draftSavedAt,
    outOfStockCount,
    filledItemCount,
    totalQty,
    sortKey,
    sortAsc,
    inputRefs,
    dropdownPos,
    activeDropdownIndex,
    setActiveDropdownIndex,
    handleSearch,
    selectItem,
    updateItemField,
    updateDropdownPosition,
    handleSort,
    addItemRow,
    removeLastItemRow,
    removeItemAt,
    insertSuggestionRow,
  };
}
