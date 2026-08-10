import { GoogleGenerativeAI, type ResponseSchema, SchemaType } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';
import { isKoreanPublicHoliday } from '@/lib/korean-public-holidays';
import { expandCoverageRoleTags, normalizeCoverageRoleTags } from '@/lib/roster-role-tags';
import { readSessionFromRequest } from '@/lib/server-session';
import { buildShiftBandText, hasWorkingHours } from '@/lib/shift-resolution';
import { withTimeout } from '@/lib/promise-timeout';

// 유저별 AI 근무표 생성 요청 횟수 제한 (인스턴스 내 메모리 기반)
const rosterRateLimit = new Map<string, { count: number; resetAt: number }>();
const ROSTER_MAX_PER_HOUR = 10;
const ROSTER_WINDOW_MS = 60 * 60 * 1000;

function checkRosterRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rosterRateLimit.get(userId);
  if (!entry || now > entry.resetAt) {
    rosterRateLimit.set(userId, { count: 1, resetAt: now + ROSTER_WINDOW_MS });
    return true;
  }
  if (entry.count >= ROSTER_MAX_PER_HOUR) return false;
  entry.count++;
  return true;
}

const MODELS = ['gemini-2.5-pro', 'gemini-2.5-flash'] as const;
const OFF_SHIFT_TOKEN = '__OFF__';
const MIN_GENERAL_REST_HOURS = 11;
const MIN_REST_HOURS_AFTER_NIGHT = 24;

const DAY_ONLY_TEAM_KEYWORDS = [
  '외래',
  '원무',
  '행정',
  '경영지원',
  '총무',
  '인사',
  '재무',
  '구매',
  '홍보',
  '마케팅',
  '상담',
  '접수',
  '예약',
  '검진',
];

const NIGHT_CARE_TEAM_KEYWORDS = [
  '병동',
  '입원',
  '응급',
  '중환자',
  '중환자실',
  '수술',
  '회복실',
  '분만',
  '투석',
  '간호',
];

type RequestWorkShift = {
  id: string;
  name: string;
  start_time?: string | null;
  end_time?: string | null;
  description?: string | null;
  shift_type?: string | null;
  company_name?: string | null;
  weekly_work_days?: number | null;
  is_weekend_work?: boolean | null;
};

type RequestStaff = {
  id: string;
  name: string;
  employeeNo?: string;
  position?: string;
  role?: string;
  employmentType?: string;
  department?: string;
  assignedShiftId?: string;
  shiftType?: string;
  preferredOffDates?: string[];
  minNightShiftCount?: number;
  maxNightShiftCount?: number;
  resolvedGroupLabel?: string;
  resolvedGroupMode?: string;
  resolvedGroupReason?: string;
  coverageRoleTags?: string[];
  isNewNurse?: boolean;
  blockedShiftBands?: Array<'day' | 'evening' | 'night'>;
  blockedWeekdays?: number[];
  avoidWeekendWork?: boolean;
  avoidHolidayWork?: boolean;
  blockPreference?: 'short' | 'balanced' | 'long' | 'night_focus';
  preferWeekendOff?: boolean;
  preferHolidayOff?: boolean;
  avoidConsecutiveEvening?: boolean;
  preferEarlyMonthNight?: boolean;
};

type RequestRoleCoverageRule = {
  id?: string;
  label?: string;
  keywords?: string[];
  minDayStaff?: number;
  minEveningStaff?: number;
  minNightStaff?: number;
};

type RequestDateCoverageOverride = {
  id?: string;
  date?: string;
  minDayStaff?: number;
  minEveningStaff?: number;
  minNightStaff?: number;
};

type RequestPairRule = {
  id?: string;
  primaryStaffId?: string;
  secondaryStaffId?: string;
  mode?: 'together' | 'separate';
  band?: 'night' | 'work';
};

type RequestPatternProfile = {
  id?: string;
  name?: string;
  description?: string;
  teamKeywords?: string[];
  staffGroups?: Array<{
    id?: string;
    label?: string;
    mode?: string;
    matchKeywords?: string[];
    shiftIds?: string[];
    note?: string;
  }>;
};

type RequestBody = {
  selectedMonth: string;
  selectedCompany: string;
  selectedDepartment: string;
  selectedDepartments?: string[];
  monthDates: string[];
  workShifts: RequestWorkShift[];
  staffs: RequestStaff[];
  patternProfile?: RequestPatternProfile | null;
  generationBasis?: string;
  constraints?: {
    targetOffDays: number;
    minNightDays?: number;
    targetNightDays: number;
    maxNightDays?: number;
    minDayReq: number;
    minEveReq: number;
    minNightReq: number;
    weekendMinDayReq?: number;
    weekendMinEveReq?: number;
    weekendMinNightReq?: number;
    holidayMinDayReq?: number;
    holidayMinEveReq?: number;
    holidayMinNightReq?: number;
    minSeniorDayReq?: number;
    minSeniorEveReq?: number;
    minSeniorNightReq?: number;
    minDedicatedDayReq?: number;
    minDedicatedEveReq?: number;
    minDedicatedNightReq?: number;
    enableSkillMix: boolean;
    offDaysAfterNight?: number;
    nightBlockSize?: number;
    maxConsecutiveWorkDays?: number;
    avoidDayAfterNight?: boolean;
    avoidDayAfterEvening?: boolean;
    distributeWeekendShifts?: boolean;
    distributeHolidayShifts?: boolean;
    fixedShiftOnly?: boolean;
    generationStyle?: 'balanced' | 'block' | 'variety' | 'stable';
    preferredOffCount?: number;
    blockNewNurseSoloNight?: boolean;
    requireSeniorWithNewNurseNight?: boolean;
    roleCoverageRules?: RequestRoleCoverageRule[];
    dateCoverageOverrides?: RequestDateCoverageOverride[];
    pairRules?: RequestPairRule[];
  };
  preAssigned?: Record<string, string>;
};

type GeminiRecommendationResponse = {
  summary: string;
  teamAnalysis: {
    teamPurpose: string;
    workMode: string;
    includesNight: boolean;
    reasoning: string[];
    planningFocus: string[];
  };
  staffPlans: Array<{
    staffId: string;
    modeLabel: string;
    rationale: string;
    assignments: string[];
  }>;
};

const responseSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    summary: { type: SchemaType.STRING },
    teamAnalysis: {
      type: SchemaType.OBJECT,
      properties: {
        teamPurpose: { type: SchemaType.STRING },
        workMode: { type: SchemaType.STRING },
        includesNight: { type: SchemaType.BOOLEAN },
        reasoning: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING } },
        planningFocus: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING } } },
      required: ['teamPurpose', 'workMode', 'includesNight', 'reasoning', 'planningFocus'] },
    staffPlans: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          staffId: { type: SchemaType.STRING },
          modeLabel: { type: SchemaType.STRING },
          rationale: { type: SchemaType.STRING },
          assignments: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING } } },
        required: ['staffId', 'modeLabel', 'rationale', 'assignments'] } } },
  required: ['summary', 'teamAnalysis', 'staffPlans'] };

function normalizeShiftName(name: string) {
  return String(name || '').replace(/\s+/g, '').toLowerCase();
}

// description 은 밴드 판정에서 제외한다 — 이유는 buildShiftBandText 주석 참고.
// (여기도 같은 이유로 거의 모든 시프트를 night 으로 분류하고 있었다.)
const buildShiftSearchText = buildShiftBandText;

function hasBandPrefix(rawText: string, compactText: string, prefix: 'd' | 'e' | 'n' | 'o') {
  if (compactText === prefix) return true;
  if (compactText.startsWith(`${prefix}/`) || compactText.startsWith(`${prefix}-`) || compactText.startsWith(`${prefix}_`)) {
    return true;
  }
  if (compactText.startsWith(`${prefix}병동`) || compactText.startsWith(`${prefix}ward`) || compactText.startsWith(`${prefix}shift`)) {
    return true;
  }
  return rawText.split(/[\s/_()[\]-]+/).some((token) => token === prefix);
}

function resolveShiftBand(shift: RequestWorkShift) {
  const rawText = buildShiftSearchText(shift);
  const normalized = normalizeShiftName(rawText);
  const hasStartTime = Boolean(String(shift.start_time || '').trim());
  const hasEndTime = Boolean(String(shift.end_time || '').trim());
  const startHour = Number(String(shift.start_time || '').slice(0, 2) || '0');
  const endHour = Number(String(shift.end_time || '').slice(0, 2) || '0');
  const overnight = Boolean(hasStartTime && hasEndTime && startHour > endHour);

  // 근무 시각이 있으면 OFF 일 수 없다 — shift_type 의 `2일근무 1일휴무` 같은
  // 근무 패턴 표기가 휴무로 오인되는 것을 막는다(hasWorkingHours 주석 참고).
  const working = hasWorkingHours(shift);
  if (
    (!working &&
      (normalized.includes('off') ||
        normalized.includes('휴무') ||
        normalized.includes('비번') ||
        normalized.includes('오프'))) ||
    hasBandPrefix(rawText, normalized, 'o')
  ) {
    return 'off';
  }

  if (
    normalized.includes('night') ||
    normalized.includes('나이트') ||
    normalized.includes('야간') ||
    hasBandPrefix(rawText, normalized, 'n') ||
    (hasStartTime && startHour >= 20) ||
    (hasStartTime && startHour <= 4) ||
    overnight ||
    (hasEndTime && endHour <= 8)
  ) {
    return 'night';
  }

  if (
    normalized.includes('evening') ||
    normalized.includes('eve') ||
    normalized.includes('이브닝') ||
    normalized.includes('오후') ||
    hasBandPrefix(rawText, normalized, 'e') ||
    (hasStartTime && startHour >= 12 && startHour < 20)
  ) {
    return 'evening';
  }

  return 'day';
}

