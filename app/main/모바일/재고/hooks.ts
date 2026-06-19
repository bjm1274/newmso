'use client';

import { canAccessInventorySection, isMsoUser } from '@/lib/access-control';
import {
  useStatusData,
  useIOData,
  useItemData,
  useAnalyzeData,
  useUsageStats,
  useReturnsData,
  type StatusWorkcenterData,
  type IOWorkcenterData,
  type ItemWorkcenterData,
  type AnalyzeWorkcenterData,
  type UsageDeptRow,
  type UsageStatsData,
  type ReturnRow,
  type ReturnsData,
} from '../../기능부품/재고관리워크센터/use-stock-data';
import type {
  StockStatusRow,
  Tone,
} from '../../기능부품/재고관리워크센터/stock-types';
import { formatAmount } from './data-hooks';
import { formatWon } from '@/lib/date-formatter';

export {
  useStatusData,
  useIOData,
  useItemData,
  useAnalyzeData,
  useUsageStats,
  useReturnsData,
  formatAmount,
  formatWon,
};

export type {
  StatusWorkcenterData,
  IOWorkcenterData,
  ItemWorkcenterData,
  AnalyzeWorkcenterData,
  UsageDeptRow,
  UsageStatsData,
  ReturnRow,
  ReturnsData,
  StockStatusRow,
  Tone,
};

// ─── tone 매핑: 워크센터 Tone(warn) → 모바일 MChip(warning) ─────
export type MTone = '' | 'accent' | 'success' | 'warning' | 'danger';

export function toMTone(t: Tone | undefined | null): MTone {
  if (!t) return '';
  if (t === 'warn') return 'warning';
  if (t === 'muted') return '';
  return t;
}

// ─── 발주 권한 가드 (JM5) ─────────────────────────────────────
export type StockMutateUser = {
  role?: string | null;
  permissions?: Record<string, unknown> | null;
};

export function canPlaceOrder(user: StockMutateUser | null | undefined): boolean {
  if (!user) return false;
  return (
    isMsoUser(user) ||
    canAccessInventorySection(user, 'inventory_발주') ||
    canAccessInventorySection(user, 'inventory_등록')
  );
}
