'use client';

import { ChatAttachmentPreviewModal } from './메신저첨부미리보기';
import { AddMemberModal, ForwardMessageModal } from './메신저멤버관리모달';
import { MediaArchivePanel } from './메신저미디어아카이브';
import { ReactionDetailModal } from './메신저액션';
import { GlobalSearchModal } from './메신저전역검색';
import { MessengerDateJumpModal } from './MessengerDateJumpModal';
import { ReadStatusModal } from './메신저읽음모달';
import { ThreadPanel } from './메신저스레드패널';
import { PollComposerModal, SlashCommandModal } from './메신저투표모달';
import type { ChatViewController } from './useChatViewController';

type MessengerModalHostProps = {
  controller: ChatViewController;
};

export function MessengerModalHost({ controller }: MessengerModalHostProps) {
  const c = controller as any;

  return (
    <>
      <PollComposerModal
        open={c.showPollModal}
        question={c.pollQuestion}
        options={c.pollOptions}
        deadlineAt={c.pollDeadlineAt}
        prizeEnabled={c.prizeEnabled ?? false}
        prizeWinnerCount={c.prizeWinnerCount ?? 1}
        prizeName={c.prizeName ?? ''}
        onQuestionChange={c.setPollQuestion}
        onDeadlineAtChange={c.setPollDeadlineAt}
        onOptionChange={c.handlePollOptionChange}
        onRemoveOption={c.handleRemovePollOption}
        onAddOption={c.handleAddPollOption}
        onPrizeEnabledChange={c.setPrizeEnabled ?? (() => {})}
        onPrizeWinnerCountChange={c.setPrizeWinnerCount ?? (() => {})}
        onPrizeNameChange={c.setPrizeName ?? (() => {})}
        onClose={c.closePollModal}
        onSubmit={c.handleCreatePoll}
      />

      <SlashCommandModal
        open={c.showSlashModal}
        command={c.slashCommand}
        form={c.slashForm}
        onFieldChange={c.handleSlashFormFieldChange}
        onClose={c.closeSlashModal}
        onSubmitAnnualLeave={c.handleSubmitAnnualLeaveDraft}
        onSubmitPurchase={c.handleSubmitPurchaseDraft}
      />

      <ThreadPanel
        rootMessage={c.threadRoot}
        messages={c.threadMessages}
        resolveStaffProfile={c.resolveStaffProfile}
        onClose={() => c.setThreadRoot(null)}
        onPreviewAttachment={c.openAttachmentPreviewForMessage}
        onReplyMessage={c.startReplyToMessage}
      />

      <ReadStatusModal
        message={c.unreadModalMsg}
        loading={c.unreadLoading}
        unreadUsers={c.unreadUsers}
        readUsers={c.readUsers}
        onClose={c.closeReadStatusModal}
      />

      <ReactionDetailModal
        target={c.reactionDetailTarget}
        users={
          c.reactionDetailTarget
            ? c.reactionUsersByMessage[String(c.reactionDetailTarget.message.id)]?.[c.reactionDetailTarget.emoji] || []
            : []
        }
        onClose={() => c.setReactionDetailTarget(null)}
      />

      <ForwardMessageModal
        open={c.showForwardModal && Boolean(c.forwardSourceMsg)}
        targetRooms={c.forwardTargetRoomItems}
        onClose={c.closeForwardModal}
        onForward={c.handleForwardToRoom}
      />

      <AddMemberModal
        open={c.showAddMemberModal}
        selectedRoom={c.selectedRoom}
        search={c.addMemberSearch}
        addableMembers={c.addableMembers}
        selectingIds={c.addMemberSelectingIds}
        onSearchChange={c.handleAddMemberSearchChange}
        onToggleMember={c.handleToggleAddMemberSelection}
        onClose={c.closeAddMemberModal}
        onSubmit={c.handleSubmitAddMembers}
      />

      <MediaArchivePanel
        open={c.showMediaPanel}
        mediaFilter={c.mediaFilter}
        filteredMediaMessages={c.filteredMediaMessages}
        onClose={() => c.setShowMediaPanel(false)}
        onFilterChange={c.setMediaFilter}
        onPreviewMessage={c.openAttachmentPreviewForMessage}
        onReplyMessage={c.startReplyToMessage}
      />

      <GlobalSearchModal
        open={c.showGlobalSearch}
        query={c.globalSearchQuery}
        activeTab={c.globalSearchTab}
        loading={c.globalSearchLoading}
        counts={c.globalSearchCounts}
        memberResults={c.globalSearchMemberResults}
        roomResults={c.globalSearchRoomResults}
        messageResults={c.globalSearchMessageResults}
        fileResults={c.globalSearchFileResults}
        allResults={c.globalSearchResults}
        allKnownStaffs={c.allKnownStaffs}
        effectiveChatUserId={c.effectiveChatUserId}
        savedSearches={c.savedSearches}
        onClose={c.closeGlobalSearch}
        onQueryChange={c.setGlobalSearchQuery}
        onTabChange={c.setGlobalSearchTab}
        onSearchSubmit={(query) => c.handleGlobalSearch(query)}
        onSaveCurrentSearch={c.saveCurrentSearch}
        onApplySavedSearch={c.applySavedSearch}
        onRemoveSavedSearch={c.removeSavedSearch}
        onOpenGroup={c.openGroupFromGlobalSearch}
        onOpenMember={c.openMemberFromGlobalSearch}
        onOpenRoom={c.openRoomFromGlobalSearch}
        onPreviewAttachment={c.openAttachmentPreview}
      />

      <MessengerDateJumpModal
        open={c.dateJumpPickerOpen}
        value={c.dateJumpValue}
        loading={c.dateJumpLoading}
        error={c.dateJumpError}
        onValueChange={c.setDateJumpValue}
        onClose={c.closeDateJumpPicker}
        onSubmit={c.handleDateJumpSubmit}
      />

      <ChatAttachmentPreviewModal
        controller={c.attachmentPreviewController}
        onForwardAttachment={(item) => {
          const sourceMessage = (c.messages || []).find(
            (message: { id?: string | number | null }) => String(message?.id || '') === String(item.messageId || ''),
          );
          if (sourceMessage) c.startForwardMessage(sourceMessage);
        }}
      />
    </>
  );
}
