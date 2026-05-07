import type { SupabaseClient } from '@supabase/supabase-js';
import {
  findSupplySourceInventoryItem,
  getItemName,
  getItemQuantity,
  INVENTORY_SUPPORT_COMPANY,
  INVENTORY_SUPPORT_DEPARTMENT,
  normalizeInventoryText,
} from '@/app/main/inventory-utils';
import {
  isRelationMarkedMissing,
  rememberMissingRelation,
  withMissingColumnsFallback,
} from '@/lib/supabase-compat';
import { recordInventoryPriceHistory } from '@/lib/inventory-erp-helpers';
import type { InventoryItem } from '@/types';

type LooseRecord = Record<string, unknown>;
type InventoryRow = Partial<InventoryItem> & LooseRecord & {
  id?: string;
  company?: string | null;
  company_id?: string | null;
  department?: string | null;
};

type ActorLike = {
  id?: string | null;
  name?: string | null;
  company?: string | null;
  company_id?: string | null;
};

type SupplyRequestDraftItem = {
  name: string;
  qty: number;
  category?: string;
  dept?: string;
  purpose?: string;
};

async function insertInventoryLogs(
  client: SupabaseClient,
  rows: Array<Record<string, unknown>>,
) {
  const result = await withMissingColumnsFallback(
    (omittedColumns) => {
      const payload = rows.map((row) => {
        const nextRow = { ...row };
        omittedColumns.forEach((columnName) => {
          delete nextRow[columnName];
        });
        return nextRow;
      });
      return client.from('inventory_logs').insert(payload);
    },
    ['company_id', 'notes', 'actor_id', 'approval_id', 'purchase_order_id'],
    { cacheKey: 'inventory_logs.insert' },
  );

  if (result.error) {
    throw result.error;
  }
}

async function insertInventoryTransfers(
  client: SupabaseClient,
  rows: Array<Record<string, unknown>>,
) {
  if (isRelationMarkedMissing('inventory_transfers')) {
    return;
  }

  const result = await withMissingColumnsFallback(
    (omittedColumns) => {
      const payload = rows.map((row) => {
        const nextRow = { ...row };
        omittedColumns.forEach((columnName) => {
          delete nextRow[columnName];
        });
        return nextRow;
      });
      return client.from('inventory_transfers').insert(payload);
    },
    ['status', 'transferred_by_id', 'approval_id', 'purchase_order_id', 'serial_number'],
    { cacheKey: 'inventory_transfers.insert' },
  );

  if (result.error) {
    if (rememberMissingRelation(result.error, 'inventory_transfers')) {
      return;
    }
    throw result.error;
  }
}

async function updateInventoryQuantityAtomic(
  client: SupabaseClient,
  itemId: string,
  delta: number,
  minimumAllowed = 0,
) {
  const fallbackRead = await client
    .from('inventory')
    .select('id, quantity, stock')
    .eq('id', itemId)
    .maybeSingle();

  if (fallbackRead.error) {
    throw fallbackRead.error;
  }

  const currentQty = Number(fallbackRead.data?.quantity ?? fallbackRead.data?.stock ?? 0);
  const fallbackNextQty = currentQty + delta;

  const rpcResult = await client.rpc('atomic_stock_update', {
    p_item_id: itemId,
    p_delta: delta,
    p_min_allowed: minimumAllowed,
  });

  if (!rpcResult.error) {
    const row = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
    if (row?.prev_qty != null || row?.next_qty != null) {
      return {
        prevQty: Number(row?.prev_qty ?? currentQty),
        nextQty: Number(row?.next_qty ?? fallbackNextQty),
      };
    }
  } else if (String(rpcResult.error.message || '').includes('INSUFFICIENT_STOCK')) {
    throw new Error('INSUFFICIENT_STOCK');
  }

  if (fallbackNextQty < minimumAllowed) {
    throw new Error('INSUFFICIENT_STOCK');
  }

  const fallbackUpdate = await client
    .from('inventory')
    .update({ quantity: fallbackNextQty, stock: fallbackNextQty })
    .eq('id', itemId);

  if (fallbackUpdate.error) {
    throw fallbackUpdate.error;
  }

  return {
    prevQty: currentQty,
    nextQty: fallbackNextQty,
  };
}

