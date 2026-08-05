// ============================================================
// lib/inventory-stock-client.ts
// 클라이언트 → 재고 원자 API 래퍼 (SSOT)
// ============================================================

export interface StockUpdateRpcRow {
  prev_qty: number;
  next_qty: number;
  log_id?: string;
  item_id?: string;
  type?: string;
}

export interface StockTransferRpcRow {
  src_prev: number;
  src_next: number;
  dst_prev: number;
  dst_next: number;
  destId?: string;
  destCreated?: boolean;
}

export type StockApiResult<T> =
  | { ok: true; data: T | null }
  | { ok: false; error: string; code?: string };

/** 재고 API 실패 메시지를 사용자용으로 변환 */
export function formatStockApiError(error?: string | null, code?: string | null): string {
  const msg = String(error || '');
  const c = String(code || '');
  if (c === 'INSUFFICIENT_STOCK' || msg.includes('INSUFFICIENT_STOCK')) {
    return '재고가 부족합니다. 수량을 확인한 뒤 다시 시도하세요.';
  }
  if (c === 'PERIOD_LOCKED' || msg.includes('INVENTORY_PERIOD_LOCKED')) {
    return '해당 월 재고가 마감(잠금)되어 수량을 변경할 수 없습니다. 월마감 해제 후 다시 시도하세요.';
  }
  if (c === 'STOCK_CONFLICT' || msg.includes('STOCK_CONFLICT')) {
    return '다른 요청과 재고가 충돌했습니다. 잠시 후 다시 시도하세요.';
  }
  if (c === 'ITEM_NOT_FOUND' || msg.includes('ITEM_NOT_FOUND')) {
    return '품목을 찾을 수 없습니다.';
  }
  if (c === 'OVER_RECEIVE' || msg.includes('초과 입고')) {
    return msg || '발주 잔여 수량을 초과하여 입고할 수 없습니다.';
  }
  if (c === 'EXPIRED_STOCK' || msg.includes('EXPIRED_STOCK')) {
    return '유통기한이 지난 재고는 출고/소모할 수 없습니다. 만료 품목을 확인하거나 관리자 강제 출고를 사용하세요.';
  }
  if (c === 'PO_CONFLICT') {
    return msg || '다른 요청이 같은 발주서를 처리했습니다. 목록을 새로고침한 뒤 다시 시도하세요.';
  }
  if (c === 'AMBIGUOUS_ITEM' || c === 'NO_COMPANY_SCOPE') {
    return msg || '품목을 특정할 수 없습니다. 발주 라인에서 품목을 직접 지정하세요.';
  }
  if (c === 'FORBIDDEN') {
    return '권한이 없습니다.';
  }
  return msg || '재고 처리에 실패했습니다.';
}

async function readJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function normalizeUpdateData(
  data: StockUpdateRpcRow | StockUpdateRpcRow[] | null | undefined,
): StockUpdateRpcRow | null {
  if (!data) return null;
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}

/** @deprecated 로그 없는 순수 증감 — stock-post 사용 권장 */
export async function callAtomicStockUpdate(payload: {
  itemId: string;
  delta: number;
  minAllowed?: number;
}): Promise<StockApiResult<StockUpdateRpcRow[]>> {
  const res = await fetch('/api/inventory/stock-update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'same-origin',
  });
  const data = await readJson<{
    ok?: boolean;
    error?: string;
    code?: string;
    data?: StockUpdateRpcRow | StockUpdateRpcRow[] | null;
  }>(res);
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error || `HTTP ${res.status}`, code: data?.code };
  }
  const row = normalizeUpdateData(data.data);
  return { ok: true, data: row ? [row] : null };
}

/**
 * 재고 전표 (수량 + 로그 SSOT) — 입출고/실사/기초/발주입고 공용
 */
export async function postStockMovement(payload: {
  itemId: string;
  mode?: 'delta' | 'absolute';
  delta?: number;
  absoluteQty?: number;
  type:
    | '입고'
    | '출고'
    | '소모'
    | '반품'
    | '조정'
    | '실사조정'
    | '기초재고'
    | '대여'
    | '반납'
    | '발주입고';
  changeType?: string;
  notes?: string | null;
  company?: string | null;
  companyId?: string | null;
  department?: string | null;
  location?: string | null;
  lotNumber?: string | null;
  expiryDate?: string | null;
  unitPrice?: number | null;
  supplierName?: string | null;
  purchaseOrderId?: string | null;
  approvalId?: string | null;
  applyMovingAverage?: boolean;
  /** 아래 3개는 관리자 강제 옵션 — 비관리자가 보내면 서버가 403 으로 거부한다 (D07-002) */
  skipClosingCheck?: boolean;
  skipExpiryCheck?: boolean;
  minAllowed?: number;
}): Promise<StockApiResult<StockUpdateRpcRow>> {
  const res = await fetch('/api/inventory/stock-post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'delta', ...payload }),
    credentials: 'same-origin',
  });
  const data = await readJson<{
    ok?: boolean;
    error?: string;
    code?: string;
    data?: StockUpdateRpcRow | null;
  }>(res);
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error || `HTTP ${res.status}`, code: data?.code };
  }
  return { ok: true, data: data.data ?? null };
}

