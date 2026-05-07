'use client';

import { ALLOWED_DISTANCE_M,WORKPLACE_LOCATION } from '@/lib/location';
import { logger } from '@/lib/logger';
import {
buildShiftLookup,
resolveAssignedShift,
type ShiftAssignmentReference,
type ShiftLookupRecord,
} from '@/lib/shift-resolution';
import { getStaffLikeId,normalizeStaffLike,resolveStaffLike } from '@/lib/staff-identity';
import { supabase } from '@/lib/supabase';
import { withMissingColumnFallback } from '@/lib/supabase-compat';
import { toast } from '@/lib/toast';
import { formatLocalDateKey } from '@/lib/use-local-date-key';
import { useCallback,useEffect,useRef,useState } from 'react';
import {
COMMUTE_STATUS_LABELS,
NON_ABSENT_DISPLAY_STATUSES,
type CommuteLog,
type MonthlyShiftAssignmentRow,
type ShiftBoundary,
type WeatherData,
} from './commute-types';
import { CheckInSuccessModal,CheckOutSuccessModal } from './출퇴근모달';
import { AttendanceCalendar,StatItem,TimeBox,WorkHoursChart } from './출퇴근차트';

const HOSPITAL_LOCATION = WORKPLACE_LOCATION;
const ALLOWED_RADIUS_METER = ALLOWED_DISTANCE_M;

interface CommuteRecordProps {
  user?: Record<string, unknown>;
  onRequestCorrection?: (log: Record<string, unknown>) => void;
}

function buildFallbackShiftBoundary(department?: string): ShiftBoundary {
  const isMedicalStaff = department === '의료진';

  return {
    hour: isMedicalStaff ? 8 : 9,
    minute: isMedicalStaff ? 30 : 10,
    label: isMedicalStaff ? '08:30' : '09:10',
    endHour: null,
    endMinute: null,
    shiftKnown: false,
  };
}

function parseShiftTime(value: string) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return { hour, minute };
}

function buildShiftBoundary(startTime: string, endTime: string, fallbackDepartment?: string): ShiftBoundary {
  const start = parseShiftTime(startTime);
  if (!start) {
    return buildFallbackShiftBoundary(fallbackDepartment);
  }

  const end = parseShiftTime(endTime);
  return {
    hour: start.hour,
    minute: start.minute,
    label: `${String(start.hour).padStart(2, '0')}:${String(start.minute).padStart(2, '0')}`,
    endHour: end?.hour ?? null,
    endMinute: end?.minute ?? null,
    shiftKnown: true,
  };
}

function buildDateWithTime(dateStr: string, hour: number, minute: number) {
  const [year, month, day] = String(dateStr).slice(0, 10).split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, hour, minute, 0, 0);
}

function calculateEarlyLeaveMinutes(
  workDate: string,
  checkOutIso: string | null | undefined,
  boundary: ShiftBoundary
) {
  if (!workDate || !checkOutIso || boundary.endHour === null || boundary.endMinute === null) {
    return 0;
  }

  const actualCheckOut = new Date(checkOutIso);
  if (Number.isNaN(actualCheckOut.getTime())) {
    return 0;
  }

  const scheduledStart = buildDateWithTime(workDate, boundary.hour, boundary.minute);
  const scheduledEnd = buildDateWithTime(workDate, boundary.endHour, boundary.endMinute);

  if (scheduledEnd.getTime() <= scheduledStart.getTime()) {
    scheduledEnd.setDate(scheduledEnd.getDate() + 1);
  }

  // 야간근무자가 자정 이후 날짜로 출근 체크인된 경우:
  // workDate가 다음날로 저장되어 scheduledStart(22:00)보다 actualCheckOut(05:30)이 이른 상황
  // → scheduledStart/End를 하루 앞당겨 올바른 날짜로 보정
  const endMin = boundary.endHour * 60 + boundary.endMinute;
  const startMin = boundary.hour * 60 + boundary.minute;
  const isNightShift = endMin < startMin;
  if (isNightShift && actualCheckOut.getTime() < scheduledStart.getTime()) {
    scheduledStart.setDate(scheduledStart.getDate() - 1);
    scheduledEnd.setDate(scheduledEnd.getDate() - 1);
  }

  return Math.max(0, Math.round((scheduledEnd.getTime() - actualCheckOut.getTime()) / 60000));
}

function getDisplayStatus(log: CommuteLog | null | undefined) {
  return String(log?.displayStatus || log?.status || '').trim();
}

function normalizeCommuteStatusLabel(status: unknown) {
  const rawStatus = String(status || '').trim();
  return COMMUTE_STATUS_LABELS[rawStatus] || rawStatus;
}

