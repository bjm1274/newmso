import { NextResponse } from 'next/server';
import { getD1Binding, getD1Drizzle, messages, chat_push_jobs } from '@/lib/db';
import { eq, like, and, gte, desc } from 'drizzle-orm';
import { processPendingChatPushJobs } from '@/lib/chat-push-dispatch';
import { processBirthdayAnnouncements } from '@/lib/birthday-announcements';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const d1 = await getD1Binding();
    if (!d1) return NextResponse.json({ error: 'No D1 binding' }, { status: 500 });
    const db = getD1Drizzle(d1);
    
    // 1. 혹시 누락된 메시지가 있다면 생성 (이미 있다면 무시됨)
    const runResult = await processBirthdayAnnouncements();

    // 2. 가장 최근 생일 공지 10개 조회 (오늘 포함)
    const rows = await db.select({ id: messages.id }).from(messages)
      .where(and(
        eq(messages.room_id, '00000000-0000-0000-0000-000000000000'),
        eq(messages.sender_name, '공지봇'),
        like(messages.content, '%생일%')
      ))
      .orderBy(desc(messages.created_at))
      .limit(10);

    let enqueued = 0;
    const nowIso = new Date().toISOString();

    // 3. 무조건 다시 푸시 큐에 넣거나, 이미 있으면 attempt_count 0으로 리셋
    for (const row of rows) {
      await db.insert(chat_push_jobs).values({
        id: crypto.randomUUID(),
        message_id: row.id,
        room_id: '00000000-0000-0000-0000-000000000000',
        sender_id: null,
        created_at: nowIso,
        next_attempt_at: nowIso,
        attempt_count: 0
      }).onConflictDoUpdate({
        target: chat_push_jobs.message_id,
        set: {
          next_attempt_at: nowIso,
          attempt_count: 0,
          dead_lettered_at: null
        }
      });
      enqueued++;
    }

    // 4. 대기중인 푸시 큐 즉시 발송 처리
    let dispatchResult = await processPendingChatPushJobs(50);

    return NextResponse.json({ ok: true, runResult, enqueued, ids: rows.map(r => r.id), dispatchResult });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
