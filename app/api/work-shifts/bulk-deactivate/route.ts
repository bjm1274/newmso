// ============================================================
// app/api/work-shifts/bulk-deactivate/route.ts
// 근무형태 일괄 비활성화 (소프트 삭제)
//
// 권한: admin / mso / hr / hr_근무형태
// 동작:
//   D1 work_shifts SET is_active=0 WHERE id IN (...)
//   — 화면(근무형태관리.tsx)이 D1을 읽으므로 여기가 권위 소스.
//
// Phase 2.12 — 기존 클라이언트 deactivate 흐름의 서버 라우트화
// D1 컷오버 완료 — Supabase 경로 제거, D1을 권위 소스로 사용
// ============================================================
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { inArray } from 'drizzle-orm';
import { readSessionFromRequest, type SessionUser } from '@/lib/server-session';
import {
  work_shifts as workShiftsTable,
  getD1Binding,
  getD1Drizzle } from '@/lib/db';

export const dynamic = 'force-dynamic';

const PayloadSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100) });

function hasPermission(user: SessionUser | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const perms = (user.permissions ?? {}) as Record<string, unknown>;
  return Boolean(
    perms.admin ||
      perms.mso ||
      perms.hr ||
      perms['hr_근무형태'] ||
      perms['hr_근무 형태'],
  );
}

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!hasPermission(session?.user)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => null);
    const parsed = PayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 });
    }
    const { ids } = parsed.data;

    const d1 = await getD1Binding();
    if (!d1) throw new Error('[work-shifts/bulk-deactivate] D1 binding not available');
    const db = getD1Drizzle(d1);

    // 소프트 삭제: is_active boolean → 0 (D1 SQLite는 integer 보관)
    await db
      .update(workShiftsTable)
      .set({ is_active: 0 })
      .where(inArray(workShiftsTable.id, ids));

    return NextResponse.json({ ok: true, count: ids.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
