'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import SmartDatePicker from '../../공통/SmartDatePicker';
import SmartMonthPicker from '../../공통/SmartMonthPicker';

export default function AttendanceMain({ staffs, selectedCo }: any) {
  const [viewMode, setViewMode] = useState<'daily' | 'monthly' | 'calendar' | 'dashboard' | 'schedule'>('monthly');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [workShifts, setWorkShifts] = useState<any[]>([]);
  const [shiftAssignments, setShiftAssignments] = useState<Record<string, string>>({}); // key: `${staff_id}_${work_date}` -> shift_id or ''
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkRangeType, setBulkRangeType] = useState<'day' | 'week' | 'month' | 'custom'>('day');
  const [bulkStartDate, setBulkStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [bulkEndDate, setBulkEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [bulkStatus, setBulkStatus] = useState<string>('present');
  const [bulkSaving, setBulkSaving] = useState(false);

  const filtered = useMemo(
    () => selectedCo === '전체' ? staffs : staffs.filter((s: any) => s.company === selectedCo),
    [selectedCo, staffs]
  );

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

  // 근무표 편성: work_shifts 로드
  useEffect(() => {
    if (viewMode !== 'schedule') return;
    supabase.from('work_shifts').select('id, name, start_time, end_time').eq('is_active', true).then(({ data }) => {
      setWorkShifts(data || []);
    });
  }, [viewMode]);

  // 근무표 편성: 선택 월의 shift_assignments 로드
  useEffect(() => {
    if (viewMode !== 'schedule' || filtered.length === 0) return;
    const [y, m] = selectedMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const start = `${selectedMonth}-01`;
    const end = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;
    supabase
      .from('shift_assignments')
      .select('staff_id, work_date, shift_id')
      .in('staff_id', filtered.map((s: any) => s.id))
      .gte('work_date', start)
      .lte('work_date', end)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        (data || []).forEach((r: any) => {
          map[`${r.staff_id}_${r.work_date}`] = r.shift_id || '';
        });
        setShiftAssignments(map);
      });
  }, [viewMode, selectedMonth, filtered]);

  const setAssignment = (staffId: string, workDate: string, shiftId: string | null) => {
    const key = `${staffId}_${workDate}`;
    setShiftAssignments((prev) => ({ ...prev, [key]: shiftId || '' }));
    const companyName = filtered.find((s: any) => s.id === staffId)?.company;
    supabase
      .from('shift_assignments')
      .upsert(
        { staff_id: staffId, work_date: workDate, shift_id: shiftId || null, company_name: companyName },
        { onConflict: 'staff_id,work_date' }
      )
      .then(() => { });
  };

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

    const atRiskStaff: any[] = [];
    filtered.forEach((s: any) => {
      const myAtts = attendanceData.filter((a: any) => a.staff_id === s.id);
      const lates = myAtts.filter((a: any) => a.status === 'late').length;
      const absents = myAtts.filter((a: any) => a.status === 'absent').length;
      if (lates >= 3 || absents >= 2) {
        atRiskStaff.push({ name: s.name, dept: s.department, lates, absents });
      }
    });

    return { total, present, late, earlyLeave, absent, rate, atRiskStaff };
  }, [attendanceData, filtered]);

  return (
    <div className="flex flex-col h-full bg-[var(--page-bg)] animate-in fade-in duration-500">
      <header className="px-8 pt-8 pb-4 border-b border-[var(--toss-border)] bg-white dark:bg-zinc-900 shrink-0 shadow-sm z-10 sticky top-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div className="flex-1 w-full">
            <div className="flex items-center gap-3 mb-6 block w-full">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-md shrink-0">
                🕒
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  전문 근태 통합 관리 <span className="ml-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold border border-blue-100">{selectedCo}</span>
                </h2>
                <p className="text-[11px] font-medium text-zinc-400 mt-1">임직원 출퇴근 현황, 스케줄 지정, 통계를 한곳에서 관리합니다.</p>
              </div>
            </div>

            <div className="flex items-center gap-1 bg-zinc-100/80 dark:bg-zinc-800/80 p-1 rounded-[14px] w-fit border border-zinc-200/50 dark:border-zinc-700/50 overflow-x-auto custom-scrollbar">
              {[
                { id: 'dashboard', label: '대시보드', icon: '📊' },
                { id: 'daily', label: '일별 현황', icon: '📋' },
                { id: 'monthly', label: '월별 대장', icon: '📅' },
                { id: 'schedule', label: '근무표 편성', icon: '📝' },
                { id: 'calendar', label: '근태 달력', icon: '🗓️' }
              ].map(mode => (
                <button
                  key={mode.id}
                  onClick={() => setViewMode(mode.id as any)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-[10px] text-[11px] font-bold transition-all whitespace-nowrap ${viewMode === mode.id
                    ? 'bg-white dark:bg-zinc-700 text-foreground shadow-sm ring-1 ring-zinc-900/5 dark:ring-white/10'
                    : 'text-zinc-500 hover:text-foreground hover:bg-white/50 dark:hover:bg-zinc-700/50'
                    }`}
                >
                  <span className="text-sm">{mode.icon}</span>
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 hide-scrollbar">
            <button
              type="button"
              onClick={() => setBulkEditOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-[12px] text-[11px] font-bold bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 shadow-sm hover:border-blue-400 hover:text-blue-600 transition-colors whitespace-nowrap focus:outline-none"
            >
              <span className="text-sm">⚡</span> 상태 일괄 수정
            </button>

            <div className="flex items-center bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-[12px] p-1 shadow-sm shrink-0 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all">
              {viewMode === 'daily' ? (
                <>
                  <div className="px-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg py-1.5 border border-zinc-100 dark:border-zinc-800 text-[10px] font-bold text-zinc-400">DATE</div>
                  <SmartDatePicker
                    value={selectedDate}
                    onChange={(val) => setSelectedDate(val)}
                    className="bg-transparent px-3 py-1.5 text-xs font-bold text-foreground outline-none w-32 cursor-pointer"
                  />
                </>
              ) : (
                <>
                  <div className="px-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg py-1.5 border border-zinc-100 dark:border-zinc-800 text-[10px] font-bold text-zinc-400">MONTH</div>
                  <SmartMonthPicker
                    value={selectedMonth}
                    onChange={(val) => setSelectedMonth(val)}
                    className="bg-transparent px-3 py-1.5 text-xs font-bold text-foreground outline-none w-32 cursor-pointer"
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 p-8 overflow-auto custom-scrollbar bg-[var(--toss-gray-1)]/20">
        {viewMode === 'daily' && (
          <div className="max-w-6xl mx-auto space-y-4">
            <h3 className="text-lg font-bold text-foreground mb-4">일별 출퇴근 현황 <span className="text-zinc-500 text-sm font-medium ml-2">{selectedDate}</span></h3>
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="px-6 py-4 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">직원 정보</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">상태</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">출퇴근 시간</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">근무 시간</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">비고</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {filtered.map((s: any) => {
                      const att = attendanceData.find((a: any) => a.staff_id === s.id && a.work_date === selectedDate);
                      const checkIn = att?.check_in_time ? new Date(att.check_in_time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-';
                      const checkOut = att?.check_out_time ? new Date(att.check_out_time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-';
                      const mins = att?.work_hours_minutes ?? 0;
                      const workHrs = mins ? `${Math.floor(mins / 60)}h ${mins % 60}m` : '-';

                      const statusMap: Record<string, { label: string, color: string, bg: string }> = {
                        present: { label: '정상 출근', color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30 ring-emerald-200' },
                        absent: { label: '결근', color: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/30 ring-rose-200' },
                        late: { label: '지각', color: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/30 ring-orange-200' },
                        early_leave: { label: '조퇴', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30 ring-amber-200' },
                        sick_leave: { label: '병가', color: 'text-purple-700 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/30 ring-purple-200' },
                        annual_leave: { label: '연차', color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30 ring-blue-200' },
                        holiday: { label: '휴일', color: 'text-zinc-600 dark:text-zinc-400', bg: 'bg-zinc-100 dark:bg-zinc-800 ring-zinc-200' },
                        half_leave: { label: '반차', color: 'text-cyan-700 dark:text-cyan-400', bg: 'bg-cyan-50 dark:bg-cyan-900/30 ring-cyan-200' }
                      };

                      const statusObj = statusMap[att?.status || 'present'] || statusMap.present;

                      return (
                        <tr key={s.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors group cursor-default">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 font-bold text-xs ring-1 ring-zinc-200 dark:ring-zinc-700">
                                {s.name[0]}
                              </div>
                              <div className="flex flex-col">
                                <span className="font-bold text-sm text-foreground">{s.name}</span>
                                <span className="text-[11px] text-zinc-500 font-medium mt-0.5">{s.department} · {s.position}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold ring-1 ring-inset ${statusObj.color} ${statusObj.bg}`}>
                              <span className={`w-1 h-1 rounded-full mr-1.5 ${statusObj.bg.replace('ring-', 'bg-').split(' ')[0]}`} style={{ filter: 'brightness(0.8)' }}></span>
                              {statusObj.label}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-zinc-400 uppercase w-4">IN</span>
                                <span className="font-mono font-bold text-sm text-foreground">{checkIn}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-zinc-400 uppercase w-4">OUT</span>
                                <span className="font-mono font-bold text-sm text-zinc-500">{checkOut}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-mono font-bold text-blue-600 dark:text-blue-500 text-sm">
                            {workHrs}
                          </td>
                          <td className="px-6 py-4 text-xs font-medium text-zinc-500">
                            {att?.notes || <span className="opacity-30">-</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {viewMode === 'schedule' && (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm flex flex-col h-[calc(100vh-200px)]">
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col gap-5 shrink-0">
              <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <span className="text-xl">✨</span> 스마트 근무 편성
                  </h3>
                  <p className="text-[11px] text-zinc-500 font-medium mt-1">
                    근무 툴을 선택하고 표의 빈칸을 클릭/드래그하여 스마트하게 듀티를 채워보세요. 게시판-경조사 탭의 금일 근무 현황과 실시간 연동됩니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const standardShift = workShifts.find(sh => sh.name.includes('통상') || sh.name.includes('일반') || sh.name.includes('주간') || sh.name.includes('9to6'));
                    if (!standardShift) {
                      alert('통상/일반/주간 이라는 이름이 포함된 근무형태가 부재합니다.');
                      return;
                    }
                    if (!confirm('현재 화면의 모든 직원에 대해 평일(월~금)을 모두 통상근무로 채우시겠습니까? (기존 데이터에 덮어씁니다)')) return;
                    filtered.forEach((s: any) => {
                      daysArray.forEach((d) => {
                        const dStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
                        const dayOfWeek = new Date(dStr).getDay();
                        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                          setAssignment(s.id, dStr, standardShift.id);
                        }
                      });
                    });
                  }}
                  className="px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50 font-bold text-[11px] rounded-xl shadow-sm hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all self-start md:self-auto shrink-0 flex items-center gap-2"
                >
                  <span className="text-sm">🏢</span> 통상근무(평일) 일괄 채우기
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-zinc-800 p-2 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-sm w-fit">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mx-3">Toolbox</span>
                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mr-2"></div>
                {workShifts.map((sh: any) => {
                  const isActive = activeTool === sh.id;
                  let colorClass = 'bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800';
                  if (sh.name.includes('Day') || sh.name.includes('데이') || sh.name === 'D') colorClass = 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/40';
                  if (sh.name.includes('Evening') || sh.name.includes('이브') || sh.name === 'E') colorClass = 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800/50 hover:bg-orange-100 dark:hover:bg-orange-900/40';
                  if (sh.name.includes('Night') || sh.name.includes('나이트') || sh.name === 'N') colorClass = 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/50 hover:bg-blue-100 dark:hover:bg-blue-900/40';
                  if (sh.name.includes('Off') || sh.name.includes('오프') || sh.name === 'O') colorClass = 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/50 hover:bg-rose-100 dark:hover:bg-rose-900/40';

                  return (
                    <button
                      key={sh.id}
                      onClick={() => setActiveTool(isActive ? null : sh.id)}
                      className={`px-4 py-2 rounded-[10px] text-[11px] font-bold transition-all border ${isActive ? 'ring-2 ring-offset-2 ring-blue-500 scale-105 shadow-md ' + colorClass : colorClass}`}
                    >
                      {sh.name}
                    </button>
                  );
                })}
                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1"></div>
                <button
                  type="button"
                  onClick={() => setActiveTool(activeTool === 'eraser' ? null : 'eraser')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-[11px] font-bold transition-all border ${activeTool === 'eraser' ? 'bg-red-500 border-red-500 text-white ring-2 ring-offset-2 ring-red-500 scale-105 shadow-md' : 'bg-white dark:bg-zinc-800 text-red-500 border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-900/20'}`}
                >
                  <span className="text-sm">🧹</span> 지우개
                </button>
              </div>
            </div>

            <div className="overflow-x-auto flex-1 custom-scrollbar pb-4 relative">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead className="bg-zinc-50 dark:bg-zinc-900/80 text-[11px] font-bold text-zinc-500 uppercase tracking-wider sticky top-0 z-20 shadow-sm border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th className="px-6 py-4 sticky left-0 bg-zinc-50 dark:bg-zinc-900 z-30 border-r border-zinc-200 dark:border-zinc-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">직원명</th>
                    {daysArray.map((d) => {
                      const dStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
                      const dayOfWeek = new Date(dStr).getDay();
                      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                      return (
                        <th key={d} className={`px-2 py-4 text-center border-r border-zinc-200 dark:border-zinc-800 min-w-[44px] ${isWeekend ? 'text-red-400 dark:text-red-500' : ''}`}>
                          <div className="flex flex-col items-center">
                            <span>{d}</span>
                            <span className="text-[9px] font-medium opacity-60 mt-0.5">{['일', '월', '화', '수', '목', '금', '토'][dayOfWeek]}</span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filtered.map((s: any) => (
                    <tr key={s.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 group">
                      <td className="px-6 py-3 sticky left-0 bg-white dark:bg-zinc-900 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-800/80 z-10 border-r border-zinc-200 dark:border-zinc-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] transition-colors">
                        <div className="flex flex-col">
                          <span className="font-bold text-sm text-foreground whitespace-nowrap">{s.name}</span>
                          <span className="text-[10px] text-zinc-500 font-medium">{s.department}</span>
                        </div>
                      </td>
                      {daysArray.map((d) => {
                        const dStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
                        const key = `${s.id}_${dStr}`;
                        const value = shiftAssignments[key] ?? '';
                        const shiftObj = workShifts.find(w => w.id === value);
                        const isWeekend = new Date(dStr).getDay() === 0 || new Date(dStr).getDay() === 6;

                        let cellColor = isWeekend ? 'bg-red-50/30 dark:bg-red-900/5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50';
                        if (shiftObj) {
                          if (shiftObj.name.includes('Day') || shiftObj.name.includes('데이') || shiftObj.name === 'D') cellColor = 'bg-emerald-100/50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-bold';
                          else if (shiftObj.name.includes('Evening') || shiftObj.name.includes('이브') || shiftObj.name === 'E') cellColor = 'bg-orange-100/50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 font-bold';
                          else if (shiftObj.name.includes('Night') || shiftObj.name.includes('나이트') || shiftObj.name === 'N') cellColor = 'bg-blue-100/50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-bold';
                          else if (shiftObj.name.includes('Off') || shiftObj.name.includes('오프') || shiftObj.name === 'O') cellColor = 'bg-rose-100/50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 font-bold';
                          else cellColor = 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-bold';
                        }
                        return (
                          <td
                            key={d}
                            className={`p-1 border-r border-zinc-200 dark:border-zinc-800 min-w-[44px] cursor-pointer select-none transition-colors border-b-0 border-t-0 active:bg-blue-50 dark:active:bg-blue-900/20 active:ring-inset active:ring-2 active:ring-blue-400 ${cellColor}`}
                            onMouseDown={() => {
                              if (activeTool === 'eraser') setAssignment(s.id, dStr, null);
                              else if (activeTool) setAssignment(s.id, dStr, activeTool);
                            }}
                            onMouseEnter={(e) => {
                              if (e.buttons === 1) { // 1 is left click drag
                                if (activeTool === 'eraser') setAssignment(s.id, dStr, null);
                                else if (activeTool) setAssignment(s.id, dStr, activeTool);
                              }
                            }}
                          >
                            <div className="w-full h-8 flex items-center justify-center text-[11px] rounded transition-all">
                              {shiftObj ? (shiftObj.name.replace('근무', '').slice(0, 3)) : <span className="opacity-0 group-hover:opacity-20 text-[9px] text-zinc-400 font-black">+</span>}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {viewMode === 'monthly' && (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead className="bg-zinc-50 dark:bg-zinc-900/80 border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4 sticky left-0 bg-zinc-50 dark:bg-zinc-900/90 z-10 border-r border-zinc-200 dark:border-zinc-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">직원명</th>
                    {daysArray.map((d) => {
                      const dStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
                      const dayOfWeek = new Date(dStr).getDay();
                      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                      return (
                        <th
                          key={d}
                          className={`px-2 py-4 text-center border-r border-zinc-200 dark:border-zinc-800 min-w-[44px] ${isWeekend ? 'text-red-400 dark:text-red-500' : ''}`}
                        >
                          <div className="flex flex-col items-center">
                            <span>{d}</span>
                            <span className="text-[9px] font-medium opacity-60 mt-0.5">{['일', '월', '화', '수', '목', '금', '토'][dayOfWeek]}</span>
                          </div>
                        </th>
                      );
                    })}
                    <th className="px-6 py-4 text-center text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10">출근</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filtered.map((s: any) => {
                    let workDays = 0;
                    return (
                      <tr key={s.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors group">
                        <td className="px-6 py-3 sticky left-0 bg-white dark:bg-zinc-900 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-800/80 z-10 border-r border-zinc-200 dark:border-zinc-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] transition-colors">
                          <div className="flex flex-col">
                            <span className="font-bold text-sm text-foreground whitespace-nowrap">{s.name}</span>
                            <span className="text-[10px] text-zinc-500 font-medium">{s.department}</span>
                          </div>
                        </td>
                        {daysArray.map((d) => {
                          const dStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
                          const att = attendanceData.find((a: any) => a.staff_id === s.id && a.work_date === dStr);
                          const dayOfWeek = new Date(dStr).getDay();
                          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                          const status = att?.status || (isWeekend ? 'holiday' : '');

                          let label = '';
                          let cellClass = 'text-zinc-300 dark:text-zinc-600';

                          if (status === 'annual_leave' || status === 'sick_leave') {
                            label = status === 'annual_leave' ? '연' : '병';
                            cellClass = 'text-blue-600 bg-blue-50 dark:bg-blue-900/20';
                          } else if (status === 'holiday' || isWeekend) {
                            label = '휴';
                            cellClass = 'text-red-400 bg-red-50/50 dark:bg-red-900/10';
                          } else if (status === 'present' || att) {
                            label = '출';
                            cellClass = 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20';
                            workDays++;
                          } else if (status === 'late' || status === 'early_leave') {
                            label = status === 'late' ? '지' : '조';
                            cellClass = 'text-orange-600 bg-orange-50 dark:bg-orange-900/20';
                            workDays++;
                          } else if (status === 'absent') {
                            label = '결';
                            cellClass = 'text-rose-600 bg-rose-50 dark:bg-rose-900/20';
                          } else {
                            label = '-';
                          }

                          return (
                            <td
                              key={d}
                              className="p-1 border-r border-zinc-200 dark:border-zinc-800 text-center align-middle"
                            >
                              <div className={`w-8 h-8 mx-auto flex items-center justify-center rounded-lg text-[11px] font-bold ${cellClass}`}>
                                {label}
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-6 py-3 text-center bg-blue-50/30 dark:bg-blue-900/10 font-bold text-blue-600 dark:text-blue-400 text-sm">
                          {workDays}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {viewMode === 'dashboard' && (
          <div className="space-y-6 max-w-6xl mx-auto">
            {/* AI Attendance Alert Widget */}
            {stats.atRiskStaff && stats.atRiskStaff.length > 0 && (
              <div className="bg-rose-50 border border-rose-200 rounded-3xl p-6 shadow-sm flex items-start gap-4">
                <div className="text-4xl">🚨</div>
                <div className="flex-1">
                  <h4 className="text-sm font-black text-rose-800 flex items-center gap-2">
                    AI 근태 경고 알림 (Attendance Alert)
                    <span className="px-2 py-0.5 bg-rose-200 text-rose-700 rounded-full text-[10px] animate-pulse">주의 요망</span>
                  </h4>
                  <p className="text-xs text-rose-600 mt-1 font-medium pb-4 border-b border-rose-200/50 mb-4">
                    누적 지각(3회 이상) 또는 결근(2회 이상)이 발생하여 즉시 면담이 필요한 직원이 발견되었습니다.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {stats.atRiskStaff.map((risk: any, idx: number) => (
                      <div key={idx} className="bg-white border border-rose-200 px-3 py-2 rounded-xl text-xs flex items-center gap-3">
                        <span className="font-bold text-slate-800">{risk.name} <span className="text-[10px] text-slate-400 font-medium">({risk.dept})</span></span>
                        <div className="flex gap-2">
                          {risk.lates > 0 && <span className="text-orange-600 font-bold">지각 {risk.lates}회</span>}
                          {risk.absents > 0 && <span className="text-rose-600 font-bold">결근 {risk.absents}회</span>}
                        </div>
                        <button className="ml-2 px-2 py-1 bg-rose-500 text-white text-[10px] rounded hover:bg-rose-600 font-bold">
                          면담 요청
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <h3 className="text-lg font-bold text-foreground mb-4 mt-8">근태 요약 <span className="text-zinc-500 text-sm font-medium ml-2">{selectedMonth} 기준</span></h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 md:p-8 shadow-sm relative overflow-hidden group hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
                <div className="absolute top-0 right-0 p-6 text-4xl opacity-10 group-hover:scale-110 transition-transform">🎯</div>
                <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2">출근율</p>
                <div className="flex items-end gap-2">
                  <p className="text-4xl md:text-5xl font-black text-blue-600 dark:text-blue-500">{stats.rate}</p>
                  <span className="text-xl font-bold text-blue-600/50 mb-1">%</span>
                </div>
              </div>

              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 md:p-8 shadow-sm relative overflow-hidden group hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
                <div className="absolute top-0 right-0 p-6 text-4xl opacity-10 group-hover:scale-110 transition-transform">✅</div>
                <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2">정상 출근</p>
                <div className="flex items-end gap-2">
                  <p className="text-4xl md:text-5xl font-black text-emerald-600 dark:text-emerald-500">{stats.present}</p>
                  <span className="text-xl font-bold text-emerald-600/50 mb-1">건</span>
                </div>
              </div>

              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 md:p-8 shadow-sm relative overflow-hidden group hover:border-orange-300 dark:hover:border-orange-700 transition-colors">
                <div className="absolute top-0 right-0 p-6 text-4xl opacity-10 group-hover:scale-110 transition-transform">⏰</div>
                <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2">지각</p>
                <div className="flex items-end gap-2">
                  <p className="text-4xl md:text-5xl font-black text-orange-500">{stats.late}</p>
                  <span className="text-xl font-bold text-orange-500/50 mb-1">건</span>
                </div>
              </div>

              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 md:p-8 shadow-sm relative overflow-hidden group hover:border-rose-300 dark:hover:border-rose-700 transition-colors">
                <div className="absolute top-0 right-0 p-6 text-4xl opacity-10 group-hover:scale-110 transition-transform">🏃‍♂️</div>
                <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2">조퇴 / 결근</p>
                <div className="flex items-end gap-2">
                  <p className="text-4xl md:text-5xl font-black text-rose-500">{stats.earlyLeave + stats.absent}</p>
                  <span className="text-xl font-bold text-rose-500/50 mb-1">건</span>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-base font-bold text-foreground">근무 상태 지표</h3>
                <span className="text-xs font-bold text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded-full">총 {stats.total}건</span>
              </div>
              <div className="space-y-6">
                {[
                  { label: '정상 출근', count: stats.present, color: 'bg-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
                  { label: '지각', count: stats.late, color: 'bg-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20' },
                  { label: '조퇴', count: stats.earlyLeave, color: 'bg-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
                  { label: '결근', count: stats.absent, color: 'bg-rose-500', bg: 'bg-rose-50 dark:bg-rose-900/20' }
                ].map(stat => {
                  const percent = stats.total ? Math.round((stat.count / stats.total) * 100) : 0;
                  return (
                    <div key={stat.label} className="group cursor-default">
                      <div className="flex justify-between items-end mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${stat.color}`}></span>
                          <span className="text-sm font-bold text-zinc-600 dark:text-zinc-300">{stat.label}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-zinc-400">{stat.count}건</span>
                          <span className="text-lg font-black text-foreground w-12 text-right">{percent}%</span>
                        </div>
                      </div>
                      <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden relative">
                        <div
                          className={`h-full ${stat.color} transition-all duration-1000 ease-out`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 출퇴근 상태 일괄 수정 모달 */}
        {bulkEditOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl max-w-md w-full p-8 space-y-6 transform transition-all">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                  <span className="text-2xl">⚡</span> 상태 일괄 수정
                </h3>
                <button onClick={() => setBulkEditOpen(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="space-y-5">
                <div>
                  <p className="text-[11px] font-bold text-zinc-500 uppercase flex items-center gap-1.5 mb-2"><span className="text-sm">🗓️</span> 적용 기간</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'day', label: '하루 단위' },
                      { id: 'week', label: '주 단위 (7일)' },
                      { id: 'month', label: '월 단위' },
                      { id: 'custom', label: '직접 선택' }
                    ].map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setBulkRangeType(o.id as any)}
                        className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all border ${bulkRangeType === o.id ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 ring-1 ring-blue-500' : 'bg-transparent text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                          }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <p className="text-[11px] font-bold text-zinc-500 uppercase mb-1.5 ml-1">시작일</p>
                    <SmartDatePicker
                      value={bulkStartDate}
                      onChange={(val) => {
                        setBulkStartDate(val);
                        if (bulkRangeType === 'week') {
                          const d = new Date(val);
                          d.setDate(d.getDate() + 6);
                          setBulkEndDate(d.toISOString().slice(0, 10));
                        }
                      }}
                      className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 px-4 py-3 rounded-xl text-sm font-bold text-foreground outline-none transition-shadow"
                    />
                  </div>
                  {(bulkRangeType === 'custom' || bulkRangeType === 'week') && (
                    <div className="flex-1">
                      <p className="text-[11px] font-bold text-zinc-500 uppercase mb-1.5 ml-1">종료일</p>
                      <SmartDatePicker
                        value={bulkEndDate}
                        onChange={(val) => setBulkEndDate(val)}
                        className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 px-4 py-3 rounded-xl text-sm font-bold text-foreground outline-none transition-shadow"
                      />
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <p className="text-[11px] font-bold text-zinc-500 uppercase flex items-center gap-1.5 mb-2"><span className="text-sm">📌</span> 변경할 상태</p>
                  <select
                    value={bulkStatus}
                    onChange={(e) => setBulkStatus(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none cursor-pointer transition-shadow"
                  >
                    <option value="present">🟢 정상 출근</option>
                    <option value="late">🟠 지각</option>
                    <option value="early_leave">🟡 조퇴</option>
                    <option value="half_leave">🔵 반차</option>
                    <option value="absent">🔴 결근</option>
                    <option value="annual_leave">🟣 연차</option>
                    <option value="sick_leave">🩺 병가</option>
                    <option value="holiday">⚪ 휴일</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setBulkEditOpen(false)}
                  className="px-6 py-3 rounded-xl text-sm font-bold border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 focus:outline-none transition-colors"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    let start = bulkStartDate;
                    let end = bulkStartDate;
                    if (bulkRangeType === 'week') {
                      const d = new Date(bulkStartDate);
                      d.setDate(d.getDate() + 6);
                      end = d.toISOString().slice(0, 10);
                    } else if (bulkRangeType === 'month') {
                      const [y, m] = bulkStartDate.split('-').map(Number);
                      end = `${y}-${String(m).padStart(2, '0')}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
                      start = `${y}-${String(m).padStart(2, '0')}-01`;
                    } else if (bulkRangeType === 'custom') {
                      start = bulkStartDate <= bulkEndDate ? bulkStartDate : bulkEndDate;
                      end = bulkStartDate <= bulkEndDate ? bulkEndDate : bulkStartDate;
                    }
                    setBulkSaving(true);
                    try {
                      const staffIds = filtered.map((s: any) => s.id);
                      const dates: string[] = [];
                      const cur = new Date(start);
                      const endD = new Date(end);
                      while (cur <= endD) {
                        dates.push(cur.toISOString().slice(0, 10));
                        cur.setDate(cur.getDate() + 1);
                      }
                      const rows = staffIds.flatMap((staffId: string) =>
                        dates.map((work_date) => ({
                          staff_id: staffId,
                          work_date,
                          status: bulkStatus,
                        }))
                      );
                      for (const row of rows) {
                        await supabase.from('attendances').upsert(row, { onConflict: 'staff_id,work_date' });
                      }
                      alert(`적용 완료: ${dates.length}일 × ${staffIds.length}명 = ${rows.length}건을 "${bulkStatus === 'present' ? '정상' : bulkStatus}"으로 수정했습니다.`);
                      setBulkEditOpen(false);
                      fetchAttendance();
                    } catch (e) {
                      console.error(e);
                      alert('일괄 수정 중 오류가 발생했습니다.');
                    } finally {
                      setBulkSaving(false);
                    }
                  }}
                  disabled={bulkSaving}
                  className="px-6 py-3 rounded-xl text-sm font-bold bg-blue-600 text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 transition-all flex items-center justify-center min-w-[120px]"
                >
                  {bulkSaving ? (
                    <span className="flex items-center gap-2"><svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> 처리 중...</span>
                  ) : '적용하기'}
                </button>
              </div>
            </div>
          </div>
        )}

        {viewMode === 'calendar' && (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm">
            <div className="grid grid-cols-7 gap-4">
              {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
                <div key={day} className={`text-center text-[12px] font-bold uppercase pb-3 mb-2 border-b border-zinc-100 dark:border-zinc-800 ${idx === 0 ? 'text-rose-500' : idx === 6 ? 'text-blue-500' : 'text-zinc-500'}`}>{day}</div>
              ))}
              {Array.from({ length: 35 }).map((_, i) => {
                const day = i - 1; // 데모용 날짜 오프셋
                const isCurrentMonth = day > 0 && day <= 28;
                const isSunday = i % 7 === 0;

                return (
                  <div key={i} className={`min-h-[130px] p-3 border rounded-2xl transition-all ${isCurrentMonth ? 'bg-white dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 cursor-pointer' : 'bg-zinc-50/50 dark:bg-zinc-900/30 border-transparent opacity-40'}`}>
                    {isCurrentMonth && (
                      <div className="flex flex-col h-full">
                        <span className={`text-sm font-bold flex justify-between items-center ${isSunday ? 'text-rose-500' : 'text-foreground'}`}>
                          {day}
                          {day === 14 && <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>}
                        </span>

                        <div className="mt-auto space-y-1.5">
                          <div className="px-2 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-[9px] font-bold rounded-lg flex justify-between items-center group">
                            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> 정상</span>
                            <span className="bg-emerald-200 dark:bg-emerald-800 px-1.5 rounded-md text-emerald-800 dark:text-emerald-200">{filtered.length}</span>
                          </div>
                          {(day % 3 === 0) && (
                            <div className="px-2 py-1.5 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 text-[9px] font-bold rounded-lg flex justify-between items-center">
                              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> 결/연</span>
                              <span className="bg-rose-200 dark:bg-rose-800 px-1.5 rounded-md text-rose-800 dark:text-rose-200">{day % 4 + 1}</span>
                            </div>
                          )}
                        </div>
                      </div>
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
