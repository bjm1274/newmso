/**
 * POST /api/inventory/po-inspect
 * 발주 입고 검수: 합격/불합격 기록.
 * 불합격 시(기본) 입고 완료 수량만큼 반품(재고 차감) 시도 후 received_qty 원복.
 *
 * body: {
 *   purchaseOrderId: string,
 *   result: '합격' | '불합격',
 *   reverseOnFail?: boolean  // default true
 *   notes?: string
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

const PayloadSchema = z.object({
  purchaseOrderId: z.string().min(1),
  result: z.enum(['합격', '불합격']),
  reverseOnFail: z.boolean().optional().default(true),
  notes: z.string().nullable().optional(),
});

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
    if (!d1) throw new Error('[po-inspect] D1 binding not available');
    const db = getD1Drizzle(d1);

    const { purchaseOrderId, result, reverseOnFail, notes } = parsed.data;

    const poRows = await db
      .select()
      .from(purchase_orders)
      .where(eq(purchase_orders.id, purchaseOrderId))
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

    const actorName = (session?.user?.name as string | undefined) || null;
    const poItems: Array<Record<string, unknown>> = parseItems(po.items).map((it) => ({
      ...it,
      received_qty: lineReceivedQty(it),
    }));

    const wantsReverse = result === '불합격' && reverseOnFail;
    /** 아직 반품되지 않고 남은 입고분 */
    const pendingReverseQty = wantsReverse
      ? poItems.reduce((sum, it) => sum + lineReceivedQty(it), 0)
      : 0;

    const prevInspection = String(po.inspection_status || '').trim();
    // 예전에는 `prevInspection === result` 이면 무조건 조기 반환이었다.
    // 그런데 아래 루프는 개별 반품이 실패해도(재고 부족 등) inspection_status 를 무조건 확정했기 때문에,
    // 실패한 반품분은 이 조기 반환에 막혀 영원히 재시도할 수 없었다
    // (8차 D07-005 실측: 반품 5개가 INSUFFICIENT_STOCK 으로 실패했는데 응답은 ok:true·불합격 확정,
    //  재고를 채우고 다시 눌러도 alreadySet:true 만 돌아와 5개가 영구 미반품으로 남았다).
    // 이제 '불합격 + 반품 요청 + 아직 남은 입고분' 이면 재실행을 허용한다.
    // 이미 반품된 라인은 received_qty 가 0 이라 루프가 건너뛰므로 이중 차감은 생기지 않는다.
    if (prevInspection === result && pendingReverseQty <= 0) {
      return NextResponse.json({
        ok: true,
        data: {
          purchaseOrderId,
          inspection_status: result,
          alreadySet: true,
          reversed: [],
        },
      });
    }

    const reversed: Array<{
      itemName: string;
      itemId: string;
      qty: number;
      nextQty: number;
    }> = [];
    const reverseErrors: Array<{ itemName: string; error: string; code?: string }> = [];

    // ── 1차 패스: 쓰기 없이 품목 해석 + 스코프 검사 ──
    // 예전에는 스코프 검사가 반품 루프 한가운데 있었고 실패 시 `return itemScope.response` 로
    // 즉시 이탈했다. try 블록 안이었지만 return 이라 PO 갱신에 도달하지 않았고, 앞 품목의
    // 반품 차감만 커밋된 채 received_qty 가 그대로 남아 재시도하면 같은 품목이 또 차감됐다(D07-005a).
    const poCompany = String(po.requester_company || '').trim();
    const lookupScope = poCompany
      ? { company: poCompany, companyId: null }
      : {
          company: (session?.user?.company as string | undefined) ?? null,
          companyId: (session?.user?.company_id as string | undefined) ?? null,
        };

    const reversePlans: Array<{ idx: number; itemId: string; itemName: string; qty: number }> = [];
    if (wantsReverse) {
      for (let i = 0; i < poItems.length; i++) {
        const poLine = poItems[i];
        const received = lineReceivedQty(poLine);
        if (received <= 0) continue;

        const itemName = lineName(poLine) || `line-${i + 1}`;
        let itemId = String(poLine.item_id || poLine.inventory_id || '').trim();

        if (!itemId) {
          // 회사 스코프 없는 전사 이름 조회가 타사 행을 집어오던 문제(D07-006)를 공용 함수로 대체
          const found = await resolveInventoryItemIdByName(db, itemName, lookupScope);
          if (found.ok) itemId = found.itemId;
          else {
            reverseErrors.push({ itemName, error: found.error, code: found.code });
            continue;
          }
        }

        const itemScope = await assertInventoryItemCompanyScope(d1, session.user, itemId);
        if (!itemScope.ok) return itemScope.response;

        reversePlans.push({ idx: i, itemId, itemName, qty: received });
      }
    }

    // ── PO 선점(낙관적 잠금) — 재고를 건드리기 전에 잡는다 ──
    const lock = await acquirePurchaseOrderLock(db, purchaseOrderId, po.updated_at);
    if (!lock.ok) {
      return NextResponse.json({ ok: false, error: lock.error, code: lock.code }, { status: 409 });
    }

    // ── 2차 패스: 반품 전표 ──
    for (const plan of reversePlans) {
      const poLine = poItems[plan.idx];
      try {
        // 반품: 재고 감소 (검수 불합격으로 입고분 원복)
        // 반품은 유통기한 검사 대상이 아니며, 재고 부족 시 가능한 만큼만 실패 보고
        const mov = await postInventoryMovement(db, {
          itemId: plan.itemId,
          mode: 'delta',
          delta: -plan.qty,
          type: '반품',
          changeType: '검수불합격반품',
          notes:
            notes ||
            `PO ${purchaseOrderId} 검수 불합격 반품 · ${plan.itemName} (-${plan.qty})`,
          actorId: uid,
          actorName,
          company: (session?.user?.company as string) || null,
          department: (session?.user?.department as string) || null,
          supplierName: po.supplier_name ?? null,
          purchaseOrderId,
          skipExpiryCheck: true,
          minAllowed: 0,
        });

        poItems[plan.idx] = {
          ...poLine,
          received_qty: 0,
          rejected_qty: (Number(poLine.rejected_qty ?? 0) || 0) + plan.qty,
          item_id: poLine.item_id || plan.itemId,
        };

        reversed.push({
          itemName: plan.itemName,
          itemId: plan.itemId,
          qty: plan.qty,
          nextQty: mov.nextQty,
        });
      } catch (err) {
        const code = err instanceof StockError ? err.code : undefined;
        const message = err instanceof Error ? err.message : String(err);
        reverseErrors.push({ itemName: plan.itemName, error: message, code });
      }
    }

    const totalRejected = reversed.reduce((s, r) => s + r.qty, 0);
    const prevRejected = Math.max(0, Math.trunc(Number(po.rejected_qty ?? 0) || 0));
    const totalReceivedQty = poItems.reduce((sum, it) => sum + lineReceivedQty(it), 0);

    const received_items = poItems.map((it) => ({
      name: lineName(it),
      ordered: lineOrderedQty(it),
      received: lineReceivedQty(it),
      remaining: Math.max(0, lineOrderedQty(it) - lineReceivedQty(it)),
      rejected: Math.max(0, Math.trunc(Number(it.rejected_qty ?? 0) || 0)),
      item_id: it.item_id || it.inventory_id || null,
    }));

    // 전량 반품이면 상태를 배송/승인 계열로 되돌리지 않고 검수 불합격만 기록
    // received_qty 는 실입고 잔여
    const committed = await db
      .update(purchase_orders)
      .set({
        items: JSON.stringify(poItems),
        received_items: JSON.stringify(received_items),
        received_qty: totalReceivedQty,
        rejected_qty: prevRejected + totalRejected,
        inspection_status: result,
        inspected_at: new Date().toISOString(),
        inspected_by_id: uid,
        inspected_by_name: actorName,
        updated_at: new Date().toISOString(),
        ...(notes ? { notes: [po.notes, notes].filter(Boolean).join(' · ') } : {}),
      })
      // 선점 구간을 닫는다 (D07-004 와 같은 last-writer-wins 를 검수에도 막는다)
      .where(
        sql`${purchase_orders.id} = ${purchaseOrderId} AND ${purchase_orders.updated_at} = ${lock.stamp}`,
      )
      .returning({ id: purchase_orders.id });

    if (committed.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `발주서 갱신이 다른 요청과 충돌했습니다. 반품 전표 ${reversed.length}건은 이미 반영되었으니 발주서를 새로고침해 확인하세요.`,
          code: 'PO_CONFLICT',
          data: { purchaseOrderId, reversed, reverseErrors },
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        purchaseOrderId,
        inspection_status: result,
        alreadySet: false,
        reversed,
        reverseErrors,
        // 실패한 반품이 남아 있으면 재고를 확보한 뒤 같은 검수를 다시 실행해 잔여분을 반품할 수 있다.
        retryable: reverseErrors.length > 0,
        totalRejected,
        totalReceivedQty,
        received_items,
      },
    });
  } catch (err) {
    // 매핑은 lib/inventory-http-errors 로 통합 (D07-016)
    return inventoryErrorResponse(err);
  }
}
