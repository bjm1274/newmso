'use client';

import { POLL_SELECT } from '@/lib/chat-query-columns';
import { supabase } from '@/lib/supabase';
import type { ChatMessage,ChatRoom,StaffMember } from '@/types';
import {
useCallback,
useRef,
useState,
type Dispatch,
type MutableRefObject,
type RefObject,
type SetStateAction,
} from 'react';
import { fetchAllChatRooms } from './chatQueryService';
import { useChatRoomListSync } from './메신저방목록훅';
import {
compareStaffMembers,
getConversationRoomIdsByRoomId,
getDirectRoomMembersKey,
getLatestReadCursor,
isMessageReadByCursor,
NOTICE_ROOM_ID,
readStoredBookmarks,
writeStoredBookmarks,
writeStoredPinnedIds
} from './메신저유틸';
import { useChatReadStateSync } from './메신저읽음상태훅';
import type { PollItem } from './메신저입력워크플로훅';
import type { DeliveryState } from './메신저타입';

type ReactionUsersByMessage = Record<string, Record<string, StaffMember[]>>;

type LoadedMessageCursor = {
  id: string;
  createdAt: string;
};

type OptimisticUnreadFloor = {
  count: number;
  lastMessageAt: string | null;
};

const MESSAGE_PAGE_SIZE = 50;
const DATE_JUMP_CONTEXT_BEFORE = 24;
const DATE_JUMP_CONTEXT_AFTER = 36;
const CHAT_ROOM_FETCH_MIN_INTERVAL_MS = 30_000;
const CHAT_METADATA_REFRESH_TTL_MS = 60_000;

type DateJumpLoadParams = {
  dateKey: string;
  startIso: string;
  endIso: string;
};

type DateJumpLoadResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: 'no-room' | 'not-found' | 'failed'; error?: unknown };

type MessageJumpLoadResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: 'no-room' | 'not-found' | 'failed' | 'room-changed'; error?: unknown };

export type ChatFetchDataOptions = {
  force?: boolean;
};

function normalizeMessageCursorTime(value: string | null | undefined) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';
  const parsedTime = new Date(rawValue).getTime();
  return Number.isNaN(parsedTime) ? rawValue : new Date(rawValue).toISOString();
}

type SelectChatMessagesWithFallback = <TData>(
  execute: (params: {
    omittedColumns: ReadonlySet<string>;
    selectClause: string;
  }) => PromiseLike<{ data: TData | null; error: unknown }>,
) => Promise<{ data: TData | null; error: unknown }>;

type DataSyncRefs = {
  selectedRoomIdRef: MutableRefObject<string | null>;
  chatRoomsRef: MutableRefObject<ChatRoom[]>;
  messagesRef: MutableRefObject<ChatMessage[]>;
  visibleMessageIdsRef: MutableRefObject<Set<string>>;
  messageListRef: RefObject<HTMLDivElement | null>;
  pendingBottomAlignRoomIdRef: MutableRefObject<string | null>;
  fetchDataRequestSeqRef: MutableRefObject<number>;
  deliveryStatesRef: MutableRefObject<Record<string, DeliveryState | undefined>>;
  optimisticUnreadFloorRef: MutableRefObject<Record<string, OptimisticUnreadFloor>>;
};

type DataSyncSetters = {
  setChatRooms: Dispatch<SetStateAction<ChatRoom[]>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setRoomUnreadCounts: Dispatch<SetStateAction<Record<string, number>>>;
  setReadCounts: Dispatch<SetStateAction<Record<string, number>>>;
  setBookmarkedIds: Dispatch<SetStateAction<Set<string>>>;
  setPinnedIds: Dispatch<SetStateAction<string[]>>;
  setPersistedPinnedMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setReactions: Dispatch<SetStateAction<Record<string, Record<string, number>>>>;
  setReactionUsersByMessage: Dispatch<SetStateAction<ReactionUsersByMessage>>;
  setPolls: Dispatch<SetStateAction<PollItem[]>>;
  setPollVotes: Dispatch<SetStateAction<Record<string, Record<number, number>>>>;
  setRoomReadCursorMap: Dispatch<SetStateAction<Record<string, string>>>;
  setLoadingRoomId: Dispatch<SetStateAction<string | null>>;
  setTimelineRoomId: Dispatch<SetStateAction<string | null>>;
  setRoom: (roomId: string | null) => void;
};

type DataSyncCallbacks = {
  resolveStaffProfile: (staffId: string | null | undefined, fallbackName?: string | null) => StaffMember | null;
  getEffectiveRoomMemberIds: (room: ChatRoom | null | undefined) => string[];
  isRoomAccessibleToCurrentUser: (room: ChatRoom | null | undefined) => boolean;
  repairDirectRooms: (rooms: ChatRoom[]) => Promise<ChatRoom[]>;
  selectChatMessagesWithFallback: SelectChatMessagesWithFallback;
};

type UseChatRoomDataSyncParams = {
  selectedRoomId: string | null;
  effectiveChatUserId: string | null | undefined;
  effectiveTodoUserId: string | null | undefined;
  userId: string | null | undefined;
  refs: DataSyncRefs;
  setters: DataSyncSetters;
  callbacks: DataSyncCallbacks;
};

