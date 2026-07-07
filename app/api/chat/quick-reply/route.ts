/**
 * 푸시 알림 답장(inline reply) API
 * 서비스워커의 알림 답장 버튼에서 호출됩니다.
 */
import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import {
  messages as messagesTable,
  chat_rooms as chatRoomsTable,
  getD1Binding,
  getD1Drizzle,
  updateChatRoomLastMessage,
  eq } from '@/lib/db';

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

    // 방 존재 및 멤버 확인
    type RoomResult = { id: string; members: unknown; type: string | null };
    let room: RoomResult | null = null;

    const d1 = await getD1Binding();
    if (!d1) return NextResponse.json({ error: 'D1 binding not available' }, { status: 500 });
    const db = getD1Drizzle(d1);
    const rows = await db
      .select({
        id: chatRoomsTable.id,
        members: chatRoomsTable.members,
        type: chatRoomsTable.type })
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

    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    // notice 방(전체 공지)이 아닌 경우 멤버 확인
    const isNoticeRoom = room.type === 'notice';
    const members: unknown[] = Array.isArray(room.members) ? room.members : [];
    if (!isNoticeRoom && !members.some((m) => String(m) === senderId)) {
      return NextResponse.json({ error: 'Not a member of this room' }, { status: 403 });
    }

    // 메시지 삽입 — D1에 직접 삽입
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
