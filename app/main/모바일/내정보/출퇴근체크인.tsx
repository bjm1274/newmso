'use client';

/**
 * SAttend — 모바일 출퇴근 체크인
 *   - hero: 날짜 + 시:분(현재 시간) + GPS 칩
 *   - 큰 체크인/체크아웃 버튼 (그라데이션)
 *   - 오늘 기록 (출근/외출/복귀/퇴근)
 *   - 이번 주 요약 (KPI 3개)
 * 기존 모바일체크인.tsx의 GPS·db mutation 로직 그대로 재사용.
 * JM(파일당 500줄), JM3(에러 분기), JM4(any 금지), JM6(button 시맨틱, aria-live)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useGeolocationCheckin } from '@/app/hooks/useGeolocationCheckin';
import { ALLOWED_DISTANCE_M, WORKPLACE_LOCATION } from '@/lib/location';
import { calculateDistance } from '@/lib/geo';
import { db } from '@/lib/db-client';
import { toast } from '@/lib/toast';
import { getKoreanTodayString, formatKoreanDateKey } from '@/lib/seoul-time';
import { enqueueD1Mutation } from '@/lib/offline-queue-d1';
import { getOfflineQueue } from '@/lib/offline-queue';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MBtn from '../공통/MBtn';
import { useMonthlyAttendance } from './data-hooks';
import {
  resolveCheckInStatus,
  syncAttendanceToAttendances,
  resolveLateThreshold,
  calculateEarlyLeaveMinutes } from '@/app/main/기능부품/마이페이지/출퇴근기록/checkin-utils';

type OpenLog = {
  id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status?: string | null;
};

const ACCURACY_WARN_M = 200;

function formatHHmm(iso: string | null) {
  if (!iso) return '—';
  const raw = String(iso).trim();
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
    return raw.slice(0, 5);
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatClock(now: Date) {
  const h12 = now.getHours() % 12 || 12;
  const ampm = now.getHours() < 12 ? '오전' : '오후';
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return { ampm, hm: `${h12}:${mm}`, ss };
}

function formatTodayLong(now: Date) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const dow = ['일', '월', '화', '수', '목', '금', '토'][now.getDay()];
  return `${y}년 ${m}월 ${d}일 (${dow}요일)`;
}

export type SAttendProps = {
  staffId: string | null;
  staffName?: string;
  company?: string;
  onBack: () => void;
};

export default function SAttend({ staffId, company, onBack }: SAttendProps) {
  const { status, coords, error, requestLocation } = useGeolocationCheckin();
  const [now, setNow] = useState<Date>(() => new Date());
  const [submitting, setSubmitting] = useState(false);
  const [todayLog, setTodayLog] = useState<OpenLog | null>(null);
  const [staleLog, setStaleLog] = useState<OpenLog | null>(null);
  const openLog = todayLog || staleLog;
  const { data: monthly, refetch } = useMonthlyAttendance(staffId);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // 오늘 출퇴근 기록 조회 — useCallback으로 분리해 앱 복귀(포커스/visibility) 시 재호출
  const fetchTodayLog = useCallback(async () => {
    if (!staffId) { setTodayLog(null); setStaleLog(null); return; }
    try {
      const today = getKoreanTodayString();
      let activeLog: OpenLog | null = null;
      let staleLogCandidate: OpenLog | null = null;

      try {
        // 1. 오늘 날짜 기록 (중복 에러 방지를 위해 limit(1) 사용)
        const { data: todayData } = await db
          .from('attendance')
          .select('id, staff_id, date, check_in, check_out, status')
          .eq('staff_id', staffId)
          .eq('date', today)
          .order('created_at', { ascending: false })
          .limit(1);

        activeLog = (todayData?.[0] as OpenLog) ?? null;

        // 2. 야간 근무자 구제 로직을 위해 어제 기록(stale log) 찾기 (KST 기준)
        const yesterdayKey = formatKoreanDateKey(new Date(Date.now() - 86400000));

        const { data: staleData } = await db
          .from('attendance')
          .select('id, staff_id, date, check_in, check_out, status')
          .eq('staff_id', staffId)
          .not('check_in', 'is', null)
          .neq('status', '결근') // 결근 처리된 건 제외
          .gte('date', yesterdayKey) // 어제 이후만
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1);

        const cand = staleData?.[0] as OpenLog | undefined;
        if (cand && cand.date !== today) {
          const checkedOutToday = cand.check_out
            ? formatKoreanDateKey(new Date(cand.check_out)) === today
            : false;
          // 미퇴근이거나, 오늘 막 퇴근한(자정 넘긴) 기록만 stale log로 유지한다.
          if (!cand.check_out || checkedOutToday) {
            staleLogCandidate = cand;
          }
        }
      } catch (dbErr) {
        console.warn('DB 출퇴근 기록 조회 실패 (오프라인 상태일 수 있음):', dbErr);
      }

      // 3. 로컬 오프라인 큐가 있다면 병합
      try {
        const queue = getOfflineQueue();
        await queue.ready();
        const queueItems = queue.list();

        const checkInFromQueue: Record<string, string | null> = {};
        const checkOutFromQueue: Record<string, string | null> = {};
        const statusFromQueue: Record<string, string | null> = {};

        for (const item of queueItems) {
          if (!item.type.startsWith('db:') || !item.type.endsWith(':attendance')) continue;
          const payload = item.payload as any;
          if (!payload || payload.table !== 'attendance') continue;

          const data = Array.isArray(payload.data) ? payload.data[0] : payload.data;
          if (!data) continue;

          const match = payload.match;

          if (payload.kind === 'upsert') {
            if (data.staff_id === staffId && (data.date === today || (staleLogCandidate && data.date === staleLogCandidate.date))) {
              const targetDate = data.date;
              checkInFromQueue[targetDate] = data.check_in ?? checkInFromQueue[targetDate] ?? null;
              statusFromQueue[targetDate] = data.status ?? statusFromQueue[targetDate] ?? null;
            }
          } else if (payload.kind === 'update') {
            const targetDate = match?.date || today;
            if (match?.staff_id === staffId && (targetDate === today || (staleLogCandidate && targetDate === staleLogCandidate.date))) {
              checkOutFromQueue[targetDate] = data.check_out ?? checkOutFromQueue[targetDate] ?? null;
              statusFromQueue[targetDate] = data.status ?? statusFromQueue[targetDate] ?? null;
            }
          }
        }

        // 오늘 기록 큐 병합
        if (checkInFromQueue[today] !== undefined) {
          if (!activeLog) {
            activeLog = {
              id: 'pending',
              date: today,
              check_in: checkInFromQueue[today],
              check_out: checkOutFromQueue[today] ?? null,
              status: statusFromQueue[today] };
          } else {
            activeLog = {
              ...activeLog,
              check_in: checkInFromQueue[today] ?? activeLog.check_in,
              check_out: checkOutFromQueue[today] ?? activeLog.check_out,
              status: statusFromQueue[today] ?? activeLog.status };
          }
        } else if (checkOutFromQueue[today] !== undefined && activeLog) {
          activeLog = {
            ...activeLog,
            check_out: checkOutFromQueue[today],
            status: statusFromQueue[today] ?? activeLog.status };
        }

        // 어제 미퇴근 기록 큐 병합
        if (staleLogCandidate) {
          const staleDate = staleLogCandidate.date;
          if (checkInFromQueue[staleDate] !== undefined) {
            staleLogCandidate = {
              ...staleLogCandidate,
              check_in: checkInFromQueue[staleDate] ?? staleLogCandidate.check_in,
              check_out: checkOutFromQueue[staleDate] ?? staleLogCandidate.check_out,
              status: statusFromQueue[staleDate] ?? staleLogCandidate.status };
          } else if (checkOutFromQueue[staleDate] !== undefined) {
            staleLogCandidate = {
              ...staleLogCandidate,
              check_out: checkOutFromQueue[staleDate],
              status: statusFromQueue[staleDate] ?? staleLogCandidate.status };
          }
        }
      } catch (queueErr) {
        console.warn('오프라인 큐 조회 실패:', queueErr);
      }

      setTodayLog(activeLog);
      setStaleLog(staleLogCandidate);
    } catch {/* 에러 시 기존 상태 유지 */}
  }, [staffId]);

  useEffect(() => {
    void fetchTodayLog();
  }, [fetchTodayLog]);

  // 앱 재진입(포커스·visibility 변경)·출퇴근 이벤트 시 기록 재조회
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResume = () => { void fetchTodayLog(); };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void fetchTodayLog();
    };
    window.addEventListener('focus', handleResume);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('erp-attendance-updated', handleResume as EventListener);
    return () => {
      window.removeEventListener('focus', handleResume);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('erp-attendance-updated', handleResume as EventListener);
    };
  }, [fetchTodayLog]);

  // 마운트 시 기기 위치 측정 자동 시작
  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  const distance = useMemo(() => {
    if (!coords) return null;
    return calculateDistance(
      { latitude: coords.latitude, longitude: coords.longitude },
      WORKPLACE_LOCATION,
    );
  }, [coords]);

  const distanceLabel = distance === null ? null : Math.floor(distance);

  // localhost 접속이거나 localStorage의 bypass_gps가 'true'인 경우 우회 허용
  //
  // 이 우회는 개발용으로 들어왔는데 환경 분기가 없어 프로덕션 번들에도 그대로
  // 남아 있었다 — devtools 에서 한 줄이면 반경 검사가 사라졌다(D01-012·D09-007).
  // 지금 단계에서 이 경로를 없애면 위치 권한이 막힌 단말이 출근을 못 하게 되므로
  // 동작은 유지하되, 우회로 통과했다는 사실을 서버에 신고해 감사 기록으로 남긴다.
  // (아래 verifyOnServer 의 clientBypass)
  const isBypassed = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const hasBypassFlag = window.localStorage.getItem('bypass_gps') === 'true';
    return isLocal || hasBypassFlag;
  }, []);

  // 우회 플래그를 빼고 실제 좌표만으로 본 판정 — 서버 신고용으로 분리해 둔다.
  const withinRangeByDistance = distance !== null && distance <= ALLOWED_DISTANCE_M;
  const withinRange = isBypassed || withinRangeByDistance;
  const accuracyTooLow = !isBypassed && !!coords && coords.accuracy > ACCURACY_WARN_M;

  const state: 'before' | 'in' | 'done' =
    !todayLog?.check_in ? 'before' : !todayLog?.check_out ? 'in' : 'done';
  const canAct = !!staffId && !submitting;

  /**
   * 서버에 좌표·시각을 제출하고 **서버 시계**를 받아온다.
   *
   * 예전에는 기록 시각이 `new Date().toISOString()` — 단말 시계였다. 단말 시계를
   * 되돌리면 지각이 정상이 되고 서버에는 그것을 알 방법이 없었다. 이제 기록 시각은
   * 서버가 준 값을 쓰고, 반경 판정도 서버가 좌표에서 다시 계산해 위반이면 감사로그로
   * 남긴다(라우트 주석 참고).
   *
   * 오프라인·라우트 장애 시에는 null 을 돌려 기존 동작(단말 시계)으로 폴백한다.
   * 출퇴근이 네트워크 상태에 인질로 잡히면 안 되기 때문이다.
   */
  // 검증 결과. serverTime 은 기록에 쓸 권위 시각, blocked 는 서버의 차단 판정이다.
  // 차단 여부를 여기서 다시 계산하지 않는다 — 정책이 화면마다 갈라지지 않게
  // 라우트 한 곳에서만 정한다.
  type GeoVerifyOutcome = { serverTime: string | null; blocked: boolean; blockReason: string | null };
  // 오프라인이거나 검증 라우트가 죽었을 때. 검증 실패는 위반이 아니므로 막지 않는다.
  const OFFLINE_OUTCOME: GeoVerifyOutcome = { serverTime: null, blocked: false, blockReason: null };

  const verifyOnServer = useCallback(
    async (action: 'check_in' | 'check_out', dateKey: string): Promise<GeoVerifyOutcome> => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return OFFLINE_OUTCOME;
      try {
        const res = await fetch('/api/attendance/geo-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            date: dateKey,
            latitude: coords?.latitude ?? null,
            longitude: coords?.longitude ?? null,
            accuracy: coords?.accuracy ?? null,
            clientTime: new Date().toISOString(),
            clientBypass: isBypassed && !withinRangeByDistance }),
        });
        if (!res.ok) return OFFLINE_OUTCOME;
        const json = (await res.json()) as {
          serverTime?: string;
          blocked?: boolean;
          blockReason?: string | null;
        };
        return {
          serverTime: typeof json.serverTime === 'string' ? json.serverTime : null,
          blocked: json.blocked === true,
          blockReason: json.blockReason ?? null };
      } catch {
        // 검증 자체가 실패한 것은 위반이 아니다 — 막지 않고 단말 시계로 폴백한다.
        return OFFLINE_OUTCOME;
      }
    },
    [coords, isBypassed, withinRangeByDistance],
  );

  const handleAction = async () => {
    if (!staffId) {
      toast('직원 정보를 확인할 수 없습니다.', 'warning');
      return;
    }
    if (status !== 'success' && !isBypassed) {
      if (status === 'denied') {
        toast('위치 권한이 차단되어 있습니다. 브라우저 또는 앱 설정에서 위치 권한을 허용해 주세요.', 'error');
      } else if (status === 'error') {
        toast(error || '위치 정보를 정확히 가져올 수 없습니다. 다시 시도해 주세요.', 'error');
      } else {
        toast('위치 정보를 가져오는 중입니다. 잠시 후 다시 시도해 주세요.', 'warning');
      }
      requestLocation();
      return;
    }
    if (!withinRange) {
      toast(
        `현재 사무실과 거리 약 ${distanceLabel}m — 반경 ${ALLOWED_DISTANCE_M}m 안에서만 처리됩니다.`,
        'warning',
      );
      return;
    }
    setSubmitting(true);
    try {
      const today = getKoreanTodayString();
      // 서버 시계 우선 — 실패 시에만 단말 시계로 폴백한다(verifyOnServer 주석 참고).
      const verified = await verifyOnServer(state === 'before' ? 'check_in' : 'check_out', today);
      if (verified.blocked) {
        toast(verified.blockReason || '사업장 반경 밖에서는 출퇴근을 기록할 수 없습니다.', 'error');
        return;
      }
      const serverTime = verified.serverTime;
      const nowIso = serverTime ?? new Date().toISOString();
      if (state === 'before') {
        // 근무유형(work_shifts) 시작시각 기준 지각 판정. 1일근무1일휴무는 근무표(shift_assignments) 배정 기준.
        // 온라인일 때만 정확 판정하고, 오프라인/조회 실패 시 '정상'으로 폴백한다.
        let checkInStatus: '정상' | '지각' = '정상';
        if (typeof navigator === 'undefined' || navigator.onLine !== false) {
          try {
            checkInStatus = await resolveCheckInStatus(staffId, today, nowIso, { company });
          } catch {/* 조회 실패 → '정상' 폴백 */}
        }

        // 온라인 시 기존 행 확인 — 이미 출근 기록이 있으면 DB를 덮어쓰지 않고 실제 시각 표시
        if (typeof navigator === 'undefined' || navigator.onLine !== false) {
          try {
            const { data: existingRows } = await db
              .from('attendance')
              .select('id, staff_id, date, check_in, check_out, status')
              .eq('staff_id', staffId)
              .eq('date', today)
              .limit(1);
            const existingRow = existingRows?.[0] as OpenLog | undefined;
            if (existingRow?.check_in) {
              // 이미 출근 기록 존재 — 중복 출근 방지, 실제 DB 시각으로 표시
              setTodayLog(existingRow);
              toast('이미 출근 처리된 기록이 있습니다.', 'info');
              return;
            }
          } catch {/* 조회 실패 시 upsert로 진행 */}
        }

        const { data, queued, error } = await enqueueD1Mutation<OpenLog>({
          kind: 'upsert',
          table: 'attendance',
          payload: { staff_id: staffId, date: today, check_in: nowIso, status: checkInStatus },
          onConflict: 'staff_id,date' });
        if (error) throw new Error(error);
        if (queued) {
          // 낙관적 업데이트 — 큐잉됨 (온라인 복귀 후 flush 시 단수만 재생 → 이후 재동기화)
          setTodayLog({ id: 'pending', date: today, check_in: nowIso, check_out: null, status: checkInStatus });
          toast('오프라인 — 출근 기록이 동기화 대기 중입니다.', 'warning');
        } else {
          const row = Array.isArray(data) ? (data[0] as OpenLog) : (data as OpenLog);
          setTodayLog(row || { id: 'upserted', date: today, check_in: nowIso, check_out: null, status: checkInStatus });
          try {
            await syncAttendanceToAttendances(staffId, today, {
              checkIn: nowIso,
              checkOut: null,
              status: checkInStatus,
            });
            // attendances 테이블 direct fallback mutation
            void enqueueD1Mutation({
              kind: 'upsert',
              table: 'attendances',
              payload: {
                staff_id: staffId,
                work_date: today,
                check_in_time: nowIso,
                check_out_time: null,
                status: checkInStatus === '지각' ? 'late' : 'present',
              },
              onConflict: 'staff_id,work_date',
            }).catch(() => {});
          } catch (syncErr) {
            console.error('syncAttendanceToAttendances fail', syncErr);
          }
          toast(
            checkInStatus === '지각' ? '지각 처리되었습니다.' : '출근 체크인이 완료되었습니다.',
            checkInStatus === '지각' ? 'warning' : 'success',
          );
        }
      } else if (state === 'in') {
        const dateKey = todayLog?.date ?? today;
        const checkInIso = todayLog?.check_in ?? null;

        // 지각 기준시간 구하고 조퇴 여부 판정
        let finalStatus = todayLog?.status || '정상';
        let earlyLeaveMinutes = 0;
        try {
          const lateThreshold = await resolveLateThreshold(staffId, dateKey, { company });
          earlyLeaveMinutes = calculateEarlyLeaveMinutes(dateKey, nowIso, lateThreshold);
          if (earlyLeaveMinutes > 0) {
            finalStatus = '조퇴';
          }
        } catch {/* 판정 실패 시 기존 상태 유지 */}

        const { data, queued, error } = await enqueueD1Mutation<OpenLog>({
          kind: 'update',
          table: 'attendance',
          payload: { check_out: nowIso, status: finalStatus },
          match: { staff_id: staffId, date: dateKey } });
        if (error) throw new Error(error);
        if (queued) {
          // 낙관적 업데이트 — 큐잉됨
          if (todayLog) setTodayLog({ ...todayLog, check_out: nowIso, status: finalStatus });
          toast('오프라인 — 퇴근 기록이 동기화 대기 중입니다.', 'warning');
        } else {
          const row = Array.isArray(data) ? (data[0] as OpenLog) : (data as OpenLog);
          if (row) setTodayLog(row);
          else if (todayLog) setTodayLog({ ...todayLog, check_out: nowIso, status: finalStatus });
          else if (!data) throw new Error('이미 퇴근 처리되었거나 출근 기록이 없습니다.');

          try {
            await syncAttendanceToAttendances(staffId, dateKey, {
              checkIn: checkInIso,
              checkOut: nowIso,
              status: finalStatus,
              earlyLeaveMinutes,
            });
          } catch (syncErr) {
            console.error('syncAttendanceToAttendances fail', syncErr);
          }

          toast(
            finalStatus === '조퇴'
              ? `조퇴로 처리되었습니다. 정해진 퇴근 시간보다 ${earlyLeaveMinutes}분 일찍 퇴근하셨습니다.`
              : '퇴근 체크아웃이 완료되었습니다.',
            finalStatus === '조퇴' ? 'warning' : 'success'
          );
        }
      }
      void refetch();
      window.dispatchEvent(new CustomEvent('erp-attendance-updated', { detail: { staffId } }));
    } catch (err) {
      toast(`처리 실패: ${(err as Error)?.message ?? '알 수 없는 오류'}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStaleCheckOut = async () => {
    if (!staffId || !staleLog) return;
    if (status !== 'success' && !isBypassed) {
      if (status === 'denied') {
        toast('위치 권한이 차단되어 있습니다. 브라우저 또는 앱 설정에서 위치 권한을 허용해 주세요.', 'error');
      } else if (status === 'error') {
        toast(error || '위치 정보를 정확히 가져올 수 없습니다. 다시 시도해 주세요.', 'error');
      } else {
        toast('위치 정보를 가져오는 중입니다. 잠시 후 다시 시도해 주세요.', 'warning');
      }
      requestLocation();
      return;
    }
    if (!withinRange) {
      toast(
        `현재 사무실과 거리 약 ${distanceLabel}m — 반경 ${ALLOWED_DISTANCE_M}m 안에서만 처리됩니다.`,
        'warning',
      );
      return;
    }
    setSubmitting(true);
    try {
      const dateKey = staleLog.date;
      const checkInIso = staleLog.check_in;
      const verified = await verifyOnServer('check_out', dateKey);
      if (verified.blocked) {
        toast(verified.blockReason || '사업장 반경 밖에서는 출퇴근을 기록할 수 없습니다.', 'error');
        return;
      }
      const serverTime = verified.serverTime;
      const nowIso = serverTime ?? new Date().toISOString();

      let finalStatus = staleLog.status || '정상';
      let earlyLeaveMinutes = 0;
      try {
        const lateThreshold = await resolveLateThreshold(staffId, dateKey, { company });
        earlyLeaveMinutes = calculateEarlyLeaveMinutes(dateKey, nowIso, lateThreshold);
        if (earlyLeaveMinutes > 0) {
          finalStatus = '조퇴';
        }
      } catch {}

      const { data, queued, error: dbErr } = await enqueueD1Mutation<OpenLog>({
        kind: 'update',
        table: 'attendance',
        payload: { check_out: nowIso, status: finalStatus },
        match: { staff_id: staffId, date: dateKey } });
      if (dbErr) throw new Error(dbErr);
      if (queued) {
        setStaleLog({ ...staleLog, check_out: nowIso, status: finalStatus });
        toast('오프라인 — 어제 퇴근 기록이 동기화 대기 중입니다.', 'warning');
      } else {
        const row = Array.isArray(data) ? (data[0] as OpenLog) : (data as OpenLog);
        setStaleLog(row || { ...staleLog, check_out: nowIso, status: finalStatus });
        try {
          await syncAttendanceToAttendances(staffId, dateKey, {
            checkIn: checkInIso,
            checkOut: nowIso,
            status: finalStatus,
            earlyLeaveMinutes,
          });
        } catch (syncErr) {
          console.error('syncAttendanceToAttendances fail', syncErr);
        }
        toast(
          finalStatus === '조퇴'
            ? `조퇴로 처리되었습니다. 정해진 퇴근 시간보다 ${earlyLeaveMinutes}분 일찍 퇴근하셨습니다.`
            : '어제 퇴근 체크아웃이 완료되었습니다.',
          finalStatus === '조퇴' ? 'warning' : 'success',
        );
      }
      void fetchTodayLog();
      void refetch();
      window.dispatchEvent(new CustomEvent('erp-attendance-updated', { detail: { staffId } }));
    } catch (err) {
      toast(`처리 실패: ${(err as Error)?.message ?? '알 수 없는 오류'}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const clock = formatClock(now);

  const gpsTone: 'success' | 'warning' | 'danger' =
    status === 'success' && withinRange ? 'success' :
    status === 'requesting' || status === 'idle' ? 'warning' : 'danger';
  const gpsLabel =
    status === 'idle' ? '위치 확인 필요' :
    status === 'requesting' ? '위치 확인 중…' :
    status === 'denied' ? '위치 권한 차단됨' :
    status === 'error' ? error ?? '위치 오류' :
    withinRange ? `GPS 인증됨 · 거리 ${distanceLabel}m` :
    `반경 초과 · 거리 ${distanceLabel}m`;

  const btnLabel = state === 'before' ? '출근하기' : state === 'in' ? '퇴근하기' : '오늘 근무 완료';
  const btnSub = state === 'done'
    ? '수고하셨습니다'
    : status !== 'success' ? '먼저 위치 확인이 필요합니다'
    : !withinRange ? `반경 ${ALLOWED_DISTANCE_M}m 안으로 이동 후 시도`
    : '탭하면 즉시 기록됩니다';

  // macOS 스타일 동적 그라데이션 유리 배경 및 테두리 설정
  const glassBackground =
    state === 'before'
      ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.16) 0%, rgba(37, 99, 235, 0.28) 100%)'
      : state === 'in'
      ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.16) 0%, rgba(217, 119, 6, 0.28) 100%)'
      : 'linear-gradient(135deg, rgba(16, 185, 129, 0.16) 0%, rgba(5, 150, 105, 0.28) 100%)';

  const glassBorder =
    state === 'before'
      ? '1px solid rgba(59, 130, 246, 0.35)'
      : state === 'in'
      ? '1px solid rgba(245, 158, 11, 0.35)'
      : '1px solid rgba(16, 185, 129, 0.35)';

  const iconBg =
    state === 'before'
      ? 'rgba(59, 130, 246, 0.18)'
      : state === 'in'
      ? 'rgba(245, 158, 11, 0.18)'
      : 'rgba(16, 185, 129, 0.18)';

  const iconColor =
    state === 'before'
      ? '#3b82f6'
      : state === 'in'
      ? '#f59e0b'
      : '#10b981';

  const switchBg =
    state === 'before'
      ? 'rgba(120, 120, 128, 0.2)'
      : state === 'in'
      ? '#f59e0b'
      : '#10b981';

  return (
    <div className="m-screen">
      <MobileHeader
        title="출퇴근 체크인"
        sub={company || '회사 미지정'}
        back={onBack}
        actions={
          <button type="button" onClick={requestLocation} aria-label="위치 새로고침">
            <MIcon name="refresh" size={20} />
          </button>
        }
      />
      <div className="m-scroll">
        {/* hero */}
        <div style={{ padding: '24px 20px 8px', textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--z-500)', fontWeight: 700 }}>{formatTodayLong(now)}</div>
          <div
            className="m-tnum"
            style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.04em', marginTop: 6, color: 'var(--z-900)' }}
          >
            {clock.ampm} <span style={{ color: 'var(--m-accent)' }}>{clock.hm}</span>
            <span style={{ fontSize: 24, color: 'var(--z-400)' }}>:{clock.ss}</span>
          </div>
          {/* macOS 스타일 미니멀 신호 게이지 위젯 */}
          <div
            role="status"
            aria-live="polite"
            className="macos-glass macos-squircle-sm"
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '10px 14px',
              gap: '12px',
              maxWidth: '320px',
              margin: '16px auto 0',
              border: '1px solid rgba(0, 0, 0, 0.08)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)' }}
          >
            {/* 신호 게이지 막대 4개 */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2.5px', height: '14px', width: '20px' }}>
              {[1, 2, 3, 4].map((bar) => {
                const height = 4 + (bar - 1) * 3; // 4px, 7px, 10px, 13px
                let active = false;
                let color = 'rgba(120, 120, 128, 0.2)';

                if (gpsTone === 'success') {
                  active = true;
                  color = 'var(--m-success)'; // 녹색 활성 (#10b981 등)
                } else if (gpsTone === 'warning') {
                  active = bar <= 2;
                  color = '#f59e0b'; // 황색 활성
                } else {
                  active = bar === 1;
                  color = 'var(--m-danger)'; // 적색 활성 (#ef4444 등)
                }

                return (
                  <span
                    key={bar}
                    style={{
                      display: 'block',
                      width: '3px',
                      height: `${height}px`,
                      backgroundColor: active ? color : 'rgba(120, 120, 128, 0.2)',
                      borderRadius: '1.5px',
                      transition: 'background-color 0.25s ease' }}
                  />
                );
              })}
            </div>

            {/* 정보 영역 */}
            <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--z-800)', lineHeight: 1.2 }}>
                {status === 'success' && withinRange ? '내장 GPS 인증 장치' : '위치 수신 센서'}
              </div>
              <div
                style={{
                  fontSize: '10px',
                  color: 'var(--z-500)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginTop: '1px',
                  fontWeight: 600 }}
              >
                {gpsLabel}
              </div>
            </div>

            {/* 우측 칩 라벨 */}
            <div
              style={{
                fontSize: '10px',
                fontWeight: 800,
                color: gpsTone === 'success' ? 'var(--m-success)' : gpsTone === 'warning' ? '#f59e0b' : 'var(--m-danger)',
                padding: '2px 6px',
                borderRadius: '6px',
                backgroundColor:
                  gpsTone === 'success' ? 'rgba(16, 185, 129, 0.1)' :
                  gpsTone === 'warning' ? 'rgba(245, 158, 11, 0.1)' :
                                          'rgba(239, 68, 68, 0.1)' }}
            >
              {status === 'success' && withinRange ? '연결됨' : '대기'}
            </div>
          </div>
          {accuracyTooLow && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--m-warning)', fontWeight: 700 }}>
              위치 정확도 낮음 (±{Math.round(coords!.accuracy)}m) · 야외에서 다시 시도하세요
            </div>
          )}
        </div>

        {/* 어제 미퇴근 경보 및 퇴근 버튼 */}
        {staleLog && !staleLog.check_out && (
          <div style={{ margin: '12px 20px 4px', padding: '12px 16px', borderRadius: 16, backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', color: 'var(--z-900)' }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: '#D97706', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <MIcon name="clock" size={16} />
              전날 미퇴근 기록이 있습니다
            </div>
            <div style={{ fontSize: 11, color: 'var(--z-500)', lineHeight: '1.4', marginBottom: 10 }}>
              어제 {formatHHmm(staleLog.check_in)}에 출근한 기록이 아직 열려 있습니다. 퇴근 처리하거나 오늘 출근을 새로 진행하세요.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleStaleCheckOut}
                disabled={submitting}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  backgroundColor: '#D97706',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 700,
                  border: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                {submitting ? '처리 중…' : '어제 퇴근 처리'}
              </button>
            </div>
          </div>
        )}

        {/* macOS 제어 센터 스타일 출퇴근 위젯 박스 */}
        <div style={{ padding: '18px 20px 6px' }}>
          <button
            type="button"
            onClick={handleAction}
            disabled={!canAct || state === 'done'}
            aria-label={btnLabel}
            className="macos-glass macos-squircle"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              padding: '18px 20px',
              gap: '16px',
              background: glassBackground,
              border: glassBorder,
              textAlign: 'left',
              cursor: !canAct || state === 'done' ? 'default' : 'pointer',
              opacity: !canAct || state === 'done' ? 0.75 : 1,
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)' }}
          >
            {/* 왼쪽: 둥근 모양의 활성 상태 아이콘 백그라운드 */}
            <div
              className="macos-squircle-sm"
              style={{
                width: '46px',
                height: '46px',
                backgroundColor: iconBg,
                color: iconColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.25s ease, color 0.25s ease' }}
            >
              <MIcon name="clock" size={24} />
            </div>

            {/* 중앙: 텍스트 정보 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--z-900)', letterSpacing: '-0.02em' }}>
                {submitting ? '처리 중…' : btnLabel}
              </div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--z-500)', opacity: 0.9 }}>
                {btnSub}
              </div>
            </div>

            {/* 오른쪽: macOS 스타일의 스위치(Switch) 인디케이터 */}
            <div
              style={{
                width: '36px',
                height: '20px',
                borderRadius: '10px',
                backgroundColor: switchBg,
                position: 'relative',
                transition: 'background-color 0.25s ease' }}
            >
              <div
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  backgroundColor: '#fff',
                  position: 'absolute',
                  top: '2px',
                  left: state === 'before' ? '2px' : '18px',
                  transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.15)' }}
              />
            </div>
          </button>
        </div>
        <div style={{ padding: '0 24px', marginTop: 4, marginBottom: 8, fontSize: 11, color: 'var(--z-500)', lineHeight: '1.4', textAlign: 'center' }}>
          ※ 출퇴근 기록 및 근무지 인증을 위해 기기의 GPS 위치 정보를 활용합니다.
        </div>

        {/* 오늘 기록 */}
        <div className="m-section">
          <div className="m-section-h"><div className="lbl">오늘 기록</div></div>
          <div className="m-card flush">
            <div className="m-list-row" style={{ gridTemplateColumns: '52px 1fr auto' }}>
              <div
                className="m-tnum"
                style={{
                  fontSize: 13, fontWeight: 800,
                  color: openLog?.check_in ? 'var(--m-success)' : 'var(--z-400)' }}
              >
                {formatHHmm(openLog?.check_in ?? null)}
              </div>
              <div>
                <div className="lbl">출근</div>
                <div className="sub">{openLog?.check_in ? (openLog.date !== getKoreanTodayString(now) ? '어제 GPS 인증' : 'GPS 인증') : '예정'}</div>
              </div>
              {openLog?.check_in ? <MChip tone="success">완료</MChip> : <MChip>예정</MChip>}
            </div>
            <div className="m-list-row" style={{ gridTemplateColumns: '52px 1fr auto' }}>
              <div
                className="m-tnum"
                style={{
                  fontSize: 13, fontWeight: 800,
                  color: openLog?.check_out ? 'var(--m-success)' : 'var(--z-400)' }}
              >
                {formatHHmm(openLog?.check_out ?? null)}
              </div>
              <div>
                <div className="lbl">퇴근</div>
                <div className="sub">{openLog?.check_out ? (openLog.date !== getKoreanTodayString(now) ? '어제 GPS 인증' : 'GPS 인증') : '예정'}</div>
              </div>
              {openLog?.check_out ? <MChip tone="success">완료</MChip> : <MChip>예정</MChip>}
            </div>
          </div>
        </div>

        {/* 이번 달 요약 */}
        <div className="m-section">
          <div className="m-section-h"><div className="lbl">이번 달 요약</div></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            <div className="m-card" style={{ padding: '14px 12px' }}>
              <div className="m-tnum" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.025em' }}>
                {monthly ? `${monthly.present}/${monthly.total}` : '—'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700, marginTop: 2 }}>출근일</div>
            </div>
            <div className="m-card" style={{ padding: '14px 12px' }}>
              <div className="m-tnum" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.025em', color: monthly && monthly.late > 0 ? 'var(--m-warning)' : undefined }}>
                {monthly?.late ?? 0}
              </div>
              <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700, marginTop: 2 }}>지각</div>
            </div>
            <div className="m-card" style={{ padding: '14px 12px' }}>
              <div className="m-tnum" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.025em', color: monthly && monthly.absent > 0 ? 'var(--m-danger)' : undefined }}>
                {monthly?.absent ?? 0}
              </div>
              <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700, marginTop: 2 }}>결근</div>
            </div>
          </div>
        </div>


      </div>
    </div>
  );
}
