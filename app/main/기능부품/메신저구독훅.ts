'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { bindPageRefresh } from '@/lib/realtime-maintenance';
import { db } from '@/lib/db-client';
import { subscribeRealtime, subscribeRealtimeBatched } from '@/lib/realtime-bus';
import { toast } from '@/lib/toast';
import type { ChatMessage, ChatRoom } from '@/types';
import { bindMockChatMessageInsert } from './메신저테스트이벤트';
import { getConversationRoomIdsByRoomId } from './메신저유틸';

// ─── 실시간 연결 상태 (메신저실시간훅에서 통합) ─────────────────────────────
export type ChatRealtimeState = 'idle' | 'connecting' | 'connected' | 'reconnecting';

export function useRoomNotificationSetting({
  selectedRoomId,
  effectiveChatUserId,
  userId }: {
  selectedRoomId: string | null;
  effectiveChatUserId: string | null | undefined;
  userId: string | null | undefined;
}) {
  const [roomNotifyOn, setRoomNotifyOn] = useState(true);
  const roomNotifyRef = useRef(true);

  useEffect(() => {
    roomNotifyRef.current = roomNotifyOn;
  }, [roomNotifyOn]);

  useEffect(() => {
    const load = async () => {
      if (!(effectiveChatUserId || userId) || !selectedRoomId) {
        setRoomNotifyOn(true);
        return;
      }
      const { data, error } = await db
        .from('room_notification_settings')
        .select('notifications_enabled')
        .eq('user_id', effectiveChatUserId || userId)
        .eq('room_id', selectedRoomId)
        .maybeSingle();
      if (error) { setRoomNotifyOn(true); return; }
      setRoomNotifyOn(data?.notifications_enabled !== false);
    };
    void load();
  }, [effectiveChatUserId, selectedRoomId, userId]);

  const toggleRoomNotify = useCallback(async () => {
    if (!(effectiveChatUserId || userId) || !selectedRoomId) return;
    const previousValue = roomNotifyRef.current;
    const nextValue = !previousValue;
    setRoomNotifyOn(nextValue);
    roomNotifyRef.current = nextValue;
    try {
      const { error } = await db.from('room_notification_settings').upsert(
        { user_id: effectiveChatUserId || userId, room_id: selectedRoomId, notifications_enabled: nextValue },
        { onConflict: 'user_id,room_id' },
      );
      if (error) throw error;
    } catch {
      setRoomNotifyOn(previousValue);
      roomNotifyRef.current = previousValue;
      toast('채팅방 알림 설정을 저장하지 못했습니다.', 'error');
    }
  }, [effectiveChatUserId, selectedRoomId, userId]);

  return { roomNotifyOn, roomNotifyRef, setRoomNotifyOn, toggleRoomNotify };
}

export function useRealtimeConnectionMeta(
  selectedRoomId: string | null,
  globalRealtimeState: ChatRealtimeState,
  roomRealtimeState: ChatRealtimeState,
) {
  return useMemo(() => {
    const state = selectedRoomId ? roomRealtimeState : globalRealtimeState;
    if (state === 'connected') return { label: '실시간 연결됨', dotClassName: 'bg-emerald-500', textClassName: 'text-emerald-500' };
    if (state === 'reconnecting') return { label: '실시간 재연결 중', dotClassName: 'bg-amber-500', textClassName: 'text-amber-500' };
    if (state === 'connecting') return { label: '실시간 연결 중', dotClassName: 'bg-sky-500', textClassName: 'text-sky-500' };
    return { label: '실시간 대기 중', dotClassName: 'bg-[var(--toss-gray-4)]', textClassName: 'text-[var(--toss-gray-4)]' };
  }, [globalRealtimeState, roomRealtimeState, selectedRoomId]);
}
// ────────────────────────────────────────────────────────────────────────────

type PresenceInfo = {
  userId: string;
  name: string;
  roomId: string | null;
  onlineAt: string;
};

