// ============================================================
// app/api/inventory/stock-update/route.ts
// 단일 inventory item 수량 원자적 증감 (atomicStockUpdate TS 포트 래퍼)
//
// 권한: 로그인 사용자 (재고 변경은 화면에서 권한 검증됨)
// 동작: D1 binding으로 atomicStockUpdate를 직접 호출.
//       (Supabase 컷오버 완료 — D1이 유일한 진실원)
// ============================================================
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readSessionFromRequest, type SessionUser } from '@/lib/server-session';
import { assertInventoryItemCompanyScope } from '@/lib/inventory-scope-guard';
import {
  atomicStockUpdate,
  StockError,
  getD1Binding,
  getD1Drizzle } from '@/lib/db';

export const dynamic = 'force-dynamic';

const PayloadSchema = z.object({
  itemId: z.string().min(1),
  delta: z.number().int(),
  minAllowed: z.number().int().optional() });

function userId(user: SessionUser | null | undefined): string | null {
  if (!user) return null;
  const candidate = (user.id ?? user.user_id ?? '') as string;
  const trimmed = String(candidate).trim();
  return trimmed || null;
}

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
    const minAllowed = parsed.data.minAllowed ?? 0;

    const d1 = await getD1Binding();
    if (!d1) throw new Error('[stock-update] D1 binding not available');

    // 타 회사/부서 재고 조작 방지 권한 검증
    const scopeCheck = await assertInventoryItemCompanyScope(d1, session.user, itemId);
    if (!scopeCheck.ok) {
      return scopeCheck.response;
    }

    const result = await atomicStockUpdate(getD1Drizzle(d1), itemId, delta, minAllowed);
    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    if (err instanceof StockError) {
      const statusMap: Record<string, number> = {
        INSUFFICIENT_STOCK: 409,
        ITEM_NOT_FOUND: 404,
        SOURCE_NOT_FOUND: 404,
        DEST_NOT_FOUND: 404 };
      const status = statusMap[err.code] ?? 500;
      return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status });
    }
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
