'use client';

/**
 * AttendWorkcenter — 근무표 편성 탭 (14일 그리드)
 *
 * - 좌측: 직원 row, 상단: 14일 column, 셀: D/E/N/OFF (밴드 색)
 * - 셀 클릭 → D → E → N → OFF → null(미배정) 토글
 * - 데이터 소스: `work_shifts`, `shift_assignments`
 * - 무거운 자동 편성 워크플로(AI/3교대 마법사)는 `근태관리메인` schedule view로 위임
 *
 * JM6: 셀은 <button>, aria-label "직원명 5/11(월) D 근무"
 * JM3: 토글 실패 시 inline 메시지 + 콘솔 로그 분리
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { StaffMember } from '@/types';
import { isActive } from '../MemberWorkcenter/data';
import {
  buildRosterDates,
  formatIsoDate,
  resolveShiftBand,
  type ShiftBand,
  type ShiftAssignmentRow,
  type WorkShiftRow,
} from './data';

const BAND_CLS: Record<ShiftBand, string> = {
  day: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  evening: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  night: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  off: 'bg-[var(--muted)] text-[var(--toss-gray-3)]',
};

const BAND_LABEL: Record<ShiftBand, string> = {
  day: 'D',
  evening: 'E',
  night: 'N',
  off: 'OFF',
};

interface RosterGridProps {
  staffs: StaffMember[];
  selectedCo?: string;
  /** AI 자동 편성 / 3교대 마법사 등 외부 도구 열기 콜백 */
  onOpenLegacyPlanner?: () => void;
}

