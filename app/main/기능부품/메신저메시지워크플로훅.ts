'use client';

import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { ChatMessage, ChatRoom } from '@/types';
import { getMessageDisplayText } from './메신저첨부';
import { buildForwardedMessageContent, insertChatMessageWithFallback } from './메신저메시지서비스';
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
  markMessageRead: (message: ChatMessage) => void | Promise<void>;
  loadReadStatusForMessage: (message: ChatMessage) => void | Promise<void>;
  deleteMessage: (message: ChatMessage) => void | Promise<void>;
  triggerChatPush: (roomId: string, messageId: string) => Promise<void> | void;
};

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
  markMessageRead,
  loadReadStatusForMessage,
  deleteMessage,
  triggerChatPush,
}: UseChatMessageWorkflowParams) {
  const openMessageActions = useCallback((message: ChatMessage) => {
    void markMessageRead(message);
    setActiveActionMsg(message);
  }, [markMessageRead, setActiveActionMsg]);

  const handleAddTaskFromAction = useCallback(async () => {
    if (!activeActionMsg) return;
    if (!effectiveTodoUserId) {
      toast('연결된 직원 계정을 찾지 못했습니다.');
      setActiveActionMsg(null);
      return;
    }

    const content =
      getMessageDisplayText(
        activeActionMsg.content,
        activeActionMsg.file_name,
        activeActionMsg.file_url,
      ) || '첨부 파일 확인';

    const { error } = await supabase.from('todos').insert([{
      user_id: effectiveTodoUserId,
      content: `[채팅] ${content}`,
      is_complete: false,
      task_date: getKoreanTodayString(),
      source_message_id: activeActionMsg.id,
      source_room_id: activeActionMsg.room_id,
    }]);

    if (!error) {
      toast('할 일 등록 완료', 'success');
      onRefresh?.();
    } else {
      toast('할 일 등록 중 오류가 발생했습니다.', 'error');
    }

    setActiveActionMsg(null);
  }, [activeActionMsg, effectiveTodoUserId, onRefresh, setActiveActionMsg]);

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

  const handleForwardToRoom = useCallback(async (room: ChatRoom) => {
    if (!forwardSourceMsg) return;

    try {
      const { data: forwardedMessage, error } = await insertChatMessageWithFallback<Pick<ChatMessage, 'id' | 'room_id'>>(
        {
          room_id: room.id,
          sender_id: effectiveChatUserId || fallbackUserId,
          content: buildForwardedMessageContent(forwardSourceMsg),
          file_url: forwardSourceMsg.file_url || null,
          file_name: forwardSourceMsg.file_name || null,
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
    } finally {
      closeForwardModal();
    }
  }, [closeForwardModal, effectiveChatUserId, fallbackUserId, forwardSourceMsg, triggerChatPush]);

  const openReadStatusPanel = useCallback((message: ChatMessage) => {
    void loadReadStatusForMessage(message);
    setActiveActionMsg(null);
  }, [loadReadStatusForMessage, setActiveActionMsg]);

  const openThreadPanel = useCallback((message: ChatMessage) => {
    setThreadRoot(message);
    setActiveActionMsg(null);
  }, [setActiveActionMsg, setThreadRoot]);

  const deleteMessageFromActions = useCallback(async (message: ChatMessage) => {
    await deleteMessage(message);
    setActiveActionMsg(null);
  }, [deleteMessage, setActiveActionMsg]);

  return {
    openMessageActions,
    handleAddTaskFromAction,
    startReplyToMessage,
    startForwardMessage,
    handleForwardToRoom,
    openReadStatusPanel,
    openThreadPanel,
    deleteMessageFromActions,
  };
}
