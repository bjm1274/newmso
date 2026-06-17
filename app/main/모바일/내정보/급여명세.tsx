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
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import { useMyLatestPayroll, useMyPayrollTrend } from './data-hooks';

const won = (n: number) => n.toLocaleString('ko-KR');

/** 만원 단위 Y축 라벨 — 모바일 폭에서 자릿수 절약 */
const manwon = (n: number) => `${Math.round(n / 10000)}만`;

/** recharts Tooltip content props — 버전 간 타입 차이를 피하려 사용 필드만 최소 정의 */
type TrendTooltipProps = {
  active?: boolean;
  payload?: Array<{ value?: number | string; payload?: { yearMonth?: string } }>;
};

function TrendTooltip({ active, payload }: TrendTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0];
  const value = typeof point.value === 'number' ? point.value : Number(point.value ?? 0);
  const label = point.payload?.yearMonth || '';
  return (
    <div
      style={{
        background: 'var(--m-card)',
        border: '1px solid var(--m-border)',
        borderRadius: 10,
        padding: '8px 12px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--z-500)' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--m-accent)' }}>
        {won(value)}원
      </div>
    </div>
  );
}

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
  const { points: trendPoints, loading: trendLoading } = useMyPayrollTrend(staffId, 6);

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

        {/* 실지급 추이 — 최근 6개월 net_pay 라인 차트 */}
        {!trendLoading && trendPoints.length >= 2 && (
          <div className="m-section" style={{ marginTop: 8 }}>
            <div className="m-section-h">
              <div className="lbl">실지급 추이</div>
            </div>
            <div className="m-card" style={{ padding: '14px 8px 10px' }}>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={trendPoints} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--m-border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: 'var(--z-500)' }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--m-border)' }}
                  />
                  <YAxis
                    width={40}
                    tickFormatter={manwon}
                    tick={{ fontSize: 10, fill: 'var(--z-400)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<TrendTooltip />} cursor={{ stroke: 'var(--m-border)' }} />
                  <Line
                    type="monotone"
                    dataKey="netPay"
                    stroke="var(--m-accent)"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: 'var(--m-accent)' }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

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
