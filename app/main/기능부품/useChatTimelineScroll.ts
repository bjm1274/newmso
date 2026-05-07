'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type MutableRefObject,
  type RefObject,
} from 'react';
import type { ChatMessage } from '@/types';

type UseChatTimelineScrollParams = {
  selectedRoomId: string | null;
  selectedRoomIdRef: MutableRefObject<string | null>;
  messages: ChatMessage[];
  loadingRoomId: string | null;
  timelineRoomId: string | null;
  pendingScrollMsgIdRef: MutableRefObject<string | null>;
  pendingBottomAlignRoomIdRef: MutableRefObject<string | null>;
  isNearBottomRef: MutableRefObject<boolean>;
  lastTimelineTailRef: MutableRefObject<string>;
  setShowScrollToLatest: (value: boolean) => void;
  messageListRef: RefObject<HTMLDivElement | null>;
  msgRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  hasOlderMessages: boolean;
  loadingOlderMessages: boolean;
  loadOlderMessages: () => Promise<void> | void;
  loadMessagesAroundMessage?: (
    messageId: string,
  ) => Promise<{ ok: true; messageId: string } | { ok: false; reason: string; error?: unknown }>;
  isRoomInSelectedConversation: (roomId: string | null | undefined) => boolean;
  effectiveChatUserId: string | null | undefined;
  fallbackUserId: string | null | undefined;
};

