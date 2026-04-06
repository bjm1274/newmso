'use client';

import { useCallback, useEffect, useState, type MutableRefObject } from 'react';
import type { ChatMessage, StaffMember } from '@/types';

type UseChatSearchNavigationParams = {
  globalSearchQuery: string;
  closeGlobalSearch: () => void;
  setShowGroupModal: (open: boolean) => void;
  selectedRoomIdRef: MutableRefObject<string | null>;
  pendingScrollMsgIdRef: MutableRefObject<string | null>;
  messages: ChatMessage[];
  scrollToMessage: (messageId: string) => void;
  setRoom: (roomId: string | null) => void;
  openDirectChat: (staff: StaffMember) => void | Promise<void>;
};

export function useChatSearchNavigation({
  globalSearchQuery,
  closeGlobalSearch,
  setShowGroupModal,
  selectedRoomIdRef,
  pendingScrollMsgIdRef,
  messages,
  scrollToMessage,
  setRoom,
  openDirectChat,
}: UseChatSearchNavigationParams) {
  const [transientHighlightQuery, setTransientHighlightQuery] = useState('');

  const openGroupFromGlobalSearch = useCallback(() => {
    closeGlobalSearch();
    setShowGroupModal(true);
  }, [closeGlobalSearch, setShowGroupModal]);

  const openRoomFromGlobalSearch = useCallback((roomId: string, messageId?: string) => {
    if (messageId) pendingScrollMsgIdRef.current = messageId;
    setTransientHighlightQuery(globalSearchQuery.trim());
    if (
      messageId &&
      String(selectedRoomIdRef.current || '') === String(roomId) &&
      messages.some((message) => String(message.id) === String(messageId))
    ) {
      window.setTimeout(() => scrollToMessage(messageId), 120);
    }
    setRoom(roomId);
    closeGlobalSearch();
  }, [
    closeGlobalSearch,
    globalSearchQuery,
    messages,
    pendingScrollMsgIdRef,
    scrollToMessage,
    selectedRoomIdRef,
    setRoom,
  ]);

  const openMemberFromGlobalSearch = useCallback(async (staff: StaffMember) => {
    closeGlobalSearch();
    await openDirectChat(staff);
  }, [closeGlobalSearch, openDirectChat]);

  useEffect(() => {
    if (!transientHighlightQuery.trim()) return;
    const timer = window.setTimeout(() => setTransientHighlightQuery(''), 12000);
    return () => window.clearTimeout(timer);
  }, [transientHighlightQuery]);

  return {
    transientHighlightQuery,
    openGroupFromGlobalSearch,
    openRoomFromGlobalSearch,
    openMemberFromGlobalSearch,
  };
}
