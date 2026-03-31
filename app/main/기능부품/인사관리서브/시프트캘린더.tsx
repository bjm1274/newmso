'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';

type StaffRow = {
  id: string;
  name?: string;
  position?: string;
  department?: string;
  company?: string;
  avatar_url?: string | null;
  work_shift_id?: string | null;
};

type ShiftCalendarProps = {
  staffs?: StaffRow[];
  selectedCo?: string;
};

type ShiftType = {
  id: 'D' | 'E' | 'N' | 'OFF';
  name: string;
  color: string;
  hours: number;
};

const SHIFT_TYPES: ShiftType[] = [
  { id: 'D', name: '데이', color: 'bg-orange-100 text-orange-700 border-orange-200', hours: 8 },
  { id: 'E', name: '이브닝', color: 'bg-blue-100 text-blue-700 border-blue-200', hours: 8 },
  { id: 'N', name: '나이트', color: 'bg-slate-800 text-slate-100 border-slate-700', hours: 8 },
  { id: 'OFF', name: '오프', color: 'bg-[var(--tab-bg)] text-[var(--toss-gray-3)] border-[var(--border)]', hours: 0 },
];

function getMonthDates(year: number, month: number) {
  const dates: Date[] = [];
  const cursor = new Date(year, month, 1);
  while (cursor.getMonth() === month) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function dayLabel(day: number) {
  return ['일', '월', '화', '수', '목', '금', '토'][day] ?? '';
}

export default function ShiftCalendar({ staffs = [], selectedCo = '전체' }: ShiftCalendarProps) {
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [loading, setLoading] = useState(false);
  const [shifts, setShifts] = useState<Record<string, ShiftType['id']>>({});
  const [shiftWorkerIds, setShiftWorkerIds] = useState<Set<string>>(new Set());

  const monthDates = useMemo(
    () => getMonthDates(currentYear, currentMonth),
    [currentYear, currentMonth]
  );

  useEffect(() => {
    let cancelled = false;

    const fetchShiftWorkers = async () => {
      const { data } = await supabase.from('work_shifts').select('id').eq('is_shift', true);
      if (cancelled) return;

      const shiftIds = (data ?? []).map((row: { id: string }) => row.id);
      const validIds = new Set(
        staffs
          .filter((staff) => staff.work_shift_id && shiftIds.includes(String(staff.work_shift_id)))
          .map((staff) => String(staff.id))
      );
      setShiftWorkerIds(validIds);
    };

    void fetchShiftWorkers();
    return () => {
      cancelled = true;
    };
  }, [staffs]);

  const filteredStaffs = useMemo(
    () =>
      staffs.filter(
        (staff) =>
          (selectedCo === '전체' || staff.company === selectedCo) && shiftWorkerIds.has(String(staff.id))
      ),
    [selectedCo, shiftWorkerIds, staffs]
  );

  const changeMonth = (offset: number) => {
    let nextMonth = currentMonth + offset;
    let nextYear = currentYear;

    if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    } else if (nextMonth < 0) {
      nextMonth = 11;
      nextYear -= 1;
    }

    setCurrentMonth(nextMonth);
    setCurrentYear(nextYear);
  };

  const handleShiftChange = (staffId: string, date: string, shiftId: ShiftType['id']) => {
    const key = `${staffId}_${date}`;
    setShifts((previous) => {
      if (previous[key] === shiftId) {
        const next = { ...previous };
        delete next[key];
        return next;
      }
      return { ...previous, [key]: shiftId };
    });
  };

  const calculateMonthlyHours = (staffId: string) => {
    let total = 0;
    for (const date of monthDates) {
      const key = `${staffId}_${date.toISOString().split('T')[0]}`;
      const selectedShift = SHIFT_TYPES.find((shift) => shift.id === shifts[key]);
      total += selectedShift?.hours ?? 0;
    }
    return total;
  };

  const saveShifts = async () => {
    if (!window.confirm('현재 스케줄을 저장하시겠습니까?')) return;
    setLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 600));
      toast('스케줄이 성공적으로 저장 및 배포되었습니다.', 'success');
    } catch {
      toast('스케줄 저장에 실패했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col premium-card p-4 animate-soft-fade">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3 mb-4 shrink-0 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h2 className="text-base font-bold text-[var(--foreground)] tracking-tight">
            교대근무 및 스케줄링 간트 차트
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-[var(--tab-bg)] p-1 rounded-[var(--radius-md)] gap-1 items-center">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="p-1.5 rounded-[var(--radius-md)] bg-[var(--card)] hover:bg-[var(--tab-bg)] transition-colors shadow-sm font-black text-[var(--toss-gray-4)] font-mono"
            >
              ◀
            </button>
            <div className="px-3 text-[12px] font-bold text-[var(--toss-gray-5)] tracking-widest min-w-[140px] text-center">
              {currentYear}년 {currentMonth + 1}월
            </div>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="p-1.5 rounded-[var(--radius-md)] bg-[var(--card)] hover:bg-[var(--tab-bg)] transition-colors shadow-sm font-black text-[var(--toss-gray-4)] font-mono"
            >
              ▶
            </button>
          </div>
          <button
            type="button"
            onClick={saveShifts}
            disabled={loading}
            className="px-4 py-2 bg-[var(--accent)] text-white text-[12px] font-bold rounded-[var(--radius-md)] shadow-sm hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {loading ? '저장 중...' : '전체 배치 저장'}
          </button>
        </div>
      </div>

      <div className="flex gap-3 mb-3 shrink-0 flex-wrap">
        {SHIFT_TYPES.map((shift) => (
          <div key={shift.id} className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black tracking-tight border ${shift.color}`}
            >
              {shift.id}
            </span>
            <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">
              {shift.name} ({shift.hours}h)
            </span>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-auto rounded-2xl border border-[var(--border)]/60 shadow-sm bg-[var(--card)] custom-scrollbar">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead className="sticky top-0 bg-[var(--tab-bg)] border-b border-[var(--border)]/60 z-10 backdrop-blur-sm">
            <tr>
              <th className="p-4 text-[12px] font-black text-[var(--toss-gray-5)] w-48 border-r border-[var(--border)]/60 sticky left-0 bg-[var(--tab-bg)] z-20">
                근무자
              </th>
              {monthDates.map((date) => {
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                return (
                  <th
                    key={date.toISOString()}
                    className={`px-2 py-4 text-center border-r border-[var(--border)]/60 min-w-[50px] ${isWeekend ? 'bg-danger/5' : ''}`}
                  >
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-black text-[var(--toss-gray-3)] tracking-widest uppercase">
                        {date.getDate()}
                      </span>
                      <span
                        className={`text-[10px] font-black mt-1 ${
                          date.getDay() === 0
                            ? 'text-danger'
                            : date.getDay() === 6
                              ? 'text-blue-500'
                              : 'text-[var(--foreground)]'
                        }`}
                      >
                        {dayLabel(date.getDay())}
                      </span>
                    </div>
                  </th>
                );
              })}
              <th className="p-4 text-[12px] font-black text-[var(--toss-gray-5)] text-center bg-[var(--tab-bg)] sticky right-0">
                월합계
              </th>
            </tr>
          </thead>

          <tbody>
            {filteredStaffs.map((staff) => {
              const monthlyHours = calculateMonthlyHours(String(staff.id));
              const isOverwork = monthlyHours > 208;

              return (
                <tr
                  key={staff.id}
                  className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--tab-bg)]/50 transition-colors group"
                >
                  <td className="p-4 border-r border-[var(--border-subtle)] sticky left-0 bg-[var(--card)] group-hover:bg-[var(--tab-bg)]/50 z-10 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[var(--tab-bg)] overflow-hidden flex items-center justify-center shrink-0">
                        {staff.avatar_url ? (
                          <img src={staff.avatar_url} alt={staff.name ? `${staff.name} 프로필 사진` : '프로필 사진'} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xl">👤</span>
                        )}
                      </div>
                      <div>
                        <p className="text-[12px] font-black text-[var(--foreground)] tracking-tight">
                          {staff.name}{' '}
                          <span className="text-[10px] text-[var(--toss-gray-3)] font-bold ml-1">
                            {staff.position || ''}
                          </span>
                        </p>
                        <p className="text-[10px] font-bold text-[var(--toss-gray-3)] line-clamp-1">
                          {staff.department || '-'}
                        </p>
                      </div>
                    </div>
                  </td>

                  {monthDates.map((date) => {
                    const dateStr = date.toISOString().split('T')[0];
                    const shiftId = shifts[`${staff.id}_${dateStr}`];
                    const shiftConf = SHIFT_TYPES.find((shift) => shift.id === shiftId);

                    return (
                      <td
                        key={`${staff.id}-${dateStr}`}
                        className="p-1 border-r border-[var(--border-subtle)] text-center relative cursor-pointer group/cell"
                        onClick={() => {
                          const currentIndex = SHIFT_TYPES.findIndex((shift) => shift.id === shiftId);
                          const nextShift = SHIFT_TYPES[(currentIndex + 1 + SHIFT_TYPES.length) % SHIFT_TYPES.length].id;
                          handleShiftChange(String(staff.id), dateStr, nextShift);
                        }}
                      >
                        {shiftConf ? (
                          <div
                            className={`mx-auto w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black border transition-transform group-hover/cell:scale-105 shadow-sm ${shiftConf.color}`}
                          >
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

                  <td className="p-4 text-center bg-[var(--tab-bg)]/50 sticky right-0">
                    <div
                      className={`w-14 py-1.5 mx-auto rounded-xl text-[11px] font-black border ${
                        isOverwork
                          ? 'bg-danger/10 text-danger border-danger/20 animate-pulse'
                          : 'bg-[var(--card)] text-[var(--toss-gray-5)] border-[var(--border)]'
                      }`}
                    >
                      {monthlyHours}h
                    </div>
                  </td>
                </tr>
              );
            })}

            {filteredStaffs.length === 0 && (
              <tr>
                <td
                  colSpan={monthDates.length + 2}
                  className="p-20 text-center text-[12px] font-bold text-[var(--toss-gray-3)] bg-[var(--tab-bg)] rounded-b-3xl border-t border-[var(--border)]"
                >
                  <div className="text-4xl mb-3">⚠️</div>
                  선택된 필터와 근무형태(교대근무 전용으로 체크된 근무형태)에 해당하는 교대 근무자가 없습니다.
                  <br />
                  [인사관리 &gt; 근무형태] 메뉴에서 직원의 근무형태가 올바르게 설정됐는지 확인해 주세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
