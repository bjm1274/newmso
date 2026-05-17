// ============================================================
// app/api/work-shifts/bulk-deactivate/route.ts
// 근무형태 일괄 비활성화 (실패 시 DELETE 폴백)
//
// 권한: admin / mso / hr / hr_근무형태
// 동작: D1 work_shifts SET is_active=0 WHERE id IN (...)
//       update 실패(FK 등) 시 DELETE WHERE id IN (...) 재시도 (legacy 호환)
//
// Phase 2.12 — 기존 클라이언트 deactivate 흐름의 서버 라우트화
// Phase 8-D — supabase 직접 의존 제거, D1 직접 사용
// ============================================================
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { inArray } from 'drizzle-orm';
import { readSessionFromRequest, type SessionUser } from '@/lib/server-session';
import {
  work_shifts as workShiftsTable,
  getD1Binding,
  getD1Drizzle,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

const PayloadSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

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
    if (!d1) {
      return NextResponse.json(
        { ok: false, error: 'D1 binding not available' },
        { status: 500 },
      );
    }
    const db = getD1Drizzle(d1);

    // is_active boolean → 0 (D1 SQLite는 integer 보관)
    let deleted = false;
    try {
      await db
        .update(workShiftsTable)
        .set({ is_active: 0 })
        .where(inArray(workShiftsTable.id, ids));
    } catch (updateErr) {
      // legacy 호환: update가 막힌 환경에서는 DELETE 재시도
      try {
        await db.delete(workShiftsTable).where(inArray(workShiftsTable.id, ids));
        deleted = true;
      } catch (deleteErr) {
        const message =
          deleteErr instanceof Error
            ? deleteErr.message
            : updateErr instanceof Error
              ? updateErr.message
              : 'work_shifts mutation failed';
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, count: ids.length, deleted });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
