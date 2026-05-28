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

export type ThreadSummary = {
  rootId: string;
  replyCount: number;
  participantCount: number;
  latestReplyAt: string | null;
  latestActivityAt: string | null;
  latestReplySenderId: string | null;
  rootSenderId: string | null;
  needsAttention: boolean;
};

export type ThreadOverview = ThreadSummary & {
  rootMessage: ChatMessage;
  latestMessage: ChatMessage;
};

function buildChatMessageMap(messages: ChatMessage[]) {
  return new Map(messages.map((message) => [String(message.id), message]));
}

function resolveThreadRootFromMap(message: ChatMessage, messageMap: Map<string, ChatMessage>) {
  let current = message;
  const visitedIds = new Set<string>();

  while (current?.reply_to_id) {
    const currentId = String(current.id || '');
    const parentId = String(current.reply_to_id || '');
    if (!parentId || visitedIds.has(currentId)) break;
    visitedIds.add(currentId);
    const parent = messageMap.get(parentId);
    if (!parent) break;
    current = parent;
  }

  return current;
}

function resolveThreadRootIdFromMap(message: ChatMessage, messageMap: Map<string, ChatMessage>) {
  return String(resolveThreadRootFromMap(message, messageMap)?.id || message.id || '');
}

export function resolveThreadRootMessage(message: ChatMessage | null, messages: ChatMessage[]) {
  if (!message) return null;
  const messageMap = buildChatMessageMap(messages);
  return resolveThreadRootFromMap(message, messageMap);
}

type ThreadGroup = {
  rootId: string;
  rootMessage: ChatMessage;
  messages: ChatMessage[];
  participants: Set<string>;
  latestMessage: ChatMessage;
  latestReplyAt: string | null;
  latestReplySenderId: string | null;
};

function getMessageTimeValue(message: ChatMessage | null | undefined) {
  const timeValue = new Date(message?.created_at || 0).getTime();
  return Number.isFinite(timeValue) ? timeValue : 0;
}

function getDateStringTimeValue(value: string | null | undefined) {
  const timeValue = new Date(value || 0).getTime();
  return Number.isFinite(timeValue) ? timeValue : 0;
}

function buildThreadGroups(messages: ChatMessage[]) {
  const messageMap = buildChatMessageMap(messages);
  const groupedThreads = new Map<string, ThreadGroup>();

  messages.forEach((message) => {
    const resolvedRoot = resolveThreadRootFromMap(message, messageMap);
    const rootId = String(resolvedRoot.id || message.id || '');
    const existingGroup = groupedThreads.get(rootId);

    if (!existingGroup) {
      groupedThreads.set(rootId, {
        rootId,
        rootMessage: resolvedRoot,
        messages: [message],
        participants: new Set(
          String(message.sender_id || '').trim() ? [String(message.sender_id || '').trim()] : [],
        ),
        latestMessage: message,
        latestReplyAt: String(message.id) === rootId ? null : (message.created_at || null),
        latestReplySenderId:
          String(message.id) === rootId ? null : (String(message.sender_id || '').trim() || null),
      });
      return;
    }

    existingGroup.messages.push(message);

    const senderId = String(message.sender_id || '').trim();
    if (senderId) {
      existingGroup.participants.add(senderId);
    }

    if (String(message.id) === rootId) {
      existingGroup.rootMessage = message;
    }

    if (getMessageTimeValue(message) >= getMessageTimeValue(existingGroup.latestMessage)) {
      existingGroup.latestMessage = message;
    }

    if (
      String(message.id) !== rootId &&
      getMessageTimeValue(message) >= getDateStringTimeValue(existingGroup.latestReplyAt)
    ) {
      existingGroup.latestReplyAt = message.created_at || null;
      existingGroup.latestReplySenderId = senderId || null;
    }
  });

  return groupedThreads;
}

