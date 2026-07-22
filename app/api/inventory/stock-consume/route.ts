// ============================================================
// app/api/inventory/stock-consume/route.ts
//
// @deprecated 클라이언트/타 모듈에서 호출 0. 라이브 재고 소모는 stock-post /
// stock-transfer 및 inventory-utils 경로를 사용한다. 삭제 전 호환 유지를 위해
// 라우트만 남긴다.
//
// 부서 소모 기록용 원자적 트랜잭션 API (수량 차감 + 로그 기록 단일 트랜잭션)
// 권한: 로그인 사용자
// 동작: D1 binding으로 atomicStockConsumeWithLog를 호출해 배치 트랜잭션 처리.
// ============================================================
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readSessionFromRequest, type SessionUser } from '@/lib/server-session';
import {
  atomicStockConsumeWithLog,
  StockError,
  getD1Binding,
  getD1Drizzle } from '@/lib/db';

export const dynamic = 'force-dynamic';

const PayloadSchema = z.object({
  itemId: z.string().min(1),
  consumeAmount: z.number().int().positive(),
  company: z.string().nullable().optional(),
  companyId: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  notes: z.string().nullable().optional() });

function userId(user: SessionUser | null | undefined): string | null {
  if (!user) return null;
  const candidate = (user.id ?? user.user_id ?? '') as string;
  const trimmed = String(candidate).trim();
  return trimmed || null;
}

export async function POST(request: Request) {
  // 호환 유지: 신규 클라이언트는 stock-post 사용. 호출 시 410으로 안내.
  if (request.headers.get('x-allow-deprecated-stock-consume') !== '1') {
    return NextResponse.json(
      {
        ok: false,
        error: 'Deprecated: use POST /api/inventory/stock-post instead',
        code: 'STOCK_CONSUME_DEPRECATED',
      },
      { status: 410 },
    );
  }
  try {
    const session = await readSessionFromRequest(request);
    const user = session?.user;
    if (!userId(user)) {
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

    const { itemId, consumeAmount, company, companyId, department, notes } = parsed.data;

    const d1 = await getD1Binding();
    if (!d1) throw new Error('[stock-consume] D1 binding not available');

    const result = await atomicStockConsumeWithLog(
      getD1Drizzle(d1),
      itemId,
      consumeAmount,
      {
        actor_name: user ? (user.department ? `${user.name} (${user.department})` : user.name) : '알 수 없음',
        company: company ?? (user?.company as string | null) ?? null,
        company_id: companyId ?? (user?.company_id as string | null) ?? null,
        department: department ?? (user?.department as string | null) ?? null,
        notes: notes ?? null }
    );

    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    if (err instanceof StockError) {
      const statusMap: Record<string, number> = {
        INSUFFICIENT_STOCK: 409,
        EXPIRED_STOCK: 409,
        ITEM_NOT_FOUND: 404 };
      const status = statusMap[err.code] ?? 500;
      return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status });
    }
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
