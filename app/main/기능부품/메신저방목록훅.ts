'use client';

import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { supabase } from '@/lib/supabase';
import type { ChatMessage, ChatRoom } from '@/types';
import { getDeletedMessagePreviewText, getMessageDisplayText } from './메신저첨부';
import { sortChatRoomsWithNoticeFirst } from './메신저유틸';

type RoomSummary = {
  last_message: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
};

type UseChatRoomListSyncParams = {
  repairDirectRooms: (rooms: ChatRoom[]) => Promise<ChatRoom[]>;
  setChatRooms: Dispatch<SetStateAction<ChatRoom[]>>;
  scheduleUnreadRefresh: (rooms: ChatRoom[]) => void;
};

export function useChatRoomListSync({
  repairDirectRooms,
  setChatRooms,
  scheduleUnreadRefresh,
}: UseChatRoomListSyncParams) {
  const applyChatRoomsState = useCallback(
    async (rooms: ChatRoom[]) => {
      const nextRooms = sortChatRoomsWithNoticeFirst(rooms || []);
      setChatRooms(nextRooms);
      scheduleUnreadRefresh(nextRooms);
      return nextRooms;
    },
    [scheduleUnreadRefresh, setChatRooms],
  );

  const syncChatRoomsState = useCallback(
    async (rooms: ChatRoom[]) => {
      const repairedRooms = await repairDirectRooms(rooms);
      return applyChatRoomsState(repairedRooms);
    },
    [applyChatRoomsState, repairDirectRooms],
  );

  const buildRoomSummaryFromMessages = useCallback(
    (roomId: string | null | undefined, sourceMessages: ChatMessage[]): RoomSummary => {
      const targetRoomId = String(roomId || '').trim();
      if (!targetRoomId) {
        return {
          last_message: null,
          last_message_preview: null,
          last_message_at: null,
        };
      }

      const roomScopedMessages = sourceMessages.filter(
        (message: ChatMessage) => String(message.room_id || '').trim() === targetRoomId,
      );
      const summarySourceMessages = roomScopedMessages.length > 0 ? roomScopedMessages : sourceMessages;

      let latestMessage: ChatMessage | undefined;
      let latestMessageTime = Number.NEGATIVE_INFINITY;
      summarySourceMessages.forEach((message: ChatMessage) => {
        const createdAt = new Date(message.created_at || 0).getTime();
        if (!Number.isFinite(createdAt)) return;
        if (createdAt >= latestMessageTime) {
          latestMessageTime = createdAt;
          latestMessage = message;
        }
      });

      if (!latestMessage) {
        return {
          last_message: null,
          last_message_preview: null,
          last_message_at: null,
        };
      }

      const previewText = latestMessage.is_deleted
        ? getDeletedMessagePreviewText()
        : getMessageDisplayText(
            latestMessage.content,
            latestMessage.file_name,
            latestMessage.file_url,
            '',
          ) || null;

      return {
        last_message: previewText,
        last_message_preview: previewText,
        last_message_at: latestMessage.created_at || null,
      };
    },
    [],
  );

  const applyRoomSummaryToState = useCallback(
    (roomId: string | null | undefined, summary: RoomSummary) => {
      const targetRoomId = String(roomId || '').trim();
      if (!targetRoomId) return;

      setChatRooms((prev) => {
        if (!prev.some((room: ChatRoom) => String(room.id) === targetRoomId)) return prev;
        return sortChatRoomsWithNoticeFirst(
          prev.map((room: ChatRoom) =>
            String(room.id) === targetRoomId
              ? {
                  ...room,
                  last_message: summary.last_message,
                  last_message_preview: summary.last_message_preview,
                  last_message_at: summary.last_message_at,
                }
              : room,
          ),
        );
      });
    },
    [setChatRooms],
  );

  const persistRoomSummary = useCallback(
    async (roomId: string | null | undefined, summary: Pick<RoomSummary, 'last_message_preview' | 'last_message_at'>) => {
      const targetRoomId = String(roomId || '').trim();
      if (!targetRoomId) return;

      const { error } = await supabase
        .from('chat_rooms')
        .update({
          last_message_preview: summary.last_message_preview,
          last_message_at: summary.last_message_at,
        })
        .eq('id', targetRoomId);
      if (error) {
        console.error('chat room summary persist failed:', error);
      }
    },
    [],
  );

  const syncRoomSummaryFromMessages = useCallback(
    (roomId: string | null | undefined, sourceMessages: ChatMessage[]) => {
      const summary = buildRoomSummaryFromMessages(roomId, sourceMessages);
      applyRoomSummaryToState(roomId, summary);
      void persistRoomSummary(roomId, summary);
      return summary;
    },
    [applyRoomSummaryToState, buildRoomSummaryFromMessages, persistRoomSummary],
  );

  return {
    syncChatRoomsState,
    buildRoomSummaryFromMessages,
    applyRoomSummaryToState,
    persistRoomSummary,
    syncRoomSummaryFromMessages,
  };
}