export function useChatRoomDataSync({
  selectedRoomId,
  effectiveChatUserId,
  effectiveTodoUserId,
  refs,
  setters,
  callbacks,
}: UseChatRoomDataSyncParams) {
  const {
    selectedRoomIdRef,
    chatRoomsRef,
    messagesRef,
    visibleMessageIdsRef,
    messageListRef,
    pendingBottomAlignRoomIdRef,
    fetchDataRequestSeqRef,
    deliveryStatesRef,
    optimisticUnreadFloorRef,
  } = refs;
  const {
    setChatRooms,
    setMessages,
    setRoomUnreadCounts,
    setReadCounts,
    setBookmarkedIds,
    setPinnedIds,
    setPersistedPinnedMessages,
    setReactions,
    setReactionUsersByMessage,
    setPolls,
    setPollVotes,
    setRoomReadCursorMap,
    setLoadingRoomId,
    setTimelineRoomId,
    setRoom,
  } = setters;
  const {
    resolveStaffProfile,
    getEffectiveRoomMemberIds,
    isRoomAccessibleToCurrentUser,
    repairDirectRooms,
    selectChatMessagesWithFallback,
  } = callbacks;
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const loadingOlderMessagesRef = useRef(false);
  const paginationRoomIdRef = useRef<string | null>(null);
  const loadedPersistedMessageCountRef = useRef(MESSAGE_PAGE_SIZE);
  const roomIdsToLoadRef = useRef<string[]>([]);
  const oldestLoadedMessageRef = useRef<LoadedMessageCursor | null>(null);
  const fetchDataInFlightRef = useRef(false);
  const fetchDataInFlightRoomIdRef = useRef<string | null>(null);
  const queuedFetchDataRoomIdRef = useRef<string | null>(null);
  const lastFetchDataCompletedAtRef = useRef(0);
  const lastFetchDataRoomIdRef = useRef<string | null>(null);
  const metadataRefreshCacheRef = useRef<Map<string, number>>(new Map());
  const {
    updateUnreadForRooms,
    scheduleUnreadRefresh,
  } = useChatReadStateSync({
    effectiveChatUserId,
    selectedRoomIdRef,
    pendingBottomAlignRoomIdRef,
    optimisticUnreadFloorRef,
    setRoomUnreadCounts,
  });

  const {
    syncChatRoomsState,
    buildRoomSummaryFromMessages,
    applyRoomSummaryToState,
    persistRoomSummary,
    syncRoomSummaryFromMessages,
  } = useChatRoomListSync({
    repairDirectRooms,
    setChatRooms,
    scheduleUnreadRefresh,
  });

  const compareMessagesChronologically = useCallback(
    (left: ChatMessage, right: ChatMessage) => {
      const leftTime = new Date(left.created_at || 0).getTime();
      const rightTime = new Date(right.created_at || 0).getTime();
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return String(left.id || '').localeCompare(String(right.id || ''));
    },
    [],
  );

  const isLocalOnlyMessage = useCallback(
    (message: ChatMessage) => {
      const messageId = String(message.id || '');
      return messageId.startsWith('temp-') && deliveryStatesRef.current[messageId]?.status !== 'sent';
    },
    [deliveryStatesRef],
  );

  const enrichMessages = useCallback(
    (sourceMessages: ChatMessage[]) =>
      (sourceMessages || []).map((message: ChatMessage) => ({
        ...message,
        staff: message.staff || resolveStaffProfile(message.sender_id, message.sender_name),
      })),
    [resolveStaffProfile],
  );

  const fetchMessagePage = useCallback(
    async ({
      roomIdsToLoad,
      pageSize,
      beforeMessage,
    }: {
      roomIdsToLoad: string[];
      pageSize: number;
      beforeMessage?: LoadedMessageCursor | null;
    }) => {
      if (!roomIdsToLoad.length || pageSize <= 0) {
        return { messages: [] as ChatMessage[], hasOlder: false, error: null as unknown };
      }

      const { data, error } = await selectChatMessagesWithFallback<ChatMessage[]>(
        ({ selectClause }) => {
          let query = supabase
            .from('messages')
            .select(selectClause)
            .in('room_id', roomIdsToLoad);

          if (beforeMessage?.createdAt) {
            const normalizedCursorTime = normalizeMessageCursorTime(beforeMessage.createdAt);
            const normalizedCursorId = String(beforeMessage.id || '').trim();
            query = normalizedCursorId
              ? query.or(
                  `created_at.lt.${normalizedCursorTime},and(created_at.eq.${normalizedCursorTime},id.lt.${normalizedCursorId})`,
                )
              : query.lt('created_at', normalizedCursorTime);
          }

          return query
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(pageSize + 1) as PromiseLike<{
              data: ChatMessage[] | null;
              error: unknown;
            }>;
        },
      );

      if (error) {
        return { messages: [] as ChatMessage[], hasOlder: false, error };
      }

      const rows = Array.isArray(data) ? data : [];
      const hasOlder = rows.length > pageSize;
      const pageRows = (hasOlder ? rows.slice(0, pageSize) : rows).reverse();
      return { messages: pageRows, hasOlder, error: null as unknown };
    },
    [selectChatMessagesWithFallback],
  );

  const syncVisibleMessageMetadata = useCallback(
    async ({
      roomIdForFetch,
      roomIdsToLoad,
      selectedRoomRecord,
      visibleMessages,
      isCurrentRequest,
      includeRoomLevelMeta,
    }: {
      roomIdForFetch: string;
      roomIdsToLoad: string[];
      selectedRoomRecord: ChatRoom;
      visibleMessages: ChatMessage[];
      isCurrentRequest: () => boolean;
      includeRoomLevelMeta: boolean;
    }) => {
      const messageIds = visibleMessages
        .map((message: ChatMessage) => String(message.id || ''))
        .filter((messageId) => Boolean(messageId) && !messageId.startsWith('temp-'));
      const roomMemberIds = getEffectiveRoomMemberIds(selectedRoomRecord);

      const fetchedRoomSummary = buildRoomSummaryFromMessages(roomIdForFetch, visibleMessages);
      applyRoomSummaryToState(roomIdForFetch, fetchedRoomSummary);

      if (includeRoomLevelMeta) {
        const currentPreviewText =
          selectedRoomRecord.last_message_preview ?? selectedRoomRecord.last_message ?? null;
        const currentPreviewAt = selectedRoomRecord.last_message_at ?? null;
        if (
          currentPreviewText !== fetchedRoomSummary.last_message_preview ||
          currentPreviewAt !== fetchedRoomSummary.last_message_at
        ) {
          await persistRoomSummary(roomIdForFetch, fetchedRoomSummary);
        }
        if (!isCurrentRequest()) return;
      }

      const metadataCacheKey = [
        roomIdForFetch,
        roomIdsToLoad.join(','),
        messageIds.join(','),
        roomMemberIds.join(','),
        effectiveTodoUserId || '',
        includeRoomLevelMeta ? 'room' : 'message',
      ].join('|');
      const now = Date.now();
      const lastMetadataRefreshAt = metadataRefreshCacheRef.current.get(metadataCacheKey) || 0;
      if (
        visibleMessages.length > 0 &&
        now - lastMetadataRefreshAt < CHAT_METADATA_REFRESH_TTL_MS
      ) {
        const targetRoomIds = roomIdsToLoad.length > 0 ? roomIdsToLoad : [roomIdForFetch];
        targetRoomIds.forEach((targetRoomId) => {
          delete optimisticUnreadFloorRef.current[targetRoomId];
        });
        setRoomUnreadCounts((prev) => {
          let changed = false;
          const next = { ...prev };
          targetRoomIds.forEach((targetRoomId) => {
            if (!next[targetRoomId]) return;
            next[targetRoomId] = 0;
            changed = true;
          });
          return changed ? next : prev;
        });
        return;
      }
      metadataRefreshCacheRef.current.set(metadataCacheKey, now);
      metadataRefreshCacheRef.current.forEach((cachedAt, key) => {
        if (now - cachedAt > 60_000) metadataRefreshCacheRef.current.delete(key);
      });

      const [roomReadCursorsResult, bookmarksResult, reactionsResult] = await Promise.allSettled([
        messageIds.length > 0 && roomMemberIds.length > 0
          ? supabase
              .from('room_read_cursors')
              .select('user_id, last_read_at')
              .in('room_id', roomIdsToLoad)
              .in('user_id', roomMemberIds)
          : Promise.resolve({ data: [], error: null }),
        effectiveTodoUserId && messageIds.length > 0
          ? supabase
              .from('message_bookmarks')
              .select('message_id')
              .eq('user_id', effectiveTodoUserId)
              .in('message_id', messageIds)
          : Promise.resolve({ data: [], error: null }),
        messageIds.length > 0
          ? supabase
              .from('message_reactions')
              .select('message_id, emoji, user_id')
              .in('message_id', messageIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (!isCurrentRequest()) return;

      if (visibleMessages.length > 0) {
        const nextRoomReadCursorMap: Record<string, string> = {};
        if (roomMemberIds.length > 0 && roomReadCursorsResult.status === 'fulfilled') {
          const roomReadCursorValue = roomReadCursorsResult.value as {
            data: Record<string, unknown>[] | null;
            error: unknown;
          };
          if (roomReadCursorValue.error) {
            console.error('chat read cursor query failed:', roomReadCursorValue.error);
          }
          (roomReadCursorValue.data || []).forEach((cursor: Record<string, unknown>) => {
            const memberId = String(cursor.user_id || '');
            const lastReadAt = String(cursor.last_read_at || '');
            if (!memberId || !lastReadAt) return;
            const mergedReadAt = getLatestReadCursor(nextRoomReadCursorMap[memberId], lastReadAt);
            if (mergedReadAt) {
              nextRoomReadCursorMap[memberId] = mergedReadAt;
            }
          });
        } else if (roomReadCursorsResult.status === 'rejected') {
          console.error('chat read cursor query failed:', roomReadCursorsResult.reason);
        }
        setRoomReadCursorMap(nextRoomReadCursorMap);

        const counts: Record<string, number> = {};
        visibleMessages.forEach((message: ChatMessage) => {
          const messageId = String(message.id || '');
          if (!messageId) return;
          const recipientIds = roomMemberIds.filter((memberId) => memberId !== String(message.sender_id || ''));
          const readersCount = recipientIds.filter((memberId) =>
            isMessageReadByCursor(message.created_at, nextRoomReadCursorMap[memberId]),
          ).length;
          counts[messageId] = readersCount;
        });
        setReadCounts(counts);

        if (effectiveTodoUserId) {
          if (bookmarksResult.status === 'fulfilled') {
            const bookmarksValue = bookmarksResult.value as {
              data: Record<string, unknown>[] | null;
              error: unknown;
            };
            if (!bookmarksValue.error) {
              const nextBookmarkIds = (bookmarksValue.data || []).map((bookmark: Record<string, unknown>) =>
                String(bookmark.message_id),
              );
              setBookmarkedIds(new Set(nextBookmarkIds));
              writeStoredBookmarks(effectiveTodoUserId, nextBookmarkIds);
            } else {
              setBookmarkedIds(
                new Set(
                  readStoredBookmarks(effectiveTodoUserId).filter((bookmarkId) => messageIds.includes(bookmarkId)),
                ),
              );
            }
          } else {
            setBookmarkedIds(
              new Set(
                readStoredBookmarks(effectiveTodoUserId).filter((bookmarkId) => messageIds.includes(bookmarkId)),
              ),
            );
          }
        }
      } else {
        setReadCounts({});
        setRoomReadCursorMap({});
        setBookmarkedIds(new Set(readStoredBookmarks(effectiveTodoUserId)));
      }

      try {
        if (reactionsResult.status === 'rejected') throw reactionsResult.reason;
        const reactionsValue = reactionsResult.value as { data: Record<string, unknown>[] | null; error: unknown };
        if (reactionsValue.error) throw reactionsValue.error;

        const reactionCounts: Record<string, Record<string, number>> = {};
        const reactionUsersMap: ReactionUsersByMessage = {};
        reactionsValue.data?.forEach((reaction: Record<string, unknown>) => {
          const messageId = String(reaction.message_id || '').trim();
          const emoji = String(reaction.emoji || '').trim();
          const reactionUserId = String(reaction.user_id || '').trim();
          if (!messageId || !emoji) return;

          if (!reactionCounts[messageId]) reactionCounts[messageId] = {};
          reactionCounts[messageId][emoji] = (reactionCounts[messageId][emoji] || 0) + 1;

          if (!reactionUsersMap[messageId]) reactionUsersMap[messageId] = {};
          if (!reactionUsersMap[messageId][emoji]) reactionUsersMap[messageId][emoji] = [];
          if (!reactionUserId) return;

          const resolvedReactionUser = resolveStaffProfile(reactionUserId) || {
            id: reactionUserId,
            name: 'Unknown',
            company: '',
            department: '',
            position: '',
            photo_url: null,
          };

          if (!reactionUsersMap[messageId][emoji].some((staff) => String(staff.id) === reactionUserId)) {
            reactionUsersMap[messageId][emoji].push({
              ...resolvedReactionUser,
              id: String(resolvedReactionUser.id || reactionUserId),
              name: String(resolvedReactionUser.name || 'Unknown'),
              company: String(resolvedReactionUser.company || ''),
              department: String(resolvedReactionUser.department || ''),
              position: String(resolvedReactionUser.position || ''),
              photo_url: resolvedReactionUser.photo_url ?? null,
            });
          }
        });

        Object.values(reactionUsersMap).forEach((emojiMap) => {
          Object.keys(emojiMap).forEach((emoji) => {
            emojiMap[emoji] = [...emojiMap[emoji]].sort(compareStaffMembers);
          });
        });
        setReactions(reactionCounts);
        setReactionUsersByMessage(reactionUsersMap);
      } catch (error) {
        console.error('message reactions query failed:', error);
        setReactions({});
        setReactionUsersByMessage({});
      }
      if (!isCurrentRequest()) return;

      if (includeRoomLevelMeta) {
        try {
          const pinnedResult = await supabase
            .from('pinned_messages')
            .select('message_id')
            .eq('room_id', roomIdForFetch);
          if (pinnedResult.error) throw pinnedResult.error;
          if (!isCurrentRequest()) return;

          const nextPinnedIds = (pinnedResult.data || [])
            .map((item: Record<string, unknown>) => String(item.message_id))
            .slice(-1);
          setPinnedIds(nextPinnedIds);
          writeStoredPinnedIds(roomIdForFetch, nextPinnedIds);

          if (nextPinnedIds.length > 0) {
            const pinnedLookup = new Map<string, ChatMessage>();
            visibleMessages.forEach((message: ChatMessage) => {
              const messageId = String(message.id);
              if (!nextPinnedIds.includes(messageId)) return;
              pinnedLookup.set(messageId, {
                ...message,
                staff: message.staff || resolveStaffProfile(message.sender_id),
              });
            });

            const missingPinnedIds = nextPinnedIds.filter((messageId) => !pinnedLookup.has(messageId));
            if (missingPinnedIds.length > 0) {
              const { data: missingPinnedRows, error: missingPinnedRowsError } = await selectChatMessagesWithFallback<ChatMessage[]>(
                ({ selectClause }) =>
                  supabase
                    .from('messages')
                    .select(selectClause)
                    .in('id', missingPinnedIds) as PromiseLike<{
                      data: ChatMessage[] | null;
                      error: unknown;
                    }>,
              );
              if (missingPinnedRowsError) throw missingPinnedRowsError;
              if (!isCurrentRequest()) return;

              (missingPinnedRows || []).forEach((message: ChatMessage) => {
                pinnedLookup.set(String(message.id), {
                  ...message,
                  staff: resolveStaffProfile(message.sender_id),
                });
              });
            }

            setPersistedPinnedMessages(
              nextPinnedIds
                .map((messageId) => pinnedLookup.get(messageId))
                .filter((message): message is ChatMessage => Boolean(message)),
            );
          } else {
            setPersistedPinnedMessages([]);
          }
        } catch (error) {
          console.error('pinned messages query failed:', error);
          setPinnedIds([]);
          setPersistedPinnedMessages([]);
        }
        if (!isCurrentRequest()) return;

        try {
          const pollsResult = (await supabase
            .from('polls')
            .select(POLL_SELECT)
            .eq('room_id', roomIdForFetch)) as { data: any[] | null; error: unknown };
          if (pollsResult.error) throw pollsResult.error;
          if (!isCurrentRequest()) return;

          const dbPolls = pollsResult.data || [];
          setPolls(dbPolls.length > 0 ? dbPolls : []);

          const pollIds = dbPolls.map((poll) => String(poll.id || '')).filter(Boolean);
          if (pollIds.length === 0) {
            setPollVotes({});
          } else {
            const { data: votes, error: pollVotesError } = await supabase
              .from('poll_votes')
              .select('poll_id, option_index')
              .in('poll_id', pollIds);
            if (pollVotesError) throw pollVotesError;
            if (!isCurrentRequest()) return;

            const voteMap: Record<string, Record<number, number>> = {};
            votes?.forEach((vote: Record<string, unknown>) => {
              const pollId = String(vote.poll_id || '');
              const optionIndex = Number(vote.option_index);
              if (!pollId || !Number.isFinite(optionIndex)) return;
              if (!voteMap[pollId]) voteMap[pollId] = {};
              voteMap[pollId][optionIndex] = (voteMap[pollId][optionIndex] || 0) + 1;
            });
            setPollVotes(voteMap);
          }
        } catch (error) {
          console.error('poll query failed:', error);
          setPolls([]);
          setPollVotes({});
        }
        if (!isCurrentRequest()) return;
      }

      const targetRoomIds = roomIdsToLoad.length > 0 ? roomIdsToLoad : [roomIdForFetch];
      targetRoomIds.forEach((targetRoomId) => {
        delete optimisticUnreadFloorRef.current[targetRoomId];
      });
      setRoomUnreadCounts((prev) => {
        let changed = false;
        const next = { ...prev };
        targetRoomIds.forEach((targetRoomId) => {
          if (!next[targetRoomId]) return;
          next[targetRoomId] = 0;
          changed = true;
        });
        return changed ? next : prev;
      });
    },
    [
      applyRoomSummaryToState,
      buildRoomSummaryFromMessages,
      effectiveTodoUserId,
      getEffectiveRoomMemberIds,
      persistRoomSummary,
      resolveStaffProfile,
      optimisticUnreadFloorRef,
      selectChatMessagesWithFallback,
      setBookmarkedIds,
      setPinnedIds,
      setPersistedPinnedMessages,
      setPolls,
      setPollVotes,
      setReadCounts,
      setReactionUsersByMessage,
      setReactions,
      setRoomReadCursorMap,
      setRoomUnreadCounts,
    ],
  );

  const applyReadCursorFromRealtime = useCallback((row: Record<string, unknown> | null | undefined) => {
    const memberId = String(row?.user_id || '').trim();
    const lastReadAt = String(row?.last_read_at || '').trim();
    if (!memberId || !lastReadAt) return;

    const roomIdForFetch = String(selectedRoomIdRef.current || selectedRoomId || '').trim();
    if (!roomIdForFetch) return;

    const selectedRoomRecord =
      chatRoomsRef.current.find((room: ChatRoom) => String(room.id) === roomIdForFetch) || null;
    if (!selectedRoomRecord) return { ok: false, reason: 'no-room' };
    const roomMemberIds = getEffectiveRoomMemberIds(selectedRoomRecord);

    setRoomReadCursorMap((prev) => {
      const next = { ...prev };
      const mergedReadAt = getLatestReadCursor(next[memberId], lastReadAt);
      if (mergedReadAt) next[memberId] = mergedReadAt;

      const counts: Record<string, number> = {};
      messagesRef.current.forEach((message: ChatMessage) => {
        const messageId = String(message.id || '');
        if (!messageId) return;
        const recipientIds = roomMemberIds.filter((recipientId) => recipientId !== String(message.sender_id || ''));
        counts[messageId] = recipientIds.filter((recipientId) =>
          isMessageReadByCursor(message.created_at, next[recipientId]),
        ).length;
      });
      setReadCounts(counts);
      return next;
    });
  }, [
    chatRoomsRef,
    getEffectiveRoomMemberIds,
    messagesRef,
    selectedRoomId,
    selectedRoomIdRef,
    setReadCounts,
    setRoomReadCursorMap,
  ]);

  const refreshVisibleMessageReactions = useCallback(async () => {
    const messageIds = Array.from(visibleMessageIdsRef.current).filter(Boolean);
    if (messageIds.length === 0) {
      setReactions({});
      setReactionUsersByMessage({});
      return;
    }

    try {
      const { data, error } = await supabase
        .from('message_reactions')
        .select('message_id, emoji, user_id')
        .in('message_id', messageIds);
      if (error) throw error;

      const reactionCounts: Record<string, Record<string, number>> = {};
      const reactionUsersMap: ReactionUsersByMessage = {};
      data?.forEach((reaction: Record<string, unknown>) => {
        const messageId = String(reaction.message_id || '').trim();
        const emoji = String(reaction.emoji || '').trim();
        const reactionUserId = String(reaction.user_id || '').trim();
        if (!messageId || !emoji) return;

        if (!reactionCounts[messageId]) reactionCounts[messageId] = {};
        reactionCounts[messageId][emoji] = (reactionCounts[messageId][emoji] || 0) + 1;

        if (!reactionUsersMap[messageId]) reactionUsersMap[messageId] = {};
        if (!reactionUsersMap[messageId][emoji]) reactionUsersMap[messageId][emoji] = [];
        if (!reactionUserId) return;

        const resolvedReactionUser = resolveStaffProfile(reactionUserId) || {
          id: reactionUserId,
          name: 'Unknown',
          company: '',
          department: '',
          position: '',
          photo_url: null,
        };

        if (!reactionUsersMap[messageId][emoji].some((staff) => String(staff.id) === reactionUserId)) {
          reactionUsersMap[messageId][emoji].push({
            ...resolvedReactionUser,
            id: String(resolvedReactionUser.id || reactionUserId),
            name: String(resolvedReactionUser.name || 'Unknown'),
            company: String(resolvedReactionUser.company || ''),
            department: String(resolvedReactionUser.department || ''),
            position: String(resolvedReactionUser.position || ''),
            photo_url: resolvedReactionUser.photo_url ?? null,
          });
        }
      });

      Object.values(reactionUsersMap).forEach((emojiMap) => {
        Object.keys(emojiMap).forEach((emoji) => {
          emojiMap[emoji] = [...emojiMap[emoji]].sort(compareStaffMembers);
        });
      });
      setReactions(reactionCounts);
      setReactionUsersByMessage(reactionUsersMap);
    } catch (error) {
      console.error('message reactions query failed:', error);
    }
  }, [
    resolveStaffProfile,
    setReactionUsersByMessage,
    setReactions,
    visibleMessageIdsRef,
  ]);

  const refreshVisibleMessageBookmarks = useCallback(async () => {
    const messageIds = Array.from(visibleMessageIdsRef.current).filter(Boolean);
    if (!effectiveTodoUserId || messageIds.length === 0) {
      setBookmarkedIds(new Set(readStoredBookmarks(effectiveTodoUserId)));
      return;
    }

    try {
      const { data, error } = await supabase
        .from('message_bookmarks')
        .select('message_id')
        .eq('user_id', effectiveTodoUserId)
        .in('message_id', messageIds);
      if (error) throw error;

      const nextBookmarkIds = (data || []).map((bookmark: Record<string, unknown>) =>
        String(bookmark.message_id),
      );
      setBookmarkedIds(new Set(nextBookmarkIds));
      writeStoredBookmarks(effectiveTodoUserId, nextBookmarkIds);
    } catch {
      setBookmarkedIds(
        new Set(
          readStoredBookmarks(effectiveTodoUserId).filter((bookmarkId) => messageIds.includes(bookmarkId)),
        ),
      );
    }
  }, [effectiveTodoUserId, setBookmarkedIds, visibleMessageIdsRef]);

  const refreshRoomPinnedMessages = useCallback(async () => {
    const roomIdForFetch = String(selectedRoomIdRef.current || selectedRoomId || '').trim();
    if (!roomIdForFetch) return;

    try {
      const pinnedResult = await supabase
        .from('pinned_messages')
        .select('message_id')
        .eq('room_id', roomIdForFetch);
      if (pinnedResult.error) throw pinnedResult.error;

      const nextPinnedIds = (pinnedResult.data || [])
        .map((item: Record<string, unknown>) => String(item.message_id))
        .slice(-1);
      setPinnedIds(nextPinnedIds);
      writeStoredPinnedIds(roomIdForFetch, nextPinnedIds);

      if (nextPinnedIds.length === 0) {
        setPersistedPinnedMessages([]);
        return;
      }

      const pinnedLookup = new Map<string, ChatMessage>();
      messagesRef.current.forEach((message: ChatMessage) => {
        const messageId = String(message.id);
        if (!nextPinnedIds.includes(messageId)) return;
        pinnedLookup.set(messageId, {
          ...message,
          staff: message.staff || resolveStaffProfile(message.sender_id),
        });
      });

      const missingPinnedIds = nextPinnedIds.filter((messageId) => !pinnedLookup.has(messageId));
      if (missingPinnedIds.length > 0) {
        const { data: missingPinnedRows, error: missingPinnedRowsError } = await selectChatMessagesWithFallback<ChatMessage[]>(
          ({ selectClause }) =>
            supabase
              .from('messages')
              .select(selectClause)
              .in('id', missingPinnedIds) as PromiseLike<{
                data: ChatMessage[] | null;
                error: unknown;
              }>,
        );
        if (missingPinnedRowsError) throw missingPinnedRowsError;

        (missingPinnedRows || []).forEach((message: ChatMessage) => {
          pinnedLookup.set(String(message.id), {
            ...message,
            staff: resolveStaffProfile(message.sender_id),
          });
        });
      }

      setPersistedPinnedMessages(
        nextPinnedIds
          .map((messageId) => pinnedLookup.get(messageId))
          .filter((message): message is ChatMessage => Boolean(message)),
      );
    } catch (error) {
      console.error('pinned messages query failed:', error);
    }
  }, [
    messagesRef,
    resolveStaffProfile,
    selectChatMessagesWithFallback,
    selectedRoomId,
    selectedRoomIdRef,
    setPersistedPinnedMessages,
    setPinnedIds,
  ]);

  const refreshRoomPolls = useCallback(async () => {
    const roomIdForFetch = String(selectedRoomIdRef.current || selectedRoomId || '').trim();
    if (!roomIdForFetch) return;

    try {
      const pollsResult = (await supabase
        .from('polls')
        .select(POLL_SELECT)
        .eq('room_id', roomIdForFetch)) as { data: PollItem[] | null; error: unknown };
      if (pollsResult.error) throw pollsResult.error;

      const dbPolls = pollsResult.data || [];
      setPolls(dbPolls.length > 0 ? dbPolls : []);

      const pollIds = dbPolls.map((poll) => String(poll.id || '')).filter(Boolean);
      if (pollIds.length === 0) {
        setPollVotes({});
        return;
      }

      const { data: votes, error: pollVotesError } = await supabase
        .from('poll_votes')
        .select('poll_id, option_index')
        .in('poll_id', pollIds);
      if (pollVotesError) throw pollVotesError;

      const voteMap: Record<string, Record<number, number>> = {};
      votes?.forEach((vote: Record<string, unknown>) => {
        const pollId = String(vote.poll_id || '');
        const optionIndex = Number(vote.option_index);
        if (!pollId || !Number.isFinite(optionIndex)) return;
        if (!voteMap[pollId]) voteMap[pollId] = {};
        voteMap[pollId][optionIndex] = (voteMap[pollId][optionIndex] || 0) + 1;
      });
      setPollVotes(voteMap);
    } catch (error) {
      console.error('poll query failed:', error);
    }
  }, [
    selectedRoomId,
    selectedRoomIdRef,
    setPolls,
    setPollVotes,
  ]);

  const runFetchData = useCallback(async () => {
    if (!selectedRoomId) {
      paginationRoomIdRef.current = null;
      roomIdsToLoadRef.current = [];
      oldestLoadedMessageRef.current = null;
      loadedPersistedMessageCountRef.current = MESSAGE_PAGE_SIZE;
      loadingOlderMessagesRef.current = false;
      setLoadingOlderMessages(false);
      setHasOlderMessages(false);
      setLoadingRoomId(null);
      setTimelineRoomId(null);
      return;
    }

    const roomIdForFetch = String(selectedRoomId);
    const shouldMarkTimelineLoading = paginationRoomIdRef.current !== roomIdForFetch;
    if (paginationRoomIdRef.current !== roomIdForFetch) {
      roomIdsToLoadRef.current = [];
      oldestLoadedMessageRef.current = null;
      loadedPersistedMessageCountRef.current = MESSAGE_PAGE_SIZE;
      setHasOlderMessages(false);
    }
    if (shouldMarkTimelineLoading) {
      setLoadingRoomId(roomIdForFetch);
      setTimelineRoomId(null);
    }

    loadingOlderMessagesRef.current = false;
    setLoadingOlderMessages(false);

    const requestSeq = fetchDataRequestSeqRef.current + 1;
    fetchDataRequestSeqRef.current = requestSeq;
    const isCurrentRequest = () =>
      fetchDataRequestSeqRef.current === requestSeq &&
      String(selectedRoomIdRef.current || '') === roomIdForFetch;

    const cachedRooms = chatRoomsRef.current;
    const shouldFetchRooms =
      cachedRooms.length === 0 ||
      !cachedRooms.some((room: ChatRoom) => String(room.id) === roomIdForFetch);

    let roomRows: ChatRoom[] = cachedRooms;
    if (shouldFetchRooms) {
      const roomResult = await fetchAllChatRooms({ force: true });
      if (roomResult.error) {
        console.error('chat room list query failed:', roomResult.error);
        setLoadingRoomId(null);
        return;
      }
      roomRows = roomResult.data;
    }
    if (!isCurrentRequest()) return;

    const repairedRooms = await repairDirectRooms(roomRows);
    if (!isCurrentRequest()) return;

    const selectedRoomRecord =
      repairedRooms.find((room: ChatRoom) => String(room.id) === roomIdForFetch) || null;
    const shouldSyncRooms = shouldFetchRooms || repairedRooms !== roomRows;
    const roomList = shouldSyncRooms ? await syncChatRoomsState(repairedRooms) : repairedRooms;
    if (!isCurrentRequest()) return;

    if (!selectedRoomRecord || !isRoomAccessibleToCurrentUser(selectedRoomRecord)) {
      roomIdsToLoadRef.current = [];
      oldestLoadedMessageRef.current = null;
      setHasOlderMessages(false);
      setLoadingRoomId(null);
      setTimelineRoomId(null);

      const fallbackRoomId =
        roomList.find((room: ChatRoom) => String(room.id) === NOTICE_ROOM_ID && isRoomAccessibleToCurrentUser(room))?.id ||
        roomList.find((room: ChatRoom) => isRoomAccessibleToCurrentUser(room))?.id ||
        null;
      if (String(fallbackRoomId || '') !== roomIdForFetch) {
        setRoom(fallbackRoomId ? String(fallbackRoomId) : null);
      } else if (!fallbackRoomId) {
        setRoom(null);
      }
      return;
    }

    const selectedRoomKey = getDirectRoomMembersKey(selectedRoomRecord);
    const canonicalDirectRoom = selectedRoomKey
      ? repairedRooms
          .filter((room: ChatRoom) => getDirectRoomMembersKey(room) === selectedRoomKey)
          .sort(
            (left: ChatRoom, right: ChatRoom) =>
              new Date(right.last_message_at || right.created_at || 0).getTime() -
              new Date(left.last_message_at || left.created_at || 0).getTime(),
          )[0]
      : null;
    if (canonicalDirectRoom?.id && String(canonicalDirectRoom.id) !== roomIdForFetch) {
      setRoom(String(canonicalDirectRoom.id));
    }
    if (!isCurrentRequest()) return;

    const roomIdsToLoad = Array.from(
      new Set(
        selectedRoomKey
          ? repairedRooms
              .filter((room: ChatRoom) => getDirectRoomMembersKey(room) === selectedRoomKey)
              .map((room: ChatRoom) => String(room.id))
          : [roomIdForFetch],
      ),
    );

    roomIdsToLoadRef.current = roomIdsToLoad;
    paginationRoomIdRef.current = roomIdForFetch;

    const pageSize = Math.max(MESSAGE_PAGE_SIZE, loadedPersistedMessageCountRef.current || MESSAGE_PAGE_SIZE);
    const pageResult = await fetchMessagePage({ roomIdsToLoad, pageSize });
    if (pageResult.error) {
      console.error('chat messages query failed:', pageResult.error);
      setLoadingRoomId(null);
      return;
    }
    if (!isCurrentRequest()) return;

    const visibleMessages = enrichMessages(pageResult.messages);
    loadedPersistedMessageCountRef.current = visibleMessages.length;
    oldestLoadedMessageRef.current =
      visibleMessages.length > 0
        ? {
            id: String(visibleMessages[0].id || ''),
            createdAt: String(visibleMessages[0].created_at || ''),
          }
        : null;
    setHasOlderMessages(pageResult.hasOlder);

    setMessages((prev) => {
      const localOnly = prev.filter((message: ChatMessage) => isLocalOnlyMessage(message));
      return [...visibleMessages, ...localOnly].sort(compareMessagesChronologically);
    });
    setTimelineRoomId(roomIdForFetch);
    setLoadingRoomId(null);

    await syncVisibleMessageMetadata({
      roomIdForFetch,
      roomIdsToLoad,
      selectedRoomRecord,
      visibleMessages,
      isCurrentRequest,
      includeRoomLevelMeta: true,
    });
    if (!isCurrentRequest()) return;

    if (pendingBottomAlignRoomIdRef.current === roomIdForFetch && visibleMessages.length === 0) {
      pendingBottomAlignRoomIdRef.current = null;
    }
  }, [
    chatRoomsRef,
    compareMessagesChronologically,
    enrichMessages,
    fetchDataRequestSeqRef,
    fetchMessagePage,
    isLocalOnlyMessage,
    isRoomAccessibleToCurrentUser,
    pendingBottomAlignRoomIdRef,
    repairDirectRooms,
    selectedRoomId,
    selectedRoomIdRef,
    setMessages,
    setRoom,
    setLoadingRoomId,
    setTimelineRoomId,
    syncChatRoomsState,
    syncVisibleMessageMetadata,
  ]);

  const fetchData = useCallback(async (options: ChatFetchDataOptions = {}) => {
    const requestedRoomId = selectedRoomId ? String(selectedRoomId) : null;
    if (
      !options.force &&
      requestedRoomId &&
      !fetchDataInFlightRef.current &&
      lastFetchDataRoomIdRef.current === requestedRoomId &&
      Date.now() - lastFetchDataCompletedAtRef.current < CHAT_ROOM_FETCH_MIN_INTERVAL_MS
    ) {
      return;
    }

    if (fetchDataInFlightRef.current && fetchDataInFlightRoomIdRef.current === requestedRoomId) {
      queuedFetchDataRoomIdRef.current = requestedRoomId;
      return;
    }

    while (true) {
      fetchDataInFlightRef.current = true;
      fetchDataInFlightRoomIdRef.current = requestedRoomId;
      try {
        await runFetchData();
      } finally {
        lastFetchDataRoomIdRef.current = requestedRoomId;
        lastFetchDataCompletedAtRef.current = Date.now();
        if (fetchDataInFlightRoomIdRef.current === requestedRoomId) {
          fetchDataInFlightRef.current = false;
          fetchDataInFlightRoomIdRef.current = null;
        }
      }

      if (queuedFetchDataRoomIdRef.current !== requestedRoomId) {
        break;
      }
      queuedFetchDataRoomIdRef.current = null;

      const currentRoomId = selectedRoomIdRef.current ? String(selectedRoomIdRef.current) : null;
      if (currentRoomId !== requestedRoomId) {
        break;
      }
      if (
        !options.force &&
        requestedRoomId &&
        Date.now() - lastFetchDataCompletedAtRef.current < CHAT_ROOM_FETCH_MIN_INTERVAL_MS
      ) {
        break;
      }
    }
  }, [runFetchData, selectedRoomId, selectedRoomIdRef]);

  const loadMessagesAroundDate = useCallback(async ({
    dateKey,
    startIso,
    endIso,
  }: DateJumpLoadParams): Promise<DateJumpLoadResult> => {
    const roomIdForFetch = String(selectedRoomIdRef.current || selectedRoomId || '').trim();
    if (!roomIdForFetch) return { ok: false, reason: 'no-room' };

    const roomIdsToLoad =
      paginationRoomIdRef.current === roomIdForFetch && roomIdsToLoadRef.current.length > 0
        ? roomIdsToLoadRef.current
        : getConversationRoomIdsByRoomId(roomIdForFetch, chatRoomsRef.current);
    if (roomIdsToLoad.length === 0) return { ok: false, reason: 'no-room' };

    const selectedRoomRecord =
      chatRoomsRef.current.find((room: ChatRoom) => String(room.id) === roomIdForFetch) || null;
    if (!selectedRoomRecord) return { ok: false, reason: 'no-room' };

    const requestSeq = fetchDataRequestSeqRef.current + 1;
    fetchDataRequestSeqRef.current = requestSeq;
    const isCurrentRequest = () =>
      fetchDataRequestSeqRef.current === requestSeq &&
      String(selectedRoomIdRef.current || '') === roomIdForFetch;

    setLoadingRoomId(roomIdForFetch);
    setTimelineRoomId(null);
    loadingOlderMessagesRef.current = false;
    setLoadingOlderMessages(false);

    try {
      const { data: targetRows, error: targetError } = await selectChatMessagesWithFallback<ChatMessage[]>(
        ({ selectClause }) =>
          supabase
            .from('messages')
            .select(selectClause)
            .in('room_id', roomIdsToLoad)
            .gte('created_at', startIso)
            .lt('created_at', endIso)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .limit(1) as PromiseLike<{
              data: ChatMessage[] | null;
              error: unknown;
            }>,
      );

      if (targetError) throw targetError;
      if (!isCurrentRequest()) return { ok: false, reason: 'failed' };

      const targetMessage = Array.isArray(targetRows) ? targetRows[0] : null;
      if (!targetMessage?.id || !targetMessage.created_at) {
        setLoadingRoomId(null);
        setTimelineRoomId(roomIdForFetch);
        return { ok: false, reason: 'not-found' };
      }

      const beforeResult = await fetchMessagePage({
        roomIdsToLoad,
        pageSize: DATE_JUMP_CONTEXT_BEFORE,
        beforeMessage: {
          id: String(targetMessage.id),
          createdAt: String(targetMessage.created_at),
        },
      });
      if (beforeResult.error) throw beforeResult.error;
      if (!isCurrentRequest()) return { ok: false, reason: 'failed' };

      const targetCreatedAt = normalizeMessageCursorTime(targetMessage.created_at);
      const { data: afterRows, error: afterError } = await selectChatMessagesWithFallback<ChatMessage[]>(
        ({ selectClause }) =>
          supabase
            .from('messages')
            .select(selectClause)
            .in('room_id', roomIdsToLoad)
            .gt('created_at', targetCreatedAt)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .limit(DATE_JUMP_CONTEXT_AFTER) as PromiseLike<{
              data: ChatMessage[] | null;
              error: unknown;
            }>,
      );
      if (afterError) throw afterError;
      if (!isCurrentRequest()) return { ok: false, reason: 'failed' };

      const mergedMessages = new Map<string, ChatMessage>();
      [...beforeResult.messages, targetMessage, ...(afterRows || [])].forEach((message: ChatMessage) => {
        const messageId = String(message.id || '').trim();
        if (messageId) mergedMessages.set(messageId, message);
      });

      const visibleMessages = enrichMessages(
        Array.from(mergedMessages.values()).sort(compareMessagesChronologically),
      );

      paginationRoomIdRef.current = roomIdForFetch;
      roomIdsToLoadRef.current = roomIdsToLoad;
      loadedPersistedMessageCountRef.current = visibleMessages.length;
      oldestLoadedMessageRef.current =
        visibleMessages.length > 0
          ? {
              id: String(visibleMessages[0].id || ''),
              createdAt: String(visibleMessages[0].created_at || ''),
            }
          : null;
      setHasOlderMessages(beforeResult.hasOlder);

      setMessages((prev) => {
        const localOnly = prev.filter((message: ChatMessage) => isLocalOnlyMessage(message));
        return [...visibleMessages, ...localOnly].sort(compareMessagesChronologically);
      });
      setTimelineRoomId(roomIdForFetch);
      setLoadingRoomId(null);

      await syncVisibleMessageMetadata({
        roomIdForFetch,
        roomIdsToLoad,
        selectedRoomRecord,
        visibleMessages,
        isCurrentRequest,
        includeRoomLevelMeta: false,
      });

      if (!isCurrentRequest()) return { ok: false, reason: 'failed' };
      return { ok: true, messageId: String(targetMessage.id) };
    } catch (error) {
      console.error('date jump messages query failed:', { dateKey, error });
      if (isCurrentRequest()) {
        setLoadingRoomId(null);
        setTimelineRoomId(roomIdForFetch);
      }
      return { ok: false, reason: 'failed', error };
    }
  }, [
    chatRoomsRef,
    compareMessagesChronologically,
    enrichMessages,
    fetchDataRequestSeqRef,
    fetchMessagePage,
    isLocalOnlyMessage,
    selectedRoomId,
    selectedRoomIdRef,
    selectChatMessagesWithFallback,
    setMessages,
    setLoadingRoomId,
    setTimelineRoomId,
    syncVisibleMessageMetadata,
  ]);

  const loadMessagesAroundMessage = useCallback(async (messageId: string): Promise<MessageJumpLoadResult> => {
    const targetMessageId = String(messageId || '').trim();
    const roomIdForFetch = String(selectedRoomIdRef.current || selectedRoomId || '').trim();
    if (!roomIdForFetch) return { ok: false, reason: 'no-room' };
    if (!targetMessageId) return { ok: false, reason: 'not-found' };

    const roomIdsToLoad =
      paginationRoomIdRef.current === roomIdForFetch && roomIdsToLoadRef.current.length > 0
        ? roomIdsToLoadRef.current
        : getConversationRoomIdsByRoomId(roomIdForFetch, chatRoomsRef.current);
    if (roomIdsToLoad.length === 0) return { ok: false, reason: 'no-room' };

    const selectedRoomRecord =
      chatRoomsRef.current.find((room: ChatRoom) => String(room.id) === roomIdForFetch) || null;

    const requestSeq = fetchDataRequestSeqRef.current + 1;
    fetchDataRequestSeqRef.current = requestSeq;
    const isCurrentRequest = () =>
      fetchDataRequestSeqRef.current === requestSeq &&
      String(selectedRoomIdRef.current || '') === roomIdForFetch;

    setLoadingRoomId(roomIdForFetch);
    setTimelineRoomId(null);
    loadingOlderMessagesRef.current = false;
    setLoadingOlderMessages(false);
    pendingBottomAlignRoomIdRef.current = null;

    try {
      const { data: targetRows, error: targetError } = await selectChatMessagesWithFallback<ChatMessage[]>(
        ({ selectClause }) =>
          supabase
            .from('messages')
            .select(selectClause)
            .in('room_id', roomIdsToLoad)
            .eq('id', targetMessageId)
            .limit(1) as PromiseLike<{
              data: ChatMessage[] | null;
              error: unknown;
            }>,
      );

      if (targetError) throw targetError;
      if (!isCurrentRequest()) return { ok: false, reason: 'failed' };

      let targetMessage = Array.isArray(targetRows) ? targetRows[0] : null;
      if (!targetMessage?.id || !targetMessage.created_at) {
        const { data: fallbackRows, error: fallbackError } = await selectChatMessagesWithFallback<ChatMessage[]>(
          ({ selectClause }) =>
            supabase
              .from('messages')
              .select(selectClause)
              .eq('id', targetMessageId)
              .limit(1) as PromiseLike<{
                data: ChatMessage[] | null;
                error: unknown;
              }>,
        );
        if (fallbackError) throw fallbackError;
        if (!isCurrentRequest()) return { ok: false, reason: 'failed' };

        const fallbackMessage = Array.isArray(fallbackRows) ? fallbackRows[0] : null;
        const fallbackRoomId = String(fallbackMessage?.room_id || '').trim();
        if (
          fallbackMessage?.id &&
          fallbackMessage.created_at &&
          fallbackRoomId &&
          !roomIdsToLoad.includes(fallbackRoomId)
        ) {
          setLoadingRoomId(fallbackRoomId);
          setTimelineRoomId(null);
          pendingBottomAlignRoomIdRef.current = null;
          setRoom(fallbackRoomId);
          return { ok: false, reason: 'room-changed' };
        }

        targetMessage = fallbackMessage;
      }

      if (!targetMessage?.id || !targetMessage.created_at) {
        setLoadingRoomId(null);
        setTimelineRoomId(roomIdForFetch);
        return { ok: false, reason: 'not-found' };
      }

      if (!selectedRoomRecord) {
        setLoadingRoomId(null);
        setTimelineRoomId(roomIdForFetch);
        return { ok: false, reason: 'no-room' };
      }

      const beforeResult = await fetchMessagePage({
        roomIdsToLoad,
        pageSize: DATE_JUMP_CONTEXT_BEFORE,
        beforeMessage: {
          id: String(targetMessage.id),
          createdAt: String(targetMessage.created_at),
        },
      });
      if (beforeResult.error) throw beforeResult.error;
      if (!isCurrentRequest()) return { ok: false, reason: 'failed' };

      const targetCreatedAt = normalizeMessageCursorTime(targetMessage.created_at);
      const { data: afterRows, error: afterError } = await selectChatMessagesWithFallback<ChatMessage[]>(
        ({ selectClause }) =>
          supabase
            .from('messages')
            .select(selectClause)
            .in('room_id', roomIdsToLoad)
            .gt('created_at', targetCreatedAt)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .limit(DATE_JUMP_CONTEXT_AFTER) as PromiseLike<{
              data: ChatMessage[] | null;
              error: unknown;
            }>,
      );
      if (afterError) throw afterError;
      if (!isCurrentRequest()) return { ok: false, reason: 'failed' };

      const mergedMessages = new Map<string, ChatMessage>();
      [...beforeResult.messages, targetMessage, ...(afterRows || [])].forEach((message: ChatMessage) => {
        const nextMessageId = String(message.id || '').trim();
        if (nextMessageId) mergedMessages.set(nextMessageId, message);
      });

      const visibleMessages = enrichMessages(
        Array.from(mergedMessages.values()).sort(compareMessagesChronologically),
      );

      paginationRoomIdRef.current = roomIdForFetch;
      roomIdsToLoadRef.current = roomIdsToLoad;
      loadedPersistedMessageCountRef.current = visibleMessages.length;
      oldestLoadedMessageRef.current =
        visibleMessages.length > 0
          ? {
              id: String(visibleMessages[0].id || ''),
              createdAt: String(visibleMessages[0].created_at || ''),
            }
          : null;
      setHasOlderMessages(beforeResult.hasOlder);

      setMessages((prev) => {
        const localOnly = prev.filter((message: ChatMessage) => isLocalOnlyMessage(message));
        return [...visibleMessages, ...localOnly].sort(compareMessagesChronologically);
      });
      setTimelineRoomId(roomIdForFetch);
      setLoadingRoomId(null);

      await syncVisibleMessageMetadata({
        roomIdForFetch,
        roomIdsToLoad,
        selectedRoomRecord,
        visibleMessages,
        isCurrentRequest,
        includeRoomLevelMeta: false,
      });

      if (!isCurrentRequest()) return { ok: false, reason: 'failed' };
      return { ok: true, messageId: String(targetMessage.id) };
    } catch (error) {
      console.error('message jump query failed:', { messageId: targetMessageId, error });
      if (isCurrentRequest()) {
        setLoadingRoomId(null);
        setTimelineRoomId(roomIdForFetch);
      }
      return { ok: false, reason: 'failed', error };
    }
  }, [
    chatRoomsRef,
    compareMessagesChronologically,
    enrichMessages,
    fetchDataRequestSeqRef,
    fetchMessagePage,
    isLocalOnlyMessage,
    pendingBottomAlignRoomIdRef,
    selectedRoomId,
    selectedRoomIdRef,
    selectChatMessagesWithFallback,
    setMessages,
    setLoadingRoomId,
    setTimelineRoomId,
    syncVisibleMessageMetadata,
  ]);

  const loadOlderMessages = useCallback(async () => {
    const roomIdForFetch = String(selectedRoomIdRef.current || '').trim();
    if (!roomIdForFetch) return;
    if (loadingOlderMessagesRef.current || !hasOlderMessages) return;
    if (paginationRoomIdRef.current !== roomIdForFetch) return;

    const beforeMessage = oldestLoadedMessageRef.current;
    const roomIdsToLoad = roomIdsToLoadRef.current;
    if (!beforeMessage?.createdAt || roomIdsToLoad.length === 0) return;

    const requestSeq = fetchDataRequestSeqRef.current;
    const isCurrentRequest = () =>
      fetchDataRequestSeqRef.current === requestSeq &&
      String(selectedRoomIdRef.current || '') === roomIdForFetch;

    const listElement = messageListRef.current;
    const previousScrollHeight = listElement?.scrollHeight ?? 0;
    const previousScrollTop = listElement?.scrollTop ?? 0;

    loadingOlderMessagesRef.current = true;
    setLoadingOlderMessages(true);

    try {
      const pageResult = await fetchMessagePage({
        roomIdsToLoad,
        pageSize: MESSAGE_PAGE_SIZE,
        beforeMessage,
      });
      if (pageResult.error) {
        throw pageResult.error;
      }
      if (!isCurrentRequest()) return;

      setHasOlderMessages(pageResult.hasOlder);
      if (pageResult.messages.length === 0) {
        oldestLoadedMessageRef.current = null;
        return;
      }

      const olderMessages = enrichMessages(pageResult.messages);
      let combinedVisibleMessages: ChatMessage[] = [];
      setMessages((prev) => {
        const localOnly = prev.filter((message: ChatMessage) => isLocalOnlyMessage(message));
        const currentVisibleMessages = prev.filter((message: ChatMessage) => !isLocalOnlyMessage(message));
        const merged = new Map<string, ChatMessage>();
        [...olderMessages, ...currentVisibleMessages].forEach((message: ChatMessage) => {
          merged.set(String(message.id || ''), message);
        });
        combinedVisibleMessages = Array.from(merged.values()).sort(compareMessagesChronologically);
        return [...combinedVisibleMessages, ...localOnly].sort(compareMessagesChronologically);
      });

      loadedPersistedMessageCountRef.current = combinedVisibleMessages.length;
      oldestLoadedMessageRef.current = {
        id: String(olderMessages[0].id || ''),
        createdAt: String(olderMessages[0].created_at || ''),
      };

      requestAnimationFrame(() => {
        if (!isCurrentRequest()) return;
        const nextListElement = messageListRef.current;
        if (!nextListElement) return;
        const heightDiff = nextListElement.scrollHeight - previousScrollHeight;
        nextListElement.scrollTop = previousScrollTop + Math.max(0, heightDiff);
      });

      const selectedRoomRecord =
        chatRoomsRef.current.find((room: ChatRoom) => String(room.id) === roomIdForFetch) || null;
      if (!selectedRoomRecord) return;

      await syncVisibleMessageMetadata({
        roomIdForFetch,
        roomIdsToLoad,
        selectedRoomRecord,
        visibleMessages: combinedVisibleMessages,
        isCurrentRequest,
        includeRoomLevelMeta: false,
      });
    } catch (error) {
      console.error('older messages query failed:', error);
    } finally {
      loadingOlderMessagesRef.current = false;
      if (isCurrentRequest()) {
        setLoadingOlderMessages(false);
      }
    }
  }, [
    chatRoomsRef,
    compareMessagesChronologically,
    enrichMessages,
    fetchDataRequestSeqRef,
    fetchMessagePage,
    hasOlderMessages,
    isLocalOnlyMessage,
    messageListRef,
    selectedRoomIdRef,
    syncVisibleMessageMetadata,
  ]);

  return {
    updateUnreadForRooms,
    syncChatRoomsState,
    syncRoomSummaryFromMessages,
    fetchData,
    applyReadCursorFromRealtime,
    refreshVisibleMessageReactions,
    refreshVisibleMessageBookmarks,
    refreshRoomPinnedMessages,
    refreshRoomPolls,
    loadMessagesAroundDate,
    loadMessagesAroundMessage,
    loadOlderMessages,
    hasOlderMessages,
    loadingOlderMessages,
  };
}
