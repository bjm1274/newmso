'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { WORKPLACE_LOCATION, ALLOWED_DISTANCE_M } from '@/lib/location';
import { getStaffLikeId, normalizeStaffLike, resolveStaffLike } from '@/lib/staff-identity';
import { isApprovedLeaveStatus } from '@/lib/annual-leave-ledger';
import { withMissingColumnFallback } from '@/lib/supabase-compat';

const HOSPITAL_LOCATION = WORKPLACE_LOCATION;
const ALLOWED_RADIUS_METER = ALLOWED_DISTANCE_M;

interface CommuteRecordProps {
  user?: Record<string, unknown>;
  onRequestCorrection?: (log: Record<string, unknown>) => void;
}

interface WeatherData {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  weatherLabel: string;
  weatherEmoji: string;
  pm25: number;
  pm10: number;
  pm25Grade: string;
  pm25GradeColor: string;
  pm10Grade: string;
  pm10GradeColor: string;
  aqi: string;
  aqiColor: string;
}

interface LeaveRequestRow {
  id: string;
  leave_type: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  reason?: string | null;
}

type ShiftBoundary = {
  hour: number;
  minute: number;
  label: string;
  endHour: number | null;
  endMinute: number | null;
  shiftKnown: boolean;
};

type CommuteLog = {
  id?: string | number;
  date?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  status?: string | null;
  displayStatus?: string;
  displayEarlyLeaveMinutes?: number | null;
} & Record<string, unknown>;