function deriveTeamHint({ selectedDepartment, workShifts }: RequestBody) {
  const normalizedDepartment = normalizeShiftName(selectedDepartment);
  const shiftBands = workShifts.map(resolveShiftBand);
  const hasNightShift = shiftBands.includes('night');
  const hasEveningShift = shiftBands.includes('evening');
  const hasSevenDayShift = workShifts.some(
    (shift) => shift.is_weekend_work || Number(shift.weekly_work_days) >= 7
  );
  const matchesDayOnly = DAY_ONLY_TEAM_KEYWORDS.some((keyword) =>
    normalizedDepartment.includes(normalizeShiftName(keyword))
  );
  const matchesNightCare = NIGHT_CARE_TEAM_KEYWORDS.some((keyword) =>
    normalizedDepartment.includes(normalizeShiftName(keyword))
  );

  if (matchesNightCare && hasNightShift) {
    return {
      mode: '24시간 교대 가능성 높음',
      reason:
        '팀명상 병동/입원/응급/수술 계열로 보이며, 등록된 근무형태에 야간이 있어 주야간 편성이 필요할 가능성이 높습니다.' };
  }

  if (matchesDayOnly && !hasNightShift) {
    return {
      mode: '주간 전용 가능성 높음',
      reason:
        '외래/행정/원무 계열 팀명이며 야간 근무형태가 없어 평일 중심 주간 근무일 가능성이 높습니다.' };
  }

  if (hasNightShift && hasEveningShift && hasSevenDayShift) {
    return {
      mode: '야간 포함 운영 가능성 있음',
      reason:
        '등록된 근무형태에 이브닝/나이트/주말 포함 근무가 있어 야간 포함 순환 편성이 필요한 팀일 수 있습니다.' };
  }

  return {
    mode: '주간 중심 운영 가능성 있음',
    reason:
      '팀명과 등록 근무형태만으로는 24시간 운영 근거가 강하지 않아, 주간 중심 편성 여부를 우선 검토해야 합니다.' };
}

function isSeniorStaff(staff: RequestStaff) {
  const pos = normalizeShiftName(staff.position || '');
  const role = normalizeShiftName(staff.role || '');
  const keywords = ['수간호사', '책임', '파트장', '팀장', '부장', '과장', 'senior', 'charge', 'leader'];
  return keywords.some(k => pos.includes(k) || role.includes(k));
}

function buildPreAssignedKey(staffId: string, date: string) {
  return `${staffId}|${date}`;
}

function normalizePreAssignedEntries(preAssigned?: Record<string, string>) {
  if (!preAssigned || typeof preAssigned !== 'object') return [];

  return Object.entries(preAssigned)
    .map(([key, shiftId]) => {
      const [staffId, date] = String(key || '').split('|');
      return {
        key,
        staffId: String(staffId || '').trim(),
        date: String(date || '').trim(),
        shiftId: String(shiftId || '').trim() };
    })
    .filter((entry) => entry.staffId && entry.date && entry.shiftId);
}

function parseShiftTimeToMinutes(value: string | null | undefined) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const [hourText, minuteText] = raw.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function buildShiftDateTimeRange(dateKey: string, shift?: RequestWorkShift | null) {
  if (!shift?.start_time || !shift?.end_time || !dateKey) return null;
  const startMinutes = parseShiftTimeToMinutes(shift.start_time);
  const endMinutes = parseShiftTimeToMinutes(shift.end_time);
  if (startMinutes === null || endMinutes === null) return null;

  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return null;

  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  start.setMinutes(startMinutes);
  const end = new Date(year, month - 1, day, 0, 0, 0, 0);
  end.setMinutes(endMinutes);
  if (end.getTime() <= start.getTime()) {
    end.setDate(end.getDate() + 1);
  }

  return { start, end };
}

function calculateRestGapHours(
  previousShiftId: string,
  nextShiftId: string,
  previousDateKey: string,
  nextDateKey: string,
  shiftMap: Map<string, RequestWorkShift>
) {
  const previousShift = shiftMap.get(previousShiftId);
  const nextShift = shiftMap.get(nextShiftId);
  if (!previousShift || !nextShift) return null;

  const previousRange = buildShiftDateTimeRange(previousDateKey, previousShift);
  const nextRange = buildShiftDateTimeRange(nextDateKey, nextShift);
  if (!previousRange || !nextRange) return null;

  return (nextRange.start.getTime() - previousRange.end.getTime()) / (1000 * 60 * 60);
}

function resolveConfiguredWorkDayMode(shift?: RequestWorkShift | null) {
  if (!shift) return 'weekdays';
  if (String(shift.shift_type || '').includes('3교대')) return 'all_days';
  if (shift.is_weekend_work || Number(shift.weekly_work_days) >= 7) return 'all_days';
  return 'weekdays';
}

function countPreviousAssignedWorkStreak(assignments: string[], index: number) {
  if (index <= 0) return 0;
  let streak = 0;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const token = assignments[cursor] || '';
    if (!token || token === OFF_SHIFT_TOKEN) break;
    streak += 1;
  }
  return streak;
}

function countNextAssignedWorkStreak(assignments: string[], index: number) {
  if (index >= assignments.length - 1) return 0;
  let streak = 0;
  for (let cursor = index + 1; cursor < assignments.length; cursor += 1) {
    const token = assignments[cursor] || '';
    if (!token || token === OFF_SHIFT_TOKEN) break;
    streak += 1;
  }
  return streak;
}

function countAssignedBand(
  assignments: string[],
  shiftMap: Map<string, RequestWorkShift>,
  band: 'day' | 'evening' | 'night'
) {
  return assignments.reduce((count, token) => {
    if (!token || token === OFF_SHIFT_TOKEN) return count;
    return resolveShiftBand(shiftMap.get(token) || { id: token, name: '', start_time: null, end_time: null }) === band
      ? count + 1
      : count;
  }, 0);
}

function resolveFallbackAllowedBands(
  staff: RequestStaff,
  payload: RequestBody,
  availableBands: Set<'day' | 'evening' | 'night'>
) {
  let resolvedBands = new Set<'day' | 'evening' | 'night'>(availableBands);

  if (payload.constraints?.fixedShiftOnly) {
    if (staff.resolvedGroupMode === 'day_fixed') {
      resolvedBands = new Set<'day' | 'evening' | 'night'>(['day']);
    } else if (staff.resolvedGroupMode === 'evening_fixed') {
      resolvedBands = new Set<'day' | 'evening' | 'night'>(['evening']);
    } else if (staff.resolvedGroupMode === 'night_fixed') {
      resolvedBands = new Set<'day' | 'evening' | 'night'>(['night']);
    }
  }

  const blockedBands = normalizeBlockedShiftBands(staff.blockedShiftBands);
  if (blockedBands.length === 0) return resolvedBands;
  return new Set([...resolvedBands].filter((band) => !blockedBands.includes(band)));
}

function resolveDedicatedBandForStaff(staff: RequestStaff) {
  if (staff.resolvedGroupMode === 'day_fixed') return 'day' as const;
  if (staff.resolvedGroupMode === 'evening_fixed') return 'evening' as const;
  if (staff.resolvedGroupMode === 'night_fixed') return 'night' as const;
  return null;
}

function createEmptyBandCounts() {
  return {
    day: 0,
    evening: 0,
    night: 0 } satisfies Record<'day' | 'evening' | 'night', number>;
}

function normalizeRequestRoleCoverageRules(value: RequestRoleCoverageRule[] | undefined) {
  return (value || [])
    .map((roleRule, index) => ({
      id: String(roleRule.id || `role-slot-${index + 1}`),
      label: String(roleRule.label || `역할 슬롯 ${index + 1}`).trim(),
      keywords: normalizeCoverageRoleTags(roleRule.keywords || []),
      minDayStaff: Math.max(0, Math.floor(roleRule.minDayStaff || 0)),
      minEveningStaff: Math.max(0, Math.floor(roleRule.minEveningStaff || 0)),
      minNightStaff: Math.max(0, Math.floor(roleRule.minNightStaff || 0)) }))
    .filter(
      (roleRule) =>
        roleRule.keywords.length > 0 &&
        (roleRule.minDayStaff > 0 || roleRule.minEveningStaff > 0 || roleRule.minNightStaff > 0)
    );
}

function normalizeRequestDateCoverageOverrides(value: RequestDateCoverageOverride[] | undefined) {
  return (value || [])
    .map((entry, index) => ({
      id: String(entry.id || `date-override-${index + 1}`),
      date: String(entry.date || '').trim().slice(0, 10),
      minDayStaff: Math.max(0, Math.floor(entry.minDayStaff || 0)),
      minEveningStaff: Math.max(0, Math.floor(entry.minEveningStaff || 0)),
      minNightStaff: Math.max(0, Math.floor(entry.minNightStaff || 0)) }))
    .filter(
      (entry) =>
        /^\d{4}-\d{2}-\d{2}$/.test(entry.date) &&
        (entry.minDayStaff > 0 || entry.minEveningStaff > 0 || entry.minNightStaff > 0)
    )
    .sort((left, right) => left.date.localeCompare(right.date));
}

function normalizeRequestPairRules(value: RequestPairRule[] | undefined, staffIds: Set<string>) {
  return (value || [])
    .map((entry, index) => {
      const primaryStaffId = String(entry.primaryStaffId || '').trim();
      const secondaryStaffId = String(entry.secondaryStaffId || '').trim();
      const mode = entry.mode === 'separate' ? 'separate' : entry.mode === 'together' ? 'together' : null;
      const band = entry.band === 'work' ? 'work' : entry.band === 'night' ? 'night' : null;
      if (!primaryStaffId || !secondaryStaffId || primaryStaffId === secondaryStaffId) return null;
      if (!mode || !band) return null;
      if (!staffIds.has(primaryStaffId) || !staffIds.has(secondaryStaffId)) return null;

      return {
        id: String(entry.id || `pair-rule-${index + 1}`),
        primaryStaffId,
        secondaryStaffId,
        mode,
        band };
    })
    .filter(
      (
        entry
      ): entry is {
        id: string;
        primaryStaffId: string;
        secondaryStaffId: string;
        mode: 'together' | 'separate';
        band: 'night' | 'work';
      } => Boolean(entry)
    );
}

