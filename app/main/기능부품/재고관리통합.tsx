'use client';

import StatusWorkcenter from './재고관리워크센터/StatusWorkcenter';
import InoutWorkcenter from './재고관리워크센터/InoutWorkcenter';
import OrderWorkcenter from './재고관리워크센터/OrderWorkcenter';
import AuditWorkcenter from './재고관리워크센터/AuditWorkcenter';
import UdiWorkcenter from './재고관리워크센터/UdiWorkcenter';
import MasterWorkcenter from './재고관리워크센터/MasterWorkcenter';
import AnalyzeWorkcenter from './재고관리워크센터/AnalyzeWorkcenter';
import type { IntegratedInventoryProps } from './재고관리서브/types';

// ── 워크센터 영문 id ──
const STOCK_WORKCENTER_ENGLISH_IDS = [
  'status',
  'inout',
  'order',
  'audit',
  'udi',
  'master',
  'analyze',
] as const;
type StockWorkcenterEnglishId = (typeof STOCK_WORKCENTER_ENGLISH_IDS)[number];

const isStockWorkcenterEnglishId = (id: unknown): id is StockWorkcenterEnglishId =>
  typeof id === 'string' && (STOCK_WORKCENTER_ENGLISH_IDS as readonly string[]).includes(id);

export default function IntegratedInventoryManagement({
  initialView,
}: IntegratedInventoryProps) {
  const resolvedId = isStockWorkcenterEnglishId(initialView) ? initialView : 'status';

  return (
    <div
      className="relative flex h-full min-h-0 flex-col overflow-x-hidden app-page"
      data-testid="inventory-view"
    >
      {resolvedId === 'status' && <StatusWorkcenter />}
      {resolvedId === 'inout' && <InoutWorkcenter />}
      {resolvedId === 'order' && <OrderWorkcenter />}
      {resolvedId === 'audit' && <AuditWorkcenter />}
      {resolvedId === 'udi' && <UdiWorkcenter />}
      {resolvedId === 'master' && <MasterWorkcenter />}
      {resolvedId === 'analyze' && <AnalyzeWorkcenter />}
    </div>
  );
}
