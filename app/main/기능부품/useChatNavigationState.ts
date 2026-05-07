'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from 'react';
import { CHAT_ACTIVE_ROOM_KEY, CHAT_ROOM_KEY } from '@/app/main/navigation-state';
import type { ChatRoom } from '@/types';
import { isMobileChatViewport } from './메신저유틸';
import { useChatRoomNavigation } from './메신저방전환훅';

type UseChatNavigationStateParams = {
  chatRooms: ChatRoom[];
  chatListResetToken?: number;
  initialOpenChatRoomId?: string | null;
  initialOpenChatRequestToken?: number;
  initialOpenMessageId?: string | null;
  onConsumeOpenChatRoomId?: () => void;
  chatRoomsRef: MutableRefObject<ChatRoom[]>;
  inputMsgRef: MutableRefObject<string>;
  setInputMsg: Dispatch<SetStateAction<string>>;
  draftMapRef: MutableRefObject<Map<string, string>>;
  pendingBottomAlignRoomIdRef: MutableRefObject<string | null>;
  pendingScrollMsgIdRef: MutableRefObject<string | null>;
  isNearBottomRef: MutableRefObject<boolean>;
  lastTimelineTailRef: MutableRefObject<string>;
  optimisticUnreadFloorRef: MutableRefObject<Record<string, { count: number; lastMessageAt: string | null }>>;
  messageListRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  effectiveChatUserId: string | null | undefined;
  setShowScrollToLatest: Dispatch<SetStateAction<boolean>>;
  setRoomUnreadCounts: Dispatch<SetStateAction<Record<string, number>>>;
  persistRoomReadCursors: (
    roomIds: Array<string | null | undefined>,
    readAt?: string | null,
  ) => Promise<boolean>;
  markConversationNotificationsAsRead: (
    roomIds: Array<string | null | undefined>,
    readAt?: string | null,
  ) => Promise<unknown>;
  broadcastChatSync: (action: string, roomId?: string | null) => void;
  onRoomChangeCleanup: (mode?: 'full' | 'room-switch') => void;
  clearPendingMessageScrollTimer: () => void;
  closeMobileChatBackLayerRef: MutableRefObject<() => boolean>;
};

