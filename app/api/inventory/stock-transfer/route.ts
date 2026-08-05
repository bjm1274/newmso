// ============================================================
// app/api/inventory/stock-transfer/route.ts
// 두 inventory item 간 원자적 이관 (D1 batch 단일 트랜잭션)
//
// 권한: 로그인 사용자
// 동작: D1 binding으로 다음을 단일 batch(all-or-nothing)로 처리.
//       1) 출발지 차감
//       2) 목적지 증가(기존) 또는 신규 품목 생성(미존재)
//       3) inventory_transfers 이력 기록
//       4) inventory_logs 이관출고/이관입고 기록
//       (Supabase 컷오버 완료 — D1이 유일한 진실원)
//
// 기존 atomicStockTransfer는 "목적지 기존 품목 필수(DEST_NOT_FOUND)"라
// '목적지 신규 생성' 흐름과 충돌했음. 이 라우트는 신규 생성까지 한 배치에
// 포함해 중간 실패로 인한 재고 증발을 제거한다.
// 수량 계산 의미(quantity == stock, NULL→fallback→0)와 로그 컬럼 형식은
// lib/db/functions/inventory.ts(atomicStockTransfer/atomicStockConsumeWithLog)와
// 동일하게 유지한다.
// ============================================================
import { NextResponse } from 'next/server';
import { userId } from '@/lib/d1-api-helpers';
import { z } from 'zod';
import { eq, inArray, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { readSessionFromRequest, type SessionUser } from '@/lib/server-session';
import { StockError, getD1Binding, getD1Drizzle } from '@/lib/db';
import { inventory, inventory_logs, inventory_transfers } from '@/lib/db/schema';
import { assertInventoryCompanyScope, assertInventoryItemCompanyScope } from '@/lib/inventory-scope-guard';
import { inventoryErrorResponse } from '@/lib/inventory-http-errors';

export const dynamic = 'force-dynamic';

// 신규 목적지 품목 생성 시 복사할 필드(출발지 기준).
const NewDestSchema = z.object({
  item_name: z.string().min(1),
  category: z.string().nullable().optional(),
  min_quantity: z.number().int().nullable().optional(),
  unit_price: z.number().nullable().optional(),
  expiry_date: z.string().nullable().optional(),
  lot_number: z.string().nullable().optional(),
  serial_number: z.string().nullable().optional(),
  is_udi: z.boolean().optional(),
  company: z.string().min(1),
  company_id: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  spec: z.string().nullable().optional(),
  insurance_code: z.string().nullable().optional(),
  udi_code: z.string().nullable().optional(),
  supplier_name: z.string().nullable().optional(),
  supplier: z.string().nullable().optional() });

// 이력/로그용 메타.
const MetaSchema = z.object({
  item_name: z.string().nullable().optional(),
  from_company: z.string().nullable().optional(),
  from_department: z.string().nullable().optional(),
  to_company: z.string().nullable().optional(),
  to_department: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  serial_number: z.string().nullable().optional(),
  source_notes: z.string().nullable().optional(),
  dest_notes: z.string().nullable().optional() });

const PayloadSchema = z
  .object({
    sourceId: z.string().min(1),
    // 기존 목적지가 있으면 destId, 없으면 newDest(신규 생성).
    destId: z.string().min(1).nullable().optional(),
    newDest: NewDestSchema.nullable().optional(),
    quantity: z.number().int().positive(),
    meta: MetaSchema.optional() })
  .refine((v) => Boolean(v.destId) !== Boolean(v.newDest), {
    message: 'destId 또는 newDest 중 정확히 하나만 지정해야 합니다.' });

type Payload = z.infer<typeof PayloadSchema>;

function actorName(user: SessionUser | null | undefined): string {
  if (!user) return '알 수 없음';
  return user.department ? `${user.name} (${user.department})` : (user.name ?? '알 수 없음');
}

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    const user = session?.user;
    if (!user || !userId(user)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => null);
    const parsed = PayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const payload: Payload = parsed.data;

    const d1 = await getD1Binding();
    if (!d1) throw new Error('[stock-transfer] D1 binding not available');
    const db = getD1Drizzle(d1);

    const sourceScope = await assertInventoryItemCompanyScope(d1, user, payload.sourceId);
    if (!sourceScope.ok) return sourceScope.response;
    if (payload.destId) {
      const destinationScope = await assertInventoryItemCompanyScope(d1, user, payload.destId);
      if (!destinationScope.ok) return destinationScope.response;
    } else if (payload.newDest) {
      const destinationScope = assertInventoryCompanyScope(user, payload.newDest);
      if (!destinationScope.ok) return destinationScope.response;
    }

    const result = await executeTransfer(db, payload, user);
    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    // 매핑은 lib/inventory-http-errors 로 통합 (D07-016). 여기에만 있던 statusMap 은
    // STOCK_CONFLICT 를 몰라 경합을 500 으로 내보냈고, 클라이언트가 재시도 안내를 못 띄웠다.
    return inventoryErrorResponse(err);
  }
}

