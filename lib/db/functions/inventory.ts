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

import { sql } from 'drizzle-orm';
import type { D1Client } from '../client-d1';
import { inventory } from '../schema';

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
 * 단일 UPDATE ... WHERE 절에서 조건부 갱신을 수행.
 *   - 행이 없으면 ITEM_NOT_FOUND
 *   - delta 적용 후 < p_min_allowed 면 INSUFFICIENT_STOCK
 *
 * D1은 RETURNING을 지원하므로 prev/next를 한번에 받음.
 */
export async function atomicStockUpdate(
  db: D1Client,
  itemId: string,
  delta: number,
  minAllowed = 0,
): Promise<StockUpdateResult> {
  // SQLite는 statement-level transaction이라 단일 UPDATE는 원자적.
  // RETURNING 절에 prev(=quantity 갱신 전 값)를 함께 받기 위해
  // CTE 또는 표현식을 사용. drizzle-orm의 .update().set()에 RETURNING
  // 으로 next는 받을 수 있으나 prev는 별도 SELECT 필요.
  //
  // 정책: UPDATE ... SET quantity = q + d, stock = q + d
  //       WHERE id = ? AND COALESCE(quantity, stock, 0) + d >= min
  //       RETURNING (COALESCE(quantity, stock, 0)) AS prev_after,
  //                 quantity AS next
  // 단, RETURNING은 갱신 후 row를 반환하므로 prev를 별도로 받기 위해
  // CTE 형태의 raw SQL 사용.
  const rowsRaw = await db.run(sql`
    WITH src AS (
      SELECT id, COALESCE(quantity, stock, 0) AS prev
      FROM inventory
      WHERE id = ${itemId}
    ),
    upd AS (
      UPDATE inventory
      SET quantity = (SELECT prev FROM src) + ${delta},
          stock    = (SELECT prev FROM src) + ${delta}
      WHERE id = ${itemId}
        AND EXISTS (SELECT 1 FROM src)
        AND (SELECT prev FROM src) + ${delta} >= ${minAllowed}
      RETURNING quantity AS next
    )
    SELECT
      (SELECT prev FROM src)            AS prev_qty,
      (SELECT next FROM upd)            AS next_qty,
      EXISTS(SELECT 1 FROM src)         AS found,
      EXISTS(SELECT 1 FROM upd)         AS updated
  `);

  const rows = ((rowsRaw as { results?: unknown[] }).results ?? []) as Array<{
    prev_qty: number | null;
    next_qty: number | null;
    found: number;
    updated: number;
  }>;
  const row = rows[0];
  if (!row || row.found === 0) throw new StockError('ITEM_NOT_FOUND');
  const prev = row.prev_qty ?? 0;
  if (row.updated === 0) {
    throw new StockError(
      'INSUFFICIENT_STOCK',
      `INSUFFICIENT_STOCK: prev=${prev}, delta=${delta}, next=${prev + delta}`,
    );
  }
  return { prev_qty: prev, next_qty: row.next_qty ?? prev + delta };
}

/**
 * atomic_stock_transfer TS 포트.
 *
 * 두 row를 동시에 변경. SQLite는 statement-level 원자성만 보장하므로
 * batch에 단일 SQL CTE로 묶어 전체를 atomic하게 처리.
 *
 * 정책:
 *   - source 차감 후 < 0 이면 INSUFFICIENT_STOCK
 *   - source 또는 dest row가 없으면 SOURCE_NOT_FOUND / DEST_NOT_FOUND
 */
export async function atomicStockTransfer(
  db: D1Client,
  sourceId: string,
  destId: string,
  quantity: number,
): Promise<StockTransferResult> {
  const rowsRaw = await db.run(sql`
    WITH src AS (
      SELECT id, COALESCE(quantity, stock, 0) AS prev
      FROM inventory WHERE id = ${sourceId}
    ),
    dst AS (
      SELECT id, COALESCE(quantity, stock, 0) AS prev
      FROM inventory WHERE id = ${destId}
    ),
    upd_src AS (
      UPDATE inventory
      SET quantity = (SELECT prev FROM src) - ${quantity},
          stock    = (SELECT prev FROM src) - ${quantity}
      WHERE id = ${sourceId}
        AND EXISTS (SELECT 1 FROM src)
        AND EXISTS (SELECT 1 FROM dst)
        AND (SELECT prev FROM src) - ${quantity} >= 0
      RETURNING quantity AS next
    ),
    upd_dst AS (
      UPDATE inventory
      SET quantity = (SELECT prev FROM dst) + ${quantity},
          stock    = (SELECT prev FROM dst) + ${quantity}
      WHERE id = ${destId}
        AND EXISTS (SELECT 1 FROM upd_src)
      RETURNING quantity AS next
    )
    SELECT
      (SELECT prev FROM src)     AS src_prev,
      (SELECT next FROM upd_src) AS src_next,
      (SELECT prev FROM dst)     AS dst_prev,
      (SELECT next FROM upd_dst) AS dst_next,
      EXISTS(SELECT 1 FROM src)     AS src_found,
      EXISTS(SELECT 1 FROM dst)     AS dst_found,
      EXISTS(SELECT 1 FROM upd_src) AS src_updated
  `);

  const rows = ((rowsRaw as { results?: unknown[] }).results ?? []) as Array<{
    src_prev: number | null; src_next: number | null;
    dst_prev: number | null; dst_next: number | null;
    src_found: number; dst_found: number; src_updated: number;
  }>;
  const row = rows[0];
  if (!row) throw new StockError('ITEM_NOT_FOUND');
  if (row.src_found === 0) throw new StockError('SOURCE_NOT_FOUND');
  if (row.dst_found === 0) throw new StockError('DEST_NOT_FOUND');
  if (row.src_updated === 0) {
    throw new StockError(
      'INSUFFICIENT_STOCK',
      `INSUFFICIENT_STOCK: prev=${row.src_prev ?? 0}, qty=${quantity}`,
    );
  }
  return {
    src_prev: row.src_prev ?? 0,
    src_next: row.src_next ?? 0,
    dst_prev: row.dst_prev ?? 0,
    dst_next: row.dst_next ?? 0,
  };
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
