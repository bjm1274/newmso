'use client';

import {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  memo,
  type ReactElement,
} from 'react';
import { List, type RowComponentProps } from 'react-window';
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

// ─── 가상 스크롤 행 높이 (고정 행 + 액션 패널 예외) ──────────────────────
const HIDDEN_TOGGLE_HEIGHT = 28;
const SECTION_LABEL_HEIGHT = 24;
const ROOM_ROW_HEIGHT = 52;
const ROOM_ROW_ACTIONS_HEIGHT = 86;
const ORG_COMPANY_HEIGHT = 30;
const ORG_DEPT_HEIGHT = 34;
const ORG_STAFF_HEIGHT = 48;

type SidebarFlatRow =
  | { kind: 'hidden-toggle' }
  | { kind: 'section'; label: string; padTop?: boolean }
  | { kind: 'room'; item: MessengerSidebarRoomItem }
  | { kind: 'company'; name: string }
  | { kind: 'dept'; key: string; name: string; count: number; collapsed: boolean }
  | { kind: 'staff'; staff: StaffMember };

function useElementHeight<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const next = Math.floor(el.clientHeight);
      setHeight((prev) => (prev === next ? prev : next));
    };
    update();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }

    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, height };
}

function getSidebarRowHeight(
  index: number,
  flatRows: SidebarFlatRow[],
  actionRoomId: string | null,
): number {
  const row = flatRows[index];
  if (!row) return ROOM_ROW_HEIGHT;
  switch (row.kind) {
    case 'hidden-toggle':
      return HIDDEN_TOGGLE_HEIGHT;
    case 'section':
      return SECTION_LABEL_HEIGHT + (row.padTop ? 6 : 0);
    case 'room':
      return actionRoomId === row.item.roomId && !row.item.isNoticeChannel
        ? ROOM_ROW_ACTIONS_HEIGHT
        : ROOM_ROW_HEIGHT;
    case 'company':
      return ORG_COMPANY_HEIGHT;
    case 'dept':
      return ORG_DEPT_HEIGHT;
    case 'staff':
      return ORG_STAFF_HEIGHT;
    default:
      return ROOM_ROW_HEIGHT;
  }
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
  onOpenDirectChat }: MessengerSidebarProps) {
  const [actionRoomId, setActionRoomId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const { ref: listContainerRef, height: listHeight } = useElementHeight<HTMLDivElement>();
  // 현재 사용하지 않는 props: suppress unused-var lint
  void [onMovePinnedRoom, attentionThreadItems, mentionInboxItems, threadInboxItems,
        onOpenAttentionThreadItem, onOpenMentionItem, onOpenThreadItem];

  const filteredSidebarItems = useMemo(
    () => (showHiddenRooms ? sidebarRoomItems : sidebarRoomItems.filter((item) => !item.isHidden)),
    [sidebarRoomItems, showHiddenRooms],
  );
  const pinnedItems = useMemo(
    () => filteredSidebarItems.filter((item) => item.isPinned),
    [filteredSidebarItems],
  );
  const unpinnedItems = useMemo(
    () => filteredSidebarItems.filter((item) => !item.isPinned),
    [filteredSidebarItems],
  );

  const flatRows = useMemo<SidebarFlatRow[]>(() => {
    if (viewMode === 'chat') {
      const rows: SidebarFlatRow[] = [{ kind: 'hidden-toggle' }];
      if (pinnedItems.length > 0) {
        rows.push({ kind: 'section', label: '고정' });
        for (const item of pinnedItems) {
          rows.push({ kind: 'room', item });
        }
      }
      if (unpinnedItems.length > 0) {
        rows.push({ kind: 'section', label: '대화', padTop: pinnedItems.length > 0 });
        for (const item of unpinnedItems) {
          rows.push({ kind: 'room', item });
        }
      }
      return rows;
    }

    // 조직도 — 펼친 부서의 직원까지 평탄화해 가상 스크롤
    const rows: SidebarFlatRow[] = [];
    for (const [company, depts] of Object.entries(groupedStaffs)) {
      rows.push({ kind: 'company', name: company });
      for (const [dept, members] of Object.entries(depts as Record<string, StaffMember[]>)) {
        const key = `${company}::${dept}`;
        const collapsed = !expandedDepts.has(key);
        rows.push({ kind: 'dept', key, name: dept, count: members.length, collapsed });
        if (!collapsed) {
          for (const staff of members) {
            rows.push({ kind: 'staff', staff });
          }
        }
      }
    }
    return rows;
  }, [viewMode, pinnedItems, unpinnedItems, groupedStaffs, expandedDepts]);

  const rowHeight = useCallback(
    (index: number) => getSidebarRowHeight(index, flatRows, actionRoomId),
    [flatRows, actionRoomId],
  );

  const rowProps = useMemo(
    () => ({
      flatRows,
      actionRoomId,
      isMobile,
      showHiddenRooms,
      onToggleHiddenRooms,
      onRoomClick,
      onToggleRoomPinned,
      onToggleRoomHidden,
      setActionRoomId,
      onToggleDept,
      onOpenDirectChat,
    }),
    [
      flatRows,
      actionRoomId,
      isMobile,
      showHiddenRooms,
      onToggleHiddenRooms,
      onRoomClick,
      onToggleRoomPinned,
      onToggleRoomHidden,
      onToggleDept,
      onOpenDirectChat,
    ],
  );

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

      {/* 방 목록 / 조직도 — react-window List 가상 스크롤 */}
      <div
        ref={listContainerRef}
        className="chat-side-scroll px-2 pb-2 custom-scrollbar"
        data-testid={viewMode === 'org' ? 'chat-org-list' : undefined}
        style={{
          // flex:1 높이를 유지해야 listHeight 측정이 0 으로 고착되지 않는다.
          // display:block 으로 덮어쓰면 flex item 높이가 깨져 목록이 안 보이는 사례가 있었다.
          overflow: 'auto',
          minHeight: 0,
          flex: 1,
        }}
      >
        {flatRows.length > 0 ? (
          listHeight > 0 ? (
            <List
              rowComponent={SidebarVirtualRow}
              rowCount={flatRows.length}
              rowHeight={rowHeight}
              rowProps={rowProps}
              overscanCount={8}
              style={{ height: Math.max(listHeight, 120), width: '100%' }}
              className="custom-scrollbar"
            />
          ) : (
            // ResizeObserver 첫 프레임 전 폴백 — 숨김토글만이라도 보이게
            <div className="flex flex-col">
              {flatRows.slice(0, 40).map((row, index) => (
                <SidebarVirtualRow
                  key={
                    row.kind === 'room'
                      ? row.item.roomId
                      : row.kind === 'staff'
                        ? row.staff.id
                        : row.kind === 'dept'
                          ? row.key
                          : row.kind === 'company'
                            ? `c-${row.name}`
                            : row.kind === 'section'
                              ? `s-${row.label}`
                              : `r-${index}`
                  }
                  index={index}
                  style={{ height: getSidebarRowHeight(index, flatRows, actionRoomId) }}
                  ariaAttributes={{
                    'aria-posinset': index + 1,
                    'aria-setsize': flatRows.length,
                    role: 'listitem',
                  }}
                  {...rowProps}
                />
              ))}
            </div>
          )
        ) : null}
      </div>

      {/* 하단: 새 대화 시작 */}
      {viewMode === 'chat' && (
        <NewConversationButton onOpenGroupModal={onOpenGroupModal} />
      )}
    </aside>
  );
}

