'use client';

/**
 * MRI 일정 — board_posts(board_type='MRI일정') 읽기 전용.
 * useMriSchedules. 핸드오프 m-screens-addon-details §AD5 (SMri) 이식.
 * JM: ~150줄.
 */

import { useMemo, useState } from 'react';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import { useMriSchedules, todayISO } from './data-hooks';

type Tab = 'today' | 'week' | 'read';

function statusTone(s: string): '' | 'success' | 'warning' | 'accent' {
  if (s === '완료') return 'success';
  if (s === '판독 대기' || s === '판독대기') return 'warning';
  if (s === '촬영중') return 'accent';
  return '';
}

export default function MRI일정({ user, onBack }: { user: ErpUser; onBack: () => void }) {
  const company = typeof user.company === 'string' ? user.company : undefined;
  const today = todayISO();
  const { rows, loading } = useMriSchedules({ company });
  const [tab, setTab] = useState<Tab>('today');

  const todayRows = useMemo(() => rows.filter((r) => r.date === today), [rows, today]);
  const live = todayRows.find((r) => r.status === '촬영중');
  const readQueue = useMemo(() => rows.filter((r) => r.status === '판독 대기' || r.status === '판독대기'), [rows]);

  const weekly = useMemo(() => {
    const map = new Map<string, number>();
    const today0 = Date.parse(today);
    for (const r of rows) {
      const ts = Date.parse(r.date);
      if (!Number.isFinite(ts)) continue;
      if (ts - today0 < -7 * 86400000 || ts - today0 > 7 * 86400000) continue;
      map.set(r.date, (map.get(r.date) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, today]);

  return (
    <div className="m-screen">
      <MobileHeader title="MRI 일정" sub={`${today} · 영상의학팀`} back={onBack} />

      <div
        style={{
          padding: '10px 16px 0',
          background: 'var(--m-card)',
          borderBottom: '1px solid var(--m-border)' }}
      >
        <div className="m-seg">
          <button type="button" className={tab === 'today' ? 'on' : ''} onClick={() => setTab('today')}>
            오늘 {todayRows.length}
          </button>
          <button type="button" className={tab === 'week' ? 'on' : ''} onClick={() => setTab('week')}>이번주</button>
          <button type="button" className={tab === 'read' ? 'on' : ''} onClick={() => setTab('read')}>
            판독 대기 {readQueue.length}
          </button>
        </div>
      </div>

      <div className="m-scroll">
        {loading && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
            불러오는 중…
          </div>
        )}
        {tab === 'today' && !loading && (
          <div style={{ padding: '14px 16px 0' }}>
            {live && (
              <div
                className="m-card"
                style={{
                  padding: '14px 14px',
                  marginBottom: 12,
                  background: 'var(--m-accent)',
                  borderColor: 'transparent',
                  color: '#fff' }}
              >
                <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 800, letterSpacing: '0.04em' }}>
                  현재 촬영중
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>
                  {live.patient} · {live.exam}
                </div>
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 8 }}>{live.time} 시작</div>
              </div>
            )}
            <div className="m-card flush">
              {todayRows.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 12 }}>
                  오늘 예약된 MRI가 없습니다.
                </div>
              )}
              {todayRows.map((m) => (
                <div
                  key={m.id}
                  style={{
                    padding: '14px 16px',
                    borderBottom: '1px solid var(--m-border)',
                    display: 'grid',
                    gridTemplateColumns: '52px 1fr auto',
                    gap: 12,
                    alignItems: 'center' }}
                >
                  <div className="m-tnum" style={{ fontSize: 14, fontWeight: 800, color: 'var(--z-700)' }}>
                    {m.time}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{m.patient}</div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--z-500)',
                        fontWeight: 600,
                        marginTop: 1 }}
                    >
                      {m.exam} · {m.department}
                    </div>
                  </div>
                  <MChip tone={statusTone(m.status)}>{m.status}</MChip>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'week' && (
          <div style={{ padding: '14px 16px 0' }}>
            <div className="m-card flush">
              {weekly.map(([day, count]) => (
                <div key={day} className="m-list-row">
                  <div className="ico-tile tone-accent">
                    <MIcon name="calendar" size={18} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="lbl">{day}</div>
                    <div className="sub">예약 {count}건</div>
                  </div>
                  <span className="val m-tnum">{count}</span>
                </div>
              ))}
              {weekly.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 12 }}>
                  주간 예약 없음
                </div>
              )}
            </div>
          </div>
        )}
        {tab === 'read' && (
          <div style={{ padding: '14px 16px 0' }}>
            <div className="m-card flush">
              {readQueue.map((r) => (
                <div key={r.id} className="m-list-row">
                  <div className="ico-tile tone-warning">
                    <MIcon name="fileText" size={18} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="lbl">{r.patient}</div>
                    <div className="sub">
                      {r.exam} · {r.date}
                    </div>
                  </div>
                </div>
              ))}
              {readQueue.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 12 }}>
                  판독 대기 항목이 없습니다.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
