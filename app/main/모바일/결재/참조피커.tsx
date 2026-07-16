'use client';

/**
 * SApprovalCcPicker — 참조(CC) 지정 바텀시트.
 *
 *   - 검색 input (이름·부서·직급 client filter)
 *   - 부서별 그룹핑 목록 (회사 내 활성 직원 전체 — 부서장 제한 없음)
 *   - 멤버 클릭 → 참조자 토글(추가/제거), 다중 선택
 *   - 선택된 참조자 chip 목록 + X 제거
 *   - "전체 해제" / "적용" 버튼
 *
 * 결재선피커(SApprovalApproverPicker)의 UI/UX를 미러링.
 * 공용 kit: ./staff-picker/* (타입·lazy fetch·filter/group·atoms)
 * 공개 API(CcPick, toCcPick, default export) 유지.
 * 참조는 PC와 동일하게 meta_data.cc_users = [{id,name}] 로 저장된다(상위 폼에서 매핑).
 *
 * JM(파일당 500줄, 단일 책임), JM2(staff fetch는 첫 open 시 1회 lazy),
 * JM3(try/catch + 빈 결과 폴백), JM4(any 금지, CcPick 타입),
 * JM5(본인은 자동 제외, RLS 의존), JM6(input label 연결, button aria-label)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StaffMember } from '@/types';
import MSheet from '../공통/MSheet';
import MIcon from '../공통/MIcon';
import MAvatar from '../공통/MAvatar';
import { toStaffPick, type CcPick } from './staff-picker/types';
import { useLazyActiveStaff } from './staff-picker/useLazyActiveStaff';
import { filterStaffByQuery, groupStaffByDepartment } from './staff-picker/group-filter';
import {
  SectionLabel,
  IconBtn,
  memberRowStyle,
  emptyStyle,
  actionStyle,
} from './staff-picker/ui-atoms';

export type { CcPick } from './staff-picker/types';

/** 기존 import 호환 — StaffPick 매핑 alias */
export function toCcPick(s: StaffMember): CcPick {
  return toStaffPick(s);
}

export type SApprovalCcPickerProps = {
  open: boolean;
  onClose: () => void;
  selfId: string | null;
  company: string | null;
  current: CcPick[];
  onApply: (next: CcPick[]) => void;
};

