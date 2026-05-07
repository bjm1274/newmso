'use client';

import { supabase } from '@/lib/supabase';
import { isMissingColumnError } from '@/lib/supabase-compat';
import { LucideIcon } from '../조직도서브/조직도측면창';

export type ProblemReason = '미체크' | '지각' | '조퇴' | '결근' | '미출근';

export type ProblemDateItem = {
  date: string;
  reason: ProblemReason;
  label: string;
  checkIn?: string | null;
  checkOut?: string | null;
};

export const REASON_BADGE: Record<string, { bg: string; text: string; icon: string }> = {
  결근: { bg: 'erp-status-red', text: '', icon: 'Ban' },
  지각: { bg: 'erp-status-yellow', text: '', icon: 'Clock' },
  조퇴: { bg: 'erp-status-yellow', text: '', icon: 'Footprints' },
  미체크: { bg: '', text: '', icon: 'CircleHelp' },
  미출근: { bg: 'erp-status-yellow', text: '', icon: 'TriangleAlert' },
};

function isAttendanceCorrectionsLegacySchemaError(error: any) {
  return [
    'attendance_date',
    'requested_at',
    'approval_status',
    'approved_by',
    'approved_at',
  ].some((column) => isMissingColumnError(error, column));
}

export async function withAttendanceCorrectionsFallback<T>(
  primary: () => PromiseLike<{ data: T | null; error: any }>,
  fallback: () => PromiseLike<{ data: T | null; error: any }>,
) {
  const result = await primary();
  if (isAttendanceCorrectionsLegacySchemaError(result.error)) {
    return fallback();
  }
  return result;
}

export function getCorrectionDate(correction: any) {
  return String(correction?.attendance_date || correction?.original_date || '').slice(0, 10);
}

export function formatAttendanceCorrectionDate(dateStr: string) {
  const d = new Date(dateStr);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return { short: `${mm}/${dd}`, day: days[d.getDay()] };
}

function formatAttendanceCorrectionTime(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return new Date(iso).toTimeString().slice(0, 5);
  } catch {
    return null;
  }
}

