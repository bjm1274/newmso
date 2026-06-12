'use client';

import { getProfilePhotoUrl } from '@/lib/profile-photo';
import { pokeChannel } from '@/lib/polling-bus';
import { toast } from '@/lib/toast';
import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { ChatMessage, ChatRoom, StaffMember } from '@/types';
import { getMessageDisplayText } from './메신저첨부';
import { insertChatMessageWithFallback } from '@/lib/chat-message-write';
import { supabase } from '@/lib/supabase';
import type { SendMessageOptions } from './메신저메시지서비스';
import {
  NOTICE_ROOM_ID,
  buildChatMessageInsertPayload,
  getConversationRoomIdsByRoomId,
  shouldTriggerImmediateChatPush,
  sortChatRoomsWithNoticeFirst,
  type MessageRetryPayload,
} from './메신저유틸';
import {
  removeChatRetryQueueEntry,
  upsertFailedChatRetryEntry,
} from './메신저재시도큐';

export type { SendMessageOptions } from './메신저메시지서비스';

type DeliveryStateLike = {
  status: 'sending' | 'failed' | 'sent';
  retryPayload?: MessageRetryPayload;
  error?: string | null;
};

type UseChatMessageSendingParams = {
  selectedRoomId: string | null;
  visibleRoomIds: string[];
  effectiveChatUserId: string | null | undefined;
  user: StaffMember | null;
  replyTo: ChatMessage | null;
  canWriteNotice: boolean;
  selectedRoomIdRef: MutableRefObject<string | null>;
  inputMsgRef: MutableRefObject<string>;
  draftMapRef: MutableRefObject<Map<string, string>>;
  deliveryStatesRef: MutableRefObject<Record<string, DeliveryStateLike>>;
  typingClearRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  wardQuickReplySendingMessageId: string | null;
  setRoom: (roomId: string | null) => void;
  setInputMsg: Dispatch<SetStateAction<string>>;
  setReplyTo: Dispatch<SetStateAction<ChatMessage | null>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setDeliveryStates: Dispatch<SetStateAction<Record<string, DeliveryStateLike>>>;
  setChatRooms: Dispatch<SetStateAction<ChatRoom[]>>;
  setWardQuickReplySendingMessageId: Dispatch<SetStateAction<string | null>>;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  broadcastChatSync: (action: string, roomId?: string | null) => void;
  emitTypingState: (typing: boolean) => void;
  triggerChatPush: (roomId: string, messageId: string) => Promise<void> | void;
  openSlashDraftFromText: (content: string) => boolean;
};

