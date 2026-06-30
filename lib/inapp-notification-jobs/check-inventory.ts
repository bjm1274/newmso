/**
 * Phase 8-A — 재고 부족 알림 보강.
 * inventory where (stock OR quantity) <= min_stock
 *   → 권한자(permissions.menu_재고관리=true 또는 행정/총무/원무팀) 에게 'inventory' 알림.
 * dedupe key: `inventory:low:{item_id}:{stock}`
 */
import 'server-only';
import {
  type CheckJobResult,
  type NotificationInsertRow,
  emptyResult,
  errorMessage,
  loadExistingDedupeKeys,
  insertNotificationsChunked } from './types';
import {
  getD1Binding,
  getD1Drizzle,
  inventory as inventoryTable,
  staff_members as staffMembersTable,
  eq } from '@/lib/db';

type InventoryRow = {
  id: string;
  item_name: string | null;
  quantity: number | null;
  stock: number | null;
  min_stock: number | null;
  min_quantity: number | null;
};

type StaffPermissionRow = {
  id: string;
  department: string | null;
  permissions: string | Record<string, unknown> | null;
};

const INVENTORY_ADMIN_DEPARTMENTS = new Set(['행정팀', '원무팀', '경영지원팀']);

function parsePermissions(
  value: string | Record<string, unknown> | null,
): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, unknown>;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

async function loadInventoryRecipients(): Promise<string[]> {
  const d1 = await getD1Binding();
  if (!d1) throw new Error('[check-inventory] D1 binding not available (loadInventoryRecipients)');
  const db = getD1Drizzle(d1);
  const d1Rows = await db
    .select({
      id: staffMembersTable.id,
      department: staffMembersTable.department,
      permissions: staffMembersTable.permissions })
    .from(staffMembersTable)
    .where(eq(staffMembersTable.status, '재직'));
  // D1에서 permissions는 TEXT(JSON) → parsePermissions가 문자열도 처리하므로 그대로 전달 가능
  const rows = d1Rows as StaffPermissionRow[];

  const result = new Set<string>();
  for (const row of rows) {
    const id = String(row.id || '');
    if (!id) continue;
    const dept = String(row.department || '');
    if (INVENTORY_ADMIN_DEPARTMENTS.has(dept)) {
      result.add(id);
      continue;
    }
    const perms = parsePermissions(row.permissions);
    if (perms.menu_재고관리 === true || perms.inventory === true) {
      result.add(id);
    }
  }
  return Array.from(result);
}

export async function checkInventoryLowStock(): Promise<CheckJobResult> {
  const d1 = await getD1Binding();
  if (!d1) return { detected: 0, created: 0, errors: ['[check-inventory] D1 binding not available'] };
  const db = getD1Drizzle(d1);
  const d1Rows = await db
    .select({
      id: inventoryTable.id,
      item_name: inventoryTable.item_name,
      quantity: inventoryTable.quantity,
      stock: inventoryTable.stock,
      min_stock: inventoryTable.min_stock,
      min_quantity: inventoryTable.min_quantity })
    .from(inventoryTable)
    .limit(1000);
  const items = d1Rows as InventoryRow[];
  const lowStockItems = items.filter((item) => {
    const minStock = Number(item.min_stock ?? item.min_quantity ?? 0);
    if (minStock <= 0) return false;
    const stock = Number(item.stock ?? item.quantity ?? 0);
    return stock <= minStock;
  });
  if (lowStockItems.length === 0) return emptyResult();

  let recipients: string[];
  try {
    recipients = await loadInventoryRecipients();
  } catch (err) {
    return { detected: lowStockItems.length, created: 0, errors: [errorMessage(err)] };
  }
  if (recipients.length === 0) {
    return { detected: lowStockItems.length, created: 0, errors: [] };
  }

  let sentKeys: Set<string>;
  try {
    sentKeys = await loadExistingDedupeKeys('inventory', recipients);
  } catch (err) {
    return { detected: lowStockItems.length, created: 0, errors: [errorMessage(err)] };
  }

  const toInsert: NotificationInsertRow[] = [];
  for (const item of lowStockItems) {
    const stock = Number(item.stock ?? item.quantity ?? 0);
    const minStock = Number(item.min_stock ?? item.min_quantity ?? 0);
    const dedupeKey = `inventory:low:${item.id}:${stock}`;
    const itemName = item.item_name || '품목';
    for (const userId of recipients) {
      if (sentKeys.has(`${userId}|${dedupeKey}`)) continue;
      toInsert.push({
        user_id: userId,
        type: 'inventory',
        title: `재고 부족 — ${itemName}`,
        body: `${itemName} 현재 ${stock}개 (최소 ${minStock}개). 발주를 검토해 주세요.`,
        metadata: {
          type: 'inventory',
          item_id: item.id,
          stock,
          min_stock: minStock,
          dedupe_key: dedupeKey },
        read_at: null });
    }
  }

  if (toInsert.length === 0) {
    return { detected: lowStockItems.length, created: 0, errors: [] };
  }
  const { created, errors } = await insertNotificationsChunked(toInsert);
  return { detected: lowStockItems.length, created, errors };
}
