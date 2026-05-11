'use client';

import { Bell, ChevronLeft, Menu, MessageSquare } from './lucide-shim';

import { MessengerAvatar } from './메신저공통';
import { MessengerComposer } from './메신저컴포저';
import { MessengerDrawer } from './메신저드로어';
import { GroupChatModal } from './메신저그룹생성모달';
import { MessengerTimeline, type MessengerTimelineItem } from './메신저타임라인';
import { MessengerMessageActions } from './메신저액션';
import { NOTICE_ROOM_ID } from './메신저유틸';
import type { ChatViewController } from './useChatViewController';

type MessengerConversationPanelProps = {
  controller: ChatViewController;
};

export function MessengerConversationPanel({ controller }: MessengerConversationPanelProps) {
  const c = controller as any;

  return (
    <main className={`${!c.selectedRoomId ? 'hidden md:flex' : 'flex'} app-page flex-1 min-h-0 flex-col overflow-hidden relative`}>
      {c.selectedRoomId && c.selectedRoom && (
        <header className="px-4 py-2.5 flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] shrink-0 z-40">
          <div className="flex items-center gap-3 min-w-0">
            <button type="button"
              onClick={() => c.setRoom(null)}
              className="md:hidden flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--toss-gray-4)] transition-colors hover:bg-[var(--toss-blue-light)] hover:text-[var(--accent)]"
              aria-label="채팅 목록으로 돌아가기"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <div data-testid="chat-room-header-avatar" className="flex h-9 w-9 shrink-0 items-center justify-center">
              {c.selectedRoom.id === NOTICE_ROOM_ID ? (
                <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--toss-blue-light)] text-[var(--accent)]">
                  <Bell className="w-5 h-5" aria-hidden="true" />
                </div>
              ) : c.selectedPeer ? (
                <MessengerAvatar
                  name={c.selectedPeer.name || c.selectedRoomLabel}
                  photoUrl={c.selectedPeerPhotoUrl}
                  className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-[var(--radius-lg)] bg-[var(--tab-bg)] text-[12px] font-bold text-[var(--toss-gray-4)]"
                  decorative
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--tab-bg)] text-[var(--toss-gray-4)]">
                  <MessageSquare className="w-5 h-5" aria-hidden="true" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <h3 className={`text-[13px] font-bold text-foreground ${c.selectedRoom.type === 'group' ? 'line-clamp-2 break-words whitespace-normal leading-4' : 'truncate'}`}>
                {c.selectedRoomLabel}
              </h3>
              <div className="flex items-center gap-1.5 text-[10px] font-medium">
                {!c.selectedPeer ? (
                  <>
                    <p className="text-[var(--toss-gray-4)]">{c.roomMembers.length || 0}명 참여중</p>
                    <span className="text-[var(--toss-gray-4)]">·</span>
                  </>
                ) : null}
                <span className={`inline-flex items-center gap-1 ${c.realtimeConnectionMeta.textClassName}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${c.realtimeConnectionMeta.dotClassName}`} />
                  <span>{c.realtimeConnectionMeta.label}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button type="button"
              data-testid="chat-open-drawer"
              onClick={() => c.setShowDrawer(true)}
              className="w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center transition-colors hover:bg-[var(--toss-blue-light)] text-[var(--toss-gray-4)] hover:text-[var(--accent)]"
              title="채팅방 정보 및 참여자 보기"
            >
              <Menu className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </header>
      )}

      <MessengerTimeline
        selectedRoomId={c.selectedRoomId}
        messages={c.messages}
        combinedTimeline={c.combinedTimeline as MessengerTimelineItem[]}
        pollVotes={c.pollVotes}
        reactions={c.reactions}
        readCounts={c.readCounts}
        deliveryStates={c.deliveryStates}
        threadSummaries={c.threadSummaries}
        roomMembers={c.roomMembers}
        effectiveChatUserId={c.effectiveChatUserId}
        activeMessageHighlightQuery={c.activeMessageHighlightQuery}
        wardQuickReplySendingMessageId={c.wardQuickReplySendingMessageId}
        messageRefs={c.msgRefs}
        messageListRef={c.messageListRef}
        scrollRef={c.scrollRef}
        resolveStaffProfile={c.resolveStaffProfile}
        onScrollToMessage={c.scrollToMessage}
        onMessageListScroll={c.handleMessageListScroll}
        onVote={c.handleVote}
        onOpenAttachmentPreviewForMessage={c.openAttachmentPreviewForMessage}
        onStartReplyToMessage={c.startReplyToMessage}
        onOpenThread={c.openTrackedThreadPanel}
        onOpenMessageActions={c.openMessageActions}
        onMarkMessageRead={c.markMessageRead}
        renderMessageContent={c.renderMessageContent}
        onOpenAttachmentPreview={c.openAttachmentPreview}
        onOpenReactionDetail={c.openReactionDetail}
        onLoadReadStatus={c.loadReadStatusForMessage}
        onSendWardQuickReply={c.sendWardQuickReply}
        onRetryFailedMessage={c.retryFailedMessage}
        showScrollToLatest={c.showScrollToLatest}
        onScrollToBottom={c.scrollToBottom}
        onMediaLoad={c.handleTimelineMediaLoad}
        onOpenBoardPost={c.onOpenBoardPost}
        onOpenDateJump={c.openDateJumpPicker}
      />

      {c.typingNoticeText ? (
        <div
          aria-live="polite"
          className="pointer-events-none relative z-20 flex h-0 justify-center px-3"
        >
          <span className="-translate-y-[calc(100%+6px)] rounded-full border border-[var(--border)] bg-[var(--card)]/95 px-3 py-1 text-[11px] font-semibold text-[var(--toss-gray-4)] shadow-sm backdrop-blur">
            {c.typingNoticeText}
          </span>
        </div>
      ) : null}

      {c.selectedRoomId && c.selectedRoom ? (
        <>
          {c.failedMessageIdsInSelectedRoom.length > 0 ? (
            <div
              data-testid="chat-retry-queue-banner"
              className="mx-3 mb-2 rounded-[var(--radius-lg)] border border-[var(--danger)]/20 bg-[var(--card)] px-4 py-3 shadow-sm md:mx-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--danger)]">
                    전송 실패 메시지 {c.failedMessageIdsInSelectedRoom.length}건
                  </p>
                  <p className="text-[11px] text-[var(--toss-gray-3)]">
                    새로고침 후에도 보관되며, 네트워크가 복구되면 자동으로 다시 시도합니다.
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="chat-retry-all-failed"
                  onClick={() => { void c.retryAllFailedMessages(c.failedMessageIdsInSelectedRoom); }}
                  className="shrink-0 rounded-[var(--radius-md)] border border-[var(--danger)]/20 bg-[var(--danger-light)] px-3 py-2 text-xs font-bold text-[var(--danger)] transition-colors hover:bg-[var(--danger)] hover:text-white"
                >
                  모두 재시도
                </button>
              </div>
            </div>
          ) : null}
          <MessengerComposer
            replyTo={c.replyTo}
            pendingAlbumFiles={c.pendingAlbumFiles}
            albumPreviewUrls={c.albumPreviewUrls}
            pendingAttachmentFiles={c.pendingAttachmentFiles}
            failedAttachmentRetryEntries={c.failedAttachmentRetryEntries.filter((entry: any) => String(entry.roomId) === String(c.selectedRoomId))}
            fileUploading={c.fileUploading}
            selectedRoomId={c.selectedRoomId}
            canWriteNotice={c.canWriteNotice}
            composerRef={c.composerRef}
            inputMsg={c.inputMsg}
            showScrollToLatest={c.showScrollToLatest}
            showMentionList={c.showMentionList}
            mentionCandidates={c.mentionCandidates}
            onCloseReply={() => c.setReplyTo(null)}
            onCancelAlbumUpload={c.cancelAlbumUpload}
            onRemoveAlbumFile={c.removeAlbumFile}
            onSendAlbum={c.sendAlbum}
            onCancelPendingAttachmentUpload={c.cancelPendingAttachmentUpload}
            onConfirmPendingAttachmentUpload={c.confirmPendingAttachmentUpload}
            onRetryFailedAttachmentUpload={c.retryFailedAttachmentUpload}
            onRetryAllFailedAttachmentUploads={() => c.retryAllFailedAttachmentUploads(c.selectedRoomId)}
            onDismissFailedAttachmentUpload={c.dismissFailedAttachmentUpload}
            onClearAllFailedAttachmentUploads={c.clearAllFailedAttachmentUploads}
            onAttachmentSelect={c.handleAttachmentSelect}
            onAlbumFileSelect={c.handleAlbumFileSelect}
            onQueueDroppedFiles={c.queueDroppedFiles}
            onComposerChange={c.handleComposerChange}
            onComposerPaste={c.handleComposerPaste}
            onSendMessage={c.handleSendMessage}
            onScrollToLatest={() => c.scrollToBottom('smooth')}
            onSelectMention={c.handleSelectMention}
          />
        </>
      ) : null}

      <MessengerDrawer
        isOpen={c.showDrawer}
        roomNotifyOn={c.roomNotifyOn}
        currentNoticeMessage={c.currentNoticeMessage}
        noticeReadCount={c.noticeReadStats.readCount}
        noticeUnreadCount={c.noticeReadStats.unreadCount}
        noticeRecipientCount={c.noticeReadStats.recipientCount}
        noticeReminderBusy={c.noticeReminderBusy}
        threadOverviews={c.threadOverviews}
        roomNotificationMode={c.roomNotifyOn ? c.selectedRoomNotificationMode : 'mute'}
        roomNotificationKeyword={c.selectedRoomNotificationKeyword}
        sharedMediaPreviewMessages={c.sharedMediaPreviewMessages}
        sharedFilePreviewMessages={c.sharedFilePreviewMessages}
        sharedLinkPreviewMessages={c.sharedLinkPreviewMessages}
        bookmarkedMessages={c.bookmarkedMessages}
        roomMembers={c.roomMembers}
        selectedRoom={c.selectedRoom}
        currentUserId={c.effectiveChatUserId || c.user?.id}
        editingRoomName={c.editingRoomName}
        roomNameDraft={c.roomNameDraft}
        resolveRoomMemberProfile={c.resolveRoomMemberProfile}
        onClose={() => c.setShowDrawer(false)}
        onToggleRoomNotify={c.handleToggleRoomNotifyFromDrawer}
        onSelectRoomNotificationMode={c.handleSelectRoomNotificationMode}
        onRoomNotificationKeywordChange={c.handleRoomNotificationKeywordChange}
        onOpenPollModal={c.handleOpenPollModalFromDrawer}
        onOpenMediaArchive={c.openMediaArchive}
        onPreviewMessage={c.openAttachmentPreviewForMessage}
        onReplyMessage={c.startReplyToMessage}
        onOpenThread={c.handleOpenThreadFromDrawer}
        onScrollToMessage={c.scrollToMessage}
        onJumpToNoticeMessage={c.handleJumpToNoticeMessage}
        onOpenNoticeReadStatus={c.openCurrentNoticeReadStatus}
        onSendNoticeReminder={c.handleSendNoticeReminder}
        onOpenAddMemberModal={() => c.setShowAddMemberModal(true)}
        onRemoveRoomMember={c.removeRoomMember}
        onRoomNameDraftChange={c.setRoomNameDraft}
        onSaveRoomName={c.handleSaveRoomName}
        onCancelEditingRoomName={c.handleCancelEditingRoomName}
        onStartEditingRoomName={c.handleStartEditingRoomName}
        onLeaveRoom={c.handleLeaveRoomFromDrawer}
      />

      <MessengerMessageActions
        message={c.activeActionMsg}
        currentUserId={c.effectiveChatUserId || c.user?.id}
        isPinned={Boolean(c.activeActionMsg && c.pinnedIds?.includes(String(c.activeActionMsg.id)))}
        isBookmarked={Boolean(c.activeActionMsg && c.bookmarkedIds?.has(String(c.activeActionMsg.id)))}
        onClose={() => c.setActiveActionMsg(null)}
        onToggleReaction={(emoji) => {
          if (!c.activeActionMsg) return;
          return c.toggleReaction?.(String(c.activeActionMsg.id), emoji);
        }}
        onAddTask={() => {
          if (!c.activeActionMsg) return;
          return c.addTaskFromMessage?.(c.activeActionMsg);
        }}
        onTogglePin={() => {
          if (!c.activeActionMsg) return;
          void c.togglePin?.(String(c.activeActionMsg.id));
          c.setActiveActionMsg(null);
        }}
        onToggleBookmark={() => {
          if (!c.activeActionMsg) return;
          void c.toggleBookmark?.(String(c.activeActionMsg.id));
          c.setActiveActionMsg(null);
        }}
        onStartEdit={() => {
          if (!c.activeActionMsg) return;
          c.startEditMessage?.(c.activeActionMsg);
          c.setActiveActionMsg(null);
        }}
        onOpenEditHistory={() => {
          if (!c.activeActionMsg) return;
          void c.openEditHistory?.(c.activeActionMsg);
          c.setActiveActionMsg(null);
        }}
        onDelete={() => {
          if (!c.activeActionMsg) return;
          void c.deleteMessageFromActions?.(c.activeActionMsg);
        }}
        onReply={() => {
          if (!c.activeActionMsg) return;
          c.startReplyToMessage?.(c.activeActionMsg);
          c.setActiveActionMsg(null);
        }}
        onForward={() => {
          if (!c.activeActionMsg) return;
          c.startForwardMessage?.(c.activeActionMsg);
          c.setActiveActionMsg(null);
        }}
        onCopyLink={() => {
          if (!c.activeActionMsg) return;
          void c.handleCopyMessageLink?.(c.activeActionMsg);
        }}
        onOpenReadStatus={() => {
          if (!c.activeActionMsg) return;
          c.openReadStatusPanel?.(c.activeActionMsg);
          c.setActiveActionMsg(null);
        }}
        onOpenThread={() => {
          if (!c.activeActionMsg) return;
          c.openTrackedThreadPanel?.(c.activeActionMsg);
          c.setActiveActionMsg(null);
        }}
      />

      <GroupChatModal
        open={c.showGroupModal}
        groupName={c.groupName}
        selectedMembers={c.selectedMembers}
        selectableStaffs={c.groupSelectableStaffs}
        onGroupNameChange={c.handleGroupNameChange}
        onToggleMember={c.handleToggleGroupMember}
        onClose={c.closeGroupModal}
        onCreate={c.createGroupChat}
      />
    </main>
  );
}
