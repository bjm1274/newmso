'use client';

/**
 * 급여명세 — 급여명세 서브스크린.
 *   - Hero (다크 그라데이션): 실수령액 강조
 *   - 지급 내역 카드 (기본급/직책수당/식대/야간수당)
 *   - 공제 내역 카드 (국민연금/건강보험/소득세/주민세, 적색)
 *   - PDF 다운로드 버튼
 * JM: 단일 책임 (급여명세 표시)
 * JM4: any 금지
 * JM6: button 시맨틱, aria-label
 */

import { memo } from 'react';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import { useMyLatestPayroll } from './data-hooks';

const won = (n: number) => n.toLocaleString('ko-KR');

function formatYearMonth(ym: string): string {
  const m = /^(\d{4})-?(\d{2})/.exec(ym);
  if (m) return `${m[1]}년 ${Number(m[2])}월 급여명세`;
  return ym ? `${ym} 급여명세` : '급여명세';
}

export type 급여명세Props = {
  user: ErpUser;
  onBack: () => void;
};

function 급여명세Base({ user, onBack }: 급여명세Props) {
  const staffId = typeof user?.id === 'string' ? user.id : null;
  const { yearMonth, netPay, payItems, deductItems, payTotal, deductTotal, loading, found } = useMyLatestPayroll(staffId);

  if (!loading && !found) {
    return (
      <div className="m-screen">
        <MobileHeader title="급여명세" back={onBack} />
        <div className="m-scroll" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
          <div style={{ textAlign: 'center', color: 'var(--z-400)', fontSize: 14, fontWeight: 600 }}>
            발행된 급여명세가 없습니다.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="m-screen">
      <MobileHeader title="급여명세" back={onBack} />
      <div className="m-scroll" style={{ paddingBottom: 24 }}>
        {/* Hero — 실수령액 */}
        <div
          className="msm-hero"
          style={{
            margin: '16px 16px 0',
            padding: '28px 24px',
            borderRadius: 20,
            background: 'linear-gradient(135deg, #1E293B, #0F172A)',
            color: '#fff',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.7 }}>
            {formatYearMonth(yearMonth)}
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.5, marginTop: 6 }}>
            실수령액
          </div>
          <div
            className="m-tnum"
            style={{
              fontSize: 36,
              fontWeight: 800,
              letterSpacing: '-0.03em',
              marginTop: 4,
            }}
          >
            {loading ? '—' : won(netPay)}
            <span style={{ fontSize: 18, fontWeight: 700 }}>원</span>
          </div>
        </div>

        {/* 지급 내역 */}
        <div className="m-section" style={{ marginTop: 8 }}>
          <div className="m-section-h">
            <div className="lbl">지급 내역</div>
          </div>
          <div className="m-card flush">
            {payItems.map((item) => (
              <div
                key={item.label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '13px 16px',
                  borderBottom: '1px solid var(--m-border)',
                  fontSize: 14,
                }}
              >
                <span style={{ fontWeight: 600, color: 'var(--z-600)' }}>{item.label}</span>
                <span className="m-tnum" style={{ fontWeight: 700 }}>
                  {won(item.amount)}원
                </span>
              </div>
            ))}
            {/* 합계 */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '13px 16px',
                fontSize: 14,
                background: 'var(--z-50)',
              }}
            >
              <span style={{ fontWeight: 800 }}>지급 합계</span>
              <span className="m-tnum" style={{ fontWeight: 800, color: 'var(--m-accent)' }}>
                {won(payTotal)}원
              </span>
            </div>
          </div>
        </div>

        {/* 공제 내역 */}
        <div className="m-section">
          <div className="m-section-h">
            <div className="lbl">공제 내역</div>
          </div>
          <div className="m-card flush">
            {deductItems.map((item) => (
              <div
                key={item.label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '13px 16px',
                  borderBottom: '1px solid var(--m-border)',
                  fontSize: 14,
                }}
              >
                <span style={{ fontWeight: 600, color: 'var(--z-600)' }}>{item.label}</span>
                <span className="m-tnum" style={{ fontWeight: 700, color: 'var(--m-danger)' }}>
                  -{won(item.amount)}원
                </span>
              </div>
            ))}
            {/* 합계 */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '13px 16px',
                fontSize: 14,
                background: 'var(--z-50)',
              }}
            >
              <span style={{ fontWeight: 800 }}>공제 합계</span>
              <span className="m-tnum" style={{ fontWeight: 800, color: 'var(--m-danger)' }}>
                -{won(deductTotal)}원
              </span>
            </div>
          </div>
        </div>

        {/* PDF 다운로드 */}
        <div style={{ padding: '18px 16px 4px' }}>
          <button
            type="button"
            className="msm-btn-lg"
            aria-label="PDF 다운로드"
            style={{
              width: '100%',
              height: 52,
              borderRadius: 14,
              background: 'var(--m-card)',
              color: 'var(--z-900)',
              fontSize: 15,
              fontWeight: 700,
              border: '1px solid var(--m-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <MIcon name="download" size={18} />
            PDF 다운로드
          </button>
        </div>
      </div>
    </div>
  );
}

const 급여명세 = memo(급여명세Base);
export default 급여명세;
