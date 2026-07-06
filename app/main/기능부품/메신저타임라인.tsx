'use client';
// 2026-05-27 (14) 채팅 액션 박스 통합 — MessageActionsHost via 메신저액션서브
import { useLayoutEffect, useEffect, useState, useRef, useCallback, memo } from 'react';
import type { MutableRefObject, ReactNode, RefObject } from 'react';
import { getProfilePhotoUrl } from '@/lib/profile-photo';
import { toast } from '@/lib/toast';
import type { ChatMessage, StaffMember } from '@/types';
import {
  AttachmentListCard,
  DeferredAttachmentImage,
  getAttachmentDisplayName,
  getDeletedMessagePreviewText,
  getMessageDisplayText,
  resolveAttachmentKind,
  type AttachmentPreviewKind } from './메신저첨부';
import { renderWithInlineEmoticons } from './메신저메시지렌더';
import { MessengerAvatar } from './메신저공통';
import { extractWardMessageMeta, extractPollMetaFromQuestion, WARD_QUICK_REPLY_OPTIONS, toChatDate } from './메신저유틸';
import type { ThreadSummary } from './메신저파생훅';
import { MessageActionsHost } from './메신저액션서브';
import { MenuIcon } from './조직도서브/조직도측면창';
import { useIsMobile } from '@/app/components/useIsMobile';

type PollItem = {
  id: string;
  room_id?: string | null;
  creator_id?: string | null;
  question: string;
  options: string[];
  created_at?: string | null;
  type: 'poll';
  [key: string]: unknown;
};

type MessengerMessageItem = ChatMessage & {
  type?: 'message';
  staff?: { name?: string; position?: string; photo_url?: string | null } | null;
  reply_to_id?: string | null;
};

type MessengerAlbumItem = ChatMessage & {
  type: 'album';
  albumMessages: ChatMessage[];
  staff?: { name?: string; photo_url?: string | null } | null;
};

export type MessengerTimelineItem = PollItem | MessengerMessageItem | MessengerAlbumItem;

type DeliveryState = {
  status: 'sending' | 'failed' | 'sent';
  error?: string | null;
};

const INLINE_ACTION_REACTIONS = ['👍', '❤️', '🙏', '👏', '😊', '👌'];
const inlineActionButtonClass =
  'shrink-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-[10px] font-bold text-[var(--foreground)] shadow-sm transition hover:border-[var(--accent)] hover:bg-[var(--toss-blue-light)]';
const inlineDangerActionButtonClass =
  'shrink-0 rounded-[var(--radius-md)] border border-red-500/20 bg-red-500/5 px-2.5 py-1.5 text-[10px] font-bold text-red-600 shadow-sm transition hover:bg-red-500/10';