export default function RosterGrid({ staffs, selectedCo, onOpenLegacyPlanner }: RosterGridProps) {
  const [shifts, setShifts] = useState<WorkShiftRow[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [windowStart, setWindowStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  });
  const abortRef = useRef<AbortController | null>(null);

  const dates = useMemo(() => buildRosterDates(windowStart, 14), [windowStart]);

  const scopedStaffs = useMemo(() => {
    return staffs.filter((s) => {
      if (!isActive(s)) return false;
      if (selectedCo && selectedCo !== '전체') return s.company === selectedCo;
      return true;
    });
  }, [staffs, selectedCo]);

  // 회사별 work_shifts 로드 + 밴드별 1개씩 추리기
  const shiftByBand = useMemo(() => {
    const map: Partial<Record<ShiftBand, WorkShiftRow>> = {};
    for (const shift of shifts) {
      const band = resolveShiftBand(shift);
      if (!map[band]) map[band] = shift;
    }
    return map;
  }, [shifts]);

  const fetchShifts = useCallback(async () => {
    try {
      let q = supabase.from('work_shifts').select('id, name, start_time, end_time, shift_type, description').eq('is_active', true);
      if (selectedCo && selectedCo !== '전체') {
        q = q.eq('company_name', selectedCo);
      }
      const { data, error } = await q.order('start_time', { ascending: true });
      if (error) throw error;
      setShifts((data ?? []) as WorkShiftRow[]);
    } catch (error) {
      console.error('[AttendWorkcenter] work_shifts 조회 실패', error);
      setShifts([]);
    }
  }, [selectedCo]);

  const fetchAssignments = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setErrorMsg(null);
    try {
      const staffIds = scopedStaffs.map((s) => String(s.id));
      if (staffIds.length === 0 || dates.length === 0) {
        setAssignments({});
        return;
      }
      const start = dates[0]!.iso;
      const end = dates[dates.length - 1]!.iso;
      const { data, error } = await supabase
        .from('shift_assignments')
        .select('staff_id, work_date, shift_id')
        .in('staff_id', staffIds)
        .gte('work_date', start)
        .lte('work_date', end);
      if (controller.signal.aborted) return;
      if (error) throw error;
      const next: Record<string, string> = {};
      for (const row of (data ?? []) as ShiftAssignmentRow[]) {
        next[`${row.staff_id}_${row.work_date}`] = row.shift_id ?? '';
      }
      setAssignments(next);
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error('[AttendWorkcenter] shift_assignments 조회 실패', error);
      setErrorMsg('근무표를 불러오지 못했습니다.');
      setAssignments({});
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [scopedStaffs, dates]);

  useEffect(() => {
    void fetchShifts();
  }, [fetchShifts]);

  useEffect(() => {
    void fetchAssignments();
    return () => abortRef.current?.abort();
  }, [fetchAssignments]);

  const shiftLookup = useMemo(() => {
    const map = new Map<string, WorkShiftRow>();
    for (const shift of shifts) {
      map.set(String(shift.id), shift);
    }
    return map;
  }, [shifts]);

  const cycleBand = useCallback((current: ShiftBand | null): ShiftBand | null => {
    // null → day → evening → night → off → null
    switch (current) {
      case null:
        return 'day';
      case 'day':
        return 'evening';
      case 'evening':
        return 'night';
      case 'night':
        return 'off';
      case 'off':
        return null;
      default:
        return null;
    }
  }, []);

  const toggleCell = useCallback(
    async (staff: StaffMember, dateIso: string) => {
      const key = `${staff.id}_${dateIso}`;
      const currentShiftId = assignments[key] || '';
      const currentBand: ShiftBand | null = currentShiftId
        ? resolveShiftBand(shiftLookup.get(currentShiftId) ?? null)
        : null;
      const nextBand = cycleBand(currentBand);
      const nextShift = nextBand ? shiftByBand[nextBand] : null;
      const nextShiftId = nextShift?.id ?? null;

      // 낙관적 업데이트
      setAssignments((prev) => ({ ...prev, [key]: nextShiftId ?? '' }));

      try {
        const { error } = await supabase
          .from('shift_assignments')
          .upsert(
            {
              staff_id: staff.id,
              work_date: dateIso,
              shift_id: nextShiftId,
              company_name: staff.company,
            },
            { onConflict: 'staff_id,work_date' },
          );
        if (error) throw error;
      } catch (error) {
        console.error('[AttendWorkcenter] 셀 저장 실패', error);
        setErrorMsg('근무표 저장에 실패했습니다.');
        // rollback
        setAssignments((prev) => ({ ...prev, [key]: currentShiftId }));
      }
    },
    [assignments, shiftLookup, cycleBand, shiftByBand],
  );

  const todayIso = useMemo(() => formatIsoDate(new Date()), []);

  const moveWindow = useCallback((deltaDays: number) => {
    setWindowStart((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + deltaDays);
      return next;
    });
  }, []);

  const headerLabel = useMemo(() => {
    if (dates.length === 0) return '';
    const first = dates[0]!;
    const last = dates[dates.length - 1]!;
    return `${first.monthLabel} ~ ${last.monthLabel}`;
  }, [dates]);

  return (
    <section className="flex min-h-0 flex-col gap-3">
      <div className="app-card flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 md:px-4 md:py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-bold text-[var(--foreground)]">근무표 · {headerLabel}</h3>
          <span className="rounded-full bg-[var(--tab-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--toss-gray-4)]">
            {scopedStaffs.length}명
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => moveWindow(-7)}
            aria-label="이전 주"
            className="rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1 text-[12px] font-semibold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => moveWindow(7)}
            aria-label="다음 주"
            className="rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1 text-[12px] font-semibold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
          >
            ›
          </button>
          <button
            type="button"
            onClick={() => {
              const d = new Date();
              d.setDate(d.getDate() - 1);
              setWindowStart(d);
            }}
            className="rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1 text-[12px] font-semibold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
          >
            오늘
          </button>
          {onOpenLegacyPlanner && (
            <button
              type="button"
              onClick={onOpenLegacyPlanner}
              className="ml-2 rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-[12px] font-bold text-white hover:bg-[var(--accent-hover)]"
            >
              상세 편성 도구
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div role="alert" className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {errorMsg}
        </div>
      )}

      <div className="app-card overflow-auto">
        {scopedStaffs.length === 0 ? (
          <div className="px-4 py-12 text-center text-[12px] text-[var(--toss-gray-4)]">
            표시할 직원이 없습니다.
          </div>
        ) : (
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-[var(--page-bg)]">
                <th
                  scope="col"
                  className="sticky left-0 z-[1] min-w-[110px] border-b border-[var(--border)] bg-[var(--page-bg)] px-2 py-2 text-left text-[11px] font-bold text-[var(--toss-gray-4)]"
                >
                  직원 / 날짜
                </th>
                {dates.map((d) => (
                  <th
                    key={d.iso}
                    scope="col"
                    className={`border-b border-[var(--border)] px-1 py-1.5 text-center text-[10px] font-bold ${
                      d.isToday ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : d.weekendLike ? 'text-red-700' : 'text-[var(--toss-gray-4)]'
                    }`}
                  >
                    <div>{d.monthLabel}</div>
                    <div className="text-[9px] font-semibold">{d.weekdayLabel}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scopedStaffs.map((staff) => (
                <tr key={String(staff.id)} className="border-b border-[var(--border)]">
                  <th
                    scope="row"
                    className="sticky left-0 z-[1] bg-[var(--card)] px-2 py-1.5 text-left text-[12px] font-bold text-[var(--foreground)]"
                  >
                    <div>{staff.name}</div>
                    {staff.department && (
                      <div className="text-[10px] font-medium text-[var(--toss-gray-4)]">{staff.department}</div>
                    )}
                  </th>
                  {dates.map((d) => {
                    const key = `${staff.id}_${d.iso}`;
                    const shiftId = assignments[key] || '';
                    const band: ShiftBand | null = shiftId
                      ? resolveShiftBand(shiftLookup.get(shiftId) ?? null)
                      : null;
                    const cls = band ? BAND_CLS[band] : 'bg-[var(--card)] text-[var(--toss-gray-3)]';
                    const label = band ? BAND_LABEL[band] : '·';
                    return (
                      <td key={d.iso} className="p-0.5">
                        <button
                          type="button"
                          onClick={() => void toggleCell(staff, d.iso)}
                          aria-label={`${staff.name} ${d.monthLabel}(${d.weekdayLabel}) ${band ? BAND_LABEL[band] : '미배정'}`}
                          disabled={loading}
                          className={`flex h-7 w-full items-center justify-center rounded-[var(--radius-md)] text-[11px] font-bold transition-colors ${cls} hover:opacity-80 disabled:opacity-50`}
                        >
                          {label}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex flex-wrap gap-3 px-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-emerald-500" aria-hidden="true" />
          D · 낮 (09-18)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-amber-500" aria-hidden="true" />
          E · 저녁 (14-22)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-violet-500" aria-hidden="true" />
          N · 밤 (22-09)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-[var(--muted)]" aria-hidden="true" />
          OFF · 휴무
        </span>
      </div>
    </section>
  );
}
