'use client';

import { supabase } from '@/lib/supabase';
import { CHAT_ROOM_SELECT } from '@/lib/chat-query-columns';
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

function normalizeCachedChatRooms(value: unknown): ChatRoom[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((room): room is ChatRoom => {
      if (!room || typeof room !== 'object') return false;
      return Boolean((room as Partial<ChatRoom>).id);
    })
    .slice(0, CHAT_ROOMS_CACHE_LIMIT);
}

/**
 * chat_rooms 테이블 전체 조회.
 * useChatRealtimeBridge.ts (3곳) + 메신저메시지조회훅.ts (1곳)에서 동일하게 반복되던
 * `supabase.from('chat_rooms').select(CHAT_ROOM_SELECT)` + 캐스팅 패턴을 중앙화.
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
      error: chatRoomsFetchCache.error,
    };
  }

  if (chatRoomsFetchInFlight) {
    return chatRoomsFetchInFlight;
  }

  chatRoomsFetchInFlight = (async () => {
    const result = (await supabase.from('chat_rooms').select(CHAT_ROOM_SELECT)) as {
      data: ChatRoom[] | null;
      error: unknown;
    };
    const nextResult = {
      data: result.data || [],
      error: result.error ?? null,
    };
    chatRoomsFetchCache = {
      ...nextResult,
      data: [...nextResult.data],
      fetchedAt: Date.now(),
    };
    return {
      data: [...nextResult.data],
      error: nextResult.error,
    };
  })().finally(() => {
    chatRoomsFetchInFlight = null;
  });

  return chatRoomsFetchInFlight;
}

/**
 * 방 목록에서 특정 id의 방을 부분 업데이트.
 * setChatRooms((prev) => prev.map(room => ...)) 패턴이 여러 파일에 반복되어 추출.
 *
 * @example
 * setChatRooms((prev) => updateRoomInList(prev, roomId, { last_message: text }));
 */
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
  const normalizedRooms = normalizeCachedChatRooms(rooms);
  chatRoomsFetchCache = {
    data: [...normalizedRooms],
    error: null,
    fetchedAt: Date.now(),
  };
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

export function updateRoomInList<T extends { id: string | number }>(
  rooms: T[],
  targetId: string,
  update: Partial<T>,
): T[] {
  return rooms.map((room) =>
    String(room.id) === String(targetId) ? { ...room, ...update } : room,
  );
}
