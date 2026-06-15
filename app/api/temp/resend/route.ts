import { NextResponse } from 'next/server';
import { getD1Binding, getD1Drizzle, messages, chat_push_jobs } from '@/lib/db';
import { eq, like, and, gte } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const d1 = await getD1Binding();
    if (!d1) return NextResponse.json({ error: 'No D1 binding' }, { status: 500 });
    const db = getD1Drizzle(d1);
    
    // KST 기준으로 오늘 날짜 가져오기 (예: '2026-06-15')
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());

    // 오늘 발송된 생일 공지 메시지 조회
    const rows = await db.select({ id: messages.id }).from(messages)
      .where(and(
        eq(messages.room_id, '00000000-0000-0000-0000-000000000000'),
        eq(messages.sender_name, '공지봇'),
        like(messages.content, '%생일%'),
        gte(messages.created_at, today)
      ));

    let enqueued = 0;
    const nowIso = new Date().toISOString();

    for (const row of rows) {
      await db.insert(chat_push_jobs).values({
        id: crypto.randomUUID(),
        message_id: row.id,
        room_id: '00000000-0000-0000-0000-000000000000',
        sender_id: null,
        created_at: nowIso,
        next_attempt_at: nowIso,
        attempt_count: 0
      }).onConflictDoNothing({ target: chat_push_jobs.message_id });
      enqueued++;
    }

    return NextResponse.json({ ok: true, enqueued, ids: rows.map(r => r.id) });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
