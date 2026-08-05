/**
 * POST /api/inventory/po-receive
 * 발주 입고(GRN): 승인/확정 발주 라인 부분 입고 → stock-post + 라인별 received_qty 누적
 *
 * body: {
 *   purchaseOrderId: string,
 *   lines: Array<{ itemName: string, qty: number, unitPrice?: number, inventoryItemId?: string }>
 * }
 */
import { NextResponse } from 'next/server';
import { userId } from '@/lib/d1-api-helpers';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { readSessionFromRequest } from '@/lib/server-session';
import { getD1Binding, getD1Drizzle, StockError } from '@/lib/db';
import { purchase_orders } from '@/lib/db/schema';
import { postInventoryMovement } from '@/lib/inventory-movement-service';
import { assertInventoryCompanyScope, assertInventoryItemCompanyScope } from '@/lib/inventory-scope-guard';
import { resolveInventoryItemIdByName } from '@/lib/inventory-item-lookup';
import { acquirePurchaseOrderLock } from '@/lib/inventory-po-lock';
import { inventoryErrorResponse } from '@/lib/inventory-http-errors';
import {
  parsePurchaseOrderItems as parseItems,
  poLineName as lineName,
  poLineOrderedQty as lineOrderedQty,
  poLineReceivedQty as lineReceivedQty,
} from '@/lib/inventory-po-items';

export const dynamic = 'force-dynamic';

const LineSchema = z.object({
  itemName: z.string().min(1),
  qty: z.number().int().positive(),
  unitPrice: z.number().optional(),
  inventoryItemId: z.string().optional(),
  lotNumber: z.string().optional(),
  expiryDate: z.string().optional(),
});

const PayloadSchema = z.object({
  purchaseOrderId: z.string().min(1),
  lines: z.array(LineSchema).min(1),
});

