'use client';

/**
 * CalendarTable.tsx
 *
 * 캘린더 격자 기반 데이터를 표시하는 반응형 컴포넌트.
 *
 * 두 가지 모드 지원:
 * 1. `'month-grid'` — 7일×N주 캘린더 (월간 달력 형태). 데스크톱/모바일 모두 7컬럼 유지.
 * 2. `'staff-by-day'` — 직원행 × 날짜열 매트릭스. 데스크톱은 sticky 좌측 + 가로 스크롤,
 *    모바일은 카드 1장 = 직원 + 카드 안 가로 스크롤 일자 칩.
 *
 * 시범 적용: 월간근태달력 (staff-by-day)
 * 향후 적용: 근태일정뷰 (staff-by-day), 근태달력뷰 (month-grid)
 *
 * 제약 준수
 * - JM: 단일 책임, 본 파일은 진입점/조립 역할 (뷰 마크업은 .internal.tsx로 분리)
 * - JM3: 기존 호출자 로직 보존 (셀 렌더는 renderCell이 책임)
 * - JM4: 제네릭 타입, any 금지
 * - JM6: role="grid", role="row", role="gridcell", aria-label
 */

import { EmptyState } from '@/app/components/StatePanel';
import {
  type CalendarCellInfo,
  type CalendarRow,
  type CalendarTableProps,
} from './CalendarTable.types';
import { MonthGridView, StaffByDayView } from './CalendarTable.internal';

export type {
  CalendarCellInfo,
  CalendarCellTone,
  CalendarRow,
  CalendarTableMode,
  CalendarTableProps,
} from './CalendarTable.types';

// ---------------------------------------------------------------------------
// 날짜 유틸 (모듈 로컬)
// ---------------------------------------------------------------------------
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildDateRange(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const cur = startOfDay(start);
  const last = startOfDay(end);
  while (cur.getTime() <= last.getTime()) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function makeBuildInfo(monthRef: Date, today: Date, holidaySet: Set<number>) {
  return (date: Date): CalendarCellInfo => {
    const dow = date.getDay();
    return {
      date,
      isCurrentMonth: date.getMonth() === monthRef.getMonth(),
      isToday: sameDay(date, today),
      isWeekend: dow === 0 || dow === 6,
      isHoliday: holidaySet.has(startOfDay(date).getTime()),
    };
  };
}

// ---------------------------------------------------------------------------
// 진입점
// ---------------------------------------------------------------------------
export function CalendarTable<R>({
  mode,
  startDate,
  endDate,
  rows = [],
  renderCell,
  cellTone,
  weekStartsOn = 0,
  holidays,
  rowHeaderLabel = '직원',
  ariaLabel,
  emptyMessage = '표시할 데이터가 없습니다.',
  className = '',
}: CalendarTableProps<R>) {
  const today = startOfDay(new Date());
  const holidaySet = new Set((holidays ?? []).map((d) => startOfDay(d).getTime()));
  const dates = buildDateRange(startDate, endDate);

  if (dates.length === 0) {
    return (
      <div className={className}>
        <EmptyState title={emptyMessage} compact />
      </div>
    );
  }

  const buildInfo = makeBuildInfo(startDate, today, holidaySet);

  if (mode === 'month-grid') {
    return (
      <MonthGridView<R>
        dates={dates}
        weekStartsOn={weekStartsOn}
        buildInfo={buildInfo}
        renderCell={renderCell}
        cellTone={cellTone}
        ariaLabel={ariaLabel}
        className={className}
      />
    );
  }

  if (rows.length === 0) {
    return (
      <div className={className}>
        <EmptyState title={emptyMessage} compact />
      </div>
    );
  }

  return (
    <StaffByDayView<R>
      dates={dates}
      rows={rows as CalendarRow<R>[]}
      buildInfo={buildInfo}
      renderCell={renderCell}
      cellTone={cellTone}
      rowHeaderLabel={rowHeaderLabel}
      ariaLabel={ariaLabel}
      className={className}
    />
  );
}

export default CalendarTable;
