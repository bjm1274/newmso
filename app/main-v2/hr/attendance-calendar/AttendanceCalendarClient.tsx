'use client';

/**
 * AttendanceCalendarClient.tsx — 근태 달력 클라이언트
 *
 * 탭: [개인 / 팀 / 연차]
 * 통합:
 *   - #34 근태달력 (개인 탭)
 *   - 팀 달력 → 팀 탭
 *   - 연차 달력 → 연차 탭
 *
 * JM2: 현재 월 30일만 렌더, 월 전환은 state — 12개월 일괄 렌더 금지
 * JM6: role="grid"/"gridcell", aria-selected, 색+텍스트 라벨 병기
 * 캐린더 키보드: ArrowRight/Left(+1/-1일), ArrowUp/Down(+7/-7일), Enter/Space 선택
 */

import { useState, useCallback, useRef, type KeyboardEvent } from 'react';
import { AttendanceTabs } from '../_shared/AttendanceTabs';
import {
  getV2Employees,
  getV2MonthlyRecords,
  getV2LeaveRequests,
} from '@/lib/data/v2-attendance';
import type { AttendanceStatus } from '@/lib/data/v2-attendance';

const EMPLOYEES     = getV2Employees();
const MONTHLY_RECORDS = getV2MonthlyRecords();
const LEAVE_REQUESTS  = getV2LeaveRequests();

// ── 상수 ─────────────────────────────────────────────────────────────────────

type CalTab = 'personal' | 'team' | 'leave';

// 데모 고정 년월 (더미 데이터 기준)
const DEMO_YEAR  = 2026;
const DEMO_MONTH = 5;   // 1-based

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const;

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

/** 해당 월 1일의 요일 (0=일) */
function firstDayOfWeek(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay();
}

function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ── 상태 스타일 ───────────────────────────────────────────────────────────────

const DOT_COLOR: Record<AttendanceStatus, string> = {
  정상: '#10B981',
  지각: '#F59E0B',
  결근: '#EF4444',
  휴가: '#3B82F6',
};

// ── 선택일 상세 ───────────────────────────────────────────────────────────────

interface DayDetailProps {
  dateStr: string;
  year: number;
  month: number;
}

const STATUS_BADGE: Record<AttendanceStatus, string> = {
  정상: 'badge-green',
  지각: 'badge-yellow',
  결근: 'badge-red',
  휴가: 'badge-blue',
};

