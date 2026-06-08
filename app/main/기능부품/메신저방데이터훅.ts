'use client';

import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { POLL_SELECT } from '@/lib/chat-query-columns';
import type { ChatMessage, ChatRoom } from '@/types';
import { fetchUnreadCountsForRoomIds } from './메신저데이터유틸';
import { fetchAllChatRooms } from './chatQueryService';
import { getDeletedMessagePreviewText, getMessageDisplayText } from './메신저첨부';
import {
  compareStaffMembers,
  getConversationRoomIdsByRoomId,
  getConversationRoomIdSet,
  getDirectRoomMembersKey,
  getLatestReadCursor,
  isMessageReadByCursor,
  NOTICE_ROOM_ID,
  readStoredBookmarks,
  sortChatRoomsWithNoticeFirst,
  toChatDate,
  writeStoredBookmarks,
  writeStoredPinnedIds,
} from './메신저유틸';
import type {
  LoadedMessageCursor,
  MessageJumpLoadResult,
  ReactionUsersByMessage,
  RoomSummary,
  UseChatRoomDataSyncParams,
} from './메신저방데이터-types';
import {
  CHAT_METADATA_REFRESH_TTL_MS,
  DATE_JUMP_CONTEXT_AFTER,
  DATE_JUMP_CONTEXT_BEFORE,
  MESSAGE_PAGE_SIZE,
} from './메신저방데이터-types';
import { defaultLegacySelectChatMessagesWithFallback, describeQueryError, normalizeMessageCursorTime } from './메신저방데이터-utils';
import { selectMessageBookmarkRows, selectMessageReactionRows } from './메신저방데이터-queries';

