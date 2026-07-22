'use client';

import { useCallback, useRef, useState } from 'react';
import { db } from '@/lib/db-client';
import { POLL_SELECT } from '@/lib/chat-query-columns';
import type { ChatMessage, ChatRoom } from '@/types';
import { fetchUnreadCountsForRoomIds } from './메신저데이터유틸';
import { fetchAllChatRooms } from './chatQueryService';
import {
  getDeletedMessagePreviewText,
  getMessageDisplayText,
  isChatMessageDeleted,
  sanitizeChatRoomPreview,
} from './메신저첨부';
import {
  compareStaffMembers,
  getConversationRoomIdsByRoomId,
  getConversationRoomIdSet,
  getDirectRoomMembersKey,
  getLatestReadCursor,
  isMessageReadByCursor,
  NOTICE_ROOM_ID,
  normalizeMemberIds,
  readStoredBookmarks,
  sortChatRoomsWithNoticeFirst,
  toChatDate,
  writeStoredBookmarks,
  writeStoredPinnedIds } from './메신저유틸';
import type {
  LoadedMessageCursor,
  MessageJumpLoadResult,
  ReactionUsersByMessage,
  RoomSummary,
  UseChatRoomDataSyncParams } from './메신저방데이터-types';
import {
  CHAT_METADATA_REFRESH_TTL_MS,
  DATE_JUMP_CONTEXT_AFTER,
  DATE_JUMP_CONTEXT_BEFORE,
  MESSAGE_PAGE_SIZE } from './메신저방데이터-types';
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
  setPollVotes }: UseChatRoomDataSyncParams) {
  const implicitUnreadBaselineRef = useRef<Record<string, string | null>>({});

  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const loadingOlderMessagesRef = useRef(false);
  const paginationRoomIdRef = useRef<string | null>(null);
  const loadedPersistedMessageCountRef = useRef(MESSAGE_PAGE_SIZE);
  const roomIdsToLoadRef = useRef<string[]>([]);
  const oldestLoadedMessageRef = useRef<LoadedMessageCursor | null>(null);
  const metadataRefreshCacheRef = useRef<Map<string, number>>(new Map());
  const lastUnreadRefreshRef = useRef<{ key: string; at: number }>({ key: '', at: 0 });

  const updateUnreadForRooms = useCallback(
    async (rooms: ChatRoom[]) => {
      if (!effectiveChatUserId || !rooms?.length) return;

      const activeRoomId = pendingBottomAlignRoomIdRef.current || selectedRoomIdRef.current || '';
      // last_message_at 스냅샷이 같으면 중복 호출을 접는다.
      // 다만 메모리상 last_message_at 이 아직 갱신되지 않은 신규 메시지 이벤트도
      // 배지 갱신이 가능해야 하므로 창은 짧게(3s) 유지한다.
      const refreshKey = rooms
        .map((room) => `${String(room.id || '').trim()}:${String(room.last_message_at || room.created_at || '').trim()}`)
        .join('|') + `|active:${activeRoomId}`;
      const now = Date.now();
      const previousRefresh = lastUnreadRefreshRef.current;
      if (previousRefresh.key === refreshKey && now - previousRefresh.at < 3_000) return;
      lastUnreadRefreshRef.current = { key: refreshKey, at: now };

      try {
        const myRooms = rooms.filter((room: ChatRoom) => {
          if (room.id === NOTICE_ROOM_ID) return true;
          const me = String(effectiveChatUserId || '').trim();
          if (!me) return false;
          return normalizeMemberIds(room.members).some((id) => String(id) === me);
        });
        if (!myRooms.length) return;

        const roomIds = myRooms.map((room: ChatRoom) => room.id);
        const { data: cursors } = await db
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

        const openConversationRoomIds = getConversationRoomIdSet(activeRoomId, myRooms);
        const queryRoomIds = roomIds.filter(
          (roomId) => !openConversationRoomIds.has(roomId) && roomId !== activeRoomId,
        );

        const unreadBatchCounts = await fetchUnreadCountsForRoomIds(db, {
          roomIds: queryRoomIds,
          userId: effectiveChatUserId,
          cursorMap: unreadCursorMap });
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
            if (prev[roomId] === 0 || openConversationRoomIds.has(roomId) || roomId === activeRoomId) {
              next[roomId] = 0;
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
      const prev = chatRoomsRef.current || [];
      const mergedRooms = (rooms || []).map(dbRoom => {
        const localRoom = prev.find((p: ChatRoom) => p.id === dbRoom.id);
        if (localRoom && localRoom.last_message_at && dbRoom.last_message_at) {
          const localTime = toChatDate(localRoom.last_message_at).getTime();
          const dbTime = toChatDate(dbRoom.last_message_at).getTime();
          if (localTime > dbTime) {
            return {
              ...dbRoom,
              last_message: localRoom.last_message,
              last_message_preview: localRoom.last_message_preview,
              last_message_at: localRoom.last_message_at };
          }
        }
        return dbRoom;
      });
      const nextRooms = sortChatRoomsWithNoticeFirst(mergedRooms);
      setChatRooms(nextRooms);
      void updateUnreadForRooms(nextRooms);
      return nextRooms;
    },
    [chatRoomsRef, setChatRooms, updateUnreadForRooms],
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
          last_message_at: null };
      }

      const roomScopedMessages = sourceMessages.filter(
        (message: ChatMessage) => String(message.room_id || '').trim() === targetRoomId,
      );
      const summarySourceMessages = roomScopedMessages.length > 0 ? roomScopedMessages : sourceMessages;

      // 최신 메시지 기준 — 삭제됐으면 목록에 「삭제된 메시지입니다.」
      let latestAny: ChatMessage | undefined;
      let latestAnyTime = Number.NEGATIVE_INFINITY;
      summarySourceMessages.forEach((message: ChatMessage) => {
        const createdAt = toChatDate(message.created_at || 0).getTime();
        if (!Number.isFinite(createdAt)) return;
        if (createdAt >= latestAnyTime) {
          latestAnyTime = createdAt;
          latestAny = message;
        }
      });

      if (!latestAny) {
        return {
          last_message: null,
          last_message_preview: null,
          last_message_at: null };
      }

      if (isChatMessageDeleted(latestAny)) {
        const deleted = getDeletedMessagePreviewText();
        return {
          last_message: deleted,
          last_message_preview: deleted,
          last_message_at: latestAny.created_at || null };
      }

      const previewText =
        sanitizeChatRoomPreview(
          getMessageDisplayText(
            latestAny.content,
            latestAny.file_name,
            latestAny.file_url,
            '',
          ),
        ) || null;
      return {
        last_message: previewText,
        last_message_preview: previewText,
        last_message_at: latestAny.created_at || null };
    },
    [],
  );

  const applyRoomSummaryToState = useCallback(
    (roomId: string | null | undefined, summary: RoomSummary) => {
      const targetRoomId = String(roomId || '').trim();
      if (!targetRoomId) return;

      setChatRooms((prev) => {
        // conversation 그룹의 모든 방 ID를 함께 업데이트하여
        // 사이드바 대표 방의 preview도 반영한다.
        const convRoomIds = getConversationRoomIdsByRoomId(targetRoomId, prev);
        const targetIds = Array.from(
          new Set([...(convRoomIds.length > 0 ? convRoomIds : [targetRoomId]), targetRoomId].filter(Boolean)),
        );
        if (!prev.some((room: ChatRoom) => targetIds.includes(String(room.id)))) return prev;
        return sortChatRoomsWithNoticeFirst(
          prev.map((room: ChatRoom) =>
            targetIds.includes(String(room.id))
              ? {
                  ...room,
                  last_message: summary.last_message,
                  last_message_preview: summary.last_message_preview,
                  last_message_at: summary.last_message_at }
              : room,
          ),
        );
      });
    },
    [setChatRooms],
  );



  const syncRoomSummaryFromMessages = useCallback(
    (roomId: string | null | undefined, sourceMessages: ChatMessage[]) => {
      const summary = buildRoomSummaryFromMessages(roomId, sourceMessages);
      applyRoomSummaryToState(roomId, summary);
      return summary;
    },
    [applyRoomSummaryToState, buildRoomSummaryFromMessages],
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
        roomMemberIds: getEffectiveRoomMemberIds(selectedRoomRecord) };
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
        const { data, error } = await db
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
          photo_url: dbStaff?.photo_url || null };

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
            photo_url: resolvedReactionUser.photo_url ?? dbStaff?.photo_url ?? null });
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
      const pinnedResult = await db
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
          staff: message.staff || resolveStaffProfile(message.sender_id, message.sender_name) });
      });

      const missingPinnedIds = nextPinnedIds.filter((messageId: string) => !pinnedLookup.has(messageId));
      if (missingPinnedIds.length > 0) {
        const { data: missingPinnedRows, error: missingPinnedRowsError } =
          await selectChatMessagesWithFallback<ChatMessage[]>(
            (selectClause) =>
              db
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
            staff: resolveStaffProfile(message.sender_id, message.sender_name) });
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
      const pollsResult = (await db
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

      const { data: votes, error: pollVotesError } = await db
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
        staff: message.staff || resolveStaffProfile(message.sender_id, message.sender_name) })),
    [resolveStaffProfile],
  );

  const fetchMessagePage = useCallback(
    async ({
      roomIdsToLoad,
      pageSize,
      beforeMessage }: {
      roomIdsToLoad: string[];
      pageSize: number;
      beforeMessage?: LoadedMessageCursor | null;
    }) => {
      if (!roomIdsToLoad.length || pageSize <= 0) {
        return { messages: [] as ChatMessage[], hasOlder: false, error: null as unknown };
      }

      const { data, error } = await selectChatMessagesWithFallback<ChatMessage[]>(
        (selectClause) => {
          let query = db
            .from('messages')
            .select(selectClause)
            .in('room_id', roomIdsToLoad);

          if (beforeMessage?.createdAt) {
            // D1 저장 포맷(SQL UTC)으로 비교. ISO 커서는 같은 시각도 누락/공집합 유발.
            const normalizedCursorTime = normalizeMessageCursorTime(beforeMessage.createdAt);
            if (normalizedCursorTime) {
              // 복합 or() 타임스탬프 파싱 이슈 회피 — created_at 단독 lt 로 페이지네이션
              query = query.lt('created_at', normalizedCursorTime);
            }
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
      includeRoomLevelMeta }: {
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
        // Message-level meta (cursors / bookmarks / reactions) in parallel.
        // Room-level pins+polls follow when includeRoomLevelMeta is true.
        // Callers should invoke this with void after setMessages so first paint is not blocked.
        const [roomReadCursorsResult, bookmarksResult, reactionsResult] = await Promise.allSettled([
          messageIds.length > 0 && roomMemberIds.length > 0
            ? db
                .from('room_read_cursors')
                .select('user_id, last_read_at')
                .in('room_id', roomIdsToLoad)
                .in('user_id', roomMemberIds)
            : Promise.resolve({ data: [], error: null }),
          effectiveTodoUserId && messageIds.length > 0
            ? selectMessageBookmarkRows(effectiveTodoUserId, messageIds).then((data) => ({
                data,
                error: null as unknown,
              }))
            : Promise.resolve({ data: [], error: null }),
          messageIds.length > 0
            ? selectMessageReactionRows(messageIds).then((data) => ({
                data,
                error: null as unknown,
              }))
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
              photo_url: dbStaff?.photo_url || null };

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
                photo_url: resolvedReactionUser.photo_url ?? dbStaff?.photo_url ?? null });
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
            const pinnedResult = await db
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
                  staff: message.staff || resolveStaffProfile(message.sender_id, message.sender_name) });
              });

              const missingPinnedIds = nextPinnedIds.filter((messageId: string) => !pinnedLookup.has(messageId));
              if (missingPinnedIds.length > 0) {
                const { data: missingPinnedRows, error: missingPinnedRowsError } = await selectChatMessagesWithFallback<ChatMessage[]>(
                  (selectClause) =>
                    db
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
                    staff: resolveStaffProfile(message.sender_id, message.sender_name) });
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
            const pollsResult = (await db
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
              const { data: votes, error: pollVotesError } = await db
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
      getEffectiveRoomMemberIds,
      effectiveTodoUserId,
      setRoomUnreadCounts,
      setRoomReadCursorMap,
      setReadCounts,
      setBookmarkedIds,
      resolveStaffProfile,
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
            db
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
              db
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
            createdAt: String(targetMessage.created_at) } });
        if (beforeResult.error) throw beforeResult.error;
        if (!isCurrentRequest()) return { ok: false, reason: 'failed' };

        const targetCreatedAt = normalizeMessageCursorTime(targetMessage.created_at);
        const { data: afterRows, error: afterError } = await selectChatMessagesWithFallback<ChatMessage[]>(
          (selectClause) => {
            let afterQuery = db
              .from('messages')
              .select(selectClause)
              .in('room_id', roomIdsToLoad);
            if (targetCreatedAt) {
              afterQuery = afterQuery.gt('created_at', targetCreatedAt);
            }
            return afterQuery
              .order('created_at', { ascending: true })
              .order('id', { ascending: true })
              .limit(DATE_JUMP_CONTEXT_AFTER) as PromiseLike<{
                data: ChatMessage[] | null;
                error: unknown;
              }>;
          },
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
                createdAt: String(visibleMessages[0].created_at || '') }
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
          includeRoomLevelMeta: false });

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
    // 방이 선택되지 않은 상태에서도 채팅방 목록과 읽지 않은 메시지 수는 갱신한다.
    // (모바일 사이드바 뷰, PC 방 미선택 상태)
    if (!selectedRoomId) {
      try {
        const roomResult = await fetchAllChatRooms();
        if (roomResult.error) {
          console.error('채팅방 목록 조회 실패 (no room selected):', roomResult.error);
          return;
        }
        const repairedRooms = await repairDirectRooms(roomResult.data || []);
        await syncChatRoomsState(repairedRooms);

      } catch (error) {
        console.error('채팅방 목록 갱신 실패 (no room selected):', error);
      }
      return;
    }

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

    const roomResult = await fetchAllChatRooms();
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

    if (!selectedRoomRecord) {
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
              toChatDate(right.last_message_at || right.created_at || 0).getTime() -
              toChatDate(left.last_message_at || left.created_at || 0).getTime(),
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

    // 방 오픈: 최근 MESSAGE_PAGE_SIZE(20)건만. 과거는 loadOlderMessages.
    const isRoomSwitch = paginationRoomIdRef.current !== roomIdForFetch;
    const pageResult = await fetchMessagePage({
      roomIdsToLoad,
      pageSize: MESSAGE_PAGE_SIZE,
    });
    if (pageResult.error) {
      setLoadingRoomId?.(null);
      console.error('채팅 메시지 조회 실패:', pageResult.error);
      return;
    }
    if (!isCurrentRequest()) return;

    const loadedMessages = enrichMessages(pageResult.messages);
    paginationRoomIdRef.current = roomIdForFetch;
    roomIdsToLoadRef.current = roomIdsToLoad;
    loadedPersistedMessageCountRef.current = loadedMessages.length;
    oldestLoadedMessageRef.current =
      loadedMessages.length > 0
        ? {
            id: String(loadedMessages[0].id || ''),
            createdAt: String(loadedMessages[0].created_at || ''),
          }
        : null;
    // 방 전환 시에만 hasOlder 리셋. 실시간 갱신(merge) 때는 load-older 로 쌓인 과거 유지.
    if (isRoomSwitch) {
      setHasOlderMessages(pageResult.hasOlder);
    } else if (pageResult.hasOlder) {
      setHasOlderMessages(true);
    }

    setMessages((prev) => {
      const localOnly = prev.filter((message: ChatMessage) => {
        const messageId = String(message.id || '');
        return messageId.startsWith('temp-') && deliveryStatesRef.current[messageId]?.status !== 'sent';
      });
      // 같은 방 실시간 갱신: 이미 load-older 로 쌓인 과거 메시지는 유지하고 최근 페이지만 병합
      if (!isRoomSwitch && prev.length > 0) {
        const byId = new Map<string, ChatMessage>();
        for (const message of prev) {
          const id = String(message.id || '');
          if (!id || id.startsWith('temp-')) continue;
          if (!roomIdsToLoad.includes(String(message.room_id || ''))) continue;
          byId.set(id, message);
        }
        for (const message of loadedMessages) {
          const id = String(message.id || '');
          if (id) byId.set(id, message);
        }
        return [...Array.from(byId.values()), ...localOnly].sort(
          (left: ChatMessage, right: ChatMessage) =>
            toChatDate(left.created_at || 0).getTime() - toChatDate(right.created_at || 0).getTime(),
        );
      }
      return [...loadedMessages, ...localOnly].sort(
        (left: ChatMessage, right: ChatMessage) =>
          toChatDate(left.created_at || 0).getTime() - toChatDate(right.created_at || 0).getTime(),
      );
    });
    setTimelineRoomId?.(roomIdForFetch);
    setLoadingRoomId?.(null);

    // Clear open-room unread badge immediately (do not wait for deferred meta).
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

    // Second pass after messages are in state: read cursors, bookmarks, pins, reactions, polls.
    // void = do not block first paint / loading clear. 메타는 화면에 보이는 최근 페이지만.
    void syncVisibleMessageMetadata({
      roomIdForFetch,
      roomIdsToLoad,
      selectedRoomRecord,
      visibleMessages: loadedMessages,
      isCurrentRequest,
      includeRoomLevelMeta: true,
    });

    if (pendingBottomAlignRoomIdRef.current === roomIdForFetch && loadedMessages.length === 0) {
      pendingBottomAlignRoomIdRef.current = null;
    }
  }, [
    deliveryStatesRef,
    enrichMessages,
    fetchDataRequestSeqRef,
    fetchMessagePage,
    isRoomAccessibleToCurrentUser,
    pendingBottomAlignRoomIdRef,
    requestBottomAlignmentHold,
    repairDirectRooms,
    resolveStaffProfile,
    selectedRoomId,
    selectedRoomIdRef,
    setLoadingRoomId,
    setMessages,
    setRoom,
    setRoomUnreadCounts,
    setTimelineRoomId,
    syncChatRoomsState,
    syncVisibleMessageMetadata,
  ]);

  /** 타임라인 상단 스크롤 시 과거 메시지 추가 페이지 */
  const loadOlderMessages = useCallback(async () => {
    const roomIdForFetch = String(selectedRoomIdRef.current || '').trim();
    if (!roomIdForFetch || loadingOlderMessagesRef.current) return;
    if (paginationRoomIdRef.current !== roomIdForFetch) return;
    if (!hasOlderMessages) return;

    const roomIdsToLoad =
      roomIdsToLoadRef.current.length > 0 ? roomIdsToLoadRef.current : [roomIdForFetch];
    const beforeMessage = oldestLoadedMessageRef.current;
    if (!beforeMessage?.createdAt) {
      setHasOlderMessages(false);
      return;
    }

    loadingOlderMessagesRef.current = true;
    setLoadingOlderMessages(true);
    try {
      const pageResult = await fetchMessagePage({
        roomIdsToLoad,
        pageSize: MESSAGE_PAGE_SIZE,
        beforeMessage,
      });
      if (pageResult.error) {
        // 일시 오류 시 hasOlder 를 끄지 않아 재시도 가능
        console.error('채팅 이전 메시지 조회 실패:', pageResult.error);
        return;
      }
      if (String(selectedRoomIdRef.current || '') !== roomIdForFetch) return;

      const older = enrichMessages(pageResult.messages);
      if (older.length === 0) {
        setHasOlderMessages(false);
        return;
      }
      setHasOlderMessages(pageResult.hasOlder);
      oldestLoadedMessageRef.current = {
        id: String(older[0].id || ''),
        createdAt: String(older[0].created_at || ''),
      };
      loadedPersistedMessageCountRef.current += older.length;

      setMessages((prev) => {
        const byId = new Map<string, ChatMessage>();
        for (const message of older) {
          const id = String(message.id || '');
          if (id) byId.set(id, message);
        }
        for (const message of prev) {
          const id = String(message.id || '');
          if (id && !byId.has(id)) byId.set(id, message);
        }
        return Array.from(byId.values()).sort(
          (left: ChatMessage, right: ChatMessage) =>
            toChatDate(left.created_at || 0).getTime() - toChatDate(right.created_at || 0).getTime(),
        );
      });

      // 새로 로드된 구간 메타만 보강 (방 레벨 pin/poll 은 생략)
      const selectedRoomRecord =
        chatRoomsRef.current.find((room) => String(room.id) === roomIdForFetch) || null;
      if (selectedRoomRecord) {
        void syncVisibleMessageMetadata({
          roomIdForFetch,
          roomIdsToLoad,
          selectedRoomRecord,
          visibleMessages: older,
          isCurrentRequest: () => String(selectedRoomIdRef.current || '') === roomIdForFetch,
          includeRoomLevelMeta: false,
        });
      }
    } finally {
      loadingOlderMessagesRef.current = false;
      setLoadingOlderMessages(false);
    }
  }, [
    chatRoomsRef,
    enrichMessages,
    fetchMessagePage,
    hasOlderMessages,
    selectedRoomIdRef,
    setMessages,
    syncVisibleMessageMetadata,
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
    hasOlderMessages,
    loadingOlderMessages,
    loadOlderMessages,
  };
}
