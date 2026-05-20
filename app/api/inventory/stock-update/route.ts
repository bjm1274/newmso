// ============================================================
// app/api/inventory/stock-update/route.ts
// 단일 inventory item 수량 원자적 증감 (atomic_stock_update RPC 래퍼)
//
// 권한: 로그인 사용자 (재고 변경은 화면에서 권한 검증됨)
// 동작:
//   [d1 모드]  atomicStockUpdate TS 포트 직접 호출 (Supabase RPC 건너뜀)
//   [dual/supabase 모드]
//     1) Supabase rpc('atomic_stock_update', { p_item_id, p_delta, p_min_allowed })
//     2) D1 atomicStockUpdate TS 포트 호출 (best-effort mirror)
//        - INSUFFICIENT_STOCK은 Supabase가 진실원이라 mirror만 skip
//        - ITEM_NOT_FOUND: D1에 inventory 데이터가 안 들어 있을 수 있어 (현재 backfill 미적용) 정상
// ============================================================
import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { readSessionFromRequest, type SessionUser } from '@/lib/server-session';
import {
  atomicStockUpdate,
  StockError,
  getD1Binding,
  getD1Drizzle,
  resolveDataBackend,
  logD1MirrorFailure,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

const PayloadSchema = z.object({
  itemId: z.string().min(1),
  delta: z.number().int(),
  minAllowed: z.number().int().optional(),
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

async function mirrorToD1(itemId: string, delta: number, minAllowed: number) {
  try {
    const backend = await resolveDataBackend();
    if (backend === 'supabase') return;
    const d1 = await getD1Binding();
    if (!d1) return;
    await atomicStockUpdate(getD1Drizzle(d1), itemId, delta, minAllowed);
  } catch (err) {
    if (err instanceof StockError && err.code === 'ITEM_NOT_FOUND') {
      // inventory가 D1에 backfill 안 됨 — 정상 (Supabase 진실원)
      return;
    }
    logD1MirrorFailure(err, { label: 'mirror:inventory.stock-update' });
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
    const { itemId, delta } = parsed.data;
    const minAllowed = parsed.data.minAllowed ?? 0;

    const backend = await resolveDataBackend();

    // d1 모드: Supabase RPC를 건너뛰고 D1 직접 처리
    if (backend === 'd1') {
      const d1 = await getD1Binding();
      if (!d1) throw new Error('[stock-update] D1 binding not available');
      const result = await atomicStockUpdate(getD1Drizzle(d1), itemId, delta, minAllowed);
      return NextResponse.json({ ok: true, data: result });
    }

    // supabase / dual 모드: Supabase RPC 우선, D1 mirror
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc('atomic_stock_update', {
      p_item_id: itemId,
      p_delta: delta,
      p_min_allowed: minAllowed,
    });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 500 });
    }

    await mirrorToD1(itemId, delta, minAllowed);

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    if (err instanceof StockError) {
      const statusMap: Record<string, number> = {
        INSUFFICIENT_STOCK: 409,
        ITEM_NOT_FOUND: 404,
        SOURCE_NOT_FOUND: 404,
        DEST_NOT_FOUND: 404,
      };
      const status = statusMap[err.code] ?? 500;
      return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status });
    }
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
