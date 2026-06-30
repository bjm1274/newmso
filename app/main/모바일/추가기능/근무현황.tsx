'use client';
/* eslint-disable react-hooks/rules-of-hooks */

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
    <div
      className="m-screen"
      style={{
        background: 'linear-gradient(145deg, #f3ecfc 0%, #f6f0fd 30%, #ecf5fc 70%, #ecfaf4 100%)',
        display: 'flex',
        flexDirection: 'column' }}
    >
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
          <div
            key={k.label}
            className="macos-glass macos-squircle-sm"
            style={{
              padding: '12px 8px',
              textAlign: 'center',
              background: 'rgba(255, 255, 255, 0.65)',
              border: '1px solid rgba(0, 0, 0, 0.06)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.02)' }}
          >
            <div className="m-tnum" style={{ fontSize: 22, fontWeight: 800, color: k.color }}>
              {k.v}
            </div>
            <div style={{ fontSize: 10, color: 'var(--z-500)', fontWeight: 700, marginTop: 2 }}>
              {k.label}
            </div>
          </div>
        ))}
      </div>

      <div
        className="m-chip-bar macos-glass"
        style={{
          marginTop: 12,
          padding: '10px 16px',
          background: 'rgba(255, 255, 255, 0.35)',
          borderBottom: '1px solid rgba(0, 0, 0, 0.05)' }}
      >
        <button
          type="button"
          className={filter === 'all' ? 'on macos-glass macos-squircle-sm' : 'macos-squircle-sm'}
          onClick={() => setFilter('all')}
          style={{
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 700,
            borderRadius: 8,
            background: filter === 'all' ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.04)',
            color: filter === 'all' ? 'var(--z-900)' : 'var(--z-600)',
            boxShadow: filter === 'all' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            transition: 'all 0.2s' }}
        >
          전체 <span style={{ opacity: 0.6, fontSize: 10 }}>{members.length}</span>
        </button>
        <button
          type="button"
          className={filter === 'work' ? 'on macos-glass macos-squircle-sm' : 'macos-squircle-sm'}
          onClick={() => setFilter('work')}
          style={{
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 700,
            borderRadius: 8,
            background: filter === 'work' ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.04)',
            color: filter === 'work' ? 'var(--z-900)' : 'var(--z-600)',
            boxShadow: filter === 'work' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            transition: 'all 0.2s' }}
        >
          근무중 <span style={{ opacity: 0.6, fontSize: 10 }}>{kpi.working}</span>
        </button>
        <button
          type="button"
          className={filter === 'break' ? 'on macos-glass macos-squircle-sm' : 'macos-squircle-sm'}
          onClick={() => setFilter('break')}
          style={{
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 700,
            borderRadius: 8,
            background: filter === 'break' ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.04)',
            color: filter === 'break' ? 'var(--z-900)' : 'var(--z-600)',
            boxShadow: filter === 'break' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            transition: 'all 0.2s' }}
        >
          휴게/외근 <span style={{ opacity: 0.6, fontSize: 10 }}>{kpi.breakCount + kpi.outside}</span>
        </button>
        <button
          type="button"
          className={filter === 'off' ? 'on macos-glass macos-squircle-sm' : 'macos-squircle-sm'}
          onClick={() => setFilter('off')}
          style={{
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 700,
            borderRadius: 8,
            background: filter === 'off' ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.04)',
            color: filter === 'off' ? 'var(--z-900)' : 'var(--z-600)',
            boxShadow: filter === 'off' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            transition: 'all 0.2s' }}
        >
          휴가 <span style={{ opacity: 0.6, fontSize: 10 }}>{kpi.off}</span>
        </button>
      </div>

      <div className="m-scroll" style={{ background: 'transparent' }}>
        <div style={{ padding: '12px 16px 16px' }}>
          <div
            className="macos-glass macos-squircle"
            style={{
              overflow: 'hidden',
              padding: '4px 0',
              border: '1px solid rgba(0, 0, 0, 0.06)',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)' }}
          >
            {loading && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
                불러오는 중…
              </div>
            )}
            {filtered.map((p, idx) => {
              const isLast = idx === filtered.length - 1;
              return (
                <div
                  key={p.id}
                  className="m-list-row"
                  style={{
                    background: 'transparent',
                    borderBottom: isLast ? 'none' : '1px solid rgba(0, 0, 0, 0.04)' }}
                >
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
                          border: '2px solid rgba(255, 255, 255, 0.8)' }}
                      />
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="lbl" style={{ color: 'var(--z-800)', fontWeight: 800 }}>
                      {p.name}{' '}
                      <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
                        · {p.department}
                      </span>
                    </div>
                    <div className="sub" style={{ color: 'var(--z-500)' }}>
                      {p.location}
                      {p.since !== '-' ? ` · ${p.since} 시작` : ''}
                    </div>
                  </div>
                  <MChip tone={toneOf(p.state)}>{p.stateLabel}</MChip>
                </div>
              );
            })}
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
