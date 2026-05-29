// ============================================================
// lib/db/functions/inventory.ts
// 재고 원자적 변경 RPC의 TypeScript 포트.
//
// 원본:
//   - atomic_stock_update   (FOR UPDATE 잠금 + 검증 + UPDATE)
//   - atomic_stock_transfer (출발지 차감 + 목적지 증가, 양쪽 FOR UPDATE)
//   - sync_inventory_name_stock 트리거 (BEFORE INSERT/UPDATE)
//
// D1(SQLite)은 FOR UPDATE를 지원하지 않음. D1 batch는 단일 atomic write로
// 처리되므로, "읽고 쓰는" 로직은 SQL 표현식 안에서 한번에 끝내야 함.
// quantity·stock 두 컬럼을 함께 유지하던 PG 함수의 의미를 보존:
//   - delta 적용 후에도 quantity == stock
//   - quantity가 NULL이면 stock으로 fallback, 둘 다 NULL이면 0
// ============================================================

import { sql, eq, inArray } from 'drizzle-orm';
import type { D1Client } from '../client-d1';
import { inventory, inventory_logs } from '../schema';

export interface StockUpdateResult {
  prev_qty: number;
  next_qty: number;
}

export interface StockTransferResult {
  src_prev: number;
  src_next: number;
  dst_prev: number;
  dst_next: number;
}

export class StockError extends Error {
  constructor(public readonly code:
    | 'ITEM_NOT_FOUND'
    | 'SOURCE_NOT_FOUND'
    | 'DEST_NOT_FOUND'
    | 'INSUFFICIENT_STOCK',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'StockError';
  }
}

/**
 * atomic_stock_update TS 포트.
 *
 *   - 행이 없으면 ITEM_NOT_FOUND
 *   - delta 적용 후 < minAllowed 면 INSUFFICIENT_STOCK
 *
 * SQLite는 data-modifying CTE(WITH ... AS (UPDATE ...))를 지원하지 않으므로
 * 단일 UPDATE ... RETURNING으로 원자적 처리한다. UPDATE의 SET·WHERE는 모두
 * 갱신 전 행 값 기준으로 평가되므로 prev는 next - delta로 역산한다.
 */
export async function atomicStockUpdate(
  db: D1Client,
  itemId: string,
  delta: number,
  minAllowed = 0,
): Promise<StockUpdateResult> {
  const nextExpr = sql`COALESCE(${inventory.quantity}, ${inventory.stock}, 0) + ${delta}`;
  const updated = await db
    .update(inventory)
    .set({ quantity: nextExpr, stock: nextExpr })
    .where(
      sql`${inventory.id} = ${itemId} AND COALESCE(${inventory.quantity}, ${inventory.stock}, 0) + ${delta} >= ${minAllowed}`,
    )
    .returning({ next_qty: inventory.quantity });

  if (updated.length > 0) {
    const next = Number(updated[0].next_qty ?? 0);
    return { prev_qty: next - delta, next_qty: next };
  }

  // 0행 — 행 존재 여부로 ITEM_NOT_FOUND vs INSUFFICIENT_STOCK 판별
  const found = await db
    .select({ prev: sql<number>`COALESCE(${inventory.quantity}, ${inventory.stock}, 0)` })
    .from(inventory)
    .where(eq(inventory.id, itemId));
  if (found.length === 0) throw new StockError('ITEM_NOT_FOUND');
  const prev = Number(found[0].prev ?? 0);
  throw new StockError(
    'INSUFFICIENT_STOCK',
    `INSUFFICIENT_STOCK: prev=${prev}, delta=${delta}, next=${prev + delta}`,
  );
}

/**
 * atomic_stock_transfer TS 포트.
 *
 * 정책:
 *   - source 또는 dest row가 없으면 SOURCE_NOT_FOUND / DEST_NOT_FOUND
 *   - source 차감 후 < 0 이면 INSUFFICIENT_STOCK
 *
 * SQLite는 data-modifying CTE를 지원하지 않으므로, 현재 수량을 먼저 조회해
 * 검증한 뒤 양쪽을 절대값으로 batch UPDATE한다. D1 batch는 단일 트랜잭션
 * (all-or-nothing)이라 두 UPDATE가 함께 커밋되거나 함께 롤백된다.
 */
