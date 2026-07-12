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

import MIcon from '../공통/MIcon';
import MAvatar from '../공통/MAvatar';
import {
  formatChatTimestamp,
  getRoomKind,
  getRoomTitle,
  pickAvatarTone,
  useChatStaffDirectory,
  useChatMessageSearch,
  type MobileChatRoom,
  type ChatMessageSearchHit,
  type StaffDirectoryEntry } from './data-hooks';
import { NOTICE_ROOM_ID, isGroupChatRoom, getGroupChatRoomBadgeText, isSelfChatRoom } from '@/app/main/기능부품/메신저유틸';
import { usePullToRefresh } from '../공통/usePullToRefresh';
import PullRefreshIndicator from '../공통/PullRefreshIndicator';
import { createOrUpsertChatRoom } from '@/lib/chat-rooms-client';
import { toast } from '@/lib/toast';

const SEARCH_DEBOUNCE_MS = 150;

type ChatListTab = 'chat' | 'org' | 'unread' | 'group' | 'direct' | 'channel';

export type SChatListProps = {
  user: ErpUser;
  /** JM2: 부모에서 fetch한 rooms — 중복 fetch 금지 */
  rooms: MobileChatRoom[];
  /** 부모 useChatRoomsForMobile.loading — rooms.length===0 과 구분 */
  roomsLoading?: boolean;
  onOpen: (roomId: string, searchMessageId?: string) => void;
  onNew: () => void;
  /** PTR 콜백 — 부모 refresh 함수 전달 */
  onRefresh: () => Promise<void>;
};

