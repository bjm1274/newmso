'use client';

import { useCallback, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';
import { CHAT_ACTIVE_ROOM_KEY, CHAT_ROOM_KEY } from '@/app/main/navigation-state';
import { toUtcSqlTimestamp } from '@/lib/chat-timestamp';
import type { ChatRoom } from '@/types';
import { getConversationRoomIdsByRoomId } from './메신저유틸';

type UseChatRoomNavigationParams = {
  selectedRoomId: string | null;
  selectedRoomIdRef: MutableRefObject<string | null>;
  chatRoomsRef: MutableRefObject<ChatRoom[]>;
  inputMsgRef: MutableRefObject<string>;
  draftMapRef: MutableRefObject<Map<string, string>>;
  requestBottomAlignmentHold?: (roomId: string | null, holdMs?: number) => void;
  pendingBottomAlignRoomIdRef: MutableRefObject<string | null>;
  isNearBottomRef: MutableRefObject<boolean>;
  lastTimelineTailRef: MutableRefObject<string>;
  optimisticUnreadFloorRef?: MutableRefObject<Record<string, { count: number; lastMessageAt: string | null }>>;
  messageListRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  effectiveChatUserId: string | null | undefined;
  setSelectedRoomId: Dispatch<SetStateAction<string | null>>;
  setInputMsg: Dispatch<SetStateAction<string>>;
  setLoadingRoomId?: Dispatch<SetStateAction<string | null>>;
  setShowScrollToLatest: Dispatch<SetStateAction<boolean>>;
  setRoomUnreadCounts: Dispatch<SetStateAction<Record<string, number>>>;
  loadingRoomId?: string | null;
  persistRoomReadCursors: (
    roomIds: Array<string | null | undefined>,
    readAt?: string | null,
  ) => Promise<boolean>;
  markConversationNotificationsAsRead: (roomIds: string[], readAt: string) => Promise<unknown>;
  broadcastChatSync: (action: string, roomId?: string | null) => void;
  onRoomChangeCleanup: () => void;
};

export function useChatRoomNavigation({
  selectedRoomId,
  selectedRoomIdRef,
  chatRoomsRef,
  inputMsgRef,
  draftMapRef,
  requestBottomAlignmentHold,
  pendingBottomAlignRoomIdRef,
  isNearBottomRef,
  lastTimelineTailRef,
  optimisticUnreadFloorRef: _optimisticUnreadFloorRef,
  messageListRef,
  scrollRef,
  effectiveChatUserId,
  setSelectedRoomId,
  setInputMsg,
  setLoadingRoomId: _setLoadingRoomId,
  setShowScrollToLatest,
  setRoomUnreadCounts,
  loadingRoomId: _loadingRoomId,
  persistRoomReadCursors,
  markConversationNotificationsAsRead,
  broadcastChatSync,
  onRoomChangeCleanup }: UseChatRoomNavigationParams) {
  const setRoom = useCallback((roomId: string | null) => {
    const previousSelectedRoomId = selectedRoomIdRef.current;
    const conversationRoomIds = roomId
      ? getConversationRoomIdsByRoomId(roomId, chatRoomsRef.current as ChatRoom[])
      : [];

    if (previousSelectedRoomId && previousSelectedRoomId !== roomId) {
      const draft = inputMsgRef.current;
      draftMapRef.current.set(previousSelectedRoomId, draft);
      try {
        if (draft) {
          localStorage.setItem(`chat-draft-${previousSelectedRoomId}`, draft);
        } else {
          localStorage.removeItem(`chat-draft-${previousSelectedRoomId}`);
        }
      } catch { /* ignore quota errors */ }
    }

    pendingBottomAlignRoomIdRef.current = roomId;
    isNearBottomRef.current = true;
    setShowScrollToLatest(false);

    if (previousSelectedRoomId !== roomId) {
      lastTimelineTailRef.current = '';
      onRoomChangeCleanup();
    }

    selectedRoomIdRef.current = roomId;
    setSelectedRoomId(roomId);

    let savedDraft = (roomId ? draftMapRef.current.get(roomId) : '') || '';
    if (!savedDraft && roomId) {
      try { savedDraft = localStorage.getItem(`chat-draft-${roomId}`) || ''; } catch { /* ignore */ }
    }
    inputMsgRef.current = savedDraft;
    setInputMsg(savedDraft);

    if (roomId && effectiveChatUserId) {
      // D1 messages.created_at 과 동일 SQL 포맷 (ISO-Z 문자열 비교 드리프트 방지)
      const readAt = toUtcSqlTimestamp();
      const targetRoomIds = conversationRoomIds.length > 0 ? conversationRoomIds : [String(roomId)];

      setRoomUnreadCounts((prev) => {
        let changed = false;
        const next = { ...prev };
        targetRoomIds.forEach((targetRoomId) => {
          if (!next[targetRoomId]) return;
          next[targetRoomId] = 0;
          changed = true;
        });
        return changed ? next : prev;
      });

      void (async () => {
        try {
          const [cursorWriteOk] = await Promise.all([
            persistRoomReadCursors(targetRoomIds, readAt),
            markConversationNotificationsAsRead(targetRoomIds, readAt),
          ]);
          if (cursorWriteOk) {
            broadcastChatSync('message-read', roomId);
          }
        } catch {
          // ignore
        }
      })();
    }

    if (typeof window === 'undefined') return;

    try {
      if (roomId) {
        window.localStorage.setItem(CHAT_ROOM_KEY, roomId);
        window.sessionStorage.setItem(CHAT_ACTIVE_ROOM_KEY, roomId);
      } else {
        window.localStorage.removeItem(CHAT_ROOM_KEY);
        window.sessionStorage.removeItem(CHAT_ACTIVE_ROOM_KEY);
      }
    } catch {
      // ignore
    }
  }, [
    broadcastChatSync,
    chatRoomsRef,
    draftMapRef,
    effectiveChatUserId,
    inputMsgRef,
    isNearBottomRef,
    lastTimelineTailRef,
    markConversationNotificationsAsRead,
    onRoomChangeCleanup,
    pendingBottomAlignRoomIdRef,
    persistRoomReadCursors,
    selectedRoomIdRef,
    setInputMsg,
    setRoomUnreadCounts,
    setSelectedRoomId,
    setShowScrollToLatest,
  ]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const listEl = messageListRef.current;
    if (listEl) {
      const targetTop = Math.max(0, listEl.scrollHeight - listEl.clientHeight);
      if (Math.abs(listEl.scrollTop - targetTop) <= 2) {
        isNearBottomRef.current = true;
        setShowScrollToLatest(false);
        return;
      }
      if (behavior === 'auto') {
        listEl.scrollTop = targetTop;
      } else {
        listEl.scrollTo({ top: targetTop, behavior });
      }
    } else {
      scrollRef.current?.scrollIntoView({ behavior, block: 'end' });
    }

    isNearBottomRef.current = true;
    setShowScrollToLatest(false);
  }, [isNearBottomRef, messageListRef, scrollRef, setShowScrollToLatest]);

  const handleRoomListClick = useCallback((roomId: string) => {
    const normalizedRoomId = String(roomId || '').trim();
    if (!normalizedRoomId) {
      setRoom(null);
      return;
    }

    if (String(selectedRoomIdRef.current || '') === normalizedRoomId) {
      scrollToBottom('smooth');
      return;
    }

    setRoom(normalizedRoomId);
  }, [scrollToBottom, selectedRoomIdRef, setRoom]);

  const updateScrollPositionState = useCallback(() => {
    const listEl = messageListRef.current;
    if (!listEl) return;

    const nearBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 96;
    if (selectedRoomId && pendingBottomAlignRoomIdRef.current === selectedRoomId && !nearBottom) {
      pendingBottomAlignRoomIdRef.current = null;
    }
    isNearBottomRef.current = nearBottom;
    setShowScrollToLatest(!nearBottom && Boolean(selectedRoomId));
  }, [isNearBottomRef, messageListRef, pendingBottomAlignRoomIdRef, selectedRoomId, setShowScrollToLatest]);

  return {
    setRoom,
    scrollToBottom,
    handleRoomListClick,
    updateScrollPositionState };
}
