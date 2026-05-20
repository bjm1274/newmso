// ============================================================
// app/api/work-shifts/bulk-deactivate/route.ts
// 근무형태 일괄 비활성화 (소프트 삭제)
//
// 권한: admin / mso / hr / hr_근무형태
// 동작:
//   1) Supabase work_shifts SET is_active=false WHERE id IN (...)
//      — 화면(근무형태관리.tsx)이 Supabase 를 읽으므로 여기가 권위 소스.
//   2) Supabase 성공 후 D1 work_shifts 미러 (best-effort)
//      update 막힌 환경에서는 DELETE 재시도. 미러 실패는 무시.
//
// Phase 2.12 — 기존 클라이언트 deactivate 흐름의 서버 라우트화
// 생성/수정 라우트(route.ts)와 동일하게 Supabase 우선 + D1 미러 정책 유지.
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

// D1 미러: 실패해도 Supabase 결과(화면 소스)에는 영향 없으므로 best-effort 로 처리한다.
async function mirrorDeactivateToD1(ids: string[]): Promise<void> {
  const d1 = await getD1Binding();
  if (!d1) return;
  const db = getD1Drizzle(d1);
  try {
    // is_active boolean → 0 (D1 SQLite는 integer 보관)
    await db
      .update(workShiftsTable)
      .set({ is_active: 0 })
      .where(inArray(workShiftsTable.id, ids));
  } catch {
    // legacy 호환: update가 막힌 환경에서는 DELETE 재시도
    try {
      await db.delete(workShiftsTable).where(inArray(workShiftsTable.id, ids));
    } catch {
      // 미러 실패는 무시 — Supabase가 화면의 소스이므로 사용자 흐름에는 영향 없음
    }
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

    // 화면(근무형태관리.tsx)은 Supabase work_shifts.is_active=true 를 읽으므로
    // Supabase 를 먼저 갱신해야 삭제가 화면에 반영된다.
    const supabase = createAdminClient();
    const { error: supabaseError } = await supabase
      .from('work_shifts')
      .update({ is_active: false })
      .in('id', ids);
    if (supabaseError) {
      return NextResponse.json({ ok: false, error: supabaseError.message }, { status: 500 });
    }

    // D1 미러 (best-effort)
    await mirrorDeactivateToD1(ids);

    return NextResponse.json({ ok: true, count: ids.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
