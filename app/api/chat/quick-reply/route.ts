/**
 * 푸시 알림 답장(inline reply) API
 * 서비스워커의 알림 답장 버튼에서 호출됩니다.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { insertChatMessageWithFallback } from '@/lib/chat-message-write';
import { readSessionFromRequest } from '@/lib/server-session';
import {
  mirrorRowsToD1,
  messages as messagesTable,
  getD1Binding,
  getD1Drizzle,
  updateChatRoomLastMessage,
  resolveDataBackend,
} from '@/lib/db';

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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 방 존재 및 멤버 확인
    const { data: room, error: roomError } = await supabase
      .from('chat_rooms')
      .select('id, members, type')
      .eq('id', room_id)
      .maybeSingle();

    if (roomError || !room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    // notice 방(전체 공지)이 아닌 경우 멤버 확인
    const isNoticeRoom = room.type === 'notice';
    const members: unknown[] = Array.isArray(room.members) ? room.members : [];
    if (!isNoticeRoom && !members.some((m) => String(m) === senderId)) {
      return NextResponse.json({ error: 'Not a member of this room' }, { status: 403 });
    }

    // 메시지 삽입
    const trimmedContent = content.trim().slice(0, 2000);
    const { data: message, error: insertError } = await insertChatMessageWithFallback<{ id: string }>(
      supabase,
      {
        room_id,
        sender_id: senderId,
        content: trimmedContent,
      },
      'id',
    );

    if (insertError || !message) {
      console.error('[quick-reply] insert error:', insertError);
      return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
    }

    // Phase 2.10 — D1 미러: 메시지 본문 + chat_rooms.last_message 갱신 (Postgres 트리거 대체)
    const messageCreatedAt = new Date().toISOString();
    await mirrorRowsToD1(
      messagesTable,
      {
        id: message.id,
        room_id,
        sender_id: senderId,
        content: trimmedContent,
        created_at: messageCreatedAt,
      },
      { label: 'mirror:messages.quick-reply', onConflict: 'do_nothing' },
    );
    try {
      const backend = await resolveDataBackend();
      if (backend !== 'supabase') {
        const d1 = await getD1Binding();
        if (d1) {
          await updateChatRoomLastMessage(getD1Drizzle(d1), {
            room_id,
            created_at: messageCreatedAt,
            content: trimmedContent,
          });
        }
      }
    } catch (err) {
      console.warn('[quick-reply] chat_rooms last_message D1 sync failed', err);
    }

    // 채팅 push 트리거 (비동기, 실패해도 무방)
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://erp.pchos.kr';
      void fetch(`${appUrl}/api/notifications/chat-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: room_id, messageId: message.id }),
      });
    } catch {
      // push trigger 실패는 치명적 오류 아님
    }

    return NextResponse.json({ ok: true, message_id: message.id });
  } catch (error) {
    console.error('[quick-reply] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