export function useChatNavigationState({
  chatRooms,
  chatListResetToken,
  initialOpenChatRoomId,
  initialOpenChatRequestToken,
  initialOpenMessageId,
  onConsumeOpenChatRoomId,
  chatRoomsRef,
  inputMsgRef,
  setInputMsg,
  draftMapRef,
  pendingBottomAlignRoomIdRef,
  pendingScrollMsgIdRef,
  isNearBottomRef,
  lastTimelineTailRef,
  optimisticUnreadFloorRef,
  messageListRef,
  scrollRef,
  effectiveChatUserId,
  setShowScrollToLatest,
  setRoomUnreadCounts,
  persistRoomReadCursors,
  markConversationNotificationsAsRead,
  broadcastChatSync,
  onRoomChangeCleanup,
  clearPendingMessageScrollTimer,
  closeMobileChatBackLayerRef,
}: UseChatNavigationStateParams) {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [loadingRoomId, setLoadingRoomId] = useState<string | null>(null);
  const [timelineRoomId, setTimelineRoomId] = useState<string | null>(null);
  const selectedRoomIdRef = useRef<string | null>(null);
  const mobileChatHistoryEntryActiveRef = useRef(false);
  const suppressNextMobileChatPopstateRef = useRef(false);
  const setRoomRef = useRef<(roomId: string | null) => void>(() => {});
  const initialRoomRestoreSyncedRef = useRef(false);
  const lastHandledChatListResetTokenRef = useRef(0);

  const pushMobileChatHistoryEntry = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (!isMobileChatViewport()) return;
    if (!selectedRoomIdRef.current) return;
    if (mobileChatHistoryEntryActiveRef.current) return;
    try {
      window.history.pushState(
        {
          ...(window.history.state ?? {}),
          __erpMobileChatRoomOpen: true,
          __erpMobileChatRoomToken: Date.now(),
        },
        '',
      );
      mobileChatHistoryEntryActiveRef.current = true;
    } catch {
      // ignore
    }
  }, []);

  const {
    setRoom,
    scrollToBottom,
    handleRoomListClick,
    updateScrollPositionState,
  } = useChatRoomNavigation({
    selectedRoomId,
    selectedRoomIdRef,
    chatRoomsRef,
    inputMsgRef,
    draftMapRef,
    pendingBottomAlignRoomIdRef,
    isNearBottomRef,
    lastTimelineTailRef,
    messageListRef,
    scrollRef,
    effectiveChatUserId,
    optimisticUnreadFloorRef,
    setSelectedRoomId,
    setInputMsg,
    setShowScrollToLatest,
    setRoomUnreadCounts,
    persistRoomReadCursors,
    markConversationNotificationsAsRead,
    broadcastChatSync,
    onRoomChangeCleanup: () => onRoomChangeCleanup('room-switch'),
  });

  useEffect(() => {
    setRoomRef.current = setRoom;
  }, [setRoom]);

  const handleManualRoomListClick = useCallback(
    (roomId: string) => {
      clearPendingMessageScrollTimer();
      pendingScrollMsgIdRef.current = null;
      handleRoomListClick(roomId);
    },
    [clearPendingMessageScrollTimer, handleRoomListClick, pendingScrollMsgIdRef],
  );

  useEffect(() => {
    selectedRoomIdRef.current = selectedRoomId;
  }, [selectedRoomId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (selectedRoomId) {
        window.sessionStorage.setItem(CHAT_ACTIVE_ROOM_KEY, selectedRoomId);
      } else {
        window.sessionStorage.removeItem(CHAT_ACTIVE_ROOM_KEY);
      }
    } catch {
      // ignore
    }
    return () => {
      try {
        window.sessionStorage.removeItem(CHAT_ACTIVE_ROOM_KEY);
      } catch {
        // ignore
      }
    };
  }, [selectedRoomId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isMobileChatViewport()) return;

    if (selectedRoomId) {
      pushMobileChatHistoryEntry();
      return;
    }

    if (!mobileChatHistoryEntryActiveRef.current) return;

    suppressNextMobileChatPopstateRef.current = true;
    mobileChatHistoryEntryActiveRef.current = false;
    try {
      window.history.back();
    } catch {
      suppressNextMobileChatPopstateRef.current = false;
    }
  }, [pushMobileChatHistoryEntry, selectedRoomId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = () => {
      if (suppressNextMobileChatPopstateRef.current) {
        suppressNextMobileChatPopstateRef.current = false;
        return;
      }
      if (!isMobileChatViewport()) {
        mobileChatHistoryEntryActiveRef.current = false;
        return;
      }
      if (!selectedRoomIdRef.current) {
        mobileChatHistoryEntryActiveRef.current = false;
        return;
      }

      mobileChatHistoryEntryActiveRef.current = false;

      if (closeMobileChatBackLayerRef.current()) {
        window.requestAnimationFrame(() => {
          if (selectedRoomIdRef.current) {
            pushMobileChatHistoryEntry();
          }
        });
        return;
      }

      setRoomRef.current(null);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [closeMobileChatBackLayerRef, pushMobileChatHistoryEntry]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const shouldRestoreSavedRoomOnMount = !isMobileChatViewport();
    const resetToken = chatListResetToken ?? 0;
    const hasUnhandledChatListReset =
      resetToken > 0 && resetToken !== lastHandledChatListResetTokenRef.current;
    if (hasUnhandledChatListReset || initialOpenChatRoomId) {
      pendingBottomAlignRoomIdRef.current = null;
      isNearBottomRef.current = true;
      setShowScrollToLatest(false);
      setLoadingRoomId(null);
      setTimelineRoomId(null);
      setSelectedRoomId(null);
      return;
    }
    try {
      const saved = window.localStorage.getItem(CHAT_ROOM_KEY);
      if (shouldRestoreSavedRoomOnMount && saved && saved !== 'null' && saved !== 'undefined') {
        pendingBottomAlignRoomIdRef.current = saved;
        isNearBottomRef.current = true;
        setShowScrollToLatest(false);
        setLoadingRoomId(saved);
        setSelectedRoomId(saved);
      } else {
        pendingBottomAlignRoomIdRef.current = null;
        isNearBottomRef.current = true;
        setShowScrollToLatest(false);
        setLoadingRoomId(null);
        setSelectedRoomId(null);
      }
    } catch {
      pendingBottomAlignRoomIdRef.current = null;
      isNearBottomRef.current = true;
      setShowScrollToLatest(false);
      setLoadingRoomId(null);
      setSelectedRoomId(null);
    }
  }, [chatListResetToken, initialOpenChatRoomId, isNearBottomRef, pendingBottomAlignRoomIdRef]);

  useEffect(() => {
    if (initialRoomRestoreSyncedRef.current) return;
    if (selectedRoomId === null) {
      initialRoomRestoreSyncedRef.current = true;
      return;
    }
    if (chatRooms.length === 0) return;

    initialRoomRestoreSyncedRef.current = true;
    setRoom(String(selectedRoomId));
  }, [chatRooms.length, selectedRoomId, setRoom]);

  useEffect(() => {
    if (!initialOpenChatRoomId) return;
    const normalizedRoomId = String(initialOpenChatRoomId || '').trim();
    if (!normalizedRoomId) return;
    const normalizedMessageId = String(initialOpenMessageId || '').trim();
    if (normalizedMessageId) {
      pendingScrollMsgIdRef.current = normalizedMessageId;
    }
    setRoom(normalizedRoomId);
    onConsumeOpenChatRoomId?.();
  }, [
    initialOpenChatRequestToken,
    initialOpenChatRoomId,
    initialOpenMessageId,
    onConsumeOpenChatRoomId,
    pendingScrollMsgIdRef,
    setRoom,
  ]);

  useEffect(() => {
    if (!chatListResetToken) return;
    if (initialOpenChatRoomId) {
      lastHandledChatListResetTokenRef.current = chatListResetToken;
      return;
    }
    if (chatListResetToken === lastHandledChatListResetTokenRef.current) return;

    lastHandledChatListResetTokenRef.current = chatListResetToken;
    pendingScrollMsgIdRef.current = null;
    pendingBottomAlignRoomIdRef.current = null;
    isNearBottomRef.current = true;
    setShowScrollToLatest(false);
    setLoadingRoomId(null);
    setTimelineRoomId(null);
    setRoom(null);
    onConsumeOpenChatRoomId?.();
  }, [
    chatListResetToken,
    initialOpenChatRoomId,
    isNearBottomRef,
    onConsumeOpenChatRoomId,
    pendingBottomAlignRoomIdRef,
    pendingScrollMsgIdRef,
    setRoom,
  ]);

  return {
    selectedRoomId,
    selectedRoomIdRef,
    loadingRoomId,
    setLoadingRoomId,
    timelineRoomId,
    setTimelineRoomId,
    setRoom,
    scrollToBottom,
    handleRoomListClick,
    handleManualRoomListClick,
    updateScrollPositionState,
  };
}
