'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useState, type MutableRefObject } from 'react';
import { supabase } from '@/lib/supabase';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import type { ChatMessage, ChatRoom, StaffMember } from '@/types';
import { selectChatMessagesWithFallback } from './메신저데이터유틸';

// ─── 검색 쿼리 파싱 (메신저검색유틸에서 통합) ───────────────────────────────
export type GlobalSearchAttachmentFilter = 'all' | 'file' | 'image' | 'video' | 'media';

export type ParsedGlobalSearchQuery = {
  textQuery: string;
  fromQuery: string;
  roomQuery: string;
  attachment: GlobalSearchAttachmentFilter;
  after: Date | null;
  before: Date | null;
  hasStructuredFilters: boolean;
};

function parseGlobalSearchQuery(rawQuery: string): ParsedGlobalSearchQuery {
  const tokens = String(rawQuery || '').trim().split(/\s+/).filter(Boolean);
  const plainTokens: string[] = [];
  let fromQuery = '';
  let roomQuery = '';
  let attachment: GlobalSearchAttachmentFilter = 'all';
  let after: Date | null = null;
  let before: Date | null = null;

  tokens.forEach((token) => {
    const lower = token.toLowerCase();
    if (lower.startsWith('from:')) { fromQuery = lower.slice(5).trim(); return; }
    if (lower.startsWith('in:')) { roomQuery = lower.slice(3).trim(); return; }
    if (lower.startsWith('has:')) {
      const candidate = lower.slice(4).trim();
      if (candidate === 'file' || candidate === 'image' || candidate === 'video' || candidate === 'media') {
        attachment = candidate;
      }
      return;
    }
    if (lower.startsWith('after:')) {
      const parsed = new Date(lower.slice(6).trim());
      if (!Number.isNaN(parsed.getTime())) after = parsed;
      return;
    }
    if (lower.startsWith('before:')) {
      const parsed = new Date(lower.slice(7).trim());
      if (!Number.isNaN(parsed.getTime())) { parsed.setHours(23, 59, 59, 999); before = parsed; }
      return;
    }
    plainTokens.push(token);
  });

  return {
    textQuery: plainTokens.join(' ').trim(),
    fromQuery,
    roomQuery,
    attachment,
    after,
    before,
    hasStructuredFilters: Boolean(fromQuery || roomQuery || attachment !== 'all' || after || before),
  };
}

function getGlobalSearchHighlightQuery(rawQuery: string) {
  return parseGlobalSearchQuery(rawQuery).textQuery.trim();
}

// 사용자 입력의 LIKE 와일드카드(%, _)와 이스케이프 문자(\)를 리터럴로 처리.
// d1/query 라우트가 `ESCAPE '\'`로 emit하므로 백슬래시 접두로 이스케이프한다.
// `\`를 먼저 치환해야 이후 추가되는 백슬래시가 이중 이스케이프되지 않는다.
// 와일드카드는 호출부에서 %term% 형태로 감싸므로 부분일치는 유지된다.
function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
// ────────────────────────────────────────────────────────────────────────────
import type { GlobalSearchRoomResult, MessengerGlobalSearchTab } from './메신저전역검색';
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

export type SavedChatSearch = {
  id: string;
  label: string;
  query: string;
  createdAt: string;
};

const CHAT_GLOBAL_SEARCH_PAGE_SIZE = 200;
const CHAT_GLOBAL_SEARCH_ROOM_CHUNK_SIZE = 200;
const CHAT_GLOBAL_SEARCH_LOOKBACK_YEARS = 5;

function getGlobalSearchLookbackStart(now = new Date()) {
  const lookbackStart = new Date(now);
  lookbackStart.setFullYear(lookbackStart.getFullYear() - CHAT_GLOBAL_SEARCH_LOOKBACK_YEARS);
  return lookbackStart;
}

function resolveGlobalSearchWindow(
  parsedQuery: ReturnType<typeof parseGlobalSearchQuery>,
  now = new Date(),
) {
  const lookbackStart = getGlobalSearchLookbackStart(now);
  const after =
    parsedQuery.after && parsedQuery.after > lookbackStart
      ? parsedQuery.after
      : lookbackStart;
  const before = parsedQuery.before ?? now;

  if (before.getTime() < after.getTime()) {
    return null;
  }

  return { after, before };
}

