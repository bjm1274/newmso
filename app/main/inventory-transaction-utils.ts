import { supabase } from '@/lib/supabase';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import {
  callAtomicStockUpdate,
  callAtomicStockTransfer,
} from '@/lib/inventory-stock-client';
import type { StaffMember } from '@/types';
import type { LooseRecord } from '@/lib/types';
import {
  type InventoryLike,
  getItemName,
  getItemQuantity,
  normalizeInventoryText,
} from './inventory-item-utils';
import {
  INVENTORY_SUPPORT_COMPANY,
  INVENTORY_SUPPORT_DEPARTMENT,
} from './inventory-workflow-utils';
// NOTE: INVENTORY_SELECT_COLUMNS, findDestinationInventoryItem는 inventory-utils.ts와 동일 로직이나,
// processInventoryIssue/reverseInventoryIssue가 '이관' 시맨틱으로 다르게 동작하므로 파일을 분리 유지한다.
// (inventory-utils.ts는 '출고/입고' 타입, 이 파일은 '이관' 타입을 로그에 기록한다.)
import {
  INVENTORY_SELECT_COLUMNS,
  findDestinationInventoryItem,
} from './inventory-utils';

type InventoryUserLike = Partial<StaffMember> & LooseRecord;
type SupabaseCompatResult<T> = {
  data: T | null;
  error: unknown;
};

type ProcessInventoryIssueParams = {
  sourceItem: InventoryLike;
  inventoryRows?: InventoryLike[];
  quantity: number;
  toCompany: string;
  toDept: string;
  reason?: string;
  user?: InventoryUserLike | null;
  destinationCompanyId?: string | null;
};

