'use client';

/**
 * SApprovalDocs — 전자결재 "문서 조회" (프로토타입 이미지 01 기준).
 *
 *   - 상단: 결재함/기안함/참조/작성 + 문서조회 칩 네비 (문서조회 active)
 *   - 문서 종류 select + 조회 기간 칩(최근 30일 / 최근 90일(기본) / 전체) + 조회 버튼
 *   - 결과: 진행 중 / 처리 완료 로 분리해 ApprovalCard 리스트
 *
 * 데이터: 본인이 관여한 실제 결재 문서(inbox∪progress = 진행 중, done∪완료기안 = 처리 완료).
 * 카드 탭 → 상세(결재상세)에서 실제 승인/반려. (프로토타입의 "결재 승인(시연)" 데모 버튼은
 *  실제 앱에선 상세 화면의 실 동작으로 대체)
 *
 * JM(단일 책임, ~200줄), JM2(파생값 useMemo), JM4(any 금지·Period 유니온), JM6(select label·칩 aria)
 */

import { useMemo, useState } from 'react';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MCard from '../공통/MCard';
import { type ApprovalRow } from './data-hooks';
import { ApprovalCard } from './결재함-cards';

type DocPeriod = '30d' | '90d' | 'all';

const PERIOD_CHIPS: ReadonlyArray<{ id: DocPeriod; label: string }> = [
  { id: '30d', label: '최근 30일' },
  { id: '90d', label: '최근 90일' },
  { id: 'all', label: '전체' },
];

// 기간 → cutoff(ms). 'all'은 null(전체).
function periodCutoff(period: DocPeriod): number | null {
  if (period === 'all') return null;
  const days = period === '30d' ? 30 : 90;
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

export type SApprovalDocsProps = {
  staffId: string | null;
  /** 진행 중(본인 관여, 대기) */
  inProgress: ApprovalRow[];
  /** 처리 완료(본인 관여, 승인·반려) */
  completed: ApprovalRow[];
  loading: boolean;
  onOpen: (id: string) => void;
  onNavInbox: () => void;
  onNavSent: () => void;
  onNavRef: () => void;
  onNavWrite: () => void;
};

export default function SApprovalDocs({
  staffId,
  inProgress,
  completed,
  loading,
  onOpen,
  onNavInbox,
  onNavSent,
  onNavRef,
  onNavWrite,
}: SApprovalDocsProps) {
  // 조회 조건: pending(선택중) → 조회 버튼으로 applied 반영 (PC 문서조회 흐름 재현)
  const [typeSel, setTypeSel] = useState('전체');
  const [periodSel, setPeriodSel] = useState<DocPeriod>('90d');
  const [applied, setApplied] = useState<{ type: string; period: DocPeriod }>({
    type: '전체',
    period: '90d',
  });

  // 문서 종류 옵션 — 본인 관여 문서에 실제 존재하는 type만
  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of [...inProgress, ...completed]) {
      const t = String(row.type || '').trim();
      if (t) set.add(t);
    }
    return ['전체', ...Array.from(set).sort()];
  }, [inProgress, completed]);

  const filterFn = useMemo(() => {
    const cutoff = periodCutoff(applied.period);
    return (row: ApprovalRow) => {
      if (applied.type !== '전체' && String(row.type || '').trim() !== applied.type) return false;
      if (cutoff !== null && row.created_at) {
        const t = new Date(row.created_at).getTime();
        // 미래일(예약 결재 등)은 항상 포함, 기간 초과 과거 문서만 제외
        if (!Number.isNaN(t) && t < cutoff) return false;
      }
      return true;
    };
  }, [applied]);

  const progressList = useMemo(() => inProgress.filter(filterFn), [inProgress, filterFn]);
  const doneList = useMemo(() => completed.filter(filterFn), [completed, filterFn]);

  return (
    <div className="m-screen">
      <MobileHeader
        title="전자결재"
        eyebrow="협업"
        actions={
          <button type="button" aria-label="결재 작성" onClick={onNavWrite}>
            <MIcon name="edit" size={20} />
          </button>
        }
      />

      {/* 칩 네비 — 문서조회 active */}
      <div className="m-chip-bar">
        <button type="button" onClick={onNavInbox} aria-label="결재함">
          결재함
        </button>
        <button type="button" onClick={onNavSent} aria-label="기안함">
          기안함
        </button>
        <button type="button" onClick={onNavRef} aria-label="참조 문서함">
          참조
        </button>
        <button type="button" onClick={onNavWrite} aria-label="작성하기">
          작성
        </button>
        <button type="button" className="on" aria-label="문서 조회" aria-current="page">
          문서 조회
        </button>
      </div>

      {/* 조회 조건 */}
      <div
        style={{
          padding: '12px 16px',
          background: 'var(--m-card)',
          borderBottom: '1px solid var(--m-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div>
          <label
            htmlFor="m-docs-type"
            style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--z-500)', marginBottom: 6 }}
          >
            문서 종류
          </label>
          <div style={{ position: 'relative' }}>
            <select
              id="m-docs-type"
              value={typeSel}
              onChange={(e) => setTypeSel(e.target.value)}
              style={{
                width: '100%',
                height: 44,
                appearance: 'none',
                border: '1px solid var(--m-border)',
                borderRadius: 'var(--m-radius-md)',
                background: 'var(--m-card)',
                padding: '0 38px 0 14px',
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--z-900)',
                fontFamily: 'inherit',
              }}
            >
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--z-400)' }}>
              <MIcon name="chevD" size={18} />
            </span>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--z-500)', marginBottom: 6 }}>
            조회 기간
          </div>
          <div className="m-seg" role="radiogroup" aria-label="조회 기간">
            {PERIOD_CHIPS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={periodSel === p.id ? 'on' : ''}
                onClick={() => setPeriodSel(p.id)}
                role="radio"
                aria-checked={periodSel === p.id}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="m-btn primary block"
          onClick={() => setApplied({ type: typeSel, period: periodSel })}
          aria-label="조회"
        >
          <MIcon name="search" size={18} />
          조회
        </button>
      </div>

      <div className="m-scroll">
        {loading && progressList.length === 0 && doneList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', fontSize: 13, color: 'var(--z-500)' }}>
            불러오는 중…
          </div>
        ) : (
          <>
            <DocSection
              title="진행 중"
              count={progressList.length}
              rows={progressList}
              staffId={staffId}
              onOpen={onOpen}
              emptyMsg="진행 중인 문서가 없습니다"
            />
            <DocSection
              title="처리 완료"
              count={doneList.length}
              rows={doneList}
              staffId={staffId}
              onOpen={onOpen}
              emptyMsg="처리 완료된 문서가 없습니다"
            />
            <div style={{ height: 24 }} />
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 결과 섹션
// ─────────────────────────────────────────────

function DocSection({
  title,
  count,
  rows,
  staffId,
  onOpen,
  emptyMsg,
}: {
  title: string;
  count: number;
  rows: ApprovalRow[];
  staffId: string | null;
  onOpen: (id: string) => void;
  emptyMsg: string;
}) {
  return (
    <div className="m-section">
      <div className="m-section-h">
        <div className="lbl">{title}</div>
        <div className="cnt">{count}건</div>
      </div>
      {rows.length === 0 ? (
        <MCard style={{ textAlign: 'center', padding: '24px 16px', fontSize: 13, color: 'var(--z-500)', fontWeight: 600 }}>
          {emptyMsg}
        </MCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((row) => (
            <ApprovalCard key={row.id} row={row} staffId={staffId} onOpen={() => onOpen(row.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
