'use client';

/**
 * RoomList.tsx — 채팅방 목록
 *
 * JM2: useMemo 필터링, 불필요 렌더 방지
 * JM4: any 금지, 명시적 타입
 * JM6: role="list", aria-label, 뱃지 aria-label
 */

import React, { useMemo } from 'react';
import type { ChatRoom, ChatUser } from './dummy-data';
import { USER_MAP } from './dummy-data';

// ── 타입 ──────────────────────────────────────────────────────────────────────

interface RoomListProps {
  rooms: readonly ChatRoom[];
  selectedRoomId: string | null;
  searchQuery: string;
  onSelectRoom: (roomId: string) => void;
}

// ── 아바타 ────────────────────────────────────────────────────────────────────

function RoomAvatar({ room }: { room: ChatRoom }) {
  if (room.type === 'group') {
    return (
      <div
        aria-hidden="true"
        style={{
          width: 44,
          height: 44,
          borderRadius: 'var(--radius-lg)',
          background: 'var(--accent-light)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          flexShrink: 0,
        }}
      >
        👥
      </div>
    );
  }

  // direct: 상대방 아바타
  const otherId = room.participants.find((id) => id !== 'u1') ?? room.participants[0];
  const other: ChatUser | undefined = USER_MAP[otherId];
  const initial = other?.name?.[0] ?? '?';

  return (
    <div
      aria-hidden="true"
      style={{
        width: 44,
        height: 44,
        borderRadius: 9999,
        background: other?.color ?? 'var(--accent)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
}

// ── 날짜 포맷 ─────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  if (isToday) {
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

// ── 개별 방 아이템 ────────────────────────────────────────────────────────────

interface RoomItemProps {
  room: ChatRoom;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

const RoomItem = React.memo(function RoomItem({ room, isSelected, onSelect }: RoomItemProps) {
  function handleClick() {
    onSelect(room.id);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(room.id);
    }
  }

  return (
    <li role="none">
      <button
        type="button"
        role="option"
        aria-selected={isSelected}
        aria-label={`${room.name} 채팅방${room.unreadCount > 0 ? `, 읽지 않은 메시지 ${room.unreadCount}개` : ''}`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className="w-full text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-1"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 16px',
          background: isSelected ? 'var(--accent-subtle)' : 'transparent',
          borderRadius: 'var(--radius-md)',
          border: 'none',
          cursor: 'pointer',
          outlineColor: 'var(--accent)',
        }}
      >
        <RoomAvatar room={room} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
            <span
              className="text-sm font-semibold truncate"
              style={{ color: 'var(--foreground)' }}
            >
              {room.name}
            </span>
            <span
              className="text-[11px] shrink-0"
              style={{ color: 'var(--toss-gray-4)' }}
            >
              {formatTime(room.lastAt)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <span
              className="text-xs truncate"
              style={{ color: 'var(--toss-gray-4)' }}
            >
              {room.lastMessage}
            </span>
            {room.unreadCount > 0 && (
              <span
                aria-label={`읽지 않은 메시지 ${room.unreadCount}개`}
                style={{
                  background: 'var(--accent)',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9999,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 5px',
                  flexShrink: 0,
                }}
              >
                {room.unreadCount > 99 ? '99+' : room.unreadCount}
              </span>
            )}
          </div>
        </div>
      </button>
    </li>
  );
});

// ── RoomList 본체 ──────────────────────────────────────────────────────────────

export function RoomList({ rooms, selectedRoomId, searchQuery, onSelectRoom }: RoomListProps) {
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return rooms;
    const q = searchQuery.toLowerCase();
    return rooms.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.lastMessage.toLowerCase().includes(q),
    );
  }, [rooms, searchQuery]);

  if (filtered.length === 0) {
    return (
      <div className="empty-state py-12" role="status" aria-live="polite">
        <p className="text-sm" style={{ color: 'var(--toss-gray-4)' }}>검색 결과가 없습니다.</p>
      </div>
    );
  }

  return (
    <ul
      role="listbox"
      aria-label="채팅방 목록"
      style={{ listStyle: 'none', margin: 0, padding: '4px 0' }}
    >
      {filtered.map((room) => (
        <RoomItem
          key={room.id}
          room={room}
          isSelected={room.id === selectedRoomId}
          onSelect={onSelectRoom}
        />
      ))}
    </ul>
  );
}
