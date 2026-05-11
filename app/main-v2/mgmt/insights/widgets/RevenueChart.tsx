'use client';

/**
 * RevenueChart.tsx — 월별 매출 막대 차트 + 이익률 라인 차트
 * JM2: useMemo로 차트 데이터 계산
 * JM6: figure/figcaption, aria-label, 시각적 숨김 대체 테이블
 */

import { useMemo } from 'react';
import { MONTHLY_REVENUE } from '../dummy-data';

function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        position: 'absolute',
        width: '1px',
        height: '1px',
        padding: 0,
        margin: '-1px',
        overflow: 'hidden',
        clip: 'rect(0,0,0,0)',
        whiteSpace: 'nowrap',
        border: 0,
      }}
    >
      {children}
    </span>
  );
}

export function RevenueChart() {
  const maxRevenue = useMemo(
    () => Math.max(...MONTHLY_REVENUE.map((d) => d.revenue)),
    []
  );

  const revenueAriaLabel = useMemo(
    () =>
      '월별 매출: ' +
      MONTHLY_REVENUE.map((d) => `${d.month} ${d.revenue}M`).join(', '),
    []
  );

  const maxProfitRate = useMemo(
    () => Math.max(...MONTHLY_REVENUE.map((d) => d.profitRate)),
    []
  );

  const profitAriaLabel = useMemo(
    () =>
      '이익률 추이: ' +
      MONTHLY_REVENUE.map((d) => `${d.month} ${d.profitRate}%`).join(', '),
    []
  );

  // SVG 라인 차트 포인트 계산
  const svgPoints = useMemo(() => {
    const w = 400;
    const h = 160;
    const padX = 20;
    const padY = 16;
    const count = MONTHLY_REVENUE.length;
    return MONTHLY_REVENUE.map((d, i) => {
      const x = padX + (i / (count - 1)) * (w - padX * 2);
      const y = padY + (1 - d.profitRate / (maxProfitRate * 1.2)) * (h - padY * 2);
      return { x, y, ...d };
    });
  }, [maxProfitRate]);

  const polylinePoints = useMemo(
    () => svgPoints.map((p) => `${p.x},${p.y}`).join(' '),
    [svgPoints]
  );

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
      {/* 월별 매출 막대 차트 */}
      <div className="app-card p-5">
        <h3 className="mb-4 text-sm font-semibold text-[var(--foreground)]">월별 매출 현황</h3>
        <figure aria-label={revenueAriaLabel}>
          <div
            className="flex items-end gap-1.5"
            style={{ height: '160px' }}
            role="img"
            aria-label={revenueAriaLabel}
          >
            {MONTHLY_REVENUE.map((d) => {
              const heightPct = (d.revenue / maxRevenue) * 100;
              return (
                <div
                  key={d.month}
                  className="relative flex flex-1 flex-col items-center"
                  style={{ height: '100%', justifyContent: 'flex-end' }}
                >
                  <span
                    className="absolute -top-5 text-[10px] font-semibold text-[var(--foreground)]"
                    aria-hidden="true"
                  >
                    {d.revenue}M
                  </span>
                  <div
                    className="w-full rounded-t-[var(--radius-md)] bg-[var(--accent)]"
                    style={{ height: `${heightPct}%`, minHeight: '4px' }}
                  />
                  <span className="mt-1 text-[10px] text-[var(--toss-gray-4)]" aria-hidden="true">
                    {d.month}
                  </span>
                </div>
              );
            })}
          </div>
          <figcaption className="mt-8 text-[11px] text-[var(--toss-gray-4)]">
            12개월 월별 매출 합계 (단위: 백만원)
          </figcaption>
        </figure>

        {/* 스크린리더 대체 테이블 */}
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-[var(--accent)] hover:underline focus-visible:outline-2">
            데이터 표로 보기
          </summary>
          <table className="mt-2 w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                <th scope="col" className="py-1 text-left font-semibold">월</th>
                <th scope="col" className="py-1 text-right font-semibold">매출(M)</th>
              </tr>
            </thead>
            <tbody>
              {MONTHLY_REVENUE.map((d) => (
                <tr key={d.month} className="border-b border-[var(--border)]">
                  <td className="py-1">{d.month}</td>
                  <td className="py-1 text-right">₩{d.revenue}M</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>

      {/* 이익률 라인 차트 */}
      <div className="app-card p-5">
        <h3 className="mb-4 text-sm font-semibold text-[var(--foreground)]">이익률 추이</h3>
        <figure aria-label={profitAriaLabel}>
          <svg
            width="100%"
            viewBox="0 0 400 176"
            role="img"
            aria-label={profitAriaLabel}
            className="overflow-visible"
          >
            <VisuallyHidden>{profitAriaLabel}</VisuallyHidden>
            {/* 축 */}
            <line x1="20" y1="8" x2="20" y2="160" stroke="var(--border)" strokeWidth="2" />
            <line x1="20" y1="160" x2="390" y2="160" stroke="var(--border)" strokeWidth="2" />
            {/* 라인 */}
            <polyline
              points={polylinePoints}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            {/* 포인트 */}
            {svgPoints.map((p) => (
              <g key={p.month}>
                <circle cx={p.x} cy={p.y} r={4} fill="var(--accent)" />
                <circle cx={p.x} cy={p.y} r={7} fill="none" stroke="var(--accent)" strokeOpacity="0.3" />
                <text
                  x={p.x}
                  y={p.y - 10}
                  textAnchor="middle"
                  fontSize="9"
                  fill="var(--foreground)"
                >
                  {p.profitRate}%
                </text>
              </g>
            ))}
            {/* X축 레이블 */}
            {svgPoints.map((p) => (
              <text
                key={`label-${p.month}`}
                x={p.x}
                y={175}
                textAnchor="middle"
                fontSize="9"
                fill="var(--toss-gray-4, #9ca3af)"
              >
                {p.month}
              </text>
            ))}
          </svg>
          <figcaption className="mt-1 text-[11px] text-[var(--toss-gray-4)]">
            월별 이익률(%) 추이
          </figcaption>
        </figure>

        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-[var(--accent)] hover:underline focus-visible:outline-2">
            데이터 표로 보기
          </summary>
          <table className="mt-2 w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                <th scope="col" className="py-1 text-left font-semibold">월</th>
                <th scope="col" className="py-1 text-right font-semibold">이익률</th>
              </tr>
            </thead>
            <tbody>
              {MONTHLY_REVENUE.map((d) => (
                <tr key={d.month} className="border-b border-[var(--border)]">
                  <td className="py-1">{d.month}</td>
                  <td className="py-1 text-right">{d.profitRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </div>
  );
}
