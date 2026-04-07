'use client';

import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import { getProfilePhotoUrl } from '@/lib/profile-photo';
import type { ChatMessage, ChatRoom, StaffMember } from '@/types';
import {
  getDeletedMessagePreviewText,
  resolveAttachmentKind,
  sortAlbumMessages,
  type AttachmentPreviewItem,
  type AttachmentPreviewKind,
} from './메신저첨부';
import { isSelfChatRoom, isActiveChatMember } from './메신저유틸';

export type MediaFilter = 'all' | 'media' | 'image' | 'video' | 'file';

type UseChatDerivedPreviewStateParams = {
  noticeMessages: ChatMessage[];
  mediaMessages: ChatMessage[];
  messages: ChatMessage[];
};

export function useChatDerivedPreviewState({
  noticeMessages,
  mediaMessages,
  messages,
}: UseChatDerivedPreviewStateParams) {
  const currentNoticeMessage = useMemo(
    () => noticeMessages[noticeMessages.length - 1] || null,
    [noticeMessages]
  );

  const sharedMediaPreviewMessages = useMemo(
    () =>
      mediaMessages
        .filter((message) => resolveAttachmentKind(message.file_url, message.file_kind) !== 'file'),
    [mediaMessages]
  );

  const sharedFilePreviewMessages = useMemo(
    () =>
      mediaMessages
        .filter((message) => {
          const fileUrl = String(message.file_url || '');
          if (!fileUrl) return false;
          if (message.file_kind === 'file') return true;
          return resolveAttachmentKind(fileUrl, message.file_kind) === 'file';
        }),
    [mediaMessages]
  );

  const sharedLinkPreviewMessages = useMemo(
    () => messages.filter((message) => message.content && message.content.includes('http')),
    [messages]
  );

  return {
    currentNoticeMessage,
    sharedMediaPreviewMessages,
    sharedFilePreviewMessages,
    sharedLinkPreviewMessages,
  };
}

type UseChatSelectedPeerParams = {
  selectedRoom: ChatRoom | null;
  roomMembers: StaffMember[];
  effectiveChatUserId: string;
  resolveStaffProfile: (staffId: string | null | undefined, fallbackName?: string | null) => StaffMember | null;
  isStaffCurrentlyOnline: (staff: StaffMember | null | undefined) => boolean;
};

export function useChatSelectedPeerState({
  selectedRoom,
  roomMembers,
  effectiveChatUserId,
  resolveStaffProfile,
  isStaffCurrentlyOnline,
}: UseChatSelectedPeerParams) {
  const selectedPeer = useMemo(() => {
    if (!selectedRoom || selectedRoom.type !== 'direct') return null;
    if (isSelfChatRoom(selectedRoom, effectiveChatUserId)) {
      return resolveStaffProfile(effectiveChatUserId);
    }
    return roomMembers.find((member) => String(member?.id ?? '') !== effectiveChatUserId) || null;
  }, [selectedRoom, roomMembers, effectiveChatUserId, resolveStaffProfile]);

  const selectedPeerPhotoUrl = useMemo(
    () => (selectedPeer ? getProfilePhotoUrl(selectedPeer as StaffMember) : null),
    [selectedPeer]
  );

  const selectedPeerIsOnline = useMemo(
    () => (selectedPeer ? isStaffCurrentlyOnline(selectedPeer as StaffMember) : false),
    [selectedPeer, isStaffCurrentlyOnline]
  );

  return {
    selectedPeer,
    selectedPeerPhotoUrl,
    selectedPeerIsOnline,
  };
}

type UseChatSelectedRoomLabelParams = {
  selectedRoom: ChatRoom | null;
  allKnownStaffs: StaffMember[];
  effectiveChatUserId: string;
  getRoomDisplayName: (room: ChatRoom | null | undefined, staffs: StaffMember[], currentUserId?: string | null) => string;
};

export function useChatSelectedRoomLabel({
  selectedRoom,
  allKnownStaffs,
  effectiveChatUserId,
  getRoomDisplayName,
}: UseChatSelectedRoomLabelParams) {
  return useMemo(
    () => getRoomDisplayName(selectedRoom, allKnownStaffs, effectiveChatUserId),
    [allKnownStaffs, effectiveChatUserId, getRoomDisplayName, selectedRoom],
  );
}

export function useThreadMessages(threadRoot: ChatMessage | null, messages: ChatMessage[]) {
  return useMemo(() => {
    if (!threadRoot) return [];
    const rootId = threadRoot.id;

    return messages
      .filter((message: ChatMessage) => message.id === rootId || message.reply_to_id === rootId)
      .sort(
        (left: ChatMessage, right: ChatMessage) =>
          new Date(left.created_at || 0).getTime() - new Date(right.created_at || 0).getTime()
      );
  }, [threadRoot, messages]);
}

