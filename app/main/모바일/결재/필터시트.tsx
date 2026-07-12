'use client';

/**
 * SApprovalFilterSheet — 결재함 필터 바텀시트 (type/status/기간).
 *
 *   - type: 14 양식 슬러그 chip multi-select
 *   - status: 대기/승인/반려/회수 chip multi-select
 *   - period: today/7d/30d/all segment
 *   - "초기화" / "적용" sticky 버튼
 *
 * JM(파일당 500줄, 단일 책임), JM2(state 최소, derived만 useMemo),
 * JM3(no-op silent), JM4(any 금지, FilterState/Period 유니온),
 * JM6(chip aria-pressed, ESC 닫기는 MSheet 위임)
 */

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import MSheet from '../공통/MSheet';

export type ApprovalPeriod = 'today' | '7d' | '30d' | 'all';

export type ApprovalFilterState = {
  types: string[];
  statuses: string[];
  period: ApprovalPeriod;
};

export const EMPTY_FILTER: ApprovalFilterState = {
  types: [],
  statuses: [],
  period: 'all' };

export function countActiveFilters(state: ApprovalFilterState): number {
  let n = 0;
  if (state.types.length > 0) n += 1;
  if (state.statuses.length > 0) n += 1;
  if (state.period !== 'all') n += 1;
  return n;
}

/** approvals.type 실제 저장값과 1:1 (작성하기 폼 name / typeName) */
const TYPE_OPTIONS: ReadonlyArray<string> = [
  '연차/휴가',
  '연차계획서',
  '연장근무 신청',
  '출결정정',
  '연차촉진통보서',
  '물품구매 신청',
  '수리요청서',
  '사직서',
  '퇴직 서약서',
  '수습직원평가서',
  '급여인상평가서',
  '업무기안',
  '업무협조',
  '공문발송',
  '보고서작성',
  '증명서발급',
];

const STATUS_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: '대기', label: '대기' },
  { id: '승인', label: '승인' },
  { id: '반려', label: '반려' },
  { id: '회수', label: '회수' },
];

const PERIOD_OPTIONS: ReadonlyArray<{ id: ApprovalPeriod; label: string }> = [
  { id: 'today', label: '오늘' },
  { id: '7d', label: '7일' },
  { id: '30d', label: '30일' },
  { id: 'all', label: '전체' },
];

// 기간을 milliseconds 단위 cutoff로 환산. 'all'은 null.
export function resolvePeriodCutoff(period: ApprovalPeriod): number | null {
  if (period === 'all') return null;
  const now = new Date();
  if (period === 'today') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  const days = period === '7d' ? 7 : 30;
  return now.getTime() - days * 24 * 60 * 60 * 1000;
}

export type SApprovalFilterSheetProps = {
  open: boolean;
  initial: ApprovalFilterState;
  onClose: () => void;
  onApply: (next: ApprovalFilterState) => void;
};

export default function SApprovalFilterSheet({
  open,
  initial,
  onClose,
  onApply }: SApprovalFilterSheetProps) {
  const [state, setState] = useState<ApprovalFilterState>(initial);

  // 열릴 때마다 외부 initial을 반영
  useEffect(() => {
    if (open) setState(initial);
  }, [open, initial]);

  const activeCount = useMemo(() => countActiveFilters(state), [state]);

  const toggleType = (slug: string) => {
    setState((prev) => {
      const has = prev.types.includes(slug);
      return {
        ...prev,
        types: has ? prev.types.filter((t) => t !== slug) : [...prev.types, slug] };
    });
  };

  const toggleStatus = (id: string) => {
    setState((prev) => {
      const has = prev.statuses.includes(id);
      return {
        ...prev,
        statuses: has ? prev.statuses.filter((s) => s !== id) : [...prev.statuses, id] };
    });
  };

  const setPeriod = (p: ApprovalPeriod) => {
    setState((prev) => ({ ...prev, period: p }));
  };

  const reset = () => setState(EMPTY_FILTER);

  const apply = () => {
    onApply(state);
    onClose();
  };

  return (
    <MSheet open={open} onClose={onClose} title={`필터${activeCount > 0 ? ` (${activeCount})` : ''}`}>
      <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* 양식 type */}
        <section aria-labelledby="m-filter-type">
          <SectionLabel id="m-filter-type">양식 종류</SectionLabel>
          <div style={chipGridStyle}>
            {TYPE_OPTIONS.map((slug) => {
              const on = state.types.includes(slug);
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() => toggleType(slug)}
                  aria-pressed={on}
                  style={chipStyle(on)}
                >
                  {slug}
                </button>
              );
            })}
          </div>
        </section>

        {/* status */}
        <section aria-labelledby="m-filter-status">
          <SectionLabel id="m-filter-status">상태</SectionLabel>
          <div style={chipGridStyle}>
            {STATUS_OPTIONS.map((opt) => {
              const on = state.statuses.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggleStatus(opt.id)}
                  aria-pressed={on}
                  style={chipStyle(on)}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* 기간 */}
        <section aria-labelledby="m-filter-period">
          <SectionLabel id="m-filter-period">기간</SectionLabel>
          <div className="m-seg" role="radiogroup" aria-label="기간">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={state.period === opt.id ? 'on' : ''}
                onClick={() => setPeriod(opt.id)}
                role="radio"
                aria-checked={state.period === opt.id}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* sticky action */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          display: 'flex',
          gap: 8,
          padding: '10px 16px 14px',
          background: 'var(--m-card)',
          borderTop: '1px solid var(--m-border)' }}
      >
        <button type="button" onClick={reset} style={actionStyle('ghost')} aria-label="필터 초기화">
          초기화
        </button>
        <button type="button" onClick={apply} style={actionStyle('primary')} aria-label="필터 적용">
          적용 {activeCount > 0 ? `(${activeCount})` : ''}
        </button>
      </div>
    </MSheet>
  );
}

// ─────────────────────────────────────────────
// 하위 — 시각 helpers
// ─────────────────────────────────────────────

function SectionLabel({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div
      id={id}
      style={{
        fontSize: 11,
        fontWeight: 800,
        color: 'var(--z-500)',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        margin: '8px 0 8px' }}
    >
      {children}
    </div>
  );
}

const chipGridStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6 };

function chipStyle(on: boolean): CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 700,
    padding: '7px 12px',
    borderRadius: 999,
    border: `1px solid ${on ? 'var(--m-accent)' : 'var(--m-border)'}`,
    background: on ? 'var(--m-accent)' : 'transparent',
    color: on ? '#fff' : 'var(--z-700)',
    cursor: 'pointer',
    lineHeight: 1.2,
    whiteSpace: 'nowrap' };
}

function actionStyle(kind: 'primary' | 'ghost'): CSSProperties {
  const base: CSSProperties = {
    flex: 1,
    height: 48,
    borderRadius: 'var(--m-radius-lg)',
    fontSize: 15,
    fontWeight: 800,
    cursor: 'pointer',
    border: '1px solid var(--m-border)' };
  if (kind === 'primary') {
    return { ...base, background: 'var(--m-accent)', color: '#fff', border: '1px solid var(--m-accent)' };
  }
  return { ...base, background: 'transparent', color: 'var(--z-700)' };
}
