'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// [필수 설정] 병원(목포시 송림로 73)의 정확한 좌표
// 100m 오차 범위를 줄이려면 구글지도에서 '박철홍정형외과'를 우클릭하여 좌표를 복사해 넣으세요.
const HOSPITAL_LOCATION = {
  latitude: 34.816095,  // 목포 박철홍정형외과 위도
  longitude: 126.376992 // 목포 박철홍정형외과 경도
};

const ALLOWED_RADIUS_METER = 100;

export default function CommuteRecord({ user }: any) {
  const [logs, setLogs] = useState<any[]>([]);
  const [todayLog, setTodayLog] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [distance, setDistance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
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
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('staff_id', user.id)
      .eq('date', today)
      .maybeSingle();
    setTodayLog(data || null);
  };

  const fetchMonthlyLogs = async () => {
    const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString().split('T')[0];
    const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).toISOString().split('T')[0];

    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('staff_id', user.id)
      .gte('date', startOfMonth)
      .lte('date', endOfMonth)
      .order('date', { ascending: false });

    setLogs(data || []);
  };

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
          setDistance(Math.floor(dist));

          if (dist <= ALLOWED_RADIUS_METER) {
            resolve(true);
          } else {
            resolve(false);
          }
        },
        (error) => {
          console.error("위치 확인 실패:", error);
          resolve(false);
        },
        { enableHighAccuracy: true }
      );
    });
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const handleCommute = async (type: 'in' | 'out') => {
    const isLocationValid = await getCurrentLocation();
    if (!isLocationValid) {
      alert(`🏥 병원과 거리가 너무 멉니다! (현재 거리: ${distance}m)\n병원 내(100m)에서만 출퇴근이 가능합니다.`);
      return;
    }

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const timeString = now.toISOString();

    try {
      if (type === 'in') {
        const { data: staff } = await supabase.from('staff_members').select('shift_id').eq('id', user.id).single();
        let status = '정상';

        if (staff?.shift_id) {
          const { data: shift } = await supabase.from('work_shifts').select('*').eq('id', staff.shift_id).single();
          if (shift) {
            const [sHour, sMin] = shift.start_time.split(':').map(Number);
            if (now.getHours() > sHour || (now.getHours() === sHour && now.getMinutes() > sMin)) {
              status = '지각';
            }
          }
        } else if (now.getHours() >= 9 && now.getMinutes() > 0) {
          status = '지각';
        }

        const { data, error } = await supabase.from('attendance').upsert([{
          staff_id: user.id,
          date: today,
          check_in: timeString,
          status: status,
          location_lat: HOSPITAL_LOCATION.latitude,
          location_lon: HOSPITAL_LOCATION.longitude
        }]).select().single();

        if (error) throw error;
        setTodayLog(data);
        alert(status === '지각' ? '지각 처리되었습니다.' : '정상 출근되었습니다. 오늘도 화이팅!');

      } else {
        if (!todayLog) return;
        const { data, error } = await supabase
          .from('attendance')
          .update({ check_out: timeString })
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
            <span className={`w-2 h-2 rounded-full animate-pulse ${todayLog ? (todayLog.check_out ? 'bg-gray-500' : 'bg-green-500') : 'bg-red-500'}`}></span>
            <span className="text-sm font-bold">
              {todayLog ? (todayLog.check_out ? '퇴근 완료' : '근무 중') : '출근 전'}
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
          {todayLog && !todayLog.check_out && (
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
                  <span className="text-[10px] opacity-60">{new Date(log.date).getMonth() + 1}월</span>
                  <span className="text-lg leading-tight">{new Date(log.date).getDate()}일</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400">{new Date(log.date).toLocaleDateString('ko-KR', { weekday: 'long' })}</p>
                  <p className="font-black text-gray-900">{log.status}</p>
                </div>
              </div>
              <div className="flex gap-10">
                <TimeBox label="출근" time={formatTime(log.check_in)} />
                <TimeBox label="퇴근" time={formatTime(log.check_out)} />
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