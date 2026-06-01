'use client';

/**
 * SFormChat — 새 대화 시작.
 * FormHeader(취소·새 대화·시작) + 세그(구성원/조직도/채널 생성) + 선택칩 + 검색 + 부서 그룹 리스트.
 * 디자인: handoff/newmso15/handoff_mobile/live-preview/mobile/m-screens-forms.jsx L603~ SFormChat 1:1.
 * 데이터: useChatStaffDirectory + chat-rooms-client(createOrUpsertChatRoom).
 * P2: 조직도 탭(부서 트리·일괄 토글), 채널 생성 탭(권한 체크 + 채널/공지 생성) 활성화.
 * JM(< 500줄), JM2, JM3, JM4, JM6.
 */

import { useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import { createOrUpsertChatRoom } from '@/lib/chat-rooms-client';
import { haveSameMembers, normalizeMemberIds } from '@/app/main/기능부품/메신저유틸';
import { fetchAllChatRooms } from '@/app/main/기능부품/chatQueryService';
import type { ChatRoom, ErpUser } from '@/types';
import MIcon from '../공통/MIcon';
import MAvatar from '../공통/MAvatar';
import { pickAvatarTone, useChatStaffDirectory, type StaffDirectoryEntry } from './data-hooks';
import NewChatOrgTab, { type OrgDepartmentGroup } from './조직도탭';
import NewChatChannelTab from './채널생성탭';

type NewChatTab = 'member' | 'org' | 'channel';

export type SFormChatProps = {
  user: ErpUser;
  onBack: () => void;
  onCreated: (roomId: string) => void;
};

export default function SFormChat({ user, onBack, onCreated }: SFormChatProps) {
  const userId = typeof user.id === 'string' ? user.id : null;
  const company = typeof user.company === 'string' ? user.company : null;
  const staffs = useChatStaffDirectory(company);
  const [tab, setTab] = useState<NewChatTab>('member');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);

  const pickedIds = useMemo(
    () => Object.keys(picked).filter((id) => picked[id]),
    [picked],
  );

  const groups = useMemo(() => groupByDepartment(staffs, userId), [staffs, userId]);

  const visibleGroups = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return groups;
    return groups
      .map((g) => ({
        ...g,
        members: g.members.filter((m) =>
          [m.name, m.position, m.department]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(query)),
        ),
      }))
      .filter((g) => g.members.length > 0);
  }, [groups, q]);

  const totalPicked = pickedIds.length;
  const saveLabel = useMemo(() => {
    if (totalPicked === 0) return '다음';
    if (totalPicked === 1) return '시작';
    return `그룹 시작 (${totalPicked})`;
  }, [totalPicked]);
  const saveDisabled = totalPicked === 0 || creating;

  const togglePick = (staffId: string) => {
    setPicked((prev) => ({ ...prev, [staffId]: !prev[staffId] }));
  };

  const togglePackPick = (staffIds: string[], allOn: boolean) => {
    setPicked((prev) => {
      const next = { ...prev };
      staffIds.forEach((id) => {
        next[id] = allOn;
      });
      return next;
    });
  };

  const handleCreate = async () => {
    if (!userId) {
      toast('로그인 정보를 찾을 수 없습니다.', 'error');
      return;
    }
    if (pickedIds.length === 0 || creating) return;

    const isDirect = pickedIds.length === 1;
    const otherIds = pickedIds.filter((id) => id !== userId);
    const memberIds = Array.from(new Set([userId, ...otherIds]));

    setCreating(true);
    try {
      // 1:1 의 경우 기존 direct 방 재사용
      if (isDirect) {
        const existing = await findExistingDirectRoom(memberIds);
        if (existing) {
          onCreated(String(existing.id));
          return;
        }
      }
      const name = isDirect
        ? defaultDirectName(staffs, otherIds[0], user.name as string | undefined)
        : defaultGroupName(staffs, memberIds, user.name as string | undefined);

      const result = await createOrUpsertChatRoom({
        name,
        type: isDirect ? 'direct' : 'group',
        members: memberIds,
        created_by: userId,
      });
      if (!result.ok || !result.room) {
        toast(result.error || '대화방 생성에 실패했어요.', 'error');
        return;
      }
      onCreated(String(result.room.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : '대화방 생성 실패';
      toast(message, 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="m-screen">
      <FormHeader
        onCancel={onBack}
        title="새 대화"
        onSave={handleCreate}
        saveLabel={saveLabel}
        saveDisabled={saveDisabled}
      />
      <div
        style={{
          padding: '10px 16px 0',
          background: 'var(--m-card)',
          borderBottom: '1px solid var(--m-border)',
        }}
      >
        <div className="m-seg" role="tablist" aria-label="대화 방식">
          <SegBtn label="구성원" active={tab === 'member'} onClick={() => setTab('member')} />
          <SegBtn label="조직도" active={tab === 'org'} onClick={() => setTab('org')} />
          <SegBtn label="채널 생성" active={tab === 'channel'} onClick={() => setTab('channel')} />
        </div>
      </div>

      {pickedIds.length > 0 && (
        <PickedChipRow
          pickedIds={pickedIds}
          staffs={staffs}
          onRemove={(id) => togglePick(id)}
        />
      )}

      {tab !== 'channel' && (
        <div
          style={{
            padding: '10px 16px',
            background: 'var(--m-card)',
            borderBottom: '1px solid var(--m-border)',
          }}
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--m-bg)',
              borderRadius: 10,
              padding: '8px 12px',
            }}
          >
            <MIcon name="search" size={16} color="var(--z-500)" />
            <span style={{ position: 'absolute', left: -9999 }}>이름·부서·직급 검색</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="이름·부서·직급으로 검색"
              aria-label="이름·부서·직급 검색"
              style={{ flex: 1, fontSize: 14, fontFamily: 'inherit', width: '100%' }}
            />
          </label>
        </div>
      )}

      <div className="m-scroll">
        {tab === 'member' && (
          <MemberTab
            groups={visibleGroups}
            picked={picked}
            onToggle={togglePick}
            empty={staffs.length === 0}
          />
        )}
        {tab === 'org' && (
          <NewChatOrgTab
            groups={visibleGroups as OrgDepartmentGroup[]}
            picked={picked}
            onToggle={togglePick}
            onTogglePack={togglePackPick}
            empty={staffs.length === 0}
          />
        )}
        {tab === 'channel' && (
          <NewChatChannelTab
            user={user}
            staffs={staffs}
            selectedMemberIds={pickedIds}
            onCreated={onCreated}
          />
        )}
      </div>
    </div>
  );
}

