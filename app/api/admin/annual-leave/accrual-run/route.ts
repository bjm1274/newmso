import { NextRequest, NextResponse } from 'next/server';
import { processAnnualLeaveAccrual } from '@/lib/annual-leave-accrual';
import { getKoreanTodayString } from '@/lib/seoul-time';
import {
  isAdminSession,
  isSystemMasterSession,
  readSessionFromRequest } from '@/lib/server-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 연차 자동발생 수동 실행 (관리자용 백필).
 *
 * 매일 도는 cron(/api/cron/annual-leave-accrual)과 동일한 processAnnualLeaveAccrual 을 호출한다.
 * cron 누락분(1년 미만 월차 등)을 관리자가 즉시 소급 부여/복구할 때 사용.
 *
 * body(선택): { date?: 'YYYY-MM-DD' } — 기준일 지정(미지정 시 KST 오늘).
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

    const result = await processAnnualLeaveAccrual(todayKey);
    return NextResponse.json({ ok: true, todayKey, ...result });
  } catch (err) {
    console.error('[admin/annual-leave/accrual-run] 실패:', err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : '연차 자동발생 실행 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