async function fetchAllGlobalSearchMessages(params: {
  omittedColumns: ReadonlySet<string>;
  selectClause: string;
  parsedQuery: ReturnType<typeof parseGlobalSearchQuery>;
  roomIds: string[];
}) {
  const { omittedColumns, parsedQuery, roomIds, selectClause } = params;
  const searchWindow = resolveGlobalSearchWindow(parsedQuery);
  if (!searchWindow) {
    return { data: [] as ChatMessage[], error: null };
  }

  const searchableColumns = ['content'];
  if (!omittedColumns.has('sender_name')) {
    searchableColumns.push('sender_name');
  }
  if (!omittedColumns.has('file_name')) {
    searchableColumns.push('file_name');
  }
  if (!omittedColumns.has('file_url')) {
    searchableColumns.push('file_url');
  }

  const collectedRowsById = new Map<string, ChatMessage>();
  const targetSearchColumns = parsedQuery.textQuery
    ? searchableColumns
    : [null];

  for (const searchColumn of targetSearchColumns) {
    for (let offset = 0; ; offset += CHAT_GLOBAL_SEARCH_PAGE_SIZE) {
      let searchQuery = supabase
        .from('messages')
        .select(selectClause)
        .in('room_id', roomIds)
        .order('created_at', { ascending: false })
        .gte('created_at', searchWindow.after.toISOString())
        .lte('created_at', searchWindow.before.toISOString())
        .range(offset, offset + CHAT_GLOBAL_SEARCH_PAGE_SIZE - 1);

      if (parsedQuery.textQuery && searchColumn) {
        searchQuery = searchQuery.ilike(searchColumn, `%${escapeLikePattern(parsedQuery.textQuery)}%`);
      }
      if (parsedQuery.fromQuery && !omittedColumns.has('sender_name')) {
        searchQuery = searchQuery.ilike('sender_name', `%${escapeLikePattern(parsedQuery.fromQuery)}%`);
      }

      if (!omittedColumns.has('is_deleted')) {
        searchQuery = searchQuery.eq('is_deleted', false);
      }

      if (
        (parsedQuery.attachment === 'file' || parsedQuery.attachment === 'media') &&
        !omittedColumns.has('file_url')
      ) {
        searchQuery = searchQuery.not('file_url', 'is', null);
      }
      if (parsedQuery.attachment === 'image' && !omittedColumns.has('file_kind')) {
        searchQuery = searchQuery.eq('file_kind', 'image');
      }
      if (parsedQuery.attachment === 'video' && !omittedColumns.has('file_kind')) {
        searchQuery = searchQuery.eq('file_kind', 'video');
      }

      const { data, error } = await (searchQuery as PromiseLike<{
        data: ChatMessage[] | null;
        error: unknown;
      }>);

      if (error) {
        return { data: null, error };
      }

      const rows = Array.isArray(data) ? data : [];
      rows.forEach((row) => {
        const rowId = String(row.id || '').trim();
        if (!rowId) return;
        collectedRowsById.set(rowId, row);
      });

      if (rows.length < CHAT_GLOBAL_SEARCH_PAGE_SIZE) {
        break;
      }
    }
  }

  return {
    data: Array.from(collectedRowsById.values()).sort(
      (left, right) =>
        new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime()
    ),
    error: null,
  };
}

async function loadGlobalSearchRoomMap(roomIds: string[]) {
  const uniqueRoomIds = Array.from(new Set(roomIds.map((roomId) => String(roomId || '').trim()).filter(Boolean)));
  const roomMap = new Map<string, ChatRoom>();

  for (let index = 0; index < uniqueRoomIds.length; index += CHAT_GLOBAL_SEARCH_ROOM_CHUNK_SIZE) {
    const chunk = uniqueRoomIds.slice(index, index + CHAT_GLOBAL_SEARCH_ROOM_CHUNK_SIZE);
    const { data, error } = await supabase
      .from('chat_rooms')
      .select('id, name, type, members')
      .in('id', chunk);

    if (error) {
      return { roomMap: null as Map<string, ChatRoom> | null, error };
    }

    (data || []).forEach((room: ChatRoom) => {
      roomMap.set(String(room.id), room);
    });
  }

  return { roomMap, error: null };
}

type UseChatGlobalSearchParams = {
  allKnownStaffs: StaffMember[];
  effectiveChatUserId: string | null | undefined;
  resolveStaffProfile: (staffId: string | null | undefined, fallbackName?: string | null) => StaffMember | null;
  setShowGroupModal: (open: boolean) => void;
  selectedRoomIdRef: MutableRefObject<string | null>;
  pendingScrollMsgIdRef: MutableRefObject<string | null>;
  messages: ChatMessage[];
  scrollToMessage: (messageId: string) => void;
  setRoom: (roomId: string | null) => void;
  openDirectChat: (staff: StaffMember) => void | Promise<void>;
  visibleRooms: ChatRoom[];
  visibleRoomIds: string[];
  roomLabelMap: Map<string, string>;
  roomPrefs: Record<string, RoomPreference>;
  roomPrefsUserId: string | null | undefined;
};

