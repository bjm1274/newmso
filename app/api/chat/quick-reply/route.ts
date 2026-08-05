/**
 * 푸시 알림 답장(inline reply) API
 * 서비스워커의 알림 답장 버튼에서 호출됩니다.
 */
import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest, isAdminSession } from '@/lib/server-session';
import {
  messages as messagesTable,
  getD1Binding,
  getD1Drizzle,
  updateChatRoomLastMessage } from '@/lib/db';
import { assertChatRoomMember } from '@/lib/chat-room-membership';
import { dispatchChatPushForMessage } from '@/lib/chat-push-dispatch';

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

    // 공지방 쓰기는 관리자 전용
    if (String(room_id) === '00000000-0000-0000-0000-000000000000') {
      if (!isAdminSession(session.user)) {
        return NextResponse.json({ error: '공지 채널 메시지 작성 권한이 없습니다.' }, { status: 403 });
      }
    }

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

    // 채팅 push 디스패치 — 같은 런타임에서 직접 호출한다.
    //
    // 예전에는 /api/notifications/chat-push 로 서버간 fetch 를 했는데, 그 라우트는
    // readSessionFromRequest 로 세션을 요구한다. 서버에서 만든 요청에는 쿠키가 없으니
    // 언제나 401 로 끝났고, 큐에 적재하는 것도 아니어서 5분 주기 크론 폴백도
    // 회수할 것이 없었다. 결과적으로 quick-reply 로 보낸 메시지는 푸시가 아예 안 나갔다.
    // dispatchChatPushForMessage 는 message_id 기준 멱등이라 중복 호출도 안전하다.
    try {
      await dispatchChatPushForMessage({
        roomId: room_id,
        messageId,
        expectedSenderId: senderId,
      });
    } catch (err) {
      // 푸시 실패가 메시지 전송 자체를 되돌릴 이유는 없다 — 기록만 남긴다.
      console.warn('[quick-reply] chat push dispatch failed', err);
    }

    return NextResponse.json({ ok: true, message_id: messageId });
  } catch (error) {
    console.error('[quick-reply] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
