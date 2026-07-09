/**
 * POST /api/inventory/stock-post
 * 재고 전표 단일 API — 수량 SSOT + inventory_logs
 *
 * body:
 *  itemId, mode: 'delta'|'absolute',
 *  delta? | absoluteQty?,
 *  type: 입고|출고|소모|반품|조정|실사조정|기초재고|대여|반납|발주입고,
 *  changeType?, notes?, company?, department?, location?, lotNumber?, expiryDate?,
 *  unitPrice?, supplierName?, purchaseOrderId?, approvalId?,
 *  applyMovingAverage?, skipClosingCheck?
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readSessionFromRequest, type SessionUser } from '@/lib/server-session';
import { getD1Binding, getD1Drizzle, StockError } from '@/lib/db';
import {
  postInventoryMovement,
  type StockMovementType,
} from '@/lib/inventory-movement-service';

export const dynamic = 'force-dynamic';

const TYPES = [
  '입고',
  '출고',
  '소모',
  '반품',
  '조정',
  '실사조정',
  '기초재고',
  '대여',
  '반납',
  '발주입고',
  '이관출고',
  '이관입고',
] as const;

const PayloadSchema = z.object({
  itemId: z.string().min(1),
  mode: z.enum(['delta', 'absolute']).default('delta'),
  delta: z.number().int().optional(),
  absoluteQty: z.number().int().min(0).optional(),
  type: z.enum(TYPES),
  changeType: z.string().optional(),
  notes: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  companyId: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  lotNumber: z.string().nullable().optional(),
  expiryDate: z.string().nullable().optional(),
  serialNumber: z.string().nullable().optional(),
  unitPrice: z.number().nullable().optional(),
  supplierName: z.string().nullable().optional(),
  purchaseOrderId: z.string().nullable().optional(),
  approvalId: z.string().nullable().optional(),
  applyMovingAverage: z.boolean().optional(),
  skipClosingCheck: z.boolean().optional(),
  skipExpiryCheck: z.boolean().optional(),
  minAllowed: z.number().int().optional(),
  idempotencyKey: z.string().nullable().optional(),
});

function userId(user: SessionUser | null | undefined): string | null {
  if (!user) return null;
  const candidate = (user.id ?? user.user_id ?? '') as string;
  return String(candidate).trim() || null;
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

    const p = parsed.data;
    if (p.mode === 'delta' && p.delta == null) {
      return NextResponse.json({ ok: false, error: 'delta required' }, { status: 400 });
    }
    if (p.mode === 'absolute' && p.absoluteQty == null) {
      return NextResponse.json({ ok: false, error: 'absoluteQty required' }, { status: 400 });
    }

    // 출고 계열은 음수 delta로 정규화
    let delta = p.delta;
    if (p.mode === 'delta' && delta != null) {
      const outTypes: StockMovementType[] = ['출고', '소모', '반품', '대여'];
      if (outTypes.includes(p.type as StockMovementType) && delta > 0) {
        delta = -Math.abs(delta);
      }
      if ((p.type === '입고' || p.type === '발주입고' || p.type === '기초재고' || p.type === '반납') && delta < 0) {
        delta = Math.abs(delta);
      }
    }

    const d1 = await getD1Binding();
    if (!d1) throw new Error('[stock-post] D1 binding not available');
    const db = getD1Drizzle(d1);

    const actorName =
      (session?.user?.name as string | undefined) ||
      (session?.user as { staff_name?: string } | undefined)?.staff_name ||
      null;

    const result = await postInventoryMovement(db, {
      itemId: p.itemId,
      mode: p.mode,
      delta,
      absoluteQty: p.absoluteQty,
      type: p.type as StockMovementType,
      changeType: p.changeType,
      notes: p.notes,
      company: p.company ?? (session?.user?.company as string | undefined) ?? null,
      companyId: p.companyId ?? (session?.user?.company_id as string | undefined) ?? null,
      department: p.department ?? (session?.user?.department as string | undefined) ?? null,
      location: p.location,
      lotNumber: p.lotNumber,
      expiryDate: p.expiryDate,
      serialNumber: p.serialNumber,
      unitPrice: p.unitPrice,
      supplierName: p.supplierName,
      purchaseOrderId: p.purchaseOrderId,
      approvalId: p.approvalId,
      applyMovingAverage: p.applyMovingAverage,
      skipClosingCheck: p.skipClosingCheck,
      skipExpiryCheck: p.skipExpiryCheck,
      minAllowed: p.minAllowed ?? 0,
      idempotencyKey: p.idempotencyKey,
      actorId: uid,
      actorName,
    });

    return NextResponse.json({
      ok: true,
      data: {
        prev_qty: result.prevQty,
        next_qty: result.nextQty,
        log_id: result.logId,
        item_id: result.itemId,
        type: result.type,
        unit_price: result.unitPrice ?? null,
      },
    });
  } catch (err) {
    if (err instanceof StockError) {
      const statusMap: Record<string, number> = {
        INSUFFICIENT_STOCK: 409,
        EXPIRED_STOCK: 409,
        ITEM_NOT_FOUND: 404,
        SOURCE_NOT_FOUND: 404,
        DEST_NOT_FOUND: 404,
      };
      return NextResponse.json(
        { ok: false, error: err.message, code: err.code },
        { status: statusMap[err.code] ?? 500 },
      );
    }
    const message = err instanceof Error ? err.message : 'Internal error';
    if (message.startsWith('INVENTORY_PERIOD_LOCKED')) {
      return NextResponse.json(
        { ok: false, error: message, code: 'PERIOD_LOCKED' },
        { status: 423 },
      );
    }
    if (message.startsWith('STOCK_CONFLICT')) {
      return NextResponse.json(
        { ok: false, error: message, code: 'STOCK_CONFLICT' },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
