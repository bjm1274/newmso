'use client';

/**
 * 근태이상카드 — 모바일 인사관리 팀 segment 일자별 카드
 *
 * 직원 + 일자 조합 1건 = 카드 1개.
 *   - 헤더: "M/D (요일)" + 직원명·부서
 *   - 본문: "지각 18분 · 조퇴 32분 · 미체크아웃"
 *   - 액션: 사유 요청 / 정상 처리 (권한자만 활성)
 *
 * JM: 단일 책임 (행 1줄 + 액션) — 근태이상.tsx에서 분리.
 * JM6: button 시맨틱 + aria-label · aria-busy · disabled.
 */

import { useState } from 'react';
import MAvatar from '../공통/MAvatar';
import MChip from '../공통/MChip';
import { pickAvatarTone, type DailyAbnormalRow } from './data-hooks';

export type DailyRowStatus = 'idle' | 'clarifying' | 'resolving' | 'resolved' | 'clarified';

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

function formatHeaderDate(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  const dow = WEEKDAY_KO[parsed.getDay()] ?? '';
  return `${parsed.getMonth() + 1}/${parsed.getDate()} (${dow})`;
}

function buildDailyBodyLine(row: DailyAbnormalRow): string {
  const parts: string[] = [];
  if (row.lateMinutes > 0) parts.push(`지각 ${row.lateMinutes}분`);
  if (row.earlyLeaveMinutes > 0) parts.push(`조퇴 ${row.earlyLeaveMinutes}분`);
  if (row.missingCount > 0) {
    if (!row.hasCheckIn && row.hasCheckOut) parts.push('미체크인');
    else if (row.hasCheckIn && !row.hasCheckOut) parts.push('미체크아웃');
    else parts.push('미체크');
  }
  return parts.length > 0 ? parts.join(' · ') : '이상 없음';
}

function rowTone(row: DailyAbnormalRow): 'warning' | 'danger' {
  return row.missingCount > 0 ? 'danger' : 'warning';
}

export type AbnormalDailyCardProps = {
  row: DailyAbnormalRow;
  canMutate: boolean;
  status: DailyRowStatus;
  onClarify: (row: DailyAbnormalRow) => void | Promise<void>;
  onResolve: (row: DailyAbnormalRow) => void | Promise<void>;
  isLast?: boolean;
};

export default function AbnormalDailyCard({
  row,
  canMutate,
  status,
  onClarify,
  onResolve,
  isLast }: AbnormalDailyCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const busy = status === 'clarifying' || status === 'resolving';
  const resolved = status === 'resolved';
  const clarified = status === 'clarified';

  return (
    <div
      style={{
        padding: '12px 16px',
        borderBottom: isLast ? 'none' : '1px solid var(--m-border)',
        background: resolved ? 'var(--m-success-soft)' : 'transparent',
        transition: 'background .2s' }}
      aria-busy={busy || undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <MAvatar tone={pickAvatarTone(row.staffName)}>{row.staffName.charAt(0)}</MAvatar>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 6,
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--z-900)' }}
          >
            <span className="m-tnum">{formatHeaderDate(row.date)}</span>
            <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
              · {row.staffName} · {row.dept}
            </span>
          </div>
          <div
            style={{
              marginTop: 2,
              fontSize: 12,
              color: 'var(--z-700)',
              fontWeight: 700 }}
          >
            {buildDailyBodyLine(row)}
          </div>
        </div>
        <MChip tone={rowTone(row)}>
          {row.lateMinutes + row.earlyLeaveMinutes + row.missingCount > 0
            ? `${row.lateMinutes + row.earlyLeaveMinutes}분`
            : '-'}
        </MChip>
      </div>

      {confirmOpen ? (
        <ConfirmBar
          text={`${row.staffName} ${formatHeaderDate(row.date)} 근태를 정상 처리할까요?`}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            void onResolve(row);
          }}
          busy={busy}
        />
      ) : (
        <div
          style={{
            marginTop: 10,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8 }}
        >
          <ActionButton
            variant="ghost"
            onClick={() => void onClarify(row)}
            disabled={!canMutate || busy || resolved || clarified}
            busy={status === 'clarifying'}
            ariaLabel={`${row.staffName} ${row.date} 사유 요청 발송`}
            tooltip={!canMutate ? '관리자 권한 필요' : undefined}
          >
            {clarified ? '요청 발송됨' : '사유 요청'}
          </ActionButton>
          <ActionButton
            variant="primary"
            onClick={() => setConfirmOpen(true)}
            disabled={!canMutate || busy || resolved}
            busy={status === 'resolving'}
            ariaLabel={`${row.staffName} ${row.date} 정상 처리`}
            tooltip={!canMutate ? '관리자 권한 필요' : undefined}
          >
            {resolved ? '처리됨' : '정상 처리'}
          </ActionButton>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 보조 컴포넌트 (JM6: button + aria-*)
// ─────────────────────────────────────────────────────────────

function ActionButton({
  variant,
  onClick,
  disabled,
  busy,
  ariaLabel,
  tooltip,
  children }: {
  variant: 'primary' | 'ghost';
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  ariaLabel: string;
  tooltip?: string;
  children: React.ReactNode;
}) {
  const isPrimary = variant === 'primary';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      aria-busy={busy || undefined}
      title={tooltip}
      style={{
        height: 36,
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 800,
        border: isPrimary ? '1px solid var(--m-accent)' : '1px solid var(--m-border)',
        background: isPrimary ? 'var(--m-accent)' : 'var(--m-card)',
        color: isPrimary ? '#fff' : 'var(--z-700)',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6 }}
    >
      {busy ? '처리 중...' : children}
    </button>
  );
}

function ConfirmBar({
  text,
  onCancel,
  onConfirm,
  busy }: {
  text: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <div
      role="alertdialog"
      aria-label="정상 처리 확인"
      style={{
        marginTop: 10,
        padding: '10px 12px',
        background: 'var(--m-warning-soft)',
        border: '1px solid var(--m-warning)',
        borderRadius: 8,
        display: 'grid',
        gap: 8 }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--z-900)' }}>{text}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <ActionButton
          variant="ghost"
          onClick={onCancel}
          disabled={busy}
          ariaLabel="정상 처리 취소"
        >
          취소
        </ActionButton>
        <ActionButton
          variant="primary"
          onClick={onConfirm}
          disabled={busy}
          busy={busy}
          ariaLabel="정상 처리 확정"
        >
          처리
        </ActionButton>
      </div>
    </div>
  );
}
