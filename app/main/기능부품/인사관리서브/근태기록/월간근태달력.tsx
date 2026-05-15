'use client';
import { useMemo, useState } from 'react';
import {
  CalendarTable,
  type CalendarCellTone,
  type CalendarRow,
} from '@/app/components/CalendarTable';

/**
 * 월간근태달력
 *
 * 직원 × 일자 매트릭스를 주차 단위(7일)로 보여주는 화면.
 * 매트릭스 부분은 CalendarTable(staff-by-day 모드)로 위임.
 *
 * 기존 prop 시그니처 보존:
 *  - calendarData: { staff, days: { date: 'YYYY-MM-DD', status, check_in, check_out, ... } }[]
 *  - targetMonth: 'YYYY-MM'
 *  - onCellClick(event, day, staff)
 *  - onBulkNormal(staff)
 */

type DayCell = {
  date: string;
  status: string;
  check_in?: string;
  check_out?: string;
};

type StaffRow = {
  staff: { id: string | number; name: string };
  days: DayCell[];
};

function statusToTone(status: string | undefined): CalendarCellTone {
  if (!status || status === 'none') return 'muted';
  if (status === '정상') return 'ok';
  if (status === '지각') return 'danger';
  if (status.includes('휴가')) return 'warn';
  return 'normal';
}

export default function MonthlyCalendar({
  calendarData,
  targetMonth,
  onCellClick,
  onBulkNormal,
}: Record<string, unknown>) {
  const [activeWeek, setActiveWeek] = useState(1);

  const _targetMonth = (targetMonth as string) ?? '';
  const _calendarData = (calendarData as StaffRow[]) ?? [];
  const _onBulkNormal = onBulkNormal as ((staff: StaffRow['staff']) => void) | undefined;
  const _onCellClick = onCellClick as
    | ((e: React.MouseEvent, d: DayCell, staff: StaffRow['staff']) => void)
    | undefined;

  // 1. 해당 월의 마지막 날짜 (30/31/28...)
  const [yearStr, monthStr] = _targetMonth.split('-');
  const yearNum = Number(yearStr);
  const monthNum = Number(monthStr);
  const lastDay = useMemo(
    () => (yearNum && monthNum ? new Date(yearNum, monthNum, 0).getDate() : 31),
    [yearNum, monthNum],
  );

  const getWeekRange = (week: number) => {
    const start = (week - 1) * 7 + 1;
    let end = week * 7;
    if (end > lastDay) end = lastDay;
    return { start, end };
  };

  const { start: startDay, end: endDay } = getWeekRange(activeWeek);
  const totalWeeks = Math.ceil(lastDay / 7);

  // CalendarTable에 넘길 시작·끝 날짜
  const startDate = useMemo(
    () => new Date(yearNum || 2000, (monthNum || 1) - 1, startDay),
    [yearNum, monthNum, startDay],
  );
  const endDate = useMemo(
    () => new Date(yearNum || 2000, (monthNum || 1) - 1, endDay),
    [yearNum, monthNum, endDay],
  );

  // 일자별 데이터 lookup용 인덱스 (staffId + date → DayCell)
  const dayIndex = useMemo(() => {
    const map = new Map<string, DayCell>();
    _calendarData.forEach((r) => {
      r.days.forEach((d) => {
        map.set(`${r.staff.id}__${d.date}`, d);
      });
    });
    return map;
  }, [_calendarData]);

  // CalendarTable 행 데이터
  const rows: CalendarRow<StaffRow>[] = useMemo(
    () =>
      _calendarData.map((r) => ({
        id: String(r.staff.id),
        data: r,
        label: (
          <button
            type="button"
            onClick={() => _onBulkNormal?.(r.staff)}
            className="text-left hover:text-[var(--accent)] transition-colors w-full"
          >
            {r.staff.name}
          </button>
        ),
      })),
    [_calendarData, _onBulkNormal],
  );

  const isoDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  return (
    <div className="flex flex-col h-full bg-[var(--card)] relative">
      {/* 상단: 주차 선택 */}
      <div className="p-3 sm:p-4 border-b bg-[var(--muted)] flex flex-wrap justify-between items-center gap-2 shrink-0">
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <h3 className="font-semibold text-[var(--foreground)] text-base sm:text-lg">
            🗓️ {_targetMonth} 월간 근태 현황
          </h3>
          <div className="flex p-1 sm:p-1.5 bg-[var(--toss-gray-2)] rounded-[var(--radius-md)] gap-1 shadow-inner overflow-x-auto">
            {Array.from({ length: totalWeeks }, (_, i) => i + 1).map((week) => {
              const range = getWeekRange(week);
              const active = activeWeek === week;
              return (
                <button
                  key={week}
                  type="button"
                  onClick={() => setActiveWeek(week)}
                  aria-pressed={active}
                  className={`px-3 sm:px-5 py-1.5 sm:py-2 rounded-[var(--radius-lg)] text-xs sm:text-sm font-bold transition-all flex flex-col items-center whitespace-nowrap
                    ${active ? 'bg-[var(--card)] shadow-md text-[var(--accent)]' : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'}`}
                >
                  <span>{week}주차</span>
                  <span className="text-[10px] sm:text-[11px] opacity-60">
                    {range.start}~{range.end}일
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="hidden sm:block text-[11px] text-[var(--toss-gray-3)] font-bold bg-[var(--card)] px-3 py-1.5 rounded-[var(--radius-md)] border shadow-sm">
          💡 31일까지 있는 달은 자동으로 5주차가 생성됩니다.
        </div>
      </div>

      {/* 매트릭스 */}
      <div className="flex-1 overflow-auto bg-[var(--card)] p-2 sm:p-3">
        <CalendarTable
          mode="staff-by-day"
          startDate={startDate}
          endDate={endDate}
          rows={rows}
          ariaLabel={`${_targetMonth} ${activeWeek}주차 근태 매트릭스`}
          rowHeaderLabel="직원명"
          emptyMessage="표시할 직원이 없습니다."
          cellTone={(cell, row) => {
            if (!row) return 'muted';
            const d = dayIndex.get(`${row.id}__${isoDate(cell.date)}`);
            return statusToTone(d?.status);
          }}
          renderCell={(cell, row) => {
            if (!row) return null;
            const d = dayIndex.get(`${row.id}__${isoDate(cell.date)}`);
            if (!d || d.status === 'none') {
              return <span className="text-xs opacity-20 font-semibold">-</span>;
            }
            return (
              <button
                type="button"
                onClick={(e) => _onCellClick?.(e, d, row.data.staff)}
                className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:opacity-80 transition-all p-1 min-h-[56px]"
                aria-label={`${row.data.staff.name} ${d.date} ${d.status}`}
              >
                <div className="text-[11px] font-semibold mb-1">{d.status}</div>
                <div className="text-[10px] font-mono font-bold opacity-70 leading-tight text-center">
                  {d.check_in?.slice(11, 16) || '--:--'}
                  <br />~ {d.check_out?.slice(11, 16) || '--:--'}
                </div>
              </button>
            );
          }}
        />
      </div>
    </div>
  );
}
