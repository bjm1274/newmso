// ============================================================
// app/api/inventory/stock-transfer/route.ts
// 두 inventory item 간 원자적 이관 (atomicStockTransfer TS 포트 래퍼)
//
// 권한: 로그인 사용자
// 동작: D1 binding으로 atomicStockTransfer를 직접 호출.
//       (Supabase 컷오버 완료 — D1이 유일한 진실원)
// ============================================================
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readSessionFromRequest, type SessionUser } from '@/lib/server-session';
import {
  atomicStockTransfer,
  StockError,
  getD1Binding,
  getD1Drizzle,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

const PayloadSchema = z.object({
  sourceId: z.string().min(1),
  destId: z.string().min(1),
  quantity: z.number().int().positive(),
});

function userId(user: SessionUser | null | undefined): string | null {
  if (!user) return null;
  const candidate = (user.id ?? user.user_id ?? '') as string;
  const trimmed = String(candidate).trim();
  return trimmed || null;
}

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!userId(session?.user)) {
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
    const { sourceId, destId, quantity } = parsed.data;

    const d1 = await getD1Binding();
    if (!d1) throw new Error('[stock-transfer] D1 binding not available');
    const result = await atomicStockTransfer(getD1Drizzle(d1), sourceId, destId, quantity);
    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    if (err instanceof StockError) {
      const statusMap: Record<string, number> = {
        INSUFFICIENT_STOCK: 409,
        SOURCE_NOT_FOUND: 404,
        DEST_NOT_FOUND: 404,
        ITEM_NOT_FOUND: 404,
      };
      const status = statusMap[err.code] ?? 500;
      return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status });
    }
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
