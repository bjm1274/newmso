'use client';

import { db } from '@/lib/db-client';
import {
  CHAT_ROOM_OPTIONAL_COLUMNS,
  buildChatRoomSelect } from '@/lib/chat-query-columns';
import { withMissingColumnsFallback } from '@/lib/db-compat';
import type { ChatRoom } from '@/types';

const CHAT_ROOMS_CACHE_KEY = 'newmso:chat-rooms:v1';
const CHAT_ROOMS_CACHE_LIMIT = 200;
const CHAT_ROOMS_FETCH_TTL_MS = 5_000;

type ChatRoomsFetchResult = { data: ChatRoom[]; error: unknown };
type FetchAllChatRoomsOptions = {
  force?: boolean;
};

let chatRoomsFetchInFlight: Promise<ChatRoomsFetchResult> | null = null;
let chatRoomsFetchCache: { data: ChatRoom[]; error: unknown; fetchedAt: number } | null = null;

function sanitizePreviewField(raw: unknown): string | null {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  if (t === '삭제된 메시지입니다.' || t.startsWith('삭제된 메시지')) return '삭제된 메시지입니다.';
  if (/^file:\/\//i.test(t) || /^blob:/i.test(t) || /^[A-Za-z]:[\\/]/.test(t)) return '파일';
  if (/^https?:\/\//i.test(t) && /\.(png|jpe?g|gif|webp|pdf|docx?|xlsx?|zip|hwp)(\?|#|$)/i.test(t)) {
    return '파일';
  }
  return t;
}

function normalizeChatRoomForClient(room: ChatRoom): ChatRoom {
  const dynamicRoom = room as ChatRoom & { members?: unknown; member_ids?: unknown };
  const preview = sanitizePreviewField(dynamicRoom.last_message_preview);
  const last = sanitizePreviewField(dynamicRoom.last_message);
  const withPreview: ChatRoom = {
    ...room,
    last_message_preview: preview ?? (last as string | null),
    last_message: last ?? (preview as string | null),
  };
  if (Array.isArray(dynamicRoom.members)) return withPreview;
  if (!Array.isArray(dynamicRoom.member_ids)) return withPreview;
  return {
    ...withPreview,
    members: dynamicRoom.member_ids };
}

export function normalizeChatRoomsForClient(rooms: ChatRoom[]): ChatRoom[] {
  if (!Array.isArray(rooms)) return [];
  return rooms
    .filter((room): room is ChatRoom => Boolean(room?.id))
    .map(normalizeChatRoomForClient);
}

/** 삭제 후 즉시 목록 재조회 시 stale TTL 캐시 무력화 */
export function invalidateChatRoomsFetchCache() {
  chatRoomsFetchCache = null;
  chatRoomsFetchInFlight = null;
}

function normalizeCachedChatRooms(value: unknown): ChatRoom[] {
  if (!Array.isArray(value)) return [];
  return normalizeChatRoomsForClient(
    value
      .filter((room): room is ChatRoom => {
        if (!room || typeof room !== 'object') return false;
        return Boolean((room as Partial<ChatRoom>).id);
      })
      .slice(0, CHAT_ROOMS_CACHE_LIMIT),
  );
}

/**
 * chat_rooms 테이블 전체 조회.
 * useChatRealtimeBridge.ts (3곳) + 메신저메시지조회훅.ts (1곳)에서 동일하게 반복되던
 * `db.from('chat_rooms').select(CHAT_ROOM_SELECT)` + 캐스팅 패턴을 중앙화.
 */
export async function fetchAllChatRooms(
  options: FetchAllChatRoomsOptions = {},
): Promise<ChatRoomsFetchResult> {
  const now = Date.now();
  if (
    !options.force &&
    chatRoomsFetchCache &&
    now - chatRoomsFetchCache.fetchedAt < CHAT_ROOMS_FETCH_TTL_MS
  ) {
    return {
      data: [...chatRoomsFetchCache.data],
      error: chatRoomsFetchCache.error };
  }

  if (chatRoomsFetchInFlight && !options.force) {
    return chatRoomsFetchInFlight;
  }

  const fetchPromise = (async () => {
    const result = await withMissingColumnsFallback<ChatRoom[]>(
      (omittedColumns) =>
        db.from('chat_rooms').select(buildChatRoomSelect(omittedColumns)) as PromiseLike<{
          data: ChatRoom[] | null;
          error: unknown;
        }>,
      [...CHAT_ROOM_OPTIONAL_COLUMNS],
      { cacheKey: 'chat:rooms:select' },
    );
    const nextResult = {
      data: normalizeChatRoomsForClient(result.data || []),
      error: result.error ?? null };
    chatRoomsFetchCache = {
      ...nextResult,
      data: [...nextResult.data],
      fetchedAt: Date.now() };
    return {
      data: [...nextResult.data],
      error: nextResult.error };
  })();

  chatRoomsFetchInFlight = fetchPromise;
  fetchPromise.finally(() => {
    if (chatRoomsFetchInFlight === fetchPromise) {
      chatRoomsFetchInFlight = null;
    }
  });

  return fetchPromise;
}

export function readCachedChatRooms(): ChatRoom[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CHAT_ROOMS_CACHE_KEY) || '[]');
    return normalizeCachedChatRooms(parsed);
  } catch {
    return [];
  }
}

export function writeCachedChatRooms(rooms: ChatRoom[]) {
  const normalizedRooms = normalizeChatRoomsForClient(rooms).slice(0, CHAT_ROOMS_CACHE_LIMIT);
  chatRoomsFetchCache = {
    data: [...normalizedRooms],
    error: null,
    fetchedAt: Date.now() };
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      CHAT_ROOMS_CACHE_KEY,
      JSON.stringify(normalizedRooms),
    );
  } catch {
    // ignore cache failures
  }
}
