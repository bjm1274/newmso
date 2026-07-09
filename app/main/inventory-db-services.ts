import { db } from '@/lib/db-client';
import { d1Client } from '@/lib/db-client';
import { withMissingColumnsFallback } from '@/lib/db-compat';
import {
  callAtomicStockUpdate,
  callAtomicStockTransfer,
  postStockMovement } from '@/lib/inventory-stock-client';
import {
  getD1Binding,
  getD1Drizzle,
  inventory as inventoryTable,
  and,
  eq } from '@/lib/db';
import {
  INVENTORY_SUPPORT_COMPANY,
  INVENTORY_SUPPORT_DEPARTMENT,
  toLooseRecordArray,
  getItemQuantity,
  getItemName,
  resolveInventoryDepartment,
  normalizeSupportInventoryRows,
  findDestinationInventoryItem,
  type LooseRecord,
  type InventoryLike,
  type InventoryUserLike,
  type SupabaseCompatResult } from './inventory-validation';

// For destination insert selecting
const INVENTORY_SELECT_COLUMNS = [
  'id',
  'item_name',
  'quantity',
  'stock',
  'company',
  'company_id',
  'department',
  'category',
  'spec',
  'min_quantity',
  'unit_price',
  'price',
  'expiry_date',
  'lot_number',
  'is_udi',
  'location',
  'insurance_code',
  'udi_code',
  'supplier_name',
  'supplier',
].join(', ');

/**
 * SY INC. 경영지원팀 재고 행을 D1에서 조회한다.
 */
export async function fetchSupportInventoryRows(): Promise<{
  data: InventoryLike[];
  error: unknown;
}> {
  try {
    const d1 = await getD1Binding();
    if (d1) {
      // 서버/Workers — D1 직접 조회
      const db = getD1Drizzle(d1);
      const rows = await db
        .select()
        .from(inventoryTable)
        .where(
          and(
            eq(inventoryTable.company, INVENTORY_SUPPORT_COMPANY),
            eq(inventoryTable.department, INVENTORY_SUPPORT_DEPARTMENT),
          ),
        );
      return {
        data: normalizeSupportInventoryRows(toLooseRecordArray(rows) as InventoryLike[]),
        error: null };
    }

    // 브라우저 — d1Client가 /api/d1/query로 D1을 읽는다
    const { data, error } = await d1Client
      .from('inventory')
      .select('*')
      .eq('company', INVENTORY_SUPPORT_COMPANY)
      .eq('department', INVENTORY_SUPPORT_DEPARTMENT);
    if (error) {
      return { data: [], error };
    }
    return {
      data: normalizeSupportInventoryRows(toLooseRecordArray(data) as InventoryLike[]),
      error: null };
  } catch (error) {
    return { data: [], error };
  }
}

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

/**
 * 물품 불출/이관 — stock-post / stock-transfer API 전용 (inventory-utils 와 동일 정책)
 */
