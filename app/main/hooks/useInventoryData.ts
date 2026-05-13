'use client';

import { useState, useCallback, useRef } from 'react';
import type { InventoryItem, Supplier } from '@/types';
import { supabase } from '@/lib/supabase';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import {
  buildInventorySelect,
  INVENTORY_OPTIONAL_COLUMNS,
  INVENTORY_LOG_LIST_SELECT,
  SUPPLIER_LIST_SELECT,
} from '@/lib/inventory-query-columns';

/**
 * 재고·거래처·로그 데이터 로딩을 담당하는 훅.
 * 기존 메인 컴포넌트의 fetchInventory / fetchSuppliers / fetchLogs를 통합.
 */
export function useInventoryData({
  isMsoUser,
  selectedCo,
  selectedCompanyId,
  userCompany,
  userCompanyId,
}: {
  isMsoUser: boolean;
  selectedCo?: string;
  selectedCompanyId?: string | null;
  userCompany?: string | null;
  userCompanyId?: string | null;
}) {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const inventoryLoadedRef = useRef(false);

  const fetchInventory = useCallback(async (companyFilter?: string) => {
    if (!inventoryLoadedRef.current) setLoading(true);
    try {
      const effectiveCo = companyFilter !== undefined ? companyFilter : selectedCo;
      const scopedCompanyName = !isMsoUser
        ? userCompany || null
        : effectiveCo && effectiveCo !== '전체' ? effectiveCo : null;
      const scopedCompanyId = !isMsoUser
        ? userCompanyId ?? null
        : scopedCompanyName && selectedCompanyId ? selectedCompanyId : null;

      const { data, error } = await withMissingColumnsFallback<InventoryItem[]>(
        (omittedColumns) => {
          let query = supabase
            .from('inventory')
            .select(buildInventorySelect(omittedColumns))
            .order('item_name', { ascending: true });
          if (scopedCompanyName) query = query.eq('company', scopedCompanyName);
          else if (scopedCompanyId && !omittedColumns.has('company_id')) {
            query = query.eq('company_id', scopedCompanyId);
          }
          return query.returns<InventoryItem[]>();
        },
        INVENTORY_OPTIONAL_COLUMNS,
      );
      if (error) throw error;
      if (data) { setInventory(data); inventoryLoadedRef.current = true; }
    } catch (err) {
      console.error('재고 데이터 로드 실패:', err);
      setInventory([]);
    } finally {
      setLoading(false);
    }
  }, [isMsoUser, selectedCo, selectedCompanyId, userCompany, userCompanyId]);

  const fetchSuppliers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select(SUPPLIER_LIST_SELECT)
        .returns<Supplier[]>();
      if (error) throw error;
      if (data) setSuppliers(data);
    } catch (err) {
      console.error('거래처 데이터 로드 실패:', err);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const { data, error } = await withMissingColumnsFallback<Record<string, unknown>[]>(
        (omittedColumns) => {
          let query = supabase
            .from('inventory_logs')
            .select(INVENTORY_LOG_LIST_SELECT)
            .order('created_at', { ascending: false })
            .limit(100);
          if (isMsoUser) {
            if (selectedCo && selectedCo !== '전체') query = query.eq('company', selectedCo);
            else if (selectedCompanyId && !omittedColumns.has('company_id')) {
              query = query.eq('company_id', selectedCompanyId);
            }
          } else if (userCompany) {
            query = query.eq('company', userCompany);
          } else if (userCompanyId && !omittedColumns.has('company_id')) {
            query = query.eq('company_id', userCompanyId);
          }
          return query.returns<Record<string, unknown>[]>();
        },
        ['company_id'],
      );
      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('재고 로그 조회 실패:', error);
      setLogs([]);
    }
  }, [isMsoUser, selectedCo, selectedCompanyId, userCompany, userCompanyId]);

  return {
    inventory, setInventory,
    suppliers,
    logs,
    loading,
    fetchInventory,
    fetchSuppliers,
    fetchLogs,
  };
}
