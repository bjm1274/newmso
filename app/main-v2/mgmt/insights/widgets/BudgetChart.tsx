'use client';

/**
 * BudgetChart.tsx — 예산 집행률 + 항목별 예산
 * JM6: figure/figcaption, 색상+텍스트 병기
 * JM2: useMemo
 */

import { useMemo } from 'react';
import { BUDGET_ITEMS, BUDGET_TOTAL, BUDGET_USED } from '../dummy-data';

export function BudgetChart() {
  const usedPct = useMemo(() => Math.round((BUDGET_USED / BUDGET_TOTAL) * 1000) / 10, []);
  const remaining = useMemo(() => BUDGET_TOTAL - BUDGET_USED, []);

  const maxAmount = useMemo(() => Math.max(...BUDGET_ITEMS.map((b) => b.amount)), []);

  const budgetAriaLabel = useMemo(
    () =>
      '항목별 예산: ' + BUDGET_ITEMS.map((b) => `${b.label} ${b.amount}M`).join(', '),
    []
  );

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
      {/* 예산 집행률 */}
      <div className="app-card p-5">
        <h3 className="mb-4 text-sm font-semibold text-[var(--foreground)]">예산 집행률</h3>
        <figure aria-label={`예산 총액 ${BUDGET_TOTAL}M, 집행 ${BUDGET_USED}M, 집행률 ${usedPct}%, 잔액 ${remaining}M`}>
          <div className="flex items-center gap-6">
            {/* 집행률 막대 */}
            <div
              className="flex h-32 flex-1 items-end"
              role="img"
              aria-label={`집행률 ${usedPct}%`}
            >
              <div className="relative flex w-full flex-col items-center" style={{ height: '100%', justifyContent: 'flex-end' }}>
                <span
                  className="absolute -top-5 text-[10px] font-semibold text-[var(--foreground)]"
                  aria-hidden="true"
                >
                  {usedPct}%
                </span>
                <div
                  className="w-full rounded-t-[var(--radius-md)]"
                  style={{ height: `${usedPct}%`, backgroundColor: 'var(--success)' }}
                />
              </div>
            </div>
            {/* 수치 요약 */}
            <div className="flex flex-col gap-2 text-xs">
              <div>
                <span className="text-[var(--toss-gray-4)]">예산</span>
                <span className="ml-2 font-semibold">₩{BUDGET_TOTAL}M</span>
              </div>
              <div>
                <span className="text-[var(--toss-gray-4)]">집행</span>
                <span className="ml-2 font-semibold">₩{BUDGET_USED}M</span>
              </div>
              <div>
                <span className="text-[var(--toss-gray-4)]">잔액</span>
                <span className="ml-2 font-semibold">₩{remaining}M</span>
              </div>
            </div>
          </div>
          <figcaption className="mt-5 text-[11px] text-[var(--toss-gray-4)]">
            연간 예산 집행 현황
          </figcaption>
        </figure>
      </div>

      {/* 항목별 예산 */}
      <div className="app-card p-5">
        <h3 className="mb-4 text-sm font-semibold text-[var(--foreground)]">항목별 예산 편성</h3>
        <figure aria-label={budgetAriaLabel}>
          <div
            className="flex items-end gap-2"
            style={{ height: '128px' }}
            role="img"
            aria-label={budgetAriaLabel}
          >
            {BUDGET_ITEMS.map((b) => {
              const heightPct = (b.amount / maxAmount) * 100;
              return (
                <div
                  key={b.label}
                  className="relative flex flex-1 flex-col items-center"
                  style={{ height: '100%', justifyContent: 'flex-end' }}
                >
                  <span
                    className="absolute -top-5 text-[10px] font-semibold text-[var(--foreground)]"
                    aria-hidden="true"
                  >
                    {b.amount}M
                  </span>
                  <div
                    className="w-full rounded-t-[var(--radius-md)] bg-[var(--accent)]"
                    style={{ height: `${heightPct}%`, minHeight: '4px' }}
                  />
                  <span className="mt-1 text-[10px] text-[var(--toss-gray-4)]" aria-hidden="true">
                    {b.label}
                  </span>
                </div>
              );
            })}
          </div>
          <figcaption className="mt-8 text-[11px] text-[var(--toss-gray-4)]">
            주요 항목별 예산 편성액 (단위: 백만원)
          </figcaption>
        </figure>

        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-[var(--accent)] hover:underline focus-visible:outline-2">
            데이터 표로 보기
          </summary>
          <table className="mt-2 w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                <th scope="col" className="py-1 text-left font-semibold">항목</th>
                <th scope="col" className="py-1 text-right font-semibold">금액(M)</th>
              </tr>
            </thead>
            <tbody>
              {BUDGET_ITEMS.map((b) => (
                <tr key={b.label} className="border-b border-[var(--border)]">
                  <td className="py-1">{b.label}</td>
                  <td className="py-1 text-right">₩{b.amount}M</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </div>
  );
}