function resolveEmploymentStartDate(user: Record<string, unknown> | null | undefined) {
  const candidateKeys = ['hire_date', 'joined_at', 'join_date', 'start_date'];
  for (const key of candidateKeys) {
    const value = String(user?.[key] || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
  }
  return null;
}

function buildVisibleHistoryDateKeys(
  monthDate: Date,
  currentDateKey: string,
  user: Record<string, unknown> | null | undefined,
) {
  const viewingMonthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
  const currentMonthKey = currentDateKey.slice(0, 7);
  if (viewingMonthKey > currentMonthKey) {
    return [] as string[];
  }

  const employmentStartDate = resolveEmploymentStartDate(user);
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const rangeStart = employmentStartDate
    ? new Date(
        Math.max(
          monthStart.getTime(),
          buildDateWithTime(employmentStartDate, 0, 0).getTime(),
        ),
      )
    : monthStart;

  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const rangeEnd =
    viewingMonthKey === currentMonthKey
      ? new Date(buildDateWithTime(currentDateKey, 0, 0).getTime() - 24 * 60 * 60 * 1000)
      : monthEnd;

  if (rangeEnd.getTime() < rangeStart.getTime()) {
    return [] as string[];
  }

  const dateKeys: string[] = [];
  for (const cursor = new Date(rangeStart); cursor.getTime() <= rangeEnd.getTime(); cursor.setDate(cursor.getDate() + 1)) {
    dateKeys.push(formatLocalDateKey(cursor));
  }
  return dateKeys;
}

function shouldTreatAsAbsent(log: CommuteLog, currentDateKey: string) {
  const workDate = String(log.date || '').slice(0, 10);
  if (!workDate || workDate >= currentDateKey) {
    return false;
  }

  const normalizedStatus = normalizeCommuteStatusLabel(log.status);
  if (NON_ABSENT_DISPLAY_STATUSES.has(normalizedStatus)) {
    return false;
  }

  return !log.check_in || !log.check_out;
}

export default function CommuteRecord({ user, onRequestCorrection }: CommuteRecordProps) {
  const normalizedUser = normalizeStaffLike((user ?? {}) as Record<string, unknown>);
  const [resolvedUser, setResolvedUser] = useState<Record<string, unknown>>(normalizedUser);
  const [logs, setLogs] = useState<CommuteLog[]>([]);
  const [todayLog, setTodayLog] = useState<Record<string, unknown> | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [distance, setDistance] = useState<number | null>(null); // 병원과의 거리
  const [, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const effectiveUserId = getStaffLikeId(resolvedUser);
  const currentDateKey = formatLocalDateKey(currentTime);
  const lastResolvedLocationRef = useRef<{
    latitude: number;
    longitude: number;
    distance: number;
    capturedAt: number;
  } | null>(null);

  const [historyView, setHistoryView] = useState<'list' | 'calendar'>('list');
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [showCheckInSuccess, setShowCheckInSuccess] = useState(false);
  const [checkInTime, setCheckInTime] = useState<Date | null>(null);
  const checkInSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showCheckOutSuccess, setShowCheckOutSuccess] = useState(false);
  const [checkOutSummary, setCheckOutSummary] = useState<{
    checkInTime: string;
    checkOutTime: string;
    workedMinutes: number;
  } | null>(null);
  const checkOutSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTodayLog =
    todayLog && String((todayLog as Record<string, unknown>)?.date || '').slice(0, 10) === currentDateKey
      ? todayLog
      : null;
  const staleOpenLog =
    logs.find(
      (log) =>
        !log.isVirtual &&
        !!log.check_in &&
        !log.check_out &&
        getDisplayStatus(log) !== '결근' &&
        String(log.date || '').slice(0, 10) !== currentDateKey,
    ) || null;

  const fetchLatestStaffShiftContext = useCallback(async () => {
    const userId = effectiveUserId;
    const fallbackShiftId = String((resolvedUser as Record<string, unknown>)?.shift_id || '').trim();
    const fallbackDepartment =
      String((resolvedUser as Record<string, unknown>)?.department || '').trim() || undefined;
    const fallbackCompany =
      String(
        (resolvedUser as Record<string, unknown>)?.company ||
          (resolvedUser as Record<string, unknown>)?.company_name ||
          ''
      ).trim() || undefined;

    if (!userId) {
      return {
        shiftId: fallbackShiftId,
        department: fallbackDepartment,
        company: fallbackCompany,
      };
    }

    try {
      // 근무유형은 로그인 세션보다 staff_members 최신값이 더 정확할 수 있어 항상 DB를 우선 본다.
      const { data: staffRow } = await supabase
        .from('staff_members')
        .select('shift_id, department, company')
        .eq('id', userId)
        .maybeSingle();

      return {
        shiftId:
          String((staffRow as Record<string, unknown> | null | undefined)?.shift_id || '').trim() ||
          fallbackShiftId,
        department:
          String((staffRow as Record<string, unknown> | null | undefined)?.department || '').trim() ||
          fallbackDepartment,
        company:
          String((staffRow as Record<string, unknown> | null | undefined)?.company || '').trim() ||
          fallbackCompany,
      };
    } catch (error) {
      logger.warn('최신 근무유형 조회 실패:', error);
      return {
        shiftId: fallbackShiftId,
        department: fallbackDepartment,
        company: fallbackCompany,
      };
    }
  }, [effectiveUserId, resolvedUser]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    // 컴포넌트 로드 시 위치 권한 요청 및 거리 계산 미리 해보기
    void resolveCurrentLocation({ showErrors: false, preferCached: false });
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (checkInSuccessTimerRef.current) clearTimeout(checkInSuccessTimerRef.current);
      if (checkOutSuccessTimerRef.current) clearTimeout(checkOutSuccessTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const refreshLocation = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      void resolveCurrentLocation({ showErrors: false, preferCached: false });
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', refreshLocation);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', refreshLocation);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', refreshLocation);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', refreshLocation);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncUserIdentity = async () => {
      const directId = getStaffLikeId(normalizedUser);
      if (directId) {
        setResolvedUser(normalizedUser);
        return;
      }
      if (!normalizedUser?.name && !normalizedUser?.employee_no && !normalizedUser?.auth_user_id) {
        setResolvedUser(normalizedUser);
        return;
      }
      const recoveredUser = await resolveStaffLike(normalizedUser);
      if (!cancelled) {
        setResolvedUser(recoveredUser);
      }
    };

    void syncUserIdentity();
    return () => {
      cancelled = true;
    };
  }, [normalizedUser?.id, normalizedUser?.name, normalizedUser?.employee_no, normalizedUser?.auth_user_id]);

  useEffect(() => {
    if (effectiveUserId) {
      void initCommuteData();
    }
  }, [effectiveUserId, currentMonth, currentDateKey]);

  useEffect(() => {
    if (!effectiveUserId) return;
    void fetchTodayLog(currentDateKey);
  }, [effectiveUserId, currentDateKey]);

  const initCommuteData = async () => {
    setLoading(true);
    await Promise.all([fetchTodayLog(currentDateKey), fetchMonthlyLogs()]);
    setLoading(false);
  };

  const fetchTodayLog = async (targetDate = formatLocalDateKey(new Date())) => {
    const userId = effectiveUserId;
    if (!userId) return;
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('staff_id', userId)
      .eq('date', targetDate)
      .maybeSingle();
    setTodayLog(data || null);
  };

  const fetchMonthlyLogs = async () => {
    const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toLocaleDateString('en-CA');
    const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).toLocaleDateString('en-CA');
    const userId = effectiveUserId;
    if (!userId) return;

    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('staff_id', userId)
      .gte('date', startOfMonth)
      .lte('date', endOfMonth)
      .order('date', { ascending: false });

    const monthlyLogs = ((data || []) as CommuteLog[]).map((log) => ({ ...log }));
    const [{ shiftId: latestShiftId, department: latestDepartment, company: latestCompany }, assignmentResult] = await Promise.all([
      fetchLatestStaffShiftContext(),
      withMissingColumnFallback(
        () =>
          supabase
            .from('shift_assignments')
            .select('work_date, shift_id, shift_name')
            .eq('staff_id', userId)
            .gte('work_date', startOfMonth)
            .lte('work_date', endOfMonth),
        () =>
          supabase
            .from('shift_assignments')
            .select('work_date, shift_id')
            .eq('staff_id', userId)
            .gte('work_date', startOfMonth)
            .lte('work_date', endOfMonth),
        'shift_name'
      ),
    ]);

    if (assignmentResult.error) {
      throw assignmentResult.error;
    }

    const assignmentByDate = new Map<string, ShiftAssignmentReference>(
      ((assignmentResult.data || []) as MonthlyShiftAssignmentRow[])
        .filter((item) => item.work_date)
        .map((item) => [
          String(item.work_date).slice(0, 10),
          {
            shift_id: item.shift_id,
            shift_name: item.shift_name,
          },
        ])
    );

    const effectiveDepartment = latestDepartment;
    const effectiveCompany = latestCompany;
    const defaultShiftId = latestShiftId;

    const shiftIds = Array.from(
      new Set(
        [
          ...Array.from(assignmentByDate.values()).map((assignment) => String(assignment.shift_id || '').trim()),
          defaultShiftId,
        ].filter(Boolean)
      )
    );
    const shiftNames = Array.from(
      new Set(
        Array.from(assignmentByDate.values())
          .map((assignment) => String(assignment.shift_name || '').trim())
          .filter(Boolean)
      )
    );

    const shiftRows: ShiftLookupRecord[] = [];
    if (shiftIds.length > 0 || shiftNames.length > 0) {
      const [shiftIdsResult, shiftNamesResult] = await Promise.all([
        shiftIds.length > 0
          ? supabase.from('work_shifts').select('id, name, company_name, start_time, end_time').in('id', shiftIds)
          : Promise.resolve({ data: [], error: null }),
        shiftNames.length > 0
          ? supabase.from('work_shifts').select('id, name, company_name, start_time, end_time').in('name', shiftNames)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (shiftIdsResult.error) {
        throw shiftIdsResult.error;
      }
      if (shiftNamesResult.error) {
        throw shiftNamesResult.error;
      }

      shiftRows.push(...((shiftIdsResult.data || []) as ShiftLookupRecord[]));
      shiftRows.push(...((shiftNamesResult.data || []) as ShiftLookupRecord[]));
    }
    const shiftLookup = buildShiftLookup(shiftRows);

    const boundaryByDate = new Map<string, ShiftBoundary>();
    const resolveBoundaryForDate = (dateStr: string) => {
      const cached = boundaryByDate.get(dateStr);
      if (cached) return cached;

      const shiftRow = resolveAssignedShift(assignmentByDate.get(dateStr), shiftLookup, {
        fallbackShiftId: defaultShiftId,
        preferredCompany: effectiveCompany,
      });
      const boundary = shiftRow
        ? buildShiftBoundary(
            String(shiftRow.start_time || ''),
            String(shiftRow.end_time || ''),
            effectiveDepartment
          )
        : buildFallbackShiftBoundary(effectiveDepartment);

      boundaryByDate.set(dateStr, boundary);
      return boundary;
    };

    const decoratedLogs: CommuteLog[] = monthlyLogs.map((log) => {
      const workDate = String(log.date || '').slice(0, 10);
      const boundary = resolveBoundaryForDate(workDate);
      const earlyLeaveMinutes = calculateEarlyLeaveMinutes(
        workDate,
        (log.check_out as string | null | undefined) || null,
        boundary
      );
      const normalizedStatus = normalizeCommuteStatusLabel(log.status);
      const displayStatus = shouldTreatAsAbsent({ ...log, status: normalizedStatus }, currentDateKey)
        ? '결근'
        : earlyLeaveMinutes > 0
          ? '조퇴'
          : normalizedStatus || (log.check_in && log.check_out ? '정상' : '');

      return {
        ...log,
        status: normalizedStatus || String(log.status || ''),
        displayStatus,
        displayEarlyLeaveMinutes: displayStatus === '조퇴' ? earlyLeaveMinutes : null,
      };
    });

    const logsByDate = new Map<string, CommuteLog>();
    decoratedLogs.forEach((log) => {
      const workDate = String(log.date || '').slice(0, 10);
      if (workDate && !logsByDate.has(workDate)) {
        logsByDate.set(workDate, log);
      }
    });

    for (const workDate of buildVisibleHistoryDateKeys(currentMonth, currentDateKey, resolvedUser)) {
      if (logsByDate.has(workDate)) continue;
      logsByDate.set(workDate, {
        id: `virtual-absent-${workDate}`,
        date: workDate,
        check_in: null,
        check_out: null,
        status: '결근',
        displayStatus: '결근',
        displayEarlyLeaveMinutes: null,
        isVirtual: true,
      });
    }

    const finalLogs = Array.from(logsByDate.values()).sort((a, b) =>
      String(b.date || '').localeCompare(String(a.date || ''))
    );

    setLogs(finalLogs);

    const logsNeedingSync = decoratedLogs.filter((log) => {
      const originalStatus = String(log.status || '').trim();
      return (
        getDisplayStatus(log) === '조퇴' &&
        (originalStatus === '정상' || originalStatus === 'present') &&
        log.check_out
      );
    });

    if (logsNeedingSync.length > 0) {
      Promise.all(
        logsNeedingSync.map(async (log) => {
          const workDate = String(log.date || '').slice(0, 10);
          const checkIn = (log.check_in as string | null | undefined) || null;
          const checkOut = (log.check_out as string | null | undefined) || null;
          const earlyLeaveMinutes = Number(log.displayEarlyLeaveMinutes || 0);

          if (!workDate || !checkOut || earlyLeaveMinutes <= 0) {
            return;
          }

          await supabase
            .from('attendance')
            .update({ status: '조퇴' })
            .eq('staff_id', userId)
            .eq('date', workDate);

          await syncToAttendances(workDate, checkIn, checkOut, '조퇴', { earlyLeaveMinutes });
        })
      ).catch((err: unknown) => {
        logger.warn('기존 조퇴 기록 보정 실패:', err);
      });
    }
  };


  // 📍 [핵심 기능] 현재 위치 가져오기 및 거리 계산

  // 📏 하버사인(Haversine) 공식: 두 좌표 간 거리 계산 (단위: m)
  const requestCurrentPosition = (options: PositionOptions) =>
    new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });

  const updateDistanceFromPosition = (latitude: number, longitude: number) => {
    const dist = calculateDistance(
      latitude,
      longitude,
      HOSPITAL_LOCATION.latitude,
      HOSPITAL_LOCATION.longitude
    );
    const roundedDistance = Math.floor(dist);
    setDistance(roundedDistance);
    lastResolvedLocationRef.current = {
      latitude,
      longitude,
      distance: roundedDistance,
      capturedAt: Date.now(),
    };
    return dist;
  };

  const resolveCurrentLocation = async ({
    showErrors = true,
    preferCached = true,
  }: {
    showErrors?: boolean;
    preferCached?: boolean;
  } = {}): Promise<boolean> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      if (showErrors) {
        toast('브라우저가 위치 정보를 지원하지 않습니다.', 'error');
      }
      return false;
    }

    const cachedLocation = lastResolvedLocationRef.current;
    if (preferCached && cachedLocation && Date.now() - cachedLocation.capturedAt <= 2 * 60 * 1000) {
      setDistance(cachedLocation.distance);
      if (cachedLocation.distance <= ALLOWED_RADIUS_METER) {
        return true;
      }
      if (showErrors) {
        toast(
          `현재 병원과 거리가 ${cachedLocation.distance}m입니다. 병원 반경 ${ALLOWED_RADIUS_METER}m 안에서만 출퇴근 처리할 수 있습니다.`,
          'warning'
        );
      }
      return false;
    }

    try {
      if ('permissions' in navigator && navigator.permissions?.query) {
        try {
          const permissionStatus = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
          if (permissionStatus.state === 'denied') {
            if (showErrors) {
              toast('위치 권한이 차단되어 있습니다. 브라우저 또는 앱 설정에서 위치 권한을 허용해 주세요.', 'error');
            }
            return false;
          }
        } catch {
          // Some browsers do not fully support querying geolocation permission state.
        }
      }

      let position: GeolocationPosition;
      try {
        position = await requestCurrentPosition({
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0,
        });
      } catch {
        position = await requestCurrentPosition({
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 60000,
        });
      }

      const { latitude, longitude } = position.coords;
      const dist = updateDistanceFromPosition(latitude, longitude);
      if (dist <= ALLOWED_RADIUS_METER) {
        return true;
      }
      if (showErrors) {
        toast(
          `현재 병원과 거리가 ${Math.floor(dist)}m입니다. 병원 반경 ${ALLOWED_RADIUS_METER}m 안에서만 출퇴근 처리할 수 있습니다.`,
          'warning'
        );
      }
      return false;
    } catch (error: any) {
      logger.warn('위치 확인 실패:', error?.message ?? error);
      if (!showErrors) {
        return false;
      }
      if (error?.code === 1) {
        toast('위치 권한이 차단되어 있습니다. 브라우저 또는 앱 설정에서 위치 권한을 허용해 주세요.', 'error');
      } else if (error?.code === 3) {
        toast('위치 확인 시간이 초과되었습니다. 야외에서 다시 시도하거나 GPS를 켜 주세요.', 'error');
      } else {
        toast('위치 정보를 정확히 가져올 수 없습니다. 다시 시도하거나 브라우저 위치 권한을 확인해 주세요.', 'error');
      }
      return false;
    }
  };

  const fetchWeather = useCallback(async (lat: number, lon: number) => {
    try {
      const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
      if (res.ok) {
        const data = (await res.json()) as WeatherData;
        setWeather(data);
      }
    } catch {
      // 날씨 정보 실패 시 무시
    }
  }, []);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // 지구 반경 (미터)
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // 거리 (m)
  };

  // attendance → attendances 동기화 (근태관리메인·급여정산과 연계)
  const syncToAttendances = async (
    workDate: string,
    checkIn: string | null,
    checkOut: string | null,
    status: string,
    options?: { earlyLeaveMinutes?: number | null }
  ) => {
    try {
      const statusMap: Record<string, string> = { '정상': 'present', '지각': 'late', '조퇴': 'early_leave', '결근': 'absent' };
      const attStatus = statusMap[status] || 'present';
      const mins = checkIn && checkOut
        ? Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 60000)
        : null;
      const userId = effectiveUserId;
      if (!userId) return;

      const basePayload = {
        staff_id: userId,
        work_date: workDate,
        check_in_time: checkIn,
        check_out_time: checkOut,
        status: attStatus,
        work_hours_minutes: mins ?? undefined,
      };

      const earlyLeaveMinutes = attStatus === 'early_leave'
        ? Math.max(0, Number(options?.earlyLeaveMinutes || 0))
        : 0;

      const result = await withMissingColumnFallback(
        () => supabase.from('attendances').upsert({
          ...basePayload,
          early_leave_minutes: earlyLeaveMinutes,
        }, { onConflict: 'staff_id,work_date' }),
        () => supabase.from('attendances').upsert(basePayload, { onConflict: 'staff_id,work_date' }),
        'early_leave_minutes'
      );

      if (result.error) {
        throw result.error;
      }
    } catch (syncErr) {
      console.error('출퇴근 동기화 실패:', syncErr);
    }
  };

  const resolveLateThreshold = async (
    workDate: string,
    fallbackDepartment?: string
  ): Promise<ShiftBoundary> => {
    const userId = effectiveUserId;
    if (!userId) return buildFallbackShiftBoundary(fallbackDepartment);

    try {
      const [{ shiftId: latestShiftId, department: latestDepartment, company: latestCompany }, assignmentResult] =
        await Promise.all([
          fetchLatestStaffShiftContext(),
          withMissingColumnFallback(
            () =>
              supabase
                .from('shift_assignments')
                .select('shift_id, shift_name')
                .eq('staff_id', userId)
                .eq('work_date', workDate)
                .maybeSingle(),
            () =>
              supabase
                .from('shift_assignments')
                .select('shift_id')
                .eq('staff_id', userId)
                .eq('work_date', workDate)
                .maybeSingle(),
            'shift_name'
          ),
        ]);

      if (assignmentResult.error) {
        throw assignmentResult.error;
      }

      const effectiveDepartment = latestDepartment || fallbackDepartment;
      const effectiveCompany = latestCompany;

      const assignment = (assignmentResult.data || null) as ShiftAssignmentReference | null;
      const shiftIds = Array.from(
        new Set(
          [String(assignment?.shift_id || '').trim(), String(latestShiftId || '').trim()].filter(Boolean)
        )
      );
      const shiftNames = Array.from(new Set([String(assignment?.shift_name || '').trim()].filter(Boolean)));

      if (shiftIds.length === 0 && shiftNames.length === 0) {
        return buildFallbackShiftBoundary(effectiveDepartment);
      }

      const [shiftIdsResult, shiftNamesResult] = await Promise.all([
        shiftIds.length > 0
          ? supabase.from('work_shifts').select('id, name, company_name, start_time, end_time').in('id', shiftIds)
          : Promise.resolve({ data: [], error: null }),
        shiftNames.length > 0
          ? supabase.from('work_shifts').select('id, name, company_name, start_time, end_time').in('name', shiftNames)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (shiftIdsResult.error) {
        throw shiftIdsResult.error;
      }
      if (shiftNamesResult.error) {
        throw shiftNamesResult.error;
      }

      const shiftLookup = buildShiftLookup([
        ...((shiftIdsResult.data || []) as ShiftLookupRecord[]),
        ...((shiftNamesResult.data || []) as ShiftLookupRecord[]),
      ]);
      const shiftRow = resolveAssignedShift(assignment, shiftLookup, {
        fallbackShiftId: latestShiftId,
        preferredCompany: effectiveCompany,
      });
      if (!shiftRow) {
        return buildFallbackShiftBoundary(effectiveDepartment);
      }

      const startTime = String((shiftRow as Record<string, unknown> | null | undefined)?.start_time || '').trim();
      const endTime = String((shiftRow as Record<string, unknown> | null | undefined)?.end_time || '').trim();
      return buildShiftBoundary(startTime, endTime, effectiveDepartment);
    } catch (error) {
      logger.warn('지각 기준 시간 조회 실패:', error);
      return buildFallbackShiftBoundary(fallbackDepartment);
    }
  };

  // 출퇴근 처리 (위치 검증 포함)
  const handleCommute = async (type: 'in' | 'out') => {
    if (isProcessing) return;
    setIsProcessing(true);

    // 1. 위치 검증 먼저 수행
    const isLocationValid = await resolveCurrentLocation({ showErrors: true, preferCached: true });
    if (!isLocationValid) {
      setIsProcessing(false);
      return; // 위치가 안 맞으면 여기서 중단!
    }

    // 2. 위치 인증 성공 시 DB 기록 시작
    const now = new Date();
    const today = formatLocalDateKey(now);
    const timeString = now.toISOString();
    const userId = effectiveUserId;
    const userDepartment = (resolvedUser as Record<string, unknown>)?.department as string | undefined;
    if (!userId) {
      toast('직원 계정 정보를 확인하는 중입니다. 잠시 후 다시 시도해 주세요.', 'warning');
      setIsProcessing(false);
      return;
    }

    try {
      if (type === 'in') {
        // 이미 출근 기록이 있으면 중복 처리 방지
        const { data: existingLog } = await supabase
          .from('attendance')
          .select('id, check_in, check_out')
          .eq('staff_id', userId)
          .eq('date', today)
          .maybeSingle();
        if (existingLog?.check_in) {
          toast('이미 오늘 출근 처리되었습니다.', 'warning');
          setIsProcessing(false);
          return;
        }

        const lateThreshold = await resolveLateThreshold(today, userDepartment);
        const nowMin = now.getHours() * 60 + now.getMinutes();
        const startMin = lateThreshold.hour * 60 + lateThreshold.minute;

        // 기본 지각 판단
        const isLateByStart =
          now.getHours() > lateThreshold.hour ||
          (now.getHours() === lateThreshold.hour && now.getMinutes() > lateThreshold.minute);

        // 근무 종료 시간 기반 시간대 이탈 감지 (교대 근무 오출근 방지)
        let isOutOfShiftWindow = false;
        if (lateThreshold.shiftKnown && lateThreshold.endHour !== null && lateThreshold.endMinute !== null) {
          const endMin = lateThreshold.endHour * 60 + lateThreshold.endMinute;
          // 야간/교대 근무: end_time < start_time (자정을 넘는 경우)
          if (endMin < startMin) {
            // 유효 체크인 범위: [start - 2h, end + 1h 다음날]
            // 시계 기준: endMin~(startMin-120) 구간이 무효
            const invalidStart = endMin; // 예: 06:00
            const invalidEnd = Math.max(0, startMin - 120); // 예: 20:00
            if (nowMin >= invalidStart && nowMin < invalidEnd) {
              isOutOfShiftWindow = true;
            }
          } else {
            // 일반 주간 근무: 근무 종료 이후 3시간 이상 경과 후 체크인은 이탈
            if (nowMin > endMin + 180) {
              isOutOfShiftWindow = true;
            }
          }
        }

        const isLate = isLateByStart || isOutOfShiftWindow;
        const finalStatus = isLate ? '지각' : '정상';
        const toastMsg = isOutOfShiftWindow
          ? `근무 시간대와 다른 시간에 출근 체크되었습니다. 지각으로 처리됩니다. (기준: ${lateThreshold.label})`
          : isLateByStart
          ? `지각 처리되었습니다. (기준: ${lateThreshold.label})`
          : '정상 출근되었습니다. 오늘도 화이팅!';

        const { data, error } = await supabase.from('attendance').upsert([{
          staff_id: userId,
          date: today,
          check_in: timeString,
          status: finalStatus
        }], { onConflict: 'staff_id,date' }).select().single();

        if (error) throw error;
        await syncToAttendances(today, timeString, null, finalStatus);
        setTodayLog(data);
        toast(toastMsg, isLate ? 'warning' : 'success');

        // 출근 완료 모달 + 날씨/미세먼지 정보
        setCheckInTime(now);
        setWeather(null);
        setShowCheckInSuccess(true);
        if (checkInSuccessTimerRef.current) clearTimeout(checkInSuccessTimerRef.current);
        checkInSuccessTimerRef.current = setTimeout(() => setShowCheckInSuccess(false), 10000);
        const loc = lastResolvedLocationRef.current;
        if (loc) void fetchWeather(loc.latitude, loc.longitude);

      } else {
        // 야간근무자는 자정을 넘겨서 퇴근하므로 activeTodayLog(오늘 날짜)가 없을 수 있음
        // → staleOpenLog(전날 미퇴근 기록)로 폴백하여 처리
        const targetLog = activeTodayLog || staleOpenLog;
        if (!targetLog) return;
        const checkInIso = targetLog.check_in as string | null;
        const workDate = String(targetLog.date || '').slice(0, 10);
        const lateThreshold = await resolveLateThreshold(workDate, userDepartment);
        const earlyLeaveMinutes = calculateEarlyLeaveMinutes(workDate, timeString, lateThreshold);
        const finalStatus = earlyLeaveMinutes > 0 ? '조퇴' : ((targetLog.status as string) || '정상');
        const { data, error } = await supabase
          .from('attendance')
          .update({ check_out: timeString, status: finalStatus })
          .eq('staff_id', userId)
          .eq('date', workDate)
          .is('check_out', null)
          .select()
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error('이미 퇴근 처리되었거나 출근 기록이 없습니다.');
        await syncToAttendances(workDate, checkInIso, timeString, finalStatus, { earlyLeaveMinutes });
        setTodayLog({ ...data, status: finalStatus });
        toast(
          earlyLeaveMinutes > 0
            ? `조퇴로 처리되었습니다. 정해진 퇴근 시간보다 ${earlyLeaveMinutes}분 일찍 퇴근하셨습니다.`
            : '퇴근 처리되었습니다. 고생하셨습니다!',
          earlyLeaveMinutes > 0 ? 'warning' : 'success'
        );

        const workedMinutes = checkInIso
          ? Math.max(0, Math.round((new Date(timeString).getTime() - new Date(checkInIso).getTime()) / 60000))
          : 0;
        setCheckOutSummary({
          checkInTime: formatTime(checkInIso || ''),
          checkOutTime: formatTime(timeString),
          workedMinutes,
        });
        setShowCheckOutSuccess(true);
        if (checkOutSuccessTimerRef.current) clearTimeout(checkOutSuccessTimerRef.current);
        checkOutSuccessTimerRef.current = setTimeout(() => setShowCheckOutSuccess(false), 10000);
      }
      await fetchMonthlyLogs();
    } catch (error: unknown) {
      toast('오류 발생: ' + ((error as Error)?.message ?? String(error)), 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatTime = (isoString: string) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatWorkedDuration = (workedMinutes: number) => {
    const safeMinutes = Math.max(0, workedMinutes);
    const hours = Math.floor(safeMinutes / 60);
    const minutes = safeMinutes % 60;
    if (!hours) return `${minutes}분`;
    if (!minutes) return `${hours}시간`;
    return `${hours}시간 ${minutes}분`;
  };

  const workedDaysCount = logs.filter((log) => !!log.check_in && !!log.check_out && getDisplayStatus(log) !== '결근').length;
  const lateCount = logs.filter((log) => getDisplayStatus(log) === '지각').length;
  const normalCount = logs.filter((log) => getDisplayStatus(log) === '정상').length;


  return (
    <div data-testid="commute-record-view" className="bg-[var(--card)] border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)] px-4 py-4 sm:p-5 h-full flex flex-col space-y-5">

      {/* 실시간 상태 카드 */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-[var(--foreground)] px-4 py-4 sm:px-5 sm:py-5 rounded-[var(--radius-lg)] text-white shadow-sm relative overflow-hidden">
        {/* 배경 장식 */}
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-[var(--card)] opacity-5 rounded-[var(--radius-lg)] blur-3xl"></div>

        <div className="space-y-2 z-10 min-w-0">
          <h2 className="text-2xl sm:text-3xl font-semibold tabular-nums whitespace-nowrap leading-none">
            {currentTime.toLocaleTimeString('ko-KR')}
          </h2>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className={`w-2 h-2 rounded-full animate-pulse ${activeTodayLog ? (activeTodayLog.check_out ? 'bg-[var(--toss-gray-3)]' : 'bg-green-500/100') : 'bg-red-500/100'}`}></span>
            <span className="text-sm font-bold mr-1">
              {activeTodayLog ? (activeTodayLog.check_out ? '퇴근 완료' : '근무 중') : '출근 전'}
            </span>
            {distance !== null && (
              <span className={`px-2 py-0.5 rounded-full text-[11px] ${distance <= ALLOWED_RADIUS_METER ? 'bg-green-500/100/20 text-green-400' : 'bg-red-500/100/20 text-red-400'}`}>
                병원 거리: {distance}m {distance <= ALLOWED_RADIUS_METER ? '확인' : '제한'}
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-3 z-10 shrink-0">
          {!activeTodayLog && (
            <button
              data-testid="commute-check-in-button"
              onClick={() => handleCommute('in')}
              disabled={isProcessing}
              className="px-5 py-3 sm:px-10 sm:py-5 w-full sm:w-auto bg-[var(--accent)] hover:opacity-90 rounded-[var(--radius-md)] font-semibold text-base sm:text-lg shadow-sm active:scale-95 transition-all flex flex-col items-center leading-none gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>{isProcessing ? '위치 확인 처리 중...' : '출근하기 ☀️'}</span>
              <span className="text-[11px] font-normal opacity-70">GPS 인증 필요</span>
            </button>
          )}
          {((activeTodayLog && !activeTodayLog.check_out) || staleOpenLog) && (
            <button
              data-testid="commute-check-out-button"
              onClick={() => handleCommute('out')}
              disabled={isProcessing}
              className="px-5 py-3 sm:px-10 sm:py-5 w-full sm:w-auto bg-red-600 hover:bg-red-500/100 rounded-[var(--radius-md)] font-semibold text-base sm:text-lg shadow-sm active:scale-95 transition-all flex flex-col items-center leading-none gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>{isProcessing ? '위치 확인 처리 중...' : '퇴근하기 🌙'}</span>
              <span className="text-[11px] font-normal opacity-70">GPS 인증 필요</span>
            </button>
          )}
        </div>
      </div>

      {staleOpenLog ? (
        <div className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] font-semibold text-amber-800">
          전날 미퇴근 기록이 남아 있습니다. 오늘 출근은 그대로 진행할 수 있고, 필요하면 출결 정정으로 어제 기록을 보정해 주세요.
        </div>
      ) : null}

      {/* 출근 완료 성공 모달 */}
      {showCheckInSuccess && (
        <CheckInSuccessModal
          checkInTime={checkInTime}
          weather={weather}
          onClose={() => {
            setShowCheckInSuccess(false);
            if (checkInSuccessTimerRef.current) clearTimeout(checkInSuccessTimerRef.current);
          }}
        />
      )}
      {showCheckOutSuccess && checkOutSummary && (
        <CheckOutSuccessModal
          summary={checkOutSummary}
          formatWorkedDuration={formatWorkedDuration}
          onClose={() => {
            setShowCheckOutSuccess(false);
            if (checkOutSuccessTimerRef.current) clearTimeout(checkOutSuccessTimerRef.current);
          }}
        />
      )}

      {/* 통계 */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <StatItem label="이번 달 근무" value={`${workedDaysCount}일`} />
        <StatItem label="지각" value={`${lateCount}회`} isWarning />
        <StatItem label="정상 출근" value={`${normalCount}회`} isSuccess />
      </div>

      {/* 근무시간 차트 */}
      {logs.length > 0 && <WorkHoursChart logs={logs} />}

      {/* 리스트 */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
        <div className="flex flex-wrap justify-between items-center mb-4 gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-semibold text-[var(--foreground)] tracking-tight">근무 히스토리</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-[var(--radius-md)] border border-[var(--border)] overflow-hidden text-[11px] font-semibold">
              <button
                onClick={() => setHistoryView('list')}
                className={`px-3 py-2 transition-colors ${historyView === 'list' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--card)] text-[var(--toss-gray-3)] hover:bg-[var(--muted)]'}`}
              >목록</button>
              <button
                onClick={() => setHistoryView('calendar')}
                className={`px-3 py-2 transition-colors ${historyView === 'calendar' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--card)] text-[var(--toss-gray-3)] hover:bg-[var(--muted)]'}`}
              >달력</button>
            </div>
            <button onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))} className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center border rounded-[var(--radius-md)] hover:bg-[var(--muted)]">◀</button>
            <span className="font-semibold px-1 text-sm">{currentMonth.getFullYear()}. {currentMonth.getMonth() + 1}</span>
            <button onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))} className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center border rounded-[var(--radius-md)] hover:bg-[var(--muted)]">▶</button>
          </div>
        </div>

        {historyView === 'calendar' ? (
          <AttendanceCalendar logs={logs} currentMonth={currentMonth} />
        ) : null}

        <div className={`space-y-4 ${historyView === 'calendar' ? 'hidden' : ''}`}>
          {logs.map((log) => {
            const workDate = new Date(log.date || '');
            const displayStatus = getDisplayStatus(log);
            return (
              <div
                key={log.id}
                data-testid={`commute-history-row-${String(log.date || '').slice(0, 10)}`}
                className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 sm:gap-4 p-3 sm:p-5 bg-[var(--muted)] rounded-[var(--radius-md)] border border-transparent hover:border-[var(--border)] transition-all"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-14 h-14 rounded-[var(--radius-md)] flex flex-col items-center justify-center font-semibold ${
                      displayStatus === '결근'
                        ? 'bg-red-500/15 text-red-600'
                        : displayStatus === '지각'
                        ? 'bg-red-500/20 text-red-600'
                        : displayStatus === '조퇴'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-[var(--toss-blue-light)] text-[var(--accent)]'
                    }`}
                  >
                    <span className="text-[11px] opacity-60">{workDate.getMonth() + 1}월</span>
                    <span className="text-lg leading-tight">{workDate.getDate()}일</span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[var(--toss-gray-3)]">
                      {workDate.toLocaleDateString('ko-KR', { weekday: 'long' })}
                    </p>
                    <p
                      data-testid={`commute-history-status-${String(log.date || '').slice(0, 10)}`}
                      className="font-semibold text-[var(--foreground)]"
                    >
                      {displayStatus || '-'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 md:gap-5 justify-between md:justify-end w-full">
                  <div className="flex gap-4">
                    <TimeBox label="출근" time={formatTime(log.check_in as string)} />
                    <TimeBox label="퇴근" time={formatTime(log.check_out as string)} />
                  </div>
                  {onRequestCorrection && !(
                    (displayStatus === '정상' || displayStatus === 'present') &&
                    log.check_in &&
                    log.check_out
                  ) && (
                    <button
                      type="button"
                      onClick={() => onRequestCorrection(log)}
                      className="px-3 py-2 rounded-[var(--radius-lg)] text-[11px] font-semibold border border-[var(--toss-blue-light)] text-[var(--accent)] bg-[var(--card)] hover:bg-[var(--toss-blue-light)] shrink-0"
                    >
                      정정 요청
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