type UseChatRealtimeSubscriptionsParams = {
  userId: string | null | undefined;
  userName: string | null | undefined;
  effectiveChatUserId: string | null | undefined;
  effectiveTodoUserId: string | null | undefined;
  selectedRoomId: string | null;
  globalRealtimeRetryToken: number;
  roomRealtimeRetryToken: number;
  presenceChannelRef: MutableRefObject<ReturnType<typeof db.channel> | null>;
  syncChannelRef: MutableRefObject<BroadcastChannel | null>;
  chatRoomsRef: MutableRefObject<ChatRoom[]>;
  visibleMessageIdsRef?: MutableRefObject<Set<string>>;
  visiblePollIdsRef?: MutableRefObject<Set<string>>;
  selectedRoomIdRef: MutableRefObject<string | null>;
  fetchDataRef: MutableRefObject<((options?: { force?: boolean }) => Promise<void>) | null>;
  globalRealtimeRetryTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  roomRealtimeRetryTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setPresenceMap: Dispatch<SetStateAction<Record<string, PresenceInfo>>>;
  setGlobalRealtimeState: Dispatch<SetStateAction<ChatRealtimeState>>;
  setRoomRealtimeState: Dispatch<SetStateAction<ChatRealtimeState>>;
  setChatRooms: Dispatch<SetStateAction<ChatRoom[]>>;
  fetchData: (options?: { force?: boolean }) => Promise<void>;
  updateUnreadForRooms: (rooms: ChatRoom[]) => void | Promise<void>;
  applyReadCursorFromRealtime?: (row: Record<string, unknown> | null | undefined) => void;
  refreshReadCursorsForRoom?: (roomId: string | null | undefined) => Promise<void>;
  refreshVisibleMessageReactions?: () => Promise<void>;
  refreshVisibleMessageBookmarks?: () => Promise<void>;
  refreshRoomPinnedMessages?: () => Promise<void>;
  refreshRoomPolls?: () => Promise<void>;
  handleIncomingRealtimeMessage: (row: ChatMessage) => Promise<void>;
  scheduleRealtimeReconnect: (scope: 'global' | 'room') => void;
  isRoomInSelectedConversation: (roomId: string | null | undefined, rooms?: ChatRoom[]) => boolean;
  fetchMessageByIdWithRetry: (messageId: string, attempts?: number) => Promise<ChatMessage | null>;
  sortChatRoomsWithNoticeFirst: (rooms: ChatRoom[]) => ChatRoom[];
};

