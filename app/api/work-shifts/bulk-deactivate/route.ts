// ============================================================
// app/api/work-shifts/bulk-deactivate/route.ts
// 근무형태 일괄 비활성화 (실패 시 DELETE 폴백)
//
// 권한: admin / mso / hr / hr_근무형태
// 동작:
//   1) Supabase work_shifts SET is_active=false WHERE id IN (...)
//      실패 시 DELETE WHERE id IN (...) 재시도 (legacy 호환)
//   2) D1 미러 — Supabase가 deactivate면 update, delete면 D1도 delete
//
// Phase 2.12 — 기존 클라이언트 deactivate 흐름의 서버 라우트화
// ============================================================
import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { inArray } from 'drizzle-orm';
import { readSessionFromRequest, type SessionUser } from '@/lib/server-session';
import {
  work_shifts as workShiftsTable,
  getD1Binding,
  getD1Drizzle,
  resolveDataBackend,
  logD1MirrorFailure,
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

function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server configuration is missing.');
  return createClient(url, key);
}

async function mirrorToD1(ids: string[], deleted: boolean) {
  try {
    const backend = await resolveDataBackend();
    if (backend === 'supabase') return;
    const d1 = await getD1Binding();
    if (!d1) return;
    const db = getD1Drizzle(d1);
    if (deleted) {
      await db.delete(workShiftsTable).where(inArray(workShiftsTable.id, ids));
    } else {
      await db
        .update(workShiftsTable)
        .set({ is_active: 0 })
        .where(inArray(workShiftsTable.id, ids));
    }
  } catch (err) {
    logD1MirrorFailure(err, {
      label: deleted ? 'mirror:work_shifts.delete' : 'mirror:work_shifts.deactivate',
      count: ids.length,
    });
  }
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
    const supabase = createAdminClient();

    const deactivate = await supabase
      .from('work_shifts')
      .update({ is_active: false })
      .in('id', ids);
    let deleted = false;
    if (deactivate.error) {
      const retry = await supabase.from('work_shifts').delete().in('id', ids);
      if (retry.error) {
        return NextResponse.json({ ok: false, error: retry.error.message }, { status: 500 });
      }
      deleted = true;
    }

    await mirrorToD1(ids, deleted);

    return NextResponse.json({ ok: true, count: ids.length, deleted });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
