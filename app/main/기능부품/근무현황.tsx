'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

type WorkShiftRow = {
  id: string;
  name?: string | null;
  start_time?: string | null;
  end_time?: string | null;
};

type StaffRow = {
  id: string;
  name?: string | null;
  shift_id?: string | null;
  department?: string | null;
  position?: string | null;
  status?: string | null;
};

type ShiftAssignmentRow = {
  staff_id: string;
  shift_id?: string | null;
  work_date: string;
};

type AttendanceRow = {
  staff_id: string;
  date?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  check_in_time?: string | null;
  check_out_time?: string | null;
  status?: string | null;
};

type AttendancesRow = {
  staff_id: string;
  work_date?: string | null;
  check_in_time?: string | null;
  check_out_time?: string | null;
  status?: string | null;
};

type ShiftBand = 'D' | 'E' | 'N' | 'OTHER' | 'NONE';

type ShiftCardRow = {
  shiftId: string;
  shiftName: string;
  timeRange: string;
  band: ShiftBand;
  staffs: StaffRow[];
  activeStaffIds: Set<string>;
};

type DayShiftCounts = {
  total: number;
  D: number;
  E: number;
  N: number;
  OTHER: number;
};

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const BAND_ORDER: Record<ShiftBand, number> = {
  D: 0,
  E: 1,
  N: 2,
  OTHER: 3,
  NONE: 4,
};

