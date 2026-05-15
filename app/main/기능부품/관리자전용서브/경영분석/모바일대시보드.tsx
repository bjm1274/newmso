'use client';

import { useMemo, type ReactNode } from 'react';
import { MenuIcon } from '../../조직도서브/조직도측면창';
import {
  SwipeableKpiCards,
  type KpiCard,
} from '@/app/components/SwipeableKpiCards';
import { MobileChartWrapper } from '@/app/components/MobileChartWrapper';

export type 경영분석모바일대시보드Props = {
  stats: Array<{
    label: string;
    value: ReactNode;
    detail: string;
    icon: string;
    trend?: 'up' | 'down' | 'flat';
  }>;
  notices: Array<{
    label: string;
    detail: string;
    icon: string;
    tone: string;
  }>;
  quickLinks: Array<{
    label: string;
    icon: string;
  }>;
  leaveUsageRate: number;
};

/**
 * 경영 분석 모바일 대시보드.
 * - KPI: SwipeableKpiCards
 * - 차트(연차 사용률): MobileChartWrapper
 * - 데스크탑 컴포넌트와 동일한 입력 데이터를 받아 모바일 레이아웃으로 렌더링한다.
 */
export default function 경영분석모바일대시보드({
  stats,
  notices,
  quickLinks,
  leaveUsageRate,
}: 경영분석모바일대시보드Props) {
  const kpiCards = useMemo<KpiCard[]>(
    () =>
      stats.map((s, idx) => ({
        id: `${idx}-${s.label}`,
        label: s.label,
        value: s.value,
        description: s.detail,
        delta: s.trend
          ? { value: s.detail, trend: s.trend }
          : undefined,
        icon: <MenuIcon name={s.icon} className="h-4 w-4" />,
      })),
    [stats],
  );

  const clampedRate = Math.max(0, Math.min(100, leaveUsageRate));

  return (
    <div
      className="space-y-4 animate-in fade-in duration-300"
      data-testid="admin-analysis-business-mobile"
    >
      <SwipeableKpiCards cards={kpiCards} ariaLabel="경영 지표" />

      <section className="app-card p-4">
        <h3 className="mb-4 text-base font-bold text-[var(--foreground)]">
          최근 알림
        </h3>
        <div className="space-y-3">
          {notices.map((notice) => (
            <div key={notice.label} className="flex items-center gap-3">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] ${notice.tone}`}
              >
                <MenuIcon name={notice.icon} className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--foreground)] truncate">
                  {notice.label}
                </p>
                <p className="mt-1 text-[11px] font-semibold text-[var(--zinc-400)]">
                  {notice.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="app-card p-4">
        <h3 className="mb-3 text-base font-bold text-[var(--foreground)]">
          빠른 액세스
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {quickLinks.map((link) => (
            <button
              key={link.label}
              type="button"
              className="flex h-11 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--tab-bg)] px-3 text-left text-[12px] font-bold text-[var(--foreground)] transition-colors hover:border-[var(--accent)]/40 hover:bg-[var(--accent-light)] hover:text-[var(--accent)]"
            >
              <MenuIcon
                name={link.icon}
                className="h-4 w-4 shrink-0 text-[var(--accent)]"
              />
              <span className="truncate">{link.label}</span>
            </button>
          ))}
        </div>
      </section>

      <MobileChartWrapper
        title="연차 사용률"
        subtitle="전사 평균 소진 현황"
        height={120}
        ariaLabel="연차 사용률 차트"
        actions={
          <span className="inline-flex w-fit rounded-[var(--radius-md)] bg-[var(--success-light)] px-3 py-1 text-[11px] font-bold text-[var(--success)]">
            {leaveUsageRate}%
          </span>
        }
      >
        <div className="flex h-full flex-col justify-center gap-2">
          <div
            role="progressbar"
            aria-valuenow={clampedRate}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`연차 사용률 ${clampedRate}%`}
            className="h-2 overflow-hidden rounded-full bg-[var(--tab-bg)]"
          >
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all"
              style={{ width: `${clampedRate}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--zinc-400)]">
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>
      </MobileChartWrapper>
    </div>
  );
}