type DbClient = ReturnType<typeof getD1Drizzle>;

interface TransferOutcome {
  src_prev: number;
  src_next: number;
  dst_prev: number;
  dst_next: number;
  destId: string;
  destCreated: boolean;
}

/**
 * 출발지 차감 + 목적지 증가/생성 + 이력 + 로그를 단일 D1 batch로 처리.
 * D1 batch는 단일 트랜잭션(all-or-nothing)이라 모두 함께 커밋되거나 롤백된다.
 *
 * 왜 증분식(CAS)인가 — 예전에는 현재 수량을 SELECT 한 뒤 `set({quantity: srcNext})` 처럼
 * **읽은 값에서 계산한 절대값**으로 덮어썼고 WHERE 절은 `id` 뿐이었다. D1 batch 는 묶인
 * 쓰기의 원자성만 보장할 뿐 선행 SELECT 와의 격리는 주지 않으므로, 읽기~쓰기 사이에 다른
 * 이관/전표가 끼어들면 그 변경분이 통째로 덮여 사라졌다.
 * 8차 D07-007 실측: 같은 품목에 수량 1 이관 8건을 동시 요청 → 8건 모두 200 인데
 * 출발지는 100→99, 목적지는 0→1 로 7개가 증발했다(이관 이력·로그는 8건 생성).
 * 그래서 절대값 대입을 `COALESCE(quantity,stock,0) ± 수량` 증분식으로 바꾸고,
 * 재고 부족은 batch 선두의 가드 문장이 제약 위반을 일으켜 batch 전체를 롤백시키게 했다.
 */
