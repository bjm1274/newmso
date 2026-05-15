'use client';

/**
 * 모바일근무표 — Phase3 §3 (근태 통합 2/3)
 *
 * 직원 본인의 월간 근무표(D/E/N/OFF/LEAVE/TRAINING)를 모바일 친화 UI로 조회.
 * 데스크탑 간호근무표(인사관리서브/간호근무표.tsx)는 관리자 편성 도구로 유지하고,
 * 본 화면은 "내 근무만, 큰 셀, 통계 카드, 빠른 월 이동" 에 집중한다.
 *
 * - JM:  단일 책임 (본인 근무표 조회), ~280줄
 * - JM3: supabase 실패는 inline 메시지로 노출, fetch 결과 없으면 빈 상태
 * - JM4: props 명시, any 금지, ShiftRole 재정의 대신 동일 형태 로컬 타입 (간호근무표.tsx와 동기)
 * - JM6: CalendarTable 자체 a11y, 월 전환 버튼 aria-label, ShiftBlock에 aria-label
 *
 * nurse_schedules 스키마: (staff_id uuid, year_month text 'YYYY-MM', day int, shift_code text)
 * shift_code 정규화: O→OFF, H→LEAVE, S→TRAINING, 그 외는 그대로
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CalendarTable, type CalendarCellInfo, type CalendarCellTone } from '@/app/components/CalendarTable';
import { SwipeableKpiCards, type KpiCard } from '@/app/components/SwipeableKpiCards';

export type 모바일근무표Props = {
  /** 본인 직원 ID (staff_members.id). 없으면 빈 화면. */
  staffId: string | null | undefined;
  /** 헤더에 표시할 직원명 (선택) */
  staffName?: string;
  /** 초기 월 (YYYY-MM). 미지정 시 이번 달. */
  initialMonth?: string;
  /** 근무 교대 요청 트리거 (선택). 없으면 버튼 숨김. */
  onRequestSwap?: () => void;
};

type ShiftRole = 'D' | 'E' | 'N' | 'OFF' | 'LEAVE' | 'TRAINING';
type ScheduleByDay = Record<number, ShiftRole>;

type NurseScheduleRow = {
  day: number | string;
  shift_code: string | null;
};

const ROLE_META: Record<ShiftRole, { label: string; short: string; bg: string; text: string }> = {
  D:        { label: '데이',   short: 'D',   bg: 'bg-sky-500',     text: 'text-white' },
  E:        { label: '이브닝', short: 'E',   bg: 'bg-amber-400',   text: 'text-amber-900' },
  N:        { label: '나이트', short: 'N',   bg: 'bg-indigo-700',  text: 'text-indigo-100' },
  OFF:      { label: '오프',   short: '오프', bg: 'bg-transparent', text: 'text-[var(--toss-gray-3)]' },
  LEAVE:    { label: '휴가',   short: '휴가', bg: 'bg-emerald-400', text: 'text-white' },
  TRAINING: { label: '교육',   short: '교육', bg: 'bg-yellow-400',  text: 'text-yellow-900' },
};

function normalizeShiftCode(code: string | null | undefined): ShiftRole {
  const c = String(code ?? '').trim().toUpperCase();
  if (c === 'O') return 'OFF';
  if (c === 'H') return 'LEAVE';
  if (c === 'S') return 'TRAINING';
  if (c === 'D' || c === 'E' || c === 'N' || c === 'OFF' || c === 'LEAVE' || c === 'TRAINING') {
    return c as ShiftRole;
  }
  return 'OFF';
}

function formatYearMonth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function parseYearMonth(ym: string): { year: number; month: number } {
  const [y, m] = ym.split('-');
  return { year: Number(y), month: Number(m) };
}

function getMonthRange(ym: string): { start: Date; end: Date } {
  const { year, month } = parseYearMonth(ym);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0); // 말일
  return { start, end };
}