async function findDestinationInventoryItem(
  client: SupabaseClient,
  sourceItem: InventoryRow,
  destinationCompany: string,
  destinationDepartment: string,
) {
  const { data, error } = await client
    .from('inventory')
    .select('id, item_name, name, quantity, stock, company, company_id, department, category, spec, min_quantity, min_stock, unit_price, expiry_date, lot_number, is_udi, udi_code, location, supplier_name, supplier, insurance_code')
    .eq('company', destinationCompany)
    .eq('item_name', getItemName(sourceItem));

  if (error) {
    throw error;
  }

  return (
    (data || []).find((candidate) => {
      const candidateDepartment = String(candidate.department || '').trim();
      return normalizeInventoryText(candidateDepartment) === normalizeInventoryText(destinationDepartment);
    }) || null
  );
}

async function insertDestinationInventoryItem(
  client: SupabaseClient,
  sourceItem: InventoryRow,
  quantity: number,
  destinationCompany: string,
  destinationCompanyId: string | null,
  destinationDepartment: string,
) {
  const basePayload: Record<string, unknown> = {
    item_name: getItemName(sourceItem),
    name: getItemName(sourceItem),
    category: sourceItem.category || null,
    quantity,
    stock: quantity,
    min_quantity: sourceItem.min_quantity ?? sourceItem.min_stock ?? 0,
    min_stock: sourceItem.min_stock ?? sourceItem.min_quantity ?? 0,
    unit_price: sourceItem.unit_price ?? sourceItem.price ?? 0,
    expiry_date: sourceItem.expiry_date || null,
    lot_number: sourceItem.lot_number || null,
    is_udi: Boolean(sourceItem.is_udi),
    udi_code: sourceItem.udi_code || null,
    insurance_code: sourceItem.insurance_code || null,
    location: sourceItem.location || null,
    supplier_name: sourceItem.supplier_name || sourceItem.supplier || null,
    supplier: sourceItem.supplier || sourceItem.supplier_name || null,
    company: destinationCompany,
    department: destinationDepartment,
  };

  const result = await withMissingColumnsFallback<LooseRecord>(
    (omittedColumns) => {
      const payload: Record<string, unknown> = { ...basePayload };
      if (destinationCompanyId && !omittedColumns.has('company_id')) {
        payload.company_id = destinationCompanyId;
      }
      omittedColumns.forEach((columnName) => {
        delete payload[columnName];
      });
      return client
        .from('inventory')
        .insert([payload])
        .select('id, quantity, stock, company, company_id, department')
        .single() as PromiseLike<{ data: LooseRecord | null; error: unknown }>;
    },
    ['company_id', 'department', 'name', 'min_stock', 'supplier_name', 'supplier', 'insurance_code'],
    { cacheKey: 'inventory.insert.destination' },
  );

  if (result.error) {
    throw result.error;
  }

  return result.data || null;
}