export async function callAtomicStockTransfer(payload: {
  sourceId: string;
  destId?: string | null;
  newDest?: Record<string, unknown> | null;
  quantity: number;
  meta?: Record<string, unknown>;
}): Promise<StockApiResult<StockTransferRpcRow>> {
  const res = await fetch('/api/inventory/stock-transfer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'same-origin',
  });
  const data = await readJson<{
    ok?: boolean;
    error?: string;
    code?: string;
    data?: StockTransferRpcRow | StockTransferRpcRow[] | null;
  }>(res);
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error || `HTTP ${res.status}`, code: data?.code };
  }
  const raw = data.data;
  const row = Array.isArray(raw) ? raw[0] : raw;
  return { ok: true, data: row ?? null };
}

export async function callAtomicStockConsume(payload: {
  itemId: string;
  amount: number;
  notes?: string | null;
  company?: string | null;
  department?: string | null;
}): Promise<StockApiResult<StockUpdateRpcRow>> {
  return postStockMovement({
    itemId: payload.itemId,
    mode: 'delta',
    delta: -Math.abs(payload.amount),
    type: '소모',
    notes: payload.notes,
    company: payload.company,
    department: payload.department,
  });
}

/** 발주 입고(GRN) */
export async function receivePurchaseOrder(payload: {
  purchaseOrderId: string;
  lines: Array<{
    itemName: string;
    qty: number;
    unitPrice?: number;
    inventoryItemId?: string;
    lotNumber?: string;
    expiryDate?: string;
  }>;
}): Promise<
  StockApiResult<{
    received: Array<{
      itemName: string;
      itemId: string;
      nextQty: number;
      lineReceived?: number;
      lineOrdered?: number;
      remaining?: number;
    }>;
    totalReceivedQty?: number;
    totalOrderedQty?: number;
    allComplete?: boolean;
    status?: string;
  }>
> {
  const res = await fetch('/api/inventory/po-receive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'same-origin',
  });
  const data = await readJson<{
    ok?: boolean;
    error?: string;
    code?: string;
    data?: {
      received: Array<{
        itemName: string;
        itemId: string;
        nextQty: number;
        lineReceived?: number;
        lineOrdered?: number;
        remaining?: number;
      }>;
      totalReceivedQty?: number;
      totalOrderedQty?: number;
      allComplete?: boolean;
      status?: string;
    };
  }>(res);
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error || `HTTP ${res.status}`, code: data?.code };
  }
  return { ok: true, data: data.data ?? null };
}

/** 발주 입고 검수 (합격/불합격). 불합격 시 기본으로 입고분 반품 처리 */
export async function inspectPurchaseOrder(payload: {
  purchaseOrderId: string;
  result: '합격' | '불합격';
  reverseOnFail?: boolean;
  notes?: string | null;
}): Promise<
  StockApiResult<{
    purchaseOrderId: string;
    inspection_status: string;
    alreadySet?: boolean;
    reversed?: Array<{ itemName: string; itemId: string; qty: number; nextQty: number }>;
    reverseErrors?: Array<{ itemName: string; error: string; code?: string }>;
    /** 실패한 반품이 남아 재검수 재실행으로 잔여분을 반품할 수 있는 상태 */
    retryable?: boolean;
    totalRejected?: number;
    totalReceivedQty?: number;
  }>
> {
  const res = await fetch('/api/inventory/po-inspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'same-origin',
  });
  const data = await readJson<{
    ok?: boolean;
    error?: string;
    code?: string;
    data?: {
      purchaseOrderId: string;
      inspection_status: string;
      alreadySet?: boolean;
      reversed?: Array<{ itemName: string; itemId: string; qty: number; nextQty: number }>;
      reverseErrors?: Array<{ itemName: string; error: string; code?: string }>;
      totalRejected?: number;
      totalReceivedQty?: number;
    };
  }>(res);
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error || `HTTP ${res.status}`, code: data?.code };
  }
  return { ok: true, data: data.data ?? null };
}

/** 재고 월마감 잠금/해제 */
export async function setInventoryClosing(payload: {
  action: 'lock' | 'unlock' | 'advance_step' | 'reset_steps';
  company?: string;
  closingMonth?: string;
  step?: number;
}): Promise<
  StockApiResult<{
    action: string;
    company: string;
    closingMonth: string;
    locked: boolean;
    status: string;
    steps_done?: number;
    item_count?: number;
    total_quantity?: number;
    total_value?: number;
    message?: string;
  }>
> {
  const res = await fetch('/api/inventory/closing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'same-origin',
  });
  const data = await readJson<{
    ok?: boolean;
    error?: string;
    code?: string;
    data?: {
      action: string;
      company: string;
      closingMonth: string;
      locked: boolean;
      status: string;
      steps_done?: number;
      item_count?: number;
      total_quantity?: number;
      total_value?: number;
      message?: string;
    };
  }>(res);
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error || `HTTP ${res.status}`, code: data?.code };
  }
  return { ok: true, data: data.data ?? null };
}
