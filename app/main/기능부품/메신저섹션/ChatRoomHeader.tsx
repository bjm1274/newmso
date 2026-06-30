'use client';

// 메신저.tsx에서 추출한 채팅방 헤더(아바타/제목/연결상태/액션버튼).
// 순수 프레젠테이션이며 상태/콜백은 props로만 전달받는다.

import { MenuIcon } from '../조직도서브/조직도측면창';
import { MessengerAvatar } from '../메신저공통';
import { NOTICE_ROOM_ID } from '../메신저유틸';
import type { StaffMember, ChatRoom } from '@/types';

interface RealtimeConnectionMeta {
  textClassName: string;
  dotClassName: string;
  label: string;
}

interface ChatRoomHeaderProps {
  selectedRoom: ChatRoom;
  selectedPeer: StaffMember | null;
  selectedRoomLabel: string;
  selectedPeerPhotoUrl: string | null | undefined;
  roomMembers: StaffMember[];
  realtimeConnectionMeta: RealtimeConnectionMeta;
  onBack: () => void;
  onOpenStaffProfile: (staff: StaffMember) => void;
  onOpenPollModal: () => void;
  onOpenApprovalDraft: () => void;
  onOpenMediaArchive: (filter: 'media') => void;
  onOpenDrawer: () => void;
}

export function ChatRoomHeader({
  selectedRoom,
  selectedPeer,
  selectedRoomLabel,
  selectedPeerPhotoUrl,
  roomMembers,
  realtimeConnectionMeta,
  onBack,
  onOpenStaffProfile,
  onOpenPollModal,
  onOpenApprovalDraft,
  onOpenMediaArchive,
  onOpenDrawer }: ChatRoomHeaderProps) {
  return (
    <header className="px-4 py-2.5 flex items-center justify-between border-b border-[var(--border)]/50 dark:border-zinc-800/50 glass glass-border shrink-0 z-40">
      <div className="flex items-center gap-3 min-w-0">
        <button type="button" onClick={onBack} className="md:hidden text-[var(--toss-gray-3)]">뒤로</button>
        <div data-testid="chat-room-header-avatar" className="flex h-9 w-9 shrink-0 items-center justify-center">
          {selectedRoom.id === NOTICE_ROOM_ID ? (
            <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--accent-light)] text-[var(--accent)]">
              <MenuIcon name="bell" className="h-5 w-5" />
            </div>
          ) : selectedPeer ? (
            <button
              type="button"
              onClick={() => onOpenStaffProfile(selectedPeer)}
              className="focus-visible:outline-none shrink-0 hover:opacity-85 transition-opacity"
              title={selectedPeer.name || selectedRoomLabel || ''}
            >
              <MessengerAvatar
                name={selectedPeer.name || selectedRoomLabel}
                photoUrl={selectedPeerPhotoUrl}
                className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-[var(--tab-bg)] text-[12px] font-bold text-[var(--toss-gray-4)] dark:bg-zinc-800"
                decorative
              />
            </button>
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--tab-bg)] text-[var(--toss-gray-4)] dark:bg-zinc-800">
              <MenuIcon name="chat" className="h-5 w-5" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <h3 className={`text-[13px] font-bold text-foreground ${selectedRoom.type === 'group' ? 'line-clamp-2 break-words whitespace-normal leading-4' : 'truncate'}`}>
            {selectedRoomLabel}
          </h3>
          <div className="flex items-center gap-1.5 text-[10px] font-medium">
            {!selectedPeer ? (
              <>
                <p className="text-[var(--toss-gray-4)]">{roomMembers.length || 0}명 참여중</p>
                <span className="text-[var(--toss-gray-4)]">·</span>
              </>
            ) : null}
            <span className={`inline-flex items-center gap-1 ${realtimeConnectionMeta.textClassName}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${realtimeConnectionMeta.dotClassName}`} />
              <span>{realtimeConnectionMeta.label}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {/* 투표 */}
        <button
          type="button"
          data-testid="chat-header-poll"
          onClick={onOpenPollModal}
          aria-label="투표 만들기"
          title="투표 만들기"
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--toss-gray-4)] transition-all hover:bg-[var(--tab-bg)] hover:text-[var(--foreground)] dark:hover:bg-zinc-800"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="13" width="3" height="4" rx="0.5" />
            <rect x="8.5" y="9" width="3" height="8" rx="0.5" />
            <rect x="14" y="5" width="3" height="12" rx="0.5" />
          </svg>
        </button>
        {/* 결재 초안 */}
        <button
          type="button"
          data-testid="chat-header-approval-draft"
          onClick={onOpenApprovalDraft}
          aria-label="결재 초안 작성"
          title="결재 초안 작성"
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--toss-gray-4)] transition-all hover:bg-[var(--tab-bg)] hover:text-[var(--foreground)] dark:hover:bg-zinc-800"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="3" width="12" height="14" rx="1.5" />
            <path d="M7 7h6M7 10h6M7 13h4" />
          </svg>
        </button>
        {/* 미디어 아카이브 */}
        <button
          type="button"
          data-testid="chat-header-archive"
          onClick={() => onOpenMediaArchive('media')}
          aria-label="미디어 아카이브"
          title="미디어 아카이브"
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--toss-gray-4)] transition-all hover:bg-[var(--tab-bg)] hover:text-[var(--foreground)] dark:hover:bg-zinc-800"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="16" height="3" rx="1" />
            <path d="M3 8v8a1 1 0 001 1h12a1 1 0 001-1V8" />
            <path d="M8 12h4" />
          </svg>
        </button>
        {/* 드로어 토글 */}
        <button
          type="button"
          data-testid="chat-open-drawer"
          onClick={onOpenDrawer}
          aria-label="채팅방 정보 및 참여자 보기"
          title="채팅방 정보 및 참여자 보기"
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--toss-gray-4)] transition-all hover:bg-[var(--tab-bg)] hover:text-[var(--foreground)] dark:hover:bg-zinc-800"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 5.5H16" />
            <path d="M4 10H16" />
            <path d="M4 14.5H16" />
          </svg>
        </button>
      </div>
    </header>
  );
}
