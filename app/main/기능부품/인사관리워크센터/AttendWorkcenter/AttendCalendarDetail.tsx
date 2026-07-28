'use client';

/**
 * 근태 달력 — 일별 상세 모달.
 *
 * 복구 배경
 * --------
 * 이 기능은 원래 `인사관리서브/근태기록/근태달력뷰.tsx` 에 있었는데,
 *  1) 커밋 34a1f8b6 에서 진입 경로(`onOpenLegacyCalendar` prop 전달)가 끊기고
 *  2) 커밋 f5f7d648 에서 "참조 없는 죽은 코드" 로 판정돼 파일이 삭제되면서
 * 화면에서 사라졌다. E2E 스펙(`tests/e2e/attendance-calendar.desktop.spec.ts`)은
 * 그대로 남아 이 기능을 계속 검증하고 있었다.
 *
 * 레거시 3천 줄을 되살리는 대신, **달력이 이미 조회해 둔 월 단위 `rows`** 만으로
 * 일/주/월 패널을 다시 구성한다. 추가 쿼리가 없고 존재하지 않는 컬럼도 읽지 않는다.
 * (`attendances` 에는 late_minutes / early_leave_minutes 컬럼이 실재하지 않는다.)
 *
 * testid 는 기존 E2E 계약을 그대로 따른다 — 그래야 이 스펙이 회귀 게이트로 되살아난다.
 */

import { useMemo } from 'react';
import type { StaffMember } from '@/types';
import {
  formatIsoDate,
  isWeekendDate,
  resolveAttendanceStatus,
  type AttendanceRow,
  type AttendanceStatus } from './data';

export type DetailRange = 'day' | 'week' | 'month';

interface AttendCalendarDetailProps {
  /** 선택된 날짜 (YYYY-MM-DD) */
  selectedIso: string;
  range: DetailRange;
  onRangeChange: (range: DetailRange) => void;
  onClose: () => void;
  /** 달력이 이미 불러온 해당 월 전체 근태 행 */
  rows: AttendanceRow[];
  /** 회사/재직 필터가 적용된 대상 직원 */
  staffs: StaffMember[];
}

/** 상태 → 한글 라벨. E2E 가 '정상 출근'·'지각'·'연차'·'결근' 문구를 확인한다. */
const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: '정상 출근',
  late: '지각',
  early_leave: '조퇴',
  absent: '결근',
  annual_leave: '연차',
  sick_leave: '병가',
  half_leave: '반차',
  holiday: '휴일',
  missing: '미기록' };

const STATUS_TONE: Record<AttendanceStatus, string> = {
  present: 'text-emerald-700',
  late: 'text-amber-700',
  early_leave: 'text-amber-700',
  absent: 'text-red-700',
  annual_leave: 'text-[var(--accent)]',
  sick_leave: 'text-[var(--accent)]',
  half_leave: 'text-[var(--accent)]',
  holiday: 'text-[var(--toss-gray-4)]',
  missing: 'text-[var(--toss-gray-4)]' };

/** 표시용 시각 — 'HH:MM' 만 남긴다. */
function formatTime(value?: string | null): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '-';
  const match = raw.match(/(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : raw;
}

/**
 * 선택일이 속한 주의 ISO 날짜 7개.
 *
 * **일요일 시작**이다 — 삭제된 원본(`근태기록/근태관리메인-내부유틸.ts` 의 `buildWeekDates`)이
 * `start.setDate(base.getDate() - base.getDay())` 로 일요일을 주 시작으로 삼았고,
 * 복구하면서 그 규칙을 그대로 유지한다(달력 그리드가 월~일 표시인 것과는 별개).
 */
function weekIsoRange(iso: string): string[] {
  const base = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(base.getTime())) return [iso];
  const sunday = new Date(base);
  sunday.setDate(base.getDate() - base.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return formatIsoDate(d);
  });
}

