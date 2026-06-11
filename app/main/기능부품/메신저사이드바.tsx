'use client';

import { useState, memo } from 'react';
import { Bell, Pin, PinOff, EyeOff, Eye, Search } from 'lucide-react';
import { MessengerAvatar } from './메신저공통';
import { getGroupChatRoomBadgeText, toChatDate } from './메신저유틸';
import { getProfilePhotoUrl } from '@/lib/profile-photo';
import { SwipeableCard, type SwipeAction } from '@/app/components/SwipeableCard';
import { useIsMobile } from '@/app/components/useIsMobile';
import type { ChatRoom, StaffMember } from '@/types';

export type MessengerViewMode = 'chat' | 'org';

export type MessengerSidebarRoomItem = {
  room: ChatRoom;
  roomId: string;
  unread: number;
  isSelected: boolean;
  isNoticeChannel: boolean;
  isGroupRoom: boolean;
  participantCount: number;
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

export type MessengerMentionInboxItem = {
  id: string;
  roomId: string;
  messageId: string;
  roomName: string;
  senderName: string;
  body: string;
  createdAt: string;
  unread: boolean;
};

export type MessengerThreadInboxItem = {
  id: string;
  roomId: string;
  messageId: string;
  threadRootId: string;
  roomName: string;
  senderName: string;
  body: string;
  createdAt: string;
  unread: boolean;
  followed: boolean;
};

type MessengerSidebarProps = {
  selectedRoomId: string | null;
  viewMode: MessengerViewMode;
  showHiddenRooms: boolean;
  sidebarRoomItems: MessengerSidebarRoomItem[];
  attentionThreadItems?: MessengerThreadInboxItem[];
  mentionInboxItems: MessengerMentionInboxItem[];
  threadInboxItems?: MessengerThreadInboxItem[];
  groupedStaffs: Record<string, Record<string, StaffMember[]>>;
  expandedDepts: Set<string>;
  onViewModeChange: (mode: MessengerViewMode) => void;
  onOpenGroupModal?: () => void;
  onOpenGlobalSearch: () => void;
  onToggleHiddenRooms: () => void;
  onRoomClick: (roomId: string) => void;
  onOpenAttentionThreadItem?: (item: MessengerThreadInboxItem) => void;
  onOpenMentionItem: (item: MessengerMentionInboxItem) => void;
  onOpenThreadItem?: (item: MessengerThreadInboxItem) => void;
  onToggleRoomPinned: (roomId: string, shouldPin: boolean) => void;
  onMovePinnedRoom: (roomId: string, direction: 'up' | 'down') => void;
  onToggleRoomHidden: (roomId: string, hidden: boolean) => void;
  onToggleDept: (key: string) => void;
  onOpenDirectChat: (staff: StaffMember) => void | Promise<void>;
};

// 라이브 정답 tone 팔레트 (handoff/03-chat-채팅) — .chat-room-pic.tone-*
const TONE_NAMES = ['blue', 'amber', 'green', 'cyan', 'violet', 'pink', 'gray'] as const;
type ChatRoomTone = (typeof TONE_NAMES)[number];

function hashRoomTone(seed: string): ChatRoomTone {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) & 0xffff;
  }
  return TONE_NAMES[h % TONE_NAMES.length];
}

