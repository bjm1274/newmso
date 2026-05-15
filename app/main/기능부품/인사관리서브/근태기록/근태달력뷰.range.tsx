'use client';

/**
 * 근태달력뷰.range.tsx
 *
 * 근태달력뷰 — 주별/월별 패널 (직원×일자 매트릭스).
 * CalendarTable의 staff-by-day 모드를 사용한다.
 *
 * 우측 출근일 합계는 직원명 row.label 옆에 배지로 표시 (CalendarTable 자체에
 * rowSummary 슬롯이 없고, 모바일 카드 모드에도 자연스럽게 노출되도록).
 *
 * 제약
 * - JM: 단일 책임, ~200줄 이내
 * - JM3: 기존 셀 상태 표시·출근일수 카운트 보존
 * - JM4: 제네릭, any 금지
 * - JM6: 셀에 의미 있는 aria-label 부여(상태 텍스트)
 */

import { useMemo } from 'react';

import {
  CalendarTable,
  type CalendarCellTone,
  type CalendarRow,
} from '@/app/components/CalendarTable';

import {
  buildAttendanceKey,
  getAttendanceStatusMeta,
  isWorkedAttendanceStatus,
  resolveAttendanceStatus,
} from './근태유틸';

type LocalStaffMember = {
  id: string;
  name: string;
  position: string;
  department: string;
  company: string;
  shift_type?: string;
  [key: string]: unknown;
};

type RangeRowData = {
  staff: LocalStaffMember;
  workDays: number;
};

type CalendarColumn = {
  key: string;
  dateStr: string;
  day: number;
  weekday: number;
  isWeekend: boolean;
};

export type AttendanceCalendarRangePanelProps = {
  mode: 'week' | 'month';
  filtered: LocalStaffMember[];
  /** 좌→우 순으로 표시할 날짜 컬럼 */
  calendarDetailColumns: CalendarColumn[];
  /** key = buildAttendanceKey(staffId, dateStr) */
  attendanceMap: Map<string, unknown>;
  selectedMonth: string;
  weekDates: string[];
};

function parseDateStr(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function statusToneOf(status: string | null | undefined): CalendarCellTone {
  if (!status) return 'muted';
  if (status === 'present') return 'ok';
  if (status === 'late' || status === 'early_leave' || status === 'half_leave') return 'warn';
  if (status === 'absent') return 'danger';
  if (status === 'annual_leave' || status === 'sick_leave' || status === 'holiday') return 'muted';
  return 'normal';
}

export function AttendanceCalendarRangePanel({
  mode,
  filtered,
  calendarDetailColumns,
  attendanceMap,
  selectedMonth,
  weekDates,
}: AttendanceCalendarRangePanelProps) {
  // 일자별 상태 사전 계산 (날짜→직원→상태). 두 번 순회 방지.
  const statusMatrix = useMemo(() => {
    const matrix = new Map<string, Map<string, string | null>>();
    filtered.forEach((staff) => {
      const inner = new Map<string, string | null>();
      calendarDetailColumns.forEach((col) => {
        const att = attendanceMap.get(buildAttendanceKey(staff.id, col.dateStr));
        const status = resolveAttendanceStatus(att, col.isWeekend);
        inner.set(col.dateStr, status);
      });
      matrix.set(staff.id, inner);
    });
    return matrix;
  }, [filtered, calendarDetailColumns, attendanceMap]);

  // 직원별 출근일수
  const rows: CalendarRow<RangeRowData>[] = useMemo(
    () =>
      filtered.map((staff) => {
        const inner = statusMatrix.get(staff.id);
        let workDays = 0;
        if (inner) {
          for (const status of inner.values()) {
            if (status && isWorkedAttendanceStatus(status)) workDays += 1;
          }
        }
        return {
          id: staff.id,
          data: { staff, workDays },
          label: (
            <div className="flex items-center justify-between gap-2 w-full">
              <div className="flex flex-col">
                <span className="font-bold text-sm text-foreground whitespace-nowrap">{staff.name}</span>
                <span className="text-[10px] text-[var(--toss-gray-4)] font-medium">{staff.department}</span>
              </div>
              <span className="shrink-0 inline-flex items-center px-2 py-1 rounded-[var(--radius-md)] bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-bold">
                출근 {workDays}일
              </span>
            </div>
          ),
        };
      }),
    [filtered, statusMatrix],
  );

  // 표시 범위 (날짜 컬럼이 비어있을 경우 안전 폴백)
  const { startDate, endDate } = useMemo(() => {
    if (calendarDetailColumns.length === 0) {
      const fallback = new Date();
      return { startDate: fallback, endDate: fallback };
    }
    return {
      startDate: parseDateStr(calendarDetailColumns[0].dateStr),
      endDate: parseDateStr(calendarDetailColumns[calendarDetailColumns.length - 1].dateStr),
    };
  }, [calendarDetailColumns]);

  const cellTone = (cell: { date: Date }, row?: CalendarRow<RangeRowData>): CalendarCellTone => {
    if (!row) return 'muted';
    const dateStr = `${cell.date.getFullYear()}-${String(cell.date.getMonth() + 1).padStart(2, '0')}-${String(
      cell.date.getDate(),
    ).padStart(2, '0')}`;
    const status = statusMatrix.get(row.data.staff.id)?.get(dateStr) ?? null;
    return statusToneOf(status);
  };

  const renderCell = (cell: { date: Date }, row?: CalendarRow<RangeRowData>) => {
    if (!row) return null;
    const dateStr = `${cell.date.getFullYear()}-${String(cell.date.getMonth() + 1).padStart(2, '0')}-${String(
      cell.date.getDate(),
    ).padStart(2, '0')}`;
    const status = statusMatrix.get(row.data.staff.id)?.get(dateStr) ?? null;
    if (!status) {
      return (
        <span className="text-[10px] font-bold text-[var(--toss-gray-3)]" aria-label="기록 없음">
          -
        </span>
      );
    }
    const meta = getAttendanceStatusMeta(status);
    return (
      <span className="text-[10px] font-bold leading-tight" aria-label={meta.label}>
        {meta.label}
      </span>
    );
  };

  const headerLabel =
    mode === 'week' ? `${weekDates[0]} ~ ${weekDates[6]}` : selectedMonth;
  const title = mode === 'week' ? '주별 근태 현황' : '월별 근태 대장';

  return (
    <div
      className="bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-[var(--radius-lg)] overflow-hidden shadow-sm"
      data-testid={`attendance-calendar-${mode}-panel`}
    >
      <div className="p-4 border-b border-[var(--border)] dark:border-zinc-800 bg-[var(--tab-bg)]/40">
        <h3 className="text-lg font-bold text-foreground">
          {title}
          <span className="text-[var(--toss-gray-4)] text-sm font-medium ml-2">{headerLabel}</span>
        </h3>
      </div>
      <div className="p-3">
        <CalendarTable<RangeRowData>
          mode="staff-by-day"
          startDate={startDate}
          endDate={endDate}
          rows={rows}
          renderCell={renderCell}
          cellTone={cellTone}
          rowHeaderLabel="직원명"
          ariaLabel={`${title} ${headerLabel}`}
          emptyMessage="표시할 직원이 없습니다."
        />
      </div>
    </div>
  );
}

export default AttendanceCalendarRangePanel;
