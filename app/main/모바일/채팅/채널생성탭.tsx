'use client';

/**
 * NewChatChannelTab — 새 대화 / 채널 생성 탭.
 * 권한 체크(관리자/매니저)에 따라 폼 또는 차단 카드 노출.
 * 폼: 채널명(필수) · 설명(선택) · 유형 segment(channel/notice) · 멤버 선택 시 selectedIds 합류
 * 제출: createOrUpsertChatRoom 호출 (type=channel|notice, members + 생성자)
 * 멤버를 비우면 전 직원에게 broadcast(staff_members 전체 id 사용)
 * JM(단일 책임, < 250줄), JM3(try/catch + toast), JM4(any 금지),
 * JM5(권한 client 체크 + RLS 의존), JM6(label 연결, button 시맨틱).
 */

import { useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import { createOrUpsertChatRoom } from '@/lib/chat-rooms-client';
import type { ErpUser } from '@/types';
import MBtn from '../공통/MBtn';
import MIcon from '../공통/MIcon';
import type { StaffDirectoryEntry } from './data-hooks';

export type ChannelType = 'channel' | 'notice';

export type NewChatChannelTabProps = {
  user: ErpUser;
  staffs: StaffDirectoryEntry[];
  selectedMemberIds: string[];
  onCreated: (roomId: string) => void;
};

export function canCreateChannel(user: ErpUser | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.permissions?.mso === true) return true;
  if (user.permissions?.menu_관리자 === true) return true;
  const role = String(user.role || '').trim();
  if (role === '관리자' || role === '매니저') return true;
  const pos = String(user.position || '').trim();
  if (pos === '관리자' || pos === '매니저') return true;
  return false;
}

