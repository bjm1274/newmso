'use client';
/**
 * 부서별 재고 — 주(week) 기반 행 컴포넌트
 *
 * 두 모드:
 *   - 'view'    : 잔여 / 주간소비 / 최소재고(주 기준 표시) / 상태 / 빠른 작업
 *   - 'setting' : 주간소비(input) / 보유 기준(1~4주 segmented) / 자동계산
 *
 * JM2: useCallback으로 prop 안정화, re-render 최소화.
 * JM6: segmented 버튼은 button + aria-pressed, label 연결.
 */

import { memo, useCallback } from 'react';
import {
  type WeekBasis,
  type ItemWeekSetting,
  calcMinStock,
  calcCoverageWeeks,
} from './dept-week-settings';

export type DeptInventoryMode = 'view' | 'setting';

export interface DeptInventoryRowItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
}

interface Props {
  item: DeptInventoryRowItem;
  mode: DeptInventoryMode;
  setting: ItemWeekSetting;
  ordering: boolean;
  recommendedQty: number;
  onChangeWeeks: (itemId: string, weeks: WeekBasis) => void;
  onChangeWeekly: (itemId: string, weekly: number) => void;
  onQuickReorder: (itemId: string) => void;
}

const WEEK_OPTIONS: WeekBasis[] = [1, 2, 3, 4];

function DeptInventoryRowImpl({
  item,
  mode,
  setting,
  ordering,
  recommendedQty,
  onChangeWeeks,
  onChangeWeekly,
  onQuickReorder,
}: Props) {
  const min = calcMinStock(setting);
  const coverage = calcCoverageWeeks(item.quantity, setting.weekly);
  const danger = item.quantity < min;

  const handleWeeklyInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value);
      onChangeWeekly(item.id, Number.isFinite(v) && v >= 0 ? v : 0);
    },
    [item.id, onChangeWeekly]
  );

  const handleReorder = useCallback(() => {
    onQuickReorder(item.id);
  }, [item.id, onQuickReorder]);

  return (
    <tr className="border-b border-[var(--border)] last:border-0">
      <td className="px-3 py-2 text-sm font-semibold text-[var(--foreground)]">
        {item.name}
      </td>
      <td className="px-3 py-2 text-xs text-[var(--toss-gray-3)]">{item.category}</td>
      <td className="px-3 py-2 text-right">
        <div
          className={`text-sm font-bold ${
            danger ? 'text-[var(--danger)]' : 'text-[var(--foreground)]'
          }`}
        >
          {item.quantity}
        </div>
        {coverage !== null && (
          <div className="text-[10px] font-semibold text-[var(--toss-gray-3)] mt-0.5">
            {coverage.toFixed(1)}주 분량
          </div>
        )}
      </td>
      {mode === 'setting' ? (
        <>
          <td className="px-3 py-2 text-right">
            <input
              type="number"
              min={0}
              step={1}
              value={setting.weekly}
              onChange={handleWeeklyInput}
              aria-label={`${item.name} 주간 평균 소비량`}
              className="w-20 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </td>
          <td className="px-3 py-2">
            <div
              role="group"
              aria-label={`${item.name} 보유 기준`}
              className="inline-flex rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-0.5"
            >
              {WEEK_OPTIONS.map((w) => {
                const active = setting.weeks === w;
                return (
                  <button
                    key={w}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onChangeWeeks(item.id, w)}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-[var(--radius-md)] transition ${
                      active
                        ? 'bg-[var(--accent)] text-white shadow-sm'
                        : 'text-[var(--toss-gray-4)] hover:bg-[var(--card)]'
                    }`}
                  >
                    {w}주
                  </button>
                );
              })}
            </div>
          </td>
          <td className="px-3 py-2 text-right">
            <div className="text-sm font-bold text-[var(--foreground)] tabular-nums">
              {min}
            </div>
            <div className="text-[10px] text-[var(--toss-gray-3)] mt-0.5">자동 계산</div>
          </td>
        </>
      ) : (
        <>
          <td className="px-3 py-2 text-right text-sm text-[var(--toss-gray-4)] tabular-nums">
            {setting.weekly > 0 ? `${setting.weekly}/주` : '-'}
          </td>
          <td className="px-3 py-2 text-right">
            <div className="text-sm font-semibold text-[var(--foreground)] tabular-nums">
              {min}
            </div>
            <div className="text-[10px] text-[var(--toss-gray-3)] mt-0.5">
              {setting.weeks}주 기준
            </div>
          </td>
          <td className="px-3 py-2 text-center">
            {danger ? (
              <span className="inline-flex items-center rounded-full bg-[var(--danger)]/10 px-2 py-0.5 text-[11px] font-bold text-[var(--danger)]">
                발주 필요
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-600">
                정상
              </span>
            )}
          </td>
          <td className="px-3 py-2 text-center">
            {danger ? (
              <button
                type="button"
                onClick={handleReorder}
                disabled={ordering}
                className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-[11px] font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {ordering ? '신청 중...' : `자동 발주 ${recommendedQty}개`}
              </button>
            ) : (
              <span className="text-[11px] text-[var(--toss-gray-3)]">-</span>
            )}
          </td>
        </>
      )}
    </tr>
  );
}

export const DeptInventoryRow = memo(DeptInventoryRowImpl);
