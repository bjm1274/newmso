// ============================================================
// lib/inventory-stock-client.ts
// 클라이언트 측 atomic_stock_update / atomic_stock_transfer RPC 래퍼.
// Phase 2.13 — supabase.rpc(...) 직접 호출을 서버 라우트로 위임.
//
// 응답 형식 (Supabase RPC의 raw data 그대로 반환)
//   stock-update    → [{ prev_qty, next_qty }] (array of 1 row)
//   stock-transfer  → [{ src_prev, src_next, dst_prev, dst_next }]
//
// 오류 정책
//   - 네트워크/HTTP 실패: { ok: false, error: string }
//   - Supabase RPC 에러: { ok: false, error: string, code?: string }
// ============================================================

export interface StockUpdateRpcRow {
  prev_qty: number;
  next_qty: number;
}

export interface StockTransferRpcRow {
  src_prev: number;
  src_next: number;
  dst_prev: number;
  dst_next: number;
}

export type StockApiResult<T> =
  | { ok: true; data: T | null }
  | { ok: false; error: string; code?: string };

async function readJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

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
    data?: StockUpdateRpcRow[] | null;
  }>(res);
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error || `HTTP ${res.status}`, code: data?.code };
  }
  return { ok: true, data: data.data ?? null };
}

export async function callAtomicStockTransfer(payload: {
  sourceId: string;
  destId: string;
  quantity: number;
}): Promise<StockApiResult<StockTransferRpcRow[]>> {
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
    data?: StockTransferRpcRow[] | null;
  }>(res);
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error || `HTTP ${res.status}`, code: data?.code };
  }
  return { ok: true, data: data.data ?? null };
}
