/**
 * Phase 8-A — 재고 부족 알림 보강.
 * inventory where (stock OR quantity) <= min_stock
 *   → 권한자(permissions.menu_재고관리=true 또는 행정/총무/원무팀) 에게 'inventory' 알림.
 * company 격리: 품목 company/company_id 와 수신자 company/company_id 매칭.
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
  company: string | null;
  company_id: string | null;
};

type StaffPermissionRow = {
  id: string;
  department: string | null;
  company: string | null;
  company_id: string | null;
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

function sameCompany(
  item: { company: string | null; company_id: string | null },
  staff: { company: string | null; company_id: string | null },
): boolean {
  const itemCid = String(item.company_id ?? '').trim();
  const staffCid = String(staff.company_id ?? '').trim();
  if (itemCid && staffCid) return itemCid === staffCid;

  const itemCo = String(item.company ?? '').trim();
  const staffCo = String(staff.company ?? '').trim();
  // 품목/직원 모두 company 미기입이면 레거시 전사 공유로 취급(알림 허용)
  if (!itemCo && !itemCid) return true;
  if (!itemCo) return false;
  return itemCo === staffCo;
}

type InventoryRecipient = {
  id: string;
  company: string | null;
  company_id: string | null;
};

async function loadInventoryRecipients(): Promise<InventoryRecipient[]> {
  const d1 = await getD1Binding();
  if (!d1) throw new Error('[check-inventory] D1 binding not available (loadInventoryRecipients)');
  const db = getD1Drizzle(d1);
  const d1Rows = await db
    .select({
      id: staffMembersTable.id,
      department: staffMembersTable.department,
      company: staffMembersTable.company,
      company_id: staffMembersTable.company_id,
      permissions: staffMembersTable.permissions })
    .from(staffMembersTable)
    .where(eq(staffMembersTable.status, '재직'));
  // D1에서 permissions는 TEXT(JSON) → parsePermissions가 문자열도 처리하므로 그대로 전달 가능
  const rows = d1Rows as StaffPermissionRow[];

  const result: InventoryRecipient[] = [];
  for (const row of rows) {
    const id = String(row.id || '');
    if (!id) continue;
    const dept = String(row.department || '');
    let eligible = INVENTORY_ADMIN_DEPARTMENTS.has(dept);
    if (!eligible) {
      const perms = parsePermissions(row.permissions);
      eligible = perms.menu_재고관리 === true || perms.inventory === true;
    }
    if (!eligible) continue;
    result.push({
      id,
      company: row.company ?? null,
      company_id: row.company_id ?? null,
    });
  }
  return result;
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
      min_quantity: inventoryTable.min_quantity,
      company: inventoryTable.company,
      company_id: inventoryTable.company_id })
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

  let recipients: InventoryRecipient[];
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
    sentKeys = await loadExistingDedupeKeys(
      'inventory',
      recipients.map((r) => r.id),
    );
  } catch (err) {
    return { detected: lowStockItems.length, created: 0, errors: [errorMessage(err)] };
  }

  const toInsert: NotificationInsertRow[] = [];
  for (const item of lowStockItems) {
    const stock = Number(item.stock ?? item.quantity ?? 0);
    const minStock = Number(item.min_stock ?? item.min_quantity ?? 0);
    const dedupeKey = `inventory:low:${item.id}:${stock}`;
    const itemName = item.item_name || '품목';
    for (const recipient of recipients) {
      // 회사 격리: 타사 재고 부족 알림 누수 방지
      if (!sameCompany(item, recipient)) continue;
      if (sentKeys.has(`${recipient.id}|${dedupeKey}`)) continue;
      toInsert.push({
        user_id: recipient.id,
        type: 'inventory',
        title: `재고 부족 — ${itemName}`,
        body: `${itemName} 현재 ${stock}개 (최소 ${minStock}개). 발주를 검토해 주세요.`,
        metadata: {
          type: 'inventory',
          item_id: item.id,
          stock,
          min_stock: minStock,
          company: item.company,
          company_id: item.company_id,
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