export async function ensureSupportInventoryItem(
  client: SupabaseClient,
  item: SupplyRequestDraftItem,
) {
  const existingRows = await client
    .from('inventory')
    .select('id, item_name, name, quantity, stock, company, company_id, department, category, min_quantity, min_stock, unit_price, expiry_date, lot_number, is_udi, udi_code, location, supplier_name, supplier')
    .eq('company', INVENTORY_SUPPORT_COMPANY);

  if (existingRows.error) {
    throw existingRows.error;
  }

  const existing = findSupplySourceInventoryItem((existingRows.data || []) as InventoryRow[], item.name);
  if (existing) {
    return existing as InventoryRow;
  }

  const basePayload: Record<string, unknown> = {
    item_name: item.name,
    name: item.name,
    category: item.category || '기타',
    quantity: 0,
    stock: 0,
    min_quantity: Math.max(1, Number(item.qty) || 1),
    min_stock: Math.max(1, Number(item.qty) || 1),
    company: INVENTORY_SUPPORT_COMPANY,
    department: INVENTORY_SUPPORT_DEPARTMENT,
  };

  const result = await withMissingColumnsFallback<LooseRecord>(
    (omittedColumns) => {
      const payload: Record<string, unknown> = { ...basePayload };
      omittedColumns.forEach((columnName) => {
        delete payload[columnName];
      });
      return client
        .from('inventory')
        .insert([payload])
        .select('id, item_name, name, quantity, stock, company, company_id, department, category, min_quantity, min_stock, unit_price, expiry_date, lot_number, is_udi, udi_code, location, supplier_name, supplier')
        .single() as PromiseLike<{ data: LooseRecord | null; error: unknown }>;
    },
    ['department', 'name', 'min_stock'],
    { cacheKey: 'inventory.insert.support' },
  );

  if (result.error) {
    throw result.error;
  }

  return (result.data || null) as InventoryRow | null;
}

export async function createSupplyBackorderPurchaseOrder(
  client: SupabaseClient,
  params: {
    supportItem: InventoryRow;
    quantity: number;
    actor?: ActorLike | null;
    approvalId?: string | null;
    requestIndex?: number | null;
    approvalTitle?: string | null;
    requesterName?: string | null;
    requesterCompany?: string | null;
    requesterDepartment?: string | null;
    requestedQuantity?: number | null;
    note?: string | null;
  },
) {
  const orderedQty = Math.max(1, Number(params.quantity) || 0);
  const unitPrice = Number(params.supportItem.unit_price ?? params.supportItem.price ?? 0);
  const now = new Date().toISOString();
  const itemPayload = {
    item_id: params.supportItem.id || null,
    name: getItemName(params.supportItem),
    qty: orderedQty,
    unit_price: unitPrice,
    source_supply_approval_id: params.approvalId || null,
    source_supply_request_index: params.requestIndex ?? null,
    source_supply_title: params.approvalTitle || null,
    source_requester_name: params.requesterName || null,
    source_requester_company: params.requesterCompany || null,
    source_requester_department: params.requesterDepartment || null,
    source_requested_quantity: params.requestedQuantity ?? orderedQty,
    source_shortage_quantity: orderedQty,
    linked_inventory_id: params.supportItem.id || null,
  };

  const basePayload: Record<string, unknown> = {
    supplier_id: params.supportItem.supplier_id || null,
    supplier_name: params.supportItem.supplier_name || params.supportItem.supplier || '미정',
    items: [itemPayload],
    status: 'draft',
    total_amount: orderedQty * unitPrice,
    notes: params.note || null,
    created_by: params.actor?.id || null,
    ordered_at: now,
    approved_at: null,
    received_at: null,
    received_by_id: null,
    received_by_name: null,
    inspected_at: null,
    inspected_by_id: null,
    inspected_by_name: null,
    inspection_status: null,
    received_qty: 0,
    rejected_qty: 0,
    received_items: [],
    closed_at: null,
    closed_by_id: null,
    closed_by_name: null,
    expense_status: 'pending',
    expense_posted_at: null,
    expense_posted_by_id: null,
    expense_posted_by_name: null,
    expense_total_amount: 0,
    source_supply_approval_id: params.approvalId || null,
    source_supply_request_index: params.requestIndex ?? null,
    requester_company: params.requesterCompany || null,
    requester_department: params.requesterDepartment || null,
  };

  const result = await withMissingColumnsFallback<LooseRecord>(
    (omittedColumns) => {
      const payload: Record<string, unknown> = { ...basePayload };
      omittedColumns.forEach((columnName) => {
        delete payload[columnName];
      });
      return client
        .from('purchase_orders')
        .insert([payload])
        .select('id, status, items, supplier_name, total_amount, notes, created_at, ordered_at')
        .single() as PromiseLike<{ data: LooseRecord | null; error: unknown }>;
    },
    [
      'supplier_id',
      'supplier_name',
      'ordered_at',
      'approved_at',
      'received_at',
      'received_by_id',
      'received_by_name',
      'inspected_at',
      'inspected_by_id',
      'inspected_by_name',
      'inspection_status',
      'received_qty',
      'rejected_qty',
      'received_items',
      'closed_at',
      'closed_by_id',
      'closed_by_name',
      'expense_status',
      'expense_posted_at',
      'expense_posted_by_id',
      'expense_posted_by_name',
      'expense_total_amount',
      'source_supply_approval_id',
      'source_supply_request_index',
      'requester_company',
      'requester_department',
    ],
    { cacheKey: 'purchase_orders.insert.backorder' },
  );

  if (result.error) {
    throw result.error;
  }

  return result.data || null;
}

