import { NextRequest, NextResponse } from 'next/server';
import { dispatchAnnualLeavePromotions } from '@/lib/annual-leave-promotion-dispatch';
import { getKoreanTodayString } from '@/lib/seoul-time';
import {
  isAdminSession,
  isSystemMasterSession,
  readSessionFromRequest,
} from '@/lib/server-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 연차사용촉진 수동 실행 (관리자).
 * cron(/api/cron/annual-leave-promotion)과 동일 로직 — 누락분 소급 포함.
 *
 * body(선택): { date?: 'YYYY-MM-DD' } — 기준일(미지정 시 KST 오늘).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await readSessionFromRequest(req);
    if (!session?.user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdminSession(session.user) && !isSystemMasterSession(session.user)) {
      return NextResponse.json({ ok: false, error: '관리자만 실행할 수 있습니다.' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { date?: unknown };
    const rawDate = typeof body?.date === 'string' ? body.date.trim() : '';
    const todayKey = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : getKoreanTodayString();
    // KST 정오 근처로 Date 구성 → formatKoreanDateKey 가 해당 일자 유지
    const now = new Date(`${todayKey}T12:00:00+09:00`);

    const result = await dispatchAnnualLeavePromotions(now);
    return NextResponse.json({ ok: true, todayKey, ...result });
  } catch (err) {
    console.error('[admin/annual-leave/promotion-run] 실패:', err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : '연차사용촉진 실행 중 오류가 발생했습니다.',
      },
      { status: 500 },
    );
  }
}
