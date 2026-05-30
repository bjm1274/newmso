'use client';

import { useEffect, useMemo, useRef, useState, memo } from 'react';
import { supabase } from '@/lib/supabase';
import { subscribeRealtime } from '@/lib/realtime-bus';
import { isActiveStaff } from '@/lib/active-staff';
import { toDateKey } from '@/lib/date-utils';
import { withMissingColumnFallback } from '@/lib/supabase-compat';
import { buildShiftLookup, resolveAssignedShift } from '@/lib/shift-resolution';
import { getStaffShiftsBatch, type StaffShiftEntry } from '@/lib/staff-shift-resolver';
import { useAppData } from '@/app/main/contexts/AppDataContext';

type WorkShiftRow = {
  id?: string | null;
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
  shift_name?: string | null;
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
  current_status?: string | null;
};

type AttendancesRow = {
  staff_id: string;
  work_date?: string | null;
  check_in_time?: string | null;
  check_out_time?: string | null;
  status?: string | null;
  current_status?: string | null;
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
  const raw = String(value).trim();
  const normalizedRaw = raw.includes(' ') && !raw.includes('T') ? raw.replace(' ', 'T') : raw;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(normalizedRaw)) {
    const parsed = new Date(normalizedRaw);
    if (!Number.isNaN(parsed.getTime())) {
      // Cloudflare Workers/SSR 환경의 시스템 timezone이 UTC라
      // timeZone: 'Asia/Seoul'을 명시하지 않으면 KST 변환이 누락된다.
      return parsed.toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Seoul',
      });
    }
  }
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
  if (band === 'D') return 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/20';
  if (band === 'E') return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20';
  if (band === 'N') return 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/20';
  if (band === 'NONE') return 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)] border-[var(--border)]';
  return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20';
}

function getBandStripeClass(band: ShiftBand) {
  if (band === 'D') return 'bg-sky-500';
  if (band === 'E') return 'bg-amber-500';
  if (band === 'N') return 'bg-violet-500';
  return 'bg-[var(--toss-gray-3)]';
}

function buildEmptyCounts(): DayShiftCounts {
  return { total: 0, D: 0, E: 0, N: 0, OTHER: 0 };
}

function cloneCounts(source: DayShiftCounts) {
  return { total: source.total, D: source.D, E: source.E, N: source.N, OTHER: source.OTHER };
}