// ─── 가상 리스트 행 ─────────────────────────────────────────────────────

type SidebarRowProps = {
  flatRows: SidebarFlatRow[];
  actionRoomId: string | null;
  isMobile: boolean;
  showHiddenRooms: boolean;
  onToggleHiddenRooms: () => void;
  onRoomClick: (roomId: string) => void;
  onToggleRoomPinned: (roomId: string, shouldPin: boolean) => void;
  onToggleRoomHidden: (roomId: string, hidden: boolean) => void;
  setActionRoomId: React.Dispatch<React.SetStateAction<string | null>>;
  onToggleDept: (key: string) => void;
  onOpenDirectChat: (staff: StaffMember) => void | Promise<void>;
};

function SidebarVirtualRow({
  index,
  style,
  flatRows,
  actionRoomId,
  isMobile,
  showHiddenRooms,
  onToggleHiddenRooms,
  onRoomClick,
  onToggleRoomPinned,
  onToggleRoomHidden,
  setActionRoomId,
  onToggleDept,
  onOpenDirectChat,
}: RowComponentProps<SidebarRowProps>): ReactElement | null {
  const row = flatRows[index];
  if (!row) return null;

  if (row.kind === 'hidden-toggle') {
    return (
      <div style={style} className="flex items-center justify-end px-1">
        <button
          type="button"
          data-testid="chat-toggle-hidden-rooms"
          onClick={onToggleHiddenRooms}
          className="text-[10px] font-semibold text-[var(--accent)] hover:underline"
        >
          {showHiddenRooms ? '숨김방 닫기' : '숨김방 보기'}
        </button>
      </div>
    );
  }

  if (row.kind === 'section') {
    return (
      <div style={style}>
        <div className="chat-side-lbl" style={row.padTop ? { marginTop: 6 } : undefined}>
          {row.label}
        </div>
      </div>
    );
  }

  if (row.kind === 'room') {
    return (
      <div style={style}>
        <RoomRow
          item={row.item}
          actionRoomId={actionRoomId}
          isMobile={isMobile}
          onRoomClick={onRoomClick}
          onToggleRoomPinned={onToggleRoomPinned}
          onToggleRoomHidden={onToggleRoomHidden}
          setActionRoomId={setActionRoomId}
        />
      </div>
    );
  }

  if (row.kind === 'company') {
    return (
      <div style={style} className="flex items-center gap-2 px-1">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0" />
        <h3 className="text-[11px] font-black text-[var(--toss-gray-4)] uppercase tracking-wider truncate">
          {row.name}
        </h3>
        <div className="flex-1 h-[1px] bg-[var(--tab-bg)]" />
      </div>
    );
  }

  if (row.kind === 'dept') {
    return (
      <div style={style} className="pl-1">
        <button
          type="button"
          onClick={() => onToggleDept(row.key)}
          className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-[var(--radius-md)] hover:bg-[var(--tab-bg)] transition-colors text-left"
        >
          <span
            className={`text-[9px] text-[var(--toss-gray-3)] transition-transform duration-200 ${
              row.collapsed ? '-rotate-90' : 'rotate-0'
            }`}
          >
            ▼
          </span>
          <span className="text-[10px] font-bold text-[var(--toss-gray-3)] flex-1 truncate">
            {row.name}
          </span>
          <span className="text-[9px] font-semibold text-[var(--toss-gray-3)] shrink-0">
            {row.count}명
          </span>
        </button>
      </div>
    );
  }

  // staff
  const staff = row.staff;
  return (
    <div style={style} className="pl-3 pr-0">
      <div className="flex items-center gap-2 px-2 py-1.5 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] hover:border-[var(--accent)]/40 transition-all">
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
    </div>
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
  setActionRoomId }: RoomRowProps) {
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
    isHidden } = item;

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
          onTrigger: () => onToggleRoomPinned(room.id, !isPinned) },
      ]
    : [];
  const swipeRightActions: SwipeAction[] = enableSwipe
    ? [
        {
          id: 'hide',
          label: isHidden ? '표시' : '숨김',
          icon: isHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />,
          tone: 'normal',
          onTrigger: () => onToggleRoomHidden(room.id, !isHidden) },
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
            className="flex min-h-[28px] items-center justify-center rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all bg-slate-900 text-white hover:bg-slate-800 active:scale-95 shadow-sm border border-slate-700/50"
            title={isPinned ? '고정 해제' : '상단 고정'}
          >
            {isPinned ? '고정 해제' : '상단 고정'}
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