function DayDetail({ dateStr, year, month }: DayDetailProps) {
  const records = MONTHLY_RECORDS.filter((r) => r.date === dateStr);
  const d = new Date(year, month - 1, parseInt(dateStr.slice(-2), 10));
  const weekDayLabel = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];

  return (
    <div className="app-card">
      <div className="card-header">
        <span className="card-title">
          {year}년 {month}월 {parseInt(dateStr.slice(-2), 10)}일 ({weekDayLabel}) 상세
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table w-full" aria-label={`${dateStr} 상세`}>
          <thead>
            <tr>
              <th scope="col">이름</th>
              <th scope="col">출근</th>
              <th scope="col">퇴근</th>
              <th scope="col">상태</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => {
              const emp = EMPLOYEES.find((e) => e.id === r.employeeId);
              if (!emp) return null;
              return (
                <tr key={r.employeeId} tabIndex={0}>
                  <td>{emp.name}</td>
                  <td>{r.checkIn ?? '—'}</td>
                  <td>{r.checkOut ?? '—'}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[r.status]}`}>
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{ background: DOT_COLOR[r.status] }}
                        aria-hidden="true"
                      />
                      {r.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 달력 그리드 ───────────────────────────────────────────────────────────────

interface CalGridProps {
  year: number;
  month: number;
  selectedDate: string;
  onSelect: (dateStr: string) => void;
  /** 각 날짜에 표시할 도트 색상 배열 */
  dotsForDate: (dateStr: string) => readonly string[];
  /** 연차 달력용 바 렌더 */
  barForDate?: (dateStr: string) => string | null;
  gridLabel: string;
}

function CalGrid({
  year, month, selectedDate, onSelect, dotsForDate, barForDate, gridLabel,
}: CalGridProps) {
  const totalDays = daysInMonth(year, month);
  const startDow  = firstDayOfWeek(year, month);
  const gridRef   = useRef<HTMLDivElement>(null);

  /** 선택 날짜 → day number (1-based) */
  const selectedDay = selectedDate.startsWith(`${year}-${String(month).padStart(2,'0')}`)
    ? parseInt(selectedDate.slice(-2), 10)
    : null;

  /**
   * 키보드 네비게이션
   * Arrow{Right/Left}: ±1일, Arrow{Up/Down}: ±7일, Enter/Space: 선택
   * 월 범위를 벗어나면 이동 무시 (JM2: 현재 월만 렌더)
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>, day: number) => {
      let delta = 0;
      if (e.key === 'ArrowRight') delta = 1;
      else if (e.key === 'ArrowLeft') delta = -1;
      else if (e.key === 'ArrowDown') delta = 7;
      else if (e.key === 'ArrowUp') delta = -7;
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(toDateStr(year, month, day));
        return;
      } else return;

      e.preventDefault();
      const next = day + delta;
      if (next < 1 || next > totalDays) return;
      onSelect(toDateStr(year, month, next));
      // 포커스 이동
      const nextCell = gridRef.current?.querySelector<HTMLElement>(
        `[data-day="${next}"]`,
      );
      nextCell?.focus();
    },
    [year, month, totalDays, onSelect],
  );

  // 앞 공백 셀 (이전 달)
  const leadingBlanks = Array.from({ length: startDow });
  const days = Array.from({ length: totalDays }, (_, i) => i + 1);

  const today = new Date();
  const isThisMonth = today.getFullYear() === year && today.getMonth() + 1 === month;

  return (
    <div>
      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 px-3 pt-2 pb-1" aria-hidden="true">
        {DAY_NAMES.map((d, i) => (
          <div
            key={d}
            className={[
              'text-center text-[11px] font-semibold py-1',
              i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-[var(--toss-gray-4)]',
            ].join(' ')}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div
        ref={gridRef}
        role="grid"
        aria-label={gridLabel}
        className="grid grid-cols-7 gap-0.5 px-3 pb-3"
      >
        {/* 앞 공백 */}
        {leadingBlanks.map((_, i) => (
          <div key={`blank-${i}`} role="gridcell" aria-hidden="true" />
        ))}

        {days.map((day) => {
          const dateStr    = toDateStr(year, month, day);
          const isToday    = isThisMonth && today.getDate() === day;
          const isSelected = selectedDay === day;
          const dots       = dotsForDate(dateStr);
          const bar        = barForDate?.(dateStr) ?? null;
          const dow        = (startDow + day - 1) % 7;

          return (
            <div
              key={day}
              role="gridcell"
              data-day={day}
              aria-selected={isSelected}
              aria-label={`${month}월 ${day}일${isToday ? ' (오늘)' : ''}${isSelected ? ' 선택됨' : ''}`}
              tabIndex={isSelected || (!selectedDay && day === 1) ? 0 : -1}
              onClick={() => onSelect(dateStr)}
              onKeyDown={(e) => handleKeyDown(e, day)}
              className={[
                'relative flex flex-col items-center rounded-[var(--radius-md)] p-1 min-h-[52px] cursor-pointer',
                'transition-colors hover:bg-[var(--muted)]',
                'focus:outline-2 focus:outline-[var(--accent)] focus:outline-offset-[-2px] focus:bg-blue-50 dark:focus:bg-blue-950',
                isSelected ? 'bg-blue-50 border border-blue-200 dark:bg-blue-950 dark:border-blue-800' : '',
              ].join(' ')}
            >
              <span
                className={[
                  'flex h-[22px] w-[22px] items-center justify-center text-[12px] font-medium',
                  isToday ? 'rounded-full bg-[var(--accent)] text-white' : '',
                  dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : '',
                ].join(' ')}
              >
                {day}
              </span>
              {/* 상태 도트 (색+텍스트 aria-label로 병기) */}
              {dots.length > 0 && (
                <div className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                  {dots.map((color, idx) => (
                    <span
                      key={idx}
                      className="inline-block h-[5px] w-[5px] rounded-full"
                      style={{ background: color }}
                      aria-hidden="true"
                    />
                  ))}
                </div>
              )}
              {/* 연차 이벤트 바 */}
              {bar && (
                <div
                  className="mt-0.5 h-1 w-full rounded-[2px]"
                  style={{ background: bar }}
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

const CAL_TABS: Array<{ id: CalTab; label: string }> = [
  { id: 'personal', label: '개인' },
  { id: 'team',     label: '팀' },
  { id: 'leave',    label: '연차' },
];

export function AttendanceCalendarClient() {
  const [calTab,       setCalTab]       = useState<CalTab>('personal');
  const [selectedDate, setSelectedDate] = useState<string>(toDateStr(DEMO_YEAR, DEMO_MONTH, 11));
  // JM2: year/month state — 현재 월만 렌더, 월 전환 시 새 month로 교체
  const [viewYear,  setViewYear]  = useState(DEMO_YEAR);
  const [viewMonth, setViewMonth] = useState(DEMO_MONTH);

  const goPrev = () => {
    if (viewMonth === 1) { setViewYear((y) => y - 1); setViewMonth(12); }
    else setViewMonth((m) => m - 1);
  };
  const goNext = () => {
    if (viewMonth === 12) { setViewYear((y) => y + 1); setViewMonth(1); }
    else setViewMonth((m) => m + 1);
  };

  /** 개인 달력: 선택된 직원(e01 고정 데모)의 날짜별 도트 */
  const personalDots = useCallback(
    (dateStr: string): readonly string[] => {
      const rec = MONTHLY_RECORDS.find(
        (r) => r.date === dateStr && r.employeeId === 'e01',
      );
      if (!rec) return [];
      return [DOT_COLOR[rec.status]];
    },
    [],
  );

  /** 팀 달력: 날짜별 모든 직원 상태 도트 (최대 4개) */
  const teamDots = useCallback(
    (dateStr: string): readonly string[] => {
      const recs = MONTHLY_RECORDS.filter((r) => r.date === dateStr);
      return recs.slice(0, 4).map((r) => DOT_COLOR[r.status]);
    },
    [],
  );

  /** 연차 달력: 연차 바 색상 */
  const leaveBar = useCallback(
    (dateStr: string): string | null => {
      const req = LEAVE_REQUESTS.find(
        (r) => dateStr >= r.startDate && dateStr <= r.endDate,
      );
      if (!req) return null;
      return req.status === '승인' ? '#3B82F6' : '#F59E0B';
    },
    [],
  );

  const monthLabel = `${viewYear}년 ${viewMonth}월`;

  return (
    <div className="flex flex-col">
      <AttendanceTabs />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_320px] items-start">
          {/* 달력 카드 */}
          <div className="app-card">
            {/* 달력 헤더: 월 네비 + 탭 */}
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={goPrev}
                  aria-label="이전 달"
                  className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] text-sm hover:bg-[var(--muted)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                >
                  ‹
                </button>
                <span
                  className="w-28 text-center text-base font-bold"
                  aria-live="polite"
                >
                  {monthLabel}
                </span>
                <button
                  type="button"
                  onClick={goNext}
                  aria-label="다음 달"
                  className="flex h-8 w-8 items-center justify-content rounded-[var(--radius-md)] border border-[var(--border)] text-sm hover:bg-[var(--muted)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                >
                  ›
                </button>
              </div>

              {/* 달력 내부 탭 */}
              <div role="tablist" aria-label="달력 보기 탭" className="flex gap-1">
                {CAL_TABS.map(({ id, label }) => {
                  const active = id === calTab;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setCalTab(id)}
                      className={[
                        'rounded-[var(--radius-md)] px-3 py-1 text-xs font-medium transition-colors',
                        'focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
                        active
                          ? 'bg-[var(--accent)] text-white'
                          : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]',
                      ].join(' ')}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 탭별 달력 그리드 */}
            {calTab === 'personal' && (
              <div role="tabpanel" aria-label="개인 달력">
                <CalGrid
                  year={viewYear}
                  month={viewMonth}
                  selectedDate={selectedDate}
                  onSelect={setSelectedDate}
                  dotsForDate={personalDots}
                  gridLabel={`${monthLabel} 개인 근태 달력`}
                />
              </div>
            )}
            {calTab === 'team' && (
              <div role="tabpanel" aria-label="팀 달력">
                <CalGrid
                  year={viewYear}
                  month={viewMonth}
                  selectedDate={selectedDate}
                  onSelect={setSelectedDate}
                  dotsForDate={teamDots}
                  gridLabel={`${monthLabel} 팀 근태 달력`}
                />
              </div>
            )}
            {calTab === 'leave' && (
              <div role="tabpanel" aria-label="연차 달력">
                <p className="px-5 pt-3 text-xs text-[var(--toss-gray-4)]">
                  파란 바: 승인된 연차 / 노란 바: 대기 중 연차
                </p>
                <CalGrid
                  year={viewYear}
                  month={viewMonth}
                  selectedDate={selectedDate}
                  onSelect={setSelectedDate}
                  dotsForDate={() => []}
                  barForDate={leaveBar}
                  gridLabel={`${monthLabel} 연차 달력`}
                />
              </div>
            )}

            {/* 범례 */}
            <div
              className="flex flex-wrap gap-4 border-t border-[var(--border)] px-5 py-3"
              aria-label="달력 범례"
            >
              {(['정상', '지각', '결근', '휴가'] as const).map((s) => (
                <span key={s} className="flex items-center gap-1.5 text-xs">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: DOT_COLOR[s] }}
                    aria-hidden="true"
                  />
                  {s === '정상' ? '정상 출근' : s}
                </span>
              ))}
            </div>
          </div>

          {/* 선택일 상세 + 월 통계 */}
          <div className="space-y-4">
            <DayDetail dateStr={selectedDate} year={viewYear} month={viewMonth} />
            <div className="app-card">
              <div className="card-header">
                <span className="card-title">이번 달 통계</span>
              </div>
              <dl className="divide-y divide-[var(--border)]">
                {[
                  { label: '출근률',    value: '96.2%' },
                  { label: '지각 건수', value: '5건' },
                  { label: '결근 건수', value: '2건' },
                  { label: '승인된 연차', value: '12건' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between px-5 py-2 text-sm">
                    <dt>{label}</dt>
                    <dd className="font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
