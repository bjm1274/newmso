'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import type { ChatMessage, ChatRoom, StaffMember } from '@/types';
import type { ThreadOverview } from './메신저파생훅';
import {
  AttachmentListCard,
  AttachmentQuickActions,
  extractFirstLinkUrl,
  getAttachmentDisplayName,
  getMessageDisplayText,
  resolveAttachmentKind,
} from './메신저첨부';
import { buildMessengerImageAlt } from './메신저공통';
type DrawerSectionKey = 'media' | 'files' | 'links' | 'bookmarks';
type MessengerDrawerSectionsProps = {
  isOpen: boolean;
  threadOverviews: ThreadOverview[];
  sharedMediaPreviewMessages: ChatMessage[];
  sharedFilePreviewMessages: ChatMessage[];
  sharedLinkPreviewMessages: ChatMessage[];
  bookmarkedMessages: ChatMessage[];
  selectedRoom: ChatRoom | null;
  resolveRoomMemberProfile: (room: ChatRoom, memberId: string) => StaffMember | null;
  onClose: () => void;
  onOpenMediaArchive: (filter: 'media' | 'file') => void;
  onPreviewMessage: (message: ChatMessage) => void;
  onReplyMessage: (message: ChatMessage) => void;
  onOpenThread: (message: ChatMessage) => void;
  onScrollToMessage: (messageId: string) => void;
};
const COLLAPSED_LIMITS: Record<DrawerSectionKey, number> = { media: 3, files: 3, links: 2, bookmarks: 3 };
const DEFAULT_EXPANDED_SECTIONS: Record<DrawerSectionKey, boolean> = { media: false, files: false, links: false, bookmarks: false };

function DeferredAttachmentImage({
  src,
  alt,
  wrapperClassName = '',
  placeholderClassName = '',
  className = '',
}: {
  src: string;
  alt: string;
  wrapperClassName?: string;
  placeholderClassName?: string;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className={`relative overflow-hidden ${wrapperClassName}`}>
      {!loaded ? <div className={placeholderClassName} /> : null}
      <img
        src={src}
        alt={alt}
        className={`${className} ${loaded ? 'opacity-100' : 'absolute inset-0 opacity-0'}`}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

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
    <div className="flex items-center justify-between gap-2 px-1">
      <div className="flex items-center gap-2 min-w-0">
        <p className="truncate text-[11px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">{title}</p>
        <span className="rounded-full bg-[var(--tab-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--toss-gray-4)]">
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
export function MessengerDrawerSections({
  isOpen,
  threadOverviews,
  sharedMediaPreviewMessages,
  sharedFilePreviewMessages,
  sharedLinkPreviewMessages,
  bookmarkedMessages,
  selectedRoom,
  resolveRoomMemberProfile,
  onClose,
  onOpenMediaArchive,
  onPreviewMessage,
  onReplyMessage,
  onOpenThread,
  onScrollToMessage,
}: MessengerDrawerSectionsProps) {
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
  const toggleSection = (section: DrawerSectionKey) => {
    setExpandedSections((current) => ({ ...current, [section]: !current[section] }));
  };
  const recentThreadOverviews = threadOverviews.slice(0, 4);
  return (
    <>
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--toss-gray-3)]">최근 스레드</p>
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
                    className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--card)] p-3 shadow-sm"
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
                <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--tab-bg)] py-4 text-center">
                  <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">최근 스레드가 없습니다.</p>
                </div>
              ) : null}
            </div>
          </div>
          <div className="space-y-3">
            <DrawerSectionHeader
              title="사진 및 동영상"
              count={sortedMediaMessages.length}
              expanded={expandedSections.media}
              canExpand={sortedMediaMessages.length > COLLAPSED_LIMITS.media}
              onToggle={() => toggleSection('media')}
              archiveTestId="chat-open-media-archive-media"
              onArchive={sortedMediaMessages.length > 0 ? () => onOpenMediaArchive('media') : null}
            />
            <div className="grid grid-cols-3 gap-1 overflow-hidden rounded-[var(--radius-lg)]">
              {visibleMediaMessages.map((message) => (
                <div
                  key={message.id}
                  className="group relative aspect-square cursor-pointer bg-[var(--tab-bg)]"
                  onClick={() => onPreviewMessage(message)}
                >
                  {resolveAttachmentKind(message.file_url, message.file_kind) === 'image' ? (
                    <DeferredAttachmentImage
                      src={message.file_url || ''}
                      alt={buildMessengerImageAlt(message.file_name, '공유 이미지')}
                      wrapperClassName="h-full w-full"
                      placeholderClassName="h-full w-full bg-[var(--muted)] animate-pulse"
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
                <div className="col-span-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--tab-bg)] py-5 text-center">
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
                <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--tab-bg)] py-4 text-center">
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
                    className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--tab-bg)] p-3"
                  >
                    <a href={url} target="_blank" rel="noreferrer" className="block transition-opacity hover:opacity-90">
                      <p className="mb-0.5 truncate text-[11px] font-bold text-[var(--success)]">{url}</p>
                      <p className="truncate text-[10px] text-[var(--toss-gray-4)]">{formatMessageMeta(message)}</p>
                    </a>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-bold">
                      <a href={url} target="_blank" rel="noreferrer" className="text-[var(--success)] hover:opacity-75">
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
                        className="text-[var(--warning)] hover:opacity-75"
                      >
                        답글
                      </button>
                    </div>
                  </div>
                );
              })}
              {visibleLinkMessages.length === 0 ? (
                <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--tab-bg)] py-4 text-center">
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
                    className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--card)] p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-xs font-bold leading-5 text-[var(--foreground)]">{messagePreview}</p>
                        <p className="mt-1 truncate text-[10px] font-medium text-[var(--toss-gray-4)]">
                          {formatMessageMeta(message)}
                        </p>
                        {linkedUrl ? (
                          <p className="mt-1 truncate text-[10px] font-bold text-[var(--success)]">{linkedUrl}</p>
                        ) : null}
                      </div>
                      <span className="shrink-0 rounded-[var(--radius-md)] bg-[var(--warning-light)] px-2 py-1 text-[9px] font-bold text-[var(--warning)]">
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
                          className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-2.5 py-1 text-[var(--accent)] hover:bg-[var(--accent-subtle)]"
                        >
                          미리보기
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => onReplyMessage(message)}
                        className="rounded-[var(--radius-md)] bg-[var(--warning-light)] px-2.5 py-1 text-[var(--warning)] hover:opacity-75"
                      >
                        답글
                      </button>
                    </div>
                  </div>
                );
              })}
              {visibleBookmarkedMessages.length === 0 ? (
                <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--tab-bg)] py-4 text-center">
                  <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">이 방에서 북마크한 메시지가 없습니다.</p>
                </div>
              ) : null}
            </div>
          </div>
    </>
  );
}
