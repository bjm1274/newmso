import { NextRequest, NextResponse } from 'next/server';
import {
  getD1Binding,
  getD1Drizzle,
  chat_rooms as chatRoomsTable,
  messages as messagesTable,
  and,
  desc,
  eq,
  sql,
} from '@/lib/db';
import {
  matchSearch,
  normalizeChatRoom,
  normalizeMessage,
  type ChatMessageRow,
  type ChatRoomRow,
  type StaffRow,
} from '../_shared';

export async function handleChats(
  request: NextRequest,
  staffMap: Map<string, StaffRow>,
  options: { limit: number; keyword: string; roomId: string },
) {
  const { limit, keyword, roomId } = options;
  const searchParams = request.nextUrl.searchParams;
  const chatLimit = Math.min(Math.max(Number(limit) || 1000, 1), 5000);
  const roomLimitRaw = Number(searchParams.get('roomLimit') || 0);
  const roomLimit = Math.min(Math.max(Number.isFinite(roomLimitRaw) && roomLimitRaw > 0 ? roomLimitRaw : 2000, 1), 10000);

  // 단어 필터(선택검색) — bannedWords 파라미터로 다중 키워드 OR 검색
  const bannedWordsParam = String(searchParams.get('bannedWords') || '').trim();
  const bannedWords = bannedWordsParam
    ? bannedWordsParam.split(',').map((w) => w.trim()).filter(Boolean)
    : [];
  const wantOnlyBannedRooms = searchParams.get('flaggedRoomsOnly') === '1' && bannedWords.length > 0;

  const d1 = await getD1Binding();
  if (!d1) return NextResponse.json({ error: '[system-master] D1 binding not available (chats)' }, { status: 500 });
  const db = getD1Drizzle(d1);

  // 1. 메시지 조회
  const msgBaseSelect = {
    id: messagesTable.id,
    room_id: messagesTable.room_id,
    sender_id: messagesTable.sender_id,
    content: messagesTable.content,
    file_url: messagesTable.file_url,
    is_deleted: messagesTable.is_deleted,
    created_at: messagesTable.created_at,
    edited_at: messagesTable.edited_at,
  } as const;

  let msgQuery = db.select(msgBaseSelect).from(messagesTable).$dynamic();
  const msgConditions: ReturnType<typeof and>[] = [];
  if (roomId) msgConditions.push(eq(messagesTable.room_id, roomId));
  // D1은 ilike 미지원 — like로 대체 (대소문자 무관 SQLite LIKE)
  if (keyword) msgConditions.push(sql`lower(${messagesTable.content}) like lower(${'%' + keyword + '%'})`);
  if (msgConditions.length > 0) msgQuery = msgQuery.where(and(...msgConditions));
  msgQuery = msgQuery.orderBy(desc(messagesTable.created_at)).limit(chatLimit);

  // 2. bannedWords 조회 (OR 검색)
  let bannedMsgRows: { room_id: string | null }[] = [];
  if (bannedWords.length > 0) {
    // SQLite LIKE OR 조건을 sql 태그로 조합
    const likeConditions = bannedWords.map(
      (word) => sql`lower(${messagesTable.content}) like lower(${'%' + word.replace(/[%_]/g, '\\$&') + '%'})`
    );
    const orExpr = likeConditions.length === 1
      ? likeConditions[0]
      : sql`(${likeConditions.reduce((acc, cur) => sql`${acc} OR ${cur}`)})`;
    bannedMsgRows = await db
      .select({ room_id: messagesTable.room_id })
      .from(messagesTable)
      .where(orExpr)
      .orderBy(desc(messagesTable.created_at))
      .limit(5000);
  }

  // 3. 채팅방 조회
  const roomRawRows = await db.select({
    id: chatRoomsTable.id,
    name: chatRoomsTable.name,
    type: chatRoomsTable.type,
    members: chatRoomsTable.members,
    created_at: chatRoomsTable.created_at,
    last_message_at: chatRoomsTable.last_message_at,
  }).from(chatRoomsTable).orderBy(desc(chatRoomsTable.created_at)).limit(roomLimit);

  const [msgRows] = await Promise.all([msgQuery]);

  // chat_rooms.members TEXT → JSON 파싱
  const rawRooms: ChatRoomRow[] = roomRawRows.map((row) => {
    const r = { ...row } as Record<string, unknown>;
    if (typeof r.members === 'string') {
      try { r.members = JSON.parse(r.members); } catch { r.members = []; }
    }
    return r as ChatRoomRow;
  });
  const rawMessages = msgRows as unknown as ChatMessageRow[];
  const bannedRoomIds = new Set<string>(
    bannedMsgRows.map((row) => String(row.room_id || '').trim()).filter(Boolean)
  );

  let rooms = rawRooms;
  if (wantOnlyBannedRooms) {
    rooms = rooms.filter((room) => bannedRoomIds.has(String(room.id || '')));
  }
  const roomMap = new Map<string, ChatRoomRow>(rooms.map((room) => [String(room.id), room]));
  const normalizedRooms = rooms
    .map((room) => normalizeChatRoom(room, staffMap))
    .sort((left, right) => {
      const leftTime = new Date(String(left.last_activity_at || left.created_at || 0)).getTime();
      const rightTime = new Date(String(right.last_activity_at || right.created_at || 0)).getTime();
      return rightTime - leftTime;
    });

  const filteredMessages = rawMessages
    .filter((message) => !keyword || matchSearch(message, keyword))
    .map((message) => normalizeMessage(message, roomMap, staffMap));

  return NextResponse.json({
    rooms: normalizedRooms,
    messages: filteredMessages,
    flaggedRoomIds: bannedWords.length > 0 ? Array.from(bannedRoomIds) : undefined,
  });
}