export async function processInventoryIssue({
  sourceItem,
  inventoryRows = [],
  quantity,
  toCompany,
  toDept,
  reason,
  user,
  destinationCompanyId,
}: ProcessInventoryIssueParams) {
  const transferQuantity = Math.max(1, Number(quantity) || 0);
  const sourceCompany = String(sourceItem?.company || INVENTORY_SUPPORT_COMPANY).trim();
  const sourceDept = String(sourceItem?.department || INVENTORY_SUPPORT_DEPARTMENT).trim();
  const destinationCompany = String(toCompany || '').trim();
  const destinationDept = String(toDept || '').trim();
  const sourceCurrentQty = getItemQuantity(sourceItem);

  if (!sourceItem?.id) {
    throw new Error('SOURCE_ITEM_REQUIRED');
  }
  if (sourceCurrentQty < transferQuantity) {
    throw new Error('INSUFFICIENT_STOCK');
  }

  let sourceNextQty = sourceCurrentQty - transferQuantity;
  const isSameLocation =
    normalizeInventoryText(sourceCompany) === normalizeInventoryText(destinationCompany) &&
    normalizeInventoryText(sourceDept) === normalizeInventoryText(destinationDept);

  const sourceNotes = `to ${destinationCompany}${destinationDept ? ` ${destinationDept}` : ''}${reason ? ` (${reason})` : ''}`;
  const destinationNotes = `${sourceCompany}${sourceDept ? ` ${sourceDept}` : ''} -> ${destinationCompany}${destinationDept ? ` ${destinationDept}` : ''}${reason ? ` (${reason})` : ''}`;

  let destinationInventoryId: string | null = null;
  let destinationPrevQty = 0;
  let destinationNextQty = 0;
  let sourcePrevQty = sourceCurrentQty;

  if (!isSameLocation && destinationCompany) {
    let destinationItem = findDestinationInventoryItem(inventoryRows, sourceItem, destinationCompany, destinationDept);

    if (!destinationItem) {
      const { data: remoteRows } = await supabase
        .from('inventory')
        .select('id, item_name, quantity, stock, company, department, category, spec, min_quantity')
        .eq('company', destinationCompany)
        .eq('item_name', getItemName(sourceItem));

      destinationItem = findDestinationInventoryItem(remoteRows || [], sourceItem, destinationCompany, destinationDept);
    }

    if (destinationItem) {
      // 원자적 이관 RPC 시도 (출발지 차감 + 목적지 증가를 단일 트랜잭션으로)
      const transferResp = await callAtomicStockTransfer({
        sourceId: String(sourceItem.id ?? ''),
        destId: String(destinationItem.id ?? ''),
        quantity: transferQuantity,
      });
      const transferResult = transferResp.ok ? transferResp.data : null;
      const transferRpcError = transferResp.ok ? null : { message: transferResp.error };

      if (transferRpcError) {
        if (String(transferRpcError.message).includes('INSUFFICIENT_STOCK')) {
          throw new Error('INSUFFICIENT_STOCK');
        }
        // RPC 미등록 시 fallback (순차 업데이트)
        const { error: sourceUpdateError } = await supabase
          .from('inventory')
          .update({ quantity: sourceNextQty, stock: sourceNextQty })
          .eq('id', sourceItem.id);
        if (sourceUpdateError) throw sourceUpdateError;

        destinationPrevQty = getItemQuantity(destinationItem);
        destinationNextQty = destinationPrevQty + transferQuantity;

        const { error: destinationUpdateError } = await supabase
          .from('inventory')
          .update({ quantity: destinationNextQty, stock: destinationNextQty })
          .eq('id', destinationItem.id);

        if (destinationUpdateError) {
          // 롤백: 출발지 원상 복구
          await supabase.from('inventory')
            .update({ quantity: sourceCurrentQty, stock: sourceCurrentQty })
            .eq('id', sourceItem.id);
          throw destinationUpdateError;
        }
      } else {
        const row = Array.isArray(transferResult) ? transferResult[0] : transferResult;
        const hasTransferRow =
          row != null &&
          (row?.src_prev != null ||
            row?.src_next != null ||
            row?.dst_prev != null ||
            row?.dst_next != null);

        if (!hasTransferRow) {
          const { error: sourceUpdateError } = await supabase
            .from('inventory')
            .update({ quantity: sourceNextQty, stock: sourceNextQty })
            .eq('id', sourceItem.id);
          if (sourceUpdateError) throw sourceUpdateError;

          destinationPrevQty = getItemQuantity(destinationItem);
          destinationNextQty = destinationPrevQty + transferQuantity;

          const { error: destinationUpdateError } = await supabase
            .from('inventory')
            .update({ quantity: destinationNextQty, stock: destinationNextQty })
            .eq('id', destinationItem.id);

          if (destinationUpdateError) {
            await supabase
              .from('inventory')
              .update({ quantity: sourceCurrentQty, stock: sourceCurrentQty })
              .eq('id', sourceItem.id);
            throw destinationUpdateError;
          }
        } else {
          sourcePrevQty = row?.src_prev ?? sourceCurrentQty;
          sourceNextQty = row?.src_next ?? sourceNextQty;
          destinationPrevQty = row?.dst_prev ?? 0;
          destinationNextQty = row?.dst_next ?? transferQuantity;
        }
      }

      destinationInventoryId = String(destinationItem.id);
    } else {
      // 목적지에 품목이 없는 경우 - 출발지만 원자적 차감
      const srcResp = await callAtomicStockUpdate({
        itemId: String(sourceItem.id ?? ''),
        delta: -transferQuantity,
        minAllowed: 0,
      });
      const srcResult = srcResp.ok ? srcResp.data : null;
      const srcRpcError = srcResp.ok ? null : { message: srcResp.error };
      if (srcRpcError) {
        if (String(srcRpcError.message).includes('INSUFFICIENT_STOCK')) {
          throw new Error('INSUFFICIENT_STOCK');
        }
        // fallback
        const { error: sourceUpdateError } = await supabase
          .from('inventory')
          .update({ quantity: sourceNextQty, stock: sourceNextQty })
          .eq('id', sourceItem.id);
        if (sourceUpdateError) throw sourceUpdateError;
      } else {
        const row = Array.isArray(srcResult) ? srcResult[0] : srcResult;
        if (row == null || (row?.prev_qty == null && row?.next_qty == null)) {
          const { error: sourceUpdateError } = await supabase
            .from('inventory')
            .update({ quantity: sourceNextQty, stock: sourceNextQty })
            .eq('id', sourceItem.id);
          if (sourceUpdateError) throw sourceUpdateError;
        } else {
          sourcePrevQty = row?.prev_qty ?? sourceCurrentQty;
          sourceNextQty = row?.next_qty ?? sourceNextQty;
        }
      }
      const baseDestinationPayload: Record<string, unknown> = {
        item_name: getItemName(sourceItem),
        category: sourceItem?.category || null,
        quantity: transferQuantity,
        stock: transferQuantity,
        min_quantity: sourceItem?.min_quantity ?? sourceItem?.min_stock ?? 0,
        unit_price: sourceItem?.unit_price ?? sourceItem?.price ?? 0,
        expiry_date: sourceItem?.expiry_date || null,
        lot_number: sourceItem?.lot_number || null,
        is_udi: Boolean(sourceItem?.is_udi),
        company: destinationCompany,
        department: destinationDept || '',
        location: sourceItem?.location || null,
      };

      if (sourceItem?.spec) baseDestinationPayload.spec = sourceItem.spec;
      if (sourceItem?.insurance_code) baseDestinationPayload.insurance_code = sourceItem.insurance_code;
      if (sourceItem?.udi_code) baseDestinationPayload.udi_code = sourceItem.udi_code;
      if (sourceItem?.supplier_name) baseDestinationPayload.supplier_name = sourceItem.supplier_name;
      if (sourceItem?.supplier) baseDestinationPayload.supplier = sourceItem.supplier;

      const { data: insertedDestination, error: destinationInsertError } =
        await withMissingColumnsFallback<LooseRecord>(
          (omittedColumns) => {
            const destinationPayload: Record<string, unknown> = { ...baseDestinationPayload };

            if (destinationCompanyId && !omittedColumns.has('company_id')) {
              destinationPayload.company_id = destinationCompanyId;
            }

            if (omittedColumns.has('department')) {
              delete destinationPayload.department;
            }

            return supabase
                .from('inventory')
                .insert([destinationPayload])
                .select(INVENTORY_SELECT_COLUMNS)
                .single() as PromiseLike<SupabaseCompatResult<LooseRecord>>;
          },
          ['company_id', 'department'],
        );

      if (destinationInsertError) {
        throw destinationInsertError;
      }

      destinationInventoryId = insertedDestination?.id ? String(insertedDestination.id) : null;
      destinationPrevQty = 0;
      destinationNextQty = transferQuantity;
    }
  } else {
    // isSameLocation이거나 목적지 미지정: 출발지만 원자적 차감
    const srcOnlyResp = await callAtomicStockUpdate({
      itemId: String(sourceItem.id ?? ''),
      delta: -transferQuantity,
      minAllowed: 0,
    });
    const srcOnlyResult = srcOnlyResp.ok ? srcOnlyResp.data : null;
    const srcOnlyError = srcOnlyResp.ok ? null : { message: srcOnlyResp.error };
    if (srcOnlyError) {
      if (String(srcOnlyError.message).includes('INSUFFICIENT_STOCK')) {
        throw new Error('INSUFFICIENT_STOCK');
      }
      // fallback
      const { error: fbErr } = await supabase.from('inventory')
        .update({ quantity: sourceNextQty, stock: sourceNextQty })
        .eq('id', sourceItem.id);
      if (fbErr) throw fbErr;
    } else {
      const row = Array.isArray(srcOnlyResult) ? srcOnlyResult[0] : srcOnlyResult;
      if (row == null || (row?.prev_qty == null && row?.next_qty == null)) {
        const { error: fbErr } = await supabase
          .from('inventory')
          .update({ quantity: sourceNextQty, stock: sourceNextQty })
          .eq('id', sourceItem.id);
        if (fbErr) throw fbErr;
      } else {
        sourcePrevQty = row?.prev_qty ?? sourceCurrentQty;
        sourceNextQty = row?.next_qty ?? sourceNextQty;
      }
    }
  }

  if (!isSameLocation && destinationCompany) {
    const { error: transferError } = await supabase.from('inventory_transfers').insert([
      {
        item_id: sourceItem.id,
        item_name: getItemName(sourceItem),
        quantity: transferQuantity,
        from_company: sourceCompany,
        from_department: sourceDept,
        to_company: destinationCompany,
        to_department: destinationDept,
        reason: reason || '',
        transferred_by: user?.name,
        transferred_by_id: user?.id,
        status: '완료',
      },
    ]);

    if (transferError) {
      throw transferError;
    }
  }

  const logRows: Array<Record<string, unknown>> = [
    {
      item_id: sourceItem.id,
      inventory_id: sourceItem.id,
      type: '이관',
      change_type: isSameLocation ? '불출' : '이관출고',
      quantity: transferQuantity,
      prev_quantity: sourcePrevQty,
      next_quantity: sourceNextQty,
      actor_name: user?.name,
      company: sourceCompany,
      notes: sourceNotes,
    },
  ];

  if (destinationInventoryId && !isSameLocation) {
    logRows.push({
      item_id: destinationInventoryId,
      inventory_id: destinationInventoryId,
      type: '이관',
      change_type: '이관입고',
      quantity: transferQuantity,
      prev_quantity: destinationPrevQty,
      next_quantity: destinationNextQty,
      actor_name: user?.name,
      company: destinationCompany,
      notes: destinationNotes,
    });
  }

  const { error: logError } = await supabase.from('inventory_logs').insert(logRows);
  if (logError) {
    throw logError;
  }

  return {
    sourceNextQty,
    destinationInventoryId,
    destinationNextQty,
    isSameLocation,
  };
}