export function useChatMessageSending({
  selectedRoomId,
  visibleRoomIds,
  effectiveChatUserId,
  user,
  replyTo,
  canWriteNotice,
  selectedRoomIdRef,
  inputMsgRef,
  draftMapRef,
  deliveryStatesRef,
  typingClearRef,
  wardQuickReplySendingMessageId,
  setRoom,
  setInputMsg,
  setReplyTo,
  setMessages,
  setDeliveryStates,
  setChatRooms,
  setWardQuickReplySendingMessageId,
  scrollToBottom,
  broadcastChatSync,
  emitTypingState,
  triggerChatPush,
  openSlashDraftFromText,
}: UseChatMessageSendingParams) {
  const handleSendMessage = useCallback(async ({
    fileUrl,
    fileSizeBytes,
    fileKind,
    retryMessageId,
    fileName,
    contentOverride,
    clearComposerIfUnchangedFrom,
    replyToIdOverride,
    albumId,
    albumIndex,
    albumTotal,
  }: SendMessageOptions = {}): Promise<boolean> => {
    const actorId = effectiveChatUserId || user?.id;
    if (!user || !actorId) return false;

    const retryPayload = retryMessageId
      ? deliveryStatesRef.current[retryMessageId]?.retryPayload || null
      : null;
    const liveInput = inputMsgRef.current;
    const trimmed = liveInput.trim();
    const composerSnapshot = clearComposerIfUnchangedFrom ?? liveInput;
    const roomId = retryPayload?.roomId || selectedRoomId;
    const content = retryPayload
      ? retryPayload.content
      : typeof contentOverride === 'string'
        ? contentOverride
        : trimmed;
    const resolvedFileUrl = retryPayload?.fileUrl ?? fileUrl ?? null;
    const resolvedFileName = retryPayload?.fileName ?? fileName ?? null;
    const resolvedFileSizeBytes = retryPayload?.fileSizeBytes ?? fileSizeBytes ?? null;
    const resolvedFileKind = retryPayload?.fileKind ?? fileKind ?? null;
    const resolvedReplyToId =
      retryPayload?.replyToId ??
      (typeof replyToIdOverride === 'undefined' ? replyTo?.id ?? null : replyToIdOverride);
    const resolvedAlbumId = retryPayload?.albumId ?? albumId ?? null;
    const resolvedAlbumIndex = retryPayload?.albumIndex ?? albumIndex ?? null;
    const resolvedAlbumTotal = retryPayload?.albumTotal ?? albumTotal ?? null;

    if (!content && !resolvedFileUrl) return false;
    if (!roomId) return false;

    if (roomId !== NOTICE_ROOM_ID && !visibleRoomIds.includes(String(roomId))) {
      toast('참여 중인 채팅방에서만 메시지를 보낼 수 있습니다.', 'warning');
      setRoom(selectedRoomId || NOTICE_ROOM_ID);
      return false;
    }

    if (!resolvedFileUrl && openSlashDraftFromText(content)) {
      return false;
    }

    if (roomId === NOTICE_ROOM_ID && !canWriteNotice) {
      toast('공지 메시지 방에는 부서장 이상만 작성할 수 있습니다.');
      return false;
    }

    const retrySnapshot: MessageRetryPayload = {
      roomId,
      content,
      fileUrl: resolvedFileUrl,
      fileName: resolvedFileName,
      fileSizeBytes: resolvedFileSizeBytes,
      fileKind: resolvedFileKind,
      replyToId: resolvedReplyToId,
      albumId: resolvedAlbumId,
      albumIndex: resolvedAlbumIndex,
      albumTotal: resolvedAlbumTotal,
    };
    const insertPayload = buildChatMessageInsertPayload(actorId, retrySnapshot);

    const optimisticId = retryMessageId || `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticMessage = {
      id: optimisticId,
      ...insertPayload,
      created_at: new Date().toISOString(),
      is_deleted: false,
      staff: { name: user.name, photo_url: getProfilePhotoUrl(user) },
    } as ChatMessage;

    if (retryMessageId) {
      setMessages((prev) =>
        prev.map((message) =>
          String(message.id) === String(retryMessageId)
            ? { ...message, created_at: optimisticMessage.created_at }
            : message,
        ),
      );
    } else {
      setMessages((prev) => [...prev, optimisticMessage]);
    }

    setDeliveryStates((prev) => ({
      ...prev,
      [optimisticId]: {
        status: 'sending',
        retryPayload: retrySnapshot,
        error: null,
      },
    }));

    if (!retryMessageId) {
      const activeRoomId = String(selectedRoomIdRef.current || '');
      const shouldClearComposer =
        activeRoomId === String(roomId) &&
        inputMsgRef.current === composerSnapshot;

      if (shouldClearComposer) {
        inputMsgRef.current = '';
        setInputMsg('');
        if (selectedRoomIdRef.current) {
          draftMapRef.current.delete(selectedRoomIdRef.current);
        }
      } else if (selectedRoomIdRef.current) {
        draftMapRef.current.set(selectedRoomIdRef.current, inputMsgRef.current);
      }
    }

    setReplyTo(null);
    requestAnimationFrame(() => scrollToBottom('smooth'));

    if (typingClearRef.current) {
      clearTimeout(typingClearRef.current);
      typingClearRef.current = null;
    }
    emitTypingState(false);

    const { data: inserted, error } = await insertChatMessageWithFallback<ChatMessage>(supabase, insertPayload);

    if (!error && inserted) {
      removeChatRetryQueueEntry(actorId, optimisticId);
      const optimisticInsertedMessage = {
        ...inserted,
        staff: { name: user.name, photo_url: getProfilePhotoUrl(user) },
      } as ChatMessage;

      setMessages((prev) => {
        const seenIds = new Set<string>();
        return prev
          .map((message) =>
            String(message.id) === String(optimisticId) ? optimisticInsertedMessage : message,
          )
          .filter((message) => {
            const normalizedId = String(message.id || '');
            if (seenIds.has(normalizedId)) return false;
            seenIds.add(normalizedId);
            return true;
          });
      });

      setDeliveryStates((prev) => {
        const next = { ...prev };
        delete next[optimisticId];
        next[String(inserted.id)] = {
          status: 'sent',
          retryPayload: retrySnapshot,
          error: null,
        };
        return next;
      });

      // conversation 그룹에 속한 모든 방 ID를 업데이트하여 사이드바
      // 대표 방의 preview도 즉시 반영되도록 한다.
      setChatRooms((prev) => {
        const convRoomIds = getConversationRoomIdsByRoomId(String(roomId), prev);
        const targetIds = Array.from(
          new Set([...(convRoomIds.length > 0 ? convRoomIds : [String(roomId)]), String(roomId)].filter(Boolean)),
        );
        return sortChatRoomsWithNoticeFirst(
          prev.map((room) =>
            targetIds.includes(String(room.id))
              ? {
                  ...room,
                  last_message: getMessageDisplayText(
                    content,
                    resolvedFileName,
                    resolvedFileUrl,
                    room.last_message,
                  ),
                  last_message_preview: getMessageDisplayText(
                    content,
                    resolvedFileName,
                    resolvedFileUrl,
                    room.last_message_preview,
                  ),
                  last_message_at: inserted.created_at || new Date().toISOString(),
                }
              : room,
          ),
        );
      });

      broadcastChatSync('message-sent', roomId);
      // 본인 송신 직후 다음 polling 주기를 기다리지 않고 즉시 tail 재조회 트리거.
      // 같은 탭 내 다른 구독자(방 목록 배지 등)와 같은 사용자의 다른 탭은
      // BroadcastChannel 경로로, 다른 사용자는 본인 측 polling이 곧바로 발화.
      pokeChannel(`chat-realtime-${roomId}`);
      pokeChannel('chat-global-messages');
      pokeChannel('chat-rooms-list');
      if (shouldTriggerImmediateChatPush({
        albumId: inserted.album_id,
        albumIndex: inserted.album_index,
        albumTotal: inserted.album_total,
      })) {
        void triggerChatPush(String(inserted.room_id), String(inserted.id));
      }
      return true;
    }

    setDeliveryStates((prev) => ({
      ...prev,
      [optimisticId]: {
        status: 'failed',
        retryPayload: retrySnapshot,
        error: error?.message || '메시지 전송 실패',
      },
    }));
    upsertFailedChatRetryEntry(actorId, {
      id: optimisticId,
      payload: retrySnapshot,
      error: error?.message || '메시지 전송 실패',
      createdAt: optimisticMessage.created_at,
    });
    console.error('message send failed', error);
    return false;
  }, [
    broadcastChatSync,
    canWriteNotice,
    deliveryStatesRef,
    draftMapRef,
    effectiveChatUserId,
    emitTypingState,
    inputMsgRef,
    openSlashDraftFromText,
    replyTo,
    scrollToBottom,
    selectedRoomId,
    selectedRoomIdRef,
    setChatRooms,
    setDeliveryStates,
    setInputMsg,
    setMessages,
    setReplyTo,
    setRoom,
    triggerChatPush,
    typingClearRef,
    user,
    visibleRoomIds,
  ]);

  const sendWardQuickReply = useCallback(async (message: ChatMessage, replyText: string) => {
    const messageId = String(message.id || '').trim();
    if (!messageId || wardQuickReplySendingMessageId === messageId) return;

    setWardQuickReplySendingMessageId(messageId);
    try {
      await handleSendMessage({
        contentOverride: replyText,
        clearComposerIfUnchangedFrom: '__ward-quick-reply__',
        replyToIdOverride: messageId,
      });
    } finally {
      setWardQuickReplySendingMessageId(null);
    }
  }, [handleSendMessage, setWardQuickReplySendingMessageId, wardQuickReplySendingMessageId]);

  const retryFailedMessage = useCallback(async (messageId: string) => {
    await handleSendMessage({ retryMessageId: messageId });
  }, [handleSendMessage]);

  const retryAllFailedMessages = useCallback(async (messageIds: string[]) => {
    for (const messageId of messageIds) {
      const normalizedId = String(messageId || '').trim();
      if (!normalizedId) continue;
      if (deliveryStatesRef.current[normalizedId]?.status !== 'failed') continue;
      // Sequential retries avoid double-inserts when multiple queued sends recover together.
      await handleSendMessage({ retryMessageId: normalizedId });
    }
  }, [deliveryStatesRef, handleSendMessage]);

  return {
    handleSendMessage,
    sendWardQuickReply,
    retryFailedMessage,
    retryAllFailedMessages,
  };
}
