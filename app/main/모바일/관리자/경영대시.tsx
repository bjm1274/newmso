'use client';

/**
 * SExec — 경영 대시보드 (PC 7개 통합: 경영·재무·예산·통합보고서·법인손익·분석a·분석b)
 *
 * 핵심 KPI 4종 + 매출 추이 12개월 바차트 + 부문별 매출 비중 + 데스크톱 상세 안내.
 * 모바일은 조회 중심 — 다운로드·드릴다운은 데스크톱.
 *
 * JM:  300줄 이내, 단일 책임
 * JM2: 데이터는 정적 상수 (현재 단계) — 실제 백엔드 fetch는 추후 확장
 * JM4: KPI/세그먼트 union
 * JM5: 본인 회사 컨텍스트만 표시 (props.user.company)
 * JM6: 기간 세그먼트 role=tablist + aria-selected
 */

import { memo, useState } from 'react';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MCard from '../공통/MCard';
import { Sparkline } from './공용UI';

type ExecPeriod = 'm5' | 'm4' | 'm3' | 'year';

interface ExecKpi {
  label: string;
  value: string;
  unit: string;
  delta: string;
  tone: '' | 'success' | 'danger';
  spark: number[];
}

const KPIS: ExecKpi[] = [
  { label: '5월 매출', value: '248,920', unit: '천원', delta: '+8.4%', tone: 'success', spark: [20, 22, 25, 21, 28, 30, 32, 35, 33, 38] },
  { label: '인건비', value: '42,180', unit: '천원', delta: '-2.1%', tone: '', spark: [24, 23, 22, 21, 21, 20, 19, 18, 18, 17] },
  { label: '환자수', value: '412', unit: '명', delta: '+12.1%', tone: 'success', spark: [18, 22, 25, 28, 30, 28, 32, 35, 40, 42] },
  { label: '신환', value: '68', unit: '명', delta: '-5.5%', tone: 'danger', spark: [12, 14, 16, 13, 12, 11, 10, 11, 9, 8] },
];

const MONTHS_12 = [18, 22, 21, 28, 32, 30, 35, 33, 38, 36, 40, 45];

interface Segment {
  label: string;
  pct: number;
  amountK: string;
  color: string;
}

const SEGMENTS: Segment[] = [
  { label: '외래 진료', pct: 48, amountK: '119,481', color: '#2563EB' },
  { label: '영상의학', pct: 24, amountK: '59,740', color: '#8B5CF6' },
  { label: '수술', pct: 18, amountK: '44,805', color: '#10B981' },
  { label: '기타', pct: 10, amountK: '24,892', color: '#A1A1AA' },
];

const PERIODS: { id: ExecPeriod; label: string }[] = [
  { id: 'm5', label: '5월' },
  { id: 'm4', label: '4월' },
  { id: 'm3', label: '3월' },
  { id: 'year', label: '연간' },
];

export interface 경영대시Props {
  user: ErpUser;
  onBack: () => void;
}

