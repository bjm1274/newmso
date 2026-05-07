'use client';

import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import type { ChatMessage } from '@/types';
import {
  resolveThreadRootMessage as resolveThreadRootMessageFromList,
  useThreadMessages,
  useThreadOverviews,
  useThreadSummaries,
} from './메신저파생훅';
import type { MessengerMentionInboxItem } from './메신저사이드바';

type UseChatThreadActionsParams = {
  messages: ChatMessage[];
  effectiveChatUserId: string | null | undefined;
  openRoomAtMessage: (roomId: string, messageId?: string | null) => void;
  setMentionInboxItems: Dispatch<SetStateAction<MessengerMentionInboxItem[]>>;
  setActiveActionMsg: Dispatch<SetStateAction<ChatMessage | null>>;
};

export function useChatThreadActions({
  messages,
  effectiveChatUserId,
  openRoomAtMessage,
  setMentionInboxItems,
  setActiveActionMsg,
}: UseChatThreadActionsParams) {
  const [threadRoot, setThreadRoot] = useState<ChatMessage | null>(null);

  const resolveThreadRootForMessage = useCallback(
    (message: ChatMessage) => resolveThreadRootMessageFromList(message, messages) || message,
    [messages],
  );

  const threadSummaries = useThreadSummaries(messages, effectiveChatUserId);
  const threadOverviews = useThreadOverviews(messages, effectiveChatUserId);
  const threadMessages = useThreadMessages(threadRoot, messages);

  const handleOpenMentionInboxItem = useCallback((item: MessengerMentionInboxItem) => {
    openRoomAtMessage(item.roomId, item.messageId);

    if (!effectiveChatUserId || !item.unread) return;

    const readAt = new Date().toISOString();
    setMentionInboxItems((prev) =>
      prev.map((entry) =>
        entry.id === item.id
          ? { ...entry, unread: false }
          : entry,
      ),
    );

    void supabase
      .from('notifications')
      .update({ read_at: readAt })
      .eq('id', item.id)
      .eq('user_id', effectiveChatUserId)
      .is('read_at', null)
      .then(() => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('erp-notification-read'));
        }
      });
  }, [effectiveChatUserId, openRoomAtMessage, setMentionInboxItems]);

  const handleCopyMessageLink = useCallback(async (message: ChatMessage) => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams({
      open_menu: '채팅',
      open_chat_room: String(message.room_id || ''),
      open_msg: String(message.id || ''),
    });
    const baseUrl = `${window.location.origin}/main?${params.toString()}`;

    try {
      await navigator.clipboard.writeText(baseUrl);
      toast('메시지 링크를 복사했습니다.');
      setActiveActionMsg(null);
    } catch {
      toast('메시지 링크 복사에 실패했습니다.', 'error');
    }
  }, [setActiveActionMsg]);

  return {
    threadRoot,
    setThreadRoot,
    resolveThreadRootForMessage,
    threadSummaries,
    threadOverviews,
    threadMessages,
    handleOpenMentionInboxItem,
    handleCopyMessageLink,
  };
}
