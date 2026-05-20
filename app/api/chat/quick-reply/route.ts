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
  chat_rooms as chatRoomsTable,
  getD1Binding,
  getD1Drizzle,
  updateChatRoomLastMessage,
  resolveDataBackend,
  eq,
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
    type RoomResult = { id: string; members: unknown; type: string | null };
    let room: RoomResult | null = null;

    const quickReplyBackend = await resolveDataBackend();
    if (quickReplyBackend === 'd1') {
      const d1 = await getD1Binding();
      if (!d1) return NextResponse.json({ error: 'D1 binding not available' }, { status: 500 });
      const db = getD1Drizzle(d1);
      const rows = await db
        .select({
          id: chatRoomsTable.id,
          members: chatRoomsTable.members,
          type: chatRoomsTable.type,
        })
        .from(chatRoomsTable)
        .where(eq(chatRoomsTable.id, room_id))
        .limit(1);
      const rawRoom = rows[0] ?? null;
      if (rawRoom) {
        // D1 members는 TEXT(JSON) → 파싱
        let parsedMembers: unknown = rawRoom.members;
        if (typeof rawRoom.members === 'string' && rawRoom.members.length > 0) {
          try { parsedMembers = JSON.parse(rawRoom.members); } catch { parsedMembers = []; }
        }
        room = { id: rawRoom.id, members: parsedMembers, type: rawRoom.type };
      }
    } else {
      const { data, error: roomError } = await supabase
        .from('chat_rooms')
        .select('id, members, type')
        .eq('id', room_id)
        .maybeSingle();
      if (roomError || !data) {
        return NextResponse.json({ error: 'Room not found' }, { status: 404 });
      }
      room = data as RoomResult;
    }

    if (!room) {
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
    const messageCreatedAt = new Date().toISOString();
    let messageId: string;

    if (quickReplyBackend === 'd1') {
      // D1 모드: 직접 D1에 삽입
      const d1 = await getD1Binding();
      if (!d1) return NextResponse.json({ error: 'D1 binding not available' }, { status: 500 });
      const db = getD1Drizzle(d1);
      messageId = crypto.randomUUID();
      await db.insert(messagesTable).values({
        id: messageId,
        room_id,
        sender_id: senderId,
        content: trimmedContent,
        created_at: messageCreatedAt,
      });
      try {
        await updateChatRoomLastMessage(db, {
          room_id,
          created_at: messageCreatedAt,
          content: trimmedContent,
        });
      } catch (err) {
        console.warn('[quick-reply] chat_rooms last_message D1 update failed', err);
      }
    } else {
      // Supabase/dual-write 모드
      const { data: message, error: insertError } = await insertChatMessageWithFallback<{ id: string }>(
        supabase,
        { room_id, sender_id: senderId, content: trimmedContent },
        'id',
      );

      if (insertError || !message) {
        console.error('[quick-reply] insert error:', insertError);
        return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
      }

      messageId = message.id;

      // Phase 2.10 — D1 미러: 메시지 본문 + chat_rooms.last_message 갱신 (Postgres 트리거 대체)
      await mirrorRowsToD1(
        messagesTable,
        {
          id: messageId,
          room_id,
          sender_id: senderId,
          content: trimmedContent,
          created_at: messageCreatedAt,
        },
        { label: 'mirror:messages.quick-reply', onConflict: 'do_nothing' },
      );
      try {
        if (quickReplyBackend !== 'supabase') {
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
    }

    // 채팅 push 트리거 (비동기, 실패해도 무방)
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://erp.pchos.kr';
      void fetch(`${appUrl}/api/notifications/chat-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: room_id, messageId }),
      });
    } catch {
      // push trigger 실패는 치명적 오류 아님
    }

    return NextResponse.json({ ok: true, message_id: messageId });
  } catch (error) {
    console.error('[quick-reply] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
