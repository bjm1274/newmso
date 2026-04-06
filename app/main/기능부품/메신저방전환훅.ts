'use client';

import { useCallback, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';
import { supabase } from '@/lib/supabase';
import { CHAT_ACTIVE_ROOM_KEY, CHAT_ROOM_KEY } from '@/app/main/navigation-state';
import type { ChatRoom } from '@/types';
import { getConversationRoomIdsByRoomId, isMobileChatViewport } from './메신저유틸';

type UseChatRoomNavigationParams = {
  selectedRoomId: string | null;
  selectedRoomIdRef: MutableRefObject<string | null>;
  chatRoomsRef: MutableRefObject<ChatRoom[]>;
  inputMsgRef: MutableRefObject<string>;
  draftMapRef: MutableRefObject<Map<string, string>>;
  pendingBottomAlignRoomIdRef: MutableRefObject<string | null>;
  isNearBottomRef: MutableRefObject<boolean>;
  lastTimelineTailRef: MutableRefObject<string>;
  timelineItemCountRef: MutableRefObject<number>;
  messageListRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  effectiveChatUserId: string | null | undefined;
  setSelectedRoomId: Dispatch<SetStateAction<string | null>>;
  setInputMsg: Dispatch<SetStateAction<string>>;
  setShowScrollToLatest: Dispatch<SetStateAction<boolean>>;
  setRoomUnreadCounts: Dispatch<SetStateAction<Record<string, number>>>;
  setTimelineScrollRequestToken: Dispatch<SetStateAction<number>>;
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
  pendingBottomAlignRoomIdRef,
  isNearBottomRef,
  lastTimelineTailRef,
  timelineItemCountRef,
  messageListRef,
  scrollRef,
  composerRef,
  effectiveChatUserId,
  setSelectedRoomId,
  setInputMsg,
  setShowScrollToLatest,
  setRoomUnreadCounts,
  setTimelineScrollRequestToken,
  markConversationNotificationsAsRead,
  broadcastChatSync,
  onRoomChangeCleanup,
}: UseChatRoomNavigationParams) {
  const setRoom = useCallback((roomId: string | null) => {
    const previousSelectedRoomId = selectedRoomIdRef.current;
    const conversationRoomIds = roomId
      ? getConversationRoomIdsByRoomId(roomId, chatRoomsRef.current as ChatRoom[])
      : [];

    if (previousSelectedRoomId && previousSelectedRoomId !== roomId) {
      draftMapRef.current.set(previousSelectedRoomId, inputMsgRef.current);
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

    const savedDraft = (roomId ? draftMapRef.current.get(roomId) : '') || '';
    inputMsgRef.current = savedDraft;
    setInputMsg(savedDraft);

    if (roomId && effectiveChatUserId) {
      const readAt = new Date().toISOString();
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
          await Promise.allSettled([
            markConversationNotificationsAsRead(targetRoomIds, readAt),
            supabase.from('room_read_cursors').upsert(
              targetRoomIds.map((targetRoomId) => ({
                user_id: effectiveChatUserId,
                room_id: targetRoomId,
                last_read_at: readAt,
              })),
              { onConflict: 'user_id,room_id' }
            ),
          ]);
          broadcastChatSync('message-read', roomId);
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
    selectedRoomIdRef,
    setInputMsg,
    setRoomUnreadCounts,
    setSelectedRoomId,
    setShowScrollToLatest,
  ]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const listEl = messageListRef.current;
    if (listEl) {
      if (behavior === 'auto') {
        listEl.scrollTop = listEl.scrollHeight;
      } else {
        listEl.scrollTo({ top: listEl.scrollHeight, behavior });
      }
    } else {
      scrollRef.current?.scrollIntoView({ behavior, block: 'end' });
    }

    if (!isMobileChatViewport()) {
      requestAnimationFrame(() => {
        composerRef.current?.scrollIntoView({
          behavior,
          block: 'end',
          inline: 'nearest',
        });
      });
    }

    isNearBottomRef.current = true;
    setShowScrollToLatest(false);
  }, [composerRef, isNearBottomRef, messageListRef, scrollRef, setShowScrollToLatest]);

  const alignRoomToLatest = useCallback((roomId: string | null | undefined, behavior: ScrollBehavior = 'auto') => {
    if (!roomId) return;

    let attempts = 0;
    const maxAttempts = 4;

    const tryAlign = () => {
      if (selectedRoomIdRef.current !== roomId) return;
      if (pendingBottomAlignRoomIdRef.current !== roomId) return;
      const hasTimelineItems = timelineItemCountRef.current > 0;
      if (!hasTimelineItems) return;

      scrollToBottom(attempts === 0 ? behavior : 'auto');

      const listEl = messageListRef.current;
      if (!listEl) {
        if (pendingBottomAlignRoomIdRef.current === roomId) {
          pendingBottomAlignRoomIdRef.current = null;
        }
        return;
      }

      const distanceFromBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;
      if (distanceFromBottom > 24 && attempts < maxAttempts) {
        attempts += 1;
        requestAnimationFrame(() => {
          requestAnimationFrame(tryAlign);
        });
        return;
      }

      if (pendingBottomAlignRoomIdRef.current === roomId) {
        pendingBottomAlignRoomIdRef.current = null;
      }
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(tryAlign);
    });

    window.setTimeout(tryAlign, 120);
    window.setTimeout(tryAlign, 260);
  }, [messageListRef, pendingBottomAlignRoomIdRef, scrollToBottom, selectedRoomIdRef, timelineItemCountRef]);

  const alignRoomToLatestImmediately = useCallback((roomId: string | null | undefined) => {
    if (!roomId) return;
    if (selectedRoomIdRef.current !== roomId) return;

    const listEl = messageListRef.current;
    const hasRenderedTimelineItems = Boolean(
      listEl?.querySelector('[data-testid^="chat-message-row-"], [data-testid^="chat-poll-"]')
    );
    if (!hasRenderedTimelineItems) return;

    if (listEl) {
      listEl.scrollTop = listEl.scrollHeight;
    } else {
      scrollRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
    }

    if (!isMobileChatViewport()) {
      composerRef.current?.scrollIntoView({
        behavior: 'auto',
        block: 'end',
        inline: 'nearest',
      });
    }

    isNearBottomRef.current = true;
    setShowScrollToLatest(false);
  }, [composerRef, isNearBottomRef, messageListRef, scrollRef, selectedRoomIdRef, setShowScrollToLatest]);

  const forceRoomListToBottom = useCallback((roomId: string | null | undefined) => {
    if (!roomId) return;
    if (selectedRoomIdRef.current !== roomId) return;

    const listEl = messageListRef.current;
    if (listEl) {
      listEl.scrollTop = listEl.scrollHeight;
    } else {
      scrollRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
    }

    isNearBottomRef.current = true;
    setShowScrollToLatest(false);
  }, [isNearBottomRef, messageListRef, scrollRef, selectedRoomIdRef, setShowScrollToLatest]);

  const scheduleRoomListBottomAlignment = useCallback((roomId: string | null | undefined) => {
    if (!roomId) return;

    let attempts = 0;
    const maxAttempts = 18;

    const tryAlign = () => {
      if (selectedRoomIdRef.current !== roomId) return;
      if (pendingBottomAlignRoomIdRef.current !== roomId) return;

      forceRoomListToBottom(roomId);
      const listEl = messageListRef.current;
      if (!listEl) return;

      const distanceFromBottom = Math.abs(listEl.scrollHeight - listEl.clientHeight - listEl.scrollTop);
      if (distanceFromBottom <= 24) return;

      attempts += 1;
      if (attempts >= maxAttempts) return;
      window.setTimeout(tryAlign, attempts < 4 ? 40 : 80);
    };

    tryAlign();
  }, [forceRoomListToBottom, messageListRef, selectedRoomIdRef]);

  const handleRoomListClick = useCallback((roomId: string) => {
    const normalizedRoomId = String(roomId || '').trim();
    if (!normalizedRoomId) {
      setRoom(null);
      return;
    }

    const isSameRoom = String(selectedRoomIdRef.current || '') === normalizedRoomId;
    if (isSameRoom) {
      pendingBottomAlignRoomIdRef.current = normalizedRoomId;
      setTimelineScrollRequestToken((value) => value + 1);
      scheduleRoomListBottomAlignment(normalizedRoomId);
      alignRoomToLatestImmediately(normalizedRoomId);
      alignRoomToLatest(normalizedRoomId, 'auto');
      requestAnimationFrame(() => {
        scheduleRoomListBottomAlignment(normalizedRoomId);
        alignRoomToLatestImmediately(normalizedRoomId);
        requestAnimationFrame(() => {
          scheduleRoomListBottomAlignment(normalizedRoomId);
        });
      });
      window.setTimeout(() => {
        scheduleRoomListBottomAlignment(normalizedRoomId);
      }, 120);
      return;
    }

    setRoom(normalizedRoomId);
  }, [
    alignRoomToLatest,
    alignRoomToLatestImmediately,
    forceRoomListToBottom,
    pendingBottomAlignRoomIdRef,
    scheduleRoomListBottomAlignment,
    selectedRoomIdRef,
    setRoom,
    setTimelineScrollRequestToken,
  ]);

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
    alignRoomToLatest,
    alignRoomToLatestImmediately,
    handleRoomListClick,
    updateScrollPositionState,
  };
}
