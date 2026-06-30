import { db } from '@/lib/db-client';
import { d1Client } from '@/lib/db-client';
import { withMissingColumnFallback, withMissingColumnsFallback } from '@/lib/db-compat';
import {
  callAtomicStockUpdate,
  callAtomicStockTransfer } from '@/lib/inventory-stock-client';
import {
  getD1Binding,
  getD1Drizzle,
  inventory as inventoryTable,
  and,
  eq } from '@/lib/db';
import type { InventoryItem, StaffMember } from '@/types';

type LooseRecord = Record<string, unknown>;
type InventoryLike = Partial<InventoryItem> & LooseRecord;
type InventoryUserLike = Partial<StaffMember> & LooseRecord;
type SupabaseCompatResult<T> = {
  data: T | null;
  error: unknown;
};
type ApprovalLike = LooseRecord & {
  id?: string | null;
  doc_number?: string | null;
  created_at?: string | null;
  meta_data?: LooseRecord | null;
};

export const INVENTORY_SELECT_COLUMNS = [
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

export const INVENTORY_SUPPORT_COMPANY = 'SY INC.';
export const INVENTORY_SUPPORT_DEPARTMENT = '경영지원팀';
export const SUPPLY_REQUEST_CATEGORY_OPTIONS = ['의약품', '의료용품', '보조기', '사무용품', '기타'] as const;

function isLooseRecord(value: unknown): value is LooseRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toLooseRecordArray(value: unknown): LooseRecord[] {
  return Array.isArray(value) ? value.filter(isLooseRecord) : [];
}

export function getItemQuantity(item: InventoryLike | null | undefined): number {
  return Number(item?.quantity ?? item?.stock ?? 0);
}

export function getItemMinQuantity(item: InventoryLike | null | undefined): number {
  return Number(item?.min_quantity ?? item?.min_stock ?? 0);
}

export function getItemName(item: InventoryLike | null | undefined): string {
  const rawName = item?.item_name ?? item?.name;
  const normalizedName = typeof rawName === 'string' ? rawName.trim() : String(rawName ?? '').trim();
  return normalizedName || '품목';
}

export function getItemUnitPrice(item: InventoryLike | null | undefined): number {
  return Number(item?.unit_price ?? item?.price ?? 0);
}

export function normalizeInventoryText(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

export const EXPIRY_SOON_MS = 30 * 24 * 60 * 60 * 1000;

export function isExpirySoon(item: InventoryLike | null | undefined, threshold: number) {
  return Boolean(item?.expiry_date) && new Date(item!.expiry_date as string).getTime() < threshold;
}

type InventoryQuantityValidationOptions = {
  label?: string;
  min?: number;
  max?: number;
  allowEmpty?: boolean;
  integerOnly?: boolean;
};

export type InventoryQuantityValidationResult = {
  quantity: number | null;
  error: string | null;
};

export function parseInventoryQuantity(value: string | number | null | undefined) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateInventoryQuantity(
  value: string | number | null | undefined,
  {
    label = '수량',
    min = 0,
    max,
    allowEmpty = false,
    integerOnly = true }: InventoryQuantityValidationOptions = {},
): InventoryQuantityValidationResult {
  const quantity = parseInventoryQuantity(value);

  if (quantity === null) {
    return {
      quantity: null,
      error: allowEmpty ? null : `${label}을 입력하세요.` };
  }

  if (integerOnly && !Number.isInteger(quantity)) {
    return {
      quantity,
      error: `${label}은 정수로 입력하세요.` };
  }

  if (quantity < min) {
    const minMessage =
      min <= 0 ? `${label}은 0 이상이어야 합니다.` :
      min === 1 ? `${label}은 1개 이상이어야 합니다.` :
      `${label}은 ${min} 이상이어야 합니다.`;

    return {
      quantity,
      error: minMessage };
  }

  if (typeof max === 'number' && quantity > max) {
    return {
      quantity,
      error: `${label}은 현재 재고 ${max}개를 초과할 수 없습니다.` };
  }

  return {
    quantity,
    error: null };
}

type InventoryTransferValidationParams = {
  item: InventoryLike | null | undefined;
  quantity: string | number | null | undefined;
  toCompany?: string | null;
  fromCompany?: string | null;
  toDept?: string | null;
  fromDept?: string | null;
};

export function validateInventoryTransfer({
  item,
  quantity,
  toCompany,
  fromCompany,
  toDept,
  fromDept }: InventoryTransferValidationParams) {
  if (!item) {
    return '물품을 선택하세요.';
  }

  if (!String(toCompany || '').trim()) {
    return '이관 대상 법인을 선택하세요.';
  }

  const quantityValidation = validateInventoryQuantity(quantity, {
    label: '이관 수량',
    min: 1,
    max: getItemQuantity(item) });

  if (quantityValidation.error) {
    return quantityValidation.error;
  }

  const sourceCompany = String(fromCompany ?? item?.company ?? '').trim();
  const sourceDept = String(fromDept ?? item?.department ?? '').trim();
  const destinationCompany = String(toCompany ?? '').trim();
  const destinationDept = String(toDept ?? '').trim();

  if (sourceCompany === destinationCompany && sourceDept === destinationDept) {
    return '출발지와 목적지가 동일합니다.';
  }

  return null;
}

export function getRecommendedOrderQuantity(item: InventoryLike | null | undefined) {
  const quantity = getItemQuantity(item);
  const minQuantity = Math.max(getItemMinQuantity(item), 1);
  return Math.max(minQuantity * 2 - quantity, 1);
}

export type SupplyRequestWorkflowItem = {
  request_index: number;
  name: string;
  qty: number;
  category: string;
  dept: string;
  purpose: string;
  available_qty: number;
  shortage_qty: number;
  source_inventory_id: string | null;
  source_company: string;
  source_department: string;
  recommended_action: 'issue' | 'order';
  status: 'issue_ready' | 'order_required' | 'issued' | 'ordered';
  processed_at?: string | null;
  processed_by_id?: string | null;
  processed_by_name?: string | null;
  order_approval_requested?: boolean;
  note?: string | null;
};

export type SupplyRequestItemUnit = 'EA' | 'BOX';
export type SupplyRequestCategory = (typeof SUPPLY_REQUEST_CATEGORY_OPTIONS)[number];

export function normalizeInventoryUnit(value: unknown): SupplyRequestItemUnit {
  return String(value || '').trim().toUpperCase() === 'BOX' ? 'BOX' : 'EA';
}

const CATEGORY_ALIAS_MAP: Record<string, SupplyRequestCategory> = {
  약품: '의약품',
  의료기기: '의료용품',
  소모품: '사무용품' };

export function normalizeSupplyRequestCategory(value: unknown): SupplyRequestCategory | '' {
  const normalized = String(value || '').trim();
  if (SUPPLY_REQUEST_CATEGORY_OPTIONS.includes(normalized as SupplyRequestCategory)) {
    return normalized as SupplyRequestCategory;
  }
  return CATEGORY_ALIAS_MAP[normalized] || '';
}

export function normalizeSupplyRequestItems(rawItems: LooseRecord[] = []) {
  return rawItems
    .map((item) => ({
      name: String(item?.name || item?.item_name || '').trim(),
      qty: Math.max(1, Number(item?.qty) || 1),
      unit: normalizeInventoryUnit(item?.unit || item?.quantity_unit || item?.request_unit),
      category: normalizeSupplyRequestCategory(item?.category || item?.item_category || item?.classification),
      dept: String(item?.dept || item?.department || '').trim(),
      purpose: String(item?.purpose || item?.reason || '').trim() }))
    .filter((item) => item.name);
}

export type SupplyRequestMonthlySuggestion = {
  key: string;
  name: string;
  category: string;
  purpose: string;
  total_qty: number;
  line_count: number;
  document_count: number;
  average_qty: number;
  last_requested_at: string | null;
};

export function buildSupplyRequestMonthlySuggestions(
  approvals: ApprovalLike[] = [],
  limit = 8,
) {
  const grouped = new Map<
    string,
    {
      key: string;
      name: string;
      category: string;
      purpose: string;
      total_qty: number;
      line_count: number;
      document_ids: Set<string>;
      last_requested_at: string | null;
    }
  >();

  approvals.forEach((approval, approvalIndex) => {
    const items = normalizeSupplyRequestItems(toLooseRecordArray(approval?.meta_data?.items));
    if (items.length === 0) {
      return;
    }

    const approvalId =
      String(approval?.id || approval?.doc_number || approval?.created_at || `approval-${approvalIndex}`).trim() ||
      `approval-${approvalIndex}`;
    const createdAt = approval?.created_at ? String(approval.created_at) : null;

    items.forEach((item) => {
      const key = [
        item.name.trim().toLowerCase(),
        item.category.trim().toLowerCase(),
        item.purpose.trim().toLowerCase(),
      ].join('::');
      const current = grouped.get(key) || {
        key,
        name: item.name,
        category: item.category,
        purpose: item.purpose,
        total_qty: 0,
        line_count: 0,
        document_ids: new Set<string>(),
        last_requested_at: null as string | null };

      current.total_qty += item.qty;
      current.line_count += 1;
      current.document_ids.add(approvalId);

      if (!current.last_requested_at || (createdAt && createdAt > current.last_requested_at)) {
        current.last_requested_at = createdAt;
      }

      grouped.set(key, current);
    });
  });

  return Array.from(grouped.values())
    .map((item) => {
      const documentCount = Math.max(item.document_ids.size, 1);
      return {
        key: item.key,
        name: item.name,
        category: item.category,
        purpose: item.purpose,
        total_qty: item.total_qty,
        line_count: item.line_count,
        document_count: documentCount,
        average_qty: Math.max(1, Math.round(item.total_qty / documentCount)),
        last_requested_at: item.last_requested_at } satisfies SupplyRequestMonthlySuggestion;
    })
    .sort((left, right) => {
      if (right.total_qty !== left.total_qty) {
        return right.total_qty - left.total_qty;
      }
      if (right.document_count !== left.document_count) {
        return right.document_count - left.document_count;
      }
      return left.name.localeCompare(right.name, 'ko');
    })
    .slice(0, limit);
}

export function findSupplySourceInventoryItem(
  inventoryRows: InventoryLike[] = [],
  itemName: string,
  company = INVENTORY_SUPPORT_COMPANY,
  department = INVENTORY_SUPPORT_DEPARTMENT,
) {
  const normalizedName = normalizeInventoryText(itemName);
  const normalizedCompany = normalizeInventoryText(company);
  const normalizedDepartment = normalizeInventoryText(department);

  return (
    inventoryRows
      .filter((row) => normalizeInventoryText(getItemName(row)) === normalizedName)
      .filter((row) => normalizeInventoryText(row?.company) === normalizedCompany)
      .filter((row) => normalizeInventoryText(resolveInventoryDepartment(row)) === normalizedDepartment)
      .sort((a, b) => getItemQuantity(b) - getItemQuantity(a))[0] || null
  );
}

export function buildSupplyRequestWorkflowItems(
  rawItems: unknown[] = [],
  inventoryRows: InventoryLike[] = [],
  previousWorkflowItems: unknown[] = [],
) {
  const previousByIndex = new Map<number, Partial<SupplyRequestWorkflowItem> & LooseRecord>();
  toLooseRecordArray(previousWorkflowItems).forEach((item) => {
    const requestIndex = Number(item?.request_index);
    if (Number.isInteger(requestIndex) && requestIndex >= 0) {
      previousByIndex.set(requestIndex, item);
    }
  });

  return normalizeSupplyRequestItems(toLooseRecordArray(rawItems)).map((item, index) => {
    const sourceItem = findSupplySourceInventoryItem(inventoryRows, item.name);
    const availableQty = sourceItem ? getItemQuantity(sourceItem) : 0;
    const shortageQty = Math.max(item.qty - availableQty, 0);
    const recommendedAction: 'issue' | 'order' = shortageQty > 0 ? 'order' : 'issue';
    const previousItem = previousByIndex.get(index);
    const previousStatus = String(previousItem?.status || '');
    const status: SupplyRequestWorkflowItem['status'] =
      previousStatus === 'issued' || previousStatus === 'ordered'
        ? (previousStatus as SupplyRequestWorkflowItem['status'])
        : recommendedAction === 'issue'
          ? 'issue_ready'
          : 'order_required';

    return {
      request_index: index,
      name: item.name,
      qty: item.qty,
      category: item.category,
      dept: item.dept,
      purpose: item.purpose,
      available_qty: availableQty,
      shortage_qty: shortageQty,
      source_inventory_id: sourceItem?.id ? String(sourceItem.id) : null,
      source_company: String(sourceItem?.company || INVENTORY_SUPPORT_COMPANY).trim(),
      source_department: resolveInventoryDepartment(sourceItem),
      recommended_action: recommendedAction,
      status,
      processed_at: previousItem?.processed_at || null,
      processed_by_id: previousItem?.processed_by_id || null,
      processed_by_name: previousItem?.processed_by_name || null,
      order_approval_requested: Boolean(previousItem?.order_approval_requested),
      note: previousItem?.note || null } satisfies SupplyRequestWorkflowItem;
  });
}

export function summarizeSupplyRequestWorkflow(items: SupplyRequestWorkflowItem[] = []) {
  return items.reduce(
    (summary, item) => {
      if (item.status === 'issued') summary.issued_count += 1;
      else if (item.status === 'ordered') summary.ordered_count += 1;
      else if (item.recommended_action === 'issue') summary.issue_ready_count += 1;
      else summary.order_required_count += 1;
      return summary;
    },
    {
      total_count: items.length,
      issue_ready_count: 0,
      order_required_count: 0,
      issued_count: 0,
      ordered_count: 0 },
  );
}

export function resolveInventoryDepartment(item: InventoryLike | null | undefined) {
  const department = String(item?.department || '').trim();
  if (department) {
    return department;
  }

  return normalizeInventoryText(item?.company) === normalizeInventoryText(INVENTORY_SUPPORT_COMPANY)
    ? INVENTORY_SUPPORT_DEPARTMENT
    : '';
}

export function normalizeSupportInventoryRows(rows: InventoryLike[] = []) {
  return rows.map((row) => {
    const department = resolveInventoryDepartment(row);
    return department === row?.department ? row : { ...row, department };
  });
}

/**
 * SY INC. 경영지원팀 재고 행을 D1에서 조회한다.
 *
 * 컷오버(2026-05-21) 후 데이터 진실원은 Cloudflare D1 한 곳이다.
 * - 서버/Workers: D1 binding이 있으면 drizzle로 직접 SELECT.
 * - 브라우저: binding이 없으므로 d1Client(/api/d1/query) 경유로 D1을 읽는다.
 * 어느 쪽이든 Supabase를 거치지 않는다.
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

export function findDestinationInventoryItem(
  inventoryRows: InventoryLike[],
  selectedItem: InventoryLike | null | undefined,
  toCompany: string,
  toDept: string,
) {
  if (!selectedItem || !toCompany.trim()) {
    return null;
  }

  return (
    inventoryRows.find((candidate) => {
      if (String(candidate.id) === String(selectedItem.id)) {
        return false;
      }

      return (
        normalizeInventoryText(getItemName(candidate)) === normalizeInventoryText(getItemName(selectedItem)) &&
        normalizeInventoryText(candidate.category) === normalizeInventoryText(selectedItem.category) &&
        normalizeInventoryText(candidate.spec) === normalizeInventoryText(selectedItem.spec) &&
        normalizeInventoryText(candidate.lot_number) === normalizeInventoryText(selectedItem.lot_number) &&
        normalizeInventoryText(candidate.company) === normalizeInventoryText(toCompany) &&
        normalizeInventoryText(candidate.department) === normalizeInventoryText(toDept)
      );
    }) || null
  );
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
      const { data: remoteRows } = await db
        .from('inventory')
        .select('id, item_name, quantity, stock, company, department, category, spec, min_quantity')
        .eq('company', destinationCompany)
        .eq('item_name', getItemName(sourceItem))
        .returns<any[]>();

      destinationItem = findDestinationInventoryItem(remoteRows || [], sourceItem, destinationCompany, destinationDept);
    }

    if (destinationItem) {
      // 원자적 이관 RPC 시도 (출발지 차감 + 목적지 증가를 단일 트랜잭션으로)
      const transferResp = await callAtomicStockTransfer({
        sourceId: String(sourceItem.id ?? ''),
        destId: String(destinationItem.id ?? ''),
        quantity: transferQuantity });
      const transferResult = transferResp.ok ? transferResp.data : null;
      const transferRpcError = transferResp.ok ? null : { message: transferResp.error };

      if (transferRpcError) {
        if (String(transferRpcError.message).includes('INSUFFICIENT_STOCK')) {
          throw new Error('INSUFFICIENT_STOCK');
        }
        // RPC 미등록 시 fallback (순차 업데이트)
        const { error: sourceUpdateError } = await db
          .from('inventory')
          .update({ quantity: sourceNextQty, stock: sourceNextQty })
          .eq('id', sourceItem.id);
        if (sourceUpdateError) throw sourceUpdateError;

        destinationPrevQty = getItemQuantity(destinationItem);
        destinationNextQty = destinationPrevQty + transferQuantity;

        const { error: destinationUpdateError } = await db
          .from('inventory')
          .update({ quantity: destinationNextQty, stock: destinationNextQty })
          .eq('id', destinationItem.id);

        if (destinationUpdateError) {
          // 롤백: 출발지 원상 복구
          await db.from('inventory')
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
          const { error: sourceUpdateError } = await db
            .from('inventory')
            .update({ quantity: sourceNextQty, stock: sourceNextQty })
            .eq('id', sourceItem.id);
          if (sourceUpdateError) throw sourceUpdateError;

          destinationPrevQty = getItemQuantity(destinationItem);
          destinationNextQty = destinationPrevQty + transferQuantity;

          const { error: destinationUpdateError } = await db
            .from('inventory')
            .update({ quantity: destinationNextQty, stock: destinationNextQty })
            .eq('id', destinationItem.id);

          if (destinationUpdateError) {
            await db
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
        minAllowed: 0 });
      const srcResult = srcResp.ok ? srcResp.data : null;
      const srcRpcError = srcResp.ok ? null : { message: srcResp.error };
      if (srcRpcError) {
        if (String(srcRpcError.message).includes('INSUFFICIENT_STOCK')) {
          throw new Error('INSUFFICIENT_STOCK');
        }
        // fallback
        const { error: sourceUpdateError } = await db
          .from('inventory')
          .update({ quantity: sourceNextQty, stock: sourceNextQty })
          .eq('id', sourceItem.id);
        if (sourceUpdateError) throw sourceUpdateError;
      } else {
        const row = Array.isArray(srcResult) ? srcResult[0] : srcResult;
        if (row == null || (row?.prev_qty == null && row?.next_qty == null)) {
          const { error: sourceUpdateError } = await db
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
        location: sourceItem?.location || null };

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

            return db
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
      minAllowed: 0 });
    const srcOnlyResult = srcOnlyResp.ok ? srcOnlyResp.data : null;
    const srcOnlyError = srcOnlyResp.ok ? null : { message: srcOnlyResp.error };
    if (srcOnlyError) {
      if (String(srcOnlyError.message).includes('INSUFFICIENT_STOCK')) {
        throw new Error('INSUFFICIENT_STOCK');
      }
      // fallback
      const { error: fbErr } = await db.from('inventory')
        .update({ quantity: sourceNextQty, stock: sourceNextQty })
        .eq('id', sourceItem.id);
      if (fbErr) throw fbErr;
    } else {
      const row = Array.isArray(srcOnlyResult) ? srcOnlyResult[0] : srcOnlyResult;
      if (row == null || (row?.prev_qty == null && row?.next_qty == null)) {
        const { error: fbErr } = await db
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
    const { error: transferError } = await db.from('inventory_transfers').insert([
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
        status: '완료' },
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
      notes: sourceNotes },
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
      notes: destinationNotes });
  }

  const { error: logError } = await db.from('inventory_logs').insert(logRows);
  if (logError) {
    throw logError;
  }

  return {
    sourceNextQty,
    destinationInventoryId,
    destinationNextQty,
    isSameLocation };
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
  user }: ReverseInventoryIssueParams) {
  const reverseQty = Math.max(1, Number(quantity) || 0);

  // 1) SY INC. 재고 복원 (증가)
  const reverseResp = await callAtomicStockUpdate({
    itemId: sourceItemId,
    delta: reverseQty,
    minAllowed: 0 });
  const srcErr = reverseResp.ok ? null : { message: reverseResp.error };
  if (srcErr) {
    // RPC 미등록 fallback
    const { data: srcRow } = await db
      .from('inventory')
      .select('quantity, stock')
      .eq('id', sourceItemId)
      .single()
      .returns<any>();
    const curQty = Number(srcRow?.quantity ?? srcRow?.stock ?? 0);
    const { error } = await db.from('inventory').update({ quantity: curQty + reverseQty, stock: curQty + reverseQty }).eq('id', sourceItemId);
    if (error) throw error;
  }

  // 2) 수령팀 재고 차감 (감소)
  const { data: destRows } = await db
    .from('inventory')
    .select('id, quantity, stock, item_name')
    .eq('company', destinationCompany)
    .eq('item_name', itemName)
    .returns<any[]>();

  const destItem = (destRows || []).find((r: LooseRecord) =>
    String(r.department || '').trim() === destinationDept.trim() ||
    (!destinationDept && !String(r.department || '').trim()),
  ) || (destRows || [])[0];

  if (destItem) {
    const destCurQty = Number(destItem.quantity ?? destItem.stock ?? 0);
    const destNextQty = Math.max(0, destCurQty - reverseQty);
    const { error } = await db.from('inventory').update({ quantity: destNextQty, stock: destNextQty }).eq('id', destItem.id);
    if (error) throw error;
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
      notes: `불출 취소: ${destinationCompany} ${destinationDept} → ${INVENTORY_SUPPORT_COMPANY} ${INVENTORY_SUPPORT_DEPARTMENT} (${reason || '운영자 취소'})` },
  ];
  await db.from('inventory_logs').insert(logRows);
}

type RequestInventoryReorderParams = {
  item: InventoryLike;
  user?: InventoryUserLike | null;
  selectedCompanyId?: string | null;
  quantity?: number;
  reason?: string;
  metaData?: Record<string, unknown>;
};

export async function requestInventoryReorder({
  item,
  user,
  selectedCompanyId,
  quantity,
  reason,
  metaData }: RequestInventoryReorderParams) {
  const itemName = getItemName(item);
  const currentStock = getItemQuantity(item);
  const minQuantity = getItemMinQuantity(item);
  const requestedQuantity = quantity ?? getRecommendedOrderQuantity(item);
  const rows: Array<Record<string, unknown>> = [
    {
      sender_id: user?.id,
      sender_name: user?.name,
      sender_company: user?.company,
      type: '비품구매',
      title: `[자동기안] ${itemName} 재고 보충 요청 (${item.company || user?.company || '미지정'})`,
      content:
        reason ||
        `현재고(${currentStock})가 안전재고(${minQuantity}) 이하로 떨어져 자동 기안되었습니다.\n보충 필요량: ${requestedQuantity}개`,
      status: '대기',
      meta_data: {
        item_name: itemName,
        quantity: requestedQuantity,
        current_stock: currentStock,
        min_stock: minQuantity,
        inventory_id: item?.id,
        unit_price: getItemUnitPrice(item),
        supplier_name: item?.supplier_name || item?.supplier || null,
        is_auto_generated: true,
        ...(metaData || {}) } },
  ];

  if (item?.company_id || user?.company_id || selectedCompanyId) {
    rows[0].company_id =
      item?.company_id ?? (user?.company === 'SY INC.' ? selectedCompanyId : user?.company_id);
  }

  return withMissingColumnFallback(
    () => db.from('approvals').insert(rows),
    () => {
      const legacyRows = rows.map(({ company_id, ...rest }) => rest);
      return db.from('approvals').insert(legacyRows);
    },
  );
}

/**
 * SY INC. 경영지원팀에 신규 품목을 자동 등록한다.
 * 물품신청서에 있지만 SY INC. 재고에 없는 품목에 대해 호출.
 * 등록 후 해당 아이템을 반환하여 requestInventoryReorder에 사용 가능.
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
