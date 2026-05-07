'use client';
import type { MutableRefObject, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import {
  Bookmark,
  ClipboardList,
  Copy,
  Eye,
  Forward,
  Megaphone,
  MessageSquareReply,
  MoreHorizontal,
  Pencil,
  Send,
  SmilePlus,
  Trash2,
} from './lucide-shim';
import { toast } from '@/lib/toast';
import { getProfilePhotoUrl } from '@/lib/profile-photo';
import type { ChatMessage, StaffMember } from '@/types';
import { AttachmentListCard, getAttachmentDisplayName, getDeletedMessagePreviewText, getMessageDisplayText, resolveAttachmentKind, type AttachmentPreviewKind } from './메신저첨부';
import { DeferredAttachmentImage } from './MessengerAttachmentPanel';
import { MessengerAvatar } from './메신저공통';
import { extractWardMessageMeta, WARD_QUICK_REPLY_OPTIONS } from './메신저유틸';
import type { ThreadSummary } from './메신저파생훅';
import type { DeliveryState } from './메신저타입';
type PollItem = { id: string; room_id?: string | null; creator_id?: string | null; question: string; options: string[]; created_at?: string | null; type: 'poll'; [key: string]: unknown; };
type MessengerMessageItem = ChatMessage & { type?: 'message'; staff?: { name?: string; position?: string; photo_url?: string | null } | null; reply_to_id?: string | null; };
type MessengerAlbumItem = ChatMessage & { type: 'album'; albumMessages: ChatMessage[]; staff?: { name?: string; photo_url?: string | null } | null; };
export type MessengerTimelineItem = PollItem | MessengerMessageItem | MessengerAlbumItem;
type InlineActionPanel = { messageId: string; type: 'emoji' | 'more' } | null;
const BOARD_META_PREFIX = '[[BOARD_META]]';
const BOARD_META_SUFFIX = '[[/BOARD_META]]';
const INLINE_REACTIONS = ['👍', '👏', '❤️', '😂', '🙏', '🎉', '🔥', '✅'];
const inlineIconButtonClass = 'touch-manipulation relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-[var(--toss-gray-4)] shadow-sm transition-colors hover:border-[var(--accent)] hover:bg-[var(--toss-blue-light)] hover:text-[var(--accent)] active:scale-95';
const inlineMoreItemClass = 'flex h-11 w-full items-center gap-3 rounded-[var(--radius-md)] px-3 text-left text-[13px] font-bold text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]';

async function copyMessageText(message: ChatMessage) {
  const text =
    getMessageDisplayText(
      message.content,
      message.file_name,
      message.file_url,
      message.file_url ? '첨부 파일' : '',
    ) || String(message.content || message.file_url || '').trim();

  if (!text) {
    toast('복사할 내용이 없습니다.', 'warning');
    return;
  }

  try {
    await navigator.clipboard?.writeText(text);
    toast('복사했습니다.');
  } catch {
    toast('복사 실패', 'error');
  }
}
type BoardLinkMeta = { boardType: string; postId: string; };
function extractBoardLinkMeta(content: unknown): BoardLinkMeta | null {
  const raw = String(content || ''), start = raw.indexOf(BOARD_META_PREFIX), end = raw.indexOf(BOARD_META_SUFFIX);
  if (start < 0 || end < 0 || end <= start) return null;
  try { const parsed = JSON.parse(raw.slice(start + BOARD_META_PREFIX.length, end).trim()) as { type?: string | null; board_type?: string | null; post_id?: string | null; }; const metaType = String(parsed?.type || '').trim(); const boardType = String(parsed?.board_type || '').trim(); const postId = String(parsed?.post_id || '').trim(); if (!boardType || !postId || (metaType && metaType !== 'board_post_link')) return null; return { boardType, postId }; }
  catch { return null; }
}
type MessengerTimelineGroupProps = { messages: ChatMessage[]; combinedTimeline: MessengerTimelineItem[]; pollVotes: Record<string, Record<number, number>>; reactions: Record<string, Record<string, number>>; readCounts: Record<string, number>; deliveryStates: Record<string, DeliveryState>; threadSummaries: Record<string, ThreadSummary>; activeActionMessageId: string | null; pinnedIds: string[]; bookmarkedIds: Set<string>; roomMembers: StaffMember[]; effectiveChatUserId: string; activeMessageHighlightQuery: string; wardQuickReplySendingMessageId: string | null; messageRefs: MutableRefObject<Record<string, HTMLDivElement | null>>; resolveStaffProfile: (staffId: string | null | undefined, fallbackName?: string | null) => StaffMember | null; onScrollToMessage: (messageId: string) => void; onVote: (pollId: string, optionIndex: number) => void; onOpenAttachmentPreviewForMessage: (message: ChatMessage) => void; onStartReplyToMessage: (message: ChatMessage) => void; onOpenThread: (message: ChatMessage) => void; onOpenMessageActions: (message: ChatMessage) => void; onCloseMessageActions: () => void; onToggleReaction: (message: ChatMessage, emoji: string) => void | Promise<void>; onAddTask: (message: ChatMessage) => void | Promise<void>; onTogglePin: (message: ChatMessage) => void | Promise<void>; onToggleBookmark: (message: ChatMessage) => void | Promise<void>; onForwardMessage: (message: ChatMessage) => void; onForwardToSelf: (message: ChatMessage) => void | Promise<void>; onDeleteMessage: (message: ChatMessage) => void | Promise<void>; onStartEdit?: (message: ChatMessage) => void; onOpenEditHistory?: (message: ChatMessage) => void | Promise<void>; onCopyMessageLink?: (message: ChatMessage) => void | Promise<void>; onMarkMessageRead: (message: ChatMessage) => void; renderMessageContent: (content: string, isMine?: boolean, highlightQuery?: string) => ReactNode; onOpenAttachmentPreview: (url: string, name: string, kind: AttachmentPreviewKind) => void; onOpenReactionDetail: (message: ChatMessage, emoji: string) => void; onLoadReadStatus: (message: ChatMessage) => void; onSendWardQuickReply: (message: ChatMessage, replyText: string) => void | Promise<void>; onRetryFailedMessage: (messageId: string) => void; onMediaLoad?: () => void; onOpenBoardPost?: (boardType: string, postId: string) => void; onOpenDateJump?: (dateKey: string) => void; };
const formatTimelineDateLabel = (value?: string | null) =>
  new Date(value || 0).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });

