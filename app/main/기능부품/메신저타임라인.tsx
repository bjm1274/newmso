'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MutableRefObject, ReactNode, RefObject } from 'react';
import { getProfilePhotoUrl } from '@/lib/profile-photo';
import type { ChatMessage, StaffMember } from '@/types';
import {
  AttachmentListCard,
  getAttachmentDisplayName,
  getDeletedMessagePreviewText,
  getMessageDisplayText,
  resolveAttachmentKind,
  type AttachmentPreviewKind,
} from './메신저첨부';
import { MessengerAvatar } from './메신저공통';
import { extractPollMetaFromQuestion, extractWardMessageMeta, WARD_QUICK_REPLY_OPTIONS } from './메신저유틸';

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

function formatTimelineDateLabel(value: string | number | Date | null | undefined) {
  return new Date(value || 0).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

type DeliveryState = {
  status: 'sending' | 'failed' | 'sent';
  error?: string | null;
};

type MessengerTimelineProps = {
  selectedRoomId: string | null;
  noticeMessages: ChatMessage[];
  messages: ChatMessage[];
  combinedTimeline: MessengerTimelineItem[];
  pollVotes: Record<string, Record<number, number>>;
  reactions: Record<string, Record<string, number>>;
  readCounts: Record<string, number>;
  deliveryStates: Record<string, DeliveryState>;
  roomMembers: StaffMember[];
  effectiveChatUserId: string;
  activeMessageHighlightQuery: string;
  wardQuickReplySendingMessageId: string | null;
  messageRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  messageListRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  showScrollToLatest: boolean;
  scrollToLatestRequestToken: number;
  resolveStaffProfile: (staffId: string | null | undefined, fallbackName?: string | null) => StaffMember | null;
  onScrollToMessage: (messageId: string) => void;
  onMessageListScroll: () => void;
  onVote: (pollId: string, optionIndex: number) => void;
  onOpenAttachmentPreviewForMessage: (message: ChatMessage) => void;
  onStartReplyToMessage: (message: ChatMessage) => void;
  onOpenMessageActions: (message: ChatMessage) => void;
  onMarkMessageRead: (message: ChatMessage) => void;
  renderMessageContent: (content: string, isMine?: boolean, highlightQuery?: string) => ReactNode;
  onOpenAttachmentPreview: (url: string, name: string, kind: AttachmentPreviewKind) => void;
  onOpenReactionDetail: (message: ChatMessage, emoji: string) => void;
  onLoadReadStatus: (message: ChatMessage) => void;
  onSendWardQuickReply: (message: ChatMessage, replyText: string) => void | Promise<void>;
  onRetryFailedMessage: (messageId: string) => void;
  onScrollToBottom: (behavior?: ScrollBehavior) => void;
};

export function MessengerTimeline({
  selectedRoomId,
  noticeMessages,
  messages,
  combinedTimeline,
  pollVotes,
  reactions,
  readCounts,
  deliveryStates,
  roomMembers,
  effectiveChatUserId,
  activeMessageHighlightQuery,
  wardQuickReplySendingMessageId,
  messageRefs,
  messageListRef,
  scrollRef,
  showScrollToLatest,
  scrollToLatestRequestToken,
  resolveStaffProfile,
  onScrollToMessage,
  onMessageListScroll,
  onVote,
  onOpenAttachmentPreviewForMessage,
  onStartReplyToMessage,
  onOpenMessageActions,
  onMarkMessageRead,
  renderMessageContent,
  onOpenAttachmentPreview,
  onOpenReactionDetail,
  onLoadReadStatus,
  onSendWardQuickReply,
  onRetryFailedMessage,
  onScrollToBottom,
}: MessengerTimelineProps) {
  const [scrollDateLabel, setScrollDateLabel] = useState('');
  const [showScrollDateIndicator, setShowScrollDateIndicator] = useState(false);
  const [noticeBannerCollapsed, setNoticeBannerCollapsed] = useState(false);
  const scrollDateHideTimeoutRef = useRef<number | null>(null);
  const pendingRoomChangeAlignRef = useRef<string | null>(null);
  const roomOpenAutoStickUntilRef = useRef(0);
  const autoAlignGenerationRef = useRef(0);

  const updateScrollDateIndicator = useCallback(() => {
    const listElement = messageListRef.current;
    if (!listElement) return;

    const dateDividers = Array.from(
      listElement.querySelectorAll<HTMLElement>('[data-chat-date-divider="true"]')
    );

    if (dateDividers.length === 0) {
      setScrollDateLabel('');
      return;
    }

    const threshold = listElement.scrollTop + 24;
    let activeLabel = dateDividers[0]?.dataset.dateLabel || '';

    for (const divider of dateDividers) {
      if (divider.offsetTop <= threshold) {
        activeLabel = divider.dataset.dateLabel || activeLabel;
      } else {
        break;
      }
    }

    setScrollDateLabel((current) => (current === activeLabel ? current : activeLabel));
  }, [messageListRef]);

  const handleMessageListScroll = useCallback(() => {
    const listElement = messageListRef.current;
    updateScrollDateIndicator();
    const shouldReveal =
      !!listElement && listElement.scrollTop + listElement.clientHeight < listElement.scrollHeight - 32;
    if (shouldReveal) {
      autoAlignGenerationRef.current += 1;
    }
    setShowScrollDateIndicator(shouldReveal);
    if (scrollDateHideTimeoutRef.current !== null) {
      window.clearTimeout(scrollDateHideTimeoutRef.current);
    }
    if (shouldReveal) {
      scrollDateHideTimeoutRef.current = window.setTimeout(() => {
        setShowScrollDateIndicator(false);
      }, 900);
    }
    onMessageListScroll();
  }, [messageListRef, onMessageListScroll, updateScrollDateIndicator]);

  const forceTimelineToBottom = useCallback(() => {
    const listElement = messageListRef.current;
    if (!listElement) return false;

    onScrollToBottom('auto');
    listElement.scrollTop = Math.max(0, listElement.scrollHeight - listElement.clientHeight);
    scrollRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });

    const distanceFromBottom = Math.abs(
      listElement.scrollHeight - listElement.clientHeight - listElement.scrollTop
    );
    return distanceFromBottom <= 24;
  }, [messageListRef, onScrollToBottom, scrollRef]);

  const maintainBottomAfterLayoutChange = useCallback(() => {
    const listElement = messageListRef.current;
    if (!selectedRoomId || !listElement) return;

    const distanceFromBottom = Math.abs(
      listElement.scrollHeight - listElement.clientHeight - listElement.scrollTop
    );
    const withinAutoStickWindow = Date.now() <= roomOpenAutoStickUntilRef.current;
    if (!withinAutoStickWindow && distanceFromBottom > 120) return;

    window.requestAnimationFrame(() => {
      forceTimelineToBottom();
    });
  }, [forceTimelineToBottom, messageListRef, selectedRoomId]);

  useLayoutEffect(() => {
    if (!selectedRoomId) return;

    const roomIdForAlign = selectedRoomId;
    const alignGeneration = autoAlignGenerationRef.current;
    let cancelled = false;
    let frameId = 0;
    const timeoutIds: number[] = [];

    const alignToBottom = () => {
      if (cancelled) return;
      if (autoAlignGenerationRef.current !== alignGeneration) return;
      if (roomIdForAlign !== selectedRoomId) return;
      forceTimelineToBottom();
    };

    alignToBottom();
    frameId = window.requestAnimationFrame(() => {
      alignToBottom();
      frameId = window.requestAnimationFrame(alignToBottom);
    });
    timeoutIds.push(window.setTimeout(alignToBottom, 80));
    timeoutIds.push(window.setTimeout(alignToBottom, 220));
    timeoutIds.push(window.setTimeout(alignToBottom, 420));
    timeoutIds.push(window.setTimeout(alignToBottom, 720));

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      timeoutIds.forEach((id) => window.clearTimeout(id));
    };
  }, [forceTimelineToBottom, scrollToLatestRequestToken, selectedRoomId]);

  useEffect(() => {
    autoAlignGenerationRef.current += 1;
    pendingRoomChangeAlignRef.current = selectedRoomId;
    roomOpenAutoStickUntilRef.current = selectedRoomId ? Date.now() + 2800 : 0;
  }, [scrollToLatestRequestToken, selectedRoomId]);

  useEffect(() => {
    updateScrollDateIndicator();
    setShowScrollDateIndicator(false);
    if (
      selectedRoomId &&
      pendingRoomChangeAlignRef.current === selectedRoomId &&
      combinedTimeline.length > 0
    ) {
      const roomIdForAlign = selectedRoomId;
      const alignGeneration = autoAlignGenerationRef.current;
      const timeoutIds: number[] = [];
      roomOpenAutoStickUntilRef.current = Math.max(roomOpenAutoStickUntilRef.current, Date.now() + 2800);
      const scheduleAlign = (delay = 0) => {
        const run = () => {
          if (autoAlignGenerationRef.current !== alignGeneration) return;
          if (pendingRoomChangeAlignRef.current !== null && pendingRoomChangeAlignRef.current !== roomIdForAlign) return;
          if (roomIdForAlign !== selectedRoomId) return;
          forceTimelineToBottom();
        };

        if (delay === 0) {
          window.requestAnimationFrame(run);
          return;
        }

        timeoutIds.push(window.setTimeout(() => {
          window.requestAnimationFrame(run);
        }, delay));
      };

      scheduleAlign();
      scheduleAlign(80);
      scheduleAlign(220);
      scheduleAlign(420);
      pendingRoomChangeAlignRef.current = null;
      return () => {
        timeoutIds.forEach((id) => window.clearTimeout(id));
      };
    }
  }, [combinedTimeline, forceTimelineToBottom, selectedRoomId, updateScrollDateIndicator]);

  useEffect(() => {
    return () => {
      if (scrollDateHideTimeoutRef.current !== null) {
        window.clearTimeout(scrollDateHideTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setNoticeBannerCollapsed(false);
  }, [selectedRoomId, noticeMessages.length]);

  return (
    <>
      {selectedRoomId && noticeMessages.length > 0 && (
        <div
          data-testid="chat-notice-banner"
          className="shrink-0 border-b border-orange-100 bg-orange-500/10 px-3 py-2 md:px-4"
        >
          <div className="flex items-center gap-2">
            <div className="shrink-0 rounded-full bg-orange-500 px-2.5 py-1 text-[10px] font-bold text-white">
              {`공지 ${noticeMessages.length}`}
            </div>
            <div className="min-w-0 flex-1">
              {noticeBannerCollapsed ? (
                <button
                  type="button"
                  data-testid="chat-notice-collapsed-preview"
                  onClick={() => {
                    if (noticeMessages[0]?.id) onScrollToMessage(noticeMessages[0].id);
                  }}
                  className="w-full min-w-0 rounded-full border border-orange-500/20 bg-[var(--card)] px-3 py-1.5 text-left text-xs font-semibold text-[var(--foreground)] shadow-sm transition-colors hover:bg-orange-500/10"
                >
                  <span className="block truncate">
                    {getMessageDisplayText(
                      noticeMessages[0]?.content,
                      noticeMessages[0]?.file_name,
                      noticeMessages[0]?.file_url,
                      '공지 메시지'
                    )}
                  </span>
                </button>
              ) : (
                <div
                  data-testid="chat-notice-items"
                  className="flex gap-2 overflow-x-auto pb-0.5 custom-scrollbar"
                >
                  {noticeMessages.map((pinnedMessage) => (
                    <button
                      key={`pin-${pinnedMessage.id}`}
                      data-testid={`chat-notice-item-${pinnedMessage.id}`}
                      type="button"
                      onClick={() => onScrollToMessage(pinnedMessage.id)}
                      className="min-w-0 max-w-[420px] shrink-0 rounded-full border border-orange-500/20 bg-[var(--card)] px-3 py-1.5 text-left text-xs font-semibold text-[var(--foreground)] shadow-sm transition-colors hover:bg-orange-500/10 md:max-w-[560px]"
                    >
                      <span className="block truncate">
                        {getMessageDisplayText(
                          pinnedMessage.content,
                          pinnedMessage.file_name,
                          pinnedMessage.file_url,
                          '공지 메시지'
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              data-testid="chat-notice-toggle"
              onClick={() => setNoticeBannerCollapsed((current) => !current)}
              className="shrink-0 rounded-full border border-orange-500/20 bg-[var(--card)] px-3 py-1.5 text-[11px] font-bold text-orange-600 transition-colors hover:bg-orange-500/10"
            >
              {noticeBannerCollapsed ? '공지 펼치기' : '공지 접기'}
            </button>
          </div>
        </div>
      )}

      <div className="relative flex-1 min-h-0">
        <div
          ref={messageListRef}
          data-testid="chat-message-list"
          onScroll={handleMessageListScroll}
          className="relative h-full min-h-0 overflow-y-auto px-2 py-0.5 pb-1 md:px-4 md:py-2 md:pb-2 space-y-0 custom-scrollbar"
        >
          {scrollDateLabel ? (
            <div className="pointer-events-none absolute inset-y-0 right-2 z-20 flex items-center md:right-4">
              <div
                data-testid="chat-scroll-date-indicator"
                className={`rounded-full bg-[var(--toss-gray-5)]/90 px-2.5 py-1 text-[11px] font-bold text-white shadow-lg backdrop-blur-sm transition-all duration-150 ${
                  showScrollDateIndicator ? 'translate-x-0 opacity-100' : 'translate-x-2 opacity-0'
                }`}
              >
                {scrollDateLabel}
              </div>
            </div>
          ) : null}
        {!selectedRoomId ? (
          <div className="h-full flex flex-col items-center justify-center text-[var(--toss-gray-3)]">
            <span className="text-4xl mb-2">💬</span>
            <p className="text-sm font-bold">채팅방을 선택하세요</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-20">
            <span className="text-6xl mb-4">💬</span>
            <p className="font-semibold text-sm">아직 대화 내용이 없습니다.</p>
          </div>
        ) : (
          (() => {
            let lastDateLabel = '';
            let lastSenderId = '';

            return combinedTimeline.map((item) => {
              if (item.type === 'poll') {
                const pollItem = item as PollItem;
                const pollMeta = extractPollMetaFromQuestion(pollItem.question);
                const deadlineAt = pollMeta.deadlineAt;
                const deadlineDate = deadlineAt ? new Date(deadlineAt) : null;
                const isPollClosed = Boolean(deadlineDate && !Number.isNaN(deadlineDate.getTime()) && deadlineDate.getTime() <= Date.now());
                const votes = pollVotes[pollItem.id] || {};
                const totalVotes = (Object.values(votes) as number[]).reduce((a: number, b: number) => a + b, 0);
                return (
                  <div data-testid={`chat-poll-${pollItem.id}`} key={`poll-${pollItem.id}`} className="max-w-[85%] md:max-w-[70%] bg-blue-500/10 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 rounded-2xl p-4 shadow-soft">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest flex items-center gap-1.5">
                        <span className="text-sm">🗳️</span> 투표
                      </p>
                      {deadlineDate && !Number.isNaN(deadlineDate.getTime()) ? (
                        <span
                          data-testid={`chat-poll-deadline-label-${pollItem.id}`}
                          className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                            isPollClosed
                              ? 'bg-rose-500/15 text-rose-600'
                              : 'bg-blue-500/10 text-blue-600'
                          }`}
                        >
                          {isPollClosed ? '마감' : '마감 예정'} {deadlineDate.toLocaleString('ko-KR', {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      ) : null}
                    </div>
                    <p className="mb-4 text-xs font-bold text-foreground leading-relaxed">{pollMeta.displayQuestion || pollItem.question}</p>
                    <div className="space-y-1.5">
                      {(pollItem.options || []).map((opt: string, idx: number) => (
                        <button
                          data-testid={`chat-poll-vote-${pollItem.id}-${idx}`}
                          key={idx}
                          onClick={() => {
                            if (isPollClosed) return;
                            onVote(pollItem.id, idx);
                          }}
                          disabled={isPollClosed}
                          className={`w-full flex justify-between items-center px-4 py-2.5 rounded-xl bg-[var(--card)] dark:bg-zinc-800/50 border text-[11px] font-medium group transition-all ${
                            isPollClosed
                              ? 'border-[var(--border)] opacity-60 cursor-not-allowed'
                              : 'border-blue-500/20/50 dark:border-blue-700/30 hover:border-blue-400 dark:hover:border-blue-500'
                          }`}
                        >
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
                const senderName = (albumItem.staff as { name?: string } | null)?.name || albumItem.sender_name || '이름 없음';
                const created = new Date(albumItem.created_at || 0);
                const dateLabel = formatTimelineDateLabel(albumItem.created_at);
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
                    data-testid={`chat-album-${albumItem.album_id || albumItem.id}`}
                    key={`album-${albumItem.album_id || albumItem.id}`}
                    className={showDateDivider ? 'mt-0.5 md:mt-1' : 'mt-[2px]'}
                  >
                    {showDateDivider && (
                      <div
                        data-chat-date-divider="true"
                        data-date-label={dateLabel}
                        className="my-0.5 flex items-center justify-center gap-1 md:my-1 md:gap-2"
                      >
                        <div className="flex-1 h-px bg-[var(--border)]" />
                        <span className="px-2.5 py-0.5 rounded-full bg-[var(--muted)] text-[10px] font-semibold text-[var(--toss-gray-3)] shrink-0">{dateLabel}</span>
                        <div className="flex-1 h-px bg-[var(--border)]" />
                      </div>
                    )}
                    <div className={`flex items-end gap-2 ${isMineAlbum ? 'flex-row-reverse' : 'flex-row'}`}>
                      {!isMineAlbum && (
                        <MessengerAvatar
                          name={senderName}
                          photoUrl={getProfilePhotoUrl(albumItem.staff as Record<string, unknown> | null)}
                          className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--muted)] text-[11px] font-bold text-[var(--toss-gray-4)]"
                          decorative
                        />
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
                              aria-label={`${message.file_name || `?⑤쾾 ?ъ쭊 ${index + 1}`} 誘몃━蹂닿린`}
                            >
                              <img
                                src={message.file_url || ''}
                                alt={message.file_name || '?ъ쭊'}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                onLoad={maintainBottomAfterLayoutChange}
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
                          <span className="text-[var(--toss-gray-3)]">{`${timeStr} · 사진 ${count}장`}</span>
                          {albumReplyTarget ? (
                            <button
                              type="button"
                              data-testid={`chat-album-reply-${albumItem.album_id || albumItem.id}`}
                              onClick={() => onStartReplyToMessage(albumReplyTarget)}
                              className="font-bold text-amber-700 transition-colors hover:text-amber-800"
                            >
                              ?듦?
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              const msg = item as MessengerMessageItem;
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
              const displayedReadStatusSummary = isMine ? readStatusSummary : null;
              const isAttachmentOnlyMessage = !String(msg.content || '').trim() && Boolean(msg.file_url);
              const created = new Date(msg.created_at || 0);
              const dateLabel = formatTimelineDateLabel(msg.created_at);
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
              const showWardQuickReplies =
                !isMine &&
                !isDeletedMessage &&
                wardMessageMeta.meta?.type === 'op_ward_request';
              const isWardQuickReplySending = wardQuickReplySendingMessageId === String(msg.id || '');
              const showIncomingAvatar = !isMine && !isContinuous;
              lastSenderId = String(msg.sender_id);

              return (
                <div key={msg.id} data-testid={`chat-message-row-${msg.id}`} className={isContinuous ? 'mt-[2px]' : 'mt-0.5 md:mt-1'}>
                  {showDateDivider && (
                    <div
                      data-chat-date-divider="true"
                      data-date-label={dateLabel}
                      className="my-0.5 flex items-center justify-center gap-1 md:my-1 md:gap-2"
                    >
                      <div className="flex-1 h-px bg-[var(--border)]" />
                      <span className="px-2.5 py-0.5 rounded-full bg-[var(--muted)] text-[10px] font-semibold text-[var(--toss-gray-3)] shrink-0">
                        {dateLabel}
                      </span>
                      <div className="flex-1 h-px bg-[var(--border)]" />
                    </div>
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
                      className={`flex w-full flex-col ${isMine ? 'items-end' : 'items-start'}`}
                    >
                      <div className={`flex ${isMine ? 'max-w-[78%] flex-col items-end md:max-w-[72%]' : 'w-full items-start gap-2'}`}>
                        {!isMine ? (
                          showIncomingAvatar ? (
                            <div data-testid={`chat-message-sender-avatar-${msg.id}`} className="shrink-0 self-start pt-0.5">
                              <MessengerAvatar
                                name={senderName}
                                photoUrl={senderPhotoUrl}
                                className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[var(--tab-bg)] text-[12px] font-bold text-[var(--toss-gray-3)] ring-1 ring-black/5 dark:bg-zinc-800"
                                decorative
                              />
                            </div>
                          ) : (
                            <div aria-hidden="true" className="w-10 shrink-0" />
                          )
                        ) : null}
                        <div
                          data-testid={!isMine ? `chat-message-stack-${msg.id}` : undefined}
                          className={isMine ? 'flex w-full flex-col items-end' : 'flex min-w-0 max-w-[82%] flex-col items-start md:max-w-[74%]'}
                        >
                          {!isMine && showIncomingAvatar && (
                            <span
                              data-testid={`chat-message-sender-name-${msg.id}`}
                              className="mb-1 px-0.5 text-[11px] font-bold leading-none text-[var(--toss-gray-4)]"
                            >
                              {senderName}
                            </span>
                          )}
                          <div
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
                            } rounded-2xl text-[13px] md:text-sm ${isDeletedMessage ? 'cursor-default' : 'cursor-pointer'} transition-all max-w-full ${
                              isDeletedMessage
                                ? isMine
                                  ? 'rounded-tr-sm'
                                  : 'rounded-tl-sm'
                                : !msg.content
                                  ? ''
                                  : isMine
                                    ? 'bg-[var(--accent)] text-white border-transparent rounded-tr-sm'
                                    : 'bg-[var(--card)] dark:bg-zinc-800 border-[var(--border)] dark:border-zinc-700 rounded-tl-sm hover:border-blue-300 dark:hover:border-blue-700 text-foreground'
                            }`}
                            role="button"
                            tabIndex={isDeletedMessage ? -1 : 0}
                            onKeyDown={(event) => {
                              if (isDeletedMessage) return;
                              if (event.key === 'Enter') onMarkMessageRead(msg);
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
                              return parent ? (
                                <div
                                  data-testid={`chat-reply-preview-${msg.id}`}
                                  className={`mb-1 p-1.5 rounded-[var(--radius-md)] text-[11px] border-l-2 cursor-pointer hover:opacity-80 transition-opacity ${replyPreviewClass}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onScrollToMessage(msg.reply_to_id!);
                                  }}
                                >
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
                                    onPreview={() => onOpenAttachmentPreview(fileUrl, attachmentName, attachmentKind)}
                                    layout="bubble"
                                    tone={isMine ? 'accent' : 'default'}
                                    onMediaLoad={maintainBottomAfterLayoutChange}
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
                                    className="text-[10px] font-bold text-emerald-500 hover:text-emerald-600 underline underline-offset-2"
                                  >
                                    {displayedReadStatusSummary}
                                  </button>
                                ) : (
                                  <span
                                    data-testid={`chat-message-read-status-${msg.id}`}
                                    className={`text-[10px] font-bold ${deliveryState === 'failed' ? 'text-red-500' : 'text-emerald-500'}`}
                                  >
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
                              onClick={(event) => event.stopPropagation()}
                            >
                              <p className="px-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">
                                빠른 응답
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {WARD_QUICK_REPLY_OPTIONS.map((option: (typeof WARD_QUICK_REPLY_OPTIONS)[number]) => (
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
                      <div
                        className={`flex items-center gap-1 overflow-hidden opacity-0 pointer-events-none transition-all max-h-0 ${isMine ? 'flex-row-reverse' : ''} group-hover:mt-0.5 group-hover:max-h-10 group-hover:opacity-100 group-hover:pointer-events-auto [@media(hover:none)]:mt-0.5 [@media(hover:none)]:max-h-10 [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => { onStartReplyToMessage(msg); }}
                          className="touch-manipulation min-h-[32px] p-1 px-2 rounded-lg hover:bg-[var(--tab-bg)] active:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 text-[10px] font-bold text-[var(--toss-gray-3)] hover:text-blue-500 transition-colors"
                        >
                          답글
                        </button>
                        <button
                          type="button"
                          onClick={() => { onOpenMessageActions(msg); }}
                          className="touch-manipulation min-h-[32px] p-1 px-2 rounded-lg hover:bg-[var(--tab-bg)] active:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 text-[10px] font-bold text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] transition-colors"
                        >
                          더보기
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            });
          })()
        )}

          <div ref={scrollRef} />
        </div>

      {showScrollToLatest && selectedRoomId && (
        <div className="pointer-events-none absolute bottom-3 right-3 z-20 md:bottom-4 md:right-4">
          <button
            data-testid="chat-scroll-to-latest-button"
            type="button"
            onClick={() => onScrollToBottom('smooth')}
            aria-label="\ucd5c\uc2e0 \uba54\uc2dc\uc9c0\ub85c \uc774\ub3d9"
            className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[0px] text-[var(--foreground)] shadow-lg transition hover:-translate-y-0.5 hover:border-[var(--accent)]/40 hover:bg-[var(--toss-blue-light)] active:translate-y-0"
          >
            <span aria-hidden="true" className="text-xl leading-none">{"\u2193"}</span>
            理쒖떊 硫붿떆吏
          </button>
        </div>
      )}
      </div>
    </>
  );
}
