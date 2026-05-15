'use client';

/**
 * 모바일체크인 — Phase3 §3 (근태 통합 1/3)
 *
 * 모바일 뷰포트(<768px)에서 사용하는 단순 출/퇴근 체크인 화면.
 * 데스크탑 출퇴근기록(CommuteRecord)이 가진 통계·달력·차트는 제외하고
 * "현재 시간 + 위치 상태 + 큰 출/퇴근 버튼"에 집중한다.
 *
 * 이번 라운드는 컴포넌트만 신설하고 데스크탑 진입점(useIsMobile 분기)은
 * 다음 라운드로 보류 — 통합 시 staleOpenLog/지각판정/근무유형 등 부수
 * 로직을 공통 헬퍼로 추출해야 하기 때문.
 *
 * JM:  ~200줄 단일 책임 (위치 인증 + 단일 출퇴근 동작 + 상태 카드)
 * JM3: 위치 거부/오류/거리 초과 메시지 분리, supabase 실패 toast로 노출
 * JM4: props 타입 명시, any 금지
 * JM5: 위치 정확도(accuracy) 200m 초과 경고, 거리 검증 통과만 처리
 * JM6: 출/퇴근 버튼 64px(터치 44px+), aria-live로 상태 안내, button 시맨틱
 */

import { useEffect, useMemo, useState } from 'react';
import { useGeolocationCheckin } from '@/app/hooks/useGeolocationCheckin';
import { ALLOWED_DISTANCE_M, WORKPLACE_LOCATION } from '@/lib/location';
import { calculateDistance, type LatLng } from '@/lib/geo';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { formatLocalDateKey } from '@/lib/use-local-date-key';

export type 모바일체크인Props = {
  /** 직원 ID (staff_members.id). 없으면 버튼 비활성. */
  staffId: string | null | undefined;
  /** 회사 위치. 미지정 시 WORKPLACE_LOCATION 사용. */
  companyLocation?: LatLng;
  /** 체크인/체크아웃 성공 후 호출(부모에서 재조회 등). */
  onCheckedIn?: () => void;
  onCheckedOut?: () => void;
};

type CheckInOpenLog = {
  id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
};

const ACCURACY_WARN_M = 200;

