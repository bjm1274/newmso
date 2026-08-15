'use client';

/**
 * 모바일 채팅 — 반응 상세 / 읽음 상세 바텀시트.
 *  - ReactionDetailSheet: 특정 메시지의 이모지별 반응자 목록 (PC 메신저액션.ReactionDetailModal 미러)
 *  - ReadStatusSheet: 특정 메시지를 읽은/안 읽은 참여자 목록 (PC 메신저읽음모달.ReadStatusModal 미러)
 *
 * 반응 데이터: message.reactions = Record<emoji, userId[]> (반응.ts에서 머지됨).
 * 읽음 데이터: room_read_cursors(user_id, last_read_at) — 발신자 제외, 메시지 시각 이후 커서면 읽음.
 *             useMobileChatReadCounts와 동일한 커서 규칙을 사용한다.
 *
 * 제약: JM(단일 책임 + 500줄 이내), JM4(any 금지), JM6(button/aria).
 */

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db-client';
import type { ChatMessage } from '@/types';
import MSheet from '../공통/MSheet';
import MAvatar from '../공통/MAvatar';
import { pickAvatarTone, type StaffDirectoryEntry } from './data-hooks';

function StaffRow({ staff, tone }: { staff: StaffDirectoryEntry; tone?: 'success' }) {
  const avatarTone = pickAvatarTone(String(staff.id) + staff.name);
  const photoUrl = staff.photo_url || staff.avatar_url;
  return (
    <div
      className="macos-squircle-sm"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        marginBottom: 6,
        background: 'var(--m-card)',
        border: '1px solid var(--m-border)',
        boxShadow: '0 2px 8px var(--z-100)' }}
    >
      <MAvatar tone={avatarTone} size="sm">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={staff.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
          />
        ) : (
          <span>{staff.name.charAt(0) || '?'}</span>
        )}
      </MAvatar>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--z-900)' }}>{staff.name}</div>
        <div style={{ fontSize: 11, color: tone === 'success' ? 'var(--m-success, #10b981)' : 'var(--z-500)', marginTop: 1 }}>
          {staff.department || '부서 없음'} · {staff.position || '직급 없음'}
        </div>
      </div>
    </div>
  );
}

function resolveStaff(
  userId: string,
  staffs: StaffDirectoryEntry[],
): StaffDirectoryEntry {
  const found = staffs.find((s) => String(s.id) === String(userId));
  if (found) return found;
  return {
    id: userId,
    name: '알 수 없음',
    department: null,
    position: null,
    photo_url: null,
    avatar_url: null,
    status: null,
    permissions: null } as StaffDirectoryEntry;
}

// ─────────────────────────────────────────────
// 반응 상세
// ─────────────────────────────────────────────

export type ReactionDetailSheetProps = {
  message: ChatMessage | null;
  staffs: StaffDirectoryEntry[];
  onClose: () => void;
};

export function ReactionDetailSheet({ message, staffs, onClose }: ReactionDetailSheetProps) {
  const groups = useMemo(() => {
    const r = message?.reactions;
    if (!r || typeof r !== 'object') return [];
    return Object.entries(r)
      .map(([emoji, users]) => ({
        emoji,
        users: (Array.isArray(users) ? users.map(String) : []).map((uid) => resolveStaff(uid, staffs)) }))
      .filter((g) => g.users.length > 0);
  }, [message, staffs]);

  return (
    <MSheet open={!!message} onClose={onClose} title="반응 상세">
      <div style={{ padding: '8px 20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {groups.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--z-400)', fontWeight: 600 }}>
            아직 반응이 없습니다.
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.emoji}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 18 }}>{group.emoji}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--z-600)' }}>{group.users.length}명</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {group.users.map((staff, idx) => (
                  <StaffRow key={`${group.emoji}-${staff.id}-${idx}`} staff={staff} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </MSheet>
  );
}

// ─────────────────────────────────────────────
// 읽음 상세
// ─────────────────────────────────────────────

export type ReadStatusSheetProps = {
  message: ChatMessage | null;
  roomId: string;
  memberIds: string[];
  staffs: StaffDirectoryEntry[];
  onClose: () => void;
};

export function ReadStatusSheet({ message, roomId, memberIds, staffs, onClose }: ReadStatusSheetProps) {
  const [loading, setLoading] = useState(false);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [unreadIds, setUnreadIds] = useState<string[]>([]);

  useEffect(() => {
    if (!message || !roomId || memberIds.length === 0) {
      setReadIds([]);
      setUnreadIds([]);
      return;
    }
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const recipientIds = memberIds.filter((id) => id !== String(message.sender_id));
        const { data } = await db
          .from('room_read_cursors')
          .select('user_id, last_read_at')
          .eq('room_id', roomId)
          .in('user_id', recipientIds.length > 0 ? recipientIds : ['__none__']);
        if (!active) return;
        const cursors = Array.isArray(data) ? data : [];
        const msgTime = new Date(message.created_at || 0).getTime();
        const read: string[] = [];
        const unread: string[] = [];
        recipientIds.forEach((id) => {
          const cursor = cursors.find((c) => String((c as { user_id?: unknown }).user_id) === id);
          const lastReadAt = cursor ? (cursor as { last_read_at?: string }).last_read_at : null;
          if (lastReadAt && new Date(lastReadAt).getTime() >= msgTime) {
            read.push(id);
          } else {
            unread.push(id);
          }
        });
        setReadIds(read);
        setUnreadIds(unread);
      } catch {
        if (active) {
          setReadIds([]);
          setUnreadIds([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [message, roomId, memberIds]);

  const readStaffs = readIds.map((id) => resolveStaff(id, staffs));
  const unreadStaffs = unreadIds.map((id) => resolveStaff(id, staffs));

  return (
    <MSheet open={!!message} onClose={onClose} title="읽음 확인 상세">
      <div style={{ padding: '8px 20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {loading ? (
          <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--z-500)', fontWeight: 600 }}>
            불러오는 중…
          </div>
        ) : (
          <>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--m-danger, #ef4444)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, paddingLeft: 4 }}>
                읽지 않음 ({unreadStaffs.length})
              </div>
              {unreadStaffs.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--z-400)', fontWeight: 600, padding: '10px 12px', background: 'var(--z-100)', borderRadius: 8 }}>모두 읽었습니다.</div>
              ) : (
                unreadStaffs.map((staff) => <StaffRow key={`unread-${staff.id}`} staff={staff} />)
              )}
            </div>
            <div style={{ height: 1, background: 'var(--z-100)', margin: '4px 0' }} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--m-success, #10b981)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, paddingLeft: 4 }}>
                읽음 ({readStaffs.length})
              </div>
              {readStaffs.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--z-400)', fontWeight: 600, padding: '10px 12px', background: 'var(--z-100)', borderRadius: 8 }}>아직 읽은 사람이 없습니다.</div>
              ) : (
                readStaffs.map((staff) => <StaffRow key={`read-${staff.id}`} staff={staff} tone="success" />)
              )}
            </div>
          </>
        )}
      </div>
    </MSheet>
  );
}
