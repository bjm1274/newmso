/**
 * 재고 전표 엔진 (SSOT)
 *
 * 모든 수량 변동은 이 서비스를 통해야 한다.
 * - inventory.quantity 와 inventory.stock 동시 갱신
 * - inventory_logs 에 prev/next 포함 이력
 * - 출고 시 재고 부족 가드
 * - 선택: 원가 이동평균, 가격 이력, 월마감 잠금
 */

import { eq, sql, and, ne } from 'drizzle-orm';
import type { D1Client } from '@/lib/db/client-d1';
import {
  inventory,
  inventory_logs,
  inventory_cost_entries,
  inventory_price_history,
  inventory_closing_snapshots,
  inventory_receipts,
} from '@/lib/db/schema';
import { StockError, syncInventoryNameStock } from '@/lib/db/functions/inventory';
import { getKoreanMonthString, formatKoreanDateKey } from '@/lib/seoul-time';

export type StockPostMode = 'delta' | 'absolute';

export type StockMovementType =
  | '입고'
  | '출고'
  | '소모'
  | '반품'
  | '조정'
  | '실사조정'
  | '기초재고'
  | '대여'
  | '반납'
  | '발주입고'
  | '이관출고'
  | '이관입고';

/** 출고·소모 등 재고 감소(outbound) 유형 — 유통기한/FEFO 검사 대상 */
const OUTBOUND_EXPIRY_TYPES: ReadonlySet<StockMovementType> = new Set([
  '출고',
  '소모',
  '대여',
  '이관출고',
]);

