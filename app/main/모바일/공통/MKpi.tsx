'use client';

/**
 * MKpi — 허브 상단 KPI 타일 (label / value / unit / sub / tone).
 * 관리자 공용UI의 MiniKpi와 동일 디자인을 공통화 — 인사관리·재고 등 모든 허브에서 사용.
 * JM: 단일 책임, ~50줄
 */

import { memo } from 'react';
import MIcon from './MIcon';

export type MKpiTone = '' | 'accent' | 'success' | 'warning' | 'danger';

export type MKpiProps = {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  tone?: MKpiTone;
  /** 좌측 틴트 아이콘(허브 KPI). 지정 시 아이콘+라벨 / 값 가로 레이아웃. */
  icon?: string;
};

const COLOR: Record<MKpiTone, string> = {
  '': 'var(--z-900)',
  accent: 'var(--m-accent)',
  success: 'var(--m-success)',
  warning: 'var(--m-warning)',
  danger: 'var(--m-danger)',
};

function MKpiBase({ label, value, unit, sub, tone = '', icon }: MKpiProps) {
  // 아이콘 미지정 — 기존 세로 레이아웃(라벨 위 / 값 아래)
  if (!icon) {
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

  // 아이콘 지정 — 가로 레이아웃(아이콘 | 라벨+서브 | 값+단위). 프로토타입 허브 KPI 패턴.
  return (
    <div
      className="m-card m-kpi"
      style={{
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div className={'m-kpi-ico' + (tone ? ' tone-' + tone : '')}>
        <MIcon name={icon} size={18} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, color: 'var(--z-700)', fontWeight: 700, letterSpacing: '-0.01em' }}>
          {label}
        </div>
        {sub && (
          <div
            style={{
              fontSize: 10.5,
              color: 'var(--z-500)',
              fontWeight: 600,
              marginTop: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {sub}
          </div>
        )}
      </div>
      <div
        className="m-tnum"
        style={{
          fontSize: 21,
          fontWeight: 800,
          letterSpacing: '-0.025em',
          color: COLOR[tone],
          display: 'flex',
          alignItems: 'baseline',
          gap: 2,
          flexShrink: 0,
        }}
      >
        {value}
        {unit && <span style={{ fontSize: 10.5, color: 'var(--z-500)', fontWeight: 700 }}>{unit}</span>}
      </div>
    </div>
  );
}

const MKpi = memo(MKpiBase);
export default MKpi;
