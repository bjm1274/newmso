'use client';

import { MessengerAvatar } from './메신저공통';
import { getProfilePhotoUrl } from '@/lib/profile-photo';
import type { ChatRoom, StaffMember } from '@/types';

export type MessengerViewMode = 'chat' | 'org';

export type MessengerSidebarRoomItem = {
  room: ChatRoom;
  roomId: string;
  unread: number;
  isSelected: boolean;
  isNoticeChannel: boolean;
  label: string;
  preview: string;
  peerName: string;
  peerPhotoUrl: string | null;
  isPeerOnline: boolean;
  isPinned: boolean;
  isHidden: boolean;
  pinnedIndex: number;
  pinnedCount: number;
};

type MessengerSidebarProps = {
  selectedRoomId: string | null;
  viewMode: MessengerViewMode;
  showHiddenRooms: boolean;
  sidebarRoomItems: MessengerSidebarRoomItem[];
  groupedStaffs: Record<string, Record<string, StaffMember[]>>;
  expandedDepts: Set<string>;
  onViewModeChange: (mode: MessengerViewMode) => void;
  onOpenGroupModal: () => void;
  onOpenGlobalSearch: () => void;
  onToggleHiddenRooms: () => void;
  onRoomClick: (roomId: string) => void;
  onToggleRoomPinned: (roomId: string, shouldPin: boolean) => void;
  onMovePinnedRoom: (roomId: string, direction: 'up' | 'down') => void;
  onToggleRoomHidden: (roomId: string, hidden: boolean) => void;
  onToggleDept: (key: string) => void;
  onOpenDirectChat: (staff: StaffMember) => void | Promise<void>;
};

