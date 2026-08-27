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
import { defaultLegacySelectChatMessagesWithFallback, describeQueryError } from './메신저방데이터-utils';
import { shouldApplyRoomSummary } from '@/lib/chat-room-summary';
import { selectMessageBookmarkRows, selectMessageReactionRows } from './메신저방데이터-queries';

/** 최신 페이지 창 바깥에 보존된 과거 구간에서 한 번에 재확인할 최대 건수(모바일과 동일). */
const OLDER_RECHECK_LIMIT = 80;

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
      // 같은 id 가 두 번 들어오는 것을 먼저 걷어낸다.
      //
      // ensureSelfChatRoom(메신저.tsx)이 POST /api/chat-rooms 응답 방을 보정 없이
      // append 하는데, 서버가 reused:true 로 **이미 목록에 있는 방**을 돌려주면
      // 같은 id 가 두 줄이 된다(사이드바에 같은 방 2줄 + React duplicate key 경고).
      // 먼저 온 행이 목록 조회로 받은 완전한 행이므로 그것을 남긴다 — 뒤에 붙은
      // 것은 같은 방이라 버려도 잃는 정보가 없다.
      // id 가 빈 행은 서로 다른 방일 수 있으므로 묶지 않고 그대로 통과시킨다.
      const seenRoomIds = new Set<string>();
      const uniqueRooms = (rooms || []).filter((room: ChatRoom) => {
        const roomId = String(room?.id || '').trim();
        if (!roomId) return true;
        if (seenRoomIds.has(roomId)) return false;
        seenRoomIds.add(roomId);
        return true;
      });
      const mergedRooms = uniqueRooms.map(dbRoom => {
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
      // 서버 필터가 일시적으로 느슨해지거나 다른 계정의 로컬 캐시가 남아 있어도
      // 현재 사용자가 멤버가 아닌 방은 목록 상태·후속 메시지 조회에 넣지 않는다.
      const accessibleRooms = (rooms || []).filter((room: ChatRoom) =>
        isRoomAccessibleToCurrentUser(room),
      );
      const repairedRooms = await repairDirectRooms(accessibleRooms);
      return applyChatRoomsState(repairedRooms);
    },
    [applyChatRoomsState, isRoomAccessibleToCurrentUser, repairDirectRooms],
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

      // 해당 방의 메시지만 엄격하게 필터링 (다른 방 메시지로 교차 오염 방지)
      const summarySourceMessages = sourceMessages.filter(
        (message: ChatMessage) => String(message.room_id || '').trim() === targetRoomId,
      );

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
      if (!summary.last_message && !summary.last_message_at) return;

      setChatRooms((prev) => {
        // conversation 그룹의 모든 방 ID를 함께 업데이트하여
        // 사이드바 대표 방의 preview도 반영한다.
        const convRoomIds = getConversationRoomIdsByRoomId(targetRoomId, prev);
        const targetIds = Array.from(
          new Set([...(convRoomIds.length > 0 ? convRoomIds : [targetRoomId]), targetRoomId].filter(Boolean)),
        );
        if (!prev.some((room: ChatRoom) => targetIds.includes(String(room.id)))) return prev;

        // 요약을 **과거로 되돌리지 않는다.**
        //
        // 이 요약은 "지금 로드된 메시지" 에서 계산한다. 그래서 과거 이력을 더
        // 불러오거나 특정 메시지 주변만 불러온 직후에 부르면, 창에 들어온 것이
        // 옛 메시지뿐이라 방의 마지막 메시지가 며칠 전으로 후퇴한다. 게다가 이
        // 갱신은 대화 그룹의 모든 방에 적용되고 목록을 재정렬하므로, 답글의
        // "원문 보기" 를 한 번 누르면 채팅방 목록 전체가 흔들려 보였다.
        //
        // DB 의 chat_rooms.last_message_at 은 정확하다(운영 대조 확인). 클라이언트
        // 계산이 그보다 오래됐다면 버린다.
        let changed = false;
        const next = prev.map((room: ChatRoom) => {
          if (!targetIds.includes(String(room.id))) return room;
          if (!shouldApplyRoomSummary(room.last_message_at, summary.last_message_at)) {
            return room;
          }
          changed = true;
          return {
            ...room,
            last_message: summary.last_message || room.last_message,
            last_message_preview: summary.last_message_preview || room.last_message_preview,
            last_message_at: summary.last_message_at || room.last_message_at };
        });
        return changed ? sortChatRoomsWithNoticeFirst(next) : prev;
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
            // 커서는 DB 원문 created_at 을 그대로 쓴다.
            //
            // 예전에는 normalizeMessageCursorTime(→toUtcSqlTimestamp)으로 공백형
            // ('YYYY-MM-DD HH:MM:SS')으로 바꿔 넘겼는데, 비교 대상 컬럼은 정규화되지
            // 않은 원문이고 운영 messages.created_at 에는 T형
            // ('...T11:53:25.917617+00:00')이 절반 가까이 섞여 있다. 10번째 문자가
            // 'T'(0x54) > ' '(0x20) 이라 **같은 날짜의 T형 행은 시각과 무관하게 항상
            // 커서보다 크고**, 아래 `.lt` 에서 전부 탈락해 그 날짜가 통째로 건너뛰어졌다.
            // (운영 실측: 21건 이상 방 102개 중 81개에서 2,821건이 스크롤로 도달 불가)
            //
            // ORDER BY 도 원문 컬럼 기준이므로, 원문 커서로 비교해야 "정렬상 이 행 다음"
            // 이라는 keyset 페이지네이션이 성립한다 — 누락도 중복도 생기지 않는다.
            const cursorTime = String(beforeMessage.createdAt || '').trim();
            if (cursorTime) {
              // 복합 or() 타임스탬프 파싱 이슈 회피 — created_at 단독 lt 로 페이지네이션
              query = query.lt('created_at', cursorTime);
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

  /**
   * 보존한 과거 구간의 삭제·수정 여부를 다시 확인한다.
   *
   * fetchData 는 최근 MESSAGE_PAGE_SIZE(20)건만 다시 받아오므로, 그 창 **바깥**에서
   * 삭제(soft delete)되거나 수정된 메시지는 감지되지 않는다. 그대로 두면 위로 스크롤해
   * 과거를 불러온 사람의 화면에 삭제 전 원문(환자명·차트번호 등)이 계속 남고
   * 「삭제된 메시지입니다.」로도 바뀌지 않는다 — 지운 사람은 자기 화면만 보고
   * 끝났다고 믿는다(10차 M02-P1-04, 모바일 M02 의 PC 쪽).
   */
  const recheckPreservedOlderMessages = useCallback(
    async (keptIds: string[], isCurrentRequest: () => boolean) => {
      if (keptIds.length === 0) return;
      try {
        // room_id 를 반드시 함께 뽑아야 한다. messages 의 select 정책은
        // CHAT_ROOM_MEMBER 라 게이트웨이가 응답 행의 r.room_id 로 방 멤버십을
        // 판정하는데(lib/db/auth/policies.ts), 컬럼이 없으면 모든 행의 키가 ''
        // 이라 비관리자에게는 항상 빈 배열이 돌아온다. 그러면 아래 "조회에 안
        // 잡히면 하드 삭제" 분기가 보존 구간을 통째로 지운다.
        // 관리자는 그 필터를 우회하므로 관리자 계정으로는 재현되지 않는다.
        const { data: liveRows, error: liveError } = await db
          .from('messages')
          .select('id, room_id, content, is_deleted')
          .in('id', keptIds);
        if (!isCurrentRequest()) return;
        // "조회 결과 없음"과 "조회 실패"를 구분한다. D1 클라이언트는 실패를 throw 하지
        // 않고 { data: null, error } 로 돌려주므로(lib/d1-compat), error 를 안 보면
        // 429/5xx 한 번에 보존 구간 전체를 하드 삭제로 오판한다. 실패한 tick 에서는
        // 아무것도 제거·수정하지 않고 다음 폴링에서 다시 본다.
        if (liveError || !Array.isArray(liveRows)) return;

        const liveById = new Map(
          liveRows.map(
            (row) => [String((row as { id?: unknown }).id || ''), row] as const,
          ),
        );
        const keptIdSet = new Set(keptIds);
        setMessages((prev: ChatMessage[]) => {
          let changed = false;
          const next: ChatMessage[] = [];
          prev.forEach((message: ChatMessage) => {
            const messageId = String(message.id || '');
            if (!keptIdSet.has(messageId)) {
              next.push(message);
              return;
            }
            const live = liveById.get(messageId) as
              | { content?: unknown; is_deleted?: unknown }
              | undefined;
            // 조회에 안 잡히면 하드 삭제된 것이다.
            if (!live) {
              changed = true;
              return;
            }
            // PC 타임라인은 소프트 삭제된 메시지를 목록에서 빼지 않고
            // is_deleted 로 「삭제된 메시지입니다.」를 그린다(메신저타임라인.tsx:884).
            // 그래서 여기서도 제거하지 않고 서버 값으로 맞춰만 준다.
            const liveDeleted = Boolean(live.is_deleted);
            const deletedChanged = liveDeleted !== Boolean(message.is_deleted);
            const contentChanged =
              live.content !== undefined &&
              String(live.content ?? '') !== String(message.content ?? '');
            if (!deletedChanged && !contentChanged) {
              next.push(message);
              return;
            }
            changed = true;
            next.push({
              ...message,
              ...(contentChanged ? { content: live.content as ChatMessage['content'] } : {}),
              ...(deletedChanged ? { is_deleted: liveDeleted } : {}),
            });
          });
          return changed ? next : prev;
        });
      } catch {
        // 재확인 실패는 조용히 넘긴다 — 다음 폴링에서 다시 본다.
      }
    },
    [setMessages],
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

        // 위 fetchMessagePage(before 구간)와 같은 기준이어야 한다 — 원문 created_at.
        // 정규화(공백형)해서 gt 하면 T형 대상 메시지의 **같은 날짜 이전 T형 행들**이
        // after 구간으로 들어와 DATE_JUMP_CONTEXT_AFTER 정원을 잡아먹고,
        // 정작 뒤쪽 메시지가 잘린다(DLT-05 와 같은 사전순 비교 결함).
        const targetCreatedAt = String(targetMessage.created_at || '').trim();
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
        await syncChatRoomsState(roomResult.data || []);

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

    const roomList = await syncChatRoomsState(roomResult.data || []);
    if (!isCurrentRequest()) return;

    // 동기화 단계에서 멤버십 필터를 통과한 방만 선택·메시지 조회 대상으로 사용한다.
    const selectedRoomRecord =
      roomList.find((room: ChatRoom) => String(room.id) === roomIdForFetch) || null;

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
      ? roomList
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
          ? roomList
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

    // 아래 병합에서 최신 페이지 창 **바깥**이라 그대로 보존될 과거 구간의 id.
    // 이 구간은 다시 조회되지 않으므로 삭제·수정 여부를 따로 재확인해야 한다.
    const latestPageIds = new Set(
      loadedMessages.map((message: ChatMessage) => String(message.id || '')),
    );
    const preservedOlderIds = isRoomSwitch
      ? []
      : messagesRef.current
          .filter((message: ChatMessage) => roomIdsToLoad.includes(String(message.room_id || '')))
          .map((message: ChatMessage) => String(message.id || ''))
          .filter((messageId) => messageId && !messageId.startsWith('temp-') && !latestPageIds.has(messageId))
          .slice(-OLDER_RECHECK_LIMIT);

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

    // 보존 구간 재확인. void = 첫 페인트를 막지 않는다.
    void recheckPreservedOlderMessages(preservedOlderIds, isCurrentRequest);

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
    messagesRef,
    pendingBottomAlignRoomIdRef,
    recheckPreservedOlderMessages,
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
