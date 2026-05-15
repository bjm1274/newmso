'use client';

/**
 * 근태달력뷰.tsx
 *
 * 인사관리 > 근태기록 > 근태 달력 컴포넌트 (메인 진입점).
 * 메인 월간 격자(CalendarTable month-grid) + 상세 모달(일/주/월 패널)을 조립한다.
 *
 * 뷰별 마크업은 책임 분리를 위해 다음 파일에 위임:
 * - 근태달력뷰.day.tsx   : 일별 패널 (ResponsiveTable + 외부 정렬 헤더)
 * - 근태달력뷰.range.tsx : 주별/월별 패널 (CalendarTable staff-by-day)
 *
 * 제약
 * - JM: 단일 책임, ~300줄 이내 유지
 * - JM3: 기존 supabase·핸들러·view 모드 전환 보존
 * - JM4: 제네릭, any 금지 (불가피한 곳은 unknown 캐스팅 사용)
 * - JM6: 셀 버튼 키보드 접근, 정렬 헤더 aria-pressed
 */

import { useMemo } from 'react';

import {
  CalendarTable,
  type CalendarCellInfo,
  type CalendarCellTone,
} from '@/app/components/CalendarTable';

import { AttendanceCalendarDayPanel } from './근태달력뷰.day';
import { AttendanceCalendarRangePanel } from './근태달력뷰.range';
import { buildMonthCalendarCells } from './근태유틸';

type LocalStaffMember = {
  id: string;
  name: string;
  position: string;
  department: string;
  company: string;
  shift_type?: string;
  [key: string]: unknown;
};

type CalendarColumn = {
  key: string;
  dateStr: string;
  day: number;
  weekday: number;
  isWeekend: boolean;
};

type CalendarSummary = {
  worked: number;
  late: number;
  earlyLeave: number;
  absent: number;
  annualLeave: number;
  sickLeave: number;
  halfLeave: number;
  totalRecords: number;
};

export type AttendanceCalendarViewProps = {
  // 직원 데이터
  filtered: LocalStaffMember[];
  // 날짜 상태
  selectedMonth: string;
  selectedDate: string;
  // 달력 상세 상태
  calendarDetailView: 'day' | 'week' | 'month';
  setCalendarDetailView: (view: 'day' | 'week' | 'month') => void;
  isCalendarDetailOpen: boolean;
  setIsCalendarDetailOpen: (open: boolean) => void;
  // 근태 데이터
  attendanceMap: Map<string, unknown>;
  calendarAttendanceSummary: Map<string, CalendarSummary>;
  calendarCells: ReturnType<typeof buildMonthCalendarCells>;
  calendarDetailColumns: CalendarColumn[];
  weekDates: string[];
  // 핸들러
  syncSelectedDate: (dateStr: string) => void;
};

const VIEW_MODES: Array<{ id: 'day' | 'week' | 'month'; label: string }> = [
  { id: 'day', label: '일별' },
  { id: 'week', label: '주별' },
  { id: 'month', label: '월별' },
];

function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseMonth(selectedMonth: string): { start: Date; end: Date } | null {
  const [year, month] = selectedMonth.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return {
    start: new Date(year, month - 1, 1),
    end: new Date(year, month, 0),
  };
}

