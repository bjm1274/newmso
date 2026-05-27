'use client';

/**
 * SChatList — 모바일 채팅방 목록.
 * 헤더(검색·새 대화) + 칩바 탭(채팅/조직도/읽지않음/그룹/1:1/채널) + 채팅방 카드 리스트.
 * 디자인: handoff/newmso15/handoff_mobile/live-preview/mobile/m-screens-1.jsx L274~341 SChatList 1:1.
 *
 * JM2: rooms는 부모(채팅 index.tsx)에서 1회 fetch 후 전달 — 여기서 중복 fetch 안 함.
 * JM(< 500줄), JM3(silent 페치 + toast), JM4(any 금지), JM6(button 시맨틱).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MAvatar from '../공통/MAvatar';
import {
  formatChatTimestamp,
  getRoomKind,
  getRoomTitle,
  pickAvatarTone,
  useChatStaffDirectory,
  type MobileChatRoom,
} from './data-hooks';
import { NOTICE_ROOM_ID } from '@/app/main/기능부품/메신저유틸';
import { usePullToRefresh } from '../공통/usePullToRefresh';
import PullRefreshIndicator from '../공통/PullRefreshIndicator';

const SEARCH_DEBOUNCE_MS = 150;

type ChatListTab = 'chat' | 'org' | 'unread' | 'group' | 'direct' | 'channel';

export type SChatListProps = {
  user: ErpUser;
  /** JM2: 부모에서 fetch한 rooms — 중복 fetch 금지 */
  rooms: MobileChatRoom[];
  onOpen: (roomId: string) => void;
  onNew: () => void;
  /** PTR 콜백 — 부모 refresh 함수 전달 */
  onRefresh: () => Promise<void>;
};

