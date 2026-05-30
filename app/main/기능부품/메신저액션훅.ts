'use client';

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { useActionDialog } from '@/app/components/useActionDialog';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import type { ChatMessage, ChatRoom } from '@/types';
import {
  getConversationRoomIdsByRoomId,
  NOTICE_ROOM_ID,
  writeStoredBookmarks,
  writeStoredPinnedIds,
} from './메신저유틸';

type UseChatMessageActionsParams = {
  currentUserId: string | null | undefined;
  fallbackUserId: string | null | undefined;
  effectiveTodoUserId: string | null | undefined;
  selectedRoomId: string | null;
  selectedRoom: ChatRoom | null;
  isMso: boolean;
  pinnedIds: string[];
  bookmarkedIds: Set<string>;
  chatRoomsRef: MutableRefObject<ChatRoom[]>;
  setPinnedIds: Dispatch<SetStateAction<string[]>>;
  setBookmarkedIds: Dispatch<SetStateAction<Set<string>>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setPersistedPinnedMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  fetchData: () => void | Promise<void>;
  refreshVisibleMessageReactions?: () => void | Promise<void>;
  refreshVisibleMessageBookmarks?: () => void | Promise<void>;
  refreshRoomPinnedMessages?: () => void | Promise<void>;
  refreshReadCursorsForRoom?: (roomId: string | null | undefined) => void | Promise<void>;
  syncRoomSummaryFromMessages: (roomId: string | null | undefined, nextMessages: ChatMessage[]) => void;
  persistRoomReadCursors: (
    roomIds: Array<string | null | undefined>,
    readAt?: string | null,
  ) => Promise<boolean>;
  broadcastChatSync: (type: string, roomId: string | null | undefined) => void;
  auditUserId: string | null | undefined;
  auditUserName: string | null | undefined;
};