function buildFallbackShiftBoundary(department?: string): ShiftBoundary {
  if (department === '의료진') {
    return {
      hour: 8,
      minute: 30,
      label: '08:30',
      endHour: null,
      endMinute: null,
      shiftKnown: false,
    };
  }
  return {
    hour: 9,
    minute: 10,
    label: '09:10',
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

  return Math.max(0, Math.round((scheduledEnd.getTime() - actualCheckOut.getTime()) / 60000));
}

function getDisplayStatus(log: CommuteLog | null | undefined) {
  return String(log?.displayStatus || log?.status || '').trim();
}

export default function CommuteRecord({ user, onRequestCorrection }: CommuteRecordProps) {
  const normalizedUser = normalizeStaffLike((user ?? {}) as Record<string, unknown>);
  const [resolvedUser, setResolvedUser] = useState<Record<string, unknown>>(normalizedUser);
  const [logs, setLogs] = useState<CommuteLog[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequestRow[]>([]);
  const [todayLog, setTodayLog] = useState<Record<string, unknown> | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [distance, setDistance] = useState<number | null>(null); // 병원과의 거리
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const effectiveUserId = getStaffLikeId(resolvedUser);
  const lastResolvedLocationRef = useRef<{
    latitude: number;
    longitude: number;
    distance: number;
    capturedAt: number;
  } | null>(null);

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
      initCommuteData();
    }
  }, [effectiveUserId, currentMonth]);

  const initCommuteData = async () => {
    setLoading(true);
    await Promise.all([fetchTodayLog(), fetchMonthlyLogs(), fetchMonthlyLeaveRequests()]);
    setLoading(false);
  };

  const fetchTodayLog = async () => {
    const today = new Date().toLocaleDateString('en-CA');
    const userId = effectiveUserId;
    if (!userId) return;
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('staff_id', userId)
      .eq('date', today)
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
    if (monthlyLogs.length === 0) {
      setLogs([]);
      return;
    }

    const currentShiftId = String((resolvedUser as Record<string, unknown>)?.shift_id || '').trim();
    const currentDepartment = String((resolvedUser as Record<string, unknown>)?.department || '').trim() || undefined;
    const needsStaffLookup = !currentShiftId || !currentDepartment;

    const [assignmentResult, staffResult] = await Promise.all([
      supabase
        .from('shift_assignments')
        .select('work_date, shift_id')
        .eq('staff_id', userId)
        .gte('work_date', startOfMonth)
        .lte('work_date', endOfMonth),
      needsStaffLookup
        ? supabase
            .from('staff_members')
            .select('shift_id, department')
            .eq('id', userId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    const assignmentByDate = new Map<string, string>(
      ((assignmentResult.data || []) as Array<{ work_date: string; shift_id: string | null }>)
        .filter((item) => item.shift_id)
        .map((item) => [String(item.work_date).slice(0, 10), String(item.shift_id)])
    );

    const effectiveDepartment =
      currentDepartment ||
      (staffResult?.data as Record<string, unknown> | null | undefined)?.department?.toString() ||
      undefined;

    const defaultShiftId = String(
      (staffResult?.data as Record<string, unknown> | null | undefined)?.shift_id ||
      currentShiftId ||
      ''
    ).trim();

    const shiftIds = Array.from(
      new Set(
        [...assignmentByDate.values(), defaultShiftId].filter(Boolean)
      )
    );

    const shiftsMap = new Map<string, { start_time?: string | null; end_time?: string | null }>();
    if (shiftIds.length > 0) {
      const { data: shiftRows } = await supabase
        .from('work_shifts')
        .select('id, start_time, end_time')
        .in('id', shiftIds);

      ((shiftRows || []) as Array<{ id: string; start_time?: string | null; end_time?: string | null }>).forEach((row) => {
        shiftsMap.set(String(row.id), row);
      });
    }

    const boundaryByDate = new Map<string, ShiftBoundary>();
    const resolveBoundaryForDate = (dateStr: string) => {
      const cached = boundaryByDate.get(dateStr);
      if (cached) return cached;

      const shiftId = assignmentByDate.get(dateStr) || defaultShiftId;
      const shiftRow = shiftId ? shiftsMap.get(shiftId) : null;
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

      return {
        ...log,
        displayStatus: earlyLeaveMinutes > 0 ? '조퇴' : String(log.status || ''),
        displayEarlyLeaveMinutes: earlyLeaveMinutes > 0 ? earlyLeaveMinutes : null,
      };
    });

    setLogs(decoratedLogs);

    const logsNeedingSync = decoratedLogs.filter((log) => {
      const originalStatus = String(log.status || '').trim();
      return (
        getDisplayStatus(log) === '조퇴' &&
        (originalStatus === '정상' || originalStatus === 'present') &&
        log.check_out
      );
    });

    if (logsNeedingSync.length > 0) {
      void Promise.all(
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
      ).catch((error) => {
        console.warn('기존 조퇴 기록 보정 실패:', error);
      });
    }
  };

  const fetchMonthlyLeaveRequests = async () => {
    const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toLocaleDateString('en-CA');
    const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).toLocaleDateString('en-CA');
    const userId = effectiveUserId;
    if (!userId) return;

    const { data, error } = await supabase
      .from('leave_requests')
      .select('id, leave_type, start_date, end_date, status, reason')
      .eq('staff_id', userId)
      .lte('start_date', endOfMonth)
      .or(`end_date.is.null,end_date.gte.${startOfMonth}`);

    if (error) {
      console.warn('월별 연차 캘린더 로드 실패:', error);
      setLeaveRequests([]);
      return;
    }

    setLeaveRequests(((data || []) as LeaveRequestRow[]).filter((row) => isApprovedLeaveStatus(row.status)));
  };

  // 📍 [핵심 기능] 현재 위치 가져오기 및 거리 계산
  const getCurrentLocation = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        toast('이 브라우저는 위치 정보를 지원하지 않습니다.');
        resolve(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const dist = calculateDistance(
            latitude,
            longitude,
            HOSPITAL_LOCATION.latitude,
            HOSPITAL_LOCATION.longitude
          );
          setDistance(Math.floor(dist)); // 거리 상태 업데이트 (m 단위)

          if (dist <= ALLOWED_RADIUS_METER) {
            resolve(true); // 허용 반경 이내 (성공)
          } else {
            toast(`🏥 병원과 거리가 너무 멉니다! (현재 거리: ${Math.floor(dist)}m)\n병원 반경 ${ALLOWED_RADIUS_METER}m 안에서만 출퇴근이 가능합니다.`);
            resolve(false); // 허용 반경 밖 (실패)
          }
        },
        (error) => {
          console.warn('위치 확인 실패:', error && (error as any).message ? (error as any).message : error);
          toast('위치 정보를 정확히 가져올 수 없습니다. 다시 시도하거나 브라우저 위치 권한을 확인해 주세요.', 'error');
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 } // GPS 정밀 모드 + 시간초과 + 캐시사용안함
      );
    });
  };

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
      console.warn('위치 확인 실패:', error?.message ?? error);
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
      const statusMap: Record<string, string> = { '정상': 'present', '지각': 'late', '조퇴': 'early_leave' };
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
      const currentShiftId = String((resolvedUser as Record<string, unknown>)?.shift_id || '').trim();
      const needsStaffLookup = !currentShiftId || !fallbackDepartment;

      const [assignmentResult, staffResult] = await Promise.all([
        supabase
          .from('shift_assignments')
          .select('shift_id')
          .eq('staff_id', userId)
          .eq('work_date', workDate)
          .maybeSingle(),
        needsStaffLookup
          ? supabase
              .from('staff_members')
              .select('shift_id, department')
              .eq('id', userId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      const effectiveDepartment =
        fallbackDepartment ||
        (staffResult?.data as Record<string, unknown> | null | undefined)?.department?.toString();

      const shiftId =
        String(
          assignmentResult?.data?.shift_id ||
            (staffResult?.data as Record<string, unknown> | null | undefined)?.shift_id ||
            currentShiftId ||
            ''
        ).trim();

      if (!shiftId) {
        return buildFallbackShiftBoundary(effectiveDepartment);
      }

      const { data: shiftRow } = await supabase
        .from('work_shifts')
        .select('start_time, end_time')
        .eq('id', shiftId)
        .maybeSingle();

      const startTime = String((shiftRow as Record<string, unknown> | null | undefined)?.start_time || '').trim();
      const endTime = String((shiftRow as Record<string, unknown> | null | undefined)?.end_time || '').trim();
      return buildShiftBoundary(startTime, endTime, effectiveDepartment);
    } catch (error) {
      console.warn('지각 기준 시간 조회 실패:', error);
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
    const today = now.toLocaleDateString('en-CA');
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
        if (!todayLog) return;
        const checkInIso = todayLog.check_in as string | null;
        const lateThreshold = await resolveLateThreshold(today, userDepartment);
        const earlyLeaveMinutes = calculateEarlyLeaveMinutes(today, timeString, lateThreshold);
        const finalStatus = earlyLeaveMinutes > 0 ? '조퇴' : ((todayLog.status as string) || '정상');
        const { data, error } = await supabase
          .from('attendance')
          .update({ check_out: timeString, status: finalStatus })
          .eq('staff_id', userId)
          .eq('date', today)
          .is('check_out', null)
          .select()
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error('이미 퇴근 처리되었거나 출근 기록이 없습니다.');
        await syncToAttendances(today, checkInIso, timeString, finalStatus, { earlyLeaveMinutes });
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

  const calendarDays = useMemo(() => {
    const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - monthStart.getDay());
    const gridEnd = new Date(monthEnd);
    gridEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()));

    const logMap = new Map<string, any>();
    logs.forEach((log) => {
      const key = String(log?.date || '').trim();
      if (key) logMap.set(key, log);
    });

    const leaveMap = new Map<string, LeaveRequestRow>();
    leaveRequests.forEach((leave) => {
      const start = leave.start_date ? new Date(leave.start_date) : null;
      const end = new Date(leave.end_date || leave.start_date || '');
      if (!start || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
      const cursor = new Date(start);
      while (cursor <= end) {
        const key = cursor.toLocaleDateString('en-CA');
        leaveMap.set(key, leave);
        cursor.setDate(cursor.getDate() + 1);
      }
    });

    const items: Array<{
      key: string;
      date: Date;
      inMonth: boolean;
      isToday: boolean;
      log: any | null;
      leave: LeaveRequestRow | null;
    }> = [];

    const cursor = new Date(gridStart);
    const todayKey = new Date().toLocaleDateString('en-CA');
    while (cursor <= gridEnd) {
      const key = cursor.toLocaleDateString('en-CA');
      items.push({
        key,
        date: new Date(cursor),
        inMonth: cursor.getMonth() === currentMonth.getMonth(),
        isToday: key === todayKey,
        log: logMap.get(key) || null,
        leave: leaveMap.get(key) || null,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    return items;
  }, [currentMonth, leaveRequests, logs]);

  return (
    <div data-testid="commute-record-view" className="bg-[var(--card)] border border-[var(--border)] shadow-sm rounded-2xl px-4 py-5 sm:p-5 h-full flex flex-col space-y-7">

      {/* 실시간 상태 카드 */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-[var(--foreground)] px-4 py-4 sm:px-5 sm:py-5 rounded-[var(--radius-lg)] text-white shadow-sm relative overflow-hidden">
        {/* 배경 장식 */}
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-[var(--card)] opacity-5 rounded-full blur-3xl"></div>

        <div className="space-y-2 z-10 min-w-0">
          <h2 className="text-2xl sm:text-4xl font-semibold tracking-tight tabular-nums whitespace-nowrap leading-none">
            {currentTime.toLocaleTimeString('ko-KR')}
          </h2>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className={`w-2 h-2 rounded-full animate-pulse ${todayLog ? (todayLog.check_out ? 'bg-[var(--toss-gray-3)]' : 'bg-green-500') : 'bg-red-500'}`}></span>
            <span className="text-sm font-bold mr-1">
              {todayLog ? (todayLog.check_out ? '퇴근 완료' : '근무 중') : '출근 전'}
            </span>
            {distance !== null && (
              <span className={`px-2 py-0.5 rounded-full text-[11px] ${distance <= ALLOWED_RADIUS_METER ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                병원 거리: {distance}m {distance <= ALLOWED_RADIUS_METER ? '✅' : '❌'}
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-3 z-10 shrink-0">
          {!todayLog && (
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
          {todayLog && !todayLog.check_out && (
            <button
              data-testid="commute-check-out-button"
              onClick={() => handleCommute('out')}
              disabled={isProcessing}
              className="px-5 py-3 sm:px-10 sm:py-5 w-full sm:w-auto bg-red-600 hover:bg-red-500 rounded-[var(--radius-md)] font-semibold text-base sm:text-lg shadow-sm active:scale-95 transition-all flex flex-col items-center leading-none gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>{isProcessing ? '위치 확인 처리 중...' : '퇴근하기 🌙'}</span>
              <span className="text-[11px] font-normal opacity-70">GPS 인증 필요</span>
            </button>
          )}
        </div>
      </div>

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
        <StatItem label="이번 달 근무" value={`${logs.length}일`} />
        <StatItem label="지각" value={`${logs.filter((log) => getDisplayStatus(log) === '지각').length}회`} isWarning />
        <StatItem label="정상 출근" value={`${logs.filter((log) => getDisplayStatus(log) === '정상').length}회`} isSuccess />
      </div>

      <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[var(--foreground)]">월간 출퇴근 / 연차 캘린더</h3>
            <p className="text-xs font-medium text-[var(--toss-gray-3)]">출근 기록과 승인된 연차를 한 달 단위로 같이 확인할 수 있습니다.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--muted)] px-2.5 py-1">
              <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
              근무
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              연차
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-2 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">
          {['일', '월', '화', '수', '목', '금', '토'].map((label) => (
            <div key={label} className="py-1">{label}</div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-2">
          {calendarDays.map(({ key, date, inMonth, isToday, log, leave }) => {
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            const leaveType = String(leave?.leave_type || '').trim();
            const leaveLabel = leaveType ? (leaveType.length > 6 ? `${leaveType.slice(0, 6)}…` : leaveType) : '';
            const displayStatus = getDisplayStatus(log as CommuteLog | null);
            const attendanceLabel = log ? (displayStatus || (log.check_out ? '근무완료' : '근무중')) : '';
            return (
              <div
                key={key}
                className={`min-h-[96px] rounded-2xl border px-2.5 py-2 text-left transition-colors ${
                  inMonth
                    ? 'border-[var(--border)] bg-[var(--background)]/40'
                    : 'border-transparent bg-[var(--muted)]/50 text-[var(--toss-gray-3)]'
                } ${isToday ? 'ring-2 ring-[var(--accent)]/25' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-black ${isWeekend && inMonth ? 'text-rose-500' : 'text-[var(--foreground)]'}`}>
                    {date.getDate()}
                  </span>
                  {isToday && (
                    <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[9px] font-bold text-white">오늘</span>
                  )}
                </div>
                <div className="mt-2 space-y-1.5">
                  {leave && (
                    <div className="rounded-xl bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
                      {leaveLabel || '연차'}
                    </div>
                  )}
                  {log && (
                    <div className="rounded-xl bg-[var(--muted)] px-2 py-1 text-[10px] font-semibold text-[var(--foreground)]">
                      <p className="truncate">{attendanceLabel}</p>
                      <p className="mt-0.5 text-[var(--toss-gray-3)]">{formatTime(String(log.check_in || ''))}</p>
                    </div>
                  )}
                  {!leave && !log && inMonth && (
                    <div className="rounded-xl border border-dashed border-[var(--border)] px-2 py-2 text-[10px] font-medium text-[var(--toss-gray-3)]">
                      일정 없음
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 리스트 */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-[var(--foreground)] tracking-tight">근무 히스토리</h3>
          <div className="flex gap-2">
            <button onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))} className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center border rounded-[var(--radius-md)] hover:bg-[var(--muted)]">◀</button>
            <span className="font-semibold px-2">{currentMonth.getFullYear()}. {currentMonth.getMonth() + 1}</span>
            <button onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))} className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center border rounded-[var(--radius-md)] hover:bg-[var(--muted)]">▶</button>
          </div>
        </div>

        <div className="space-y-4">
          {logs.map((log) => {
            const workDate = new Date(log.date || '');
            const displayStatus = getDisplayStatus(log);
            return (
              <div
                key={log.id}
                className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 sm:gap-4 p-3 sm:p-5 bg-[var(--muted)] rounded-[var(--radius-md)] border border-transparent hover:border-[var(--border)] transition-all"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-14 h-14 rounded-[var(--radius-md)] flex flex-col items-center justify-center font-semibold ${
                      displayStatus === '지각'
                        ? 'bg-red-100 text-red-600'
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
                    <p className="font-semibold text-[var(--foreground)]">{displayStatus || '-'}</p>
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

interface StatItemProps {
  label: string;
  value: string;
  isWarning?: boolean;
  isSuccess?: boolean;
}

function StatItem({ label, value, isWarning, isSuccess }: StatItemProps) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] p-4 rounded-[var(--radius-lg)] text-center shadow-sm">
      <p className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-2 uppercase">{label}</p>
      <p className={`text-2xl font-semibold ${isWarning ? 'text-red-500' : isSuccess ? 'text-[var(--accent)]' : 'text-[var(--foreground)]'}`}>{value}</p>
    </div>
  );
}

interface TimeBoxProps {
  label: string;
  time: string;
}

function TimeBox({ label, time }: TimeBoxProps) {
  return (
    <div className="text-right">
      <p className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1">{label}</p>
      <p className="text-base font-semibold text-[var(--foreground)]">{time}</p>
    </div>
  );
}

// ──────────────────────────────────────────────
// 출근 완료 모달 (날씨 + 미세먼지)
// ──────────────────────────────────────────────

const AQI_COLOR_MAP: Record<string, string> = {
  green:  '#10B981',
  yellow: '#F59E0B',
  orange: '#F97316',
  red:    '#EF4444',
  gray:   '#9CA3AF',
};

const AQI_BG_MAP: Record<string, string> = {
  green:  'rgba(16,185,129,0.12)',
  yellow: 'rgba(245,158,11,0.12)',
  orange: 'rgba(249,115,22,0.12)',
  red:    'rgba(239,68,68,0.12)',
  gray:   'rgba(156,163,175,0.12)',
};

interface CheckInSuccessModalProps {
  checkInTime: Date | null;
  weather: WeatherData | null;
  onClose: () => void;
}

function CheckInSuccessModal({ checkInTime, weather, onClose }: CheckInSuccessModalProps) {
  const timeStr = checkInTime
    ? checkInTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : '-';

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center p-4 pointer-events-none">
      <div
        className="w-full max-w-sm pointer-events-auto animate-slide-up"
        style={{ animation: 'slide-up 0.35s cubic-bezier(.22,1,.36,1) both' }}
      >
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-lg)] overflow-hidden">
          {/* 헤더 */}
          <div className="bg-[var(--accent)] px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <p className="text-white font-bold text-[15px] leading-tight">출근 완료!</p>
                <p className="text-white/75 text-[12px] font-medium">{timeStr} 출근 처리되었습니다</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-[var(--radius-md)] text-white/70 hover:text-white hover:bg-white/15 transition-colors text-base"
            >
              ×
            </button>
          </div>

          {/* 날씨 / 미세먼지 */}
          <div className="px-5 py-4">
            {!weather ? (
              <div className="flex items-center gap-3 py-1">
                <div className="w-8 h-8 rounded-full skeleton" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton-text" />
                  <div className="skeleton-sm" style={{ width: '60%' }} />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* 날씨 요약 */}
                <div className="flex items-center gap-3">
                  <span className="text-3xl leading-none">{weather.weatherEmoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[22px] font-bold text-[var(--foreground)] tabular-nums leading-none">
                        {weather.temperature}°
                      </span>
                      <span className="text-[13px] font-medium text-[var(--toss-gray-3)]">
                        {weather.weatherLabel}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--toss-gray-4)] mt-0.5">
                      체감 {weather.feelsLike}° · 습도 {weather.humidity}% · 바람 {weather.windSpeed}m/s
                    </p>
                  </div>
                </div>

                {/* 미세먼지 배지 */}
                <div className="flex gap-2">
                  <AqiBadge
                    label="PM2.5"
                    value={weather.pm25 >= 0 ? `${weather.pm25}㎍` : '-'}
                    grade={weather.pm25Grade}
                    color={AQI_COLOR_MAP[weather.pm25GradeColor] ?? '#9CA3AF'}
                    bg={AQI_BG_MAP[weather.pm25GradeColor] ?? 'rgba(156,163,175,0.12)'}
                  />
                  <AqiBadge
                    label="PM10"
                    value={weather.pm10 >= 0 ? `${weather.pm10}㎍` : '-'}
                    grade={weather.pm10Grade}
                    color={AQI_COLOR_MAP[weather.pm10GradeColor] ?? '#9CA3AF'}
                    bg={AQI_BG_MAP[weather.pm10GradeColor] ?? 'rgba(156,163,175,0.12)'}
                  />
                  <div
                    className="flex-1 rounded-[var(--radius-md)] px-3 py-2 flex flex-col items-center justify-center gap-0.5"
                    style={{
                      background: AQI_BG_MAP[weather.aqiColor] ?? 'rgba(156,163,175,0.12)',
                      border: `1px solid ${AQI_COLOR_MAP[weather.aqiColor] ?? '#9CA3AF'}33`,
                    }}
                  >
                    <span className="text-[9px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wide">종합</span>
                    <span
                      className="text-[13px] font-bold leading-tight"
                      style={{ color: AQI_COLOR_MAP[weather.aqiColor] ?? '#9CA3AF' }}
                    >
                      {weather.aqi}
                    </span>
                  </div>
                </div>

                <p className="text-[10px] text-[var(--toss-gray-4)] text-right">
                  현재 위치 기준 · Open-Meteo
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface CheckOutSuccessModalProps {
  summary: {
    checkInTime: string;
    checkOutTime: string;
    workedMinutes: number;
  };
  formatWorkedDuration: (workedMinutes: number) => string;
  onClose: () => void;
}

function CheckOutSuccessModal({ summary, formatWorkedDuration, onClose }: CheckOutSuccessModalProps) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center p-4 pointer-events-none">
      <div
        className="w-full max-w-sm pointer-events-auto animate-slide-up"
        style={{ animation: 'slide-up 0.35s cubic-bezier(.22,1,.36,1) both' }}
      >
        <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-lg)]">
          <div className="flex items-center justify-between bg-slate-900 px-5 py-4 text-white">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🌙</span>
              <div>
                <p className="text-[15px] font-bold leading-tight">퇴근 완료</p>
                <p className="text-[12px] font-medium text-white/75">수고하셨습니다. 오늘 근무가 안전하게 저장됐습니다.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-base text-white/70 transition-colors hover:bg-white/15 hover:text-white"
            >
              ×
            </button>
          </div>

          <div className="space-y-3 px-5 py-4">
            <div className="rounded-[var(--radius-lg)] bg-[var(--muted)] p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">총 근무시간</p>
              <p className="mt-2 text-2xl font-black text-[var(--foreground)]">{formatWorkedDuration(summary.workedMinutes)}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] px-3 py-3">
                <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">출근</p>
                <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{summary.checkInTime}</p>
              </div>
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] px-3 py-3">
                <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">퇴근</p>
                <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{summary.checkOutTime}</p>
              </div>
            </div>

            <p className="text-right text-[11px] font-medium text-[var(--toss-gray-4)]">휴식 잘 챙기시고 내일도 좋은 하루 보내세요.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface AqiBadgeProps {
  label: string;
  value: string;
  grade: string;
  color: string;
  bg: string;
}

function AqiBadge({ label, value, grade, color, bg }: AqiBadgeProps) {
  return (
    <div
      className="flex-1 rounded-[var(--radius-md)] px-3 py-2 flex flex-col items-center gap-0.5"
      style={{ background: bg, border: `1px solid ${color}33` }}
    >
      <span className="text-[9px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wide">{label}</span>
      <span className="text-[11px] font-semibold text-[var(--foreground)] tabular-nums">{value}</span>
      <span className="text-[11px] font-bold leading-tight" style={{ color }}>{grade}</span>
    </div>
  );
}