export default function SApprovalCcPicker({
  open,
  onClose,
  selfId,
  company,
  current,
  onApply,
}: SApprovalCcPickerProps) {
  const [picked, setPicked] = useState<CcPick[]>(current);
  const [query, setQuery] = useState('');
  const { staffRows, loading } = useLazyActiveStaff(open, 'mobile-approval-cc-picker');

  // 열릴 때마다 현재 참조자 동기화
  useEffect(() => {
    if (open) {
      setPicked(current);
      setQuery('');
    }
  }, [open, current]);

  const pickedIds = useMemo(() => new Set(picked.map((p) => p.id)), [picked]);

  // 검색 + 본인 제외 + 본인 회사(또는 SY INC.) 직원
  const filtered: StaffMember[] = useMemo(
    () =>
      filterStaffByQuery(staffRows ?? [], {
        query,
        selfId,
        company,
      }),
    [staffRows, query, selfId, company]
  );

  const groups = useMemo(() => groupStaffByDepartment(filtered), [filtered]);

  const toggleMember = useCallback((s: StaffMember) => {
    const id = String(s.id || '');
    setPicked((prev) =>
      prev.some((p) => p.id === id) ? prev.filter((p) => p.id !== id) : [...prev, toStaffPick(s)]
    );
  }, []);

  const removeAt = useCallback((idx: number) => {
    setPicked((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const clearAll = useCallback(() => {
    setPicked([]);
  }, []);

  const apply = useCallback(() => {
    onApply(picked);
    onClose();
  }, [picked, onApply, onClose]);

  return (
    <MSheet open={open} onClose={onClose} title="참조자 지정">
      <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* 선택된 참조자 */}
        <section>
          <SectionLabel>선택된 참조자 ({picked.length})</SectionLabel>
          {picked.length === 0 ? (
            <div
              className="macos-glass macos-squircle-sm"
              style={{
                padding: '12px 14px',
                fontSize: 12,
                color: 'var(--z-600)',
                background: 'rgba(0, 0, 0, 0.02)',
                border: '1px solid rgba(0, 0, 0, 0.04)',
                fontWeight: 800,
              }}
            >
              참조는 선택 사항입니다. 아래에서 참조자를 추가할 수 있어요.
            </div>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
              }}
            >
              {picked.map((c, i) => (
                <li
                  key={c.id}
                  className="macos-glass transition-all duration-150"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 8px 6px 10px',
                    borderRadius: 999,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--z-900)' }}>{c.name}</span>
                  {(c.department || c.position) && (
                    <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 800 }}>
                      {[c.department, c.position].filter(Boolean).join(' / ')}
                    </span>
                  )}
                  <IconBtn
                    ariaLabel={`${c.name} 참조 제거`}
                    tone="danger"
                    size={22}
                    onClick={() => removeAt(i)}
                  >
                    <MIcon name="x" size={13} />
                  </IconBtn>
                </li>
              ))}
            </ul>
          )}
          {picked.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <button
                type="button"
                className="transition-all active:scale-95"
                onClick={clearAll}
                style={{
                  fontSize: 11,
                  fontWeight: 900,
                  color: 'var(--m-accent)',
                  padding: 6,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
                aria-label="참조자 전체 해제"
              >
                전체 해제
              </button>
            </div>
          )}
        </section>

        {/* 검색 + 후보 */}
        <section>
          <SectionLabel>참조자 추가</SectionLabel>
          <label htmlFor="m-cc-pick-q" style={{ position: 'absolute', left: -10000 }}>
            참조자 검색
          </label>
          <div
            className="macos-glass"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 10,
            }}
          >
            <MIcon name="search" size={14} color="var(--z-500)" />
            <input
              id="m-cc-pick-q"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름·부서·직급"
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--z-900)',
              }}
            />
          </div>

          <div style={{ marginTop: 8, maxHeight: '40vh', overflowY: 'auto' }}>
            {loading && <div style={emptyStyle}>직원 목록을 불러오는 중…</div>}
            {!loading && staffRows !== null && groups.length === 0 && (
              <div style={emptyStyle}>
                {query ? `'${query}' 에 대한 결과가 없습니다` : '추가할 수 있는 직원이 없습니다'}
              </div>
            )}
            {groups.map(([dept, members]) => (
              <div key={dept} style={{ marginBottom: 8 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 900,
                    color: 'var(--z-500)',
                    padding: '6px 4px 4px',
                    letterSpacing: '0.04em',
                  }}
                >
                  {dept}
                </div>
                {members.map((s) => {
                  const id = String(s.id || '');
                  const isPicked = pickedIds.has(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      className="transition-all duration-150 active:bg-black/[0.04]"
                      onClick={() => toggleMember(s)}
                      style={memberRowStyle}
                      aria-pressed={isPicked}
                      aria-label={isPicked ? `${s.name} 참조에서 제거` : `${s.name} 참조에 추가`}
                    >
                      <MAvatar tone={isPicked ? 'violet' : 'blue'} size="sm">
                        {(s.name || '?').charAt(0)}
                      </MAvatar>
                      <div style={{ flex: 1, minWidth: 0, textAlign: 'left', marginLeft: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--z-900)' }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>
                          {[s.department, s.position].filter(Boolean).join(' / ') || ' '}
                        </div>
                      </div>
                      <MIcon
                        name={isPicked ? 'check' : 'plus'}
                        size={14}
                        color={isPicked ? 'var(--m-success)' : 'var(--m-accent)'}
                      />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* sticky apply */}
      <div
        className="macos-glass"
        style={{
          position: 'sticky',
          bottom: 0,
          display: 'flex',
          gap: 8,
          padding: '10px 16px 14px',
          borderTop: '1px solid rgba(255,255,255,0.4)',
        }}
      >
        <button
          type="button"
          className="macos-squircle-sm transition-all active:scale-[0.98] duration-100"
          onClick={onClose}
          style={actionStyle('ghost')}
          aria-label="참조자 지정 취소"
        >
          취소
        </button>
        <button
          type="button"
          className="macos-squircle-sm transition-all active:scale-[0.98] duration-100"
          onClick={apply}
          style={actionStyle('primary')}
          aria-label="참조자 적용"
        >
          적용 ({picked.length})
        </button>
      </div>
    </MSheet>
  );
}
