'use client';

/**
 * 근태달력뷰.day.tsx
 *
 * 근태달력뷰 — 일별 패널 (선택 날짜의 전 직원 출퇴근 현황).
 * ResponsiveTable로 마이그하여 모바일에서 카드 뷰로 자동 대응.
 * 정렬 컨트롤은 ResponsiveTable이 thead 정렬을 지원하지 않으므로
 * 패널 상단에 외부 분리 헤더로 노출.
 *
 * 제약
 * - JM: 단일 책임(일별 뷰만 처리), ~200줄 이내 유지
 * - JM3: 기존 정렬·상태 표시 동작 보존
 * - JM4: 제네릭 입력 타입, any 금지
 * - JM6: 정렬 버튼 aria-pressed/aria-label
 */

import { useMemo, useState } from 'react';

import { ResponsiveTable, type Column } from '@/app/components/ResponsiveTable';

import {
  buildAttendanceKey,
  formatAttendanceMinutes,
  getAttendanceStatusMeta,
  isWeekendDate,
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

type AttendanceRecord = {
  check_in_time?: string | null;
  check_out_time?: string | null;
  work_hours_minutes?: number | null;
};

type DaySortKey = 'default' | 'name' | 'status';
type DaySortDirection = 'asc' | 'desc';

const STATUS_SORT_ORDER: Record<string, number> = {
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

type DayRow = {
  id: string;
  name: string;
  meta: string;
  statusLabel: string;
  statusBadge: ReturnType<typeof getAttendanceStatusMeta>;
  checkIn: string;
  checkOut: string;
  workMinutes: number;
  statusSortOrder: number;
};

export type AttendanceCalendarDayPanelProps = {
  filtered: LocalStaffMember[];
  selectedDate: string;
  attendanceMap: Map<string, AttendanceRecord>;
};

function formatTime(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AttendanceCalendarDayPanel({
  filtered,
  selectedDate,
  attendanceMap,
}: AttendanceCalendarDayPanelProps) {
  const [sort, setSort] = useState<{ key: DaySortKey; direction: DaySortDirection }>({
    key: 'default',
    direction: 'asc',
  });

  const nameCollator = useMemo(
    () => new Intl.Collator('ko-KR', { numeric: true, sensitivity: 'base' }),
    [],
  );

  const baseRows: DayRow[] = useMemo(
    () =>
      filtered.map((staff) => {
        const attendance = attendanceMap.get(buildAttendanceKey(staff.id, selectedDate));
        const resolved = resolveAttendanceStatus(attendance, isWeekendDate(selectedDate)) || 'missing';
        const statusBadge = getAttendanceStatusMeta(resolved);
        return {
          id: staff.id,
          name: staff.name,
          meta: `${staff.department} · ${staff.position}`,
          statusLabel: statusBadge.label,
          statusBadge,
          checkIn: formatTime(attendance?.check_in_time),
          checkOut: formatTime(attendance?.check_out_time),
          workMinutes: Number(attendance?.work_hours_minutes ?? 0),
          statusSortOrder: STATUS_SORT_ORDER[resolved] ?? STATUS_SORT_ORDER.missing,
        };
      }),
    [filtered, attendanceMap, selectedDate],
  );

  const sortedRows = useMemo(() => {
    if (sort.key === 'default') return baseRows;
    const next = [...baseRows];
    next.sort((left, right) => {
      let compared = 0;
      if (sort.key === 'name') {
        compared = nameCollator.compare(left.name || '', right.name || '');
        if (compared === 0) compared = nameCollator.compare(left.meta || '', right.meta || '');
      } else if (sort.key === 'status') {
        compared = left.statusSortOrder - right.statusSortOrder;
        if (compared === 0) compared = nameCollator.compare(left.name || '', right.name || '');
      }
      return sort.direction === 'asc' ? compared : -compared;
    });
    return next;
  }, [baseRows, sort, nameCollator]);

  const toggleSort = (nextKey: Exclude<DaySortKey, 'default'>) => {
    setSort((cur) =>
      cur.key === nextKey
        ? { key: cur.key, direction: cur.direction === 'asc' ? 'desc' : 'asc' }
        : { key: nextKey, direction: 'asc' },
    );
  };

  const indicator = (target: Exclude<DaySortKey, 'default'>): string => {
    if (sort.key !== target) return '↕';
    return sort.direction === 'asc' ? '↑' : '↓';
  };

  const columns: Column<DayRow>[] = [
    {
      key: 'name',
      label: '직원 정보',
      primary: true,
      render: (row) => (
        <div className="flex flex-col">
          <span className="font-bold text-sm text-foreground">{row.name}</span>
          <span className="text-[11px] text-[var(--toss-gray-4)] font-medium mt-0.5">{row.meta}</span>
        </div>
      ),
    },
    {
      key: 'status',
      label: '상태',
      render: (row) => (
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold ring-1 ring-inset ${row.statusBadge.color} ${row.statusBadge.bg} ${row.statusBadge.ring}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${row.statusBadge.dot}`}></span>
          {row.statusLabel}
        </span>
      ),
    },
    {
      key: 'checkInOut',
      label: '출퇴근 시간',
      render: (row) => (
        <span className="font-mono text-sm font-bold text-foreground">
          {row.checkIn} / {row.checkOut}
        </span>
      ),
    },
    {
      key: 'workHours',
      label: '근무 시간',
      render: (row) => (
        <span className="font-mono text-sm font-bold text-blue-600 dark:text-blue-500">
          {formatAttendanceMinutes(row.workMinutes)}
        </span>
      ),
    },
  ];

  return (
    <div
      className="bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-[var(--radius-lg)] overflow-hidden shadow-sm"
      data-testid="attendance-calendar-day-panel"
    >
      <div className="p-4 border-b border-[var(--border)] dark:border-zinc-800 bg-[var(--tab-bg)]/40 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h3 className="text-lg font-bold text-foreground">
          일별 출퇴근 현황
          <span className="text-[var(--toss-gray-4)] text-sm font-medium ml-2">{selectedDate}</span>
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">정렬</span>
          <button
            type="button"
            data-testid="attendance-calendar-sort-name"
            onClick={() => toggleSort('name')}
            aria-pressed={sort.key === 'name'}
            aria-label="직원 이름순 정렬"
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--radius-md)] text-[11px] font-bold transition-colors ${
              sort.key === 'name'
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)] hover:text-foreground'
            }`}
          >
            <span>이름</span>
            <span aria-hidden="true" className="text-[10px] font-black">
              {indicator('name')}
            </span>
          </button>
          <button
            type="button"
            data-testid="attendance-calendar-sort-status"
            onClick={() => toggleSort('status')}
            aria-pressed={sort.key === 'status'}
            aria-label="근태 상태순 정렬"
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--radius-md)] text-[11px] font-bold transition-colors ${
              sort.key === 'status'
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)] hover:text-foreground'
            }`}
          >
            <span>상태</span>
            <span aria-hidden="true" className="text-[10px] font-black">
              {indicator('status')}
            </span>
          </button>
        </div>
      </div>
      <div className="p-3">
        <ResponsiveTable<DayRow>
          columns={columns}
          rows={sortedRows}
          keyField="id"
          emptyMessage="표시할 직원이 없습니다."
        />
      </div>
    </div>
  );
}

export default AttendanceCalendarDayPanel;
