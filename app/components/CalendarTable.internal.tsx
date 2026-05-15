'use client';

/**
 * CalendarTable.internal.tsx
 *
 * CalendarTable의 내부 뷰 컴포넌트 (month-grid / staff-by-day).
 * 외부에서는 CalendarTable.tsx의 default export만 사용한다.
 *
 * 파일 분리 사유: JM(파일당 300줄 이내) 준수 — 두 모드 마크업이 함께 있으면
 * 한 파일이 400줄을 넘어가므로 모드별 뷰를 본 파일에서 분리.
 */

import { type ReactNode } from 'react';
import type {
  CalendarCellInfo,
  CalendarCellTone,
  CalendarRow,
} from './CalendarTable.types';

// ---------------------------------------------------------------------------
// 톤 → CSS
// ---------------------------------------------------------------------------
export const toneClass: Record<CalendarCellTone, string> = {
  normal: 'bg-[var(--card)] text-[var(--foreground)] border-[var(--border)]',
  ok: 'bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30',
  warn: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border-yellow-500/30',
  danger: 'bg-red-500/10 text-red-600 dark:text-red-300 border-red-500/30',
  muted: 'bg-[var(--muted)] text-[var(--toss-gray-4)] border-[var(--border)]',
};

export const DAY_LABELS_SUN = ['일', '월', '화', '수', '목', '금', '토'];
export const DAY_LABELS_MON = ['월', '화', '수', '목', '금', '토', '일'];

// ---------------------------------------------------------------------------
// month-grid 뷰
// ---------------------------------------------------------------------------
type MonthGridViewProps<R> = {
  dates: Date[];
  weekStartsOn: 0 | 1;
  buildInfo: (d: Date) => CalendarCellInfo;
  renderCell: (cell: CalendarCellInfo, row?: CalendarRow<R>) => ReactNode;
  cellTone?: (cell: CalendarCellInfo, row?: CalendarRow<R>) => CalendarCellTone;
  ariaLabel?: string;
  className?: string;
};

