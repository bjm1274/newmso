import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import { checkRateLimit, recordFailedAttempt } from '@/lib/rate-limit';
import { processPendingChatPushJobs } from '@/lib/chat-push-dispatch';


export const dynamic = 'force-dynamic';

// 큐 회수는 본질적으로 안전한 백그라운드 작업(이미 cron 이 전 직원 대상으로 동일 수행)이므로
// 인증된 사용자면 누구나 호출 허용 — 단, 폭주 방지로 분당 30회로 제한.
// (이전엔 admin/특권만 허용 → 일반 직원 클라이언트의 focus/online/전송후 flush 가 100% 403 으로
//  큐 회수가 전혀 안 됐다. limit 상한 25 로 1회 처리량도 제한.)
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rateKey = `chat-push-flush:${String(session.user.id)}`;
    const rate = await checkRateLimit(rateKey, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, error: '요청이 너무 잦습니다.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec ?? 60) } },
      );
    }
    await recordFailedAttempt(rateKey, RATE_LIMIT_WINDOW_MS);

    const body = await request.json().catch(() => null);
    const limit = Math.min(Math.max(Number(body?.limit || 10), 1), 25);
    const result = await processPendingChatPushJobs(limit);

    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Failed to flush pending chat push jobs' },
      { status: 500 },
    );
  }
}
