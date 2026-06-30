'use client';

/**
 * 모바일 재고 분석·마감 — 추가 데이터 훅 (PC 미러).
 *
 * PC `재고관리워크센터`에는 ABC·수요예측·실사·월마감 4탭만 존재하지만,
 * 모바일은 「소모품 통계」·「AS·반품」 2탭이 더 있다(STOCK_WORKCENTER_META.analyze.cnt=6).
 * 이 두 탭의 실데이터를 PC가 사용하는 동일 테이블/컬럼에서 직접 집계한다.
 *
 * 데이터 소스 (PC와 동일):
 *  - 소모품 통계: inventory_logs (부서별·기간별 사용액 = Σ quantity × unit_price)
 *      · 부서 컬럼: department (io-data 의 to_dept/department 와 동일 컬럼)
 *      · 기간: created_at 기준 최근 30일 / 직전 30일
 *  - AS·반품: inventory_logs (change_type/type 가 '반품') — io-data normalizeMoveKind 와 동일 규칙
 *
 * JM2: cancelled flag 보호, primitive deps 없음(한 번 로드).
 * JM3: try/catch + 빈 배열 폴백. UI 는 loading/error 사용.
 * JM4: any 금지 — Row = Record<string, unknown> + pick* 가드.
 */

import { useEffect, useState } from 'react';
import { db } from '@/lib/db-client';
import { asString, pickNumber, pickString, type Row } from '../../기능부품/재고관리워크센터/data-helpers';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// ─── 부서별 사용 통계 ──────────────────────────────────────────
export type UsageDeptRow = {
  /** 부서명 */
  dept: string;
  /** 이번 30일 사용액(₩) */
  amount: number;
  /** 이번 30일 출고 건수 */
  count: number;
  /** 직전 30일 대비 증감액(₩) — 양수=증가 */
  delta: number;
};

export type UsageStatsData = {
  rows: UsageDeptRow[];
  /** 이번 30일 총 사용액 */
  totalAmount: number;
  /** 직전 30일 총 사용액 */
  prevTotalAmount: number;
  /** 집계 대상 출고 로그 수 */
  logCount: number;
  loading: boolean;
  error: string | null;
};

const USAGE_EMPTY: UsageStatsData = {
  rows: [],
  totalAmount: 0,
  prevTotalAmount: 0,
  logCount: 0,
  loading: true,
  error: null };

/** 사용(소모)으로 간주하는 변동 유형: 출고/사용/소모/반품 제외(반품은 별도 탭). */
function isConsumption(r: Row): boolean {
  const s = asString(r['change_type'] ?? r['type']);
  if (s.includes('반품')) return false;
  if (s.includes('입고')) return false;
  if (s.includes('이관')) return false;
  // 출고·사용·소모·consume 등은 사용으로 간주. 빈 값/기타는 prev/next 수량 감소로 판단.
  if (s.includes('출고') || s.includes('사용') || s.includes('소모') || s.toLowerCase().includes('consume')) {
    return true;
  }
  const prev = pickNumber(r, ['prev_quantity'], NaN);
  const next = pickNumber(r, ['next_quantity'], NaN);
  if (Number.isFinite(prev) && Number.isFinite(next)) return next < prev;
  return false;
}

/** 로그 1건의 사용 수량(절대값). */
function consumptionQty(r: Row): number {
  const q = pickNumber(r, ['quantity', 'amount', 'qty'], 0);
  if (q !== 0) return Math.abs(q);
  const prev = pickNumber(r, ['prev_quantity'], NaN);
  const next = pickNumber(r, ['next_quantity'], NaN);
  if (Number.isFinite(prev) && Number.isFinite(next)) return Math.max(0, prev - next);
  return 0;
}