export function MonthGridView<R>({
  dates,
  weekStartsOn,
  buildInfo,
  renderCell,
  cellTone,
  ariaLabel,
  className,
}: MonthGridViewProps<R>) {
  const dayLabels = weekStartsOn === 1 ? DAY_LABELS_MON : DAY_LABELS_SUN;
  const firstDow = dates[0].getDay();
  const leadingBlanks = (firstDow - weekStartsOn + 7) % 7;
  const lastDow = dates[dates.length - 1].getDay();
  const trailingBlanks = (6 - lastDow + weekStartsOn + 7) % 7;
  const cells: (Date | null)[] = [
    ...Array<null>(leadingBlanks).fill(null),
    ...dates,
    ...Array<null>(trailingBlanks).fill(null),
  ];

  return (
    <div className={className} role="grid" aria-label={ariaLabel}>
      <div className="grid grid-cols-7 gap-px bg-[var(--border)] rounded-[var(--radius-md)] overflow-hidden">
        {dayLabels.map((label, idx) => (
          <div
            key={`hd-${idx}`}
            role="columnheader"
            className="bg-[var(--tab-bg)] text-center py-1.5 text-[11px] font-bold text-[var(--toss-gray-4)]"
          >
            {label}
          </div>
        ))}
        {cells.map((d, idx) => {
          if (!d) {
            return (
              <div
                key={`blank-${idx}`}
                role="gridcell"
                className="bg-[var(--muted)]/30 min-h-[60px]"
              />
            );
          }
          const info = buildInfo(d);
          const tone = cellTone ? cellTone(info) : 'normal';
          return (
            <div
              key={d.getTime()}
              role="gridcell"
              aria-label={`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`}
              className={[
                'min-h-[60px] sm:min-h-[80px] p-1 sm:p-1.5',
                toneClass[tone],
                !info.isCurrentMonth ? 'opacity-50' : '',
                info.isToday ? 'ring-1 ring-[var(--accent)]' : '',
              ].join(' ')}
            >
              <div className="text-[10px] font-bold opacity-80 mb-0.5">{d.getDate()}</div>
              <div className="text-[11px]">{renderCell(info)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// staff-by-day 뷰
// ---------------------------------------------------------------------------
type StaffByDayViewProps<R> = {
  dates: Date[];
  rows: CalendarRow<R>[];
  buildInfo: (d: Date) => CalendarCellInfo;
  renderCell: (cell: CalendarCellInfo, row?: CalendarRow<R>) => ReactNode;
  cellTone?: (cell: CalendarCellInfo, row?: CalendarRow<R>) => CalendarCellTone;
  rowHeaderLabel: ReactNode;
  ariaLabel?: string;
  className?: string;
};

export function StaffByDayView<R>({
  dates,
  rows,
  buildInfo,
  renderCell,
  cellTone,
  rowHeaderLabel,
  ariaLabel,
  className,
}: StaffByDayViewProps<R>) {
  return (
    <div className={className}>
      {/* ===== 데스크톱 ===== */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse text-xs" role="grid" aria-label={ariaLabel}>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-[var(--tab-bg)] p-2 text-left text-[11px] font-bold text-[var(--toss-gray-4)] border-b border-[var(--border)] whitespace-nowrap"
              >
                {rowHeaderLabel}
              </th>
              {dates.map((d) => {
                const info = buildInfo(d);
                return (
                  <th
                    key={d.getTime()}
                    scope="col"
                    className={[
                      'p-2 text-center text-[11px] font-bold border-b border-[var(--border)] whitespace-nowrap min-w-[60px]',
                      info.isToday
                        ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
                        : 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]',
                      info.isHoliday || (info.isWeekend && d.getDay() === 0) ? 'text-red-500' : '',
                    ].join(' ')}
                  >
                    <div>{d.getDate()}</div>
                    <div className="text-[9px] opacity-70">{DAY_LABELS_SUN[d.getDay()]}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
                <th
                  scope="row"
                  className="sticky left-0 z-[1] bg-[var(--card)] p-2 text-left text-[12px] font-semibold text-[var(--foreground)] whitespace-nowrap"
                >
                  {row.label}
                </th>
                {dates.map((d) => {
                  const info = buildInfo(d);
                  const tone = cellTone ? cellTone(info, row) : 'normal';
                  return (
                    <td
                      key={d.getTime()}
                      role="gridcell"
                      className={['p-1 text-center align-middle border', toneClass[tone]].join(' ')}
                    >
                      {renderCell(info, row)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ===== 모바일 카드 ===== */}
      <div className="flex flex-col gap-2 md:hidden" role="list" aria-label={ariaLabel}>
        {rows.map((row) => (
          <div
            key={row.id}
            role="listitem"
            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3"
          >
            <div className="text-sm font-bold text-[var(--foreground)] mb-2 truncate">
              {row.label}
            </div>
            <div
              className="flex gap-1.5 overflow-x-auto pb-1 -mx-0.5 px-0.5"
              tabIndex={0}
              role="group"
              aria-label={`${row.id} 일자별 상태`}
            >
              {dates.map((d) => {
                const info = buildInfo(d);
                const tone = cellTone ? cellTone(info, row) : 'normal';
                return (
                  <div
                    key={d.getTime()}
                    className={[
                      'flex flex-col items-center justify-center shrink-0 min-w-[52px] px-2 py-1.5 rounded-[var(--radius-md)] border',
                      toneClass[tone],
                      info.isToday ? 'ring-1 ring-[var(--accent)]' : '',
                    ].join(' ')}
                  >
                    <span className="text-[9px] font-semibold opacity-70">
                      {d.getMonth() + 1}/{d.getDate()}
                    </span>
                    <span className="text-[9px] opacity-60">{DAY_LABELS_SUN[d.getDay()]}</span>
                    <div className="text-[11px] font-bold leading-tight mt-0.5 text-center">
                      {renderCell(info, row)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
