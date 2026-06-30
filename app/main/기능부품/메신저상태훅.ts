'use client';

import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { toast } from '@/lib/toast';
import { db } from '@/lib/db-client';
import { logger } from '@/lib/logger';
import type { ChatMessage, ChatRoom, StaffMember } from '@/types';
import { compareStaffMembers, isMessageReadByCursor } from './메신저유틸';

type UseChatMessageEditingParams = {
  currentUserId: string | null | undefined;
  fallbackUserId: string | null | undefined;
  auditUserId: string | null | undefined;
  auditUserName: string | null | undefined;
  isMso: boolean;
  selectedRoomId: string | null;
  fetchData: () => void | Promise<void>;
  syncRoomSummaryFromMessages: (roomId: string | null | undefined, nextMessages: ChatMessage[]) => void;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setPersistedPinnedMessages: Dispatch<SetStateAction<ChatMessage[]>>;
};

export type MessageEditHistoryEntry = {
  id: string;
  editorId: string | null;
  editorName: string;
  previousContent: string | null;
  nextContent: string | null;
  editedAt: string | null;
  isFallback?: boolean;
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
  threadRoot: ChatMessage | null;
  setThreadRoot: Dispatch<SetStateAction<ChatMessage | null>>;
  editHistoryTarget: ChatMessage | null;
  closeEditHistory: () => void;
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
  auditUserId,
  auditUserName,
  isMso,
  selectedRoomId,
  fetchData,
  syncRoomSummaryFromMessages,
  setMessages,
  setPersistedPinnedMessages }: UseChatMessageEditingParams) {
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [editingMessageDraft, setEditingMessageDraft] = useState('');
  const [editHistoryTarget, setEditHistoryTarget] = useState<ChatMessage | null>(null);
  const [editHistoryEntries, setEditHistoryEntries] = useState<MessageEditHistoryEntry[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);

  const startEditMessage = useCallback((message: ChatMessage) => {
    if (String(message.sender_id) !== String(currentUserId || fallbackUserId || '') && !isMso) return;
    setEditingMessage(message);
    setEditingMessageDraft(message.content || '');
  }, [currentUserId, fallbackUserId, isMso]);

  const closeEditingMessage = useCallback(() => {
    setEditingMessage(null);
    setEditingMessageDraft('');
  }, []);

  const closeEditHistory = useCallback(() => {
    setEditHistoryTarget(null);
    setEditHistoryEntries([]);
    setEditHistoryLoading(false);
  }, []);

  const openEditHistory = useCallback(async (message: ChatMessage) => {
    setEditHistoryTarget(message);
    setEditHistoryEntries([]);
    setEditHistoryLoading(true);
    const fallbackEntries: MessageEditHistoryEntry[] = message.edited_at
      ? [{
          id: `fallback-${String(message.id)}`,
          editorId: String(message.sender_id || '').trim() || null,
          editorName: String((message.staff as { name?: string } | null | undefined)?.name || message.sender_name || '알 수 없음'),
          previousContent: null,
          nextContent: message.content || null,
          editedAt: message.edited_at || message.created_at || null,
          isFallback: true }]
      : [];

    try {
      const { data, error } = await db
        .from('audit_logs')
        .select('id, user_id, user_name, details, created_at')
        .eq('action', 'message_edit')
        .eq('target_type', 'message')
        .eq('target_id', String(message.id))
        .order('created_at', { ascending: false });

      if (error) throw error;

      const parsedEntries = (data || []).map((row: Record<string, unknown>) => {
        const details =
          row.details && typeof row.details === 'object' && !Array.isArray(row.details)
            ? row.details as Record<string, unknown>
            : {};

        return {
          id: String(row.id || `history-${String(message.id)}`),
          editorId: String(row.user_id || '').trim() || null,
          editorName: String(row.user_name || details.editor_name || '알 수 없음'),
          previousContent:
            typeof details.previous_content === 'string' ? details.previous_content : null,
          nextContent:
            typeof details.next_content === 'string' ? details.next_content : null,
          editedAt:
            typeof details.edited_at === 'string' && details.edited_at.trim()
              ? details.edited_at
              : (typeof row.created_at === 'string' ? row.created_at : null) } satisfies MessageEditHistoryEntry;
      });

      setEditHistoryEntries(parsedEntries.length > 0 ? parsedEntries : fallbackEntries);
    } catch (error) {
      logger.warn('openEditHistory error', error);
      setEditHistoryEntries(fallbackEntries);
      if (!fallbackEntries.length) {
        toast('수정 이력을 불러오지 못했습니다.', 'error');
      }
    } finally {
      setEditHistoryLoading(false);
    }
  }, []);

  const saveEditedMessage = useCallback(async () => {
    if (!editingMessage) return;
    const targetMessage = editingMessage;
    const nextContent = editingMessageDraft.trim();
    if (!nextContent) {
      toast('메시지 내용을 입력해 주세요.', 'warning');
      return;
    }
    if (nextContent === String(targetMessage.content || '').trim()) {
      closeEditingMessage();
      return;
    }

    const messageId = String(targetMessage.id);
    const editedAt = new Date().toISOString();
    const previousContent = targetMessage.content || null;
    closeEditingMessage();
    let nextMessagesSnapshot: ChatMessage[] = [];
    setMessages((prev) => {
      nextMessagesSnapshot = prev.map((message) =>
        String(message.id) === messageId
          ? { ...message, content: nextContent, edited_at: editedAt }
          : message
      );
      return nextMessagesSnapshot;
    });
    setPersistedPinnedMessages((prev) =>
      prev.map((message) =>
        String(message.id) === messageId
          ? { ...message, content: nextContent, edited_at: editedAt }
          : message
      )
    );
    syncRoomSummaryFromMessages(targetMessage.room_id || selectedRoomId, nextMessagesSnapshot);

    const { error } = await db
      .from('messages')
      .update({ content: nextContent, edited_at: editedAt })
      .eq('id', targetMessage.id);

    if (error) {
      toast('메시지 수정 실패', 'error');
      void fetchData();
      return;
    }

    try {
      await db.from('audit_logs').insert([{
        user_id: auditUserId || currentUserId || fallbackUserId || null,
        user_name: auditUserName || (targetMessage.staff as { name?: string } | null | undefined)?.name || null,
        action: 'message_edit',
        target_type: 'message',
        target_id: messageId,
        details: JSON.stringify({
          room_id: targetMessage.room_id || selectedRoomId || null,
          previous_content: previousContent,
          next_content: nextContent,
          edited_at: editedAt,
          editor_name:
            auditUserName || (targetMessage.staff as { name?: string } | null | undefined)?.name || null }) }]);
    } catch (auditError) {
      logger.warn('message edit audit log insert failed', auditError);
    }
  }, [auditUserId, auditUserName, closeEditingMessage, currentUserId, editingMessage, editingMessageDraft, fallbackUserId, fetchData, selectedRoomId, setMessages, setPersistedPinnedMessages, syncRoomSummaryFromMessages]);

  return {
    editingMessage,
    editingMessageDraft,
    editHistoryTarget,
    editHistoryEntries,
    editHistoryLoading,
    setEditingMessageDraft,
    startEditMessage,
    closeEditingMessage,
    openEditHistory,
    closeEditHistory,
    saveEditedMessage };
}

