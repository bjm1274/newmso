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
import MKpi from '../공통/MKpi';

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

/**
 * MiniKpi — 공통 MKpi의 얇은 래퍼(중복 제거).
 * value를 string|number 모두 받도록 받아 기존 호출부 호환 유지.
 * icon 지정 시 아이콘 틴트 가로 레이아웃(허브 KPI와 동일).
 */
export const MiniKpi = memo(function MiniKpi({
  label,
  value,
  unit,
  sub,
  tone = '',
  icon,
}: {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  tone?: KpiTone;
  icon?: string;
}) {
  return (
    <MKpi label={label} value={String(value)} unit={unit} sub={sub} tone={tone} icon={icon} />
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
