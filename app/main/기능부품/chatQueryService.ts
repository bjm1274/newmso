'use client';

import { db } from '@/lib/db-client';
import {
  CHAT_ROOM_OPTIONAL_COLUMNS,
  buildChatRoomSelect } from '@/lib/chat-query-columns';
import { withMissingColumnsFallback } from '@/lib/db-compat';
import type { ChatRoom } from '@/types';

const CHAT_ROOMS_CACHE_KEY = 'newmso:chat-rooms:v1';

function roomsCacheKey(userId?: string | null): string {
  const id = String(userId || '').trim();
  return id ? `${CHAT_ROOMS_CACHE_KEY}:${id}` : CHAT_ROOMS_CACHE_KEY;
}
const CHAT_ROOMS_CACHE_LIMIT = 200;
const CHAT_ROOMS_FETCH_TTL_MS = 60_000; // D1 비용 절감: 30초 → 60초 (WS 활성 시 실시간 업데이트는 pokeChannel로 즉시 반영)

type ChatRoomsFetchResult = { data: ChatRoom[]; error: unknown };
type FetchAllChatRoomsOptions = {
  force?: boolean;
  userId?: string | null;
};

type CacheEntry = { data: ChatRoom[]; error: unknown; fetchedAt: number };
const chatRoomsFetchCacheByUser = new Map<string, CacheEntry>();
const chatRoomsFetchInFlightByUser = new Map<string, Promise<ChatRoomsFetchResult>>();

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

function coerceMembersField(raw: unknown): string[] | null {
  if (raw == null) return null;
  let parsed: unknown = raw;
  if (typeof parsed === 'string') {
    const trimmed = parsed.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return trimmed ? [trimmed] : [];
    }
  }
  if (Array.isArray(parsed)) {
    return parsed.map((id) => String(id ?? '').trim()).filter(Boolean);
  }
  if (parsed && typeof parsed === 'object') {
    return Object.values(parsed as Record<string, unknown>)
      .map((id) => String(id ?? '').trim())
      .filter(Boolean);
  }
  return null;
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

  const fromMembers = coerceMembersField(dynamicRoom.members);
  if (fromMembers) {
    return { ...withPreview, members: fromMembers };
  }
  const fromMemberIds = coerceMembersField(dynamicRoom.member_ids);
  if (fromMemberIds) {
    return { ...withPreview, members: fromMemberIds };
  }
  return withPreview;
}

export function normalizeChatRoomsForClient(rooms: ChatRoom[]): ChatRoom[] {
  if (!Array.isArray(rooms)) return [];
  return rooms
    .filter((room): room is ChatRoom => Boolean(room?.id))
    .map(normalizeChatRoomForClient);
}

/** 삭제 후 즉시 목록 재조회 시 stale TTL 캐시 무력화 */
export function invalidateChatRoomsFetchCache(userId?: string | null) {
  const uid = String(userId || '').trim();
  if (uid) {
    chatRoomsFetchCacheByUser.delete(uid);
    chatRoomsFetchInFlightByUser.delete(uid);
  } else {
    chatRoomsFetchCacheByUser.clear();
    chatRoomsFetchInFlightByUser.clear();
  }
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
  const userKey = String(options.userId || '').trim() || 'anon';
  const now = Date.now();
  const cached = chatRoomsFetchCacheByUser.get(userKey);
  if (
    !options.force &&
    cached &&
    now - cached.fetchedAt < CHAT_ROOMS_FETCH_TTL_MS
  ) {
    return {
      data: [...cached.data],
      error: cached.error };
  }

  const inFlight = chatRoomsFetchInFlightByUser.get(userKey);
  if (inFlight && !options.force) {
    return inFlight;
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
    chatRoomsFetchCacheByUser.set(userKey, {
      ...nextResult,
      data: [...nextResult.data],
      fetchedAt: Date.now() });
    return {
      data: [...nextResult.data],
      error: nextResult.error };
  })();

  chatRoomsFetchInFlightByUser.set(userKey, fetchPromise);
  fetchPromise.finally(() => {
    if (chatRoomsFetchInFlightByUser.get(userKey) === fetchPromise) {
      chatRoomsFetchInFlightByUser.delete(userKey);
    }
  });

  return fetchPromise;
}

export function readCachedChatRooms(userId?: string | null): ChatRoom[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(roomsCacheKey(userId)) || '[]');
    return normalizeCachedChatRooms(parsed);
  } catch {
    return [];
  }
}

export function writeCachedChatRooms(rooms: ChatRoom[], userId?: string | null) {
  const userKey = String(userId || '').trim() || 'anon';
  const normalizedRooms = normalizeChatRoomsForClient(rooms).slice(0, CHAT_ROOMS_CACHE_LIMIT);
  chatRoomsFetchCacheByUser.set(userKey, {
    data: [...normalizedRooms],
    error: null,
    fetchedAt: Date.now() });
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      roomsCacheKey(userId),
      JSON.stringify(normalizedRooms),
    );
  } catch {
    // ignore cache failures
  }
}
