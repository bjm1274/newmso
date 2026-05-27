'use client';

/**
 * 발령필터 — 인사발령 탭의 압축 필터바.
 *
 * 책임: 기간 chip(single) · 종류 chip(multi) · 부서 select · 검색 input · 초기화 button.
 *       값은 상위에서 관리, 본 컴포넌트는 표시·이벤트 위임만.
 *
 * JM6: chip aria-pressed, select·input + label, button + aria-label.
 */

import type { ReactNode } from 'react';

export type AppointmentKind =
  | '신규채용'
  | '부서이동'
  | '승진'
  | '직급변경'
  | '휴직'
  | '복직'
  | '퇴직'
  | '기타';

export const APPOINTMENT_KINDS: ReadonlyArray<AppointmentKind> = [
  '신규채용',
  '부서이동',
  '승진',
  '직급변경',
  '휴직',
  '복직',
  '퇴직',
  '기타',
];

export type AppointmentRange = '1m' | '3m' | '6m' | '1y' | 'all';

export const RANGE_OPTIONS: ReadonlyArray<{
  key: AppointmentRange;
  label: string;
  days: number | null;
}> = [
  { key: '1m', label: '1개월', days: 30 },
  { key: '3m', label: '3개월', days: 90 },
  { key: '6m', label: '6개월', days: 180 },
  { key: '1y', label: '1년', days: 365 },
  { key: 'all', label: '전체', days: null },
];

export function rangeCutoffISO(range: AppointmentRange): string | null {
  const opt = RANGE_OPTIONS.find((o) => o.key === range);
  if (!opt || opt.days === null) return null;
  const since = new Date();
  since.setDate(since.getDate() - opt.days);
  return since.toLocaleDateString('en-CA');
}

/**
 * order_type 문자열을 8개 union 중 하나로 분류.
 * 다중 키워드가 매칭되면 우선순위: 신규채용 > 승진 > 직급변경 > 부서이동 > 휴직 > 복직 > 퇴직 > 기타.
 */
export function classifyOrderType(orderType: string | null): AppointmentKind {
  const text = (orderType ?? '').trim();
  if (!text) return '기타';
  if (text.includes('신규') || text.includes('입사') || text.includes('채용')) return '신규채용';
  if (text.includes('승진')) return '승진';
  if (text.includes('직급')) return '직급변경';
  if (text.includes('전보') || text.includes('이동') || text.includes('부서')) return '부서이동';
  if (text.includes('휴직')) return '휴직';
  if (text.includes('복직')) return '복직';
  if (text.includes('퇴직') || text.includes('면직') || text.includes('퇴사')) return '퇴직';
  return '기타';
}

export type 발령필터Props = {
  range: AppointmentRange;
  onRange: (r: AppointmentRange) => void;
  kinds: ReadonlySet<AppointmentKind>;
  onToggleKind: (k: AppointmentKind) => void;
  dept: string;
  onDept: (d: string) => void;
  deptOptions: string[];
  search: string;
  onSearch: (v: string) => void;
  onReset: () => void;
  canReset: boolean;
};

export default function 발령필터({
  range,
  onRange,
  kinds,
  onToggleKind,
  dept,
  onDept,
  deptOptions,
  search,
  onSearch,
  onReset,
  canReset,
}: 발령필터Props) {
  return (
    <div
      style={{
        padding: '10px 16px',
        background: 'var(--m-card)',
        borderBottom: '1px solid var(--m-border)',
        display: 'grid',
        gap: 8,
      }}
    >
      <ChipRow ariaLabel="발령 기간 필터">
        {RANGE_OPTIONS.map((opt) => {
          const on = range === opt.key;
          return (
            <ChipButton key={opt.key} on={on} onClick={() => onRange(opt.key)}>
              {opt.label}
            </ChipButton>
          );
        })}
      </ChipRow>

      <ChipRow ariaLabel="발령 종류 필터 (다중 선택)">
        {APPOINTMENT_KINDS.map((k) => {
          const on = kinds.has(k);
          return (
            <ChipButton key={k} on={on} onClick={() => onToggleKind(k)}>
              {k}
            </ChipButton>
          );
        })}
      </ChipRow>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <label htmlFor="hr-appt-dept" style={srOnly}>
          부서
        </label>
        <select
          id="hr-appt-dept"
          value={dept}
          onChange={(e) => onDept(e.target.value)}
          aria-label="부서 필터"
          style={{
            height: 32,
            fontSize: 12,
            fontWeight: 700,
            padding: '0 26px 0 10px',
            borderRadius: 8,
            border: '1px solid var(--m-border)',
            background: 'var(--m-card)',
            color: 'var(--z-700)',
            maxWidth: 120,
          }}
        >
          {deptOptions.map((d) => (
            <option key={d} value={d}>
              {d.length > 8 ? d.slice(0, 7) + '…' : d}
            </option>
          ))}
        </select>
        <label
          htmlFor="hr-appt-search"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--m-bg)',
            borderRadius: 8,
            padding: '6px 10px',
            border: '1px solid var(--m-border)',
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }} aria-hidden>
            검색
          </span>
          <input
            id="hr-appt-search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="이름·발령·부서·직급"
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 12,
              fontFamily: 'inherit',
              background: 'transparent',
              border: 'none',
              outline: 'none',
            }}
            aria-label="발령 검색 (이름·종류·부서·직급)"
          />
        </label>
        <button
          type="button"
          onClick={onReset}
          disabled={!canReset}
          aria-label="필터 초기화"
          style={{
            height: 32,
            padding: '0 10px',
            borderRadius: 8,
            border: '1px solid var(--m-border)',
            background: canReset ? 'var(--m-card)' : 'var(--m-bg)',
            color: canReset ? 'var(--z-700)' : 'var(--z-400)',
            fontSize: 12,
            fontWeight: 700,
            cursor: canReset ? 'pointer' : 'not-allowed',
            flexShrink: 0,
          }}
        >
          초기화
        </button>
      </div>
    </div>
  );
}

function ChipRow({ children, ariaLabel }: { children: ReactNode; ariaLabel: string }) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        gap: 6,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
      }}
    >
      {children}
    </div>
  );
}

function ChipButton({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={{
        height: 28,
        padding: '0 10px',
        borderRadius: 999,
        border: on ? '1px solid var(--m-accent)' : '1px solid var(--m-border)',
        background: on ? 'var(--m-accent)' : 'var(--m-card)',
        color: on ? '#fff' : 'var(--z-700)',
        fontSize: 11,
        fontWeight: 800,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

const srOnly = {
  position: 'absolute' as const,
  width: 1,
  height: 1,
  overflow: 'hidden' as const,
  clip: 'rect(0 0 0 0)',
};
