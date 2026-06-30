'use client';

/**
 * 자동 감지 카드 1개 (AbnormalDetectionCard)
 *
 * - 6개 종류 (지각/조퇴/조기퇴근/미기록/연속결근/패턴이상)
 * - 카드 클릭 → 우측 상세에 해당 패턴 row 리스트 표시
 * - JM6: <button> + aria-pressed/label
 * - JM2: memo로 불필요 리렌더 방지
 */

import { memo } from 'react';
import type { DetectionGroup } from './data';

interface Props {
  group: DetectionGroup;
  active: boolean;
  onSelect: (kind: DetectionGroup['kind']) => void;
}

const TONE_BORDER: Record<DetectionGroup['tone'], string> = {
  warn:   'border-l-[#F59E0B]',
  danger: 'border-l-[#EF4444]',
  muted:  'border-l-[var(--toss-gray-3)]',
  accent: 'border-l-[var(--accent)]' };

const TONE_VALUE: Record<DetectionGroup['tone'], string> = {
  warn:   'text-[#D97706]',
  danger: 'text-[#DC2626]',
  muted:  'text-[var(--foreground)]',
  accent: 'text-[var(--accent)]' };

function AbnormalDetectionCardInner({ group, active, onSelect }: Props) {
  return (
    <button
      type="button"
      data-testid={group.kind === 'late' ? 'attendance-analysis-lateness' : undefined}
      onClick={() => onSelect(group.kind)}
      aria-pressed={active}
      aria-label={`${group.label} 자동 감지 ${group.count}건 — 상세 보기`}
      className={`app-card group flex flex-col gap-1 border-l-[3px] ${TONE_BORDER[group.tone]} px-3 py-2.5 text-left transition-colors ${
        active ? 'ring-2 ring-[var(--accent)]/40 bg-[var(--muted)]' : 'hover:bg-[var(--muted)]/60'
      }`}
    >
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-4)]">
        {group.label}
      </div>
      <div className={`flex items-baseline gap-1 text-[20px] font-bold ${TONE_VALUE[group.tone]}`}>
        <span className="tnum">{group.count}</span>
        <span className="text-[11px] font-semibold text-[var(--toss-gray-4)]">건</span>
      </div>
      <div className="text-[11px] font-medium text-[var(--toss-gray-4)]">
        {group.description}
      </div>
    </button>
  );
}

export const AbnormalDetectionCard = memo(AbnormalDetectionCardInner);
