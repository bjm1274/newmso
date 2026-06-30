'use client';

/**
 * 결재함 하위 — KPI 카드 + 결재 카드 + 카드용 공용 헬퍼.
 * 결재함.tsx 본문이 500줄을 넘지 않도록 분리 (JM).
 *
 * JM(파일당 500줄, 단일 책임), JM4(any 금지), JM6(button 시맨틱 + aria-label)
 */

import { memo, type CSSProperties } from 'react';
import MIcon from '../공통/MIcon';
import MChip, { type MChipTone } from '../공통/MChip';
import MAvatar, { type MAvatarTone } from '../공통/MAvatar';
import MCard from '../공통/MCard';
import { resolveCurrentApproverId, type ApprovalRow } from './data-hooks';

const AVATAR_TONES: MAvatarTone[] = ['blue', 'pink', 'violet', 'orange', 'cyan', 'green'];

export function pickAvatarTone(seed: string | null | undefined): MAvatarTone {
  const s = String(seed || '');
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export function formatTs(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (
    d.getFullYear() === yest.getFullYear() &&
    d.getMonth() === yest.getMonth() &&
    d.getDate() === yest.getDate()
  ) {
    return '어제';
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function elapsedDays(iso?: string | null): number {
  if (!iso) return 0;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  const diff = Date.now() - d.getTime();
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

export function readAmount(row: ApprovalRow): string | null {
  const meta = (row.meta_data ?? {}) as Record<string, unknown>;
  const candidates = [
    meta.total_amount,
    meta.amount,
    meta.requested_amount,
    (meta.summary as Record<string, unknown> | undefined)?.amount,
  ];
  for (const v of candidates) {
    if (v == null) continue;
    const num = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(num) && num !== 0) {
      return num.toLocaleString('ko-KR');
    }
  }
  return null;
}

export function statusTone(
  row: ApprovalRow,
  currentStaff: string | null
): { tone: MChipTone; label: string; urgent: boolean; urgentTone: MChipTone } {
  const status = String(row.status || '');
  if (status === '승인') return { tone: 'success', label: '승인', urgent: false, urgentTone: '' };
  if (status === '반려') return { tone: 'danger', label: '반려', urgent: false, urgentTone: '' };
  if (status === '회수') return { tone: '', label: '회수', urgent: false, urgentTone: '' };
  // 대기
  const days = elapsedDays(row.created_at);
  const overdue = days >= 1; // 24h 초과
  const mine = currentStaff && resolveCurrentApproverId(row) === currentStaff;
  if (overdue) return { tone: 'danger', label: '24h 초과', urgent: true, urgentTone: 'danger' };
  if (mine) return { tone: 'warning', label: '대기 (나)', urgent: true, urgentTone: 'warning' };
  return { tone: 'accent', label: '대기', urgent: false, urgentTone: '' };
}

// ─────────────────────────────────────────────
// KPI 카드
// ─────────────────────────────────────────────

export type KpiCardProps = { label: string; value: number; tone: 'accent' | 'danger'; icon?: string };

function KpiCardBase({ label, value, tone, icon }: KpiCardProps) {
  const color = tone === 'danger' ? 'var(--m-danger)' : 'var(--m-accent)';
  const toneClass = tone === 'danger' ? 'tone-danger' : 'tone-accent';
  return (
    <MCard
      className="macos-glass macos-squircle"
      style={{
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        overflow: 'hidden' }}
    >
      {icon && (
        <span style={{ display: 'inline-flex' }} className={'m-kpi-ico ' + toneClass}>
          <MIcon name={icon} size={18} />
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--z-700)', fontWeight: 800 }}>{label}</div>
      </div>
      <div
        className="m-tnum"
        style={{
          fontSize: 22,
          fontWeight: 900,
          letterSpacing: '-0.025em',
          color,
          display: 'flex',
          alignItems: 'baseline',
          gap: 2,
          flexShrink: 0 }}
      >
        {value}
        <span style={{ fontSize: 10.5, color: 'var(--z-500)', fontWeight: 800 }}>건</span>
      </div>
    </MCard>
  );
}

export const KpiCard = memo(KpiCardBase);

// ─────────────────────────────────────────────
// 결재 카드
// ─────────────────────────────────────────────

export type ApprovalCardProps = {
  row: ApprovalRow;
  staffId: string | null;
  onOpen: () => void;
};

function ApprovalCardBase({ row, staffId, onOpen }: ApprovalCardProps) {
  const { tone, label, urgent, urgentTone } = statusTone(row, staffId);
  const days = elapsedDays(row.created_at);
  const ts = formatTs(row.created_at);
  const amount = readAmount(row);
  const senderName = String(row.sender_name || '').trim() || '미상';
  const senderDept = String(row.sender_department || '').trim() || String(row.sender_company || '').trim() || '';
  const title = String(row.title || row.type || '제목 없음').trim();
  const avatarTone = pickAvatarTone(row.sender_id);

  const cardStyle: CSSProperties = {
    padding: '14px 16px',
    position: 'relative',
    textAlign: 'left',
    width: '100%',
    display: 'block',
    outline: 'none',
    cursor: 'pointer',
    border: 'none',
    background: 'transparent' };
  const stripStyle: CSSProperties = {
    position: 'absolute',
    top: 1,
    left: 1,
    bottom: 1,
    width: 4,
    borderRadius: '20px 0 0 20px',
    background: urgentTone === 'danger' ? 'var(--m-danger)' : 'var(--m-warning)' };

  return (
    <button
      type="button"
      className="macos-glass macos-squircle transition-all duration-150 active:scale-[0.98]"
      style={cardStyle}
      onClick={onOpen}
      aria-label={`${title} 상세 열기`}
    >
      {urgent && <div style={stripStyle} aria-hidden="true" />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <MChip tone={tone}>{label}</MChip>
        {days >= 1 && String(row.status) === '대기' && (
          <MChip tone={days >= 2 ? 'danger' : 'warning'}>+{days}일</MChip>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 800 }}>{ts}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: '-0.015em', lineHeight: 1.4, color: 'var(--z-900)' }}>
        {title}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <MAvatar tone={avatarTone} size="sm">
          {senderName.charAt(0) || '?'}
        </MAvatar>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--z-800)' }}>{senderName}</div>
          {senderDept && (
            <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>{senderDept}</div>
          )}
        </div>
        {amount && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'var(--z-500)', fontWeight: 800 }}>금액</div>
            <div className="m-tnum" style={{ fontSize: 14, fontWeight: 900, color: 'var(--z-900)' }}>
              ₩ {amount}
            </div>
          </div>
        )}
      </div>
    </button>
  );
}

export const ApprovalCard = memo(ApprovalCardBase);

export { MIcon };
