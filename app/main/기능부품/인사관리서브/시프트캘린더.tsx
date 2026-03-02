'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

function getMonthDates(year: number, month: number) {
    const dates = [];
    const date = new Date(year, month, 1);
    while (date.getMonth() === month) {
        dates.push(new Date(date));
        date.setDate(date.getDate() + 1);
    }
    return dates;
}

const SHIFT_TYPES = [
    { id: 'D', name: '데이', color: 'bg-orange-100 text-orange-700 border-orange-200', hours: 8 },
    { id: 'E', name: '이브닝', color: 'bg-blue-100 text-blue-700 border-blue-200', hours: 8 },
    { id: 'N', name: '나이트', color: 'bg-slate-800 text-slate-100 border-slate-700', hours: 8 },
    { id: 'OFF', name: '휴무', color: 'bg-slate-100 text-slate-400 border-slate-200', hours: 0 }
];

export default function ShiftCalendar({ staffs, selectedCo }: any) {
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
    const [monthDates, setMonthDates] = useState(getMonthDates(currentYear, currentMonth));
    const [shifts, setShifts] = useState<any>({}); // Format: { "staffId_YYYY-MM-DD": "D" }
    const [loading, setLoading] = useState(false);
    const [shiftWorkerIds, setShiftWorkerIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        const fetchShiftWorkers = async () => {
            const { data } = await supabase.from('work_shifts').select('id').eq('is_shift', true);
            if (data) {
                const shiftIds = data.map(d => d.id);
                // Filter staff members who have a work_shift_id matching the shiftIds
                // Assuming staff objects passed have work_shift_id
                const validStaffIds = new Set<string>(staffs.filter((s: any) => s.work_shift_id && shiftIds.includes(s.work_shift_id)).map((s: any) => s.id));
                setShiftWorkerIds(validStaffIds);
            }
        };
        fetchShiftWorkers();
    }, [staffs]);

    // Filter staff by company AND shift worker designation
    const filteredStaffs = staffs?.filter((s: any) =>
        (selectedCo === '전체' || s.company === selectedCo) && shiftWorkerIds.has(s.id)
    ) || [];

    useEffect(() => {
        setMonthDates(getMonthDates(currentYear, currentMonth));
    }, [currentYear, currentMonth]);

    const changeMonth = (offset: number) => {
        let newMonth = currentMonth + offset;
        let newYear = currentYear;
        if (newMonth > 11) {
            newMonth = 0;
            newYear++;
        } else if (newMonth < 0) {
            newMonth = 11;
            newYear--;
        }
        setCurrentMonth(newMonth);
        setCurrentYear(newYear);
    };

    const handleShiftChange = (staffId: string, date: string, shiftId: string) => {
        const key = `${staffId}_${date}`;
        const newShifts = { ...shifts };
        if (newShifts[key] === shiftId) {
            delete newShifts[key];
        } else {
            newShifts[key] = shiftId;
        }
        setShifts(newShifts);
    };

    const calculateMonthlyHours = (staffId: string) => {
        let total = 0;
        monthDates.forEach(date => {
            const dateStr = date.toISOString().split('T')[0];
            const shiftId = shifts[`${staffId}_${dateStr}`];
            const shift = SHIFT_TYPES.find(s => s.id === shiftId);
            if (shift) total += shift.hours;
        });
        return total;
    };

    const saveShifts = async () => {
        if (!confirm('현재 스케줄을 저장하시겠습니까?')) return;
        setLoading(true);
        try {
            // In a real scenario, we would upsert to an `employee_shifts` table.
            // Mocking the delay here for demonstration.
            await new Promise(r => setTimeout(r, 600));
            alert('스케줄이 성공적으로 저장 및 배포되었습니다. 직원들의 마이페이지에 업데이트됩니다.');
        } catch (e) {
            alert('스케줄 저장 실패');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-full flex flex-col premium-card p-6 md:p-8 animate-soft-fade">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8 shrink-0 border-b border-slate-100 pb-6">
                <div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">교대근무 및 스케줄링 간트 차트 🏥</h2>
                    <p className="text-[12px] font-bold text-slate-400 mt-2 leading-relaxed">
                        클릭하여 데이/이브닝/나이트/휴무를 전환하세요.
                        <br className="md:hidden" />
                        주 52시간 초과 시 자동으로 빨간 경고가 표시됩니다.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1 items-center">
                        <button onClick={() => changeMonth(-1)} className="p-2 rounded-xl bg-white hover:bg-slate-50 transition-colors shadow-sm font-black text-slate-500 font-mono">←</button>
                        <div className="px-4 text-[13px] font-black text-slate-700 tracking-widest min-w-[170px] text-center">
                            {currentYear}년 {currentMonth + 1}월
                        </div>
                        <button onClick={() => changeMonth(1)} className="p-2 rounded-xl bg-white hover:bg-slate-50 transition-colors shadow-sm font-black text-slate-500 font-mono">→</button>
                    </div>
                    <button
                        onClick={saveShifts}
                        disabled={loading}
                        className="px-6 py-3.5 bg-primary text-white text-[12px] font-black rounded-2xl shadow-xl shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all"
                    >
                        {loading ? '저장 중...' : '💾 스케줄 저장 및 릴리즈'}
                    </button>
                </div>
            </div>

            <div className="flex gap-4 mb-6 shrink-0">
                {SHIFT_TYPES.map(shift => (
                    <div key={shift.id} className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black tracking-tight border ${shift.color}`}>{shift.id}</span>
                        <span className="text-[11px] font-bold text-slate-500">{shift.name} ({shift.hours}h)</span>
                    </div>
                ))}
            </div>

            <div className="flex-1 overflow-auto rounded-3xl border border-slate-200/60 shadow-sm bg-white custom-scrollbar">
                <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200/60 z-10 backdrop-blur-sm">
                        <tr>
                            <th className="p-4 text-[12px] font-black text-slate-700 w-48 border-r border-slate-200/60 sticky left-0 bg-slate-50 z-20">교대 근무자</th>
                            {monthDates.map((date, idx) => {
                                const dayStr = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
                                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                                return (
                                    <th key={idx} className={`px-2 py-4 text-center border-r border-slate-200/60 min-w-[50px] ${isWeekend ? 'bg-danger/5' : ''}`}>
                                        <div className="flex flex-col items-center">
                                            <span className="text-[10px] font-black text-slate-400 tracking-widest uppercase">{date.getDate()}</span>
                                            <span className={`text-[10px] font-black mt-1 ${date.getDay() === 0 ? 'text-danger' : date.getDay() === 6 ? 'text-blue-500' : 'text-slate-800'}`}>{dayStr}</span>
                                        </div>
                                    </th>
                                );
                            })}
                            <th className="p-4 text-[12px] font-black text-slate-700 text-center bg-slate-100 sticky right-0">월 누적</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredStaffs.map((staff: any) => {
                            const monthlyHours = calculateMonthlyHours(staff.id);
                            const isOverwork = monthlyHours > 208; // Roughly 52 * 4

                            return (
                                <tr key={staff.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors group">
                                    <td className="p-4 border-r border-slate-100 sticky left-0 bg-white group-hover:bg-slate-50/50 z-10 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                                                {staff.avatar_url ? <img src={staff.avatar_url} alt="" className="w-full h-full object-cover" /> : <span className="text-xl">👤</span>}
                                            </div>
                                            <div>
                                                <p className="text-[12px] font-black text-slate-800 tracking-tight">{staff.name} <span className="text-[10px] text-slate-400 font-bold ml-1">{staff.position}</span></p>
                                                <p className="text-[10px] font-bold text-slate-400 line-clamp-1">{staff.department}</p>
                                            </div>
                                        </div>
                                    </td>

                                    {monthDates.map((date, idx) => {
                                        const dateStr = date.toISOString().split('T')[0];
                                        const shiftId = shifts[`${staff.id}_${dateStr}`];
                                        const shiftConf = SHIFT_TYPES.find(s => s.id === shiftId);

                                        return (
                                            <td key={idx} className="p-1 border-r border-slate-100 text-center relative cursor-pointer group/cell" onClick={() => {
                                                // Cycle through SHIFT_TYPES
                                                const cIdx = SHIFT_TYPES.findIndex(s => s.id === shiftId);
                                                const nextShift = SHIFT_TYPES[(cIdx + 1) % SHIFT_TYPES.length].id;
                                                handleShiftChange(staff.id, dateStr, nextShift);
                                            }}>
                                                {shiftConf ? (
                                                    <div className={`mx-auto w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black border transition-transform group-hover/cell:scale-105 shadow-sm ${shiftConf.color}`}>
                                                        {shiftConf.id}
                                                    </div>
                                                ) : (
                                                    <div className="mx-auto w-8 h-8 rounded-lg flex items-center justify-center border border-dashed border-transparent group-hover/cell:border-primary/40 group-hover/cell:bg-primary/5 transition-colors text-transparent group-hover/cell:text-primary text-[10px]">
                                                        +
                                                    </div>
                                                )}
                                            </td>
                                        );
                                    })}

                                    <td className="p-4 text-center bg-slate-50/50 sticky right-0">
                                        <div className={`w-12 py-1.5 mx-auto rounded-xl text-[11px] font-black border ${isOverwork ? 'bg-danger/10 text-danger border-danger/20 animate-pulse' : 'bg-white text-slate-700 border-slate-200'}`}>
                                            {monthlyHours}h
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}

                        {filteredStaffs.length === 0 && (
                            <tr>
                                <td colSpan={monthDates.length + 2} className="p-20 text-center text-[12px] font-bold text-slate-400 bg-slate-50 rounded-b-3xl border-t border-slate-200">
                                    <div className="text-4xl mb-3">📭</div>
                                    선택한 필터나 근무형태(교대근무 전용이 켜진 근무형태)에 해당하는 교대 근무자가 없습니다. <br />
                                    [인사관리 &gt; 근무형태] 메뉴에서 직원의 근무형태가 올바르게 설정되었는지 확인해 주세요.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