export function useChatTypingNoticeText(typingUsers: Record<string, string>) {
  return useMemo(() => {
    const names = Object.values(typingUsers).filter(Boolean);
    if (!names.length) return '';
    if (names.length === 1) return `${names[0]}님이 입력 중`;
    return `${names[0]} 외 ${names.length - 1}명이 입력 중`;
  }, [typingUsers]);
}

export function useChatGroupedStaffs(allKnownStaffs: StaffMember[]) {
  return useMemo(() => {
    const grouped: Record<string, Record<string, StaffMember[]>> = {};
    allKnownStaffs.forEach((staff) => {
      if (!isActiveChatMember(staff)) return;
      const company = staff.company || '기타';
      const department = staff.department || '미지정';
      if (!grouped[company]) grouped[company] = {};
      if (!grouped[company][department]) grouped[company][department] = [];
      grouped[company][department].push(staff);
    });
    return grouped;
  }, [allKnownStaffs]);
}

type UseChatMentionCandidatesParams = {
  showMentionList: boolean;
  mentionQuery: string;
  roomMembers: StaffMember[];
  staffs: StaffMember[];
};

export function useChatMentionCandidates({
  showMentionList,
  mentionQuery,
  roomMembers,
  staffs,
}: UseChatMentionCandidatesParams) {
  return useMemo(() => {
    if (!showMentionList) return [];
    const base = Array.isArray(roomMembers) && roomMembers.length > 0 ? roomMembers : staffs;
    const query = mentionQuery.trim();
    if (!query) return base.slice(0, 8);
    return base
      .filter((staff) => (staff.name || '').toLowerCase().includes(query.toLowerCase()))
      .slice(0, 8);
  }, [mentionQuery, roomMembers, showMentionList, staffs]);
}

type UseChatMediaPreviewStateParams = {
  messages: ChatMessage[];
  noticeMessages: ChatMessage[];
  mediaFilter: MediaFilter;
  setMediaFilter: Dispatch<SetStateAction<MediaFilter>>;
  setShowDrawer: Dispatch<SetStateAction<boolean>>;
  setShowMediaPanel: Dispatch<SetStateAction<boolean>>;
  buildAttachmentPreviewItem: (
    url: string | null | undefined,
    fileName?: string | null,
    forcedKind?: AttachmentPreviewKind,
  ) => AttachmentPreviewItem | null;
  openAttachmentPreviewGallery: (items: AttachmentPreviewItem[], startIndex?: number) => void;
  openAttachmentPreview: (
    url: string | null | undefined,
    fileName?: string | null,
    forcedKind?: AttachmentPreviewKind,
  ) => void;
};

export function useChatMediaPreviewState({
  messages,
  noticeMessages,
  mediaFilter,
  setMediaFilter,
  setShowDrawer,
  setShowMediaPanel,
  buildAttachmentPreviewItem,
  openAttachmentPreviewGallery,
  openAttachmentPreview,
}: UseChatMediaPreviewStateParams) {
  const mediaMessages = useMemo(
    () => messages.filter((message) => message.file_url && !message.is_deleted),
    [messages],
  );

  const filteredMediaMessages = useMemo(() => {
    if (mediaFilter === 'all') return mediaMessages;
    if (mediaFilter === 'media') {
      return mediaMessages.filter(
        (message) => resolveAttachmentKind(message.file_url, message.file_kind) !== 'file',
      );
    }
    return mediaMessages.filter((message) => {
      const attachmentKind = resolveAttachmentKind(message.file_url, message.file_kind);
      if (mediaFilter === 'image') return attachmentKind === 'image';
      if (mediaFilter === 'video') return attachmentKind === 'video';
      return attachmentKind === 'file';
    });
  }, [mediaFilter, mediaMessages]);

  const {
    currentNoticeMessage,
    sharedMediaPreviewMessages,
    sharedFilePreviewMessages,
    sharedLinkPreviewMessages,
  } = useChatDerivedPreviewState({
    noticeMessages,
    mediaMessages,
    messages,
  });

  const openMediaArchive = useCallback((nextFilter: MediaFilter) => {
    setMediaFilter(nextFilter);
    setShowDrawer(false);
    setShowMediaPanel(true);
  }, [setMediaFilter, setShowDrawer, setShowMediaPanel]);

  const openAttachmentPreviewForMessage = useCallback((message: ChatMessage) => {
    const attachmentUrl = String(message.file_url || '').trim();
    if (!attachmentUrl) return;

    const previewKind = resolveAttachmentKind(attachmentUrl, message.file_kind);
    if (previewKind === 'image' && message.album_id) {
      const albumMessages = sortAlbumMessages(
        messages.filter(
          (candidate) =>
            !candidate.is_deleted &&
            String(candidate.album_id || '') === String(message.album_id || '') &&
            resolveAttachmentKind(candidate.file_url, candidate.file_kind) === 'image',
        ),
      );

      if (albumMessages.length > 1) {
        const previewItems = albumMessages
          .map((candidate) =>
            buildAttachmentPreviewItem(
              candidate.file_url,
              candidate.file_name,
              resolveAttachmentKind(candidate.file_url, candidate.file_kind),
            ),
          )
          .filter((item): item is AttachmentPreviewItem => Boolean(item));
        const startIndex = Math.max(
          0,
          albumMessages.findIndex((candidate) => String(candidate.id) === String(message.id)),
        );

        if (previewItems.length > 1) {
          openAttachmentPreviewGallery(previewItems, startIndex);
          return;
        }
      }
    }

    openAttachmentPreview(attachmentUrl, message.file_name || null, previewKind);
  }, [
    buildAttachmentPreviewItem,
    messages,
    openAttachmentPreview,
    openAttachmentPreviewGallery,
  ]);

  return {
    mediaMessages,
    filteredMediaMessages,
    currentNoticeMessage,
    sharedMediaPreviewMessages,
    sharedFilePreviewMessages,
    sharedLinkPreviewMessages,
    openMediaArchive,
    openAttachmentPreviewForMessage,
  };
}

