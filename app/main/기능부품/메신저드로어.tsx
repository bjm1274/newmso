'use client';

import { useEffect, useMemo, useState, memo } from 'react';

import { toast } from '@/lib/toast';
import type { ChatMessage, ChatRoom, StaffMember } from '@/types';
import type { ThreadOverview } from './메신저파생훅';
import type { RoomNotificationMode } from './메신저유틸';
import {
  AttachmentListCard,
  AttachmentQuickActions,
  extractFirstLinkUrl,
  getAttachmentDisplayName,
  getMessageDisplayText,
  resolveAttachmentKind,
} from './메신저첨부';
import { buildMessengerImageAlt, MessengerAvatar } from './메신저공통';
import { getProfilePhotoUrl } from '@/lib/profile-photo';
import { isSelfChatRoom, NOTICE_ROOM_ID } from './메신저유틸';

type DrawerSectionKey = 'media' | 'files' | 'links' | 'bookmarks';

type MessengerDrawerProps = {
  isOpen: boolean;
  roomNotifyOn: boolean;
  currentNoticeMessage: ChatMessage | null;
  noticeReadCount: number;
  noticeUnreadCount: number;
  noticeRecipientCount: number;
  noticeReminderBusy: boolean;
  threadOverviews: ThreadOverview[];
  followedThreadIds?: Set<string>;
  roomNotificationMode: RoomNotificationMode;
  roomNotificationKeyword: string;
  sharedMediaPreviewMessages: ChatMessage[];
  sharedFilePreviewMessages: ChatMessage[];
  sharedLinkPreviewMessages: ChatMessage[];
  bookmarkedMessages: ChatMessage[];
  roomMembers: StaffMember[];
  selectedRoom: ChatRoom | null;
  currentUserId: string | null | undefined;
  editingRoomName: boolean;
  roomNameDraft: string;
  resolveRoomMemberProfile: (room: ChatRoom, memberId: string) => StaffMember | null;
  onClose: () => void;
  onToggleRoomNotify: () => void | Promise<void>;
  onSelectRoomNotificationMode: (mode: RoomNotificationMode) => void;
  onRoomNotificationKeywordChange: (value: string) => void;
  onOpenPollModal: () => void;
  onOpenOpsCenter?: (() => void) | null;
  onOpenMediaArchive: (filter: 'media' | 'file') => void;
  onPreviewMessage: (message: ChatMessage) => void;
  onReplyMessage: (message: ChatMessage) => void;
  onOpenThread: (message: ChatMessage) => void;
  onToggleThreadFollow?: (message: ChatMessage) => void;
  onScrollToMessage: (messageId: string) => void;
  onJumpToNoticeMessage: () => void;
  onOpenNoticeReadStatus: () => void;
  onSendNoticeReminder: () => void | Promise<void>;
  onOpenAddMemberModal: () => void;
  onRemoveRoomMember: (memberId: string) => void | Promise<void>;
  onRoomNameDraftChange: (value: string) => void;
  onSaveRoomName: () => void | Promise<void>;
  onCancelEditingRoomName: () => void;
  onStartEditingRoomName: () => void;
  onLeaveRoom: () => void;
};

const COLLAPSED_LIMITS: Record<DrawerSectionKey, number> = {
  media: 3,
  files: 3,
  links: 2,
  bookmarks: 3,
};

const DEFAULT_EXPANDED_SECTIONS: Record<DrawerSectionKey, boolean> = {
  media: false,
  files: false,
  links: false,
  bookmarks: false,
};

function sortMessagesByRecent(messages: ChatMessage[] | null | undefined) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  return [...safeMessages].sort(
    (left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime(),
  );
}

function getVisibleMessages(messages: ChatMessage[] | null | undefined, expanded: boolean, limit: number) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  return expanded ? safeMessages : safeMessages.slice(0, limit);
}

function formatMessageMeta(message: ChatMessage) {
  const senderName = (message.staff as { name?: string } | null | undefined)?.name || '이름 없음';
  const createdAt = new Date(message.created_at || 0);
  const dateLabel = Number.isNaN(createdAt.getTime())
    ? '-'
    : createdAt.toLocaleDateString('ko-KR');
  return `${senderName} · ${dateLabel}`;
}

