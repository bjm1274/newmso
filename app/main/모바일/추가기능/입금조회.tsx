'use client';

/**
 * 입금 실시간조회 — useDeposits (virtual_account_deposits 테이블).
 * 핸드오프 m-screens-addon-modules §7 (SAddonDeposit) 이식.
 * JM: ~150줄.
 */

import { useMemo } from 'react';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import { useDeposits } from './data-hooks';

function fmt(n: number): string {
  return new Intl.NumberFormat('ko-KR').format(n);
}

function timeOnly(value: string): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(11, 16);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function 입금조회({ user, onBack }: { user: ErpUser; onBack: () => void }) {
  const company = typeof user.company === 'string' ? user.company : undefined;
  const { rows, loading, total } = useDeposits({ company });

  const hourly = useMemo(() => {
    const buckets = new Array(12).fill(0) as number[];
    for (const r of rows) {
      const d = new Date(r.time);
      if (Number.isNaN(d.getTime())) continue;
      const hour = d.getHours();
      if (hour >= 9 && hour <= 20) buckets[hour - 9] += r.amount;
    }
    const max = Math.max(...buckets, 1);
    return buckets.map((v) => ({ value: v, pct: Math.round((v / max) * 100) }));
  }, [rows]);

  return (
    <div className="m-screen">
      <MobileHeader
        title="입금 실시간조회"
        sub="가상계좌 · 카드 · 현금"
        back={onBack}
        actions={
          <button type="button" aria-label="새로고침">
            <MIcon name="refresh" size={20} />
          </button>
        }
      />

      <div style={{ padding: '12px 16px 0' }}>
        <div
          className="m-card"
          style={{
            padding: '12px 14px',
            background: 'var(--m-warning-soft)',
            borderColor: 'transparent',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <MIcon name="alertTri" size={18} color="var(--m-warning)" />
          <div
            style={{
              flex: 1,
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--m-warning)',
            }}
          >
            Chart 시스템으로 이관 예정 — 2026 Q4
          </div>
        </div>
      </div>

      <div className="m-scroll">
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
            불러오는 중…
          </div>
        ) : (
          <>
            <div style={{ padding: '14px 16px 0', textAlign: 'center' }}>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--z-500)',
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                }}
              >
                오늘 입금 합계
              </div>
              <div
                className="m-tnum"
                style={{
                  fontSize: 36,
                  fontWeight: 800,
                  color: 'var(--m-accent)',
                  letterSpacing: '-0.035em',
                  marginTop: 4,
                }}
              >
                ₩ {fmt(total)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--m-success)', fontWeight: 800, marginTop: 4 }}>
                {rows.length}건
              </div>
            </div>

            <div className="m-section">
              <div className="m-section-h">
                <div className="lbl">시간대별 입금</div>
              </div>
              <div className="m-card" style={{ padding: '14px 14px', margin: '0 16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
                  {hourly.map((h, i) => (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        height: `${Math.max(2, h.pct)}%`,
                        background: h.pct > 0 ? 'var(--m-accent)' : 'var(--m-accent-soft)',
                        borderRadius: '4px 4px 2px 2px',
                      }}
                    />
                  ))}
                </div>
                <div
                  style={{
                    display: 'flex',
                    marginTop: 6,
                    fontSize: 10,
                    color: 'var(--z-500)',
                    fontWeight: 600,
                  }}
                >
                  {['09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'].map((m) => (
                    <div key={m} style={{ flex: 1, textAlign: 'center' }}>
                      {m}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="m-section">
              <div className="m-section-h">
                <div className="lbl">최근 입금 {Math.min(rows.length, 20)}건</div>
              </div>
              <div className="m-card flush" style={{ margin: '0 16px' }}>
                {rows.slice(0, 20).map((r) => (
                  <div key={r.id} className="m-list-row">
                    <div
                      className="m-tnum"
                      style={{ width: 40, fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}
                    >
                      {timeOnly(r.time)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="lbl">{r.patient}</div>
                      <div className="sub">{r.method}</div>
                    </div>
                    <div className="val m-tnum">
                      {fmt(r.amount)}<span className="u">원</span>
                    </div>
                  </div>
                ))}
                {rows.length === 0 && (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 12 }}>
                    오늘 등록된 입금이 없습니다.
                  </div>
                )}
              </div>
            </div>

            <div style={{ height: 24 }} />
          </>
        )}
      </div>
    </div>
  );
}
