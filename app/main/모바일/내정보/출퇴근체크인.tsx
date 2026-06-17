'use client';

/**
 * SAttend — 모바일 출퇴근 체크인
 *   - hero: 날짜 + 시:분(현재 시간) + GPS 칩
 *   - 큰 체크인/체크아웃 버튼 (그라데이션)
 *   - 오늘 기록 (출근/외출/복귀/퇴근)
 *   - 이번 주 요약 (KPI 3개)
 * 기존 모바일체크인.tsx의 GPS·supabase mutation 로직 그대로 재사용.
 * JM(파일당 500줄), JM3(에러 분기), JM4(any 금지), JM6(button 시맨틱, aria-live)
 */

import { useEffect, useMemo, useState } from 'react';
import { useGeolocationCheckin } from '@/app/hooks/useGeolocationCheckin';
import { ALLOWED_DISTANCE_M, WORKPLACE_LOCATION } from '@/lib/location';
import { calculateDistance } from '@/lib/geo';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { formatLocalDateKey } from '@/lib/use-local-date-key';
import { enqueueSupabaseMutation } from '@/lib/offline-queue-supabase';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MBtn from '../공통/MBtn';
import { useMonthlyAttendance } from './data-hooks';
import {
  resolveCheckInStatus,
  syncToAttendances,
  resolveLateThreshold,
  calculateEarlyLeaveMinutes,
} from '@/app/main/기능부품/마이페이지/출퇴근기록/checkin-utils';

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
  const d = new Date(iso);
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
  const [openLog, setOpenLog] = useState<OpenLog | null>(null);
  const { data: monthly, refetch } = useMonthlyAttendance(staffId);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!staffId) { setOpenLog(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const today = formatLocalDateKey(new Date());
        // 1. 오늘 날짜 기록 (중복 에러 방지를 위해 limit(1) 사용)
        const { data: todayData } = await supabase
          .from('attendance')
          .select('id, date, check_in, check_out, status')
          .eq('staff_id', staffId)
          .eq('date', today)
          .order('created_at', { ascending: false })
          .limit(1);

        let activeLog = (todayData?.[0] as OpenLog) ?? null;

        // 2. 야간 근무자 구제 로직: 오늘 출근 기록이 없다면, 어제 오픈된 기록(stale log) 찾기
        if (!activeLog?.check_in) {
          const { data: staleData } = await supabase
            .from('attendance')
            .select('id, date, check_in, check_out, status')
            .eq('staff_id', staffId)
            .not('check_in', 'is', null)
            .is('check_out', null)
            .neq('status', '결근') // 결근 처리된 건 제외
            .order('date', { ascending: false })
            .limit(1);

          if (staleData && staleData.length > 0 && staleData[0].date !== today) {
            activeLog = staleData[0] as OpenLog;
          }
        }

        if (!cancelled) setOpenLog(activeLog);
      } catch {/* silent */}
    })();
    return () => { cancelled = true; };
  }, [staffId]);

  const distance = useMemo(() => {
    if (!coords) return null;
    return calculateDistance(
      { latitude: coords.latitude, longitude: coords.longitude },
      WORKPLACE_LOCATION,
    );
  }, [coords]);

  const distanceLabel = distance === null ? null : Math.floor(distance);
  const withinRange = distance !== null && distance <= ALLOWED_DISTANCE_M;
  const accuracyTooLow = !!coords && coords.accuracy > ACCURACY_WARN_M;

  const state: 'before' | 'in' | 'done' =
    !openLog?.check_in ? 'before' : !openLog?.check_out ? 'in' : 'done';
  const canAct = !!staffId && !submitting;

  const handleAction = async () => {
    if (!staffId) {
      toast('직원 정보를 확인할 수 없습니다.', 'warning');
      return;
    }
    if (status !== 'success') {
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
      const today = formatLocalDateKey(new Date());
      const nowIso = new Date().toISOString();
      if (state === 'before') {
        // 근무유형(work_shifts) 시작시각 기준 지각 판정. 1일근무1일휴무는 근무표(shift_assignments) 배정 기준.
        // 온라인일 때만 정확 판정하고, 오프라인/조회 실패 시 '정상'으로 폴백한다.
        let checkInStatus: '정상' | '지각' = '정상';
        if (typeof navigator === 'undefined' || navigator.onLine !== false) {
          try {
            checkInStatus = await resolveCheckInStatus(staffId, today, nowIso, { company });
          } catch {/* 조회 실패 → '정상' 폴백 */}
        }
        const { data, queued, error } = await enqueueSupabaseMutation<OpenLog>({
          kind: 'upsert',
          table: 'attendance',
          payload: { staff_id: staffId, date: today, check_in: nowIso, status: checkInStatus },
          onConflict: 'staff_id,date',
        });
        if (error) throw new Error(error);
        if (queued) {
          // 낙관적 업데이트 — 큐잉됨
          setOpenLog({ id: 'pending', date: today, check_in: nowIso, check_out: null });
          toast('오프라인 — 출근 기록이 동기화 대기 중입니다.', 'warning');
        } else {
          const row = Array.isArray(data) ? (data[0] as OpenLog) : (data as OpenLog);
          setOpenLog(row || { id: 'upserted', date: today, check_in: nowIso, check_out: null, status: checkInStatus });
          try {
            await syncToAttendances(staffId, today, nowIso, null, checkInStatus);
          } catch (syncErr) {
            console.error('syncToAttendances fail', syncErr);
          }
          toast(
            checkInStatus === '지각' ? '지각 처리되었습니다.' : '출근 체크인이 완료되었습니다.',
            checkInStatus === '지각' ? 'warning' : 'success',
          );
        }
      } else if (state === 'in') {
        const dateKey = openLog?.date ?? today;
        const checkInIso = openLog?.check_in ?? null;

        // 지각 기준시간 구하고 조퇴 여부 판정
        let finalStatus = openLog?.status || '정상';
        let earlyLeaveMinutes = 0;
        try {
          const lateThreshold = await resolveLateThreshold(staffId, dateKey, { company });
          earlyLeaveMinutes = calculateEarlyLeaveMinutes(dateKey, nowIso, lateThreshold);
          if (earlyLeaveMinutes > 0) {
            finalStatus = '조퇴';
          }
        } catch {/* 판정 실패 시 기존 상태 유지 */}

        const { data, queued, error } = await enqueueSupabaseMutation<OpenLog>({
          kind: 'update',
          table: 'attendance',
          payload: { check_out: nowIso, status: finalStatus },
          match: { staff_id: staffId, date: dateKey },
        });
        if (error) throw new Error(error);
        if (queued) {
          // 낙관적 업데이트 — 큐잉됨
          if (openLog) setOpenLog({ ...openLog, check_out: nowIso, status: finalStatus });
          toast('오프라인 — 퇴근 기록이 동기화 대기 중입니다.', 'warning');
        } else {
          const row = Array.isArray(data) ? (data[0] as OpenLog) : (data as OpenLog);
          if (row) setOpenLog(row);
          else if (openLog) setOpenLog({ ...openLog, check_out: nowIso, status: finalStatus });
          else if (!data) throw new Error('이미 퇴근 처리되었거나 출근 기록이 없습니다.');
          
          try {
            await syncToAttendances(staffId, dateKey, checkInIso, nowIso, finalStatus, { earlyLeaveMinutes });
          } catch (syncErr) {
            console.error('syncToAttendances fail', syncErr);
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

  const gradient =
    state === 'before' ? 'linear-gradient(135deg, #2563EB, #1D4ED8)' :
    state === 'in'     ? 'linear-gradient(135deg, #F59E0B, #D97706)' :
                         'linear-gradient(135deg, #10B981, #059669)';
  const shadow =
    state === 'before' ? '0 12px 24px rgba(37,99,235,0.25)' :
    state === 'in'     ? '0 12px 24px rgba(245,158,11,0.25)' :
                         '0 12px 24px rgba(16,185,129,0.25)';

  return (
    <div className="m-screen">
      <MobileHeader
        title="출퇴근 체크인"
        sub={company || '박철홍정형외과'}
        back={onBack}
        actions={
          <button type="button" onClick={requestLocation} aria-label="위치 새로고침">
            <MIcon name="refresh" size={20} />
          </button>
        }
      />
      <div className="m-scroll" style={{ paddingBottom: 24 }}>
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
          <div
            role="status"
            aria-live="polite"
            style={{ marginTop: 14, display: 'inline-flex' }}
          >
            <MChip tone={gpsTone} dot>{gpsLabel}</MChip>
          </div>
          {accuracyTooLow && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--m-warning)', fontWeight: 700 }}>
              위치 정확도 낮음 (±{Math.round(coords!.accuracy)}m) · 야외에서 다시 시도하세요
            </div>
          )}
        </div>

        {/* 큰 체크인 버튼 */}
        <div style={{ padding: '18px 20px 6px' }}>
          <button
            type="button"
            onClick={handleAction}
            disabled={!canAct || state === 'done'}
            aria-label={btnLabel}
            style={{
              width: '100%',
              aspectRatio: '1.6',
              borderRadius: 24,
              background: gradient,
              color: '#fff',
              border: 0,
              boxShadow: shadow,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
              opacity: !canAct || state === 'done' ? 0.85 : 1,
            }}
          >
            <MIcon name="clock" size={48} strokeWidth={1.4} />
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
              {submitting ? '처리 중…' : btnLabel}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.85 }}>{btnSub}</div>
          </button>
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
                  color: openLog?.check_in ? 'var(--m-success)' : 'var(--z-400)',
                }}
              >
                {formatHHmm(openLog?.check_in ?? null)}
              </div>
              <div>
                <div className="lbl">출근</div>
                <div className="sub">{openLog?.check_in ? 'GPS 인증' : '예정'}</div>
              </div>
              {openLog?.check_in ? <MChip tone="success">완료</MChip> : <MChip>예정</MChip>}
            </div>
            <div className="m-list-row" style={{ gridTemplateColumns: '52px 1fr auto' }}>
              <div
                className="m-tnum"
                style={{
                  fontSize: 13, fontWeight: 800,
                  color: openLog?.check_out ? 'var(--m-success)' : 'var(--z-400)',
                }}
              >
                {formatHHmm(openLog?.check_out ?? null)}
              </div>
              <div>
                <div className="lbl">퇴근</div>
                <div className="sub">{openLog?.check_out ? 'GPS 인증' : '예정'}</div>
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

        {/* 위치 새로고침 보조 */}
        <div style={{ padding: '18px 20px 4px' }}>
          <MBtn block icon="mapPin" onClick={requestLocation} disabled={status === 'requesting'}>
            {status === 'requesting' ? '위치 확인 중…' : '위치 새로고침'}
          </MBtn>
        </div>
      </div>
    </div>
  );
}