export async function processInventoryIssue({
  sourceItem,
  inventoryRows = [],
  quantity,
  toCompany,
  toDept,
  reason,
  user,
  destinationCompanyId }: ProcessInventoryIssueParams) {
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

  const isSameLocation =
    !destinationCompany ||
    (sourceCompany.toLowerCase() === destinationCompany.toLowerCase() &&
      sourceDept.toLowerCase() === destinationDept.toLowerCase());

  const sourceNotes = `to ${destinationCompany}${destinationDept ? ` ${destinationDept}` : ''}${reason ? ` (${reason})` : ''}`;
  const destinationNotes = `${sourceCompany}${sourceDept ? ` ${sourceDept}` : ''} -> ${destinationCompany}${destinationDept ? ` ${destinationDept}` : ''}${reason ? ` (${reason})` : ''}`;

  if (isSameLocation) {
    const postResp = await postStockMovement({
      itemId: String(sourceItem.id),
      mode: 'delta',
      delta: -transferQuantity,
      type: '출고',
      changeType: '불출',
      notes: sourceNotes,
      company: sourceCompany,
      department: sourceDept,
      minAllowed: 0,
    });
    if (!postResp.ok) {
      if (
        postResp.code === 'INSUFFICIENT_STOCK' ||
        String(postResp.error || '').includes('INSUFFICIENT_STOCK')
      ) {
        throw new Error('INSUFFICIENT_STOCK');
      }
      throw new Error(postResp.error || 'STOCK_POST_FAILED');
    }
    return {
      sourceNextQty: postResp.data?.next_qty ?? sourceCurrentQty - transferQuantity,
      destinationInventoryId: null as string | null,
      destinationNextQty: 0,
      isSameLocation: true,
    };
  }

  let destinationItem = findDestinationInventoryItem(
    inventoryRows,
    sourceItem,
    destinationCompany,
    destinationDept,
  );

  if (!destinationItem) {
    const { data: remoteRows } = await db
      .from('inventory')
      .select('id, item_name, quantity, stock, company, department, category, spec, min_quantity, lot_number')
      .eq('company', destinationCompany)
      .eq('item_name', getItemName(sourceItem))
      .returns<any[]>();

    destinationItem = findDestinationInventoryItem(
      remoteRows || [],
      sourceItem,
      destinationCompany,
      destinationDept,
    );
  }

  const meta = {
    item_name: getItemName(sourceItem),
    from_company: sourceCompany,
    from_department: sourceDept,
    to_company: destinationCompany,
    to_department: destinationDept,
    reason: reason || '',
    source_notes: sourceNotes,
    dest_notes: destinationNotes,
  };

  const transferResp = destinationItem
    ? await callAtomicStockTransfer({
        sourceId: String(sourceItem.id),
        destId: String(destinationItem.id),
        quantity: transferQuantity,
        meta,
      })
    : await callAtomicStockTransfer({
        sourceId: String(sourceItem.id),
        newDest: {
          item_name: getItemName(sourceItem),
          category: (sourceItem?.category as string) || null,
          min_quantity: Number(sourceItem?.min_quantity ?? sourceItem?.min_stock ?? 0) || 0,
          unit_price: Number(sourceItem?.unit_price ?? sourceItem?.price ?? 0) || 0,
          expiry_date: (sourceItem?.expiry_date as string) || null,
          lot_number: (sourceItem?.lot_number as string) || null,
          is_udi: Boolean(sourceItem?.is_udi),
          company: destinationCompany,
          company_id: destinationCompanyId || null,
          department: destinationDept || '',
          location: (sourceItem?.location as string) || null,
          spec: (sourceItem?.spec as string) || null,
          insurance_code: (sourceItem?.insurance_code as string) || null,
          udi_code: (sourceItem?.udi_code as string) || null,
          supplier_name: (sourceItem?.supplier_name as string) || null,
          supplier: (sourceItem?.supplier as string) || null,
        },
        quantity: transferQuantity,
        meta,
      });

  if (!transferResp.ok) {
    if (
      transferResp.code === 'INSUFFICIENT_STOCK' ||
      String(transferResp.error || '').includes('INSUFFICIENT_STOCK')
    ) {
      throw new Error('INSUFFICIENT_STOCK');
    }
    throw new Error(transferResp.error || 'STOCK_TRANSFER_FAILED');
  }

  const row = transferResp.data;
  const destinationInventoryId =
    row?.destId != null
      ? String(row.destId)
      : destinationItem
        ? String(destinationItem.id)
        : null;

  return {
    sourceNextQty: row?.src_next ?? sourceCurrentQty - transferQuantity,
    destinationInventoryId,
    destinationNextQty: row?.dst_next ?? transferQuantity,
    isSameLocation: false,
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
 * 불출 처리 취소 — stock-transfer / stock-post API 전용 (inventory-utils 와 동일)
 */
export async function reverseInventoryIssue({
  sourceItemId,
  destinationCompany,
  destinationDept,
  itemName,
  quantity,
  reason,
  user }: ReverseInventoryIssueParams) {
  const reverseQty = Math.max(1, Number(quantity) || 0);
  const notes = `불출 취소: ${destinationCompany} ${destinationDept} → ${INVENTORY_SUPPORT_COMPANY} ${INVENTORY_SUPPORT_DEPARTMENT} (${reason || '운영자 취소'})`;

  let destItem: LooseRecord | null = null;
  if (destinationCompany) {
    const { data: destRows } = await db
      .from('inventory')
      .select('id, quantity, stock, item_name, department, company')
      .eq('company', destinationCompany)
      .eq('item_name', itemName)
      .returns<any[]>();

    destItem =
      (destRows || []).find(
        (r: LooseRecord) =>
          String(r.department || '').trim() === destinationDept.trim() ||
          (!destinationDept && !String(r.department || '').trim()),
      ) ||
      (destRows || [])[0] ||
      null;
  }

  if (destItem?.id) {
    const transferResp = await callAtomicStockTransfer({
      sourceId: String(destItem.id),
      destId: String(sourceItemId),
      quantity: reverseQty,
      meta: {
        item_name: itemName,
        from_company: destinationCompany,
        from_department: destinationDept,
        to_company: INVENTORY_SUPPORT_COMPANY,
        to_department: INVENTORY_SUPPORT_DEPARTMENT,
        reason: reason || '불출 취소',
        source_notes: notes,
        dest_notes: notes,
      },
    });
    if (!transferResp.ok) {
      if (
        transferResp.code === 'INSUFFICIENT_STOCK' ||
        String(transferResp.error || '').includes('INSUFFICIENT_STOCK')
      ) {
        throw new Error('INSUFFICIENT_STOCK');
      }
      throw new Error(transferResp.error || 'REVERSE_TRANSFER_FAILED');
    }
    return;
  }

  const postResp = await postStockMovement({
    itemId: String(sourceItemId),
    mode: 'delta',
    delta: reverseQty,
    type: '반납',
    changeType: '불출취소',
    notes,
    company: INVENTORY_SUPPORT_COMPANY,
    department: INVENTORY_SUPPORT_DEPARTMENT,
  });
  if (!postResp.ok) {
    throw new Error(postResp.error || 'REVERSE_POST_FAILED');
  }
}

/**
 * SY INC. 경영지원팀에 신규 품목을 자동 등록한다.
 */
export async function createSupportInventoryItem(
  workflowItem: { name: string; qty: number; category: string; dept: string; purpose: string },
): Promise<InventoryLike | null> {
  const itemName = String(workflowItem.name || '').trim();
  if (!itemName) {
    console.error('SY INC. 신규 품목 자동 등록 실패: 품목명이 비어 있습니다.');
    return null;
  }
  const safeQty = Number.isFinite(workflowItem.qty) && workflowItem.qty > 0 ? workflowItem.qty : 1;

  const payload: Record<string, unknown> = {
    item_name: itemName,
    category: workflowItem.category || '기타',
    quantity: 0,
    stock: 0,
    min_quantity: safeQty,
    min_stock: safeQty,
    company: INVENTORY_SUPPORT_COMPANY,
    department: INVENTORY_SUPPORT_DEPARTMENT };

  try {
    const { data, error } = await withMissingColumnsFallback<LooseRecord>(
      (omittedColumns) => {
        const row = { ...payload };
        if (omittedColumns.has('department')) delete row.department;
        return db
          .from('inventory')
          .insert([row])
          .select(INVENTORY_SELECT_COLUMNS)
          .single() as PromiseLike<SupabaseCompatResult<LooseRecord>>;
      },
      ['department'],
    );
    if (error) {
      console.error('SY INC. 신규 품목 자동 등록 실패:', error);
      return null;
    }
    return (data as InventoryLike) || null;
  } catch (err) {
    console.error('SY INC. 신규 품목 자동 등록 실패:', err);
    return null;
  }
}