export function useReadStatusModal({
  selectedRoom,
  allKnownStaffs,
  roomReadCursorMap,
  getEffectiveRoomMemberIds }: UseReadStatusParams) {
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
    loadReadStatusForMessage };
}

export function useChatMobileBackLayer<TReactionDetail>({
  attachmentPreviewOpen,
  closeAttachmentPreview,
  activeActionMsg,
  setActiveActionMsg,
  threadRoot,
  setThreadRoot,
  editHistoryTarget,
  closeEditHistory,
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
  closeGroupModal }: UseChatMobileBackLayerParams<TReactionDetail>) {
  return useCallback(() => {
    if (attachmentPreviewOpen) {
      closeAttachmentPreview();
      return true;
    }
    if (activeActionMsg) {
      setActiveActionMsg(null);
      return true;
    }
    if (threadRoot) {
      setThreadRoot(null);
      return true;
    }
    if (editHistoryTarget) {
      closeEditHistory();
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
      closeEditHistory,
    closeForwardModal,
    closeGlobalSearch,
    closeGroupModal,
    closePollModal,
      closeReadStatusModal,
      editHistoryTarget,
      forwardSourceMsg,
      reactionDetailTarget,
      setActiveActionMsg,
      setReactionDetailTarget,
      setShowDrawer,
      setShowMediaPanel,
      setThreadRoot,
      showAddMemberModal,
      showDrawer,
      showForwardModal,
      showGlobalSearch,
      showGroupModal,
      showMediaPanel,
      showPollModal,
      threadRoot,
      unreadModalMsg,
    ]);
}
