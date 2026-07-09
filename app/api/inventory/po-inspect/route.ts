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
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { readSessionFromRequest, type SessionUser } from '@/lib/server-session';
import { getD1Binding, getD1Drizzle, StockError } from '@/lib/db';
import { purchase_orders, inventory } from '@/lib/db/schema';
import { postInventoryMovement } from '@/lib/inventory-movement-service';

export const dynamic = 'force-dynamic';

const PayloadSchema = z.object({
  purchaseOrderId: z.string().min(1),
  result: z.enum(['합격', '불합격']),
  reverseOnFail: z.boolean().optional().default(true),
  notes: z.string().nullable().optional(),
});

function userId(user: SessionUser | null | undefined): string | null {
  if (!user) return null;
  return String((user.id ?? user.user_id ?? '') as string).trim() || null;
}

function parseItems(raw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

function lineName(it: Record<string, unknown>): string {
  return String(it.name || it.item_name || '').trim();
}

function lineOrderedQty(it: Record<string, unknown>): number {
  return Math.max(0, Math.trunc(Number(it.qty ?? it.quantity ?? 0) || 0));
}

function lineReceivedQty(it: Record<string, unknown>): number {
  return Math.max(0, Math.trunc(Number(it.received_qty ?? it.receivedQty ?? 0) || 0));
}

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    const uid = userId(session?.user);
    if (!uid) {
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

    const prevInspection = String(po.inspection_status || '').trim();
    if (prevInspection === result) {
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

    // 불합격 재검수(합격→불합격) 또는 최초 불합격 시 입고 수량 반품
    const actorName = (session?.user?.name as string | undefined) || null;
    const poItems: Array<Record<string, unknown>> = parseItems(po.items).map((it) => ({
      ...it,
      received_qty: lineReceivedQty(it),
    }));

    const reversed: Array<{
      itemName: string;
      itemId: string;
      qty: number;
      nextQty: number;
    }> = [];
    const reverseErrors: Array<{ itemName: string; error: string; code?: string }> = [];

    if (result === '불합격' && reverseOnFail) {
      for (let i = 0; i < poItems.length; i++) {
        const poLine = poItems[i];
        const received = lineReceivedQty(poLine);
        if (received <= 0) continue;

        const itemName = lineName(poLine) || `line-${i + 1}`;
        let itemId = String(poLine.item_id || poLine.inventory_id || '').trim();

        if (!itemId) {
          const invRows = await db
            .select({ id: inventory.id, item_name: inventory.item_name, name: inventory.name })
            .from(inventory)
            .limit(5000);
          const hit = invRows.find((r) => {
            const n = String(r.item_name || r.name || '').trim().toLowerCase();
            return n === itemName.trim().toLowerCase();
          });
          if (hit) itemId = hit.id;
        }

        if (!itemId) {
          reverseErrors.push({
            itemName,
            error: `품목 미매칭: ${itemName}`,
            code: 'ITEM_NOT_FOUND',
          });
          continue;
        }

        try {
          // 반품: 재고 감소 (검수 불합격으로 입고분 원복)
          // 반품은 유통기한 검사 대상이 아니며, 재고 부족 시 가능한 만큼만 실패 보고
          const mov = await postInventoryMovement(db, {
            itemId,
            mode: 'delta',
            delta: -received,
            type: '반품',
            changeType: '검수불합격반품',
            notes:
              notes ||
              `PO ${purchaseOrderId} 검수 불합격 반품 · ${itemName} (-${received})`,
            actorId: uid,
            actorName,
            company: (session?.user?.company as string) || null,
            department: (session?.user?.department as string) || null,
            supplierName: po.supplier_name ?? null,
            purchaseOrderId,
            skipExpiryCheck: true,
            minAllowed: 0,
          });

          poItems[i] = {
            ...poLine,
            received_qty: 0,
            rejected_qty: (Number(poLine.rejected_qty ?? 0) || 0) + received,
            item_id: poLine.item_id || itemId,
          };

          reversed.push({
            itemName,
            itemId,
            qty: received,
            nextQty: mov.nextQty,
          });
        } catch (err) {
          const code = err instanceof StockError ? err.code : undefined;
          const message = err instanceof Error ? err.message : String(err);
          reverseErrors.push({ itemName, error: message, code });
        }
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
    await db
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
      .where(eq(purchase_orders.id, purchaseOrderId));

    return NextResponse.json({
      ok: true,
      data: {
        purchaseOrderId,
        inspection_status: result,
        alreadySet: false,
        reversed,
        reverseErrors,
        totalRejected,
        totalReceivedQty,
        received_items,
      },
    });
  } catch (err) {
    if (err instanceof StockError) {
      return NextResponse.json(
        { ok: false, error: err.message, code: err.code },
        {
          status:
            err.code === 'INSUFFICIENT_STOCK' || err.code === 'EXPIRED_STOCK'
              ? 409
              : err.code === 'ITEM_NOT_FOUND'
                ? 404
                : 500,
        },
      );
    }
    const message = err instanceof Error ? err.message : 'Internal error';
    if (message.startsWith('INVENTORY_PERIOD_LOCKED')) {
      return NextResponse.json(
        { ok: false, error: message, code: 'PERIOD_LOCKED' },
        { status: 423 },
      );
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
