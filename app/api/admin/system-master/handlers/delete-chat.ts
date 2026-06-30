import { NextRequest, NextResponse } from 'next/server';
import {
  getD1Binding,
  getD1Drizzle,
  chat_rooms as chatRoomsTable,
  messages as messagesTable,
  polls as pollsTable,
  poll_votes as pollVotesTable,
  message_reactions as messageReactionsTable,
  message_bookmarks as messageBookmarksTable,
  pinned_messages as pinnedMessagesTable,
  room_read_cursors as roomReadCursorsTable,
  room_notification_settings as roomNotificationSettingsTable,
  eq,
  inArray } from '@/lib/db';

async function deleteChatRoomCascade(
  roomId: string,
): Promise<{ ok: true; deletedMessageCount: number; deletedPollCount: number } | { ok: false; error: string; status: number }> {
  const d1 = await getD1Binding();
  if (!d1) {
    return { ok: false, error: '[deleteChatRoomCascade] D1 binding not available', status: 500 };
  }
  const db = getD1Drizzle(d1);

  // 방 존재 확인
  const roomRows = await db
    .select({ id: chatRoomsTable.id })
    .from(chatRoomsTable)
    .where(eq(chatRoomsTable.id, roomId))
    .limit(1);
  if (roomRows.length === 0) {
    return { ok: false, error: 'Chat room not found', status: 404 };
  }

  // 삭제 카운트 수집용 메시지·투표 ID 조회
  const messageIdRows = await db
    .select({ id: messagesTable.id })
    .from(messagesTable)
    .where(eq(messagesTable.room_id, roomId));
  const pollIdRows = await db
    .select({ id: pollsTable.id })
    .from(pollsTable)
    .where(eq(pollsTable.room_id, roomId));

  const messageIds = messageIdRows.map((r) => r.id).filter(Boolean) as string[];
  const pollIds = pollIdRows.map((r) => r.id).filter(Boolean) as string[];

  // 자식 테이블 삭제 (자식 → 부모 순서)
  // 1) poll_votes (poll_id FK)
  if (pollIds.length > 0) {
    await db.delete(pollVotesTable).where(inArray(pollVotesTable.poll_id, pollIds));
  }

  // 2) message_reactions, message_bookmarks by message_id
  if (messageIds.length > 0) {
    await db.delete(messageReactionsTable).where(inArray(messageReactionsTable.message_id, messageIds));
    await db.delete(messageBookmarksTable).where(inArray(messageBookmarksTable.message_id, messageIds));
  }

  // 3) room 기준 나머지 자식 테이블
  await db.delete(messageBookmarksTable).where(eq(messageBookmarksTable.room_id, roomId));
  await db.delete(pinnedMessagesTable).where(eq(pinnedMessagesTable.room_id, roomId));
  await db.delete(roomReadCursorsTable).where(eq(roomReadCursorsTable.room_id, roomId));
  await db.delete(roomNotificationSettingsTable).where(eq(roomNotificationSettingsTable.room_id, roomId));
  await db.delete(pollsTable).where(eq(pollsTable.room_id, roomId));
  await db.delete(messagesTable).where(eq(messagesTable.room_id, roomId));

  // 4) chat_rooms (부모) 마지막 삭제
  await db.delete(chatRoomsTable).where(eq(chatRoomsTable.id, roomId));

  return { ok: true, deletedMessageCount: messageIds.length, deletedPollCount: pollIds.length };
}

export async function handleDelete(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const scope = searchParams.get('scope') || 'overview';
  const roomId = String(searchParams.get('roomId') || '').trim();
  const roomIdsParam = String(searchParams.get('roomIds') || '').trim();
  const roomIds = roomIdsParam
    ? Array.from(new Set(roomIdsParam.split(',').map((id) => id.trim()).filter(Boolean)))
    : [];

  if (scope !== 'chats' || (!roomId && roomIds.length === 0)) {
    return NextResponse.json({ error: 'Unsupported delete request' }, { status: 400 });
  }

  // 단일 삭제 (기존 동작)
  if (roomId && roomIds.length === 0) {
    const result = await deleteChatRoomCascade(roomId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({
      ok: true,
      deletedRoomId: roomId,
      deletedMessageCount: result.deletedMessageCount,
      deletedPollCount: result.deletedPollCount });
  }

  // 일괄 삭제 — 안전을 위해 한 번에 최대 500개로 제한
  const targets = roomIds.slice(0, 500);
  const deletedRoomIds: string[] = [];
  const failures: { roomId: string; error: string }[] = [];
  for (const id of targets) {
    const result = await deleteChatRoomCascade(id);
    if (result.ok) {
      deletedRoomIds.push(id);
    } else {
      failures.push({ roomId: id, error: result.error });
    }
  }

  return NextResponse.json({
    ok: failures.length === 0,
    deletedRoomIds,
    failureCount: failures.length,
    failures,
    requestedCount: targets.length });
}
