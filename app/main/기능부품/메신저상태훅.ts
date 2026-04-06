'use client';

import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import type { ChatMessage, ChatRoom, StaffMember } from '@/types';
import { compareStaffMembers, isMessageReadByCursor } from './메신저유틸';

type UseChatMessageEditingParams = {
  currentUserId: string | null | undefined;
  fallbackUserId: string | null | undefined;
  isMso: boolean;
  selectedRoomId: string | null;
  fetchData: () => void | Promise<void>;
  syncRoomSummaryFromMessages: (roomId: string | null | undefined, nextMessages: ChatMessage[]) => void;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setPersistedPinnedMessages: Dispatch<SetStateAction<ChatMessage[]>>;
};

type UseReadStatusParams = {
  selectedRoom: ChatRoom | null;
  allKnownStaffs: StaffMember[];
  roomReadCursorMap: Record<string, string>;
  getEffectiveRoomMemberIds: (room: ChatRoom) => string[];
};

type UseChatMobileBackLayerParams<TReactionDetail> = {
  attachmentPreviewOpen: boolean;
  closeAttachmentPreview: () => void;
  activeActionMsg: ChatMessage | null;
  setActiveActionMsg: Dispatch<SetStateAction<ChatMessage | null>>;
  reactionDetailTarget: TReactionDetail | null;
  setReactionDetailTarget: Dispatch<SetStateAction<TReactionDetail | null>>;
  unreadModalMsg: ChatMessage | null;
  closeReadStatusModal: () => void;
  showForwardModal: boolean;
  forwardSourceMsg: ChatMessage | null;
  closeForwardModal: () => void;
  showAddMemberModal: boolean;
  closeAddMemberModal: () => void;
  showMediaPanel: boolean;
  setShowMediaPanel: Dispatch<SetStateAction<boolean>>;
  showPollModal: boolean;
  closePollModal: () => void;
  showDrawer: boolean;
  setShowDrawer: Dispatch<SetStateAction<boolean>>;
  showGlobalSearch: boolean;
  closeGlobalSearch: () => void;
  showGroupModal: boolean;
  closeGroupModal: () => void;
};

export function useChatMessageEditing({
  currentUserId,
  fallbackUserId,
  isMso,
  selectedRoomId,
  fetchData,
  syncRoomSummaryFromMessages,
  setMessages,
  setPersistedPinnedMessages,
}: UseChatMessageEditingParams) {
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [editingMessageDraft, setEditingMessageDraft] = useState('');

  const startEditMessage = useCallback((message: ChatMessage) => {
    if (String(message.sender_id) !== String(currentUserId || fallbackUserId || '') && !isMso) return;
    setEditingMessage(message);
    setEditingMessageDraft(message.content || '');
  }, [currentUserId, fallbackUserId, isMso]);

  const closeEditingMessage = useCallback(() => {
    setEditingMessage(null);
    setEditingMessageDraft('');
  }, []);

  const saveEditedMessage = useCallback(async () => {
    if (!editingMessage) return;
    const targetMessage = editingMessage;
    const nextContent = editingMessageDraft.trim();
    if (!nextContent) {
      toast('메시지 내용을 입력해 주세요.', 'warning');
      return;
    }

    const messageId = String(targetMessage.id);
    closeEditingMessage();
    let nextMessagesSnapshot: ChatMessage[] = [];
    setMessages((prev) => {
      nextMessagesSnapshot = prev.map((message) =>
        String(message.id) === messageId
          ? { ...message, content: nextContent }
          : message
      );
      return nextMessagesSnapshot;
    });
    setPersistedPinnedMessages((prev) =>
      prev.map((message) =>
        String(message.id) === messageId
          ? { ...message, content: nextContent }
          : message
      )
    );
    syncRoomSummaryFromMessages(targetMessage.room_id || selectedRoomId, nextMessagesSnapshot);

    const { error } = await supabase
      .from('messages')
      .update({ content: nextContent })
      .eq('id', targetMessage.id);

    if (error) {
      toast('메시지 수정 실패', 'error');
      void fetchData();
    }
  }, [closeEditingMessage, editingMessage, editingMessageDraft, fetchData, selectedRoomId, setMessages, setPersistedPinnedMessages, syncRoomSummaryFromMessages]);

  return {
    editingMessage,
    editingMessageDraft,
    setEditingMessageDraft,
    startEditMessage,
    closeEditingMessage,
    saveEditedMessage,
  };
}