export default function 경영대시({ user, onBack }: 경영대시Props) {
  const [period, setPeriod] = useState<ExecPeriod>('m5');
  const company = typeof user.company === 'string' ? user.company : '';
  const sub = company ? `${company} · 2026.05` : '2026.05';

  return (
    <div className="m-screen">
      <MobileHeader
        title="경영지표"
        sub={sub}
        back={onBack}
        actions={
          <>
            <button type="button" aria-label="기간 선택">
              <MIcon name="calendar" size={20} />
            </button>
            <button type="button" aria-label="더보기">
              <MIcon name="moreV" size={20} />
            </button>
          </>
        }
      />
      <div className="m-scroll">
        {/* 기간 세그먼트 */}
        <div style={{ padding: '14px 16px 0' }}>
          <div role="tablist" aria-label="기간" style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {PERIODS.map((p) => {
              const active = p.id === period;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPeriod(p.id)}
                  style={{
                    flex: 1,
                    height: 32,
                    borderRadius: 8,
                    background: active ? 'var(--z-900)' : 'var(--m-card)',
                    color: active ? '#fff' : 'var(--z-700)',
                    border: active ? 0 : '1px solid var(--m-border)',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* KPI 4 grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {KPIS.map((k) => (
              <KpiCard key={k.label} kpi={k} />
            ))}
          </div>
        </div>

        {/* 매출 추이 */}
        <div className="m-section">
          <div className="m-section-h">
            <div className="lbl">매출 추이 (최근 12개월)</div>
          </div>
          <RevenueBars values={MONTHS_12} />
        </div>

        {/* 부문별 매출 비중 */}
        <div className="m-section">
          <div className="m-section-h">
            <div className="lbl">부문별 매출 비중</div>
          </div>
          <MCard>
            {SEGMENTS.map((s, i) => (
              <SegmentRow key={s.label} seg={s} first={i === 0} />
            ))}
          </MCard>
        </div>

        {/* 데스크톱 안내 */}
        <div style={{ padding: '16px 16px 0' }}>
          <div
            className="m-card"
            role="note"
            style={{
              padding: '14px 14px',
              background: 'var(--m-accent-soft)',
              borderColor: 'transparent',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <MIcon name="info" size={18} color="var(--m-accent)" />
            <div style={{ flex: 1, fontSize: 12, color: 'var(--m-accent)', fontWeight: 700 }}>
              상세 분석·다운로드는 데스크톱에서 열어주세요
            </div>
          </div>
        </div>

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// KPI card
// ─────────────────────────────────────────────────────────────

const KpiCard = memo(function KpiCard({ kpi }: { kpi: ExecKpi }) {
  const sparkColor =
    kpi.tone === 'danger' ? '#EF4444' : kpi.tone === 'success' ? '#10B981' : '#71717A';
  const deltaColor =
    kpi.tone === 'success'
      ? 'var(--m-success)'
      : kpi.tone === 'danger'
        ? 'var(--m-danger)'
        : 'var(--z-500)';
  return (
    <div className="m-card" style={{ padding: '14px 14px' }}>
      <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>{kpi.label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 4 }}>
        <span
          className="m-tnum"
          style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.025em' }}
        >
          {kpi.value}
        </span>
        <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>{kpi.unit}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
        <span
          className="m-tnum"
          style={{ fontSize: 11, fontWeight: 800, color: deltaColor }}
        >
          {kpi.delta}
        </span>
        <span style={{ fontSize: 10, color: 'var(--z-400)', fontWeight: 600 }}>vs 전월</span>
      </div>
      <div style={{ marginTop: 8 }}>
        <Sparkline values={kpi.spark} color={sparkColor} />
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// 매출 추이 12개월 bars
// ─────────────────────────────────────────────────────────────

const RevenueBars = memo(function RevenueBars({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <MCard>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
        {values.map((v, i) => {
          const isLast = i === values.length - 1;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: `${(v / max) * 100}%`,
                background: isLast ? 'var(--m-accent)' : 'var(--m-accent-soft)',
                borderRadius: '4px 4px 2px 2px',
                position: 'relative',
              }}
              aria-hidden="true"
            >
              {isLast && (
                <div
                  className="m-tnum"
                  style={{
                    position: 'absolute',
                    top: -22,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontSize: 10,
                    fontWeight: 800,
                    color: 'var(--m-accent)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ₩249M
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 6,
          fontSize: 10,
          color: 'var(--z-500)',
          fontWeight: 600,
        }}
      >
        <span>&apos;25.6</span>
        <span>&apos;25.9</span>
        <span>&apos;25.12</span>
        <span>&apos;26.3</span>
        <span style={{ color: 'var(--m-accent)', fontWeight: 800 }}>5월</span>
      </div>
    </MCard>
  );
});

// ─────────────────────────────────────────────────────────────
// 부문별 row
// ─────────────────────────────────────────────────────────────

const SegmentRow = memo(function SegmentRow({ seg, first }: { seg: Segment; first: boolean }) {
  return (
    <div style={{ marginTop: first ? 0 : 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: seg.color }} />
        <span style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>{seg.label}</span>
        <span
          className="m-tnum"
          style={{ fontSize: 13, fontWeight: 800, color: 'var(--z-900)' }}
        >
          {seg.pct}%
        </span>
        <span
          className="m-tnum"
          style={{
            fontSize: 11,
            color: 'var(--z-500)',
            fontWeight: 600,
            width: 64,
            textAlign: 'right',
          }}
        >
          ₩{seg.amountK}K
        </span>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 999,
          background: 'var(--z-100)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${seg.pct}%`,
            height: '100%',
            background: seg.color,
            transition: 'width .3s',
          }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
});
