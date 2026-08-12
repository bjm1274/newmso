'use client';

/**
 * 결재선·참조 피커가 공유하는 화면 블록.
 *
 * 두 피커는 "선택된 목록" 만 다르고(결재선은 순서 있는 ol + ↑↓, 참조는 chip 토글)
 * 검색창·후보 목록·하단 버튼은 마크업이 글자 단위로 같았다. 라벨과 각 행의
 * 생김새만 인자로 받아 나머지를 여기로 모은다 — 스타일을 손볼 때 한쪽만 고쳐
 * 두 시트가 서로 달라 보이는 일을 막는다.
 *
 * 렌더 결과는 그대로다(정적 HTML 스냅샷 비교로 확인).
 */

import type { ReactNode } from 'react';
import type { StaffMember } from '@/types';
import MIcon from '../../공통/MIcon';
import { emptyStyle, actionStyle } from './ui-atoms';

/** 이름·부서·직급 검색 입력. label 은 스크린리더용으로 화면 밖에 둔다. */
export function PickerSearchField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <>
      <label htmlFor={id} style={{ position: 'absolute', left: -10000 }}>
        {label}
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
          id={id}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
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
    </>
  );
}

/**
 * 부서별로 묶인 후보 목록.
 *
 * 행의 생김새는 피커마다 다르므로(추가 버튼 vs 토글) renderMember 로 받는다.
 * `staffRows === null` 은 "아직 한 번도 안 불러왔다" 는 뜻이라 빈 안내를 내지 않는다.
 */
export function PickerCandidateList({
  loading,
  loaded,
  query,
  groups,
  renderMember,
}: {
  loading: boolean;
  loaded: boolean;
  query: string;
  groups: [string, StaffMember[]][];
  renderMember: (staff: StaffMember) => ReactNode;
}) {
  return (
    <div style={{ marginTop: 8, maxHeight: '40vh', overflowY: 'auto' }}>
      {loading && <div style={emptyStyle}>직원 목록을 불러오는 중…</div>}
      {!loading && loaded && groups.length === 0 && (
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
          {members.map((s) => renderMember(s))}
        </div>
      ))}
    </div>
  );
}

/** 시트 하단 고정 버튼 (취소 / 적용). */
export function PickerFooter({
  onCancel,
  cancelAriaLabel,
  onApply,
  applyAriaLabel,
  applyLabel,
  applyDisabled,
}: {
  onCancel: () => void;
  cancelAriaLabel: string;
  onApply: () => void;
  applyAriaLabel: string;
  applyLabel: ReactNode;
  /**
   * 비활성 조건이 있는 시트만 넘긴다(결재선). 넘기지 않으면 항상 활성이며
   * opacity·cursor 를 인라인으로 쓰지 않는다 — 참조 시트의 기존 마크업 그대로다.
   */
  applyDisabled?: boolean;
}) {
  return (
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
        onClick={onCancel}
        style={actionStyle('ghost')}
        aria-label={cancelAriaLabel}
      >
        취소
      </button>
      <button
        type="button"
        className="macos-squircle-sm transition-all active:scale-[0.98] duration-100"
        onClick={onApply}
        disabled={applyDisabled}
        style={
          applyDisabled === undefined
            ? actionStyle('primary')
            : {
                ...actionStyle('primary'),
                opacity: applyDisabled ? 0.5 : 1,
                cursor: applyDisabled ? 'not-allowed' : 'pointer',
              }
        }
        aria-label={applyAriaLabel}
      >
        {applyLabel}
      </button>
    </div>
  );
}
