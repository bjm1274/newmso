'use client';

/**
 * AttendWorkcenter — 대시보드 탭
 *
 * - 부서별 출근 현황 (가로 누적 바) + 오늘자 출근 인원 리스트
 * - 데이터: `attendances` 테이블에서 오늘자만 fetch
 *
 * JM2: AbortController로 회사·날짜 변경 시 이전 fetch 취소
 * JM3: 에러는 inline 메시지로 분리
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { StaffMember } from '@/types';
import { isActive } from '../MemberWorkcenter/data';
import {
  aggregateDeptBreakdown,
  aggregateDailyCounts,
  aggregateHourlyInOut,
  getTodayIso,
  resolveAttendanceStatus,
  type AttendanceRow,
} from './data';
import AttendHourlyChart from './AttendHourlyChart';

interface AttendDashboardProps {
  staffs: StaffMember[];
  selectedCo?: string;
  /** 외부에서 KPI 집계용으로 fetch한 데이터를 공유하고 싶을 때 (선택) */
  rowsOverride?: AttendanceRow[];
}

export default function AttendDashboard({ staffs, selectedCo, rowsOverride }: AttendDashboardProps) {
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scopedStaffs = useMemo(() => {
    return staffs.filter((s) => {
      if (!isActive(s)) return false;
      if (selectedCo && selectedCo !== '전체') return s.company === selectedCo;
      return true;
    });
  }, [staffs, selectedCo]);

  const fetchToday = useCallback(async () => {
    if (rowsOverride) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setErrorMsg(null);
    try {
      const today = getTodayIso();
      const staffIds = scopedStaffs.map((s) => String(s.id));
      if (staffIds.length === 0) {
        setRows([]);
        return;
      }
      const { data, error } = await supabase
        .from('attendances')
        .select('staff_id, work_date, status, check_in_time, check_out_time')
        .in('staff_id', staffIds)
        .eq('work_date', today);
      if (controller.signal.aborted) return;
      if (error) throw error;
      setRows((data ?? []) as AttendanceRow[]);
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error('[AttendWorkcenter] 대시보드 fetch 실패', error);
      setErrorMsg('근태 데이터를 불러오지 못했습니다.');
      setRows([]);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [scopedStaffs, rowsOverride]);

  useEffect(() => {
    void fetchToday();
    return () => abortRef.current?.abort();
  }, [fetchToday]);

  const effectiveRows = rowsOverride ?? rows;

  const todayIso = useMemo(getTodayIso, []);

  const breakdown = useMemo(
    () => aggregateDeptBreakdown({ staffs: scopedStaffs, rows: effectiveRows, today: todayIso }),
    [scopedStaffs, effectiveRows, todayIso],
  );

  const lateOrAbsent = useMemo(() => {
    const staffMap = new Map(scopedStaffs.map((s) => [String(s.id), s] as const));
    const list: Array<{ id: string; name: string; status: 'late' | 'absent'; checkIn?: string | null }> = [];
    for (const row of effectiveRows) {
      const status = resolveAttendanceStatus(row);
      if (status !== 'late' && status !== 'absent') continue;
      const staff = staffMap.get(String(row.staff_id));
      if (!staff) continue;
      list.push({
        id: String(row.staff_id),
        name: staff.name ?? '직원',
        status,
        checkIn: row.check_in_time,
      });
    }
    return list;
  }, [scopedStaffs, effectiveRows]);

  const counts = useMemo(
    () => aggregateDailyCounts({ staffs: scopedStaffs, rows: effectiveRows, today: todayIso }),
    [scopedStaffs, effectiveRows, todayIso],
  );

  const hourlySlots = useMemo(
    () => aggregateHourlyInOut({ rows: effectiveRows, today: todayIso }),
    [effectiveRows, todayIso],
  );

  const hourlyMax = useMemo(() => {
    let m = 0;
    for (const s of hourlySlots) {
      if (s.in > m) m = s.in;
      if (s.out > m) m = s.out;
    }
    return Math.max(m, 4); // 빈 차트도 너무 납작하지 않게 최소 4명 기준
  }, [hourlySlots]);

  return (
    <section className="flex flex-col gap-3">
      <AttendHourlyChart slots={hourlySlots} maxValue={hourlyMax} todayIso={todayIso} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="app-card flex flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2.5 md:px-4 md:py-3">
          <h3 className="text-[13px] font-bold text-[var(--foreground)]">부서별 출근 현황</h3>
          <span className="text-[11px] font-semibold text-[var(--toss-gray-4)]">{todayIso}</span>
        </header>
        <div className="min-h-0 flex-1 overflow-auto px-3 py-3 md:px-4 md:py-3">
          {errorMsg && (
            <div role="alert" className="mb-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              {errorMsg}{' '}
              <button type="button" onClick={() => void fetchToday()} className="ml-1 font-bold underline">
                다시 시도
              </button>
            </div>
          )}
          {loading && breakdown.length === 0 ? (
            <div className="px-2 py-12 text-center text-[12px] text-[var(--toss-gray-4)]">
              근태 데이터를 불러오는 중…
            </div>
          ) : breakdown.length === 0 ? (
            <div className="px-2 py-12 text-center text-[12px] text-[var(--toss-gray-4)]">
              표시할 부서가 없습니다.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {breakdown.map((d) => {
                const okPct = d.total === 0 ? 0 : (d.ok / d.total) * 100;
                const latePct = d.total === 0 ? 0 : (d.late / d.total) * 100;
                const leavePct = d.total === 0 ? 0 : (d.onLeave / d.total) * 100;
                const absentPct = d.total === 0 ? 0 : (d.absent / d.total) * 100;
                return (
                  <li key={d.dept} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-3 py-2">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-bold text-[var(--foreground)]">{d.dept}</span>
                      <span className="tnum text-[11px] text-[var(--toss-gray-4)]">
                        <span className="font-bold text-emerald-700">{d.ok}</span>
                        {d.late > 0 && <span className="ml-1.5 font-bold text-amber-700">지각 {d.late}</span>}
                        {d.onLeave > 0 && <span className="ml-1.5 font-bold text-[var(--accent)]">휴가 {d.onLeave}</span>}
                        {d.absent > 0 && <span className="ml-1.5 font-bold text-red-700">결근 {d.absent}</span>}
                        <span className="ml-2 text-[var(--toss-gray-4)]">/ {d.total}</span>
                      </span>
                    </div>
                    <div
                      className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]"
                      role="img"
                      aria-label={`${d.dept} 출근 ${d.ok}명 / 지각 ${d.late}명 / 휴가 ${d.onLeave}명 / 결근 ${d.absent}명 / 총 ${d.total}명`}
                    >
                      <span className="h-full bg-emerald-500" style={{ width: `${okPct}%` }} />
                      <span className="h-full bg-amber-500" style={{ width: `${latePct}%` }} />
                      <span className="h-full bg-[var(--accent)]" style={{ width: `${leavePct}%` }} />
                      <span className="h-full bg-red-500" style={{ width: `${absentPct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="app-card flex flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2.5 md:px-4 md:py-3">
          <h3 className="text-[13px] font-bold text-[var(--foreground)]">지각·결근 요약</h3>
          <span className="text-[11px] font-semibold text-[var(--toss-gray-4)]">
            지각 {counts.late} · 결근 {counts.absent}
          </span>
        </header>
        <div className="min-h-0 flex-1 overflow-auto px-3 py-3 md:px-4 md:py-3">
          {lateOrAbsent.length === 0 ? (
            <div className="px-2 py-12 text-center text-[12px] text-[var(--toss-gray-4)]">
              오늘 지각·결근이 없습니다.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {lateOrAbsent.map((item) => {
                const toneCls =
                  item.status === 'late'
                    ? 'bg-amber-500/15 text-amber-700'
                    : 'bg-red-500/15 text-red-700';
                const label = item.status === 'late' ? '지각' : '결근';
                return (
                  <li
                    key={`${item.id}-${item.status}`}
                    className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-2.5 py-2"
                  >
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${toneCls}`}>
                      {label}
                    </span>
                    <div className="min-w-0 flex-1 truncate text-[12px] font-bold text-[var(--foreground)]">
                      {item.name}
                    </div>
                    {item.checkIn && (
                      <span className="tnum shrink-0 text-[11px] font-semibold text-[var(--toss-gray-4)]">
                        {item.checkIn}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      </div>
    </section>
  );
}
