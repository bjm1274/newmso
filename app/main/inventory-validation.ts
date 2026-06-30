import type { InventoryItem, StaffMember } from '@/types';

export type LooseRecord = Record<string, unknown>;
export type InventoryLike = Partial<InventoryItem> & LooseRecord;
export type InventoryUserLike = Partial<StaffMember> & LooseRecord;
export type SupabaseCompatResult<T> = {
  data: T | null;
  error: unknown;
};
export type ApprovalLike = LooseRecord & {
  id?: string | null;
  doc_number?: string | null;
  created_at?: string | null;
  meta_data?: LooseRecord | null;
};

export const SUPPLY_REQUEST_CATEGORY_OPTIONS = ['의약품', '의료용품', '보조기', '사무용품', '기타'] as const;
export const EXPIRY_SOON_MS = 30 * 24 * 60 * 60 * 1000;
export const INVENTORY_SUPPORT_COMPANY = 'SY INC.';
export const INVENTORY_SUPPORT_DEPARTMENT = '경영지원팀';

export type SupplyRequestItemUnit = 'EA' | 'BOX';
export type SupplyRequestCategory = (typeof SUPPLY_REQUEST_CATEGORY_OPTIONS)[number];

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

export type InventoryQuantityValidationResult = {
  quantity: number | null;
  error: string | null;
};

export type InventoryQuantityValidationOptions = {
  label?: string;
  min?: number;
  max?: number;
  allowEmpty?: boolean;
  integerOnly?: boolean;
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

export type InventoryTransferValidationParams = {
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
