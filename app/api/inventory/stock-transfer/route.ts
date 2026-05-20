// ============================================================
// app/api/inventory/stock-transfer/route.ts
// 두 inventory item 간 원자적 이관 (atomic_stock_transfer RPC 래퍼)
//
// 권한: 로그인 사용자
// 동작:
//   [d1 모드]  atomicStockTransfer TS 포트 직접 호출 (Supabase RPC 건너뜀)
//   [dual/supabase 모드]
//     1) Supabase rpc('atomic_stock_transfer', { p_source_id, p_dest_id, p_quantity })
//     2) D1 atomicStockTransfer TS 포트 호출 (best-effort mirror)
//        - SOURCE/DEST_NOT_FOUND: D1 backfill 미적용일 수 있어 skip
//        - INSUFFICIENT_STOCK: Supabase가 진실원이라 mirror만 skip
// ============================================================
import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { readSessionFromRequest, type SessionUser } from '@/lib/server-session';
import {
  atomicStockTransfer,
  StockError,
  getD1Binding,
  getD1Drizzle,
  resolveDataBackend,
  logD1MirrorFailure,
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

function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server configuration is missing.');
  return createClient(url, key);
}

async function mirrorToD1(sourceId: string, destId: string, quantity: number) {
  try {
    const backend = await resolveDataBackend();
    if (backend === 'supabase') return;
    const d1 = await getD1Binding();
    if (!d1) return;
    await atomicStockTransfer(getD1Drizzle(d1), sourceId, destId, quantity);
  } catch (err) {
    if (
      err instanceof StockError &&
      (err.code === 'SOURCE_NOT_FOUND' || err.code === 'DEST_NOT_FOUND')
    ) {
      // D1 backfill 미적용 — 정상
      return;
    }
    logD1MirrorFailure(err, { label: 'mirror:inventory.stock-transfer' });
  }
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

    const backend = await resolveDataBackend();

    // d1 모드: Supabase RPC를 건너뛰고 D1 직접 처리
    if (backend === 'd1') {
      const d1 = await getD1Binding();
      if (!d1) throw new Error('[stock-transfer] D1 binding not available');
      const result = await atomicStockTransfer(getD1Drizzle(d1), sourceId, destId, quantity);
      return NextResponse.json({ ok: true, data: result });
    }

    // supabase / dual 모드: Supabase RPC 우선, D1 mirror
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc('atomic_stock_transfer', {
      p_source_id: sourceId,
      p_dest_id: destId,
      p_quantity: quantity,
    });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 500 });
    }

    await mirrorToD1(sourceId, destId, quantity);

    return NextResponse.json({ ok: true, data });
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
