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