function matchLineIndex(
  items: Array<Record<string, unknown>>,
  itemName: string,
  used: Set<number>,
): number {
  const key = itemName.trim().toLowerCase();
  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;
    if (lineName(items[i]).toLowerCase() === key) return i;
  }
  // 동명 라인 재사용 허용 (used 무시)
  for (let i = 0; i < items.length; i++) {
    if (lineName(items[i]).toLowerCase() === key) return i;
  }
  return -1;
}

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    const uid = userId(session?.user);
    if (!session?.user || !uid) {
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

    const d1 = await getD1Binding();
    if (!d1) throw new Error('[po-receive] D1 binding not available');
    const db = getD1Drizzle(d1);

    const poRows = await db
      .select()
      .from(purchase_orders)
      .where(eq(purchase_orders.id, parsed.data.purchaseOrderId))
      .limit(1);
    const po = poRows[0];
    if (!po) {
      return NextResponse.json({ ok: false, error: '발주를 찾을 수 없습니다.' }, { status: 404 });
    }

    const poScope = assertInventoryCompanyScope(session.user, {
      company: po.requester_company,
      department: po.requester_department,
    });
    if (!poScope.ok) return poScope.response;

    const status = String(po.status || '');
    if (status === '대기' || status === 'draft' || status === '반려') {
      return NextResponse.json(
        { ok: false, error: `입고 불가 상태: ${status}` },
        { status: 400 },
      );
    }

    const actorName = (session?.user?.name as string | undefined) || null;
    const results: Array<{
      itemName: string;
      itemId: string;
      nextQty: number;
      lineReceived: number;
      lineOrdered: number;
      remaining: number;
    }> = [];

    const poItems: Array<Record<string, unknown>> = parseItems(po.items).map((it) => ({
      ...it,
      received_qty: lineReceivedQty(it),
    }));
    const matchedUsed = new Set<number>();

    // ── 1차 패스: 쓰기 없이 라인 전부 검증·해석 ──
    // 예전에는 검증과 전표 커밋이 한 루프 안에 섞여 있었다. 라인 매칭 실패·초과 입고·
    // 품목 스코프 403 의 조기 return 이 전부 루프 안에 있어서, 뒤 라인이 걸리면
    // 앞 라인의 재고 증가만 커밋된 채 PO 는 옛 상태(received_qty 미갱신)로 남았다.
    // 사용자가 같은 요청을 재시도하면 잔여 검사가 옛 received_qty 를 보므로 앞 라인이 또 입고됐다
    // (8차 D07-003 실측: 400 응답 두 번에 재고가 50→55→60, PO received_qty 는 계속 0).
    // 이제 실패할 수 있는 검사는 전부 이 패스에서 끝내고, 그 뒤에야 첫 쓰기가 일어난다.
    const poCompany = String(po.requester_company || '').trim();
    const lookupScope = poCompany
      ? { company: poCompany, companyId: null }
      : {
          company: (session?.user?.company as string | undefined) ?? null,
          companyId: (session?.user?.company_id as string | undefined) ?? null,
        };

    type LinePlan = {
      idx: number;
      itemId: string;
      itemName: string;
      qty: number;
      unitPrice?: number;
      lotNumber?: string;
      expiryDate?: string;
    };
    const plans: LinePlan[] = [];
    /** 같은 PO 라인을 이 요청 안에서 여러 번 잡을 수 있으므로 요청 내 누적분도 잔여에서 뺀다 */
    const pendingByIdx = new Map<number, number>();

    for (const line of parsed.data.lines) {
      const idx = matchLineIndex(poItems, line.itemName, matchedUsed);
      if (idx < 0) {
        return NextResponse.json(
          { ok: false, error: `발주 라인에 없는 품목: ${line.itemName}`, code: 'PO_LINE_NOT_FOUND' },
          { status: 400 },
        );
      }
      matchedUsed.add(idx);

      const poLine = poItems[idx];
      const ordered = lineOrderedQty(poLine);
      const already = lineReceivedQty(poLine);
      const pending = pendingByIdx.get(idx) ?? 0;
      const remaining = Math.max(0, ordered - already - pending);
      if (line.qty > remaining) {
        return NextResponse.json(
          {
            ok: false,
            error: `초과 입고: ${line.itemName} (잔여 ${remaining}개, 요청 ${line.qty}개)`,
            code: 'OVER_RECEIVE',
          },
          { status: 400 },
        );
      }
      pendingByIdx.set(idx, pending + line.qty);

      let itemId = line.inventoryItemId?.trim() || '';
      if (!itemId) {
        const invId = String(poLine.item_id || poLine.inventory_id || '').trim();
        if (invId) itemId = invId;
      }
      if (!itemId) {
        const found = await resolveInventoryItemIdByName(db, line.itemName, lookupScope);
        if (!found.ok) {
          return NextResponse.json(
            { ok: false, error: found.error, code: found.code },
            { status: 400 },
          );
        }
        itemId = found.itemId;
      }

      const itemScope = await assertInventoryItemCompanyScope(d1, session.user, itemId);
      if (!itemScope.ok) return itemScope.response;

      plans.push({
        idx,
        itemId,
        itemName: line.itemName,
        qty: line.qty,
        unitPrice:
          line.unitPrice ?? (Number(poLine.unit_price ?? poLine.price ?? 0) || undefined),
        lotNumber: line.lotNumber,
        expiryDate: line.expiryDate,
      });
    }

    // ── PO 선점(낙관적 잠금) ──
    // 재고를 건드리기 전에 잡는다. 여기서 밀리면 재고는 하나도 변하지 않은 상태로 409 가 나간다.
    const lock = await acquirePurchaseOrderLock(db, parsed.data.purchaseOrderId, po.updated_at);
    if (!lock.ok) {
      return NextResponse.json({ ok: false, error: lock.error, code: lock.code }, { status: 409 });
    }

    // ── 2차 패스: 전표 커밋 ──
    // 중간에 실패해도 아래에서 '성공한 라인까지의 received_qty' 를 반드시 PO 에 기록한다.
    // 그래야 재시도가 잔여분만 입고하고, 이중 입고가 되지 않는다.
    let failure: unknown = null;
    for (const plan of plans) {
      const poLine = poItems[plan.idx];
      const ordered = lineOrderedQty(poLine);
      const already = lineReceivedQty(poLine);
      try {
        const mov = await postInventoryMovement(db, {
          itemId: plan.itemId,
          mode: 'delta',
          delta: plan.qty,
          type: '발주입고',
          changeType: '발주입고',
          notes: `PO ${parsed.data.purchaseOrderId} · ${plan.itemName} (+${plan.qty})`,
          actorId: uid,
          actorName,
          company: (session?.user?.company as string) || null,
          department: (session?.user?.department as string) || null,
          unitPrice: plan.unitPrice ?? null,
          supplierName: po.supplier_name ?? null,
          purchaseOrderId: parsed.data.purchaseOrderId,
          lotNumber: plan.lotNumber ?? null,
          expiryDate: plan.expiryDate ?? null,
          applyMovingAverage: true,
        });

        const lineReceived = already + plan.qty;
        poItems[plan.idx] = {
          ...poLine,
          received_qty: lineReceived,
          item_id: poLine.item_id || plan.itemId,
        };

        results.push({
          itemName: plan.itemName,
          itemId: plan.itemId,
          nextQty: mov.nextQty,
          lineReceived,
          lineOrdered: ordered,
          remaining: Math.max(0, ordered - lineReceived),
        });
      } catch (err) {
        failure = err;
        break;
      }
    }

    if (failure && results.length === 0) {
      // 한 라인도 커밋되지 않았다 — PO 문서는 손대지 않는다.
      // (예전 코드는 여기까지 오지도 못했지만, 상태를 '배송' 으로 바꾸는 부작용만 남기는 것을 막는다)
      return inventoryErrorResponse(failure, {
        data: { received: [], purchaseOrderId: parsed.data.purchaseOrderId },
      });
    }

    const totalReceivedQty = poItems.reduce((sum, it) => sum + lineReceivedQty(it), 0);
    const totalOrderedQty = poItems.reduce((sum, it) => sum + lineOrderedQty(it), 0);
    const allComplete =
      poItems.length > 0 &&
      poItems.every((it) => {
        const o = lineOrderedQty(it);
        return o <= 0 || lineReceivedQty(it) >= o;
      });

    const received_items = poItems.map((it) => ({
      name: lineName(it),
      ordered: lineOrderedQty(it),
      received: lineReceivedQty(it),
      remaining: Math.max(0, lineOrderedQty(it) - lineReceivedQty(it)),
      item_id: it.item_id || it.inventory_id || null,
    }));

    let nextStatus = status;
    if (allComplete) {
      nextStatus = '납품 완료';
    } else if (status === '완료' || status === '납품 완료') {
      nextStatus = status;
    } else {
      nextStatus = '배송';
    }

    const committed = await db
      .update(purchase_orders)
      .set({
        items: JSON.stringify(poItems),
        received_items: JSON.stringify(received_items),
        received_qty: totalReceivedQty,
        ...(results.length > 0
          ? {
              received_at: new Date().toISOString(),
              received_by_id: uid,
              received_by_name: actorName,
            }
          : {}),
        status: nextStatus,
        updated_at: new Date().toISOString(),
        ...(allComplete
          ? {
              completed_at: new Date().toISOString(),
              closed_at: new Date().toISOString(),
              closed_by_id: uid,
              closed_by_name: actorName,
            }
          : {}),
      })
      // 선점 구간을 닫는다 — 우리가 찍은 stamp 가 그대로일 때만 확정한다.
      .where(
        sql`${purchase_orders.id} = ${parsed.data.purchaseOrderId} AND ${purchase_orders.updated_at} = ${lock.stamp}`,
      )
      .returning({ id: purchase_orders.id });

    const partial = {
      received: results,
      purchaseOrderId: parsed.data.purchaseOrderId,
      totalReceivedQty,
      totalOrderedQty,
      allComplete,
      status: nextStatus,
      received_items,
    };

    if (committed.length === 0) {
      // 선점 이후 누군가 같은 PO 를 덮었다. 재고 전표는 이미 남았으므로 조용히 성공시키지 않는다.
      return NextResponse.json(
        {
          ok: false,
          error: `발주서 갱신이 다른 요청과 충돌했습니다. 입고 전표 ${results.length}건은 이미 반영되었으니 발주서를 새로고침해 실입고 수량을 확인하세요.`,
          code: 'PO_CONFLICT',
          data: partial,
        },
        { status: 409 },
      );
    }

    if (failure) {
      // 부분 실패 — 커밋된 라인은 PO 에 기록됐으므로 재시도는 잔여분만 입고한다.
      const note = `발주 라인 ${results.length}/${plans.length}건까지 입고 반영됨 · 남은 라인만 다시 시도하세요.`;
      const wrapped =
        failure instanceof StockError
          ? new StockError(failure.code, `${failure.message} · ${note}`)
          : new Error(
              `${failure instanceof Error ? failure.message : String(failure)} · ${note}`,
            );
      return inventoryErrorResponse(wrapped, { data: partial });
    }

    return NextResponse.json({ ok: true, data: partial });
  } catch (err) {
    // 매핑은 lib/inventory-http-errors 로 통합 (D07-016) — 예전에는 여기서
    // INSUFFICIENT_STOCK 이 아닌 StockError 를 전부 404 로, STOCK_CONFLICT 를 500 으로 내보내
    // stock-post(409)와 답이 달랐다.
    return inventoryErrorResponse(err);
  }
}
