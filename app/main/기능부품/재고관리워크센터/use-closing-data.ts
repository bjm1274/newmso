// analyze 워크센터 — 월마감(inventory_closing_snapshots) fetch 훅
//
// 기존 ClosePanel은 CLOSE_STEPS/CLOSE_HISTORY 하드코딩 placeholder였다.
// 실제 inventory_closing_snapshots 테이블을 읽어
//  - 최근 마감 이력(평가액·품목수·확정 여부)
//  - 이번 달 마감 완료 여부에 따른 5단계 진행 상태
// 를 동적으로 구성한다.

'use client';

import { useEffect, useState } from 'react';
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

function buildSteps(currentMonthClosed: boolean): CloseStep[] {
  return STEP_TITLES.map((title, i) => ({
    n: i + 1,
    title,
    desc: currentMonthClosed ? '완료' : i === 0 ? '진행 중' : '대기',
    state: currentMonthClosed ? 'done' : i === 0 ? 'on' : 'pending' }));
}

export type ClosingData = {
  history: CloseHistoryRow[];
  steps: CloseStep[];
  currentMonthClosed: boolean;
  loading: boolean;
  error: string | null;
};

const EMPTY: ClosingData = {
  history: [],
  steps: buildSteps(false),
  currentMonthClosed: false,
  loading: true,
  error: null };

export function useClosingData(): ClosingData {
  const [state, setState] = useState<ClosingData>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const { data, error } = await db
          .from('inventory_closing_snapshots')
          .select('closing_month, status, item_count, total_value, created_by_name, closed_at')
          .order('closing_month', { ascending: false })
          .limit(6);

        if (cancelled) return;
        if (error) throw error;

        const rows: Row[] = Array.isArray(data) ? (data as Row[]) : [];

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

        const currentMonthClosed = rows.some(
          (r) =>
            pickString(r, ['closing_month'], '') === currentMonth &&
            isLocked(pickString(r, ['status'], '')),
        );

        setState({
          history,
          steps: buildSteps(currentMonthClosed),
          currentMonthClosed,
          loading: false,
          error: null });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : '월마감 데이터를 불러오지 못했습니다.';
        setState({ ...EMPTY, loading: false, error: message });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