// 마지막 메시지 시각 포맷 — 오늘이면 HH:mm, 아니면 MM/DD
function formatRoomTime(raw: string | null | undefined): string {
  if (!raw) return '';
  const d = toChatDate(raw);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export function MessengerSidebar({
  selectedRoomId,
  viewMode,
  showHiddenRooms,
  sidebarRoomItems,
  attentionThreadItems = [],
  mentionInboxItems,
  threadInboxItems = [],
  groupedStaffs,
  expandedDepts,
  onViewModeChange,
  onOpenGroupModal,
  onOpenGlobalSearch,
  onToggleHiddenRooms,
  onRoomClick,
  onOpenAttentionThreadItem = () => {},
  onOpenMentionItem,
  onOpenThreadItem = () => {},
  onToggleRoomPinned,
  onMovePinnedRoom,
  onToggleRoomHidden,
  onToggleDept,
  onOpenDirectChat,
}: MessengerSidebarProps) {
  const [actionRoomId, setActionRoomId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  // 현재 사용하지 않는 props: suppress unused-var lint
  void [onMovePinnedRoom, attentionThreadItems, mentionInboxItems, threadInboxItems,
        onOpenAttentionThreadItem, onOpenMentionItem, onOpenThreadItem];

  const pinnedItems = sidebarRoomItems.filter((item) => item.isPinned);
  const unpinnedItems = sidebarRoomItems.filter((item) => !item.isPinned);

  return (
    <aside
      className={`${selectedRoomId ? 'hidden md:flex' : 'flex'} chat-side w-full md:w-[290px] border-r border-[var(--border)] bg-[var(--card)] shrink-0 z-50 transition-all`}
    >
      {/* 상단 헤더: 채팅/조직도 탭 + 검색 (라이브 §2-1 .chat-side-head) */}
      <div className="chat-side-head">
        <div className="chat-tabs">
          <button
            type="button"
            data-testid="chat-tab-chat"
            onClick={() => onViewModeChange('chat')}
            className={viewMode === 'chat' ? 'on' : ''}
          >
            채팅
          </button>
          <button
            type="button"
            data-testid="chat-tab-org"
            onClick={() => onViewModeChange('org')}
            className={viewMode === 'org' ? 'on' : ''}
          >
            조직도
          </button>
        </div>

        <div className="relative flex-1 min-w-0">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--toss-gray-3)]">
            <Search size={12} />
          </span>
          <input
            type="text"
            data-testid="chat-open-global-search"
            readOnly
            placeholder="이름·메시지 검색"
            onClick={onOpenGlobalSearch}
            onFocus={onOpenGlobalSearch}
            style={{ paddingLeft: '28px' }}
            className="w-full h-7 pr-2 text-[11px] bg-[var(--muted)] border border-transparent rounded-[var(--radius-md)] text-[var(--toss-gray-5)] placeholder:text-[var(--toss-gray-3)] cursor-pointer focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>
      </div>

      {/* 방 목록 / 조직도 */}
      <div className="chat-side-scroll px-2 pb-2 custom-scrollbar" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 56px' }}>
        {viewMode === 'chat' ? (
          <>
            {/* 숨김 토글 링크 */}
            <div className="flex items-center justify-end px-1 py-1">
              <button
                type="button"
                data-testid="chat-toggle-hidden-rooms"
                onClick={onToggleHiddenRooms}
                className="text-[10px] font-semibold text-[var(--accent)] hover:underline"
              >
                {showHiddenRooms ? '숨김방 닫기' : '숨김방 보기'}
              </button>
            </div>

            {/* 고정 그룹 */}
            {pinnedItems.length > 0 && (
              <>
                <div className="chat-side-lbl">고정</div>
                {pinnedItems.map((item) => (
                  <RoomRow
                    key={item.roomId}
                    item={item}
                    actionRoomId={actionRoomId}
                    isMobile={isMobile}
                    onRoomClick={onRoomClick}
                    onToggleRoomPinned={onToggleRoomPinned}
                    onToggleRoomHidden={onToggleRoomHidden}
                    setActionRoomId={setActionRoomId}
                  />
                ))}
              </>
            )}

            {/* 대화 그룹 */}
            {unpinnedItems.length > 0 && (
              <>
                <div className="chat-side-lbl" style={{ marginTop: 6 }}>대화</div>
                {unpinnedItems.map((item) => (
                  <RoomRow
                    key={item.roomId}
                    item={item}
                    actionRoomId={actionRoomId}
                    isMobile={isMobile}
                    onRoomClick={onRoomClick}
                    onToggleRoomPinned={onToggleRoomPinned}
                    onToggleRoomHidden={onToggleRoomHidden}
                    setActionRoomId={setActionRoomId}
                  />
                ))}
              </>
            )}
          </>
        ) : (
          /* 조직도 뷰 */
          <div data-testid="chat-org-list" className="space-y-3 pt-1">
            {Object.entries(groupedStaffs).map(([company, depts]) => (
              <div key={company} className="space-y-1">
                <div className="flex items-center gap-2 px-1 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0" />
                  <h3 className="text-[11px] font-black text-[var(--toss-gray-4)] uppercase tracking-wider truncate">
                    {company}
                  </h3>
                  <div className="flex-1 h-[1px] bg-[var(--tab-bg)]" />
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
                          className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-[var(--radius-md)] hover:bg-[var(--tab-bg)] transition-colors text-left"
                        >
                          <span
                            className={`text-[9px] text-[var(--toss-gray-3)] transition-transform duration-200 ${
                              collapsed ? '-rotate-90' : 'rotate-0'
                            }`}
                          >
                            ▼
                          </span>
                          <span className="text-[10px] font-bold text-[var(--toss-gray-3)] flex-1 truncate">
                            {dept}
                          </span>
                          <span className="text-[9px] font-semibold text-[var(--toss-gray-3)] shrink-0">
                            {members.length}명
                          </span>
                        </button>
                        {!collapsed && (
                          <div className="space-y-0.5 pl-2 pt-0.5 pb-1">
                            {members.map((staff: StaffMember) => (
                              <div
                                key={staff.id}
                                className="flex items-center gap-2 px-2 py-2 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] hover:border-[var(--accent)]/40 transition-all"
                              >
                                <MessengerAvatar
                                  name={staff.name}
                                  photoUrl={getProfilePhotoUrl(staff)}
                                  className="h-7 w-7 shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-[var(--tab-bg)] text-[11px] font-bold text-[var(--toss-gray-3)]"
                                  decorative
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1">
                                    <p className="text-[11px] font-bold text-[var(--foreground)] truncate">{staff.name}</p>
                                    <span className="text-[9px] font-medium text-[var(--toss-gray-3)] shrink-0">
                                      {staff.position}
                                    </span>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  data-testid={`chat-direct-${staff.id}`}
                                  onClick={() => void onOpenDirectChat(staff)}
                                  className="px-2 py-0.5 bg-[var(--accent)]/10 text-[var(--accent)] rounded-[var(--radius-sm)] text-[9px] font-bold border border-[var(--accent)]/20 shrink-0"
                                >
                                  대화
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 하단: 새 대화 시작 */}
      {viewMode === 'chat' && (
        <NewConversationButton onOpenGroupModal={onOpenGroupModal} />
      )}
    </aside>
  );
}

// ─── 방 row 서브컴포넌트 ─────────────────────────────────────────────────

type RoomRowProps = {
  item: MessengerSidebarRoomItem;
  actionRoomId: string | null;
  isMobile: boolean;
  onRoomClick: (roomId: string) => void;
  onToggleRoomPinned: (roomId: string, shouldPin: boolean) => void;
  onToggleRoomHidden: (roomId: string, hidden: boolean) => void;
  setActionRoomId: React.Dispatch<React.SetStateAction<string | null>>;
};

const RoomRow = memo(function RoomRow({
  item,
  actionRoomId,
  isMobile,
  onRoomClick,
  onToggleRoomPinned,
  onToggleRoomHidden,
  setActionRoomId,
}: RoomRowProps) {
  const {
    room,
    roomId,
    unread,
    isSelected,
    isNoticeChannel,
    isGroupRoom,
    participantCount,
    label,
    preview,
    peerName,
    peerPhotoUrl,
    isPeerOnline,
    isPinned,
    isHidden,
  } = item;

  const tone = hashRoomTone(room.id || room.name || '');
  const rawTime = typeof room.last_message_at === 'string' ? room.last_message_at : null;
  const timeStr = formatRoomTime(rawTime);
  const groupBadgeText = isGroupRoom ? getGroupChatRoomBadgeText(label) : '';

  const enableSwipe = isMobile && !isNoticeChannel;
  const swipeLeftActions: SwipeAction[] = enableSwipe
    ? [
        {
          id: 'pin',
          label: isPinned ? '고정 해제' : '고정',
          icon: isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />,
          tone: 'normal',
          onTrigger: () => onToggleRoomPinned(room.id, !isPinned),
        },
      ]
    : [];
  const swipeRightActions: SwipeAction[] = enableSwipe
    ? [
        {
          id: 'hide',
          label: isHidden ? '표시' : '숨김',
          icon: isHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />,
          tone: 'normal',
          onTrigger: () => onToggleRoomHidden(room.id, !isHidden),
        },
      ]
    : [];

  const handlePrimaryClick = () => {
    setActionRoomId((current) => (current && current !== roomId ? null : current));
    onRoomClick(room.id);
  };

  // 라이브 정답 tone: 공지=accent, 그룹/DM=hashRoomTone, peer avatar는 사진 우선
  const picTone = isNoticeChannel ? 'accent' : tone;
  const presence = peerName && !isGroupRoom && !isNoticeChannel
    ? (isPeerOnline ? 'on' : 'off')
    : null;

  const cardBody = (
    <div
      onDoubleClick={(e) => {
        e.preventDefault();
        setActionRoomId((current) => (current === roomId ? null : roomId));
      }}
      className="relative"
    >
      {/* 메인 row — 라이브 §2-1 .chat-room */}
      <div
        role="button"
        tabIndex={0}
        data-testid={`chat-room-${roomId}`}
        onClick={handlePrimaryClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handlePrimaryClick();
          }
        }}
        className={`chat-room${isSelected ? ' on' : ''} focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]`}
      >
        {/* 좌: 30×30 아바타 (.chat-room-pic.tone-*) */}
        <div
          data-testid={`chat-room-icon-${roomId}`}
          className={`chat-room-pic tone-${picTone}`}
        >
          {isNoticeChannel ? (
            <Bell size={14} />
          ) : peerName && !isGroupRoom && peerPhotoUrl ? (
            <MessengerAvatar
              name={peerName || label}
              photoUrl={peerPhotoUrl}
              className="w-full h-full flex items-center justify-center overflow-hidden rounded-full text-[10px] font-bold"
              decorative
            />
          ) : isGroupRoom ? (
            <span>{groupBadgeText}</span>
          ) : (
            <span>{(peerName || label || '?').charAt(0)}</span>
          )}
          {presence && <span className={`chat-room-dot ${presence}`} />}
        </div>

        {/* 중: 이름 row1 + 미리보기 row2 (.chat-room-body) */}
        <div className="chat-room-body" data-testid={`chat-room-summary-${roomId}`}>
          <div className="chat-room-top">
            <span
              className="chat-room-name"
              title={isGroupRoom ? label : undefined}
            >
              {label || '단체 채팅방'}
            </span>
            {isGroupRoom && participantCount > 0 && (
              <span className="chat-room-cnt">{participantCount}명</span>
            )}
            {timeStr && <span className="chat-room-at">{timeStr}</span>}
          </div>
          <div
            className="chat-room-last"
            data-testid={`chat-room-preview-${roomId}`}
          >
            {preview}
          </div>
        </div>

        {/* 우: 안 읽음 chip (.chat-room-badge) */}
        {unread > 0 && (
          <span className="chat-room-badge">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </div>

      {/* 더블클릭 액션 패널 */}
      {actionRoomId === roomId && !isNoticeChannel && (
        <div
          data-testid={`chat-room-actions-${roomId}`}
          className="flex items-center justify-end gap-1 px-2 pb-1.5"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            data-testid={`chat-room-pin-${roomId}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleRoomPinned(room.id, !isPinned);
              setActionRoomId(null);
            }}
            className={`flex min-h-[28px] min-w-[40px] items-center justify-center rounded-[var(--radius-sm)] px-2 py-1 text-[10px] font-bold ${
              isSelected
                ? 'bg-white/20 text-white hover:bg-white/30'
                : 'bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20'
            }`}
            title={isPinned ? '고정 해제' : '상단 고정'}
          >
            {isPinned ? '해제' : '고정'}
          </button>
          <button
            type="button"
            data-testid={`chat-room-hide-${roomId}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleRoomHidden(room.id, !isHidden);
              setActionRoomId(null);
            }}
            className={`flex min-h-[28px] min-w-[40px] items-center justify-center rounded-[var(--radius-sm)] px-2 py-1 text-[10px] font-bold ${
              isSelected
                ? 'bg-white/20 text-white hover:bg-white/30'
                : 'bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20'
            }`}
            title={isHidden ? '숨김 해제' : '대화 숨김'}
          >
            {isHidden ? '표시' : '숨김'}
          </button>
        </div>
      )}
    </div>
  );

  if (enableSwipe) {
    return (
      <SwipeableCard
        key={roomId}
        leftActions={swipeLeftActions}
        rightActions={swipeRightActions}
        className="bg-transparent"
      >
        {cardBody}
      </SwipeableCard>
    );
  }

  return <div key={roomId}>{cardBody}</div>;
});

// ─── 새 대화 시작 버튼 ──────────────────────────────────────────────────

function NewConversationButton({ onOpenGroupModal }: { onOpenGroupModal?: () => void }) {
  return (
    <div className="px-3 pb-3 pt-1 shrink-0">
      <button
        type="button"
        data-testid="chat-new-conversation"
        onClick={onOpenGroupModal}
        disabled={!onOpenGroupModal}
        className="chat-side-add w-full disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span className="text-base leading-none">+</span>
        새 대화 시작
      </button>
    </div>
  );
}
