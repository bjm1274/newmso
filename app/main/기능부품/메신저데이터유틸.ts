'use client';

import { buildChatMessageSelect, CHAT_MESSAGE_OPTIONAL_COLUMNS } from '@/lib/chat-query-columns';
import { toUtcSqlTimestamp } from '@/lib/chat-timestamp';
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
  /**
   * 커서가 없는 방의 implicit 기준선 보관소(호출자가 ref 등으로 세션 동안 유지).
   *
   * 8차 D06-010: PC(`메신저방데이터훅.ts:124-146`)만 이 보정을 갖고 있었고 모바일이 쓰는
   * 이 함수에는 없었다. 커서가 없으면 필터가 `room_id.eq.X`(그 방 전체)가 되므로
   * 한 번도 열지 않은 방 — 특히 항상 목록에 포함되는 공지방 — 의 **전 히스토리**가
   * 안읽음으로 잡혔고, 폴링마다 그 방 메시지를 1000행 단위로 전부 내려받았다.
   *
   * 기준선은 '처음 본 시점의 last_message_at' 로 **한 번만** 고정해야 한다.
   * 매번 last_message_at 으로 다시 잡으면 그 방은 영원히 안읽음 0 이 된다.
   * 그래서 값을 함수 안에 두지 않고 호출자가 들고 있는 객체에 기록한다.
   * 미전달 시 동작은 예전 그대로(보정 없음)라 기존 호출자는 영향받지 않는다.
   */
  implicitBaselineStore?: Record<string, string | null>;
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

/**
 * 서버 집계로 방별 안 읽은 수를 가져온다.
 *
 * 실패하면 null 을 돌려 호출부가 기존 행-다운로드 경로로 되돌아가게 한다.
 * (라우트 배포 전 클라이언트나 오프라인 상황에서 배지가 통째로 0 이 되면 안 된다.)
 */
async function fetchUnreadCountsViaServer(
  params: FetchUnreadCountsForRoomIdsParams,
  roomIds: string[],
): Promise<Record<string, number> | null> {
  if (typeof fetch !== 'function') return null;
  try {
    const res = await fetch('/api/chat/unread-counts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        rooms: roomIds.map((roomId) => {
          const cursor = params.cursorMap[roomId];
          return { roomId, cursor: cursor ? toUtcSqlTimestamp(cursor) : null };
        }) }) });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as
      | { ok: true; counts: Record<string, number> }
      | { ok: false }
      | null;
    if (!json || json.ok !== true || !json.counts) return null;
    const counts = Object.fromEntries(roomIds.map((roomId) => [roomId, 0])) as Record<string, number>;
    for (const [roomId, n] of Object.entries(json.counts)) {
      if (roomId in counts) counts[roomId] = Number(n) || 0;
    }
    return counts;
  } catch {
    return null;
  }
}

export async function fetchUnreadCountsForRoomIds(
  client: ChatDataClient,
  params: FetchUnreadCountsForRoomIdsParams,
): Promise<Record<string, number>> {
  const normalizedUserId = String(params.userId || '').trim();
  const roomIds = normalizeRoomIds(params.roomIds || []);
  const counts = Object.fromEntries(roomIds.map((roomId) => [roomId, 0])) as Record<string, number>;

  if (!normalizedUserId || roomIds.length === 0) return counts;

  // 집계는 DB 가 한다. 예전에는 안 읽은 메시지 **행 자체를** 1000행씩 페이징해
  // 내려받아 클라이언트에서 세었다 — 메시지 1800건짜리 방이면 배지 숫자 하나에
  // 1800행, 그것도 방 목록 폴링마다 5초 간격으로. 아래 행-다운로드 경로는
  // 라우트가 없거나 실패했을 때를 위한 폴백으로만 남는다.
  const serverCounts = await fetchUnreadCountsViaServer(params, roomIds);
  if (serverCounts) return serverCounts;

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
      // `.neq('sender_id', me)` 는 SQL 로 `sender_id != ?` 가 되어(app/api/d1/query/route.ts:103)
      // sender_id 가 NULL 인 공지방 자동공지를 3값 논리로 통째로 버린다(10차 CHAT-01).
      // 서버 라우트 쪽과 같은 판정을 하도록, 발신자 필터는 SQL 이 아니라 여기서 한다.
      const { data, error } = await client
        .from('messages')
        .select('room_id, sender_id')
        .eq('is_deleted', false)
        .or(filterString)
        .range(offset, offset + UNREAD_COUNT_PAGE_SIZE - 1);

      if (error) throw error;

      const page = (data || []) as { room_id?: string | null; sender_id?: string | null }[];
      page.forEach((row) => {
        // sender_id 가 NULL/공백이면 공지봇 발신 → 내가 보낸 것이 아니므로 센다.
        if (String(row.sender_id || '').trim() === normalizedUserId) return;
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

  // 8차 D06-010: PC 에만 있던 implicit baseline 보정을 여기로 내려 PC/모바일이 같은 규칙을 쓴다.
  const baselineStore = params.implicitBaselineStore;
  const unreadCursorMap: Record<string, string | null | undefined> = { ...cursorMap };
  if (baselineStore) {
    const roomIdSet = new Set(roomIds);
    myRooms.forEach((room) => {
      const roomId = String(room.id || '').trim();
      if (!roomId) return;
      if (cursorMap[roomId]) {
        // 실제 커서가 생긴 방은 기준선을 버린다 — 이후로는 커서가 진실이다.
        delete baselineStore[roomId];
        return;
      }
      if (baselineStore[roomId] === undefined) {
        baselineStore[roomId] =
          String(room.last_message_at || room.created_at || '').trim() || null;
      }
    });
    Object.keys(baselineStore).forEach((roomId) => {
      if (!roomIdSet.has(roomId)) delete baselineStore[roomId];
    });
    Object.entries(baselineStore).forEach(([roomId, baseline]) => {
      if (!unreadCursorMap[roomId] && baseline) unreadCursorMap[roomId] = baseline;
    });
  }

  const activeRoomId = String(params.activeRoomId || '').trim();
  const openConversationRoomIds = getConversationRoomIdSet(activeRoomId, myRooms);
  const queryRoomIds = roomIds.filter(
    (roomId) => !openConversationRoomIds.has(roomId) && roomId !== activeRoomId,
  );

  // Batch unread counts so room-list refreshes do not issue one HEAD count per room.
  const queriedCounts = await fetchUnreadCountsForRoomIds(client, {
    roomIds: queryRoomIds,
    userId: normalizedUserId,
    cursorMap: unreadCursorMap });
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
