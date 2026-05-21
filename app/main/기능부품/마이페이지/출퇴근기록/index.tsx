'use client';

import { useIsMobile } from '@/app/components/useIsMobile';
import { calculateDistance as calculateDistanceMeters } from '@/lib/geo';
import { ALLOWED_DISTANCE_M,WORKPLACE_LOCATION } from '@/lib/location';
import { logger } from '@/lib/logger';
import {
buildShiftLookup,
resolveAssignedShift,
type ShiftAssignmentReference,
type ShiftLookupRecord,
} from '@/lib/shift-resolution';
import { getStaffShifts, type StaffShiftEntry } from '@/lib/staff-shift-resolver';
import { getStaffLikeId,normalizeStaffLike,resolveStaffLike } from '@/lib/staff-identity';
import { supabase } from '@/lib/supabase';
import { isMissingColumnError, withMissingColumnFallback } from '@/lib/supabase-compat';
import { toast } from '@/lib/toast';
import { formatLocalDateKey } from '@/lib/use-local-date-key';
import { useCallback,useEffect,useRef,useState } from 'react';
import 모바일체크인 from '../../근태기록/모바일체크인';
import {
  buildFallbackShiftBoundary,
  buildShiftBoundary,
  calculateEarlyLeaveMinutes,
  resolveLateThreshold as resolveLateThresholdHelper,
  resolveStaleOpenLog,
  syncToAttendances as syncToAttendancesHelper,
} from './checkin-utils';
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

type WorkStatusCode = 'break' | 'lunch' | 'field' | null;
type WorkStatusLabel = '근무중' | '휴게' | '점심' | '외근';

const WORK_STATUS_LABEL_TO_CODE: Record<WorkStatusLabel, WorkStatusCode> = {
  근무중: null,
  휴게: 'break',
  점심: 'lunch',
  외근: 'field',
};

const WORK_STATUS_LABELS: WorkStatusLabel[] = ['근무중', '휴게', '점심', '외근'];

function codeToLabel(code: string | null | undefined): WorkStatusLabel {
  if (code === 'break') return '휴게';
  if (code === 'lunch') return '점심';
  if (code === 'field') return '외근';
  return '근무중';
}

interface CommuteRecordProps {
  user?: Record<string, unknown>;
  onRequestCorrection?: (log: Record<string, unknown>) => void;
}