export function useChatRealtimeSubscriptions({
  userId,
  userName,
  effectiveChatUserId,
  effectiveTodoUserId,
  selectedRoomId,
  globalRealtimeRetryToken,
  roomRealtimeRetryToken,
  presenceChannelRef,
  syncChannelRef,
  chatRoomsRef,
  selectedRoomIdRef,
  fetchDataRef,
  globalRealtimeRetryTimerRef,
  roomRealtimeRetryTimerRef,
  setPresenceMap,
  setGlobalRealtimeState,
  setRoomRealtimeState,
  setChatRooms,
  fetchData,
  updateUnreadForRooms,
  applyReadCursorFromRealtime,
  refreshReadCursorsForRoom,
  refreshVisibleMessageReactions,
  refreshVisibleMessageBookmarks,
  refreshRoomPinnedMessages,
  refreshRoomPolls,
  handleIncomingRealtimeMessage,
  scheduleRealtimeReconnect,
  isRoomInSelectedConversation,
  fetchMessageByIdWithRetry,
  sortChatRoomsWithNoticeFirst }: UseChatRealtimeSubscriptionsParams) {
  const fetchDataLatestRef = useRef(fetchData);
  const handleIncomingRealtimeMessageRef = useRef(handleIncomingRealtimeMessage);
  const isRoomInSelectedConversationRef = useRef(isRoomInSelectedConversation);
  const fetchMessageByIdWithRetryRef = useRef(fetchMessageByIdWithRetry);
  const applyReadCursorFromRealtimeRef = useRef(applyReadCursorFromRealtime);
  const refreshReadCursorsForRoomRef = useRef(refreshReadCursorsForRoom);
  const refreshVisibleMessageReactionsRef = useRef(refreshVisibleMessageReactions);
  const refreshVisibleMessageBookmarksRef = useRef(refreshVisibleMessageBookmarks);
  const refreshRoomPinnedMessagesRef = useRef(refreshRoomPinnedMessages);
  const refreshRoomPollsRef = useRef(refreshRoomPolls);
  const globalRealtimeHealthyRef = useRef(false);
  const roomRealtimeHealthyRef = useRef(false);
  const lastRoomInitialFetchRef = useRef<string | null>(null);

  useEffect(() => {
    fetchDataLatestRef.current = fetchData;
  }, [fetchData]);

  useEffect(() => {
    handleIncomingRealtimeMessageRef.current = handleIncomingRealtimeMessage;
  }, [handleIncomingRealtimeMessage]);

  useEffect(() => {
    isRoomInSelectedConversationRef.current = isRoomInSelectedConversation;
  }, [isRoomInSelectedConversation]);

  useEffect(() => {
    fetchMessageByIdWithRetryRef.current = fetchMessageByIdWithRetry;
  }, [fetchMessageByIdWithRetry]);

  useEffect(() => {
    applyReadCursorFromRealtimeRef.current = applyReadCursorFromRealtime;
  }, [applyReadCursorFromRealtime]);

  useEffect(() => {
    refreshReadCursorsForRoomRef.current = refreshReadCursorsForRoom;
  }, [refreshReadCursorsForRoom]);

  useEffect(() => {
    refreshVisibleMessageReactionsRef.current = refreshVisibleMessageReactions;
  }, [refreshVisibleMessageReactions]);

  useEffect(() => {
    refreshVisibleMessageBookmarksRef.current = refreshVisibleMessageBookmarks;
  }, [refreshVisibleMessageBookmarks]);

  useEffect(() => {
    refreshRoomPinnedMessagesRef.current = refreshRoomPinnedMessages;
  }, [refreshRoomPinnedMessages]);

  useEffect(() => {
    refreshRoomPollsRef.current = refreshRoomPolls;
  }, [refreshRoomPolls]);

  useEffect(() => {
    return () => {
      if (globalRealtimeRetryTimerRef.current) {
        clearTimeout(globalRealtimeRetryTimerRef.current);
        globalRealtimeRetryTimerRef.current = null;
      }
      if (roomRealtimeRetryTimerRef.current) {
        clearTimeout(roomRealtimeRetryTimerRef.current);
        roomRealtimeRetryTimerRef.current = null;
      }
    };
  }, [globalRealtimeRetryTimerRef, roomRealtimeRetryTimerRef]);

  // Phase 5-C-2 — presence 채널 비활성화.
  // polling으로는 즉각적 online/offline 추적 불가. presence 표시는 사라짐.
  // (UI는 빈 presenceMap을 받아 자동으로 표시 안 됨)
  useEffect(() => {
    setPresenceMap({});
  }, [setPresenceMap]);

  // Phase 5-C-3 — global messages 채널 → polling.
  // 모든 방의 messages 변경 감지 시 fetchData refresh.
  // payload 기반 increment 처리 불가 → 콜백에서 메시지 재조회.
  useEffect(() => {
    if (!userId) return;
    setGlobalRealtimeState('connected');
    globalRealtimeHealthyRef.current = true;
    // 다른 방 신규 메시지 알림(배지)용 백그라운드 폴링.
    // 활성 방이 없으면 fetchData(force)로 방 목록 last_message + unread 를 함께 갱신.
    // 활성 방이 있으면 room 채널이 현재 방 메시지를 처리하므로 unread 배지만 갱신하고,
    // 다른 방 last_message 는 chat_rooms 구독/알림 경로에 맡긴다.
    // 본인 send 시 pokeChannel('chat-global-messages')로 즉시 트리거.
    const unsubscribe = subscribeRealtime(
      'chat-global-messages',
      [{ table: 'messages' }],
      () => {
        if (!selectedRoomIdRef.current) {
          void fetchDataLatestRef.current({ force: true });
          return;
        }
        void updateUnreadForRooms(chatRoomsRef.current);
      },
      { pollIntervalMs: 15000 },
    );
    return () => {
      globalRealtimeHealthyRef.current = false;
      unsubscribe();
    };
  }, [globalRealtimeRetryToken, setGlobalRealtimeState, updateUnreadForRooms, userId]);

  useEffect(() => {
    if (!selectedRoomId) {
      roomRealtimeHealthyRef.current = false;
      lastRoomInitialFetchRef.current = null;
      setRoomRealtimeState('idle');
      return;
    }

    let disposed = false;
    let messageRefreshTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let metadataRefreshTimeoutId: ReturnType<typeof setTimeout> | null = null;
    const triggerDebouncedMessageFetch = () => {
      if (messageRefreshTimeoutId) clearTimeout(messageRefreshTimeoutId);
      messageRefreshTimeoutId = setTimeout(() => {
        if (!disposed) void fetchDataLatestRef.current({ force: true });
      }, 300);
    };
    const triggerDebouncedMetadataRefresh = (refresh: (() => Promise<void>) | undefined) => {
      if (!refresh) return;
      if (metadataRefreshTimeoutId) clearTimeout(metadataRefreshTimeoutId);
      metadataRefreshTimeoutId = setTimeout(() => {
        if (!disposed) void refresh();
      }, 300);
    };
    setRoomRealtimeState((prev) => (prev === 'connected' ? prev : 'connecting'));
    if (lastRoomInitialFetchRef.current !== selectedRoomId) {
      lastRoomInitialFetchRef.current = selectedRoomId;
      void fetchDataLatestRef.current();
    }

    // Room-scoped realtime: only this selected room's channels.
    // Server emits both bare `messages` (global unread) and `messages:room_id=eq.X`.
    // Filtered keys ensure other-room traffic does not full-refetch open conversation.
    // message_reactions / poll_votes lack reliable room_id on every write path → table-level
    // (metadata-only refresh, not full message list).
    roomRealtimeHealthyRef.current = true;
    setRoomRealtimeState('connected');
    const roomFilter = `room_id=eq.${selectedRoomId}`;
    const unsubscribe = subscribeRealtimeBatched(
      `chat-realtime-${selectedRoomId}`,
      [
        { table: 'messages', filter: roomFilter },
        { table: 'room_read_cursors', filter: roomFilter },
        { table: 'message_reactions' },
        { table: 'message_bookmarks', filter: roomFilter },
        { table: 'pinned_messages', filter: roomFilter },
        { table: 'polls', filter: roomFilter },
        { table: 'poll_votes' },
      ],
      (payloads) => {
        if (disposed) return;
        const tables = new Set(
          payloads.map((p) => String((p as { table?: string }).table || '')),
        );
        if (tables.has('messages')) {
          triggerDebouncedMessageFetch();
        }
        if (tables.has('room_read_cursors')) {
          // 읽음 커서 변경은 전체 fetchData(메시지·방목록 전부 재조회 — 버벅임 주범)
          // 대신 현재 방의 읽음 표시(read receipt)만 가볍게 갱신한다.
          triggerDebouncedMetadataRefresh(
            () => refreshReadCursorsForRoomRef.current?.(selectedRoomId) ?? Promise.resolve(),
          );
        }
        if (tables.has('message_reactions')) {
          triggerDebouncedMetadataRefresh(refreshVisibleMessageReactionsRef.current);
        }
        if (tables.has('message_bookmarks')) {
          triggerDebouncedMetadataRefresh(refreshVisibleMessageBookmarksRef.current);
        }
        if (tables.has('pinned_messages')) {
          triggerDebouncedMetadataRefresh(refreshRoomPinnedMessagesRef.current);
        }
        if (tables.has('polls') || tables.has('poll_votes')) {
          triggerDebouncedMetadataRefresh(refreshRoomPollsRef.current);
        }
      },
      // 본인 send 시 pokeChannel로 즉시 트리거하므로 주기에 의존하지 않음.
      // WS 활성 시 폴링 자체는 꺼지며, 여기 값은 fallback 하한용.
      { pollIntervalMs: 5000 },
    );

    return () => {
      disposed = true;
      roomRealtimeHealthyRef.current = false;
      if (messageRefreshTimeoutId) clearTimeout(messageRefreshTimeoutId);
      if (metadataRefreshTimeoutId) clearTimeout(metadataRefreshTimeoutId);
      unsubscribe();
    };
  }, [
    selectedRoomId,
    roomRealtimeRetryToken,
    effectiveTodoUserId,
    userId,
    scheduleRealtimeReconnect,
    effectiveChatUserId,
    setRoomRealtimeState,
    chatRoomsRef,
  ]);

  // Phase 5-C-2 → Phase 6: typing은 useChatTypingD1이 전담.
  // 구독훅에서는 typing 관련 처리를 하지 않음.

  useEffect(() => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('erp-chat-sync');
    syncChannelRef.current = channel;
    channel.onmessage = (event) => {
      const payload = event.data;
      if (!payload?.roomId && payload?.action !== 'rooms-refresh') return;
      if (payload.action === 'rooms-refresh') {
        void fetchDataLatestRef.current?.({ force: true });
        return;
      }
      const roomId = String(payload.roomId);
      const isSelectedConversation = isRoomInSelectedConversation(roomId, chatRoomsRef.current);
      if (payload.action === 'message-read' && isSelectedConversation) {
        void refreshReadCursorsForRoomRef.current?.(roomId);
      } else if (payload.action === 'message-sent' && isSelectedConversation) {
        void fetchDataRef.current?.();
      } else if (chatRoomsRef.current.length > 0) {
        void updateUnreadForRooms(chatRoomsRef.current);
      }
    };

    return () => {
      if (syncChannelRef.current === channel) {
        syncChannelRef.current = null;
      }
      channel.close();
    };
  }, [chatRoomsRef, fetchDataRef, isRoomInSelectedConversation, syncChannelRef, updateUnreadForRooms]);

  useEffect(() => {
    const unbindMockInsert = bindMockChatMessageInsert((detail) => {
      const rows = Array.isArray(detail?.rows) ? detail.rows : detail?.row ? [detail.row] : [];
      rows.forEach((row) => {
        if (!row?.id) return;
        void handleIncomingRealtimeMessage(row);
      });
    });
    return () => {
      unbindMockInsert();
    };
  }, [handleIncomingRealtimeMessage]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleRoomsRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string }>).detail;
      if (detail?.action !== 'rooms-refresh') return;
      void fetchDataLatestRef.current?.({ force: true });
    };
    window.addEventListener('erp-chat-sync', handleRoomsRefresh as EventListener);

    const handleChatNotification = (event: Event) => {
      const detail = (event as CustomEvent<{
        room_id?: string;
        message_id?: string;
        body?: string;
        data?: Record<string, unknown>;
      }>).detail;
      const roomId = String(detail?.room_id || detail?.data?.room_id || '').trim();
      if (!roomId) return;

      const knownRoom = chatRoomsRef.current.some((room: ChatRoom) => String(room.id) === roomId);
      const previewText = String(detail?.body || '').trim();
      if (knownRoom && previewText) {
        const conversationRoomIds = getConversationRoomIdsByRoomId(roomId, chatRoomsRef.current);
        const targetConversationRoomIds = Array.from(
          new Set([...(conversationRoomIds.length > 0 ? conversationRoomIds : [roomId]), roomId].filter(Boolean)),
        );
        setChatRooms((prev) => {
          if (!prev.some((room: ChatRoom) => targetConversationRoomIds.includes(String(room.id)))) return prev;
          return sortChatRoomsWithNoticeFirst(
            prev.map((room: ChatRoom) =>
              targetConversationRoomIds.includes(String(room.id))
                ? {
                    ...room,
                    last_message: previewText || room.last_message,
                    last_message_preview: previewText || room.last_message_preview,
                    last_message_at: new Date().toISOString() }
                : room
            )
          );
        });
      }

      const messageId = String(detail?.message_id || detail?.data?.message_id || detail?.data?.id || '').trim();
      if (!knownRoom) return;

      void (async () => {
        if (!messageId) {
          if (isRoomInSelectedConversationRef.current(roomId, chatRoomsRef.current)) {
            await fetchDataLatestRef.current({ force: true });
          }
          return;
        }
        const data = await fetchMessageByIdWithRetryRef.current(messageId);
        if (!data) {
          if (isRoomInSelectedConversationRef.current(roomId, chatRoomsRef.current)) {
            await fetchDataLatestRef.current({ force: true });
          }
          return;
        }
        await handleIncomingRealtimeMessageRef.current(data);
      })();
    };

    window.addEventListener('erp-chat-notification', handleChatNotification as EventListener);
    return () => {
      window.removeEventListener('erp-chat-notification', handleChatNotification as EventListener);
      window.removeEventListener('erp-chat-sync', handleRoomsRefresh as EventListener);
    };
  }, [chatRoomsRef, setChatRooms, sortChatRoomsWithNoticeFirst]);

  useEffect(() => {
    if (!userId) return;
    const refreshRealtimeFallback = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const roomRealtimeNeedsFallback = Boolean(selectedRoomId) && !roomRealtimeHealthyRef.current;
      const globalRealtimeNeedsFallback = !selectedRoomId && !globalRealtimeHealthyRef.current;
      if (roomRealtimeNeedsFallback) {
        scheduleRealtimeReconnect('room');
      } else if (globalRealtimeNeedsFallback && chatRoomsRef.current.length > 0) {
        void updateUnreadForRooms(chatRoomsRef.current);
      }
    };

    const unbindRealtimeFallback = bindPageRefresh(refreshRealtimeFallback, { intervalMs: 15_000 });

    return () => {
      unbindRealtimeFallback();
    };
  }, [chatRoomsRef, scheduleRealtimeReconnect, selectedRoomId, updateUnreadForRooms, userId]);
}
