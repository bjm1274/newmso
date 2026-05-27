'use client';

/**
 * LeaveCalendar — 연차/휴가 월간 캘린더 (reference §1019~1126)
 *
 * - 7×N 그리드 (일~토). 일=빨강, 토=파랑, 공휴일 빨강
 * - 셀: 일자 + 공휴일 라벨(있을 때) + 신청 카운트(승인/대기)
 * - 데이터: leave_requests (start_date~end_date) — 부모에서 fetch한 결과를 props로 전달
 *
 * JM2: 표시는 props 기반, fetch는 부모. useMemo로 byDate 캐싱.
 * JM6: ul/li, role=img(셀에 카운트 의미 부여)
 */

import { useMemo, useState } from 'react';
import { getKoreanPublicHolidayName } from '@/lib/korean-public-holidays';

export interface LeaveCalendarEntry {
  /** ISO YYYY-MM-DD */
  date: string;
  /** 대기 = pending, 승인 = approved */
  status: 'pending' | 'approved' | 'rejected';
  /** 직원명 (툴팁용) */
  staffName?: string | null;
  /** 휴가 종류 */
  leaveType?: string | null;
}

interface LeaveCalendarProps {
  entries: LeaveCalendarEntry[];
  /** YYYY-MM (기본: 오늘). 부모 제어. */
  month?: string;
}

const WEEK_HEADERS = ['일', '월', '화', '수', '목', '금', '토'];

function todayMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function isoDate(year: number, month0: number, day: number): string {
  return `${year}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shiftMonth(ym: string, delta: -1 | 1): string {
  const [yStr, mStr] = ym.split('-');
  let y = parseInt(yStr, 10);
  let m0 = parseInt(mStr, 10) - 1 + delta;
  if (m0 < 0) { y -= 1; m0 = 11; }
  if (m0 > 11) { y += 1; m0 = 0; }
  return `${y}-${String(m0 + 1).padStart(2, '0')}`;
}

export default function LeaveCalendar({ entries, month }: LeaveCalendarProps) {
  const [internalMonth, setInternalMonth] = useState<string>(month ?? todayMonth());
  const currentMonth = month ?? internalMonth;
  const [yStr, mStr] = currentMonth.split('-');
  const year = parseInt(yStr, 10);
  const month0 = parseInt(mStr, 10) - 1;

  const cells = useMemo(() => {
    const first = new Date(year, month0, 1);
    const lastDay = new Date(year, month0 + 1, 0).getDate();
    const startDow = first.getDay();
    const list: Array<{ iso: string | null; day: number; dow: number }> = [];
    for (let i = 0; i < startDow; i += 1) list.push({ iso: null, day: 0, dow: i });
    for (let d = 1; d <= lastDay; d += 1) {
      const iso = isoDate(year, month0, d);
      list.push({ iso, day: d, dow: new Date(iso).getDay() });
    }
    // 마지막 주 7칸 정렬
    while (list.length % 7 !== 0) list.push({ iso: null, day: 0, dow: list.length % 7 });
    return list;
  }, [year, month0]);

  const byDate = useMemo(() => {
    const map = new Map<string, { approved: number; pending: number; sample?: string }>();
    for (const e of entries) {
      if (e.status === 'rejected') continue;
      const key = (e.date || '').slice(0, 10);
      if (!key) continue;
      const cur = map.get(key) ?? { approved: 0, pending: 0 };
      if (e.status === 'approved') cur.approved += 1;
      else cur.pending += 1;
      if (!cur.sample && e.staffName) cur.sample = `${e.staffName}${e.leaveType ? ` · ${e.leaveType}` : ''}`;
      map.set(key, cur);
    }
    return map;
  }, [entries]);

  const todayIso = useMemo(() => {
    const d = new Date();
    return isoDate(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  const monthLabel = `${year}년 ${month0 + 1}월`;

  return (
    <section className="app-card flex flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2.5 md:px-4 md:py-3">
        <h3 className="text-[13px] font-bold text-[var(--foreground)]">월간 캘린더</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setInternalMonth((m) => shiftMonth(m, -1))}
            aria-label="이전 달"
            className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-[12px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
          >
            ‹
          </button>
          <span className="tnum min-w-[80px] text-center text-[12px] font-bold text-[var(--foreground)]">
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={() => setInternalMonth((m) => shiftMonth(m, 1))}
            aria-label="다음 달"
            className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-[12px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
          >
            ›
          </button>
        </div>
      </header>
      <div className="p-3 md:p-4">
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-4)]">
          {WEEK_HEADERS.map((label, idx) => (
            <div key={label} className={`px-1 py-1.5 ${idx === 0 ? 'text-red-700' : idx === 6 ? 'text-[var(--accent)]' : ''}`}>
              {label}
            </div>
          ))}
        </div>
        <ul className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((cell, idx) => {
            if (cell.iso === null) {
              return <li key={`empty-${idx}`} className="min-h-[52px] rounded-[var(--radius-md)] bg-transparent" />;
            }
            const isToday = cell.iso === todayIso;
            const isSun = cell.dow === 0;
            const isSat = cell.dow === 6;
            const holidayName = getKoreanPublicHolidayName(cell.iso);
            const counts = byDate.get(cell.iso);
            return (
              <li
                key={cell.iso}
                title={counts?.sample}
                role={counts ? 'img' : undefined}
                aria-label={counts ? `${cell.iso} 승인 ${counts.approved}명 · 대기 ${counts.pending}명` : undefined}
                className={`flex min-h-[52px] flex-col gap-0.5 rounded-[var(--radius-md)] border px-1.5 py-1 ${
                  isToday
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : holidayName
                      ? 'border-red-200 bg-red-50/40'
                      : 'border-[var(--border)] bg-[var(--page-bg)]'
                }`}
              >
                <div
                  className={`text-[11px] font-bold ${
                    isToday
                      ? 'text-[var(--accent)]'
                      : isSun || holidayName
                        ? 'text-red-700'
                        : isSat
                          ? 'text-[var(--accent)]'
                          : 'text-[var(--foreground)]'
                  }`}
                >
                  {cell.day}
                </div>
                {holidayName && (
                  <span className="truncate rounded-[var(--radius-sm,4px)] bg-red-100 px-1 py-0.5 text-[9.5px] font-bold text-red-700">
                    {holidayName}
                  </span>
                )}
                {counts && (counts.approved > 0 || counts.pending > 0) && (
                  <div className="flex flex-col gap-0.5 text-[10px] font-semibold">
                    {counts.approved > 0 && (
                      <span className="truncate text-emerald-700">승인 {counts.approved}</span>
                    )}
                    {counts.pending > 0 && (
                      <span className="truncate text-amber-700">대기 {counts.pending}</span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
