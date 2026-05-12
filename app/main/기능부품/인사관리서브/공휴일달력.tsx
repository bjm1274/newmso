'use client';
import { useActionDialog } from '@/app/components/useActionDialog';
import { toast } from '@/lib/toast';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  // 2027년 (음력 기반 공휴일은 확정 후 업데이트 필요)
  '2027-01-01': '신정',
  '2027-01-25': '설날연휴',
  '2027-01-26': '설날',
  '2027-01-27': '설날연휴',
  '2027-03-01': '삼일절',
  '2027-05-05': '어린이날',
  '2027-05-13': '부처님오신날',
  '2027-06-06': '현충일',
  '2027-08-15': '광복절',
  '2027-10-01': '추석연휴',
  '2027-10-02': '추석',
  '2027-10-03': '개천절',
  '2027-10-04': '추석연휴',
  '2027-10-09': '한글날',
  '2027-12-25': '크리스마스',
};

type CompanyHoliday = {
  id: string;
  company_name: string;
  holiday_date: string;
  name: string;
  note?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type HolidayEntry = {
  date: string;
  name: string;
  source: 'legal' | 'custom' | 'mixed';
  companyName?: string;
};

function isMissingCompanyHolidayTableError(error: any) {
  const code = String(error?.code || '').trim();
  const message = [error?.message, error?.details, error?.hint]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('company_holidays') ||
    (message.includes('schema cache') && message.includes('could not find the table'))
  );
}

