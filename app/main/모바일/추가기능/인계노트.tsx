'use client';

/**
 * 인계노트 — 일/주/전체 뷰.
 * useHandoverNotes (30s 폴링). 회사 격리.
 * 🔴 모바일 단독 사용 가능 — 카드 + 부서별 그룹.
 * 핸드오프 m-screens-addon-modules §4 (SAddonHandoff) 이식.
 * JM: ~180줄.
 */

import { useMemo, useState } from 'react';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MListRow from '../공통/MListRow';
import { useHandoverNotes, todayISO } from './data-hooks';

type View = 'day' | 'week' | 'all';

function dateKey(value: string | null | undefined): string {
  if (!value) return '';
  return value.slice(0, 10);
}

export default function 인계노트({ user, onBack }: { user: ErpUser; onBack: () => void }) {
  const company = typeof user.company === 'string' ? user.company : undefined;
  const { rows, loading, refresh } = useHandoverNotes({ company, pollMs: 30000 });
  const [view, setView] = useState<View>('day');

  const today = todayISO();
  const todayRows = useMemo(() => rows.filter((r) => dateKey(r.created_at) === today), [rows, today]);

  const weekly = useMemo(() => {
    const map = new Map<string, number>();
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const r of rows) {
      const ts = Date.parse(r.created_at);
      if (!Number.isFinite(ts) || ts < cutoff) continue;
      const key = dateKey(r.created_at);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 7);
  }, [rows]);

  const generalToday = todayRows.filter((r) => r.scope === 'general');
  const patientToday = todayRows.filter((r) => r.scope === 'patient');

  return (
    <div className="m-screen">
      <MobileHeader
        title="인계노트"
        sub={`${today} · 오늘 ${todayRows.length}건`}
        back={onBack}
        actions={
          <button type="button" onClick={() => void refresh()} aria-label="새로고침">
            <MIcon name="refresh" size={20} />
          </button>
        }
      />

      <div
        style={{
          padding: '10px 16px 0',
          background: 'var(--m-card)',
          borderBottom: '1px solid var(--m-border)',
        }}
      >
        <div className="m-seg">
          <button type="button" className={view === 'day' ? 'on' : ''} onClick={() => setView('day')}>오늘</button>
          <button type="button" className={view === 'week' ? 'on' : ''} onClick={() => setView('week')}>이번 주</button>
          <button type="button" className={view === 'all' ? 'on' : ''} onClick={() => setView('all')}>전체</button>
        </div>
      </div>

      <div className="m-scroll">
        {loading && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
            불러오는 중…
          </div>
        )}
        {view === 'day' && !loading && (
          <>
            <div className="m-section">
              <div className="m-section-h">
                <div className="lbl">공통 인계 {generalToday.length}건</div>
              </div>
              {generalToday.length === 0 && (
                <div
                  style={{
                    margin: '4px 16px',
                    padding: '16px',
                    textAlign: 'center',
                    color: 'var(--z-500)',
                    fontSize: 12,
                    background: 'var(--m-card)',
                    borderRadius: 'var(--m-radius-lg)',
                    border: '1px solid var(--m-border)',
                  }}
                >
                  오늘 공통 인계가 없습니다.
                </div>
              )}
              {generalToday.map((n) => (
                <div
                  key={n.id}
                  className="m-card"
                  style={{ margin: '8px 16px', padding: '14px 16px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <MChip tone={n.priority === 'High' ? 'danger' : 'accent'}>{n.shift}</MChip>
                    {n.priority === 'High' && <MChip tone="danger">긴급</MChip>}
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
                      {n.created_at.slice(11, 16)}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.012em' }}>
                    {n.title}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--z-500)',
                      fontWeight: 600,
                      marginTop: 6,
                    }}
                  >
                    {n.author} {n.is_completed ? '· 확인 완료' : ''}
                  </div>
                </div>
              ))}
            </div>

            {patientToday.length > 0 && (
              <div className="m-section">
                <div className="m-section-h">
                  <div className="lbl">환자별 인계 {patientToday.length}건</div>
                </div>
                <div className="m-card flush" style={{ margin: '0 16px' }}>
                  {patientToday.map((n) => (
                    <MListRow
                      key={n.id}
                      icon="users"
                      label={`${n.patient_name ?? '환자 미지정'} · ${n.room_number ?? '-'}`}
                      sub={`${n.author} · ${n.shift}`}
                      val={n.is_completed ? '확인' : '대기'}
                    />
                  ))}
                </div>
              </div>
            )}
            <div style={{ height: 24 }} />
          </>
        )}

        {view === 'week' && !loading && (
          <div style={{ padding: '14px 16px 0' }}>
            <div className="m-card flush">
              {weekly.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--z-500)', fontSize: 12 }}>
                  최근 7일 인계가 없습니다.
                </div>
              )}
              {weekly.map(([day, count]) => (
                <MListRow
                  key={day}
                  icon="calendar"
                  label={day}
                  sub={`${count}건 인계`}
                  val={count}
                />
              ))}
            </div>
          </div>
        )}

        {view === 'all' && !loading && (
          <div style={{ padding: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map((n) => (
              <div key={n.id} className="m-card" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <MChip tone={n.scope === 'patient' ? 'accent' : ''}>{n.scope === 'patient' ? '환자별' : '공통'}</MChip>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
                    {n.created_at.slice(0, 16).replace('T', ' ')}
                  </span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{n.title}</div>
                {n.body && (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--z-700)',
                      marginTop: 6,
                      lineHeight: 1.55,
                    }}
                  >
                    {n.body}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
