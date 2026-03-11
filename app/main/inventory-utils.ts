import { supabase } from '@/lib/supabase';
import { withMissingColumnFallback } from '@/lib/supabase-compat';

export function getItemQuantity(item: any) {
  return Number(item?.quantity ?? item?.stock ?? 0);
}

export function getItemMinQuantity(item: any) {
  return Number(item?.min_quantity ?? item?.min_stock ?? 0);
}

export function getItemName(item: any) {
  return item?.item_name || item?.name || '품목';
}

export function getItemUnitPrice(item: any) {
  return Number(item?.unit_price ?? item?.price ?? 0);
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

type InventoryTransferValidationParams = {
  item: any;
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
  fromDept,
}: InventoryTransferValidationParams) {
  if (!item) {
    return '물품을 선택하세요.';
  }

  if (!String(toCompany || '').trim()) {
    return '이관 대상 법인을 선택하세요.';
  }

  const quantityValidation = validateInventoryQuantity(quantity, {
    label: '이관 수량',
    min: 1,
    max: getItemQuantity(item),
  });

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

export function getRecommendedOrderQuantity(item: any) {
  const quantity = getItemQuantity(item);
  const minQuantity = Math.max(getItemMinQuantity(item), 1);
  return Math.max(minQuantity * 2 - quantity, 1);
}

type RequestInventoryReorderParams = {
  item: any;
  user: any;
  selectedCompanyId?: string | null;
  quantity?: number;
  reason?: string;
};

export async function requestInventoryReorder({
  item,
  user,
  selectedCompanyId,
  quantity,
  reason,
}: RequestInventoryReorderParams) {
  const itemName = getItemName(item);
  const currentStock = getItemQuantity(item);
  const minQuantity = getItemMinQuantity(item);
  const requestedQuantity = quantity ?? getRecommendedOrderQuantity(item);
  const rows: any[] = [
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
        is_auto_generated: true,
      },
    },
  ];

  if (item?.company_id || user?.company_id || selectedCompanyId) {
    rows[0].company_id =
      item?.company_id ?? (user?.company === 'SY INC.' ? selectedCompanyId : user?.company_id);
  }

  return withMissingColumnFallback(
    () => supabase.from('approvals').insert(rows),
    () => {
      const legacyRows = rows.map(({ company_id, ...rest }: any) => rest);
      return supabase.from('approvals').insert(legacyRows);
    },
  );
}
