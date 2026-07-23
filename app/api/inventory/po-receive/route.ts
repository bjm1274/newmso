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
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { readSessionFromRequest, type SessionUser } from '@/lib/server-session';
import { getD1Binding, getD1Drizzle, StockError } from '@/lib/db';
import { purchase_orders, inventory } from '@/lib/db/schema';
import { postInventoryMovement } from '@/lib/inventory-movement-service';
import { assertInventoryCompanyScope, assertInventoryItemCompanyScope } from '@/lib/inventory-scope-guard';

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
      const remaining = Math.max(0, ordered - already);
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

      let itemId = line.inventoryItemId?.trim() || '';
      if (!itemId) {
        const invId = String(poLine.item_id || poLine.inventory_id || '').trim();
        if (invId) itemId = invId;
      }
      if (!itemId) {
        const invRows = await db
          .select({ id: inventory.id, item_name: inventory.item_name, name: inventory.name })
          .from(inventory)
          .limit(5000);
        const hit = invRows.find((r) => {
          const n = String(r.item_name || r.name || '').trim().toLowerCase();
          return n === line.itemName.trim().toLowerCase();
        });
        if (!hit) {
          return NextResponse.json(
            {
              ok: false,
              error: `품목 미등록: ${line.itemName}. 기준정보에서 등록 후 입고하세요.`,
            },
            { status: 400 },
          );
        }
        itemId = hit.id;
      }

      const itemScope = await assertInventoryItemCompanyScope(d1, session.user, itemId);
      if (!itemScope.ok) return itemScope.response;

      const unitPrice =
        line.unitPrice ??
        (Number(poLine.unit_price ?? poLine.price ?? 0) || undefined);

      const mov = await postInventoryMovement(db, {
        itemId,
        mode: 'delta',
        delta: line.qty,
        type: '발주입고',
        changeType: '발주입고',
        notes: `PO ${parsed.data.purchaseOrderId} · ${line.itemName} (+${line.qty})`,
        actorId: uid,
        actorName,
        company: (session?.user?.company as string) || null,
        department: (session?.user?.department as string) || null,
        unitPrice: unitPrice ?? null,
        supplierName: po.supplier_name ?? null,
        purchaseOrderId: parsed.data.purchaseOrderId,
        lotNumber: line.lotNumber ?? null,
        expiryDate: line.expiryDate ?? null,
        applyMovingAverage: true,
      });

      const lineReceived = already + line.qty;
      poItems[idx] = {
        ...poLine,
        received_qty: lineReceived,
        item_id: poLine.item_id || itemId,
      };

      results.push({
        itemName: line.itemName,
        itemId,
        nextQty: mov.nextQty,
        lineReceived,
        lineOrdered: ordered,
        remaining: Math.max(0, ordered - lineReceived),
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

    await db
      .update(purchase_orders)
      .set({
        items: JSON.stringify(poItems),
        received_items: JSON.stringify(received_items),
        received_qty: totalReceivedQty,
        received_at: new Date().toISOString(),
        received_by_id: uid,
        received_by_name: actorName,
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
      .where(eq(purchase_orders.id, parsed.data.purchaseOrderId));

    return NextResponse.json({
      ok: true,
      data: {
        received: results,
        purchaseOrderId: parsed.data.purchaseOrderId,
        totalReceivedQty,
        totalOrderedQty,
        allComplete,
        status: nextStatus,
        received_items,
      },
    });
  } catch (err) {
    if (err instanceof StockError) {
      return NextResponse.json(
        { ok: false, error: err.message, code: err.code },
        { status: err.code === 'INSUFFICIENT_STOCK' ? 409 : 404 },
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
