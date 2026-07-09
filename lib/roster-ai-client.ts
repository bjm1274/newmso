/**
 * AI 근무표 추천 클라이언트 헬퍼
 * - 마법사 설정 → API payload
 * - staffPlans → ScheduleMap 파싱
 * - 최소인원 / N→D 등 검증
 */

import type { ShiftRole, ScheduleMap, RosterPattern } from '@/lib/shift-auto-scheduler';

export type RosterPlanConfig = {
  pattern: RosterPattern;
  minStaff: { D: number; E: number; N: number };
  targetNight: number;
  targetOff: number;
  maxConsecutiveWorkDays?: number;
  offDaysAfterNight?: number;
  staffIds: string[];
  shiftIds: string[];
};

export type AiStaffLite = {
  id: string;
  name?: string | null;
  department?: string | null;
  position?: string | null;
  role?: string | null;
  mode?: 'rotation' | 'day_fixed' | 'evening_fixed' | 'night_fixed';
};

export type AiShiftLite = {
  id: string;
  name?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  shift_type?: string | null;
  description?: string | null;
};

export type ScheduleValidation = {
  ok: boolean;
  minStaffGapDays: number;
  nThenDCount: number;
  messages: string[];
};

const MODE_TO_GROUP: Record<string, string> = {
  rotation: 'rotation',
  day_fixed: 'day_fixed',
  evening_fixed: 'evening_fixed',
  night_fixed: 'night_fixed',
};

/** 마법사 설정 → AI API body */
export function buildRosterAiPayload(opts: {
  yearMonth: string;
  company: string;
  department: string;
  daysInMonth: number;
  plan: RosterPlanConfig;
  staffs: AiStaffLite[];
  shifts: AiShiftLite[];
}): Record<string, unknown> {
  const { yearMonth, company, department, daysInMonth, plan, staffs, shifts } = opts;
  const monthDates = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    return `${yearMonth}-${String(d).padStart(2, '0')}`;
  });

  const filteredStaffs = staffs.filter((s) => plan.staffIds.includes(String(s.id)));
  const filteredShifts =
    plan.shiftIds.length > 0
      ? shifts.filter((s) => plan.shiftIds.includes(String(s.id)))
      : shifts;

  const workShifts =
    filteredShifts.length > 0
      ? filteredShifts.map((s) => ({
          id: String(s.id),
          name: String(s.name || s.id),
          start_time: s.start_time,
          end_time: s.end_time,
          shift_type: s.shift_type || 'rotation',
          description: s.description,
        }))
      : [
          { id: 'shift_d', name: '데이', shift_type: 'day' },
          { id: 'shift_e', name: '이브닝', shift_type: 'evening' },
          { id: 'shift_n', name: '나이트', shift_type: 'night' },
        ];

  const isOutpatient = plan.pattern === 'outpatient_day';
  const isTwo = plan.pattern === 'two_shift';

  const staffsPayload = filteredStaffs.map((s) => {
    const mode = s.mode || 'rotation';
    return {
      id: String(s.id),
      name: String(s.name || '직원'),
      department: String(s.department || department || ''),
      position: String(s.position || ''),
      role: String(s.role || ''),
      employmentType: '정규직',
      preferredOffDates: [] as string[],
      minNightShiftCount: mode === 'day_fixed' || isOutpatient ? 0 : Math.max(0, plan.targetNight - 1),
      maxNightShiftCount:
        mode === 'day_fixed' || isOutpatient
          ? 0
          : mode === 'night_fixed'
            ? Math.max(plan.targetNight, 10)
            : Math.max(plan.targetNight + 2, plan.targetNight),
      resolvedGroupMode: MODE_TO_GROUP[mode] || 'rotation',
      resolvedGroupLabel:
        mode === 'day_fixed'
          ? '주간전담'
          : mode === 'evening_fixed'
            ? '이브닝전담'
            : mode === 'night_fixed'
              ? '야간전담'
              : '순환',
      blockedShiftBands:
        mode === 'day_fixed' || isOutpatient
          ? (['evening', 'night'] as Array<'day' | 'evening' | 'night'>)
          : mode === 'night_fixed'
            ? (['day', 'evening'] as Array<'day' | 'evening' | 'night'>)
            : mode === 'evening_fixed'
              ? (['night'] as Array<'day' | 'evening' | 'night'>)
              : undefined,
      avoidWeekendWork: isOutpatient,
      preferWeekendOff: isOutpatient,
    };
  });

  const deptLabel = String(department || '').trim() || '전체';

  return {
    selectedMonth: yearMonth,
    selectedCompany: String(company || '전체').trim() || '전체',
    selectedDepartment: deptLabel,
    selectedDepartments: deptLabel === '전체' ? [] : [deptLabel],
    monthDates,
    workShifts,
    staffs: staffsPayload,
    generationBasis: `pattern=${plan.pattern}; local-wizard-config`,
    patternProfile: {
      id: plan.pattern,
      name:
        plan.pattern === 'ward_3shift'
          ? '병동 3교대'
          : plan.pattern === 'two_shift'
            ? '2교대'
            : plan.pattern === 'outpatient_day'
              ? '외래/주간'
              : '커스텀',
      description: `나이트 목표 ${plan.targetNight}/인, 오프 ${plan.targetOff}/인, 최소 D${plan.minStaff.D}/E${plan.minStaff.E}/N${plan.minStaff.N}`,
      teamKeywords: deptLabel === '전체' ? [] : [deptLabel],
    },
    constraints: {
      targetOffDays: plan.targetOff,
      preferredOffCount: plan.targetOff,
      minNightDays: isOutpatient ? 0 : Math.max(0, plan.targetNight - 1),
      targetNightDays: isOutpatient ? 0 : plan.targetNight,
      maxNightDays: isOutpatient ? 0 : Math.max(plan.targetNight + 2, plan.targetNight),
      minDayReq: plan.minStaff.D,
      minEveReq: isOutpatient ? 0 : plan.minStaff.E,
      minNightReq: isOutpatient ? 0 : plan.minStaff.N,
      weekendMinDayReq: isOutpatient ? 0 : Math.max(1, Math.floor(plan.minStaff.D * 0.75)),
      weekendMinEveReq: isOutpatient ? 0 : Math.max(0, Math.floor(plan.minStaff.E * 0.75)),
      weekendMinNightReq: isOutpatient ? 0 : plan.minStaff.N,
      holidayMinDayReq: isOutpatient ? 0 : Math.max(1, Math.floor(plan.minStaff.D * 0.75)),
      holidayMinEveReq: isOutpatient ? 0 : Math.max(0, Math.floor(plan.minStaff.E * 0.75)),
      holidayMinNightReq: isOutpatient ? 0 : plan.minStaff.N,
      enableSkillMix: true,
      offDaysAfterNight: isOutpatient ? 0 : (plan.offDaysAfterNight ?? 1),
      nightBlockSize: isTwo || isOutpatient ? 1 : 2,
      maxConsecutiveWorkDays: plan.maxConsecutiveWorkDays ?? 5,
      avoidDayAfterNight: true,
      avoidDayAfterEvening: plan.pattern === 'ward_3shift',
      distributeWeekendShifts: !isOutpatient,
      distributeHolidayShifts: !isOutpatient,
      fixedShiftOnly: false,
      generationStyle: 'balanced' as const,
    },
  };
}