function normalizeBlockedShiftBands(value: unknown) {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((entry) => String(entry || '').trim())
        .filter(
          (entry): entry is 'day' | 'evening' | 'night' =>
            entry === 'day' || entry === 'evening' || entry === 'night'
        )
    )
  );
}

function normalizeBlockedWeekdays(value: unknown) {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((entry) => Number(entry))
        .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 6)
    )
  ).sort((left, right) => left - right);
}

function getBandTargetsForDate(payload: RequestBody, dateKey: string) {
  const baseTargets = {
    day: Math.max(0, Math.floor(payload.constraints?.minDayReq ?? 0)),
    evening: Math.max(0, Math.floor(payload.constraints?.minEveReq ?? 0)),
    night: Math.max(0, Math.floor(payload.constraints?.minNightReq ?? 0)) } satisfies Record<'day' | 'evening' | 'night', number>;
  const dateOverride = normalizeRequestDateCoverageOverrides(
    payload.constraints?.dateCoverageOverrides
  ).find((entry) => entry.date === dateKey);
  if (dateOverride) {
    return {
      targets: {
        day: dateOverride.minDayStaff,
        evening: dateOverride.minEveningStaff,
        night: dateOverride.minNightStaff },
      source: `${dateKey} override` };
  }

  if (isKoreanPublicHoliday(dateKey)) {
    const hasHolidayOverride =
      Number(payload.constraints?.holidayMinDayReq || 0) > 0 ||
      Number(payload.constraints?.holidayMinEveReq || 0) > 0 ||
      Number(payload.constraints?.holidayMinNightReq || 0) > 0;
    if (hasHolidayOverride) {
      return {
        targets: {
          day: Math.max(0, Math.floor(payload.constraints?.holidayMinDayReq ?? 0)),
          evening: Math.max(0, Math.floor(payload.constraints?.holidayMinEveReq ?? 0)),
          night: Math.max(0, Math.floor(payload.constraints?.holidayMinNightReq ?? 0)) },
        source: 'holiday override' };
    }
  }

  if (new Date(`${dateKey}T00:00:00`).getDay() === 0 || new Date(`${dateKey}T00:00:00`).getDay() === 6) {
    const hasWeekendOverride =
      Number(payload.constraints?.weekendMinDayReq || 0) > 0 ||
      Number(payload.constraints?.weekendMinEveReq || 0) > 0 ||
      Number(payload.constraints?.weekendMinNightReq || 0) > 0;
    if (hasWeekendOverride) {
      return {
        targets: {
          day: Math.max(0, Math.floor(payload.constraints?.weekendMinDayReq ?? 0)),
          evening: Math.max(0, Math.floor(payload.constraints?.weekendMinEveReq ?? 0)),
          night: Math.max(0, Math.floor(payload.constraints?.weekendMinNightReq ?? 0)) },
        source: 'weekend override' };
    }
  }

  return {
    targets: baseTargets,
    source: 'base rule' };
}

function getRoleCoverageTargetByBand(
  roleRule: ReturnType<typeof normalizeRequestRoleCoverageRules>[number],
  band: 'day' | 'evening' | 'night'
) {
  if (band === 'day') return roleRule.minDayStaff;
  if (band === 'evening') return roleRule.minEveningStaff;
  return roleRule.minNightStaff;
}

function coverageRoleMatchesRule(
  coverageRoleMatcherText: string,
  roleRule: ReturnType<typeof normalizeRequestRoleCoverageRules>[number]
) {
  const normalizedText = normalizeShiftName(coverageRoleMatcherText);
  return normalizeCoverageRoleTags(roleRule.keywords).some((keyword) =>
    normalizedText.includes(normalizeShiftName(keyword))
  );
}

function buildStaffCoverageRoleMatcherText(staff: RequestStaff) {
  const roleTags = expandCoverageRoleTags(staff.coverageRoleTags || []);
  return normalizeShiftName(
    [
      staff.name,
      staff.position,
      staff.role,
      staff.department,
      staff.shiftType,
      staff.assignedShiftId,
      roleTags.join(' '),
    ]
      .filter(Boolean)
      .join(' ')
  );
}