export default function 모바일체크인({
  staffId,
  companyLocation = WORKPLACE_LOCATION,
  onCheckedIn,
  onCheckedOut,
}: 모바일체크인Props) {
  const { status, coords, error, requestLocation } = useGeolocationCheckin();
  const [now, setNow] = useState<Date>(() => new Date());
  const [submitting, setSubmitting] = useState(false);
  const [openLog, setOpenLog] = useState<CheckInOpenLog | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // 오늘 출근 기록 조회 (체크인 후 체크아웃 가능 여부 판단)
  useEffect(() => {
    if (!staffId) {
      setOpenLog(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const today = formatLocalDateKey(new Date());
        const { data } = await supabase
          .from('attendance')
          .select('id, date, check_in, check_out')
          .eq('staff_id', staffId)
          .eq('date', today)
          .maybeSingle();
        if (!cancelled) setOpenLog((data as CheckInOpenLog | null) ?? null);
      } catch {
        // 조회 실패는 조용히 — 사용자가 버튼을 눌렀을 때 다시 시도된다.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  const distance = useMemo(() => {
    if (!coords) return null;
    return calculateDistance(
      { latitude: coords.latitude, longitude: coords.longitude },
      companyLocation,
    );
  }, [coords, companyLocation]);

  const distanceLabel = distance === null ? null : Math.floor(distance);
  const withinRange = distance !== null && distance <= ALLOWED_DISTANCE_M;
  const accuracyTooLow =
    !!coords && coords.accuracy > ACCURACY_WARN_M;

  const canCheckIn = !!staffId && !openLog?.check_in && !submitting;
  const canCheckOut =
    !!staffId && !!openLog?.check_in && !openLog?.check_out && !submitting;

  const handleCheckIn = async () => {
    if (!staffId) {
      toast('직원 계정 정보를 확인할 수 없습니다.', 'warning');
      return;
    }
    if (status !== 'success') {
      requestLocation();
      return;
    }
    if (!withinRange) {
      toast(
        `현재 사무실과 거리가 ${distanceLabel}m입니다. 반경 ${ALLOWED_DISTANCE_M}m 안에서만 체크인할 수 있습니다.`,
        'warning',
      );
      return;
    }
    setSubmitting(true);
    try {
      const today = formatLocalDateKey(new Date());
      const nowIso = new Date().toISOString();
      const { data, error: insertError } = await supabase
        .from('attendance')
        .upsert(
          [{ staff_id: staffId, date: today, check_in: nowIso, status: '정상' }],
          { onConflict: 'staff_id,date' },
        )
        .select()
        .single();
      if (insertError) throw insertError;
      setOpenLog(data as CheckInOpenLog);
      toast('출근 체크인이 완료되었습니다.', 'success');
      onCheckedIn?.();
    } catch (err) {
      toast(
        `체크인에 실패했습니다: ${(err as Error)?.message ?? '알 수 없는 오류'}`,
        'error',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckOut = async () => {
    if (!staffId || !openLog?.check_in) return;
    if (status !== 'success') {
      requestLocation();
      return;
    }
    if (!withinRange) {
      toast(
        `현재 사무실과 거리가 ${distanceLabel}m입니다. 반경 ${ALLOWED_DISTANCE_M}m 안에서만 체크아웃할 수 있습니다.`,
        'warning',
      );
      return;
    }
    setSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const { data, error: updateError } = await supabase
        .from('attendance')
        .update({ check_out: nowIso })
        .eq('staff_id', staffId)
        .eq('date', openLog.date)
        .is('check_out', null)
        .select()
        .maybeSingle();
      if (updateError) throw updateError;
      if (!data) throw new Error('이미 퇴근 처리되었거나 출근 기록이 없습니다.');
      setOpenLog(data as CheckInOpenLog);
      toast('퇴근 체크아웃이 완료되었습니다.', 'success');
      onCheckedOut?.();
    } catch (err) {
      toast(
        `체크아웃에 실패했습니다: ${(err as Error)?.message ?? '알 수 없는 오류'}`,
        'error',
      );
    } finally {
      setSubmitting(false);
    }
  };

  // 위치 상태 메시지 (JM6: aria-live)
  const locationMessage =
    status === 'idle'
      ? '체크인 전 위치 확인 버튼을 눌러주세요.'
      : status === 'requesting'
        ? '위치 확인 중...'
        : status === 'denied'
          ? '위치 권한이 차단되어 있습니다. 설정에서 위치 권한을 허용해 주세요.'
          : status === 'error'
            ? error ?? '위치 정보를 가져오지 못했습니다.'
            : distanceLabel !== null
              ? withinRange
                ? `사무실까지 약 ${distanceLabel}m — 체크인 가능합니다.`
                : `사무실까지 약 ${distanceLabel}m — 반경 ${ALLOWED_DISTANCE_M}m를 벗어났습니다.`
              : '위치 확인 완료';

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* 상태 카드 */}
      <section
        aria-label="현재 상태"
        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm"
      >
        <p className="text-xs font-semibold text-[var(--toss-gray-3)]">현재 시간</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums leading-none">
          {now.toLocaleTimeString('ko-KR')}
        </p>
        <p className="mt-2 text-xs text-[var(--toss-gray-3)]">
          {now.toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long',
          })}
        </p>

        <div
          role="status"
          aria-live="polite"
          className="mt-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-3 text-sm"
        >
          {locationMessage}
          {accuracyTooLow && (
            <span className="mt-1 block text-xs text-amber-700">
              위치 정확도가 낮습니다(±{Math.round(coords!.accuracy)}m). 야외에서 다시 시도하면 더 정확합니다.
            </span>
          )}
        </div>
      </section>

      {/* 위치 확인 / 출근 / 퇴근 버튼 */}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={requestLocation}
          disabled={status === 'requesting'}
          className="h-14 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] text-base font-semibold text-[var(--foreground)] disabled:opacity-50"
        >
          {status === 'requesting' ? '위치 확인 중...' : '위치 새로고침'}
        </button>

        {!openLog?.check_in ? (
          <button
            type="button"
            onClick={handleCheckIn}
            disabled={!canCheckIn}
            aria-label="출근 체크인"
            className="h-16 rounded-[var(--radius-lg)] bg-[var(--accent)] text-lg font-semibold text-white disabled:opacity-50"
          >
            {submitting ? '처리 중...' : status === 'success' && withinRange ? '출근 체크인' : '위치 확인 후 출근'}
          </button>
        ) : !openLog.check_out ? (
          <button
            type="button"
            onClick={handleCheckOut}
            disabled={!canCheckOut}
            aria-label="퇴근 체크아웃"
            className="h-16 rounded-[var(--radius-lg)] bg-red-600 text-lg font-semibold text-white disabled:opacity-50"
          >
            {submitting ? '처리 중...' : status === 'success' && withinRange ? '퇴근 체크아웃' : '위치 확인 후 퇴근'}
          </button>
        ) : (
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] p-4 text-center text-sm font-semibold text-[var(--toss-gray-3)]">
            오늘 출퇴근이 모두 완료되었습니다.
          </div>
        )}
      </div>
    </div>
  );
}