function WorkStatus({ user }: { user?: any }) {
  const { data: appData } = useAppData();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [workShifts, setWorkShifts] = useState<WorkShiftRow[]>([]);
  const [staffs, setStaffs] = useState<StaffRow[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignmentRow[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRow[]>([]);
  // staff_shift_assignments 배치 조회 결과 (직원 ID → 근무유형 목록)
  const [staffShiftMap, setStaffShiftMap] = useState<Map<string, StaffShiftEntry[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState('전체');
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefreshAtRef = useRef<number>(0);
  const isRealtimeActiveRef = useRef<boolean>(false);

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
        const [shiftRes, assignmentRes, attendanceRes, attendancesRes] = await Promise.allSettled([
          supabase
            .from('work_shifts')
            .select('id, name, company_name, start_time, end_time, description, weekly_work_days, is_weekend_work')
            .eq('is_active', true),
          withMissingColumnFallback(
            () =>
              supabase
                .from('shift_assignments')
                .select('staff_id, shift_id, shift_name, work_date')
                .gte('work_date', queryRange.startKey)
                .lte('work_date', queryRange.endKey),
            () =>
              supabase
                .from('shift_assignments')
                .select('staff_id, shift_id, work_date')
                .gte('work_date', queryRange.startKey)
                .lte('work_date', queryRange.endKey),
            'shift_name',
          ),
          supabase
            .from('attendance')
            .select('staff_id, date, check_in, check_out, status')
            .eq('date', todayKey),
          withMissingColumnFallback(
            () =>
              supabase
                .from('attendances')
                .select('staff_id, work_date, check_in_time, check_out_time, status, current_status')
                .eq('work_date', todayKey),
            () =>
              supabase
                .from('attendances')
                .select('staff_id, work_date, check_in_time, check_out_time, status')
                .eq('work_date', todayKey),
            'current_status',
          ),
        ]);

        if (cancelled) return;

        setWorkShifts(
          shiftRes.status === 'fulfilled' && Array.isArray(shiftRes.value.data)
            ? (shiftRes.value.data as WorkShiftRow[])
            : [],
        );
        // AppDataContext.staffs[]에서 가져옴 (별도 supabase 호출 제거)
        const loadedStaffs = appData.staffs.map((s) => ({
          id: s.id,
          name: s.name ?? null,
          shift_id: (s as any).shift_id ?? null,
          department: s.department ?? null,
          position: s.position ?? null,
          status: s.status ?? null,
        })) as StaffRow[];
        setStaffs(loadedStaffs);

        // 직원 목록 확정 후 다중 근무유형 배치 조회 (N+1 방지)
        if (loadedStaffs.length > 0) {
          const staffIds = loadedStaffs.map((s) => s.id);
          getStaffShiftsBatch(staffIds)
            .then((batchMap) => {
              if (!cancelled) setStaffShiftMap(batchMap);
            })
            .catch(() => {
              // 테이블 미존재 시 기존 shift_id 폴백으로 계속 동작
            });
        }

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
            // current_status: attendances에만 존재하는 컬럼 — undefined면 existing 유지
            current_status: row.current_status !== undefined
              ? row.current_status
              : existing?.current_status ?? null,
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
  }, [queryRange.endKey, queryRange.startKey, refreshNonce, todayKey, appData.staffs]);

  useEffect(() => {
    const scheduleRefresh = () => {
      // JM2: 30초 throttle — 직전 fetch로부터 30초 미만이면 skip
      const now = Date.now();
      if (now - lastRefreshAtRef.current < 30_000) return;
      lastRefreshAtRef.current = now;

      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => setRefreshNonce((current) => current + 1), 250);
    };

    isRealtimeActiveRef.current = true;
    const unsubscribe = subscribeRealtime(
      `work-status-live-${user?.id || 'guest'}`,
      [
        { table: 'attendance', event: '*' },
        { table: 'attendances', event: '*' },
        { table: 'shift_assignments', event: '*' },
        { table: 'staff_shift_assignments', event: '*' },
        { table: 'staff_members', event: '*' },
        { table: 'work_shifts', event: '*' },
      ],
      scheduleRefresh,
      { pollIntervalMs: 10000 },
    );

    // JM2: realtime 활성 시 focus/visibilitychange는 noop (realtime이 이미 커버)
    //       hidden 상태에서도 fetch skip
    const handleVisible = () => {
      if (isRealtimeActiveRef.current) return;
      if (document.visibilityState !== 'visible') return;
      scheduleRefresh();
    };
    const handleFocus = () => {
      if (isRealtimeActiveRef.current) return;
      if (document.hidden) return;
      scheduleRefresh();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisible);

    return () => {
      isRealtimeActiveRef.current = false;
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisible);
      unsubscribe();
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

  // §6-5 신규: 1분(60초) 자동 갱신 — realtime 보완용
  useEffect(() => {
    const intervalId = setInterval(() => {
      setRefreshNonce((current) => current + 1);
    }, 60_000);
    return () => clearInterval(intervalId);
  }, []);

  const activeStaffsOnly = useMemo(
    () =>
      staffs
        .filter((staff) => isActiveStaff(staff))
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

  const shiftLookup = useMemo(() => buildShiftLookup(workShifts), [workShifts]);
  const staffMap = useMemo(() => new Map(filteredStaffs.map((staff) => [staff.id, staff])), [filteredStaffs]);

  /** 직원이 보유한 추가 근무유형 chip 목록 (주근무유형 제외 나머지) */
  const getExtraShiftChips = (staffId: string): Array<{ shiftId: string; name: string; isPrimary: boolean }> => {
    const entries = staffShiftMap.get(staffId);
    if (!entries || entries.length === 0) return [];
    return entries.map((entry) => {
      const shift = workShifts.find((ws) => ws.id === entry.shiftId);
      return {
        shiftId: entry.shiftId,
        name: shift?.name ?? entry.shiftId,
        isPrimary: entry.isPrimary,
      };
    });
  };

  const resolveAssignmentDisplay = (
    assignment: ShiftAssignmentRow | undefined,
    fallbackShiftId?: string | null,
  ) => {
    const shift = resolveAssignedShift(assignment, shiftLookup, {
      fallbackShiftId,
      workDate: assignment?.work_date,
    });
    const assignedShiftName = String(assignment?.shift_name || '').trim();
    const shiftId =
      String(
        shift?.id ||
          assignment?.shift_id ||
          (assignedShiftName ? `name:${assignedShiftName}` : fallbackShiftId || 'none'),
      ).trim() || 'none';

    return {
      shiftId,
      shiftName:
        shift?.name ||
        assignedShiftName ||
        (shiftId === 'none' ? '근무형태 미지정' : '기타 근무'),
      timeRange: formatShiftRange(shift),
      band: inferShiftBand(shift),
    };
  };

  const activeStaffs = useMemo(() => {
    const assignmentMap = new Map(
      assignments
        .filter((assignment) => assignment.work_date === todayKey)
        .map((assignment) => [assignment.staff_id, assignment]),
    );
    const grouped = new Map<string, Array<{ staff: StaffRow; attendance: AttendanceRow }>>();

    todayAttendance.forEach((record) => {
      const hasCheckedIn = Boolean(record.check_in || record.check_in_time);
      const hasCheckedOut = Boolean(record.check_out || record.check_out_time);
      if (!hasCheckedIn || hasCheckedOut) return;

      const staff = staffMap.get(record.staff_id);
      if (!staff) return;

      const assignment = assignmentMap.get(record.staff_id);
      // 폴백: staff_shift_assignments is_primary → staff_members.shift_id
      const primaryEntry = staffShiftMap.get(staff.id)?.find((e) => e.isPrimary);
      const fallbackShiftId = primaryEntry?.shiftId ?? staff.shift_id;
      const display = resolveAssignmentDisplay(assignment, fallbackShiftId);
      if (!grouped.has(display.shiftId)) grouped.set(display.shiftId, []);
      grouped.get(display.shiftId)?.push({ staff, attendance: record });
    });

    return Array.from(grouped.entries())
      .map(([shiftId, items]) => {
        const firstStaff = items[0]?.staff;
        const primaryEntryForFirst = firstStaff
          ? (staffShiftMap.get(firstStaff.id)?.find((e) => e.isPrimary)?.shiftId ?? firstStaff.shift_id)
          : undefined;
        const display = resolveAssignmentDisplay(
          assignmentMap.get(items[0]?.staff.id),
          primaryEntryForFirst,
        );
        const shift = { name: display.shiftName };
        return {
          shiftId,
          shiftName: shift?.name || (shiftId === 'none' ? '근무형태 미지정' : '기타 근무'),
          timeRange: display.timeRange,
          band: display.band,
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
  }, [assignments, shiftLookup, staffMap, staffShiftMap, todayAttendance, todayKey]);

  const assignmentCountsByDate = useMemo(() => {
    const counts = new Map<string, DayShiftCounts>();
    // 폴백 우선순위: staff_shift_assignments(is_primary) → staff_members.shift_id
    const staffPrimaryShiftById = new Map(
      filteredStaffs.map((staff) => {
        const primary = staffShiftMap.get(staff.id)?.find((e) => e.isPrimary);
        return [staff.id, primary?.shiftId ?? staff.shift_id ?? null];
      }),
    );

    assignments.forEach((assignment) => {
      const key = assignment.work_date;
      if (!counts.has(key)) counts.set(key, buildEmptyCounts());

      const current = counts.get(key)!;
      current.total += 1;

      const band = resolveAssignmentDisplay(assignment, staffPrimaryShiftById.get(assignment.staff_id)).band;
      if (band === 'D' || band === 'E' || band === 'N') current[band] += 1;
      else current.OTHER += 1;
    });

    return counts;
  }, [assignments, filteredStaffs, shiftLookup, staffShiftMap]);

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
    const grouped = new Map<
      string,
      { staffs: StaffRow[]; display: ReturnType<typeof resolveAssignmentDisplay> }
    >();

    if (hasExplicitAssignments) {
      selectedAssignments.forEach((assignment) => {
        const staff = staffMap.get(assignment.staff_id);
        if (!staff) return;
        // 폴백: staff_shift_assignments is_primary → staff_members.shift_id
        const primaryEntry = staffShiftMap.get(staff.id)?.find((e) => e.isPrimary);
        const fallbackShiftId = primaryEntry?.shiftId ?? staff.shift_id;
        const display = resolveAssignmentDisplay(assignment, fallbackShiftId);
        if (!grouped.has(display.shiftId)) {
          grouped.set(display.shiftId, { staffs: [], display });
        }
        grouped.get(display.shiftId)?.staffs.push(staff);
      });
    }

    const baseRows: ShiftCardRow[] = Array.from(grouped.entries()).map(([shiftId, group]) => {
      const shift = { name: group.display.shiftName };
      return {
        shiftId,
        shiftName: shift?.name || (shiftId === 'none' ? '근무형태 미지정' : '기타 근무'),
        timeRange: group.display.timeRange,
        band: group.display.band,
        staffs: group.staffs.sort((left, right) =>
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
  }, [assignmentCountsByDate, assignments, selectedDateKey, shiftLookup, showActiveOnly, staffMap, staffShiftMap, todayAttendance, todayKey]);

  return (
    <div className="flex flex-col gap-3" data-testid="work-status-view">

      {/* 우상단 액션 (지시서 §1.3: PageHeader 제목/서브 삭제, 우측 액션만) */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <select
          value={departmentFilter}
          onChange={(event) => setDepartmentFilter(event.target.value)}
          data-testid="work-status-department-filter"
          className="h-8 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-bold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
        >
          <option value="전체">전체 부서</option>
          {departmentOptions.map((department) => (
            <option key={department} value={department}>{department}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowActiveOnly((current) => !current)}
          data-testid="work-status-active-only-toggle"
          className={`wn-active-toggle${showActiveOnly ? ' on' : ''}`}
        >
          오늘 근무중만
        </button>
        <button
          type="button"
          onClick={() => setSelectedDate(new Date())}
          data-testid="work-status-today"
          className="wn-pager"
        >
          오늘로
        </button>
        <button
          type="button"
          onClick={() => setRefreshNonce((current) => current + 1)}
          data-testid="work-status-refresh"
          className="wn-pager"
          aria-label="데이터 새로고침"
        >
          새로고침
        </button>
      </div>

      {/* 빠른 부서 필터 칩 + 메타 (라이브 §3-2) */}
      <div className="wn-chips">
        <button
          type="button"
          onClick={() => setDepartmentFilter('전체')}
          data-testid="work-status-department-chip-all"
          className={`wn-chip${departmentFilter === '전체' ? ' on' : ''}`}
        >
          전체
        </button>
        {quickDepartmentOptions.map((department) => (
          <button
            key={department}
            type="button"
            onClick={() => setDepartmentFilter(department)}
            data-testid={`work-status-department-chip-${department}`}
            className={`wn-chip${departmentFilter === department ? ' on' : ''}`}
          >
            {department}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {showActiveOnly ? (
          <span className="wn-sync success">오늘 근무중 {selectedDateRows.activeStaffCount}명</span>
        ) : null}
        <span className="wn-sync">
          <span className="wn-pulse"><span /></span>
          <span style={{ marginLeft: 8 }}>
            {lastRefreshAt
              ? `마지막 갱신 ${lastRefreshAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Seoul' })}`
              : '실시간'}
          </span>
        </span>
        <span className="wn-sync">선택일 {formatDisplayDate(selectedDate)}</span>
      </div>

      {/* 섹션 헤더: 현재 근무중 */}
      <div className="wn-section-h">
        <div className="wn-section-title">
          <span className="wn-section-dot" />
          현재 근무중
          <span className="wn-section-meta">
            {departmentFilter === '전체' ? '전사' : departmentFilter} ·
            {' '}{activeStaffs.reduce((acc, g) => acc + g.items.length, 0)}명
          </span>
        </div>
      </div>

      {/* 시프트 밴드별 그룹 카드 — 라이브 §3-3 */}
      <div className="wn-shift-grid">
        {activeStaffs.length === 0 ? (
          <div className="wn-empty">오늘 출근해서 현재 근무중인 직원이 없습니다.</div>
        ) : (
          activeStaffs.map((group) => {
            const tone =
              group.band === 'D' ? 'accent'
              : group.band === 'E' ? 'warn'
              : group.band === 'N' ? 'violet'
              : group.band === 'NONE' ? 'muted'
              : 'success';
            return (
              <div key={group.shiftId} className={`wn-shift-card tone-${tone}`}>
                <div className="wn-shift-head">
                  <div>
                    <div className={`wn-band-badge tone-${tone}`}>
                      현재 근무중 · {getBandLabel(group.band)}
                    </div>
                    <div className="wn-shift-name">{group.shiftName}</div>
                    <div className="wn-shift-time">{group.timeRange}</div>
                  </div>
                  <span className="wn-count-pill">{group.items.length}명</span>
                </div>
                <div className="wn-staff-chips">
                  {group.items.map(({ staff, attendance }) => {
                    const extraChips = getExtraShiftChips(staff.id);
                    const checkInLabel = formatClockLabel(attendance.check_in || attendance.check_in_time);
                    return (
                      <div key={staff.id} className="wn-staff-card">
                        <div className="wn-staff-name">{staff.name || '이름 없음'}</div>
                        <div className="wn-staff-meta">
                          {[staff.position, staff.department].filter(Boolean).join(' · ') || '근무중'}
                          {checkInLabel ? ` · 출근 ${checkInLabel}` : ''}
                        </div>
                        {extraChips.length > 0 && (
                          <div className="wn-shift-chips" role="list" aria-label="담당 근무유형">
                            {extraChips.map((chip) => (
                              <span
                                key={chip.shiftId}
                                role="listitem"
                                aria-label={`${chip.isPrimary ? '주근무' : '부근무'}: ${chip.name}`}
                                className={`wn-shift-chip${chip.isPrimary ? ' primary' : ''}`}
                              >
                                {chip.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 섹션 헤더 + 월간 페이저 (라이브 §3-4) */}
      <div className="wn-section-h">
        <div className="wn-section-title">
          월간 캘린더
          <span className="wn-section-meta">날짜 클릭 시 시프트별 상세</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedDate((prev) => addMonths(prev, -1))}
            data-testid="work-status-prev-month"
            className="wn-pager"
          >
            ‹ 이전달
          </button>
          <span className="wn-month-pill">{formatMonthLabel(selectedDate)}</span>
          <button
            type="button"
            onClick={() => setSelectedDate((prev) => addMonths(prev, 1))}
            data-testid="work-status-next-month"
            className="wn-pager"
          >
            다음달 ›
          </button>
        </div>
      </div>

      {/* 월간 캘린더 — 라이브 §3-4 wn-cal */}
      <div className="wn-cal">
        <div className="wn-cal-wd">
          {WEEKDAY_LABELS.map((label, index) => (
            <div
              key={label}
              className={`wn-cal-wd-cell${index === 0 ? ' sun' : ''}${index === 6 ? ' sat' : ''}`}
            >
              {label}
            </div>
          ))}
        </div>
        <div className="wn-cal-grid">
          {getMonthGrid(selectedDate).map((cell, index) => {
            if (!cell) {
              return <div key={`empty-${index}`} className="wn-cal-cell empty" />;
            }
            const dayKey = toDateKey(cell);
            const totalStaff = staffNamesByDate.get(dayKey)?.length || 0;
            const isSelected = dayKey === selectedDateKey;
            const isToday = dayKey === todayKey;
            const wd = cell.getDay();
            return (
              <button
                key={dayKey}
                type="button"
                data-testid={`work-status-day-${dayKey}`}
                onClick={() => {
                  setSelectedDate(cell);
                  setIsDetailModalOpen(true);
                }}
                className={`wn-cal-cell${isSelected ? ' selected' : ''}${isToday ? ' today' : ''}${wd === 0 ? ' sun' : ''}${wd === 6 ? ' sat' : ''}`}
              >
                <div className="wn-cal-cell-top">
                  <span className="wn-cal-date">{cell.getDate()}</span>
                  <span className="wn-cal-count">{totalStaff}명</span>
                </div>
                <div className="wn-cal-cell-body">총 {totalStaff}명</div>
                {isToday && <div className="wn-cal-today-tag">오늘</div>}
              </button>
            );
          })}
        </div>
      </div>

      {/* 상세 모달 — 라이브 §3-5 wn-modal */}
      {isDetailModalOpen ? (
        <div className="wn-modal-bg" data-testid="work-status-detail-modal" onClick={() => setIsDetailModalOpen(false)}>
          <div className="wn-modal" onClick={(event) => event.stopPropagation()}>
            <div className="wn-modal-h">
              <div>
                <div className="wn-modal-title">선택일 전체 근무자 상세</div>
                <div className="wn-modal-sub">{formatDisplayDate(selectedDate)}</div>
              </div>
              <div className="wn-modal-meta">
                {departmentFilter !== '전체' ? (
                  <span className="wn-sync">{departmentFilter}</span>
                ) : null}
                {showActiveOnly && selectedDateKey === todayKey ? (
                  <span className="wn-sync success">오늘 근무중만</span>
                ) : null}
                <span className="wn-band-pill tone-accent">Day {selectedDateRows.counts.D}명</span>
                <span className="wn-band-pill tone-warn">Evening {selectedDateRows.counts.E}명</span>
                <span className="wn-band-pill tone-violet">Night {selectedDateRows.counts.N}명</span>
                <span className="wn-band-pill tone-success">기타 {selectedDateRows.counts.OTHER}명</span>
                <span className="wn-band-pill tone-muted">총 {selectedDateRows.counts.total}명</span>
                <button
                  type="button"
                  onClick={() => setIsDetailModalOpen(false)}
                  data-testid="work-status-detail-close"
                  className="wn-pager"
                >
                  닫기
                </button>
              </div>
            </div>

            <div className="wn-modal-body">
              {!selectedDateRows.hasExplicitAssignments ? (
                <div className="mb-4 rounded-[var(--radius-lg)] border border-[var(--warning)]/30 bg-[var(--warning-soft)] px-4 py-3 text-[12px] font-medium text-[var(--warning)]">
                  선택일에 등록된 근무 배정표가 없습니다.
                </div>
              ) : null}

              {loading ? (
                <div className="wn-empty">근무현황을 불러오는 중입니다.</div>
              ) : selectedDateRows.rows.length === 0 ? (
                <div className="wn-empty">선택한 날짜의 근무 배치가 없습니다.</div>
              ) : (
                <div className="wn-modal-grid">
                  {selectedDateRows.rows.map((row) => {
                    const tone =
                      row.band === 'D' ? 'accent'
                      : row.band === 'E' ? 'warn'
                      : row.band === 'N' ? 'violet'
                      : row.band === 'NONE' ? 'muted'
                      : 'success';
                    return (
                      <div key={row.shiftId} className={`wn-shift-card secondary tone-${tone}`}>
                        <div className="wn-shift-head">
                          <div>
                            <div className={`wn-band-badge tone-${tone}`}>
                              {getBandLabel(row.band)}
                            </div>
                            <div className="wn-shift-name">{row.shiftName}</div>
                            <div className="wn-shift-time">{row.timeRange}</div>
                          </div>
                          <span className="wn-count-pill accent">{row.staffs.length}명</span>
                        </div>
                        <div className="wn-staff-chips">
                          {row.staffs.map((staff) => {
                            const isActiveNow = selectedDateKey === todayKey && row.activeStaffIds.has(staff.id);
                            const extraChips = getExtraShiftChips(staff.id);
                            const attendanceRec = todayAttendance.find((r) => r.staff_id === staff.id);
                            const checkInLabel = isActiveNow && attendanceRec
                              ? formatClockLabel(attendanceRec.check_in || attendanceRec.check_in_time)
                              : null;
                            return (
                              <div key={staff.id} className={`wn-staff-card${isActiveNow ? ' active-now' : ''}`}>
                                <div className="flex items-center gap-1.5">
                                  <span className="wn-staff-name">{staff.name || '이름 없음'}</span>
                                  {isActiveNow ? <span className="wn-now-tag">근무중</span> : null}
                                </div>
                                <div className="wn-staff-meta">
                                  {[staff.department, staff.position].filter(Boolean).join(' · ') || '근무 정보'}
                                  {checkInLabel ? ` · 출근 ${checkInLabel}` : ''}
                                </div>
                                {extraChips.length > 0 && (
                                  <div className="wn-shift-chips" role="list" aria-label="담당 근무유형">
                                    {extraChips.map((chip) => (
                                      <span
                                        key={chip.shiftId}
                                        role="listitem"
                                        aria-label={`${chip.isPrimary ? '주근무' : '부근무'}: ${chip.name}`}
                                        className={`wn-shift-chip${chip.isPrimary ? ' primary' : ''}`}
                                      >
                                        {chip.name}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default memo(WorkStatus);
