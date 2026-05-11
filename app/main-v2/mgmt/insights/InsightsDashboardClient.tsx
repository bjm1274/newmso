'use client';

/**
 * InsightsDashboardClient.tsx — 경영 인사이트 대시보드 클라이언트
 * localStorage로 위젯 토글 상태 저장·복원
 * JM2: 위젯별 조건부 렌더 (불필요한 마운트 방지)
 * JM4: WidgetId union 타입 엄격 사용
 */

import { useEffect, useState } from 'react';
import { WidgetToggleBar, WIDGET_LIST, type WidgetId } from './WidgetToggleBar';
import { KpiCards } from './widgets/KpiCards';
import { RevenueChart } from './widgets/RevenueChart';
import { OccupancyChart } from './widgets/OccupancyChart';
import { BudgetChart } from './widgets/BudgetChart';
import { DepartmentTable } from './widgets/DepartmentTable';

const LS_KEY = 'mgmt_insights_widgets_v1';
const ALL_WIDGET_IDS: WidgetId[] = WIDGET_LIST.map((w) => w.id);

function loadFromStorage(): Set<WidgetId> {
  if (typeof window === 'undefined') return new Set(ALL_WIDGET_IDS);
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return new Set(ALL_WIDGET_IDS);
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set(ALL_WIDGET_IDS);
    const validIds = parsed.filter((v): v is WidgetId =>
      ALL_WIDGET_IDS.includes(v as WidgetId)
    );
    return new Set(validIds);
  } catch {
    return new Set(ALL_WIDGET_IDS);
  }
}

function saveToStorage(ids: Set<WidgetId>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // localStorage 접근 실패 — 무시
  }
}

export function InsightsDashboardClient() {
  // SSR 기본값: 모두 표시 (hydration 불일치 방지 위해 useEffect로 복원)
  const [visible, setVisible] = useState<Set<WidgetId>>(new Set(ALL_WIDGET_IDS));
  const [hydrated, setHydrated] = useState(false);

  // localStorage에서 복원
  useEffect(() => {
    setVisible(loadFromStorage());
    setHydrated(true);
  }, []);

  // 변경 시 저장
  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(visible);
  }, [visible, hydrated]);

  return (
    <div className="flex flex-col gap-6">
      {/* 헤더 + 토글 바 */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">경영 인사이트</h1>
        <WidgetToggleBar visible={visible} setVisible={setVisible} />
      </header>

      {/* KPI 카드 */}
      {visible.has('kpi') && (
        <section aria-label="KPI 위젯">
          <KpiCards />
        </section>
      )}

      {/* 매출·이익 차트 */}
      {visible.has('revenue') && (
        <section aria-label="매출·이익 위젯">
          <RevenueChart />
        </section>
      )}

      {/* 환자 현황 */}
      {visible.has('occupancy') && (
        <section aria-label="환자 위젯">
          <OccupancyChart />
        </section>
      )}

      {/* 예산 현황 */}
      {visible.has('budget') && (
        <section aria-label="예산 위젯">
          <BudgetChart />
        </section>
      )}

      {/* 부서별 상세표 */}
      {visible.has('department') && (
        <section aria-label="부서별 상세표 위젯">
          <DepartmentTable />
        </section>
      )}
    </div>
  );
}
