'use client';

import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { supabase } from '@/lib/supabase';
import { CHAT_ROOM_SELECT } from '@/lib/chat-query-columns';
import type { ChatMessage, ChatRoom, StaffMember } from '@/types';
import { fetchAllChatRooms, readCachedChatRooms, writeCachedChatRooms } from './chatQueryService';
import type { PresenceInfo } from './메신저타입';
import { getMessageDisplayText } from './메신저첨부';
import { selectChatMessagesWithFallback } from './메신저데이터유틸';
import { useChatRealtimeSubscriptions, type ChatRealtimeState } from './메신저구독훅';
import {
  getConversationRoomIdsByRoomId,
  NOTICE_ROOM_ID,
  NOTICE_ROOM_NAME,
  SELF_ROOM_NAME,
  haveSameMembers,
  isSelfChatRoom,
  normalizeMemberIds,
  sortChatRoomsWithNoticeFirst,
} from './메신저유틸';

type UseChatRealtimeBridgeParams = {
  userId: string | null | undefined;
  userName: string | null | undefined;
  selectedRoomId: string | null;
  selectedRoomIdRef: MutableRefObject<string | null>;
  chatRooms: ChatRoom[];
  chatRoomsRef: MutableRefObject<ChatRoom[]>;
  visibleMessageIdsRef: MutableRefObject<Set<string>>;
  visiblePollIdsRef: MutableRefObject<Set<string>>;
  setChatRooms: Dispatch<SetStateAction<ChatRoom[]>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setRoomUnreadCounts: Dispatch<SetStateAction<Record<string, number>>>;
  setPresenceMap: Dispatch<SetStateAction<Record<string, PresenceInfo>>>;
  setTypingUsers: Dispatch<SetStateAction<Record<string, string>>>;
  syncChannelRef: MutableRefObject<BroadcastChannel | null>;
  effectiveChatUserId: string | null | undefined;
  effectiveTodoUserId: string | null | undefined;
  noticeRoomMemberIds: string[];
  isNearBottomRef: MutableRefObject<boolean>;
  optimisticUnreadFloorRef: MutableRefObject<Record<string, { count: number; lastMessageAt: string | null }>>;
  requestBottomAlignmentHold: (roomId: string | null, holdMs?: number) => void;
  persistRoomReadCursors: (
    roomIds: Array<string | null | undefined>,
    readAt?: string | null,
  ) => Promise<boolean>;
  markConversationNotificationsAsRead: (
    roomIds: Array<string | null | undefined>,
    readAt?: string | null,
  ) => Promise<unknown>;
  broadcastChatSync: (action: string, roomId?: string | null) => void;
  resolveStaffProfile: (staffId: string | null | undefined, fallbackName?: string | null) => StaffMember | null;
  isRoomAccessibleToCurrentUser: (room: ChatRoom | null | undefined) => boolean;
  isRoomInSelectedConversation: (roomId: string | null | undefined, rooms?: ChatRoom[]) => boolean;
  syncChatRoomsState: (rooms: ChatRoom[]) => Promise<ChatRoom[]>;
  updateUnreadForRooms: (rooms: ChatRoom[]) => void | Promise<void>;
  fetchData: (options?: { force?: boolean }) => Promise<void>;
  fetchDataRef: MutableRefObject<((options?: { force?: boolean }) => Promise<void>) | null>;
  applyReadCursorFromRealtime: (row: Record<string, unknown> | null | undefined) => void;
  refreshVisibleMessageReactions: () => Promise<void>;
  refreshVisibleMessageBookmarks: () => Promise<void>;
  refreshRoomPinnedMessages: () => Promise<void>;
  refreshRoomPolls: () => Promise<void>;
};