export async function loadAttendanceProblemDates(userId: unknown): Promise<ProblemDateItem[]> {
  if (!userId) return [];

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 60);

  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const [
    { data: attendanceRows },
    { data: attendancesRows },
    { data: myCorrections },
    { data: staffRow },
    { data: assignmentRows },
  ] = await Promise.all([
    supabase.from('attendance').select('date, check_in, check_out, status').eq('staff_id', userId).gte('date', startStr).lte('date', endStr),
    supabase.from('attendances').select('work_date, status').eq('staff_id', userId).gte('work_date', startStr).lte('work_date', endStr),
    withAttendanceCorrectionsFallback<any[]>(
      () => supabase.from('attendance_corrections').select('attendance_date, original_date').eq('staff_id', userId),
      () => supabase.from('attendance_corrections').select('original_date').eq('staff_id', userId),
    ),
    supabase.from('staff_members').select('id, shift_id').eq('id', userId).maybeSingle(),
    supabase.from('shift_assignments').select('work_date, shift_id').eq('staff_id', userId).gte('work_date', startStr).lte('work_date', endStr),
  ]);

  const assignmentByDate = new Map<string, string | null>(
    (assignmentRows || []).map((assignment: any) => [String(assignment.work_date).slice(0, 10), assignment.shift_id ?? null]),
  );

  const defaultShiftId: string | null = (staffRow as any)?.shift_id ?? null;
  const shiftIdSet = new Set<string>(
    [...(assignmentRows || []).map((assignment: any) => assignment.shift_id).filter(Boolean), defaultShiftId].filter(Boolean) as string[],
  );
  const shiftsMap = new Map<string, any>();
  if (shiftIdSet.size > 0) {
    const { data: shiftRows } = await supabase
      .from('work_shifts')
      .select('id, name, shift_type, weekly_work_days, is_weekend_work')
      .in('id', Array.from(shiftIdSet));
    (shiftRows || []).forEach((shift: any) => shiftsMap.set(shift.id, shift));
  }

  const offKeywords = ['휴무', 'off', '비번', '오프'];
  const isOffShift = (shiftId: string | null | undefined): boolean => {
    if (!shiftId) return true;
    const shift = shiftsMap.get(shiftId);
    if (!shift) return false;
    const name = String(shift.name || '').toLowerCase();
    return offKeywords.some((keyword) => name.includes(keyword));
  };

  const resolveWorkDayMode = (shiftId: string | null | undefined): 'all_days' | 'weekdays' => {
    if (!shiftId) return 'weekdays';
    const shift = shiftsMap.get(shiftId);
    if (!shift) return 'weekdays';
    if (String(shift.shift_type || '').includes('3교대')) return 'all_days';
    if (shift.is_weekend_work === true || Number(shift.weekly_work_days) >= 7) return 'all_days';
    return 'weekdays';
  };

  const isWorkDay = (dateStr: string): boolean => {
    const dayOfWeek = new Date(`${dateStr}T00:00:00`).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (assignmentByDate.has(dateStr)) {
      const assignedShiftId = assignmentByDate.get(dateStr);
      if (isOffShift(assignedShiftId)) return false;
      return true;
    }

    const mode = resolveWorkDayMode(defaultShiftId);
    if (mode === 'all_days') return true;
    return !isWeekend;
  };

  const alreadyRequested = new Set(
    (myCorrections || [])
      .map((item: any) => getCorrectionDate(item))
      .filter(Boolean),
  );
  const attendanceByDate = new Map((attendanceRows || []).map((item: any) => [item.date, item]));
  const attendancesByDate = new Map((attendancesRows || []).map((item: any) => [item.work_date, item]));
  const nextProblemDates = new Map<string, ProblemDateItem>();

  for (let offset = 0; offset <= 60; offset += 1) {
    const current = new Date(start);
    current.setDate(current.getDate() + offset);
    if (current > end) break;

    const dateStr = current.toISOString().slice(0, 10);
    if (alreadyRequested.has(dateStr) || !isWorkDay(dateStr)) continue;

    const attendance = attendanceByDate.get(dateStr);
    const attendances = attendancesByDate.get(dateStr);
    const status = attendances?.status;

    if (status === 'present') {
      if (attendance?.check_in) continue;
      if (!attendance) {
        nextProblemDates.set(dateStr, {
          date: dateStr,
          reason: '미체크',
          label: '출퇴근 미체크',
          checkIn: null,
          checkOut: null,
        });
        continue;
      }
    }

    if (
      !status &&
      attendance &&
      (attendance.status === '정상' || attendance.status === 'present') &&
      attendance.check_in
    ) {
      continue;
    }

    if (status === 'absent') {
      nextProblemDates.set(dateStr, { date: dateStr, reason: '결근', label: '결근', checkIn: attendance?.check_in, checkOut: attendance?.check_out });
      continue;
    }

    if (status === 'late' || attendance?.status === '지각') {
      nextProblemDates.set(dateStr, { date: dateStr, reason: '지각', label: '지각', checkIn: attendance?.check_in, checkOut: attendance?.check_out });
      continue;
    }

    if (status === 'early_leave' || attendance?.status === '조퇴') {
      nextProblemDates.set(dateStr, { date: dateStr, reason: '조퇴', label: '조퇴', checkIn: attendance?.check_in, checkOut: attendance?.check_out });
      continue;
    }

    if (!attendance) {
      nextProblemDates.set(dateStr, { date: dateStr, reason: '미체크', label: '출퇴근 미체크', checkIn: null, checkOut: null });
      continue;
    }

    if (!attendance.check_in) {
      nextProblemDates.set(dateStr, { date: dateStr, reason: '미출근', label: '출근 미기록', checkIn: null, checkOut: attendance?.check_out });
    }
  }

  return Array.from(nextProblemDates.values()).sort((a, b) => b.date.localeCompare(a.date));
}