export function useChatRoomDataSync({
  selectedRoomId,
  selectedRoomIdRef,
  chatRoomsRef,
  messagesRef,
  pendingBottomAlignRoomIdRef,
  fetchDataRequestSeqRef,
  deliveryStatesRef,
  effectiveChatUserId,
  effectiveTodoUserId,
  userId,
  requestBottomAlignmentHold,
  setRoom,
  resolveStaffProfile,
  getEffectiveRoomMemberIds,
  isRoomAccessibleToCurrentUser,
  repairDirectRooms,
  selectChatMessagesWithFallback = defaultLegacySelectChatMessagesWithFallback,
  setChatRooms,
  setRoomUnreadCounts,
  setMessages,
  setLoadingRoomId,
  setTimelineRoomId,
  setRoomReadCursorMap,
  setReadCounts,
  setBookmarkedIds,
  setPinnedIds,
  setPersistedPinnedMessages,
  setReactions,
  setReactionUsersByMessage,
  setPolls,
  setPollVotes,
}: UseChatRoomDataSyncParams) {
  const implicitUnreadBaselineRef = useRef<Record<string, string | null>>({});

  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const loadingOlderMessagesRef = useRef(false);
  const paginationRoomIdRef = useRef<string | null>(null);
  const loadedPersistedMessageCountRef = useRef(MESSAGE_PAGE_SIZE);
  const roomIdsToLoadRef = useRef<string[]>([]);
  const oldestLoadedMessageRef = useRef<LoadedMessageCursor | null>(null);
  const metadataRefreshCacheRef = useRef<Map<string, number>>(new Map());

  const updateUnreadForRooms = useCallback(
    async (rooms: ChatRoom[]) => {
      if (!effectiveChatUserId || !rooms?.length) return;

      try {
        const myRooms = rooms.filter((room: ChatRoom) => {
          if (room.id === NOTICE_ROOM_ID) return true;
          if (Array.isArray(room.members)) {
            return room.members.some((id: unknown) => String(id) === effectiveChatUserId);
          }
          return false;
        });
        if (!myRooms.length) return;

        const roomIds = myRooms.map((room: ChatRoom) => room.id);
        const { data: cursors } = await supabase
          .from('room_read_cursors')
          .select('room_id, last_read_at')
          .eq('user_id', effectiveChatUserId)
          .in('room_id', roomIds);

        const cursorMap: Record<string, string | null> = {};
        (cursors || []).forEach((cursor: Record<string, unknown>) => {
          cursorMap[String(cursor.room_id || '')] = (cursor.last_read_at as string | null) || null;
        });
        const roomIdSet = new Set(roomIds.map((roomId) => String(roomId)));
        myRooms.forEach((room: ChatRoom) => {
          const roomId = String(room.id || '').trim();
          if (!roomId) return;
          if (cursorMap[roomId]) {
            delete implicitUnreadBaselineRef.current[roomId];
            return;
          }
          if (implicitUnreadBaselineRef.current[roomId] === undefined) {
            implicitUnreadBaselineRef.current[roomId] =
              String(room.last_message_at || room.created_at || '').trim() || null;
          }
        });
        Object.keys(implicitUnreadBaselineRef.current).forEach((roomId) => {
          if (!roomIdSet.has(roomId)) {
            delete implicitUnreadBaselineRef.current[roomId];
          }
        });
        const unreadCursorMap = { ...cursorMap };
        Object.entries(implicitUnreadBaselineRef.current).forEach(([roomId, baseline]) => {
          if (!unreadCursorMap[roomId] && baseline) {
            unreadCursorMap[roomId] = baseline;
          }
        });

        const activeRoomId = pendingBottomAlignRoomIdRef.current || selectedRoomIdRef.current;
        const openConversationRoomIds = getConversationRoomIdSet(activeRoomId, myRooms);
        const queryRoomIds = roomIds.filter(
          (roomId) => !openConversationRoomIds.has(roomId) && roomId !== activeRoomId,
        );

        const unreadBatchCounts = await fetchUnreadCountsForRoomIds(supabase, {
          roomIds: queryRoomIds,
          userId: effectiveChatUserId,
          cursorMap: unreadCursorMap,
        });
        const queriedEntries = queryRoomIds.map(
          (roomId): [string, number] => [roomId, unreadBatchCounts[roomId] || 0],
        );

        const activeEntries: [string, number][] = roomIds
          .filter((roomId) => openConversationRoomIds.has(roomId) || roomId === activeRoomId)
          .map((roomId): [string, number] => [roomId, 0]);

        const counts = Object.fromEntries([...activeEntries, ...queriedEntries]);
        if (activeRoomId) counts[activeRoomId] = 0;
        openConversationRoomIds.forEach((roomId) => {
          counts[roomId] = 0;
        });
        // 방 입장 직후 레이스컨디션 방지:
        // DB 쿼리 결과가 돌아왔을 때 이미 0으로 처리된 방은 덮어쓰지 않음
        setRoomUnreadCounts((prev) => {
          const next = { ...counts };
          Object.keys(prev).forEach((roomId) => {
            if (prev[roomId] === 0 && next[roomId] !== undefined && next[roomId] !== 0) {
              if (openConversationRoomIds.has(roomId) || roomId === activeRoomId) {
                next[roomId] = 0;
              }
            }
            if (
              !openConversationRoomIds.has(roomId) &&
              roomId !== activeRoomId &&
              next[roomId] !== undefined &&
              (prev[roomId] || 0) > (next[roomId] || 0)
            ) {
              next[roomId] = prev[roomId];
            }
          });
          return next;
        });
      } catch (error) {
        console.error('채팅방 안읽음 수 동기화 실패:', error);
      }
    },
    [effectiveChatUserId, pendingBottomAlignRoomIdRef, selectedRoomIdRef, setRoomUnreadCounts],
  );

  const applyChatRoomsState = useCallback(
    async (rooms: ChatRoom[]) => {
      const nextRooms = sortChatRoomsWithNoticeFirst(rooms || []);
      setChatRooms(nextRooms);
      await updateUnreadForRooms(nextRooms);
      return nextRooms;
    },
    [setChatRooms, updateUnreadForRooms],
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
        console.error('채팅방 미리보기 저장 실패:', error);
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

  const getSelectedConversationContext = useCallback(
    (triggerRoomId?: string | null) => {
      const roomIdForFetch = String(selectedRoomIdRef.current || selectedRoomId || '').trim();
      if (!roomIdForFetch) return null;

      const sourceRooms = chatRoomsRef.current;
      const selectedRoomRecord =
        sourceRooms.find((room: ChatRoom) => String(room.id) === roomIdForFetch) || null;
      if (!selectedRoomRecord) return null;

      const selectedRoomKey = getDirectRoomMembersKey(selectedRoomRecord);
      const roomIdsToLoad = Array.from(
        new Set(
          selectedRoomKey
            ? sourceRooms
                .filter((room: ChatRoom) => getDirectRoomMembersKey(room) === selectedRoomKey)
                .map((room: ChatRoom) => String(room.id))
            : [roomIdForFetch],
        ),
      ).filter(Boolean);

      const normalizedTriggerRoomId = String(triggerRoomId || '').trim();
      if (normalizedTriggerRoomId && !roomIdsToLoad.includes(normalizedTriggerRoomId)) {
        return null;
      }

      return {
        selectedRoomRecord,
        roomIdsToLoad,
        roomMemberIds: getEffectiveRoomMemberIds(selectedRoomRecord),
      };
    },
    [chatRoomsRef, getEffectiveRoomMemberIds, selectedRoomId, selectedRoomIdRef],
  );

  const updateReadCountsFromCursorMap = useCallback(
    (roomMemberIds: string[], cursorMap: Record<string, string>) => {
      const counts: Record<string, number> = {};
      messagesRef.current.forEach((message: ChatMessage) => {
        const messageId = String(message.id || '');
        if (!messageId) return;
        const recipientIds = roomMemberIds.filter((memberId) => memberId !== String(message.sender_id || ''));
        counts[messageId] = recipientIds.filter((memberId) =>
          isMessageReadByCursor(message.created_at, cursorMap[memberId]),
        ).length;
      });
      setReadCounts(counts);
    },
    [messagesRef, setReadCounts],
  );

  const applyReadCursorFromRealtime = useCallback(
    (row: Record<string, unknown> | null | undefined) => {
      const memberId = String(row?.user_id || '').trim();
      const lastReadAt = String(row?.last_read_at || '').trim();
      const updatedRoomId = String(row?.room_id || '').trim();
      if (!memberId || !lastReadAt) return;

      const context = getSelectedConversationContext(updatedRoomId);
      if (!context) return;

      setRoomReadCursorMap((prev) => {
        const next = { ...prev };
        const mergedReadAt = getLatestReadCursor(next[memberId], lastReadAt);
        if (mergedReadAt) next[memberId] = mergedReadAt;
        updateReadCountsFromCursorMap(context.roomMemberIds, next);
        return next;
      });
    },
    [getSelectedConversationContext, setRoomReadCursorMap, updateReadCountsFromCursorMap],
  );

  const refreshReadCursorsForRoom = useCallback(
    async (roomId?: string | null) => {
      const context = getSelectedConversationContext(roomId);
      if (!context || context.roomIdsToLoad.length === 0 || context.roomMemberIds.length === 0) return;

      try {
        const { data, error } = await supabase
          .from('room_read_cursors')
          .select('user_id, last_read_at')
          .in('room_id', context.roomIdsToLoad)
          .in('user_id', context.roomMemberIds);
        if (error) throw error;

        const nextCursorMap: Record<string, string> = {};
        (data || []).forEach((cursor: Record<string, unknown>) => {
          const memberId = String(cursor.user_id || '').trim();
          const lastReadAt = String(cursor.last_read_at || '').trim();
          if (!memberId || !lastReadAt) return;
          const mergedReadAt = getLatestReadCursor(nextCursorMap[memberId], lastReadAt);
          if (mergedReadAt) nextCursorMap[memberId] = mergedReadAt;
        });

        setRoomReadCursorMap(nextCursorMap);
        updateReadCountsFromCursorMap(context.roomMemberIds, nextCursorMap);
      } catch (error) {
        console.error('chat read cursor refresh failed:', error);
      }
    },
    [getSelectedConversationContext, setRoomReadCursorMap, updateReadCountsFromCursorMap],
  );

  const refreshVisibleMessageReactions = useCallback(async () => {
    const messageIds = Array.from(
      new Set(messagesRef.current.map((message: ChatMessage) => String(message.id || '').trim()).filter(Boolean)),
    );
    if (messageIds.length === 0) {
      setReactions({});
      setReactionUsersByMessage({});
      return;
    }

    try {
      const data = await selectMessageReactionRows(messageIds);

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

        const dbStaff = reaction.staff_members as Record<string, any> | null;
        const resolvedReactionUser = resolveStaffProfile(reactionUserId) || {
          id: reactionUserId,
          name: dbStaff?.name || 'Unknown',
          company: dbStaff?.company || '',
          department: dbStaff?.department || '',
          position: dbStaff?.position || '',
          photo_url: dbStaff?.photo_url || null,
        };

        if (!reactionUsersMap[messageId][emoji].some((staff) => String(staff.id) === reactionUserId)) {
          reactionUsersMap[messageId][emoji].push({
            ...resolvedReactionUser,
            id: String(resolvedReactionUser.id || reactionUserId),
            name: String(resolvedReactionUser.name && resolvedReactionUser.name !== 'Unknown' && resolvedReactionUser.name !== '알 수 없음'
              ? resolvedReactionUser.name
              : (dbStaff?.name || resolvedReactionUser.name || 'Unknown')),
            company: String(resolvedReactionUser.company || dbStaff?.company || ''),
            department: String(resolvedReactionUser.department || dbStaff?.department || ''),
            position: String(resolvedReactionUser.position || dbStaff?.position || ''),
            photo_url: resolvedReactionUser.photo_url ?? dbStaff?.photo_url ?? null,
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
      console.warn('message reactions query failed:', describeQueryError(error));
    }
  }, [messagesRef, resolveStaffProfile, setReactionUsersByMessage, setReactions]);

  const refreshVisibleMessageBookmarks = useCallback(async () => {
    const messageIds = Array.from(
      new Set(messagesRef.current.map((message: ChatMessage) => String(message.id || '').trim()).filter(Boolean)),
    );
    if (!effectiveTodoUserId || messageIds.length === 0) {
      setBookmarkedIds(new Set(readStoredBookmarks(effectiveTodoUserId)));
      return;
    }

    try {
      const data = await selectMessageBookmarkRows(effectiveTodoUserId, messageIds);

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
  }, [effectiveTodoUserId, messagesRef, setBookmarkedIds]);

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
          staff: message.staff || resolveStaffProfile(message.sender_id, message.sender_name),
        });
      });

      const missingPinnedIds = nextPinnedIds.filter((messageId: string) => !pinnedLookup.has(messageId));
      if (missingPinnedIds.length > 0) {
        const { data: missingPinnedRows, error: missingPinnedRowsError } =
          await selectChatMessagesWithFallback<ChatMessage[]>(
            (selectClause) =>
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
            staff: resolveStaffProfile(message.sender_id, message.sender_name),
          });
        });
      }

      setPersistedPinnedMessages(
        nextPinnedIds
          .map((messageId: string) => pinnedLookup.get(messageId))
          .filter((message: ChatMessage | undefined): message is ChatMessage => Boolean(message)),
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
        .eq('room_id', roomIdForFetch)) as { data: any[] | null; error: unknown };
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
  }, [selectedRoomId, selectedRoomIdRef, setPolls, setPollVotes]);

  const compareMessagesChronologically = useCallback(
    (left: ChatMessage, right: ChatMessage) => {
      const leftTime = toChatDate(left.created_at || 0).getTime();
      const rightTime = toChatDate(right.created_at || 0).getTime();
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
        (selectClause) => {
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

      try {
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

            const dbStaff = reaction.staff_members as Record<string, any> | null;
            const resolvedReactionUser = resolveStaffProfile(reactionUserId) || {
              id: reactionUserId,
              name: dbStaff?.name || 'Unknown',
              company: dbStaff?.company || '',
              department: dbStaff?.department || '',
              position: dbStaff?.position || '',
              photo_url: dbStaff?.photo_url || null,
            };

            if (!reactionUsersMap[messageId][emoji].some((staff) => String(staff.id) === reactionUserId)) {
              reactionUsersMap[messageId][emoji].push({
                ...resolvedReactionUser,
                id: String(resolvedReactionUser.id || reactionUserId),
                name: String(resolvedReactionUser.name && resolvedReactionUser.name !== 'Unknown' && resolvedReactionUser.name !== '알 수 없음'
                  ? resolvedReactionUser.name
                  : (dbStaff?.name || resolvedReactionUser.name || 'Unknown')),
                company: String(resolvedReactionUser.company || dbStaff?.company || ''),
                department: String(resolvedReactionUser.department || dbStaff?.department || ''),
                position: String(resolvedReactionUser.position || dbStaff?.position || ''),
                photo_url: resolvedReactionUser.photo_url ?? dbStaff?.photo_url ?? null,
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
                  staff: message.staff || resolveStaffProfile(message.sender_id, message.sender_name),
                });
              });

              const missingPinnedIds = nextPinnedIds.filter((messageId: string) => !pinnedLookup.has(messageId));
              if (missingPinnedIds.length > 0) {
                const { data: missingPinnedRows, error: missingPinnedRowsError } = await selectChatMessagesWithFallback<ChatMessage[]>(
                  (selectClause) =>
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
                    staff: resolveStaffProfile(message.sender_id, message.sender_name),
                  });
                });
              }

              setPersistedPinnedMessages(
                nextPinnedIds
                  .map((messageId: string) => pinnedLookup.get(messageId))
                  .filter((message: ChatMessage | undefined): message is ChatMessage => Boolean(message)),
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
      } catch (error) {
        console.error('syncVisibleMessageMetadata failed:', error);
      }
    },
    [
      buildRoomSummaryFromMessages,
      applyRoomSummaryToState,
      persistRoomSummary,
      getEffectiveRoomMemberIds,
      effectiveTodoUserId,
      setRoomUnreadCounts,
      setRoomReadCursorMap,
      setReadCounts,
      isMessageReadByCursor,
      setBookmarkedIds,
      resolveStaffProfile,
      compareStaffMembers,
      setReactions,
      setReactionUsersByMessage,
      setPinnedIds,
      selectChatMessagesWithFallback,
      setPersistedPinnedMessages,
      setPolls,
      setPollVotes,
    ],
  );

  const loadMessagesAroundMessage = useCallback(
    async (messageId: string): Promise<MessageJumpLoadResult> => {
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

      setLoadingRoomId?.(roomIdForFetch);
      setTimelineRoomId?.(null);
      loadingOlderMessagesRef.current = false;
      setLoadingOlderMessages(false);
      pendingBottomAlignRoomIdRef.current = null;

      try {
        const { data: targetRows, error: targetError } = await selectChatMessagesWithFallback<ChatMessage[]>(
          (selectClause) =>
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
            (selectClause) =>
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
            setLoadingRoomId?.(fallbackRoomId);
            setTimelineRoomId?.(null);
            pendingBottomAlignRoomIdRef.current = null;
            setRoom(fallbackRoomId);
            return { ok: false, reason: 'room-changed' };
          }

          targetMessage = fallbackMessage;
        }

        if (!targetMessage?.id || !targetMessage.created_at) {
          setLoadingRoomId?.(null);
          setTimelineRoomId?.(roomIdForFetch);
          return { ok: false, reason: 'not-found' };
        }

        if (!selectedRoomRecord) {
          setLoadingRoomId?.(null);
          setTimelineRoomId?.(roomIdForFetch);
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
          (selectClause) =>
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
        setTimelineRoomId?.(roomIdForFetch);
        setLoadingRoomId?.(null);

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
          setLoadingRoomId?.(null);
          setTimelineRoomId?.(roomIdForFetch);
        }
        return { ok: false, reason: 'failed', error };
      }
    },
    [
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
    ],
  );

  const fetchData = useCallback(async () => {
    if (!selectedRoomId) return;

    const roomIdForFetch = String(selectedRoomId);
    const requestSeq = fetchDataRequestSeqRef.current + 1;
    fetchDataRequestSeqRef.current = requestSeq;
    const shouldPreserveBottomAlignment =
      String(pendingBottomAlignRoomIdRef.current || '') === roomIdForFetch;
    if (shouldPreserveBottomAlignment) {
      setLoadingRoomId?.(roomIdForFetch);
      requestBottomAlignmentHold?.(roomIdForFetch, 2400);
    }
    const isCurrentRequest = () =>
      fetchDataRequestSeqRef.current === requestSeq &&
      String(selectedRoomIdRef.current || '') === roomIdForFetch;

    const roomResult = await fetchAllChatRooms({ force: true });
    if (roomResult.error) {
      console.error('채팅방 목록 조회 실패:', roomResult.error);
    }
    if (!isCurrentRequest()) return;

    const repairedRooms = await repairDirectRooms(roomResult.data || []);
    if (!isCurrentRequest()) return;

    const selectedRoomRecord =
      repairedRooms.find((room: ChatRoom) => String(room.id) === roomIdForFetch) || null;
    const roomList = await syncChatRoomsState(repairedRooms);
    if (!isCurrentRequest()) return;

    if (!selectedRoomRecord || !isRoomAccessibleToCurrentUser(selectedRoomRecord)) {
      const fallbackRoomId =
        roomList.find((room: ChatRoom) => String(room.id) === NOTICE_ROOM_ID && isRoomAccessibleToCurrentUser(room))?.id ||
        roomList.find((room: ChatRoom) => isRoomAccessibleToCurrentUser(room))?.id ||
        null;
      if (String(fallbackRoomId || '') !== roomIdForFetch) {
        setRoom(fallbackRoomId ? String(fallbackRoomId) : null);
      } else if (!fallbackRoomId) {
        setRoom(null);
      }
      setLoadingRoomId?.(null);
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

    const { data: msgs, error: messagesError } = await selectChatMessagesWithFallback<ChatMessage[]>(
      (selectClause) =>
        supabase
          .from('messages')
          .select(selectClause)
          .in('room_id', roomIdsToLoad)
          .order('created_at', { ascending: true }) as PromiseLike<{
            data: ChatMessage[] | null;
            error: unknown;
          }>,
    );
    if (messagesError) {
      setLoadingRoomId?.(null);
      console.error('채팅 메시지 조회 실패:', messagesError);
      return;
    }
    if (!isCurrentRequest()) return;

    const loadedMessages = Array.isArray(msgs) ? msgs : [];
    if (msgs) {
      const enrichedMessages = loadedMessages.map((message: ChatMessage) => ({
        ...message,
        staff: message.staff || resolveStaffProfile(message.sender_id, message.sender_name),
      }));
      setMessages((prev) => {
        const localOnly = prev.filter((message: ChatMessage) => {
          const messageId = String(message.id || '');
          return messageId.startsWith('temp-') && deliveryStatesRef.current[messageId]?.status !== 'sent';
        });
        return [...enrichedMessages, ...localOnly].sort(
          (left: ChatMessage, right: ChatMessage) =>
            new Date(left.created_at || 0).getTime() - new Date(right.created_at || 0).getTime(),
        );
      });
    }
    setTimelineRoomId?.(roomIdForFetch);
    setLoadingRoomId?.(null);

    const messageIds = loadedMessages.map((message: ChatMessage) => String(message.id || '')).filter(Boolean);
    const roomMemberIds = getEffectiveRoomMemberIds(selectedRoomRecord);
    const fetchedRoomSummary = buildRoomSummaryFromMessages(roomIdForFetch, loadedMessages);
    applyRoomSummaryToState(roomIdForFetch, fetchedRoomSummary);

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

    const [
      roomReadCursorsResult,
      bookmarksResult,
      pinnedResult,
      reactionsResult,
      pollsResult,
    ] = await Promise.allSettled([
      messageIds.length > 0 && roomMemberIds.length > 0
        ? supabase
            .from('room_read_cursors')
            .select('user_id, last_read_at')
            .in('room_id', roomIdsToLoad)
            .in('user_id', roomMemberIds)
        : Promise.resolve({ data: [], error: null }),
      effectiveTodoUserId && messageIds.length > 0
        ? selectMessageBookmarkRows(effectiveTodoUserId, messageIds).then((data) => ({ data, error: null }))
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('pinned_messages')
        .select('message_id')
        .eq('room_id', roomIdForFetch),
      messageIds.length > 0
        ? selectMessageReactionRows(messageIds).then((data) => ({ data, error: null }))
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('polls')
        .select(POLL_SELECT)
        .eq('room_id', roomIdForFetch) as PromiseLike<{ data: any[] | null; error: unknown }>,
    ]);
    if (!isCurrentRequest()) return;

    if (msgs?.length) {
      const nextRoomReadCursorMap: Record<string, string> = {};
      if (roomMemberIds.length > 0 && roomReadCursorsResult.status === 'fulfilled') {
        const roomReadCursorValue = roomReadCursorsResult.value as {
          data: Record<string, unknown>[] | null;
          error: unknown;
        };
        if (roomReadCursorValue.error) {
          console.error('채팅 읽음 커서 조회 실패:', roomReadCursorValue.error);
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
        console.error('채팅 읽음 커서 조회 실패:', roomReadCursorsResult.reason);
      }
      setRoomReadCursorMap(nextRoomReadCursorMap);

      const counts: Record<string, number> = {};
      loadedMessages.forEach((message: ChatMessage) => {
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
      if (pinnedResult.status === 'rejected') throw pinnedResult.reason;
      const pinnedValue = pinnedResult.value as { data: Record<string, unknown>[] | null; error: unknown };
      if (pinnedValue.error) throw pinnedValue.error;

      const nextPinnedIds = (pinnedValue.data || [])
        .map((item: Record<string, unknown>) => String(item.message_id))
        .slice(-1);
      setPinnedIds(nextPinnedIds);
      writeStoredPinnedIds(roomIdForFetch, nextPinnedIds);

      if (nextPinnedIds.length > 0) {
        const pinnedLookup = new Map<string, ChatMessage>();
        loadedMessages.forEach((message: ChatMessage) => {
          const messageId = String(message.id);
          if (!nextPinnedIds.includes(messageId)) return;
          pinnedLookup.set(messageId, {
            ...message,
            staff: message.staff || resolveStaffProfile(message.sender_id, message.sender_name),
          });
        });

        const missingPinnedIds = nextPinnedIds.filter((messageId) => !pinnedLookup.has(messageId));
        if (missingPinnedIds.length > 0) {
          const { data: pinnedRows, error: pinnedRowsError } = await selectChatMessagesWithFallback<ChatMessage[]>(
            (selectClause) =>
              supabase
                .from('messages')
                .select(selectClause)
                .in('id', missingPinnedIds) as PromiseLike<{
                  data: ChatMessage[] | null;
                  error: unknown;
                }>,
          );
          if (pinnedRowsError) throw pinnedRowsError;
          if (!isCurrentRequest()) return;
          (pinnedRows || []).forEach((message: ChatMessage) => {
            pinnedLookup.set(String(message.id), {
              ...message,
              staff: resolveStaffProfile(message.sender_id, message.sender_name),
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
      console.error('고정 메시지 조회 실패:', error);
      setPinnedIds([]);
      setPersistedPinnedMessages([]);
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

        const dbStaff = reaction.staff_members as Record<string, any> | null;
        const resolvedReactionUser = resolveStaffProfile(reactionUserId) || {
          id: reactionUserId,
          name: dbStaff?.name || '알 수 없음',
          company: dbStaff?.company || '',
          department: dbStaff?.department || '',
          position: dbStaff?.position || '',
          photo_url: dbStaff?.photo_url || null,
        };

        if (!reactionUsersMap[messageId][emoji].some((staff) => String(staff.id) === reactionUserId)) {
          reactionUsersMap[messageId][emoji].push({
            ...resolvedReactionUser,
            id: String(resolvedReactionUser.id || reactionUserId),
            name: String(resolvedReactionUser.name && resolvedReactionUser.name !== '알 수 없음' && resolvedReactionUser.name !== 'Unknown'
              ? resolvedReactionUser.name
              : (dbStaff?.name || resolvedReactionUser.name || '알 수 없음')),
            company: String(resolvedReactionUser.company || dbStaff?.company || ''),
            department: String(resolvedReactionUser.department || dbStaff?.department || ''),
            position: String(resolvedReactionUser.position || dbStaff?.position || ''),
            photo_url: resolvedReactionUser.photo_url ?? dbStaff?.photo_url ?? null,
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
      console.warn('메시지 반응 조회 실패:', describeQueryError(error));
    }

    try {
      if (pollsResult.status === 'rejected') throw pollsResult.reason;
      const pollsValue = pollsResult.value as { data: any[] | null; error: unknown };
      if (pollsValue.error) throw pollsValue.error;

      const dbPolls = pollsValue.data || [];
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
      console.error('투표 조회 실패:', error);
      setPolls([]);
      setPollVotes({});
    }
    if (!isCurrentRequest()) return;

    if (roomIdForFetch) {
      const targetRoomIds = roomIdsToLoad.length > 0 ? roomIdsToLoad : [roomIdForFetch];
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
    }

    if (pendingBottomAlignRoomIdRef.current === roomIdForFetch) {
      if (loadedMessages.length === 0) {
        pendingBottomAlignRoomIdRef.current = null;
      }
    }
  }, [
    applyRoomSummaryToState,
    buildRoomSummaryFromMessages,
    deliveryStatesRef,
    effectiveTodoUserId,
    fetchDataRequestSeqRef,
    getEffectiveRoomMemberIds,
    isRoomAccessibleToCurrentUser,
    pendingBottomAlignRoomIdRef,
    persistRoomSummary,
    requestBottomAlignmentHold,
    repairDirectRooms,
    resolveStaffProfile,
    selectChatMessagesWithFallback,
    selectedRoomId,
    selectedRoomIdRef,
    setBookmarkedIds,
    setChatRooms,
    setLoadingRoomId,
    setMessages,
    setPinnedIds,
    setPersistedPinnedMessages,
    setPolls,
    setPollVotes,
    setReadCounts,
    setReactionUsersByMessage,
    setReactions,
    setRoom,
    setRoomReadCursorMap,
    setRoomUnreadCounts,
    setTimelineRoomId,
    syncChatRoomsState,
  ]);

  return {
    updateUnreadForRooms,
    syncChatRoomsState,
    syncRoomSummaryFromMessages,
    fetchData,
    applyReadCursorFromRealtime,
    refreshReadCursorsForRoom,
    refreshVisibleMessageReactions,
    refreshVisibleMessageBookmarks,
    refreshRoomPinnedMessages,
    refreshRoomPolls,
    loadMessagesAroundMessage,
  };
}
