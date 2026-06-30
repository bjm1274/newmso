'use client';

/**
 * OP체크 카드 — 보드의 단위 카드 (상태별 인라인 액션).
 *
 * 🔴 모바일 단독 사용 가능 핵심 — 카드 상태 토글로 PC 5화면 → 1화면.
 *
 * 상태별 인라인 액션:
 *   준비중   → [시작]
 *   준비완료 → [시작]
 *   수술중   → [중단] [완료]
 *   완료     → [재시작]
 *   보류     → [취소] [재개]
 *
 * JM: 단일 책임 (카드 + 액션 핸들러 호출), ~150줄.
 * JM3: 상태 변경 호출은 부모에서 처리(낙관적 업데이트). 본 카드는 onAction만 트리거.
 * JM6: button + aria-pressed, 상태 색만 바뀜(페이지 이동 없음).
 */

import { memo } from 'react';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import type { OpCheckCard, OpCheckCardState } from './data-hooks';

const STATE_TONE: Record<OpCheckCardState, '' | 'success' | 'accent' | 'warning' | 'danger'> = {
  '준비중': '',
  '준비완료': 'accent',
  '수술중': 'success',
  '완료': 'accent',
  '보류': 'warning' };

const STATE_DOT: Record<OpCheckCardState, string> = {
  '준비중': 'var(--z-400)',
  '준비완료': 'var(--m-accent)',
  '수술중': 'var(--m-success)',
  '완료': 'var(--m-accent)',
  '보류': 'var(--m-warning)' };

export type OPCardActionsProps = {
  card: OpCheckCard;
  busy: boolean;
  onChange: (card: OpCheckCard, next: OpCheckCardState) => void;
  onOpenDetail?: (card: OpCheckCard) => void;
};

function OPCardActions({ card, busy, onChange, onOpenDetail }: OPCardActionsProps) {
  const base: React.CSSProperties = {
    flex: 1,
    height: 40,
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 800 };
  const ghost: React.CSSProperties = {
    background: 'var(--m-card)',
    color: 'var(--z-700)',
    border: '1px solid var(--m-border)',
    fontWeight: 700 };
  const primary: React.CSSProperties = {
    background: 'var(--m-accent)',
    color: '#fff',
    border: 0 };
  const success: React.CSSProperties = {
    background: 'var(--m-success)',
    color: '#fff',
    border: 0 };

  switch (card.state) {
    case '준비중':
    case '준비완료':
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => onChange(card, '수술중')}
          style={{ ...base, ...primary }}
        >
          시작
        </button>
      );
    case '수술중':
      return (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => onChange(card, '보류')}
            style={{ ...base, ...ghost }}
          >
            보류
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onChange(card, '완료')}
            style={{ ...base, flex: 2, ...success }}
          >
            완료
          </button>
        </>
      );
    case '완료':
      return (
        <button
          type="button"
          onClick={() => onOpenDetail?.(card)}
          style={{ ...base, ...ghost }}
        >
          상세
        </button>
      );
    case '보류':
      return (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => onChange(card, '준비중')}
            style={{ ...base, ...ghost }}
          >
            취소
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onChange(card, '수술중')}
            style={{ ...base, flex: 2, ...primary }}
          >
            재개
          </button>
        </>
      );
    default:
      return null;
  }
}

export type OPCardProps = {
  card: OpCheckCard;
  busy: boolean;
  onChange: (card: OpCheckCard, next: OpCheckCardState) => void;
  onOpenDetail?: (card: OpCheckCard) => void;
};

function OPCardBase({ card, busy, onChange, onOpenDetail }: OPCardProps) {
  const inProgress = card.state === '수술중';
  return (
    <div
      className="m-card"
      style={{
        padding: '14px 16px',
        position: 'relative',
        overflow: 'hidden',
        borderColor: inProgress ? 'var(--m-success)' : 'var(--m-border)' }}
    >
      {inProgress && (
        <div
          aria-hidden="true"
          style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: 'var(--m-success)' }}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <MChip tone={STATE_TONE[card.state]}>
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: 999,
              background: STATE_DOT[card.state],
              marginRight: 4,
              verticalAlign: 'middle' }}
          />
          {card.state}
        </MChip>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>{card.room}</span>
      </div>
      <button
        type="button"
        onClick={() => onOpenDetail?.(card)}
        aria-label={`${card.patient} ${card.procedure} 상세`}
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          background: 'transparent',
          border: 0,
          padding: 0 }}
      >
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.015em' }}>
          {card.patient}
          <span
            style={{
              fontSize: 12,
              color: 'var(--z-500)',
              fontWeight: 600,
              marginLeft: 6 }}
          >
            · {card.procedure}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600, marginTop: 2 }}>
          {card.doctor} · 예정 {card.startTime}
        </div>
      </button>
      <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
        <OPCardActions card={card} busy={busy} onChange={onChange} onOpenDetail={onOpenDetail} />
      </div>
    </div>
  );
}

const OPCard = memo(OPCardBase);
export default OPCard;

export function OPCardIcon() {
  return <MIcon name="checkCircle" size={18} />;
}