function buildPrompt(payload: RequestBody) {
  const teamHint = deriveTeamHint(payload);
  const offDaysAfterNight = Math.max(0, Math.floor(payload.constraints?.offDaysAfterNight ?? 1));
  const minNightDays = Math.max(0, Math.floor(payload.constraints?.minNightDays ?? 0));
  const maxNightDays = Math.max(
    minNightDays,
    Math.floor(payload.constraints?.maxNightDays ?? payload.constraints?.targetNightDays ?? 6)
  );
  const preAssignedEntries = normalizePreAssignedEntries(payload.preAssigned);
  const dateCoverageOverrides = normalizeRequestDateCoverageOverrides(
    payload.constraints?.dateCoverageOverrides
  );
  const pairRules = normalizeRequestPairRules(
    payload.constraints?.pairRules,
    new Set(payload.staffs.map((staff) => String(staff.id || '').trim()).filter(Boolean))
  );
  const shiftLines = payload.workShifts
    .map((shift) => {
      const timeRange =
        shift.start_time && shift.end_time
          ? `${String(shift.start_time).slice(0, 5)}-${String(shift.end_time).slice(0, 5)}`
          : '시간 미정';

      return [
        `- shiftId: ${shift.id}`,
        `name: ${shift.name}`,
        `band: ${resolveShiftBand(shift)}`,
        `time: ${timeRange}`,
        `type: ${shift.shift_type || '-'}`,
        `weekend: ${shift.is_weekend_work ? '가능' : '제외 우선'}`,
        `weeklyWorkDays: ${shift.weekly_work_days ?? '-'}`,
      ].join(' | ');
    })
    .join('\n');

  const staffLines = payload.staffs
    .map((staff) =>
      [
        `- staffId: ${staff.id}`,
        `name: ${staff.name}`,
        `seniority: ${isSeniorStaff(staff) ? 'Senior/Charge' : 'Junior/Regular'}`,
        `newNurse: ${staff.isNewNurse ? 'Y' : 'N'}`,
        `employeeNo: ${staff.employeeNo || '-'}`,
        `position: ${staff.position || '-'}`,
        `role: ${staff.role || '-'}`,
        `employmentType: ${staff.employmentType || '-'}`,
        `department: ${staff.department || '-'}`,
        `assignedShiftId: ${staff.assignedShiftId || '-'}`,
        `shiftType: ${staff.shiftType || '-'}`,
        `preferredOffDates: ${Array.isArray(staff.preferredOffDates) && staff.preferredOffDates.length > 0 ? staff.preferredOffDates.join(', ') : '-'}`,
        `nightRange: ${Math.max(0, Math.floor(staff.minNightShiftCount ?? 0))}~${Math.max(Math.floor(staff.minNightShiftCount ?? 0), Math.floor(staff.maxNightShiftCount ?? 0)) || 0}`,
        `dedicatedGroup: ${staff.resolvedGroupLabel || '-'}`,
        `groupMode: ${staff.resolvedGroupMode || '-'}`,
        `groupReason: ${staff.resolvedGroupReason || '-'}`,
        `coverageRoles: ${Array.isArray(staff.coverageRoleTags) && staff.coverageRoleTags.length > 0 ? staff.coverageRoleTags.join(', ') : '-'}`,
        `blockedBands: ${normalizeBlockedShiftBands(staff.blockedShiftBands).join(', ') || '-'}`,
        `blockedWeekdays: ${normalizeBlockedWeekdays(staff.blockedWeekdays).join(', ') || '-'}`,
        `avoidWeekendWork: ${staff.avoidWeekendWork ? 'Y' : 'N'}`,
        `avoidHolidayWork: ${staff.avoidHolidayWork ? 'Y' : 'N'}`,
        `blockPreference: ${staff.blockPreference || 'balanced'}`,
        `preferWeekendOff: ${staff.preferWeekendOff ? 'Y' : 'N'}`,
        `preferHolidayOff: ${staff.preferHolidayOff ? 'Y' : 'N'}`,
        `avoidConsecutiveEvening: ${staff.avoidConsecutiveEvening ? 'Y' : 'N'}`,
        `preferEarlyMonthNight: ${staff.preferEarlyMonthNight ? 'Y' : 'N'}`,
      ].join(' | ')
    )
    .join('\n');
  const patternProfileLines =
    payload.patternProfile?.staffGroups && payload.patternProfile.staffGroups.length > 0
      ? payload.patternProfile.staffGroups
          .map((group) =>
            [
              `- ${group.label || '그룹'}`,
              `mode: ${group.mode || '-'}`,
              `shiftIds: ${Array.isArray(group.shiftIds) && group.shiftIds.length > 0 ? group.shiftIds.join(', ') : '-'}`,
              `keywords: ${Array.isArray(group.matchKeywords) && group.matchKeywords.length > 0 ? group.matchKeywords.join(', ') : '-'}`,
              `note: ${group.note || '-'}`,
            ].join(' | ')
          )
          .join('\n')
      : '';
  const preAssignedLines =
    preAssignedEntries.length > 0
      ? preAssignedEntries
          .map((entry) => `- ${entry.staffId} | ${entry.date} => ${entry.shiftId}`)
          .join('\n')
      : '- 없음';
  const roleCoverageLines =
    Array.isArray(payload.constraints?.roleCoverageRules) && payload.constraints.roleCoverageRules.length > 0
      ? payload.constraints.roleCoverageRules
          .map((roleRule, index) => {
            const label = String(roleRule.label || `역할 슬롯 ${index + 1}`);
            const keywords =
              Array.isArray(roleRule.keywords) && roleRule.keywords.length > 0
                ? roleRule.keywords.join(', ')
                : '-';
            return `- ${label} | keywords: ${keywords} | D ${Math.max(0, Math.floor(roleRule.minDayStaff ?? 0))} / E ${Math.max(0, Math.floor(roleRule.minEveningStaff ?? 0))} / N ${Math.max(0, Math.floor(roleRule.minNightStaff ?? 0))}`;
          })
          .join('\n')
      : '- 역할 슬롯 제약 없음';
  const dateCoverageLines =
    dateCoverageOverrides.length > 0
      ? dateCoverageOverrides
          .map(
            (entry) =>
              `- ${entry.date} | D ${entry.minDayStaff} / E ${entry.minEveningStaff} / N ${entry.minNightStaff}`
          )
          .join('\n')
      : '- 특정 날짜 최소 인원 오버라이드 없음';
  const pairRuleLines =
    pairRules.length > 0
      ? pairRules
          .map(
            (rule) =>
              `- ${rule.primaryStaffId} ${rule.mode === 'together' ? '같이' : '분리'} ${rule.band === 'night' ? 'night' : 'same-work'} ${rule.secondaryStaffId}`
          )
          .join('\n')
      : '- 직원 페어 규칙 없음';
  const weekendGuidance = payload.constraints?.distributeWeekendShifts
    ? '- 주말 근무는 특정 직원에게만 몰리지 않도록 균형을 보되, 최소 인원과 피로도 제약을 우선하세요.'
    : '- 병동 3교대는 주말 여부를 따로 우대하거나 OFF를 더 주지 말고, 평일과 같은 기준으로 D/E/N/OFF를 채우세요.';
  const holidayGuidance = payload.constraints?.distributeHolidayShifts
    ? '- 공휴일 근무도 특정 직원에게만 집중되지 않도록 균형을 고려하세요.'
    : '- 공휴일도 별도 우대 기준으로 다루지 말고, 병동 커버 인원과 피로도 기준을 우선하세요.';
  const basisGuidance =
    payload.generationBasis === 'profile'
      ? '- 전담 근무자/순환 근무자는 저장된 패턴 프로필을 우선 기준으로 해석하세요.'
      : payload.generationBasis === 'rotation_only'
        ? '- 이번 편성은 전담자를 고정하지 말고, 전원을 순환 근무자처럼 배치하세요.'
        : '- 이번 편성은 직원의 shift_type, 배정 근무, 직책 정보를 기준으로 전담자와 순환 근무자를 자동 판별하세요.';
  const generationStyleGuidance =
    payload.constraints?.generationStyle === 'block'
      ? '- 이번 편성 성향은 블록형입니다. 같은 밴드를 조금 길게 묶되 연속 5일 근무 제한은 반드시 지키세요.'
      : payload.constraints?.generationStyle === 'variety'
        ? '- 이번 편성 성향은 다양성형입니다. DDEENN처럼 똑같은 반복은 줄이고 직원별로 블록 길이를 다양하게 섞으세요.'
        : payload.constraints?.generationStyle === 'stable'
          ? '- 이번 편성 성향은 안정형입니다. 기존 블록 흐름과 전담 성향을 최대한 유지하세요.'
          : '- 이번 편성 성향은 균등형입니다. 공정성과 커버 인원을 우선하되 패턴 반복은 과도하지 않게 조정하세요.';

  return [
    '당신은 병원 팀 운영 특성을 읽어 월간 근무표 초안을 짜는 전문가입니다.',
    '이번 작업은 패턴 추천이 아니라 직원별 월간 근무표 초안을 직접 만드는 것입니다.',
    '',
    `대상 월: ${payload.selectedMonth}`,
    `사업체: ${payload.selectedCompany}`,
    `팀: ${payload.selectedDepartment}`,
    Array.isArray(payload.selectedDepartments) && payload.selectedDepartments.length > 1
      ? `포함 팀 범위: ${payload.selectedDepartments.join(', ')}`
      : '포함 팀 범위: 단일 팀',
    `날짜 순서: ${payload.monthDates.join(', ')}`,
    `직원 수: ${payload.staffs.length}`,
    '',
    `OFF는 반드시 "${OFF_SHIFT_TOKEN}" 문자열로만 표기하세요.`,
    'assignments는 monthDates와 같은 순서, 같은 길이로 작성하세요.',
    'assignments에는 반드시 제공된 shiftId 또는 __OFF__만 사용하세요.',
    '팀이 외래/행정/원무/경영지원처럼 주간 중심이면 주말은 기본적으로 OFF로 두고, 야간/이브닝을 쓰지 마세요.',
    '팀이 병동/응급/입원/수술처럼 24시간 운영 성격이고 야간 근무형태가 실제로 있으면 데이/이브닝/나이트를 합리적으로 섞으세요.',
    '불필요한 평일 OFF는 만들지 말고, 주간 팀은 평일 근무 + 주말 휴무 위주로 편성하세요.',
    '직원별 assignments는 사람이 읽어도 자연스럽게 이어지는 월간 초안이어야 합니다.',
    '반드시 모든 직원을 staffPlans에 포함하세요.',
    '',
    '## 필수 금지 패턴 (피로도 방지, 절대 원칙)',
    '- E-D 금지: 이브닝(Evening) 근무 다음 날 데이(Day) 근무는 절대 금지합니다. 수면 부족이 야기됩니다.',
    '- N-D / N-E 금지: 나이트(Night) 근무 다음 날 데이나 이브닝 배치 금지. 나이트 후에는 반드시 오프(OFF)나 휴식을 최소 1일 보장하세요.',
    '- 퐁당퐁당 근무 지양: 가급적 하루짜리 OFF나 1일짜리 근무가 연달아 발생하는 것을 막고, 뭉쳐서 편성하세요.',
    payload.constraints?.avoidDayAfterNight === false
      ? '- 단, 시스템상 나이트 다음 데이 금지 옵션이 꺼져 있어도 병원 안전 관행상 N-D / N-E는 최대한 피하세요.'
      : '- 시스템상 나이트 다음 데이 금지 옵션이 켜져 있으므로 N-D / N-E는 절대 허용하지 마세요.',
    payload.constraints?.avoidDayAfterEvening
      ? '- 시스템상 이브닝 다음 데이 금지 옵션이 켜져 있으므로 E-D는 절대 허용하지 마세요.'
      : '- 시스템상 이브닝 다음 데이 금지 옵션이 꺼져 있어도 E-D는 최대한 줄이세요.',
    `- 나이트 블록은 최대 ${Math.max(1, Math.floor(payload.constraints?.nightBlockSize ?? 2))}일 연속까지만 허용하고, 블록 종료 후에는 최소 ${offDaysAfterNight}일 OFF를 주세요.`,
    `- 한 직원의 연속 근무는 최대 ${Math.max(1, Math.floor(payload.constraints?.maxConsecutiveWorkDays ?? 5))}일까지로 제한하세요.`,
    '',
    '## 주말 / 공휴일 처리',
    weekendGuidance,
    holidayGuidance,
    '',
    '## 숙련도 분배 (Skill Mix)',
    payload.constraints?.enableSkillMix 
      ? '- 각 시간대(Day/Evening/Night)별 근무에 반드시 직급이 높거나 연차가 높은 숙련자(Senior/Charge)가 1명 이상 포함되도록 섞으세요.' 
      : '- 숙련도 배분 옵션이 꺼져있으므로 최소 인원 만족에만 집중하세요.',
    payload.constraints?.minSeniorDayReq || payload.constraints?.minSeniorEveReq || payload.constraints?.minSeniorNightReq
      ? `- 숙련자 최소 인원: D ${payload.constraints?.minSeniorDayReq ?? 0}명 / E ${payload.constraints?.minSeniorEveReq ?? 0}명 / N ${payload.constraints?.minSeniorNightReq ?? 0}명`
      : '- 숙련자 최소 인원은 별도 강제하지 않습니다.',
    payload.constraints?.minDedicatedDayReq || payload.constraints?.minDedicatedEveReq || payload.constraints?.minDedicatedNightReq
      ? `- 전담자 최소 인원: D ${payload.constraints?.minDedicatedDayReq ?? 0}명 / E ${payload.constraints?.minDedicatedEveReq ?? 0}명 / N ${payload.constraints?.minDedicatedNightReq ?? 0}명`
      : '- 전담자 최소 인원은 별도 강제하지 않습니다.',
    '',
    '## 신규 간호사 보호',
    payload.constraints?.blockNewNurseSoloNight
      ? '- 신규 간호사가 NIGHT에 들어가는 날에는 신규 간호사만 NIGHT로 남아서는 안 됩니다.'
      : '- 신규 간호사 단독 NIGHT 금지는 별도 강제하지 않습니다.',
    payload.constraints?.requireSeniorWithNewNurseNight
      ? '- 신규 간호사가 NIGHT에 들어가면 반드시 선임 또는 책임간호사가 같은 NIGHT에 함께 있어야 합니다.'
      : '- 신규 NIGHT 선임 동반은 별도 강제하지 않습니다.',
    '- staffLines의 newNurse=Y 직원을 신규 간호사로 해석하세요.',
    '',
    '## 역할 슬롯',
    '- coverageRoles는 직원이 맡을 수 있는 역할 태그입니다.',
    '- 아래 역할 슬롯 최소 인원은 일반 D/E/N 최소 인원과 별도로 반드시 함께 맞춰야 합니다.',
    roleCoverageLines,
    '',
    '## 병동 편성 기준',
    basisGuidance,
    payload.constraints?.fixedShiftOnly
      ? '- 데이/이브닝/나이트 전담자는 자기 시간대만 근무하도록 유지하세요.'
      : '- 전담자 고정을 강제하지 말고, 인원 충족과 피로도 기준을 우선하며 순환 배치해도 됩니다.',
    generationStyleGuidance,
    '',
    payload.patternProfile?.name
      ? `패턴 프로필: ${payload.patternProfile.name}${payload.patternProfile.description ? ` (${payload.patternProfile.description})` : ''}`
      : '패턴 프로필: 없음',
    patternProfileLines || '- 저장된 전담자 그룹 정보 없음',
    '',
    '## 일일 필수 인력 & 월간 목표 제약 (Constraint Override)',
    '- 기본 병동 3교대 패턴(예: D-D-E-E-N-N-휴-휴)을 깨서라도 아래 인력을 무조건 맞춰야 합니다.',
    `- 최소 Day 인원: 매일 ${payload.constraints?.minDayReq ?? 1}명 이상 (Day 밴드)`,
    `- 최소 Evening 인원: 매일 ${payload.constraints?.minEveReq ?? 1}명 이상 (해당 듀티 존재 시)`,
    `- 최소 Night 인원: 매일 ${payload.constraints?.minNightReq ?? 1}명 이상 (해당 듀티 존재 시)`,
    `- 주말 최소 인원: D ${payload.constraints?.weekendMinDayReq ?? 0} / E ${payload.constraints?.weekendMinEveReq ?? 0} / N ${payload.constraints?.weekendMinNightReq ?? 0}`,
    `- 공휴일 최소 인원: D ${payload.constraints?.holidayMinDayReq ?? 0} / E ${payload.constraints?.holidayMinEveReq ?? 0} / N ${payload.constraints?.holidayMinNightReq ?? 0}`,
    `- 최소 숙련자 인원: D ${payload.constraints?.minSeniorDayReq ?? 0}명 / E ${payload.constraints?.minSeniorEveReq ?? 0}명 / N ${payload.constraints?.minSeniorNightReq ?? 0}명`,
    `- 최소 전담자 인원: D ${payload.constraints?.minDedicatedDayReq ?? 0}명 / E ${payload.constraints?.minDedicatedEveReq ?? 0}명 / N ${payload.constraints?.minDedicatedNightReq ?? 0}명`,
    `- 1인당 월간 목표 OFF 수: 총 ${payload.constraints?.targetOffDays ?? 8}일 내외 최대 보장`,
    `- 1인당 월간 나이트 최소 목표: ${minNightDays}회`,
    `- 1인당 월간 나이트 최대 한도: ${maxNightDays}회 절대 초과 금지`,
    `- 희망 OFF 등록 건수: ${Math.max(0, Math.floor(payload.constraints?.preferredOffCount ?? 0))}건`,
    '- 아래 특정 날짜 최소 인원 오버라이드는 기본 최소 인원보다 우선합니다.',
    dateCoverageLines,
    '',
    '## 직원 개인 제한 / 페어 규칙',
    '- staffLines의 blockedBands, blockedWeekdays, avoidWeekendWork, avoidHolidayWork를 절대 위반하지 마세요.',
    '- preferWeekendOff, preferHolidayOff, avoidConsecutiveEvening, preferEarlyMonthNight, blockPreference는 강한 선호로 해석하고 다른 필수 제약과 충돌하지 않는 범위에서 최대한 반영하세요.',
    '- pairRules는 가능하면 반드시 지키고, 다른 필수 제약과 충돌 시 rationale에 충돌 이유를 적으세요.',
    pairRuleLines,
    '',
    '## 직원별 희망 오프 및 사전 고정 스케줄 (가장 중요)',
    payload.preAssigned && Object.keys(payload.preAssigned).length > 0
      ? '이미 배정된 근무 정보가 있으니 아래 항목은 절대로 덮어쓰지 말고 그대로 유지하세요.'
      : '- 사전 픽스된 근무표가 없습니다. 자유롭게 편성하세요.',
    preAssignedLines,
    payload.preAssigned && Object.keys(payload.preAssigned).length > 0
      ? '- 위에 적힌 staffId/date 조합은 반드시 지정된 shiftId를 그대로 유지한 채 나머지 빈 칸만 최적화하여 작성하세요.'
      : '',
    '',
    `로컬 팀 힌트: ${teamHint.mode}`,
    `로컬 팀 힌트 이유: ${teamHint.reason}`,
    '',
    '사용 가능한 근무형태:',
    shiftLines,
    '',
    '대상 직원:',
    staffLines,
    '',
    '응답 형식 규칙:',
    '- summary: 팀 전체 초안 요약 1~2문장',
    '- teamAnalysis.teamPurpose: 이 팀이 어떤 일을 하는 팀인지 해석',
    '- teamAnalysis.workMode: 예시) 주간 외래팀 / 주간 행정팀 / 주야간 병동팀 / 24시간 교대팀',
    '- teamAnalysis.includesNight: 야간이 실제 필요한 팀이면 true, 아니면 false',
    '- teamAnalysis.reasoning: 판단 근거 2~5개',
    '- teamAnalysis.planningFocus: 편성 시 우선한 기준 2~5개',
    '- staffPlans[].modeLabel: 직원별 배치 성격 요약',
    '- staffPlans[].rationale: 왜 그렇게 배치했는지 한 문장',
    '- staffPlans[].assignments: 월 전체 shiftId 배열',
  ].join('\n');
}

