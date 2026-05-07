'use client';

import { insertChatMessageWithFallback } from '@/lib/chat-message-write';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { ChatMessage, ChatRoom } from '@/types';
import { getMessageDisplayText } from './메신저첨부';
import { getKoreanTodayString, isMobileChatViewport } from './메신저유틸';

type UseChatMessageWorkflowParams = {
  activeActionMsg: ChatMessage | null;
  effectiveTodoUserId: string | null | undefined;
  effectiveChatUserId: string | null | undefined;
  fallbackUserId: string | null | undefined;
  forwardSourceMsg: ChatMessage | null;
  composerRef: MutableRefObject<HTMLTextAreaElement | null>;
  onRefresh?: () => void;
  closeForwardModal: () => void;
  setActiveActionMsg: Dispatch<SetStateAction<ChatMessage | null>>;
  setReplyTo: Dispatch<SetStateAction<ChatMessage | null>>;
  setForwardSourceMsg: Dispatch<SetStateAction<ChatMessage | null>>;
  setShowForwardModal: Dispatch<SetStateAction<boolean>>;
  setThreadRoot: Dispatch<SetStateAction<ChatMessage | null>>;
  resolveThreadRootMessage: (message: ChatMessage) => ChatMessage;
  markMessageRead: (message: ChatMessage) => void | Promise<void>;
  loadReadStatusForMessage: (message: ChatMessage) => void | Promise<void>;
  deleteMessage: (message: ChatMessage) => void | Promise<void>;
  triggerChatPush: (roomId: string, messageId: string) => Promise<void> | void;
};

function buildForwardedMessageContent(message: ChatMessage) {
  const senderName =
    (message.staff as { name?: string } | null | undefined)?.name || '이름 없음';

  return `[전달] ${senderName}: ${getMessageDisplayText(
    message.content,
    message.file_name,
    message.file_url,
    '첨부 파일 확인',
  )}`;
}

export function useChatMessageWorkflow({
  activeActionMsg,
  effectiveTodoUserId,
  effectiveChatUserId,
  fallbackUserId,
  forwardSourceMsg,
  composerRef,
  onRefresh,
  closeForwardModal,
  setActiveActionMsg,
  setReplyTo,
  setForwardSourceMsg,
  setShowForwardModal,
  setThreadRoot,
  resolveThreadRootMessage,
  markMessageRead,
  loadReadStatusForMessage,
  deleteMessage,
  triggerChatPush,
}: UseChatMessageWorkflowParams) {
  const openMessageActions = useCallback((message: ChatMessage) => {
    void markMessageRead(message);
    setActiveActionMsg(message);
  }, [markMessageRead, setActiveActionMsg]);

  const addTaskFromMessage = useCallback(async (message: ChatMessage) => {
    if (!effectiveTodoUserId) {
      toast('연결된 직원 계정을 찾지 못했습니다.');
      setActiveActionMsg(null);
      return;
    }

    const content =
      getMessageDisplayText(
        message.content,
        message.file_name,
        message.file_url,
      ) || '첨부 파일 확인';

    const { error } = await supabase.from('todos').insert([{
      user_id: effectiveTodoUserId,
      content: `[채팅] ${content}`,
      is_complete: false,
      task_date: getKoreanTodayString(),
      source_message_id: message.id,
      source_room_id: message.room_id,
    }]);

    if (!error) {
      toast('할 일 등록 완료', 'success');
      onRefresh?.();
    } else {
      toast('할 일 등록 중 오류가 발생했습니다.', 'error');
    }

    setActiveActionMsg(null);
  }, [effectiveTodoUserId, onRefresh, setActiveActionMsg]);

  const handleAddTaskFromAction = useCallback(async () => {
    if (!activeActionMsg) return;
    await addTaskFromMessage(activeActionMsg);
  }, [activeActionMsg, addTaskFromMessage]);

  const startReplyToMessage = useCallback((message: ChatMessage) => {
    setReplyTo(message);
    setActiveActionMsg(null);
    requestAnimationFrame(() => {
      composerRef.current?.focus();
      if (!isMobileChatViewport()) {
        composerRef.current?.scrollIntoView({ block: 'nearest' });
      }
    });
  }, [composerRef, setActiveActionMsg, setReplyTo]);

  const startForwardMessage = useCallback((message: ChatMessage) => {
    setForwardSourceMsg(message);
    setShowForwardModal(true);
    setActiveActionMsg(null);
  }, [setActiveActionMsg, setForwardSourceMsg, setShowForwardModal]);

  const forwardMessageToRoom = useCallback(async (message: ChatMessage, room: ChatRoom) => {
    try {
      const { data: forwardedMessage, error } = await insertChatMessageWithFallback<Pick<ChatMessage, 'id' | 'room_id'>>(
        supabase,
        {
          room_id: room.id,
          sender_id: effectiveChatUserId || fallbackUserId,
          content: buildForwardedMessageContent(message),
          file_url: message.file_url || null,
          file_name: message.file_name || null,
        },
        'id, room_id',
      );

      if (error) throw error;
      if (forwardedMessage?.id && forwardedMessage?.room_id) {
        void triggerChatPush(String(forwardedMessage.room_id), String(forwardedMessage.id));
      }
      toast(`"${room.name || '채팅방'}"으로 메시지를 전달했습니다.`);
    } catch {
      toast('메시지 전달 중 오류가 발생했습니다.', 'error');
    }
  }, [effectiveChatUserId, fallbackUserId, triggerChatPush]);

  const handleForwardToRoom = useCallback(async (room: ChatRoom) => {
    if (!forwardSourceMsg) return;

    try {
      await forwardMessageToRoom(forwardSourceMsg, room);
    } finally {
      closeForwardModal();
    }
  }, [closeForwardModal, forwardMessageToRoom, forwardSourceMsg]);

  const forwardMessageToSelf = useCallback(async (message: ChatMessage, room: ChatRoom | null | undefined) => {
    if (!room) {
      toast('나와의 채팅방을 찾지 못했습니다.', 'warning');
      setActiveActionMsg(null);
      return;
    }

    await forwardMessageToRoom(message, room);
    setActiveActionMsg(null);
  }, [forwardMessageToRoom, setActiveActionMsg]);

  const openReadStatusPanel = useCallback((message: ChatMessage) => {
    void loadReadStatusForMessage(message);
    setActiveActionMsg(null);
  }, [loadReadStatusForMessage, setActiveActionMsg]);

  const openThreadPanel = useCallback((message: ChatMessage) => {
    setThreadRoot(resolveThreadRootMessage(message));
    setActiveActionMsg(null);
  }, [resolveThreadRootMessage, setActiveActionMsg, setThreadRoot]);

  const deleteMessageFromActions = useCallback(async (message: ChatMessage) => {
    await deleteMessage(message);
    setActiveActionMsg(null);
  }, [deleteMessage, setActiveActionMsg]);

  return {
    openMessageActions,
    addTaskFromMessage,
    handleAddTaskFromAction,
    startReplyToMessage,
    startForwardMessage,
    handleForwardToRoom,
    forwardMessageToSelf,
    openReadStatusPanel,
    openThreadPanel,
    deleteMessageFromActions,
  };
}