const formatTimelineDateKey = (value?: string | null) => {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function MessengerTimelineGroup({ messages, combinedTimeline, pollVotes, reactions, readCounts, deliveryStates, threadSummaries, activeActionMessageId, pinnedIds, bookmarkedIds, roomMembers, effectiveChatUserId, activeMessageHighlightQuery, wardQuickReplySendingMessageId, messageRefs, resolveStaffProfile, onScrollToMessage, onVote, onOpenAttachmentPreviewForMessage, onStartReplyToMessage, onOpenThread, onOpenMessageActions, onCloseMessageActions, onToggleReaction, onAddTask, onTogglePin, onToggleBookmark, onForwardMessage, onForwardToSelf, onDeleteMessage, onStartEdit = () => {}, onOpenEditHistory = () => {}, onCopyMessageLink = () => {}, onMarkMessageRead, renderMessageContent, onOpenAttachmentPreview, onOpenReactionDetail, onLoadReadStatus, onSendWardQuickReply, onRetryFailedMessage, onMediaLoad, onOpenBoardPost, onOpenDateJump, }: MessengerTimelineGroupProps) {
  const [openInlinePanel, setOpenInlinePanel] = useState<InlineActionPanel>(null);

  const renderDateDivider = (dateLabel: string, dateKey: string) => (
    <div data-testid="chat-date-divider" className="my-0.5 flex items-center justify-center gap-1 md:my-1 md:gap-2">
      <div className="flex-1 h-px bg-[var(--border)]" />
      <button
        type="button"
        onClick={() => {
          if (dateKey) onOpenDateJump?.(dateKey);
        }}
        className="shrink-0 rounded-full bg-[var(--muted)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--toss-gray-3)] transition-colors hover:bg-[var(--toss-blue-light)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
        title="날짜로 이동"
        aria-label={`${dateLabel} 날짜 검색`}
      >
        {dateLabel}
      </button>
      <div className="flex-1 h-px bg-[var(--border)]" />
    </div>
  );

  useEffect(() => {
    if (!activeActionMessageId) return;

    const closeInlineActions = () => {
      setOpenInlinePanel(null);
      onCloseMessageActions();
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-chat-active-action-scope="true"]')) return;
      closeInlineActions();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeInlineActions();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeActionMessageId, onCloseMessageActions]);

  let lastDateLabel = '';
  let lastSenderId = '';
  return (
    <>
      {combinedTimeline.map((item) => {
              if (item.type === 'poll') {
                const pollItem = item as PollItem;
                const dateLabel = formatTimelineDateLabel(pollItem.created_at);
                const votes = pollVotes[pollItem.id] || {};
                const totalVotes = (Object.values(votes) as number[]).reduce((a: number, b: number) => a + b, 0);
                return (
                  <div data-chat-timeline-date={dateLabel} data-testid={`chat-poll-${pollItem.id}`} key={`poll-${pollItem.id}`} className="max-w-[85%] md:max-w-[70%] bg-blue-500/10 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 rounded-[var(--radius-xl)] p-4 shadow-soft">
                    <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <span className="text-sm">🗳️</span> 투표
                    </p>
                    <p className="mb-4 text-xs font-bold text-foreground leading-relaxed">{pollItem.question}</p>
                    <div className="space-y-1.5">
                      {(pollItem.options || []).map((opt: string, idx: number) => (
                        <button
                          data-testid={`chat-poll-vote-${pollItem.id}-${idx}`}
                          key={idx}
                          onClick={() => onVote(pollItem.id, idx)}
                          className="w-full flex justify-between items-center px-4 py-2.5 rounded-[var(--radius-md)] bg-[var(--card)] border border-blue-500/20 hover:border-blue-400 transition-all text-[11px] font-medium group">
                          <span className="text-[var(--toss-gray-5)] dark:text-[var(--toss-gray-3)] group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{opt}</span>
                          <span className="text-blue-600 font-bold bg-blue-500/10 dark:bg-blue-900/50 px-2 py-0.5 rounded-md">
                            {votes[idx] || 0}
                            {totalVotes > 0 && <span className="ml-1 opacity-60 font-medium">({Math.round(((votes[idx] || 0) / totalVotes) * 100)}%)</span>}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              }
              if (item.type === 'album') {
                const albumItem = item as MessengerAlbumItem;
                const albumMsgs = albumItem.albumMessages || [];
                const isMineAlbum = String(albumItem.sender_id) === effectiveChatUserId;
                const senderName = (albumItem.staff as { name?: string } | null)?.name || albumItem.sender_name || '알 수 없음';
                const created = new Date(albumItem.created_at || 0);
                const dateLabel = formatTimelineDateLabel(albumItem.created_at);
                const dateKey = formatTimelineDateKey(albumItem.created_at);
                const showDateDivider = dateLabel !== lastDateLabel;
                if (showDateDivider) lastDateLabel = dateLabel;
                lastSenderId = String(albumItem.sender_id);
                const count = albumMsgs.length;
                const gridCols = count === 1 ? 'grid-cols-1' : count <= 4 ? 'grid-cols-2' : 'grid-cols-3';
                const timeStr = created.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
                const albumReplyTarget =
                  albumMsgs.find((message) => String(message.content || '').trim()) ||
                  albumMsgs[0] ||
                  albumItem;
                return (
                  <div
                    data-chat-timeline-date={dateLabel}
                    data-testid={`chat-album-${albumItem.album_id || albumItem.id}`}
                    key={`album-${albumItem.album_id || albumItem.id}`}
                    className={showDateDivider ? 'mt-0.5 md:mt-1' : 'mt-[2px]'}>
                    {showDateDivider && (
                      renderDateDivider(dateLabel, dateKey)
                    )}
                    <div className={`flex items-end gap-2 ${isMineAlbum ? 'flex-row-reverse' : 'flex-row'}`}>
                      {!isMineAlbum && (
                        <MessengerAvatar
                          name={senderName}
                          photoUrl={(albumItem.staff as { photo_url?: string | null } | null)?.photo_url || null}
                          className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--muted)] text-[11px] font-bold text-[var(--toss-gray-4)]"
                          decorative/>
                      )}
                      <div className={`flex flex-col gap-1 max-w-[75%] ${isMineAlbum ? 'items-end' : 'items-start'}`}>
                        {!isMineAlbum && (
                          <span className="text-[11px] font-bold text-[var(--toss-gray-4)] ml-1">{senderName}</span>
                        )}
                        <div className={`grid ${gridCols} gap-0.5 rounded-[var(--radius-lg)] overflow-hidden`} style={{ maxWidth: count === 1 ? 200 : count <= 4 ? 260 : 300 }}>
                          {albumMsgs.map((message, index) => (
                            <button
                              key={message.id}
                              className={`relative overflow-hidden bg-[var(--muted)] ${count === 3 && index === 2 ? 'col-span-2' : ''} ${count === 5 && index === 3 ? 'col-span-1' : ''}`}
                              style={{ aspectRatio: count === 1 ? '4/3' : '1/1' }}
                              onClick={() => onOpenAttachmentPreviewForMessage(message)}
                              aria-label={`${message.file_name || `앨범 사진 ${index + 1}`} 미리보기`}>
                              <DeferredAttachmentImage
                                src={message.file_url || ''}
                                alt={message.file_name || '사진'}
                                wrapperClassName="h-full w-full"
                                placeholderClassName="h-full w-full bg-[var(--muted)] animate-pulse"
                                className="h-full w-full object-cover"
                                onLoad={onMediaLoad}/>
                              {index === 4 && count > 5 && (
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                  <span className="text-white font-bold text-lg">+{count - 5}</span>
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                        <div className={`mx-1 flex items-center gap-2 text-[10px] ${isMineAlbum ? 'justify-end' : 'justify-start'}`}>
                          <span className="text-[var(--toss-gray-3)]">{timeStr} · 사진 {count}장</span>
                          {albumReplyTarget ? (
                            <button
                              type="button"
                              data-testid={`chat-album-reply-${albumItem.album_id || albumItem.id}`}
                              onClick={() => onStartReplyToMessage(albumReplyTarget)}
                              className="font-bold text-amber-700 transition-colors hover:text-amber-800">
                              답글
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }
              const msg = item as MessengerMessageItem;
              const messageId = String(msg.id);
              const isMine = String(msg.sender_id) === effectiveChatUserId;
              const isDeletedMessage = Boolean(msg.is_deleted);
              const msgReacts = reactions[msg.id] || {};
              const isActionActive = activeActionMessageId === messageId;
              const inlinePanelType = isActionActive && openInlinePanel?.messageId === messageId ? openInlinePanel.type : null;
              const isPinnedMessage = pinnedIds.includes(messageId);
              const isBookmarkedMessage = bookmarkedIds.has(messageId);
              const canDeleteMessage = isMine;
              const hasReacts = Object.keys(msgReacts).some((emoji) => (msgReacts[emoji] || 0) > 0);
              const readersCount = readCounts[msg.id] || 0;
              const totalRecipients = Math.max(
                0,
                roomMembers.filter((member) => String(member?.id ?? '') !== String(msg.sender_id || '')).length
              );
              const unreadRecipients = Math.max(0, totalRecipients - readersCount);
              const deliveryStateInfo = deliveryStates[msg.id];
              const deliveryState = deliveryStateInfo?.status || (String(msg.id).startsWith('temp-') ? 'sending' : 'sent');
              const deliveryStateLabel = isMine && deliveryState === 'sending'
                ? '전송 중'
                : isMine && deliveryState === 'failed'
                  ? '전송 실패'
                  : null;
              const deliveryErrorText = isMine && deliveryState === 'failed'
                ? String(deliveryStateInfo?.error || '').trim()
                : '';
              const readStatusSummary = totalRecipients > 0 && unreadRecipients > 0 ? `${unreadRecipients}` : null;
              const canOpenReadStatus = deliveryState === 'sent' && totalRecipients > 0;
              const displayedReadStatusSummary = isMine ? readStatusSummary : null;
              const isAttachmentOnlyMessage = !String(msg.content || '').trim() && Boolean(msg.file_url);
              const created = new Date(msg.created_at || 0);
              const dateLabel = formatTimelineDateLabel(msg.created_at);
              const dateKey = formatTimelineDateKey(msg.created_at);
              const showDateDivider = dateLabel !== lastDateLabel;
              if (showDateDivider) lastDateLabel = dateLabel;
              const isSystemInvite = typeof msg.content === 'string' && msg.content.startsWith('[초대]');
              const systemText = isSystemInvite ? String(msg.content || '').replace(/^\[초대\]\s*/, '') : '';
              const isContinuous = !showDateDivider && !isSystemInvite && String(msg.sender_id) === lastSenderId;
              const senderProfile =
                !isMine
                  ? resolveStaffProfile(
                      String(msg.sender_id || ''),
                      (msg.staff as { name?: string } | null | undefined)?.name || null
                    ) || (msg.staff as StaffMember | null | undefined) || null
                  : null;
              const senderName = senderProfile?.name || (msg.staff as { name?: string } | null | undefined)?.name || '이름 없음';
              const senderPhotoUrl = senderProfile ? getProfilePhotoUrl(senderProfile as StaffMember) : null;
              const wardMessageMeta = !isDeletedMessage ? extractWardMessageMeta(msg.content) : { displayContent: '', meta: null };
              const boardLinkMeta = !isDeletedMessage && onOpenBoardPost ? extractBoardLinkMeta(msg.content) : null;
              const showWardQuickReplies =
                !isMine &&
                !isDeletedMessage &&
                wardMessageMeta.meta?.type === 'op_ward_request';
              const isWardQuickReplySending = wardQuickReplySendingMessageId === String(msg.id || '');
              const showIncomingAvatar = !isMine && !isContinuous;
              const threadSummary = threadSummaries[String(msg.id)];
              const showThreadBadge = Boolean(
                !isDeletedMessage &&
                threadSummary &&
                (threadSummary.replyCount > 0 || threadSummary.rootId !== String(msg.id))
              );
              const threadBadgeLabel =
                threadSummary?.rootId && threadSummary.rootId !== String(msg.id)
                  ? `스레드 보기 · 답글 ${threadSummary.replyCount}개`
                  : `답글 ${threadSummary?.replyCount || 0}개`;
              const threadBadgeTitle = threadSummary
                ? `참여 ${threadSummary.participantCount}명${threadSummary.latestReplyAt ? ` · 최근 답글 ${new Date(threadSummary.latestReplyAt).toLocaleString('ko-KR')}` : ''}`
                : '';
              const showThreadAttention =
                Boolean(
                  threadSummary &&
                  threadSummary.needsAttention &&
                  String(msg.id) === threadSummary.rootId &&
                  !isDeletedMessage,
                );
              lastSenderId = String(msg.sender_id);
              return (
                <div key={msg.id} data-chat-timeline-date={dateLabel} data-testid={`chat-message-row-${msg.id}`} className={isContinuous ? 'mt-[2px]' : 'mt-0.5 md:mt-1'}>
                  {showDateDivider && (
                    renderDateDivider(dateLabel, dateKey)
                  )}
                  {isSystemInvite ? (
                    <div className="flex justify-center my-1">
                      <span className="px-2.5 py-0.5 rounded-full bg-[var(--toss-blue-light)] text-[10px] font-semibold text-[var(--accent)]">
                        초대 {systemText}
                      </span>
                    </div>
                  ) : (
                    <div
                      ref={(element) => { messageRefs.current[msg.id] = element; }}
                      className={`flex w-full flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                      <div className={`flex ${isMine ? 'max-w-[78%] flex-col items-end md:max-w-[72%]' : 'w-full items-start gap-2'}`}>
                        {!isMine ? (
                          showIncomingAvatar ? (
                            <div data-testid={`chat-message-sender-avatar-${msg.id}`} className="shrink-0 self-start pt-0.5">
                              <MessengerAvatar
                                name={senderName}
                                photoUrl={senderPhotoUrl}
                                className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[var(--tab-bg)] text-[12px] font-bold text-[var(--toss-gray-3)] ring-1 ring-black/5"
                                decorative/>
                            </div>
                          ) : (
                            <div aria-hidden="true" className="w-10 shrink-0" />
                          )
                        ) : null}
                        <div
                          data-testid={!isMine ? `chat-message-stack-${msg.id}` : undefined}
                          className={isMine ? 'group flex w-full flex-col items-end' : 'group flex min-w-0 max-w-[82%] flex-col items-start md:max-w-[74%]'}>
                          {!isMine && showIncomingAvatar && (
                            <span
                              data-testid={`chat-message-sender-name-${msg.id}`}
                              className="mb-1 px-0.5 text-[11px] font-bold leading-none text-[var(--toss-gray-4)]">
                              {senderName}
                            </span>
                          )}
                          <div
                            data-chat-active-action-scope={isActionActive ? 'true' : undefined}
                            data-testid={isDeletedMessage ? `chat-message-deleted-${msg.id}` : `chat-message-${msg.id}`}
                            onClick={(event) => {
                              if (isDeletedMessage) return;
                              event.stopPropagation();
                              onOpenMessageActions(msg);
                            }}
                            className={`group relative ${
                              isDeletedMessage
                                ? 'border border-dashed border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-[var(--toss-gray-3)] italic'
                                : !msg.content
                                  ? 'p-0 bg-transparent shadow-none border-none'
                                  : 'border px-3 py-2'
                            } rounded-[var(--radius-xl)] text-[13px] md:text-sm ${isDeletedMessage ? 'cursor-default' : 'cursor-pointer'} transition-all max-w-full ${
                              isDeletedMessage
                                ? isMine
                                  ? 'rounded-tr-sm'
                                  : 'rounded-tl-sm'
                                : !msg.content
                                  ? ''
                                  : isMine
                                    ? 'bg-[var(--toss-blue-light)] text-[var(--foreground)] border-[var(--accent)]/20 rounded-tr-sm'
                                    : 'bg-[var(--card)] border-[var(--border)] rounded-tl-sm hover:border-blue-300 text-foreground'
                            }`}
                            role="button"
                            tabIndex={isDeletedMessage ? -1 : 0}
                            onKeyDown={(event) => {
                              if (isDeletedMessage) return;
                              if (event.key === 'Enter') onMarkMessageRead(msg);
                            }}
                            aria-label={`${msg.staff?.name || '이름 없음'} ${isDeletedMessage ? '삭제된 메시지' : '메시지'}`}>
                            {!isDeletedMessage && msg.reply_to_id && (() => {
                              const parent = messages.find((message) => message.id === msg.reply_to_id);
                              const replyPreviewClass = isMine
                                ? isAttachmentOnlyMessage
                                  ? 'bg-[var(--card)] border-[var(--accent)]/30 text-[var(--foreground)] shadow-sm'
                                  : 'bg-[var(--card)]/70 border-[var(--accent)]/20 text-[var(--foreground)]'
                                : 'bg-[var(--muted)] border-[var(--accent)]/40 text-[var(--foreground)]';
                              return parent ? (
                                <div
                                  data-testid={`chat-reply-preview-${msg.id}`}
                                  className={`mb-1 p-1.5 rounded-[var(--radius-md)] text-[11px] border-l-2 cursor-pointer hover:opacity-80 transition-opacity ${replyPreviewClass}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onScrollToMessage(msg.reply_to_id!);
                                  }}>
                                  <span className="font-bold opacity-80">답글 {(parent.staff as { name?: string } | null | undefined)?.name}: </span>
                                  <span className="truncate block mt-0.5">
                                    {getMessageDisplayText(
                                      parent.content,
                                      parent.file_name,
                                      parent.file_url,
                                      '첨부 파일'
                                    )}
                                  </span>
                                </div>
                              ) : null;
                            })()}
                            <div className={`leading-relaxed ${msg.content && !isDeletedMessage ? 'mb-0.5' : ''}`}>
                              {isDeletedMessage ? getDeletedMessagePreviewText() : renderMessageContent(msg.content || '', isMine, activeMessageHighlightQuery)}
                            </div>
                            {boardLinkMeta && (
                              <button
                                type="button"
                                className="mt-2 inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] px-2.5 py-1 text-[11px] font-bold text-[var(--foreground)] transition hover:border-[var(--accent)]"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onOpenBoardPost?.(boardLinkMeta.boardType, boardLinkMeta.postId);
                                }}
                              >
                                <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                                게시글 열기
                              </button>
                            )}
                            {!isDeletedMessage && msg.file_url && (() => {
                              const fileUrl = msg.file_url!;
                              const attachmentName = getAttachmentDisplayName(msg.file_name, fileUrl);
                              const attachmentKind = resolveAttachmentKind(fileUrl, msg.file_kind);
                              return (
                                <div className="mt-2" onClick={(event) => event.stopPropagation()}>
                                  <AttachmentListCard
                                    url={fileUrl}
                                    name={attachmentName}
                                    kind={attachmentKind}
                                    onPreview={() => {
                                      if (attachmentKind === 'image') {
                                        onOpenAttachmentPreviewForMessage(msg);
                                        return;
                                      }
                                      onOpenAttachmentPreview(fileUrl, attachmentName, attachmentKind);
                                    }}
                                    layout="bubble"
                                    onMediaLoad={onMediaLoad}
                                    tone={isMine ? 'accent' : 'default'}/>
                                </div>
                              );
                            })()}
                            {!isDeletedMessage && hasReacts && (
                              <div className="mt-2 flex items-center gap-2 text-[11px] flex-wrap">
                                <span className="flex gap-1 flex-wrap">
                                  {Object.entries(msgReacts).map(([emoji, count]) =>
                                    (count > 0 ? (
                                      <button
                                        key={emoji}
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          onOpenReactionDetail(msg, emoji);
                                        }}
                                        className={`px-1.5 py-0.5 rounded text-[11px] transition-colors ${isMine ? 'bg-[var(--card)]/20 hover:bg-[var(--card)]/30' : 'bg-[var(--muted)] hover:bg-[var(--toss-blue-light)]'}`}
                                        aria-label={`${emoji} 반응 누른 사람 ${count}명 보기`}>
                                        {emoji} {count}
                                      </button>
                                    ) : null)
                                  )}
                                </span>
                              </div>
                            )}
                            <div
                              className={`absolute bottom-0 z-10 ${isMine ? 'right-full mr-2 items-end' : 'left-full ml-2 items-start'} flex flex-col gap-0.5 whitespace-nowrap`}>
                              {displayedReadStatusSummary && (
                                canOpenReadStatus ? (
                                  <button
                                    data-testid={`chat-message-read-status-${msg.id}`}
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      onLoadReadStatus(msg);
                                    }}
                                    className="text-[10px] font-bold text-[var(--success)] hover:opacity-80 underline underline-offset-2">
                                    {displayedReadStatusSummary}
                                  </button>
                                ) : (
                                  <span
                                    data-testid={`chat-message-read-status-${msg.id}`}
                                    className={`text-[10px] font-bold ${deliveryState === 'failed' ? 'text-red-500' : 'text-[var(--success)]'}`}>
                                    {displayedReadStatusSummary}
                                  </span>
                                )
                              )}
                              <span className="text-[8px] font-bold text-[var(--toss-gray-4)]">
                                {created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                          {showWardQuickReplies && (
                            <div
                              data-testid={`chat-ward-quick-replies-${msg.id}`}
                              className="mt-2 flex w-full flex-col gap-1"
                              onClick={(event) => event.stopPropagation()}>
                              <p className="px-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">
                                빠른 응답
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {WARD_QUICK_REPLY_OPTIONS.map((option) => (
                                  <button
                                    key={option.id}
                                    type="button"
                                    data-testid={`chat-ward-quick-reply-${msg.id}-${option.id}`}
                                    disabled={isWardQuickReplySending}
                                    onClick={() => {
                                      void onSendWardQuickReply(msg, option.text);
                                    }}
                                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:border-[var(--accent)] hover:bg-[var(--toss-blue-light)] disabled:cursor-wait disabled:opacity-60">
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {!isDeletedMessage && msg.edited_at && (
                            <p
                              data-testid={`chat-message-edited-${msg.id}`}
                              className={`mt-1 px-1 text-[10px] font-semibold text-amber-600 ${isMine ? 'text-right' : 'text-left'}`}>
                              수정됨
                            </p>
                          )}
                          {showThreadBadge && threadSummary ? (
                            <button
                              type="button"
                              data-testid={`chat-thread-badge-${msg.id}`}
                              title={threadBadgeTitle}
                              onClick={(event) => {
                                event.stopPropagation();
                                onOpenThread(msg);
                              }}
                              className={`mt-1 inline-flex items-center gap-1 rounded-[var(--radius-md)] border px-2.5 py-1 text-[10px] font-bold transition-colors ${
                                isMine
                                  ? 'self-end border-[var(--accent)]/20 bg-[var(--card)]/70 text-[var(--accent)] hover:bg-[var(--card)]'
                                  : 'border-[var(--accent)]/20 bg-[var(--toss-blue-light)] text-[var(--accent)] hover:bg-[var(--toss-blue-light)]/80'
                              }`}>
                              {threadBadgeLabel}
                            </button>
                          ) : null}
                          {showThreadAttention ? (
                            <span
                              data-testid={`chat-thread-needs-attention-${msg.id}`}
                              className={`mt-1 inline-flex items-center gap-1 rounded-[var(--radius-md)] px-2.5 py-1 text-[10px] font-bold ${
                                isMine
                                  ? 'self-end bg-amber-500/10 text-amber-700'
                                  : 'bg-amber-500/10 text-amber-700'
                              }`}>
                              답변 필요
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {isMine && deliveryStateLabel && (
                        <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
                          <span
                            className={`inline-flex items-center rounded-[var(--radius-md)] px-2.5 py-1 text-[10px] font-bold ${
                              deliveryState === 'failed'
                                ? 'bg-red-500/10 text-red-500'
                                : 'bg-[var(--success-light)] text-[var(--success)]'
                            }`}>
                            {deliveryStateLabel}
                          </span>
                          {deliveryState === 'failed' && (
                            <button
                              data-testid={`chat-message-retry-${msg.id}`}
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onRetryFailedMessage(String(msg.id));
                              }}
                              className="px-2.5 py-1 rounded-[var(--radius-md)] text-[10px] font-bold bg-red-500/10 text-red-500 hover:bg-red-500/20"
                              aria-label="재전송">
                              재전송
                            </button>
                          )}
                        </div>
                      )}
                      {isMine && deliveryState === 'failed' && deliveryErrorText && (
                        <p className="mt-1 max-w-[78%] text-right text-[10px] text-red-500 break-words">
                          {deliveryErrorText}
                        </p>
                      )}
                      {!isDeletedMessage && (
                        <>
                          <div
                            data-chat-active-action-scope={isActionActive ? 'true' : undefined}
                            data-testid={isActionActive ? 'chat-message-actions-panel' : `chat-message-inline-actions-${msg.id}`}
                            className={`flex max-w-full items-center gap-1.5 overflow-x-auto overflow-y-hidden transition-all ${isMine ? 'self-end' : 'self-start'} ${
                              isActionActive
                                ? 'mt-1 max-h-12 opacity-100 pointer-events-auto'
                                : 'max-h-0 opacity-0 pointer-events-none [@media(hover:hover)]:group-hover:mt-1 [@media(hover:hover)]:group-hover:max-h-12 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-hover:pointer-events-auto'
                            }`}
                            onClick={(event) => event.stopPropagation()}>
                            <button
                              type="button"
                              data-testid={isActionActive ? 'chat-message-action-emoji' : undefined}
                              title="이모지 반응"
                              aria-label="이모지 반응"
                              onClick={() => {
                                onOpenMessageActions(msg);
                                setOpenInlinePanel((current) =>
                                  current?.messageId === messageId && current.type === 'emoji'
                                    ? null
                                    : { messageId, type: 'emoji' },
                                );
                              }}
                              className={inlineIconButtonClass}>
                              <SmilePlus className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              data-testid={isActionActive ? 'chat-message-action-add-task' : undefined}
                              title="할 일 등록"
                              aria-label="할 일 등록"
                              onClick={() => {
                                setOpenInlinePanel(null);
                                void onAddTask(msg);
                              }}
                              className={inlineIconButtonClass}>
                              <ClipboardList className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              data-testid={isActionActive ? 'chat-message-action-pin' : undefined}
                              title={isPinnedMessage ? '공지 해제' : '공지로 등록'}
                              aria-label={isPinnedMessage ? '공지 해제' : '공지로 등록'}
                              onClick={() => {
                                setOpenInlinePanel(null);
                                void onTogglePin(msg);
                              }}
                              className={`${inlineIconButtonClass} ${isPinnedMessage ? 'border-orange-300 bg-orange-50 text-orange-600 dark:bg-orange-950/30' : ''}`}>
                              <Megaphone className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              data-testid={isActionActive ? 'chat-message-action-copy-text' : undefined}
                              title="복사"
                              aria-label="복사"
                              onClick={() => {
                                setOpenInlinePanel(null);
                                void copyMessageText(msg);
                                onCloseMessageActions();
                              }}
                              className={inlineIconButtonClass}>
                              <Copy className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              data-testid={isActionActive ? 'chat-message-action-reply' : undefined}
                              title="답장"
                              aria-label="답장"
                              onClick={() => {
                                setOpenInlinePanel(null);
                                onStartReplyToMessage(msg);
                              }}
                              className={inlineIconButtonClass}>
                              <MessageSquareReply className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              data-testid={isActionActive ? 'chat-message-action-forward' : undefined}
                              title="전달"
                              aria-label="전달"
                              onClick={() => {
                                setOpenInlinePanel(null);
                                onForwardMessage(msg);
                              }}
                              className={inlineIconButtonClass}>
                              <Forward className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              data-testid={isActionActive ? 'chat-message-action-forward-self' : undefined}
                              title="나에게 전달"
                              aria-label="나에게 전달"
                              onClick={() => {
                                setOpenInlinePanel(null);
                                void onForwardToSelf(msg);
                              }}
                              className={inlineIconButtonClass}>
                              <Send className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              data-testid={isActionActive ? 'chat-message-action-more' : undefined}
                              title="더보기"
                              aria-label="더보기"
                              onClick={() => {
                                onOpenMessageActions(msg);
                                setOpenInlinePanel((current) =>
                                  current?.messageId === messageId && current.type === 'more'
                                    ? null
                                    : { messageId, type: 'more' },
                                );
                              }}
                              className={inlineIconButtonClass}>
                              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>

                          {inlinePanelType === 'emoji' && (
                            <div
                              data-chat-active-action-scope={isActionActive ? 'true' : undefined}
                              data-testid={`chat-message-emoji-panel-${msg.id}`}
                              className={`mt-1 flex max-w-full items-center gap-1 overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-1.5 shadow-sm ${isMine ? 'self-end' : 'self-start'}`}
                              onClick={(event) => event.stopPropagation()}>
                              {INLINE_REACTIONS.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  title={`${emoji} 반응`}
                                  aria-label={`${emoji} 반응`}
                                  onClick={() => {
                                    void onToggleReaction(msg, emoji);
                                    setOpenInlinePanel(null);
                                    onCloseMessageActions();
                                  }}
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-xl transition-colors hover:bg-[var(--toss-blue-light)] active:scale-95">
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}

                          {inlinePanelType === 'more' && (
                            <div
                              data-chat-active-action-scope={isActionActive ? 'true' : undefined}
                              data-testid={`chat-message-more-panel-${msg.id}`}
                              className={`mt-1.5 flex w-[190px] max-w-[calc(100vw-4rem)] flex-col gap-1 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-2 shadow-sm ${isMine ? 'self-end' : 'self-start'}`}
                              onClick={(event) => event.stopPropagation()}>
                              <button
                                type="button"
                                data-testid="chat-message-action-read-status"
                                title="읽음 확인"
                                onClick={() => {
                                  setOpenInlinePanel(null);
                                  onLoadReadStatus(msg);
                                  onCloseMessageActions();
                                }}
                                className={inlineMoreItemClass}>
                                <Eye className="h-4 w-4 text-[var(--toss-gray-4)]" aria-hidden="true" />
                                <span>읽음 확인</span>
                              </button>
                              <button
                                type="button"
                                data-testid="chat-message-action-bookmark"
                                title={isBookmarkedMessage ? '북마크 해제' : '중요 메시지 북마크'}
                                onClick={() => {
                                  setOpenInlinePanel(null);
                                  void onToggleBookmark(msg);
                                }}
                                className={inlineMoreItemClass}>
                                <Bookmark className={`h-4 w-4 ${isBookmarkedMessage ? 'fill-[var(--accent)] text-[var(--accent)]' : 'text-[var(--toss-gray-4)]'}`} aria-hidden="true" />
                                <span>{isBookmarkedMessage ? '북마크 해제' : '중요 메시지 북마크'}</span>
                              </button>
                              {isMine && (
                                <>
                                  <div className="my-1 h-px bg-[var(--border)]" />
                                  <button
                                    type="button"
                                    data-testid="chat-message-action-edit"
                                    title="메시지 수정"
                                    onClick={() => {
                                      setOpenInlinePanel(null);
                                      onStartEdit(msg);
                                    }}
                                    className={inlineMoreItemClass}>
                                    <Pencil className="h-4 w-4 text-[var(--toss-gray-4)]" aria-hidden="true" />
                                    <span>메시지 수정</span>
                                  </button>
                                  <button
                                    type="button"
                                    data-testid="chat-message-action-edit-history"
                                    title="수정 기록"
                                    onClick={() => {
                                      setOpenInlinePanel(null);
                                      void onOpenEditHistory(msg);
                                    }}
                                    className={inlineMoreItemClass}>
                                    <ClipboardList className="h-4 w-4 text-[var(--toss-gray-4)]" aria-hidden="true" />
                                    <span>수정 기록</span>
                                  </button>
                                </>
                              )}
                              {canDeleteMessage && (
                                <button
                                  type="button"
                                  data-testid="chat-message-action-delete"
                                  title="메시지 삭제"
                                  onClick={() => {
                                    setOpenInlinePanel(null);
                                    void onDeleteMessage(msg);
                                  }}
                                  className={`${inlineMoreItemClass} text-red-600 hover:bg-red-500/10`}>
                                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                                  <span>메시지 삭제</span>
                                </button>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
      })}
    </>
  );
}
