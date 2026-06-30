import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import { dispatchChatPushForMessage } from '@/lib/chat-push-dispatch';
import { checkRateLimit, recordFailedAttempt } from '@/lib/rate-limit';


export const dynamic = 'force-dynamic';

// 채팅 푸시 트리거 — 메시지 1건당 1회 호출이 정상.
// 사용자당 1분 내 최대 60회(초당 1회)까지만 허용해 폭주만 차단한다.
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rateKey = `chat-push:${String(session.user.id)}`;
    const rate = await checkRateLimit(rateKey, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec ?? 60) } },
      );
    }
    await recordFailedAttempt(rateKey, RATE_LIMIT_WINDOW_MS);

    const body = await request.json().catch(() => null);
    const roomId = String(body?.roomId || body?.room_id || '').trim();
    const messageId = String(body?.messageId || body?.message_id || '').trim();

    if (!roomId || !messageId) {
      return NextResponse.json({ error: 'roomId and messageId are required.' }, { status: 400 });
    }

    const result = await dispatchChatPushForMessage({
      roomId,
      messageId,
      expectedSenderId: String(session.user.id) });

    return NextResponse.json(result);
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message.includes('Only the message sender')) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    return NextResponse.json(
      { error: '알림 발송 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
