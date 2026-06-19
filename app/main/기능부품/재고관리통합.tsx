'use client';

import { StatusWorkcenter, IOWorkcenter, ItemWorkcenter, AnalyzeWorkcenter } from './재고관리워크센터';
import type { IntegratedInventoryProps } from './재고관리서브/types';

// ── 워크센터 영문 id ──
// page.tsx의 inventoryViewAliases에서 모든 진입 id가 영문 id로 변환되므로
// initialView는 항상 'status' | 'io' | 'item' | 'analyze' 중 하나.
const STOCK_WORKCENTER_ENGLISH_IDS = ['status', 'io', 'item', 'analyze'] as const;
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
      {resolvedId === 'io' && <IOWorkcenter />}
      {resolvedId === 'item' && <ItemWorkcenter />}
      {resolvedId === 'analyze' && <AnalyzeWorkcenter />}
    </div>
  );
}