export function useThreadSummaries(messages: ChatMessage[], currentUserId?: string | null) {
  return useMemo(() => {
    const messageMap = buildChatMessageMap(messages);
    const groupedThreads = buildThreadGroups(messages);
    const normalizedCurrentUserId = String(currentUserId || '').trim();

    return messages.reduce<Record<string, ThreadSummary>>((acc, message) => {
      const rootId = resolveThreadRootIdFromMap(message, messageMap);
      const thread = groupedThreads.get(rootId);
      if (!thread) return acc;

      const hasRootMessage = thread.messages.some((item) => String(item.id) === rootId);
      const rootSenderId = String(thread.rootMessage.sender_id || '').trim() || null;
      const latestReplySenderId = thread.latestReplySenderId || null;
      const userParticipated = normalizedCurrentUserId
        ? thread.messages.some((item) => String(item.sender_id || '').trim() === normalizedCurrentUserId)
        : false;
      const needsAttention = false;

      acc[String(message.id)] = {
        rootId,
        replyCount: Math.max(0, thread.messages.length - (hasRootMessage ? 1 : 0)),
        participantCount: thread.participants.size,
        latestReplyAt: thread.latestReplyAt,
        latestActivityAt: thread.latestMessage.created_at || thread.rootMessage.created_at || null,
        latestReplySenderId,
        rootSenderId,
        needsAttention,
      };
      return acc;
    }, {});
  }, [currentUserId, messages]);
}

export function useThreadOverviews(messages: ChatMessage[], currentUserId?: string | null) {
  return useMemo(() => {
    const groupedThreads = buildThreadGroups(messages);
    const normalizedCurrentUserId = String(currentUserId || '').trim();

    return Array.from(groupedThreads.values())
      .map((thread): ThreadOverview | null => {
        const replyCount = Math.max(
          0,
          thread.messages.length - (thread.messages.some((message) => String(message.id) === thread.rootId) ? 1 : 0),
        );
        if (replyCount <= 0) return null;

        const rootSenderId = String(thread.rootMessage.sender_id || '').trim() || null;
        const latestReplySenderId = thread.latestReplySenderId || null;
        const userParticipated = normalizedCurrentUserId
          ? thread.messages.some((item) => String(item.sender_id || '').trim() === normalizedCurrentUserId)
          : false;
        const needsAttention = false;

        return {
          rootId: thread.rootId,
          rootMessage: thread.rootMessage,
          latestMessage: thread.latestMessage,
          replyCount,
          participantCount: thread.participants.size,
          latestReplyAt: thread.latestReplyAt,
          latestActivityAt: thread.latestMessage.created_at || thread.rootMessage.created_at || null,
          latestReplySenderId,
          rootSenderId,
          needsAttention,
        };
      })
      .filter((thread): thread is ThreadOverview => Boolean(thread))
      .sort(
        (left, right) =>
          getMessageTimeValue(right.latestMessage) - getMessageTimeValue(left.latestMessage),
      );
  }, [currentUserId, messages]);
}

export function useThreadMessages(threadRoot: ChatMessage | null, messages: ChatMessage[]) {
  return useMemo(() => {
    if (!threadRoot) return [];
    const messageMap = buildChatMessageMap(messages);
    const resolvedRoot = resolveThreadRootFromMap(threadRoot, messageMap);
    const rootId = String(resolvedRoot.id || threadRoot.id || '');
    const threadMessages = messages
      .filter((message: ChatMessage) => resolveThreadRootIdFromMap(message, messageMap) === rootId)
      .sort(
        (left: ChatMessage, right: ChatMessage) =>
          new Date(left.created_at || 0).getTime() - new Date(right.created_at || 0).getTime()
      );

    if (threadMessages.some((message) => String(message.id) === rootId)) {
      return threadMessages;
    }

    return [resolvedRoot, ...threadMessages].sort(
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

    if (previewKind === 'image') {
      // 1순위: 같은 앨범(album_id)의 이미지들로 갤러리 구성
      if (message.album_id) {
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

      // 2순위: 채팅방 내 모든 이미지 메시지를 시간순으로 묶어 좌우 탐색 가능하게
      // (예전 사진 → 최근 사진까지 방향키 / 좌우 버튼으로 이동)
      const allRoomImages = messages.filter(
        (candidate) =>
          !candidate.is_deleted &&
          resolveAttachmentKind(candidate.file_url, candidate.file_kind) === 'image',
      );

      if (allRoomImages.length > 1) {
        const previewItems = allRoomImages
          .map((candidate) =>
            buildAttachmentPreviewItem(
              candidate.file_url,
              candidate.file_name,
              'image',
            ),
          )
          .filter((item): item is AttachmentPreviewItem => Boolean(item));
        const startIndex = Math.max(
          0,
          allRoomImages.findIndex((candidate) => String(candidate.id) === String(message.id)),
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
