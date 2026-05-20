// ============================================================
// app/api/d1/rpc/increment-post-views/route.ts
// supabase.rpc('increment_post_views', { p_post_id }) 대체 라우트.
//
// lib/db/functions/counters.ts의 incrementPostViews를 호출.
//
// 요청 형식:
//   POST /api/d1/rpc/increment-post-views
//   body: { p_post_id: string }
//
// 응답:
//   { ok: true, data: null }
//   { ok: false, error: string }
//
// 권한: 로그인 사용자 (AUTHENTICATED — 조회수 증가는 공개 게시판 기준).
// ============================================================
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readSessionFromRequest, type SessionUser } from '@/lib/server-session';
import { getD1Binding, getD1Drizzle } from '@/lib/db';
import { incrementPostViews } from '@/lib/db/functions/counters';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  p_post_id: z.string().min(1).max(128),
});

function userId(user: SessionUser | null | undefined): string | null {
  if (!user) return null;
  const candidate = (user.id ?? user.user_id ?? '') as string;
  return String(candidate).trim() || null;
}

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!userId(session?.user)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const d1 = await getD1Binding();
    if (!d1) {
      return NextResponse.json(
        { ok: false, error: 'D1 binding not available' },
        { status: 500 },
      );
    }
    const db = getD1Drizzle(d1);

    await incrementPostViews(db, parsed.data.p_post_id);

    return NextResponse.json({ ok: true, data: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
