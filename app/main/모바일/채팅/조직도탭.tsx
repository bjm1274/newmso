'use client';

/**
 * NewChatOrgTab — 새 대화 / 조직도 탭.
 * 부서별 토글 트리 카드.
 *   - 부서 헤더(button, aria-expanded) — 클릭 시 부서원 접고 펴기
 *   - 부서원 row — 구성원 탭과 동일한 onToggle (선택 state는 부모가 보유)
 *   - 부서 전체 토글 chip — 부서원 일괄 선택/해제
 * staff_members 데이터는 부모(SFormChat)의 useChatStaffDirectory를 재활용.
 * JM(단일 책임, < 250줄), JM2(useMemo 안정화), JM4(any 금지),
 * JM6(button 시맨틱 + aria-expanded/aria-pressed).
 */

import { useMemo, useState } from 'react';
import MIcon from '../공통/MIcon';
import MAvatar from '../공통/MAvatar';
import { pickAvatarTone, type StaffDirectoryEntry } from './data-hooks';

export type OrgDepartmentGroup = {
  department: string;
  members: StaffDirectoryEntry[];
};

export type NewChatOrgTabProps = {
  groups: OrgDepartmentGroup[];
  picked: Record<string, boolean>;
  onToggle: (staffId: string) => void;
  onTogglePack: (staffIds: string[], allOn: boolean) => void;
  empty: boolean;
};

export default function NewChatOrgTab({
  groups,
  picked,
  onToggle,
  onTogglePack,
  empty }: NewChatOrgTabProps) {
  if (empty) {
    return (
      <div style={STATE_BOX}>구성원 목록을 불러오는 중…</div>
    );
  }
  if (groups.length === 0) {
    return (
      <div style={STATE_BOX}>조직도가 비어있습니다.</div>
    );
  }

  return (
    <div style={{ padding: '14px 16px 24px' }}>
      {groups.map((group) => (
        <OrgDeptCard
          key={group.department}
          group={group}
          picked={picked}
          onToggle={onToggle}
          onTogglePack={onTogglePack}
        />
      ))}
    </div>
  );
}

// ─── 부서 카드 ──────────────────────────────────

type OrgDeptCardProps = {
  group: OrgDepartmentGroup;
  picked: Record<string, boolean>;
  onToggle: (staffId: string) => void;
  onTogglePack: (staffIds: string[], allOn: boolean) => void;
};

function OrgDeptCard({ group, picked, onToggle, onTogglePack }: OrgDeptCardProps) {
  const [open, setOpen] = useState(false);

  const memberIds = useMemo(
    () => group.members.map((m) => String(m.id)),
    [group.members],
  );
  const pickedCount = useMemo(
    () => memberIds.filter((id) => picked[id]).length,
    [memberIds, picked],
  );
  const allOn = pickedCount > 0 && pickedCount === memberIds.length;

  const handlePack = () => {
    onTogglePack(memberIds, !allOn);
  };

  return (
    <div
      style={{
        background: 'var(--m-card)',
        border: '1px solid var(--m-border)',
        borderRadius: 14,
        marginBottom: 10,
        overflow: 'hidden' }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto auto',
          gap: 8,
          padding: '12px 14px',
          alignItems: 'center' }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`${group.department} 부서원 ${open ? '접기' : '펼치기'}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'transparent',
            textAlign: 'left',
            minWidth: 0,
            cursor: 'pointer' }}
        >
          <span
            className="ico-tile"
            style={{ width: 32, height: 32, flexShrink: 0 }}
            aria-hidden="true"
          >
            <MIcon name="users" size={16} />
          </span>
          <span style={{ minWidth: 0 }}>
            <span
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 800,
                color: 'var(--z-900)',
                letterSpacing: '-0.01em' }}
            >
              {group.department}
            </span>
            <span
              style={{
                display: 'block',
                fontSize: 11,
                color: 'var(--z-500)',
                fontWeight: 700,
                marginTop: 2 }}
            >
              부서원 {group.members.length}명
              {pickedCount > 0 ? ` · ${pickedCount}명 선택` : ''}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={handlePack}
          aria-pressed={allOn}
          aria-label={`${group.department} 전체 ${allOn ? '해제' : '선택'}`}
          style={{
            ...PACK_CHIP_STYLE,
            background: allOn ? 'var(--m-accent)' : 'var(--m-accent-soft)',
            color: allOn ? '#fff' : 'var(--m-accent)' }}
        >
          {group.department} 전체
        </button>
        <span aria-hidden="true" style={{ color: 'var(--z-400)', display: 'inline-flex' }}>
          <MIcon name={open ? 'chevU' : 'chevD'} size={18} />
        </span>
      </div>

      {open && (
        <div
          role="group"
          aria-label={`${group.department} 부서원 목록`}
          style={{ borderTop: '1px solid var(--m-border)' }}
        >
          {group.members.map((member, idx) => (
            <OrgMemberRow
              key={String(member.id)}
              member={member}
              department={group.department}
              checked={Boolean(picked[String(member.id)])}
              onToggle={() => onToggle(String(member.id))}
              last={idx === group.members.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 부서원 row ─────────────────────────────────

type OrgMemberRowProps = {
  member: StaffDirectoryEntry;
  department: string;
  checked: boolean;
  onToggle: () => void;
  last: boolean;
};

function OrgMemberRow({ member, department, checked, onToggle, last }: OrgMemberRowProps) {
  const name = member.name || '이름 없음';
  const tone = pickAvatarTone(String(member.id) + name);
  return (
    <button
      type="button"
      className="m-list-row"
      onClick={onToggle}
      aria-pressed={checked}
      aria-label={`${name} 선택 토글`}
      style={{
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        borderBottom: last ? 'none' : '1px solid var(--m-border)' }}
    >
      <MAvatar tone={tone}>{name.charAt(0)}</MAvatar>
      <div>
        <div className="lbl">{name}</div>
        <div className="sub">
          {department} · {member.position || '직원'}
        </div>
      </div>
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          border: checked ? 'none' : '1.5px solid var(--z-300)',
          background: checked ? 'var(--m-accent)' : 'transparent',
          color: '#fff',
          display: 'grid',
          placeItems: 'center' }}
        aria-hidden="true"
      >
        {checked && <MIcon name="check" size={14} />}
      </span>
    </button>
  );
}

// ─── 스타일 상수 ────────────────────────────────

const STATE_BOX: React.CSSProperties = {
  padding: '48px 24px',
  textAlign: 'center',
  color: 'var(--z-500)',
  fontSize: 13 };

const PACK_CHIP_STYLE: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '-0.01em',
  border: 'none',
  cursor: 'pointer',
  whiteSpace: 'nowrap' };
