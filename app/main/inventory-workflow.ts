import { db } from '@/lib/db-client';
import { withMissingColumnFallback } from '@/lib/supabase-compat';
import {
  INVENTORY_SUPPORT_COMPANY,
  INVENTORY_SUPPORT_DEPARTMENT,
  toLooseRecordArray,
  getItemQuantity,
  getItemMinQuantity,
  getItemName,
  getItemUnitPrice,
  normalizeInventoryText,
  normalizeSupplyRequestItems,
  resolveInventoryDepartment,
  getRecommendedOrderQuantity,
  type LooseRecord,
  type InventoryLike,
  type InventoryUserLike,
  type ApprovalLike,
} from './inventory-validation';

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
        last_requested_at: null as string | null,
      };

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
        last_requested_at: item.last_requested_at,
      } satisfies SupplyRequestMonthlySuggestion;
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
      note: previousItem?.note || null,
    } satisfies SupplyRequestWorkflowItem;
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
      ordered_count: 0,
    },
  );
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
  metaData,
}: RequestInventoryReorderParams) {
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
        ...(metaData || {}),
      },
    },
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
