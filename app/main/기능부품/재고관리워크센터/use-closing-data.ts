// analyze 워크센터 — 월마감(inventory_closing_snapshots) fetch 훅
//
// 실제 inventory_closing_snapshots 테이블을 읽어
//  - 최근 마감 이력(평가액·품목수·확정 여부)
//  - 이번 달 마감 완료 여부에 따른 5단계 진행 상태
//  - lock/unlock 후 refresh

'use client';

import { useCallback, useEffect, useState } from 'react';
import { db } from '@/lib/db-client';
import type { CloseHistoryRow, CloseStep, Tone } from './stock-types';
import { pickNumber, pickString, type Row } from './data-helpers';

const STEP_TITLES = ['재고 실사', '입출고 확정', '차이 조정', '재고 평가', '마감 보고서'];

function formatValue(v: number): string {
  if (!Number.isFinite(v)) return '-';
  return '₩' + Math.round(v).toLocaleString('ko-KR');
}

function isLocked(status: string): boolean {
  const s = status.trim().toLowerCase();
  return s === 'locked' || s === 'closed' || s === '확정' || s === '마감';
}

function buildSteps(stepsDone: number, locked: boolean): CloseStep[] {
  const done = locked ? 5 : Math.min(5, Math.max(0, stepsDone));
  return STEP_TITLES.map((title, i) => {
    const n = i + 1;
    if (n <= done) {
      return { n, title, desc: '완료', state: 'done' as const };
    }
    if (n === done + 1) {
      return { n, title, desc: '진행 중', state: 'on' as const };
    }
    return { n, title, desc: '대기', state: 'pending' as const };
  });
}

export type ClosingData = {
  history: CloseHistoryRow[];
  steps: CloseStep[];
  stepsDone: number;
  currentMonthClosed: boolean;
  currentMonth: string;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

const EMPTY_BASE = {
  history: [] as CloseHistoryRow[],
  steps: buildSteps(0, false),
  stepsDone: 0,
  currentMonthClosed: false,
  currentMonth: '',
  loading: true,
  error: null as string | null,
};

export function useClosingData(): ClosingData {
  const [state, setState] = useState(EMPTY_BASE);
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setState((s) => ({ ...s, loading: true, error: null }));
        const { data, error } = await db
          .from('inventory_closing_snapshots')
          .select('closing_month, status, item_count, total_value, created_by_name, closed_at, summary')
          .order('closing_month', { ascending: false })
          .limit(12);

        if (cancelled) return;
        if (error) throw error;

        const rows: Row[] = Array.isArray(data) ? (data as Row[]) : [];

        // KST 근사: 로컬 브라우저 기준 YYYY-MM (운영은 API가 KST 사용)
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const history: CloseHistoryRow[] = rows.map((r) => {
          const locked = isLocked(pickString(r, ['status'], 'locked'));
          return {
            month: pickString(r, ['closing_month'], '-'),
            amt: formatValue(pickNumber(r, ['total_value'], NaN)),
            diff: locked ? '확정' : '임시',
            tone: (locked ? 'success' : 'warn') as Tone,
            done: `${pickNumber(r, ['item_count'], 0).toLocaleString('ko-KR')}종` };
        });

        const currentRow = rows.find(
          (r) => pickString(r, ['closing_month'], '') === currentMonth,
        );
        const currentMonthClosed = Boolean(
          currentRow && isLocked(pickString(currentRow, ['status'], '')),
        );
        let stepsDone = 0;
        if (currentRow) {
          const raw = currentRow['summary'];
          try {
            const s =
              typeof raw === 'string'
                ? JSON.parse(raw)
                : raw && typeof raw === 'object'
                  ? raw
                  : {};
            stepsDone = Math.min(5, Math.max(0, Number((s as { steps_done?: number }).steps_done) || 0));
          } catch {
            stepsDone = 0;
          }
          if (currentMonthClosed) stepsDone = 5;
        }

        setState({
          history,
          steps: buildSteps(stepsDone, currentMonthClosed),
          stepsDone,
          currentMonthClosed,
          currentMonth,
          loading: false,
          error: null });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : '월마감 데이터를 불러오지 못했습니다.';
        setState({
          ...EMPTY_BASE,
          loading: false,
          error: message,
        });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return { ...state, refresh };
}
