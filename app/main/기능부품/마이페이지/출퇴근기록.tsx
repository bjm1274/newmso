'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// [필수 설정] 병원(목포시 송림로 73)의 정확한 좌표
// 100m 오차 범위를 줄이려면 구글지도에서 '박철홍정형외과'를 우클릭하여 좌표를 복사해 넣으세요.
const HOSPITAL_LOCATION = {
  latitude: 34.816095,  // 위도 (예시)
  longitude: 126.376992 // 경도 (예시)
};

const ALLOWED_RADIUS_METER = 100; // 허용 반경 (100m)

export default function CommuteRecord({ user }: any) {
  const [logs, setLogs] = useState<any[]>([]);
  const [todayLog, setTodayLog] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [distance, setDistance] = useState<number | null>(null); // 병원과의 거리
  const [loading, setLoading] = useState(true);

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
      .from('commute_logs')
      .select('*')
      .eq('user_id', user.id)
      .eq('work_date', today)
      .maybeSingle();
    setTodayLog(data || null);
  };

  const fetchMonthlyLogs = async () => {
    const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString();
    const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).toISOString();

    const { data } = await supabase
      .from('commute_logs')
      .select('*')
      .eq('user_id', user.id)
      .gte('work_date', startOfMonth)
      .lte('work_date', endOfMonth)
      .order('work_date', { ascending: false });

    setLogs(data || []);
  };

  // 📍 [핵심 기능] 현재 위치 가져오기 및 거리 계산
  const getCurrentLocation = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
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
            alert(`🏥 병원과 거리가 너무 멉니다! (현재 거리: ${Math.floor(dist)}m)\n병원 내(100m)에서만 출퇴근이 가능합니다.`);
            resolve(false); // 100m 밖 (실패)
          }
        },
        (error) => {
          console.error("위치 확인 실패:", error);
          alert('위치 정보를 가져올 수 없습니다. 브라우저의 위치 권한을 허용해 주세요.');
          resolve(false);
        },
        { enableHighAccuracy: true } // GPS 정밀 모드 사용
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

  // 출퇴근 처리 (위치 검증 포함)
  const handleCommute = async (type: 'in' | 'out') => {
    // 1. 위치 검증 먼저 수행
    const isLocationValid = await getCurrentLocation();
    if (!isLocationValid) return; // 위치가 안 맞으면 여기서 중단!

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
        
        const { data, error } = await supabase.from('commute_logs').insert([{
          user_id: user.id,
          work_date: today,
          check_in_time: timeString,
          status: isLate ? '지각' : '정상'
        }]).select().single();
        
        if (error) throw error;
        setTodayLog(data);
        alert(isLate ? `지각 처리되었습니다. (기준: ${lateThreshold}:${lateMinute})` : '정상 출근되었습니다. 오늘도 화이팅!');
      
      } else {
        if (!todayLog) return;
        const { data, error } = await supabase
          .from('commute_logs')
          .update({ check_out_time: timeString })
          .eq('id', todayLog.id)
          .select()
          .single();

        if (error) throw error;
        setTodayLog(data);
        alert('퇴근 처리되었습니다. 고생하셨습니다!');
      }
      fetchMonthlyLogs();
    } catch (error: any) {
      alert('오류 발생: ' + error.message);
    }
  };

  const formatTime = (isoString: string) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="bg-white border border-gray-100 shadow-sm rounded-[2.5rem] p-10 h-full flex flex-col space-y-10">
      
      {/* 실시간 상태 카드 */}
      <div className="flex justify-between items-center bg-gray-900 p-8 rounded-[2rem] text-white shadow-2xl relative overflow-hidden">
        {/* 배경 장식 */}
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-white opacity-5 rounded-full blur-3xl"></div>
        
        <div className="space-y-2 z-10">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
            Real-time Status 
            {/* 거리 표시 (테스트용) */}
            {distance !== null && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] ${distance <= ALLOWED_RADIUS_METER ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                병원 거리: {distance}m {distance <= ALLOWED_RADIUS_METER ? '✅' : '❌'}
              </span>
            )}
          </p>
          <h2 className="text-4xl font-black tracking-tighter">{currentTime.toLocaleTimeString('ko-KR')}</h2>
          <div className="flex items-center gap-2 mt-2">
            <span className={`w-2 h-2 rounded-full animate-pulse ${todayLog ? (todayLog.check_out_time ? 'bg-gray-500' : 'bg-green-500') : 'bg-red-500'}`}></span>
            <span className="text-sm font-bold">
              {todayLog ? (todayLog.check_out_time ? '퇴근 완료' : '근무 중') : '출근 전'}
            </span>
          </div>
        </div>

        <div className="flex gap-4 z-10">
          {!todayLog && (
            <button onClick={() => handleCommute('in')} className="px-10 py-5 bg-blue-600 hover:bg-blue-500 rounded-2xl font-black text-lg shadow-lg active:scale-95 transition-all flex flex-col items-center leading-none gap-1">
              <span>출근하기 ☀️</span>
              <span className="text-[10px] font-normal opacity-70">GPS 인증 필요</span>
            </button>
          )}
          {todayLog && !todayLog.check_out_time && (
            <button onClick={() => handleCommute('out')} className="px-10 py-5 bg-red-600 hover:bg-red-500 rounded-2xl font-black text-lg shadow-lg active:scale-95 transition-all flex flex-col items-center leading-none gap-1">
              <span>퇴근하기 🌙</span>
              <span className="text-[10px] font-normal opacity-70">GPS 인증 필요</span>
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
          <h3 className="text-xl font-black text-gray-900 tracking-tight">근무 히스토리</h3>
          <div className="flex gap-2">
            <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="p-2 border rounded-full hover:bg-gray-50">◀</button>
            <span className="font-black px-2">{currentMonth.getFullYear()}. {currentMonth.getMonth() + 1}</span>
            <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="p-2 border rounded-full hover:bg-gray-50">▶</button>
          </div>
        </div>

        <div className="space-y-4">
          {logs.map((log) => (
            <div key={log.id} className="flex items-center justify-between p-5 bg-gray-50 rounded-2xl border border-transparent hover:border-gray-200 transition-all">
              <div className="flex items-center gap-6">
                <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center font-black ${log.status === '지각' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                   <span className="text-[10px] opacity-60">{new Date(log.work_date).getMonth() + 1}월</span>
                   <span className="text-lg leading-tight">{new Date(log.work_date).getDate()}일</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400">{new Date(log.work_date).toLocaleDateString('ko-KR', { weekday: 'long' })}</p>
                  <p className="font-black text-gray-900">{log.status}</p>
                </div>
              </div>
              <div className="flex gap-10">
                <TimeBox label="출근" time={formatTime(log.check_in_time)} />
                <TimeBox label="퇴근" time={formatTime(log.check_out_time)} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatItem({ label, value, isWarning, isSuccess }: any) {
  return (
    <div className="bg-white border border-gray-100 p-6 rounded-[2rem] text-center shadow-sm">
      <p className="text-[11px] font-bold text-gray-400 mb-2 uppercase">{label}</p>
      <p className={`text-2xl font-black ${isWarning ? 'text-red-500' : isSuccess ? 'text-blue-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

function TimeBox({ label, time }: any) {
  return (
    <div className="text-right">
      <p className="text-[10px] font-bold text-gray-400 mb-1">{label}</p>
      <p className="text-base font-black text-gray-800">{time}</p>
    </div>
  );
}