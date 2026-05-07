'use client';

import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { supabase } from '@/lib/supabase';
import type { ChatRoom } from '@/types';
import { fetchUnreadCountsForRoomIds } from './메신저데이터유틸';
import {
  getConversationRoomIdSet,
  NOTICE_ROOM_ID,
} from './메신저유틸';

type OptimisticUnreadFloor = {
  count: number;
  lastMessageAt: string | null;
};

type UnreadCountCacheEntry = {
  lastMessageAt: string | null;
  lastReadAt: string | null;
  count: number;
};

type UseChatReadStateSyncParams = {
  effectiveChatUserId: string | null | undefined;
  selectedRoomIdRef: MutableRefObject<string | null>;
  pendingBottomAlignRoomIdRef: MutableRefObject<string | null>;
  optimisticUnreadFloorRef: MutableRefObject<Record<string, OptimisticUnreadFloor>>;
  setRoomUnreadCounts: Dispatch<SetStateAction<Record<string, number>>>;
};

const UNREAD_REFRESH_MIN_INTERVAL_MS = 8_000;

export function useChatReadStateSync({
  effectiveChatUserId,
  selectedRoomIdRef,
  pendingBottomAlignRoomIdRef,
  optimisticUnreadFloorRef,
  setRoomUnreadCounts,
}: UseChatReadStateSyncParams) {
  const unreadCountCacheRef = useRef<Record<string, UnreadCountCacheEntry>>({});
  const unreadRefreshIdleHandleRef = useRef<number | null>(null);
  const unreadRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unreadRefreshInFlightRef = useRef(false);
  const lastUnreadRefreshAtRef = useRef(0);

  const resolveRoomUnreadCount = useCallback(
    (
      roomId: string,
      serverCount: number,
      lastReadAt: string | null,
      lastMessageAt: string | null,
    ) => {
      const optimistic = optimisticUnreadFloorRef.current[roomId];
      if (!optimistic || !Number.isFinite(optimistic.count) || optimistic.count <= 0) {
        return serverCount;
      }

      const optimisticTime = new Date(
        optimistic.lastMessageAt || lastMessageAt || '',
      ).getTime();
      const lastReadTime = new Date(lastReadAt || '').getTime();

      if (
        serverCount === 0 &&
        Number.isFinite(lastReadTime) &&
        Number.isFinite(optimisticTime) &&
        lastReadTime >= optimisticTime
      ) {
        delete optimisticUnreadFloorRef.current[roomId];
        return 0;
      }

      if (serverCount >= optimistic.count) {
        delete optimisticUnreadFloorRef.current[roomId];
        return serverCount;
      }

      return optimistic.count;
    },
    [optimisticUnreadFloorRef],
  );

  const updateUnreadForRooms = useCallback(
    async (rooms: ChatRoom[]) => {
      if (!effectiveChatUserId || !rooms?.length) return;
      if (unreadRefreshInFlightRef.current) return;
      if (
        lastUnreadRefreshAtRef.current > 0 &&
        Date.now() - lastUnreadRefreshAtRef.current < UNREAD_REFRESH_MIN_INTERVAL_MS
      ) {
        return;
      }

      unreadRefreshInFlightRef.current = true;
      try {
        const myRooms = rooms.filter((room: ChatRoom) => {
          if (room.id === NOTICE_ROOM_ID) return true;
          if (Array.isArray(room.members)) {
            return room.members.some((id: unknown) => String(id) === effectiveChatUserId);
          }
          return false;
        });
        if (!myRooms.length) return;

        const roomIds = myRooms.map((room: ChatRoom) => room.id);
        const { data: cursors } = await supabase
          .from('room_read_cursors')
          .select('room_id, last_read_at')
          .eq('user_id', effectiveChatUserId)
          .in('room_id', roomIds);

        const cursorMap: Record<string, string | null> = {};
        (cursors || []).forEach((cursor: Record<string, unknown>) => {
          cursorMap[String(cursor.room_id || '')] = (cursor.last_read_at as string | null) || null;
        });

        const activeRoomId = pendingBottomAlignRoomIdRef.current || selectedRoomIdRef.current;
        const openConversationRoomIds = getConversationRoomIdSet(activeRoomId, myRooms);
        const queryRoomIds = roomIds.filter(
          (roomId) => !openConversationRoomIds.has(roomId) && roomId !== activeRoomId,
        );
        const roomById = new Map(
          myRooms.map((room: ChatRoom) => [String(room.id || ''), room] as const),
        );

        const counts: Record<string, number> = {};
        if (activeRoomId) {
          counts[activeRoomId] = 0;
          delete optimisticUnreadFloorRef.current[activeRoomId];
        }
        openConversationRoomIds.forEach((roomId) => {
          counts[roomId] = 0;
          delete optimisticUnreadFloorRef.current[roomId];
        });

        const roomsToCount: string[] = [];
        queryRoomIds.forEach((roomId) => {
          const room = roomById.get(roomId) || null;
          const lastReadAt = cursorMap[roomId] || null;
          const lastMessageAt = String(room?.last_message_at || '').trim() || null;
          const cached = unreadCountCacheRef.current[roomId];

          if (
            cached &&
            cached.lastMessageAt === lastMessageAt &&
            cached.lastReadAt === lastReadAt
          ) {
            counts[roomId] = cached.count;
            return;
          }

          if (
            !lastMessageAt ||
            (lastReadAt &&
              Number.isFinite(new Date(lastMessageAt).getTime()) &&
              Number.isFinite(new Date(lastReadAt).getTime()) &&
              new Date(lastMessageAt).getTime() <= new Date(lastReadAt).getTime())
          ) {
            counts[roomId] = resolveRoomUnreadCount(
              roomId,
              0,
              lastReadAt,
              lastMessageAt,
            );
            unreadCountCacheRef.current[roomId] = {
              lastMessageAt,
              lastReadAt,
              count: 0,
            };
            return;
          }

          roomsToCount.push(roomId);
        });

        // Batch unread counts so refreshes do not issue one HEAD request per room.
        const unreadBatchCounts = await fetchUnreadCountsForRoomIds(supabase, {
          roomIds: roomsToCount,
          userId: effectiveChatUserId,
          cursorMap,
        });
        const allCountResults = roomsToCount.map(
          (roomId): [string, number] => [roomId, unreadBatchCounts[roomId] || 0],
        );
        allCountResults.forEach(([roomId, count]) => {
          const room = roomById.get(roomId) || null;
          const lastMessageAt =
            String(room?.last_message_at || '').trim() || null;
          counts[roomId] = resolveRoomUnreadCount(
            roomId,
            count,
            cursorMap[roomId] || null,
            lastMessageAt,
          );
          unreadCountCacheRef.current[roomId] = {
            lastMessageAt,
            lastReadAt: cursorMap[roomId] || null,
            count,
          };
        });

        Object.keys(unreadCountCacheRef.current).forEach((roomId) => {
          if (!roomById.has(roomId)) {
            delete unreadCountCacheRef.current[roomId];
            delete optimisticUnreadFloorRef.current[roomId];
          }
        });

        setRoomUnreadCounts((prev) => {
          const next = { ...counts };
          Object.keys(prev).forEach((roomId) => {
            if (prev[roomId] === 0 && next[roomId] !== undefined && next[roomId] !== 0) {
              if (openConversationRoomIds.has(roomId) || roomId === activeRoomId) {
                next[roomId] = 0;
              }
            }
          });
          return next;
        });
      } catch (error) {
        console.error('chat unread refresh failed:', error);
      } finally {
        lastUnreadRefreshAtRef.current = Date.now();
        unreadRefreshInFlightRef.current = false;
      }
    },
    [
      effectiveChatUserId,
      optimisticUnreadFloorRef,
      pendingBottomAlignRoomIdRef,
      resolveRoomUnreadCount,
      selectedRoomIdRef,
      setRoomUnreadCounts,
    ],
  );

  const clearScheduledUnreadRefresh = useCallback(() => {
    if (typeof window === 'undefined') return;
    const idleWindow = window as Window & typeof globalThis & {
      requestIdleCallback?: (callback: () => void) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (
      unreadRefreshIdleHandleRef.current !== null &&
      typeof idleWindow.cancelIdleCallback === 'function'
    ) {
      idleWindow.cancelIdleCallback(unreadRefreshIdleHandleRef.current);
    }
    unreadRefreshIdleHandleRef.current = null;
    if (unreadRefreshTimeoutRef.current) {
      clearTimeout(unreadRefreshTimeoutRef.current);
      unreadRefreshTimeoutRef.current = null;
    }
  }, []);

  const scheduleUnreadRefresh = useCallback(
    (rooms: ChatRoom[]) => {
      const snapshot = [...rooms];
      const runRefresh = () => {
        unreadRefreshIdleHandleRef.current = null;
        unreadRefreshTimeoutRef.current = null;
        void updateUnreadForRooms(snapshot);
      };

      if (typeof window === 'undefined') {
        runRefresh();
        return;
      }

      clearScheduledUnreadRefresh();
      const idleWindow = window as Window & typeof globalThis & {
        requestIdleCallback?: (callback: () => void) => number;
      };
      if (typeof idleWindow.requestIdleCallback === 'function') {
        unreadRefreshIdleHandleRef.current = idleWindow.requestIdleCallback(runRefresh);
        return;
      }
      unreadRefreshTimeoutRef.current = setTimeout(runRefresh, 120);
    },
    [clearScheduledUnreadRefresh, updateUnreadForRooms],
  );

  useEffect(() => {
    return () => {
      clearScheduledUnreadRefresh();
    };
  }, [clearScheduledUnreadRefresh]);

  return {
    updateUnreadForRooms,
    scheduleUnreadRefresh,
  };
}
