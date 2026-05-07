'use client';

import { supabase } from '@/lib/supabase';
import type { ChatMessage, ChatRoom, StaffMember } from '@/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { selectChatMessagesWithFallback } from './메신저데이터유틸';
import { getConversationRoomIdsByRoomId } from './메신저유틸';

const CHAT_ARCHIVE_PAGE_SIZE = 1000;

type UseChatArchiveMessagesParams = {
  selectedRoomId: string | null;
  chatRooms: ChatRoom[];
  messages: ChatMessage[];
  resolveStaffProfile: (staffId: string | null | undefined, fallbackName?: string | null) => StaffMember | null;
};

function normalizeRoomIds(roomIds: string[]) {
  return Array.from(
    new Set(roomIds.map((roomId) => String(roomId || '').trim()).filter(Boolean)),
  ).sort();
}

function hasArchiveMaterial(message: ChatMessage | null | undefined) {
  if (!message || message.is_deleted) return false;
  const fileUrl = String(message.file_url || '').trim();
  const content = String(message.content || '');
  return Boolean(fileUrl) || /https?:\/\//i.test(content);
}

function compareMessagesByRecent(left: ChatMessage, right: ChatMessage) {
  const leftTime = new Date(left.created_at || 0).getTime();
  const rightTime = new Date(right.created_at || 0).getTime();
  if (leftTime !== rightTime) return rightTime - leftTime;
  return String(right.id || '').localeCompare(String(left.id || ''));
}

function mergeMessagesById(baseMessages: ChatMessage[], overrideMessages: ChatMessage[]) {
  const merged = new Map<string, ChatMessage>();

  [...baseMessages, ...overrideMessages].forEach((message) => {
    const messageId = String(message?.id || '').trim();
    if (!messageId) return;
    merged.set(messageId, message);
  });

  return Array.from(merged.values());
}

export function useChatArchiveMessages({
  selectedRoomId,
  chatRooms,
  messages,
  resolveStaffProfile,
}: UseChatArchiveMessagesParams) {
  const requestSeqRef = useRef(0);
  const [fetchedArchiveMessages, setFetchedArchiveMessages] = useState<ChatMessage[]>([]);

  const archiveRoomIds = useMemo(() => {
    const roomId = String(selectedRoomId || '').trim();
    if (!roomId) return [];

    const relatedRoomIds =
      chatRooms.length > 0 ? getConversationRoomIdsByRoomId(roomId, chatRooms) : [];
    return normalizeRoomIds(relatedRoomIds.length > 0 ? relatedRoomIds : [roomId]);
  }, [chatRooms, selectedRoomId]);
  const archiveRoomIdsKey = archiveRoomIds.join('|');

  useEffect(() => {
    if (archiveRoomIds.length === 0) {
      requestSeqRef.current += 1;
      setFetchedArchiveMessages([]);
      return;
    }

    let cancelled = false;
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;

    async function loadArchiveMessages() {
      const nextMessages: ChatMessage[] = [];
      let offset = 0;

      try {
        for (;;) {
          const { data, error } = await selectChatMessagesWithFallback<ChatMessage[]>(
            ({ omittedColumns, selectClause }) => {
              let query = supabase
                .from('messages')
                .select(selectClause)
                .in('room_id', archiveRoomIds);

              if (!omittedColumns.has('is_deleted')) {
                query = query.eq('is_deleted', false);
              }

              query = omittedColumns.has('file_url')
                ? query.ilike('content', '%http%')
                : query.or('file_url.not.is.null,content.ilike.%http%');

              return query
                .order('created_at', { ascending: false })
                .order('id', { ascending: false })
                .range(offset, offset + CHAT_ARCHIVE_PAGE_SIZE - 1) as PromiseLike<{
                  data: ChatMessage[] | null;
                  error: unknown;
                }>;
            },
          );

          if (error) throw error;

          const page = Array.isArray(data) ? data : [];
          nextMessages.push(...page.filter(hasArchiveMaterial));

          if (page.length < CHAT_ARCHIVE_PAGE_SIZE) break;
          offset += CHAT_ARCHIVE_PAGE_SIZE;
        }

        if (!cancelled && requestSeqRef.current === requestSeq) {
          setFetchedArchiveMessages(nextMessages);
        }
      } catch (error) {
        console.error('chat archive messages query failed:', error);
        if (!cancelled && requestSeqRef.current === requestSeq) {
          setFetchedArchiveMessages([]);
        }
      }
    }

    void loadArchiveMessages();

    return () => {
      cancelled = true;
    };
  }, [archiveRoomIdsKey]);

  return useMemo(() => {
    const archiveRoomIdSet = new Set(archiveRoomIds);
    const visibleArchiveMessages = messages.filter(
      (message) => archiveRoomIdSet.has(String(message.room_id || '')) && hasArchiveMaterial(message),
    );

    return mergeMessagesById(fetchedArchiveMessages, visibleArchiveMessages)
      .filter(hasArchiveMaterial)
      .map((message) => ({
        ...message,
        staff: message.staff || resolveStaffProfile(message.sender_id, message.sender_name),
      }))
      .sort(compareMessagesByRecent);
  }, [archiveRoomIdsKey, fetchedArchiveMessages, messages, resolveStaffProfile]);
}