export default function NewChatChannelTab({
  user,
  staffs,
  selectedMemberIds,
  onCreated,
}: NewChatChannelTabProps) {
  const userId = typeof user.id === 'string' ? user.id : null;
  const allowed = useMemo(() => canCreateChannel(user), [user]);

  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [channelType, setChannelType] = useState<ChannelType>('channel');
  const [creating, setCreating] = useState(false);

  if (!allowed) {
    return (
      <div style={{ padding: '24px 16px' }}>
        <div style={NOTICE_CARD}>
          <span
            className="ico-tile tone-warning"
            style={{ width: 48, height: 48, margin: '0 auto 12px' }}
            aria-hidden="true"
          >
            <MIcon name="shield" size={22} />
          </span>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--z-900)', marginBottom: 6 }}>
            채널 생성은 관리자만 가능합니다
          </div>
          <div style={{ fontSize: 12, color: 'var(--z-600)', lineHeight: 1.6 }}>
            새로운 알림 채널·공지 채널은 시스템 관리자가 만들어드립니다.
            <br />
            관리자에게 요청해 주세요.
          </div>
        </div>
      </div>
    );
  }

  const trimmedName = name.trim();
  const submitDisabled = trimmedName.length === 0 || creating || !userId;

  const handleCreate = async () => {
    if (!userId) {
      toast('로그인 정보를 찾을 수 없습니다.', 'error');
      return;
    }
    if (trimmedName.length === 0) {
      toast('채널명을 입력해 주세요.', 'error');
      return;
    }
    setCreating(true);
    try {
      const memberIds = resolveMemberIds(selectedMemberIds, staffs, userId);
      const fullName = desc.trim() ? `${trimmedName}` : trimmedName;
      const result = await createOrUpsertChatRoom({
        name: fullName,
        type: channelType,
        members: memberIds,
        created_by: userId,
        is_announcement: channelType === 'notice',
      });
      if (!result.ok || !result.room) {
        toast(result.error || '채널 생성에 실패했어요.', 'error');
        return;
      }
      toast(`채널 "${trimmedName}"이(가) 생성되었어요.`, 'success');
      onCreated(String(result.room.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : '채널 생성 실패';
      toast(message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const memberHint = selectedMemberIds.length === 0
    ? `전 직원 ${staffs.length}명에게 자동 발송됩니다.`
    : `선택된 ${selectedMemberIds.length}명에게 발송됩니다.`;

  return (
    <div style={{ padding: '14px 16px 28px' }}>
      <div style={CARD}>
        <FieldLabel htmlFor="ch-name" required>
          채널명
        </FieldLabel>
        <input
          id="ch-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 5월 OP 알림"
          autoFocus
          aria-required="true"
          style={INPUT}
        />

        <FieldLabel htmlFor="ch-desc">목적 · 설명</FieldLabel>
        <input
          id="ch-desc"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="채널 설명(선택)"
          style={INPUT}
        />

        <FieldLabel htmlFor="ch-type-row">유형</FieldLabel>
        <div id="ch-type-row" className="m-seg" role="tablist" aria-label="채널 유형">
          <TypeBtn
            label="채널"
            sub="자유 메시지"
            active={channelType === 'channel'}
            onClick={() => setChannelType('channel')}
          />
          <TypeBtn
            label="공지 전용"
            sub="관리자만 발신"
            active={channelType === 'notice'}
            onClick={() => setChannelType('notice')}
          />
        </div>

        <div style={MEMBER_HINT}>
          <MIcon name="info" size={14} color="var(--z-500)" />
          <span>{memberHint}</span>
        </div>
      </div>

      <div style={{ padding: '14px 0 0' }}>
        <MBtn block variant="primary" icon="plus" onClick={handleCreate} disabled={submitDisabled}>
          {creating ? '생성 중…' : '채널 생성'}
        </MBtn>
      </div>
    </div>
  );
}

// ─── 보조 ───────────────────────────────────────

function resolveMemberIds(
  picked: string[],
  staffs: StaffDirectoryEntry[],
  myId: string,
): string[] {
  if (picked.length > 0) {
    return Array.from(new Set([myId, ...picked]));
  }
  const ids = staffs
    .filter((s) => !s.status || !String(s.status).includes('퇴사'))
    .map((s) => String(s.id))
    .filter(Boolean);
  return Array.from(new Set([myId, ...ids]));
}

type FieldLabelProps = {
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
};

function FieldLabel({ htmlFor, required, children }: FieldLabelProps) {
  return (
    <label htmlFor={htmlFor} style={LABEL}>
      {children}
      {required && (
        <span style={{ color: 'var(--m-accent)', marginLeft: 4 }} aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
}

type TypeBtnProps = {
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
};

function TypeBtn({ label, sub, active, onClick }: TypeBtnProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={active ? 'on' : ''}
      onClick={onClick}
      style={{ flexDirection: 'column', lineHeight: 1.3, padding: '8px 0' }}
    >
      <span style={{ fontSize: 12, fontWeight: 800 }}>{label}</span>
      <span style={{ fontSize: 10, color: active ? 'var(--z-700)' : 'var(--z-500)' }}>{sub}</span>
    </button>
  );
}

// ─── 스타일 ─────────────────────────────────────

const CARD: React.CSSProperties = {
  background: 'var(--m-card)',
  border: '1px solid var(--m-border)',
  borderRadius: 14,
  padding: '16px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: 'var(--z-500)',
  letterSpacing: '0.02em',
  textTransform: 'uppercase',
  marginTop: 6,
};

const INPUT: React.CSSProperties = {
  width: '100%',
  background: 'var(--m-bg)',
  border: '1px solid var(--m-border)',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 14,
  fontFamily: 'inherit',
  color: 'var(--z-900)',
  outline: 'none',
};

const NOTICE_CARD: React.CSSProperties = {
  background: 'var(--m-card)',
  border: '1px solid var(--m-border)',
  borderRadius: 14,
  padding: '32px 24px',
  textAlign: 'center',
};

const MEMBER_HINT: React.CSSProperties = {
  marginTop: 10,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  background: 'var(--m-bg)',
  padding: '8px 10px',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--z-600)',
  fontWeight: 600,
};
