'use client';

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { ChatMessage, StaffMember } from '@/types';
import type { DeliveryState } from './메신저타입';
import {
  buildRetryQueueMessage,
  getDueChatRetryQueueEntries,
  readChatRetryQueue,
} from './메신저재시도큐';

type UseChatRetryQueueStateParams = {
  actorId: string | null;
  selectedRoomId: string | null;
  user: StaffMember | null;
  deliveryStatesRef: MutableRefObject<Record<string, DeliveryState>>;
  setDeliveryStates: Dispatch<SetStateAction<Record<string, DeliveryState>>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  retryAllFailedMessages: (messageIds: string[]) => Promise<void>;
};

export function useChatRetryQueueState({
  actorId,
  selectedRoomId,
  user,
  deliveryStatesRef,
  setDeliveryStates,
  setMessages,
  retryAllFailedMessages,
}: UseChatRetryQueueStateParams) {
  useEffect(() => {
    if (!actorId) return;
    const queuedEntries = readChatRetryQueue(actorId);
    if (!queuedEntries.length) return;
    setDeliveryStates((prev) => {
      const next = { ...prev };
      queuedEntries.forEach((entry) => {
        if (next[entry.id]?.status === 'sent') return;
        next[entry.id] = {
          status: next[entry.id]?.status === 'sending' ? 'sending' : 'failed',
          retryPayload: entry.payload,
          error: entry.error,
        };
      });
      return next;
    });
  }, [actorId, setDeliveryStates]);

  useEffect(() => {
    if (!actorId || !selectedRoomId) return;
    const queuedMessages = readChatRetryQueue(actorId)
      .filter((entry) => String(entry.payload.roomId) === String(selectedRoomId))
      .map((entry) => buildRetryQueueMessage(entry, user));
    if (!queuedMessages.length) return;
    setMessages((prev) => {
      const merged = new Map<string, ChatMessage>();
      [...prev, ...queuedMessages].forEach((message) => {
        merged.set(String(message.id), message);
      });
      return Array.from(merged.values()).sort(
        (left, right) =>
          new Date(left.created_at || 0).getTime() - new Date(right.created_at || 0).getTime(),
      );
    });
  }, [actorId, selectedRoomId, setMessages, user]);

  useEffect(() => {
    if (!actorId || !selectedRoomId || typeof window === 'undefined') return;

    const flushDueRetryQueue = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      const dueEntries = getDueChatRetryQueueEntries(actorId, [selectedRoomId])
        .filter((entry) => deliveryStatesRef.current[entry.id]?.status === 'failed');
      if (!dueEntries.length) return;
      void retryAllFailedMessages(dueEntries.map((entry) => entry.id));
    };

    flushDueRetryQueue();
    const intervalId = window.setInterval(flushDueRetryQueue, 5000);
    window.addEventListener('online', flushDueRetryQueue);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('online', flushDueRetryQueue);
    };
  }, [actorId, deliveryStatesRef, retryAllFailedMessages, selectedRoomId]);
}
