'use client';

import { useMemo, useState } from 'react';

import {
  buildAttendanceKey,
  buildMonthCalendarCells,
  formatAttendanceMinutes,
  getAttendanceStatusMeta,
  isWeekendDate,
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

type CalendarColumn = {
  key: string;
  dateStr: string;
  day: number;
  weekday: number;
  isWeekend: boolean;
};

type AttendanceDaySortKey = 'default' | 'name' | 'status';
type AttendanceDaySortDirection = 'asc' | 'desc';

const ATTENDANCE_DAY_STATUS_SORT_ORDER: Record<string, number> = {
  present: 0,
  late: 1,
  early_leave: 2,
  absent: 3,
  annual_leave: 4,
  sick_leave: 4,
  half_leave: 4,
  holiday: 5,
  missing: 6,
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
  attendanceMap: Map<string, any>;
  calendarAttendanceSummary: Map<string, {
    worked: number;
    late: number;
    earlyLeave: number;
    absent: number;
    annualLeave: number;
    sickLeave: number;
    halfLeave: number;
    totalRecords: number;
  }>;
  calendarCells: ReturnType<typeof buildMonthCalendarCells>;
  calendarDetailColumns: CalendarColumn[];
  weekDates: string[];
  // 핸들러
  syncSelectedDate: (dateStr: string) => void;
};

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
  calendarCells,
  calendarDetailColumns,
  weekDates,
  syncSelectedDate,
}: AttendanceCalendarViewProps) {
  const [daySort, setDaySort] = useState<{
    key: AttendanceDaySortKey;
    direction: AttendanceDaySortDirection;
  }>({
    key: 'default',
    direction: 'asc',
  });

  const nameCollator = useMemo(
    () => new Intl.Collator('ko-KR', { numeric: true, sensitivity: 'base' }),
    [],
  );

  const calendarDetailLabel =
    calendarDetailView === 'day'
      ? selectedDate
      : calendarDetailView === 'week'
        ? `${weekDates[0]} ~ ${weekDates[weekDates.length - 1]}`
        : selectedMonth;

  const dayAttendanceRows = useMemo(
    () =>
      filtered.map((staff: LocalStaffMember) => {
        const attendance = attendanceMap.get(buildAttendanceKey(staff.id, selectedDate));
        const resolvedStatus = resolveAttendanceStatus(attendance, isWeekendDate(selectedDate)) || 'missing';
        const statusMeta = getAttendanceStatusMeta(resolvedStatus);
        const checkIn = attendance?.check_in_time
          ? new Date(attendance.check_in_time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
          : '-';
        const checkOut = attendance?.check_out_time
          ? new Date(attendance.check_out_time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
          : '-';

        return {
          staff,
          attendance,
          resolvedStatus,
          statusMeta,
          checkIn,
          checkOut,
          statusSortOrder: ATTENDANCE_DAY_STATUS_SORT_ORDER[resolvedStatus] ?? ATTENDANCE_DAY_STATUS_SORT_ORDER.missing,
        };
      }),
    [attendanceMap, filtered, selectedDate],
  );

  const sortedDayAttendanceRows = useMemo(() => {
    if (daySort.key === 'default') {
      return dayAttendanceRows;
    }

    const sortedRows = [...dayAttendanceRows];

    sortedRows.sort((left, right) => {
      let compared = 0;

      if (daySort.key === 'name') {
        compared = nameCollator.compare(left.staff.name || '', right.staff.name || '');
        if (compared === 0) {
          compared = nameCollator.compare(left.staff.department || '', right.staff.department || '');
        }
      } else if (daySort.key === 'status') {
        compared = left.statusSortOrder - right.statusSortOrder;
        if (compared === 0) {
          compared = nameCollator.compare(left.staff.name || '', right.staff.name || '');
        }
      }

      return daySort.direction === 'asc' ? compared : -compared;
    });

    return sortedRows;
  }, [dayAttendanceRows, daySort, nameCollator]);

  const handleDaySort = (nextKey: Exclude<AttendanceDaySortKey, 'default'>) => {
    setDaySort((currentSort) => {
      if (currentSort.key === nextKey) {
        return {
          key: currentSort.key,
          direction: currentSort.direction === 'asc' ? 'desc' : 'asc',
        };
      }

      return {
        key: nextKey,
        direction: 'asc',
      };
    });
  };

  const getDaySortIndicator = (targetKey: Exclude<AttendanceDaySortKey, 'default'>) => {
    if (daySort.key !== targetKey) return '↕';
    return daySort.direction === 'asc' ? '↑' : '↓';
  };

  const renderIntegratedDayPanel = () => (
    <div className="bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-[var(--radius-lg)] overflow-hidden shadow-sm" data-testid="attendance-calendar-day-panel">
      <div className="p-4 border-b border-[var(--border)] dark:border-zinc-800 bg-[var(--tab-bg)]/40">
        <h3 className="text-lg font-bold text-foreground">일별 출퇴근 현황 <span className="text-[var(--toss-gray-4)] text-sm font-medium ml-2">{selectedDate}</span></h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-[var(--tab-bg)] dark:bg-zinc-900/50 border-b border-[var(--border)] dark:border-zinc-800">
            <tr>
              <th className="px-4 py-4 text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">
                <button
                  type="button"
                  data-testid="attendance-calendar-sort-name"
                  onClick={() => handleDaySort('name')}
                  className={`inline-flex items-center gap-1 rounded-[var(--radius-sm)] transition-colors ${
                    daySort.key === 'name' ? 'text-[var(--foreground)]' : 'hover:text-[var(--foreground)]'
                  }`}
                >
                  <span>직원 정보</span>
                  <span aria-hidden="true" className="text-[10px] font-black">{getDaySortIndicator('name')}</span>
                </button>
              </th>
              <th className="px-4 py-4 text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">
                <button
                  type="button"
                  data-testid="attendance-calendar-sort-status"
                  onClick={() => handleDaySort('status')}
                  className={`inline-flex items-center gap-1 rounded-[var(--radius-sm)] transition-colors ${
                    daySort.key === 'status' ? 'text-[var(--foreground)]' : 'hover:text-[var(--foreground)]'
                  }`}
                >
                  <span>상태</span>
                  <span aria-hidden="true" className="text-[10px] font-black">{getDaySortIndicator('status')}</span>
                </button>
              </th>
              <th className="px-4 py-4 text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">출퇴근 시간</th>
              <th className="px-4 py-4 text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">근무 시간</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {sortedDayAttendanceRows.map(({ staff, attendance, statusMeta, checkIn, checkOut }) => {
              return (
                <tr key={`calendar-day-${staff.id}`} className="hover:bg-[var(--tab-bg)]/50 dark:hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-4">
                    <div className="flex flex-col">
                      <span className="font-bold text-sm text-foreground">{staff.name}</span>
                      <span className="text-[11px] text-[var(--toss-gray-4)] font-medium mt-0.5">{staff.department} · {staff.position}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold ring-1 ring-inset ${statusMeta.color} ${statusMeta.bg} ${statusMeta.ring}`}>
                      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${statusMeta.dot}`}></span>
                      {statusMeta.label}
                    </span>
                  </td>
                  <td className="px-4 py-4 font-mono text-sm font-bold text-foreground">{checkIn} / {checkOut}</td>
                  <td className="px-4 py-4 font-mono text-sm font-bold text-blue-600 dark:text-blue-500">{formatAttendanceMinutes(attendance?.work_hours_minutes)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderIntegratedRangePanel = (mode: 'week' | 'month') => (
    <div className="bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-[var(--radius-lg)] overflow-hidden shadow-sm" data-testid={`attendance-calendar-${mode}-panel`}>
      <div className="p-4 border-b border-[var(--border)] dark:border-zinc-800 bg-[var(--tab-bg)]/40">
        <h3 className="text-lg font-bold text-foreground">
          {mode === 'week' ? '주별 근태 현황' : '월별 근태 대장'}
          <span className="text-[var(--toss-gray-4)] text-sm font-medium ml-2">{mode === 'week' ? `${weekDates[0]} ~ ${weekDates[6]}` : selectedMonth}</span>
        </h3>
      </div>
      <div className="overflow-x-auto custom-scrollbar">
        <table className={`w-full text-left border-collapse ${mode === 'week' ? 'min-w-[980px]' : 'min-w-[1800px]'}`}>
          <thead className="bg-[var(--tab-bg)] dark:bg-zinc-900/80 border-b border-[var(--border)] dark:border-zinc-800 text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-wider">
            <tr>
              <th className="px-4 py-4 sticky left-0 bg-[var(--tab-bg)] dark:bg-zinc-900/90 z-10 border-r border-[var(--border)] dark:border-zinc-800">직원명</th>
              {calendarDetailColumns.map((column) => (
                <th key={`${mode}-${column.key}`} className={`px-2 py-4 text-center border-r border-[var(--border)] dark:border-zinc-800 min-w-[78px] ${column.isWeekend ? 'text-red-400 dark:text-red-500' : ''}`}>
                  <div className="flex flex-col items-center">
                    <span>{column.day}</span>
                    <span className="text-[9px] font-medium opacity-60 mt-0.5">{['일', '월', '화', '수', '목', '금', '토'][column.weekday]}</span>
                  </div>
                </th>
              ))}
              <th className="px-4 py-4 text-center text-blue-600 dark:text-blue-400 bg-blue-500/10/50 dark:bg-blue-900/10">출근일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {filtered.map((s: LocalStaffMember) => {
              let workDays = 0;
              return (
                <tr key={`${mode}-${s.id}`} className="hover:bg-[var(--tab-bg)]/50 dark:hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3 sticky left-0 bg-[var(--card)] dark:bg-zinc-900 z-10 border-r border-[var(--border)] dark:border-zinc-800">
                    <div className="flex flex-col">
                      <span className="font-bold text-sm text-foreground whitespace-nowrap">{s.name}</span>
                      <span className="text-[10px] text-[var(--toss-gray-4)] font-medium">{s.department}</span>
                    </div>
                  </td>
                  {calendarDetailColumns.map((column) => {
                    const att = attendanceMap.get(buildAttendanceKey(s.id, column.dateStr));
                    const status = resolveAttendanceStatus(att, column.isWeekend);
                    const meta = getAttendanceStatusMeta(status || 'missing');
                    if (isWorkedAttendanceStatus(status)) workDays += 1;
                    return (
                      <td key={`${mode}-${s.id}-${column.key}`} className="p-1.5 border-r border-[var(--border)] dark:border-zinc-800 text-center align-middle">
                        {status ? (
                          <div className={`min-h-[38px] px-2 py-2 mx-auto flex items-center justify-center rounded-[var(--radius-lg)] text-[10px] leading-tight font-bold ring-1 ring-inset ${meta.color} ${meta.bg} ${meta.ring}`}>
                            {meta.label}
                          </div>
                        ) : (
                          <div className="min-h-[38px] px-2 py-2 mx-auto flex items-center justify-center rounded-[var(--radius-lg)] text-[10px] font-bold text-[var(--toss-gray-3)] bg-[var(--page-bg)] dark:bg-zinc-800/60 ring-1 ring-inset ring-zinc-200 dark:ring-zinc-700">-</div>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-center bg-blue-500/10/30 dark:bg-blue-900/10 font-bold text-blue-600 dark:text-blue-400 text-sm">{workDays}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-[var(--radius-lg)] p-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-foreground">근태 달력</h3>
            <p className="text-[11px] font-medium text-[var(--toss-gray-4)] mt-1">날짜를 누르면 팝업으로 일별 · 주별 · 월별 근태를 확인합니다.</p>
          </div>
          <div className="flex items-center gap-2 bg-[var(--tab-bg)] dark:bg-zinc-800/80 p-1 rounded-[var(--radius-lg)] border border-[var(--border)] dark:border-zinc-700 w-fit">
            {[
              { id: 'day', label: '일별' },
              { id: 'week', label: '주별' },
              { id: 'month', label: '월별' },
            ].map((mode) => (
              <button
                key={`calendar-open-${mode.id}`}
                type="button"
                data-testid={`attendance-calendar-open-${mode.id}`}
                onClick={() => {
                  setCalendarDetailView(mode.id as 'day' | 'week' | 'month');
                  setIsCalendarDetailOpen(true);
                }}
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
        <div className="overflow-x-auto custom-scrollbar -mx-1 px-1">
          <div className="grid min-w-[560px] grid-cols-7 gap-2 md:gap-4">
            {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
              <div key={day} className={`text-center text-[12px] font-bold uppercase pb-3 mb-2 border-b border-[var(--border-subtle)] dark:border-zinc-800 ${idx === 0 ? 'text-rose-500' : idx === 6 ? 'text-blue-500' : 'text-[var(--toss-gray-4)]'}`}>{day}</div>
            ))}
            {calendarCells.map((cell) => {
              const summary = cell.dateStr ? calendarAttendanceSummary.get(cell.dateStr) : null;
              const isSelected = cell.dateStr === selectedDate;
              const workedCount = summary?.worked || 0;
              const issueCount =
                (summary?.late || 0) +
                (summary?.earlyLeave || 0) +
                (summary?.absent || 0) +
                (summary?.annualLeave || 0) +
                (summary?.sickLeave || 0) +
                (summary?.halfLeave || 0);

              return (
                <button
                  key={cell.key}
                  type="button"
                  data-testid={cell.dateStr ? `attendance-calendar-cell-${cell.dateStr}` : undefined}
                  onClick={() => {
                    if (!cell.dateStr) return;
                    syncSelectedDate(cell.dateStr);
                    setCalendarDetailView('day');
                    setIsCalendarDetailOpen(true);
                  }}
                  className={`min-h-[130px] p-3 border rounded-[var(--radius-lg)] transition-all text-left ${
                    cell.isCurrentMonth
                      ? isSelected
                        ? 'bg-blue-500/10 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 shadow-sm'
                        : 'bg-[var(--card)] dark:bg-zinc-800/50 border-[var(--border)] dark:border-zinc-700 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 cursor-pointer'
                      : 'bg-[var(--tab-bg)]/50 dark:bg-zinc-900/30 border-transparent opacity-40'
                  }`}
                  disabled={!cell.isCurrentMonth}
                >
                  {cell.isCurrentMonth && cell.day != null && (
                    <div className="flex flex-col h-full">
                      <span className={`text-sm font-bold flex justify-between items-center ${cell.isWeekend ? 'text-rose-500' : 'text-foreground'}`}>
                        {cell.day}
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>}
                      </span>

                      <div className="mt-auto space-y-1.5">
                        {workedCount > 0 ? (
                          <div className="px-2 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-[9px] font-bold rounded-lg flex justify-between items-center group">
                            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> 출근</span>
                            <span className="bg-emerald-200 dark:bg-emerald-800 px-1.5 rounded-md text-emerald-800 dark:text-emerald-200">{workedCount}</span>
                          </div>
                        ) : (
                          <div className="px-2 py-1.5 bg-[var(--tab-bg)] dark:bg-zinc-800 text-[9px] font-bold rounded-lg flex justify-between items-center text-[var(--toss-gray-4)]">
                            <span>기록 없음</span>
                            <span>-</span>
                          </div>
                        )}
                        {issueCount > 0 && (
                          <div className="px-2 py-1.5 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 text-[9px] font-bold rounded-lg flex justify-between items-center">
                            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> 지각/결근/휴가</span>
                            <span className="bg-rose-200 dark:bg-rose-800 px-1.5 rounded-md text-rose-800 dark:text-rose-200">{issueCount}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
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
                  {[
                    { id: 'day', label: '일별' },
                    { id: 'week', label: '주별' },
                    { id: 'month', label: '월별' },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      data-testid={`attendance-calendar-detail-${mode.id}`}
                      onClick={() => setCalendarDetailView(mode.id as 'day' | 'week' | 'month')}
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
              {calendarDetailView === 'day' && renderIntegratedDayPanel()}
              {calendarDetailView === 'week' && renderIntegratedRangePanel('week')}
              {calendarDetailView === 'month' && renderIntegratedRangePanel('month')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