async function executeTransfer(
  db: DbClient,
  payload: Payload,
  user: SessionUser | null | undefined,
): Promise<TransferOutcome> {
  const { sourceId, destId, newDest, quantity, meta } = payload;
  const qtyExpr = sql<number>`COALESCE(${inventory.quantity}, ${inventory.stock}, 0)`;

  // 출발지(그리고 기존 목적지) 현재 수량 조회.
  const idsToRead = destId ? [sourceId, destId] : [sourceId];
  const rows = await db
    .select({ id: inventory.id, prev: qtyExpr })
    .from(inventory)
    .where(inArray(inventory.id, idsToRead));

  const srcRow = rows.find((r) => r.id === sourceId);
  if (!srcRow) throw new StockError('SOURCE_NOT_FOUND');
  const srcPrev = Number(srcRow.prev ?? 0);
  if (srcPrev - quantity < 0) {
    throw new StockError('INSUFFICIENT_STOCK', `INSUFFICIENT_STOCK: prev=${srcPrev}, qty=${quantity}`);
  }
  const srcNext = srcPrev - quantity;

  // 목적지 결정: 기존이면 prev 합산, 신규면 0에서 시작.
  let resolvedDestId: string;
  let dstPrev: number;
  const destCreated = !destId;

  const ops: BatchItem<'sqlite'>[] = [
    // 재고 부족 가드. SQLite 에는 트리거 밖 RAISE 가 없으므로, 조건이 깨진 경우에만
    // NOT NULL 인 item_name 에 NULL 을 쓰려 시도해 제약 위반으로 batch 전체를 롤백시킨다.
    // 충분한 경우 WHERE 가 0행이라 아무것도 건드리지 않는다.
    db
      .update(inventory)
      .set({ item_name: sql`NULL` })
      .where(
        sql`${inventory.id} = ${sourceId} AND COALESCE(${inventory.quantity}, ${inventory.stock}, 0) < ${quantity}`,
      ),
    db
      .update(inventory)
      .set({
        quantity: sql`COALESCE(${inventory.quantity}, ${inventory.stock}, 0) - ${quantity}`,
        stock: sql`COALESCE(${inventory.quantity}, ${inventory.stock}, 0) - ${quantity}`,
      })
      .where(eq(inventory.id, sourceId)),
  ];

  if (destId) {
    const dstRow = rows.find((r) => r.id === destId);
    if (!dstRow) throw new StockError('DEST_NOT_FOUND');
    resolvedDestId = destId;
    dstPrev = Number(dstRow.prev ?? 0);
    ops.push(
      db
        .update(inventory)
        .set({
          quantity: sql`COALESCE(${inventory.quantity}, ${inventory.stock}, 0) + ${quantity}`,
          stock: sql`COALESCE(${inventory.quantity}, ${inventory.stock}, 0) + ${quantity}`,
        })
        .where(eq(inventory.id, destId)),
    );
  } else {
    // 신규 목적지 품목 생성 — 출발지에서 복사한 필드 + 이관 수량.
    const nd = newDest!;
    resolvedDestId = crypto.randomUUID();
    dstPrev = 0;
    // sync_inventory_name_stock 의미 보존: name = COALESCE(name, item_name),
    // stock = quantity (둘 다 quantity로 통일).
    ops.push(
      db.insert(inventory).values({
        id: resolvedDestId,
        item_name: nd.item_name,
        name: nd.item_name,
        category: nd.category ?? null,
        quantity: quantity,
        stock: quantity,
        min_quantity: nd.min_quantity ?? 0,
        unit_price: nd.unit_price ?? 0,
        expiry_date: nd.expiry_date ?? null,
        lot_number: nd.lot_number ?? null,
        serial_number: nd.serial_number ?? null,
        is_udi: nd.is_udi ? 1 : 0,
        company: nd.company,
        company_id: nd.company_id ?? null,
        department: nd.department ?? '',
        location: nd.location ?? null,
        spec: nd.spec ?? null,
        insurance_code: nd.insurance_code ?? null,
        udi_code: nd.udi_code ?? null,
        supplier_name: nd.supplier_name ?? null,
        supplier: nd.supplier ?? null }),
    );
  }

  const dstNext = dstPrev + quantity;

  // 이관 이력 1건.
  ops.push(
    db.insert(inventory_transfers).values({
      id: crypto.randomUUID(),
      item_id: sourceId,
      item_name: meta?.item_name ?? newDest?.item_name ?? null,
      quantity,
      from_company: meta?.from_company ?? null,
      from_department: meta?.from_department ?? null,
      to_company: meta?.to_company ?? newDest?.company ?? null,
      to_department: meta?.to_department ?? newDest?.department ?? null,
      reason: meta?.reason ?? null,
      serial_number: meta?.serial_number ?? null,
      transferred_by: user?.name ?? null,
      transferred_by_id: userId(user),
      status: '완료' }),
  );

  // 이관출고 로그(출발지).
  // prev/next 를 선행 SELECT 값이 아니라 batch 안에서 다시 읽는 이유: 위 UPDATE 가 이미
  // 실행된 시점이므로 현재 수량이 곧 next 이고, 여기에 이관 수량을 더하면 실제 prev 가 된다.
  // 예전처럼 읽기 시점 값을 그대로 박으면 동시 이관 시 로그의 prev/next 가 실수량과 어긋났다.
  ops.push(
    db.insert(inventory_logs).values({
      id: crypto.randomUUID(),
      item_id: sourceId,
      inventory_id: sourceId,
      type: '이관',
      change_type: '이관출고',
      quantity,
      prev_quantity: sql`(SELECT COALESCE(${inventory.quantity}, ${inventory.stock}, 0) FROM ${inventory} WHERE ${inventory.id} = ${sourceId}) + ${quantity}`,
      next_quantity: sql`(SELECT COALESCE(${inventory.quantity}, ${inventory.stock}, 0) FROM ${inventory} WHERE ${inventory.id} = ${sourceId})`,
      serial_number: meta?.serial_number ?? null,
      actor_name: actorName(user),
      company: meta?.from_company ?? null,
      notes: meta?.source_notes ?? null }),
  );

  // 이관입고 로그(목적지).
  ops.push(
    db.insert(inventory_logs).values({
      id: crypto.randomUUID(),
      item_id: resolvedDestId,
      inventory_id: resolvedDestId,
      type: '이관',
      change_type: '이관입고',
      quantity,
      prev_quantity: sql`(SELECT COALESCE(${inventory.quantity}, ${inventory.stock}, 0) FROM ${inventory} WHERE ${inventory.id} = ${resolvedDestId}) - ${quantity}`,
      next_quantity: sql`(SELECT COALESCE(${inventory.quantity}, ${inventory.stock}, 0) FROM ${inventory} WHERE ${inventory.id} = ${resolvedDestId})`,
      serial_number: meta?.serial_number ?? null,
      actor_name: actorName(user),
      company: meta?.to_company ?? newDest?.company ?? null,
      notes: meta?.dest_notes ?? null }),
  );

  try {
    await db.batch(ops as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  } catch (err) {
    // 위 가드가 걸리면 NOT NULL 제약 위반으로 올라온다 — 경합으로 재고가 모자라진 경우다.
    const message = err instanceof Error ? err.message : String(err);
    if (/NOT NULL/i.test(message) && /item_name/i.test(message)) {
      // inventory-http-errors 는 이 접두어로 409 + code:'STOCK_CONFLICT' 를 만든다.
      throw new Error(
        `STOCK_CONFLICT: 재고가 다른 요청에 의해 변경되어 이관할 수량이 부족합니다. qty=${quantity}`,
      );
    }
    throw err;
  }

  // 실제 커밋된 수량을 다시 읽어 응답한다. 선행 SELECT 값은 동시 요청이 있으면 이미 낡았다.
  const finalRows = await db
    .select({ id: inventory.id, qty: qtyExpr })
    .from(inventory)
    .where(inArray(inventory.id, [sourceId, resolvedDestId]));
  const srcFinal = Number(finalRows.find((r) => r.id === sourceId)?.qty ?? srcNext);
  const dstFinal = Number(finalRows.find((r) => r.id === resolvedDestId)?.qty ?? dstNext);

  return {
    src_prev: srcFinal + quantity,
    src_next: srcFinal,
    dst_prev: dstFinal - quantity,
    dst_next: dstFinal,
    destId: resolvedDestId,
    destCreated };
}
