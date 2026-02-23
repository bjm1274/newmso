'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

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

  const HOSPITAL_LAT = 37.4979;
  const HOSPITAL_LON = 127.0276;
  const ALLOWED_DISTANCE = 100;

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
    if (!isWithinRange) return alert('병원 100m 이내에서만 출근 처리가 가능합니다.');
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
    if (!isWithinRange) return alert('병원 100m 이내에서만 퇴근 처리가 가능합니다.');
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const checkOutTime = new Date().toISOString();
      const { error } = await supabase.from('attendance').update({
        check_out: checkOutTime,
        location_lat_out: currentLocation.latitude,
        location_lon_out: currentLocation.longitude
      }).eq('staff_id', user.id).eq('date', today);
      if (!error) {
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
    const { data } = await supabase.from('attendance').select('*').eq('staff_id', user.id).eq('date', today).single();
    if (data) setTodayAttendance(data as any);
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
    <div className="flex flex-col h-full bg-background overflow-y-auto custom-scrollbar animate-soft-fade">
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/50 p-6 md:p-10 shrink-0 z-20 shadow-sm relative">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-primary/10 text-primary text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest">Attendance Shield</span>
              <span className="w-1 h-1 rounded-full bg-slate-300"></span>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Real-time GPS Tracking</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter">
              {isAdminView ? '근태 통합 관제 시스템' : '스마트 근태 관리'}
            </h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-widest">
              {userShift ? `Shift: ${userShift.name} (${userShift.start_time} - ${userShift.end_time})` : 'Standard Shift (09:00 - 18:00)'}
            </p>
          </div>
          {isAdminView && (
            <div className="flex items-center gap-4 premium-card p-2 bg-slate-100 border-none">
              <input
                type="date"
                value={viewDate}
                onChange={e => setViewDate(e.target.value)}
                className="bg-transparent text-xs font-black text-slate-800 outline-none p-2"
              />
            </div>
          )}
        </div>
      </header>

      <div className="p-6 md:p-10 space-y-10 max-w-6xl mx-auto w-full">
        {!isAdminView && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className={`lg:col-span-1 premium-card p-8 flex flex-col justify-between relative overflow-hidden group transition-all duration-500 ${isWithinRange ? 'bg-success-soft border-success/20' : 'bg-danger-soft border-danger/20'
              }`}>
              <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full blur-3xl opacity-20 ${isWithinRange ? 'bg-success' : 'bg-danger'}`}></div>
              <div>
                <div className="flex items-center justify-between mb-6">
                  <p className={`text-[10px] font-black uppercase tracking-widest ${isWithinRange ? 'text-success' : 'text-danger'}`}>Location Verification</p>
                  <button onClick={getLocation} className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-xs shadow-sm hover:scale-110 active:scale-90 transition-all">🔄</button>
                </div>
                <div className="flex items-center gap-4 mb-4">
                  <div className={`text-4xl ${isWithinRange ? 'animate-bounce' : 'animate-pulse'}`}>
                    {isWithinRange ? '📍' : '⚠️'}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 leading-tight">
                      {isWithinRange ? '병원 도착' : '위치 이탈'}
                    </h3>
                    <p className="text-[11px] font-bold text-slate-400 mt-1">Current status verified</p>
                  </div>
                </div>
              </div>
              <div className="space-y-3 pt-6 border-t border-white/50">
                <div className="flex justify-between items-center text-xs font-bold text-slate-600">
                  <span>병원 거리</span>
                  <span className="font-black">{currentLocation ? `${Math.round(calculateDistance(HOSPITAL_LAT, HOSPITAL_LON, currentLocation.latitude, currentLocation.longitude))}m` : 'Calculating...'}</span>
                </div>
                <div className="w-full h-1.5 bg-white/50 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-1000 ${isWithinRange ? 'bg-success w-full' : 'bg-danger w-1/4'}`}
                  ></div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 grid grid-cols-2 gap-6">
              <button
                onClick={handleCheckIn}
                disabled={!isWithinRange || loading || todayAttendance?.check_in}
                className={`premium-card p-10 flex flex-col items-center justify-center gap-4 shadow-xl transition-all duration-300 group ${todayAttendance?.check_in
                  ? 'bg-slate-100 border-none opacity-60'
                  : isWithinRange
                    ? 'bg-primary border-none text-white shadow-blue-900/20 hover:scale-[1.02] active:scale-95'
                    : 'bg-white border-slate-200 grayscale opacity-40'
                  }`}
              >
                <span className={`text-4xl transition-transform group-hover:scale-125 duration-500 ${todayAttendance?.check_in ? '' : 'group-hover:rotate-12'}`}>
                  {todayAttendance?.check_in ? '✅' : '🏢'}
                </span>
                <div className="text-center">
                  <p className="text-[10px] font-black opacity-50 uppercase tracking-widest mb-1">Clock In</p>
                  <p className="text-lg font-black">{todayAttendance?.check_in ? todayAttendance.check_in.slice(11, 16) : '출근 처리'}</p>
                </div>
              </button>

              <button
                onClick={handleCheckOut}
                disabled={!isWithinRange || loading || !todayAttendance?.check_in || todayAttendance?.check_out}
                className={`premium-card p-10 flex flex-col items-center justify-center gap-4 shadow-xl transition-all duration-300 group ${todayAttendance?.check_out
                  ? 'bg-slate-100 border-none opacity-60'
                  : !todayAttendance?.check_in
                    ? 'bg-white border-slate-200 grayscale opacity-40'
                    : isWithinRange
                      ? 'bg-slate-900 border-none text-white shadow-slate-900/20 hover:scale-[1.02] active:scale-95'
                      : 'bg-white border-slate-200 grayscale opacity-40'
                  }`}
              >
                <span className={`text-4xl transition-transform group-hover:scale-125 duration-500 ${todayAttendance?.check_out ? '' : 'group-hover:-rotate-12'}`}>
                  {todayAttendance?.check_out ? '🏁' : '🏡'}
                </span>
                <div className="text-center">
                  <p className="text-[10px] font-black opacity-50 uppercase tracking-widest mb-1">Clock Out</p>
                  <p className="text-lg font-black">{todayAttendance?.check_out ? todayAttendance.check_out.slice(11, 16) : '퇴근 처리'}</p>
                </div>
              </button>
            </div>
          </div>
        )}

        <div className="premium-card overflow-hidden border-none shadow-2xl shadow-slate-200/50 bg-white">
          <div className="p-8 border-b border-slate-50 bg-slate-50/30 flex justify-between items-center">
            <div>
              <h3 className="text-sm font-black text-slate-800 tracking-tight">
                {isAdminView ? `${viewDate} 출결 전수 로그` : `${viewMonth} 근태 통합 리포트`}
              </h3>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Sovereign Data Center</p>
            </div>
            {!isAdminView && (
              <div className="premium-card p-1.5 bg-white border-slate-200 flex items-center">
                <input
                  type="month"
                  value={viewMonth}
                  onChange={e => setViewMonth(e.target.value)}
                  className="bg-transparent text-[10px] font-black p-1 outline-none text-slate-600"
                />
              </div>
            )}
          </div>
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-white">
                  {isAdminView && <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Employee</th>}
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date Index</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Check In</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Check Out</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Control Status</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {allAttendance.map((a: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-all duration-300 group">
                    {isAdminView && (
                      <td className="px-8 py-6">
                        <p className="text-xs font-black text-slate-800">{a.staff_members?.name}</p>
                        <p className="text-[9px] font-bold text-slate-400">{a.staff_members?.department}</p>
                      </td>
                    )}
                    <td className="px-8 py-6">
                      <span className="text-xs font-black text-slate-400 group-hover:text-primary transition-colors">{a.date}</span>
                    </td>
                    <td className="px-8 py-6">
                      <span className="text-xs font-black text-primary">{a.check_in ? a.check_in.slice(11, 16) : '--:--'}</span>
                    </td>
                    <td className="px-8 py-6">
                      <span className="text-xs font-black text-slate-800">{a.check_out ? a.check_out.slice(11, 16) : '--:--'}</span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${a.status === '정상' ? 'bg-success' : 'bg-danger animate-pulse'}`}></div>
                        <span className={`text-[10px] font-black uppercase tracking-widest ${a.status === '정상' ? 'text-success' : 'text-danger'}`}>
                          {a.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <span className="text-[10px] font-bold text-slate-400 italic">
                        {a.status === '지각' ? 'Attention Required' : 'Locked'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {allAttendance.length === 0 && (
              <div className="py-20 flex flex-col items-center justify-center text-slate-300 opacity-20">
                <span className="text-6xl mb-4">📅</span>
                <p className="font-black text-sm uppercase tracking-widest">No data synchronized</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
