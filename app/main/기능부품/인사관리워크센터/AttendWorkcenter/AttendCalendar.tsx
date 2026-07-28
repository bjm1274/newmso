'use client';

/**
 * AttendWorkcenter — 달력 탭
 *
 * - 월간 캘린더 (월~일 7열) + 일별 정상/지각/결근 카운트
 * - 데이터: `attendances` 테이블에서 해당 월 fetch
 * - 일별 상세: 날짜 셀 클릭 또는 상단 일/주/월 버튼 → AttendCalendarDetail
 *   (이미 불러온 월 단위 rows 로 그리므로 추가 쿼리 없음)
 *
 * JM2: 월 변경 시 AbortController로 이전 fetch 취소
 * JM3: fetch 에러 inline 메시지
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { db } from '@/lib/db-client';
import type { StaffMember } from '@/types';
import { getKoreanPublicHolidayName } from '@/lib/korean-public-holidays';
import { isActive } from '../MemberWorkcenter/data';
import AttendCalendarDetail, { type DetailRange } from './AttendCalendarDetail';
import {
  formatIsoDate,
  resolveAttendanceStatus,
  type AttendanceRow } from './data';

interface AttendCalendarProps {
  staffs: StaffMember[];
  selectedCo?: string;
  /** @deprecated 레거시 근태관리메인 진입용. 상세가 이 컴포넌트에 내장되어 더 이상 쓰지 않는다. */
  onOpenLegacyCalendar?: () => void;
}

interface DailyAggregate {
  ok: number;
  late: number;
  absent: number;
  onLeave: number;
}

const WEEK_HEADERS = ['월', '화', '수', '목', '금', '토', '일'] as const;