export function useUsageStats(): UsageStatsData {
  const [state, setState] = useState<UsageStatsData>(USAGE_EMPTY);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const sinceIso = new Date(Date.now() - 2 * THIRTY_DAYS_MS).toISOString();
        const { data, error } = await db
          .from('inventory_logs')
          .select('change_type, type, quantity, unit_price, department, created_at, prev_quantity, next_quantity')
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(1000);

        if (cancelled) return;
        if (error) throw error;

        const rows: Row[] = Array.isArray(data) ? (data as Row[]) : [];
        const now = Date.now();

        const cur = new Map<string, { amount: number; count: number }>();
        const prev = new Map<string, number>();
        let totalAmount = 0;
        let prevTotalAmount = 0;
        let logCount = 0;

        for (const r of rows) {
          if (!isConsumption(r)) continue;
          const created = new Date(asString(r['created_at'])).getTime();
          if (!Number.isFinite(created)) continue;
          const age = now - created;
          if (age < 0 || age > 2 * THIRTY_DAYS_MS) continue;

          const dept = pickString(r, ['department', 'to_dept', 'location'], '미지정');
          const qty = consumptionQty(r);
          const price = pickNumber(r, ['unit_price'], 0);
          const value = qty * price;

          if (age <= THIRTY_DAYS_MS) {
            const c = cur.get(dept) ?? { amount: 0, count: 0 };
            c.amount += value;
            c.count += 1;
            cur.set(dept, c);
            totalAmount += value;
            logCount += 1;
          } else {
            prev.set(dept, (prev.get(dept) ?? 0) + value);
            prevTotalAmount += value;
          }
        }

        const rowsOut: UsageDeptRow[] = Array.from(cur.entries())
          .map(([dept, v]) => ({
            dept,
            amount: v.amount,
            count: v.count,
            delta: v.amount - (prev.get(dept) ?? 0) }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 8);

        setState({
          rows: rowsOut,
          totalAmount,
          prevTotalAmount,
          logCount,
          loading: false,
          error: null });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : '사용 통계를 불러오지 못했습니다.';
        setState({ ...USAGE_EMPTY, loading: false, error: message });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

// ─── AS·반품 (returns) ─────────────────────────────────────────
export type ReturnRow = {
  date: string;
  item: string;
  qty: number;
  dept: string;
  who: string;
  note: string;
};

export type ReturnsData = {
  rows: ReturnRow[];
  /** 최근 30일 반품 건수 */
  count30: number;
  /** 최근 30일 반품 수량 합 */
  qty30: number;
  loading: boolean;
  error: string | null;
};

const RETURNS_EMPTY: ReturnsData = {
  rows: [],
  count30: 0,
  qty30: 0,
  loading: true,
  error: null };

function isReturn(r: Row): boolean {
  return asString(r['change_type'] ?? r['type']).includes('반품');
}

export function useReturnsData(): ReturnsData {
  const [state, setState] = useState<ReturnsData>(RETURNS_EMPTY);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const { data, error } = await db
          .from('inventory_logs')
          .select('change_type, type, quantity, department, actor_name, notes, created_at')
          .order('created_at', { ascending: false })
          .limit(300);

        if (cancelled) return;
        if (error) throw error;

        const rows: Row[] = Array.isArray(data) ? (data as Row[]) : [];
        const now = Date.now();

        const returns = rows.filter(isReturn);

        const rowsOut: ReturnRow[] = returns.slice(0, 30).map((r) => ({
          date: asString(r['created_at']).slice(0, 10) || '-',
          item: pickString(r, ['notes', 'item_name', 'name'], '품목 미상'),
          qty: Math.abs(pickNumber(r, ['quantity', 'amount', 'qty'], 0)),
          dept: pickString(r, ['department', 'location'], '-'),
          who: pickString(r, ['actor_name'], '-'),
          note: pickString(r, ['notes'], '') }));

        let count30 = 0;
        let qty30 = 0;
        for (const r of returns) {
          const created = new Date(asString(r['created_at'])).getTime();
          if (Number.isFinite(created) && now - created <= THIRTY_DAYS_MS) {
            count30 += 1;
            qty30 += Math.abs(pickNumber(r, ['quantity', 'amount', 'qty'], 0));
          }
        }

        setState({ rows: rowsOut, count30, qty30, loading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'AS·반품 데이터를 불러오지 못했습니다.';
        setState({ ...RETURNS_EMPTY, loading: false, error: message });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

// ─── 금액 포맷 ─────────────────────────────────────────────────
export function formatWon(n: number): string {
  if (!Number.isFinite(n)) return '₩0';
  return '₩' + Math.round(n).toLocaleString('ko-KR');
}
