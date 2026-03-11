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