/** 행의 유효 유통기한 문자열(YYYY-MM-DD 우선) */
function resolveItemExpiryDate(row: {
  expiry_date?: string | null;
  expiration_date?: string | null;
}): string | null {
  const raw = String(row.expiry_date || row.expiration_date || '').trim();
  if (!raw) return null;
  const key = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

export type PostMovementInput = {
  itemId: string;
  mode: StockPostMode;
  /** delta 모드: 양수=증가, 음수=감소 */
  delta?: number;
  /** absolute 모드: 목표 수량 */
  absoluteQty?: number;
  type: StockMovementType;
  changeType?: string;
  actorName?: string | null;
  actorId?: string | null;
  company?: string | null;
  companyId?: string | null;
  department?: string | null;
  notes?: string | null;
  location?: string | null;
  lotNumber?: string | null;
  expiryDate?: string | null;
  serialNumber?: string | null;
  unitPrice?: number | null;
  supplierName?: string | null;
  purchaseOrderId?: string | null;
  approvalId?: string | null;
  /** 출고 시 최소 허용 재고 (기본 0) */
  minAllowed?: number;
  /** 입고 시 이동평균 원가 반영 */
  applyMovingAverage?: boolean;
  /** 월마감 잠금 검사 스킵 (관리자 강제) */
  skipClosingCheck?: boolean;
  /** 유통기한 경과 재고 출고 허용 (관리자 강제) */
  skipExpiryCheck?: boolean;
  idempotencyKey?: string | null;
};

export type PostMovementResult = {
  itemId: string;
  prevQty: number;
  nextQty: number;
  logId: string;
  type: StockMovementType;
  unitPrice?: number | null;
};

function resolveDelta(input: PostMovementInput, currentQty: number): number {
  if (input.mode === 'absolute') {
    if (input.absoluteQty == null || !Number.isFinite(Number(input.absoluteQty))) {
      throw new Error('absoluteQty is required for absolute mode');
    }
    return Math.trunc(Number(input.absoluteQty)) - currentQty;
  }
  if (input.delta == null || !Number.isFinite(Number(input.delta))) {
    throw new Error('delta is required for delta mode');
  }
  return Math.trunc(Number(input.delta));
}

async function assertNotClosedMonth(
  db: D1Client,
  company: string | null | undefined,
  skip?: boolean,
): Promise<void> {
  if (skip) return;
  const month = getKoreanMonthString();
  const companyName = String(company || '').trim();
  if (!companyName) return;

  const rows = await db
    .select({ id: inventory_closing_snapshots.id, status: inventory_closing_snapshots.status })
    .from(inventory_closing_snapshots)
    .where(
      and(
        eq(inventory_closing_snapshots.closing_month, month),
        eq(inventory_closing_snapshots.company, companyName),
      ),
    )
    .limit(1);

  const status = String(rows[0]?.status || '').toLowerCase();
  if (rows[0] && (status === 'locked' || status === 'closed' || status === '마감')) {
    throw new Error(`INVENTORY_PERIOD_LOCKED: ${companyName} ${month} 재고 월마감 상태입니다.`);
  }
}

/**
 * 재고 전표 1건 처리 (수량 갱신 + 로그).
 */
export async function postInventoryMovement(
  db: D1Client,
  input: PostMovementInput,
): Promise<PostMovementResult> {
  const itemId = String(input.itemId || '').trim();
  if (!itemId) throw new StockError('ITEM_NOT_FOUND', 'itemId required');

  const found = await db
    .select({
      id: inventory.id,
      quantity: inventory.quantity,
      stock: inventory.stock,
      unit_price: inventory.unit_price,
      price: inventory.price,
      company: inventory.company,
      company_id: inventory.company_id,
      department: inventory.department,
      item_name: inventory.item_name,
      name: inventory.name,
      expiry_date: inventory.expiry_date,
      expiration_date: inventory.expiration_date,
      lot_number: inventory.lot_number,
    })
    .from(inventory)
    .where(eq(inventory.id, itemId))
    .limit(1);

  if (found.length === 0) throw new StockError('ITEM_NOT_FOUND');

  const row = found[0];
  const prevQty = Number(row.quantity ?? row.stock ?? 0) || 0;
  const delta = resolveDelta(input, prevQty);
  const nextQty = prevQty + delta;
  const minAllowed = input.minAllowed ?? 0;

  if (nextQty < minAllowed) {
    throw new StockError(
      'INSUFFICIENT_STOCK',
      `INSUFFICIENT_STOCK: prev=${prevQty}, delta=${delta}, next=${nextQty}`,
    );
  }

  const company = input.company ?? row.company ?? null;
  await assertNotClosedMonth(db, company, input.skipClosingCheck);

  // FEFO / 유통기한: 출고·소모 계열에서 경과 재고 사용 차단 (skipExpiryCheck 로 우회)
  let fefoNote: string | null = null;
  if (delta < 0 && OUTBOUND_EXPIRY_TYPES.has(input.type) && !input.skipExpiryCheck) {
    const itemExpiry = resolveItemExpiryDate(row);
    const today = formatKoreanDateKey(new Date());
    if (itemExpiry && itemExpiry < today) {
      throw new StockError(
        'EXPIRED_STOCK',
        `EXPIRED_STOCK: 유통기한(${itemExpiry})이 지난 재고는 출고/소모할 수 없습니다. itemId=${itemId}`,
      );
    }

    // 동일 품명+회사 다수 로트: 더 이른 유통기한 로트가 있으면 FEFO 안내를 notes 에 기록
    const itemName = String(row.item_name || row.name || '').trim();
    if (itemName && company) {
      const siblings = await db
        .select({
          id: inventory.id,
          expiry_date: inventory.expiry_date,
          expiration_date: inventory.expiration_date,
          lot_number: inventory.lot_number,
        })
        .from(inventory)
        .where(
          and(
            ne(inventory.id, itemId),
            eq(inventory.company, company),
            sql`LOWER(TRIM(COALESCE(${inventory.item_name}, ${inventory.name}, ''))) = ${itemName.toLowerCase()}`,
            sql`COALESCE(${inventory.quantity}, ${inventory.stock}, 0) > 0`,
          ),
        )
        .limit(50);

      let earliest: { id: string; exp: string; lot: string | null } | null = null;
      for (const s of siblings) {
        const exp = resolveItemExpiryDate(s);
        if (!exp) continue;
        if (!earliest || exp < earliest.exp) {
          earliest = {
            id: s.id,
            exp,
            lot: s.lot_number ? String(s.lot_number) : null,
          };
        }
      }
      if (earliest && itemExpiry && earliest.exp < itemExpiry) {
        fefoNote = `FEFO: 동일품 조기만료 로트 존재(exp=${earliest.exp}${earliest.lot ? `, lot=${earliest.lot}` : ''}, id=${earliest.id.slice(0, 8)}…) — 우선 소진 권장`;
      } else if (earliest && !itemExpiry) {
        fefoNote = `FEFO: 동일품 만료일 있는 로트 존재(exp=${earliest.exp}) — 우선 소진 권장`;
      }
    }
  }

  const changeType = input.changeType || input.type;
  const logId = crypto.randomUUID();
  const unitPrice =
    input.unitPrice != null && Number.isFinite(Number(input.unitPrice))
      ? Number(input.unitPrice)
      : Number(row.unit_price ?? row.price ?? 0) || null;

  const mergedNotes = [input.notes, fefoNote].filter(Boolean).join(' · ') || null;

  // 수량 갱신 + 이력 INSERT 를 하나의 D1 batch(단일 트랜잭션)로 커밋한다.
  //
  // 왜 batch 로 묶었는가 — 예전에는 CAS UPDATE 를 먼저 await 로 커밋하고 그 다음에 별도
  // await 로 inventory_logs 를 INSERT 했다. D1 은 문장 단위 자동커밋이라 로그 INSERT 가
  // 실패하면(스키마 드리프트·일시 오류) 수량은 이미 바뀐 채 500 이 나갔고, 사용자가 재시도하면
  // 같은 수량이 한 번 더 빠져 이중 전표가 됐다. 정작 구형 함수 atomicStockConsumeWithLog 는
  // 바로 그 이유로 db.batch 를 쓰고 있어서, SSOT 엔진이 구형보다 약한 보장을 갖고 있었다.
  // 8차 D07-008 실측: 로그 INSERT 만 실패시키자 HTTP 500 + 수량 100→90 + 로그 0건.
  //
  // CAS 실패(경합)는 batch 안에서 0행 UPDATE 가 되어 조용히 통과해버리므로, 선두에
  // '조건이 깨졌을 때만 NOT NULL 컬럼에 NULL 을 쓰는' 가드 문장을 두어 제약 위반으로
  // batch 전체를 롤백시킨다. SQLite 에는 트리거 밖 RAISE 가 없어 이 우회가 필요하다.
  try {
    await db.batch([
      db
        .update(inventory)
        .set({ item_name: sql`NULL` })
        .where(
          sql`${inventory.id} = ${itemId} AND COALESCE(${inventory.quantity}, ${inventory.stock}, 0) <> ${prevQty}`,
        ),
      db
        .update(inventory)
        .set({
          quantity: nextQty,
          stock: nextQty,
          last_updated: new Date().toISOString(),
        })
        .where(
          sql`${inventory.id} = ${itemId} AND COALESCE(${inventory.quantity}, ${inventory.stock}, 0) = ${prevQty}`,
        ),
      db.insert(inventory_logs).values({
        id: logId,
        item_id: itemId,
        inventory_id: itemId,
        type: input.type,
        change_type: changeType,
        quantity: Math.abs(delta),
        prev_quantity: prevQty,
        next_quantity: nextQty,
        actor_name: input.actorName ?? null,
        actor_id: input.actorId ?? null,
        company,
        company_id: input.companyId ?? row.company_id ?? null,
        department: input.department ?? row.department ?? null,
        notes: mergedNotes,
        location: input.location ?? null,
        lot_number: input.lotNumber ?? row.lot_number ?? null,
        expiry_date: input.expiryDate ?? resolveItemExpiryDate(row),
        serial_number: input.serialNumber ?? null,
        unit_price: unitPrice,
        supplier_name: input.supplierName ?? null,
        purchase_order_id: input.purchaseOrderId ?? null,
        approval_id: input.approvalId ?? null,
        created_at: new Date().toISOString(),
      }),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/NOT NULL/i.test(message) && /item_name/i.test(message)) {
      // 경합 — 재조회 후 재시도 1회 대신 명확 에러
      throw new Error('STOCK_CONFLICT: 재고가 다른 요청에 의해 변경되었습니다. 다시 시도하세요.');
    }
    throw err;
  }

  // 입고 + 단가 → 이동평균 및 가격 이력
  if (delta > 0 && input.applyMovingAverage !== false && unitPrice != null && unitPrice > 0) {
    const oldPrice = Number(row.unit_price ?? row.price ?? 0) || 0;
    const avg =
      prevQty <= 0
        ? unitPrice
        : Math.round(((oldPrice * prevQty + unitPrice * delta) / nextQty) * 100) / 100;
    await db
      .update(inventory)
      .set({ unit_price: avg, price: avg })
      .where(eq(inventory.id, itemId));

    await db.insert(inventory_price_history).values({
      id: crypto.randomUUID(),
      inventory_item_id: itemId,
      supplier_name: input.supplierName ?? null,
      unit_price: unitPrice,
      quantity: delta,
      total_amount: unitPrice * delta,
      source_type: input.type === '발주입고' ? 'purchase' : 'manual',
      recorded_at: new Date().toISOString(),
      recorded_by: input.actorId ?? null,
      purchase_order_id: input.purchaseOrderId ?? null,
      notes: input.notes ?? null,
    });

    if (input.purchaseOrderId || input.type === '발주입고') {
      const idem =
        input.idempotencyKey ||
        `cost:${itemId}:${input.purchaseOrderId || logId}:${delta}:${unitPrice}`;
      try {
        await db.insert(inventory_cost_entries).values({
          id: crypto.randomUUID(),
          purchase_order_id: input.purchaseOrderId ?? null,
          approval_id: input.approvalId ?? null,
          inventory_item_id: itemId,
          item_name: String(row.item_name || row.name || ''),
          company_id: input.companyId ?? row.company_id ?? null,
          company_name: company,
          department: input.department ?? row.department ?? null,
          supplier_name: input.supplierName ?? null,
          qty_received: delta,
          unit_price: unitPrice,
          supply_amount: unitPrice * delta,
          total_amount: unitPrice * delta,
          posted_status: 'posted',
          occurred_at: new Date().toISOString(),
          posted_at: new Date().toISOString(),
          posted_by_id: input.actorId ?? null,
          posted_by_name: input.actorName ?? null,
          idempotency_key: idem,
          notes: input.notes ?? null,
        });
      } catch {
        // unique idempotency — 무시
      }
    }

    // 입고 증빙 (선택)
    if (input.type === '입고' || input.type === '발주입고' || input.type === '기초재고') {
      try {
        await db.insert(inventory_receipts).values({
          id: crypto.randomUUID(),
          item_id: itemId,
          qty: delta,
          unit_price: unitPrice,
          receipt_date: formatKoreanDateKey(new Date()),
          receipt_type: input.type,
          lot_number: input.lotNumber ?? null,
          expiry_date: input.expiryDate ?? null,
          notes: input.notes ?? null,
          created_by: input.actorId ?? null,
        });
      } catch {
        // receipts optional
      }
    }
  }

  return {
    itemId,
    prevQty,
    nextQty,
    logId,
    type: input.type,
    unitPrice,
  };
}

/** 편의: 입고 */
export async function postStockIn(
  db: D1Client,
  itemId: string,
  qty: number,
  meta: Omit<PostMovementInput, 'itemId' | 'mode' | 'delta' | 'type'>,
) {
  return postInventoryMovement(db, {
    ...meta,
    itemId,
    mode: 'delta',
    delta: Math.abs(qty),
    type: meta.changeType === '발주입고' ? '발주입고' : '입고',
  });
}

/** 편의: 출고/소모 */
export async function postStockOut(
  db: D1Client,
  itemId: string,
  qty: number,
  meta: Omit<PostMovementInput, 'itemId' | 'mode' | 'delta' | 'type'>,
  type: StockMovementType = '출고',
) {
  return postInventoryMovement(db, {
    ...meta,
    itemId,
    mode: 'delta',
    delta: -Math.abs(qty),
    type,
    minAllowed: 0,
  });
}

/** 편의: 절대 수량 조정 (실사/기초) */
export async function postStockAbsolute(
  db: D1Client,
  itemId: string,
  absoluteQty: number,
  meta: Omit<PostMovementInput, 'itemId' | 'mode' | 'absoluteQty' | 'type'>,
  type: StockMovementType = '조정',
) {
  return postInventoryMovement(db, {
    ...meta,
    itemId,
    mode: 'absolute',
    absoluteQty: Math.max(0, Math.trunc(absoluteQty)),
    type,
  });
}

export { syncInventoryNameStock };