/** AI assignments 배열 → ScheduleMap */
export function parseAiStaffPlansToSchedule(
  staffPlans: Array<{ staffId?: string; assignments?: unknown[] }>,
  daysInMonth: number,
  resolveShiftIdToRole?: (shiftId: string) => ShiftRole,
): ScheduleMap {
  const schedule: ScheduleMap = {};
  for (const plan of staffPlans) {
    const sid = String(plan.staffId || '').trim();
    if (!sid) continue;
    schedule[sid] = {};
    const list = Array.isArray(plan.assignments) ? plan.assignments : [];
    list.forEach((assignment, idx) => {
      const dayNum = idx + 1;
      if (dayNum > daysInMonth) return;
      schedule[sid][dayNum] = parseAssignmentToken(assignment, resolveShiftIdToRole);
    });
    // 빈 날 OFF
    for (let d = 1; d <= daysInMonth; d++) {
      if (!schedule[sid][d]) schedule[sid][d] = 'OFF';
    }
  }
  return schedule;
}

function parseAssignmentToken(
  assignment: unknown,
  resolveShiftIdToRole?: (shiftId: string) => ShiftRole,
): ShiftRole {
  const raw = String(assignment ?? '').trim();
  const upper = raw.toUpperCase();
  if (['D', 'E', 'N', 'OFF', 'LEAVE', 'TRAINING'].includes(upper)) {
    return upper as ShiftRole;
  }
  if (upper === '__OFF__' || upper === 'O' || upper === '휴무' || upper === '오프') return 'OFF';
  if (resolveShiftIdToRole) {
    return resolveShiftIdToRole(raw);
  }
  return 'OFF';
}

