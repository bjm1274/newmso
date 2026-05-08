'use client';

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { supabase } from '@/lib/supabase';
import { CHAT_ROOM_SELECT, POLL_SELECT } from '@/lib/chat-query-columns';
import type { ChatMessage, ChatRoom, StaffMember } from '@/types';
import { selectChatMessagesWithFallback as defaultSelectChatMessagesWithFallback } from './메신저데이터유틸';
import { getDeletedMessagePreviewText, getMessageDisplayText } from './메신저첨부';
import {
  compareStaffMembers,
  getConversationRoomIdSet,
  getDirectRoomMembersKey,
  getLatestReadCursor,
  isMessageReadByCursor,
  NOTICE_ROOM_ID,
  readStoredBookmarks,
  sortChatRoomsWithNoticeFirst,
  writeStoredBookmarks,
  writeStoredPinnedIds,
} from './메신저유틸';

type ReactionUsersByMessage = Record<string, Record<string, StaffMember[]>>;

type RoomSummary = {
  last_message: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
};

type SelectChatMessagesWithFallback = <TData>(
  execute: (selectClause: string) => PromiseLike<{ data: TData | null; error: unknown }>,
) => Promise<{ data: TData | null; error: unknown }>;

const defaultLegacySelectChatMessagesWithFallback: SelectChatMessagesWithFallback = (execute) =>
  defaultSelectChatMessagesWithFallback(({ selectClause }) => execute(selectClause));

type UseChatRoomDataSyncParams = {
  selectedRoomId: string | null;
  selectedRoomIdRef: MutableRefObject<string | null>;
  chatRoomsRef: MutableRefObject<ChatRoom[]>;
  pendingBottomAlignRoomIdRef: MutableRefObject<string | null>;
  fetchDataRequestSeqRef: MutableRefObject<number>;
  deliveryStatesRef: MutableRefObject<Record<string, { status?: string } | undefined>>;
  effectiveChatUserId: string | null | undefined;
  effectiveTodoUserId: string | null | undefined;
  userId: string | null | undefined;
  requestBottomAlignmentHold?: (roomId: string | null, holdMs?: number) => void;
  setRoom: (roomId: string | null) => void;
  resolveStaffProfile: (staffId: string | null | undefined, fallbackName?: string | null) => StaffMember | null;
  getEffectiveRoomMemberIds: (room: ChatRoom | null | undefined) => string[];
  isRoomAccessibleToCurrentUser: (room: ChatRoom | null | undefined) => boolean;
  repairDirectRooms: (rooms: ChatRoom[]) => Promise<ChatRoom[]>;
  selectChatMessagesWithFallback?: SelectChatMessagesWithFallback;
  setChatRooms: Dispatch<SetStateAction<ChatRoom[]>>;
  setRoomUnreadCounts: Dispatch<SetStateAction<Record<string, number>>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setLoadingRoomId?: Dispatch<SetStateAction<string | null>>;
  setTimelineRoomId?: Dispatch<SetStateAction<string | null>>;
  setRoomReadCursorMap: Dispatch<SetStateAction<Record<string, string>>>;
  setReadCounts: Dispatch<SetStateAction<Record<string, number>>>;
  setBookmarkedIds: Dispatch<SetStateAction<Set<string>>>;
  setPinnedIds: Dispatch<SetStateAction<string[]>>;
  setPersistedPinnedMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setReactions: Dispatch<SetStateAction<Record<string, Record<string, number>>>>;
  setReactionUsersByMessage: Dispatch<SetStateAction<ReactionUsersByMessage>>;
  setPolls: Dispatch<SetStateAction<any[]>>;
  setPollVotes: Dispatch<SetStateAction<Record<string, Record<number, number>>>>;
};

