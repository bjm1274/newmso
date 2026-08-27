// 재고관리 워크센터 — 공통 데이터 헬퍼 (안전 추출 / 빈 메시지)
//
// JM4: any 금지 — 외부 row는 `Record<string, unknown>`으로 받고 타입 가드로 추출.

'use client';

import { useMemo } from 'react';

export type Row = Record<string, unknown>;

export const asString = (v: unknown, fallback = ''): string =>
  v === null || v === undefined ? fallback : String(v);

export const pickString = (r: Row, keys: readonly string[], fallback = ''): string => {
  for (const k of keys) {
    const v = r[k];
    if (v !== null && v !== undefined && String(v).trim() !== '') return String(v);
  }
  return fallback;
};

export const pickNumber = (r: Row, keys: readonly string[], fallback = 0): number => {
  for (const k of keys) {
    const v = r[k];
    if (v !== null && v !== undefined && v !== '') {
      const n = typeof v === 'number' ? v : Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return fallback;
};

// 'YYYY-MM-DD' / Date / 빈값 → 'YYYY-MM-DD' 또는 '-'
export function toMonthString(v: unknown): string {
  const s = asString(v).trim();
  if (!s) return '-';
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

// 'YYYY-MM-DD HH:MM' / ISO → 'HH:MM'
export function toTimeString(v: unknown): string {
  const s = asString(v).trim();
  if (!s) return '--:--';
  const m = s.match(/T?(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : s.slice(0, 5);
}

// ─────────────────────────────────────────────────────────────
// inventory 전량 조회 — range 페이징 (INV-01)
//
// 왜: 재고현황/분석/모바일 품목 화면이 각각 limit(500/800/200)을 하드코딩해
// 운영 품목 1,032건 중 서로 다른 부분집합만 보고 있었다. KPI·ABC 등급·화면 내
// 검색이 전부 이 배열 위에서 계산되므로 부분집합은 곧 오답이다.
// 단순히 숫자를 키우는 방식은 /api/d1/query 의 limit 상한(MAX_LIMIT=1000)에
// 다시 걸리므로, 이미 저장소에서 쓰는 range 페이징 패턴으로 끝까지 훑는다.
// ─────────────────────────────────────────────────────────────
export const INVENTORY_PAGE_SIZE = 500;
const INVENTORY_MAX_PAGES = 40; // 안전 상한 20,000행 — 무한 루프 방지

type PagedSelect = {
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

/**
 * buildQuery() 가 만든 SELECT 를 range 로 끝까지 훑어 전 행을 모은다.
 *
 * - QueryBuilder 는 1회용(state 를 품고 있다)이라 페이지마다 새로 만들어야 해서 팩토리를 받는다.
 * - OFFSET 페이징은 정렬이 확정돼야 페이지 경계가 보장된다. 호출부는 반드시
 *   유일 컬럼(id)까지 포함한 .order() 를 걸어야 한다.
 * - truncated=true 는 상한에 걸렸거나 중간 페이지가 실패해 **전량을 받지 못했다**는 뜻이다.
 *   조용히 잘린 목록을 정상처럼 반환하지 않기 위해 분리해 돌려준다.
 */
export async function fetchAllRowsPaged(
  buildQuery: () => PagedSelect,
): Promise<{ rows: Row[]; truncated: boolean }> {
  const rows: Row[] = [];
  for (let page = 0; page < INVENTORY_MAX_PAGES; page += 1) {
    const from = page * INVENTORY_PAGE_SIZE;
    const res = await buildQuery().range(from, from + INVENTORY_PAGE_SIZE - 1);
    if (res.error) {
      console.warn(`[inventory] 페이징 조회 실패 (offset=${from}): ${res.error.message}`);
      return { rows, truncated: true };
    }
    const pageRows = Array.isArray(res.data) ? (res.data as Row[]) : [];
    rows.push(...pageRows);
    if (pageRows.length < INVENTORY_PAGE_SIZE) return { rows, truncated: false };
  }
  console.warn(
    `[inventory] 페이징 상한(${INVENTORY_MAX_PAGES * INVENTORY_PAGE_SIZE}행) 도달 — 목록이 잘렸다`,
  );
  return { rows, truncated: true };
}

// 공통 빈 상태 메시지 헬퍼
export function useEmptyMessage(
  loading: boolean,
  error: string | null,
  rowCount: number,
): string | null {
  return useMemo(() => {
    if (loading) return '데이터를 불러오는 중입니다…';
    if (error) return `데이터 로드 실패: ${error}`;
    if (rowCount === 0) return '표시할 데이터가 없습니다.';
    return null;
  }, [loading, error, rowCount]);
}
