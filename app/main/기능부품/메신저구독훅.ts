'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { bindPageRefresh } from '@/lib/realtime-maintenance';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import type { ChatMessage, ChatRoom } from '@/types';
import { bindMockChatMessageInsert } from './메신저테스트이벤트';
import { getConversationRoomIdsByRoomId } from './메신저유틸';

// ─── 실시간 연결 상태 (메신저실시간훅에서 통합) ─────────────────────────────
export type ChatRealtimeState = 'idle' | 'connecting' | 'connected' | 'reconnecting';

export function useRoomNotificationSetting({
  selectedRoomId,
  effectiveChatUserId,
  userId,
}: {
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
      const { data, error } = await supabase
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
      const { error } = await supabase.from('room_notification_settings').upsert(
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
  presenceChannelRef: MutableRefObject<ReturnType<typeof supabase.channel> | null>;
  typingChannelRef: MutableRefObject<ReturnType<typeof supabase.channel> | null>;
  typingClearRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  typingPeersTimeoutRef: MutableRefObject<Record<string, ReturnType<typeof setTimeout>>>;
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
  setTypingUsers: Dispatch<SetStateAction<Record<string, string>>>;
  setChatRooms: Dispatch<SetStateAction<ChatRoom[]>>;
  fetchData: (options?: { force?: boolean }) => Promise<void>;
  updateUnreadForRooms: (rooms: ChatRoom[]) => void | Promise<void>;
  applyReadCursorFromRealtime?: (row: Record<string, unknown> | null | undefined) => void;
  refreshVisibleMessageReactions?: () => Promise<void>;
  refreshVisibleMessageBookmarks?: () => Promise<void>;
  refreshRoomPinnedMessages?: () => Promise<void>;
  refreshRoomPolls?: () => Promise<void>;
  handleIncomingRealtimeMessage: (row: ChatMessage) => Promise<void>;
  scheduleRealtimeReconnect: (scope: 'global' | 'room') => void;
  isRoomInSelectedConversation: (roomId: string | null | undefined, rooms?: ChatRoom[]) => boolean;
  emitTypingState: (isTyping: boolean) => void;
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
  typingChannelRef,
  typingClearRef,
  typingPeersTimeoutRef,
  syncChannelRef,
  chatRoomsRef,
  selectedRoomIdRef,
  fetchDataRef,
  globalRealtimeRetryTimerRef,
  roomRealtimeRetryTimerRef,
  setPresenceMap,
  setGlobalRealtimeState,
  setRoomRealtimeState,
  setTypingUsers,
  setChatRooms,
  fetchData,
  updateUnreadForRooms,
  handleIncomingRealtimeMessage,
  scheduleRealtimeReconnect,
  isRoomInSelectedConversation,
  emitTypingState,
  fetchMessageByIdWithRetry,
  sortChatRoomsWithNoticeFirst,
}: UseChatRealtimeSubscriptionsParams) {
  const fetchDataLatestRef = useRef(fetchData);
  const handleIncomingRealtimeMessageRef = useRef(handleIncomingRealtimeMessage);
  const isRoomInSelectedConversationRef = useRef(isRoomInSelectedConversation);
  const fetchMessageByIdWithRetryRef = useRef(fetchMessageByIdWithRetry);
  const globalRealtimeHealthyRef = useRef(false);
  const roomRealtimeHealthyRef = useRef(false);

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

  useEffect(() => {
    if (!(effectiveChatUserId || userId)) return;

    const channel = supabase.channel('chat-presence-hub', {
      config: { presence: { key: String(effectiveChatUserId || userId) } },
    });

    const syncPresence = () => {
      const next: Record<string, PresenceInfo> = {};
      const state = channel.presenceState();
      Object.values(state).forEach((entries: unknown[]) => {
        if (!Array.isArray(entries) || entries.length === 0) return;
        const latest = entries[entries.length - 1] as Partial<PresenceInfo>;
        if (!latest?.userId) return;
        next[String(latest.userId)] = {
          userId: String(latest.userId),
          name: latest.name || 'Unknown',
          roomId: latest.roomId || null,
          onlineAt: latest.onlineAt || new Date().toISOString(),
        };
      });
      setPresenceMap(next);
    };

    channel
      .on('presence', { event: 'sync' }, syncPresence)
      .subscribe(async (status: string) => {
        if (status !== 'SUBSCRIBED') return;
        presenceChannelRef.current = channel;
        await channel.track({
          userId: String(effectiveChatUserId || userId),
          name: userName || 'Unknown',
          roomId: selectedRoomId || null,
          onlineAt: new Date().toISOString(),
        });
      });

    return () => {
      if (presenceChannelRef.current === channel) {
        presenceChannelRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [effectiveChatUserId, presenceChannelRef, selectedRoomId, setPresenceMap, userId, userName]);

  useEffect(() => {
    if (!presenceChannelRef.current || !(effectiveChatUserId || userId)) return;
    presenceChannelRef.current.track({
      userId: String(effectiveChatUserId || userId),
      name: userName || 'Unknown',
      roomId: selectedRoomId || null,
      onlineAt: new Date().toISOString(),
    });
  }, [selectedRoomId, effectiveChatUserId, userId, userName, presenceChannelRef]);

  useEffect(() => {
    if (!userId) return;
    let disposed = false;
    setGlobalRealtimeState((prev) => (prev === 'connected' ? prev : 'connecting'));
    const channel = supabase
      .channel('chat-global-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload: Record<string, unknown>) => {
          const message = payload.new as ChatMessage;
          if (!message) return;
          await handleIncomingRealtimeMessage(message);
        }
      )
      .subscribe((status: string) => {
        if (disposed) return;
        if (status === 'SUBSCRIBED') {
          globalRealtimeHealthyRef.current = true;
          setGlobalRealtimeState('connected');
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          globalRealtimeHealthyRef.current = false;
          setGlobalRealtimeState('reconnecting');
          scheduleRealtimeReconnect('global');
          return;
        }
        if (status === 'CLOSED') {
          globalRealtimeHealthyRef.current = false;
          setGlobalRealtimeState('reconnecting');
        }
      });

    return () => {
      disposed = true;
      globalRealtimeHealthyRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [globalRealtimeRetryToken, handleIncomingRealtimeMessage, scheduleRealtimeReconnect, setGlobalRealtimeState, userId]);

  useEffect(() => {
    if (!selectedRoomId) {
      roomRealtimeHealthyRef.current = false;
      setRoomRealtimeState('idle');
      return;
    }

    let disposed = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const triggerDebouncedFetch = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (!disposed) void fetchDataLatestRef.current({ force: true });
      }, 300);
    };

    setRoomRealtimeState((prev) => (prev === 'connected' ? prev : 'connecting'));
    void fetchDataLatestRef.current();

    const channel = supabase.channel(`chat-realtime-${selectedRoomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${selectedRoomId}` }, (payload: Record<string, unknown>) => {
        const row = payload.new as ChatMessage;
        if (!row?.id) return;
        void handleIncomingRealtimeMessageRef.current(row);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `room_id=eq.${selectedRoomId}` }, triggerDebouncedFetch)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `room_id=eq.${selectedRoomId}` }, triggerDebouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_rooms' }, triggerDebouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_read_cursors' }, (payload: Record<string, unknown>) => {
        const updatedRow =
          (payload.new as Record<string, unknown> | null) ||
          (payload.old as Record<string, unknown> | null) ||
          null;
        const updatedRoomId = String(updatedRow?.room_id || '').trim();
        if (!updatedRoomId) return;
        // 현재 열린 대화방의 커서 변경(타인)은 fetchData로 읽음수 즉시 갱신
        if (isRoomInSelectedConversationRef.current(updatedRoomId, chatRoomsRef.current)) {
          const updatedUserId = updatedRow?.user_id;
          // 내 자신의 커서 변경은 무시 (이미 setRoomUnreadCounts로 처리됨)
          if (updatedUserId && String(updatedUserId) === String(effectiveChatUserId || '')) return;
          triggerDebouncedFetch();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, triggerDebouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_bookmarks', filter: `user_id=eq.${effectiveTodoUserId || userId}` }, triggerDebouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pinned_messages' }, triggerDebouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'polls' }, triggerDebouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, triggerDebouncedFetch)
      .subscribe((status: string) => {
        if (disposed) return;
        if (status === 'SUBSCRIBED') {
          roomRealtimeHealthyRef.current = true;
          setRoomRealtimeState('connected');
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          roomRealtimeHealthyRef.current = false;
          setRoomRealtimeState('reconnecting');
          scheduleRealtimeReconnect('room');
          return;
        }
        if (status === 'CLOSED') {
          roomRealtimeHealthyRef.current = false;
          setRoomRealtimeState('reconnecting');
        }
      });

    return () => {
      disposed = true;
      roomRealtimeHealthyRef.current = false;
      if (timeoutId) clearTimeout(timeoutId);
      supabase.removeChannel(channel);
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

  useEffect(() => {
    if (!selectedRoomId) {
      setTypingUsers({});
      if (typingChannelRef.current) {
        supabase.removeChannel(typingChannelRef.current);
        typingChannelRef.current = null;
      }
      return;
    }

    const channel = supabase.channel(`chat-typing-${selectedRoomId}`);
    typingChannelRef.current = channel;

    channel
      .on('broadcast', { event: 'typing' }, ({ payload }: { payload: Record<string, unknown> }) => {
        if (!payload || payload.roomId !== selectedRoomId || payload.userId === String(effectiveChatUserId || userId || '')) return;

        const peerId = String(payload.userId);
        if (typingPeersTimeoutRef.current[peerId]) {
          clearTimeout(typingPeersTimeoutRef.current[peerId]);
          delete typingPeersTimeoutRef.current[peerId];
        }

        if (!payload.isTyping) {
          setTypingUsers((prev) => {
            const next = { ...prev };
            delete next[peerId];
            return next;
          });
          return;
        }

        setTypingUsers((prev) => ({
          ...prev,
          [peerId]: (payload.name as string) || 'Unknown',
        }));

        typingPeersTimeoutRef.current[peerId] = setTimeout(() => {
          setTypingUsers((prev) => {
            const next = { ...prev };
            delete next[peerId];
            return next;
          });
          delete typingPeersTimeoutRef.current[peerId];
        }, 2500);
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          emitTypingState(false);
        }
      });

    return () => {
      if (typingClearRef.current) {
        clearTimeout(typingClearRef.current);
        typingClearRef.current = null;
      }
      Object.values(typingPeersTimeoutRef.current).forEach((timer) => clearTimeout(timer));
      typingPeersTimeoutRef.current = {};
      setTypingUsers({});
      if (typingChannelRef.current === channel) {
        typingChannelRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [
    selectedRoomId,
    effectiveChatUserId,
    userId,
    emitTypingState,
    setTypingUsers,
    typingChannelRef,
    typingClearRef,
    typingPeersTimeoutRef,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('erp-chat-sync');
    syncChannelRef.current = channel;
    channel.onmessage = (event) => {
      const payload = event.data;
      if (!payload?.roomId) return;
      if (
        payload.action !== 'message-sent' &&
        isRoomInSelectedConversation(String(payload.roomId), chatRoomsRef.current)
      ) {
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
                    last_message_at: new Date().toISOString(),
                  }
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
    };
  }, [chatRoomsRef, setChatRooms, sortChatRoomsWithNoticeFirst]);

  useEffect(() => {
    if (!userId) return;
    const refreshRealtimeFallback = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const roomRealtimeNeedsFallback = Boolean(selectedRoomId) && !roomRealtimeHealthyRef.current;
      const globalRealtimeNeedsFallback = !selectedRoomId && !globalRealtimeHealthyRef.current;
      if (roomRealtimeNeedsFallback) {
        void fetchDataLatestRef.current({ force: true });
      } else if (globalRealtimeNeedsFallback && chatRoomsRef.current.length > 0) {
        void updateUnreadForRooms(chatRoomsRef.current);
      }
    };

    const unbindRealtimeFallback = bindPageRefresh(refreshRealtimeFallback, { intervalMs: 15_000 });

    return () => {
      unbindRealtimeFallback();
    };
  }, [chatRoomsRef, selectedRoomId, updateUnreadForRooms, userId]);
}