function DrawerSectionHeader({
  title,
  count,
  expanded,
  canExpand,
  onToggle,
  archiveTestId,
  onArchive,
}: {
  title: string;
  count: number;
  expanded: boolean;
  canExpand: boolean;
  onToggle: () => void;
  archiveTestId?: string;
  onArchive?: (() => void) | null;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <p className="lbl truncate">{title}</p>
        <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-bold text-[var(--toss-gray-3)]">
          {count}
        </span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {onArchive ? (
          <button
            type="button"
            data-testid={archiveTestId}
            onClick={onArchive}
            className="inline-flex items-center rounded-full border border-[var(--border)] px-2.5 py-1 text-[10px] font-bold text-[var(--toss-gray-4)] transition-colors hover:bg-[var(--tab-bg)]"
          >
            보관함
          </button>
        ) : null}
        {canExpand ? (
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex items-center rounded-full bg-[var(--accent)]/10 px-2.5 py-1 text-[10px] font-bold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/15"
          >
            {expanded ? '접기' : '전체보기'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function MessengerDrawerImpl({
  isOpen,
  roomNotifyOn,
  currentNoticeMessage,
  noticeReadCount,
  noticeUnreadCount,
  noticeRecipientCount,
  noticeReminderBusy,
  threadOverviews,
  followedThreadIds = new Set<string>(),
  roomNotificationMode,
  roomNotificationKeyword,
  sharedMediaPreviewMessages,
  sharedFilePreviewMessages,
  sharedLinkPreviewMessages,
  bookmarkedMessages,
  roomMembers,
  selectedRoom,
  currentUserId,
  editingRoomName,
  roomNameDraft,
  resolveRoomMemberProfile,
  onClose,
  onToggleRoomNotify,
  onSelectRoomNotificationMode,
  onRoomNotificationKeywordChange,
  onOpenPollModal,
  onOpenOpsCenter,
  onOpenMediaArchive,
  onPreviewMessage,
  onReplyMessage,
  onOpenThread,
  onToggleThreadFollow = () => {},
  onScrollToMessage,
  onJumpToNoticeMessage,
  onOpenNoticeReadStatus,
  onSendNoticeReminder,
  onOpenAddMemberModal,
  onRemoveRoomMember,
  onRoomNameDraftChange,
  onSaveRoomName,
  onCancelEditingRoomName,
  onStartEditingRoomName,
  onLeaveRoom,
}: MessengerDrawerProps) {
  const [expandedSections, setExpandedSections] = useState(DEFAULT_EXPANDED_SECTIONS);

  useEffect(() => {
    setExpandedSections(DEFAULT_EXPANDED_SECTIONS);
  }, [isOpen, selectedRoom?.id]);

  const sortedMediaMessages = useMemo(
    () => sortMessagesByRecent(sharedMediaPreviewMessages),
    [sharedMediaPreviewMessages],
  );
  const sortedFileMessages = useMemo(
    () => sortMessagesByRecent(sharedFilePreviewMessages),
    [sharedFilePreviewMessages],
  );
  const sortedLinkMessages = useMemo(
    () => sortMessagesByRecent(sharedLinkPreviewMessages),
    [sharedLinkPreviewMessages],
  );
  const sortedBookmarkedMessages = useMemo(
    () => sortMessagesByRecent(bookmarkedMessages),
    [bookmarkedMessages],
  );

  const visibleMediaMessages = useMemo(
    () => getVisibleMessages(sortedMediaMessages, expandedSections.media, COLLAPSED_LIMITS.media),
    [expandedSections.media, sortedMediaMessages],
  );
  const visibleFileMessages = useMemo(
    () => getVisibleMessages(sortedFileMessages, expandedSections.files, COLLAPSED_LIMITS.files),
    [expandedSections.files, sortedFileMessages],
  );
  const visibleLinkMessages = useMemo(
    () => getVisibleMessages(sortedLinkMessages, expandedSections.links, COLLAPSED_LIMITS.links),
    [expandedSections.links, sortedLinkMessages],
  );
  const visibleBookmarkedMessages = useMemo(
    () => getVisibleMessages(sortedBookmarkedMessages, expandedSections.bookmarks, COLLAPSED_LIMITS.bookmarks),
    [expandedSections.bookmarks, sortedBookmarkedMessages],
  );

  if (!isOpen) return null;

  const ownerId = String(currentUserId || '');
  const isOwner = selectedRoom?.id !== NOTICE_ROOM_ID && String(selectedRoom?.created_by || '') === ownerId;
  const canLeaveRoom =
    Boolean(selectedRoom) &&
    selectedRoom?.id !== NOTICE_ROOM_ID &&
    !isSelfChatRoom(selectedRoom, ownerId);
  const canEditRoomName =
    Boolean(selectedRoom) &&
    selectedRoom?.id !== NOTICE_ROOM_ID &&
    (selectedRoom?.type !== 'direct' || (Array.isArray(selectedRoom?.members) && selectedRoom.members.length > 2));

  const toggleSection = (section: DrawerSectionKey) => {
    setExpandedSections((current) => ({ ...current, [section]: !current[section] }));
  };

  const hasNoticeMessage = Boolean(currentNoticeMessage?.id);
  const recentThreadOverviews = threadOverviews.slice(0, 4);

  return (
    <>
      <div className="absolute inset-0 z-50 animate-in fade-in duration-200 bg-black/10" onClick={onClose} aria-hidden="true" />
      <div
        data-testid="chat-room-drawer"
        className="chat-drawer absolute top-0 right-0 bottom-0 z-[60] flex w-full shrink-0 border-l border-[var(--border)] animate-in slide-in-from-right duration-300 md:w-[260px]"
      >
        <div className="chat-drawer-head">
          <span>채팅방 정보</span>
          <button
            type="button"
            onClick={onClose}
            className="x"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="chat-drawer-body custom-scrollbar">
          {/* 참여자 (라이브 정답 1순위 — 맨 위) */}
          <div className="chat-drawer-sec">
            <div className="flex items-center justify-between">
              <p className="lbl">
                참여자 ({roomMembers.length || 0})
              </p>
              {selectedRoom?.id !== NOTICE_ROOM_ID ? (
                <button
                  type="button"
                  data-testid="chat-open-add-member-modal"
                  onClick={onOpenAddMemberModal}
                  className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-3)] transition-colors hover:text-[var(--success)]"
                  aria-label="멤버 추가"
                >
                  +
                </button>
              ) : null}
            </div>
            <div className="chat-mem-grid">
              {roomMembers.map((member, index) => {
                const memberId = String(member.id);
                const resolvedMember =
                  selectedRoom?.id === NOTICE_ROOM_ID || !selectedRoom
                    ? member
                    : resolveRoomMemberProfile(selectedRoom, memberId) || member;
                const tones = ['pink', 'violet', 'blue', 'green', 'gray'] as const;
                const tone = tones[index % tones.length];
                const initial = String(resolvedMember?.name || '?').charAt(0);
                const photoUrl = getProfilePhotoUrl(resolvedMember);

                return (
                  <div
                    data-testid={`chat-room-member-${memberId}`}
                    key={memberId}
                    className="group relative"
                    title={resolvedMember?.name || '이름 없음'}
                  >
                    <div className={`chat-mem tone-${tone}`}>
                      {photoUrl ? (
                        <img
                          src={photoUrl}
                          alt=""
                          className="h-full w-full rounded-[inherit] object-cover"
                        />
                      ) : (
                        initial
                      )}
                    </div>
                    {isOwner && memberId !== ownerId ? (
                      <button
                        type="button"
                        data-testid={`chat-remove-member-${memberId}`}
                        onClick={() => {
                          void onRemoveRoomMember(memberId);
                        }}
                        aria-label={`${resolvedMember?.name || '멤버'} 내보내기`}
                        className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 알림 설정 */}
          <div className="chat-drawer-sec">
            <div className="chat-drawer-row">
              <span className="text-[12px] font-bold text-[var(--foreground)]">알림 설정</span>
              <button
                type="button"
                onClick={() => void onToggleRoomNotify()}
                className={`relative h-6 w-12 rounded-full transition-colors ${roomNotifyOn ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                aria-label={roomNotifyOn ? '알림 끄기' : '알림 켜기'}
              >
                <div className={`absolute top-1 h-4 w-4 rounded-full bg-[var(--card)] transition-all ${roomNotifyOn ? 'right-1' : 'left-1'}`} />
              </button>
            </div>
            {roomNotifyOn && (
              <>
                <div className="chat-drawer-row">
                  <span>알림 모드</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    roomNotificationMode === 'all'
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                      : roomNotificationMode === 'mention_only'
                        ? 'bg-[var(--warning-soft)] text-[var(--warning)]'
                        : roomNotificationMode === 'keyword'
                          ? 'bg-[var(--success-soft)] text-[var(--success)]'
                          : 'bg-[var(--muted)] text-[var(--toss-gray-3)]'
                  }`}>
                    {roomNotificationMode === 'all'
                      ? '모든 메시지'
                      : roomNotificationMode === 'mention_only'
                        ? '멘션만'
                        : roomNotificationMode === 'keyword'
                          ? '키워드'
                          : '조용히'}
                  </span>
                </div>
                {roomNotificationMode === 'keyword' && (
                  <div className="chat-drawer-row">
                    <span>키워드 필터</span>
                    {roomNotificationKeyword ? (
                      <span className="rounded-[var(--radius-md)] bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">
                        {roomNotificationKeyword.split(',').filter(Boolean).length}개
                      </span>
                    ) : (
                      <span className="text-[10px] text-[var(--toss-gray-3)]">없음</span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <button
            type="button"
            data-testid="chat-open-poll-modal"
            onClick={onOpenPollModal}
            className="group flex w-full items-center justify-between rounded-2xl border border-blue-100 bg-blue-500/10 p-3.5 transition-colors hover:bg-blue-500/20 dark:border-blue-800/50 dark:bg-blue-900/20 dark:hover:bg-blue-900/40"
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">투표</span>
              <span className="text-xs font-bold text-blue-700 dark:text-blue-300">새 투표 만들기</span>
            </div>
            <span className="text-[10px] font-bold text-blue-400 transition-transform group-hover:translate-x-1">열기</span>
          </button>

          <div className="chat-drawer-sec">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px]" aria-hidden="true">📌</span>
              <p className="lbl">상단 공지</p>
            </div>
            <div
              data-testid="chat-drawer-notice"
              className={hasNoticeMessage
                ? 'chat-pin'
                : 'rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-3 text-center'}
            >
              {hasNoticeMessage ? (
                <div className="space-y-2">
                  <p className="line-clamp-3 whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--foreground)]">
                    {getMessageDisplayText(
                      currentNoticeMessage?.content,
                      currentNoticeMessage?.file_name,
                      currentNoticeMessage?.file_url,
                      '',
                    )}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={onJumpToNoticeMessage}
                      className="rounded-[var(--radius-md)] bg-[var(--accent)]/10 px-2.5 py-1 text-[10px] font-bold text-[var(--accent)] hover:bg-[var(--accent)]/15"
                    >
                      메시지로 이동
                    </button>
                    <button
                      type="button"
                      data-testid="chat-notice-read-status"
                      onClick={onOpenNoticeReadStatus}
                      className="rounded-[var(--radius-md)] bg-[var(--muted)] px-2.5 py-1 text-[10px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--tab-bg)]"
                    >
                      읽음 {noticeReadCount}/{noticeRecipientCount}
                    </button>
                    {noticeUnreadCount > 0 ? (
                      <button
                        type="button"
                        data-testid="chat-notice-send-reminder"
                        onClick={() => void onSendNoticeReminder()}
                        disabled={noticeReminderBusy}
                        className="rounded-[var(--radius-md)] bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-700 hover:bg-amber-500/15 disabled:opacity-50"
                      >
                        {noticeReminderBusy ? '발송 중…' : `미확인 ${noticeUnreadCount}명 리마인드`}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">등록된 공지가 없습니다.</p>
              )}
            </div>
          </div>

          <div className="chat-drawer-sec">
            <div className="flex items-center justify-between">
              <p className="lbl">최근 스레드</p>
              <span className="rounded-full bg-[var(--tab-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--toss-gray-4)]">
                {threadOverviews.length}
              </span>
            </div>
            <div className="space-y-2">
              {recentThreadOverviews.map((thread) => {
                const rootPreview = getMessageDisplayText(
                  thread.rootMessage.content,
                  thread.rootMessage.file_name,
                  thread.rootMessage.file_url,
                  '내용 없음',
                );
                const latestPreview = getMessageDisplayText(
                  thread.latestMessage.content,
                  thread.latestMessage.file_name,
                  thread.latestMessage.file_url,
                  '답글 없음',
                );
                const latestStaff =
                  (thread.latestMessage.staff as { name?: string } | null | undefined)?.name ||
                  (selectedRoom && thread.latestReplySenderId
                    ? resolveRoomMemberProfile(selectedRoom, thread.latestReplySenderId)?.name
                    : '') ||
                  '알 수 없음';
                const latestAtLabel = thread.latestActivityAt
                  ? new Date(thread.latestActivityAt).toLocaleString('ko-KR', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '-';

                return (
                  <div
                    key={thread.rootId}
                    data-testid={`chat-drawer-thread-${thread.rootId}`}
                    className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-xs font-bold leading-5 text-[var(--foreground)]">{rootPreview}</p>
                        <p className="mt-1 line-clamp-2 text-[10px] font-medium text-[var(--toss-gray-4)]">
                          최근 답글 · {latestStaff} · {latestPreview}
                        </p>
                        <p className="mt-1 truncate text-[10px] font-medium text-[var(--toss-gray-3)]">
                          최근 활동 {latestAtLabel}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="rounded-full bg-[var(--toss-blue-light)] px-2 py-1 text-[9px] font-bold text-[var(--accent)]">
                          답글 {thread.replyCount}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-bold">
                      <button
                        type="button"
                        data-testid={`chat-drawer-thread-open-${thread.rootId}`}
                        onClick={() => onOpenThread(thread.rootMessage)}
                        className="rounded-full bg-[var(--accent)]/10 px-2.5 py-1 text-[var(--accent)] hover:bg-[var(--accent)]/15"
                      >
                        스레드 열기
                      </button>
                      <button
                        type="button"
                        data-testid={`chat-drawer-thread-follow-${thread.rootId}`}
                        onClick={() => onToggleThreadFollow(thread.rootMessage)}
                        className={`rounded-full px-2.5 py-1 ${
                          followedThreadIds.has(thread.rootId)
                            ? 'bg-amber-500/10 text-amber-700'
                            : 'bg-[var(--muted)] text-[var(--toss-gray-4)] hover:bg-[var(--tab-bg)]'
                        }`}
                      >
                        {followedThreadIds.has(thread.rootId) ? '알림 켜짐' : '알림 켜기'}
                      </button>
                      <button
                        type="button"
                        data-testid={`chat-drawer-thread-jump-${thread.rootId}`}
                        onClick={() => {
                          onClose();
                          onScrollToMessage(thread.rootId);
                        }}
                        className="rounded-full bg-[var(--muted)] px-2.5 py-1 text-[var(--toss-gray-4)] hover:bg-[var(--tab-bg)]"
                      >
                        메시지로 이동
                      </button>
                    </div>
                  </div>
                );
              })}
              {recentThreadOverviews.length === 0 ? (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--tab-bg)] py-4 text-center dark:border-zinc-800 dark:bg-zinc-800/30">
                  <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">최근 스레드가 없습니다.</p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="chat-drawer-sec">
            <DrawerSectionHeader
              title="사진 및 동영상"
              count={sortedMediaMessages.length}
              expanded={expandedSections.media}
              canExpand={sortedMediaMessages.length > COLLAPSED_LIMITS.media}
              onToggle={() => toggleSection('media')}
              archiveTestId="chat-open-media-archive-media"
              onArchive={sortedMediaMessages.length > 0 ? () => onOpenMediaArchive('media') : null}
            />
            <div className="chat-media-grid">
              {visibleMediaMessages.map((message) => (
                <div
                  key={message.id}
                  className="chat-media group relative cursor-pointer overflow-hidden bg-[var(--muted)]"
                  onClick={() => onPreviewMessage(message)}
                >
                  {resolveAttachmentKind(message.file_url, message.file_kind) === 'image' ? (
                    <img
                      src={message.file_url || ''}
                      alt={buildMessengerImageAlt(message.file_name, '공유 이미지')}
                      className="h-full w-full object-cover transition-opacity hover:opacity-90"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xl">영상</div>
                  )}
                  {message.file_url ? (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/40 px-2 opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                      <AttachmentQuickActions
                        url={message.file_url}
                        name={getAttachmentDisplayName(message.file_name, message.file_url)}
                        onPreview={() => onPreviewMessage(message)}
                        onReply={() => onReplyMessage(message)}
                        variant="overlay"
                      />
                    </div>
                  ) : null}
                </div>
              ))}
              {visibleMediaMessages.length === 0 ? (
                <div className="col-span-3 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--tab-bg)] py-5 text-center dark:border-zinc-700 dark:bg-zinc-800/30">
                  <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">공유된 미디어가 없습니다.</p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-3">
            <DrawerSectionHeader
              title="파일"
              count={sortedFileMessages.length}
              expanded={expandedSections.files}
              canExpand={sortedFileMessages.length > COLLAPSED_LIMITS.files}
              onToggle={() => toggleSection('files')}
              archiveTestId="chat-open-media-archive-file"
              onArchive={sortedFileMessages.length > 0 ? () => onOpenMediaArchive('file') : null}
            />
            <div className="space-y-2">
              {visibleFileMessages.map((message) => {
                const fileUrl = String(message.file_url || '');
                const attachmentName = getAttachmentDisplayName(message.file_name, fileUrl);
                return (
                  <AttachmentListCard
                    key={message.id}
                    url={fileUrl}
                    name={attachmentName}
                    kind="file"
                    meta={formatMessageMeta(message)}
                    onPreview={() => onPreviewMessage(message)}
                    onReply={() => onReplyMessage(message)}
                    replyTestId={`chat-file-reply-${message.id}`}
                    actionVariant="subtle"
                  />
                );
              })}
              {visibleFileMessages.length === 0 ? (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--tab-bg)] py-4 text-center dark:border-zinc-800 dark:bg-zinc-800/30">
                  <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">공유된 파일이 없습니다.</p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-3">
            <DrawerSectionHeader
              title="링크"
              count={sortedLinkMessages.length}
              expanded={expandedSections.links}
              canExpand={sortedLinkMessages.length > COLLAPSED_LIMITS.links}
              onToggle={() => toggleSection('links')}
            />
            <div className="space-y-2">
              {visibleLinkMessages.map((message) => {
                const url = extractFirstLinkUrl(message.content);
                return (
                  <div
                    key={message.id}
                    data-testid={`chat-shared-link-${message.id}`}
                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--tab-bg)] p-3 dark:border-zinc-800 dark:bg-zinc-800/50"
                  >
                    <a href={url} target="_blank" rel="noreferrer" className="block transition-opacity hover:opacity-90">
                      <p className="mb-0.5 truncate text-[11px] font-bold text-emerald-600">{url}</p>
                      <p className="truncate text-[10px] text-[var(--toss-gray-4)]">{formatMessageMeta(message)}</p>
                    </a>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-bold">
                      <a href={url} target="_blank" rel="noreferrer" className="text-emerald-600 hover:text-emerald-700">
                        열기
                      </a>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            if (!navigator?.clipboard?.writeText) throw new Error('clipboard unavailable');
                            await navigator.clipboard.writeText(url);
                            toast('링크를 복사했습니다.');
                          } catch {
                            toast('링크 복사에 실패했습니다.', 'error');
                          }
                        }}
                        className="text-[var(--toss-gray-4)] hover:text-[var(--foreground)]"
                      >
                        복사
                      </button>
                      <button
                        type="button"
                        data-testid={`chat-shared-link-reply-${message.id}`}
                        onClick={() => onReplyMessage(message)}
                        className="text-amber-700 hover:text-amber-800"
                      >
                        답글
                      </button>
                    </div>
                  </div>
                );
              })}
              {visibleLinkMessages.length === 0 ? (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--tab-bg)] py-4 text-center dark:border-zinc-800 dark:bg-zinc-800/30">
                  <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">공유된 링크가 없습니다.</p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-3">
            <DrawerSectionHeader
              title="북마크"
              count={sortedBookmarkedMessages.length}
              expanded={expandedSections.bookmarks}
              canExpand={sortedBookmarkedMessages.length > COLLAPSED_LIMITS.bookmarks}
              onToggle={() => toggleSection('bookmarks')}
            />
            <div className="space-y-2">
              {visibleBookmarkedMessages.map((message) => {
                const messagePreview = getMessageDisplayText(
                  message.content,
                  message.file_name,
                  message.file_url,
                  '내용 없음',
                );
                const linkedUrl = extractFirstLinkUrl(message.content);

                return (
                  <div
                    key={message.id}
                    data-testid={`chat-drawer-bookmark-${message.id}`}
                    className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-xs font-bold leading-5 text-[var(--foreground)]">{messagePreview}</p>
                        <p className="mt-1 truncate text-[10px] font-medium text-[var(--toss-gray-4)]">
                          {formatMessageMeta(message)}
                        </p>
                        {linkedUrl ? (
                          <p className="mt-1 truncate text-[10px] font-bold text-emerald-600">{linkedUrl}</p>
                        ) : null}
                      </div>
                      <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-1 text-[9px] font-bold text-amber-700">
                        북마크
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-bold">
                      <button
                        type="button"
                        data-testid={`chat-bookmark-jump-${message.id}`}
                        onClick={() => {
                          onClose();
                          onScrollToMessage(message.id);
                        }}
                        className="rounded-full bg-[var(--accent)]/10 px-2.5 py-1 text-[var(--accent)] hover:bg-[var(--accent)]/15"
                      >
                        메시지로 이동
                      </button>
                      {message.file_url ? (
                        <button
                          type="button"
                          onClick={() => onPreviewMessage(message)}
                          className="rounded-full bg-blue-500/10 px-2.5 py-1 text-blue-600 hover:bg-blue-500/15"
                        >
                          미리보기
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => onReplyMessage(message)}
                        className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700 hover:bg-amber-100"
                      >
                        답글
                      </button>
                    </div>
                  </div>
                );
              })}
              {visibleBookmarkedMessages.length === 0 ? (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--tab-bg)] py-4 text-center dark:border-zinc-800 dark:bg-zinc-800/30">
                  <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">이 방에서 북마크한 메시지가 없습니다.</p>
                </div>
              ) : null}
            </div>
          </div>

        </div>

        <div className="flex flex-col gap-2 border-t border-[var(--border)] bg-[var(--tab-bg)] p-4 dark:bg-zinc-800/50">
          {editingRoomName ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={roomNameDraft}
                onChange={(event) => onRoomNameDraftChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void onSaveRoomName();
                  }
                  if (event.key === 'Escape') onCancelEditingRoomName();
                }}
                placeholder="채팅방 이름"
                className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-bold outline-none focus:border-[var(--accent)]"
              />
              <button type="button" onClick={() => void onSaveRoomName()} className="rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-bold text-white">
                저장
              </button>
              <button type="button" onClick={onCancelEditingRoomName} className="rounded-xl bg-[var(--muted)] px-3 py-2 text-xs font-bold">
                취소
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              {canLeaveRoom ? (
                <button
                  type="button"
                  onClick={onLeaveRoom}
                  className="flex-1 rounded-xl bg-red-500/10 py-2.5 text-[11px] font-bold text-red-600 transition-colors hover:bg-red-500/20 dark:bg-red-900/20"
                >
                  방 나가기
                </button>
              ) : null}
              {canEditRoomName ? (
                <button
                  type="button"
                  onClick={onStartEditingRoomName}
                  className="flex-1 rounded-xl bg-[var(--muted)] py-2.5 text-[11px] font-bold text-foreground transition-colors hover:bg-[var(--toss-gray-2)]"
                >
                  이름 수정
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const MessengerDrawer = memo(MessengerDrawerImpl);