export default function SChatList({ user, rooms, onOpen, onNew, onRefresh }: SChatListProps) {
  const [tab, setTab] = useState<ChatListTab>('chat');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const userId = typeof user.id === 'string' ? user.id : null;

  const staffs = useChatStaffDirectory();

  const loading = rooms.length === 0; // 부모가 loading 상태를 따로 노출하지 않으므로 대략 처리

  const { containerRef: scrollContainerRef, refreshing, pullProgress } = usePullToRefresh({
    onRefresh,
    enabled: !!userId,
  });

  // debounce 150ms — 칩 변경/탭 전환 시는 즉시 반영, 입력만 지연
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearchQuery(searchInput.trim().toLowerCase());
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  // 검색바가 열릴 때 자동 포커스
  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    } else {
      setSearchInput('');
      setSearchQuery('');
    }
  }, [searchOpen]);

  const totalUnread = useMemo(
    () => rooms.reduce((sum, room) => sum + (room.unread_count || 0), 0),
    [rooms],
  );

  const tabFiltered: MobileChatRoom[] = useMemo(() => {
    if (tab === 'chat') return rooms;
    if (tab === 'unread') return rooms.filter((r) => (r.unread_count || 0) > 0);
    if (tab === 'group') return rooms.filter((r) => r.type === 'group' || (!!r.type && r.type !== 'direct' && r.type !== 'notice'));
    if (tab === 'direct') return rooms.filter((r) => r.type === 'direct');
    if (tab === 'channel')
      return rooms.filter((r) => r.type === 'notice' || String(r.id) === NOTICE_ROOM_ID);
    // org 탭은 별도 placeholder — 필터 영향 없음
    return rooms;
  }, [rooms, tab]);

  const filtered: MobileChatRoom[] = useMemo(() => {
    if (!searchQuery) return tabFiltered;
    return tabFiltered.filter((room) => {
      const title = getRoomTitle(room, staffs, userId).toLowerCase();
      const lastMsg = (
        (typeof room.last_message_preview === 'string' ? room.last_message_preview : '') ||
        (typeof room.last_message === 'string' ? room.last_message : '')
      ).toLowerCase();
      const name = (room.name || '').toLowerCase();
      return (
        title.includes(searchQuery) ||
        name.includes(searchQuery) ||
        lastMsg.includes(searchQuery)
      );
    });
  }, [tabFiltered, searchQuery, staffs, userId]);

  return (
    <div className="m-screen">
      <PullRefreshIndicator refreshing={refreshing} pullProgress={pullProgress} />
      <MobileHeader
        title="채팅"
        sub={loading ? '불러오는 중…' : '실시간 연결됨'}
        actions={
          <>
            <button
              type="button"
              aria-label={searchOpen ? '채팅 검색 닫기' : '채팅 검색 열기'}
              aria-pressed={searchOpen}
              onClick={() => setSearchOpen((v) => !v)}
            >
              <MIcon name={searchOpen ? 'x' : 'search'} size={20} />
            </button>
            <button type="button" aria-label="새 대화 시작" onClick={onNew}>
              <MIcon name="edit" size={20} />
            </button>
          </>
        }
      />
      {searchOpen && (
        <div
          style={{
            height: 44,
            padding: '6px 16px',
            background: 'var(--m-card)',
            borderBottom: '1px solid var(--m-border)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <label
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--m-bg)',
              borderRadius: 10,
              padding: '6px 12px',
            }}
          >
            <MIcon name="search" size={16} color="var(--z-500)" />
            <span style={{ position: 'absolute', left: -9999 }}>채팅방 검색</span>
            <input
              ref={searchInputRef}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="방 이름·최근 메시지 검색"
              aria-label="채팅방 검색"
              style={{
                flex: 1,
                fontSize: 14,
                fontFamily: 'inherit',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                width: '100%',
                color: 'var(--z-900)',
              }}
            />
            {searchInput.length > 0 && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                aria-label="검색어 지우기"
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: 'var(--z-300)',
                  color: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                <MIcon name="x" size={11} />
              </button>
            )}
          </label>
        </div>
      )}
      <div className="m-chip-bar" role="tablist" aria-label="채팅 필터">
        <ChipBtn label="채팅" active={tab === 'chat'} onClick={() => setTab('chat')} />
        <ChipBtn label="조직도" active={tab === 'org'} onClick={() => setTab('org')} />
        <ChipBtn
          label={`읽지않음 ${totalUnread}`}
          active={tab === 'unread'}
          onClick={() => setTab('unread')}
        />
        <ChipBtn label="그룹" active={tab === 'group'} onClick={() => setTab('group')} />
        <ChipBtn label="1:1" active={tab === 'direct'} onClick={() => setTab('direct')} />
        <ChipBtn label="채널" active={tab === 'channel'} onClick={() => setTab('channel')} />
      </div>
      <div className="m-scroll" ref={scrollContainerRef} style={{ overscrollBehaviorY: 'contain' }}>
        {tab === 'org' ? (
          <OrgPlaceholder />
        ) : (
          <div style={{ padding: '4px 0 24px' }}>
            {filtered.length === 0 && !loading && (
              <EmptyState
                label={
                  searchQuery
                    ? `"${searchInput.trim()}"에 해당하는 채팅방이 없습니다.`
                    : emptyLabel(tab)
                }
              />
            )}
            {filtered.map((room, i) => (
              <RoomRow
                key={room.id}
                room={room}
                userId={userId}
                staffs={staffs}
                last={i === filtered.length - 1}
                onClick={() => onOpen(String(room.id))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 보조 ───────────────────────────────────────

type ChipBtnProps = { label: string; active: boolean; onClick: () => void };
function ChipBtn({ label, active, onClick }: ChipBtnProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={active ? 'on' : ''}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

type RoomRowProps = {
  room: MobileChatRoom;
  userId: string | null;
  staffs: ReturnType<typeof useChatStaffDirectory>;
  last: boolean;
  onClick: () => void;
};

function RoomRow({ room, userId, staffs, last, onClick }: RoomRowProps) {
  const title = getRoomTitle(room, staffs, userId);
  const kind = getRoomKind(room);
  const tone = pickAvatarTone(String(room.id) + title);
  const lastMsg =
    (typeof room.last_message_preview === 'string' && room.last_message_preview) ||
    (typeof room.last_message === 'string' && room.last_message) ||
    '';
  const ts = formatChatTimestamp(room.last_message_at || room.created_at);
  const unread = room.unread_count || 0;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${title} 채팅방 열기`}
      style={{
        display: 'grid',
        gridTemplateColumns: '52px 1fr auto',
        gap: 12,
        alignItems: 'center',
        padding: '12px 16px',
        borderBottom: last ? 'none' : '1px solid var(--m-border)',
        background: 'var(--m-card)',
        width: '100%',
        textAlign: 'left',
      }}
    >
      <MAvatar tone={tone}>{title.charAt(0) || '방'}</MAvatar>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: '-0.012em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </span>
          <span style={{ fontSize: 10, color: 'var(--z-500)', fontWeight: 600, flexShrink: 0 }}>
            {kind}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
          <span
            style={{
              fontSize: 12,
              color: 'var(--z-600)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 220,
            }}
          >
            {lastMsg || <span style={{ color: 'var(--z-400)' }}>대화 시작 전</span>}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <span style={{ fontSize: 10, color: 'var(--z-500)', fontWeight: 600 }}>{ts}</span>
        {unread > 0 && (
          <span
            aria-label={`안 읽음 ${unread}건`}
            style={{
              minWidth: 18,
              height: 18,
              padding: '0 5px',
              background: 'var(--m-accent)',
              color: '#fff',
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 800,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </div>
    </button>
  );
}

function OrgPlaceholder() {
  return (
    <div
      style={{
        padding: '40px 24px',
        textAlign: 'center',
        color: 'var(--z-500)',
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1.6,
      }}
    >
      조직도 탐색은 곧 추가됩니다.
      <br />
      새 대화 시작은 우상단 ✎ 버튼을 사용하세요.
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        color: 'var(--z-500)',
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {label}
    </div>
  );
}

function emptyLabel(tab: ChatListTab): string {
  switch (tab) {
    case 'unread':
      return '안 읽은 메시지가 없습니다.';
    case 'group':
      return '그룹 채팅이 없습니다.';
    case 'direct':
      return '1:1 대화가 없습니다.';
    case 'channel':
      return '채널이 없습니다.';
    default:
      return '참여 중인 채팅방이 없습니다.';
  }
}