export function useChatTimelineScroll({
  selectedRoomId,
  selectedRoomIdRef,
  messages,
  loadingRoomId,
  timelineRoomId,
  pendingScrollMsgIdRef,
  pendingBottomAlignRoomIdRef,
  isNearBottomRef,
  lastTimelineTailRef,
  setShowScrollToLatest,
  messageListRef,
  msgRefs,
  scrollToBottom,
  hasOlderMessages,
  loadingOlderMessages,
  loadOlderMessages,
  loadMessagesAroundMessage,
  isRoomInSelectedConversation,
  effectiveChatUserId,
  fallbackUserId,
}: UseChatTimelineScrollParams) {
  const readyBottomAlignRoomIdRef = useRef<string | null>(null);
  const layoutScrollHandledRef = useRef(false);
  const pendingBottomAlignReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMessageScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timelineMediaLoadFrameRef = useRef<number | null>(null);
  const directMessageLoadTargetRef = useRef<string | null>(null);
  const pendingBottomAlignHoldUntilRef = useRef(0);
  const suppressBottomAlignmentUntilRef = useRef(0);

  const clearPendingBottomAlignReleaseTimer = useCallback(() => {
    if (!pendingBottomAlignReleaseTimerRef.current) return;
    clearTimeout(pendingBottomAlignReleaseTimerRef.current);
    pendingBottomAlignReleaseTimerRef.current = null;
  }, []);

  const clearPendingMessageScrollTimer = useCallback(() => {
    if (!pendingMessageScrollTimerRef.current) return;
    clearTimeout(pendingMessageScrollTimerRef.current);
    pendingMessageScrollTimerRef.current = null;
  }, []);

  const schedulePendingBottomAlignRelease = useCallback(
    (roomId: string | null) => {
      clearPendingBottomAlignReleaseTimer();

      const normalizedRoomId = String(roomId || '').trim();
      if (!normalizedRoomId) {
        pendingBottomAlignHoldUntilRef.current = 0;
        return;
      }

      const remainingMs = pendingBottomAlignHoldUntilRef.current - Date.now();
      if (remainingMs <= 0) {
        if (String(pendingBottomAlignRoomIdRef.current || '') === normalizedRoomId) {
          pendingBottomAlignRoomIdRef.current = null;
        }
        return;
      }

      pendingBottomAlignReleaseTimerRef.current = setTimeout(() => {
        pendingBottomAlignReleaseTimerRef.current = null;
        if (String(pendingBottomAlignRoomIdRef.current || '') === normalizedRoomId) {
          pendingBottomAlignRoomIdRef.current = null;
        }
      }, remainingMs);
    },
    [clearPendingBottomAlignReleaseTimer],
  );

  const requestBottomAlignmentHold = useCallback(
    (roomId: string | null, holdMs = 900) => {
      const normalizedRoomId = String(roomId || '').trim();
      const previousRoomId = String(pendingBottomAlignRoomIdRef.current || '').trim();
      pendingBottomAlignRoomIdRef.current = normalizedRoomId || null;

      if (!normalizedRoomId) {
        pendingBottomAlignHoldUntilRef.current = 0;
        clearPendingBottomAlignReleaseTimer();
        return;
      }

      const nextHoldUntil = Date.now() + Math.max(holdMs, 0);
      pendingBottomAlignHoldUntilRef.current =
        previousRoomId === normalizedRoomId
          ? Math.max(pendingBottomAlignHoldUntilRef.current, nextHoldUntil)
          : nextHoldUntil;
      isNearBottomRef.current = true;
      setShowScrollToLatest(false);
      schedulePendingBottomAlignRelease(normalizedRoomId);
    },
    [clearPendingBottomAlignReleaseTimer, schedulePendingBottomAlignRelease],
  );

  const scrollToMessage = useCallback(
    (messageId: string) => {
      const normalizedMessageId = String(messageId || '').trim();
      if (!normalizedMessageId) return;

      suppressBottomAlignmentUntilRef.current = Date.now() + 2200;
      pendingBottomAlignRoomIdRef.current = null;
      pendingBottomAlignHoldUntilRef.current = 0;
      clearPendingBottomAlignReleaseTimer();
      isNearBottomRef.current = false;

      const element = msgRefs.current[normalizedMessageId];
      if (!element) return;

      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const originalClass = element.className;
      element.classList.add('bg-[var(--toss-blue-light)]', 'rounded-[var(--radius-lg)]', 'transition-colors', 'duration-500');
      setTimeout(() => {
        element.className = originalClass;
      }, 2000);
    },
    [clearPendingBottomAlignReleaseTimer, msgRefs],
  );

  const tryScrollToLoadedMessage = useCallback(
    (roomId: string, messageId?: string | null) => {
      const normalizedRoomId = String(roomId || '').trim();
      const normalizedMessageId = String(messageId || '').trim();
      if (!normalizedRoomId || !normalizedMessageId) return false;
      if (String(selectedRoomIdRef.current || '') !== normalizedRoomId) return false;
      if (!messages.some((message) => String(message.id) === normalizedMessageId)) return false;

      pendingScrollMsgIdRef.current = null;
      clearPendingMessageScrollTimer();
      pendingMessageScrollTimerRef.current = setTimeout(() => {
        pendingMessageScrollTimerRef.current = null;
        scrollToMessage(normalizedMessageId);
      }, 120);
      return true;
    },
    [clearPendingMessageScrollTimer, messages, scrollToMessage, selectedRoomIdRef],
  );

  const isSelectedRoomTimelineReady =
    Boolean(selectedRoomId) &&
    String(loadingRoomId || '') !== String(selectedRoomId) &&
    String(timelineRoomId || '') === String(selectedRoomId);

  useEffect(() => {
    if (!selectedRoomId) {
      suppressBottomAlignmentUntilRef.current = 0;
      return;
    }

    const pendingTargetMessageId = String(pendingScrollMsgIdRef.current || '').trim();
    if (!pendingTargetMessageId) {
      suppressBottomAlignmentUntilRef.current = 0;
    }
  }, [selectedRoomId]);

  useEffect(() => {
    const targetMsgId = pendingScrollMsgIdRef.current;
    if (!targetMsgId || messages.length === 0) return;
    if (!messages.some((message) => String(message.id) === String(targetMsgId))) return;

    clearPendingMessageScrollTimer();
    pendingMessageScrollTimerRef.current = setTimeout(() => {
      pendingMessageScrollTimerRef.current = null;
      scrollToMessage(targetMsgId);
      pendingScrollMsgIdRef.current = null;
    }, 500);
  }, [clearPendingMessageScrollTimer, messages, scrollToMessage]);

  useEffect(() => {
    const targetMsgId = String(pendingScrollMsgIdRef.current || '').trim();
    if (!targetMsgId) {
      directMessageLoadTargetRef.current = null;
      return;
    }
    if (!selectedRoomId || !loadMessagesAroundMessage) return;
    if (!isSelectedRoomTimelineReady) return;
    if (messages.some((message) => String(message.id) === targetMsgId)) {
      directMessageLoadTargetRef.current = null;
      return;
    }

    const loadKey = `${selectedRoomId}:${targetMsgId}`;
    if (directMessageLoadTargetRef.current === loadKey) return;

    directMessageLoadTargetRef.current = loadKey;
    pendingBottomAlignRoomIdRef.current = null;
    pendingBottomAlignHoldUntilRef.current = 0;
    isNearBottomRef.current = false;
    setShowScrollToLatest(false);

    void loadMessagesAroundMessage(targetMsgId)
      .then((result) => {
        if (directMessageLoadTargetRef.current !== loadKey) return;
        if (result.ok) {
          pendingScrollMsgIdRef.current = result.messageId || targetMsgId;
          return;
        }
        if (result.reason === 'room-changed') {
          directMessageLoadTargetRef.current = null;
          return;
        }
        pendingScrollMsgIdRef.current = null;
        directMessageLoadTargetRef.current = null;
      })
      .catch(() => {
        if (directMessageLoadTargetRef.current === loadKey) {
          pendingScrollMsgIdRef.current = null;
          directMessageLoadTargetRef.current = null;
        }
      });
  }, [
    isNearBottomRef,
    isSelectedRoomTimelineReady,
    loadMessagesAroundMessage,
    messages,
    pendingBottomAlignRoomIdRef,
    pendingScrollMsgIdRef,
    selectedRoomId,
    setShowScrollToLatest,
  ]);

  useEffect(() => {
    const targetMsgId = String(pendingScrollMsgIdRef.current || '').trim();
    if (!selectedRoomId || !targetMsgId) return;
    if (messages.some((message) => String(message.id) === targetMsgId)) return;
    if (loadMessagesAroundMessage) return;
    if (loadingOlderMessages || !hasOlderMessages) return;

    void loadOlderMessages();
  }, [hasOlderMessages, loadMessagesAroundMessage, loadOlderMessages, loadingOlderMessages, messages, selectedRoomId]);

  useEffect(() => {
    return () => {
      clearPendingMessageScrollTimer();
      clearPendingBottomAlignReleaseTimer();
      if (timelineMediaLoadFrameRef.current !== null) {
        window.cancelAnimationFrame(timelineMediaLoadFrameRef.current);
        timelineMediaLoadFrameRef.current = null;
      }
    };
  }, [clearPendingBottomAlignReleaseTimer, clearPendingMessageScrollTimer]);

  useEffect(() => {
    if (selectedRoomId && isSelectedRoomTimelineReady) return;
    readyBottomAlignRoomIdRef.current = null;
  }, [isSelectedRoomTimelineReady, selectedRoomId]);

  useLayoutEffect(() => {
    if (!selectedRoomId || messages.length === 0 || !isSelectedRoomTimelineReady) return;
    const normalizedSelectedRoomId = String(selectedRoomId);
    const pendingTargetMessageId = String(pendingScrollMsgIdRef.current || '').trim();
    if (
      pendingTargetMessageId &&
      messages.some((message) => String(message.id) === pendingTargetMessageId)
    ) {
      readyBottomAlignRoomIdRef.current = normalizedSelectedRoomId;
      pendingBottomAlignRoomIdRef.current = null;
      pendingBottomAlignHoldUntilRef.current = 0;
      clearPendingBottomAlignReleaseTimer();
      isNearBottomRef.current = false;
      layoutScrollHandledRef.current = true;
      return;
    }
    if (pendingTargetMessageId && loadMessagesAroundMessage) {
      readyBottomAlignRoomIdRef.current = normalizedSelectedRoomId;
      pendingBottomAlignRoomIdRef.current = null;
      pendingBottomAlignHoldUntilRef.current = 0;
      clearPendingBottomAlignReleaseTimer();
      isNearBottomRef.current = false;
      layoutScrollHandledRef.current = true;
      return;
    }
    const isPendingBottomAlignActive =
      String(pendingBottomAlignRoomIdRef.current || '') === normalizedSelectedRoomId;
    const justBecameReady = readyBottomAlignRoomIdRef.current !== normalizedSelectedRoomId;
    if (!isPendingBottomAlignActive && !justBecameReady) return;

    const listEl = messageListRef.current;
    if (!listEl) return;

    readyBottomAlignRoomIdRef.current = normalizedSelectedRoomId;
    listEl.scrollTop = Math.max(0, listEl.scrollHeight - listEl.clientHeight);
    isNearBottomRef.current = true;
    setShowScrollToLatest(false);
    pendingBottomAlignRoomIdRef.current = normalizedSelectedRoomId;
    pendingBottomAlignHoldUntilRef.current = Date.now() + 1800;
    schedulePendingBottomAlignRelease(normalizedSelectedRoomId);
    layoutScrollHandledRef.current = true;
  }, [
    clearPendingBottomAlignReleaseTimer,
    isSelectedRoomTimelineReady,
    messageListRef,
    messages,
    loadMessagesAroundMessage,
    schedulePendingBottomAlignRelease,
    selectedRoomId,
  ]);

  useEffect(() => {
    if (!selectedRoomId || messages.length === 0 || !isSelectedRoomTimelineReady) return;
    const lastMessage = messages[messages.length - 1];
    const lastMessageRoomId = String(lastMessage?.room_id || '');
    const isLastMessageInSelectedRoom = isRoomInSelectedConversation(lastMessageRoomId);
    if (!isLastMessageInSelectedRoom && !String(lastMessage?.id || '').startsWith('temp-')) return;

    const tailSignature = `${messages.length}:${String(lastMessage?.id || '')}:${String(lastMessage?.created_at || '')}`;
    const tailChanged = lastTimelineTailRef.current !== tailSignature;
    lastTimelineTailRef.current = tailSignature;

    if (!tailChanged) {
      layoutScrollHandledRef.current = false;
      return;
    }

    if (layoutScrollHandledRef.current) {
      layoutScrollHandledRef.current = false;
      return;
    }

    const isPending = String(pendingBottomAlignRoomIdRef.current || '') === String(selectedRoomId);
    if (isPending) {
      return;
    }

    const isOwnNewestMessage =
      String(lastMessage?.sender_id) === String(effectiveChatUserId || fallbackUserId || '');
    const shouldStick =
      isNearBottomRef.current ||
      String(lastMessage?.id || '').startsWith('temp-') ||
      (tailChanged && isOwnNewestMessage);
    if (shouldStick) {
      const behavior = isOwnNewestMessage ? ('smooth' as const) : ('auto' as const);
      const capturedRoomId = selectedRoomId;
      requestAnimationFrame(() => {
        if (String(selectedRoomIdRef.current || '') !== String(capturedRoomId)) return;
        scrollToBottom(behavior);
      });
      return;
    }

    if (String(pendingBottomAlignRoomIdRef.current || '') === String(selectedRoomId)) {
      pendingBottomAlignRoomIdRef.current = null;
    }
    setShowScrollToLatest(true);
  }, [
    effectiveChatUserId,
    fallbackUserId,
    isRoomInSelectedConversation,
    isSelectedRoomTimelineReady,
    messages,
    scrollToBottom,
    selectedRoomId,
    selectedRoomIdRef,
  ]);

  const shouldKeepBottomAligned = useCallback(() => {
    const activeRoomId = String(selectedRoomIdRef.current || selectedRoomId || '');
    if (!activeRoomId || !isSelectedRoomTimelineReady) return false;
    if (suppressBottomAlignmentUntilRef.current > Date.now()) return false;
    const isBottomAlignHoldActive =
      pendingBottomAlignHoldUntilRef.current > Date.now() &&
      String(pendingBottomAlignRoomIdRef.current || activeRoomId) === activeRoomId;
    return (
      isNearBottomRef.current ||
      String(pendingBottomAlignRoomIdRef.current || '') === activeRoomId ||
      isBottomAlignHoldActive
    );
  }, [isSelectedRoomTimelineReady, selectedRoomId, selectedRoomIdRef]);

  const handleTimelineMediaLoad = useCallback(() => {
    const activeRoomId = String(selectedRoomIdRef.current || selectedRoomId || '').trim();
    if (!activeRoomId || !shouldKeepBottomAligned()) return;
    if (timelineMediaLoadFrameRef.current !== null) return;

    timelineMediaLoadFrameRef.current = window.requestAnimationFrame(() => {
      timelineMediaLoadFrameRef.current = null;
      if (String(selectedRoomIdRef.current || '') !== activeRoomId) return;
      if (!shouldKeepBottomAligned()) return;
      scrollToBottom('auto');
    });
  }, [scrollToBottom, selectedRoomId, selectedRoomIdRef, shouldKeepBottomAligned]);

  const resetPendingMessageFocus = useCallback(() => {
    clearPendingMessageScrollTimer();
    pendingScrollMsgIdRef.current = null;
    suppressBottomAlignmentUntilRef.current = 0;
  }, [clearPendingMessageScrollTimer]);

  return {
    pendingScrollMsgIdRef,
    pendingBottomAlignRoomIdRef,
    isNearBottomRef,
    lastTimelineTailRef,
    clearPendingMessageScrollTimer,
    requestBottomAlignmentHold,
    scrollToMessage,
    tryScrollToLoadedMessage,
    isSelectedRoomTimelineReady,
    handleTimelineMediaLoad,
    resetPendingMessageFocus,
  };
}