export function useReadStatusModal({
  selectedRoom,
  allKnownStaffs,
  roomReadCursorMap,
  getEffectiveRoomMemberIds,
}: UseReadStatusParams) {
  const [unreadModalMsg, setUnreadModalMsg] = useState<ChatMessage | null>(null);
  const [unreadUsers, setUnreadUsers] = useState<StaffMember[]>([]);
  const [readUsers, setReadUsers] = useState<StaffMember[]>([]);
  const [unreadLoading, setUnreadLoading] = useState(false);

  const closeReadStatusModal = useCallback(() => {
    setUnreadModalMsg(null);
  }, []);

  const loadReadStatusForMessage = useCallback(async (message: ChatMessage) => {
    if (!message?.id || !selectedRoom) return;
    setUnreadLoading(true);
    setUnreadUsers([]);
    setReadUsers([]);
    setUnreadModalMsg(message);
    try {
      const roomMemberIds = getEffectiveRoomMemberIds(selectedRoom);
      const allRoomStaffs = allKnownStaffs.filter((staff) => roomMemberIds.includes(String(staff.id)));

      const readers: StaffMember[] = [];
      const nonReaders: StaffMember[] = [];

      allRoomStaffs.forEach((staff) => {
        if (String(staff.id) === String(message.sender_id)) return;
        if (isMessageReadByCursor(message.created_at, roomReadCursorMap[String(staff.id)])) {
          readers.push(staff);
        } else {
          nonReaders.push(staff);
        }
      });

      setReadUsers(readers.sort(compareStaffMembers));
      setUnreadUsers(nonReaders.sort(compareStaffMembers));
    } catch (error) {
      console.error('loadReadStatusForMessage error', error);
      toast('읽음 현황을 불러오지 못했습니다.');
    } finally {
      setUnreadLoading(false);
    }
  }, [allKnownStaffs, getEffectiveRoomMemberIds, roomReadCursorMap, selectedRoom]);

  return {
    unreadModalMsg,
    unreadUsers,
    readUsers,
    unreadLoading,
    setUnreadModalMsg,
    closeReadStatusModal,
    loadReadStatusForMessage,
  };
}

export function useChatMobileBackLayer<TReactionDetail>({
  attachmentPreviewOpen,
  closeAttachmentPreview,
  activeActionMsg,
  setActiveActionMsg,
  reactionDetailTarget,
  setReactionDetailTarget,
  unreadModalMsg,
  closeReadStatusModal,
  showForwardModal,
  forwardSourceMsg,
  closeForwardModal,
  showAddMemberModal,
  closeAddMemberModal,
  showMediaPanel,
  setShowMediaPanel,
  showPollModal,
  closePollModal,
  showDrawer,
  setShowDrawer,
  showGlobalSearch,
  closeGlobalSearch,
  showGroupModal,
  closeGroupModal,
}: UseChatMobileBackLayerParams<TReactionDetail>) {
  return useCallback(() => {
    if (attachmentPreviewOpen) {
      closeAttachmentPreview();
      return true;
    }
    if (activeActionMsg) {
      setActiveActionMsg(null);
      return true;
    }
    if (reactionDetailTarget) {
      setReactionDetailTarget(null);
      return true;
    }
    if (unreadModalMsg) {
      closeReadStatusModal();
      return true;
    }
    if (showForwardModal || forwardSourceMsg) {
      closeForwardModal();
      return true;
    }
    if (showAddMemberModal) {
      closeAddMemberModal();
      return true;
    }
    if (showMediaPanel) {
      setShowMediaPanel(false);
      return true;
    }
    if (showPollModal) {
      closePollModal();
      return true;
    }
    if (showDrawer) {
      setShowDrawer(false);
      return true;
    }
    if (showGlobalSearch) {
      closeGlobalSearch();
      return true;
    }
    if (showGroupModal) {
      closeGroupModal();
      return true;
    }
    return false;
  }, [
    activeActionMsg,
    attachmentPreviewOpen,
    closeAddMemberModal,
    closeAttachmentPreview,
    closeForwardModal,
    closeGlobalSearch,
    closeGroupModal,
    closePollModal,
    closeReadStatusModal,
    forwardSourceMsg,
    reactionDetailTarget,
    setActiveActionMsg,
    setReactionDetailTarget,
    setShowDrawer,
    setShowMediaPanel,
    showAddMemberModal,
    showDrawer,
    showForwardModal,
    showGlobalSearch,
    showGroupModal,
    showMediaPanel,
    showPollModal,
    unreadModalMsg,
  ]);
}
