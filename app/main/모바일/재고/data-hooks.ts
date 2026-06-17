'use client';

/**
 * 모바일 재고관리 — 데이터 훅 어댑터.
 *
 * PC `재고관리워크센터/use-*-data.ts` Supabase 훅을 그대로 재export.
 * (UI 컴포넌트는 import 금지, 데이터 함수만 재사용)
 *
 * 추가:
 *  - useStockTones: tone 매핑 헬퍼
 *  - useShortageTopRow: 부족 카드 1순위 노출용
 *
 * 사용 테이블: inventory, inventory_logs, inventory_categories,
 *            purchase_orders, suppliers
 *
 * JM2: 식별자 primitive deps만, AbortController 보호는 원 훅이 cancelled flag로 처리.
 * JM3: 원 훅 내부 try/catch + 빈 배열 폴백. UI는 loading/error 그대로 사용.
 * JM4: any 금지 — 원 훅의 타입을 그대로 노출.
 * JM5: company 필터는 status 훅에 props로 전달 (RLS와 이중 가드).
 */

import { useMemo } from 'react';
import { canAccessInventorySection, isMsoUser } from '@/lib/access-control';
import {
  useStatusData,
  type StatusWorkcenterData,
} from '../../기능부품/재고관리워크센터/use-status-data';
import {
  useIOData,
  type IOWorkcenterData,
} from '../../기능부품/재고관리워크센터/use-io-data';
import {
  useItemData,
  type ItemWorkcenterData,
} from '../../기능부품/재고관리워크센터/use-item-data';
import {
  useAnalyzeData,
  type AnalyzeWorkcenterData,
} from '../../기능부품/재고관리워크센터/use-analyze-data';
import type {
  StockStatusRow,
  Tone,
} from '../../기능부품/재고관리워크센터/stock-types';

export {
  useStatusData,
  useIOData,
  useItemData,
  useAnalyzeData,
};
export type {
  StatusWorkcenterData,
  IOWorkcenterData,
  ItemWorkcenterData,
  AnalyzeWorkcenterData,
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

// ─── 부족 카드용 1순위 ────────────────────────────────────────
export function useShortageTop(
  rows: readonly StockStatusRow[],
): { count: number; first: StockStatusRow | null } {
  return useMemo(() => {
    const shortage = rows.filter((r) => r.tone === 'danger' || r.tone === 'warn');
    return { count: shortage.length, first: shortage[0] ?? null };
  }, [rows]);
}

// ─── 금액 포맷 (₩ 표시는 호출 측에서) ──────────────────────────
export function formatAmount(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString('ko-KR');
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
