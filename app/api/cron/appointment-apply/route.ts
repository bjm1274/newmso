/**
 * 예약 인사발령 자동 적용 크론.
 *
 * 발령일이 미래인 발령은 등록 시 `personnel_appointments` 에 `status='대기'` 로만 들어가고
 * `staff_members` 는 갱신되지 않는다. 이 크론이 매일 돌면서 발령일이 도래한 대기 발령을
 * 등록 화면과 동일한 규칙으로 반영한다.
 *
 * 이게 없으면 미래 발령은 발령일이 지나도 영원히 "미반영" 으로 남아 수동 재처리가 필요했다.
 *
 * 스케줄은 wrangler.toml [triggers] crons 와 cloudflare-worker.ts 의
 * CRON_ROUTES_BY_SCHEDULE 양쪽에 등록되어야 실제로 실행된다(한쪽만 있으면 무동작).
 */
import { NextResponse } from 'next/server';
import { applyDueAppointments } from '@/lib/appointment-apply';
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
    const result = await applyDueAppointments(todayKey);
    if (result.failed > 0 || result.errors.length > 0) {
      console.error('[cron/appointment-apply] 일부 발령 반영 실패:', result.errors);
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('예약 발령 자동 적용 크론 실패:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '예약 발령 처리 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
