import { NextResponse } from 'next/server';
import { processAnnualLeaveAccrual } from '@/lib/annual-leave-accrual';
import { getKoreanTodayString } from '@/lib/seoul-time';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET || '';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const todayKey = getKoreanTodayString();
    const result = await processAnnualLeaveAccrual(todayKey);
    return NextResponse.json({ ok: true, todayKey, ...result });
  } catch (err) {
    console.error('연차 자동발생 크론 실패:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '연차 자동발생 처리 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