/** 최소인원·N→D 검증 */
export function validateScheduleMap(
  schedule: ScheduleMap,
  staffIds: string[],
  daysInMonth: number,
  minStaff: { D: number; E: number; N: number },
): ScheduleValidation {
  const messages: string[] = [];
  let minStaffGapDays = 0;
  let nThenDCount = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const c = { D: 0, E: 0, N: 0 };
    for (const sid of staffIds) {
      const r = schedule[sid]?.[d];
      if (r === 'D' || r === 'E' || r === 'N') c[r]++;
      if (d > 1 && schedule[sid]?.[d - 1] === 'N' && r === 'D') {
        nThenDCount++;
      }
    }
    const gaps: string[] = [];
    if (c.D < minStaff.D) gaps.push(`D ${c.D}/${minStaff.D}`);
    if (c.E < minStaff.E) gaps.push(`E ${c.E}/${minStaff.E}`);
    if (c.N < minStaff.N) gaps.push(`N ${c.N}/${minStaff.N}`);
    if (gaps.length) {
      minStaffGapDays++;
      if (messages.length < 8) messages.push(`${d}일 최소인원 미달 (${gaps.join(', ')})`);
    }
  }

  if (nThenDCount > 0) {
    messages.push(`N→D 연속 배정 ${nThenDCount}건 (권장: 나이트 다음날 오프)`);
  }

  return {
    ok: minStaffGapDays === 0 && nThenDCount === 0,
    minStaffGapDays,
    nThenDCount,
    messages,
  };
}

/**
 * 가벼운 사후 보정: N→D 를 OFF 로, 최소인원 부족 시 OFF 인원 끌어오기
 */
export function repairScheduleMap(
  schedule: ScheduleMap,
  staffIds: string[],
  daysInMonth: number,
  minStaff: { D: number; E: number; N: number },
): ScheduleMap {
  const next: ScheduleMap = {};
  for (const sid of staffIds) {
    next[sid] = { ...(schedule[sid] || {}) };
    for (let d = 1; d <= daysInMonth; d++) {
      if (!next[sid][d]) next[sid][d] = 'OFF';
    }
  }

  // N→D 수정
  for (const sid of staffIds) {
    for (let d = 2; d <= daysInMonth; d++) {
      if (next[sid][d - 1] === 'N' && next[sid][d] === 'D') {
        next[sid][d] = 'OFF';
      }
    }
  }

  // 최소인원 보정
  for (let d = 1; d <= daysInMonth; d++) {
    for (const band of ['D', 'E', 'N'] as const) {
      const need = minStaff[band];
      if (need <= 0) continue;
      let count = 0;
      for (const sid of staffIds) {
        if (next[sid][d] === band) count++;
      }
      let gap = need - count;
      if (gap <= 0) continue;
      for (const sid of staffIds) {
        if (gap <= 0) break;
        if (next[sid][d] !== 'OFF') continue;
        // N 다음날 D 금지
        if (band === 'D' && d > 1 && next[sid][d - 1] === 'N') continue;
        // 나이트 직후 근무 금지
        if (band !== 'N' && d > 1 && next[sid][d - 1] === 'N') continue;
        next[sid][d] = band;
        gap--;
      }
    }
  }

  return next;
}

export function defaultPlanFromTeam(team: string, staffCount: number): RosterPlanConfig {
  const isOut = /외래|원무|행정|접수|검진/.test(team);
  const isWard = /병동|간호|icu|응급|중환자/i.test(team);
  if (isOut) {
    return {
      pattern: 'outpatient_day',
      minStaff: { D: Math.min(3, Math.max(1, staffCount)), E: 0, N: 0 },
      targetNight: 0,
      targetOff: 8,
      maxConsecutiveWorkDays: 5,
      offDaysAfterNight: 0,
      staffIds: [],
      shiftIds: [],
    };
  }
  if (isWard) {
    return {
      pattern: 'ward_3shift',
      minStaff: { D: 2, E: 2, N: 2 },
      targetNight: 4,
      targetOff: 8,
      maxConsecutiveWorkDays: 5,
      offDaysAfterNight: 1,
      staffIds: [],
      shiftIds: [],
    };
  }
  return {
    pattern: 'custom',
    minStaff: { D: 1, E: 0, N: 1 },
    targetNight: 3,
    targetOff: 8,
    maxConsecutiveWorkDays: 5,
    offDaysAfterNight: 1,
    staffIds: [],
    shiftIds: [],
  };
}
