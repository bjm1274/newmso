import type { InventoryItem } from '@/types';

type InventoryLike = InventoryItem & Record<string, unknown>;

export const ZHSUNYCO_CONFIG_STORAGE_KEY = 'erp-zhsunyco-esl-config';

// 공식 문서에는 "27개"라고 적혀 있지만, 실제 예시는 고객 매장코드를 포함해 28칸입니다.
// 실무에서는 예시 순서를 그대로 따르는 편이 안전해서 헬퍼도 그 순서를 기준으로 맞춥니다.
export const ZHSUNYCO_GOODS_SLOT_LABELS = [
  '고객 매장코드',
  '상품코드',
  '상품명',
  'UPC1 / 바코드',
  'UPC2',
  'UPC3',
  '가격1',
  '가격2',
  '가격3',
  '원산지 / 출처',
  '규격',
  '단위',
  '등급',
  '행사 시작일',
  '행사 종료일',
  'QR 코드',
  '담당자',
  '재고수량',
  '확장필드 1',
  '확장필드 2',
  '확장필드 3',
  '확장필드 4',
  '확장필드 5',
  '확장필드 6',
  '확장필드 7',
  '확장필드 8',
  '확장필드 9',
  '확장필드 10',
] as const;

export type ZhsunycoSyncConfig = {
  baseUrl: string;
  userName: string;
  password: string;
  shopCode: string;
  customerStoreCode: string;
  template: string;
  notifyRefresh: boolean;
};

export type ZhsunycoPersistedConfig = Omit<ZhsunycoSyncConfig, 'password'>;

export type ZhsunycoGoodsDraft = {
  inventoryId: string;
  goodsCode: string;
  goodsName: string;
  upc1: string;
  price1: string;
  price2: string;
  price3: string;
  origin: string;
  spec: string;
  unit: string;
  grade: string;
  qrCode: string;
  priceEmployee: string;
  inventory: string;
  supplierName: string;
  lotNumber: string;
  expiryDate: string;
  company: string;
  department: string;
  location: string;
  serialNumber: string;
  insuranceCode: string;
  udiCode: string;
  category: string;
};

export type ZhsunycoGoodsPayloadRow = {
  shopCode: string;
  template: string;
  items: string[];
};

export function getInventoryDisplayName(item: InventoryLike | null | undefined) {
  return String(item?.item_name || item?.name || '').trim() || '이름 없음';
}

function getInventoryField(item: InventoryLike | null | undefined, key: string) {
  return String(item?.[key] ?? '').trim();
}

function getInventoryNumberLike(item: InventoryLike | null | undefined, ...keys: string[]) {
  for (const key of keys) {
    const value = item?.[key];
    if (value === null || value === undefined || value === '') continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return 0;
}

function toPlainString(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeMoney(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
}

export function normalizeZhsunycoBaseUrl(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) return '';

  const withProtocol = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const parsed = new URL(withProtocol);

  parsed.search = '';
  parsed.hash = '';

  let pathname = parsed.pathname.replace(/\/+$/g, '');
  const suffixes = ['/admin/api', '/admin', '/api/hello', '/api/login', '/api'];
  for (const suffix of suffixes) {
    if (pathname.toLowerCase().endsWith(suffix)) {
      pathname = pathname.slice(0, -suffix.length);
      break;
    }
  }

  parsed.pathname = pathname || '/';

  const normalized = parsed.toString();
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

export function createZhsunycoDraftFromInventory(
  item: InventoryLike,
  priceEmployee = '',
): ZhsunycoGoodsDraft {
  const unitPrice = getInventoryNumberLike(item, 'unit_price', 'price');
  const quantity = getInventoryNumberLike(item, 'quantity', 'stock');
  const goodsCode =
    toPlainString(item?.code) ||
    toPlainString(item?.barcode) ||
    toPlainString(item?.udi_code) ||
    toPlainString(item?.id);

  const goodsName = getInventoryDisplayName(item);
  const upc1 = getInventoryField(item, 'barcode') || goodsCode;
  const spec = getInventoryField(item, 'spec');
  const unit = getInventoryField(item, 'unit');
  const supplierName = getInventoryField(item, 'supplier_name') || getInventoryField(item, 'supplier');
  const company = getInventoryField(item, 'company');
  const department = getInventoryField(item, 'department');
  const location = getInventoryField(item, 'location');
  const lotNumber = getInventoryField(item, 'lot_number');
  const expiryDate = getInventoryField(item, 'expiry_date');
  const serialNumber = getInventoryField(item, 'serial_number');
  const insuranceCode = getInventoryField(item, 'insurance_code');
  const udiCode = getInventoryField(item, 'udi_code');
  const category = getInventoryField(item, 'category');

  return {
    inventoryId: String(item?.id || ''),
    goodsCode,
    goodsName,
    upc1,
    price1: normalizeMoney(unitPrice),
    price2: '',
    price3: '',
    origin: company || supplierName,
    spec,
    unit,
    grade: category || '정상',
    qrCode: udiCode || upc1,
    priceEmployee,
    inventory: String(quantity),
    supplierName,
    lotNumber,
    expiryDate,
    company,
    department,
    location,
    serialNumber,
    insuranceCode,
    udiCode,
    category,
  };
}

export function buildZhsunycoGoodsItems(
  customerStoreCode: string,
  draft: ZhsunycoGoodsDraft,
) {
  return [
    toPlainString(customerStoreCode),
    toPlainString(draft.goodsCode),
    toPlainString(draft.goodsName),
    toPlainString(draft.upc1),
    '',
    '',
    toPlainString(draft.price1),
    toPlainString(draft.price2),
    toPlainString(draft.price3),
    toPlainString(draft.origin),
    toPlainString(draft.spec),
    toPlainString(draft.unit),
    toPlainString(draft.grade),
    '',
    '',
    toPlainString(draft.qrCode),
    toPlainString(draft.priceEmployee),
    toPlainString(draft.inventory),
    toPlainString(draft.supplierName),
    toPlainString(draft.lotNumber),
    toPlainString(draft.expiryDate),
    toPlainString(draft.company),
    toPlainString(draft.department),
    toPlainString(draft.location),
    toPlainString(draft.serialNumber),
    toPlainString(draft.insuranceCode),
    toPlainString(draft.udiCode),
    toPlainString(draft.category),
  ];
}

export function buildZhsunycoGoodsPayload(
  config: Pick<ZhsunycoSyncConfig, 'shopCode' | 'customerStoreCode' | 'template'>,
  drafts: ZhsunycoGoodsDraft[],
): ZhsunycoGoodsPayloadRow[] {
  const shopCode = toPlainString(config.shopCode);
  const customerStoreCode = toPlainString(config.customerStoreCode) || shopCode;
  const template = toPlainString(config.template);

  return drafts.map((draft) => ({
    shopCode,
    template,
    items: buildZhsunycoGoodsItems(customerStoreCode, draft),
  }));
}

export function buildZhsunycoGoodsPreview(
  customerStoreCode: string,
  draft: ZhsunycoGoodsDraft,
) {
  const values = buildZhsunycoGoodsItems(customerStoreCode, draft);

  return ZHSUNYCO_GOODS_SLOT_LABELS.map((label, index) => ({
    index: index + 1,
    label,
    value: values[index] || '',
  }));
}