type UseChatTimelineItemsParams = {
  messages: ChatMessage[];
  polls: Array<Record<string, unknown>>;
  selectedRoomId: string | null;
  deferredChatSearch: string;
  transientHighlightQuery: string;
};

export function useChatTimelineItems({
  messages,
  polls,
  selectedRoomId,
  deferredChatSearch,
  transientHighlightQuery,
}: UseChatTimelineItemsParams) {
  const visibleTimelineMessages = useMemo(() => {
    if (!deferredChatSearch.trim()) return messages;
    const query = deferredChatSearch.toLowerCase();
    return messages.filter((message) =>
      (message.is_deleted ? getDeletedMessagePreviewText() : (message.content || ''))
        .toLowerCase()
        .includes(query) ||
      ((message.staff as { name?: string } | null | undefined)?.name || '')
        .toLowerCase()
        .includes(query),
    );
  }, [deferredChatSearch, messages]);

  const activeMessageHighlightQuery = deferredChatSearch.trim() || transientHighlightQuery.trim();

  const selectedRoomPollTimelineItems = useMemo(
    () =>
      polls
        .filter((poll) => poll.room_id === selectedRoomId)
        .map((poll) => ({ ...poll, type: 'poll', created_at: poll.created_at || new Date().toISOString() })),
    [polls, selectedRoomId],
  );

  const combinedTimeline = useMemo(() => {
    const messageItems = visibleTimelineMessages.map((message) => ({ ...message, type: 'message' as const }));
    const sorted = [...messageItems, ...selectedRoomPollTimelineItems].sort(
      (left, right) =>
        new Date((left as Record<string, unknown>).created_at as string || 0).getTime() -
        new Date((right as Record<string, unknown>).created_at as string || 0).getTime(),
    );

    const grouped: Array<Record<string, unknown>> = [];
    const albumMap = new Map<string, ChatMessage[]>();
    const albumOrder: string[] = [];

    for (const item of sorted) {
      const message = item as unknown as ChatMessage & { album_id?: string };
      if (
        message.type === 'message' &&
        message.album_id &&
        resolveAttachmentKind(message.file_url, message.file_kind) === 'image' &&
        !message.is_deleted
      ) {
        const albumId = message.album_id;
        if (!albumMap.has(albumId)) {
          albumMap.set(albumId, []);
          albumOrder.push(albumId);
        }
        albumMap.get(albumId)!.push(message);
      } else {
        grouped.push(item as Record<string, unknown>);
      }
    }

    for (const albumId of albumOrder) {
      const albumMessages = sortAlbumMessages(albumMap.get(albumId)!);
      const representative =
        albumMessages.find((message) => Number(message.album_index) === 0) ||
        albumMessages.find((message) => String(message.content || '').trim()) ||
        albumMessages[0];
      grouped.push({
        ...representative,
        type: 'album',
        albumMessages,
      } as Record<string, unknown>);
    }

    return grouped.sort(
      (left, right) =>
        new Date((left as Record<string, unknown>).created_at as string || 0).getTime() -
        new Date((right as Record<string, unknown>).created_at as string || 0).getTime(),
    );
  }, [selectedRoomPollTimelineItems, visibleTimelineMessages]);

  return {
    visibleTimelineMessages,
    activeMessageHighlightQuery,
    selectedRoomPollTimelineItems,
    combinedTimeline,
  };
}
