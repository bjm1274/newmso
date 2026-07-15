/**
 * 푸시 알림 답장(inline reply) API
 * 서비스워커의 알림 답장 버튼에서 호출됩니다.
 */
import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import {
  messages as messagesTable,
  getD1Binding,
  getD1Drizzle,
  updateChatRoomLastMessage } from '@/lib/db';
import { assertChatRoomMember } from '@/lib/chat-room-membership';

export async function POST(req: NextRequest) {
  try {
    const session = await readSessionFromRequest(req);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const senderId = String(session.user.id || session.user.user_id || '').trim();
    if (!senderId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { room_id, content } = body as { room_id?: string; content?: string };

    if (!room_id || !content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ error: 'room_id and content are required' }, { status: 400 });
    }

    const d1 = await getD1Binding();
    if (!d1) return NextResponse.json({ error: 'D1 binding not available' }, { status: 500 });
    const db = getD1Drizzle(d1);

    // 방 존재 + 멤버십(notice 예외) — 공용 헬퍼
    const membership = await assertChatRoomMember(db, room_id, senderId);
    if (!membership.ok) {
      return NextResponse.json({ error: membership.error }, { status: membership.status });
    }

    // 메시지 삽입 — D1에 직접 삽입 (sender_id = 세션, 위조 불가)
    const trimmedContent = content.trim().slice(0, 2000);
    const messageCreatedAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const messageId = crypto.randomUUID();
    await db.insert(messagesTable).values({
      id: messageId,
      room_id,
      sender_id: senderId,
      content: trimmedContent,
      created_at: messageCreatedAt });
    try {
      await updateChatRoomLastMessage(db, {
        room_id,
        created_at: messageCreatedAt,
        content: trimmedContent });
    } catch (err) {
      console.warn('[quick-reply] chat_rooms last_message D1 update failed', err);
    }

    // 채팅 push 트리거 (비동기, 실패해도 무방)
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://erp.pchos.kr';
      void fetch(`${appUrl}/api/notifications/chat-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: room_id, messageId }) });
    } catch {
      // push trigger 실패는 치명적 오류 아님
    }

    return NextResponse.json({ ok: true, message_id: messageId });
  } catch (error) {
    console.error('[quick-reply] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
