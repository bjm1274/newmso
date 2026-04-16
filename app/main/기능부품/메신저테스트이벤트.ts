'use client';

import type { ChatMessage } from '@/types';

const CHAT_MOCK_MESSAGE_INSERT_EVENT = 'erp-mock-chat-message-insert';
const CHAT_MOCK_NOTIFICATION_INSERT_EVENT = 'erp-mock-notification-insert';

export type ChatMockMessageInsertDetail = {
  rows?: ChatMessage[];
  row?: ChatMessage;
};

function isMessengerTestEventEnabled() {
  return process.env.NODE_ENV !== 'production';
}

export function bindMockChatMessageInsert(
  handler: (detail: ChatMockMessageInsertDetail) => void,
) {
  if (typeof window === 'undefined' || !isMessengerTestEventEnabled()) {
    return () => {};
  }

  const listener = (event: Event) => {
    handler((event as CustomEvent<ChatMockMessageInsertDetail>).detail || {});
  };

  window.addEventListener(CHAT_MOCK_MESSAGE_INSERT_EVENT, listener as EventListener);
  return () => {
    window.removeEventListener(CHAT_MOCK_MESSAGE_INSERT_EVENT, listener as EventListener);
  };
}

export function bindMockNotificationInsert(handler: ((event: Event) => void) | (() => void)) {
  if (typeof window === 'undefined' || !isMessengerTestEventEnabled()) {
    return () => {};
  }

  window.addEventListener(CHAT_MOCK_NOTIFICATION_INSERT_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener(CHAT_MOCK_NOTIFICATION_INSERT_EVENT, handler as EventListener);
  };
}