export async function atomicStockTransfer(
  db: D1Client,
  sourceId: string,
  destId: string,
  quantity: number,
): Promise<StockTransferResult> {
  const rows = await db
    .select({
      id: inventory.id,
      prev: sql<number>`COALESCE(${inventory.quantity}, ${inventory.stock}, 0)`,
    })
    .from(inventory)
    .where(inArray(inventory.id, [sourceId, destId]));

  const srcRow = rows.find((r) => r.id === sourceId);
  const dstRow = rows.find((r) => r.id === destId);
  if (!srcRow) throw new StockError('SOURCE_NOT_FOUND');
  if (!dstRow) throw new StockError('DEST_NOT_FOUND');

  const srcPrev = Number(srcRow.prev ?? 0);
  const dstPrev = Number(dstRow.prev ?? 0);
  if (srcPrev - quantity < 0) {
    throw new StockError(
      'INSUFFICIENT_STOCK',
      `INSUFFICIENT_STOCK: prev=${srcPrev}, qty=${quantity}`,
    );
  }
  const srcNext = srcPrev - quantity;
  const dstNext = dstPrev + quantity;

  await db.batch([
    db.update(inventory).set({ quantity: srcNext, stock: srcNext }).where(eq(inventory.id, sourceId)),
    db.update(inventory).set({ quantity: dstNext, stock: dstNext }).where(eq(inventory.id, destId)),
  ]);

  return { src_prev: srcPrev, src_next: srcNext, dst_prev: dstPrev, dst_next: dstNext };
}

/**
 * sync_inventory_name_stock 트리거 대체.
 *
 * 원본은 BEFORE INSERT/UPDATE 트리거였음:
 *   NEW.name  := COALESCE(NEW.name, NEW.item_name);
 *   NEW.stock := COALESCE(NULLIF(NEW.stock,0), NEW.quantity);
 *
 * D1은 BEFORE 트리거를 사용할 수 있긴 하지만, 앱 레이어에서 INSERT/UPDATE
 * 직전에 호출하는 게 디버깅·가시성 모두 좋음. inventory 쓰기 경로에서
 * 한 번만 호출하면 됨.
 */
export function syncInventoryNameStock<T extends {
  name?: string | null;
  item_name?: string | null;
  stock?: number | null;
  quantity?: number | null;
}>(row: T): T {
  const next = { ...row };
  if (next.name === null || next.name === undefined || next.name === '') {
    next.name = next.item_name ?? null;
  }
  // NULLIF(stock, 0): stock이 null이거나 0이면 quantity로 fallback
  if (next.stock === null || next.stock === undefined || next.stock === 0) {
    next.stock = next.quantity ?? next.stock ?? null;
  }
  return next;
}

export async function atomicStockConsumeWithLog(
  db: D1Client,
  itemId: string,
  consumeAmount: number,
  logRow: {
    actor_name: string | null;
    company: string | null;
    company_id?: string | null;
    department: string | null;
    notes: string | null;
  }
): Promise<StockUpdateResult> {
  const found = await db
    .select({ prev: sql<number>`COALESCE(${inventory.quantity}, ${inventory.stock}, 0)` })
    .from(inventory)
    .where(eq(inventory.id, itemId));
  if (found.length === 0) throw new StockError('ITEM_NOT_FOUND');
  const prev = Number(found[0].prev ?? 0);
  if (prev - consumeAmount < 0) {
    throw new StockError(
      'INSUFFICIENT_STOCK',
      `INSUFFICIENT_STOCK: prev=${prev}, delta=-${consumeAmount}`
    );
  }
  const next = prev - consumeAmount;

  const logId = crypto.randomUUID();
  await db.batch([
    db
      .update(inventory)
      .set({ quantity: next, stock: next })
      .where(eq(inventory.id, itemId)),
    db
      .insert(inventory_logs)
      .values({
        id: logId,
        item_id: itemId,
        inventory_id: itemId,
        type: '소모',
        change_type: '사용',
        quantity: consumeAmount,
        prev_quantity: prev,
        next_quantity: next,
        actor_name: logRow.actor_name,
        company: logRow.company,
        company_id: logRow.company_id ?? null,
        department: logRow.department,
        notes: logRow.notes,
      })
  ]);

  return { prev_qty: prev, next_qty: next };
}

