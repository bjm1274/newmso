'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { WORKPLACE_LOCATION, ALLOWED_DISTANCE_M } from '@/lib/location';

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function AttendanceSystem({ user, staffs, selectedCo, isAdminView = false }: any) {
  const [currentLocation, setCurrentLocation] = useState<any>(null);
  const [isWithinRange, setIsWithinRange] = useState(false);
  const [todayAttendance, setTodayAttendance] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [allAttendance, setAllAttendance] = useState<any[]>([]);
  const [viewDate, setViewDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewMonth, setViewMonth] = useState(new Date().toISOString().slice(0, 7));
  const [userShift, setUserShift] = useState<any>(null);

  const HOSPITAL_LAT = WORKPLACE_LOCATION.latitude;
  const HOSPITAL_LON = WORKPLACE_LOCATION.longitude;
  const ALLOWED_DISTANCE = ALLOWED_DISTANCE_M;

  useEffect(() => {
    const fetchUserShift = async () => {
      if (!user?.id) return;
      const { data: staff } = await supabase.from('staff_members').select('shift_id').eq('id', user.id).single();
      if (staff?.shift_id) {
        const { data: shift } = await supabase.from('work_shifts').select('*').eq('id', staff.shift_id).single();
        if (shift) setUserShift(shift);
      }
    };
    fetchUserShift();
  }, [user]);

  const syncToAttendances = async (staffId: string, workDate: string, checkIn: string | null, checkOut: string | null, status: string) => {
    try {
      const mins = checkIn && checkOut
        ? Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 60000)
        : null;
      await supabase.from('attendances').upsert({
        staff_id: staffId,
        work_date: workDate,
        check_in_time: checkIn,
        check_out_time: checkOut,
        status,
        work_hours_minutes: mins
      }, { onConflict: 'staff_id,work_date' });
    } catch (_) {}
  };

  const getLocation = () => {
    if (!navigator.geolocation) {
      setError('이 기기는 GPS를 지원하지 않습니다.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setCurrentLocation({ latitude, longitude });
        const distance = calculateDistance(HOSPITAL_LAT, HOSPITAL_LON, latitude, longitude);
        const withinRange = distance <= ALLOWED_DISTANCE;
        setIsWithinRange(withinRange);
        if (!withinRange) setError(`병원으로부터 ${Math.round(distance)}m 떨어져 있습니다.`);
        else setError('');
      },
      (err) => setError(`GPS 오류: ${err.message}`)
    );
  };

  const handleCheckIn = async () => {
    if (!isWithinRange) return alert('병원 300m 이내에서만 출근 처리가 가능합니다.');
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const checkInTime = new Date().toISOString();
      
      // 지각 판단 로직 (부여된 근무 형태 기준)
      let status = '정상';
      if (userShift) {
        const [sHour, sMin] = userShift.start_time.split(':').map(Number);
        const now = new Date();
        if (now.getHours() > sHour || (now.getHours() === sHour && now.getMinutes() > sMin)) {
          status = '지각';
        }
      } else {
        // 기본 09:00 기준
        const now = new Date();
        if (now.getHours() >= 9 && now.getMinutes() > 0) status = '지각';
      }

      const { error } = await supabase.from('attendance').upsert([{
        staff_id: user.id,
        date: today,
        check_in: checkInTime,
        status: status,
        location_lat: currentLocation.latitude,
        location_lon: currentLocation.longitude
      }]);
      if (!error) {
        await syncToAttendances(user.id, today, checkInTime, null, status);
        alert(`✅ 출근 처리되었습니다. 상태: ${status}`);
        fetchTodayAttendance();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckOut = async () => {
    if (!isWithinRange) return alert('병원 300m 이내에서만 퇴근 처리가 가능합니다.');
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const checkOutTime = new Date().toISOString();
      const todayRec = todayAttendance;
      const { error } = await supabase.from('attendance').update({
        check_out: checkOutTime,
        location_lat_out: currentLocation.latitude,
        location_lon_out: currentLocation.longitude
      }).eq('staff_id', user.id).eq('date', today);
      if (!error) {
        const statusMap: Record<string, string> = { '정상': 'present', '지각': 'late' };
        await syncToAttendances(user.id, today, todayRec?.check_in, checkOutTime, statusMap[todayRec?.status || '정상'] || 'present');
        alert('✅ 퇴근 처리되었습니다.');
        fetchTodayAttendance();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTodayAttendance = async () => {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase.from('attendance').select('*').eq('staff_id', user.id).eq('date', today).maybeSingle();
    setTodayAttendance(data || null);
  };

  const fetchAllAttendance = async () => {
    let query = supabase.from('attendance').select('*, staff_members(name, company, department, shift_id)');
    if (isAdminView) {
      query = query.eq('date', viewDate);
    } else {
      query = query.eq('staff_id', user.id).gte('date', `${viewMonth}-01`).lte('date', `${viewMonth}-31`);
    }
    
    const { data } = await query;
    if (data) {
      let filtered = data;
      if (selectedCo && selectedCo !== '전체') {
        filtered = data.filter((a: any) => a.staff_members?.company === selectedCo);
      }
      setAllAttendance(filtered);
    }
  };

  useEffect(() => {
    if (!isAdminView) {
      getLocation();
      fetchTodayAttendance();
      const interval = setInterval(getLocation, 30000);
      return () => clearInterval(interval);
    }
  }, [user, isAdminView]);

  useEffect(() => {
    fetchAllAttendance();
  }, [viewDate, viewMonth, selectedCo, isAdminView]);

  return (
    <div className="flex flex-col h-full bg-[var(--toss-gray-1)]/30 overflow-y-auto custom-scrollbar space-y-8 p-8">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-[var(--foreground)] tracking-tighter italic">
            {isAdminView ? '근태 종합 관리 (행정팀)' : '실시간 근태 관리'}
          </h2>
          <p className="text-xs text-[var(--toss-gray-3)] font-bold uppercase mt-1">
            {userShift ? `내 근무: ${userShift.name} (${userShift.start_time}~${userShift.end_time})` : '기본 근무 (09:00~18:00)'}
          </p>
        </div>
        {isAdminView && (
          <div className="flex gap-2">
            <input type="date" value={viewDate} onChange={e => setViewDate(e.target.value)} className="p-2 border border-[var(--toss-border)] text-xs font-bold outline-none" />
          </div>
        )}
      </header>

      {!isAdminView && (
        <>
          <div className={`p-8 rounded-lg border-2 shadow-sm ${isWithinRange ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[var(--foreground)]">📍 위치 정보</h3>
              <button onClick={getLocation} className="px-4 py-2 bg-[var(--toss-blue)] text-white rounded-[12px] text-xs font-bold shadow-sm">위치 새로고침</button>
            </div>
            {currentLocation ? (
              <div className="space-y-3">
                <p className="text-sm font-bold text-[var(--foreground)]">병원 거리: {Math.round(calculateDistance(HOSPITAL_LAT, HOSPITAL_LON, currentLocation.latitude, currentLocation.longitude))}m</p>
                {error && <p className="text-xs font-bold text-red-600">{error}</p>}
              </div>
            ) : <p className="text-sm text-[var(--toss-gray-4)] font-bold">위치 정보를 가져오는 중...</p>}
          </div>

          <div className="grid grid-cols-2 gap-6">
            <button onClick={handleCheckIn} disabled={!isWithinRange || loading || todayAttendance?.check_in} className={`py-8 rounded-lg font-bold text-lg shadow-xl transition-all ${todayAttendance?.check_in ? 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-3)]' : isWithinRange ? 'bg-green-600 text-white' : 'bg-[var(--toss-border)] text-[var(--toss-gray-4)]'}`}>
              {todayAttendance?.check_in ? '✅ 출근 완료' : '🚪 출근 (체크인)'}
            </button>
            <button onClick={handleCheckOut} disabled={!isWithinRange || loading || !todayAttendance?.check_in || todayAttendance?.check_out} className={`py-8 rounded-lg font-bold text-lg shadow-xl transition-all ${todayAttendance?.check_out ? 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-3)]' : !todayAttendance?.check_in ? 'bg-[var(--toss-border)] text-[var(--toss-gray-4)]' : isWithinRange ? 'bg-orange-600 text-white' : 'bg-[var(--toss-border)] text-[var(--toss-gray-4)]'}`}>
              {todayAttendance?.check_out ? '✅ 퇴근 완료' : '🚪 퇴근 (체크아웃)'}
            </button>
          </div>
        </>
      )}

      <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] shadow-sm overflow-hidden">
        <div className="p-6 border-b border-[var(--toss-border)] bg-[var(--toss-gray-1)]/50 flex justify-between items-center">
          <h3 className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">
            {isAdminView ? `${viewDate} 출결 현황` : `${viewMonth} 나의 근태 기록`}
          </h3>
          {!isAdminView && <input type="month" value={viewMonth} onChange={e => setViewMonth(e.target.value)} className="p-1 border border-[var(--toss-border)] text-[10px] font-bold" />}
        </div>
        <table className="w-full text-left border-collapse">
          <thead className="bg-[var(--toss-card)] text-[9px] font-bold text-[var(--toss-gray-3)] border-b border-[var(--toss-border)] uppercase">
            <tr>
              {isAdminView && <th className="p-4">성명</th>}
              <th className="p-4">날짜</th>
              <th className="p-4">출근시간</th>
              <th className="p-4">퇴근시간</th>
              <th className="p-4">상태</th>
              <th className="p-4">비고</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--toss-border)] text-xs font-bold">
            {allAttendance.map((a: any, i: number) => (
              <tr key={i} className="hover:bg-[var(--toss-gray-1)] transition-colors">
                {isAdminView && <td className="p-4 font-bold text-[var(--foreground)]">{a.staff_members?.name}</td>}
                <td className="p-4 text-[var(--toss-gray-3)]">{a.date}</td>
                <td className="p-4 text-[var(--toss-blue)]">{a.check_in ? a.check_in.slice(11, 16) : '-'}</td>
                <td className="p-4 text-orange-600">{a.check_out ? a.check_out.slice(11, 16) : '-'}</td>
                <td className="p-4">
                  <span className={`px-2 py-0.5 text-[9px] font-bold border ${a.status === '정상' ? 'bg-green-50 text-green-600 border-green-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                    {a.status}
                  </span>
                </td>
                <td className="p-4 text-[10px] text-[var(--toss-gray-3)]">{a.status === '지각' ? '지각' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