// ─── 헤더 ───────────────────────────────────────

type FormHeaderProps = {
  onCancel: () => void;
  title: string;
  onSave: () => void;
  saveLabel: string;
  saveDisabled?: boolean;
};

function FormHeader({ onCancel, title, onSave, saveLabel, saveDisabled }: FormHeaderProps) {
  const cancelStyle: React.CSSProperties = { color: 'var(--z-700)', fontSize: 14, fontWeight: 700, padding: '0 4px' };
  const saveStyle: React.CSSProperties = {
    color: saveDisabled ? 'var(--z-400)' : 'var(--m-accent)',
    fontSize: 14, fontWeight: 800, padding: '0 4px',
  };
  return (
    <div className="m-header" style={{ paddingTop: 18, paddingBottom: 14 }}>
      <button type="button" onClick={onCancel} aria-label="취소" style={cancelStyle}>취소</button>
      <div style={{ flex: 1, textAlign: 'center' }}>
        <div className="title" style={{ fontSize: 15 }}>{title}</div>
      </div>
      <button type="button" onClick={onSave} disabled={saveDisabled} aria-label={saveLabel} style={saveStyle}>
        {saveLabel}
      </button>
    </div>
  );
}

type SegBtnProps = { label: string; active: boolean; onClick: () => void };
function SegBtn({ label, active, onClick }: SegBtnProps) {
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

// ─── 선택 칩 ────────────────────────────────────

type PickedChipRowProps = {
  pickedIds: string[];
  staffs: StaffDirectoryEntry[];
  onRemove: (id: string) => void;
};

const PICKED_ROW_STYLE: React.CSSProperties = {
  padding: '10px 16px', background: 'var(--m-card)',
  borderBottom: '1px solid var(--m-border)',
  display: 'flex', gap: 6, overflowX: 'auto',
};
const PICKED_CHIP_STYLE: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '4px 6px 4px 8px', background: 'var(--m-accent-soft)',
  borderRadius: 999, fontSize: 12, fontWeight: 800,
  color: 'var(--m-accent)', flex: '0 0 auto',
};
const PICKED_X_STYLE: React.CSSProperties = {
  width: 18, height: 18, borderRadius: '50%',
  background: 'var(--m-accent)', color: '#fff',
  display: 'grid', placeItems: 'center',
};