type ReverseInventoryIssueParams = {
  sourceItemId: string;
  destinationCompany: string;
  destinationDept: string;
  itemName: string;
  quantity: number;
  reason?: string;
  user?: InventoryUserLike | null;
};

/**
 * 불출 처리를 취소한다.
 * SY INC. 재고 증가 + 수령팀 재고 감소 + 취소 로그 기록.
 */
export async function reverseInventoryIssue({
  sourceItemId,
  destinationCompany,
  destinationDept,
  itemName,
  quantity,
  reason,
  user,
}: ReverseInventoryIssueParams) {
  const reverseQty = Math.max(1, Number(quantity) || 0);

  // 1) SY INC. 재고 복원 전 현재 수량 조회 (롤백용)
  const { data: srcRow } = await supabase.from('inventory').select('quantity, stock').eq('id', sourceItemId).single();
  const srcBeforeQty = Number(srcRow?.quantity ?? srcRow?.stock ?? 0);

  // SY INC. 재고 복원 (증가)
  const reverseResp = await callAtomicStockUpdate({
    itemId: sourceItemId,
    delta: reverseQty,
    minAllowed: 0,
  });
  if (!reverseResp.ok) {
    // RPC 미등록 fallback
    const { error } = await supabase.from('inventory').update({ quantity: srcBeforeQty + reverseQty, stock: srcBeforeQty + reverseQty }).eq('id', sourceItemId);
    if (error) throw error;
  }
  // 2) 수령팀 재고 차감 (감소)
  const { data: destRows } = await supabase
    .from('inventory')
    .select('id, quantity, stock, item_name, department')
    .eq('company', destinationCompany)
    .eq('item_name', itemName);

  const destItem = (destRows || []).find((r: LooseRecord) =>
    String(r.department || '').trim() === destinationDept.trim() ||
    (!destinationDept && !String(r.department || '').trim()),
  ) || (destRows || [])[0];

  if (destItem) {
    const destCurQty = Number(destItem.quantity ?? destItem.stock ?? 0);
    const destNextQty = Math.max(0, destCurQty - reverseQty);
    const { error: destErr } = await supabase.from('inventory').update({ quantity: destNextQty, stock: destNextQty }).eq('id', destItem.id);
    if (destErr) {
      // 수령팀 차감 실패 시 SY INC. 복원 롤백
      await supabase.from('inventory')
        .update({ quantity: srcBeforeQty, stock: srcBeforeQty })
        .eq('id', sourceItemId);
      throw destErr;
    }
  }

  // 3) 취소 로그 기록
  const logRows: Array<Record<string, unknown>> = [
    {
      item_id: sourceItemId,
      inventory_id: sourceItemId,
      type: '이관',
      change_type: '불출취소',
      quantity: reverseQty,
      actor_name: user?.name,
      company: INVENTORY_SUPPORT_COMPANY,
      notes: `불출 취소: ${destinationCompany} ${destinationDept} → ${INVENTORY_SUPPORT_COMPANY} ${INVENTORY_SUPPORT_DEPARTMENT} (${reason || '운영자 취소'})`,
    },
  ];
  await supabase.from('inventory_logs').insert(logRows);
}
