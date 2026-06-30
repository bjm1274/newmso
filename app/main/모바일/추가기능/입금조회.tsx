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
    <div className="m-screen" style={{ background: 'linear-gradient(135deg, rgba(238, 242, 255, 0.4) 0%, rgba(253, 244, 245, 0.4) 50%, rgba(240, 253, 244, 0.4) 100%)' }}>
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
          className="macos-glass macos-squircle-sm"
          style={{
            padding: '12px 14px',
            background: 'rgba(245, 158, 11, 0.08)',
            borderColor: 'rgba(245, 158, 11, 0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            boxShadow: '0 4px 16px 0 rgba(245, 158, 11, 0.04)' }}
        >
          <MIcon name="alertTri" size={18} color="rgba(217, 119, 6, 0.85)" />
          <div
            style={{
              flex: 1,
              fontSize: 12,
              fontWeight: 700,
              color: 'rgba(217, 119, 6, 0.95)' }}
          >
            Chart 시스템으로 이관 예정 — 2026 Q4
          </div>
        </div>
      </div>

      <div className="m-scroll" style={{ background: 'transparent' }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
            불러오는 중…
          </div>
        ) : (
          <>
            <div style={{ padding: '24px 16px 14px', textAlign: 'center' }}>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--z-500)',
                  fontWeight: 800,
                  letterSpacing: '0.08em' }}
              >
                오늘 입금 합계
              </div>
              <div
                className="m-tnum"
                style={{
                  fontSize: 38,
                  fontWeight: 800,
                  color: '#007aff',
                  letterSpacing: '-0.035em',
                  marginTop: 6 }}
              >
                ₩ {fmt(total)}
              </div>
              <div style={{ fontSize: 13, color: '#34c759', fontWeight: 800, marginTop: 4 }}>
                {rows.length}건
              </div>
            </div>

            <div className="m-section">
              <div className="m-section-h" style={{ margin: '0 16px 8px' }}>
                <div className="lbl" style={{ fontWeight: 700, fontSize: 13 }}>시간대별 입금</div>
              </div>
              <div className="macos-glass macos-squircle" style={{ padding: '16px', margin: '0 16px', boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
                  {hourly.map((h, i) => (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        height: `${Math.max(2, h.pct)}%`,
                        background: h.pct > 0 ? 'linear-gradient(to top, rgba(0, 122, 255, 0.85), rgba(0, 122, 255, 0.55))' : 'rgba(0, 122, 255, 0.1)',
                        borderRadius: '6px 6px 2px 2px',
                        boxShadow: h.pct > 0 ? '0 2px 6px rgba(0, 122, 255, 0.2)' : 'none' }}
                    />
                  ))}
                </div>
                <div
                  style={{
                    display: 'flex',
                    marginTop: 8,
                    fontSize: 10,
                    color: 'var(--z-500)',
                    fontWeight: 600 }}
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
              <div className="m-section-h" style={{ margin: '16px 16px 8px' }}>
                <div className="lbl" style={{ fontWeight: 700, fontSize: 13 }}>최근 입금 {Math.min(rows.length, 20)}건</div>
              </div>
              <div className="macos-glass macos-squircle" style={{ margin: '0 16px', overflow: 'hidden', boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.04)' }}>
                {rows.slice(0, 20).map((r, idx) => (
                  <div
                    key={r.id}
                    className="m-list-row"
                    style={{
                      borderBottom: idx === rows.slice(0, 20).length - 1 ? 'none' : '1px solid rgba(0, 0, 0, 0.04)',
                      background: 'transparent',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                      <div
                        className="m-tnum"
                        style={{ width: 36, fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}
                      >
                        {timeOnly(r.time)}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="lbl" style={{ fontWeight: 600, fontSize: 14 }}>{r.patient}</div>
                        <div className="sub" style={{ fontSize: 11, color: 'var(--z-500)', marginTop: 2 }}>{r.method}</div>
                      </div>
                    </div>
                    <div className="val m-tnum" style={{ fontWeight: 700, fontSize: 15, color: 'var(--foreground)' }}>
                      {fmt(r.amount)}<span className="u" style={{ fontSize: 12, fontWeight: 500, marginLeft: 2 }}>원</span>
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
