import { NextResponse } from 'next/server';
import { processPendingChatPushJobs } from '@/lib/chat-push-dispatch';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: Request) {
  if (!CRON_SECRET) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured', ok: false },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 5분 cron: 배치 20건 상한 — CPU/FCM 비용 가드. 즉시 디스패치가 대부분 비우므로 큐는 얇음.
    const result = await processPendingChatPushJobs(20);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : '채팅 푸시 처리 중 오류가 발생했습니다.';
    console.error('[cron/chat-push-dispatch]', message);
    return NextResponse.json(
      { error: message, ok: false },
      { status: 500 }
    );
  }
}