export default function SChatList({ user, rooms, roomsLoading = false, onOpen, onNew, onRefresh }: SChatListProps) {
  const [tab, setTab] = useState<ChatListTab>('chat');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const userId = typeof user.id === 'string' ? user.id : null;
  const company = typeof user.company === 'string' ? user.company : null;

  const staffs = useChatStaffDirectory(company);

  const handleStartDirectChat = async (peerId: string, peerName: string) => {
    if (!userId) {
      toast('로그인 정보를 찾을 수 없습니다.', 'error');
      return;
    }
    const memberIds = Array.from(new Set([userId, peerId]));
    
    // Find existing direct room from the rooms list
    const existing = rooms.find((room) => {
      if (room.type !== 'direct') return false;
      const mIds = Array.isArray(room.members) ? room.members.map(String) : [];
      return mIds.length === 2 && mIds.includes(userId) && mIds.includes(peerId);
    });

    if (existing) {
      onOpen(String(existing.id));
      return;
    }

    try {
      const result = await createOrUpsertChatRoom({
        name: peerName,
        type: 'direct',
        members: memberIds,
        created_by: userId });
      if (result.ok && result.room) {
        await onRefresh().catch(() => undefined);
        onOpen(String(result.room.id));
      } else {
        toast(result.error || '대화방 연결 실패', 'error');
      }
    } catch (err) {
      toast('대화방 연결에 실패했습니다.', 'error');
    }
  };

  const matchedStaffs = useMemo(() => {
    if (!searchQuery) return [];
    return staffs.filter((s) => {
      if (s.id === userId) return false;
      const name = (s.name || '').toLowerCase();
      const dept = (s.department || '').toLowerCase();
      const pos = (s.position || '').toLowerCase();
      return name.includes(searchQuery) || dept.includes(searchQuery) || pos.includes(searchQuery);
    });
  }, [staffs, searchQuery, userId]);

  const orgGroups = useMemo(() => groupByDept(staffs), [staffs]);
  const roomIds = useMemo(() => rooms.map((r) => String(r.id)), [rooms]);
  // 방 제목·마지막 메시지뿐 아니라 대화 "내용"까지 검색 (PC 전역검색과 동일한 ilike 방식)
  const { hits: messageHits, loading: messageSearchLoading } = useChatMessageSearch(roomIds, searchQuery);

  const loading = roomsLoading;

  const { containerRef: scrollContainerRef, refreshing, pullProgress } = usePullToRefresh({
    onRefresh,
    enabled: !!userId });

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
    if (tab === 'group') return rooms.filter((r) => isGroupChatRoom(r));
    if (tab === 'direct') return rooms.filter((r) => !isGroupChatRoom(r) && r.type === 'direct');
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
      {searchOpen && (
        <div
          className="macos-glass"
          style={{
            height: 48,
            padding: '6px 16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: 8 }}
        >
          <label
            className="macos-squircle-sm"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(0, 0, 0, 0.04)',
              padding: '6px 12px' }}
          >
            <MIcon name="search" size={16} color="var(--z-500)" />
            <span style={{ position: 'absolute', left: -9999 }}>채팅방 검색</span>
            <input
              ref={searchInputRef}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="이름·방·메시지 내용 검색"
              aria-label="채팅방 검색"
              style={{
                flex: 1,
                fontSize: 14,
                fontFamily: 'inherit',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                width: '100%',
                color: 'var(--z-900)' }}
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
                  background: 'var(--z-400)',
                  color: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                  border: 'none',
                  cursor: 'pointer' }}
              >
                <MIcon name="x" size={11} />
              </button>
            )}
          </label>
        </div>
      )}
      <div
        className="macos-glass"
        style={{
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid rgba(255, 255, 255, 0.15)',
          padding: '8px 12px 8px 16px' }}
      >
        <div
          className="m-seg macos-glass macos-squircle-sm"
          role="tablist"
          aria-label="채팅 필터"
          style={{
            flex: 1,
            background: 'rgba(0, 0, 0, 0.04)',
            border: 'none',
            padding: '2px',
            display: 'flex',
            marginRight: 8 }}
        >
          <ChipBtn label="채팅" active={tab === 'chat'} onClick={() => setTab('chat')} />
          <ChipBtn label="조직도" active={tab === 'org'} onClick={() => setTab('org')} />
          <ChipBtn
            label={`읽지않음 ${totalUnread}`}
            active={tab === 'unread'}
            onClick={() => setTab('unread')}
          />
          <ChipBtn label="그룹" active={tab === 'group'} onClick={() => setTab('group')} />
          <ChipBtn label="1:1" active={tab === 'direct'} onClick={() => setTab('direct')} />
        </div>
        <button
          className="msm-ibtn macos-glass macos-squircle-sm"
          type="button"
          onClick={() => setSearchOpen((prev) => !prev)}
          aria-label="검색"
          style={{
            flexShrink: 0,
            width: 32,
            height: 32,
            display: 'grid',
            placeItems: 'center',
            background: searchOpen ? 'rgba(0, 0, 0, 0.08)' : 'transparent',
            border: 'none',
            cursor: 'pointer' }}
        >
          <MIcon name="search" size={20} />
        </button>
      </div>
      <div className="m-scroll" ref={scrollContainerRef} style={{ overscrollBehaviorY: 'contain' }}>
        {tab === 'org' ? (
          <OrgBrowseTab groups={orgGroups} onStartChat={handleStartDirectChat} />
        ) : (
          <div style={{ padding: '4px 0 24px' }}>
            {searchQuery && matchedStaffs.length > 0 && (
              <>
                <div className="msm-sec"><div className="msm-sec-t">직원 ({matchedStaffs.length})</div></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 12 }}>
                  {matchedStaffs.map((staff) => {
                    const name = staff.name || '직원';
                    const tone = pickAvatarTone(String(staff.id) + name);
                    return (
                      <div key={String(staff.id)} style={{ padding: '0 16px 8px' }}>
                        <button
                          type="button"
                          className="m-list-row macos-glass macos-squircle-sm"
                          onClick={() => handleStartDirectChat(String(staff.id), name)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '12px 16px',
                            border: 'none' }}
                        >
                          <MAvatar tone={tone}>{name.charAt(0)}</MAvatar>
                          <div style={{ flex: 1 }}>
                            <div className="lbl" style={{ fontWeight: 700 }}>{name}</div>
                            <div className="sub" style={{ fontSize: 11, color: 'var(--z-500)' }}>
                              {staff.department} · {staff.position || '직원'}
                            </div>
                          </div>
                          <MIcon name="chat" size={18} color="var(--m-accent)" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {loading && rooms.length === 0 && (
              <EmptyState label="채팅방 목록을 불러오는 중…" />
            )}
            {!loading && filtered.length === 0 && messageHits.length === 0 && !messageSearchLoading && (
              <EmptyState
                label={
                  searchQuery
                    ? `"${searchInput.trim()}" 검색 결과가 없습니다.`
                    : emptyLabel(tab)
                }
              />
            )}
            {(() => {
              const pinned = filtered.filter((r) => r.type === 'notice' || String(r.id) === NOTICE_ROOM_ID);
              const rest = filtered.filter((r) => r.type !== 'notice' && String(r.id) !== NOTICE_ROOM_ID);
              return (
                <>
                  {pinned.length > 0 && (
                    <>
                      <div className="msm-sec"><div className="msm-sec-t">고정</div></div>
                      {pinned.map((room, i) => (
                        <RoomRow
                          key={room.id}
                          room={room}
                          userId={userId}
                          staffs={staffs}
                          last={i === pinned.length - 1}
                          onClick={() => onOpen(String(room.id))}
                        />
                      ))}
                    </>
                  )}
                  {rest.length > 0 && (
                    <>
                      <div className="msm-sec"><div className="msm-sec-t">대화</div></div>
                      {rest.map((room, i) => (
                        <RoomRow
                          key={room.id}
                          room={room}
                          userId={userId}
                          staffs={staffs}
                          last={i === rest.length - 1}
                          onClick={() => onOpen(String(room.id))}
                        />
                      ))}
                    </>
                  )}
                </>
              );
            })()}
            {searchQuery && (messageSearchLoading || messageHits.length > 0) && (
              <>
                <div className="msm-sec"><div className="msm-sec-t">메시지</div></div>
                {messageHits.length === 0 && messageSearchLoading ? (
                  <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--z-500)' }}>
                    메시지 내용을 검색하고 있어요…
                  </div>
                ) : (
                  messageHits.map((hit, i) => (
                    <MessageHitRow
                      key={hit.id}
                      hit={hit}
                      rooms={rooms}
                      staffs={staffs}
                      userId={userId}
                      query={searchInput.trim()}
                      last={i === messageHits.length - 1}
                      onClick={() => onOpen(hit.roomId, hit.id)}
                    />
                  ))
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 보조 ───────────────────────────────────────

/** 숨김 메타 블록([[X]]...[[/X]])을 제거하고 공백을 정리한 미리보기 텍스트. */
function cleanSnippet(content: string): string {
  return content
    .replace(/\[\[[^\]]*\]\][\s\S]*?\[\[\/[^\]]*\]\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 검색어가 들어간 위치를 잘라내고 해당 부분을 강조해 보여준다. */
function renderSnippet(content: string, query: string): React.ReactNode {
  const text = cleanSnippet(content);
  const q = query.trim();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  const start = Math.max(0, idx - 24);
  const head = `${start > 0 ? '…' : ''}${text.slice(start, idx)}`;
  const match = text.slice(idx, idx + q.length);
  const tail = text.slice(idx + q.length);
  return (
    <>
      {head}
      <mark
        style={{
          background: 'var(--m-accent-soft, #fde68a)',
          color: 'var(--m-accent, inherit)',
          padding: '0 2px',
          borderRadius: 3,
          fontWeight: 800 }}
      >
        {match}
      </mark>
      {tail}
    </>
  );
}

type MessageHitRowProps = {
  hit: ChatMessageSearchHit;
  rooms: MobileChatRoom[];
  staffs: ReturnType<typeof useChatStaffDirectory>;
  userId: string | null;
  query: string;
  last: boolean;
  onClick: () => void;
};

function MessageHitRow({ hit, rooms, staffs, userId, query, last, onClick }: MessageHitRowProps) {
  const room = rooms.find((r) => String(r.id) === hit.roomId);
  const roomTitle = room ? getRoomTitle(room, staffs, userId) : '대화';
  const senderName =
    hit.senderName ||
    staffs.find((s) => String(s.id) === String(hit.senderId || ''))?.name ||
    '알 수 없음';
  const ts = formatChatTimestamp(hit.createdAt);
  const tone = pickAvatarTone(hit.roomId + roomTitle);

  return (
    <div style={{ padding: '0 16px 8px' }}>
      <button
        type="button"
        onClick={onClick}
        aria-label={`${roomTitle} 대화 열기`}
        className="macos-glass macos-squircle-sm"
        style={{
          display: 'grid',
          gridTemplateColumns: '40px 1fr auto',
          gap: 12,
          alignItems: 'flex-start',
          padding: '12px 16px',
          width: '100%',
          textAlign: 'left',
          border: 'none' }}
      >
        <MAvatar tone={tone}>
          <span>{roomTitle.charAt(0) || '방'}</span>
        </MAvatar>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 800,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                flex: '0 1 auto',
                minWidth: 0 }}
            >
              {roomTitle}
            </span>
            <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600, flexShrink: 0 }}>{senderName}</span>
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--z-700)',
              marginTop: 2,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              wordBreak: 'break-word' }}
          >
            {renderSnippet(hit.content, query)}
          </div>
        </div>
        <span style={{ fontSize: 10, color: 'var(--z-400)', fontWeight: 600, flexShrink: 0, marginTop: 2 }}>{ts}</span>
      </button>
    </div>
  );
}

type ChipBtnProps = { label: string; active: boolean; onClick: () => void };
function ChipBtn({ label, active, onClick }: ChipBtnProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={active ? 'on macos-glass macos-squircle-sm' : 'macos-squircle-sm'}
      style={{
        flex: 1,
        border: 'none',
        padding: '6px 2px',
        fontSize: '12px',
        fontWeight: active ? 700 : 500,
        color: active ? 'var(--z-900)' : 'var(--z-600)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        background: 'transparent' }}
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
  const memberCount = Array.isArray(room.members) ? room.members.length : 0;

  const memberIds = Array.isArray(room.members) ? room.members.map((id) => String(id)) : [];
  const selfRoom = isSelfChatRoom(room, userId);
  const isGroup = isGroupChatRoom(room);
  const isNotice = String(room.id) === NOTICE_ROOM_ID;
  const peer =
    !isGroup && !isNotice && room.type === 'direct'
      ? selfRoom
        ? staffs.find((s) => String(s.id) === String(userId))
        : memberIds
            .map((memberId) => staffs.find((s) => String(s.id) === String(memberId)))
            .find((staff) => Boolean(staff) && String(staff!.id) !== String(userId)) || null
      : null;
  const peerPhotoUrl = peer ? peer.photo_url || peer.avatar_url : null;
  const peerName = peer ? peer.name : '';

  return (
    <div style={{ padding: '0 16px 8px' }}>
      <button
        type="button"
        onClick={onClick}
        aria-label={`${title} 채팅방 열기`}
        data-testid={`chat-room-${room.id}`}
        className="macos-glass macos-squircle-sm"
        style={{
          display: 'grid',
          gridTemplateColumns: '52px 1fr auto',
          gap: 12,
          alignItems: 'center',
          padding: '14px 16px',
          width: '100%',
          textAlign: 'left',
          border: 'none',
          transition: 'transform 0.15s ease, background-color 0.15s ease' }}
      >
        <MAvatar tone={tone} data-testid={`chat-room-icon-${room.id}`}>
          {isNotice ? (
            <MIcon name="bell" size={16} color="#fff" />
          ) : peerPhotoUrl ? (
            <img
              src={peerPhotoUrl}
              alt={peerName || title}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                borderRadius: 'inherit' }}
            />
          ) : isGroup ? (
            <span>{getGroupChatRoomBadgeText(title)}</span>
          ) : (
            <span>{title.charAt(0) || '방'}</span>
          )}
        </MAvatar>
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
                flex: '0 1 auto',
                minWidth: 0,
                color: 'var(--z-900)' }}
            >
              {title}
            </span>
            {memberCount > 0 && (
              <span style={{ fontSize: 10, color: 'var(--z-500)', fontWeight: 600, flexShrink: 0 }}>
                {memberCount}명
              </span>
            )}
            <span style={{ fontSize: 10, color: 'var(--z-500)', fontWeight: 600, flexShrink: 0, marginLeft: 'auto' }}>
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
                maxWidth: 220 }}
            >
              {lastMsg || <span style={{ color: 'var(--z-400)' }}>대화 시작 전</span>}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--z-500)', fontWeight: 600 }}>{ts}</span>
          {unread > 0 && (
            <span className="msm-unread" aria-label={`안 읽음 ${unread}건`}>
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
      </button>
    </div>
  );
}

