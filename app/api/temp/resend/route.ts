import { NextResponse } from 'next/server';
import { getD1Binding, getD1Drizzle } from '@/lib/db';
import { processPendingChatPushJobs } from '@/lib/chat-push-dispatch';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const d1 = await getD1Binding();
    if (!d1) return NextResponse.json({ error: 'No D1 binding' }, { status: 500 });
    const db = getD1Drizzle(d1);
    
    // 대기중인 푸시 큐 즉시 발송 처리
    let dispatchResult = await processPendingChatPushJobs(50);

    return NextResponse.json({ ok: true, dispatchResult });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