const formatTimelineDateKey = (value?: string | null) => {
  const date = toChatDate(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

async function copyMessageText(message: ChatMessage) {
  const text = getMessageDisplayText(
    message.content,
    message.file_name,
    message.file_url,
    message.file_url ? '첨부 파일' : '',
  );

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

type MessengerTimelineProps = {
  selectedRoomId: string | null;
  isLoadingMessages?: boolean;
  messages: ChatMessage[];
  combinedTimeline: MessengerTimelineItem[];
  pollVotes: Record<string, Record<number, number>>;
  reactions: Record<string, Record<string, number>>;
  readCounts: Record<string, number>;
  deliveryStates: Record<string, DeliveryState>;
  threadSummaries: Record<string, ThreadSummary>;
  activeActionMessageId?: string | null;
  pinnedIds?: string[];
  bookmarkedIds?: Set<string>;
  roomMembers: StaffMember[];
  effectiveChatUserId: string;
  activeMessageHighlightQuery: string;
  wardQuickReplySendingMessageId: string | null;
  messageRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  messageListRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  showScrollToLatest?: boolean;
  resolveStaffProfile: (staffId: string | null | undefined, fallbackName?: string | null) => StaffMember | null;
  onScrollToMessage: (messageId: string) => void;
  onMessageListScroll: () => void;
  onVote: (pollId: string, optionIndex: number) => void;
  onDrawPrize?: (pollId: string) => void | Promise<void>;
  onOpenAttachmentPreviewForMessage: (message: ChatMessage) => void;
  onStartReplyToMessage: (message: ChatMessage) => void;
  onOpenThread: (message: ChatMessage) => void;
  onOpenMessageActions: (message: ChatMessage) => void;
  onCloseMessageActions?: () => void;
  onToggleReaction?: (message: ChatMessage, emoji: string) => void | Promise<void>;
  onAddTask?: (message: ChatMessage) => void | Promise<void>;
  onTogglePin?: (message: ChatMessage) => void | Promise<void>;
  onToggleBookmark?: (message: ChatMessage) => void | Promise<void>;
  onForwardMessage?: (message: ChatMessage) => void;
  onDeleteMessage?: (message: ChatMessage) => void | Promise<void>;
  onStartEdit?: (message: ChatMessage) => void;
  onOpenEditHistory?: (message: ChatMessage) => void | Promise<void>;
  onCopyMessageLink?: (message: ChatMessage) => void | Promise<void>;
  onOpenReadStatusPanel?: (message: ChatMessage) => void;
  onOpenThreadPanel?: (message: ChatMessage) => void;
  onMarkMessageRead: (message: ChatMessage) => void;
  renderMessageContent: (content: string, isMine?: boolean, highlightQuery?: string) => ReactNode;
  onOpenAttachmentPreview: (url: string, name: string, kind: AttachmentPreviewKind) => void;
  onOpenReactionDetail: (message: ChatMessage, emoji: string) => void;
  onLoadReadStatus: (message: ChatMessage) => void;
  onSendWardQuickReply: (message: ChatMessage, replyText: string) => void | Promise<void>;
  onRetryFailedMessage: (messageId: string) => void;
  onScrollToBottom: (behavior?: ScrollBehavior) => void;
  shouldKeepBottomAligned?: () => boolean;
  onMediaLoad?: () => void;
  onOpenBoardPost?: (boardType: string, postId: string) => void;
  onOpenDateJump?: (dateKey: string) => void;
  onOpenStaffProfile?: (staff: StaffMember) => void;
};

function MessengerTimelineComponent({
  selectedRoomId,
  messages,
  combinedTimeline,
  pollVotes,
  reactions,
  readCounts,
  deliveryStates,
  threadSummaries,
  activeActionMessageId = null,
  pinnedIds = [],
  bookmarkedIds = new Set<string>(),
  roomMembers,
  effectiveChatUserId,
  activeMessageHighlightQuery,
  wardQuickReplySendingMessageId,
  messageRefs,
  messageListRef,
  scrollRef,
  showScrollToLatest = false,
  resolveStaffProfile,
  onScrollToMessage,
  onMessageListScroll,
  onVote,
  onDrawPrize,
  onOpenAttachmentPreviewForMessage,
  onStartReplyToMessage,
  onOpenThread,
  onOpenMessageActions,
  onCloseMessageActions = () => {},
  onToggleReaction = () => {},
  onAddTask = () => {},
  onTogglePin = () => {},
  onToggleBookmark = () => {},
  onForwardMessage = () => {},
  onDeleteMessage = () => {},
  onStartEdit = () => {},
  onOpenEditHistory = () => {},
  onCopyMessageLink = () => {},
  onOpenReadStatusPanel,
  onOpenThreadPanel,
  onMarkMessageRead,
  renderMessageContent,
  onOpenAttachmentPreview,
  onOpenReactionDetail,
  onLoadReadStatus,
  onSendWardQuickReply,
  onRetryFailedMessage,
  onScrollToBottom,
  shouldKeepBottomAligned,
  onMediaLoad,
  onOpenDateJump,
  onOpenStaffProfile,
  onOpenBoardPost }: MessengerTimelineProps) {
  const isMobile = useIsMobile();

  useLayoutEffect(() => {
    if (!selectedRoomId) return;

    const listElement = messageListRef.current;
    if (!listElement) return;
    if (shouldKeepBottomAligned && !shouldKeepBottomAligned()) return;

    const alignToBottom = () => {
      listElement.scrollTop = Math.max(0, listElement.scrollHeight - listElement.clientHeight);
    };

    // 즉시 + 한 번의 rAF(페인트 후) 초기 스크롤
    alignToBottom();
    const frameId = window.requestAnimationFrame(alignToBottom);
    const nudgeTimerIds = [
      window.setTimeout(alignToBottom, 80),
      window.setTimeout(alignToBottom, 240),
    ];

    // 방 전환 직후엔 콘텐츠가 없을 수 있으므로, ResizeObserver에서
    // 콘텐츠가 처음 채워질 때도 하단 정렬 (pendingAlign 플래그로 제어)
    let pendingAlign = true;

    const observer = new ResizeObserver(() => {
      if (shouldKeepBottomAligned && !shouldKeepBottomAligned()) {
        pendingAlign = false;
        return;
      }
      const dist = listElement.scrollHeight - listElement.scrollTop - listElement.clientHeight;
      if (pendingAlign) {
        // 방 전환 후 첫 콘텐츠 렌더 → 무조건 하단 정렬
        alignToBottom();
        if (dist <= 2) pendingAlign = false; // 정착 완료
      } else if (dist > 0 && dist < 32) {
        // 이미지 로드 등으로 인한 높이 변화 → 하단 근처면 정렬
        alignToBottom();
      }
    });

    const inner = listElement.firstElementChild;
    if (inner) observer.observe(inner);

    return () => {
      pendingAlign = false;
      window.cancelAnimationFrame(frameId);
      nudgeTimerIds.forEach((timerId) => window.clearTimeout(timerId));
      observer.disconnect();
    };
  }, [messageListRef, selectedRoomId, shouldKeepBottomAligned]);

  // 스크롤 중 현재 보고 있는 메시지의 날짜를 우측에 잠시 표시한다.
  // 날짜 구분선(data-date-label)들 중 스크롤 상단에 고정(sticky)된 마지막 것이 현재 날짜.
  const [scrollDateLabel, setScrollDateLabel] = useState('');
  const [scrollDateShown, setScrollDateShown] = useState(false);
  const scrollDateRafRef = useRef<number | null>(null);
  const scrollDateHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateScrollDateIndicator = useCallback(() => {
    if (scrollDateRafRef.current != null) return;
    scrollDateRafRef.current = window.requestAnimationFrame(() => {
      scrollDateRafRef.current = null;
      const container = messageListRef.current;
      if (!container) return;
      const threshold = container.getBoundingClientRect().top + 16;
      const dividers = container.querySelectorAll<HTMLElement>('[data-date-label]');
      let current = '';
      for (let index = 0; index < dividers.length; index += 1) {
        if (dividers[index].getBoundingClientRect().top <= threshold) {
          current = dividers[index].dataset.dateShort || dividers[index].dataset.dateLabel || current;
        } else {
          break;
        }
      }
      if (!current && dividers.length > 0) {
        current = dividers[0].dataset.dateShort || dividers[0].dataset.dateLabel || '';
      }
      if (current) {
        setScrollDateLabel(current);
        setScrollDateShown(true);
      }
      if (scrollDateHideTimerRef.current) clearTimeout(scrollDateHideTimerRef.current);
      scrollDateHideTimerRef.current = setTimeout(() => setScrollDateShown(false), 2000);
    });
  }, [messageListRef]);

  const handleMessageListScroll = useCallback(() => {
    onMessageListScroll();
    updateScrollDateIndicator();
  }, [onMessageListScroll, updateScrollDateIndicator]);

  useEffect(() => {
    setScrollDateShown(false);
  }, [selectedRoomId]);

  useEffect(() => {
    return () => {
      if (scrollDateRafRef.current != null) {
        window.cancelAnimationFrame(scrollDateRafRef.current);
      }
      if (scrollDateHideTimerRef.current) {
        clearTimeout(scrollDateHideTimerRef.current);
      }
    };
  }, []);

  const renderDateDivider = (dateLabel: string, dateKey: string, dateShort?: string) => (
    <div data-testid="chat-date-divider" data-date-label={dateLabel} data-date-short={dateShort || dateLabel} className="my-2 flex items-center justify-center md:my-3">
      <button
        type="button"
        onClick={() => {
          if (dateKey) onOpenDateJump?.(dateKey);
        }}
        className="shrink-0 rounded-full bg-[var(--muted)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--toss-gray-3)] transition-colors hover:bg-[var(--toss-blue-light)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
        title="날짜로 이동"
        aria-label={`${dateLabel} 날짜로 이동`}
      >
        {dateLabel}
      </button>
    </div>
  );

  return (
    <div className="relative flex flex-1 min-h-0 flex-col">
      <div
        ref={messageListRef}
        data-testid="chat-message-list"
        onScroll={handleMessageListScroll}
        onClick={onCloseMessageActions}
        className="flex-1 min-h-0 overflow-y-auto px-2 py-0.5 pb-1 md:px-4 md:py-2 md:pb-2 space-y-0 custom-scrollbar"
      >
        {!selectedRoomId ? (
          <div className="h-full flex flex-col items-center justify-center text-[var(--toss-gray-3)]">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-light)] text-[var(--accent)]">
              <MenuIcon name="chat" className="h-6 w-6" />
            </span>
            <p className="text-sm font-bold">채팅방을 선택하세요.</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-20">
            <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-[var(--radius-md)] bg-[var(--tab-bg)] text-[var(--toss-gray-4)]">
              <MenuIcon name="chat" className="h-8 w-8" />
            </span>
            <p className="font-semibold text-sm">대화 내용이 없습니다.</p>
          </div>
        ) : (
          (() => {
            let lastDateLabel = '';
            let lastSenderId = '';

            return combinedTimeline.map((item) => {
              if (item.type === 'poll') {
                const pollItem = item as PollItem;
                const votes = pollVotes[pollItem.id] || {};
                const totalVotes = (Object.values(votes) as number[]).reduce((a: number, b: number) => a + b, 0);
                const { displayQuestion, prize, prizeWinners } = extractPollMetaFromQuestion(pollItem.question);
                const isCreator = String(pollItem.creator_id) === String(effectiveChatUserId);
                return (
                  <div data-testid={`chat-poll-${pollItem.id}`} key={`poll-${pollItem.id}`} className="max-w-[85%] md:max-w-[70%] bg-blue-500/10 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 rounded-2xl p-4 shadow-soft">
                    <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <span className="text-sm">🗳️</span> 투표
                    </p>
                    <p className="mb-4 text-xs font-bold text-foreground leading-relaxed">{displayQuestion}</p>
                    <div className="space-y-1.5">
                      {(pollItem.options || []).map((opt: string, idx: number) => (
                        <button type="button"
                          data-testid={`chat-poll-vote-${pollItem.id}-${idx}`}
                          key={idx}
                          onClick={() => onVote(pollItem.id, idx)}
                          className="w-full flex justify-between items-center px-4 py-2.5 rounded-xl bg-[var(--card)] dark:bg-zinc-800/50 border border-blue-500/20 dark:border-blue-700/30 hover:border-blue-400 dark:hover:border-blue-500 transition-all text-[11px] font-medium group"
                        >
                          <span className="text-[var(--toss-gray-5)] dark:text-[var(--toss-gray-3)] group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{opt}</span>
                          <span className="text-blue-600 font-bold bg-blue-500/10 dark:bg-blue-900/50 px-2 py-0.5 rounded-md">
                            {votes[idx] || 0}
                            {totalVotes > 0 && <span className="ml-1 opacity-60 font-medium">({Math.round(((votes[idx] || 0) / totalVotes) * 100)}%)</span>}
                          </span>
                        </button>
                      ))}
                    </div>
                    {prize && (
                      <div className="mt-3 pt-3 border-t border-blue-200/50 dark:border-blue-700/30 space-y-1.5">
                        {prizeWinners && prizeWinners.length > 0 ? (
                          <div className="text-[11px] font-semibold text-[var(--foreground)] space-y-0.5">
                            <p className="text-blue-600 dark:text-blue-400">🎁 상품: {prize.name}</p>
                            <p>🎉 당첨: {prizeWinners.map((w) => w.name).join(', ')}</p>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                              🎁 상품: {prize.name} · 당첨 {prize.winnerCount}명
                            </span>
                            {isCreator && onDrawPrize && (
                              <button
                                type="button"
                                onClick={() => void onDrawPrize(pollItem.id)}
                                className="ml-2 px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-[10px] font-bold hover:opacity-90 transition-opacity"
                              >
                                🎁 추첨하기
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              }

              if (item.type === 'album') {
                const albumItem = item as MessengerAlbumItem;
                const albumMsgs = albumItem.albumMessages || [];
                const isMineAlbum = String(albumItem.sender_id) === effectiveChatUserId;
                const senderName = (albumItem.staff as { name?: string } | null)?.name || albumItem.sender_name || '알 수 없음';
                const created = toChatDate(albumItem.created_at);
                const dateLabel = created.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
                const dateShort = `${created.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' })} (${created.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'short' })})`;
                const dateKey = formatTimelineDateKey(albumItem.created_at);
                const showDateDivider = dateLabel !== lastDateLabel;
                if (showDateDivider) lastDateLabel = dateLabel;
                lastSenderId = String(albumItem.sender_id);
                const count = albumMsgs.length;
                const albumMessageIds = albumMsgs
                  .map((message) => String(message.id || '').trim())
                  .filter(Boolean);
                const gridCols = count === 1 ? 'grid-cols-1' : count <= 4 ? 'grid-cols-2' : 'grid-cols-3';
                const timeStr = created.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' });
                const albumReplyTarget =
                  albumMsgs.find((message) => String(message.content || '').trim()) ||
                  albumMsgs[0] ||
                  albumItem;

                return (
                  <div
                    data-testid={`chat-album-${albumItem.album_id || albumItem.id}`}
                    ref={(element) => {
                      messageRefs.current[String(albumItem.id)] = element;
                      albumMessageIds.forEach((messageId) => {
                        messageRefs.current[messageId] = element;
                      });
                    }}
                    key={`album-${albumItem.album_id || albumItem.id}`}
                    className={showDateDivider ? 'mt-0.5 md:mt-1' : 'mt-[2px]'}
                  >
                    {showDateDivider && (
                      renderDateDivider(dateLabel, dateKey, dateShort)
                    )}
                    <div className={`flex items-end gap-2 ${isMineAlbum ? 'flex-row-reverse' : 'flex-row'}`}>
                      {!isMineAlbum && (
                        <button
                          type="button"
                          onClick={() => {
                            const staff = resolveStaffProfile(albumItem.sender_id, senderName);
                            if (staff) onOpenStaffProfile?.(staff);
                          }}
                          className="mb-1 shrink-0 self-end focus-visible:outline-none hover:opacity-85 transition-opacity"
                          title={senderName}
                        >
                          <MessengerAvatar
                            name={senderName}
                            photoUrl={(albumItem.staff as { photo_url?: string | null } | null)?.photo_url || null}
                            className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-[var(--muted)] text-[10px] font-bold text-[var(--toss-gray-4)]"
                            decorative
                          />
                        </button>
                      )}
                      <div className={`group flex flex-col gap-1 max-w-[75%] ${isMineAlbum ? 'items-end' : 'items-start'}`}>
                        {!isMineAlbum && (
                          <span className="text-[11px] font-bold text-[var(--toss-gray-4)] ml-1">{senderName}</span>
                        )}
                        <div className={`grid ${gridCols} gap-0.5 rounded-[var(--radius-lg)] overflow-hidden`} style={{ maxWidth: count === 1 ? 200 : count <= 4 ? 260 : 300 }}>
                          {albumMsgs.map((message, index) => (
                            <button type="button"
                              key={message.id}
                              className={`relative overflow-hidden bg-[var(--muted)] ${count === 3 && index === 2 ? 'col-span-2' : ''} ${count === 5 && index === 3 ? 'col-span-1' : ''}`}
                              style={{ aspectRatio: count === 1 ? '4/3' : '1/1' }}
                              onClick={() => onOpenAttachmentPreviewForMessage(message)}
                              aria-label={`${message.file_name || `앨범 사진 ${index + 1}`} 미리보기`}
                            >
                              <DeferredAttachmentImage
                                src={message.file_url || ''}
                                alt={message.file_name || '사진'}
                                wrapperClassName="h-full w-full"
                                placeholderClassName="h-full w-full animate-pulse bg-[var(--muted)]"
                                fallbackClassName="h-full min-h-0 px-1 text-[10px] leading-tight"
                                className="h-full w-full object-cover"
                                onLoad={() => onMediaLoad?.()}
                              />
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
                              className="font-bold text-amber-700 transition-colors hover:text-amber-800"
                            >
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
              const isGroupChat = roomMembers.length >= 3;
              const isSystemInvite = typeof msg.content === 'string' && msg.content.startsWith('[초대]');
              const senderProfile =
                !isMine
                  ? resolveStaffProfile(
                      String(msg.sender_id || ''),
                      (msg.staff as { name?: string } | null | undefined)?.name || null
                    ) || (msg.staff as StaffMember | null | undefined) || null
                  : null;
              const senderName = senderProfile?.name || (msg.staff as { name?: string } | null | undefined)?.name || msg.sender_name || '이름 없음';
              const isSystemSender = String(msg.sender_id) === 'system' || senderName === '시스템';
              const displayedReadStatusSummary = (isMine || isGroupChat) && !isSystemInvite ? readStatusSummary : null;
              const isAttachmentOnlyMessage = !String(msg.content || '').trim() && Boolean(msg.file_url);
              const created = toChatDate(msg.created_at);
              const dateLabel = created.toLocaleDateString('ko-KR', {
                timeZone: 'Asia/Seoul',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'short' });
              const dateShort = `${created.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' })} (${created.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'short' })})`;
              const dateKey = formatTimelineDateKey(msg.created_at);
              const showDateDivider = dateLabel !== lastDateLabel;
              if (showDateDivider) lastDateLabel = dateLabel;
              const systemText = isSystemInvite ? String(msg.content || '').replace(/^\[초대\]\s*/, '') : '';
              const isContinuous = !showDateDivider && !isSystemInvite && String(msg.sender_id) === lastSenderId;
              const senderPhotoUrl = senderProfile ? getProfilePhotoUrl(senderProfile as StaffMember) : null;
              const wardMessageMeta = !isDeletedMessage ? extractWardMessageMeta(msg.content) : { displayContent: '', meta: null };
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
                ? `참여 ${threadSummary.participantCount}명${threadSummary.latestReplyAt ? ` · 최근 답글 ${toChatDate(threadSummary.latestReplyAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}` : ''}`
                : '';
              const showThreadAttention =
                Boolean(
                  threadSummary &&
                  threadSummary.needsAttention &&
                  String(msg.id) === threadSummary.rootId &&
                  !isDeletedMessage,
                );
              lastSenderId = String(msg.sender_id);

              const hostEnabled = !isSystemInvite && !isDeletedMessage;
              const hostReact = (emoji: string) => {
                void onToggleReaction(msg, emoji);
              };
              const hostReply = () => onStartReplyToMessage(msg);
              const hostCopy = () => {
                void copyMessageText(msg);
              };
              const hostForward = () => onForwardMessage(msg);
              const hostBookmark = () => {
                void onToggleBookmark(msg);
              };
              const hostTask = () => {
                void onAddTask(msg);
              };
              const hostDelete = isMine
                ? () => {
                    void onDeleteMessage(msg);
                  }
                : undefined;

              return (
                <MessageActionsHost
                  key={msg.id}
                  mine={isMine}
                  canDelete={isMine && !isDeletedMessage}
                  enableContextMenu={hostEnabled}
                  testId={`chat-message-row-${msg.id}`}
                  className={isContinuous ? 'mt-[2px]' : 'mt-0.5 md:mt-1'}
                  onReact={hostReact}
                  onReply={hostReply}
                  onCopy={hostCopy}
                  onForward={hostForward}
                  onBookmark={hostBookmark}
                  onTask={hostTask}
                  onDelete={hostDelete}
                >
                  {showDateDivider && (
                    renderDateDivider(dateLabel, dateKey, dateShort)
                  )}
                  {isSystemInvite ? (
                    <div className="flex justify-center my-1" role="status" aria-live="polite">
                      <span className="chat-system">초대 {systemText}</span>
                    </div>
                  ) : (
                    <div
                      ref={(element) => { messageRefs.current[msg.id] = element; }}
                      className={`flex w-full flex-col ${isMine ? 'items-end' : 'items-start'}`}
                    >
                      <div className={`flex ${isMine ? 'max-w-[78%] flex-col items-end md:max-w-[72%]' : 'w-full items-start gap-2'}`}>
                        {!isMine ? (
                          showIncomingAvatar ? (
                            <button
                              type="button"
                              onClick={() => {
                                const staff = resolveStaffProfile(msg.sender_id, senderName);
                                if (staff) onOpenStaffProfile?.(staff);
                              }}
                              data-testid={`chat-message-sender-avatar-${msg.id}`}
                              className="shrink-0 self-start pt-0.5 focus-visible:outline-none hover:opacity-85 transition-opacity"
                              title={senderName}
                            >
                              <MessengerAvatar
                                name={senderName}
                                photoUrl={senderPhotoUrl}
                                className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-[var(--tab-bg)] text-[10px] font-bold text-[var(--toss-gray-3)] ring-1 ring-black/5"
                                decorative
                              />
                            </button>
                          ) : (
                            <div aria-hidden="true" className="w-7 shrink-0" />
                          )
                        ) : null}
                        <div
                          data-testid={!isMine ? `chat-message-stack-${msg.id}` : undefined}
                          className={isMine ? 'group flex w-full flex-col items-end' : 'group flex min-w-0 max-w-[82%] flex-col items-start md:max-w-[74%]'}
                        >
                          {!isMine && showIncomingAvatar && (
                            <span
                              data-testid={`chat-message-sender-name-${msg.id}`}
                              className="chat-bub-name"
                            >
                              {senderName}
                            </span>
                          )}
                          <div
                            data-testid={isDeletedMessage ? `chat-message-deleted-${msg.id}` : `chat-message-${msg.id}`}
                            onClick={(event) => {
                              if (isDeletedMessage) return;
                              event.stopPropagation();

                              if (msg.content && msg.content.includes('[[BOARD_META]]')) {
                                const start = msg.content.indexOf('[[BOARD_META]]');
                                const end = msg.content.indexOf('[[/BOARD_META]]');
                                if (start >= 0 && end > start) {
                                  try {
                                    const jsonStr = msg.content.slice(start + 14, end);
                                    const meta = JSON.parse(jsonStr);
                                    const boardType = meta.board_type || meta.boardId || meta.board_id || '';
                                    const postId = meta.post_id || meta.postId || '';
                                    if (boardType && postId && onOpenBoardPost) {
                                      onOpenBoardPost(boardType, postId);
                                      return;
                                    }
                                  } catch (e) {
                                    console.error('Failed to parse board meta', e);
                                  }
                                }
                              }

                              if (isMobile) {
                                // 답글 프리뷰·링크·버튼 등 내부 인터랙티브 요소를 탭한 경우 컨텍스트 메뉴 열지 않음
                                const targetEl = event.target as HTMLElement;
                                if (
                                  targetEl.closest('[data-testid^="chat-reply-preview-"]') ||
                                  targetEl.closest('a') ||
                                  targetEl.closest('button')
                                ) {
                                  return;
                                }
                                const customEvent = new MouseEvent('contextmenu', {
                                  bubbles: true,
                                  cancelable: true,
                                  clientX: event.clientX,
                                  clientY: event.clientY });
                                event.currentTarget.dispatchEvent(customEvent);
                              }
                            }}
                            className={`group relative ${
                              isDeletedMessage
                                ? 'border border-dashed border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-[var(--toss-gray-3)] italic'
                                : !msg.content
                                  ? 'p-0 bg-transparent shadow-none border-none'
                                  : 'border px-3 py-2'
                            } rounded-[var(--radius-lg)] text-[13px] md:text-sm ${isDeletedMessage ? 'cursor-default' : 'cursor-pointer'} transition-all max-w-full ${
                              isDeletedMessage
                                ? isMine
                                  ? 'rounded-br-[4px]'
                                  : 'rounded-bl-[4px]'
                                : !msg.content
                                  ? ''
                                  : isMine
                                    ? 'bg-[var(--accent)] text-white border-transparent rounded-br-[4px]'
                                    : 'bg-[var(--card)] border-[var(--border)] rounded-bl-[4px] hover:border-[var(--accent)]/40 text-[var(--foreground)]'
                            }`}
                            role="article"
                            aria-roledescription="채팅 메시지"
                            tabIndex={isDeletedMessage ? -1 : 0}
                            onKeyDown={(event) => {
                              if (isDeletedMessage) return;
                              if (event.key === 'Enter') {
                                if (msg.content && msg.content.includes('[[BOARD_META]]')) {
                                  const start = msg.content.indexOf('[[BOARD_META]]');
                                  const end = msg.content.indexOf('[[/BOARD_META]]');
                                  if (start >= 0 && end > start) {
                                    try {
                                      const jsonStr = msg.content.slice(start + 14, end);
                                      const meta = JSON.parse(jsonStr);
                                      const boardType = meta.board_type || meta.boardId || meta.board_id || '';
                                      const postId = meta.post_id || meta.postId || '';
                                      if (boardType && postId && onOpenBoardPost) {
                                        onOpenBoardPost(boardType, postId);
                                        return;
                                      }
                                    } catch (e) {
                                      console.error('Failed to parse board meta', e);
                                    }
                                  }
                                }
                                onMarkMessageRead(msg);
                              }
                            }}
                            aria-label={`${msg.staff?.name || '이름 없음'} ${isDeletedMessage ? '삭제된 메시지' : '메시지'}`}
                          >
                            {!isDeletedMessage && msg.reply_to_id && (() => {
                              const parent = messages.find((message) => message.id === msg.reply_to_id);
                              const replyPreviewClass = isMine
                                ? isAttachmentOnlyMessage
                                  ? 'bg-[var(--toss-blue-light)] border-[var(--accent)]/30 text-[var(--foreground)] shadow-sm'
                                  : 'bg-white/10 border-white/40 text-white/90'
                                : 'bg-[var(--muted)] border-[var(--accent)]/40 text-[var(--foreground)]';
                              return (
                                <div
                                  data-testid={`chat-reply-preview-${msg.id}`}
                                  className={`mb-1 p-1.5 rounded-[var(--radius-md)] text-[11px] border-l-2 cursor-pointer hover:opacity-80 transition-opacity ${replyPreviewClass}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onScrollToMessage(msg.reply_to_id!);
                                  }}
                                >
                                  {parent ? (
                                    <>
                                      <span className="font-bold opacity-80">답글 {(parent.staff as { name?: string } | null | undefined)?.name}: </span>
                                      <span className="truncate block mt-0.5">
                                        {renderWithInlineEmoticons(
                                          getMessageDisplayText(
                                            parent.content,
                                            parent.file_name,
                                            parent.file_url,
                                            '첨부 파일'
                                          ),
                                          false,
                                          ''
                                        )}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="opacity-60 italic">이전 메시지 보기 ↑</span>
                                  )}
                                </div>
                              );
                            })()}
                            <div className={`leading-relaxed ${msg.content && !isDeletedMessage ? 'mb-0.5' : ''}`}>
                              {isDeletedMessage ? getDeletedMessagePreviewText() : renderMessageContent(msg.content || '', isMine, activeMessageHighlightQuery)}
                            </div>
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
                                      // 이미지는 채팅방 전체 갤러리로 묶어 좌우 키/버튼 탐색 가능하게,
                                      // 그 외 파일/비디오/PDF는 단일 미리보기.
                                      if (attachmentKind === 'image') {
                                        onOpenAttachmentPreviewForMessage(msg);
                                      } else {
                                        onOpenAttachmentPreview(fileUrl, attachmentName, attachmentKind);
                                      }
                                    }}
                                    layout="bubble"
                                    tone={isMine ? 'accent' : 'default'}
                                    onMediaLoad={onMediaLoad}
                                  />
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
                                        aria-label={`${emoji} 반응 누른 사람 ${count}명 보기`}
                                      >
                                        {emoji} {count}
                                      </button>
                                    ) : null)
                                  )}
                                </span>
                              </div>
                            )}

                            <div
                              className={`absolute bottom-0 z-10 ${isMine ? 'right-full mr-2 items-end' : 'left-full ml-2 items-start'} flex flex-col gap-0.5 whitespace-nowrap`}
                            >
                              {displayedReadStatusSummary && (
                                canOpenReadStatus ? (
                                  <button
                                    data-testid={`chat-message-read-status-${msg.id}`}
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      onLoadReadStatus(msg);
                                    }}
                                    className="text-[10px] font-bold tabular-nums text-emerald-500 hover:text-emerald-600 underline underline-offset-2"
                                  >
                                    {displayedReadStatusSummary}
                                  </button>
                                ) : (
                                  <span
                                    data-testid={`chat-message-read-status-${msg.id}`}
                                    className={`text-[10px] font-bold tabular-nums ${deliveryState === 'failed' ? 'text-red-500' : 'text-emerald-500'}`}
                                  >
                                    {displayedReadStatusSummary}
                                  </span>
                                )
                              )}
                              <span className="text-[10px] font-bold tabular-nums text-[var(--toss-gray-3)]">
                                {created.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                          {showWardQuickReplies && (
                            <div
                              data-testid={`chat-ward-quick-replies-${msg.id}`}
                              className="mt-2 flex w-full flex-col gap-1"
                              onClick={(event) => event.stopPropagation()}
                            >
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
                                    className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:border-[var(--accent)] hover:bg-[var(--toss-blue-light)] disabled:cursor-wait disabled:opacity-60"
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {!isDeletedMessage && msg.edited_at && (
                            <p
                              data-testid={`chat-message-edited-${msg.id}`}
                              className={`mt-1 px-1 text-[10px] font-semibold text-amber-600 ${isMine ? 'text-right' : 'text-left'}`}
                            >
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
                              className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors ${
                                isMine
                                  ? 'self-end border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:border-blue-300 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-400 shadow-sm'
                                  : 'border-[var(--accent)]/20 bg-[var(--toss-blue-light)] text-[var(--accent)] hover:bg-[var(--toss-blue-light)]/80'
                              }`}
                            >
                              {threadBadgeLabel}
                            </button>
                          ) : null}
                        </div>
                      </div>
                      {isMine && deliveryStateLabel && (
                        <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold ${
                              deliveryState === 'failed'
                                ? 'bg-red-500/10 text-red-500'
                                : 'bg-emerald-50 text-emerald-600'
                            }`}
                          >
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
                              aria-label="재전송"
                            >
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
                    </div>
                  )}
                </MessageActionsHost>
              );
            });
          })()
        )}

        <div ref={scrollRef} />
      </div>

      {selectedRoomId && scrollDateLabel && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute right-4 top-3 z-20 transition-opacity duration-300 ${
            scrollDateShown ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <span className="rounded-full bg-[var(--foreground)]/80 px-2.5 py-1 text-[10px] font-bold text-[var(--card)] shadow-md">
            {scrollDateLabel}
          </span>
        </div>
      )}

      {showScrollToLatest && selectedRoomId && (
        <div className="absolute right-4 bottom-4 z-20">
          <button
            type="button"
            onClick={() => onScrollToBottom('smooth')}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-lg font-bold text-[var(--accent)] shadow-sm transition-colors hover:bg-[var(--toss-blue-light)]"
            aria-label="최신 메시지로 이동"
            title="최신 메시지로 이동"
          >
            ↓
          </button>
        </div>
      )}
    </div>
  );
}

export const MessengerTimeline = memo(MessengerTimelineComponent);