export async function issueInventoryToDepartment(
  client: SupabaseClient,
  params: {
    sourceItem: InventoryRow;
    quantity: number;
    destinationCompany: string;
    destinationCompanyId?: string | null;
    destinationDepartment?: string | null;
    actor?: ActorLike | null;
    reason?: string | null;
    approvalId?: string | null;
    purchaseOrderId?: string | null;
  },
) {
  const transferQuantity = Math.max(1, Number(params.quantity) || 0);
  const sourceItemId = String(params.sourceItem.id || '').trim();
  if (!sourceItemId) {
    throw new Error('SOURCE_ITEM_REQUIRED');
  }

  const sourceCurrentQty = getItemQuantity(params.sourceItem);
  if (sourceCurrentQty < transferQuantity) {
    throw new Error('INSUFFICIENT_STOCK');
  }

  const destinationCompany = String(params.destinationCompany || '').trim();
  const destinationDepartment = String(params.destinationDepartment || '').trim();
  const sourceCompany = String(params.sourceItem.company || INVENTORY_SUPPORT_COMPANY).trim();
  const sourceDepartment = String(params.sourceItem.department || INVENTORY_SUPPORT_DEPARTMENT).trim();

  const sourceUpdate = await updateInventoryQuantityAtomic(client, sourceItemId, -transferQuantity, 0);
  const destinationItem = destinationCompany
    ? await findDestinationInventoryItem(client, params.sourceItem, destinationCompany, destinationDepartment)
    : null;

  let destinationInventoryId: string | null = null;
  let destinationPrevQty = 0;
  let destinationNextQty = 0;

  if (destinationCompany) {
    if (destinationItem?.id) {
      destinationInventoryId = String(destinationItem.id);
      destinationPrevQty = getItemQuantity(destinationItem);
      destinationNextQty = destinationPrevQty + transferQuantity;
      const destinationUpdate = await client
        .from('inventory')
        .update({ quantity: destinationNextQty, stock: destinationNextQty })
        .eq('id', destinationInventoryId);
      if (destinationUpdate.error) {
        throw destinationUpdate.error;
      }
    } else {
      const insertedDestination = await insertDestinationInventoryItem(
        client,
        params.sourceItem,
        transferQuantity,
        destinationCompany,
        params.destinationCompanyId || null,
        destinationDepartment,
      );
      destinationInventoryId = insertedDestination?.id ? String(insertedDestination.id) : null;
      destinationPrevQty = 0;
      destinationNextQty = transferQuantity;
    }
  }

  if (destinationCompany) {
    await insertInventoryTransfers(client, [
      {
        item_id: sourceItemId,
        item_name: getItemName(params.sourceItem),
        quantity: transferQuantity,
        from_company: sourceCompany,
        from_department: sourceDepartment,
        to_company: destinationCompany,
        to_department: destinationDepartment,
        reason: params.reason || '',
        transferred_by: params.actor?.name || null,
        transferred_by_id: params.actor?.id || null,
        approval_id: params.approvalId || null,
        purchase_order_id: params.purchaseOrderId || null,
        status: 'completed',
      },
    ]);
  }

  const sourceNotes = `to ${destinationCompany}${destinationDepartment ? ` ${destinationDepartment}` : ''}${params.reason ? ` (${params.reason})` : ''}`;
  const destinationNotes = `${sourceCompany}${sourceDepartment ? ` ${sourceDepartment}` : ''} -> ${destinationCompany}${destinationDepartment ? ` ${destinationDepartment}` : ''}${params.reason ? ` (${params.reason})` : ''}`;

  const logRows: Array<Record<string, unknown>> = [
    {
      item_id: sourceItemId,
      inventory_id: sourceItemId,
      type: 'stock',
      change_type: 'transfer_out',
      quantity: transferQuantity,
      prev_quantity: sourceUpdate.prevQty,
      next_quantity: sourceUpdate.nextQty,
      actor_name: params.actor?.name || null,
      actor_id: params.actor?.id || null,
      company: sourceCompany,
      company_id: params.sourceItem.company_id || null,
      notes: sourceNotes,
      approval_id: params.approvalId || null,
      purchase_order_id: params.purchaseOrderId || null,
    },
  ];

  if (destinationInventoryId) {
    logRows.push({
      item_id: destinationInventoryId,
      inventory_id: destinationInventoryId,
      type: 'stock',
      change_type: 'transfer_in',
      quantity: transferQuantity,
      prev_quantity: destinationPrevQty,
      next_quantity: destinationNextQty,
      actor_name: params.actor?.name || null,
      actor_id: params.actor?.id || null,
      company: destinationCompany,
      company_id: params.destinationCompanyId || null,
      notes: destinationNotes,
      approval_id: params.approvalId || null,
      purchase_order_id: params.purchaseOrderId || null,
    });
  }

  await insertInventoryLogs(client, logRows);

  return {
    sourceNextQty: sourceUpdate.nextQty,
    destinationInventoryId,
    destinationNextQty,
  };
}

