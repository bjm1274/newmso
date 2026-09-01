import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import { dispatchChatPushForMessage, processPendingChatPushJobs } from '@/lib/chat-push-dispatch';
import { consumeRateLimit } from '@/lib/rate-limit';


export const dynamic = 'force-dynamic';

// 채팅 푸시 트리거 — 메시지 1건당 1회 호출이 정상.
// 사용자당 1분 내 최대 90회 — 병원 업무 채팅 폭주만 차단, 정상 대화는 통과.
const RATE_LIMIT_MAX = 90;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rateKey = `chat-push:${String(session.user.id)}`;
    const rate = await consumeRateLimit(rateKey, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec ?? 60) } },
      );
    }

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

    const flushRest = new URL(request.url).searchParams.get('flush') === 'rest';
    if (flushRest) {
      // 송신 UX를 막지 않는다. 같은 프로세스에서 남은 큐를 바로 비운다.
      void processPendingChatPushJobs(15).catch((err) => {
        console.error('[chat-push] flush=rest failed:', err);
      });
    }

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
