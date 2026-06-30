'use client';

/**
 * 모바일 채팅 — 참여자 추가 바텀시트.
 * PC 메신저멤버관리모달.AddMemberModal + 메신저방관리훅.handleSubmitAddMembers 미러.
 *
 * 멤버 제외는 채팅방.tsx 참여자 목록의 각 행 액션으로 처리(removeMobileRoomMember).
 * 본 시트는 "추가"만 담당한다(검색 + 다중 선택).
 *
 * 제약: JM(단일 책임 + 500줄 이내), JM4(any 금지), JM6(button/label + aria).
 */

import { useMemo, useState } from 'react';
import MSheet from '../공통/MSheet';
import MAvatar from '../공통/MAvatar';
import { pickAvatarTone, type StaffDirectoryEntry } from './data-hooks';

const RESIGNED_STATUSES = new Set(['퇴사', '퇴직']);

export type AddMemberSheetProps = {
  open: boolean;
  submitting: boolean;
  currentMemberIds: string[];
  staffs: StaffDirectoryEntry[];
  onClose: () => void;
  onSubmit: (selected: StaffDirectoryEntry[]) => void;
};

export function AddMemberSheet({
  open,
  submitting,
  currentMemberIds,
  staffs,
  onClose,
  onSubmit }: AddMemberSheetProps) {
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const currentSet = useMemo(() => new Set(currentMemberIds.map(String)), [currentMemberIds]);

  const addable = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staffs
      .filter((s) => !currentSet.has(String(s.id)))
      .filter((s) => !RESIGNED_STATUSES.has(String(s.status || '')))
      .filter((s) => {
        if (!q) return true;
        return (
          String(s.name || '').toLowerCase().includes(q) ||
          String(s.department || '').toLowerCase().includes(q) ||
          String(s.position || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 100);
  }, [staffs, currentSet, search]);

  const handleClose = () => {
    if (submitting) return;
    setSearch('');
    setSelectedIds([]);
    onClose();
  };

  const toggle = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSubmit = () => {
    const selected = staffs.filter((s) => selectedIds.includes(String(s.id)));
    onSubmit(selected);
    setSearch('');
    setSelectedIds([]);
  };

  return (
    <MSheet open={open} onClose={handleClose} title="참여자 추가">
      <div style={{ padding: '8px 20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름, 부서, 직급으로 검색"
          aria-label="참여자 검색"
          disabled={submitting}
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: 14,
            fontFamily: 'inherit',
            background: 'rgba(0, 0, 0, 0.04)',
            border: '1px solid rgba(0, 0, 0, 0.08)',
            borderRadius: 10,
            outline: 'none',
            color: 'var(--z-900)' }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '45vh', overflowY: 'auto' }} className="custom-scrollbar">
          {addable.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--z-400)', fontWeight: 600 }}>
              추가할 수 있는 직원이 없습니다.
            </div>
          ) : (
            addable.map((staff) => {
              const checked = selectedIds.includes(String(staff.id));
              const tone = pickAvatarTone(String(staff.id) + staff.name);
              const photoUrl = staff.photo_url || staff.avatar_url;
              return (
                <label
                  key={staff.id}
                  className="macos-glass macos-squircle-sm"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: checked ? '1px solid #007AFF' : '1px solid rgba(255, 255, 255, 0.35)',
                    background: checked ? 'rgba(0, 122, 255, 0.08)' : 'rgba(255, 255, 255, 0.65)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease-in-out' }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(String(staff.id))}
                    aria-label={`${staff.name} 선택`}
                    style={{ width: 16, height: 16, accentColor: 'var(--m-accent)' }}
                  />
                  <MAvatar tone={tone} size="sm">
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
                    <div style={{ fontSize: 11, color: 'var(--z-500)', marginTop: 1 }}>
                      {staff.department || '부서 없음'} · {staff.position || '직급 없음'}
                    </div>
                  </div>
                </label>
              );
            })
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="macos-glass macos-squircle-sm"
            style={{
              flex: 1,
              padding: '12px',
              background: 'rgba(255, 255, 255, 0.65)',
              color: 'var(--z-700)',
              fontSize: 13,
              fontWeight: 800,
              border: 'none',
              cursor: submitting ? 'not-allowed' : 'pointer',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || selectedIds.length === 0}
            className="macos-squircle-sm"
            style={{
              flex: 1,
              padding: '12px',
              background: selectedIds.length > 0 ? 'linear-gradient(135deg, #007AFF, #0A55E1)' : 'rgba(0, 0, 0, 0.08)',
              color: selectedIds.length > 0 ? '#fff' : 'var(--z-400)',
              fontSize: 13,
              fontWeight: 800,
              border: 'none',
              cursor: submitting || selectedIds.length === 0 ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1,
              boxShadow: selectedIds.length > 0 ? '0 4px 12px rgba(0, 122, 255, 0.24)' : 'none' }}
          >
            {submitting ? '추가 중…' : `추가하기${selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}`}
          </button>
        </div>
      </div>
    </MSheet>
  );
}
