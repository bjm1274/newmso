/**
 * Phase 8-A — 사라진 7가지 인앱 알림을 서버에서 보강하는 cron 라우트.
 *
 * 호출: Bearer CRON_SECRET 인증 후 GET.
 *
 * ───────────────────────────────────────────────────────────────
 * 스케줄 안내
 * ───────────────────────────────────────────────────────────────
 * Cloudflare Workers Free Plan은 cron 5개 한도라 본 라우트를 단독 cron으로
 * 등록하지 못한다. 대신 `/api/cron/push-subscription-cleanup`(KST 12:00)에서
 * `runInappNotificationJobs()`를 piggyback 호출한다. "영영 안 옴" 상태는
 * 해소되지만 즉시성은 1일/회 수준이다.
 *
 * 즉시성을 높이고 싶다면 다음 중 하나를 선택:
 *   1) 외부 cron(cron-job.org, GitHub Actions 등)에서 Bearer CRON_SECRET 로
 *      본 라우트를 5분 주기 호출.
 *   2) Workers Paid Plan 전환 후 wrangler.toml에 매 5분 cron 추가
 *      (별표는 cron expression — 본 JSDoc에서는 표기 회피).
 *
 * 본 라우트는 외부 트리거 또는 수동 호출용으로 유지된다.
 */
import { NextResponse } from 'next/server';
import { runInappNotificationJobs } from '@/lib/inapp-notification-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET || '';

export async function GET(request: Request) {
  if (!CRON_SECRET) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET is not configured' },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runInappNotificationJobs();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : '인앱 알림 보강 cron 처리 중 오류가 발생했습니다.';
    console.error('[cron/inapp-notifications] failed:', err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
