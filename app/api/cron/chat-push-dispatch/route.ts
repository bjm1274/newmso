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
    const result = await processPendingChatPushJobs(50);
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json(
      { error: '채팅 푸시 처리 중 오류가 발생했습니다.', ok: false },
      { status: 500 }
    );
  }
}
