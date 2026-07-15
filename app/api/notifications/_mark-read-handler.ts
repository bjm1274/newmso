import { NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import { checkRateLimit, recordFailedAttempt } from '@/lib/rate-limit';
import { getD1Binding } from '@/lib/db';

/**
 * SSOT: 알림 읽음 처리 핸들러
 * ─────────────────────────────────────────────
 * 클라이언트 계약 (인앱·SW 공통):
 *   POST /api/notifications/mark-read
 *   body:
 *     { id: string }                 — 단건
 *     { notification_id: string }    — 단건 (SW/push 호환 별칭)
 *     { ids: string[] }              — 벌크
 *     { all: true }                  — 전체 미읽음
 *
 * 하위 호환: PUT /api/notifications 도 이 핸들러를 위임 호출한다.
 * 신규 클라이언트는 POST mark-read 만 사용한다.
 */

// 읽음 처리는 가벼운 UPDATE지만 폭주만 차단 — 사용자당 1분 내 최대 120회.
const RATE_LIMIT_MAX = 120;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

type MarkReadBody = {
  id?: unknown;
  notification_id?: unknown;
  ids?: unknown;
  all?: unknown;
};

function getUserId(session: { user?: { id?: unknown; user_id?: unknown } } | null): string | null {
  if (!session?.user) return null;
  const uid = String(session.user.id ?? session.user.user_id ?? '').trim();
  return uid || null;
}

function json(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * 공유 읽음 처리 핸들러 — POST mark-read / PUT /api/notifications 공용.
 */
export async function handleMarkNotificationsRead(request: Request): Promise<NextResponse> {
  try {
    const session = await readSessionFromRequest(request);
    const uid = getUserId(session);
    if (!uid) {
      return json({ ok: false, error: 'Unauthorized' }, 401);
    }

    const rateKey = `mark-read:${uid}`;
    const rate = await checkRateLimit(rateKey, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, error: '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec ?? 60) } },
      );
    }
    await recordFailedAttempt(rateKey, RATE_LIMIT_WINDOW_MS);

    const d1 = await getD1Binding();
    if (!d1) {
      return json({ ok: false, error: 'D1 binding not available' }, 500);
    }

    const body = ((await request.json().catch(() => null)) ?? {}) as MarkReadBody;
    const readAt = new Date().toISOString();

    if (body.all === true) {
      await d1
        .prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL')
        .bind(readAt, uid)
        .run();
      return json({ ok: true });
    }

    if (Array.isArray(body.ids) && body.ids.length > 0) {
      const ids = body.ids
        .map((id) => String(id ?? '').trim())
        .filter(Boolean);
      if (ids.length === 0) {
        return json({ ok: false, error: 'Invalid payload' }, 400);
      }
      const placeholders = ids.map(() => '?').join(',');
      const query = `UPDATE notifications SET read_at = ? WHERE user_id = ? AND id IN (${placeholders})`;
      await d1
        .prepare(query)
        .bind(readAt, uid, ...ids)
        .run();
      return json({ ok: true });
    }

    // 단건: id | notification_id (SW 호환)
    const singleId = String(body.id ?? body.notification_id ?? '').trim();
    if (singleId) {
      await d1
        .prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND id = ?')
        .bind(readAt, uid, singleId)
        .run();
      return json({ ok: true });
    }

    return json({ ok: false, error: 'Invalid payload' }, 400);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update notification.';
    console.error('[mark-read] error:', message);
    return json({ ok: false, error: 'Failed to update notification.' }, 500);
  }
}
