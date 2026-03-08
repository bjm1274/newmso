'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  staffs: any[];
  selectedCo: string;
  user: any;
}

const HOLIDAYS: Record<string, string> = {
  '2024-01-01': '신정',
  '2024-02-09': '설날연휴',
  '2024-02-10': '설날',
  '2024-02-11': '설날연휴',
  '2024-02-12': '설날대체',
  '2024-03-01': '삼일절',
  '2024-04-10': '국회의원선거',
  '2024-05-05': '어린이날',
  '2024-05-06': '어린이날대체',
  '2024-05-15': '부처님오신날',
  '2024-06-06': '현충일',
  '2024-08-15': '광복절',
  '2024-09-16': '추석연휴',
  '2024-09-17': '추석',
  '2024-09-18': '추석연휴',
  '2024-10-03': '개천절',
  '2024-10-09': '한글날',
  '2024-12-25': '크리스마스',
  '2025-01-01': '신정',
  '2025-01-28': '설날연휴',
  '2025-01-29': '설날',
  '2025-01-30': '설날연휴',
  '2025-03-01': '삼일절',
  '2025-03-03': '삼일절대체',
  '2025-05-05': '어린이날',
  '2025-05-06': '부처님오신날',
  '2025-06-06': '현충일',
  '2025-08-15': '광복절',
  '2025-10-03': '개천절',
  '2025-10-05': '추석연휴',
  '2025-10-06': '추석',
  '2025-10-07': '추석연휴',
  '2025-10-08': '추석대체',
  '2025-10-09': '한글날',
  '2025-12-25': '크리스마스',
  '2026-01-01': '신정',
  '2026-02-17': '설날연휴',
  '2026-02-18': '설날',
  '2026-02-19': '설날연휴',
  '2026-03-01': '삼일절',
  '2026-03-02': '삼일절대체',
  '2026-05-05': '어린이날',
  '2026-05-24': '부처님오신날',
  '2026-06-06': '현충일',
  '2026-08-15': '광복절',
  '2026-09-24': '추석연휴',
  '2026-09-25': '추석',
  '2026-09-26': '추석연휴',
  '2026-10-03': '개천절',
  '2026-10-09': '한글날',
  '2026-12-25': '크리스마스',
};

export default function HolidayCalendar({ staffs, selectedCo, user }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [tab, setTab] = useState<'월별' | '연간'>('월별');
  const [applying, setApplying] = useState(false);

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();
  const totalDays = lastDay.getDate();

  const calDates: (number | null)[] = Array(startDow).fill(null);
  for (let d = 1; d <= totalDays; d++) calDates.push(d);
  while (calDates.length % 7 !== 0) calDates.push(null);

  const dateKey = (d: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const isHoliday = (d: number) => HOLIDAYS[dateKey(d)];
  const isWeekend = (d: number, i: number) => {
    const dow = (startDow + (d - 1)) % 7;
    return dow === 0 || dow === 6;
  };

  const monthHolidays = Object.entries(HOLIDAYS).filter(([k]) => k.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`));
  const workingDays = (() => {
    let cnt = 0;
    for (let d = 1; d <= totalDays; d++) {
      const key = dateKey(d);
      const dow = new Date(year, month, d).getDay();
      if (dow !== 0 && dow !== 6 && !HOLIDAYS[key]) cnt++;
    }
    return cnt;
  })();

  const yearHolidays = Object.entries(HOLIDAYS).filter(([k]) => k.startsWith(`${year}`));

  const handleApplyAttendance = async () => {
    if (!confirm(`${year}년 ${month + 1}월 공휴일(${monthHolidays.length}건)을 근태 기록에 반영하시겠습니까?`)) return;
    setApplying(true);
    try {
      const inserts = monthHolidays.map(([date, name]) => ({
        work_date: date,
        type: '공휴일',
        note: name,
        company: selectedCo === '전체' ? undefined : selectedCo,
      }));
      await supabase.from('attendance_records').upsert(inserts, { onConflict: 'work_date' });
      alert('공휴일이 근태 기록에 반영되었습니다.');
    } catch {
      alert('반영에 실패했습니다.');
    } finally {
      setApplying(false);
    }
  };

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)]">공휴일 자동 반영 달력</h2>
          <p className="text-xs text-[var(--toss-gray-3)] mt-1">2024~2026 한국 법정 공휴일이 반영된 달력</p>
        </div>
        <div className="flex gap-2">
          {(['월별', '연간'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 text-xs font-bold rounded-[8px] ${tab === t ? 'bg-[var(--toss-blue)] text-white' : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)]'}`}>{t}</button>
          ))}
        </div>
      </div>

      {tab === '월별' ? (
        <>
          <div className="flex items-center gap-3">
            <button onClick={prevMonth} className="p-2 rounded-full hover:bg-[var(--toss-gray-1)]">◀</button>
            <h3 className="text-base font-bold text-[var(--foreground)] flex-1 text-center">{year}년 {month + 1}월</h3>
            <button onClick={nextMonth} className="p-2 rounded-full hover:bg-[var(--toss-gray-1)]">▶</button>
          </div>

          <div className="flex gap-4">
            {/* 달력 */}
            <div className="flex-1">
              <div className="grid grid-cols-7 mb-1">
                {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                  <div key={d} className={`text-center text-[11px] font-bold py-1 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-[var(--toss-gray-4)]'}`}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {calDates.map((d, i) => {
                  if (!d) return <div key={i} />;
                  const holidayName = isHoliday(d);
                  const dow = (startDow + (d - 1)) % 7;
                  const isSun = dow === 0;
                  const isSat = dow === 6;
                  return (
                    <div
                      key={i}
                      title={holidayName}
                      className={`relative min-h-[44px] p-1 rounded-[6px] text-[11px] font-bold text-center
                        ${holidayName ? 'bg-red-50 text-red-600' : isSun ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-[var(--foreground)]'}
                        ${d === today.getDate() && month === today.getMonth() && year === today.getFullYear() ? 'ring-2 ring-[var(--toss-blue)]' : ''}
                      `}
                    >
                      {d}
                      {holidayName && <div className="text-[8px] leading-tight text-red-500 font-bold truncate">{holidayName}</div>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 사이드바 */}
            <div className="w-44 shrink-0 space-y-3">
              <div className="p-3 bg-[var(--toss-gray-1)] rounded-[10px]">
                <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">근무 가능일</p>
                <p className="text-xl font-bold text-[var(--toss-blue)]">{workingDays}일</p>
              </div>
              <div className="p-3 bg-[var(--toss-gray-1)] rounded-[10px]">
                <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">공휴일</p>
                <p className="text-xl font-bold text-red-500">{monthHolidays.length}일</p>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {monthHolidays.map(([date, name]) => (
                  <div key={date} className="text-[10px] font-bold text-red-600 flex gap-1">
                    <span className="shrink-0">{date.slice(8)}일</span>
                    <span>{name}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={handleApplyAttendance}
                disabled={applying || monthHolidays.length === 0}
                className="w-full py-2 text-xs font-bold bg-[var(--toss-blue)] text-white rounded-[8px] hover:opacity-90 disabled:opacity-50"
              >
                {applying ? '반영 중...' : '근태 반영'}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-[var(--foreground)]">{year}년 전체 공휴일 ({yearHolidays.length}건)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {yearHolidays.map(([date, name]) => (
              <div key={date} className="flex items-center gap-3 p-2.5 bg-red-50 rounded-[8px] border border-red-100">
                <span className="text-[11px] font-bold text-red-600 shrink-0">{date}</span>
                <span className="text-[11px] font-bold text-[var(--foreground)]">{name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
