import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import { checkRateLimit, recordFailedAttempt } from '@/lib/rate-limit';
import {
  getD1Binding,
  getD1Drizzle,
  notifications as notificationsTable,
  eq,
  and,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

// 읽음 처리는 가벼운 단건 UPDATE지만 폭주만 차단 — 사용자당 1분 내 최대 120회.
const RATE_LIMIT_MAX = 120;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rateKey = `mark-read:${String(session.user.id)}`;
    const rate = await checkRateLimit(rateKey, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec ?? 60) } },
      );
    }
    await recordFailedAttempt(rateKey, RATE_LIMIT_WINDOW_MS);

    const body = (await request.json().catch(() => null)) as
      | { notification_id?: string; id?: string }
      | null;
    const notificationId = String(body?.notification_id || body?.id || '').trim();

    if (!notificationId) {
      return NextResponse.json({ error: 'notification_id is required.' }, { status: 400 });
    }

    const userId = String(session.user.id);
    const readAt = new Date().toISOString();

    const d1 = await getD1Binding();
    if (!d1) throw new Error('[mark-read] D1 binding not available');
    const db = getD1Drizzle(d1);
    await db
      .update(notificationsTable)
      .set({ read_at: readAt })
      .where(
        and(
          eq(notificationsTable.id, notificationId),
          eq(notificationsTable.user_id, userId),
        ),
      );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update notification.' }, { status: 500 });
  }
}
