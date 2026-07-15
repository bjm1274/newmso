import { NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import { createCalendarFeedToken } from '@/lib/calendar-feed-token';

export const dynamic = 'force-dynamic';

/**
 * GET /api/calendar/feed-token
 * 로그인 세션 직원 본인 ICS 구독 URL용 서명 토큰 발급.
 */
export async function GET(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    const staffId = String(session?.user?.id ?? session?.user?.user_id ?? '').trim();
    if (!staffId) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const token = await createCalendarFeedToken(staffId);
    const origin = new URL(request.url).origin;
    const url = `${origin}/api/calendar/feed?token=${encodeURIComponent(token)}`;

    return NextResponse.json({
      ok: true,
      token,
      url,
      expiresInDays: 90,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'token error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
