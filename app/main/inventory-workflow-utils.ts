import {
  type InventoryLike,
  toLooseRecordArray,
  getItemQuantity,
  getItemName,
  normalizeInventoryText,
  normalizeSupplyRequestItems,
  validateInventoryQuantity,
} from './inventory-item-utils';
import {
  INVENTORY_SUPPORT_COMPANY,
  INVENTORY_SUPPORT_DEPARTMENT,
} from '@/lib/inventory-constants';

// 공용 상수 re-export: 원본은 @/lib/inventory-constants에서 관리
export { INVENTORY_SUPPORT_COMPANY, INVENTORY_SUPPORT_DEPARTMENT };

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

type ApprovalLike = Record<string, unknown> & {
  id?: string | null;
  doc_number?: string | null;
  created_at?: string | null;
  meta_data?: Record<string, unknown> | null;
};

type InventoryTransferValidationParams = {
  item: InventoryLike | null | undefined;
  quantity: string | number | null | undefined;
  toCompany?: string | null;
  fromCompany?: string | null;
  toDept?: string | null;
  fromDept?: string | null;
};

export function resolveInventoryDepartment(item: InventoryLike | null | undefined) {
  const department = String(item?.department || '').trim();
  if (department) {
    return department;
  }

  return normalizeInventoryText(item?.company) === normalizeInventoryText(INVENTORY_SUPPORT_COMPANY)
    ? INVENTORY_SUPPORT_DEPARTMENT
    : '';
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
  const previousByIndex = new Map<number, Partial<SupplyRequestWorkflowItem> & Record<string, unknown>>();
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
