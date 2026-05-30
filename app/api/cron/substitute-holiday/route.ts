import { NextResponse } from 'next/server';
import { processSubstituteHolidayGrants } from '@/lib/substitute-holiday';
import { getKoreanTodayString } from '@/lib/seoul-time';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET || '';

/** 'YYYY-MM-DD' 를 n일 이동 (UTC 기반 순수 계산). */
function shiftDateKey(key: string, deltaDays: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const todayKey = getKoreanTodayString();
    // 누락 대비 7일 lookback (어제까지). 멱등성으로 중복 부여 없음.
    const endKey = shiftDateKey(todayKey, -1);
    const startKey = shiftDateKey(todayKey, -7);
    const result = await processSubstituteHolidayGrants(startKey, endKey);
    return NextResponse.json({ ok: true, startKey, endKey, ...result });
  } catch (err) {
    console.error('대체휴무 자동지급 크론 실패:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '대체휴무 자동지급 처리 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