export function useChatRealtimeBridge({
  userId,
  userName,
  selectedRoomId,
  selectedRoomIdRef,
  chatRooms,
  chatRoomsRef,
  visibleMessageIdsRef,
  visiblePollIdsRef,
  setChatRooms,
  setMessages,
  setRoomUnreadCounts,
  setPresenceMap,
  setTypingUsers,
  syncChannelRef,
  effectiveChatUserId,
  effectiveTodoUserId,
  noticeRoomMemberIds,
  isNearBottomRef,
  optimisticUnreadFloorRef,
  requestBottomAlignmentHold,
  persistRoomReadCursors,
  markConversationNotificationsAsRead,
  broadcastChatSync,
  resolveStaffProfile,
  isRoomAccessibleToCurrentUser,
  isRoomInSelectedConversation,
  syncChatRoomsState,
  updateUnreadForRooms,
  fetchData,
  fetchDataRef,
  applyReadCursorFromRealtime,
  refreshVisibleMessageReactions,
  refreshVisibleMessageBookmarks,
  refreshRoomPinnedMessages,
  refreshRoomPolls,
}: UseChatRealtimeBridgeParams) {
  const [globalRealtimeState, setGlobalRealtimeState] = useState<ChatRealtimeState>('connecting');
  const [roomRealtimeState, setRoomRealtimeState] = useState<ChatRealtimeState>('idle');
  const [globalRealtimeRetryToken, setGlobalRealtimeRetryToken] = useState(0);
  const [roomRealtimeRetryToken, setRoomRealtimeRetryToken] = useState(0);

  const selfChatCreationInFlightRef = useRef(false);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingPeersTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const incomingRealtimeMessageIdsRef = useRef<Map<string, number>>(new Map());
  const globalRealtimeRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomRealtimeRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRealtimeReconnect = useCallback((scope: 'global' | 'room') => {
    const retryRef = scope === 'global' ? globalRealtimeRetryTimerRef : roomRealtimeRetryTimerRef;
    if (retryRef.current) return;

    retryRef.current = setTimeout(() => {
      retryRef.current = null;
      if (scope === 'global') {
        setGlobalRealtimeRetryToken((prev) => prev + 1);
      } else {
        setRoomRealtimeRetryToken((prev) => prev + 1);
      }
    }, 1200);
  }, []);

  const emitTypingState = useCallback((isTyping: boolean) => {
    if (!typingChannelRef.current || !selectedRoomId || !effectiveChatUserId) return;
    typingChannelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        roomId: selectedRoomId,
        userId: String(effectiveChatUserId),
        name: userName || 'Unknown',
        isTyping,
      },
    });
  }, [effectiveChatUserId, selectedRoomId, userName]);

  const claimIncomingRealtimeMessage = useCallback((messageId: string | null | undefined) => {
    const nextId = String(messageId || '').trim();
    if (!nextId) return false;

    const now = Date.now();
    const seen = incomingRealtimeMessageIdsRef.current;
    seen.forEach((timestamp, key) => {
      if (now - timestamp > 15000) {
        seen.delete(key);
      }
    });

    const previous = seen.get(nextId);
    if (previous && now - previous < 5000) {
      return false;
    }

    seen.set(nextId, now);
    return true;
  }, []);

  const fetchMessageByIdWithRetry = useCallback(async (messageId: string, attempts = 3) => {
    const targetMessageId = String(messageId || '').trim();
    if (!targetMessageId) return null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const { data } = await selectChatMessagesWithFallback<ChatMessage>(({ selectClause }) =>
          supabase
            .from('messages')
            .select(selectClause)
            .eq('id', targetMessageId)
            .maybeSingle() as PromiseLike<{ data: ChatMessage | null; error: unknown }>,
        );
        if (data) return data;
      } catch {
        // ignore and retry below
      }

      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 180 * (attempt + 1)));
      }
    }

    return null;
  }, []);

  const handleIncomingRealtimeMessage = useCallback(async (row: ChatMessage) => {
    if (!row?.id || !row.room_id) return;
    if (!claimIncomingRealtimeMessage(row.id)) return;

    const roomId = String(row.room_id);
    const currentRooms = chatRoomsRef.current;
    const currentRoom = currentRooms.find((room: ChatRoom) => String(room.id) === roomId) || null;
    const conversationRoomIds = getConversationRoomIdsByRoomId(roomId, currentRooms as ChatRoom[]);
    if (currentRoom && !isRoomAccessibleToCurrentUser(currentRoom)) return;

    const currentConversationRoomId = String(selectedRoomIdRef.current || roomId);
    const isCurrentRoom = isRoomInSelectedConversation(roomId, currentRooms);
    const isOwnMessage = String(row.sender_id || '') === String(effectiveChatUserId || '');
    const previewText = getMessageDisplayText(
      row.content,
      row.file_name,
      row.file_url,
      currentRoom?.last_message_preview || currentRoom?.last_message || '',
    );

    setChatRooms((prev) => {
      if (!prev.some((room: ChatRoom) => String(room.id) === roomId)) return prev;
      return sortChatRoomsWithNoticeFirst(
        prev.map((room: ChatRoom) =>
          String(room.id) === roomId
            ? {
                ...room,
                last_message: previewText || room.last_message,
                last_message_preview: previewText || room.last_message_preview,
                last_message_at: row.created_at || new Date().toISOString(),
              }
            : room,
        ),
      );
    });

    if (isCurrentRoom) {
      const shouldKeepBottomAligned = isOwnMessage || isNearBottomRef.current;
      if (shouldKeepBottomAligned) {
        requestBottomAlignmentHold(currentConversationRoomId, isOwnMessage ? 1200 : 900);
      }
      setMessages((prev) => {
        if (prev.some((message: ChatMessage) => String(message.id) === String(row.id))) return prev;
        const nextMessage = {
          ...row,
          staff: resolveStaffProfile(row.sender_id, row.sender_name) || { name: '이름 없음', photo_url: null },
        };
        const optimisticIndex = prev.findIndex((message: ChatMessage) => {
          if (String(message.id || '') === `temp-notif-${String(row.id || '')}`) return true;
          if (!String(message.id || '').startsWith('temp-')) return false;
          if (String(message.room_id || '') !== String(row.room_id || '')) return false;
          if (String(message.sender_id || '') !== String(row.sender_id || '')) return false;
          return (
            (message.content || '') === (row.content || '') &&
            (message.file_url || null) === (row.file_url || null)
          );
        });
        if (optimisticIndex >= 0) {
          return prev.map((message: ChatMessage, index: number) =>
            index === optimisticIndex ? nextMessage : message,
          );
        }
        return [...prev, nextMessage];
      });

      if (!isOwnMessage && userId) {
        const readAt = new Date().toISOString();
        const targetRoomIds = conversationRoomIds.length > 0 ? conversationRoomIds : [roomId];
        void persistRoomReadCursors(targetRoomIds, readAt)
          .then(async (cursorWriteOk) => {
            await markConversationNotificationsAsRead(
              [...targetRoomIds, currentConversationRoomId],
              readAt,
            );
            if (cursorWriteOk) {
              broadcastChatSync('message-read', roomId);
            }
          })
          .catch(() => {});
        setRoomUnreadCounts((prev) => {
          let changed = false;
          const next = { ...prev };
          const targetIds = Array.from(
            new Set(
              [
                ...(conversationRoomIds.length > 0 ? conversationRoomIds : [roomId]),
                currentConversationRoomId,
              ].filter(Boolean),
            ),
          );
          targetIds.forEach((targetRoomId) => {
            delete optimisticUnreadFloorRef.current[targetRoomId];
          });
          targetIds.forEach((targetRoomId) => {
            if (!next[targetRoomId]) return;
            next[targetRoomId] = 0;
            changed = true;
          });
          return changed ? next : prev;
        });
      }
      return;
    }

    if (!isOwnMessage) {
      setRoomUnreadCounts((prev) => {
        const nextCount = Math.max(1, (prev[roomId] || 0) + 1);
        const previousFloor = optimisticUnreadFloorRef.current[roomId];
        optimisticUnreadFloorRef.current[roomId] = {
          count: Math.max(previousFloor?.count || 0, nextCount),
          lastMessageAt: row.created_at || previousFloor?.lastMessageAt || new Date().toISOString(),
        };
        return {
          ...prev,
          [roomId]: nextCount,
        };
      });
    }
  }, [
    broadcastChatSync,
    claimIncomingRealtimeMessage,
    effectiveChatUserId,
    isNearBottomRef,
    isRoomAccessibleToCurrentUser,
    isRoomInSelectedConversation,
    markConversationNotificationsAsRead,
    optimisticUnreadFloorRef,
    persistRoomReadCursors,
    requestBottomAlignmentHold,
    resolveStaffProfile,
    selectedRoomIdRef,
    setChatRooms,
    setMessages,
    setRoomUnreadCounts,
    userId,
  ]);

  const syncNoticeRoomMembers = useCallback(async (rooms?: ChatRoom[]) => {
    const sourceRooms = Array.isArray(rooms) ? rooms : chatRoomsRef.current;
    const noticeRoom = sourceRooms.find((room: ChatRoom) => String(room.id) === NOTICE_ROOM_ID);
    if (!noticeRoom) return;

    const currentMemberIds = normalizeMemberIds(noticeRoom.members);
    if (haveSameMembers(currentMemberIds, noticeRoomMemberIds)) return;

    try {
      const { error } = await supabase
        .from('chat_rooms')
        .update({ name: NOTICE_ROOM_NAME, type: 'notice', members: noticeRoomMemberIds })
        .eq('id', NOTICE_ROOM_ID);
      if (error) throw error;
    } catch (error) {
      console.error('공지방 멤버 동기화 실패:', error);
    }
  }, [chatRoomsRef, noticeRoomMemberIds]);

  const ensureSelfChatRoom = useCallback(async (rooms: ChatRoom[]) => {
    const currentUserId = String(effectiveChatUserId || '').trim();
    const sourceRooms = Array.isArray(rooms) ? rooms : [];
    if (!currentUserId) return sourceRooms;

    const existingSelfRooms = sourceRooms
      .filter((room: ChatRoom) => isSelfChatRoom(room, currentUserId))
      .sort(
        (left: ChatRoom, right: ChatRoom) =>
          new Date(right.last_message_at || right.created_at || 0).getTime() -
          new Date(left.last_message_at || left.created_at || 0).getTime(),
      );
    const existingSelfRoom = existingSelfRooms[0];

    if (existingSelfRoom) {
      const nextMembers = [currentUserId];
      const currentMembers = normalizeMemberIds(existingSelfRoom.members);
      const needsUpdate =
        existingSelfRoom.name !== SELF_ROOM_NAME ||
        existingSelfRoom.type !== 'direct' ||
        currentMembers.length !== 1 ||
        currentMembers[0] !== currentUserId;

      if (!needsUpdate) return sourceRooms;

      try {
        const { error } = await supabase
          .from('chat_rooms')
          .update({ name: SELF_ROOM_NAME, type: 'direct', members: nextMembers })
          .eq('id', existingSelfRoom.id);
        if (error) throw error;
      } catch (error) {
        console.error('나와의 채팅방 업데이트 실패:', error);
      }

      return sourceRooms
        .filter(
          (room: ChatRoom) =>
            !isSelfChatRoom(room, currentUserId) || String(room.id) === String(existingSelfRoom.id),
        )
        .map((room: ChatRoom) =>
          String(room.id) === String(existingSelfRoom.id)
            ? { ...room, name: SELF_ROOM_NAME, type: 'direct' as const, members: nextMembers }
            : room,
        );
    }

    if (selfChatCreationInFlightRef.current) {
      return sourceRooms;
    }

    selfChatCreationInFlightRef.current = true;
    try {
      const { data: insertedRoom, error } = (await supabase
        .from('chat_rooms')
        .insert([{ name: SELF_ROOM_NAME, type: 'direct', members: [currentUserId] }])
        .select(CHAT_ROOM_SELECT)
        .single()) as { data: ChatRoom | null; error: unknown };
      if (error) throw error;
      if (!insertedRoom) return sourceRooms;
      return [...sourceRooms, insertedRoom];
    } catch (error) {
      console.error('나와의 채팅방 생성 실패:', error);
      return sourceRooms;
    } finally {
      selfChatCreationInFlightRef.current = false;
    }
  }, [effectiveChatUserId]);

  useEffect(() => {
    let active = true;
    const loadRooms = async () => {
      try {
        const cachedRooms = readCachedChatRooms();
        if (cachedRooms.length > 0 && active) {
          setChatRooms(sortChatRoomsWithNoticeFirst(cachedRooms));
        }

        let rooms: ChatRoom[] = [];
        const roomResult = await fetchAllChatRooms();
        if (roomResult.error) {
          throw roomResult.error;
        }
        rooms = roomResult.data;

        if (!rooms.some((room: ChatRoom) => String(room.id) === NOTICE_ROOM_ID)) {
          const { error: noticeInsertError } = await supabase.from('chat_rooms').insert([
            { id: NOTICE_ROOM_ID, name: NOTICE_ROOM_NAME, type: 'notice', members: noticeRoomMemberIds },
          ]);
          const isDuplicateNoticeRoom = Boolean(
            noticeInsertError &&
            typeof noticeInsertError === 'object' &&
            noticeInsertError !== null &&
            'code' in noticeInsertError &&
            (noticeInsertError as { code?: string }).code === '23505',
          );
          if (noticeInsertError && !isDuplicateNoticeRoom) {
            throw noticeInsertError;
          }

          const refetchedRoomResult = await fetchAllChatRooms({ force: true });
          if (refetchedRoomResult.error) {
            throw refetchedRoomResult.error;
          }
          rooms = refetchedRoomResult.data;
        }

        const roomsWithSelf = await ensureSelfChatRoom(rooms);
        if (!active) return;
        const syncedRooms = await syncChatRoomsState(roomsWithSelf);
        writeCachedChatRooms(syncedRooms);
      } catch (error) {
        console.error('채팅방 목록 초기화 실패:', error);
      }
    };

    void loadRooms();
    return () => {
      active = false;
    };
  }, [ensureSelfChatRoom, noticeRoomMemberIds, syncChatRoomsState]);

  useEffect(() => {
    if (!chatRooms.some((room: ChatRoom) => String(room.id) === NOTICE_ROOM_ID)) return;
    void syncNoticeRoomMembers(chatRooms);
  }, [chatRooms, syncNoticeRoomMembers]);

  useEffect(() => {
    let disposed = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let refreshInFlight = false;
    let refreshQueued = false;
    const currentUserId = String(effectiveChatUserId || userId || '').trim();

    const shouldRefreshForRoomChange = (payload: Record<string, unknown>) => {
      if (!currentUserId) return true;

      const nextRow = payload.new as Partial<ChatRoom> | null | undefined;
      const previousRow = payload.old as Partial<ChatRoom> | null | undefined;
      const roomId = String(nextRow?.id || previousRow?.id || '').trim();
      if (roomId === NOTICE_ROOM_ID) return true;

      const nextMembers = normalizeMemberIds(nextRow?.members);
      const previousMembers = normalizeMemberIds(previousRow?.members);
      if (nextMembers.length === 0 && previousMembers.length === 0) return true;

      return nextMembers.includes(currentUserId) || previousMembers.includes(currentUserId);
    };

    const runRefresh = async () => {
      if (refreshInFlight) {
        refreshQueued = true;
        return;
      }

      refreshInFlight = true;
      try {
        const result = await fetchAllChatRooms({ force: true });
        if (disposed || result.error || result.data.length === 0) return;
        const roomsWithSelf = await ensureSelfChatRoom(result.data);
        if (disposed) return;
        const syncedRooms = await syncChatRoomsState(roomsWithSelf);
        writeCachedChatRooms(syncedRooms);
      } catch (error) {
        console.error('채팅방 목록 갱신 실패:', error);
      } finally {
        refreshInFlight = false;
        if (refreshQueued && !disposed) {
          refreshQueued = false;
          scheduleRefresh();
        }
      }
    };

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void runRefresh();
      }, 500);
    };

    const channel = supabase.channel('chat-rooms-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_rooms' }, (payload: Record<string, unknown>) => {
        if (!shouldRefreshForRoomChange(payload)) return;
        scheduleRefresh();
      })
      .subscribe();
    return () => {
      disposed = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [effectiveChatUserId, ensureSelfChatRoom, syncChatRoomsState, userId]);

  useChatRealtimeSubscriptions({
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
    visibleMessageIdsRef,
    visiblePollIdsRef,
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
    applyReadCursorFromRealtime,
    refreshVisibleMessageReactions,
    refreshVisibleMessageBookmarks,
    refreshRoomPinnedMessages,
    refreshRoomPolls,
    handleIncomingRealtimeMessage,
    scheduleRealtimeReconnect,
    isRoomInSelectedConversation,
    emitTypingState,
    fetchMessageByIdWithRetry,
    sortChatRoomsWithNoticeFirst,
  });

  const clearTypingIndicators = useCallback(() => {
    if (typingClearRef.current) {
      clearTimeout(typingClearRef.current);
      typingClearRef.current = null;
    }
    Object.values(typingPeersTimeoutRef.current).forEach((timer) => clearTimeout(timer));
    typingPeersTimeoutRef.current = {};
    setTypingUsers({});
  }, [setTypingUsers]);

  return {
    globalRealtimeState,
    roomRealtimeState,
    typingClearRef,
    clearTypingIndicators,
    emitTypingState,
    fetchMessageByIdWithRetry,
  };
}
