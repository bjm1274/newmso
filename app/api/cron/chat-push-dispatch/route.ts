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
    // 15초 cron: 즉시 디스패치 실패분 회수. 배치 40건 — 병원 규모에서 FCM 부하 미미.
    const result = await processPendingChatPushJobs(40);
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
