'use client';

/**
 * MKpi — 허브 상단 KPI 타일 (label / value / unit / sub / tone).
 * 관리자 공용UI의 MiniKpi와 동일 디자인을 공통화 — 인사관리·재고 등 모든 허브에서 사용.
 * JM: 단일 책임, ~50줄
 */

import { memo } from 'react';

export type MKpiTone = '' | 'accent' | 'success' | 'warning' | 'danger';

export type MKpiProps = {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  tone?: MKpiTone;
};

const COLOR: Record<MKpiTone, string> = {
  '': 'var(--z-900)',
  accent: 'var(--m-accent)',
  success: 'var(--m-success)',
  warning: 'var(--m-warning)',
  danger: 'var(--m-danger)',
};

function MKpiBase({ label, value, unit, sub, tone = '' }: MKpiProps) {
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
          color: COLOR[tone],
          display: 'flex',
          alignItems: 'baseline',
          gap: 3,
        }}
      >
        {value}
        {unit && <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>{unit}</span>}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600, marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}

const MKpi = memo(MKpiBase);
export default MKpi;