export default function HolidayCalendar({ staffs, selectedCo, user }: Props) {
  const { dialog, openConfirm } = useActionDialog();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [tab, setTab] = useState<'월별' | '연간'>('월별');
  const [applying, setApplying] = useState(false);
  const [customHolidays, setCustomHolidays] = useState<CompanyHoliday[]>([]);
  const [loadingCustomHolidays, setLoadingCustomHolidays] = useState(false);
  const [savingCustomHoliday, setSavingCustomHoliday] = useState(false);
  const [customHolidayDate, setCustomHolidayDate] = useState(today.toISOString().slice(0, 10));
  const [customHolidayName, setCustomHolidayName] = useState('');
  const [customHolidayStorageReady, setCustomHolidayStorageReady] = useState(true);
  const holidayScopeCompany = selectedCo && selectedCo !== '전체' ? selectedCo : '전체';

  const fetchCustomHolidays = useCallback(async () => {
    setLoadingCustomHolidays(true);
    try {
      let query = supabase
        .from('company_holidays')
        .select('id, company_name, holiday_date, name, note, created_by, created_by_name, created_at, updated_at')
        .gte('holiday_date', `${year}-01-01`)
        .lte('holiday_date', `${year}-12-31`)
        .order('holiday_date', { ascending: true });

      if (holidayScopeCompany === '전체') {
        query = query.eq('company_name', '전체');
      } else {
        query = query.in('company_name', ['전체', holidayScopeCompany]);
      }

      const { data, error } = await query;
      if (error) throw error;
      setCustomHolidays((data || []) as CompanyHoliday[]);
      setCustomHolidayStorageReady(true);
    } catch (error) {
      if (isMissingCompanyHolidayTableError(error)) {
        setCustomHolidayStorageReady(false);
        setCustomHolidays([]);
      } else {
        console.error('지정 공휴일 조회 실패:', error);
        toast('지정 공휴일을 불러오지 못했습니다.', 'error');
      }
    } finally {
      setLoadingCustomHolidays(false);
    }
  }, [holidayScopeCompany, year]);

  useEffect(() => {
    fetchCustomHolidays();
  }, [fetchCustomHolidays]);

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();
  const totalDays = lastDay.getDate();

  const calDates: (number | null)[] = Array(startDow).fill(null);
  for (let d = 1; d <= totalDays; d++) calDates.push(d);
  while (calDates.length % 7 !== 0) calDates.push(null);

  const knownYears = [...new Set(Object.keys(HOLIDAYS).map(k => Number(k.slice(0, 4))))];
  const hasDataForYear = knownYears.includes(year);

  const holidayEntries = useMemo(() => {
    const entries = new Map<string, HolidayEntry>();

    Object.entries(HOLIDAYS).forEach(([date, name]) => {
      entries.set(date, { date, name, source: 'legal' });
    });

    customHolidays.forEach((holiday) => {
      const date = String(holiday.holiday_date || '').slice(0, 10);
      if (!date) return;
      const existing = entries.get(date);
      if (existing) {
        const customName = String(holiday.name || '지정 공휴일').trim();
        entries.set(date, {
          date,
          name: existing.name.includes(customName) ? existing.name : `${existing.name} / ${customName}`,
          source: 'mixed',
          companyName: holiday.company_name,
        });
      } else {
        entries.set(date, {
          date,
          name: String(holiday.name || '지정 공휴일').trim(),
          source: 'custom',
          companyName: holiday.company_name,
        });
      }
    });

    return [...entries.values()].sort((left, right) => left.date.localeCompare(right.date));
  }, [customHolidays]);

  const holidayByDate = useMemo(
    () => new Map(holidayEntries.map((entry) => [entry.date, entry])),
    [holidayEntries],
  );

  const dateKey = (d: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const getHolidayEntry = (d: number) => holidayByDate.get(dateKey(d));
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthHolidays = holidayEntries.filter((holiday) => holiday.date.startsWith(monthPrefix));
  const workingDays = (() => {
    let cnt = 0;
    for (let d = 1; d <= totalDays; d++) {
      const key = dateKey(d);
      const dow = new Date(year, month, d).getDay();
      if (dow !== 0 && dow !== 6 && !holidayByDate.has(key)) cnt++;
    }
    return cnt;
  })();

  const yearHolidays = holidayEntries.filter((holiday) => holiday.date.startsWith(`${year}`));
  const yearCustomHolidays = customHolidays.filter((holiday) =>
    String(holiday.holiday_date || '').startsWith(`${year}`)
  );

  const handleSaveCustomHoliday = async () => {
    const normalizedDate = String(customHolidayDate || '').trim();
    const normalizedName = customHolidayName.trim() || '지정 공휴일';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
      toast('지정일을 선택해 주세요.', 'warning');
      return;
    }

    setSavingCustomHoliday(true);
    try {
      const { error } = await supabase.from('company_holidays').upsert(
        {
          company_name: holidayScopeCompany,
          holiday_date: normalizedDate,
          name: normalizedName,
          created_by: user?.id ? String(user.id) : null,
          created_by_name: user?.name ? String(user.name) : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'company_name,holiday_date' },
      );
      if (error) throw error;
      setCustomHolidayName('');
      setCustomHolidayStorageReady(true);
      await fetchCustomHolidays();
      toast('지정 공휴일을 저장했습니다.', 'success');
    } catch (error) {
      if (isMissingCompanyHolidayTableError(error)) {
        setCustomHolidayStorageReady(false);
        toast('company_holidays 테이블이 필요합니다. 마이그레이션을 먼저 적용해 주세요.', 'error');
      } else {
        console.error('지정 공휴일 저장 실패:', error);
        toast('지정 공휴일 저장에 실패했습니다.', 'error');
      }
    } finally {
      setSavingCustomHoliday(false);
    }
  };

  const handleDeleteCustomHoliday = async (holiday: CompanyHoliday) => {
    const confirmed = await openConfirm({
      title: '지정 공휴일 삭제',
      description: `${holiday.holiday_date} ${holiday.name} 항목을 삭제합니다.`,
      confirmText: '삭제',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      const { error } = await supabase.from('company_holidays').delete().eq('id', holiday.id);
      if (error) throw error;
      await fetchCustomHolidays();
      toast('지정 공휴일을 삭제했습니다.', 'success');
    } catch (error) {
      console.error('지정 공휴일 삭제 실패:', error);
      toast('지정 공휴일 삭제에 실패했습니다.', 'error');
    }
  };

  const handleApplyAttendance = async () => {
    const confirmed = await openConfirm({
      title: '공휴일 근태 반영',
      description: `${year}년 ${month + 1}월 공휴일 ${monthHolidays.length}건을 근태 기록에 반영합니다.`,
      confirmText: '반영',
      tone: 'accent',
    });
    if (!confirmed) return;
    setApplying(true);
    try {
      const inserts = monthHolidays.map((holiday) => ({
        work_date: holiday.date,
        type: '공휴일',
        note: holiday.name,
        company: selectedCo === '전체' ? undefined : selectedCo,
      }));
      await supabase.from('attendance_records').upsert(inserts, { onConflict: 'work_date' });
      toast('공휴일이 근태 기록에 반영되었습니다.');
    } catch {
      toast('반영에 실패했습니다.', 'error');
    } finally {
      setApplying(false);
    }
  };

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };

  return (
    <div className="p-4 md:p-4 space-y-5 max-w-4xl mx-auto">
      {dialog}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-[var(--toss-gray-3)]">한국 법정 공휴일 ({Math.min(...knownYears)}~{Math.max(...knownYears)}년)</p>
          {!hasDataForYear && <p className="text-xs text-orange-500 mt-1">{year}년 공휴일 데이터가 없습니다. 관리자에게 업데이트를 요청하세요.</p>}
        </div>
        <div className="flex gap-2">
          {(['월별', '연간'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 text-xs font-bold rounded-[var(--radius-md)] ${tab === t ? 'bg-[var(--accent)] text-white' : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'}`}>{t}</button>
          ))}
        </div>
      </div>

      {tab === '월별' ? (
        <>
          <div className="flex items-center gap-3">
            <button onClick={prevMonth} className="p-2 rounded-[var(--radius-md)] hover:bg-[var(--muted)]">◀</button>
            <h3 className="text-base font-bold text-[var(--foreground)] flex-1 text-center">{year}년 {month + 1}월</h3>
            <button onClick={nextMonth} className="p-2 rounded-[var(--radius-md)] hover:bg-[var(--muted)]">▶</button>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
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
                  const holidayEntry = getHolidayEntry(d);
                  const dow = (startDow + (d - 1)) % 7;
                  const isSun = dow === 0;
                  const isSat = dow === 6;
                  return (
                    <button
                      key={i}
                      type="button"
                      title={holidayEntry?.name}
                      onClick={() => setCustomHolidayDate(dateKey(d))}
                      className={`relative min-h-[44px] p-1 rounded-md text-[11px] font-bold text-center transition-all hover:bg-[var(--muted)]
                        ${holidayEntry ? 'bg-red-500/10 text-red-600' : isSun ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-[var(--foreground)]'}
                        ${d === today.getDate() && month === today.getMonth() && year === today.getFullYear() ? 'ring-2 ring-[var(--accent)]' : ''}
                      `}
                    >
                      {d}
                      {holidayEntry && <div className="text-[8px] leading-tight text-red-500 font-bold truncate">{holidayEntry.name}</div>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 사이드바 */}
            <div className="w-full sm:w-44 shrink-0 space-y-3 grid grid-cols-2 sm:grid-cols-1 gap-3 sm:gap-0 sm:space-y-3">
              <div className="p-3 bg-[var(--muted)] rounded-[var(--radius-md)]">
                <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">근무 가능일</p>
                <p className="text-xl font-bold text-[var(--accent)]">{workingDays}일</p>
              </div>
              <div className="p-3 bg-[var(--muted)] rounded-[var(--radius-md)]">
                <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">공휴일</p>
                <p className="text-xl font-bold text-red-500">{monthHolidays.length}일</p>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {monthHolidays.map((holiday) => (
                  <div key={`${holiday.date}-${holiday.name}`} className="text-[10px] font-bold text-red-600 flex gap-1">
                    <span className="shrink-0">{holiday.date.slice(8)}일</span>
                    <span>{holiday.name}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={handleApplyAttendance}
                disabled={applying || monthHolidays.length === 0}
                className="w-full py-2 text-xs font-bold bg-[var(--accent)] text-white rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50"
              >
                {applying ? '반영 중...' : '근태 반영'}
              </button>
            </div>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)_auto] md:items-end">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold text-[var(--toss-gray-3)]">지정일</span>
                <input
                  type="date"
                  value={customHolidayDate}
                  onChange={(event) => setCustomHolidayDate(event.target.value)}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-bold text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold text-[var(--toss-gray-3)]">공휴일명</span>
                <input
                  type="text"
                  value={customHolidayName}
                  onChange={(event) => setCustomHolidayName(event.target.value)}
                  placeholder={`${holidayScopeCompany} 지정 공휴일`}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-bold text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                />
              </label>
              <button
                type="button"
                onClick={handleSaveCustomHoliday}
                disabled={savingCustomHoliday}
                className="min-h-10 rounded-[var(--radius-md)] bg-[var(--accent)] px-5 text-sm font-bold text-white disabled:opacity-50"
              >
                {savingCustomHoliday ? '저장 중...' : '저장'}
              </button>
            </div>

            {!customHolidayStorageReady && (
              <div className="mt-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">
                company_holidays 테이블을 적용해야 지정 공휴일을 저장할 수 있습니다.
              </div>
            )}

            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {loadingCustomHolidays ? (
                <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2 text-[11px] font-bold text-[var(--toss-gray-3)]">
                  불러오는 중...
                </div>
              ) : yearCustomHolidays.length === 0 ? (
                <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2 text-[11px] font-bold text-[var(--toss-gray-3)]">
                  저장된 지정 공휴일이 없습니다.
                </div>
              ) : (
                yearCustomHolidays.map((holiday) => (
                  <div
                    key={holiday.id}
                    className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-red-100 bg-red-500/10 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-bold text-[var(--foreground)]">
                        {holiday.holiday_date} · {holiday.name}
                      </p>
                      <p className="text-[10px] font-bold text-red-500">{holiday.company_name}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteCustomHoliday(holiday)}
                      className="shrink-0 rounded-[var(--radius-md)] bg-[var(--card)] px-2 py-1 text-[10px] font-bold text-red-600"
                    >
                      삭제
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-[var(--foreground)]">{year}년 전체 공휴일 ({yearHolidays.length}건)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {yearHolidays.map((holiday) => (
              <div key={`${holiday.date}-${holiday.name}`} className="flex items-center gap-3 p-2.5 bg-red-500/10 rounded-[var(--radius-md)] border border-red-100">
                <span className="text-[11px] font-bold text-red-600 shrink-0">{holiday.date}</span>
                <span className="text-[11px] font-bold text-[var(--foreground)]">{holiday.name}</span>
                {holiday.source !== 'legal' && (
                  <span className="ml-auto rounded-full bg-[var(--card)] px-2 py-0.5 text-[10px] font-bold text-red-500">
                    지정
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
