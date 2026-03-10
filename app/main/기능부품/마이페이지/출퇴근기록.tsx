'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { WORKPLACE_LOCATION, ALLOWED_DISTANCE_M } from '@/lib/location';

const HOSPITAL_LOCATION = WORKPLACE_LOCATION;
const ALLOWED_RADIUS_METER = ALLOWED_DISTANCE_M;

export default function CommuteRecord({ user, onRequestCorrection }: any) {
  const [logs, setLogs] = useState<any[]>([]);
  const [todayLog, setTodayLog] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [distance, setDistance] = useState<number | null>(null); // 병원과의 거리
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    // 컴포넌트 로드 시 위치 권한 요청 및 거리 계산 미리 해보기
    getCurrentLocation();
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (user?.id) {
      initCommuteData();
    }
  }, [user, currentMonth]);

  const initCommuteData = async () => {
    setLoading(true);
    await fetchTodayLog();
    await fetchMonthlyLogs();
    setLoading(false);
  };

  const fetchTodayLog = async () => {
    const today = new Date().toLocaleDateString('en-CA');
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('staff_id', user.id)
      .eq('date', today)
      .maybeSingle();
    setTodayLog(data || null);
  };

  const fetchMonthlyLogs = async () => {
    const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toLocaleDateString('en-CA');
    const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).toLocaleDateString('en-CA');

    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('staff_id', user.id)
      .gte('date', startOfMonth)
      .lte('date', endOfMonth)
      .order('date', { ascending: false });

    setLogs(data || []);
  };

  // 📍 [핵심 기능] 현재 위치 가져오기 및 거리 계산
  const getCurrentLocation = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        alert('이 브라우저는 위치 정보를 지원하지 않습니다.');
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
            resolve(true); // 100m 이내 (성공)
          } else {
            alert(`🏥 병원과 거리가 너무 멉니다! (현재 거리: ${Math.floor(dist)}m)\n병원 내(300m)에서만 출퇴근이 가능합니다.`);
            resolve(false); // 100m 밖 (실패)
          }
        },
        (error) => {
          console.warn('위치 확인 실패:', error && (error as any).message ? (error as any).message : error);
          alert('위치 정보를 정확히 가져올 수 없습니다. 다시 시도하거나 브라우저 위치 권한을 확인해 주세요.');
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 } // GPS 정밀 모드 + 시간초과 + 캐시사용안함
      );
    });
  };

  // 📏 하버사인(Haversine) 공식: 두 좌표 간 거리 계산 (단위: m)
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
  const syncToAttendances = async (workDate: string, checkIn: string | null, checkOut: string | null, status: string) => {
    try {
      const statusMap: Record<string, string> = { '정상': 'present', '지각': 'late' };
      const attStatus = statusMap[status] || 'present';
      const mins = checkIn && checkOut
        ? Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 60000)
        : null;
      await supabase.from('attendances').upsert({
        staff_id: user.id,
        work_date: workDate,
        check_in_time: checkIn,
        check_out_time: checkOut,
        status: attStatus,
        work_hours_minutes: mins ?? undefined,
      }, { onConflict: 'staff_id,work_date' });
    } catch (_) { }
  };

  // 출퇴근 처리 (위치 검증 포함)
  const handleCommute = async (type: 'in' | 'out') => {
    if (isProcessing) return;
    setIsProcessing(true);

    // 1. 위치 검증 먼저 수행
    const isLocationValid = await getCurrentLocation();
    if (!isLocationValid) {
      setIsProcessing(false);
      return; // 위치가 안 맞으면 여기서 중단!
    }

    // 2. 위치 인증 성공 시 DB 기록 시작
    const now = new Date();
    const today = now.toLocaleDateString('en-CA');
    const timeString = now.toISOString();

    try {
      if (type === 'in') {
        let lateThreshold = 9;
        let lateMinute = 10;
        if (user.department === '의료진') { lateThreshold = 8; lateMinute = 30; }

        const isLate = now.getHours() > lateThreshold || (now.getHours() === lateThreshold && now.getMinutes() > lateMinute);

        const { data, error } = await supabase.from('attendance').upsert([{
          staff_id: user.id,
          date: today,
          check_in: timeString,
          status: isLate ? '지각' : '정상'
        }], { onConflict: 'staff_id,date' }).select().single();

        if (error) throw error;
        await syncToAttendances(today, timeString, null, isLate ? '지각' : '정상');
        setTodayLog(data);
        alert(isLate ? `지각 처리되었습니다. (기준: ${lateThreshold}:${lateMinute})` : '정상 출근되었습니다. 오늘도 화이팅!');

      } else {
        if (!todayLog) return;
        const { data, error } = await supabase
          .from('attendance')
          .update({ check_out: timeString })
          .eq('staff_id', user.id)
          .eq('date', today)
          .is('check_out', null)
          .select()
          .single();

        if (error) throw error;
        await syncToAttendances(today, todayLog.check_in, timeString, todayLog.status || '정상');
        setTodayLog(data);
        alert('퇴근 처리되었습니다. 고생하셨습니다!');
      }
      fetchMonthlyLogs();
    } catch (error: any) {
      alert('오류 발생: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatTime = (isoString: string) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div data-testid="commute-record-view" className="bg-[var(--toss-card)] border border-[var(--toss-border)] shadow-sm rounded-[2.5rem] px-6 py-7 sm:p-8 h-full flex flex-col space-y-7">

      {/* 실시간 상태 카드 */}
      <div className="flex justify-between items-center bg-[var(--foreground)] px-6 py-6 sm:px-8 sm:py-7 rounded-[16px] text-white shadow-2xl relative overflow-hidden">
        {/* 배경 장식 */}
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-[var(--toss-card)] opacity-5 rounded-full blur-3xl"></div>

        <div className="space-y-2 z-10">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">{currentTime.toLocaleTimeString('ko-KR')}</h2>
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

        <div className="flex gap-4 z-10">
          {!todayLog && (
            <button
              data-testid="commute-check-in-button"
              onClick={() => handleCommute('in')}
              disabled={isProcessing}
              className="px-10 py-5 bg-[var(--toss-blue)] hover:opacity-90 rounded-[12px] font-semibold text-lg shadow-lg active:scale-95 transition-all flex flex-col items-center leading-none gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="px-10 py-5 bg-red-600 hover:bg-red-500 rounded-[12px] font-semibold text-lg shadow-lg active:scale-95 transition-all flex flex-col items-center leading-none gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>{isProcessing ? '위치 확인 처리 중...' : '퇴근하기 🌙'}</span>
              <span className="text-[11px] font-normal opacity-70">GPS 인증 필요</span>
            </button>
          )}
        </div>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-3 gap-6">
        <StatItem label="이번 달 근무" value={`${logs.length}일`} />
        <StatItem label="지각" value={`${logs.filter(l => l.status === '지각').length}회`} isWarning />
        <StatItem label="정상 출근" value={`${logs.filter(l => l.status === '정상').length}회`} isSuccess />
      </div>

      {/* 리스트 */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold text-[var(--foreground)] tracking-tight">근무 히스토리</h3>
          <div className="flex gap-2">
            <button onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))} className="p-2 border rounded-full hover:bg-[var(--toss-gray-1)]">◀</button>
            <span className="font-semibold px-2">{currentMonth.getFullYear()}. {currentMonth.getMonth() + 1}</span>
            <button onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))} className="p-2 border rounded-full hover:bg-[var(--toss-gray-1)]">▶</button>
          </div>
        </div>

        <div className="space-y-4">
          {logs.map((log) => {
            const workDate = new Date(log.date);
            return (
              <div
                key={log.id}
                className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-5 bg-[var(--toss-gray-1)] rounded-[12px] border border-transparent hover:border-[var(--toss-border)] transition-all"
              >
                <div className="flex items-center gap-6">
                  <div
                    className={`w-14 h-14 rounded-[12px] flex flex-col items-center justify-center font-semibold ${log.status === '지각' ? 'bg-red-100 text-red-600' : 'bg-[var(--toss-blue-light)] text-[var(--toss-blue)]'
                      }`}
                  >
                    <span className="text-[11px] opacity-60">{workDate.getMonth() + 1}월</span>
                    <span className="text-lg leading-tight">{workDate.getDate()}일</span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[var(--toss-gray-3)]">
                      {workDate.toLocaleDateString('ko-KR', { weekday: 'long' })}
                    </p>
                    <p className="font-semibold text-[var(--foreground)]">{log.status}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6 md:gap-10 justify-between md:justify-end w-full">
                  <div className="flex gap-6">
                    <TimeBox label="출근" time={formatTime(log.check_in)} />
                    <TimeBox label="퇴근" time={formatTime(log.check_out)} />
                  </div>
                  {onRequestCorrection && (
                    <button
                      type="button"
                      onClick={() => onRequestCorrection(log)}
                      className="px-3 py-2 rounded-[16px] text-[11px] font-semibold border border-[var(--toss-blue-light)] text-[var(--toss-blue)] bg-[var(--toss-card)] hover:bg-[var(--toss-blue-light)] shrink-0"
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

function StatItem({ label, value, isWarning, isSuccess }: any) {
  return (
    <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] p-6 rounded-[16px] text-center shadow-sm">
      <p className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-2 uppercase">{label}</p>
      <p className={`text-2xl font-semibold ${isWarning ? 'text-red-500' : isSuccess ? 'text-[var(--toss-blue)]' : 'text-[var(--foreground)]'}`}>{value}</p>
    </div>
  );
}

function TimeBox({ label, time }: any) {
  return (
    <div className="text-right">
      <p className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1">{label}</p>
      <p className="text-base font-semibold text-[var(--foreground)]">{time}</p>
    </div>
  );
}