export default function AttendCalendar({ staffs, selectedCo, onOpenLegacyCalendar }: AttendCalendarProps) {
  const [monthAnchor, setMonthAnchor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** 일별 상세 — 선택 날짜와 범위(일/주/월). null 이면 닫힘. */
  const [detailIso, setDetailIso] = useState<string | null>(null);
  const [detailRange, setDetailRange] = useState<DetailRange>('day');
  /** 상단 일/주/월 진입 버튼 노출 여부 */
  const [detailOpen, setDetailOpen] = useState(false);

  const scopedStaffs = useMemo(() => {
    return staffs.filter((s) => {
      if (!isActive(s)) return false;
      if (selectedCo && selectedCo !== '전체') return s.company === selectedCo;
      return true;
    });
  }, [staffs, selectedCo]);

  const monthInfo = useMemo(() => {
    const year = monthAnchor.getFullYear();
    const month = monthAnchor.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    return {
      year,
      month,
      firstIso: formatIsoDate(firstDay),
      lastIso: formatIsoDate(lastDay),
      daysInMonth: lastDay.getDate(),
      // 월요일=0 기준 (월~일)
      startWeekday: (firstDay.getDay() + 6) % 7 };
  }, [monthAnchor]);

  const fetchMonth = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setErrorMsg(null);
    try {
      const staffIds = scopedStaffs.map((s) => String(s.id));
      if (staffIds.length === 0) {
        setRows([]);
        return;
      }
      const { data, error } = await db
        .from('attendances')
        .select('staff_id, work_date, status, check_in_time, check_out_time')
        .in('staff_id', staffIds)
        .gte('work_date', monthInfo.firstIso)
        .lte('work_date', monthInfo.lastIso);
      if (controller.signal.aborted) return;
      if (error) throw error;
      setRows((data ?? []) as AttendanceRow[]);
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error('[AttendWorkcenter] 달력 fetch 실패', error);
      setErrorMsg('근태 데이터를 불러오지 못했습니다.');
      setRows([]);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [scopedStaffs, monthInfo.firstIso, monthInfo.lastIso]);

  useEffect(() => {
    void fetchMonth();
    return () => abortRef.current?.abort();
  }, [fetchMonth]);

  const byDate = useMemo(() => {
    const map = new Map<string, DailyAggregate>();
    for (const row of rows) {
      const date = String(row.work_date ?? '');
      if (!date) continue;
      const dow = new Date(date).getDay();
      const status = resolveAttendanceStatus(row, dow === 0 || dow === 6);
      if (!map.has(date)) map.set(date, { ok: 0, late: 0, absent: 0, onLeave: 0 });
      const entry = map.get(date)!;
      if (status === 'present' || status === 'early_leave') entry.ok += 1;
      else if (status === 'late') {
        entry.ok += 1;
        entry.late += 1;
      } else if (status === 'absent') entry.absent += 1;
      else if (status === 'annual_leave' || status === 'sick_leave' || status === 'half_leave') {
        entry.onLeave += 1;
      }
    }
    return map;
  }, [rows]);

  const todayIso = useMemo(() => formatIsoDate(new Date()), []);

  const moveMonth = useCallback((delta: number) => {
    setMonthAnchor((prev) => {
      const next = new Date(prev);
      next.setMonth(prev.getMonth() + delta);
      next.setDate(1);
      return next;
    });
  }, []);

  // 35칸 그리드 (5주) — 모자라면 42칸으로 확장
  const cells = useMemo(() => {
    const total = monthInfo.startWeekday + monthInfo.daysInMonth;
    const rowsNeeded = Math.ceil(total / 7);
    const slots = rowsNeeded * 7;
    const items: Array<{ iso: string | null; day: number | null; dow: number }> = [];
    for (let i = 0; i < slots; i += 1) {
      const dow = i % 7;
      const dayIndex = i - monthInfo.startWeekday;
      if (dayIndex < 0 || dayIndex >= monthInfo.daysInMonth) {
        items.push({ iso: null, day: null, dow });
        continue;
      }
      const day = dayIndex + 1;
      const iso = `${monthInfo.year}-${String(monthInfo.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      items.push({ iso, day, dow });
    }
    return items;
  }, [monthInfo]);

  return (
    <section className="app-card flex min-h-0 flex-col overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2.5 md:px-4 md:py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-bold text-[var(--foreground)]">
            {monthInfo.year}년 {monthInfo.month + 1}월 근태 달력
          </h3>
          {loading && (
            <span className="text-[11px] font-semibold text-[var(--toss-gray-4)]">불러오는 중…</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => moveMonth(-1)}
            aria-label="이전 달"
            className="rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1 text-[12px] font-semibold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => moveMonth(1)}
            aria-label="다음 달"
            className="rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1 text-[12px] font-semibold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
          >
            ›
          </button>
          <button
            type="button"
            onClick={() => {
              const d = new Date();
              d.setDate(1);
              setMonthAnchor(d);
            }}
            className="rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1 text-[12px] font-semibold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
          >
            오늘
          </button>
          {/*
            "일별 상세" — 누르면 일/주/월 진입 버튼이 펼쳐진다.
            예전에는 onOpenLegacyCalendar prop 이 넘어올 때만 렌더돼, 호출부가 그걸 주지 않아
            버튼 자체가 영영 보이지 않았다(기능 소실의 1차 원인).
          */}
          <button
            type="button"
            onClick={() => setDetailOpen((prev) => !prev)}
            aria-expanded={detailOpen}
            className="ml-2 rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-[12px] font-bold text-white hover:bg-[var(--accent-hover)]"
          >
            일별 상세
          </button>
          {detailOpen && (
            <div className="flex items-center gap-1">
              {(['day', 'week', 'month'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  data-testid={`attendance-calendar-open-${key}`}
                  onClick={() => {
                    setDetailRange(key);
                    setDetailIso((prev) => prev ?? todayIso);
                  }}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1 text-[12px] font-semibold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                >
                  {key === 'day' ? '일' : key === 'week' ? '주' : '월'}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {errorMsg && (
        <div role="alert" className="border-b border-[var(--border)] bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {errorMsg}
          <button type="button" onClick={() => void fetchMonth()} className="ml-2 font-bold underline">
            다시 시도
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto p-3 md:p-4">
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-4)]">
          {WEEK_HEADERS.map((label, idx) => (
            <div key={label} className={`px-1 py-1.5 ${idx >= 5 ? 'text-red-700' : ''}`}>
              {label}
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((cell, idx) => {
            if (cell.iso === null) {
              return <div key={`empty-${idx}`} className="min-h-[64px] rounded-[var(--radius-md)] bg-transparent" />;
            }
            const isToday = cell.iso === todayIso;
            const isWeekend = cell.dow >= 5;
            const holidayName = getKoreanPublicHolidayName(cell.iso);
            const isHoliday = Boolean(holidayName);
            const stats = byDate.get(cell.iso);
            return (
              // 날짜 셀 클릭 → 그 날의 일별 상세. 예전에는 onClick 자체가 없어 눌러도 반응이 없었다.
              <button
                key={cell.iso}
                type="button"
                data-testid={`attendance-calendar-cell-${cell.iso}`}
                onClick={() => {
                  setDetailIso(cell.iso);
                  setDetailRange('day');
                  setDetailOpen(true);
                }}
                aria-label={`${cell.iso} 근태 상세 보기`}
                className={`flex min-h-[64px] flex-col gap-1 rounded-[var(--radius-md)] border px-1.5 py-1 text-left hover:border-[var(--accent)] ${
                  isToday
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : isHoliday
                      ? 'border-red-200 bg-red-50/40'
                      : 'border-[var(--border)] bg-[var(--page-bg)]'
                }`}
              >
                <div
                  className={`text-[11px] font-bold ${
                    isToday ? 'text-[var(--accent)]' : isWeekend || isHoliday ? 'text-red-700' : 'text-[var(--foreground)]'
                  }`}
                >
                  {cell.day}
                </div>
                {holidayName && (
                  <span
                    title={holidayName}
                    className="truncate rounded-[var(--radius-sm,4px)] bg-red-100 px-1 py-0.5 text-[9.5px] font-bold text-red-700"
                  >
                    {holidayName}
                  </span>
                )}
                {stats && (
                  <div className="flex flex-col gap-0.5 text-[10px] font-semibold">
                    {stats.ok > 0 && (
                      <span className="truncate text-emerald-700">정상 {stats.ok}</span>
                    )}
                    {stats.late > 0 && (
                      <span className="truncate text-amber-700">지각 {stats.late}</span>
                    )}
                    {stats.absent > 0 && (
                      <span className="truncate text-red-700">결근 {stats.absent}</span>
                    )}
                    {stats.onLeave > 0 && (
                      <span className="truncate text-[var(--accent)]">휴가 {stats.onLeave}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {detailIso && (
        <AttendCalendarDetail
          selectedIso={detailIso}
          range={detailRange}
          onRangeChange={setDetailRange}
          onClose={() => setDetailIso(null)}
          rows={rows}
          staffs={scopedStaffs}
        />
      )}
    </section>
  );
}
