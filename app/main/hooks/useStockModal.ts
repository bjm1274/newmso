'use client';

import { useState, useEffect, useCallback } from 'react';
import { useActionDialog } from '@/app/components/useActionDialog';
import type { InventoryItem, StaffMember } from '@/types';
import { supabase } from '@/lib/supabase';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import { toast } from '@/lib/toast';
import { getItemQuantity, getItemMinQuantity, requestInventoryReorder } from '@/app/main/inventory-utils';
import type { StockModalState } from '@/app/main/기능부품/재고관리서브/types';

/**
 * 입출고 모달 상태 + 처리 로직을 담당하는 훅.
 */
export function useStockModal({
  user,
  selectedCompanyId,
  refreshCurrentInventory,
  fetchLogs,
  onRefresh,
}: {
  user?: StaffMember;
  selectedCompanyId?: string | null;
  refreshCurrentInventory: () => Promise<void> | void;
  fetchLogs: () => Promise<void>;
  onRefresh?: () => void;
}) {
  const { dialog, openConfirm } = useActionDialog();
  const [stockModal, setStockModal] = useState<StockModalState>(null);
  const [stockAmount, setStockAmount] = useState(1);
  const [stockSerialInput, setStockSerialInput] = useState('');
  const [stockLotInput, setStockLotInput] = useState('');
  const [stockExpiryInput, setStockExpiryInput] = useState('');
  const [stockLocationInput, setStockLocationInput] = useState('');
  const [stockUnitPriceInput, setStockUnitPriceInput] = useState('');
  const [stockSupplierInput, setStockSupplierInput] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // ── 일괄 입출고 ──
  const [batchMode, setBatchMode] = useState(false);
  const [batchSelectedIds, setBatchSelectedIds] = useState<string[]>([]);
  const [batchModal, setBatchModal] = useState<{ type: 'in' | 'out' } | null>(null);
  const [batchAmount, setBatchAmount] = useState(1);

  useEffect(() => {
    if (!stockModal) {
      setStockSerialInput('');
      setStockLotInput('');
      setStockExpiryInput('');
      setStockLocationInput('');
      setStockUnitPriceInput('');
      setStockSupplierInput('');
      return;
    }
    const source = stockModal.item as Record<string, unknown>;
    setStockSerialInput(String(source.serial_number || '').trim());
    setStockLotInput(String(source.lot_number || '').trim());
    setStockExpiryInput(String(source.expiry_date || '').slice(0, 10));
    setStockLocationInput(String(source.location || '').trim());
    setStockUnitPriceInput(String(source.unit_price ?? source.price ?? '').trim());
    setStockSupplierInput(String(source.supplier_name ?? source.supplier ?? '').trim());
  }, [stockModal]);

  const openStockIn = useCallback((item: InventoryItem) => {
    setStockModal({ item, type: 'in', targetCompany: item.company || '전체', targetDept: (item as Record<string, unknown>).department as string || '전체' });
    setStockAmount(1);
  }, []);

  const openStockOut = useCallback((item: InventoryItem) => {
    setStockModal({ item, type: 'out', targetCompany: item.company || '전체', targetDept: (item as Record<string, unknown>).department as string || '전체' });
    setStockAmount(1);
  }, []);

  const handleStockUpdate = useCallback(async (
    item: InventoryItem,
    type: 'in' | 'out',
    amount: number,
    targetCompany: string,
    targetDept: string,
    serialNumber?: string,
    tracking?: {
      lotNumber?: string;
      expiryDate?: string;
      location?: string;
      unitPrice?: string;
      supplier?: string;
    },
  ) => {
    if (amount <= 0) return toast('수량은 0보다 커야 합니다.');
    setIsUpdating(true);
    const delta = type === 'in' ? amount : -amount;
    const effectiveSerialNumber = String((type === 'in' ? serialNumber : (item as Record<string, unknown>).serial_number) || '').trim() || null;
    const trackingPayload =
      type === 'in'
        ? {
            lot_number: String(tracking?.lotNumber || '').trim() || null,
            expiry_date: String(tracking?.expiryDate || '').trim() || null,
            location: String(tracking?.location || '').trim() || null,
            unit_price: String(tracking?.unitPrice || '').trim()
              ? Math.max(0, Number(tracking?.unitPrice) || 0)
              : null,
            supplier_name: String(tracking?.supplier || '').trim() || null,
          }
        : {};
    try {
      const { data: rpcResult, error: rpcError } = await supabase.rpc('atomic_stock_update', { p_item_id: item.id, p_delta: delta, p_min_allowed: 0 });
      let prevQty: number;
      let nextQty: number;

      if (rpcError) {
        if (String(rpcError.message).includes('INSUFFICIENT_STOCK')) return toast('재고가 부족하여 출고할 수 없습니다.');
        const currentQty = item.quantity ?? (item as Record<string, unknown>).stock as number ?? 0;
        const newStock = currentQty + delta;
        if (newStock < 0) return toast('재고가 부족하여 출고할 수 없습니다.');
        const { error } = await supabase.from('inventory').update({ quantity: newStock, stock: newStock }).eq('id', item.id);
        if (error) throw error;
        prevQty = currentQty;
        nextQty = newStock;
      } else {
        const row = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
        prevQty = row?.prev_qty ?? 0;
        nextQty = row?.next_qty ?? 0;
      }

      if (type === 'in') {
        const inventoryPayload: Record<string, unknown> = {
          serial_number: effectiveSerialNumber,
          ...trackingPayload,
        };
        const { error: serialErr } = await withMissingColumnsFallback(
          (omitted) => {
            const next = { ...inventoryPayload };
            for (const column of omitted) delete next[column];
            if (Object.keys(next).length === 0) return Promise.resolve({ data: null, error: null });
            return supabase.from('inventory').update(next).eq('id', item.id);
          },
          ['serial_number', 'lot_number', 'expiry_date', 'location', 'unit_price', 'supplier_name'],
        );
        if (serialErr) throw serialErr;
      }

      const logRows: Record<string, unknown>[] = [{
        item_id: item.id, inventory_id: item.id,
        type: type === 'in' ? '입고' : '출고', change_type: type === 'in' ? '입고' : '출고',
        quantity: amount, prev_quantity: prevQty, next_quantity: nextQty,
        serial_number: effectiveSerialNumber,
        ...trackingPayload,
        actor_name: targetDept && targetDept !== '전체' ? `${user?.name} (${targetDept})` : user?.name,
        company: targetCompany || item.company,
      }];
      if (item.company_id || user?.company_id || selectedCompanyId) {
        logRows[0].company_id = item.company_id ?? (user?.company === 'SY INC.' ? selectedCompanyId : user?.company_id);
      }
      await withMissingColumnsFallback(
        (omitted) => {
          const rows = logRows.map((r) => {
            const next = { ...r };
            if (omitted.has('company_id')) delete next.company_id;
            if (omitted.has('serial_number')) delete next.serial_number;
            if (omitted.has('lot_number')) delete next.lot_number;
            if (omitted.has('expiry_date')) delete next.expiry_date;
            if (omitted.has('location')) delete next.location;
            if (omitted.has('unit_price')) delete next.unit_price;
            if (omitted.has('supplier_name')) delete next.supplier_name;
            return next;
          });
          return supabase.from('inventory_logs').insert(rows);
        },
        ['company_id', 'serial_number', 'lot_number', 'expiry_date', 'location', 'unit_price', 'supplier_name'],
      );
      await Promise.all([refreshCurrentInventory(), fetchLogs()]);
      toast(`${type === 'in' ? '입고' : '출고'} 처리가 완료되었습니다.`, 'success');
      onRefresh?.();
    } catch (err) {
      console.error('입출고 처리 실패:', err);
      toast('입출고 처리 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsUpdating(false);
    }
  }, [fetchLogs, onRefresh, refreshCurrentInventory, selectedCompanyId, user]);

  const executeStockUpdate = useCallback(() => {
    if (!stockModal) return;
    handleStockUpdate(stockModal.item, stockModal.type, stockAmount, stockModal.targetCompany, stockModal.targetDept, stockSerialInput, {
      lotNumber: stockLotInput,
      expiryDate: stockExpiryInput,
      location: stockLocationInput,
      unitPrice: stockUnitPriceInput,
      supplier: stockSupplierInput,
    });
    setStockModal(null);
    setStockAmount(1);
    setStockSerialInput('');
    setStockLotInput('');
    setStockExpiryInput('');
    setStockLocationInput('');
    setStockUnitPriceInput('');
    setStockSupplierInput('');
  }, [
    handleStockUpdate,
    stockAmount,
    stockExpiryInput,
    stockLocationInput,
    stockLotInput,
    stockModal,
    stockSerialInput,
    stockSupplierInput,
    stockUnitPriceInput,
  ]);

  const handleAutoApprovalRequest = useCallback(async (item: InventoryItem) => {
    const quantity = getItemQuantity(item);
    const minQuantity = getItemMinQuantity(item);
    const itemName = (item as Record<string, unknown>).item_name as string || item.name || '품목';
    const requestQuantity = Math.max(minQuantity * 2 - quantity, 1);
    const confirmed = await openConfirm({
      title: '안전재고 부족 자동 기안',
      description: `${itemName} 품목의 비품구매 신청서를 자동으로 작성하여 MSO 결재 상신을 진행합니다.\n보충 필요량은 ${requestQuantity}개입니다.`,
      confirmText: '결재 상신',
      tone: 'accent',
    });
    if (!confirmed) return;
    try {
      const { error } = await requestInventoryReorder({
        item, user, selectedCompanyId, quantity: requestQuantity,
        reason: `현재고(${quantity})가 안전재고(${minQuantity}) 이하로 떨어져 자동 기안되었습니다.\n보충 필요량: ${requestQuantity}개`,
      });
      if (error) throw error;
      toast('비품구매 신청서가 MSO 관리자에게 성공적으로 상신되었습니다.', 'success');
    } catch (err) {
      console.error('결재 상신 실패:', err);
      toast('자동 기안 중 오류가 발생했습니다.', 'error');
    }
  }, [openConfirm, selectedCompanyId, user]);

  const toggleBatchItem = useCallback((id: string) => {
    setBatchSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }, []);

  const toggleBatchAll = useCallback((allIds: string[]) => {
    setBatchSelectedIds((prev) => prev.length === allIds.length ? [] : [...allIds]);
  }, []);

  const handleBatchStockUpdate = useCallback(async (items: InventoryItem[], type: 'in' | 'out', amount: number) => {
    if (items.length === 0 || amount <= 0) return;
    setIsUpdating(true);
    let successCount = 0;
    let failCount = 0;
    for (const item of items) {
      try {
        await handleStockUpdate(item, type, amount, item.company || '전체', (item as Record<string, unknown>).department as string || '전체');
        successCount++;
      } catch {
        failCount++;
      }
    }
    setIsUpdating(false);
    setBatchModal(null);
    setBatchAmount(1);
    setBatchSelectedIds([]);
    setBatchMode(false);
    if (failCount > 0) {
      toast(`${successCount}건 성공, ${failCount}건 실패`, failCount === items.length ? 'error' : 'warning');
    } else {
      toast(`${successCount}건 ${type === 'in' ? '입고' : '출고'} 일괄 처리 완료`, 'success');
    }
  }, [handleStockUpdate]);

  return {
    dialog,
    stockModal, setStockModal,
    stockAmount, setStockAmount,
    stockSerialInput, setStockSerialInput,
    stockLotInput, setStockLotInput,
    stockExpiryInput, setStockExpiryInput,
    stockLocationInput, setStockLocationInput,
    stockUnitPriceInput, setStockUnitPriceInput,
    stockSupplierInput, setStockSupplierInput,
    isUpdating,
    openStockIn,
    openStockOut,
    executeStockUpdate,
    handleAutoApprovalRequest,
    // 일괄 입출고
    batchMode, setBatchMode,
    batchSelectedIds, setBatchSelectedIds,
    batchModal, setBatchModal,
    batchAmount, setBatchAmount,
    toggleBatchItem,
    toggleBatchAll,
    handleBatchStockUpdate,
    handleDeleteItem: useCallback(async (item: InventoryItem) => {
      if (!item?.id) return;
      const displayName = String((item as Record<string, unknown>).item_name || item.name || '');
      const currentQty = item.quantity ?? Number((item as Record<string, unknown>).stock ?? 0);
      const confirmed = await openConfirm({
        title: '재고 품목 삭제',
        description: `[${displayName}] 현재고 ${currentQty}개 품목을 삭제합니다.\n이 작업은 되돌릴 수 없습니다.`,
        confirmText: '삭제',
        tone: 'danger',
      });
      if (!confirmed) return;
      try {
        await supabase.from('inventory').delete().eq('id', item.id);
        toast('삭제되었습니다.', 'success');
        refreshCurrentInventory();
      } catch {
        toast('삭제 오류가 발생했습니다.', 'error');
      }
    }, [openConfirm, refreshCurrentInventory]),
  };
}
