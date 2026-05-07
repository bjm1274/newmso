import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isRelationMarkedMissing,
  rememberMissingRelation,
  withMissingColumnsFallback,
} from '@/lib/supabase-compat';

type ActorLike = {
  id?: string | null;
  name?: string | null;
};

type ReceiptCostLine = {
  index: number;
  item: Record<string, unknown>;
  orderedQty: number;
  receivedQty: number;
  rejectedQty: number;
  cumulativeReceivedQty: number;
  cumulativeRejectedQty: number;
  pendingQty: number;
  note?: string;
};

function text(value: unknown, fallback = '') {
  const trimmed = String(value ?? '').trim();
  return trimmed || fallback;
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getItemUnitPrice(item: Record<string, unknown>) {
  return number(item.unit_price ?? item.price);
}

function getItemName(item: Record<string, unknown>) {
  return text(item.name ?? item.item_name, '품목');
}

export async function createInventoryCostEntriesForReceipt(
  client: SupabaseClient,
  params: {
    purchaseOrder: Record<string, unknown>;
    receiptLines: ReceiptCostLine[];
    actor?: ActorLike | null;
    occurredAt: string;
  },
) {
  if (isRelationMarkedMissing('inventory_cost_entries')) {
    return { inserted: 0, totalAmount: 0 };
  }

  const purchaseOrderId = text(params.purchaseOrder.id);
  const supplierName = text(params.purchaseOrder.supplier_name, '미정');
  const sourceApprovalId = text(
    params.purchaseOrder.sourceApprovalId ?? params.purchaseOrder.source_supply_approval_id,
  );

  const rows = params.receiptLines
    .filter((line) => line.receivedQty > 0 || line.rejectedQty > 0)
    .map((line) => {
      const item = line.item || {};
      const unitPrice = getItemUnitPrice(item);
      const supplyAmount = Math.round(line.receivedQty * unitPrice);
      const vatAmount = Math.round(supplyAmount * 0.1);
      const totalAmount = supplyAmount + vatAmount;
      const companyName = text(
        item.source_requester_company ?? params.purchaseOrder.requester_company ?? item.company,
        text(params.purchaseOrder.company, '미지정'),
      );

      return {
        purchase_order_id: purchaseOrderId || null,
        approval_id: sourceApprovalId || text(item.source_supply_approval_id) || null,
        inventory_item_id: text(item.item_id ?? item.linked_inventory_id) || null,
        order_item_index: line.index,
        item_name: getItemName(item),
        company_id: text(item.company_id ?? params.purchaseOrder.company_id) || null,
        company_name: companyName,
        department: text(item.source_requester_department ?? params.purchaseOrder.requester_department ?? item.department, '미지정'),
        supplier_id: text(params.purchaseOrder.supplier_id ?? item.supplier_id) || null,
        supplier_name: supplierName,
        qty_ordered: line.orderedQty,
        qty_received: line.receivedQty,
        qty_rejected: line.rejectedQty,
        qty_pending: line.pendingQty,
        unit_price: unitPrice,
        supply_amount: supplyAmount,
        vat_amount: vatAmount,
        total_amount: totalAmount,
        cost_center: text(item.cost_center ?? params.purchaseOrder.cost_center, '재고구매'),
        budget_item: text(item.budget_item ?? params.purchaseOrder.budget_item, '소모품/재고'),
        account_code: text(item.account_code ?? params.purchaseOrder.account_code, 'inventory_purchase'),
        posted_status: line.pendingQty > 0 ? 'partial_posted' : 'posted',
        occurred_at: params.occurredAt,
        posted_at: params.occurredAt,
        posted_by_id: params.actor?.id || null,
        posted_by_name: params.actor?.name || null,
        idempotency_key: `${purchaseOrderId || 'po'}:${line.index}:${params.occurredAt}`,
        notes: line.note || null,
      };
    });

  if (rows.length === 0) {
    return { inserted: 0, totalAmount: 0 };
  }

  const result = await withMissingColumnsFallback(
    (omittedColumns) => {
      const payload = rows.map((row) => {
        const nextRow: Record<string, unknown> = { ...row };
        omittedColumns.forEach((columnName) => {
          delete nextRow[columnName];
        });
        return nextRow;
      });
      return client.from('inventory_cost_entries').insert(payload);
    },
    [
      'approval_id',
      'inventory_item_id',
      'order_item_index',
      'company_id',
      'company_name',
      'department',
      'supplier_id',
      'qty_ordered',
      'qty_received',
      'qty_rejected',
      'qty_pending',
      'unit_price',
      'supply_amount',
      'vat_amount',
      'total_amount',
      'cost_center',
      'budget_item',
      'account_code',
      'posted_status',
      'occurred_at',
      'posted_at',
      'posted_by_id',
      'posted_by_name',
      'idempotency_key',
      'notes',
    ],
    { cacheKey: 'inventory_cost_entries.insert.receipt' },
  );

  if (result.error) {
    if (rememberMissingRelation(result.error, 'inventory_cost_entries')) {
      return { inserted: 0, totalAmount: 0 };
    }
    throw result.error;
  }

  return {
    inserted: rows.length,
    totalAmount: rows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0),
  };
}