export function useChatGlobalSearch({
  allKnownStaffs,
  effectiveChatUserId,
  resolveStaffProfile,
  setShowGroupModal,
  selectedRoomIdRef,
  pendingScrollMsgIdRef,
  messages,
  scrollToMessage,
  setRoom,
  openDirectChat,
  visibleRooms,
  visibleRoomIds,
  roomLabelMap,
  roomPrefs,
  roomPrefsUserId,
}: UseChatGlobalSearchParams) {
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchTab, setGlobalSearchTab] = useState<MessengerGlobalSearchTab>('all');
  const [globalSearchResults, setGlobalSearchResults] = useState<ChatMessage[]>([]);
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const [savedSearches, setSavedSearches] = useState<SavedChatSearch[]>([]);
  const [transientHighlightQuery, setTransientHighlightQuery] = useState('');
  const deferredGlobalSearchQuery = useDeferredValue(globalSearchQuery);
  const parsedGlobalSearchQuery = useMemo(
    () => parseGlobalSearchQuery(deferredGlobalSearchQuery),
    [deferredGlobalSearchQuery],
  );
  const normalizedHighlightQuery = useMemo(
    () => getGlobalSearchHighlightQuery(globalSearchQuery),
    [globalSearchQuery],
  );
  const normalizedGlobalSearchQuery = parsedGlobalSearchQuery.textQuery.trim().toLowerCase();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.chatSavedSearches(roomPrefsUserId || 'guest'));
      const parsed = raw ? JSON.parse(raw) : [];
      setSavedSearches(
        Array.isArray(parsed)
          ? parsed
              .map((entry) => ({
                id: String((entry as Record<string, unknown>).id || '').trim(),
                label: String((entry as Record<string, unknown>).label || '').trim(),
                query: String((entry as Record<string, unknown>).query || '').trim(),
                createdAt: String((entry as Record<string, unknown>).createdAt || '').trim(),
              }))
              .filter((entry) => entry.id && entry.query)
              .slice(0, 8)
          : [],
      );
    } catch {
      setSavedSearches([]);
    }
  }, [roomPrefsUserId]);

  const persistSavedSearches = useCallback((nextSearches: SavedChatSearch[]) => {
    setSavedSearches(nextSearches);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.chatSavedSearches(roomPrefsUserId || 'guest'),
        JSON.stringify(nextSearches),
      );
    } catch {
      // ignore
    }
  }, [roomPrefsUserId]);

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

  const openGroupFromGlobalSearch = useCallback(() => {
    closeGlobalSearch();
    setShowGroupModal(true);
  }, [closeGlobalSearch, setShowGroupModal]);

  const openRoomFromGlobalSearch = useCallback((roomId: string, messageId?: string) => {
    if (messageId) pendingScrollMsgIdRef.current = messageId;
    setTransientHighlightQuery(normalizedHighlightQuery);
    if (
      messageId &&
      String(selectedRoomIdRef.current || '') === String(roomId) &&
      messages.some((message) => String(message.id) === String(messageId))
    ) {
      window.setTimeout(() => scrollToMessage(messageId), 120);
    }
    setRoom(roomId);
    closeGlobalSearch();
  }, [
    closeGlobalSearch,
    messages,
    normalizedHighlightQuery,
    pendingScrollMsgIdRef,
    scrollToMessage,
    selectedRoomIdRef,
    setRoom,
  ]);

  const openMemberFromGlobalSearch = useCallback(async (staff: StaffMember) => {
    closeGlobalSearch();
    await openDirectChat(staff);
  }, [closeGlobalSearch, openDirectChat]);

  const saveCurrentSearch = useCallback((rawQuery?: string) => {
    const nextQuery = String(rawQuery ?? globalSearchQuery).trim();
    if (!nextQuery) return;

    const existing = savedSearches.find(
      (entry) => entry.query.toLowerCase() === nextQuery.toLowerCase(),
    );
    if (existing) {
      persistSavedSearches([
        { ...existing, createdAt: new Date().toISOString() },
        ...savedSearches.filter((entry) => entry.id !== existing.id),
      ].slice(0, 8));
      return;
    }

    const createdAt = new Date().toISOString();
    const nextEntry: SavedChatSearch = {
      id:
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      label: nextQuery.length > 24 ? `${nextQuery.slice(0, 24)}...` : nextQuery,
      query: nextQuery,
      createdAt,
    };

    persistSavedSearches([nextEntry, ...savedSearches].slice(0, 8));
  }, [globalSearchQuery, persistSavedSearches, savedSearches]);

  const removeSavedSearch = useCallback((searchId: string) => {
    persistSavedSearches(savedSearches.filter((entry) => entry.id !== searchId));
  }, [persistSavedSearches, savedSearches]);

  const applySavedSearch = useCallback((query: string) => {
    const nextQuery = String(query || '').trim();
    setGlobalSearchQuery(nextQuery);
    setGlobalSearchTab('all');
    if (nextQuery) {
      setGlobalSearchLoading(true);
    }
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

  const normalizedRoomSearchQuery = useMemo(
    () => (parsedGlobalSearchQuery.roomQuery || parsedGlobalSearchQuery.textQuery).trim().toLowerCase(),
    [parsedGlobalSearchQuery.roomQuery, parsedGlobalSearchQuery.textQuery],
  );

  const globalSearchRoomResults = useMemo<GlobalSearchRoomResult[]>(() => {
    if (!normalizedRoomSearchQuery) return [];

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
        return haystack.includes(normalizedRoomSearchQuery);
      })
      .slice(0, 50);
  }, [normalizedRoomSearchQuery, roomLabelMap, roomPrefs, visibleRooms]);

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
    const parsedQuery = parseGlobalSearchQuery(query);
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

      const scopedVisibleRoomIds = parsedQuery.roomQuery
        ? visibleRoomIds.filter((roomId) =>
            String(roomLabelMap.get(String(roomId)) || '').toLowerCase().includes(parsedQuery.roomQuery)
          )
        : visibleRoomIds;

      if (scopedVisibleRoomIds.length === 0) {
        setGlobalSearchResults([]);
        return;
      }

      const { data, error } = await selectChatMessagesWithFallback<ChatMessage[]>(
        ({ omittedColumns, selectClause }) =>
          fetchAllGlobalSearchMessages({
            omittedColumns,
            selectClause,
            parsedQuery,
            roomIds: scopedVisibleRoomIds,
          }),
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

      const { roomMap, error: roomError } = await loadGlobalSearchRoomMap(relatedRoomIds);
      if (roomError || !roomMap) throw roomError;

      const enrichedRows = messageRows.map((message: ChatMessage) => ({
        ...message,
        staff: resolveStaffProfile(message.sender_id, message.sender_name),
        chat_rooms: roomMap.get(String(message.room_id)) || null,
      }));

      const filteredRows = enrichedRows.filter((message: ChatMessage) => {
        const senderName = String(
          (message.staff as { name?: string } | null | undefined)?.name ||
          message.sender_name ||
          ''
        ).toLowerCase();
        const room = roomMap.get(String(message.room_id));
        const roomLabel = String(
          roomLabelMap.get(String(message.room_id)) ||
          room?.name ||
          ''
        ).toLowerCase();
        const messageCreatedAt = new Date(String(message.created_at || ''));
        const fileKind = String(message.file_kind || '').toLowerCase();
        const hasAttachment = Boolean(String(message.file_url || '').trim());
        const isMediaAttachment = hasAttachment && (fileKind === 'image' || fileKind === 'video');

        if (parsedQuery.fromQuery && !senderName.includes(parsedQuery.fromQuery)) {
          return false;
        }
        if (parsedQuery.roomQuery && !roomLabel.includes(parsedQuery.roomQuery)) {
          return false;
        }
        if (parsedQuery.after && !Number.isNaN(messageCreatedAt.getTime()) && messageCreatedAt < parsedQuery.after) {
          return false;
        }
        if (parsedQuery.before && !Number.isNaN(messageCreatedAt.getTime()) && messageCreatedAt > parsedQuery.before) {
          return false;
        }
        if (parsedQuery.attachment === 'file' && !hasAttachment) {
          return false;
        }
        if (parsedQuery.attachment === 'image' && fileKind !== 'image') {
          return false;
        }
        if (parsedQuery.attachment === 'video' && fileKind !== 'video') {
          return false;
        }
        if (parsedQuery.attachment === 'media' && !isMediaAttachment) {
          return false;
        }
        return true;
      });

      setGlobalSearchResults(filteredRows);
    } catch (error) {
      console.error(error);
    } finally {
      setGlobalSearchLoading(false);
    }
  }, [globalSearchQuery, resolveStaffProfile, roomLabelMap, visibleRoomIds]);

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

  useEffect(() => {
    if (!transientHighlightQuery.trim()) return;
    const timer = window.setTimeout(() => setTransientHighlightQuery(''), 12000);
    return () => window.clearTimeout(timer);
  }, [transientHighlightQuery]);

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
    savedSearches,
    closeGlobalSearch,
    openGlobalSearch,
    transientHighlightQuery,
    openGroupFromGlobalSearch,
    openRoomFromGlobalSearch,
    openMemberFromGlobalSearch,
    handleGlobalSearch,
    saveCurrentSearch,
    removeSavedSearch,
    applySavedSearch,
  };
}
