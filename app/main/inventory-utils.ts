import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { withMissingColumnFallback, withMissingColumnsFallback } from '@/lib/supabase-compat';

export const INVENTORY_SUPPORT_COMPANY = 'SY INC.';
export const INVENTORY_SUPPORT_DEPARTMENT = '경영지원팀';

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

function normalizeInventoryText(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
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

export type SupplyRequestWorkflowItem = {
  request_index: number;
  name: string;
  qty: number;
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

export function normalizeSupplyRequestItems(rawItems: any[] = []) {
  return rawItems
    .map((item) => ({
      name: String(item?.name || item?.item_name || '').trim(),
      qty: Math.max(1, Number(item?.qty) || 1),
      dept: String(item?.dept || item?.department || '').trim(),
      purpose: String(item?.purpose || '').trim(),
    }))
    .filter((item) => item.name);
}

export function findSupplySourceInventoryItem(
  inventoryRows: any[] = [],
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
  rawItems: any[] = [],
  inventoryRows: any[] = [],
  previousWorkflowItems: any[] = [],
) {
  const previousByIndex = new Map<number, any>();
  previousWorkflowItems.forEach((item: any) => {
    const requestIndex = Number(item?.request_index);
    if (Number.isInteger(requestIndex) && requestIndex >= 0) {
      previousByIndex.set(requestIndex, item);
    }
  });

  return normalizeSupplyRequestItems(rawItems).map((item, index) => {
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

export function resolveInventoryDepartment(item: any) {
  const department = String(item?.department || '').trim();
  if (department) {
    return department;
  }

  return normalizeInventoryText(item?.company) === normalizeInventoryText(INVENTORY_SUPPORT_COMPANY)
    ? INVENTORY_SUPPORT_DEPARTMENT
    : '';
}

export function normalizeSupportInventoryRows(rows: any[] = []) {
  return rows.map((row) => {
    const department = resolveInventoryDepartment(row);
    return department === row?.department ? row : { ...row, department };
  });
}

export async function fetchSupportInventoryRows(client: SupabaseClient = supabase) {
  const result = await withMissingColumnFallback<Record<string, any>[]>(
    () =>
      client
        .from('inventory')
        .select('*')
        .eq('company', INVENTORY_SUPPORT_COMPANY)
        .eq('department', INVENTORY_SUPPORT_DEPARTMENT),
    () =>
      client
        .from('inventory')
        .select('*')
        .eq('company', INVENTORY_SUPPORT_COMPANY),
    'department',
  );

  return {
    data: normalizeSupportInventoryRows(result.data || []),
    error: result.error,
  };
}

function findDestinationInventoryItem(
  inventoryRows: any[],
  selectedItem: any,
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
  sourceItem: any;
  inventoryRows?: any[];
  quantity: number;
  toCompany: string;
  toDept: string;
  reason?: string;
  user: any;
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
  destinationCompanyId,
}: ProcessInventoryIssueParams) {
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
      const { data: remoteRows } = await supabase
        .from('inventory')
        .select('id, item_name, name, quantity, stock, company, department, category, spec, min_quantity, min_stock')
        .eq('company', destinationCompany)
        .eq('item_name', getItemName(sourceItem));

      destinationItem = findDestinationInventoryItem(remoteRows || [], sourceItem, destinationCompany, destinationDept);
    }

    if (destinationItem) {
      // 원자적 이관 RPC 시도 (출발지 차감 + 목적지 증가를 단일 트랜잭션으로)
      const { data: transferResult, error: transferRpcError } = await supabase.rpc('atomic_stock_transfer', {
        p_source_id: sourceItem.id,
        p_dest_id: destinationItem.id,
        p_quantity: transferQuantity,
      });

      if (transferRpcError) {
        if (String(transferRpcError.message).includes('INSUFFICIENT_STOCK')) {
          throw new Error('INSUFFICIENT_STOCK');
        }
        // RPC 미등록 시 fallback (순차 업데이트)
        const { error: sourceUpdateError } = await supabase
          .from('inventory')
          .update({ quantity: sourceNextQty, stock: sourceNextQty })
          .eq('id', sourceItem.id);
        if (sourceUpdateError) throw sourceUpdateError;

        destinationPrevQty = getItemQuantity(destinationItem);
        destinationNextQty = destinationPrevQty + transferQuantity;

        const { error: destinationUpdateError } = await supabase
          .from('inventory')
          .update({ quantity: destinationNextQty, stock: destinationNextQty })
          .eq('id', destinationItem.id);

        if (destinationUpdateError) {
          // 롤백: 출발지 원상 복구
          await supabase.from('inventory')
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
          const { error: sourceUpdateError } = await supabase
            .from('inventory')
            .update({ quantity: sourceNextQty, stock: sourceNextQty })
            .eq('id', sourceItem.id);
          if (sourceUpdateError) throw sourceUpdateError;

          destinationPrevQty = getItemQuantity(destinationItem);
          destinationNextQty = destinationPrevQty + transferQuantity;

          const { error: destinationUpdateError } = await supabase
            .from('inventory')
            .update({ quantity: destinationNextQty, stock: destinationNextQty })
            .eq('id', destinationItem.id);

          if (destinationUpdateError) {
            await supabase
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
      const { data: srcResult, error: srcRpcError } = await supabase.rpc('atomic_stock_update', {
        p_item_id: sourceItem.id,
        p_delta: -transferQuantity,
        p_min_allowed: 0,
      });
      if (srcRpcError) {
        if (String(srcRpcError.message).includes('INSUFFICIENT_STOCK')) {
          throw new Error('INSUFFICIENT_STOCK');
        }
        // fallback
        const { error: sourceUpdateError } = await supabase
          .from('inventory')
          .update({ quantity: sourceNextQty, stock: sourceNextQty })
          .eq('id', sourceItem.id);
        if (sourceUpdateError) throw sourceUpdateError;
      } else {
        const row = Array.isArray(srcResult) ? srcResult[0] : srcResult;
        if (row == null || (row?.prev_qty == null && row?.next_qty == null)) {
          const { error: sourceUpdateError } = await supabase
            .from('inventory')
            .update({ quantity: sourceNextQty, stock: sourceNextQty })
            .eq('id', sourceItem.id);
          if (sourceUpdateError) throw sourceUpdateError;
        } else {
          sourcePrevQty = row?.prev_qty ?? sourceCurrentQty;
          sourceNextQty = row?.next_qty ?? sourceNextQty;
        }
      }
      const baseDestinationPayload: Record<string, any> = {
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
        location: sourceItem?.location || null,
      };

      if (sourceItem?.spec) baseDestinationPayload.spec = sourceItem.spec;
      if (sourceItem?.insurance_code) baseDestinationPayload.insurance_code = sourceItem.insurance_code;
      if (sourceItem?.udi_code) baseDestinationPayload.udi_code = sourceItem.udi_code;
      if (sourceItem?.supplier_name) baseDestinationPayload.supplier_name = sourceItem.supplier_name;
      if (sourceItem?.supplier) baseDestinationPayload.supplier = sourceItem.supplier;

      const { data: insertedDestination, error: destinationInsertError } =
        await withMissingColumnsFallback<Record<string, any>>(
          (omittedColumns) => {
            const destinationPayload: Record<string, any> = { ...baseDestinationPayload };

            if (destinationCompanyId && !omittedColumns.has('company_id')) {
              destinationPayload.company_id = destinationCompanyId;
            }

            if (omittedColumns.has('department')) {
              delete destinationPayload.department;
            }

            return supabase
              .from('inventory')
              .insert([destinationPayload])
              .select('*')
              .single();
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
    const { data: srcOnlyResult, error: srcOnlyError } = await supabase.rpc('atomic_stock_update', {
      p_item_id: sourceItem.id,
      p_delta: -transferQuantity,
      p_min_allowed: 0,
    });
    if (srcOnlyError) {
      if (String(srcOnlyError.message).includes('INSUFFICIENT_STOCK')) {
        throw new Error('INSUFFICIENT_STOCK');
      }
      // fallback
      const { error: fbErr } = await supabase.from('inventory')
        .update({ quantity: sourceNextQty, stock: sourceNextQty })
        .eq('id', sourceItem.id);
      if (fbErr) throw fbErr;
    } else {
      const row = Array.isArray(srcOnlyResult) ? srcOnlyResult[0] : srcOnlyResult;
      if (row == null || (row?.prev_qty == null && row?.next_qty == null)) {
        const { error: fbErr } = await supabase
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
    const { error: transferError } = await supabase.from('inventory_transfers').insert([
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
        status: '완료',
      },
    ]);

    if (transferError) {
      throw transferError;
    }
  }

  const logRows: any[] = [
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
      notes: sourceNotes,
    },
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
      notes: destinationNotes,
    });
  }

  const { error: logError } = await supabase.from('inventory_logs').insert(logRows);
  if (logError) {
    throw logError;
  }

  return {
    sourceNextQty,
    destinationInventoryId,
    destinationNextQty,
    isSameLocation,
  };
}

type RequestInventoryReorderParams = {
  item: any;
  user: any;
  selectedCompanyId?: string | null;
  quantity?: number;
  reason?: string;
  metaData?: Record<string, any>;
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
    () => supabase.from('approvals').insert(rows),
    () => {
      const legacyRows = rows.map(({ company_id, ...rest }: any) => rest);
      return supabase.from('approvals').insert(legacyRows);
    },
  );
}