function shiftMonthString(ym: string, offset: number): string {
  const { year, month } = parseYearMonth(ym);
  const d = new Date(year, month - 1 + offset, 1);
  return formatYearMonth(d);
}

// ─────────────────────── 셀 ───────────────────────
function ShiftBlock({ role }: { role: ShiftRole }) {
  const meta = ROLE_META[role];
  if (role === 'OFF') {
    return (
      <span
        aria-label="오프"
        className="inline-flex items-center justify-center w-full h-9 text-[10px] text-[var(--toss-gray-3)] font-bold"
      >
        —
      </span>
    );
  }
  return (
    <span
      aria-label={meta.label}
      className={`inline-flex items-center justify-center w-full h-9 rounded-[var(--radius-md)] font-black text-[11px] tracking-tight ${meta.bg} ${meta.text}`}
    >
      {meta.short}
    </span>
  );
}

function getShiftTone(role: ShiftRole): CalendarCellTone {
  if (role === 'N') return 'warn';      // 야간은 시각 강조
  if (role === 'LEAVE') return 'ok';
  if (role === 'TRAINING') return 'warn';
  return 'normal';
}

// ─────────────────────── 메인 ───────────────────────
export default function 모바일근무표({
  staffId,
  staffName,
  initialMonth,
  onRequestSwap,
}: 모바일근무표Props) {
  const [month, setMonth] = useState<string>(() => initialMonth ?? formatYearMonth(new Date()));
  const [scheduleByDay, setScheduleByDay] = useState<ScheduleByDay>({});
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 월별 데이터 fetch (본인 staff_id 한정)
  useEffect(() => {
    if (!staffId) {
      setScheduleByDay({});
      setErrorMessage(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('nurse_schedules')
          .select('day, shift_code')
          .eq('staff_id', staffId)
          .eq('year_month', month);
        if (cancelled) return;
        if (error) throw error;
        const map: ScheduleByDay = {};
        ((data ?? []) as NurseScheduleRow[]).forEach((row) => {
          const d = Number(row.day);
          if (!Number.isFinite(d)) return;
          map[d] = normalizeShiftCode(row.shift_code);
        });
        setScheduleByDay(map);
      } catch (err) {
        if (!cancelled) {
          setErrorMessage((err as Error)?.message ?? '근무표를 불러오지 못했습니다.');
          setScheduleByDay({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [staffId, month]);

  // 통계
  const counts = useMemo(() => {
    const init: Record<ShiftRole, number> = { D: 0, E: 0, N: 0, OFF: 0, LEAVE: 0, TRAINING: 0 };
    Object.values(scheduleByDay).forEach((role) => {
      init[role]++;
    });
    return init;
  }, [scheduleByDay]);

  const totalWorkDays = counts.D + counts.E + counts.N;

  const kpiCards: KpiCard[] = useMemo(
    () => [
      { id: 'total', label: '총 근무일', value: `${totalWorkDays}일` },
      { id: 'day', label: 'D (데이)', value: `${counts.D}일` },
      { id: 'evening', label: 'E (이브닝)', value: `${counts.E}일` },
      { id: 'night', label: 'N (나이트)', value: `${counts.N}일` },
      { id: 'off', label: 'OFF', value: `${counts.OFF}일` },
      { id: 'leave', label: '휴가', value: `${counts.LEAVE}일` },
    ],
    [counts, totalWorkDays],
  );

  const { start, end } = useMemo(() => getMonthRange(month), [month]);
  const { year: ymYear, month: ymMonth } = parseYearMonth(month);

  // 날짜별 shift 조회
  const getShiftForDate = (date: Date): ShiftRole => {
    if (date.getFullYear() !== ymYear || date.getMonth() + 1 !== ymMonth) return 'OFF';
    return scheduleByDay[date.getDate()] ?? 'OFF';
  };

  const renderCell = (cell: CalendarCellInfo) => {
    const role = getShiftForDate(cell.date);
    return (
      <div className="flex flex-col items-center gap-1 py-1">
        <span
          className={`text-[10px] font-bold ${
            cell.date.getDay() === 0
              ? 'text-red-500'
              : cell.date.getDay() === 6
                ? 'text-blue-500'
                : 'text-[var(--toss-gray-4)]'
          } ${cell.isCurrentMonth ? '' : 'opacity-40'}`}
        >
          {cell.date.getDate()}
        </span>
        {cell.isCurrentMonth && <ShiftBlock role={role} />}
      </div>
    );
  };

  const cellToneFn = (cell: CalendarCellInfo): CalendarCellTone => {
    if (!cell.isCurrentMonth) return 'muted';
    return getShiftTone(getShiftForDate(cell.date));
  };

  const handlePrevMonth = () => setMonth((m) => shiftMonthString(m, -1));
  const handleNextMonth = () => setMonth((m) => shiftMonthString(m, 1));
  const handleThisMonth = () => setMonth(formatYearMonth(new Date()));

  if (!staffId) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-sm text-[var(--toss-gray-3)]">
        <p className="font-bold">직원 계정 정보를 확인할 수 없습니다.</p>
        <p>로그인 상태를 다시 확인해주세요.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* 헤더 */}
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">
            나의 근무표
          </p>
          <p className="mt-0.5 truncate text-base font-bold text-[var(--foreground)]">
            {staffName ?? '본인'} · {ymYear}년 {ymMonth}월
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handlePrevMonth}
            aria-label="이전 달"
            className="h-9 w-9 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-sm font-bold text-[var(--foreground)] hover:bg-[var(--muted)]"
          >
            ◀
          </button>
          <button
            type="button"
            onClick={handleThisMonth}
            aria-label="이번 달로 이동"
            className="h-9 px-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-[12px] font-bold text-[var(--foreground)] hover:bg-[var(--muted)]"
          >
            오늘
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            aria-label="다음 달"
            className="h-9 w-9 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-sm font-bold text-[var(--foreground)] hover:bg-[var(--muted)]"
          >
            ▶
          </button>
        </div>
      </header>

      {/* 에러 / 로딩 상태 */}
      {errorMessage && (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700"
        >
          {errorMessage}
        </div>
      )}

      {/* 통계 카드 */}
      <SwipeableKpiCards cards={kpiCards} ariaLabel={`${ymYear}년 ${ymMonth}월 근무 통계`} />

      {/* 캘린더 */}
      <section aria-label={`${ymYear}년 ${ymMonth}월 근무표`}>
        {loading ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-6 text-center text-[12px] font-semibold text-[var(--toss-gray-3)]">
            근무표를 불러오는 중...
          </div>
        ) : (
          <CalendarTable
            mode="month-grid"
            startDate={start}
            endDate={end}
            renderCell={renderCell}
            cellTone={cellToneFn}
            ariaLabel={`${ymYear}년 ${ymMonth}월 본인 근무 일정`}
            emptyMessage="이 달의 근무표가 아직 편성되지 않았습니다."
          />
        )}
      </section>

      {/* 범례 */}
      <ul className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-[var(--toss-gray-4)]">
        {(['D', 'E', 'N', 'LEAVE', 'TRAINING'] as ShiftRole[]).map((role) => {
          const meta = ROLE_META[role];
          return (
            <li key={role} className="flex items-center gap-1.5">
              <span
                className={`inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded-[var(--radius-md)] px-1 text-[10px] font-black ${meta.bg} ${meta.text}`}
              >
                {meta.short}
              </span>
              <span>{meta.label}</span>
            </li>
          );
        })}
      </ul>

      {/* 근무 교대 요청 */}
      {onRequestSwap && (
        <button
          type="button"
          onClick={onRequestSwap}
          className="h-12 rounded-[var(--radius-lg)] border border-[var(--accent)] bg-[var(--card)] text-sm font-bold text-[var(--accent)] hover:bg-[var(--accent-light)]"
        >
          근무 교대 요청
        </button>
      )}
    </div>
  );
}
