'use client';

/**
 * 근무표 통합 워크스페이스 (SSOT)
 *
 * - 저장: shift_assignments
 * - 기간: 주 / 2주 / 월
 * - TOOLBOX 페인트 + 셀 토글
 * - 자동편성(규칙 엔진) + AI 추천 (인라인, 레거시 임베드 없음)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { db } from '@/lib/db-client';
import { toast } from '@/lib/toast';
import type { StaffMember } from '@/types';
import {
  generateAutoScheduleDetailed,
  mapWorkShiftToBand,
  type RosterPattern,
  type ShiftRole,
  type ScheduleMap,
} from '@/lib/shift-auto-scheduler';
import {
  buildRosterAiPayload,
  defaultPlanFromTeam,
  parseAiStaffPlansToSchedule,
  repairScheduleMap,
  validateScheduleMap,
  type RosterPlanConfig,
} from '@/lib/roster-ai-client';
import { isActive } from '../MemberWorkcenter/data';
import {
  buildRosterDates,
  formatIsoDate,
  resolveShiftBand,
  type ShiftBand,
  type ShiftAssignmentRow,
  type WorkShiftRow,
  type RosterDate,
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

const ROLE_TO_BAND: Record<string, ShiftBand> = {
  D: 'day',
  E: 'evening',
  N: 'night',
  OFF: 'off',
  LEAVE: 'off',
  TRAINING: 'day',
};

type RangeMode = 'week' | 'fortnight' | 'month';

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function daysInMonth(y: number, m: number) {
  return new Date(y, m, 0).getDate();
}

function resolveStaffMode(s: StaffMember): 'rotation' | 'day_fixed' | 'evening_fixed' | 'night_fixed' {
  const raw = String(
    (s as { shiftType?: string; shift_type?: string }).shiftType ||
      (s as { shift_type?: string }).shift_type ||
      '',
  ).toLowerCase();
  if (raw.includes('day_fixed') || raw.includes('상근') || raw.includes('주간전담')) return 'day_fixed';
  if (raw.includes('evening') || raw.includes('이브닝전담')) return 'evening_fixed';
  if (raw.includes('night_fixed') || raw.includes('야간전담')) return 'night_fixed';
  return 'rotation';
}

export default function RosterWorkspace({
  staffs,
  selectedCo,
}: {
  staffs: StaffMember[];
  selectedCo?: string;
}) {
  const [shifts, setShifts] = useState<WorkShiftRow[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rangeMode, setRangeMode] = useState<RangeMode>('fortnight');
  const [anchor, setAnchor] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  });
  const [team, setTeam] = useState('전체');
  const [activeTool, setActiveTool] = useState<string | null>(null); // shift id or '__erase__'
  const [autoOpen, setAutoOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  /** 마지막 자동편성/마법사 설정 — AI 추천에 그대로 전달 */
  const [lastPlan, setLastPlan] = useState<RosterPlanConfig | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /**
   * 근무표 편성 대상 직원 — **회사로 잘라내지 않는다.**
   *
   * MSO 구조라 회사 간 대체근무가 정상 업무다(프로덕션 근무배정 1,945건 중 766건이 교차회사).
   * 예전에는 선택된 회사 외 직원을 후보에서 통째로 제거해, 정작 대체근무를 **배정하는**
   * 화면에서 타 회사 직원을 고를 수 없었다.
   * 선택 회사는 제거 기준이 아니라 **정렬 기준**으로만 쓴다(본인 회사가 위로).
   */
  const scopedAll = useMemo(() => {
    const co = selectedCo && selectedCo !== '전체' ? selectedCo : '';
    return staffs
      .filter((s) => isActive(s))
      .sort((a, b) => {
        if (co) {
          const aMine = String(a.company || '').trim() === co ? 0 : 1;
          const bMine = String(b.company || '').trim() === co ? 0 : 1;
          if (aMine !== bMine) return aMine - bMine;
        }
        return (
          String(a.company || '').localeCompare(String(b.company || ''), 'ko') ||
          String(a.department || a.team || '').localeCompare(String(b.department || b.team || ''), 'ko') ||
          String(a.name || '').localeCompare(String(b.name || ''), 'ko')
        );
      });
  }, [staffs, selectedCo]);

  const teamList = useMemo(() => {
    const set = new Set<string>();
    scopedAll.forEach((s) => {
      const d = String(s.department || s.team || '').trim();
      if (d) set.add(d);
    });
    return ['전체', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'))];
  }, [scopedAll]);

  const scopedStaffs = useMemo(() => {
    if (team === '전체') return scopedAll;
    return scopedAll.filter(
      (s) => String(s.department || s.team || '').trim() === team,
    );
  }, [scopedAll, team]);

  const dates: RosterDate[] = useMemo(() => {
    if (rangeMode === 'month') {
      const start = startOfMonth(anchor);
      const n = daysInMonth(start.getFullYear(), start.getMonth() + 1);
      return buildRosterDates(start, n);
    }
    if (rangeMode === 'week') return buildRosterDates(anchor, 7);
    return buildRosterDates(anchor, 14);
  }, [anchor, rangeMode]);

  const yearMonth = useMemo(() => {
    const d = rangeMode === 'month' ? startOfMonth(anchor) : anchor;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, [anchor, rangeMode]);

  const shiftByBand = useMemo(() => {
    const map: Partial<Record<ShiftBand, WorkShiftRow>> = {};
    for (const shift of shifts) {
      const band = resolveShiftBand(shift);
      if (!map[band]) map[band] = shift;
    }
    return map;
  }, [shifts]);

  const shiftLookup = useMemo(() => {
    const map = new Map<string, WorkShiftRow>();
    for (const shift of shifts) map.set(String(shift.id), shift);
    return map;
  }, [shifts]);

  const fetchShifts = useCallback(async () => {
    try {
      // 시프트 팔레트도 회사로 좁히지 않는다 — 타 회사 시프트로 대체근무를 배정해야 하기 때문.
      // (직원 후보만 열고 팔레트를 막으면 교차 배정 자체가 불가능하다.)
      const q = db
        .from('work_shifts')
        .select('id, name, start_time, end_time, shift_type, description, company_name')
        .eq('is_active', true);
      const { data, error } = await q.order('start_time', { ascending: true });
      if (error) throw error;
      setShifts((data ?? []) as WorkShiftRow[]);
    } catch (e) {
      console.error('[RosterWorkspace] work_shifts', e);
      setShifts([]);
    }
  }, []);

  const fetchAssignments = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setErrorMsg(null);
    try {
      const staffIds = scopedStaffs.map((s) => String(s.id));
      if (!staffIds.length || !dates.length) {
        setAssignments({});
        return;
      }
      const start = dates[0]!.iso;
      const end = dates[dates.length - 1]!.iso;
      const { data, error } = await db
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
    } catch (e) {
      if (controller.signal.aborted) return;
      console.error('[RosterWorkspace] assignments', e);
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

  const upsertCell = useCallback(
    async (staffId: string, workDate: string, shiftId: string | null, company?: string | null) => {
      const key = `${staffId}_${workDate}`;
      const prev = assignments[key] || '';
      setAssignments((p) => ({ ...p, [key]: shiftId ?? '' }));
      try {
        const { error } = await db.from('shift_assignments').upsert(
          {
            staff_id: staffId,
            work_date: workDate,
            shift_id: shiftId,
            // 배정 행의 company_name 은 **직원 소속**이어야 한다.
            // selectedCo 로 폴백하면 타 회사 직원을 배정할 때 엉뚱한 회사가 찍혀
            // 이후 집계·필터가 어긋난다.
            company_name: company || scopedAll.find((s2) => String(s2.id) === staffId)?.company || null,
          },
          { onConflict: 'staff_id,work_date' },
        );
        if (error) throw error;
      } catch (e) {
        console.error('[RosterWorkspace] upsert', e);
        setAssignments((p) => ({ ...p, [key]: prev }));
        setErrorMsg('저장 실패');
        throw e;
      }
    },
    [assignments, scopedAll],
  );

  const bulkApply = useCallback(
    async (nextMap: Record<string, string>) => {
      setSaving(true);
      setErrorMsg(null);
      try {
        const rows = Object.entries(nextMap).map(([key, shiftId]) => {
          const [staffId, workDate] = key.split('_');
          const staff = scopedStaffs.find((s) => String(s.id) === staffId);
          return {
            staff_id: staffId,
            work_date: workDate,
            shift_id: shiftId || null,
            company_name: staff?.company || null,
          };
        });
        // chunk upsert
        const chunk = 80;
        for (let i = 0; i < rows.length; i += chunk) {
          const part = rows.slice(i, i + chunk);
          const { error } = await db
            .from('shift_assignments')
            .upsert(part, { onConflict: 'staff_id,work_date' });
          if (error) throw error;
        }
        setAssignments((prev) => ({ ...prev, ...nextMap }));
        toast('근무표가 저장되었습니다.', 'success');
      } catch (e) {
        console.error(e);
        toast('일괄 저장 실패', 'error');
        setErrorMsg('일괄 저장 실패');
      } finally {
        setSaving(false);
      }
    },
    [scopedStaffs, selectedCo],
  );

  const onCellClick = useCallback(
    async (staff: StaffMember, dateIso: string) => {
      const key = `${staff.id}_${dateIso}`;
      if (activeTool === '__erase__') {
        await upsertCell(String(staff.id), dateIso, null, staff.company);
        return;
      }
      if (activeTool) {
        await upsertCell(String(staff.id), dateIso, activeTool, staff.company);
        return;
      }
      // cycle bands
      const currentShiftId = assignments[key] || '';
      const currentBand: ShiftBand | null = currentShiftId
        ? resolveShiftBand(shiftLookup.get(currentShiftId) ?? null)
        : null;
      const order: Array<ShiftBand | null> = [null, 'day', 'evening', 'night', 'off'];
      const idx = order.indexOf(currentBand);
      const nextBand = order[(idx + 1) % order.length] ?? null;
      const nextShift = nextBand ? shiftByBand[nextBand] : null;
      await upsertCell(String(staff.id), dateIso, nextShift?.id ?? null, staff.company);
    },
    [activeTool, assignments, shiftLookup, shiftByBand, upsertCell],
  );

  const moveRange = (dir: -1 | 1) => {
    setAnchor((prev) => {
      const n = new Date(prev);
      if (rangeMode === 'month') {
        n.setMonth(n.getMonth() + dir);
        return startOfMonth(n);
      }
      n.setDate(n.getDate() + dir * (rangeMode === 'week' ? 7 : 14));
      return n;
    });
  };

  const roleToShiftId = useCallback(
    (role: ShiftRole): string | null => {
      const band = ROLE_TO_BAND[role] || 'off';
      return shiftByBand[band]?.id ?? null;
    },
    [shiftByBand],
  );

  const applyScheduleMap = useCallback(
    async (schedule: ScheduleMap, staffIds: string[], ym: string, days: number) => {
      const [y, m] = ym.split('-').map(Number);
      const next: Record<string, string> = {};
      for (const sid of staffIds) {
        for (let d = 1; d <= days; d++) {
          const role = schedule[sid]?.[d] || 'OFF';
          const shiftId = roleToShiftId(role as ShiftRole);
          const iso = `${ym}-${String(d).padStart(2, '0')}`;
          // only apply days in current window that match month
          if (dates.some((x) => x.iso === iso)) {
            next[`${sid}_${iso}`] = shiftId || '';
          } else if (rangeMode === 'month' && y && m) {
            next[`${sid}_${iso}`] = shiftId || '';
          }
        }
      }
      // if month mode apply all days of month
      if (rangeMode === 'month') {
        for (const sid of staffIds) {
          for (let d = 1; d <= days; d++) {
            const role = schedule[sid]?.[d] || 'OFF';
            const shiftId = roleToShiftId(role as ShiftRole);
            const iso = `${ym}-${String(d).padStart(2, '0')}`;
            next[`${sid}_${iso}`] = shiftId || '';
          }
        }
      }
      await bulkApply(next);
    },
    [roleToShiftId, dates, rangeMode, bulkApply],
  );

  const resolvePlan = useCallback(
    (override?: Partial<RosterPlanConfig>): RosterPlanConfig => {
      const base =
        lastPlan ||
        defaultPlanFromTeam(team, scopedStaffs.length);
      const staffIds =
        override?.staffIds?.length
          ? override.staffIds
          : base.staffIds.length
            ? base.staffIds
            : scopedStaffs.map((s) => String(s.id));
      const shiftIds =
        override?.shiftIds?.length
          ? override.shiftIds
          : base.shiftIds.length
            ? base.shiftIds
            : shifts.map((s) => String(s.id));
      return {
        ...base,
        ...override,
        staffIds,
        shiftIds,
      };
    },
    [lastPlan, team, scopedStaffs, shifts],
  );

  const runLocalEngine = useCallback(
    (plan: RosterPlanConfig) => {
      const ym = yearMonth;
      const [y, m] = ym.split('-').map(Number);
      const dim = daysInMonth(y, m);
      const pick = scopedStaffs.filter((s) => plan.staffIds.includes(String(s.id)));
      if (!pick.length) {
        return null;
      }
      const existing: ScheduleMap = {};
      for (const s of pick) existing[String(s.id)] = {};

      const filtered = plan.shiftIds.length
        ? shifts.filter((s) => plan.shiftIds.includes(String(s.id)))
        : shifts;

      return {
        pick,
        ym,
        y,
        m,
        dim,
        result: generateAutoScheduleDetailed({
          yearMonth: ym,
          daysInMonth: dim,
          pattern: plan.pattern,
          staffs: pick.map((s) => ({
            id: String(s.id),
            name: s.name || '',
            mode: resolveStaffMode(s),
          })),
          minStaff: plan.minStaff,
          targetNightPerPerson: plan.targetNight,
          targetOffPerPerson: plan.targetOff,
          offDaysAfterNight: plan.offDaysAfterNight,
          maxConsecutiveWorkDays: plan.maxConsecutiveWorkDays,
          workShifts: filtered.map((s) => ({
            id: String(s.id),
            name: s.name,
            start_time: s.start_time,
            end_time: s.end_time,
            shift_type: s.shift_type,
            description: s.description,
          })),
          activeShiftIds: plan.shiftIds,
          existingSchedule: existing,
        }),
      };
    },
    [yearMonth, scopedStaffs, shifts],
  );

  const runAuto = useCallback(
    async (cfg: {
      pattern: RosterPattern;
      minStaff: { D: number; E: number; N: number };
      targetNight: number;
      targetOff: number;
      staffIds: string[];
      shiftIds: string[];
    }) => {
      const plan: RosterPlanConfig = {
        pattern: cfg.pattern,
        minStaff: cfg.minStaff,
        targetNight: cfg.targetNight,
        targetOff: cfg.targetOff,
        maxConsecutiveWorkDays: 5,
        offDaysAfterNight: cfg.pattern === 'outpatient_day' ? 0 : 1,
        staffIds: cfg.staffIds,
        shiftIds: cfg.shiftIds,
      };
      setLastPlan(plan);

      const pack = runLocalEngine(plan);
      if (!pack) {
        toast('배치 직원을 선택하세요.', 'info');
        return;
      }

      setRangeMode('month');
      setAnchor(startOfMonth(new Date(pack.y, pack.m - 1, 1)));
      setAutoOpen(false);
      await applyScheduleMap(
        pack.result.schedule,
        pack.pick.map((s) => String(s.id)),
        pack.ym,
        pack.dim,
      );
      toast(pack.result.summary, 'success');
    },
    [runLocalEngine, applyScheduleMap],
  );

  const runAi = useCallback(async () => {
    const plan = resolvePlan();
    if (!plan.staffIds.length) {
      toast('표시할 직원이 없습니다. 자동편성 설정에서 직원을 선택하세요.', 'info');
      setAutoOpen(true);
      return;
    }
    setLastPlan(plan);
    setAiLoading(true);

    const ym = yearMonth;
    const [y, m] = ym.split('-').map(Number);
    const dim = daysInMonth(y, m);
    const pick = scopedStaffs.filter((s) => plan.staffIds.includes(String(s.id)));
    const staffIds = pick.map((s) => String(s.id));

    const resolveShiftIdToRole = (shiftId: string): ShiftRole => {
      const sh = shifts.find((s) => String(s.id) === shiftId);
      if (!sh) return 'OFF';
      const b = resolveShiftBand(sh);
      return b === 'day' ? 'D' : b === 'evening' ? 'E' : b === 'night' ? 'N' : 'OFF';
    };

    const applyWithValidation = async (schedule: ScheduleMap, sourceLabel: string) => {
      let finalMap = schedule;
      let validation = validateScheduleMap(finalMap, staffIds, dim, plan.minStaff);
      if (!validation.ok) {
        finalMap = repairScheduleMap(finalMap, staffIds, dim, plan.minStaff);
        validation = validateScheduleMap(finalMap, staffIds, dim, plan.minStaff);
      }
      setRangeMode('month');
      setAnchor(startOfMonth(new Date(y, m - 1, 1)));
      await applyScheduleMap(finalMap, staffIds, ym, dim);
      if (validation.ok) {
        toast(`${sourceLabel} 완료 · 최소인원·연속 규칙 충족`, 'success');
      } else {
        toast(
          `${sourceLabel} 반영 · 일부 부족 ${validation.minStaffGapDays}일` +
            (validation.nThenDCount ? ` · N→D ${validation.nThenDCount}건 보정` : '') +
            ' — 수동 확인 권장',
          'info',
        );
      }
    };

    try {
      const body = buildRosterAiPayload({
        yearMonth: ym,
        company: selectedCo || '전체',
        department: team === '전체' ? '전체' : team,
        daysInMonth: dim,
        plan,
        staffs: pick.map((s) => ({
          id: String(s.id),
          name: s.name,
          department: s.department,
          position: s.position,
          role: String((s as { role?: string }).role || ''),
          mode: resolveStaffMode(s),
        })),
        shifts: shifts.map((s) => ({
          id: String(s.id),
          name: s.name,
          start_time: s.start_time,
          end_time: s.end_time,
          shift_type: s.shift_type,
          description: s.description,
        })),
      });

      const res = await fetch('/api/ai/roster-recommendation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!Array.isArray(data.staffPlans) || data.staffPlans.length === 0) {
        throw new Error('응답에 staffPlans 없음');
      }

      const schedule = parseAiStaffPlansToSchedule(
        data.staffPlans,
        dim,
        resolveShiftIdToRole,
      );
      await applyWithValidation(schedule, data.summary || 'AI 추천');
    } catch (e) {
      console.error('[RosterWorkspace] AI 실패 → 로컬 엔진 폴백', e);
      toast('AI 추천 실패 — 로컬 자동편성으로 대체합니다.', 'info');
      try {
        const pack = runLocalEngine(plan);
        if (!pack) {
          toast('폴백 자동편성 실패: 대상 직원 없음', 'error');
          return;
        }
        await applyWithValidation(pack.result.schedule, `로컬 폴백 · ${pack.result.summary}`);
      } catch (fallbackErr) {
        console.error('[RosterWorkspace] 폴백 실패', fallbackErr);
        toast('AI·로컬 편성 모두 실패했습니다. 네트워크·근무유형을 확인하세요.', 'error');
      }
    } finally {
      setAiLoading(false);
    }
  }, [
    resolvePlan,
    yearMonth,
    scopedStaffs,
    selectedCo,
    team,
    shifts,
    applyScheduleMap,
    runLocalEngine,
  ]);

  const headerLabel = useMemo(() => {
    if (!dates.length) return '';
    return `${dates[0]!.monthLabel} ~ ${dates[dates.length - 1]!.monthLabel}`;
  }, [dates]);

  return (
    <section className="flex min-h-0 flex-col gap-3" data-testid="roster-workspace">
      {/* 툴바 */}
      <div className="app-card flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 md:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[13px] font-bold text-[var(--foreground)]">
            근무표 · {headerLabel}
          </h3>
          <span className="rounded-full bg-[var(--tab-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--toss-gray-4)]">
            {scopedStaffs.length}명
          </span>
          <select
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            className="rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1 text-[11px] font-bold"
            aria-label="부서 필터"
          >
            {teamList.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <div className="flex rounded-[var(--radius-md)] border border-[var(--border)] p-0.5">
            {(
              [
                { id: 'week' as const, label: '주' },
                { id: 'fortnight' as const, label: '2주' },
                { id: 'month' as const, label: '월' },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setRangeMode(m.id);
                  if (m.id === 'month') setAnchor(startOfMonth(anchor));
                }}
                className={`rounded-[var(--radius-sm)] px-2 py-1 text-[11px] font-bold ${
                  rangeMode === m.id
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => moveRange(-1)}
            className="rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1 text-[12px] font-semibold"
            aria-label="이전"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => moveRange(1)}
            className="rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1 text-[12px] font-semibold"
            aria-label="다음"
          >
            ›
          </button>
          <button
            type="button"
            onClick={() => {
              const d = new Date();
              d.setDate(d.getDate() - 1);
              setAnchor(rangeMode === 'month' ? startOfMonth(d) : d);
            }}
            className="rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1 text-[12px] font-semibold"
          >
            오늘
          </button>
          <button
            type="button"
            onClick={() => setAutoOpen(true)}
            className="ml-1 rounded-xl bg-blue-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-blue-700"
          >
            🤖 자동편성
          </button>
          <button
            type="button"
            onClick={() => void runAi()}
            disabled={aiLoading || saving}
            title={
              lastPlan
                ? `마법사 설정 반영: ${lastPlan.pattern}, N목표 ${lastPlan.targetNight}, 오프 ${lastPlan.targetOff}`
                : '부서 기본 규칙 사용 (자동편성 설정에서 세부 조정 가능)'
            }
            className="rounded-xl bg-purple-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {aiLoading ? '✨ AI 편성 중…' : '✨ AI 추천'}
          </button>
        </div>
      </div>

      {/* TOOLBOX */}
      <div className="app-card flex flex-wrap items-center gap-1.5 px-3 py-2">
        <span className="mr-1 text-[10px] font-black uppercase tracking-wider text-[var(--toss-gray-3)]">
          TOOLBOX
        </span>
        <button
          type="button"
          onClick={() => setActiveTool(null)}
          className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
            activeTool === null
              ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
              : 'border-[var(--border)] text-[var(--toss-gray-4)]'
          }`}
        >
          토글
        </button>
        <button
          type="button"
          onClick={() => setActiveTool(activeTool === '__erase__' ? null : '__erase__')}
          className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
            activeTool === '__erase__'
              ? 'border-rose-400 bg-rose-50 text-rose-600'
              : 'border-[var(--border)] text-[var(--toss-gray-4)]'
          }`}
        >
          지우기
        </button>
        {shifts.map((s) => {
          const id = String(s.id);
          const band = resolveShiftBand(s);
          const on = activeTool === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTool(on ? null : id)}
              title={`${s.start_time || ''}~${s.end_time || ''}`}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                on
                  ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                  : `${BAND_CLS[band]} border-transparent`
              }`}
            >
              {s.name || id}
              <span className="ml-1 opacity-70">{BAND_LABEL[band]}</span>
            </button>
          );
        })}
        {shifts.length === 0 && (
          <span className="text-[11px] text-[var(--toss-gray-3)]">
            등록된 근무유형 없음 — 셀 토글은 D/E/N 대표 유형 사용
          </span>
        )}
      </div>

      {errorMsg && (
        <div role="alert" className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {errorMsg}
        </div>
      )}
      {(loading || saving || aiLoading) && (
        <div className="text-[11px] font-bold text-[var(--accent)] animate-pulse px-1">
          {aiLoading ? 'AI 편성 중…' : saving ? '저장 중…' : '불러오는 중…'}
        </div>
      )}

      {/* 그리드 */}
      <div className="app-card min-h-0 flex-1 overflow-auto">
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
                    className={`border-b border-[var(--border)] px-0.5 py-1.5 text-center text-[10px] font-bold ${
                      d.isToday
                        ? 'bg-[var(--accent-soft,var(--muted))] text-[var(--accent)]'
                        : d.weekendLike
                          ? 'text-red-600'
                          : 'text-[var(--toss-gray-4)]'
                    }`}
                  >
                    <div>{rangeMode === 'month' ? d.day : d.monthLabel}</div>
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
                      <div className="text-[10px] font-medium text-[var(--toss-gray-4)]">
                        {staff.department}
                      </div>
                    )}
                  </th>
                  {dates.map((d) => {
                    const key = `${staff.id}_${d.iso}`;
                    const shiftId = assignments[key] || '';
                    const band: ShiftBand | null = shiftId
                      ? resolveShiftBand(shiftLookup.get(shiftId) ?? null)
                      : null;
                    const shName = shiftId ? shiftLookup.get(shiftId)?.name : null;
                    const cls = band ? BAND_CLS[band] : 'bg-[var(--card)] text-[var(--toss-gray-3)]';
                    const label = band ? (shName && rangeMode !== 'month' ? String(shName).slice(0, 4) : BAND_LABEL[band]) : '·';
                    return (
                      <td key={d.iso} className="p-0.5">
                        <button
                          type="button"
                          onClick={() => void onCellClick(staff, d.iso)}
                          aria-label={`${staff.name} ${d.iso} ${band ? BAND_LABEL[band] : '미배정'}`}
                          disabled={loading || saving}
                          title={shName || undefined}
                          className={`flex h-7 w-full min-w-[28px] items-center justify-center rounded-[var(--radius-md)] text-[10px] font-bold transition-colors ${cls} hover:opacity-80 disabled:opacity-50`}
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
        <span>D · 데이</span>
        <span>E · 이브닝</span>
        <span>N · 나이트</span>
        <span>OFF · 휴무</span>
        <span className="text-[var(--toss-gray-3)]">
          {activeTool
            ? activeTool === '__erase__'
              ? '지우기 모드: 셀 클릭 시 배정 해제'
              : '페인트 모드: 선택한 근무유형으로 칠하기'
            : '토글 모드: 셀 클릭 시 D→E→N→OFF→미배정'}
        </span>
      </div>

      {autoOpen && (
        <AutoWizard
          staffs={scopedStaffs}
          shifts={shifts}
          yearMonth={yearMonth}
          onClose={() => setAutoOpen(false)}
          onRun={runAuto}
          defaultTeam={team}
        />
      )}
    </section>
  );
}

function AutoWizard({
  staffs,
  shifts,
  yearMonth,
  onClose,
  onRun,
  defaultTeam,
}: {
  staffs: StaffMember[];
  shifts: WorkShiftRow[];
  yearMonth: string;
  onClose: () => void;
  onRun: (cfg: {
    pattern: RosterPattern;
    minStaff: { D: number; E: number; N: number };
    targetNight: number;
    targetOff: number;
    staffIds: string[];
    shiftIds: string[];
  }) => void;
  defaultTeam: string;
}) {
  const isOut = /외래|원무|행정/.test(defaultTeam);
  const [pattern, setPattern] = useState<RosterPattern>(
    isOut ? 'outpatient_day' : 'ward_3shift',
  );
  const [minD, setMinD] = useState(isOut ? 2 : 2);
  const [minE, setMinE] = useState(isOut ? 0 : 2);
  const [minN, setMinN] = useState(isOut ? 0 : 2);
  const [targetN, setTargetN] = useState(isOut ? 0 : 4);
  const [targetO, setTargetO] = useState(8);
  const [staffIds, setStaffIds] = useState(() => staffs.map((s) => String(s.id)));
  const [shiftIds, setShiftIds] = useState(() => shifts.map((s) => String(s.id)));

  const applyPreset = (p: RosterPattern) => {
    setPattern(p);
    if (p === 'ward_3shift') {
      setMinD(2); setMinE(2); setMinN(2); setTargetN(4); setTargetO(8);
    } else if (p === 'two_shift') {
      setMinD(2); setMinE(0); setMinN(2); setTargetN(5); setTargetO(8);
    } else if (p === 'outpatient_day') {
      setMinD(2); setMinE(0); setMinN(0); setTargetN(0); setTargetO(8);
    }
    const matched = shifts
      .filter((s) => {
        const b = mapWorkShiftToBand({
          id: String(s.id),
          name: s.name,
          start_time: s.start_time,
          end_time: s.end_time,
          shift_type: s.shift_type,
        });
        if (b === 'OFF') return false;
        if (p === 'outpatient_day') return b === 'D';
        if (p === 'two_shift') return b === 'D' || b === 'N';
        return true;
      })
      .map((s) => String(s.id));
    if (matched.length) setShiftIds(matched);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="자동편성 설정"
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div>
            <h3 className="text-sm font-black">🤖 자동편성 설정</h3>
            <p className="text-[11px] text-[var(--toss-gray-4)]">{yearMonth} · 규칙 엔진 (로컬)</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: 'ward_3shift' as const, l: '병동 3교대' },
                { id: 'two_shift' as const, l: '2교대' },
                { id: 'outpatient_day' as const, l: '외래/주간' },
                { id: 'custom' as const, l: '커스텀' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={`rounded-xl border px-3 py-2 text-left text-[12px] font-bold ${
                  pattern === p.id
                    ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                    : 'border-[var(--border)]'
                }`}
              >
                {p.l}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Num label="최소 D" v={minD} set={setMinD} />
            <Num label="최소 E" v={minE} set={setMinE} />
            <Num label="최소 N" v={minN} set={setMinN} />
            <Num label="나이트/인" v={targetN} set={setTargetN} />
            <Num label="오프/인" v={targetO} set={setTargetO} />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-[11px] font-bold">
              <span>직원 {staffIds.length}/{staffs.length}</span>
              <button type="button" className="text-[var(--accent)]" onClick={() => setStaffIds(staffs.map((s) => String(s.id)))}>
                전체
              </button>
            </div>
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)] p-2">
              {staffs.map((s) => {
                const id = String(s.id);
                const on = staffIds.includes(id);
                return (
                  <label key={id} className="flex cursor-pointer items-center gap-2 text-[12px]">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setStaffIds((prev) =>
                          on ? prev.filter((x) => x !== id) : [...prev, id],
                        )
                      }
                    />
                    {s.name}
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-bold">근무유형 ({shiftIds.length})</p>
            <div className="max-h-28 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)] p-2">
              {shifts.map((s) => {
                const id = String(s.id);
                const on = shiftIds.includes(id);
                const b = resolveShiftBand(s);
                return (
                  <label key={id} className="flex cursor-pointer items-center justify-between gap-2 text-[11px]">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setShiftIds((prev) =>
                            on ? prev.filter((x) => x !== id) : [...prev, id],
                          )
                        }
                      />
                      {s.name}
                    </span>
                    <span className="font-bold text-[var(--toss-gray-3)]">{BAND_LABEL[b]}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
        <footer className="flex gap-2 border-t border-[var(--border)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-[var(--border)] py-2 text-[12px] font-bold"
          >
            취소
          </button>
          <button
            type="button"
            disabled={!staffIds.length}
            onClick={() =>
              void onRun({
                pattern,
                minStaff: { D: minD, E: minE, N: minN },
                targetNight: targetN,
                targetOff: targetO,
                staffIds,
                shiftIds,
              })
            }
            className="flex-[2] rounded-xl bg-[var(--accent)] py-2 text-[12px] font-bold text-white disabled:opacity-50"
          >
            자동편성 실행 & 저장
          </button>
        </footer>
      </div>
    </div>
  );
}

function Num({
  label,
  v,
  set,
}: {
  label: string;
  v: number;
  set: (n: number) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5 text-[10px] font-bold text-[var(--toss-gray-4)]">
      {label}
      <input
        type="number"
        min={0}
        max={31}
        value={v}
        onChange={(e) => set(Math.max(0, Number(e.target.value) || 0))}
        className="rounded-lg border border-[var(--border)] px-2 py-1 text-[13px] font-bold"
      />
    </label>
  );
}
