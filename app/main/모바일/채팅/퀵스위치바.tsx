'use client';

/**
 * QuickSwitchBar — 채팅방 상세 상단 최근 방 5개 칩 가로 스크롤.
 *
 * 요구사항:
 *   - last_message_at desc 정렬 최근 5개 채팅방 칩 표시
 *   - 현재 활성 방은 accent 하이라이트
 *   - 칩 클릭 → onSwitch(roomId) 호출 → 부모가 방 전환 처리
 *   - 데이터: 부모(채팅 index.tsx)가 이미 보유한 rooms 배열을 props로 전달 (중복 fetch 금지 — JM2)
 *   - JM6: role="tablist", 칩은 role="tab" + aria-selected
 *   - JM: 단일 책임 ~80줄
 */

import { useMemo } from 'react';
import MAvatar from '../공통/MAvatar';
import { pickAvatarTone, getRoomTitle, type MobileChatRoom, type StaffDirectoryEntry } from './data-hooks';

const MAX_QUICK_ROOMS = 5;

export type QuickSwitchBarProps = {
  rooms: MobileChatRoom[];
  activeRoomId: string;
  currentUserId: string | null;
  staffs: StaffDirectoryEntry[];
  onSwitch: (roomId: string) => void;
};

export default function QuickSwitchBar({
  rooms,
  activeRoomId,
  currentUserId,
  staffs,
  onSwitch,
}: QuickSwitchBarProps) {
  // last_message_at 내림차순 최근 5개
  const recentRooms = useMemo(() => {
    return [...rooms]
      .sort((a, b) => {
        const ta = a.last_message_at ?? a.created_at ?? '';
        const tb = b.last_message_at ?? b.created_at ?? '';
        return String(tb).localeCompare(String(ta));
      })
      .slice(0, MAX_QUICK_ROOMS);
  }, [rooms]);

  if (recentRooms.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label="최근 채팅방 빠른 전환"
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        overflowX: 'auto',
        padding: '6px 12px 8px',
        background: 'var(--m-card)',
        borderBottom: '1px solid var(--m-border)',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
      }}
    >
      {recentRooms.map((room) => {
        const roomId = String(room.id);
        const isActive = roomId === activeRoomId;
        const title = getRoomTitle(room, staffs, currentUserId);
        const tone = pickAvatarTone(roomId + title);
        const hasUnread = (room.unread_count ?? 0) > 0 && !isActive;

        return (
          <button
            key={roomId}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={`${title}${hasUnread ? ` (안 읽음 ${room.unread_count}건)` : ''}으로 전환`}
            onClick={() => onSwitch(roomId)}
            style={{
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '4px 6px',
              borderRadius: 10,
              background: isActive ? 'var(--m-accent-tint, rgba(37,99,235,0.10))' : 'transparent',
              border: isActive ? '1.5px solid var(--m-accent)' : '1.5px solid transparent',
              position: 'relative',
              cursor: isActive ? 'default' : 'pointer',
            }}
          >
            <MAvatar tone={tone} size="sm">
              {title.charAt(0) || '방'}
            </MAvatar>
            <span
              style={{
                fontSize: 10,
                fontWeight: isActive ? 800 : 600,
                color: isActive ? 'var(--m-accent)' : 'var(--z-600)',
                maxWidth: 52,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                lineHeight: 1.3,
              }}
            >
              {title}
            </span>
            {hasUnread && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--m-accent)',
                  border: '1.5px solid var(--m-card)',
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
