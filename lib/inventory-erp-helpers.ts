import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isRelationMarkedMissing,
  rememberMissingRelation,
  withMissingColumnsFallback,
} from '@/lib/supabase-compat';
import {
  resolveDataBackend,
  getD1Binding,
  getD1Drizzle,
  inventory as inventoryTable,
  inventory_price_history as inventoryPriceHistoryTable,
  eq,
} from '@/lib/db';

type LooseRecord = Record<string, unknown>;

export type InventoryTrackingPatch = {
  serialNumber?: string | null;
  lotNumber?: string | null;
  expiryDate?: string | null;
  location?: string | null;
  unitPrice?: number | null;
  supplierName?: string | null;
};

function cleanText(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function cleanNumber(value: unknown) {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : null;
}

export function buildInventoryTrackingPatch(input: InventoryTrackingPatch) {
  const patch: LooseRecord = {};
  const serialNumber = cleanText(input.serialNumber);
  const lotNumber = cleanText(input.lotNumber);
  const expiryDate = cleanText(input.expiryDate);
  const location = cleanText(input.location);
  const supplierName = cleanText(input.supplierName);
  const unitPrice = cleanNumber(input.unitPrice);

  if (serialNumber) patch.serial_number = serialNumber;
  if (lotNumber) patch.lot_number = lotNumber;
  if (expiryDate) patch.expiry_date = expiryDate;
  if (location) patch.location = location;
  if (supplierName) patch.supplier_name = supplierName;
  if (unitPrice !== null) patch.unit_price = unitPrice;

  return patch;
}

export async function updateInventoryTrackingFields(
  client: SupabaseClient,
  inventoryItemId: string,
  input: InventoryTrackingPatch,
) {
  const patch = buildInventoryTrackingPatch(input);
  if (Object.keys(patch).length === 0) {
    return;
  }

  const backend = await resolveDataBackend();
  if (backend === 'd1') {
    const d1 = await getD1Binding();
    if (!d1) throw new Error('[inventory-erp-helpers] D1 binding not available (updateInventoryTrackingFields)');
    const db = getD1Drizzle(d1);
    // inventory 테이블에 JSON 컬럼 없음 — 직렬화 불필요
    await db
      .update(inventoryTable)
      .set(patch as Parameters<ReturnType<typeof db.update>['set']>[0])
      .where(eq(inventoryTable.id, inventoryItemId));
    return;
  }

  const result = await withMissingColumnsFallback(
    (omittedColumns) => {
      const payload = { ...patch };
      omittedColumns.forEach((columnName) => {
        delete payload[columnName];
      });
      if (Object.keys(payload).length === 0) {
        return Promise.resolve({ data: null, error: null });
      }
      return client.from('inventory').update(payload).eq('id', inventoryItemId);
    },
    ['serial_number', 'lot_number', 'expiry_date', 'location', 'supplier_name', 'unit_price'],
    { cacheKey: 'inventory.tracking.update' },
  );

  if (result.error) {
    throw result.error;
  }
}

export async function recordInventoryPriceHistory(
  client: SupabaseClient,
  params: {
    inventoryItemId?: string | null;
    supplierId?: string | null;
    supplierName?: string | null;
    unitPrice?: number | null;
    quantity?: number | null;
    sourceType?: string | null;
    recordedBy?: string | null;
    purchaseOrderId?: string | null;
    notes?: string | null;
  },
) {
  if (isRelationMarkedMissing('inventory_price_history')) {
    return;
  }

  const inventoryItemId = cleanText(params.inventoryItemId);
  const unitPrice = cleanNumber(params.unitPrice);
  if (!inventoryItemId || unitPrice === null || unitPrice <= 0) {
    return;
  }

  const quantity = Math.max(0, Math.trunc(Number(params.quantity) || 0));
  const payload: LooseRecord = {
    inventory_item_id: inventoryItemId,
    supplier_id: cleanText(params.supplierId),
    supplier_name: cleanText(params.supplierName),
    unit_price: unitPrice,
    quantity,
    total_amount: unitPrice * quantity,
    source_type: cleanText(params.sourceType) || 'manual',
    recorded_by: cleanText(params.recordedBy),
    purchase_order_id: cleanText(params.purchaseOrderId),
    notes: cleanText(params.notes),
  };

  const backend = await resolveDataBackend();
  if (backend === 'd1') {
    const d1 = await getD1Binding();
    if (!d1) throw new Error('[inventory-erp-helpers] D1 binding not available (recordInventoryPriceHistory)');
    const db = getD1Drizzle(d1);
    // inventory_price_history는 JSON 컬럼 없음 — 직렬화 불필요
    await db.insert(inventoryPriceHistoryTable).values({
      id: crypto.randomUUID(),
      inventory_item_id: String(payload.inventory_item_id ?? ''),
      supplier_id: (payload.supplier_id as string | null) ?? null,
      supplier_name: (payload.supplier_name as string | null) ?? null,
      unit_price: typeof payload.unit_price === 'number' ? payload.unit_price : null,
      quantity: typeof payload.quantity === 'number' ? payload.quantity : 0,
      total_amount: typeof payload.total_amount === 'number' ? payload.total_amount : null,
      source_type: (payload.source_type as string | null) ?? 'manual',
      recorded_by: (payload.recorded_by as string | null) ?? null,
      purchase_order_id: (payload.purchase_order_id as string | null) ?? null,
      notes: (payload.notes as string | null) ?? null,
    });
    return;
  }

  const result = await withMissingColumnsFallback(
    (omittedColumns) => {
      const nextPayload = { ...payload };
      omittedColumns.forEach((columnName) => {
        delete nextPayload[columnName];
      });
      return client.from('inventory_price_history').insert([nextPayload]);
    },
    ['supplier_id', 'supplier_name', 'total_amount', 'recorded_by', 'purchase_order_id', 'notes'],
    { cacheKey: 'inventory_price_history.insert' },
  );

  if (result.error) {
    if (rememberMissingRelation(result.error, 'inventory_price_history')) {
      return;
    }
    throw result.error;
  }
}

