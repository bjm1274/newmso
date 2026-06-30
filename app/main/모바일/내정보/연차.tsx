'use client';

/**
 * 연차 — 연차 잔여/신청/사용 내역 서브스크린.
 *   - Hero (녹색 그라데이션): 잔여 연차 + 소진율
 *   - 연차 신청 버튼
 *   - 사용 내역 리스트
 * JM: 단일 책임 (연차 정보 표시)
 * JM4: any 금지
 * JM6: button 시맨틱, aria-label
 */

import { memo } from 'react';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import { useMyLeave, type MyLeaveHistory } from './data-hooks';

const STATUS_STYLE: Record<MyLeaveHistory['status'], { bg: string; color: string }> = {
  '승인': { bg: 'var(--m-success-soft)', color: 'var(--m-success)' },
  '대기': { bg: 'var(--m-warning-soft)', color: 'var(--m-warning)' },
  '반려': { bg: 'var(--m-danger-soft)', color: 'var(--m-danger)' } };

export type 연차Props = {
  user: ErpUser;
  onBack: () => void;
};

function MobileLeaveBase({ user, onBack }: 연차Props) {
  const staffId = typeof user?.id === 'string' ? user.id : null;
  const { remaining, total, used, usageRate, history, loading } = useMyLeave(staffId);
  const currentYear = new Date().getFullYear();
  return (
    <div className="m-screen">
      <MobileHeader title="연차" back={onBack} />
      <div className="m-scroll" style={{ paddingBottom: 24 }}>
        {/* Hero — 잔여 연차 */}
        <div
          className="msm-hero"
          style={{
            margin: '16px 16px 0',
            padding: '28px 24px',
            borderRadius: 20,
            background: 'var(--page-bg)',
            border: '1px solid var(--border)',
            color: 'var(--foreground)',
            textAlign: 'center' }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--z-500)' }}>
            {currentYear}년 잔여 연차
          </div>
          <div
            style={{
              fontSize: 40,
              fontWeight: 800,
              letterSpacing: '-0.04em',
              marginTop: 8,
              fontFeatureSettings: '"tnum"',
              color: 'var(--m-accent)' }}
          >
            {loading ? '—' : remaining}{' '}
            <span style={{ fontSize: 20, color: 'var(--z-500)', fontWeight: 600 }}>/ {total}일</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--z-600)', marginTop: 6 }}>
            사용 {used}일 · 소진율 {usageRate}%
          </div>
        </div>

        {/* 연차 신청 버튼 */}
        <div style={{ padding: '16px 16px 0' }}>
          <button
            type="button"
            className="msm-btn-lg accent"
            aria-label="연차 신청"
            style={{
              width: '100%',
              height: 52,
              borderRadius: 14,
              background: 'var(--m-accent)',
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              border: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8 }}
          >
            <MIcon name="plus" size={18} />
            연차 신청
          </button>
        </div>

        {/* 사용 내역 */}
        <div className="m-section" style={{ marginTop: 8 }}>
          <div className="m-section-h">
            <div className="lbl">사용 내역</div>
          </div>
          <div className="msm-list m-card flush" style={{ overflow: 'hidden' }}>
            {!loading && history.length === 0 && (
              <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--z-400)', fontSize: 13, fontWeight: 600 }}>
                연차 사용 내역이 없습니다.
              </div>
            )}
            {history.map((h) => {
              const st = STATUS_STYLE[h.status];
              return (
                <div
                  key={h.id}
                  className="msm-row"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '40px 1fr auto',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 16px',
                    borderBottom: '1px solid var(--border)' }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      color: 'var(--m-accent)',
                      display: 'grid',
                      placeItems: 'center' }}
                  >
                    <MIcon name="calendar" size={18} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.012em' }}>
                      {h.type} · {h.days}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 500, marginTop: 2 }}>
                      {h.date}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 999,
                      background: st.bg,
                      color: st.color }}
                  >
                    {h.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const 연차 = memo(MobileLeaveBase);
export default 연차;