export async function receiveInventoryFromPurchaseOrder(
  client: SupabaseClient,
  params: {
    item: InventoryRow;
    quantity: number;
    actor?: ActorLike | null;
    reason?: string | null;
    approvalId?: string | null;
    purchaseOrderId?: string | null;
  },
) {
  const itemId = String(params.item.id || '').trim();
  if (!itemId) {
    throw new Error('ITEM_REQUIRED');
  }

  const quantity = Math.max(1, Number(params.quantity) || 0);
  const update = await updateInventoryQuantityAtomic(client, itemId, quantity, 0);

  await insertInventoryLogs(client, [
    {
      item_id: itemId,
      inventory_id: itemId,
      type: 'stock',
      change_type: 'purchase_receipt',
      quantity,
      prev_quantity: update.prevQty,
      next_quantity: update.nextQty,
      actor_name: params.actor?.name || null,
      actor_id: params.actor?.id || null,
      company: params.item.company || INVENTORY_SUPPORT_COMPANY,
      company_id: params.item.company_id || null,
      notes: params.reason || '',
      approval_id: params.approvalId || null,
      purchase_order_id: params.purchaseOrderId || null,
    },
  ]);

  await recordInventoryPriceHistory(client, {
    inventoryItemId: itemId,
    supplierName: params.item.supplier_name || params.item.supplier ? String(params.item.supplier_name || params.item.supplier) : null,
    unitPrice: Number(params.item.unit_price ?? params.item.price ?? 0),
    quantity,
    sourceType: 'purchase_receipt',
    recordedBy: params.actor?.id || null,
    purchaseOrderId: params.purchaseOrderId || null,
    notes: params.reason || 'purchase order receipt',
  });

  return update;
}
