'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildChatMessageSelect, CHAT_MESSAGE_OPTIONAL_COLUMNS } from '@/lib/chat-query-columns';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import type { ChatRoom } from '@/types';
import {
  NOTICE_ROOM_ID,
  getConversationRoomIdSet,
  normalizeMemberIds,
} from './메신저유틸';

type ChatDataClient = Pick<SupabaseClient<any, any, any>, 'from'>;

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
  chunkSize?: number;
};

type UnreadMessageCountRow = {
  room_id?: string | null;
  created_at?: string | null;
};

const UNREAD_COUNT_ROOM_CHUNK_SIZE = 80;
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

function getTimestamp(value: string | null | undefined): number {
  const time = new Date(String(value || '')).getTime();
  return Number.isFinite(time) ? time : Number.NaN;
}

function pickEarliestTimestamp(values: Array<string | null | undefined>): string | null {
  let selected: string | null = null;
  let selectedTime = Number.POSITIVE_INFINITY;
  values.forEach((value) => {
    const time = getTimestamp(value);
    if (Number.isFinite(time) && time < selectedTime) {
      selected = String(value);
      selectedTime = time;
    }
  });
  return selected;
}

async function fetchUnreadCandidateRows(
  client: ChatDataClient,
  roomIds: string[],
  userId: string,
  afterCreatedAt: string | null,
  chunkSize = UNREAD_COUNT_ROOM_CHUNK_SIZE,
): Promise<UnreadMessageCountRow[]> {
  const rows: UnreadMessageCountRow[] = [];

  const normalizedChunkSize = Math.max(1, Math.floor(Number(chunkSize) || UNREAD_COUNT_ROOM_CHUNK_SIZE));

  for (const roomIdChunk of chunkValues(roomIds, normalizedChunkSize)) {
    let offset = 0;
    for (;;) {
      let query = client
        .from('messages')
        .select('room_id, created_at')
        .in('room_id', roomIdChunk)
        .neq('sender_id', userId)
        .eq('is_deleted', false);

      if (afterCreatedAt) {
        query = query.gt('created_at', afterCreatedAt);
      }

      const { data, error } = await query
        .order('created_at', { ascending: true })
        .range(offset, offset + UNREAD_COUNT_PAGE_SIZE - 1);
      if (error) throw error;

      const page = (data || []) as UnreadMessageCountRow[];
      rows.push(...page);
      if (page.length < UNREAD_COUNT_PAGE_SIZE) break;
      offset += UNREAD_COUNT_PAGE_SIZE;
    }
  }

  return rows;
}

export async function fetchUnreadCountsForRoomIds(
  client: ChatDataClient,
  params: FetchUnreadCountsForRoomIdsParams,
): Promise<Record<string, number>> {
  const normalizedUserId = String(params.userId || '').trim();
  const roomIds = normalizeRoomIds(params.roomIds || []);
  const counts = Object.fromEntries(roomIds.map((roomId) => [roomId, 0])) as Record<string, number>;

  if (!normalizedUserId || roomIds.length === 0) return counts;

  const noCursorRoomIds = roomIds.filter((roomId) => !params.cursorMap[roomId]);
  const withCursorRoomIds = roomIds.filter((roomId) => Boolean(params.cursorMap[roomId]));

  if (noCursorRoomIds.length > 0) {
    const rows = await fetchUnreadCandidateRows(client, noCursorRoomIds, normalizedUserId, null, params.chunkSize);
    rows.forEach((row) => {
      const roomId = String(row.room_id || '').trim();
      if (roomId && counts[roomId] !== undefined) counts[roomId] += 1;
    });
  }

  if (withCursorRoomIds.length > 0) {
    const earliestCursor = pickEarliestTimestamp(
      withCursorRoomIds.map((roomId) => params.cursorMap[roomId] || null),
    );
    const rows = await fetchUnreadCandidateRows(client, withCursorRoomIds, normalizedUserId, earliestCursor, params.chunkSize);
    rows.forEach((row) => {
      const roomId = String(row.room_id || '').trim();
      if (!roomId || counts[roomId] === undefined) return;
      const createdAtTime = getTimestamp(row.created_at || null);
      const lastReadTime = getTimestamp(params.cursorMap[roomId] || null);
      if (
        !Number.isFinite(lastReadTime) ||
        (Number.isFinite(createdAtTime) && createdAtTime > lastReadTime)
      ) {
        counts[roomId] += 1;
      }
    });
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
        selectClause: buildChatMessageSelect(omittedColumns),
      }),
    [...CHAT_MESSAGE_OPTIONAL_COLUMNS],
    { cacheKey: 'chat:messages:select' },
  );
}

export function selectFallbackChatRoomId(rooms: ChatRoom[]): string | null {
  const safeRooms = Array.isArray(rooms)
    ? rooms.filter((room): room is ChatRoom => Boolean(room?.id))
    : [];

  const preferredRoom =
    safeRooms.find((room) => String(room.id) === NOTICE_ROOM_ID) ||
    safeRooms[0] ||
    null;

  return preferredRoom ? String(preferredRoom.id) : null;
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
    cursorMap,
    chunkSize: params.chunkSize,
  });
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
