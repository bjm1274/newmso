'use client';

/**
 * 근무현황 — 실시간 상태판.
 * useWorkNow (30s 폴링). KPI 4개 + 필터 + 직원 리스트.
 * 핸드오프 m-screens-addon-modules §3 (SAddonWorknow) 이식.
 * 🔴 모바일 단독 사용 가능.
 * JM: ~180줄.
 */

import { useMemo, useState } from 'react';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MAvatar from '../공통/MAvatar';
import { pickTone, useWorkNow, type WorkNowState } from './data-hooks';

type Filter = 'all' | 'work' | 'break' | 'off';

function syncLabel(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return `${diff}초 전`;
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  return `${Math.floor(diff / 3600)}시간 전`;
}

export default function 근무현황({ user, onBack }: { user: ErpUser; onBack: () => void }) {
  const company = '전체';
  const { members, kpi, loading, lastSync, refresh } = useWorkNow({ company, pollMs: 30000 });
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    if (filter === 'work') return members.filter((m) => m.state === 'working');
    if (filter === 'break') return members.filter((m) => m.state === 'break' || m.state === 'outside');
    if (filter === 'off') return members.filter((m) => m.state === 'off');
    return members;
  }, [members, filter]);

  const toneOf = (s: WorkNowState): '' | 'success' | 'warning' | 'accent' => {
    if (s === 'working') return 'success';
    if (s === 'break') return 'warning';
    if (s === 'outside') return 'accent';
    return '';
  };

  const KPI: { label: string; v: number; color: string }[] = [
    { label: '근무중', v: kpi.working, color: 'var(--m-success)' },
    { label: '휴게', v: kpi.breakCount, color: 'var(--m-warning)' },
    { label: '외근', v: kpi.outside, color: 'var(--m-accent)' },
    { label: '휴가', v: kpi.off, color: 'var(--z-700)' },
  ];

  return (
    <div className="m-screen">
      <MobileHeader
        title="근무현황"
        sub={`실시간 · 마지막 갱신 ${syncLabel(lastSync)}`}
        back={onBack}
        actions={
          <button type="button" onClick={() => void refresh()} aria-label="새로고침">
            <MIcon name="refresh" size={20} />
          </button>
        }
      />

      <div style={{ padding: '14px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
        {KPI.map((k) => (
          <div key={k.label} className="m-card" style={{ padding: '10px 8px', textAlign: 'center' }}>
            <div className="m-tnum" style={{ fontSize: 22, fontWeight: 800, color: k.color }}>
              {k.v}
            </div>
            <div style={{ fontSize: 10, color: 'var(--z-500)', fontWeight: 700, marginTop: 2 }}>
              {k.label}
            </div>
          </div>
        ))}
      </div>

      <div className="m-chip-bar" style={{ marginTop: 4 }}>
        <button type="button" className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
          전체<span className="cnt">{members.length}</span>
        </button>
        <button type="button" className={filter === 'work' ? 'on' : ''} onClick={() => setFilter('work')}>
          근무중<span className="cnt">{kpi.working}</span>
        </button>
        <button type="button" className={filter === 'break' ? 'on' : ''} onClick={() => setFilter('break')}>
          휴게/외근<span className="cnt">{kpi.breakCount + kpi.outside}</span>
        </button>
        <button type="button" className={filter === 'off' ? 'on' : ''} onClick={() => setFilter('off')}>
          휴가<span className="cnt">{kpi.off}</span>
        </button>
      </div>

      <div className="m-scroll">
        <div style={{ padding: '12px 16px 16px' }}>
          <div className="m-card flush">
            {loading && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
                불러오는 중…
              </div>
            )}
            {filtered.map((p) => (
              <div key={p.id} className="m-list-row">
                <div style={{ position: 'relative' }}>
                  <MAvatar tone={pickTone(p.id)} size="sm">{p.name.charAt(0)}</MAvatar>
                  {p.state === 'working' && (
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        bottom: -2,
                        right: -2,
                        width: 11,
                        height: 11,
                        borderRadius: 999,
                        background: 'var(--m-success)',
                        border: '2px solid var(--m-card)',
                      }}
                    />
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="lbl">
                    {p.name}{' '}
                    <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
                      · {p.department}
                    </span>
                  </div>
                  <div className="sub">
                    {p.location}
                    {p.since !== '-' ? ` · ${p.since} 시작` : ''}
                  </div>
                </div>
                <MChip tone={toneOf(p.state)}>{p.stateLabel}</MChip>
              </div>
            ))}
            {!loading && filtered.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 12 }}>
                해당 상태의 직원이 없습니다.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