export function useChatMessageActions({
  currentUserId,
  fallbackUserId,
  effectiveTodoUserId,
  selectedRoomId,
  selectedRoom,
  isMso,
  pinnedIds,
  bookmarkedIds,
  chatRoomsRef,
  setPinnedIds,
  setBookmarkedIds,
  setMessages,
  setPersistedPinnedMessages,
  fetchData,
  refreshVisibleMessageReactions,
  refreshVisibleMessageBookmarks,
  refreshRoomPinnedMessages,
  refreshReadCursorsForRoom,
  syncRoomSummaryFromMessages,
  persistRoomReadCursors,
  broadcastChatSync,
  auditUserId,
  auditUserName,
}: UseChatMessageActionsParams) {
  const { dialog, openConfirm } = useActionDialog();
  const actorId = currentUserId || fallbackUserId || '';

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!actorId) return;
    try {
      const { data: myReaction } = await supabase
        .from('message_reactions')
        .select('id')
        .eq('message_id', messageId)
        .eq('user_id', actorId)
        .eq('emoji', emoji)
        .maybeSingle();

      if (myReaction) {
        await supabase
          .from('message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', actorId)
          .eq('emoji', emoji);
      } else {
        await supabase.from('message_reactions').insert([{ message_id: messageId, user_id: actorId, emoji }]);
      }
      if (refreshVisibleMessageReactions) {
        await refreshVisibleMessageReactions();
      } else {
        await fetchData();
      }
    } catch (error) {
      console.error('toggleReaction error', error);
    }
  }, [actorId, fetchData, refreshVisibleMessageReactions]);

  const togglePin = useCallback(async (messageId: string) => {
    if (!selectedRoomId) return;
    const normalizedMessageId = String(messageId);
    const isPinned = pinnedIds.includes(normalizedMessageId);
    try {
      if (isPinned) {
        const { error } = await supabase
          .from('pinned_messages')
          .delete()
          .eq('room_id', selectedRoomId)
          .eq('message_id', normalizedMessageId);
        if (error) throw error;
        setPinnedIds([]);
        writeStoredPinnedIds(selectedRoomId, []);
      } else {
        const { error: clearError } = await supabase.from('pinned_messages').delete().eq('room_id', selectedRoomId);
        if (clearError) throw clearError;
        const { error: insertError } = await supabase
          .from('pinned_messages')
          .insert([{ room_id: selectedRoomId, message_id: normalizedMessageId, pinned_by: actorId || null }]);
        if (insertError) throw insertError;
        setPinnedIds([normalizedMessageId]);
        writeStoredPinnedIds(selectedRoomId, [normalizedMessageId]);
      }
      if (refreshRoomPinnedMessages) {
        await refreshRoomPinnedMessages();
      } else {
        await fetchData();
      }
    } catch (error) {
      console.error('공지 고정 상태 변경 실패:', error);
      toast(isPinned ? '공지 해제에 실패했습니다.' : '공지 등록에 실패했습니다.', 'error');
    }
  }, [actorId, fetchData, pinnedIds, refreshRoomPinnedMessages, selectedRoomId, setPinnedIds]);

  const toggleBookmark = useCallback(async (messageId: string) => {
    const normalizedMessageId = String(messageId);
    const isBookmarked = bookmarkedIds.has(normalizedMessageId);
    const nextBookmarkIds = isBookmarked
      ? Array.from(bookmarkedIds).filter((id) => id !== normalizedMessageId)
      : [...Array.from(bookmarkedIds), normalizedMessageId];
    try {
      if (!effectiveTodoUserId) {
        throw new Error('missing-user');
      }
      if (isBookmarked) {
        const { error } = await supabase
          .from('message_bookmarks')
          .delete()
          .eq('user_id', effectiveTodoUserId)
          .eq('message_id', normalizedMessageId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('message_bookmarks').insert([
          {
            user_id: effectiveTodoUserId,
            message_id: normalizedMessageId,
            room_id: selectedRoomId,
          },
        ]);
        if (error) throw error;
      }
      setBookmarkedIds(new Set(nextBookmarkIds));
      writeStoredBookmarks(effectiveTodoUserId, nextBookmarkIds);
      await refreshVisibleMessageBookmarks?.();
    } catch (error) {
      console.error('toggleBookmark error', error);
      if (effectiveTodoUserId) {
        setBookmarkedIds(new Set(nextBookmarkIds));
        writeStoredBookmarks(effectiveTodoUserId, nextBookmarkIds);
      }
    }
  }, [bookmarkedIds, effectiveTodoUserId, refreshVisibleMessageBookmarks, selectedRoomId, setBookmarkedIds]);

  const markMessageRead = useCallback(async (message: ChatMessage) => {
    if (String(message.sender_id) === actorId) return;
    try {
      const targetRoomIds = getConversationRoomIdsByRoomId(message.room_id, chatRoomsRef.current as ChatRoom[]);
      const readAt = new Date().toISOString();
      const cursorWriteOk = await persistRoomReadCursors(
        targetRoomIds.length > 0 ? targetRoomIds : [String(message.room_id)],
        readAt,
      );
      if (cursorWriteOk) {
        broadcastChatSync('message-read', message.room_id);
      }
      await refreshReadCursorsForRoom?.(message.room_id);
    } catch {
      // 읽음 처리는 UX 우선이므로 실패해도 조용히 넘긴다.
    }
  }, [actorId, broadcastChatSync, chatRoomsRef, persistRoomReadCursors, refreshReadCursorsForRoom]);

  const deleteMessage = useCallback(async (message: ChatMessage) => {
    if (selectedRoom?.id === NOTICE_ROOM_ID && !isMso) {
      toast('공지 채널 메시지는 삭제할 수 없습니다.', 'warning');
      return;
    }
    if (String(message.sender_id) !== String(actorId) && !isMso) return;
    const confirmed = await openConfirm({
      title: '메시지 삭제',
      description: '이 메시지를 삭제합니다.',
      confirmText: '삭제',
      tone: 'danger',
    });
    if (!confirmed) return;

    let nextMessagesSnapshot: ChatMessage[] = [];
    setMessages((prev) => {
      nextMessagesSnapshot = prev.map((candidate) =>
        String(candidate.id) === String(message.id)
          ? { ...candidate, is_deleted: true }
          : candidate
      );
      return nextMessagesSnapshot;
    });
    setPersistedPinnedMessages((prev) =>
      prev.map((candidate) =>
        String(candidate.id) === String(message.id)
          ? { ...candidate, is_deleted: true }
          : candidate
      )
    );
    syncRoomSummaryFromMessages(message.room_id || selectedRoomId, nextMessagesSnapshot);

    await supabase.from('messages').update({ is_deleted: true }).eq('id', message.id);

    try {
      await supabase.from('audit_logs').insert([
        {
          user_id: auditUserId,
          user_name: auditUserName,
          action: 'message_delete',
          target_type: 'message',
          target_id: message.id,
          details: JSON.stringify({
            room_id: selectedRoomId,
            content: message.content,
          }),
        },
      ]);
    } catch {
      // 감사로그 실패는 사용자 흐름을 막지 않는다.
    }
  }, [actorId, auditUserId, auditUserName, isMso, openConfirm, selectedRoom?.id, selectedRoomId, setMessages, setPersistedPinnedMessages, syncRoomSummaryFromMessages]);

  return {
    dialog,
    toggleReaction,
    togglePin,
    toggleBookmark,
    markMessageRead,
    deleteMessage,
  };
}
