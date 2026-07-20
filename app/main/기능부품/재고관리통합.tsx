'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { StockTabs, type TabItem } from './재고관리워크센터/stock-workcenter-common';
import { resolveWorkcenterId, type StockWorkcenterId } from './재고관리워크센터/stock-types';
import type { IntegratedInventoryProps } from './재고관리서브/types';

/**
 * 사이드바 4 워크센터 id (결정 #44: status / io / item / analyze)
 * + 7대 내부 워크센터 id + 레거시 한글 id 를 모두 해석한다.
 *
 * 기존 버그: 사이드바는 `io`·`item` 을 쓰는데 통합 화면이 7대 영문 id 만 허용해
 * 알 수 없는 id → 무조건 status 폴백 → 메뉴 클릭이 "무반응"처럼 보임.
 *
 * 성능: 워크센터별 dynamic import — 재고 메뉴 첫 진입 시 status 만 로드하고
 * 나머지 입출고/분석 등은 해당 탭 클릭 시에만 번들을 받는다.
 */
type SidebarWorkcenterId = 'status' | 'io' | 'item' | 'analyze';
type RouteId = SidebarWorkcenterId | StockWorkcenterId;

const SIDEBAR_WORKCENTER_IDS = new Set<string>(['status', 'io', 'item', 'analyze']);

function resolveInventoryRoute(raw?: string | null): RouteId {
  if (!raw) return 'status';
  if (SIDEBAR_WORKCENTER_IDS.has(raw)) return raw as SidebarWorkcenterId;
  return resolveWorkcenterId(raw);
}

function WorkcenterLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-[240px] flex-1 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--toss-blue-light)] border-t-[var(--accent)]" />
        <p className="text-xs font-medium text-[var(--toss-gray-3)]">{label} 불러오는 중…</p>
      </div>
    </div>
  );
}

const StatusWorkcenter = dynamic(() => import('./재고관리워크센터/StatusWorkcenter'), {
  ssr: false,
  loading: () => <WorkcenterLoading label="재고 현황" />,
});
const InoutWorkcenter = dynamic(() => import('./재고관리워크센터/InoutWorkcenter'), {
  ssr: false,
  loading: () => <WorkcenterLoading label="입출고" />,
});
const OrderWorkcenter = dynamic(() => import('./재고관리워크센터/OrderWorkcenter'), {
  ssr: false,
  loading: () => <WorkcenterLoading label="발주" />,
});
const AuditWorkcenter = dynamic(() => import('./재고관리워크센터/AuditWorkcenter'), {
  ssr: false,
  loading: () => <WorkcenterLoading label="실사" />,
});
const UdiWorkcenter = dynamic(() => import('./재고관리워크센터/UdiWorkcenter'), {
  ssr: false,
  loading: () => <WorkcenterLoading label="UDI" />,
});
const MasterWorkcenter = dynamic(() => import('./재고관리워크센터/MasterWorkcenter'), {
  ssr: false,
  loading: () => <WorkcenterLoading label="물품·자산" />,
});
const AnalyzeWorkcenter = dynamic(() => import('./재고관리워크센터/AnalyzeWorkcenter'), {
  ssr: false,
  loading: () => <WorkcenterLoading label="분석·마감" />,
});

/** 입출고·발주 (사이드바 `io`) — 입출고 / 발주 탭 통합 */
function IoWorkcenterShell() {
  const [tab, setTab] = useState<'inout' | 'order'>('inout');
  const tabs: TabItem<'inout' | 'order'>[] = [
    { id: 'inout', label: '입출고' },
    { id: 'order', label: '발주' },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4" data-testid="inventory-io-workcenter">
      <StockTabs tabs={tabs} active={tab} onChange={setTab} ariaLabel="입출고·발주 탭" />
      {tab === 'inout' ? <InoutWorkcenter /> : <OrderWorkcenter />}
    </div>
  );
}

export default function IntegratedInventoryManagement({
  initialView,
}: IntegratedInventoryProps) {
  const route = resolveInventoryRoute(initialView);

  return (
    <div
      className="relative flex h-full min-h-0 flex-col overflow-x-hidden app-page"
      data-testid="inventory-view"
      data-inventory-route={route}
    >
      {route === 'status' && <StatusWorkcenter />}

      {/* 사이드바 입출고·발주 → 탭 통합 / 딥링크 inout·order 는 개별 유지 */}
      {route === 'io' && <IoWorkcenterShell />}
      {route === 'inout' && <InoutWorkcenter />}
      {route === 'order' && <OrderWorkcenter />}

      {route === 'audit' && <AuditWorkcenter />}
      {route === 'udi' && <UdiWorkcenter />}

      {/* 사이드바 물품·자산 → 기준정보(물품/자산 QR/거래처) */}
      {(route === 'item' || route === 'master') && <MasterWorkcenter />}

      {route === 'analyze' && <AnalyzeWorkcenter />}
    </div>
  );
}