function buildFallbackRecommendation(
  payload: RequestBody,
  errorMessage?: string
): GeminiRecommendationResponse {
  const teamHint = deriveTeamHint(payload);
  const dayShift =
    payload.workShifts.find((shift) => resolveShiftBand(shift) === 'day') || payload.workShifts[0];
  const eveningShift = payload.workShifts.find((shift) => resolveShiftBand(shift) === 'evening');
  const nightShift = payload.workShifts.find((shift) => resolveShiftBand(shift) === 'night');
  const supportsNight = Boolean(
    nightShift && (teamHint.mode.includes('24시간') || teamHint.mode.includes('야간'))
  );
  const shiftMap = new Map(payload.workShifts.map((shift) => [shift.id, shift]));
  const preAssignedEntries = normalizePreAssignedEntries(payload.preAssigned);
  const preAssignedLookup = new Map(
    preAssignedEntries.map((entry) => [buildPreAssignedKey(entry.staffId, entry.date), entry.shiftId])
  );
  const offDaysAfterNight = Math.max(0, Math.floor(payload.constraints?.offDaysAfterNight ?? 1));
  const maxConsecutiveWorkDays = Math.max(
    1,
    Math.floor(payload.constraints?.maxConsecutiveWorkDays ?? 5)
  );
  const nightShiftId = nightShift?.id || '';
  const seniorTargets = {
    day: Math.max(0, Math.floor(payload.constraints?.minSeniorDayReq ?? 0)),
    evening: Math.max(0, Math.floor(payload.constraints?.minSeniorEveReq ?? 0)),
    night: Math.max(0, Math.floor(payload.constraints?.minSeniorNightReq ?? 0)) } satisfies Record<'day' | 'evening' | 'night', number>;
  const dedicatedTargets = {
    day: Math.max(0, Math.floor(payload.constraints?.minDedicatedDayReq ?? 0)),
    evening: Math.max(0, Math.floor(payload.constraints?.minDedicatedEveReq ?? 0)),
    night: Math.max(0, Math.floor(payload.constraints?.minDedicatedNightReq ?? 0)) } satisfies Record<'day' | 'evening' | 'night', number>;
  const roleRules = normalizeRequestRoleCoverageRules(payload.constraints?.roleCoverageRules);

  const makeDefaultStaffPlans = () =>
    payload.staffs.map((staff, staffIndex) => {
      const assignments = payload.monthDates.map((date, dateIndex) => {
        const preAssigned = preAssignedLookup.get(buildPreAssignedKey(staff.id, date));
        if (preAssigned) {
          return preAssigned;
        }
        const dayOfWeek = new Date(`${date}T00:00:00`).getDay();

        if (supportsNight && dayShift && nightShift) {
          const recoveryOffSequence = Array.from({ length: Math.max(1, offDaysAfterNight) }, () => OFF_SHIFT_TOKEN);
          const sequence = eveningShift
            ? [dayShift.id, eveningShift.id, nightShift.id, ...recoveryOffSequence]
            : [dayShift.id, nightShift.id, ...recoveryOffSequence, OFF_SHIFT_TOKEN];
          return sequence[(dateIndex + staffIndex) % sequence.length];
        }

        if (dayOfWeek === 0 || dayOfWeek === 6) {
          return OFF_SHIFT_TOKEN;
        }

        return dayShift?.id || OFF_SHIFT_TOKEN;
      });

      return {
        staffId: staff.id,
        modeLabel: supportsNight ? '기본 교대 초안' : '기본 주간 초안',
        rationale: supportsNight
          ? '팀 특성과 등록 근무형태를 기준으로 주야간 교대형 초안을 먼저 배치했습니다.'
          : '팀 특성과 등록 근무형태를 기준으로 주간형 초안을 먼저 배치했습니다.',
        assignments };
    });

  if (!supportsNight || !dayShift || !nightShift) {
    return {
      summary: errorMessage
        ? `Gemini 응답 처리 중 오류가 있어 팀 특성과 근무형태 기준의 기본 초안을 먼저 생성했습니다. ${teamHint.reason}`
        : `${teamHint.reason} 이를 기준으로 기본 초안을 생성했습니다.`,
      teamAnalysis: {
        teamPurpose: supportsNight ? '야간 대응이 필요한 팀으로 추정' : '주간 중심 운영 팀으로 추정',
        workMode: supportsNight ? '기본 24시간 교대 초안' : '기본 주간 초안',
        includesNight: supportsNight,
        reasoning: [teamHint.reason].concat(errorMessage ? ['Gemini 응답 오류로 기본 로직 사용'] : []),
        planningFocus: supportsNight
          ? ['주야간 순환 유지', '야간 인력 공백 방지', 'OFF 분산']
          : ['평일 근무 유지', '주말 휴무 반영', '주간 인력 우선'] },
      staffPlans: makeDefaultStaffPlans() };
  }

  const availableBands = new Set(
    payload.workShifts
      .map((shift) => resolveShiftBand(shift))
      .filter((band): band is 'day' | 'evening' | 'night' => band !== 'off')
  );

  const staffStates = payload.staffs.map((staff) => {
    const minNight = Math.max(0, Math.floor(staff.minNightShiftCount ?? 0));
    const requestedMaxNight = Math.max(
      minNight,
      Math.floor(
        staff.maxNightShiftCount ??
          payload.constraints?.maxNightDays ??
          payload.constraints?.targetNightDays ??
          0
      )
    );

    return {
      staff,
      assignments: Array.from({ length: payload.monthDates.length }, () => ''),
      allowedBands: resolveFallbackAllowedBands(staff, payload, availableBands),
      dedicatedBand: resolveDedicatedBandForStaff(staff),
      coverageRoleMatcherText: buildStaffCoverageRoleMatcherText(staff),
      isSeniorStaff: isSeniorStaff(staff),
      isNewNurse: staff.isNewNurse === true,
      blockedWeekdays: normalizeBlockedWeekdays(staff.blockedWeekdays),
      avoidWeekendWork: staff.avoidWeekendWork === true,
      avoidHolidayWork: staff.avoidHolidayWork === true,
      minNight,
      maxNight: requestedMaxNight > 0 ? requestedMaxNight : payload.monthDates.length };
  });

  staffStates.forEach((state) => {
    payload.monthDates.forEach((date, dateIndex) => {
      const preAssigned = preAssignedLookup.get(buildPreAssignedKey(state.staff.id, date));
      if (preAssigned) {
        state.assignments[dateIndex] = preAssigned;
      }
    });
  });

  const buildDailyCounts = () =>
    payload.monthDates.map((_, dateIndex) => {
      const counts = { day: 0, evening: 0, night: 0 };
      staffStates.forEach((state) => {
        const token = state.assignments[dateIndex] || '';
        if (!token || token === OFF_SHIFT_TOKEN) return;
        const band = resolveShiftBand(shiftMap.get(token) || { id: token, name: '', start_time: null, end_time: null });
        if (band === 'day' || band === 'evening' || band === 'night') {
          counts[band] += 1;
        }
      });
      return counts;
    });

  const buildQualifiedDailyCounts = () =>
    payload.monthDates.map((_, dateIndex) => {
      const senior = { day: 0, evening: 0, night: 0 };
      const dedicated = { day: 0, evening: 0, night: 0 };
      staffStates.forEach((state) => {
        const token = state.assignments[dateIndex] || '';
        if (!token || token === OFF_SHIFT_TOKEN) return;
        const band = resolveShiftBand(shiftMap.get(token) || { id: token, name: '', start_time: null, end_time: null });
        if (band !== 'day' && band !== 'evening' && band !== 'night') return;
        if (isSeniorStaff(state.staff)) {
          senior[band] += 1;
        }
        if (state.dedicatedBand === band) {
          dedicated[band] += 1;
        }
      });
      return { senior, dedicated };
    });

  const buildDailyRoleCounts = () =>
    payload.monthDates.map((_, dateIndex) => {
      const countsByRole = new Map<string, Record<'day' | 'evening' | 'night', number>>(
        roleRules.map((roleRule) => [roleRule.id, createEmptyBandCounts()])
      );
      staffStates.forEach((state) => {
        const token = state.assignments[dateIndex] || '';
        if (!token || token === OFF_SHIFT_TOKEN) return;
        const band = resolveShiftBand(shiftMap.get(token) || { id: token, name: '', start_time: null, end_time: null });
        if (band !== 'day' && band !== 'evening' && band !== 'night') return;
        roleRules.forEach((roleRule) => {
          if (!coverageRoleMatchesRule(state.coverageRoleMatcherText, roleRule)) return;
          const roleCounts = countsByRole.get(roleRule.id);
          if (!roleCounts) return;
          roleCounts[band] += 1;
        });
      });
      return countsByRole;
    });

  const buildNightSupportCounts = () =>
    payload.monthDates.map((_, dateIndex) => {
      let totalNight = 0;
      let seniorNight = 0;
      let newNurseNight = 0;
      staffStates.forEach((state) => {
        const token = state.assignments[dateIndex] || '';
        if (!token || token === OFF_SHIFT_TOKEN) return;
        const band = resolveShiftBand(shiftMap.get(token) || { id: token, name: '', start_time: null, end_time: null });
        if (band !== 'night') return;
        totalNight += 1;
        if (state.isSeniorStaff) seniorNight += 1;
        if (state.isNewNurse) newNurseNight += 1;
      });
      return { totalNight, seniorNight, newNurseNight };
    });

  const canAssignFallbackShift = ({
    state,
    shift,
    dateIndex }: {
    state: (typeof staffStates)[number];
    shift: RequestWorkShift;
    dateIndex: number;
  }) => {
    if (state.assignments[dateIndex]) return false;

    const band = resolveShiftBand(shift);
    if (band === 'off') return false;
    if (!state.allowedBands.has(band)) return false;

    const dateKey = payload.monthDates[dateIndex] || '';
    const weekday = new Date(`${dateKey}T00:00:00`).getDay();
    if (state.blockedWeekdays.includes(weekday)) {
      return false;
    }
    if (state.avoidWeekendWork && (weekday === 0 || weekday === 6)) {
      return false;
    }
    if (state.avoidHolidayWork && isKoreanPublicHoliday(dateKey)) {
      return false;
    }
    if (resolveConfiguredWorkDayMode(shift) === 'weekdays' && (weekday === 0 || weekday === 6)) {
      return false;
    }

    const previousToken = dateIndex > 0 ? state.assignments[dateIndex - 1] || '' : '';
    const previousBand =
      previousToken && previousToken !== OFF_SHIFT_TOKEN
        ? resolveShiftBand(shiftMap.get(previousToken) || { id: previousToken, name: '', start_time: null, end_time: null })
        : null;
    const nextToken =
      dateIndex < state.assignments.length - 1 ? state.assignments[dateIndex + 1] || '' : '';
    const nextBand =
      nextToken && nextToken !== OFF_SHIFT_TOKEN
        ? resolveShiftBand(shiftMap.get(nextToken) || { id: nextToken, name: '', start_time: null, end_time: null })
        : null;

    if (previousBand === 'evening' && band === 'day') return false;
    if (previousBand === 'night' && (band === 'day' || band === 'evening')) return false;
    if (nextBand === 'day' && band === 'evening') return false;
    if (band === 'night' && (nextBand === 'day' || nextBand === 'evening')) return false;

    const previousRestGap =
      previousToken && previousToken !== OFF_SHIFT_TOKEN
        ? calculateRestGapHours(
            previousToken,
            shift.id,
            payload.monthDates[dateIndex - 1] || '',
            dateKey,
            shiftMap
          )
        : null;
    if (
      previousBand === 'night' &&
      band !== 'night' &&
      previousRestGap !== null &&
      previousRestGap < MIN_REST_HOURS_AFTER_NIGHT
    ) {
      return false;
    }
    if (
      previousBand &&
      previousBand !== 'night' &&
      previousRestGap !== null &&
      previousRestGap < MIN_GENERAL_REST_HOURS
    ) {
      return false;
    }

    let lastWorkedIndex = dateIndex - 1;
    while (
      lastWorkedIndex >= 0 &&
      (!state.assignments[lastWorkedIndex] || state.assignments[lastWorkedIndex] === OFF_SHIFT_TOKEN)
    ) {
      lastWorkedIndex -= 1;
    }
    if (lastWorkedIndex >= 0) {
      const lastWorkedToken = state.assignments[lastWorkedIndex] || '';
      const lastWorkedBand =
        lastWorkedToken && lastWorkedToken !== OFF_SHIFT_TOKEN
          ? resolveShiftBand(shiftMap.get(lastWorkedToken) || { id: lastWorkedToken, name: '', start_time: null, end_time: null })
          : null;
      if (lastWorkedBand === 'night' && band !== 'night') {
        const recoveryDays = dateIndex - lastWorkedIndex - 1;
        if (recoveryDays < offDaysAfterNight) {
          return false;
        }
      }
    }

    if (band === 'night') {
      const currentNightCount = countAssignedBand(state.assignments, shiftMap, 'night');
      if (currentNightCount >= state.maxNight) return false;
      for (let offset = 1; offset <= offDaysAfterNight; offset += 1) {
        const futureIndex = dateIndex + offset;
        if (futureIndex >= state.assignments.length) break;
        const futureToken = state.assignments[futureIndex] || '';
        if (futureToken && futureToken !== OFF_SHIFT_TOKEN) {
          return false;
        }
      }
    }

    const previousWorkStreak = countPreviousAssignedWorkStreak(state.assignments, dateIndex);
    const nextWorkStreak = countNextAssignedWorkStreak(state.assignments, dateIndex);
    if (previousWorkStreak + 1 + nextWorkStreak > maxConsecutiveWorkDays) {
      return false;
    }

    return true;
  };

  const dailyCounts = buildDailyCounts();
  const dailyQualifiedCounts = buildQualifiedDailyCounts();
  const dailyRoleCounts = buildDailyRoleCounts();
  let nightSupportCounts = buildNightSupportCounts();

  (['night', 'evening', 'day'] as const).forEach((targetBand) => {
    const targetShift =
      targetBand === 'day'
        ? dayShift
        : targetBand === 'evening'
          ? eveningShift || null
          : nightShift;
    if (!targetShift) return;

    payload.monthDates.forEach((dateKey, dateIndex) => {
      const minimumCount = getBandTargetsForDate(payload, dateKey).targets[targetBand];
      if (minimumCount <= 0) return;
      while (dailyCounts[dateIndex][targetBand] < minimumCount) {
        const seniorAlreadyAssigned =
          dailyQualifiedCounts[dateIndex].senior[targetBand] >= seniorTargets[targetBand];
        const dedicatedAlreadyAssigned =
          dailyQualifiedCounts[dateIndex].dedicated[targetBand] >= dedicatedTargets[targetBand];

        const candidate = [...staffStates]
          .filter((state) => canAssignFallbackShift({ state, shift: targetShift, dateIndex }))
          .sort((left, right) => {
            const leftNightCount = countAssignedBand(left.assignments, shiftMap, 'night');
            const rightNightCount = countAssignedBand(right.assignments, shiftMap, 'night');
            const leftNeedsNight = Math.max(0, left.minNight - leftNightCount);
            const rightNeedsNight = Math.max(0, right.minNight - rightNightCount);
            if (targetBand === 'night' && leftNeedsNight !== rightNeedsNight) {
              return rightNeedsNight - leftNeedsNight;
            }

            if (payload.constraints?.enableSkillMix && !seniorAlreadyAssigned) {
              const leftSenior = isSeniorStaff(left.staff);
              const rightSenior = isSeniorStaff(right.staff);
              if (leftSenior !== rightSenior) {
                return leftSenior ? -1 : 1;
              }
            }

            if (!dedicatedAlreadyAssigned) {
              const leftDedicated = left.dedicatedBand === targetBand;
              const rightDedicated = right.dedicatedBand === targetBand;
              if (leftDedicated !== rightDedicated) {
                return leftDedicated ? -1 : 1;
              }
            }

            const leftRoleGapScore = roleRules.reduce((score, roleRule) => {
              const target = getRoleCoverageTargetByBand(roleRule, targetBand);
              if (target <= 0 || !coverageRoleMatchesRule(left.coverageRoleMatcherText, roleRule)) return score;
              const roleCounts = dailyRoleCounts[dateIndex].get(roleRule.id);
              return score + Math.max(0, target - Number(roleCounts?.[targetBand] || 0));
            }, 0);
            const rightRoleGapScore = roleRules.reduce((score, roleRule) => {
              const target = getRoleCoverageTargetByBand(roleRule, targetBand);
              if (target <= 0 || !coverageRoleMatchesRule(right.coverageRoleMatcherText, roleRule)) return score;
              const roleCounts = dailyRoleCounts[dateIndex].get(roleRule.id);
              return score + Math.max(0, target - Number(roleCounts?.[targetBand] || 0));
            }, 0);
            if (leftRoleGapScore !== rightRoleGapScore) {
              return rightRoleGapScore - leftRoleGapScore;
            }

            if (targetBand === 'night') {
              const currentNightSupport = nightSupportCounts[dateIndex];
              const leftNightSupportScore =
                (payload.constraints?.requireSeniorWithNewNurseNight &&
                currentNightSupport.newNurseNight > 0 &&
                currentNightSupport.seniorNight < 1 &&
                left.isSeniorStaff
                  ? 2
                  : 0) +
                (payload.constraints?.blockNewNurseSoloNight &&
                currentNightSupport.newNurseNight > 0 &&
                currentNightSupport.totalNight < 2 &&
                !left.isNewNurse
                  ? 1
                  : 0);
              const rightNightSupportScore =
                (payload.constraints?.requireSeniorWithNewNurseNight &&
                currentNightSupport.newNurseNight > 0 &&
                currentNightSupport.seniorNight < 1 &&
                right.isSeniorStaff
                  ? 2
                  : 0) +
                (payload.constraints?.blockNewNurseSoloNight &&
                currentNightSupport.newNurseNight > 0 &&
                currentNightSupport.totalNight < 2 &&
                !right.isNewNurse
                  ? 1
                  : 0);
              if (leftNightSupportScore !== rightNightSupportScore) {
                return rightNightSupportScore - leftNightSupportScore;
              }
            }

            const leftWorkCount = left.assignments.filter(
              (token) => token && token !== OFF_SHIFT_TOKEN
            ).length;
            const rightWorkCount = right.assignments.filter(
              (token) => token && token !== OFF_SHIFT_TOKEN
            ).length;
            if (leftWorkCount !== rightWorkCount) return leftWorkCount - rightWorkCount;

            if (targetBand === 'night' && leftNightCount !== rightNightCount) {
              return leftNightCount - rightNightCount;
            }

            return left.staff.id.localeCompare(right.staff.id);
          })[0];

        if (!candidate) {
          break;
        }

        const currentToken = candidate.assignments[dateIndex] || '';
        const currentBand =
          currentToken && currentToken !== OFF_SHIFT_TOKEN
            ? resolveShiftBand(shiftMap.get(currentToken) || { id: currentToken, name: '', start_time: null, end_time: null })
            : null;
        if (currentBand === 'day' || currentBand === 'evening' || currentBand === 'night') {
          dailyCounts[dateIndex][currentBand] = Math.max(0, dailyCounts[dateIndex][currentBand] - 1);
          if (candidate.isSeniorStaff) {
            dailyQualifiedCounts[dateIndex].senior[currentBand] = Math.max(
              0,
              dailyQualifiedCounts[dateIndex].senior[currentBand] - 1
            );
          }
          if (candidate.dedicatedBand === currentBand) {
            dailyQualifiedCounts[dateIndex].dedicated[currentBand] = Math.max(
              0,
              dailyQualifiedCounts[dateIndex].dedicated[currentBand] - 1
            );
          }
          roleRules.forEach((roleRule) => {
            if (!coverageRoleMatchesRule(candidate.coverageRoleMatcherText, roleRule)) return;
            const roleCounts = dailyRoleCounts[dateIndex].get(roleRule.id);
            if (!roleCounts) return;
            roleCounts[currentBand] = Math.max(0, roleCounts[currentBand] - 1);
          });
        }

        candidate.assignments[dateIndex] = targetShift.id;
        dailyCounts[dateIndex][targetBand] += 1;
        if (candidate.isSeniorStaff) {
          dailyQualifiedCounts[dateIndex].senior[targetBand] += 1;
        }
        if (candidate.dedicatedBand === targetBand) {
          dailyQualifiedCounts[dateIndex].dedicated[targetBand] += 1;
        }
        roleRules.forEach((roleRule) => {
          if (!coverageRoleMatchesRule(candidate.coverageRoleMatcherText, roleRule)) return;
          const roleCounts = dailyRoleCounts[dateIndex].get(roleRule.id);
          if (!roleCounts) return;
          roleCounts[targetBand] += 1;
        });

        if (targetBand === 'night' && offDaysAfterNight > 0) {
          for (let offset = 1; offset <= offDaysAfterNight; offset += 1) {
            const futureIndex = dateIndex + offset;
            if (futureIndex >= candidate.assignments.length) break;
            if (!candidate.assignments[futureIndex]) {
              candidate.assignments[futureIndex] = OFF_SHIFT_TOKEN;
            }
          }
        }
        if (targetBand === 'night') {
          nightSupportCounts = buildNightSupportCounts();
        }
      }
    });
  });

  const promoteCandidateToBand = ({
    state,
    dateIndex,
    targetBand }: {
    state: (typeof staffStates)[number];
    dateIndex: number;
    targetBand: 'day' | 'evening' | 'night';
  }) => {
    const targetShift = payload.workShifts.find(
      (shift) => shift.id && resolveShiftBand(shift) === targetBand && state.allowedBands.has(targetBand)
    );
    if (!targetShift || !canAssignFallbackShift({ state, shift: targetShift, dateIndex })) {
      return false;
    }

    const currentToken = state.assignments[dateIndex] || '';
    const currentBand =
      currentToken && currentToken !== OFF_SHIFT_TOKEN
        ? resolveShiftBand(shiftMap.get(currentToken) || { id: currentToken, name: '', start_time: null, end_time: null })
        : null;

    if (currentBand === targetBand) {
      return false;
    }

    if (currentBand === 'day' || currentBand === 'evening' || currentBand === 'night') {
      const minimumCountsForDate = getBandTargetsForDate(
        payload,
        payload.monthDates[dateIndex] || ''
      ).targets;
      if (dailyCounts[dateIndex][currentBand] <= minimumCountsForDate[currentBand]) {
        return false;
      }
      if (state.isSeniorStaff && dailyQualifiedCounts[dateIndex].senior[currentBand] <= seniorTargets[currentBand]) {
        return false;
      }
      if (
        state.dedicatedBand === currentBand &&
        dailyQualifiedCounts[dateIndex].dedicated[currentBand] <= dedicatedTargets[currentBand]
      ) {
        return false;
      }
      const breaksRoleCoverage = roleRules.some((roleRule) => {
        if (!coverageRoleMatchesRule(state.coverageRoleMatcherText, roleRule)) return false;
        const target = getRoleCoverageTargetByBand(roleRule, currentBand);
        if (target <= 0) return false;
        const roleCounts = dailyRoleCounts[dateIndex].get(roleRule.id);
        return Boolean(roleCounts && roleCounts[currentBand] <= target);
      });
      if (breaksRoleCoverage) {
        return false;
      }
    }

    if (currentBand === 'day' || currentBand === 'evening' || currentBand === 'night') {
      dailyCounts[dateIndex][currentBand] = Math.max(0, dailyCounts[dateIndex][currentBand] - 1);
      if (state.isSeniorStaff) {
        dailyQualifiedCounts[dateIndex].senior[currentBand] = Math.max(
          0,
          dailyQualifiedCounts[dateIndex].senior[currentBand] - 1
        );
      }
      if (state.dedicatedBand === currentBand) {
        dailyQualifiedCounts[dateIndex].dedicated[currentBand] = Math.max(
          0,
          dailyQualifiedCounts[dateIndex].dedicated[currentBand] - 1
        );
      }
      roleRules.forEach((roleRule) => {
        if (!coverageRoleMatchesRule(state.coverageRoleMatcherText, roleRule)) return;
        const roleCounts = dailyRoleCounts[dateIndex].get(roleRule.id);
        if (!roleCounts) return;
        roleCounts[currentBand] = Math.max(0, roleCounts[currentBand] - 1);
      });
    }

    state.assignments[dateIndex] = targetShift.id;
    dailyCounts[dateIndex][targetBand] += 1;
    if (state.isSeniorStaff) {
      dailyQualifiedCounts[dateIndex].senior[targetBand] += 1;
    }
    if (state.dedicatedBand === targetBand) {
      dailyQualifiedCounts[dateIndex].dedicated[targetBand] += 1;
    }
    roleRules.forEach((roleRule) => {
      if (!coverageRoleMatchesRule(state.coverageRoleMatcherText, roleRule)) return;
      const roleCounts = dailyRoleCounts[dateIndex].get(roleRule.id);
      if (!roleCounts) return;
      roleCounts[targetBand] += 1;
    });
    if (targetBand === 'night' && offDaysAfterNight > 0) {
      for (let offset = 1; offset <= offDaysAfterNight; offset += 1) {
        const futureIndex = dateIndex + offset;
        if (futureIndex >= state.assignments.length) break;
        if (!state.assignments[futureIndex]) {
          state.assignments[futureIndex] = OFF_SHIFT_TOKEN;
        }
      }
    }
    nightSupportCounts = buildNightSupportCounts();
    return true;
  };

  payload.monthDates.forEach((_, dateIndex) => {
    roleRules.forEach((roleRule) => {
      (['day', 'evening', 'night'] as const).forEach((targetBand) => {
        const target = getRoleCoverageTargetByBand(roleRule, targetBand);
        if (target <= 0) return;

        while (Number(dailyRoleCounts[dateIndex].get(roleRule.id)?.[targetBand] || 0) < target) {
          const candidate = [...staffStates]
            .filter((state) => coverageRoleMatchesRule(state.coverageRoleMatcherText, roleRule))
            .sort((left, right) => {
              const leftCurrentBand =
                left.assignments[dateIndex] && left.assignments[dateIndex] !== OFF_SHIFT_TOKEN
                  ? resolveShiftBand(
                      shiftMap.get(left.assignments[dateIndex] || '') || {
                        id: left.assignments[dateIndex] || '',
                        name: '',
                        start_time: null,
                        end_time: null }
                    )
                  : null;
              const rightCurrentBand =
                right.assignments[dateIndex] && right.assignments[dateIndex] !== OFF_SHIFT_TOKEN
                  ? resolveShiftBand(
                      shiftMap.get(right.assignments[dateIndex] || '') || {
                        id: right.assignments[dateIndex] || '',
                        name: '',
                        start_time: null,
                        end_time: null }
                    )
                  : null;
              const leftPriority = leftCurrentBand === null ? 0 : leftCurrentBand === targetBand ? 2 : 1;
              const rightPriority = rightCurrentBand === null ? 0 : rightCurrentBand === targetBand ? 2 : 1;
              if (leftPriority !== rightPriority) return leftPriority - rightPriority;
              const leftWorkCount = left.assignments.filter((token) => token && token !== OFF_SHIFT_TOKEN).length;
              const rightWorkCount = right.assignments.filter((token) => token && token !== OFF_SHIFT_TOKEN).length;
              return leftWorkCount - rightWorkCount;
            })
            .find((state) => promoteCandidateToBand({ state, dateIndex, targetBand }));

          if (!candidate) {
            break;
          }
        }
      });
    });

    if (
      nightSupportCounts[dateIndex].newNurseNight > 0 &&
      payload.constraints?.requireSeniorWithNewNurseNight &&
      nightSupportCounts[dateIndex].seniorNight < 1
    ) {
      [...staffStates]
        .filter((state) => state.isSeniorStaff)
        .sort((left, right) => left.staff.id.localeCompare(right.staff.id))
        .find((state) => promoteCandidateToBand({ state, dateIndex, targetBand: 'night' }));
    }

    while (
      nightSupportCounts[dateIndex].newNurseNight > 0 &&
      payload.constraints?.blockNewNurseSoloNight &&
      nightSupportCounts[dateIndex].totalNight < 2
    ) {
      const partnerAdded = [...staffStates]
        .filter((state) => !state.isNewNurse)
        .sort((left, right) => left.staff.id.localeCompare(right.staff.id))
        .find((state) => promoteCandidateToBand({ state, dateIndex, targetBand: 'night' }));
      if (!partnerAdded) {
        break;
      }
    }
  });

  staffStates.forEach((state) => {
    state.assignments = state.assignments.map((token) => token || OFF_SHIFT_TOKEN);
  });

  const staffPlans = staffStates.map((state) => ({
    staffId: state.staff.id,
    modeLabel:
      state.allowedBands.size === 1
        ? `${[...state.allowedBands][0]} 전담 fallback`
        : '제약 기반 병동 fallback',
    rationale:
      'Gemini 응답 실패 시에도 최소 인원, 희망 OFF, 나이트 제한, 회복휴무 기준을 우선 반영한 병동 3교대 초안입니다.',
    assignments: state.assignments }));

  return {
    summary: errorMessage
      ? `Gemini 응답 처리 중 오류가 있어 병동 3교대 제약을 반영한 fallback 초안을 생성했습니다. ${teamHint.reason}`
      : `${teamHint.reason} 이를 기준으로 병동 3교대 fallback 초안을 생성했습니다.`,
    teamAnalysis: {
      teamPurpose: supportsNight ? '야간 대응이 필요한 팀으로 추정' : '주간 중심 운영 팀으로 추정',
      workMode: supportsNight ? '제약 기반 병동 fallback 초안' : '기본 주간 초안',
      includesNight: supportsNight,
      reasoning: [teamHint.reason].concat(errorMessage ? ['Gemini 응답 오류로 제약 기반 fallback 사용'] : []),
      planningFocus: supportsNight
        ? ['최소 D/E/N 충족 우선', '나이트 후 회복휴무 보호', '희망 OFF 및 승인휴가 유지']
        : ['평일 근무 유지', '주말 휴무 반영', '주간 인력 우선'] },
    staffPlans };
}

