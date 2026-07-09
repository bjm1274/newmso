'use client';

import { useState } from 'react';
import StatusWorkcenter from './재고관리워크센터/StatusWorkcenter';
import InoutWorkcenter from './재고관리워크센터/InoutWorkcenter';
import OrderWorkcenter from './재고관리워크센터/OrderWorkcenter';
import AuditWorkcenter from './재고관리워크센터/AuditWorkcenter';
import UdiWorkcenter from './재고관리워크센터/UdiWorkcenter';
import MasterWorkcenter from './재고관리워크센터/MasterWorkcenter';
import AnalyzeWorkcenter from './재고관리워크센터/AnalyzeWorkcenter';
import { StockTabs, type TabItem } from './재고관리워크센터/stock-workcenter-common';
import { resolveWorkcenterId, type StockWorkcenterId } from './재고관리워크센터/stock-types';
import type { IntegratedInventoryProps } from './재고관리서브/types';

/**
 * 사이드바 4 워크센터 id (결정 #44: status / io / item / analyze)
 * + 7대 내부 워크센터 id + 레거시 한글 id 를 모두 해석한다.
 *
 * 기존 버그: 사이드바는 `io`·`item` 을 쓰는데 통합 화면이 7대 영문 id 만 허용해
 * 알 수 없는 id → 무조건 status 폴백 → 메뉴 클릭이 "무반응"처럼 보임.
 */
type SidebarWorkcenterId = 'status' | 'io' | 'item' | 'analyze';
type RouteId = SidebarWorkcenterId | StockWorkcenterId;

const SIDEBAR_WORKCENTER_IDS = new Set<string>(['status', 'io', 'item', 'analyze']);

function resolveInventoryRoute(raw?: string | null): RouteId {
  if (!raw) return 'status';
  if (SIDEBAR_WORKCENTER_IDS.has(raw)) return raw as SidebarWorkcenterId;
  return resolveWorkcenterId(raw);
}

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