export function useChatRoomDataSync({
  selectedRoomId,
  selectedRoomIdRef,
  chatRoomsRef,
  pendingBottomAlignRoomIdRef,
  fetchDataRequestSeqRef,
  deliveryStatesRef,
  effectiveChatUserId,
  effectiveTodoUserId,
  userId,
  requestBottomAlignmentHold: _requestBottomAlignmentHold,
  setRoom,
  resolveStaffProfile,
  getEffectiveRoomMemberIds,
  isRoomAccessibleToCurrentUser,
  repairDirectRooms,
  selectChatMessagesWithFallback = defaultLegacySelectChatMessagesWithFallback,
  setChatRooms,
  setRoomUnreadCounts,
  setMessages,
  setLoadingRoomId: _setLoadingRoomId,
  setTimelineRoomId: _setTimelineRoomId,
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

        const activeRoomId = pendingBottomAlignRoomIdRef.current || selectedRoomIdRef.current;
        const openConversationRoomIds = getConversationRoomIdSet(activeRoomId, myRooms);
        const queryRoomIds = roomIds.filter(
          (roomId) => !openConversationRoomIds.has(roomId) && roomId !== activeRoomId,
        );

        const chunkSize = 5;
        const queriedEntries: [string, number][] = [];
        for (let index = 0; index < queryRoomIds.length; index += chunkSize) {
          const chunk = queryRoomIds.slice(index, index + chunkSize);
          const chunkResults = await Promise.all(
            chunk.map(async (roomId): Promise<[string, number]> => {
              const lastReadAt = cursorMap[roomId];
              let query = supabase
                .from('messages')
                .select('id', { count: 'exact', head: true })
                .eq('room_id', roomId)
                .neq('sender_id', effectiveChatUserId)
                .eq('is_deleted', false);
              if (lastReadAt) query = query.gt('created_at', lastReadAt);
              const { count } = await query;
              return [roomId, count || 0];
            }),
          );
          queriedEntries.push(...chunkResults);
        }

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

  const fetchData = useCallback(async () => {
    if (!selectedRoomId) return;

    const roomIdForFetch = String(selectedRoomId);
    const requestSeq = fetchDataRequestSeqRef.current + 1;
    fetchDataRequestSeqRef.current = requestSeq;
    const isCurrentRequest = () =>
      fetchDataRequestSeqRef.current === requestSeq &&
      String(selectedRoomIdRef.current || '') === roomIdForFetch;

    const { data: roomRows } = (await supabase.from('chat_rooms').select(CHAT_ROOM_SELECT)) as {
      data: ChatRoom[] | null;
      error: unknown;
    };
    if (!isCurrentRequest()) return;

    const repairedRooms = await repairDirectRooms(roomRows || []);
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
      console.error('채팅 메시지 조회 실패:', messagesError);
      return;
    }
    if (!isCurrentRequest()) return;

    const loadedMessages = Array.isArray(msgs) ? msgs : [];
    if (msgs) {
      const enrichedMessages = loadedMessages.map((message: ChatMessage) => ({
        ...message,
        staff: message.staff || resolveStaffProfile(message.sender_id),
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
        ? supabase
            .from('message_bookmarks')
            .select('message_id')
            .eq('user_id', effectiveTodoUserId)
            .in('message_id', messageIds)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('pinned_messages')
        .select('message_id')
        .eq('room_id', roomIdForFetch),
      messageIds.length > 0
        ? supabase
            .from('message_reactions')
            .select('message_id, emoji, user_id')
            .in('message_id', messageIds)
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
            staff: message.staff || resolveStaffProfile(message.sender_id),
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

        const resolvedReactionUser = resolveStaffProfile(reactionUserId) || {
          id: reactionUserId,
          name: '알 수 없음',
          company: '',
          department: '',
          position: '',
          photo_url: null,
        };

        if (!reactionUsersMap[messageId][emoji].some((staff) => String(staff.id) === reactionUserId)) {
          reactionUsersMap[messageId][emoji].push({
            ...resolvedReactionUser,
            id: String(resolvedReactionUser.id || reactionUserId),
            name: String(resolvedReactionUser.name || '알 수 없음'),
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
      console.error('메시지 반응 조회 실패:', error);
      setReactions({});
      setReactionUsersByMessage({});
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
    repairDirectRooms,
    resolveStaffProfile,
    selectChatMessagesWithFallback,
    selectedRoomId,
    selectedRoomIdRef,
    setBookmarkedIds,
    setChatRooms,
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
    syncChatRoomsState,
  ]);

  return {
    updateUnreadForRooms,
    syncChatRoomsState,
    syncRoomSummaryFromMessages,
    fetchData,
  };
}