function OrgBrowseTab({
  groups,
  onStartChat }: {
  groups: { department: string; members: StaffDirectoryEntry[] }[];
  onStartChat: (peerId: string, peerName: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (dept: string) => {
    setExpanded((prev) => ({ ...prev, [dept]: !prev[dept] }));
  };

  if (groups.length === 0) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--z-500)' }}>
        조직원 목록이 없습니다.
      </div>
    );
  }

  return (
    <div style={{ padding: '8px 0 24px' }}>
      {groups.map((g) => {
        const isExpanded = expanded[g.department] !== false;
        return (
          <div key={g.department} style={{ margin: '0 16px 10px' }}>
            <button
              type="button"
              onClick={() => toggle(g.department)}
              className="macos-glass macos-squircle-sm"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--z-800)' }}>
                  {g.department}
                </span>
                <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
                  {g.members.length}명
                </span>
              </div>
              <MIcon name={isExpanded ? 'chevU' : 'chevD'} size={16} color="var(--z-400)" />
            </button>
            
            {isExpanded && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                {g.members.map((m) => {
                  const name = m.name || '직원';
                  const tone = pickAvatarTone(String(m.id) + name);
                  return (
                    <button
                      key={String(m.id)}
                      type="button"
                      className="m-list-row macos-glass macos-squircle-sm"
                      onClick={() => onStartChat(String(m.id), name)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 16px',
                        border: 'none' }}
                    >
                      <MAvatar tone={tone}>{name.charAt(0)}</MAvatar>
                      <div style={{ flex: 1 }}>
                        <div className="lbl" style={{ fontWeight: 700 }}>{name}</div>
                        <div className="sub" style={{ fontSize: 11, color: 'var(--z-500)' }}>
                          {g.department} · {m.position || '직원'}
                        </div>
                      </div>
                      <MIcon name="chat" size={18} color="var(--m-accent)" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function groupByDept(staffs: StaffDirectoryEntry[]): { department: string; members: StaffDirectoryEntry[] }[] {
  const byDept = new Map<string, StaffDirectoryEntry[]>();
  staffs.forEach((staff) => {
    if (!staff || !staff.name) return;
    if (staff.status && String(staff.status).includes('퇴사')) return;
    const department = (staff.department && String(staff.department)) || '기타';
    const arr = byDept.get(department) || [];
    arr.push(staff);
    byDept.set(department, arr);
  });
  const result: { department: string; members: StaffDirectoryEntry[] }[] = [];
  byDept.forEach((members, department) => {
    members.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    result.push({ department, members });
  });
  result.sort((a, b) => a.department.localeCompare(b.department));
  return result;
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
        lineHeight: 1.6 }}
    >
      조직도 탐색은 곧 추가됩니다.
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
        fontWeight: 600 }}
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
