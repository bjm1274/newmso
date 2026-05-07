import type { InventoryItem } from '@/types';
import type { LooseRecord } from '@/lib/types';
export type InventoryLike = Partial<InventoryItem> & LooseRecord;

export const SUPPLY_REQUEST_CATEGORY_OPTIONS = ['의약품', '의료용품', '보조기', '사무용품', '기타'] as const;
export const EXPIRY_SOON_MS = 30 * 24 * 60 * 60 * 1000;

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
    integerOnly = true,
  }: InventoryQuantityValidationOptions = {},
): InventoryQuantityValidationResult {
  const quantity = parseInventoryQuantity(value);

  if (quantity === null) {
    return {
      quantity: null,
      error: allowEmpty ? null : `${label}을 입력하세요.`,
    };
  }

  if (integerOnly && !Number.isInteger(quantity)) {
    return {
      quantity,
      error: `${label}은 정수로 입력하세요.`,
    };
  }

  if (quantity < min) {
    const minMessage =
      min <= 0 ? `${label}은 0 이상이어야 합니다.` :
      min === 1 ? `${label}은 1개 이상이어야 합니다.` :
      `${label}은 ${min} 이상이어야 합니다.`;

    return {
      quantity,
      error: minMessage,
    };
  }

  if (typeof max === 'number' && quantity > max) {
    return {
      quantity,
      error: `${label}은 현재 재고 ${max}개를 초과할 수 없습니다.`,
    };
  }

  return {
    quantity,
    error: null,
  };
}

export function getRecommendedOrderQuantity(item: InventoryLike | null | undefined) {
  const quantity = getItemQuantity(item);
  const minQuantity = Math.max(getItemMinQuantity(item), 1);
  return Math.max(minQuantity * 2 - quantity, 1);
}

export type SupplyRequestItemUnit = 'EA' | 'BOX';
export type SupplyRequestCategory = (typeof SUPPLY_REQUEST_CATEGORY_OPTIONS)[number];

export function normalizeInventoryUnit(value: unknown): SupplyRequestItemUnit {
  return String(value || '').trim().toUpperCase() === 'BOX' ? 'BOX' : 'EA';
}

const CATEGORY_ALIAS_MAP: Record<string, SupplyRequestCategory> = {
  약품: '의약품',
  의료기기: '의료용품',
  소모품: '사무용품',
};

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
      purpose: String(item?.purpose || item?.reason || '').trim(),
    }))
    .filter((item) => item.name);
}
