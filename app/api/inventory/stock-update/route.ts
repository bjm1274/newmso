// ============================================================
// app/api/inventory/stock-update/route.ts
// 단일 inventory item 수량 증감 (구형 호환 엔드포인트)
//
// 권한: 로그인 + 해당 품목의 회사/부서 스코프
//
// 왜 내부가 바뀌었나 (8차 D07-009)
//   예전에는 atomicStockUpdate 를 직접 호출해 inventory.quantity 만 바꿨다.
//   그 함수는 inventory_logs 를 전혀 쓰지 않으므로 '수량은 변했는데 이력이 0건' 인
//   상태를 만들 수 있는 유일한 라이브 경로였다. 게다가 minAllowed 를 payload 그대로
//   받아 음수 재고까지 허용했다.
//   실측: E2E-001(admin=false, inventory=true) 로
//   {delta:-500, minAllowed:-99999} → 200, 수량 100 → -400, 로그 증가 0건.
//   앱 내 호출자는 0건이지만(callAtomicStockUpdate 는 사장 코드) 라우트는 열려 있어
//   내부 부정 시 감사추적을 우회하는 통로가 됐다.
//   그래서 내부를 재고 전표 SSOT(postInventoryMovement, type '조정')로 갈아끼워
//   같은 요청이 이력을 반드시 남기게 하고, minAllowed 는 0 미만을 허용하지 않는다.
//   응답 형태({prev_qty, next_qty})는 구형 호출자를 위해 그대로 유지한다.
// ============================================================
import { NextResponse } from 'next/server';
import { userId } from '@/lib/d1-api-helpers';
import { z } from 'zod';
import { readSessionFromRequest } from '@/lib/server-session';
import { assertInventoryItemCompanyScope } from '@/lib/inventory-scope-guard';
import { inventoryErrorResponse } from '@/lib/inventory-http-errors';
import { postInventoryMovement } from '@/lib/inventory-movement-service';
import { getD1Binding, getD1Drizzle } from '@/lib/db';

export const dynamic = 'force-dynamic';

const PayloadSchema = z.object({
  itemId: z.string().min(1),
  delta: z.number().int(),
  minAllowed: z.number().int().optional() });

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session || !session.user || !userId(session.user)) {
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
    const { itemId, delta } = parsed.data;
    // 음수 재고 금지 — payload 의 minAllowed 는 0 미만으로 내려갈 수 없다.
    const minAllowed = Math.max(0, parsed.data.minAllowed ?? 0);

    const d1 = await getD1Binding();
    if (!d1) throw new Error('[stock-update] D1 binding not available');

    // 타 회사/부서 재고 조작 방지 권한 검증
    const scopeCheck = await assertInventoryItemCompanyScope(d1, session.user, itemId);
    if (!scopeCheck.ok) {
      return scopeCheck.response;
    }

    const actorName =
      (session.user.name as string | undefined) ||
      (session.user as { staff_name?: string }).staff_name ||
      null;

    const result = await postInventoryMovement(getD1Drizzle(d1), {
      itemId,
      mode: 'delta',
      delta,
      type: '조정',
      changeType: delta >= 0 ? '조정입고' : '조정출고',
      minAllowed,
      notes: '[stock-update 구형 엔드포인트]',
      actorId: userId(session.user),
      actorName,
    });

    return NextResponse.json({
      ok: true,
      data: { prev_qty: result.prevQty, next_qty: result.nextQty },
    });
  } catch (err) {
    return inventoryErrorResponse(err);
  }
}
