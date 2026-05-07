import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isRelationMarkedMissing,
  rememberMissingRelation,
  withMissingColumnsFallback,
} from '@/lib/supabase-compat';

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

