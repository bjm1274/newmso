'use client';

import { buildChatMessageSelect, CHAT_MESSAGE_OPTIONAL_COLUMNS } from '@/lib/chat-query-columns';
import { toUtcSqlTimestamp } from '@/lib/chat-read-cursors';
import { withMissingColumnsFallback } from '@/lib/db-compat';
import type { ChatRoom } from '@/types';
import {
  NOTICE_ROOM_ID,
  getConversationRoomIdSet,
  normalizeMemberIds } from './메신저유틸';

type ChatDataClient = {
  from: (table: string) => any;
};

type SelectChatMessagesExecutor<TData> = (params: {
  omittedColumns: ReadonlySet<string>;
  selectClause: string;
}) => PromiseLike<{ data: TData | null; error: unknown }>;

type FetchChatUnreadCountsParams = {
  rooms: ChatRoom[];
  userId: string | null | undefined;
  activeRoomId?: string | null;
  chunkSize?: number;
};

type FetchUnreadCountsForRoomIdsParams = {
  roomIds: string[];
  userId: string | null | undefined;
  cursorMap: Record<string, string | null | undefined>;
};

type UnreadMessageCountRow = {
  room_id?: string | null;
  created_at?: string | null;
};

const UNREAD_COUNT_PAGE_SIZE = 1000;

function chunkValues<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function normalizeRoomIds(roomIds: string[]): string[] {
  return Array.from(
    new Set(
      roomIds
        .map((roomId) => String(roomId || '').trim())
        .filter(Boolean),
    ),
  );
}

export async function fetchUnreadCountsForRoomIds(
  client: ChatDataClient,
  params: FetchUnreadCountsForRoomIdsParams,
): Promise<Record<string, number>> {
  const normalizedUserId = String(params.userId || '').trim();
  const roomIds = normalizeRoomIds(params.roomIds || []);
  const counts = Object.fromEntries(roomIds.map((roomId) => [roomId, 0])) as Record<string, number>;

  if (!normalizedUserId || roomIds.length === 0) return counts;

  // D1 query engine has a max filter node limit of 60.
  // Each cursor term `and(room_id.eq.X,created_at.gt.Y)` occupies 3 nodes.
  // Chunking at 15 rooms: 15 * 3 = 45 nodes (+1 top-level OR node) = 46 nodes, which is safely below 60.
  const CHUNK_SIZE = 15;

  for (const chunk of chunkValues(roomIds, CHUNK_SIZE)) {
    const filterTerms = chunk.map((roomId) => {
      const cursor = params.cursorMap[roomId];
      if (cursor) {
        // ISO/SQL 혼재 시 문자열 비교(created_at > last_read_at)가 깨지므로 SQL 포맷으로 통일
        const normalizedCursor = toUtcSqlTimestamp(cursor);
        return `and(room_id.eq.${roomId},created_at.gt."${normalizedCursor}")`;
      } else {
        return `room_id.eq.${roomId}`;
      }
    });

    const filterString = filterTerms.join(',');
    let offset = 0;

    for (;;) {
      const { data, error } = await client
        .from('messages')
        .select('room_id')
        .neq('sender_id', normalizedUserId)
        .eq('is_deleted', false)
        .or(filterString)
        .range(offset, offset + UNREAD_COUNT_PAGE_SIZE - 1);

      if (error) throw error;

      const page = (data || []) as { room_id?: string | null }[];
      page.forEach((row) => {
        const roomId = String(row.room_id || '').trim();
        if (roomId && counts[roomId] !== undefined) {
          counts[roomId] += 1;
        }
      });

      if (page.length < UNREAD_COUNT_PAGE_SIZE) break;
      offset += UNREAD_COUNT_PAGE_SIZE;
    }
  }

  return counts;
}

export async function selectChatMessagesWithFallback<TData>(
  execute: SelectChatMessagesExecutor<TData>,
) {
  return withMissingColumnsFallback<TData>(
    (omittedColumns) =>
      execute({
        omittedColumns,
        selectClause: buildChatMessageSelect(omittedColumns) }),
    [...CHAT_MESSAGE_OPTIONAL_COLUMNS],
    { cacheKey: 'chat:messages:select' },
  );
}

export async function fetchChatUnreadCountsByRoom(
  client: ChatDataClient,
  params: FetchChatUnreadCountsParams,
): Promise<Record<string, number>> {
  const normalizedUserId = String(params.userId || '').trim();
  if (!normalizedUserId) return {};

  const myRooms = (params.rooms || []).filter((room) => {
    if (String(room.id) === NOTICE_ROOM_ID) return true;
    return normalizeMemberIds(room.members).includes(normalizedUserId);
  });
  if (myRooms.length === 0) return {};

  const roomIds = myRooms.map((room) => String(room.id));
  const { data: cursors, error: cursorError } = await client
    .from('room_read_cursors')
    .select('room_id, last_read_at')
    .eq('user_id', normalizedUserId)
    .in('room_id', roomIds);

  if (cursorError) {
    throw cursorError;
  }

  const cursorMap: Record<string, string | null> = {};
  (cursors || []).forEach((cursor: Record<string, unknown>) => {
    cursorMap[String(cursor.room_id || '')] = (cursor.last_read_at as string | null) || null;
  });

  const activeRoomId = String(params.activeRoomId || '').trim();
  const openConversationRoomIds = getConversationRoomIdSet(activeRoomId, myRooms);
  const queryRoomIds = roomIds.filter(
    (roomId) => !openConversationRoomIds.has(roomId) && roomId !== activeRoomId,
  );

  // Batch unread counts so room-list refreshes do not issue one HEAD count per room.
  const queriedCounts = await fetchUnreadCountsForRoomIds(client, {
    roomIds: queryRoomIds,
    userId: normalizedUserId,
    cursorMap });
  const queriedEntries = Object.entries(queriedCounts);

  const activeEntries: Array<[string, number]> = roomIds
    .filter((roomId) => openConversationRoomIds.has(roomId) || roomId === activeRoomId)
    .map((roomId): [string, number] => [roomId, 0]);

  const counts = Object.fromEntries([...activeEntries, ...queriedEntries]) as Record<string, number>;

  if (activeRoomId) {
    counts[activeRoomId] = 0;
  }

  openConversationRoomIds.forEach((roomId) => {
    counts[roomId] = 0;
  });

  return counts;
}