function PickedChipRow({ pickedIds, staffs, onRemove }: PickedChipRowProps) {
  return (
    <div style={PICKED_ROW_STYLE} role="list" aria-label="선택된 구성원">
      {pickedIds.map((id) => {
        const name = staffs.find((s) => String(s.id) === String(id))?.name || '직원';
        return (
          <div key={id} role="listitem" style={PICKED_CHIP_STYLE}>
            {name}
            <button
              type="button"
              aria-label={`${name} 선택 취소`}
              onClick={() => onRemove(id)}
              style={PICKED_X_STYLE}
            >
              <MIcon name="x" size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── 구성원 탭 ──────────────────────────────────

type DepartmentGroup = {
  department: string;
  members: StaffDirectoryEntry[];
};

type MemberTabProps = {
  groups: DepartmentGroup[];
  picked: Record<string, boolean>;
  onToggle: (id: string) => void;
  empty: boolean;
};

function MemberTab({ groups, picked, onToggle, empty }: MemberTabProps) {
  if (empty) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--z-500)' }}>
        구성원 목록을 불러오는 중…
      </div>
    );
  }
  if (groups.length === 0) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--z-500)' }}>
        조건에 맞는 구성원이 없습니다.
      </div>
    );
  }

  return (
    <div>
      {groups.map((group) => (
        <div key={group.department}>
          <div style={{ padding: '14px 16px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: 'var(--z-500)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              {group.department}
            </span>
            <span style={{ fontSize: 11, color: 'var(--z-400)', fontWeight: 700 }}>
              {group.members.length}명
            </span>
          </div>
          <div className="m-card flush" style={{ margin: '0 16px' }}>
            {group.members.map((member) => (
              <MemberRow
                key={String(member.id)}
                member={member}
                department={group.department}
                checked={Boolean(picked[String(member.id)])}
                onToggle={() => onToggle(String(member.id))}
              />
            ))}
          </div>
        </div>
      ))}
      <div style={{ height: 24 }} />
    </div>
  );
}

type MemberRowProps = {
  member: StaffDirectoryEntry;
  department: string;
  checked: boolean;
  onToggle: () => void;
};

function MemberRow({ member, department, checked, onToggle }: MemberRowProps) {
  const name = member.name || '이름 없음';
  const tone = pickAvatarTone(String(member.id) + name);
  const checkStyle: React.CSSProperties = {
    width: 22, height: 22, borderRadius: 6,
    border: checked ? 'none' : '1.5px solid var(--z-300)',
    background: checked ? 'var(--m-accent)' : 'transparent',
    color: '#fff', display: 'grid', placeItems: 'center',
  };
  return (
    <button
      type="button"
      className="m-list-row"
      onClick={onToggle}
      aria-pressed={checked}
      aria-label={`${name} 선택 토글`}
      style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
    >
      <MAvatar tone={tone}>{name.charAt(0)}</MAvatar>
      <div>
        <div className="lbl">{name}</div>
        <div className="sub">{department} · {member.position || '직원'}</div>
      </div>
      <span style={checkStyle} aria-hidden="true">
        {checked && <MIcon name="check" size={14} />}
      </span>
    </button>
  );
}

// ─── 도우미 ─────────────────────────────────────

function groupByDepartment(
  staffs: StaffDirectoryEntry[],
  excludeId: string | null,
): DepartmentGroup[] {
  const byDept = new Map<string, StaffDirectoryEntry[]>();
  staffs.forEach((staff) => {
    if (!staff || !staff.name) return;
    if (excludeId && String(staff.id) === String(excludeId)) return;
    if (staff.status && String(staff.status).includes('퇴사')) return;
    const department = (staff.department && String(staff.department)) || '기타';
    const arr = byDept.get(department) || [];
    arr.push(staff);
    byDept.set(department, arr);
  });
  const result: DepartmentGroup[] = [];
  byDept.forEach((members, department) => {
    members.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    result.push({ department, members });
  });
  result.sort((a, b) => a.department.localeCompare(b.department));
  return result;
}

function defaultDirectName(
  staffs: StaffDirectoryEntry[],
  peerId: string,
  myName: string | undefined,
): string {
  const peer = staffs.find((s) => String(s.id) === String(peerId))?.name || '구성원';
  return myName ? `${myName}, ${peer}` : peer;
}

function defaultGroupName(
  staffs: StaffDirectoryEntry[],
  memberIds: string[],
  myName: string | undefined,
): string {
  const names = memberIds
    .map((id) => staffs.find((s) => String(s.id) === String(id))?.name)
    .filter((n): n is string => Boolean(n));
  if (names.length <= 3) return names.join(', ');
  const head = names.slice(0, 3).join(', ');
  const remaining = memberIds.length - 3;
  return `${head} 외 ${remaining}명`;
}

async function findExistingDirectRoom(memberIds: string[]): Promise<ChatRoom | null> {
  try {
    const { data } = await fetchAllChatRooms({ force: true });
    const rooms: ChatRoom[] = Array.isArray(data) ? data : [];
    return (
      rooms.find((room) => {
        if (room.type !== 'direct') return false;
        return haveSameMembers(normalizeMemberIds(room.members), memberIds);
      }) || null
    );
  } catch {
    return null;
  }
}
