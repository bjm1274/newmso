'use client';

import { MessengerSidebar } from './메신저사이드바';
import { MessengerConversationPanel } from './MessengerConversationPanel';
import { MessengerModalHost } from './MessengerModalHost';
import type { ChatViewController } from './useChatViewController';

type MessengerLayoutProps = {
  controller: ChatViewController;
};

export function MessengerLayout({ controller }: MessengerLayoutProps) {
  const c = controller as any;

  return (
    <div data-testid="chat-view" className="app-page flex flex-1 min-h-0 overflow-hidden relative font-sans md:h-[100dvh] md:max-h-[100dvh]">
      <MessengerSidebar
        selectedRoomId={c.selectedRoomId}
        viewMode={c.viewMode}
        showHiddenRooms={c.showHiddenRooms}
        sidebarRoomItems={c.sidebarRoomItems}
        mentionInboxItems={c.mentionInboxItems}
        groupedStaffs={c.groupedStaffs}
        expandedDepts={c.expandedDepts}
        onViewModeChange={c.setViewMode}
        onOpenGroupModal={() => c.setShowGroupModal(true)}
        onOpenGlobalSearch={c.openGlobalSearch}
        onToggleHiddenRooms={() => c.setShowHiddenRooms((prev: boolean) => !prev)}
        onRoomClick={c.handleManualRoomListClick}
        onOpenMentionItem={c.handleOpenMentionInboxItem}
        onToggleRoomPinned={c.toggleRoomPinned}
        onMovePinnedRoom={c.movePinnedRoom}
        onToggleRoomHidden={c.toggleRoomHidden}
        onToggleDept={c.toggleDept}
        onOpenDirectChat={c.openDirectChat}
      />

      <MessengerConversationPanel controller={controller} />
      <MessengerModalHost controller={controller} />
    </div>
  );
}
