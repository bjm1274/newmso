import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import { processUnreadNotificationRepushServer } from '@/lib/notification-repush';
import { checkRateLimit, recordFailedAttempt } from '@/lib/rate-limit';


export const dynamic = 'force-dynamic';

// 미열람 재발송은 DB 스캔 + 푸시 fan-out으로 비싸다 — 사용자당 5분 내 최대 20회로 제한.
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rateKey = `repush-unread:${String(session.user.id)}`;
    const rate = await checkRateLimit(rateKey, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, error: '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec ?? 300) } },
      );
    }
    await recordFailedAttempt(rateKey, RATE_LIMIT_WINDOW_MS);

    const body = await request.json().catch(() => null);
    const limit = Math.min(Math.max(Number(body?.limit || 20), 1), 50);
    const result = await processUnreadNotificationRepushServer(limit, [String(session.user.id)]);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to repush unread notifications';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
