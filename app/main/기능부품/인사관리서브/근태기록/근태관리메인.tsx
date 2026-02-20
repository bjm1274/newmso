'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

export default function AttendanceMain({ staffs, selectedCo }: any) {
  const [viewMode, setViewMode] = useState<'daily' | 'monthly' | 'calendar' | 'dashboard'>('monthly');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const filtered = selectedCo === '전체' ? staffs : staffs.filter((s: any) => s.company === selectedCo);

  const fetchAttendance = async () => {
    setLoading(true);
    try {
      const staffIds = filtered.map((s: any) => s.id);
      if (staffIds.length === 0) {
        setAttendanceData([]);
        return;
      }
      const [startDate, endDate] = viewMode === 'daily'
        ? [selectedDate, selectedDate]
        : [`${selectedMonth}-01`, `${selectedMonth}-${String(daysInMonth).padStart(2, '0')}`];

      const { data, error } = await supabase
        .from('attendances')
        .select('*')
        .in('staff_id', staffIds)
        .gte('work_date', startDate)
        .lte('work_date', endDate);

      if (error) throw error;
      setAttendanceData(data || []);
    } catch (err) {
      console.error('근태 조회 실패:', err);
      setAttendanceData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, [selectedMonth, selectedDate, selectedCo, viewMode, filtered]);

  // 월별 일수 계산
  const getDaysInMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-').map(Number);
    return new Date(year, month, 0).getDate();
  };

  const daysInMonth = getDaysInMonth(selectedMonth);
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const stats = useMemo(() => {
    const total = attendanceData.length;
    const present = attendanceData.filter((a: any) => a.status === 'present').length;
    const late = attendanceData.filter((a: any) => a.status === 'late').length;
    const earlyLeave = attendanceData.filter((a: any) => a.status === 'early_leave').length;
    const absent = attendanceData.filter((a: any) => a.status === 'absent').length;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    return { total, present, late, earlyLeave, absent, rate };
  }, [attendanceData]);

  return (
    <div className="flex flex-col h-full bg-[#FDFDFD] animate-in fade-in duration-500">
      <header className="p-8 border-b border-[#E5E8EB] bg-white shrink-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div>
            <h2 className="text-2xl font-bold text-[#191F28] tracking-tighter italic">
              전문 근태 통합 관리 <span className="text-sm text-[#3182F6] ml-2">[{selectedCo}]</span>
            </h2>
            <div className="flex gap-2 mt-4">
              {[
                { id: 'daily', label: '일별 현황' },
                { id: 'monthly', label: '월별 대장' },
                { id: 'calendar', label: '근태 달력' },
                { id: 'dashboard', label: '대시보드' }
              ].map(mode => (
                <button 
                  key={mode.id}
                  onClick={() => setViewMode(mode.id as any)}
                  className={`px-6 py-2.5 rounded-[12px] text-[11px] font-bold transition-all ${
                    viewMode === mode.id 
                      ? 'bg-[var(--toss-blue)] text-white shadow-sm' 
                      : 'bg-white text-[var(--toss-gray-3)] border border-[var(--toss-border)] hover:bg-[var(--toss-gray-1)]'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4 bg-[#F2F4F6] p-3 rounded-[16px] border border-[#E5E8EB]">
            {viewMode === 'daily' ? (
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-[#8B95A1] uppercase">Date</span>
                <input 
                  type="date" 
                  value={selectedDate} 
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-white border border-[#E5E8EB] px-4 py-2 rounded-[12px] text-xs font-bold outline-none focus:ring-2 focus:ring-[#3182F6]"
                />
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-[#8B95A1] uppercase">Month</span>
                <input 
                  type="month" 
                  value={selectedMonth} 
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-white border border-[#E5E8EB] px-4 py-2 rounded-[12px] text-xs font-bold outline-none focus:ring-2 focus:ring-[#3182F6]"
                />
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 p-8 overflow-auto custom-scrollbar bg-[#F2F4F6]/20">
        {viewMode === 'daily' && (
          <div className="bg-white border border-[#E5E8EB] rounded-[2.5rem] overflow-hidden shadow-xl">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#F2F4F6] text-[10px] font-bold text-[#8B95A1] border-b border-[#E5E8EB] uppercase">
                <tr>
                  <th className="px-8 py-5">직원 정보</th>
                  <th className="px-8 py-5">출근 시간</th>
                  <th className="px-8 py-5">퇴근 시간</th>
                  <th className="px-8 py-5">근무 시간</th>
                  <th className="px-8 py-5">상태</th>
                  <th className="px-8 py-5 text-right">비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((s: any) => {
                  const att = attendanceData.find((a: any) => a.staff_id === s.id && a.work_date === selectedDate);
                  const checkIn = att?.check_in_time ? new Date(att.check_in_time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';
                  const checkOut = att?.check_out_time ? new Date(att.check_out_time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';
                  const mins = att?.work_hours_minutes ?? 0;
                  const workHrs = mins ? `${Math.floor(mins / 60)}시간 ${mins % 60}분` : '-';
                  const statusMap: Record<string, string> = { present: '정상', absent: '결근', late: '지각', early_leave: '조퇴', sick_leave: '병가', annual_leave: '연차', holiday: '휴일', half_leave: '반차' };
                  const statusLabel = statusMap[att?.status || 'present'] || '정상';
                  const statusColor = att?.status === 'absent' || att?.status === 'late' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600';
                  return (
                    <tr key={s.id} className="hover:bg-[#E8F3FF]/50 transition-all group">
                      <td className="px-8 py-5">
                        <div className="flex flex-col">
                          <span className="font-bold text-[#191F28]">{s.name}</span>
                          <span className="text-[9px] text-[#8B95A1] font-bold uppercase">{s.department} / {s.position}</span>
                        </div>
                      </td>
                      <td className="px-8 py-5 font-mono font-bold text-[#3182F6]">{checkIn}</td>
                      <td className="px-8 py-5 font-mono font-bold text-[#8B95A1]">{checkOut}</td>
                      <td className="px-8 py-5 font-bold text-[#4E5968]">{workHrs}</td>
                      <td className="px-8 py-5">
                        <span className={`px-3 py-1 ${statusColor} text-[9px] font-bold rounded-full`}>{statusLabel}</span>
                      </td>
                      <td className="px-8 py-5 text-right text-[#8B95A1] text-[10px]">{att?.notes || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {viewMode === 'monthly' && (
          <div className="bg-white border border-[#E5E8EB] rounded-[2.5rem] overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1200px]">
                <thead className="bg-gray-50 text-[9px] font-bold text-[#8B95A1] border-b border-[#E5E8EB] uppercase">
                  <tr>
                    <th className="px-6 py-4 sticky left-0 bg-gray-50 z-10 border-r">성명</th>
                    {daysArray.map(d => (
                      <th key={d} className="px-3 py-4 text-center border-r min-w-[45px]">{d}</th>
                    ))}
                    <th className="px-6 py-4 text-center bg-[#E8F3FF] text-[#3182F6]">출근일수</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((s: any) => {
                    let workDays = 0;
                    return (
                      <tr key={s.id} className="hover:bg-[#F2F4F6] transition-all">
                        <td className="px-6 py-4 sticky left-0 bg-white z-10 border-r font-bold text-xs text-[#191F28]">{s.name}</td>
                        {daysArray.map((d) => {
                          const dStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
                          const att = attendanceData.find((a: any) => a.staff_id === s.id && a.work_date === dStr);
                          const dayOfWeek = new Date(selectedMonth + '-' + d).getDay();
                          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                          const status = att?.status || (isWeekend ? 'holiday' : '');
                          let label = '';
                          if (status === 'annual_leave' || status === 'sick_leave') label = '휴';
                          else if (status === 'holiday' || isWeekend) label = '휴';
                          else if (status === 'present' || att) { label = '출'; workDays++; }
                          else label = '-';
                          return (
                            <td key={d} className="px-3 py-4 text-center border-r text-[10px] font-bold text-[#8B95A1]">
                              {isWeekend ? <span className="text-red-300">{label}</span> : label}
                            </td>
                          );
                        })}
                        <td className="px-6 py-4 text-center bg-[#E8F3FF]/50 font-bold text-[#3182F6] text-xs">{workDays}일</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {viewMode === 'dashboard' && (
          <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white border border-[#E5E8EB] rounded-2xl p-6 shadow-sm">
                <p className="text-[9px] font-bold text-[#8B95A1] uppercase">출근률</p>
                <p className="text-3xl font-bold text-[#3182F6] mt-1">{stats.rate}%</p>
              </div>
              <div className="bg-white border border-[#E5E8EB] rounded-2xl p-6 shadow-sm">
                <p className="text-[9px] font-bold text-[#8B95A1] uppercase">정상 출근</p>
                <p className="text-3xl font-bold text-green-600 mt-1">{stats.present}건</p>
              </div>
              <div className="bg-white border border-[#E5E8EB] rounded-2xl p-6 shadow-sm">
                <p className="text-[9px] font-bold text-[#8B95A1] uppercase">지각</p>
                <p className="text-3xl font-bold text-orange-600 mt-1">{stats.late}건</p>
              </div>
              <div className="bg-white border border-[#E5E8EB] rounded-2xl p-6 shadow-sm">
                <p className="text-[9px] font-bold text-[#8B95A1] uppercase">조퇴</p>
                <p className="text-3xl font-bold text-amber-600 mt-1">{stats.earlyLeave}건</p>
              </div>
            </div>
            <div className="bg-white border border-[#E5E8EB] rounded-2xl p-8 shadow-sm">
              <h3 className="text-sm font-bold text-[#4E5968] mb-4">상태별 비율</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-[10px] font-bold mb-1"><span>정상</span><span>{stats.total ? Math.round((stats.present / stats.total) * 100) : 0}%</span></div>
                  <div className="h-3 bg-[#F2F4F6] rounded-full overflow-hidden"><div className="h-full bg-green-500 rounded-full" style={{ width: `${stats.total ? (stats.present / stats.total) * 100 : 0}%` }} /></div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] font-bold mb-1"><span>지각</span><span>{stats.total ? Math.round((stats.late / stats.total) * 100) : 0}%</span></div>
                  <div className="h-3 bg-[#F2F4F6] rounded-full overflow-hidden"><div className="h-full bg-orange-500 rounded-full" style={{ width: `${stats.total ? (stats.late / stats.total) * 100 : 0}%` }} /></div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] font-bold mb-1"><span>조퇴</span><span>{stats.total ? Math.round((stats.earlyLeave / stats.total) * 100) : 0}%</span></div>
                  <div className="h-3 bg-[#F2F4F6] rounded-full overflow-hidden"><div className="h-full bg-amber-500 rounded-full" style={{ width: `${stats.total ? (stats.earlyLeave / stats.total) * 100 : 0}%` }} /></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {viewMode === 'calendar' && (
          <div className="bg-white border border-[#E5E8EB] rounded-[2.5rem] p-10 shadow-xl">
            <div className="grid grid-cols-7 gap-4">
              {['일', '월', '화', '수', '목', '금', '토'].map(day => (
                <div key={day} className="text-center text-[10px] font-bold text-[#8B95A1] uppercase pb-4">{day}</div>
              ))}
              {Array.from({ length: 35 }).map((_, i) => {
                const day = i - 1; // 데모용 날짜 오프셋
                return (
                  <div key={i} className={`min-h-[120px] p-4 border border-[#E5E8EB] rounded-2xl transition-all hover:shadow-lg ${day > 0 && day <= 28 ? 'bg-white' : 'bg-gray-50/50 opacity-30'}`}>
                    {day > 0 && day <= 28 && (
                      <>
                        <span className="text-xs font-bold text-[#191F28]">{day}</span>
                        <div className="mt-3 space-y-1">
                          <div className="px-2 py-1 bg-[#E8F3FF] text-[#3182F6] text-[8px] font-bold rounded-lg flex justify-between">
                            <span>출근</span>
                            <span>{filtered.length}명</span>
                          </div>
                          <div className="px-2 py-1 bg-orange-50 text-orange-600 text-[8px] font-bold rounded-lg flex justify-between">
                            <span>연차</span>
                            <span>2명</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
