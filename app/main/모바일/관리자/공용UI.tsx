'use client';

/**
 * 관리자 모듈 공용 UI 부품.
 *
 * - DesktopHint : "데스크톱에서 진행" 안내 카드 (tone: '' | 'warning' | 'accent')
 * - MiniKpi     : 4-grid 작은 KPI 카드 (label / value / sub / tone)
 * - Sparkline   : 인라인 SVG 미니 차트 (경영대시 KPI용)
 *
 * JM: 단일 책임 (공용 부품), ~140줄
 * JM6: 안내는 role="note" + 의미 있는 텍스트
 */

import { memo, type ReactNode } from 'react';
import MIcon from '../공통/MIcon';

// ─────────────────────────────────────────────────────────────
// DesktopHint
// ─────────────────────────────────────────────────────────────

export type DesktopHintTone = '' | 'warning' | 'accent';

const HINT_BG: Record<DesktopHintTone, string> = {
  '': 'var(--m-accent-soft)',
  warning: 'var(--m-warning-soft)',
  accent: 'var(--m-accent-soft)',
};
const HINT_FG: Record<DesktopHintTone, string> = {
  '': 'var(--m-accent)',
  warning: 'var(--m-warning)',
  accent: 'var(--m-accent)',
};

export const DesktopHint = memo(function DesktopHint({
  tone = '',
  children,
}: {
  tone?: DesktopHintTone;
  children: ReactNode;
}) {
  return (
    <div
      role="note"
      className="m-card"
      style={{
        margin: '12px 16px 0',
        padding: '12px 14px',
        background: HINT_BG[tone],
        borderColor: 'transparent',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <MIcon name="info" size={18} color={HINT_FG[tone]} />
      <div style={{ flex: 1, fontSize: 12, color: HINT_FG[tone], fontWeight: 700 }}>
        {children}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// MiniKpi — 카드 한 장 (label/value/sub/tone)
// ─────────────────────────────────────────────────────────────

export type KpiTone = '' | 'accent' | 'success' | 'warning' | 'danger';

export const MiniKpi = memo(function MiniKpi({
  label,
  value,
  unit,
  sub,
  tone = '',
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  tone?: KpiTone;
}) {
  const colorMap: Record<KpiTone, string> = {
    '': 'var(--z-900)',
    accent: 'var(--m-accent)',
    success: 'var(--m-success)',
    warning: 'var(--m-warning)',
    danger: 'var(--m-danger)',
  };
  return (
    <div className="m-card" style={{ padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>{label}</div>
      <div
        className="m-tnum"
        style={{
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: '-0.025em',
          marginTop: 4,
          color: colorMap[tone],
          display: 'flex',
          alignItems: 'baseline',
          gap: 3,
        }}
      >
        {value}
        {unit && (
          <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>{unit}</span>
        )}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600, marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// Sparkline — 인라인 SVG (경영대시 KPI)
// ─────────────────────────────────────────────────────────────

export const Sparkline = memo(function Sparkline({
  values,
  color = 'var(--m-accent)',
}: {
  values: number[];
  color?: string;
}) {
  if (values.length < 2) return null;
  const w = 140;
  const h = 36;
  const pad = 2;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + (h - pad * 2) * (1 - (v - min) / range);
      return `${x},${y}`;
    })
    .join(' ');
  const lastX = pad + (values.length - 1) * stepX;
  const lastY = pad + (h - pad * 2) * (1 - (values[values.length - 1] - min) / range);
  const areaPts = `${pad},${h - pad} ${points} ${lastX},${h - pad}`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      width="100%"
      height={h}
      role="img"
      aria-label="추세 미니차트"
    >
      <polygon points={areaPts} fill={color} opacity={0.1} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={3} fill={color} />
    </svg>
  );
});
