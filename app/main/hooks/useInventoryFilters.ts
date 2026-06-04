'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import type { InventoryItem } from '@/types';
import { getItemQuantity, getItemMinQuantity, isExpirySoon, EXPIRY_SOON_MS } from '@/app/main/inventory-utils';
import type { InventoryStatusFilter } from '@/app/main/기능부품/재고관리서브/types';
import { getKoreanTodayString } from '@/lib/seoul-time';

/**
 * 재고 필터링 로직을 담당하는 훅.
 * 회사/부서/검색어/상태 필터와 그에 따른 파생 데이터를 관리.
 */
export function useInventoryFilters({
  inventory,
  logs,
  depts,
  activeView,
}: {
  inventory: InventoryItem[];
  logs: Record<string, unknown>[];
  depts: Array<string | { name?: string }>;
  activeView: string;
}) {
  const [viewCompany, setViewCompany] = useState('전체');
  const [selectedDept, setSelectedDept] = useState('전체');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<InventoryStatusFilter>('전체');

  useEffect(() => { setSelectedDept('전체'); }, [viewCompany]);

  const companiesInInventory = useMemo(
    () => Array.from(new Set(inventory.map((i) => (i.company || '').trim()).filter(Boolean))).sort(),
    [inventory],
  );

  const getDepartmentsForCompany = useCallback((companyName: string) => {
    if (!companyName || companyName === '전체') return [];
    const invDepts = inventory
      .filter((i) => (i.company || '').trim() === companyName)
      .map((i) => ((i as Record<string, unknown>).department as string || '').trim())
      .filter(Boolean);
    const cfgDepts = Array.isArray(depts)
      ? depts.map((d) => (typeof d === 'string' ? d : (d as { name?: string })?.name || '').trim()).filter(Boolean)
      : [];
    return Array.from(new Set([...invDepts, ...cfgDepts])).sort();
  }, [inventory, depts]);

  const departmentsByViewCompany = useMemo(
    () => (!viewCompany || viewCompany === '전체') ? [] : getDepartmentsForCompany(viewCompany),
    [viewCompany, getDepartmentsForCompany],
  );

  const expiryThreshold = useMemo(() => Date.now() + EXPIRY_SOON_MS, []);

  const baseFilteredInventory = useMemo(() => {
    let list = inventory;
    if (activeView === '현황' && viewCompany && viewCompany !== '전체') {
      list = list.filter((i) => (i.company || '').trim() === viewCompany);
    }
    if (searchKeyword.trim()) {
      const k = searchKeyword.toLowerCase();
      list = list.filter((i) =>
        ((i as Record<string, unknown>).item_name as string || i.name || '').toLowerCase().includes(k) ||
        (i.name || '').toLowerCase().includes(k) ||
        (i.category || '').toLowerCase().includes(k) ||
        ((i as Record<string, unknown>).lot_number as string || '').toLowerCase().includes(k) ||
        ((i as Record<string, unknown>).serial_number as string || '').toLowerCase().includes(k) ||
        (i.company || '').toLowerCase().includes(k),
      );
    }
    if (selectedDept && selectedDept !== '전체') {
      list = list.filter((i) => ((i as Record<string, unknown>).department as string || '').trim() === selectedDept);
    }
    return list;
  }, [inventory, searchKeyword, selectedDept, activeView, viewCompany]);

  const filteredInventory = useMemo(() => {
    if (statusFilter === '전체') return baseFilteredInventory;
    return baseFilteredInventory.filter((item) => {
      const qty = getItemQuantity(item);
      const minQty = getItemMinQuantity(item);
      const expiry = isExpirySoon(item, expiryThreshold);
      if (statusFilter === '재고부족') return qty <= minQty;
      if (statusFilter === '유통기한임박') return expiry;
      if (statusFilter === '정상') return qty > minQty && !expiry;
      return true;
    });
  }, [baseFilteredInventory, expiryThreshold, statusFilter]);

  // 재고부족·유효기간임박·긴급 항목을 한 번의 순회로 계산
  const { lowStockFilteredItems, expiryFilteredItems, urgentActionItems } = useMemo(() => {
    const low: InventoryItem[] = [];
    const expiry: InventoryItem[] = [];
    const urgent: InventoryItem[] = [];
    for (const item of baseFilteredInventory) {
      const isLow = getItemQuantity(item) <= getItemMinQuantity(item);
      const isExp = isExpirySoon(item, expiryThreshold);
      if (isLow) low.push(item);
      if (isExp) expiry.push(item);
      if (isLow || isExp) urgent.push(item);
    }
    urgent.sort((a, b) => {
      const aLow = getItemQuantity(a) <= getItemMinQuantity(a);
      const bLow = getItemQuantity(b) <= getItemMinQuantity(b);
      if (aLow !== bLow) return aLow ? -1 : 1;
      return getItemQuantity(a) - getItemQuantity(b);
    });
    return {
      lowStockFilteredItems: low,
      expiryFilteredItems: expiry,
      urgentActionItems: urgent.slice(0, 6),
    };
  }, [baseFilteredInventory, expiryThreshold]);

  const totalQuantity = useMemo(
    () => filteredInventory.reduce((sum, item) => sum + getItemQuantity(item), 0),
    [filteredInventory],
  );

  const totalInventoryValue = useMemo(
    () => filteredInventory.reduce((sum, item) => sum + (Number((item as Record<string, unknown>).unit_price || 0) * getItemQuantity(item)), 0),
    [filteredInventory],
  );

  const outOfStockItems = useMemo(
    () => baseFilteredInventory.filter((item) => getItemQuantity(item) === 0),
    [baseFilteredInventory],
  );

  const inventoryNameById = useMemo(
    () => new Map(inventory.map((item) => [String(item.id), (item as Record<string, unknown>).item_name as string || item.name || '품목'])),
    [inventory],
  );

  const todayLogCount = useMemo(() => {
    const today = getKoreanTodayString();
    return logs.filter((log) => String(log.created_at || '').slice(0, 10) === today).length;
  }, [logs]);

  const recentLogPreview = useMemo(
    () => logs.slice(0, 5).map((log) => ({
      ...log,
      itemLabel: inventoryNameById.get(String(log.item_id || log.inventory_id || '')) || log.item_name || log.inventory_name || '품목',
    })),
    [inventoryNameById, logs],
  );

  return {
    viewCompany, setViewCompany,
    selectedDept, setSelectedDept,
    searchKeyword, setSearchKeyword,
    statusFilter, setStatusFilter,
    companiesInInventory,
    getDepartmentsForCompany,
    departmentsByViewCompany,
    expiryThreshold,
    filteredInventory,
    lowStockFilteredItems,
    expiryFilteredItems,
    urgentActionItems,
    totalQuantity,
    totalInventoryValue,
    outOfStockItems,
    inventoryNameById,
    todayLogCount,
    recentLogPreview,
  };
}