async function requestRecommendation(payload: RequestBody): Promise<GeminiRecommendationResponse> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API 키가 설정되지 않았습니다. .env.local의 GEMINI_API_KEY를 확인해주세요.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const prompt = buildPrompt(payload);
  let lastError = '';

  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
          responseSchema } });

      const result = await withTimeout(
        model.generateContent(prompt),
        60_000,
        `Gemini[${modelName}]`,
      );
      const parsed = JSON.parse(result.response.text()) as GeminiRecommendationResponse;

      if (
        !parsed?.summary ||
        !parsed?.teamAnalysis ||
        !Array.isArray(parsed.staffPlans) ||
        parsed.staffPlans.length === 0
      ) {
        throw new Error('Gemini 응답 형식이 올바르지 않습니다.');
      }

      return parsed;
    } catch (error: any) {
      lastError = error?.message || String(error);
      if (lastError.includes('404') || lastError.includes('429')) {
        continue;
      }
    }
  }

  throw new Error(lastError || 'Gemini 팀 근무표 초안 생성에 실패했습니다.');
}

export async function POST(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = String((session.user as any)?.id || (session.user as any)?.name || 'unknown');
    if (!checkRosterRateLimit(userId)) {
      return NextResponse.json({ error: '1시간에 최대 10회까지 AI 근무표 생성이 가능합니다.' }, { status: 429 });
    }

    const body = (await request.json()) as Partial<RequestBody>;
    const payload: RequestBody = {
      selectedMonth: String(body.selectedMonth || '').trim(),
      selectedCompany: String(body.selectedCompany || '').trim(),
      selectedDepartment: String(body.selectedDepartment || '').trim(),
      selectedDepartments: Array.isArray(body.selectedDepartments)
        ? body.selectedDepartments.map(String).map((department) => department.trim()).filter(Boolean)
        : [],
      monthDates: Array.isArray(body.monthDates) ? body.monthDates.map(String) : [],
      workShifts: Array.isArray(body.workShifts) ? body.workShifts : [],
      staffs: Array.isArray(body.staffs) ? body.staffs : [],
      patternProfile: body.patternProfile || null,
      generationBasis: String(body.generationBasis || '').trim(),
      constraints: body.constraints,
      preAssigned: body.preAssigned };

    if (!payload.selectedMonth || !payload.selectedCompany || !payload.selectedDepartment) {
      return NextResponse.json(
        { error: '사업체, 팀, 대상 월 정보가 필요합니다.' },
        { status: 400 }
      );
    }

    if (payload.monthDates.length === 0) {
      return NextResponse.json({ error: '대상 월 날짜 정보가 없습니다.' }, { status: 400 });
    }

    if (payload.workShifts.length === 0) {
      return NextResponse.json({ error: '추천에 사용할 근무형태가 없습니다.' }, { status: 400 });
    }

    if (payload.staffs.length === 0) {
      return NextResponse.json({ error: '추천할 팀 직원이 없습니다.' }, { status: 400 });
    }

    let recommendation: GeminiRecommendationResponse;
    try {
      recommendation = await requestRecommendation(payload);
    } catch (error: any) {
      const message = error?.message || String(error);
      recommendation = buildFallbackRecommendation(payload, message);
    }

    return NextResponse.json(recommendation);
  } catch (error: any) {
    return NextResponse.json({ error: '근무표 추천 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
