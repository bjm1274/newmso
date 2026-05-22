import { isRelationMarkedMissing } from '@/lib/supabase-compat';
import {
  getD1Binding,
  getD1Drizzle,
  inventory_cost_entries as inventoryCostEntriesTable,
} from '@/lib/db';

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

  const d1 = await getD1Binding();
  if (!d1) throw new Error('[inventory-accounting] D1 binding not available (createInventoryCostEntriesForReceipt)');
  const db = getD1Drizzle(d1);
  // inventory_cost_entries에 JSON 컬럼 없음 — 직렬화 불필요
  const insertRows = rows.map((row) => ({
    id: crypto.randomUUID(),
    purchase_order_id: (row.purchase_order_id as string | null) ?? null,
    approval_id: (row.approval_id as string | null) ?? null,
    inventory_item_id: (row.inventory_item_id as string | null) ?? null,
    order_item_index: typeof row.order_item_index === 'number' ? row.order_item_index : 0,
    item_name: String(row.item_name ?? ''),
    company_id: (row.company_id as string | null) ?? null,
    company_name: (row.company_name as string | null) ?? null,
    department: (row.department as string | null) ?? null,
    supplier_id: (row.supplier_id as string | null) ?? null,
    supplier_name: (row.supplier_name as string | null) ?? null,
    qty_ordered: typeof row.qty_ordered === 'number' ? row.qty_ordered : null,
    qty_received: typeof row.qty_received === 'number' ? row.qty_received : null,
    qty_rejected: typeof row.qty_rejected === 'number' ? row.qty_rejected : null,
    qty_pending: typeof row.qty_pending === 'number' ? row.qty_pending : null,
    unit_price: typeof row.unit_price === 'number' ? row.unit_price : null,
    supply_amount: typeof row.supply_amount === 'number' ? row.supply_amount : null,
    vat_amount: typeof row.vat_amount === 'number' ? row.vat_amount : null,
    total_amount: typeof row.total_amount === 'number' ? row.total_amount : null,
    cost_center: (row.cost_center as string | null) ?? null,
    budget_item: (row.budget_item as string | null) ?? null,
    account_code: (row.account_code as string | null) ?? null,
    posted_status: (row.posted_status as string | null) ?? 'posted',
    occurred_at: (row.occurred_at as string | null) ?? null,
    posted_at: (row.posted_at as string | null) ?? null,
    posted_by_id: (row.posted_by_id as string | null) ?? null,
    posted_by_name: (row.posted_by_name as string | null) ?? null,
    idempotency_key: (row.idempotency_key as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
  }));
  await db.insert(inventoryCostEntriesTable).values(insertRows);
  return {
    inserted: insertRows.length,
    totalAmount: insertRows.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0),
  };
}