export default function AttendanceCalendarView({
  filtered,
  selectedMonth,
  selectedDate,
  calendarDetailView,
  setCalendarDetailView,
  isCalendarDetailOpen,
  setIsCalendarDetailOpen,
  attendanceMap,
  calendarAttendanceSummary,
  calendarDetailColumns,
  weekDates,
  syncSelectedDate,
}: AttendanceCalendarViewProps) {
  const calendarDetailLabel =
    calendarDetailView === 'day'
      ? selectedDate
      : calendarDetailView === 'week'
        ? `${weekDates[0]} ~ ${weekDates[weekDates.length - 1]}`
        : selectedMonth;

  const monthRange = useMemo(() => parseMonth(selectedMonth), [selectedMonth]);

  const summaryOf = (dateStr: string): CalendarSummary | undefined =>
    calendarAttendanceSummary.get(dateStr);

  const issueCountOf = (summary?: CalendarSummary): number => {
    if (!summary) return 0;
    return (
      (summary.late || 0) +
      (summary.earlyLeave || 0) +
      (summary.absent || 0) +
      (summary.annualLeave || 0) +
      (summary.sickLeave || 0) +
      (summary.halfLeave || 0)
    );
  };

  const cellTone = (cell: CalendarCellInfo): CalendarCellTone => {
    if (!cell.isCurrentMonth) return 'muted';
    const dateStr = formatDateStr(cell.date);
    if (dateStr === selectedDate) return 'ok';
    const summary = summaryOf(dateStr);
    const issues = issueCountOf(summary);
    if (issues > 0) return 'warn';
    return 'normal';
  };

  const renderMonthCell = (cell: CalendarCellInfo) => {
    if (!cell.isCurrentMonth) return null;
    const dateStr = formatDateStr(cell.date);
    const summary = summaryOf(dateStr);
    const workedCount = summary?.worked || 0;
    const issueCount = issueCountOf(summary);
    const isSelected = dateStr === selectedDate;

    return (
      <button
        type="button"
        data-testid={`attendance-calendar-cell-${dateStr}`}
        onClick={() => {
          syncSelectedDate(dateStr);
          setCalendarDetailView('day');
          setIsCalendarDetailOpen(true);
        }}
        aria-label={`${dateStr} 근태 상세 보기`}
        aria-pressed={isSelected}
        className="block w-full text-left focus:outline-none focus:ring-2 focus:ring-[var(--accent)] rounded-[var(--radius-sm)]"
      >
        <div className="flex flex-col gap-1">
          {workedCount > 0 ? (
            <div className="px-1.5 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-[9px] font-bold rounded-[var(--radius-sm)] flex justify-between items-center">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> 출근
              </span>
              <span className="bg-emerald-200 dark:bg-emerald-800 px-1.5 rounded-[var(--radius-sm)] text-emerald-800 dark:text-emerald-200">
                {workedCount}
              </span>
            </div>
          ) : (
            <div className="px-1.5 py-1 bg-[var(--tab-bg)] dark:bg-zinc-800 text-[9px] font-bold rounded-[var(--radius-sm)] flex justify-between items-center text-[var(--toss-gray-4)]">
              <span>기록 없음</span>
              <span>-</span>
            </div>
          )}
          {issueCount > 0 && (
            <div className="px-1.5 py-1 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 text-[9px] font-bold rounded-[var(--radius-sm)] flex justify-between items-center">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> 지각/결근
              </span>
              <span className="bg-rose-200 dark:bg-rose-800 px-1.5 rounded-[var(--radius-sm)] text-rose-800 dark:text-rose-200">
                {issueCount}
              </span>
            </div>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-[var(--radius-lg)] p-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-foreground">근태 달력</h3>
            <p className="text-[11px] font-medium text-[var(--toss-gray-4)] mt-1">
              날짜를 누르면 팝업으로 일별 · 주별 · 월별 근태를 확인합니다.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-[var(--tab-bg)] dark:bg-zinc-800/80 p-1 rounded-[var(--radius-lg)] border border-[var(--border)] dark:border-zinc-700 w-fit">
            {VIEW_MODES.map((mode) => (
              <button
                key={`calendar-open-${mode.id}`}
                type="button"
                data-testid={`attendance-calendar-open-${mode.id}`}
                onClick={() => {
                  setCalendarDetailView(mode.id);
                  setIsCalendarDetailOpen(true);
                }}
                aria-pressed={calendarDetailView === mode.id}
                className={`px-3 py-2 rounded-[var(--radius-md)] text-[12px] font-bold transition-all ${
                  calendarDetailView === mode.id
                    ? 'bg-[var(--card)] dark:bg-zinc-700 text-foreground shadow-sm ring-1 ring-zinc-900/5 dark:ring-white/10'
                    : 'text-[var(--toss-gray-4)] hover:text-foreground hover:bg-[var(--card)]/60 '
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
        {monthRange ? (
          <CalendarTable
            mode="month-grid"
            startDate={monthRange.start}
            endDate={monthRange.end}
            renderCell={renderMonthCell}
            cellTone={cellTone}
            ariaLabel={`${selectedMonth} 근태 달력`}
          />
        ) : (
          <div className="text-sm text-[var(--toss-gray-4)] p-6 text-center">
            표시할 달이 선택되지 않았습니다.
          </div>
        )}
      </div>

      {isCalendarDetailOpen && (
        <div
          className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          data-testid="attendance-calendar-detail-modal"
          onClick={() => setIsCalendarDetailOpen(false)}
        >
          <div
            className="w-full max-w-6xl max-h-[88vh] overflow-hidden rounded-[var(--radius-2xl)] bg-[var(--card)] border border-[var(--border)] shadow-[var(--shadow-premium)] flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 px-5 py-4 border-b border-[var(--border)] dark:border-zinc-800 bg-[var(--tab-bg)]/50 dark:bg-zinc-900/60">
              <div>
                <h3 className="text-lg font-bold text-foreground">근태 상세 보기</h3>
                <p className="text-[12px] font-medium text-[var(--toss-gray-4)] mt-1">{calendarDetailLabel}</p>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-[var(--card)] dark:bg-zinc-800/80 p-1 rounded-[var(--radius-lg)] border border-[var(--border)] dark:border-zinc-700">
                  {VIEW_MODES.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      data-testid={`attendance-calendar-detail-${mode.id}`}
                      onClick={() => setCalendarDetailView(mode.id)}
                      aria-pressed={calendarDetailView === mode.id}
                      className={`px-3 py-2 rounded-[var(--radius-md)] text-[12px] font-bold transition-all ${
                        calendarDetailView === mode.id
                          ? 'bg-[var(--card)] dark:bg-zinc-700 text-foreground shadow-sm ring-1 ring-zinc-900/5 dark:ring-white/10'
                          : 'text-[var(--toss-gray-4)] hover:text-foreground hover:bg-[var(--card)]/60 '
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  data-testid="attendance-calendar-detail-close"
                  onClick={() => setIsCalendarDetailOpen(false)}
                  className="w-10 h-10 rounded-full border border-[var(--border)] dark:border-zinc-700 bg-[var(--card)] dark:bg-zinc-800 text-[var(--toss-gray-4)] hover:text-foreground hover:border-blue-400 transition-colors flex items-center justify-center text-lg font-bold"
                  aria-label="근태 상세 닫기"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-5 overflow-auto custom-scrollbar bg-[var(--muted)]/20 space-y-4">
              {calendarDetailView === 'day' && (
                <AttendanceCalendarDayPanel
                  filtered={filtered}
                  selectedDate={selectedDate}
                  attendanceMap={
                    attendanceMap as unknown as Map<
                      string,
                      { check_in_time?: string | null; check_out_time?: string | null; work_hours_minutes?: number | null }
                    >
                  }
                />
              )}
              {calendarDetailView === 'week' && (
                <AttendanceCalendarRangePanel
                  mode="week"
                  filtered={filtered}
                  calendarDetailColumns={calendarDetailColumns}
                  attendanceMap={attendanceMap}
                  selectedMonth={selectedMonth}
                  weekDates={weekDates}
                />
              )}
              {calendarDetailView === 'month' && (
                <AttendanceCalendarRangePanel
                  mode="month"
                  filtered={filtered}
                  calendarDetailColumns={calendarDetailColumns}
                  attendanceMap={attendanceMap}
                  selectedMonth={selectedMonth}
                  weekDates={weekDates}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