export default function AttendCalendarDetail({
  selectedIso,
  range,
  onRangeChange,
  onClose,
  rows,
  staffs }: AttendCalendarDetailProps) {
  const staffNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of staffs) map.set(String(s.id), String(s.name ?? '이름 없음'));
    return map;
  }, [staffs]);

  /** 범위에 포함되는 날짜 집합 */
  const scopeDates = useMemo(() => {
    if (range === 'day') return new Set([selectedIso]);
    if (range === 'week') return new Set(weekIsoRange(selectedIso));
    // month — 선택일과 같은 연-월 전체
    return null; // null 이면 접두사 비교로 처리
  }, [range, selectedIso]);

  const monthPrefix = selectedIso.slice(0, 7);

  const scopedRows = useMemo(() => {
    return rows.filter((row) => {
      const date = String(row.work_date ?? '');
      if (!date) return false;
      if (scopeDates) return scopeDates.has(date);
      return date.startsWith(monthPrefix);
    });
  }, [rows, scopeDates, monthPrefix]);

  /** 상태별 집계 — 주/월 패널의 요약 */
  const statusCounts = useMemo(() => {
    const counts = new Map<AttendanceStatus, number>();
    for (const row of scopedRows) {
      const status = resolveAttendanceStatus(row, isWeekendDate(String(row.work_date ?? '')));
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return counts;
  }, [scopedRows]);

  /** 일 패널: 직원별 한 줄 */
  const dayEntries = useMemo(() => {
    return scopedRows
      .map((row) => ({
        staffId: String(row.staff_id ?? ''),
        name: staffNameById.get(String(row.staff_id ?? '')) ?? '(퇴사/미상)',
        status: resolveAttendanceStatus(row, isWeekendDate(String(row.work_date ?? ''))),
        checkIn: formatTime(row.check_in_time),
        checkOut: formatTime(row.check_out_time),
        date: String(row.work_date ?? '') }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [scopedRows, staffNameById]);

  const rangeLabel = range === 'day' ? '일' : range === 'week' ? '주' : '월';
  const panelTestId = `attendance-calendar-${range}-panel`;

  return (
    <div
      data-testid="attendance-calendar-detail-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`${selectedIso} 근태 상세`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-[var(--radius-lg)] bg-[var(--page-bg)] shadow-xl">
        <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
          <div>
            <h3 className="text-[14px] font-black text-[var(--foreground)]">일별 출퇴근 현황</h3>
            <p className="mt-0.5 text-[11px] font-semibold text-[var(--toss-gray-4)]">
              {selectedIso} 기준 {rangeLabel} 단위
            </p>
          </div>
          <div className="flex items-center gap-1">
            {(['day', 'week', 'month'] as const).map((key) => (
              <button
                key={key}
                type="button"
                data-testid={`attendance-calendar-detail-${key}`}
                aria-pressed={range === key}
                onClick={() => onRangeChange(key)}
                className={`rounded-[var(--radius-md)] px-2.5 py-1 text-[12px] font-bold ${
                  range === key
                    ? 'bg-[var(--accent)] text-white'
                    : 'border border-[var(--border)] text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'
                }`}
              >
                {key === 'day' ? '일' : key === 'week' ? '주' : '월'}
              </button>
            ))}
            <button
              type="button"
              data-testid="attendance-calendar-detail-close"
              onClick={onClose}
              aria-label="상세 닫기"
              className="ml-1 rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1 text-[12px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
            >
              닫기
            </button>
          </div>
        </header>

        <div data-testid={panelTestId} className="min-h-0 flex-1 overflow-auto p-4">
          {/* 상태 요약 — 어느 범위에서든 노출해 한눈에 보이게 한다. */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {(Object.keys(STATUS_LABEL) as AttendanceStatus[])
              .filter((status) => (statusCounts.get(status) ?? 0) > 0)
              .map((status) => (
                <span
                  key={status}
                  className={`rounded-[var(--radius-sm,4px)] border border-[var(--border)] bg-[var(--muted)] px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[status]}`}
                >
                  {STATUS_LABEL[status]} {statusCounts.get(status)}
                </span>
              ))}
            {scopedRows.length === 0 && (
              <span className="text-[12px] font-semibold text-[var(--toss-gray-4)]">
                해당 기간의 근태 기록이 없습니다.
              </span>
            )}
          </div>

          {dayEntries.length > 0 && (
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[11px] font-bold text-[var(--toss-gray-4)]">
                  {range !== 'day' && <th className="px-2 py-1.5">날짜</th>}
                  <th className="px-2 py-1.5">직원</th>
                  <th className="px-2 py-1.5">상태</th>
                  <th className="px-2 py-1.5">출근</th>
                  <th className="px-2 py-1.5">퇴근</th>
                </tr>
              </thead>
              <tbody>
                {dayEntries.map((entry, idx) => (
                  <tr key={`${entry.staffId}-${entry.date}-${idx}`} className="border-b border-[var(--border)]/60">
                    {range !== 'day' && (
                      <td className="px-2 py-1.5 font-semibold text-[var(--toss-gray-4)]">{entry.date}</td>
                    )}
                    <td className="px-2 py-1.5 font-bold text-[var(--foreground)]">{entry.name}</td>
                    <td className={`px-2 py-1.5 font-bold ${STATUS_TONE[entry.status]}`}>
                      {STATUS_LABEL[entry.status]}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">{entry.checkIn}</td>
                    <td className="px-2 py-1.5 tabular-nums">{entry.checkOut}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
