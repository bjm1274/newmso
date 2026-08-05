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
import { userId } from '@/lib/d1-api-helpers';
import { z } from 'zod';
import { readSessionFromRequest } from '@/lib/server-session';
import { assertInventoryItemCompanyScope, isInventoryAdmin } from '@/lib/inventory-scope-guard';
import { getD1Binding, getD1Drizzle } from '@/lib/db';
import { inventoryErrorResponse } from '@/lib/inventory-http-errors';
import {
  postInventoryMovement,
  type StockMovementType,
} from '@/lib/inventory-movement-service';

export const dynamic = 'force-dynamic';

// 이관출고·이관입고 는 여기 없다.
// 예전에는 두 타입이 이 목록에 들어 있어 stock-post 로 '이관출고' 전표 1건만 단독 생성할 수
// 있었다. 이관은 출발지 차감·목적지 증가·inventory_transfers 이력이 한 배치로 묶여야
// 대사(출발 합계 = 도착 합계)가 성립하는데, 단독 전표는 그 짝이 없는 반쪽 이관 로그를 만든다.
// 8차 D07-021 실측: type:'이관출고', delta:-5 → 200, inventory_logs 에 이관출고 1건이
// 생겼지만 inventory_transfers 는 0건이었다. 이관은 /api/inventory/stock-transfer 전용.
const TRANSFER_ONLY_TYPES = ['이관출고', '이관입고'] as const;

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

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    const uid = userId(session?.user);
    if (!session || !session.user || !uid) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);

    // zod 의 'Invalid payload' 로 떨어지면 호출자가 원인을 알 수 없어, 이관 타입만 따로 안내한다.
    const requestedType = (body as { type?: unknown } | null)?.type;
    if (
      typeof requestedType === 'string' &&
      (TRANSFER_ONLY_TYPES as readonly string[]).includes(requestedType)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            '이관출고/이관입고 전표는 단독으로 만들 수 없습니다. /api/inventory/stock-transfer 를 사용하세요.',
          code: 'TRANSFER_ONLY',
        },
        { status: 400 },
      );
    }

    const parsed = PayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const d1 = await getD1Binding();
    if (!d1) throw new Error('[stock-post] D1 binding not available');

    const scopeCheck = await assertInventoryItemCompanyScope(d1, session.user, parsed.data.itemId);
    if (!scopeCheck.ok) {
      return scopeCheck.response;
    }

    const p = parsed.data;

    // 관리자 강제 옵션 게이트.
    // 예전에는 skipClosingCheck / skipExpiryCheck / minAllowed 를 payload 그대로 서비스에 넘겼다.
    // movement-service 주석은 이 둘을 '관리자 강제' 로 규정하는데 정작 라우트에 역할 검사가 없어서,
    // permissions.inventory 만 가진 일반 재고 담당자도 월마감 잠금과 음수재고 방지를 함께 끌 수 있었다
    // (8차 D07-002 실측: 잠긴 달에 skipClosingCheck:true 로 입고 200, minAllowed:-99999 로 수량 -97 생성).
    const isAdmin = isInventoryAdmin(session.user);
    if (!isAdmin) {
      const overrides: string[] = [];
      if (p.skipClosingCheck) overrides.push('skipClosingCheck');
      if (p.skipExpiryCheck) overrides.push('skipExpiryCheck');
      if ((p.minAllowed ?? 0) < 0) overrides.push('minAllowed<0');
      if (overrides.length > 0) {
        return NextResponse.json(
          {
            ok: false,
            error: `관리자 전용 강제 옵션입니다: ${overrides.join(', ')}`,
            code: 'FORBIDDEN',
          },
          { status: 403 },
        );
      }
    }

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
    // 매핑은 lib/inventory-http-errors 로 통합 — 라우트마다 따로 갖던 catch 가 갈라져
    // 같은 STOCK_CONFLICT 가 여기서는 409, po-receive 에서는 500 이었다 (D07-016).
    return inventoryErrorResponse(err);
  }
}
