/**
 * Phase 8-A — 사라진 7가지 인앱 알림을 서버에서 보강하는 cron 라우트.
 *
 * 호출: Bearer CRON_SECRET 인증 후 GET.
 *
 * ───────────────────────────────────────────────────────────────
 * 스케줄 안내 (wrangler.toml 미반영)
 * ───────────────────────────────────────────────────────────────
 * Cloudflare Workers Free Plan은 cron 5개 한도이며 현재 모두 점유 중이다
 * (wrangler.toml `[triggers].crons` 참조). 본 라우트를 자동 호출하려면:
 *
 *   1) Workers Paid Plan 전환 후 wrangler.toml에 매 5분 cron 추가:
 *        "[ASTERISK]/5 * * * *",   # /api/cron/inapp-notifications
 *      ([ASTERISK]은 실제 별표(*). JSDoc 종료 토큰 충돌을 피하기 위해 표기만 치환)
 *      또는 검사 빈도에 따라 매 1·10·15분 간격 선택.
 *
 *   2) Free Plan 유지 시 기존 cron 라우트 중 하나(예: push-subscription-cleanup)
 *      안에서 본 모듈의 `runInappNotificationJobs`를 추가 호출. 다만 하루
 *      1회만 실행되므로 알림 즉시성은 떨어진다.
 *
 *   3) 임시 외부 트리거: 외부 cron 서비스(GitHub Actions, cron-job.org 등)에서
 *      Bearer CRON_SECRET로 본 라우트를 직접 호출.
 *
 * 결정: 현재 단계에서는 (1)/(2)/(3) 중 사용자 선택. 라우트만 준비하고
 * wrangler.toml은 변경하지 않는다.
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