function buildDateWithTime(dateStr: string, hour: number, minute: number) {
  const [year, month, day] = String(dateStr).slice(0, 10).split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, hour, minute, 0, 0);
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
  const isMobile = useIsMobile();
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

  const [staffShifts, setStaffShifts] = useState<StaffShiftEntry[]>([]);
  const [staffShiftNames, setStaffShiftNames] = useState<Map<string, string>>(new Map());
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
  const [currentWorkStatus, setCurrentWorkStatus] = useState<WorkStatusLabel>('근무중');
  // statusChangeNotifiedRef: 컬럼 미존재 toast를 중복 방지용
  const statusChangeNotifiedRef = useRef(false);
  const checkOutSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLocationRefreshAtRef = useRef<number>(0);
  const activeTodayLog =
    todayLog && String((todayLog as Record<string, unknown>)?.date || '').slice(0, 10) === currentDateKey
      ? todayLog
      : null;
  const staleOpenLog = resolveStaleOpenLog(logs, currentDateKey);

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
      // 1. staff_shift_assignments에서 다중 근무유형 조회 (is_primary 우선)
      const [shifts, staffRow] = await Promise.all([
        getStaffShifts(userId),
        supabase
          .from('staff_members')
          .select('shift_id, department, company')
          .eq('id', userId)
          .maybeSingle()
          .then((r) => r.data as Record<string, unknown> | null | undefined),
      ]);

      // 조회 결과 저장 (UI chip 표시용) + shift 이름 배치 조회
      if (shifts.length > 0) {
        setStaffShifts(shifts);
        const shiftIds = shifts.map((e) => e.shiftId);
        void Promise.resolve(
          supabase
            .from('work_shifts')
            .select('id, name')
            .in('id', shiftIds)
        ).then(({ data: shiftRows }) => {
          if (Array.isArray(shiftRows)) {
            const nameMap = new Map<string, string>(
              (shiftRows as Array<{ id: string; name: string | null }>).map((r) => [r.id, r.name ?? r.id]),
            );
            setStaffShiftNames(nameMap);
          }
        }).catch(() => {});
      }

      // 주근무유형 ID 결정: is_primary → staff_members.shift_id(legacy)
      const primaryEntry = shifts.find((e) => e.isPrimary) ?? shifts[0] ?? null;
      const resolvedShiftId =
        primaryEntry?.shiftId ||
        String(staffRow?.shift_id || '').trim() ||
        fallbackShiftId;

      return {
        shiftId: resolvedShiftId,
        department:
          String(staffRow?.department || '').trim() || fallbackDepartment,
        company:
          String(staffRow?.company || '').trim() || fallbackCompany,
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
    // JM2: focus + visibilitychange 단일 핸들러로 통합, 30초 throttle + hidden skip
    const refreshLocation = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastLocationRefreshAtRef.current < 30_000) return;
      lastLocationRefreshAtRef.current = now;
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

  // JM2/JM3: 워크센터 "정상 처리" 등 외부 이벤트로 본인 근태가 보정되면 즉시 재로드.
  //   - 다른 직원 이벤트는 무시
  //   - effectiveUserId 가 없으면 listener 등록 안 함
  useEffect(() => {
    if (typeof window === 'undefined' || !effectiveUserId) return;
    const handleAttendanceUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ staffId?: unknown }>).detail;
      const targetId = detail?.staffId ? String(detail.staffId) : '';
      if (targetId && targetId !== effectiveUserId) return;
      void initCommuteData();
    };
    window.addEventListener('erp-attendance-updated', handleAttendanceUpdated as EventListener);
    return () => {
      window.removeEventListener('erp-attendance-updated', handleAttendanceUpdated as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUserId]);

  useEffect(() => {
    if (!effectiveUserId) return;
    void fetchTodayLog(currentDateKey);
  }, [effectiveUserId, currentDateKey]);

  // activeTodayLog의 current_status로 로컬 상태 초기화
  useEffect(() => {
    if (!activeTodayLog || activeTodayLog.check_out) {
      setCurrentWorkStatus('근무중');
      return;
    }
    const raw = String((activeTodayLog as Record<string, unknown>)?.current_status ?? '');
    setCurrentWorkStatus(codeToLabel(raw || null));
  }, [
    (activeTodayLog as Record<string, unknown> | null)?.id,
    (activeTodayLog as Record<string, unknown> | null)?.current_status,
    (activeTodayLog as Record<string, unknown> | null)?.check_out,
  ]);

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
          ? supabase.from('work_shifts').select('id, name, company_name, start_time, end_time, description, weekly_work_days, is_weekend_work').in('id', shiftIds)
          : Promise.resolve({ data: [], error: null }),
        shiftNames.length > 0
          ? supabase.from('work_shifts').select('id, name, company_name, start_time, end_time, description, weekly_work_days, is_weekend_work').in('name', shiftNames)
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
        workDate: dateStr,
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
    const dist = calculateDistanceMeters(
      { latitude, longitude },
      { latitude: HOSPITAL_LOCATION.latitude, longitude: HOSPITAL_LOCATION.longitude },
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

  const syncToAttendances = useCallback(
    async (
      workDate: string,
      checkIn: string | null,
      checkOut: string | null,
      status: string,
      options?: { earlyLeaveMinutes?: number | null },
    ) => {
      const userId = effectiveUserId;
      if (!userId) return;
      await syncToAttendancesHelper(userId, workDate, checkIn, checkOut, status, options);
    },
    [effectiveUserId],
  );

  const handleStatusChange = useCallback(
    async (next: WorkStatusLabel) => {
      const userId = effectiveUserId;
      if (!userId || !activeTodayLog || activeTodayLog.check_out) return;
      const workDate = String((activeTodayLog as Record<string, unknown>)?.date || '').slice(0, 10);
      if (!workDate) return;

      // 낙관적 업데이트
      const previous = currentWorkStatus;
      setCurrentWorkStatus(next);

      const newCode = WORK_STATUS_LABEL_TO_CODE[next];
      const now = new Date().toISOString();

      try {
        const { error } = await supabase
          .from('attendances')
          .update({
            current_status: newCode,
            current_status_at: now,
          })
          .eq('staff_id', userId)
          .eq('work_date', workDate);

        if (error) {
          if (isMissingColumnError(error, 'current_status')) {
            // 컬럼 미존재 — 1회만 안내 toast, 크래시 없이 낙관적 상태 유지
            if (!statusChangeNotifiedRef.current) {
              statusChangeNotifiedRef.current = true;
              toast('상태 기능은 곧 활성화됩니다.', 'info');
            }
            return;
          }
          // 기타 에러 → 롤백
          setCurrentWorkStatus(previous);
          toast('상태 변경 중 오류가 발생했습니다.', 'error');
        }
      } catch {
        setCurrentWorkStatus(previous);
        toast('상태 변경 중 오류가 발생했습니다.', 'error');
      }
    },
    [effectiveUserId, activeTodayLog, currentWorkStatus],
  );

  const resolveLateThreshold = useCallback(
    async (workDate: string, fallbackDepartment?: string): Promise<ShiftBoundary> => {
      const userId = effectiveUserId;
      if (!userId) return buildFallbackShiftBoundary(fallbackDepartment);
      const fallbackCompany = String(
        (resolvedUser as Record<string, unknown>)?.company ||
          (resolvedUser as Record<string, unknown>)?.company_name ||
          '',
      ).trim() || undefined;
      const fallbackShiftId = String(
        (resolvedUser as Record<string, unknown>)?.shift_id || '',
      ).trim();
      return resolveLateThresholdHelper(userId, workDate, {
        department: fallbackDepartment,
        company: fallbackCompany,
        shiftId: fallbackShiftId,
      });
    },
    [effectiveUserId, resolvedUser],
  );

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

  // 정의: 출+퇴 모두 + 결근 아님. 출근만 있어도 카운트하려면 check_out 조건 제거
  const workedDaysCount = logs.filter((log) => !!log.check_in && !!log.check_out && getDisplayStatus(log) !== '결근').length;
  const lateCount = logs.filter((log) => getDisplayStatus(log) === '지각').length;
  const normalCount = logs.filter((log) => getDisplayStatus(log) === '정상').length;

  // 모바일 통계: 평균 근무시간(분) — 출+퇴 둘 다 있는 로그만 평균
  const completedLogs = logs.filter(
    (log) => !!log.check_in && !!log.check_out && getDisplayStatus(log) !== '결근',
  );
  const avgWorkedMinutes = completedLogs.length
    ? Math.round(
        completedLogs.reduce((acc, log) => {
          const inMs = new Date(log.check_in as string).getTime();
          const outMs = new Date(log.check_out as string).getTime();
          const diff = Math.max(0, outMs - inMs);
          return acc + Math.round(diff / 60000);
        }, 0) / completedLogs.length,
      )
    : 0;

  if (isMobile) {
    return (
      <모바일체크인
        staffId={effectiveUserId || null}
        companyLocation={WORKPLACE_LOCATION}
        monthlySummary={{
          workedDays: workedDaysCount,
          lateCount,
          avgWorkedMinutes,
        }}
        onCheckedIn={() => {
          void initCommuteData();
        }}
        onCheckedOut={() => {
          void initCommuteData();
        }}
      />
    );
  }

  return (
    <div data-testid="commute-record-view" className="bg-[var(--card)] border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)] px-4 py-4 sm:p-5 h-full flex flex-col space-y-5">

      {/* 실시간 상태 카드 */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-[var(--foreground)] px-4 py-4 sm:px-5 sm:py-5 rounded-[var(--radius-lg)] text-white shadow-sm relative overflow-hidden">
        {/* 배경 장식 */}
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-[var(--card)] opacity-5 rounded-[var(--radius-lg)] blur-3xl"></div>

        <div className="space-y-1.5 z-10 min-w-0">
          <p className="text-[12px] font-semibold text-white/55">
            {currentTime.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          </p>
          <h2 className="text-[44px] font-bold tabular-nums whitespace-nowrap leading-none">
            {currentTime.toLocaleTimeString('ko-KR')}
          </h2>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className={`w-2 h-2 rounded-full animate-pulse ${activeTodayLog ? (activeTodayLog.check_out ? 'bg-[var(--toss-gray-3)]' : 'bg-green-400') : 'bg-red-400'}`}></span>
            <span className="text-sm font-bold mr-1">
              {activeTodayLog ? (activeTodayLog.check_out ? '퇴근 완료' : '근무 중') : '출근 전'}
            </span>
            {distance !== null && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${distance <= ALLOWED_RADIUS_METER ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                GPS 인증 · {distance}m {distance <= ALLOWED_RADIUS_METER ? '확인' : '제한'}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 z-10 shrink-0">
          <div className="flex gap-3">
            {!activeTodayLog && (
              <button
                data-testid="commute-check-in-button"
                onClick={() => handleCommute('in')}
                disabled={isProcessing}
                className="px-5 py-3 sm:px-10 sm:py-5 w-full sm:w-auto bg-[var(--accent)] hover:opacity-90 rounded-[var(--radius-md)] font-semibold text-base sm:text-lg shadow-sm active:scale-95 transition-all flex flex-col items-center leading-none gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{isProcessing ? '위치 확인 처리 중...' : '출근하기'}</span>
                <span className="text-[11px] font-normal opacity-70">GPS 인증 필요</span>
              </button>
            )}
            {((activeTodayLog && !activeTodayLog.check_out) || staleOpenLog) && (
              <button
                data-testid="commute-check-out-button"
                onClick={() => handleCommute('out')}
                disabled={isProcessing}
                className="px-5 py-3 sm:px-10 sm:py-5 w-full sm:w-auto bg-red-600 hover:bg-red-500 rounded-[var(--radius-md)] font-semibold text-base sm:text-lg shadow-sm active:scale-95 transition-all flex flex-col items-center leading-none gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{isProcessing ? '위치 확인 처리 중...' : '퇴근하기'}</span>
                <span className="text-[11px] font-normal opacity-70">GPS 인증 필요</span>
              </button>
            )}
          </div>
          {/* 근무 상태 토글 — 출근 중이고 아직 퇴근 안 한 경우만 표시 */}
          {activeTodayLog && !activeTodayLog.check_out && (
            <div
              role="group"
              aria-label="근무 상태 선택"
              className="flex rounded-[var(--radius-md)] bg-white/10 p-0.5 gap-0.5"
            >
              {WORK_STATUS_LABELS.map((label) => {
                const isActive = currentWorkStatus === label;
                const colorClass =
                  label === '근무중'
                    ? isActive
                      ? 'bg-green-500 text-white'
                      : 'text-white/60 hover:text-white/90'
                    : label === '외근'
                    ? isActive
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-white/60 hover:text-white/90'
                    : isActive
                    ? 'bg-amber-400 text-white'
                    : 'text-white/60 hover:text-white/90';
                return (
                  <button
                    key={label}
                    type="button"
                    data-testid={`work-status-toggle-${label}`}
                    aria-pressed={isActive}
                    onClick={() => { void handleStatusChange(label); }}
                    className={`rounded-[var(--radius-md)] px-3 py-1.5 text-[11px] font-bold transition-all ${colorClass}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
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

      {/* 담당 근무유형 chip (다중 근무유형 표시) */}
      {staffShifts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">담당 근무유형</span>
          <div role="list" aria-label="담당 근무유형 목록" className="flex flex-wrap gap-1.5">
            {staffShifts.map((entry) => (
              <span
                key={entry.shiftId}
                role="listitem"
                tabIndex={0}
                aria-label={`${entry.isPrimary ? '주근무' : '부근무'}: ${staffShiftNames.get(entry.shiftId) ?? entry.shiftId}`}
                className={`rounded-[var(--radius-md)] border px-2.5 py-1 text-[11px] font-bold outline-none focus:ring-1 focus:ring-[var(--accent)] ${
                  entry.isPrimary
                    ? 'border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]'
                    : 'border-[var(--border)] bg-[var(--muted)] text-[var(--toss-gray-3)]'
                }`}
              >
                {entry.isPrimary ? '★ ' : ''}{staffShiftNames.get(entry.shiftId) ?? entry.shiftId}
              </span>
            ))}
          </div>
        </div>
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
                        ? 'bg-[var(--danger-light)] text-[var(--danger)]'
                        : displayStatus === '지각' || displayStatus === '조퇴'
                        ? 'bg-[var(--warning-light)] text-[var(--warning)]'
                        : displayStatus === '정상' || displayStatus === 'present'
                        ? 'bg-[var(--success-light)] text-[var(--success)]'
                        : 'bg-[var(--muted)] text-[var(--toss-gray-3)]'
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
