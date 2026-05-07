'use client';

import { useLayoutEffect, memo } from 'react';
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
import { MessengerTimelineGroup } from './MessengerTimelineGroup';
import { extractWardMessageMeta, WARD_QUICK_REPLY_OPTIONS } from './메신저유틸';
import type { ThreadSummary } from './메신저파생훅';
import { MenuIcon } from './조직도서브/조직도측면창';

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
  onForwardToSelf?: (message: ChatMessage) => void | Promise<void>;
  onDeleteMessage?: (message: ChatMessage) => void | Promise<void>;
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
};

function MessengerTimelineComponent({
  selectedRoomId,
  isLoadingMessages = false,
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
  onForwardToSelf = () => {},
  onDeleteMessage = () => {},
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
  onOpenBoardPost,
  onOpenDateJump,
}: MessengerTimelineProps) {
  useLayoutEffect(() => {
    if (!selectedRoomId) return;

    const listElement = messageListRef.current;
    if (!listElement) return;

    const alignToBottom = () => {
      listElement.scrollTop = Math.max(0, listElement.scrollHeight - listElement.clientHeight);
    };

    // 즉시 + 한 번의 rAF(페인트 후) 초기 스크롤
    alignToBottom();
    const frameId = window.requestAnimationFrame(alignToBottom);

    // 방 전환 직후엔 콘텐츠가 없을 수 있으므로, ResizeObserver에서
    // 콘텐츠가 처음 채워질 때도 하단 정렬 (pendingAlign 플래그로 제어)
    let pendingAlign = true;

    const observer = new ResizeObserver(() => {
      const dist = listElement.scrollHeight - listElement.scrollTop - listElement.clientHeight;
      if (pendingAlign) {
        // 방 전환 후 첫 콘텐츠 렌더 → 무조건 하단 정렬
        alignToBottom();
        if (dist <= 2) pendingAlign = false; // 정착 완료
      } else if (dist < 80) {
        // 이미지 로드 등으로 인한 높이 변화 → 하단 근처면 정렬
        alignToBottom();
      }
    });

    const inner = listElement.firstElementChild;
    if (inner) observer.observe(inner);

    return () => {
      pendingAlign = false;
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [messageListRef, selectedRoomId]);

  return (
    <>
      <div
        ref={messageListRef}
        data-testid="chat-message-list"
        onScroll={onMessageListScroll}
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
          <MessengerTimelineGroup
            messages={messages}
            combinedTimeline={combinedTimeline}
            pollVotes={pollVotes}
            reactions={reactions}
            readCounts={readCounts}
            deliveryStates={deliveryStates}
            threadSummaries={threadSummaries}
            activeActionMessageId={activeActionMessageId}
            pinnedIds={pinnedIds}
            bookmarkedIds={bookmarkedIds}
            roomMembers={roomMembers}
            effectiveChatUserId={effectiveChatUserId}
            activeMessageHighlightQuery={activeMessageHighlightQuery}
            wardQuickReplySendingMessageId={wardQuickReplySendingMessageId}
            messageRefs={messageRefs}
            resolveStaffProfile={resolveStaffProfile}
            onScrollToMessage={onScrollToMessage}
            onVote={onVote}
            onOpenAttachmentPreviewForMessage={onOpenAttachmentPreviewForMessage}
            onStartReplyToMessage={onStartReplyToMessage}
            onOpenThread={onOpenThread}
            onOpenMessageActions={onOpenMessageActions}
            onCloseMessageActions={onCloseMessageActions}
            onToggleReaction={onToggleReaction}
            onAddTask={onAddTask}
            onTogglePin={onTogglePin}
            onToggleBookmark={onToggleBookmark}
            onForwardMessage={onForwardMessage}
            onForwardToSelf={onForwardToSelf}
            onDeleteMessage={onDeleteMessage}
            onMarkMessageRead={onMarkMessageRead}
            renderMessageContent={renderMessageContent}
            onOpenAttachmentPreview={onOpenAttachmentPreview}
            onOpenReactionDetail={onOpenReactionDetail}
            onLoadReadStatus={onLoadReadStatus}
            onSendWardQuickReply={onSendWardQuickReply}
            onRetryFailedMessage={onRetryFailedMessage}
            onMediaLoad={onMediaLoad}
            onOpenBoardPost={onOpenBoardPost}
            onOpenDateJump={onOpenDateJump}
          />
        )}

        <div ref={scrollRef} />
      </div>

      {showScrollToLatest && selectedRoomId && (
        <div className="absolute right-4 bottom-4 z-20">
          <button
            type="button"
            onClick={() => onScrollToBottom('smooth')}
            className="px-3 py-2 rounded-[var(--radius-md)] bg-[var(--card)] border border-[var(--border)] shadow-sm text-[11px] font-bold text-[var(--foreground)]"
          >
            최신 메시지
          </button>
        </div>
      )}
    </>
  );
}

export const MessengerTimeline = memo(MessengerTimelineComponent);