type AttendanceCorrectionDateSectionProps = {
  problemDates: ProblemDateItem[];
  problemDatesLoading: boolean;
  selectedDates: string[];
  selectAll: () => void;
  clearAll: () => void;
  toggleSelectedDate: (date: string) => void;
};

export default function AttendanceCorrectionDateSection({
  problemDates,
  problemDatesLoading,
  selectedDates,
  selectAll,
  clearAll,
  toggleSelectedDate,
}: AttendanceCorrectionDateSectionProps) {
  return (
    <div className="erp-panel overflow-hidden">
      <div className="erp-panel-header">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-[var(--foreground)]">정정 필요 날짜</span>
          <span className="text-[10px] font-semibold text-[var(--toss-gray-3)]">최근 60일</span>
          {!problemDatesLoading && problemDates.length > 0 && (
            <span className="erp-chip erp-status-red">
              {problemDates.length}건
            </span>
          )}
        </div>
        {problemDates.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-[10px] font-bold text-[var(--accent)] hover:underline"
            >
              전체 선택
            </button>
            {selectedDates.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-[10px] font-bold text-[var(--toss-gray-3)] hover:underline"
              >
                선택 해제
              </button>
            )}
          </div>
        )}
      </div>

      {problemDatesLoading ? (
        <div className="flex items-center gap-2 px-4 py-6 text-sm font-bold text-[var(--toss-gray-3)]">
          <span className="animate-spin text-base">⏳</span> 출퇴근 기록 불러오는 중...
        </div>
      ) : problemDates.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-8 text-[var(--toss-gray-3)]">
          <span className="text-2xl">✅</span>
          <p className="text-sm font-bold">최근 60일 내 정정 대상 기록이 없습니다.</p>
        </div>
      ) : (
        <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {problemDates.map((item) => {
            const isSelected = selectedDates.includes(item.date);
            const badge = REASON_BADGE[item.reason] ?? REASON_BADGE['미체크'];
            const { short, day } = formatAttendanceCorrectionDate(item.date);
            const checkInTime = formatAttendanceCorrectionTime(item.checkIn);
            const checkOutTime = formatAttendanceCorrectionTime(item.checkOut);
            return (
              <button
                key={item.date}
                type="button"
                data-testid={`attendance-correction-date-${item.date}`}
                onClick={() => toggleSelectedDate(item.date)}
                className={`relative flex flex-col gap-1.5 rounded-[var(--radius-md)] border p-2.5 text-left transition-all ${
                  isSelected
                    ? 'border-[var(--accent)] bg-[var(--accent-selected-subtle)]'
                    : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--zinc-300)] hover:bg-[var(--surface-muted)]'
                }`}
              >
                <div className={`absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-[var(--radius-sm)] border transition-all ${
                  isSelected
                    ? 'bg-[var(--accent)] border-[var(--accent)]'
                    : 'border-[var(--border)] bg-[var(--card)]'
                }`}>
                  {isSelected && (
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>

                <div>
                  <p className="text-sm font-black text-[var(--foreground)] leading-none">{short}</p>
                  <p className={`text-[10px] font-bold mt-0.5 ${day === '일' ? 'text-red-500' : day === '토' ? 'text-blue-500' : 'text-[var(--toss-gray-3)]'}`}>
                    {day}요일
                  </p>
                </div>

                <span className={`erp-chip self-start ${badge.bg} ${badge.text}`}>
                  <LucideIcon name={badge.icon} size={12} strokeWidth={2.5} /> {item.label}
                </span>

                <div className="text-[10px] text-[var(--toss-gray-3)] font-medium leading-tight">
                  {checkInTime && <div>↑ {checkInTime}</div>}
                  {checkOutTime && <div>↓ {checkOutTime}</div>}
                  {!checkInTime && !checkOutTime && <div>기록 없음</div>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
