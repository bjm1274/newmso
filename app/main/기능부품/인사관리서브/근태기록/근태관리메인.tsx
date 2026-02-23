'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

export default function AttendanceMain({ staffs, selectedCo }: any) {
  const [viewMode, setViewMode] = useState<'daily' | 'monthly' | 'calendar' | 'dashboard' | 'schedule'>('monthly');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [workShifts, setWorkShifts] = useState<any[]>([]);
  const [shiftAssignments, setShiftAssignments] = useState<Record<string, string>>({}); // key: `${staff_id}_${work_date}` -> shift_id or ''
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkRangeType, setBulkRangeType] = useState<'day' | 'week' | 'month' | 'custom'>('day');
  const [bulkStartDate, setBulkStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [bulkEndDate, setBulkEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [bulkStatus, setBulkStatus] = useState<string>('present');
  const [bulkSaving, setBulkSaving] = useState(false);

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
      .then(() => {});
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
    return { total, present, late, earlyLeave, absent, rate };
  }, [attendanceData]);

  return (
    <div className="flex flex-col h-full bg-[var(--page-bg)] animate-in fade-in duration-500">
      <header className="p-8 border-b border-[var(--toss-border)] bg-[var(--toss-card)] shrink-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div>
            <h2 className="text-2xl font-bold text-[var(--foreground)] tracking-tighter italic">
              전문 근태 통합 관리 <span className="text-sm text-[var(--toss-blue)] ml-2">[{selectedCo}]</span>
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-4">
              {[
                { id: 'daily', label: '일별 현황' },
                { id: 'monthly', label: '월별 대장' },
                { id: 'schedule', label: '근무표 편성' },
                { id: 'calendar', label: '근태 달력' },
                { id: 'dashboard', label: '대시보드' }
              ].map(mode => (
                <button 
                  key={mode.id}
                  onClick={() => setViewMode(mode.id as any)}
                  className={`px-6 py-2.5 rounded-[12px] text-[11px] font-bold transition-all ${
                    viewMode === mode.id 
                      ? 'bg-[var(--toss-blue)] text-white shadow-sm' 
                      : 'bg-[var(--toss-card)] text-[var(--toss-gray-3)] border border-[var(--toss-border)] hover:bg-[var(--toss-gray-1)]'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setBulkEditOpen(true)}
                className="px-4 py-2 rounded-[12px] text-[11px] font-bold border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-all"
              >
                출퇴근 상태 일괄 수정
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-[var(--toss-gray-1)] p-3 rounded-[16px] border border-[var(--toss-border)]">
            {viewMode === 'daily' ? (
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">Date</span>
                <input 
                  type="date" 
                  value={selectedDate} 
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-[var(--toss-card)] border border-[var(--toss-border)] px-4 py-2 rounded-[12px] text-xs font-bold outline-none focus:ring-2 focus:ring-[var(--toss-blue)]"
                />
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">{viewMode === 'schedule' ? '편성 월' : 'Month'}</span>
                <input 
                  type="month" 
                  value={selectedMonth} 
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-[var(--toss-card)] border border-[var(--toss-border)] px-4 py-2 rounded-[12px] text-xs font-bold outline-none focus:ring-2 focus:ring-[var(--toss-blue)]"
                />
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 p-8 overflow-auto custom-scrollbar bg-[var(--toss-gray-1)]/20">
        {viewMode === 'daily' && (
          <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[2.5rem] overflow-hidden shadow-xl">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[var(--toss-gray-1)] text-[11px] font-bold text-[var(--toss-gray-3)] border-b border-[var(--toss-border)] uppercase">
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
                    <tr key={s.id} className="hover:bg-[var(--toss-blue-light)]/50 transition-all group">
                      <td className="px-8 py-5">
                        <div className="flex flex-col">
                          <span className="font-bold text-[var(--foreground)]">{s.name}</span>
                          <span className="text-[11px] text-[var(--toss-gray-3)] font-bold uppercase">{s.department} / {s.position}</span>
                        </div>
                      </td>
                      <td className="px-8 py-5 font-mono font-bold text-[var(--toss-blue)]">{checkIn}</td>
                      <td className="px-8 py-5 font-mono font-bold text-[var(--toss-gray-3)]">{checkOut}</td>
                      <td className="px-8 py-5 font-bold text-[var(--toss-gray-4)]">{workHrs}</td>
                      <td className="px-8 py-5">
                        <span className={`px-3 py-1 ${statusColor} text-[11px] font-bold rounded-full`}>{statusLabel}</span>
                      </td>
                      <td className="px-8 py-5 text-right text-[var(--toss-gray-3)] text-[11px]">{att?.notes || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {viewMode === 'schedule' && (
          <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[2.5rem] overflow-hidden shadow-xl">
            <p className="p-4 text-[11px] text-[var(--toss-gray-3)] border-b border-[var(--toss-border)]">
              해당 월의 날짜별 근무형태를 지정하면 게시판 경조사에서 오늘 근무형태별 근무 현황으로 실시간 열람됩니다.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead className="bg-[var(--toss-gray-1)] text-[11px] font-bold text-[var(--toss-gray-3)] border-b border-[var(--toss-border)] uppercase">
                  <tr>
                    <th className="px-4 py-3 sticky left-0 bg-[var(--toss-gray-1)] z-10 border-r">성명</th>
                    {daysArray.map((d) => {
                      const dStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
                      const dayOfWeek = new Date(dStr).getDay();
                      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                      return (
                        <th key={d} className={`px-2 py-3 text-center border-r min-w-[100px] ${isWeekend ? 'text-red-400' : ''}`}>
                          {d}일
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((s: any) => (
                    <tr key={s.id} className="hover:bg-[var(--toss-gray-1)]/50">
                      <td className="px-4 py-2 sticky left-0 bg-[var(--toss-card)] z-10 border-r font-bold text-xs text-[var(--foreground)]">{s.name}</td>
                      {daysArray.map((d) => {
                        const dStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
                        const key = `${s.id}_${dStr}`;
                        const value = shiftAssignments[key] ?? '';
                        return (
                          <td key={d} className="px-2 py-1 border-r">
                            <select
                              value={value}
                              onChange={(e) => setAssignment(s.id, dStr, e.target.value || null)}
                              className="w-full text-[10px] font-bold border border-[var(--toss-border)] rounded px-1 py-1 bg-[var(--toss-card)] outline-none"
                            >
                              <option value="">미지정</option>
                              {workShifts.map((sh: any) => (
                                <option key={sh.id} value={sh.id}>
                                  {sh.name}
                                </option>
                              ))}
                            </select>
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
          <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[2.5rem] overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead className="bg-[var(--toss-gray-1)] text-[11px] font-bold text-[var(--toss-gray-3)] border-b border-[var(--toss-border)] uppercase">
                  <tr>
                    <th className="px-4 py-3 sticky left-0 bg-[var(--toss-gray-1)] z-10 border-r">성명</th>
                    {daysArray.map((d) => {
                      const dStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
                      const dayOfWeek = new Date(dStr).getDay();
                      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                      return (
                        <th
                          key={d}
                          className={`px-2 py-3 text-center border-r min-w-[100px] ${isWeekend ? 'text-red-400' : ''}`}
                        >
                          {d}일
                        </th>
                      );
                    })}
                    <th className="px-6 py-3 text-center bg-[var(--toss-blue-light)] text-[var(--toss-blue)]">출근일수</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((s: any) => {
                    let workDays = 0;
                    return (
                      <tr key={s.id} className="hover:bg-[var(--toss-gray-1)]/50 transition-all">
                        <td className="px-4 py-2 sticky left-0 bg-[var(--toss-card)] z-10 border-r font-bold text-xs text-[var(--foreground)]">
                          {s.name}
                        </td>
                        {daysArray.map((d) => {
                          const dStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
                          const att = attendanceData.find((a: any) => a.staff_id === s.id && a.work_date === dStr);
                          const dayOfWeek = new Date(dStr).getDay();
                          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                          const status = att?.status || (isWeekend ? 'holiday' : '');
                          let label = '';
                          if (status === 'annual_leave' || status === 'sick_leave') label = '휴';
                          else if (status === 'holiday' || isWeekend) label = '휴';
                          else if (status === 'present' || att) {
                            label = '출';
                            workDays++;
                          } else label = '-';
                          return (
                            <td
                              key={d}
                              className="px-2 py-2 text-center border-r text-[11px] font-bold text-[var(--toss-gray-3)]"
                            >
                              {isWeekend ? <span className="text-red-300">{label}</span> : label}
                            </td>
                          );
                        })}
                        <td className="px-6 py-3 text-center bg-[var(--toss-blue-light)]/50 font-bold text-[var(--toss-blue)] text-xs">
                          {workDays}일
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
          <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[12px] p-6 shadow-sm">
                <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">출근률</p>
                <p className="text-3xl font-bold text-[var(--toss-blue)] mt-1">{stats.rate}%</p>
              </div>
              <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[12px] p-6 shadow-sm">
                <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">정상 출근</p>
                <p className="text-3xl font-bold text-green-600 mt-1">{stats.present}건</p>
              </div>
              <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[12px] p-6 shadow-sm">
                <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">지각</p>
                <p className="text-3xl font-bold text-orange-600 mt-1">{stats.late}건</p>
              </div>
              <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[12px] p-6 shadow-sm">
                <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">조퇴</p>
                <p className="text-3xl font-bold text-amber-600 mt-1">{stats.earlyLeave}건</p>
              </div>
            </div>
            <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[12px] p-8 shadow-sm">
              <h3 className="text-sm font-bold text-[var(--toss-gray-4)] mb-4">상태별 비율</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-[11px] font-bold mb-1"><span>정상</span><span>{stats.total ? Math.round((stats.present / stats.total) * 100) : 0}%</span></div>
                  <div className="h-3 bg-[var(--toss-gray-1)] rounded-full overflow-hidden"><div className="h-full bg-green-500 rounded-full" style={{ width: `${stats.total ? (stats.present / stats.total) * 100 : 0}%` }} /></div>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] font-bold mb-1"><span>지각</span><span>{stats.total ? Math.round((stats.late / stats.total) * 100) : 0}%</span></div>
                  <div className="h-3 bg-[var(--toss-gray-1)] rounded-full overflow-hidden"><div className="h-full bg-orange-500 rounded-full" style={{ width: `${stats.total ? (stats.late / stats.total) * 100 : 0}%` }} /></div>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] font-bold mb-1"><span>조퇴</span><span>{stats.total ? Math.round((stats.earlyLeave / stats.total) * 100) : 0}%</span></div>
                  <div className="h-3 bg-[var(--toss-gray-1)] rounded-full overflow-hidden"><div className="h-full bg-amber-500 rounded-full" style={{ width: `${stats.total ? (stats.earlyLeave / stats.total) * 100 : 0}%` }} /></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 출퇴근 상태 일괄 수정 모달 */}
        {bulkEditOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
            <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[24px] shadow-2xl max-w-md w-full p-6 space-y-4">
              <h3 className="text-lg font-bold text-[var(--foreground)]">출퇴근 상태 일괄 수정</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase mb-1">기간 유형</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: 'day', label: '일별(하루)' },
                      { id: 'week', label: '주간별(7일)' },
                      { id: 'month', label: '월별' },
                      { id: 'custom', label: '날짜 선택(기간)' }
                    ].map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setBulkRangeType(o.id as any)}
                        className={`px-3 py-1.5 rounded-[10px] text-[11px] font-bold ${
                          bulkRangeType === o.id ? 'bg-[var(--toss-blue)] text-white' : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-3)]'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                  <div className="flex gap-3 flex-wrap">
                  <div>
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase mb-1">시작일</p>
                    <input
                      type="date"
                      value={bulkStartDate}
                      onChange={(e) => {
                        const v = e.target.value;
                        setBulkStartDate(v);
                        if (bulkRangeType === 'week') {
                          const d = new Date(v);
                          d.setDate(d.getDate() + 6);
                          setBulkEndDate(d.toISOString().slice(0, 10));
                        }
                      }}
                      className="bg-[var(--toss-card)] border border-[var(--toss-border)] px-3 py-2 rounded-[12px] text-xs font-bold"
                    />
                  </div>
                  {(bulkRangeType === 'custom' || bulkRangeType === 'week') && (
                    <div>
                      <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase mb-1">종료일</p>
                      <input
                        type="date"
                        value={bulkEndDate}
                        onChange={(e) => setBulkEndDate(e.target.value)}
                        className="bg-[var(--toss-card)] border border-[var(--toss-border)] px-3 py-2 rounded-[12px] text-xs font-bold"
                      />
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase mb-1">변경할 상태</p>
                  <select
                    value={bulkStatus}
                    onChange={(e) => setBulkStatus(e.target.value)}
                    className="w-full border border-[var(--toss-border)] rounded-[12px] px-3 py-2 text-xs font-bold bg-[var(--toss-card)]"
                  >
                    <option value="present">정상</option>
                    <option value="late">지각</option>
                    <option value="early_leave">조퇴</option>
                    <option value="absent">결근</option>
                    <option value="annual_leave">연차</option>
                    <option value="sick_leave">병가</option>
                    <option value="holiday">휴일</option>
                    <option value="half_leave">반차</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setBulkEditOpen(false)}
                  className="px-4 py-2 rounded-[12px] text-[11px] font-bold border border-[var(--toss-border)] text-[var(--toss-gray-3)]"
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
                  className="px-4 py-2 rounded-[12px] text-[11px] font-bold bg-[var(--toss-blue)] text-white disabled:opacity-50"
                >
                  {bulkSaving ? '적용 중…' : '일괄 적용'}
                </button>
              </div>
            </div>
          </div>
        )}

        {viewMode === 'calendar' && (
          <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[2.5rem] p-10 shadow-xl">
            <div className="grid grid-cols-7 gap-4">
              {['일', '월', '화', '수', '목', '금', '토'].map(day => (
                <div key={day} className="text-center text-[11px] font-bold text-[var(--toss-gray-3)] uppercase pb-4">{day}</div>
              ))}
              {Array.from({ length: 35 }).map((_, i) => {
                const day = i - 1; // 데모용 날짜 오프셋
                return (
                  <div key={i} className={`min-h-[120px] p-4 border border-[var(--toss-border)] rounded-[12px] transition-all hover:shadow-lg ${day > 0 && day <= 28 ? 'bg-[var(--toss-card)]' : 'bg-[var(--toss-gray-1)]/50 opacity-30'}`}>
                    {day > 0 && day <= 28 && (
                      <>
                        <span className="text-xs font-bold text-[var(--foreground)]">{day}</span>
                        <div className="mt-3 space-y-1">
                          <div className="px-2 py-1 bg-[var(--toss-blue-light)] text-[var(--toss-blue)] text-[8px] font-bold rounded-[12px] flex justify-between">
                            <span>출근</span>
                            <span>{filtered.length}명</span>
                          </div>
                          <div className="px-2 py-1 bg-orange-50 text-orange-600 text-[8px] font-bold rounded-[12px] flex justify-between">
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
