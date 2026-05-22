// ============================================================
// app/api/work-shifts/route.ts
// 근무형태 upsert (생성 + 수정 통합)
//
// 권한: admin / mso / hr / hr_근무형태 권한 보유자
// 동작:
//   1) D1 work_shifts upsert (id 있으면 update, 없으면 신규 id 생성 후 insert)
//      onConflict='update' target=[id], boolean→0/1 변환
//   2) 응답: { ok:true, id:string }
//
// Phase 2.12 — 클라이언트 직접 호출 제거를 위한 신규 라우트
// D1 컷오버 완료 — Supabase 경로 제거, D1을 권위 소스로 사용
// ============================================================
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readSessionFromRequest, type SessionUser } from '@/lib/server-session';
import {
  mirrorRowsToD1,
  work_shifts as workShiftsTable,
  sql,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

const PayloadSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  start_time: z.string(),
  end_time: z.string(),
  description: z.string().nullable().optional(),
  company_name: z.string().min(1),
  break_start_time: z.string().nullable().optional(),
  break_end_time: z.string().nullable().optional(),
  shift_type: z.string().nullable().optional(),
  weekly_work_days: z.number().int().min(0).max(7).optional(),
  is_weekend_work: z.boolean().optional(),
  is_shift: z.boolean().optional(),
});

type WorkShiftPayload = z.infer<typeof PayloadSchema>;

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

// D1 work_shifts upsert — id 충돌 시 UPDATE, 없으면 INSERT.
// D1 SQLite는 boolean을 integer(0/1)로 보관하므로 변환 후 전달한다.
async function upsertWorkShift(insertedId: string, payload: WorkShiftPayload) {
  await mirrorRowsToD1(
    workShiftsTable,
    {
      id: insertedId,
      name: payload.name,
      start_time: payload.start_time,
      end_time: payload.end_time,
      break_start_time: payload.break_start_time ?? null,
      break_end_time: payload.break_end_time ?? null,
      description: payload.description ?? null,
      company_name: payload.company_name,
      shift_type: payload.shift_type ?? null,
      weekly_work_days: payload.weekly_work_days ?? 5,
      is_weekend_work: payload.is_weekend_work ? 1 : 0,
      is_shift: payload.is_shift ? 1 : 0,
      is_active: 1,
      created_at: new Date().toISOString(),
    },
    {
      label: 'work_shifts.upsert',
      onConflict: 'update',
      target: [workShiftsTable.id],
      set: {
        name: sql`excluded.name`,
        start_time: sql`excluded.start_time`,
        end_time: sql`excluded.end_time`,
        break_start_time: sql`excluded.break_start_time`,
        break_end_time: sql`excluded.break_end_time`,
        description: sql`excluded.description`,
        company_name: sql`excluded.company_name`,
        shift_type: sql`excluded.shift_type`,
        weekly_work_days: sql`excluded.weekly_work_days`,
        is_weekend_work: sql`excluded.is_weekend_work`,
        is_shift: sql`excluded.is_shift`,
        is_active: sql`excluded.is_active`,
      },
    },
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
      return NextResponse.json(
        { ok: false, error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    // id가 없으면 신규 행 — 서버에서 UUID 생성 (D1 권위 소스)
    const id = parsed.data.id ?? crypto.randomUUID();
    await upsertWorkShift(id, parsed.data);
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
