'use client';

import { getProfilePhotoUrl } from '@/lib/profile-photo';
import { useEffect, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { ChatRoom, StaffMember } from '@/types';
import type { MessengerSidebarRoomItem } from './메신저사이드바';
import {
  NOTICE_ROOM_ID,
  arraysMatch,
  getChatRoomParticipantCount,
  getConversationUnreadCountForRoom,
  getDirectRoomMembersKey,
  getPinnedRoomOrderStorageKey,
  getRoomDisplayName,
  getRoomPreviewText,
  isGroupChatRoom,
  isSelfChatRoom,
  normalizeMemberIds,
  sortRoomsForSidebar,
  type RoomPreference,
} from './메신저유틸';

type UseChatSidebarStateParams = {
  chatRooms: ChatRoom[];
  selectedRoomId: string | null;
  selectedRoom: ChatRoom | null;
  setRoom: (roomId: string | null) => void;
  isRoomAccessibleToCurrentUser: (room: ChatRoom | null | undefined) => boolean;
  allKnownStaffs: StaffMember[];
  allKnownStaffMap: Map<string, StaffMember>;
  effectiveChatUserId: string | null | undefined;
  resolveStaffProfile: (staffId: string | null | undefined, fallbackName?: string | null) => StaffMember | null;
  isStaffCurrentlyOnline: (staff: StaffMember | null | undefined) => boolean;
  deferredOmniSearch: string;
  showHiddenRooms: boolean;
  roomPrefs: Record<string, RoomPreference>;
  pinnedRoomOrder: string[];
  setPinnedRoomOrder: Dispatch<SetStateAction<string[]>>;
  roomPrefsUserId: string | null | undefined;
  roomUnreadCounts: Record<string, number>;
};

export function useChatSidebarState({
  chatRooms,
  selectedRoomId,
  selectedRoom,
  setRoom,
  isRoomAccessibleToCurrentUser,
  allKnownStaffs,
  allKnownStaffMap,
  effectiveChatUserId,
  resolveStaffProfile,
  isStaffCurrentlyOnline,
  deferredOmniSearch,
  showHiddenRooms,
  roomPrefs,
  pinnedRoomOrder,
  setPinnedRoomOrder,
  roomPrefsUserId,
  roomUnreadCounts,
}: UseChatSidebarStateParams) {
  const visibleRooms = useMemo(() => {
    const dedupedRooms = new Map<string, ChatRoom>();
    chatRooms.forEach((room) => {
      if (!isRoomAccessibleToCurrentUser(room)) return;
      const roomKey = getDirectRoomMembersKey(room) || `room:${room.id}`;
      const previousRoom = dedupedRooms.get(roomKey);
      const previousTime = new Date(previousRoom?.last_message_at || previousRoom?.created_at || 0).getTime();
      const currentTime = new Date(room?.last_message_at || room?.created_at || 0).getTime();
      if (!previousRoom || currentTime >= previousTime) {
        dedupedRooms.set(roomKey, room);
      }
    });

    if (!dedupedRooms.has(`room:${NOTICE_ROOM_ID}`)) {
      const noticeRoom = chatRooms.find((room) => String(room.id) === NOTICE_ROOM_ID);
      if (noticeRoom && isRoomAccessibleToCurrentUser(noticeRoom)) {
        dedupedRooms.set(`room:${NOTICE_ROOM_ID}`, noticeRoom);
      }
    }

    const accessibleRooms = Array.from(dedupedRooms.values());
    const hasAccessibleConversation = accessibleRooms.some((room) => String(room.id) !== NOTICE_ROOM_ID);
    const hasAnyConversation = chatRooms.some((room) => room?.id && String(room.id) !== NOTICE_ROOM_ID);
    if (hasAccessibleConversation || !hasAnyConversation || chatRooms.length === 0) {
      return accessibleRooms;
    }

    const fallbackRooms = new Map<string, ChatRoom>();
    chatRooms.forEach((room) => {
      if (!room?.id) return;
      const roomKey = getDirectRoomMembersKey(room) || `room:${room.id}`;
      if (!fallbackRooms.has(roomKey)) {
        fallbackRooms.set(roomKey, room);
      }
    });
    return Array.from(fallbackRooms.values());
  }, [chatRooms, isRoomAccessibleToCurrentUser]);

  useEffect(() => {
    if (!selectedRoomId || chatRooms.length === 0) return;
    if (selectedRoom) return;

    const fallbackRoomId =
      visibleRooms.find((room) => String(room.id) === NOTICE_ROOM_ID)?.id ||
      visibleRooms[0]?.id ||
      null;

    if (String(fallbackRoomId || '') !== String(selectedRoomId || '')) {
      setRoom(fallbackRoomId ? String(fallbackRoomId) : null);
    } else if (!fallbackRoomId) {
      setRoom(null);
    }
  }, [chatRooms.length, selectedRoom, selectedRoomId, setRoom, visibleRooms]);

  const roomLabelMap = useMemo(() => {
    const next = new Map<string, string>();
    visibleRooms.forEach((room) => {
      next.set(String(room.id), getRoomDisplayName(room, allKnownStaffs, effectiveChatUserId || ''));
    });
    return next;
  }, [allKnownStaffs, effectiveChatUserId, visibleRooms]);

  const sidebarRooms = useMemo(() => {
    const keyword = deferredOmniSearch.trim().toLowerCase();
    const filtered = visibleRooms.filter((room) => {
      const label = (roomLabelMap.get(String(room.id)) || '').toLowerCase();
      const isHidden = roomPrefs[room.id]?.hidden === true;
      if (isHidden && !showHiddenRooms) return false;
      if (!keyword) return true;
      return label.includes(keyword);
    });
    const shouldShowHiddenFallback =
      !showHiddenRooms &&
      !keyword &&
      visibleRooms.length > 0 &&
      filtered.length === 0;
    return sortRoomsForSidebar(shouldShowHiddenFallback ? visibleRooms : filtered, roomPrefs, pinnedRoomOrder);
  }, [deferredOmniSearch, pinnedRoomOrder, roomLabelMap, roomPrefs, showHiddenRooms, visibleRooms]);

  const effectivePinnedRoomOrder = useMemo(() => {
    const pinnedIds = visibleRooms
      .filter((room) => roomPrefs[room.id]?.pinned)
      .map((room) => String(room.id));
    const preserved = pinnedRoomOrder.filter((roomId) => pinnedIds.includes(String(roomId)));
    const missing = pinnedIds.filter((roomId) => !preserved.includes(roomId));
    return [...preserved, ...missing];
  }, [visibleRooms, roomPrefs, pinnedRoomOrder]);

  useEffect(() => {
    if (arraysMatch(effectivePinnedRoomOrder, pinnedRoomOrder)) return;
    setPinnedRoomOrder(effectivePinnedRoomOrder);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          getPinnedRoomOrderStorageKey(roomPrefsUserId),
          JSON.stringify(effectivePinnedRoomOrder),
        );
      } catch {
        // ignore
      }
    }
  }, [effectivePinnedRoomOrder, pinnedRoomOrder, roomPrefsUserId, setPinnedRoomOrder]);

  const forwardTargetRoomItems = useMemo(
    () =>
      visibleRooms
        .filter((room) => {
          if (String(room.id) === String(selectedRoomId || '')) return false;
          if (roomPrefs[room.id]?.hidden === true) return false;
          return true;
        })
        .map((room) => {
          const isGroupRoom = isGroupChatRoom(room);
          const selfRoom = isSelfChatRoom(room, effectiveChatUserId || '');
          const members = normalizeMemberIds(room.members);
          const peer =
            !isGroupRoom && room.type === 'direct'
              ? selfRoom
                ? resolveStaffProfile(effectiveChatUserId)
                : members
                    .map((memberId) => allKnownStaffMap.get(memberId))
                    .find((staff) => Boolean(staff) && String(staff!.id) !== String(effectiveChatUserId || '')) || null
              : null;

          return {
            room,
            unreadCount: getConversationUnreadCountForRoom(room, roomUnreadCounts, chatRooms),
            displayName: peer?.name || roomLabelMap.get(String(room.id)),
          };
        }),
    [
      chatRooms,
      roomPrefs,
      roomUnreadCounts,
      selectedRoomId,
      visibleRooms,
      roomLabelMap,
      effectiveChatUserId,
      allKnownStaffMap,
      resolveStaffProfile,
    ],
  );

  const sidebarRoomItems = useMemo<MessengerSidebarRoomItem[]>(() => {
    const pinnedOrderIndex = new Map(
      effectivePinnedRoomOrder.map((roomId, index) => [String(roomId), index]),
    );
    const pinnedCount = effectivePinnedRoomOrder.length;

    return sidebarRooms.map((room) => {
      const roomId = String(room.id);
      const members = normalizeMemberIds(room.members);
      const isGroupRoom = isGroupChatRoom(room);
      const selfRoom = isSelfChatRoom(room, effectiveChatUserId || '');
      const peer =
        !isGroupRoom && room.type === 'direct'
          ? selfRoom
            ? resolveStaffProfile(effectiveChatUserId)
            : members
                .map((memberId) => allKnownStaffMap.get(memberId))
                .find((staff) => Boolean(staff) && String(staff!.id) !== String(effectiveChatUserId || '')) || null
          : null;

      return {
        room,
        roomId,
        unread: getConversationUnreadCountForRoom(room, roomUnreadCounts, chatRooms),
        isSelected: String(selectedRoomId || '') === roomId,
        isNoticeChannel: String(room.id) === NOTICE_ROOM_ID,
        isGroupRoom,
        participantCount: getChatRoomParticipantCount(room),
        label: roomLabelMap.get(roomId) || '',
        preview: getRoomPreviewText(room),
        peerName: peer?.name || '',
        peerPhotoUrl: peer ? getProfilePhotoUrl(peer) : null,
        isPeerOnline: peer ? isStaffCurrentlyOnline(peer) : false,
        isPinned: roomPrefs[room.id]?.pinned === true,
        isHidden: roomPrefs[room.id]?.hidden === true,
        pinnedIndex: pinnedOrderIndex.get(roomId) ?? -1,
        pinnedCount,
      };
    });
  }, [
    allKnownStaffMap,
    chatRooms,
    effectiveChatUserId,
    effectivePinnedRoomOrder,
    isStaffCurrentlyOnline,
    resolveStaffProfile,
    roomLabelMap,
    roomPrefs,
    roomUnreadCounts,
    selectedRoomId,
    sidebarRooms,
  ]);

  const visibleRoomIds = useMemo(
    () => visibleRooms.map((room) => room.id),
    [visibleRooms],
  );

  return {
    visibleRooms,
    roomLabelMap,
    sidebarRoomItems,
    visibleRoomIds,
    forwardTargetRoomItems,
  };
}