export function MessengerSidebar({
  selectedRoomId,
  viewMode,
  showHiddenRooms,
  sidebarRoomItems,
  groupedStaffs,
  expandedDepts,
  onViewModeChange,
  onOpenGroupModal,
  onOpenGlobalSearch,
  onToggleHiddenRooms,
  onRoomClick,
  onToggleRoomPinned,
  onMovePinnedRoom,
  onToggleRoomHidden,
  onToggleDept,
  onOpenDirectChat,
}: MessengerSidebarProps) {
  return (
    <aside
      className={`${selectedRoomId ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-[var(--border)] dark:border-zinc-800 bg-[var(--card)] dark:bg-zinc-950 flex-col shrink-0 z-50 transition-all`}
    >
      <div className="p-3 md:p-3 space-y-3 flex flex-col min-h-0">
        <div className="flex items-center gap-1">
          <div className="flex flex-1 gap-1 bg-[var(--tab-bg)] dark:bg-zinc-800 p-1 rounded-xl glass">
            <button
              data-testid="chat-tab-chat"
              onClick={() => onViewModeChange('chat')}
              className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                viewMode === 'chat'
                  ? 'bg-[var(--card)] dark:bg-zinc-700 text-foreground shadow-premium'
                  : 'text-[var(--toss-gray-4)] hover:text-[var(--toss-gray-5)] dark:hover:text-[var(--toss-gray-3)]'
              }`}
            >
              채팅
            </button>
            <button
              data-testid="chat-tab-org"
              onClick={() => onViewModeChange('org')}
              className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                viewMode === 'org'
                  ? 'bg-[var(--card)] dark:bg-zinc-700 text-foreground shadow-premium'
                  : 'text-[var(--toss-gray-4)] hover:text-[var(--toss-gray-5)] dark:hover:text-[var(--toss-gray-3)]'
              }`}
            >
              조직도
            </button>
          </div>
          <button
            data-testid="chat-open-group-modal-legacy"
            type="button"
            onClick={onOpenGroupModal}
            title="새 그룹 채팅방 만들기"
            className="hidden"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 4v12" />
              <path d="M4 10h12" />
            </svg>
          </button>
          <button
            data-testid="chat-open-global-search"
            onClick={onOpenGlobalSearch}
            title="대화내용·파일·사진 통합 검색"
            className="shrink-0 flex items-center justify-center w-9 h-8 rounded-xl bg-[var(--tab-bg)] dark:bg-zinc-800 text-[var(--toss-gray-4)] hover:text-[var(--accent)] hover:bg-[var(--toss-blue-light)] transition-all"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="8" cy="8" r="5.5" />
              <line x1="12.5" y1="12.5" x2="18" y2="18" />
              <path d="M15 3v4" />
              <path d="M13 5h4" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-4 space-y-0.5 custom-scrollbar">
        {viewMode === 'chat' ? (
          <>
            <div className="flex items-center justify-between px-1 pb-2">
              <span className="text-[10px] font-medium text-[var(--toss-gray-3)]">
                {showHiddenRooms ? '숨김 대화 포함' : '숨김 대화 제외'}
              </span>
              <button
                type="button"
                data-testid="chat-toggle-hidden-rooms"
                onClick={onToggleHiddenRooms}
                className="text-[10px] font-semibold text-blue-500 hover:text-blue-600"
              >
                {showHiddenRooms ? '숨김방 닫기' : '숨김방 보기'}
              </button>
            </div>
            {sidebarRoomItems.map(
              ({
                room,
                roomId,
                unread,
                isSelected,
                isNoticeChannel,
                label,
                preview,
                peerName,
                peerPhotoUrl,
                isPeerOnline,
                isPinned,
                isHidden,
                pinnedIndex,
                pinnedCount,
              }) => (
                <div
                  key={roomId}
                  className={`group p-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-2.5 border relative overflow-hidden ${
                    isSelected
                      ? 'bg-zinc-800 border-zinc-700 shadow-sm'
                      : 'bg-[var(--card)] dark:bg-zinc-900 border-transparent hover:border-[var(--border)] dark:hover:border-zinc-800'
                  }`}
                >
                  {isSelected ? (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500/100"></div>
                  ) : null}
                  <button
                    type="button"
                    data-testid={`chat-room-${roomId}`}
                    onClick={() => onRoomClick(room.id)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    {isNoticeChannel ? (
                      <div
                        data-testid={`chat-room-icon-${roomId}`}
                        className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 text-[13px] leading-none text-blue-600"
                      >
                        📢
                      </div>
                    ) : peerName ? (
                      <div
                        data-testid={`chat-room-icon-${roomId}`}
                        className="relative flex h-8 w-8 shrink-0 items-center justify-center"
                      >
                        <MessengerAvatar
                          name={peerName || label}
                          photoUrl={peerPhotoUrl}
                          className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-[var(--tab-bg)] text-[11px] font-bold text-[var(--toss-gray-4)] dark:bg-zinc-800"
                          decorative
                        />
                        {isPeerOnline ? (
                          <span className="absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white dark:border-zinc-900" />
                        ) : null}
                      </div>
                    ) : (
                      <div
                        data-testid={`chat-room-icon-${roomId}`}
                        className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--tab-bg)] text-[13px] leading-none text-[var(--toss-gray-4)] dark:bg-zinc-800"
                      >
                        💬
                      </div>
                    )}
                    <div
                      data-testid={`chat-room-summary-${roomId}`}
                      className="flex min-w-0 flex-1 flex-col gap-1 py-0.5"
                    >
                      <div className="flex items-start gap-1.5 min-w-0">
                        {unread > 0 ? (
                          <span className="shrink-0 min-w-[18px] h-[18px] px-1.5 inline-flex items-center justify-center rounded-[var(--radius-md)] bg-blue-600 text-white text-[9px] font-bold shadow-soft">
                            {unread > 99 ? '99+' : unread}
                          </span>
                        ) : null}
                        <p
                          className={`text-[12px] font-bold ${
                            room.type === 'group'
                              ? 'line-clamp-2 break-words whitespace-normal leading-4'
                              : 'truncate'
                          } ${
                            isSelected
                              ? 'text-white'
                              : 'text-[var(--toss-gray-4)] dark:text-[var(--toss-gray-3)]'
                          }`}
                        >
                          {label}
                        </p>
                        {isPinned ? <span className="text-[9px] font-bold text-amber-400">PIN</span> : null}
                        {isHidden ? <span className="text-[9px] font-bold text-[var(--toss-gray-3)]">HIDE</span> : null}
                      </div>
                      <div
                        data-testid={`chat-room-preview-${roomId}`}
                        className="text-[10px] text-[var(--toss-gray-3)] font-medium truncate"
                      >
                        {preview}
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    {!isNoticeChannel ? (
                      <>
                        <button
                          type="button"
                          data-testid={`chat-room-pin-${roomId}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onToggleRoomPinned(room.id, !isPinned);
                          }}
                          className={`min-w-[44px] min-h-[44px] flex items-center justify-center px-1.5 py-1 rounded-md text-[9px] font-bold ${
                            isSelected
                              ? 'text-white/80 hover:bg-[var(--card)]/10'
                              : 'text-[var(--toss-gray-3)] hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800'
                          }`}
                          title={isPinned ? '고정 해제' : '상단 고정'}
                        >
                          {isPinned ? '해제' : '고정'}
                        </button>
                        {isPinned ? (
                          <>
                            <button
                              type="button"
                              data-testid={`chat-room-pin-up-${roomId}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                onMovePinnedRoom(room.id, 'up');
                              }}
                              disabled={pinnedIndex <= 0}
                              className={`min-w-[36px] min-h-[44px] flex items-center justify-center px-1 py-1 rounded-md text-[10px] font-bold ${
                                isSelected
                                  ? 'text-white/80 hover:bg-[var(--card)]/10 disabled:text-white/30'
                                  : 'text-[var(--toss-gray-3)] hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 disabled:text-[var(--toss-gray-1)]'
                              } disabled:cursor-not-allowed`}
                              title="고정방 위로"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              data-testid={`chat-room-pin-down-${roomId}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                onMovePinnedRoom(room.id, 'down');
                              }}
                              disabled={pinnedIndex < 0 || pinnedIndex >= pinnedCount - 1}
                              className={`min-w-[36px] min-h-[44px] flex items-center justify-center px-1 py-1 rounded-md text-[10px] font-bold ${
                                isSelected
                                  ? 'text-white/80 hover:bg-[var(--card)]/10 disabled:text-white/30'
                                  : 'text-[var(--toss-gray-3)] hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 disabled:text-[var(--toss-gray-1)]'
                              } disabled:cursor-not-allowed`}
                              title="고정방 아래로"
                            >
                              ↓
                            </button>
                          </>
                        ) : null}
                        <button
                          type="button"
                          data-testid={`chat-room-hide-${roomId}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onToggleRoomHidden(room.id, !isHidden);
                          }}
                          className={`min-w-[44px] min-h-[44px] flex items-center justify-center px-1.5 py-1 rounded-md text-[9px] font-bold ${
                            isSelected
                              ? 'text-white/80 hover:bg-[var(--card)]/10'
                              : 'text-[var(--toss-gray-3)] hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800'
                          }`}
                          title={isHidden ? '숨김 해제' : '대화 숨김'}
                        >
                          {isHidden ? '표시' : '숨김'}
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              )
            )}
          </>
        ) : (
          <div data-testid="chat-org-list" className="space-y-3">
            {Object.entries(groupedStaffs).map(([company, depts]) => (
              <div key={company} className="space-y-1">
                <div className="flex items-center gap-2 px-1 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500/100 shrink-0" />
                  <h3 className="text-[11px] font-black text-[var(--toss-gray-4)] dark:text-[var(--toss-gray-3)] uppercase tracking-wider truncate">
                    {company}
                  </h3>
                  <div className="flex-1 h-[1px] bg-[var(--tab-bg)] dark:bg-zinc-800/50" />
                </div>
                <div className="space-y-0.5 pl-1">
                  {Object.entries(depts as Record<string, StaffMember[]>).map(([dept, members]) => {
                    const key = `${company}::${dept}`;
                    const collapsed = !expandedDepts.has(key);
                    return (
                      <div key={dept}>
                        <button
                          type="button"
                          onClick={() => onToggleDept(key)}
                          className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800/60 transition-colors text-left"
                        >
                          <span
                            className={`text-[9px] text-[var(--toss-gray-3)] transition-transform duration-200 ${
                              collapsed ? '-rotate-90' : 'rotate-0'
                            }`}
                          >
                            ▼
                          </span>
                          <span className="text-[10px] font-bold text-[var(--toss-gray-3)] dark:text-[var(--toss-gray-4)] flex-1 truncate">
                            {dept}
                          </span>
                          <span className="text-[9px] font-semibold text-[var(--toss-gray-3)] shrink-0">
                            {members.length}명
                          </span>
                        </button>
                        {!collapsed ? (
                          <div className="space-y-0.5 pl-2 pt-0.5 pb-1">
                            {members.map((staff: StaffMember) => (
                              <div
                                key={staff.id}
                                className="flex items-center gap-2.5 px-2 py-2 bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border-subtle)] dark:border-zinc-800/50 rounded-xl hover:border-blue-400/50 dark:hover:border-blue-500/50 transition-all group cursor-default"
                              >
                                <MessengerAvatar
                                  name={staff.name}
                                  photoUrl={getProfilePhotoUrl(staff)}
                                  className="h-7 w-7 shrink-0 overflow-hidden rounded-lg bg-[var(--tab-bg)] text-[11px] font-bold text-[var(--toss-gray-3)] dark:bg-zinc-800"
                                  decorative
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1">
                                    <p className="text-[11px] font-bold text-foreground truncate">{staff.name}</p>
                                    <span className="text-[9px] font-medium text-[var(--toss-gray-3)] shrink-0">
                                      {staff.position}
                                    </span>
                                  </div>
                                </div>
                                <button
                                  data-testid={`chat-direct-${staff.id}`}
                                  onClick={() => void onOpenDirectChat(staff)}
                                  className="px-2 py-0.5 bg-blue-500/10 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-md text-[9px] font-bold opacity-100 transition-all border border-blue-100 dark:border-blue-800/50 shrink-0"
                                >
                                  대화
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
