'use client';

import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { bindPageRefresh } from '@/lib/realtime-maintenance';
import { supabase } from '@/lib/supabase';
import type { ChatMessage, ChatRoom } from '@/types';
import type { ChatRealtimeState } from './메신저실시간훅';

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
  selectedRoomIdRef: MutableRefObject<string | null>;
  fetchDataRef: MutableRefObject<(() => Promise<void>) | null>;
  globalRealtimeRetryTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  roomRealtimeRetryTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setPresenceMap: Dispatch<SetStateAction<Record<string, PresenceInfo>>>;
  setGlobalRealtimeState: Dispatch<SetStateAction<ChatRealtimeState>>;
  setRoomRealtimeState: Dispatch<SetStateAction<ChatRealtimeState>>;
  setTypingUsers: Dispatch<SetStateAction<Record<string, string>>>;
  setChatRooms: Dispatch<SetStateAction<ChatRoom[]>>;
  fetchData: () => Promise<void>;
  updateUnreadForRooms: (rooms: ChatRoom[]) => void | Promise<void>;
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
          setGlobalRealtimeState('connected');
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setGlobalRealtimeState('reconnecting');
          scheduleRealtimeReconnect('global');
          return;
        }
        if (status === 'CLOSED') {
          setGlobalRealtimeState('reconnecting');
        }
      });

    return () => {
      disposed = true;
      supabase.removeChannel(channel);
    };
  }, [globalRealtimeRetryToken, handleIncomingRealtimeMessage, scheduleRealtimeReconnect, setGlobalRealtimeState, userId]);

  useEffect(() => {
    if (!selectedRoomId) {
      setRoomRealtimeState('idle');
      return;
    }

    let disposed = false;
    setRoomRealtimeState((prev) => (prev === 'connected' ? prev : 'connecting'));
    void fetchDataLatestRef.current();

    const channel = supabase.channel(`chat-realtime-${selectedRoomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${selectedRoomId}` }, (payload: Record<string, unknown>) => {
        const row = payload.new as ChatMessage;
        if (!row?.id) return;
        void handleIncomingRealtimeMessageRef.current(row);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `room_id=eq.${selectedRoomId}` }, () => fetchDataLatestRef.current())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `room_id=eq.${selectedRoomId}` }, () => fetchDataLatestRef.current())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_rooms' }, () => fetchDataLatestRef.current())
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
          void fetchDataLatestRef.current();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => fetchDataLatestRef.current())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_bookmarks', filter: `user_id=eq.${effectiveTodoUserId || userId}` }, () => fetchDataLatestRef.current())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pinned_messages' }, () => fetchDataLatestRef.current())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'polls' }, () => fetchDataLatestRef.current())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, () => fetchDataLatestRef.current())
      .subscribe((status: string) => {
        if (disposed) return;
        if (status === 'SUBSCRIBED') {
          setRoomRealtimeState('connected');
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRoomRealtimeState('reconnecting');
          scheduleRealtimeReconnect('room');
          return;
        }
        if (status === 'CLOSED') {
          setRoomRealtimeState('reconnecting');
        }
      });

    return () => {
      disposed = true;
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
    if (typeof window === 'undefined') return;
    const handleMockRealtimeInsert = (event: Event) => {
      const detail = (event as CustomEvent<{ rows?: ChatMessage[]; row?: ChatMessage }>).detail;
      const rows = Array.isArray(detail?.rows) ? detail.rows : detail?.row ? [detail.row] : [];
      rows.forEach((row) => {
        if (!row?.id) return;
        void handleIncomingRealtimeMessage(row);
      });
    };

    window.addEventListener('erp-mock-chat-message-insert', handleMockRealtimeInsert as EventListener);
    return () => {
      window.removeEventListener('erp-mock-chat-message-insert', handleMockRealtimeInsert as EventListener);
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
        setChatRooms((prev) => {
          if (!prev.some((room: ChatRoom) => String(room.id) === roomId)) return prev;
          return sortChatRoomsWithNoticeFirst(
            prev.map((room: ChatRoom) =>
              String(room.id) === roomId
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
      if (!messageId || !knownRoom) return;

      void (async () => {
        const data = await fetchMessageByIdWithRetryRef.current(messageId);
        if (!data) return;
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
      if (selectedRoomId) {
        void fetchDataLatestRef.current();
      } else if (chatRoomsRef.current.length > 0) {
        void updateUnreadForRooms(chatRoomsRef.current);
      }
    };

    const unbindRealtimeFallback = bindPageRefresh(refreshRealtimeFallback, { intervalMs: 15_000 });

    return () => {
      unbindRealtimeFallback();
    };
  }, [chatRoomsRef, selectedRoomId, updateUnreadForRooms, userId]);
}
