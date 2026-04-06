'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import { supabase } from '@/lib/supabase';
import {
  buildChatMessageSelect,
  CHAT_MESSAGE_OPTIONAL_COLUMNS,
} from '@/lib/chat-query-columns';
import type { ChatMessage, ChatRoom, StaffMember } from '@/types';
import type { GlobalSearchRoomResult, MessengerGlobalSearchTab } from './메신저패널';
import {
  getRoomPreviewText,
  normalizeMemberIds,
  NOTICE_ROOM_ID,
  type RoomPreference,
} from './메신저유틸';

type GlobalSearchCounts = {
  all: number;
  member: number;
  room: number;
  message: number;
  file: number;
};

type UseChatGlobalSearchParams = {
  allKnownStaffs: StaffMember[];
  effectiveChatUserId: string | null | undefined;
  resolveStaffProfile: (staffId: string | null | undefined, fallbackName?: string | null) => StaffMember | null;
  visibleRooms: ChatRoom[];
  visibleRoomIds: string[];
  roomLabelMap: Map<string, string>;
  roomPrefs: Record<string, RoomPreference>;
};

export function useChatGlobalSearch({
  allKnownStaffs,
  effectiveChatUserId,
  resolveStaffProfile,
  visibleRooms,
  visibleRoomIds,
  roomLabelMap,
  roomPrefs,
}: UseChatGlobalSearchParams) {
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchTab, setGlobalSearchTab] = useState<MessengerGlobalSearchTab>('all');
  const [globalSearchResults, setGlobalSearchResults] = useState<ChatMessage[]>([]);
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const deferredGlobalSearchQuery = useDeferredValue(globalSearchQuery);
  const normalizedGlobalSearchQuery = deferredGlobalSearchQuery.trim().toLowerCase();

  const closeGlobalSearch = useCallback(() => {
    setShowGlobalSearch(false);
    setGlobalSearchQuery('');
    setGlobalSearchResults([]);
    setGlobalSearchTab('all');
    setGlobalSearchLoading(false);
  }, []);

  const openGlobalSearch = useCallback(() => {
    setGlobalSearchTab('all');
    setShowGlobalSearch(true);
  }, []);

  const globalSearchMemberResults = useMemo(() => {
    if (!normalizedGlobalSearchQuery) return [];

    return allKnownStaffs
      .filter((staff: StaffMember) => String(staff.id) !== String(effectiveChatUserId || ''))
      .filter((staff: StaffMember) => {
        const haystack = [
          staff.name,
          staff.company,
          staff.department,
          staff.position,
          (staff as Record<string, unknown>).employee_no,
        ]
          .map((value) => String(value || '').toLowerCase())
          .join(' ');
        return haystack.includes(normalizedGlobalSearchQuery);
      })
      .slice(0, 50);
  }, [allKnownStaffs, effectiveChatUserId, normalizedGlobalSearchQuery]);

  const globalSearchRoomResults = useMemo<GlobalSearchRoomResult[]>(() => {
    if (!normalizedGlobalSearchQuery) return [];

    return visibleRooms
      .map((room: ChatRoom) => {
        const roomId = String(room.id);
        return {
          room,
          roomId,
          label: roomLabelMap.get(roomId) || '',
          preview: getRoomPreviewText(room),
          memberCount: normalizeMemberIds(room.members).length,
          isHidden: roomPrefs[room.id]?.hidden === true,
          isNoticeChannel: room.id === NOTICE_ROOM_ID,
        };
      })
      .filter(({ label, preview }) => {
        const haystack = `${String(label || '').toLowerCase()} ${String(preview || '').toLowerCase()}`;
        return haystack.includes(normalizedGlobalSearchQuery);
      })
      .slice(0, 50);
  }, [normalizedGlobalSearchQuery, roomLabelMap, roomPrefs, visibleRooms]);

  const globalSearchMessageResults = useMemo(
    () => globalSearchResults.filter((message: ChatMessage) => !String(message.file_url || '').trim()),
    [globalSearchResults]
  );

  const globalSearchFileResults = useMemo(
    () => globalSearchResults.filter((message: ChatMessage) => Boolean(String(message.file_url || '').trim())),
    [globalSearchResults]
  );

  const globalSearchCounts = useMemo<GlobalSearchCounts>(
    () => ({
      all:
        globalSearchMemberResults.length +
        globalSearchRoomResults.length +
        globalSearchMessageResults.length +
        globalSearchFileResults.length,
      member: globalSearchMemberResults.length,
      room: globalSearchRoomResults.length,
      message: globalSearchMessageResults.length,
      file: globalSearchFileResults.length,
    }),
    [
      globalSearchFileResults.length,
      globalSearchMemberResults.length,
      globalSearchMessageResults.length,
      globalSearchRoomResults.length,
    ]
  );

  const handleGlobalSearch = useCallback(async (rawQuery?: string) => {
    const query = String(rawQuery ?? globalSearchQuery).trim();
    if (!query) {
      setGlobalSearchResults([]);
      setGlobalSearchLoading(false);
      return;
    }

    setGlobalSearchLoading(true);

    try {
      if (visibleRoomIds.length === 0) {
        setGlobalSearchResults([]);
        return;
      }

      const { data, error } = await withMissingColumnsFallback<ChatMessage[]>(
        (omittedColumns) => {
          const searchableColumns = ['content'];
          if (!omittedColumns.has('file_url')) {
            searchableColumns.push('file_url');
          }

          let searchQuery = supabase
            .from('messages')
            .select(buildChatMessageSelect(omittedColumns))
            .in('room_id', visibleRoomIds)
            .or(searchableColumns.map((column) => `${column}.ilike.%${query}%`).join(','))
            .order('created_at', { ascending: false })
            .limit(100);

          if (!omittedColumns.has('is_deleted')) {
            searchQuery = searchQuery.eq('is_deleted', false);
          }

          return searchQuery as PromiseLike<{ data: ChatMessage[] | null; error: unknown }>;
        },
        [...CHAT_MESSAGE_OPTIONAL_COLUMNS],
      );

      if (error) throw error;

      const messageRows = Array.isArray(data) ? data : [];
      const relatedRoomIds = Array.from(
        new Set(messageRows.map((message: ChatMessage) => String(message.room_id)).filter(Boolean))
      );

      if (relatedRoomIds.length === 0) {
        setGlobalSearchResults([]);
        return;
      }

      const { data: roomRows, error: roomError } = await supabase
        .from('chat_rooms')
        .select('id, name, type, members')
        .in('id', relatedRoomIds);
      if (roomError) throw roomError;

      const roomMap = new Map<string, ChatRoom>();
      (roomRows || []).forEach((room: ChatRoom) => {
        roomMap.set(String(room.id), room);
      });

      const enrichedRows = messageRows.map((message: ChatMessage) => ({
        ...message,
        staff: resolveStaffProfile(message.sender_id, message.sender_name),
        chat_rooms: roomMap.get(String(message.room_id)) || null,
      }));

      setGlobalSearchResults(enrichedRows);
    } catch (error) {
      console.error(error);
    } finally {
      setGlobalSearchLoading(false);
    }
  }, [globalSearchQuery, resolveStaffProfile, visibleRoomIds]);

  useEffect(() => {
    if (!showGlobalSearch) return;

    const query = deferredGlobalSearchQuery.trim();
    if (!query) {
      setGlobalSearchResults([]);
      setGlobalSearchLoading(false);
      return;
    }

    const timer = window.setTimeout(() => {
      void handleGlobalSearch(query);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [deferredGlobalSearchQuery, handleGlobalSearch, showGlobalSearch]);

  return {
    showGlobalSearch,
    globalSearchQuery,
    setGlobalSearchQuery,
    globalSearchTab,
    setGlobalSearchTab,
    globalSearchResults,
    globalSearchLoading,
    globalSearchMemberResults,
    globalSearchRoomResults,
    globalSearchMessageResults,
    globalSearchFileResults,
    globalSearchCounts,
    closeGlobalSearch,
    openGlobalSearch,
    handleGlobalSearch,
  };
}