function padDatePart(value: number) {
  return String(value).padStart(2, '0');
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function shiftTimeLabel(value?: string | null) {
  if (!value) return '--:--';
  return String(value).slice(0, 5);
}

function formatShiftRange(shift?: WorkShiftRow | null) {
  if (!shift) return '-';
  return `${shiftTimeLabel(shift.start_time)} - ${shiftTimeLabel(shift.end_time)}`;
}

function formatDisplayDate(date: Date) {
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
}

function formatMonthLabel(date: Date) {
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
}

function formatClockLabel(value?: string | null) {
  if (!value) return null;
  const raw = String(value);
  const isoMatch = raw.match(/T(\d{2}:\d{2})/);
  if (isoMatch) return isoMatch[1];
  const timeMatch = raw.match(/(\d{2}:\d{2})/);
  if (timeMatch) return timeMatch[1];
  return raw.slice(0, 5);
}

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthEnd(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function getMonthGrid(date: Date) {
  const firstDay = getMonthStart(date);
  const endDay = getMonthEnd(date);
  const startWeekday = firstDay.getDay();
  const daysInMonth = endDay.getDate();

  const cells: Array<Date | null> = [];
  for (let index = 0; index < startWeekday; index += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(date.getFullYear(), date.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function inferShiftBand(shift?: WorkShiftRow | null): ShiftBand {
  if (!shift) return 'NONE';

  const name = String(shift.name || '').toLowerCase();
  if (name.includes('day') || name.includes('데이') || name.includes('주간') || /^d\b/.test(name)) {
    return 'D';
  }
  if (name.includes('evening') || name.includes('eve') || name.includes('이브') || name.includes('오후') || /^e\b/.test(name)) {
    return 'E';
  }
  if (name.includes('night') || name.includes('나이트') || name.includes('야간') || /^n\b/.test(name)) {
    return 'N';
  }

  const startHour = Number(String(shift.start_time || '').slice(0, 2));
  if (!Number.isNaN(startHour)) {
    if (startHour >= 20 || startHour < 5) return 'N';
    if (startHour >= 12) return 'E';
    return 'D';
  }

  return 'OTHER';
}

function getBandLabel(band: ShiftBand) {
  if (band === 'D') return 'Day';
  if (band === 'E') return 'Evening';
  if (band === 'N') return 'Night';
  if (band === 'NONE') return '미지정';
  return '기타';
}

function getBandBadgeClass(band: ShiftBand) {
  if (band === 'D') return 'bg-sky-100 text-sky-700 border-sky-200';
  if (band === 'E') return 'bg-amber-100 text-amber-700 border-amber-200';
  if (band === 'N') return 'bg-violet-100 text-violet-700 border-violet-200';
  if (band === 'NONE') return 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)] border-[var(--border)]';
  return 'bg-emerald-100 text-emerald-700 border-emerald-200';
}

function buildEmptyCounts(): DayShiftCounts {
  return { total: 0, D: 0, E: 0, N: 0, OTHER: 0 };
}

function cloneCounts(source: DayShiftCounts) {
  return { total: source.total, D: source.D, E: source.E, N: source.N, OTHER: source.OTHER };
}

export default function WorkStatus({ user }: { user?: any }) {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [workShifts, setWorkShifts] = useState<WorkShiftRow[]>([]);
  const [staffs, setStaffs] = useState<StaffRow[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignmentRow[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState('전체');
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => toDateKey(today), [today]);
  const selectedDateKey = useMemo(() => toDateKey(selectedDate), [selectedDate]);

  const queryRange = useMemo(() => {
    const start = getMonthStart(selectedDate);
    const end = getMonthEnd(selectedDate);
    return {
      startKey: toDateKey(start),
      endKey: toDateKey(end),
    };
  }, [selectedDate]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const [shiftRes, staffRes, assignmentRes, attendanceRes, attendancesRes] = await Promise.allSettled([
          supabase.from('work_shifts').select('id, name, start_time, end_time').eq('is_active', true),
          supabase.from('staff_members').select('id, name, shift_id, department, position, status'),
          supabase
            .from('shift_assignments')
            .select('staff_id, shift_id, work_date')
            .gte('work_date', queryRange.startKey)
            .lte('work_date', queryRange.endKey),
          supabase
            .from('attendance')
            .select('staff_id, date, check_in, check_out, status')
            .eq('date', todayKey),
          supabase
            .from('attendances')
            .select('staff_id, work_date, check_in_time, check_out_time, status')
            .eq('work_date', todayKey),
        ]);

        if (cancelled) return;

        setWorkShifts(
          shiftRes.status === 'fulfilled' && Array.isArray(shiftRes.value.data)
            ? (shiftRes.value.data as WorkShiftRow[])
            : [],
        );
        setStaffs(
          staffRes.status === 'fulfilled' && Array.isArray(staffRes.value.data)
            ? (staffRes.value.data as StaffRow[])
            : [],
        );
        setAssignments(
          assignmentRes.status === 'fulfilled' && Array.isArray(assignmentRes.value.data)
            ? (assignmentRes.value.data as ShiftAssignmentRow[])
            : [],
        );
        const attendanceRows =
          attendanceRes.status === 'fulfilled' && Array.isArray(attendanceRes.value.data)
            ? (attendanceRes.value.data as AttendanceRow[])
            : [];
        const attendancesRows =
          attendancesRes.status === 'fulfilled' && Array.isArray(attendancesRes.value.data)
            ? (attendancesRes.value.data as AttendancesRow[])
            : [];

        const mergedAttendance = new Map<string, AttendanceRow>();
        attendanceRows.forEach((row) => {
          mergedAttendance.set(row.staff_id, { ...row });
        });
        attendancesRows.forEach((row) => {
          const existing = mergedAttendance.get(row.staff_id);
          mergedAttendance.set(row.staff_id, {
            ...existing,
            staff_id: row.staff_id,
            date: existing?.date || row.work_date || todayKey,
            check_in_time: row.check_in_time ?? existing?.check_in_time ?? null,
            check_out_time: row.check_out_time ?? existing?.check_out_time ?? null,
            status: row.status ?? existing?.status ?? null,
          });
        });

        setTodayAttendance(Array.from(mergedAttendance.values()));
        setLastRefreshAt(new Date());
      } catch {
        if (cancelled) return;
        setWorkShifts([]);
        setStaffs([]);
        setAssignments([]);
        setTodayAttendance([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [queryRange.endKey, queryRange.startKey, refreshNonce, todayKey]);

  useEffect(() => {
    const scheduleRefresh = () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => setRefreshNonce((current) => current + 1), 250);
    };

    const channel = supabase
      .channel(`work-status-live-${user?.id || 'guest'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendances' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_assignments' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_members' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_shifts' }, scheduleRefresh)
      .subscribe();

    const handleVisible = () => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    };

    window.addEventListener('focus', scheduleRefresh);
    document.addEventListener('visibilitychange', handleVisible);

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      window.removeEventListener('focus', scheduleRefresh);
      document.removeEventListener('visibilitychange', handleVisible);
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!isDetailModalOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsDetailModalOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isDetailModalOpen]);

  const activeStaffsOnly = useMemo(
    () =>
      staffs
        .filter((staff) => staff.status !== '퇴사')
        .sort((left, right) =>
          String(left.name || '').localeCompare(String(right.name || ''), 'ko'),
        ),
    [staffs],
  );

  const departmentOptions = useMemo(
    () =>
      Array.from(
        new Set(
          activeStaffsOnly
            .map((staff) => String(staff.department || '').trim())
            .filter(Boolean),
        ),
      ).sort((left, right) => left.localeCompare(right, 'ko')),
    [activeStaffsOnly],
  );
  const quickDepartmentOptions = useMemo(() => departmentOptions.slice(0, 8), [departmentOptions]);

  const filteredStaffs = useMemo(() => {
    if (departmentFilter === '전체') return activeStaffsOnly;
    return activeStaffsOnly.filter(
      (staff) => String(staff.department || '').trim() === departmentFilter,
    );
  }, [activeStaffsOnly, departmentFilter]);

  useEffect(() => {
    if (departmentFilter === '전체') return;
    if (!departmentOptions.includes(departmentFilter)) {
      setDepartmentFilter('전체');
    }
  }, [departmentFilter, departmentOptions]);

  const shiftMap = useMemo(() => new Map(workShifts.map((shift) => [shift.id, shift])), [workShifts]);
  const staffMap = useMemo(() => new Map(filteredStaffs.map((staff) => [staff.id, staff])), [filteredStaffs]);

  const activeStaffs = useMemo(() => {
    const assignmentMap = new Map(
      assignments
        .filter((assignment) => assignment.work_date === todayKey)
        .map((assignment) => [assignment.staff_id, assignment.shift_id || 'none']),
    );
    const grouped = new Map<string, Array<{ staff: StaffRow; attendance: AttendanceRow }>>();

    todayAttendance.forEach((record) => {
      const hasCheckedIn = Boolean(record.check_in || record.check_in_time);
      const hasCheckedOut = Boolean(record.check_out || record.check_out_time);
      if (!hasCheckedIn || hasCheckedOut) return;

      const staff = staffMap.get(record.staff_id);
      if (!staff) return;

      const shiftId = assignmentMap.get(record.staff_id) || staff.shift_id || 'none';
      if (!grouped.has(shiftId)) grouped.set(shiftId, []);
      grouped.get(shiftId)?.push({ staff, attendance: record });
    });

    return Array.from(grouped.entries())
      .map(([shiftId, items]) => {
        const shift = shiftMap.get(shiftId);
        return {
          shiftId,
          shiftName: shift?.name || (shiftId === 'none' ? '근무형태 미지정' : '기타 근무'),
          timeRange: formatShiftRange(shift),
          band: inferShiftBand(shift),
          items: items.sort((left, right) =>
            String(left.staff.name || '').localeCompare(String(right.staff.name || ''), 'ko'),
          ),
        };
      })
      .sort((left, right) => {
        if (BAND_ORDER[left.band] !== BAND_ORDER[right.band]) {
          return BAND_ORDER[left.band] - BAND_ORDER[right.band];
        }
        return right.items.length - left.items.length;
      });
  }, [assignments, shiftMap, staffMap, todayAttendance, todayKey]);

  const assignmentCountsByDate = useMemo(() => {
    const counts = new Map<string, DayShiftCounts>();

    assignments.forEach((assignment) => {
      const key = assignment.work_date;
      if (!counts.has(key)) counts.set(key, buildEmptyCounts());

      const current = counts.get(key)!;
      current.total += 1;

      const band = inferShiftBand(shiftMap.get(assignment.shift_id || ''));
      if (band === 'D' || band === 'E' || band === 'N') current[band] += 1;
      else current.OTHER += 1;
    });

    return counts;
  }, [assignments, shiftMap]);

  const staffNamesByDate = useMemo(() => {
    const grouped = new Map<string, string[]>();

    assignments.forEach((assignment) => {
      const staff = staffMap.get(assignment.staff_id);
      if (!staff) return;
      if (!grouped.has(assignment.work_date)) grouped.set(assignment.work_date, []);
      grouped.get(assignment.work_date)?.push(String(staff.name || '이름 없음'));
    });

    grouped.forEach((names, key) => {
      grouped.set(key, names.sort((left, right) => left.localeCompare(right, 'ko')));
    });

    return grouped;
  }, [assignments, staffMap]);

  const selectedDateRows = useMemo(() => {
    const activeStaffIds = new Set(
      todayAttendance
        .filter((record) => (record.check_in || record.check_in_time) && !(record.check_out || record.check_out_time))
        .filter((record) => staffMap.has(record.staff_id))
        .map((record) => record.staff_id),
    );

    const selectedAssignments = assignments.filter((assignment) => assignment.work_date === selectedDateKey);
    const hasExplicitAssignments = selectedAssignments.length > 0;
    const grouped = new Map<string, StaffRow[]>();

    if (hasExplicitAssignments) {
      selectedAssignments.forEach((assignment) => {
        const staff = staffMap.get(assignment.staff_id);
        if (!staff) return;
        const key = assignment.shift_id || 'none';
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)?.push(staff);
      });
    }

    const baseRows: ShiftCardRow[] = Array.from(grouped.entries()).map(([shiftId, groupedStaffs]) => {
      const shift = shiftMap.get(shiftId);
      return {
        shiftId,
        shiftName: shift?.name || (shiftId === 'none' ? '근무형태 미지정' : '기타 근무'),
        timeRange: formatShiftRange(shift),
        band: inferShiftBand(shift),
        staffs: groupedStaffs.sort((left, right) =>
          String(left.name || '').localeCompare(String(right.name || ''), 'ko'),
        ),
        activeStaffIds,
      };
    });

    baseRows.sort((left, right) => {
      if (BAND_ORDER[left.band] !== BAND_ORDER[right.band]) {
        return BAND_ORDER[left.band] - BAND_ORDER[right.band];
      }
      return right.staffs.length - left.staffs.length;
    });

    const rows =
      showActiveOnly && selectedDateKey === todayKey
        ? baseRows
            .map((row) => ({
              ...row,
              staffs: row.staffs.filter((staff) => activeStaffIds.has(staff.id)),
            }))
            .filter((row) => row.staffs.length > 0)
        : baseRows;

    const fallbackCounts =
      assignmentCountsByDate.get(selectedDateKey) ||
      baseRows.reduce((acc, row) => {
        const next = cloneCounts(acc);
        next.total += row.staffs.length;
        if (row.band === 'D' || row.band === 'E' || row.band === 'N') next[row.band] += row.staffs.length;
        else next.OTHER += row.staffs.length;
        return next;
      }, buildEmptyCounts());

    const visibleCounts =
      showActiveOnly && selectedDateKey === todayKey
        ? rows.reduce((acc, row) => {
            const next = cloneCounts(acc);
            next.total += row.staffs.length;
            if (row.band === 'D' || row.band === 'E' || row.band === 'N') next[row.band] += row.staffs.length;
            else next.OTHER += row.staffs.length;
            return next;
          }, buildEmptyCounts())
        : fallbackCounts;

    return {
      rows,
      hasExplicitAssignments,
      counts: visibleCounts,
      activeStaffCount: activeStaffIds.size,
    };
  }, [assignmentCountsByDate, assignments, selectedDateKey, shiftMap, showActiveOnly, staffMap, todayAttendance, todayKey]);

  return (
    <div className="space-y-5" data-testid="work-status-view">
      <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-lg font-bold text-[var(--foreground)]">근무현황</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
              data-testid="work-status-department-filter"
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[11px] font-bold text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
            >
              <option value="전체">전체 부서</option>
              {departmentOptions.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowActiveOnly((current) => !current)}
              data-testid="work-status-active-only-toggle"
              className={`rounded-[var(--radius-md)] border px-3 py-1 text-[11px] font-bold transition ${
                showActiveOnly
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-[var(--border)] bg-[var(--card)] text-[var(--toss-gray-3)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
              }`}
            >
              오늘 근무중만
            </button>
            <span className="rounded-[var(--radius-md)] bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700">
              실시간 반영
            </span>
            <span className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-bold text-[var(--accent)]">
              선택일 {formatDisplayDate(selectedDate)}
            </span>
            <button
              type="button"
              onClick={() => setSelectedDate(new Date())}
              data-testid="work-status-today"
              className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1 text-[11px] font-bold text-[var(--toss-gray-3)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              오늘로
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-bold">
          <span className="rounded-[var(--radius-md)] bg-[var(--page-bg)] px-2.5 py-1 text-[var(--toss-gray-3)]">
            {departmentFilter === '전체' ? '전사 보기' : `${departmentFilter} 보기`}
          </span>
          {showActiveOnly ? (
            <span className="rounded-[var(--radius-md)] bg-emerald-50 px-2.5 py-1 text-emerald-700">
              오늘 근무중 {selectedDateRows.activeStaffCount}명
            </span>
          ) : null}
          {lastRefreshAt ? (
            <span
              className="rounded-[var(--radius-md)] bg-[var(--card)] px-2.5 py-1 text-[var(--toss-gray-3)]"
              data-testid="work-status-last-sync"
            >
              마지막 갱신 {lastRefreshAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          ) : null}
        </div>

        {departmentOptions.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setDepartmentFilter('전체')}
              data-testid="work-status-department-chip-all"
              className={`rounded-full border px-3 py-1 transition ${
                departmentFilter === '전체'
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                  : 'border-[var(--border)] bg-[var(--card)] text-[var(--toss-gray-3)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
              }`}
            >
              전체
            </button>
            {quickDepartmentOptions.map((department) => (
              <button
                key={department}
                type="button"
                onClick={() => setDepartmentFilter(department)}
                data-testid={`work-status-department-chip-${department}`}
                className={`rounded-full border px-3 py-1 transition ${
                  departmentFilter === department
                    ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                    : 'border-[var(--border)] bg-[var(--card)] text-[var(--toss-gray-3)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
                }`}
              >
                {department}
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {activeStaffs.length === 0 ? (
            <div className="lg:col-span-3 rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--page-bg)] px-4 py-5 text-center text-sm text-[var(--toss-gray-3)]">
              오늘 출근해서 현재 근무중인 직원이 없습니다.
            </div>
          ) : (
            activeStaffs.map((group) => (
              <div
                key={group.shiftId}
                className="rounded-[var(--radius-xl)] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-emerald-100/70 p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className={`inline-flex rounded-[var(--radius-md)] border px-2.5 py-1 text-[10px] font-black ${getBandBadgeClass(group.band)}`}>
                      현재 근무중 · {getBandLabel(group.band)}
                    </div>
                    <h4 className="mt-2 text-base font-bold text-[var(--foreground)]">{group.shiftName}</h4>
                    <p className="mt-1 text-[12px] font-medium text-[var(--toss-gray-3)]">{group.timeRange}</p>
                  </div>
                  <span className="rounded-[var(--radius-md)] bg-emerald-500 px-2.5 py-1 text-[11px] font-black text-white shadow-sm">
                    {group.items.length}명
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {group.items.map(({ staff, attendance }) => (
                    <div
                      key={staff.id}
                      className="rounded-[var(--radius-lg)] border border-white/80 bg-[var(--card)]/90 px-3 py-2 shadow-sm"
                    >
                      <p className="text-[12px] font-bold text-[var(--foreground)]">{staff.name || '이름 없음'}</p>
                      <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                        {[staff.position, staff.department].filter(Boolean).join(' · ') || '근무중'} · 출근 {formatClockLabel(attendance.check_in || attendance.check_in_time) || '--:--'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h4 className="text-base font-bold text-[var(--foreground)]">월간 캘린더</h4>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedDate((prev) => addMonths(prev, -1))}
              data-testid="work-status-prev-month"
              className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1 text-[11px] font-bold text-[var(--toss-gray-3)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              이전달
            </button>
            <span className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-bold text-[var(--accent)]">
              {formatMonthLabel(selectedDate)}
            </span>
            <button
              type="button"
              onClick={() => setSelectedDate((prev) => addMonths(prev, 1))}
              data-testid="work-status-next-month"
              className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1 text-[11px] font-bold text-[var(--toss-gray-3)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              다음달
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--page-bg)] p-3">
          <div className="mb-2 grid grid-cols-7 gap-1">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="py-1 text-center text-[10px] font-bold text-[var(--toss-gray-3)]">
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {getMonthGrid(selectedDate).map((cell, index) => {
              if (!cell) {
                return <div key={`empty-${index}`} className="min-h-[86px] rounded-[var(--radius-md)] border border-transparent" />;
              }

              const dayKey = toDateKey(cell);
              const totalStaff = staffNamesByDate.get(dayKey)?.length || 0;
              const isSelected = dayKey === selectedDateKey;
              const isToday = dayKey === todayKey;

              return (
                <button
                  key={dayKey}
                  type="button"
                  data-testid={`work-status-day-${dayKey}`}
                  onClick={() => {
                    setSelectedDate(cell);
                    setIsDetailModalOpen(true);
                  }}
                  className={`min-h-[86px] rounded-[var(--radius-md)] border px-2 py-2 text-left transition ${
                    isSelected
                      ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]/70 shadow-sm'
                      : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/40 hover:bg-[var(--toss-blue-light)]/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-black ${isToday ? 'text-emerald-600' : 'text-[var(--foreground)]'}`}>
                      {cell.getDate()}
                    </span>
                    <span className="rounded-[var(--radius-md)] bg-[var(--muted)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--toss-gray-3)]">
                      {totalStaff}명
                    </span>
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="text-[10px] font-bold text-[var(--foreground)]">
                      총 {totalStaff}명
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {isDetailModalOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 px-4 py-4" data-testid="work-status-detail-modal" onClick={() => setIsDetailModalOpen(false)}>
          <div
            className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] shadow-sm"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-col gap-3 border-b border-[var(--border)] px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h4 className="text-lg font-bold text-[var(--foreground)]">선택일 전체 근무자 상세</h4>
                <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">{formatDisplayDate(selectedDate)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                {departmentFilter !== '전체' ? (
                  <span className="rounded-[var(--radius-md)] bg-[var(--page-bg)] px-2.5 py-1 text-[var(--toss-gray-3)]">
                    {departmentFilter}
                  </span>
                ) : null}
                {showActiveOnly && selectedDateKey === todayKey ? (
                  <span className="rounded-[var(--radius-md)] bg-emerald-50 px-2.5 py-1 text-emerald-700">
                    오늘 근무중만
                  </span>
                ) : null}
                <span className="rounded-[var(--radius-md)] bg-sky-100 px-2.5 py-1 text-sky-700">Day {selectedDateRows.counts.D}명</span>
                <span className="rounded-[var(--radius-md)] bg-amber-100 px-2.5 py-1 text-amber-700">Evening {selectedDateRows.counts.E}명</span>
                <span className="rounded-[var(--radius-md)] bg-violet-100 px-2.5 py-1 text-violet-700">Night {selectedDateRows.counts.N}명</span>
                <span className="rounded-[var(--radius-md)] bg-emerald-100 px-2.5 py-1 text-emerald-700">기타 {selectedDateRows.counts.OTHER}명</span>
                <span className="rounded-[var(--radius-md)] bg-[var(--muted)] px-2.5 py-1 text-[var(--toss-gray-3)]">총 {selectedDateRows.counts.total}명</span>
                <button
                  type="button"
                  onClick={() => setIsDetailModalOpen(false)}
                  data-testid="work-status-detail-close"
                  className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1 text-[11px] font-bold text-[var(--toss-gray-3)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  닫기
                </button>
              </div>
            </div>

            <div className="max-h-[calc(90vh-92px)] overflow-y-auto p-5">
              {!selectedDateRows.hasExplicitAssignments ? (
                <div className="mb-4 rounded-[var(--radius-lg)] border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] font-medium text-amber-700">
                  선택일에 등록된 근무 배정표가 없습니다.
                </div>
              ) : null}

              <div className="grid gap-3 xl:grid-cols-2">
                {loading ? (
                  <div className="xl:col-span-2 rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--page-bg)] px-4 py-10 text-center text-sm text-[var(--toss-gray-3)]">
                    근무현황을 불러오는 중입니다.
                  </div>
                ) : selectedDateRows.rows.length === 0 ? (
                  <div className="xl:col-span-2 rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--page-bg)] px-4 py-10 text-center text-sm text-[var(--toss-gray-3)]">
                    선택한 날짜의 근무 배치가 없습니다.
                  </div>
                ) : (
                  selectedDateRows.rows.map((row) => (
                    <div key={row.shiftId} className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--page-bg)] p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className={`inline-flex rounded-[var(--radius-md)] border px-2.5 py-1 text-[10px] font-black ${getBandBadgeClass(row.band)}`}>
                            {getBandLabel(row.band)}
                          </div>
                          <h5 className="mt-2 text-base font-bold text-[var(--foreground)]">{row.shiftName}</h5>
                          <p className="mt-1 text-[12px] font-medium text-[var(--toss-gray-3)]">{row.timeRange}</p>
                        </div>
                        <span className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-2.5 py-1 text-[11px] font-black text-[var(--accent)]">
                          {row.staffs.length}명
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {row.staffs.map((staff) => {
                          const isActiveNow = selectedDateKey === todayKey && row.activeStaffIds.has(staff.id);
                          return (
                            <div
                              key={staff.id}
                              className={`rounded-[var(--radius-lg)] border px-3 py-2 shadow-sm ${
                                isActiveNow
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                  : 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <p className="text-[12px] font-bold">{staff.name || '이름 없음'}</p>
                                {isActiveNow ? (
                                  <span className="rounded-[var(--radius-md)] bg-emerald-500 px-2 py-0.5 text-[10px] font-black text-white">
                                    근무중
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                                {[staff.department, staff.position].filter(Boolean).join(' · ') || '근무 정보'}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
