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
  /** 1:1 상대 온라인 여부 — presenceMap/heartbeat 기반 */
  selectedPeerIsOnline?: boolean;
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
  selectedPeerIsOnline = false,
  roomMembers,
  realtimeConnectionMeta,
  onBack,
  onOpenStaffProfile,
  onOpenPollModal,
  onOpenApprovalDraft,
  onOpenMediaArchive,
  onOpenDrawer }: ChatRoomHeaderProps) {
  return (
    <header className="px-4 py-2.5 flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] shrink-0 z-40">
      <div className="flex items-center gap-3 min-w-0">
        <button type="button" onClick={onBack} className="md:hidden text-[var(--toss-gray-3)]">뒤로</button>
        <div data-testid="chat-room-header-avatar" className="relative flex h-[38px] w-[38px] shrink-0 items-center justify-center">
          {selectedRoom.id === NOTICE_ROOM_ID ? (
            <div className="flex h-[38px] w-[38px] items-center justify-center rounded-[11px] bg-[var(--accent-light)] text-[var(--accent)]">
              <MenuIcon name="bell" className="h-5 w-5" />
            </div>
          ) : selectedPeer ? (
            <button
              type="button"
              onClick={() => onOpenStaffProfile(selectedPeer)}
              className="focus-visible:outline-none shrink-0 hover:opacity-85 transition-opacity relative"
              title={selectedPeer.name || selectedRoomLabel || ''}
            >
              <MessengerAvatar
                name={selectedPeer.name || selectedRoomLabel}
                photoUrl={selectedPeerPhotoUrl}
                className="flex h-[38px] w-[38px] items-center justify-center overflow-hidden rounded-[11px] bg-[var(--tab-bg)] text-[13px] font-bold text-[var(--toss-gray-4)] dark:bg-zinc-800"
                decorative
              />
              <span
                className={`chat-room-dot ${selectedPeerIsOnline ? 'on' : 'off'}`}
                data-testid="chat-room-header-presence-dot"
                aria-hidden="true"
              />
            </button>
          ) : (
            <div className="flex h-[38px] w-[38px] items-center justify-center rounded-[11px] bg-[var(--tab-bg)] text-[var(--toss-gray-4)] dark:bg-zinc-800">
              <MenuIcon name="chat" className="h-5 w-5" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className={`text-[14.5px] font-extrabold text-foreground ${selectedRoom.type === 'group' ? 'line-clamp-2 break-words whitespace-normal leading-5' : 'truncate'}`}>
              {selectedRoomLabel}
            </h3>
            {/*
              그룹방에서 누가 있는지 알려면 드로어를 열어야 했다. 헤더에서 바로
              보이게 최대 3명 + 나머지 수를 겹쳐 둔다.
            */}
            {!selectedPeer && roomMembers.length > 0 && (
              <span className="hidden shrink-0 items-center md:flex" aria-hidden="true">
                {roomMembers.slice(0, 3).map((member, index) => (
                  <MessengerAvatar
                    key={String(member.id)}
                    name={member.name || ''}
                    photoUrl={member.photo_url}
                    className={`flex h-[26px] w-[26px] items-center justify-center overflow-hidden rounded-full border-2 border-[var(--card)] bg-[var(--tab-bg)] text-[10px] font-bold text-[var(--toss-gray-4)] dark:bg-zinc-800 ${index > 0 ? '-ml-2' : ''}`}
                    decorative
                  />
                ))}
                {roomMembers.length > 3 && (
                  <span className="-ml-2 flex h-[26px] min-w-[26px] items-center justify-center rounded-full border-2 border-[var(--card)] bg-[var(--muted)] px-1 text-[10px] font-bold text-[var(--zinc-600)]">
                    +{roomMembers.length - 3}
                  </span>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-medium">
            {selectedPeer ? (
              <span
                className={`inline-flex items-center gap-1 ${selectedPeerIsOnline ? 'text-emerald-500' : 'text-[var(--toss-gray-4)]'}`}
                data-testid="chat-room-header-presence"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${selectedPeerIsOnline ? 'bg-emerald-500' : 'bg-[var(--toss-gray-4)]'}`} />
                <span>{selectedPeerIsOnline ? '온라인' : '자리비움'}</span>
              </span>
            ) : (
              <>
                <p className="text-[var(--toss-gray-4)]">{roomMembers.length || 0}명 참여중</p>
                <span className="text-[var(--toss-gray-4)]">·</span>
                <span className={`inline-flex items-center gap-1 ${realtimeConnectionMeta.textClassName}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${realtimeConnectionMeta.dotClassName}`} />
                  <span>{realtimeConnectionMeta.label}</span>
                </span>
              </>
            )}
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
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] text-[var(--zinc-600)] transition-all hover:bg-[var(--tab-bg)] hover:text-[var(--foreground)] dark:hover:bg-zinc-800"
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
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] text-[var(--zinc-600)] transition-all hover:bg-[var(--tab-bg)] hover:text-[var(--foreground)] dark:hover:bg-zinc-800"
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
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] text-[var(--zinc-600)] transition-all hover:bg-[var(--tab-bg)] hover:text-[var(--foreground)] dark:hover:bg-zinc-800"
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
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[var(--muted)] text-[var(--zinc-600)] transition-all hover:bg-[var(--tab-bg)] hover:text-[var(--foreground)] dark:hover:bg-zinc-800"
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
