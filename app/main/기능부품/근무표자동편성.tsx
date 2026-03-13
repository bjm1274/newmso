'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  buildDefaultPatternProfile,
  findPatternStaffGroup,
  getPatternProfileShiftIds,
  matchPatternProfileForDepartment,
  normalizePatternProfile,
  readCachedPatternProfiles,
  ROSTER_PATTERN_PROFILE_STORAGE_KEY,
  type RosterPatternGroupMode,
  type RosterPatternProfile,
  type RosterPatternStaffGroup,
  writeCachedPatternProfiles,
} from '@/lib/roster-pattern-profiles';
import {
  buildDefaultGenerationRule,
  matchGenerationRuleForDepartment,
  normalizeGenerationRule,
  readCachedGenerationRules,
  ROSTER_GENERATION_RULE_STORAGE_KEY,
  type RosterGenerationRule,
  writeCachedGenerationRules,
} from '@/lib/roster-generation-rules';
import { supabase } from '@/lib/supabase';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import SmartMonthPicker from './공통/SmartMonthPicker';

const MANAGER_POSITION_KEYWORDS = [
  '팀장',
  '과장',
  '실장',
  '수간호사',
  '파트장',
  '센터장',
  '부장',
  '본부장',
  '이사',
  '원장',
  '병원장',
  '대표',
];

const OFF_SHIFT_TOKEN = '__OFF__';
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const SHIFT_META_MARKER = '[SHIFT_META]';
const CUSTOM_PATTERN_VALUE = '커스텀';
const WEEKLY_TEMPLATE_PATTERN_VALUE = '주차템플릿';
const ROSTER_WIZARD_PRESET_STORAGE_KEY = 'erp_roster_wizard_presets_v1';
const ROSTER_PREFERRED_OFF_STORAGE_PREFIX = 'erp_roster_preferred_off_v1';
const WEEKDAY_PICKER_ORDER = [1, 2, 3, 4, 5, 6, 0];

type ManualAssignmentMap = Record<string, string>;
type PreferredOffSelectionMap = Record<string, string[]>;
type WizardStep = 1 | 2 | 3 | 4;

const PATTERN_OPTIONS = [
  { value: '상근', label: '상근', desc: '평일 근무, 주말 휴무' },
  { value: '2교대', label: '2교대', desc: '주/야 또는 A/B 2개 근무 순환' },
  { value: '3교대', label: '3교대', desc: '데이/이브닝/나이트 + OFF 순환' },
  { value: '2일근무1일휴무', label: '2일근무 1일휴무', desc: '이틀 근무 후 하루 OFF' },
  { value: '1일근무1일휴무', label: '1일근무 1일휴무', desc: '하루 근무 후 하루 OFF' },
  { value: '야간전담', label: '야간전담', desc: '나이트 중심 편성 + OFF 순환' },
  { value: WEEKLY_TEMPLATE_PATTERN_VALUE, label: '주차 템플릿', desc: '1~4주 주기를 기준으로 요일별 기본값 반복' },
];
const WIZARD_PATTERN_OPTIONS = [
  ...PATTERN_OPTIONS,
  { value: CUSTOM_PATTERN_VALUE, label: CUSTOM_PATTERN_VALUE, desc: '선택한 근무유형과 OFF를 원하는 순서로 직접 조립' },
];
const PATTERN_GROUP_MODE_OPTIONS: Array<{ value: RosterPatternGroupMode; label: string; desc: string }> = [
  { value: 'day_fixed', label: '데이 전담', desc: '평일 중심으로 같은 근무를 반복합니다.' },
  { value: 'night_fixed', label: '나이트 전담', desc: 'N N OFF OFF 흐름으로 반복합니다.' },
  { value: 'rotation', label: '순환 교대', desc: 'D D E E N N OFF OFF OFF 흐름으로 순환합니다.' },
  { value: 'evening_fixed', label: '이브닝 전담', desc: 'E E OFF OFF 흐름으로 반복합니다.' },
];

type WorkShift = {
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

type WeeklyTemplateWeek = {
  shiftId: string;
  activeWeekdays: number[];
};

type RosterWizardPreset = {
  id: string;
  name: string;
  description: string;
  pattern: string;
  shiftSlotCount: number;
  shiftIds: string[];
  shiftNames: string[];
  startOffset: number;
  nightShiftCount: number;
  customPatternSlots: Array<number | 'OFF'>;
  weeklyTemplateWeeks: Array<{
    shiftSlot: number;
    activeWeekdays: number[];
  }>;
};

/*
const BUILTIN_ROSTER_WIZARD_PRESETS: RosterWizardPreset[] = [
  {
    id: 'outpatient_weekday_sat_cycle',
    name: '외래 1주5일 / 2주6일',
    description: '1주차 월~금, 2주차 월~토를 반복하는 외래 전용 기본값',
    pattern: WEEKLY_TEMPLATE_PATTERN_VALUE,
    shiftSlotCount: 1,
    startOffset: 0,
    nightShiftCount: 0,
    customPatternSlots: [],
    weeklyTemplateWeeks: [
      { shiftSlot: 1, activeWeekdays: [1, 2, 3, 4, 5] },
      { shiftSlot: 1, activeWeekdays: [1, 2, 3, 4, 5, 6] },
    ],
  },
];

*/
type StaffConfig = {
  enabled: boolean;
  pattern: string;
  primaryShiftId: string;
  secondaryShiftId: string;
  tertiaryShiftId: string;
  startOffset: number;
  nightShiftCount: number;
  customPatternSequence: string[];
  weeklyTemplateWeeks: WeeklyTemplateWeek[];
};

type GeminiRosterStaffPlan = {
  staffId: string;
  modeLabel?: string;
  rationale?: string;
  assignments?: string[];
};

type GeminiTeamAnalysis = {
  teamPurpose?: string;
  workMode?: string;
  includesNight?: boolean;
  reasoning?: string[];
  planningFocus?: string[];
};

type GeminiRosterRecommendation = {
  summary?: string;
  teamAnalysis?: GeminiTeamAnalysis;
  staffPlans?: GeminiRosterStaffPlan[];
  leaveSummary?: string;
  preferredOffSummary?: string;
};

type PlannerResolvedPatternGroup = {
  key: string;
  label: string;
  mode: RosterPatternGroupMode;
  shiftIds: string[];
  rationale: string;
  source: 'profile' | 'auto';
};

type PlannerPatternPreviewGroup = {
  key: string;
  label: string;
  mode: RosterPatternGroupMode;
  count: number;
  source: 'profile' | 'auto' | 'default';
};

type PreviewCell = {
  date: string;
  baseShiftId: string;
  shiftId: string;
  shiftName: string;
  code: string;
  badgeClass: string;
  isManual: boolean;
};

type PreviewRow = {
  staff: any;
  config: StaffConfig;
  cells: PreviewCell[];
  counts: {
    work: number;
    off: number;
    night: number;
  };
};

type WizardOffOverride = {
  enabled: boolean;
  offDate: string;
  nextShiftId: string;
};

function getDepartmentName(target: any) {
  return target?.department || target?.team || '';
}

function isManagerOrHigher(user: any) {
  const position = String(user?.position || '');
  return (
    user?.role === 'admin' ||
    user?.company === 'SY INC.' ||
    user?.permissions?.mso === true ||
    MANAGER_POSITION_KEYWORDS.some((keyword) => position.includes(keyword))
  );
}

function getMonthDates(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  return Array.from(
    { length: daysInMonth },
    (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`
  );
}

function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

function collectDateRangeWithinMonth(startDate: string, endDate: string, monthDateSet: Set<string>) {
  if (!startDate) return [];

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate || startDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const rangeStart = start.getTime() <= end.getTime() ? start : end;
  const rangeEnd = start.getTime() <= end.getTime() ? end : start;
  const dates: string[] = [];
  const cursor = new Date(rangeStart);

  while (cursor.getTime() <= rangeEnd.getTime()) {
    const dateKey = formatDateKey(cursor);
    if (monthDateSet.has(dateKey)) {
      dates.push(dateKey);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function buildBlockedDatesByStaff(
  leaveRequests: Array<{ staff_id: string; start_date: string; end_date: string }>,
  monthDateSet: Set<string>
) {
  const blockedDatesByStaff = new Map<string, Set<string>>();

  leaveRequests.forEach((leave) => {
    const staffId = String(leave.staff_id || '');
    if (!staffId) return;

    const blockedDates = collectDateRangeWithinMonth(
      String(leave.start_date || ''),
      String(leave.end_date || ''),
      monthDateSet
    );
    if (blockedDates.length === 0) return;

    const existing = blockedDatesByStaff.get(staffId) || new Set<string>();
    blockedDates.forEach((date) => existing.add(date));
    blockedDatesByStaff.set(staffId, existing);
  });

  return blockedDatesByStaff;
}

function countBlockedDateEntries(blockedDatesByStaff: Map<string, Set<string>>) {
  return Array.from(blockedDatesByStaff.values()).reduce(
    (sum, blockedDates) => sum + blockedDates.size,
    0
  );
}

function mergeBlockedDateMaps(...maps: Array<Map<string, Set<string>>>) {
  const merged = new Map<string, Set<string>>();

  maps.forEach((currentMap) => {
    currentMap.forEach((blockedDates, staffId) => {
      const nextDates = merged.get(staffId) || new Set<string>();
      blockedDates.forEach((date) => nextDates.add(date));
      merged.set(staffId, nextDates);
    });
  });

  return merged;
}

function buildPreferredOffStorageKey(companyName: string, department: string, month: string) {
  return [
    ROSTER_PREFERRED_OFF_STORAGE_PREFIX,
    companyName || 'all-companies',
    department || 'all-departments',
    month || 'all-months',
  ].join('::');
}

function normalizePreferredOffSelections(value: unknown, monthDateSet: Set<string>) {
  if (!value || typeof value !== 'object') return {} as PreferredOffSelectionMap;

  const normalized: PreferredOffSelectionMap = {};

  Object.entries(value as Record<string, unknown>).forEach(([staffId, rawDates]) => {
    if (!Array.isArray(rawDates)) return;

    const dates = [...new Set(rawDates.map((date) => String(date || '').trim()))]
      .filter((date) => monthDateSet.has(date))
      .sort();

    if (dates.length > 0) {
      normalized[String(staffId)] = dates;
    }
  });

  return normalized;
}

function buildPreferredOffDateMap(
  preferredOffSelections: PreferredOffSelectionMap,
  validStaffIds: Set<string>,
  monthDateSet: Set<string>
) {
  const preferredOffByStaff = new Map<string, Set<string>>();

  Object.entries(preferredOffSelections).forEach(([staffId, dates]) => {
    if (!validStaffIds.has(staffId)) return;

    const filteredDates = dates.filter((date) => monthDateSet.has(date));
    if (filteredDates.length === 0) return;

    preferredOffByStaff.set(staffId, new Set(filteredDates));
  });

  return preferredOffByStaff;
}

function normalizeAiAssignments(
  assignments: string[] | undefined,
  monthDates: string[],
  validShiftIds: Set<string>
) {
  return monthDates.map((_, index) => {
    const token = Array.isArray(assignments) ? assignments[index] : '';
    if (token === OFF_SHIFT_TOKEN) return OFF_SHIFT_TOKEN;
    if (token && validShiftIds.has(token)) return token;
    return OFF_SHIFT_TOKEN;
  });
}

function normalizeShiftName(name: string) {
  return String(name || '').replace(/\s+/g, '').toLowerCase();
}

const OFFICE_PATTERN_KEYWORDS = [
  '\ud1b5\uc0c1',
  '\uc0c1\uadfc',
  '\uc77c\ubc18',
  '\uc8fc\uac04',
  '\uace0\uc815',
  'office',
  'weekday',
  'regular',
];

const THREE_SHIFT_PATTERN_KEYWORDS = ['3\uad50\ub300', '3shift', '3-shift'];
const TWO_SHIFT_PATTERN_KEYWORDS = ['2\uad50\ub300', '2shift', '2-shift'];
const TWO_WORK_ONE_OFF_PATTERN_KEYWORDS = ['2\uc77c\uadfc\ubb341\uc77c\ud734\ubb34'];
const ONE_WORK_ONE_OFF_PATTERN_KEYWORDS = ['1\uc77c\uadfc\ubb341\uc77c\ud734\ubb34'];
const DAY_DEDICATED_PATTERN_KEYWORDS = [
  '\uB370\uC774\uC804\uB2F4',
  '\uC8FC\uAC04\uC804\uB2F4',
  '\uC8FC\uAC04\uACE0\uC815',
  'daydedicated',
  'dayfixed',
  'dayonly',
];
const EVENING_DEDICATED_PATTERN_KEYWORDS = [
  '\uC774\uBE0C\uC804\uB2F4',
  '\uC774\uBE0C\uB2DD\uC804\uB2F4',
  '\uC774\uBE0C\uACE0\uC815',
  'eveningdedicated',
  'eveningfixed',
  'evefixed',
  'eveonly',
];
const NIGHT_DEDICATED_PATTERN_KEYWORDS = [
  '\uB098\uC774\uD2B8\uC804\uB2F4',
  '\uC57C\uAC04\uC804\uB2F4',
  '\uC57C\uAC04\uACE0\uC815',
  'nightdedicated',
  'nightfixed',
  'nightonly',
];
const FIXED_PATTERN_KEYWORDS = ['\uC804\uB2F4', '\uACE0\uC815', 'fixed', 'dedicated', 'only'];
const MANAGEMENT_TEAM_KEYWORDS = ['관리팀', '시설관리', '환경관리'];
const WARD_TEAM_KEYWORDS = ['병동', '입원', '간호', 'ward'];
const OUTPATIENT_TEAM_KEYWORDS = ['외래', '검사', '원무', 'opd', 'outpatient'];
const OFFICE_TEAM_KEYWORDS = ['총무', '수술', '행정', '경영지원', '인사', '재무', '구매'];
const NUTRITION_TEAM_KEYWORDS = ['영양', '식당', '조리', 'nutrition', 'kitchen'];
const MANAGEMENT_SHIFT_KEYWORDS = ['관리사', '시설관리'];
const WARD_SHIFT_KEYWORDS = ['병동', 'ward'];
const OUTPATIENT_SHIFT_KEYWORDS = ['외래', '검사', '원무', 'opd', 'outpatient'];
const OFFICE_SHIFT_KEYWORDS = ['통상', '상근', '일반', '주간', 'regular', 'office'];
const NUTRITION_SHIFT_KEYWORDS = ['영양', '식당', '조리', 'meal', 'kitchen', 'cafeteria'];

function hasPatternKeyword(sources: Array<string | null | undefined>, keywords: string[]) {
  return sources
    .map((source) => normalizeShiftName(source ?? ''))
    .filter(Boolean)
    .some((source) =>
      keywords.some((keyword) => source.includes(normalizeShiftName(keyword)))
    );
}

function resolveShiftBand(shift: WorkShift) {
  const normalized = normalizeShiftName(shift.name);
  const startHour = Number(String(shift.start_time || '').slice(0, 2) || '0');

  if (
    normalized.includes('night') ||
    normalized.includes('나이트') ||
    normalized.includes('야간') ||
    startHour >= 20 ||
    startHour <= 4
  ) {
    return 'night';
  }

  if (
    normalized.includes('evening') ||
    normalized.includes('eve') ||
    normalized.includes('이브') ||
    normalized.includes('오후') ||
    (startHour >= 12 && startHour < 20)
  ) {
    return 'evening';
  }

  return 'day';
}

function getShiftSearchText(shift: WorkShift) {
  return normalizeShiftName(
    [shift.name, shift.shift_type, shift.description].filter(Boolean).join(' ')
  );
}

function filterShiftsByKeywords(shifts: WorkShift[], keywords: string[]) {
  return shifts.filter((shift) => {
    const searchText = getShiftSearchText(shift);
    return keywords.some((keyword) => searchText.includes(normalizeShiftName(keyword)));
  });
}

function dedupeShiftIds(shifts: WorkShift[]) {
  return shifts
    .map((shift) => shift.id)
    .filter((shiftId, index, list) => list.indexOf(shiftId) === index);
}

function getTeamRecommendationCategory(department: string) {
  const normalizedDepartment = normalizeShiftName(department);

  if (
    MANAGEMENT_TEAM_KEYWORDS.some((keyword) =>
      normalizedDepartment.includes(normalizeShiftName(keyword))
    )
  ) {
    return 'management';
  }

  if (
    WARD_TEAM_KEYWORDS.some((keyword) =>
      normalizedDepartment.includes(normalizeShiftName(keyword))
    )
  ) {
    return 'ward';
  }

  if (
    OUTPATIENT_TEAM_KEYWORDS.some((keyword) =>
      normalizedDepartment.includes(normalizeShiftName(keyword))
    )
  ) {
    return 'outpatient';
  }

  if (
    OFFICE_TEAM_KEYWORDS.some((keyword) =>
      normalizedDepartment.includes(normalizeShiftName(keyword))
    )
  ) {
    return 'office';
  }

  if (
    NUTRITION_TEAM_KEYWORDS.some((keyword) =>
      normalizedDepartment.includes(normalizeShiftName(keyword))
    )
  ) {
    return 'nutrition';
  }

  return 'general';
}

function getDefaultPlannerMode(
  teamRecommendationCategory: ReturnType<typeof getTeamRecommendationCategory>
): RosterPatternGroupMode {
  if (teamRecommendationCategory === 'management' || teamRecommendationCategory === 'outpatient') {
    return 'day_fixed';
  }

  return 'rotation';
}

function recommendShiftIdsForTeam(department: string, shifts: WorkShift[]) {
  const category = getTeamRecommendationCategory(department);
  const dayShifts = shifts.filter((shift) => resolveShiftBand(shift) === 'day');
  const weekdayDayShifts = dayShifts.filter(
    (shift) => resolveConfiguredWorkDayMode(shift) === 'weekdays'
  );
  const managementShifts = filterShiftsByKeywords(shifts, MANAGEMENT_SHIFT_KEYWORDS);
  const wardShifts = filterShiftsByKeywords(shifts, WARD_SHIFT_KEYWORDS);
  const outpatientShifts = filterShiftsByKeywords(shifts, OUTPATIENT_SHIFT_KEYWORDS);
  const officeShifts = filterShiftsByKeywords(shifts, OFFICE_SHIFT_KEYWORDS);
  const nutritionShifts = filterShiftsByKeywords(shifts, NUTRITION_SHIFT_KEYWORDS);
  const allDayCycleShifts = shifts.filter(
    (shift) =>
      resolveConfiguredWorkDayMode(shift) === 'all_days' ||
      hasPatternKeyword([shift.name, shift.shift_type, shift.description], THREE_SHIFT_PATTERN_KEYWORDS)
  );

  if (category === 'management') {
    return dedupeShiftIds(managementShifts);
  }

  if (category === 'ward') {
    if (wardShifts.length > 0) return dedupeShiftIds(wardShifts);
    if (allDayCycleShifts.length > 0) return dedupeShiftIds(allDayCycleShifts);
    return [];
  }

  if (category === 'outpatient') {
    if (outpatientShifts.length > 0) return dedupeShiftIds(outpatientShifts);
    if (weekdayDayShifts.length > 0) return dedupeShiftIds(weekdayDayShifts);
    return [];
  }

  if (category === 'office') {
    if (officeShifts.length > 0) return dedupeShiftIds(officeShifts);
    if (weekdayDayShifts.length > 0) return dedupeShiftIds(weekdayDayShifts);
    return [];
  }

  if (category === 'nutrition') {
    if (nutritionShifts.length > 0) return dedupeShiftIds(nutritionShifts);
    if (weekdayDayShifts.length > 0) return dedupeShiftIds(weekdayDayShifts);
    return [];
  }

  if (weekdayDayShifts.length > 0) return dedupeShiftIds(weekdayDayShifts);
  return dedupeShiftIds(shifts);
}

function resolveConfiguredWorkDayMode(shift?: WorkShift | null) {
  if (!shift) return 'weekdays';
  if (String(shift.shift_type || '').includes('3교대')) return 'all_days';
  if (shift.is_weekend_work || Number(shift.weekly_work_days) >= 7) return 'all_days';

  const description = String(shift.description || '');
  const markerIndex = description.lastIndexOf(SHIFT_META_MARKER);
  if (markerIndex === -1) return 'weekdays';

  try {
    const parsedMeta = JSON.parse(description.slice(markerIndex + SHIFT_META_MARKER.length).trim());
    return parsedMeta?.work_day_mode === 'all_days' ? 'all_days' : 'weekdays';
  } catch {
    return 'weekdays';
  }
}

function pickShiftByKeywords(shifts: WorkShift[], keywords: string[]) {
  return shifts.find((shift) => keywords.some((keyword) => normalizeShiftName(shift.name).includes(keyword)));
}

function sortShifts(shifts: WorkShift[]) {
  return [...shifts].sort((a, b) => {
    const aTime = String(a.start_time || '99:99').slice(0, 5);
    const bTime = String(b.start_time || '99:99').slice(0, 5);
    return aTime.localeCompare(bTime);
  });
}

function buildProgrammaticCycle(
  mode: RosterPatternGroupMode,
  shiftIds: string[],
  shiftMap: Map<string, WorkShift>
) {
  const sortedShiftIds = sortShifts(
    shiftIds.map((shiftId) => shiftMap.get(shiftId)).filter((shift): shift is WorkShift => Boolean(shift))
  ).map((shift) => shift.id);

  if (sortedShiftIds.length === 0) return [OFF_SHIFT_TOKEN];

  const primaryShiftId = sortedShiftIds[0];
  const eveningShiftId =
    sortedShiftIds.find((shiftId) => resolveShiftBand(shiftMap.get(shiftId)!) === 'evening') ||
    primaryShiftId;
  const nightShiftId =
    sortedShiftIds.find((shiftId) => resolveShiftBand(shiftMap.get(shiftId)!) === 'night') ||
    primaryShiftId;

  if (mode === 'day_fixed') {
    return [primaryShiftId, primaryShiftId, primaryShiftId, primaryShiftId, primaryShiftId, OFF_SHIFT_TOKEN, OFF_SHIFT_TOKEN];
  }

  if (mode === 'night_fixed') {
    return [nightShiftId, nightShiftId, OFF_SHIFT_TOKEN, OFF_SHIFT_TOKEN];
  }

  if (mode === 'evening_fixed') {
    return [eveningShiftId, eveningShiftId, OFF_SHIFT_TOKEN, OFF_SHIFT_TOKEN];
  }

  return sortedShiftIds.flatMap((shiftId) => [shiftId, shiftId]).concat([
    OFF_SHIFT_TOKEN,
    OFF_SHIFT_TOKEN,
    OFF_SHIFT_TOKEN,
  ]);
}

function buildProgrammaticAssignments({
  monthDates,
  shiftMap,
  cycle,
  staffIndex,
  mode,
  blockedDateSet,
}: {
  monthDates: string[];
  shiftMap: Map<string, WorkShift>;
  cycle: string[];
  staffIndex: number;
  mode: RosterPatternGroupMode;
  blockedDateSet?: Set<string>;
}) {
  const cycleLength = Math.max(cycle.length, 1);
  const offset = mode === 'rotation' ? (staffIndex * 2) % cycleLength : staffIndex % cycleLength;

  return monthDates.map((date, index) => {
    if (blockedDateSet?.has(date)) return OFF_SHIFT_TOKEN;

    const token = cycle[(index + offset) % cycleLength] || OFF_SHIFT_TOKEN;
    if (token === OFF_SHIFT_TOKEN) return OFF_SHIFT_TOKEN;

    const shift = shiftMap.get(token);
    if (!shift) return OFF_SHIFT_TOKEN;

    const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
    if (mode === 'day_fixed' && (dayOfWeek === 0 || dayOfWeek === 6)) {
      return OFF_SHIFT_TOKEN;
    }
    if (resolveConfiguredWorkDayMode(shift) === 'weekdays' && (dayOfWeek === 0 || dayOfWeek === 6)) {
      return OFF_SHIFT_TOKEN;
    }

  return token;
  });
}

function getAssignedShiftBand(token: string, shiftMap: Map<string, WorkShift>) {
  if (!token || token === OFF_SHIFT_TOKEN) return null;
  const shift = shiftMap.get(token);
  if (!shift) return null;
  return resolveShiftBand(shift);
}

function countPreviousBandStreak(
  assignments: string[],
  index: number,
  shiftMap: Map<string, WorkShift>
) {
  if (index <= 0) return 0;

  const previousBand = getAssignedShiftBand(assignments[index - 1], shiftMap);
  if (!previousBand) return 0;

  let streak = 0;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (getAssignedShiftBand(assignments[cursor], shiftMap) !== previousBand) {
      break;
    }
    streak += 1;
  }

  return streak;
}

function countPreviousWorkStreak(assignments: string[], index: number) {
  if (index <= 0) return 0;

  let streak = 0;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (!assignments[cursor] || assignments[cursor] === OFF_SHIFT_TOKEN) {
      break;
    }
    streak += 1;
  }

  return streak;
}

function canStillMeetMinimumStaffing({
  projectedCounts,
  minStaffingTargets,
  remainingStaff,
}: {
  projectedCounts: Record<'day' | 'evening' | 'night', number>;
  minStaffingTargets: Record<'day' | 'evening' | 'night', number>;
  remainingStaff: number;
}) {
  const requiredRemaining =
    Math.max(0, minStaffingTargets.day - projectedCounts.day) +
    Math.max(0, minStaffingTargets.evening - projectedCounts.evening) +
    Math.max(0, minStaffingTargets.night - projectedCounts.night);

  return requiredRemaining <= remainingStaff;
}

function buildFallbackGenerationRuleForDepartment(
  department: string,
  companyName: string,
  days: number
) {
  const category = getTeamRecommendationCategory(department);
  const baseRule = buildDefaultGenerationRule(companyName);

  return {
    ...baseRule,
    name: '',
    teamKeywords: department ? [department] : [],
    rotationNightCount: category === 'ward' ? Math.max(4, Math.round(days / 5)) : 0,
    offDaysAfterNight: category === 'ward' ? 1 : 0,
    nightBlockSize: category === 'ward' ? 2 : 1,
    maxConsecutiveWorkDays: category === 'ward' ? 5 : 6,
    distributeWeekendShifts: category === 'ward',
  };
}

function buildRuleAwareRotationAssignments({
  monthDates,
  shiftMap,
  shiftIds,
  staffIndex,
  rule,
  sharedDailyBandCounts,
  totalStaffCount,
  weekendAssignmentCounts,
  blockedDateSet,
}: {
  monthDates: string[];
  shiftMap: Map<string, WorkShift>;
  shiftIds: string[];
  staffIndex: number;
  rule: RosterGenerationRule;
  sharedDailyBandCounts?: Array<Record<'day' | 'evening' | 'night', number>>;
  totalStaffCount: number;
  weekendAssignmentCounts?: number[];
  blockedDateSet?: Set<string>;
}) {
  const sortedShiftIds = sortShifts(
    shiftIds.map((shiftId) => shiftMap.get(shiftId)).filter((shift): shift is WorkShift => Boolean(shift))
  ).map((shift) => shift.id);

  const dayShiftId =
    sortedShiftIds.find((shiftId) => resolveShiftBand(shiftMap.get(shiftId)!) === 'day') ||
    sortedShiftIds[0] ||
    '';
  const eveningShiftId =
    sortedShiftIds.find((shiftId) => resolveShiftBand(shiftMap.get(shiftId)!) === 'evening') ||
    sortedShiftIds.find((shiftId) => shiftId !== dayShiftId) ||
    dayShiftId;
  const nightShiftId =
    sortedShiftIds.find((shiftId) => resolveShiftBand(shiftMap.get(shiftId)!) === 'night') ||
    '';

  if (!dayShiftId || !eveningShiftId || !nightShiftId) {
    const fallbackCycle = buildProgrammaticCycle('rotation', sortedShiftIds, shiftMap);
    return buildProgrammaticAssignments({
      monthDates,
      shiftMap,
      cycle: fallbackCycle,
      staffIndex,
      mode: 'rotation',
      blockedDateSet,
    });
  }

  const days = monthDates.length;
  const assignments = Array.from({ length: days }, () => '');
  if (blockedDateSet?.size) {
    monthDates.forEach((date, index) => {
      if (blockedDateSet.has(date)) {
        assignments[index] = OFF_SHIFT_TOKEN;
      }
    });
  }
  const dayBandCounts =
    sharedDailyBandCounts ||
    Array.from({ length: days }, () => ({
      day: 0,
      evening: 0,
      night: 0,
    }));
  const averageNightLoadForMinimum =
    totalStaffCount > 0 ? Math.ceil((days * Math.max(0, rule.minNightStaff || 0)) / totalStaffCount) : 0;
  const targetNightCount = clampNightShiftCount(
    Math.max(rule.rotationNightCount, averageNightLoadForMinimum),
    days
  );
  const nightBlockSize = Math.max(1, Math.min(3, Math.floor(rule.nightBlockSize || 1)));
  const offDaysAfterNight = Math.max(0, Math.min(3, Math.floor(rule.offDaysAfterNight || 0)));
  const maxConsecutiveWorkDays = Math.max(2, Math.min(7, Math.floor(rule.maxConsecutiveWorkDays || 5)));
  const minStaffingTargets = {
    day: Math.max(0, Math.floor(rule.minDayStaff || 0)),
    evening: Math.max(0, Math.floor(rule.minEveningStaff || 0)),
    night: Math.max(0, Math.floor(rule.minNightStaff || 0)),
  } satisfies Record<'day' | 'evening' | 'night', number>;

  if (targetNightCount > 0) {
    const blockCount = Math.ceil(targetNightCount / nightBlockSize);
    const maxStartDay = Math.max(1, days - nightBlockSize - offDaysAfterNight + 1);
    const idealStartDays = selectDistributedDays({
      candidateDays: Array.from({ length: maxStartDay }, (_, index) => index + 1),
      days,
      targetCount: Math.min(blockCount, maxStartDay),
      seed: staffIndex * 3,
    });
    const chosenStartDays: number[] = [];

    const blockStartDays = idealStartDays
      .map((idealStartDay) => {
        const availableStartDays = Array.from({ length: maxStartDay }, (_, index) => index + 1).filter(
          (startDay) =>
            chosenStartDays.every((chosenStartDay) => {
              const chosenEndDay = chosenStartDay + nightBlockSize + offDaysAfterNight - 1;
              const nextEndDay = startDay + nightBlockSize + offDaysAfterNight - 1;
              return nextEndDay < chosenStartDay || startDay > chosenEndDay;
            })
        );

        if (availableStartDays.length === 0) return null;

        const nextStartDay = [...availableStartDays].sort((left, right) => {
          const leftNightLoad = Array.from({ length: nightBlockSize }, (_, offset) => {
            const dayIndex = left + offset - 1;
            return dayBandCounts[dayIndex]?.night || 0;
          }).reduce((sum, value) => sum + value, 0);
          const rightNightLoad = Array.from({ length: nightBlockSize }, (_, offset) => {
            const dayIndex = right + offset - 1;
            return dayBandCounts[dayIndex]?.night || 0;
          }).reduce((sum, value) => sum + value, 0);

          if (leftNightLoad !== rightNightLoad) return leftNightLoad - rightNightLoad;

          const leftDistance = Math.abs(left - idealStartDay);
          const rightDistance = Math.abs(right - idealStartDay);
          if (leftDistance !== rightDistance) return leftDistance - rightDistance;

          return left - right;
        })[0];

        chosenStartDays.push(nextStartDay);
        return nextStartDay;
      })
      .filter((startDay): startDay is number => Number.isInteger(startDay));

    let placedNightCount = 0;
    blockStartDays.forEach((startDay) => {
      const startIndex = startDay - 1;

      for (let offset = 0; offset < nightBlockSize && placedNightCount < targetNightCount; offset += 1) {
        const dayIndex = startIndex + offset;
        if (dayIndex >= days || assignments[dayIndex]) continue;
        assignments[dayIndex] = nightShiftId;
        dayBandCounts[dayIndex].night += 1;
        placedNightCount += 1;
      }

      for (let offset = 0; offset < offDaysAfterNight; offset += 1) {
        const dayIndex = startIndex + nightBlockSize + offset;
        if (dayIndex >= days || assignments[dayIndex]) continue;
        assignments[dayIndex] = OFF_SHIFT_TOKEN;
      }
    });
  }

  const bandCounts: Record<'day' | 'evening' | 'night', number> = {
    day: 0,
    evening: 0,
    night: assignments.filter((token) => token === nightShiftId).length,
  };
  let weekendWorkCount = assignments.reduce((count, token, index) => {
    if (!token || token === OFF_SHIFT_TOKEN) return count;
    const dayOfWeek = new Date(`${monthDates[index]}T00:00:00`).getDay();
    return dayOfWeek === 0 || dayOfWeek === 6 ? count + 1 : count;
  }, 0);

  const preferredFillOrder =
    rule.balanceRotationBands && staffIndex % 2 === 1
      ? [eveningShiftId, dayShiftId]
      : [dayShiftId, eveningShiftId];

  for (let index = 0; index < days; index += 1) {
    if (assignments[index]) continue;
    if (blockedDateSet?.has(monthDates[index])) {
      assignments[index] = OFF_SHIFT_TOKEN;
      continue;
    }

    const date = monthDates[index];
    const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const previousToken = index > 0 ? assignments[index - 1] : '';
    const previousBand = getAssignedShiftBand(previousToken, shiftMap);
    const previousBandStreak = countPreviousBandStreak(assignments, index, shiftMap);
    const previousWorkStreak = countPreviousWorkStreak(assignments, index);
    const remainingStaff = Math.max(totalStaffCount - staffIndex - 1, 0);
    let candidates = preferredFillOrder.filter(Boolean);

    candidates = candidates.filter((shiftId) => {
      const shift = shiftMap.get(shiftId);
      return !(
        resolveConfiguredWorkDayMode(shift) === 'weekdays' &&
        (dayOfWeek === 0 || dayOfWeek === 6)
      );
    });

    if (rule.avoidDayAfterNight && previousToken === nightShiftId) {
      candidates = candidates.filter(
        (shiftId) => resolveShiftBand(shiftMap.get(shiftId)!) !== 'day'
      );
    }

    const projectedOffCounts = {
      day: dayBandCounts[index]?.day || 0,
      evening: dayBandCounts[index]?.evening || 0,
      night: dayBandCounts[index]?.night || 0,
    };
    const offIsFeasible = canStillMeetMinimumStaffing({
      projectedCounts: projectedOffCounts,
      minStaffingTargets,
      remainingStaff,
    });

    if (previousWorkStreak >= maxConsecutiveWorkDays && offIsFeasible) {
      assignments[index] = OFF_SHIFT_TOKEN;
      continue;
    }

    if (rule.distributeWeekendShifts && isWeekend && offIsFeasible && weekendAssignmentCounts?.length) {
      const lowestWeekendLoad = Math.min(...weekendAssignmentCounts);
      if (weekendWorkCount > lowestWeekendLoad) {
        assignments[index] = OFF_SHIFT_TOKEN;
        continue;
      }
    }

    if (candidates.length === 0) {
      assignments[index] = OFF_SHIFT_TOKEN;
      continue;
    }

    const orderedCandidates = [...candidates].sort((left, right) => {
        const leftBand = resolveShiftBand(shiftMap.get(left)!);
        const rightBand = resolveShiftBand(shiftMap.get(right)!);
        const currentCounts = dayBandCounts[index] || { day: 0, evening: 0, night: 0 };
        const leftProjectedCounts = {
          ...currentCounts,
          [leftBand]: (currentCounts[leftBand as 'day' | 'evening' | 'night'] || 0) + 1,
        };
        const rightProjectedCounts = {
          ...currentCounts,
          [rightBand]: (currentCounts[rightBand as 'day' | 'evening' | 'night'] || 0) + 1,
        };
        const leftFeasible = canStillMeetMinimumStaffing({
          projectedCounts: leftProjectedCounts,
          minStaffingTargets,
          remainingStaff,
        });
        const rightFeasible = canStillMeetMinimumStaffing({
          projectedCounts: rightProjectedCounts,
          minStaffingTargets,
          remainingStaff,
        });

        if (leftFeasible !== rightFeasible) {
          return leftFeasible ? -1 : 1;
        }

        const leftUrgency = Math.max(
          0,
          minStaffingTargets[leftBand as 'day' | 'evening' | 'night'] -
            (currentCounts[leftBand as 'day' | 'evening' | 'night'] || 0)
        );
        const rightUrgency = Math.max(
          0,
          minStaffingTargets[rightBand as 'day' | 'evening' | 'night'] -
            (currentCounts[rightBand as 'day' | 'evening' | 'night'] || 0)
        );
        if (leftUrgency !== rightUrgency) {
          return rightUrgency - leftUrgency;
        }

        if (previousBand && previousBand !== 'night') {
          const continuityTarget = 2;
          const leftKeepsBlock = leftBand === previousBand;
          const rightKeepsBlock = rightBand === previousBand;
          const preferKeepingBlock = previousBandStreak < continuityTarget;

          if (leftKeepsBlock !== rightKeepsBlock) {
            if (preferKeepingBlock) {
              return leftKeepsBlock ? -1 : 1;
            }
            return leftKeepsBlock ? 1 : -1;
          }
        }

        if (!rule.balanceRotationBands) {
          return preferredFillOrder.indexOf(left) - preferredFillOrder.indexOf(right);
        }

        const sharedCountDiff =
          (dayBandCounts[index]?.[leftBand as 'day' | 'evening' | 'night'] || 0) -
          (dayBandCounts[index]?.[rightBand as 'day' | 'evening' | 'night'] || 0);
        if (sharedCountDiff !== 0) return sharedCountDiff;

        const personalCountDiff =
          (bandCounts[leftBand as 'day' | 'evening' | 'night'] || 0) -
          (bandCounts[rightBand as 'day' | 'evening' | 'night'] || 0);
        if (personalCountDiff !== 0) return personalCountDiff;

        return preferredFillOrder.indexOf(left) - preferredFillOrder.indexOf(right);
      });

    assignments[index] = orderedCandidates[0];
    const assignedBand = resolveShiftBand(shiftMap.get(orderedCandidates[0])!);
    bandCounts[assignedBand as 'day' | 'evening' | 'night'] += 1;
    dayBandCounts[index][assignedBand as 'day' | 'evening' | 'night'] += 1;
    if (isWeekend) {
      weekendWorkCount += 1;
    }
  }

  let finalWorkStreak = 0;
  const remainingStaff = Math.max(totalStaffCount - staffIndex - 1, 0);
  for (let index = 0; index < days; index += 1) {
    const token = assignments[index] || OFF_SHIFT_TOKEN;
    if (!token || token === OFF_SHIFT_TOKEN) {
      finalWorkStreak = 0;
      continue;
    }

    finalWorkStreak += 1;
    if (finalWorkStreak <= maxConsecutiveWorkDays) continue;

    const assignedBand = getAssignedShiftBand(token, shiftMap);
    if (!assignedBand) continue;

    const currentCounts = dayBandCounts[index] || { day: 0, evening: 0, night: 0 };
    const projectedCounts = {
      ...currentCounts,
      [assignedBand]: Math.max(0, (currentCounts[assignedBand as 'day' | 'evening' | 'night'] || 0) - 1),
    };
    const canRestHere = canStillMeetMinimumStaffing({
      projectedCounts,
      minStaffingTargets,
      remainingStaff,
    });
    if (!canRestHere) continue;

    assignments[index] = OFF_SHIFT_TOKEN;
    dayBandCounts[index][assignedBand as 'day' | 'evening' | 'night'] = Math.max(
      0,
      (dayBandCounts[index][assignedBand as 'day' | 'evening' | 'night'] || 0) - 1
    );
    bandCounts[assignedBand as 'day' | 'evening' | 'night'] = Math.max(
      0,
      (bandCounts[assignedBand as 'day' | 'evening' | 'night'] || 0) - 1
    );
    const dayOfWeek = new Date(`${monthDates[index]}T00:00:00`).getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      weekendWorkCount = Math.max(0, weekendWorkCount - 1);
    }
    finalWorkStreak = 0;
  }

  if (weekendAssignmentCounts) {
    weekendAssignmentCounts[staffIndex] = weekendWorkCount;
  }

  return assignments.map((token) => token || OFF_SHIFT_TOKEN);
}

function buildDefaultShiftOrder(shifts: WorkShift[]) {
  const sorted = sortShifts(shifts);
  const bucket = [
    pickShiftByKeywords(sorted, ['day', '데이', '주간', '상근', '일근', '오전']),
    pickShiftByKeywords(sorted, ['evening', 'eve', '이브', '오후', '중간']),
    pickShiftByKeywords(sorted, ['night', '나이트', '야간']),
  ].filter(Boolean) as WorkShift[];

  const unique = [...bucket];
  sorted.forEach((shift) => {
    if (!unique.some((item) => item.id === shift.id)) {
      unique.push(shift);
    }
  });

  return unique.slice(0, 3);
}

function inferPattern(staff: any, shifts: WorkShift[]) {
  const assignedShift = shifts.find((shift) => shift.id === staff?.shift_id);
  const sources = [
    staff?.shift_type,
    assignedShift?.shift_type,
    assignedShift?.name,
  ];

  if (hasPatternKeyword(sources, THREE_SHIFT_PATTERN_KEYWORDS)) return '3교대';
  if (hasPatternKeyword(sources, TWO_SHIFT_PATTERN_KEYWORDS)) return '2교대';
  if (hasPatternKeyword(sources, TWO_WORK_ONE_OFF_PATTERN_KEYWORDS)) return '2일근무1일휴무';
  if (hasPatternKeyword(sources, ONE_WORK_ONE_OFF_PATTERN_KEYWORDS)) return '1일근무1일휴무';
  if (hasPatternKeyword(sources, NIGHT_DEDICATED_PATTERN_KEYWORDS)) return '야간전담';
  if (
    hasPatternKeyword(sources, OFFICE_PATTERN_KEYWORDS) ||
    (assignedShift && resolveConfiguredWorkDayMode(assignedShift) === 'weekdays')
  ) {
    return '상근';
  }
  if (shifts.length >= 3) return '3교대';
  return '상근';
}

function getBandShiftIds(
  band: 'day' | 'evening' | 'night',
  shifts: WorkShift[],
  preferredShiftId = ''
) {
  const bandShiftIds = sortShifts(shifts.filter((shift) => resolveShiftBand(shift) === band)).map(
    (shift) => shift.id
  );

  if (preferredShiftId && bandShiftIds.includes(preferredShiftId)) {
    return [preferredShiftId, ...bandShiftIds.filter((shiftId) => shiftId !== preferredShiftId)];
  }

  return bandShiftIds;
}

function inferDedicatedPatternGroup(
  staff: any,
  shifts: WorkShift[]
): PlannerResolvedPatternGroup | null {
  if (shifts.length === 0) return null;

  const assignedShift = shifts.find((shift) => shift.id === staff?.shift_id) || null;
  const sources = [
    staff?.shift_type,
    staff?.position,
    staff?.role,
    assignedShift?.shift_type,
    assignedShift?.name,
    assignedShift?.description,
  ];

  const buildGroup = (
    band: 'day' | 'evening' | 'night',
    mode: RosterPatternGroupMode,
    label: string,
    rationale: string
  ) => {
    const shiftIds = getBandShiftIds(band, shifts, assignedShift?.id || '');
    if (shiftIds.length === 0) return null;

    return {
      key: `auto-${mode}`,
      label,
      mode,
      shiftIds,
      rationale,
      source: 'auto' as const,
    };
  };

  if (hasPatternKeyword(sources, DAY_DEDICATED_PATTERN_KEYWORDS)) {
    return buildGroup(
      'day',
      'day_fixed',
      '\uB370\uC774\uC804\uB2F4',
      '\uC9C1\uC6D0 \uADFC\uBB34\uC720\uD615\uACFC \uBC30\uC815 \uADFC\uBB34\uB97C \uAE30\uC900\uC73C\uB85C \uB370\uC774 \uC804\uB2F4\uC790\uB85C \uC790\uB3D9 \uAC10\uC9C0\uD588\uC2B5\uB2C8\uB2E4.'
    );
  }

  if (hasPatternKeyword(sources, EVENING_DEDICATED_PATTERN_KEYWORDS)) {
    return buildGroup(
      'evening',
      'evening_fixed',
      '\uC774\uBE0C\uC804\uB2F4',
      '\uC9C1\uC6D0 \uADFC\uBB34\uC720\uD615\uACFC \uBC30\uC815 \uADFC\uBB34\uB97C \uAE30\uC900\uC73C\uB85C \uC774\uBE0C \uC804\uB2F4\uC790\uB85C \uC790\uB3D9 \uAC10\uC9C0\uD588\uC2B5\uB2C8\uB2E4.'
    );
  }

  if (hasPatternKeyword(sources, NIGHT_DEDICATED_PATTERN_KEYWORDS)) {
    return buildGroup(
      'night',
      'night_fixed',
      '\uB098\uC774\uD2B8\uC804\uB2F4',
      '\uC9C1\uC6D0 \uADFC\uBB34\uC720\uD615\uACFC \uBC30\uC815 \uADFC\uBB34\uB97C \uAE30\uC900\uC73C\uB85C \uB098\uC774\uD2B8 \uC804\uB2F4\uC790\uB85C \uC790\uB3D9 \uAC10\uC9C0\uD588\uC2B5\uB2C8\uB2E4.'
    );
  }

  if (assignedShift && hasPatternKeyword(sources, FIXED_PATTERN_KEYWORDS)) {
    const assignedBand = resolveShiftBand(assignedShift);
    if (assignedBand === 'day') {
      return buildGroup(
        'day',
        'day_fixed',
        '\uB370\uC774\uC804\uB2F4',
        '\uACE0\uC815 \uADFC\uBB34 \uD78C\uD2B8\uC640 \uBC30\uC815 \uADFC\uBB34 \uC2DC\uAC04\uC744 \uAE30\uC900\uC73C\uB85C \uB370\uC774 \uC804\uB2F4\uC790\uB85C \uD310\uB2E8\uD588\uC2B5\uB2C8\uB2E4.'
      );
    }
    if (assignedBand === 'evening') {
      return buildGroup(
        'evening',
        'evening_fixed',
        '\uC774\uBE0C\uC804\uB2F4',
        '\uACE0\uC815 \uADFC\uBB34 \uD78C\uD2B8\uC640 \uBC30\uC815 \uADFC\uBB34 \uC2DC\uAC04\uC744 \uAE30\uC900\uC73C\uB85C \uC774\uBE0C \uC804\uB2F4\uC790\uB85C \uD310\uB2E8\uD588\uC2B5\uB2C8\uB2E4.'
      );
    }
    if (assignedBand === 'night') {
      return buildGroup(
        'night',
        'night_fixed',
        '\uB098\uC774\uD2B8\uC804\uB2F4',
        '\uACE0\uC815 \uADFC\uBB34 \uD78C\uD2B8\uC640 \uBC30\uC815 \uADFC\uBB34 \uC2DC\uAC04\uC744 \uAE30\uC900\uC73C\uB85C \uB098\uC774\uD2B8 \uC804\uB2F4\uC790\uB85C \uD310\uB2E8\uD588\uC2B5\uB2C8\uB2E4.'
      );
    }
  }

  return null;
}

function resolvePlannerPatternGroup({
  staff,
  patternProfile,
  availableShifts,
  allShifts,
}: {
  staff: any;
  patternProfile?: RosterPatternProfile | null;
  availableShifts: WorkShift[];
  allShifts: WorkShift[];
}): PlannerResolvedPatternGroup | null {
  const matchedGroup = patternProfile
    ? findPatternStaffGroup(patternProfile, {
        name: String(staff.name || ''),
        position: String(staff.position || ''),
        role: String(staff.role || ''),
        employmentType: String(staff.employment_type || ''),
        department: String(getDepartmentName(staff) || ''),
        shiftType: String(staff.shift_type || ''),
        assignedShiftId: String(staff.shift_id || ''),
        assignedShiftName: getShiftNameById(String(staff.shift_id || ''), allShifts),
      })
    : null;

  if (matchedGroup) {
    return {
      key: matchedGroup.id,
      label: matchedGroup.label,
      mode: matchedGroup.mode,
      shiftIds: matchedGroup.shiftIds,
      rationale: `${matchedGroup.label} 그룹 설정을 기준으로 고정 사이클을 적용했습니다.`,
      source: 'profile',
    };
  }

  return inferDedicatedPatternGroup(staff, availableShifts);
}

function isNightPattern(pattern: string) {
  return pattern === '3교대' || pattern === '야간전담';
}

function isCustomPattern(pattern: string) {
  return pattern === CUSTOM_PATTERN_VALUE;
}

function isWeeklyTemplatePattern(pattern: string) {
  return pattern === WEEKLY_TEMPLATE_PATTERN_VALUE;
}

function getRequiredShiftCount(pattern: string) {
  switch (pattern) {
    case '3교대':
      return 3;
    case '2교대':
    case '2일근무1일휴무':
      return 2;
    case CUSTOM_PATTERN_VALUE:
      return 1;
    default:
      return 1;
  }
}

function normalizeCustomPatternSequence(sequence: string[], workShifts: WorkShift[]) {
  const validShiftIds = new Set(workShifts.map((shift) => shift.id));
  return sequence.filter((token) => token === OFF_SHIFT_TOKEN || validShiftIds.has(token));
}

function buildDefaultCustomPatternSequence(shiftIds: string[]) {
  const uniqueShiftIds = shiftIds.filter(Boolean).filter((shiftId, index, list) => list.indexOf(shiftId) === index);
  if (uniqueShiftIds.length === 0) return [];
  if (uniqueShiftIds.length === 1) return uniqueShiftIds;
  return [...uniqueShiftIds, OFF_SHIFT_TOKEN];
}

function normalizeActiveWeekdays(activeWeekdays: number[]) {
  const orderMap = new Map(WEEKDAY_PICKER_ORDER.map((day, index) => [day, index]));
  return Array.from(new Set(activeWeekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))).sort(
    (left, right) => (orderMap.get(left) ?? 99) - (orderMap.get(right) ?? 99)
  );
}

function buildDefaultWeeklyTemplateWeeks(shiftIds: string[], weekCount = 1): WeeklyTemplateWeek[] {
  const normalizedShiftIds = shiftIds.filter(Boolean).filter((shiftId, index, list) => list.indexOf(shiftId) === index);
  const safeWeekCount = Math.max(1, Math.min(6, Math.floor(weekCount) || 1));
  const fallbackShiftId = normalizedShiftIds[0] || '';

  return Array.from({ length: safeWeekCount }, (_, index) => ({
    shiftId: normalizedShiftIds[index] || fallbackShiftId,
    activeWeekdays: [1, 2, 3, 4, 5],
  }));
}

function normalizeWeeklyTemplateWeeks(
  weeks: WeeklyTemplateWeek[],
  shiftIds: string[],
  desiredCount?: number
) {
  const normalizedShiftIds = shiftIds.filter(Boolean).filter((shiftId, index, list) => list.indexOf(shiftId) === index);
  const safeWeekCount = Math.max(1, Math.min(6, Math.floor(desiredCount ?? weeks.length ?? 1) || 1));
  const fallbackShiftId = normalizedShiftIds[0] || '';
  const sourceWeeks =
    Array.isArray(weeks) && weeks.length > 0 ? weeks : buildDefaultWeeklyTemplateWeeks(normalizedShiftIds, safeWeekCount);

  return Array.from({ length: safeWeekCount }, (_, index) => {
    const source = sourceWeeks[index] || sourceWeeks[sourceWeeks.length - 1] || {
      shiftId: fallbackShiftId,
      activeWeekdays: [1, 2, 3, 4, 5],
    };

    return {
      shiftId: normalizedShiftIds.includes(source.shiftId) ? source.shiftId : fallbackShiftId,
      activeWeekdays: normalizeActiveWeekdays(source.activeWeekdays || []),
    };
  });
}

function getWeeklyTemplateWeekLabel(index: number) {
  return `${index + 1}주차`;
}

function formatWeekdaySummary(activeWeekdays: number[]) {
  const normalized = normalizeActiveWeekdays(activeWeekdays);
  if (normalized.length === 0) return '전체 휴무';
  return normalized.map((day) => WEEKDAY_LABELS[day]).join(' · ');
}

function buildWeeklyTemplateAnchor(monthDates: string[]) {
  const firstDate = monthDates[0] ? new Date(`${monthDates[0]}T00:00:00`) : new Date();
  const anchor = new Date(firstDate);
  anchor.setHours(0, 0, 0, 0);
  return anchor;
}

function resolveWeeklyTemplateWeekIndex(date: string, anchor: Date, cycleLength: number) {
  const current = new Date(`${date}T00:00:00`);
  current.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((current.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24));
  const weekOffset = Math.floor(diffDays / 7);
  return ((weekOffset % cycleLength) + cycleLength) % cycleLength;
}

function buildWizardPresetDescription(pattern: string, weeklyTemplateWeeks: WeeklyTemplateWeek[], shiftCount: number) {
  if (isWeeklyTemplatePattern(pattern)) {
    return weeklyTemplateWeeks
      .map((week, index) => `${getWeeklyTemplateWeekLabel(index)} ${formatWeekdaySummary(week.activeWeekdays)}`)
      .join(' / ');
  }
  if (pattern === CUSTOM_PATTERN_VALUE) {
    return `커스텀 순환 · 근무유형 ${shiftCount}개`;
  }
  return `${pattern} · 근무유형 ${shiftCount}개`;
}

function normalizePresetRecord(record: any): RosterWizardPreset | null {
  if (!record || typeof record !== 'object') return null;
  const id = String(record.id || '').trim();
  const name = String(record.name || '').trim();
  if (!id || !name) return null;
  const shiftIds = Array.isArray(record.shiftIds)
    ? record.shiftIds
        .map((shiftId: any) => String(shiftId || '').trim())
        .filter(Boolean)
    : [];
  const shiftNames = Array.isArray(record.shiftNames)
    ? record.shiftNames
        .map((shiftName: any) => String(shiftName || '').trim())
        .filter(Boolean)
    : [];

  const customPatternSlots = Array.isArray(record.customPatternSlots)
    ? record.customPatternSlots
        .map((token: any) => {
          if (token === 'OFF') return 'OFF' as const;
          const slot = Number(token);
          return Number.isInteger(slot) && slot > 0 ? slot : null;
        })
        .filter((token: number | 'OFF' | null): token is number | 'OFF' => token !== null)
    : [];

  const weeklyTemplateWeeks = Array.isArray(record.weeklyTemplateWeeks)
    ? record.weeklyTemplateWeeks
        .map((week: any) => {
          const shiftSlot = Number(week?.shiftSlot);
          if (!Number.isInteger(shiftSlot) || shiftSlot <= 0) return null;
          return {
            shiftSlot,
            activeWeekdays: normalizeActiveWeekdays(Array.isArray(week?.activeWeekdays) ? week.activeWeekdays : []),
          };
        })
        .filter(
          (
            week: {
              shiftSlot: number;
              activeWeekdays: number[];
            } | null
          ): week is {
            shiftSlot: number;
            activeWeekdays: number[];
          } => week !== null
        )
    : [];

  const inferredShiftSlotCount = Math.max(
    Number(record.shiftSlotCount) || 0,
    shiftIds.length,
    customPatternSlots.reduce((max: number, token: number | 'OFF') => (token === 'OFF' ? max : Math.max(max, token)), 0),
    weeklyTemplateWeeks.reduce((max: number, week: { shiftSlot: number; activeWeekdays: number[] }) => Math.max(max, week.shiftSlot), 0),
    1
  );

  return {
    id,
    name,
    description: String(record.description || '').trim(),
    pattern: String(record.pattern || '상근'),
    shiftSlotCount: inferredShiftSlotCount,
    shiftIds: shiftIds.slice(0, inferredShiftSlotCount),
    shiftNames: shiftNames.slice(0, inferredShiftSlotCount),
    startOffset: Math.max(0, Math.floor(Number(record.startOffset) || 0)),
    nightShiftCount: Math.max(0, Math.floor(Number(record.nightShiftCount) || 0)),
    customPatternSlots,
    weeklyTemplateWeeks,
  };
}

function resolvePresetShiftIds(
  preset: RosterWizardPreset,
  fallbackShiftIds: string[],
  workShifts: WorkShift[]
) {
  const validShiftIds = new Set(workShifts.map((shift) => shift.id));
  const shiftIdByName = new Map<string, string>();

  workShifts.forEach((shift) => {
    const normalizedName = normalizeShiftName(shift.name);
    if (normalizedName && !shiftIdByName.has(normalizedName)) {
      shiftIdByName.set(normalizedName, shift.id);
    }
  });

  const resolvedPresetShiftIds = preset.shiftIds
    .map((shiftId, index) => {
      if (validShiftIds.has(shiftId)) return shiftId;
      const shiftName = preset.shiftNames[index] || '';
      return shiftIdByName.get(normalizeShiftName(shiftName)) || '';
    })
    .filter(Boolean);

  return [...resolvedPresetShiftIds, ...fallbackShiftIds.filter(Boolean), ...workShifts.map((shift) => shift.id)]
    .filter((shiftId, index, list) => list.indexOf(shiftId) === index)
    .slice(0, Math.max(1, preset.shiftSlotCount));
}

function getPatternSequenceLabel(token: string, workShifts: WorkShift[]) {
  if (token === OFF_SHIFT_TOKEN) return 'OFF';
  return getShiftNameById(token, workShifts);
}

function clampNightShiftCount(value: number, days: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(days, Math.floor(value)));
}

function inferDefaultNightShiftCount(pattern: string, days: number) {
  if (pattern === '야간전담') return Math.ceil(days / 2);
  if (pattern === '3교대') return Math.max(1, Math.round(days / 4));
  return 0;
}

function selectDistributedDays({
  candidateDays,
  days,
  targetCount,
  seed,
}: {
  candidateDays: number[];
  days: number;
  targetCount: number;
  seed: number;
}) {
  const sortedDays = [...candidateDays].sort((a, b) => a - b);
  if (targetCount <= 0 || sortedDays.length === 0) return [];
  if (targetCount >= sortedDays.length) return sortedDays;

  const picks: number[] = [];
  const used = new Set<number>();
  const normalizedSeed = ((seed % days) + days) % days;

  for (let index = 0; index < targetCount; index += 1) {
    const idealPosition = ((((index + 0.5) * days) / targetCount) + normalizedSeed) % days;
    let bestDay = sortedDays[0];
    let bestDistance = Number.POSITIVE_INFINITY;

    sortedDays.forEach((day) => {
      if (used.has(day)) return;
      const zeroBasedDay = day - 1;
      const directDistance = Math.abs(zeroBasedDay - idealPosition);
      const wrappedDistance = Math.min(directDistance, days - directDistance);
      if (wrappedDistance < bestDistance) {
        bestDistance = wrappedDistance;
        bestDay = day;
      }
    });

    used.add(bestDay);
    picks.push(bestDay);
  }

  return picks.sort((a, b) => a - b);
}

function buildInitialConfig(staff: any, index: number, shifts: WorkShift[], days: number) {
  const primary = shifts.find((shift) => shift.id === staff?.shift_id)?.id || shifts[0]?.id || '';
  const secondary = shifts[1]?.id || primary;
  const tertiary = shifts[2]?.id || secondary || primary;
  const pattern = inferPattern(staff, shifts);

  return {
    enabled: false,
    pattern,
    primaryShiftId: primary,
    secondaryShiftId: secondary,
    tertiaryShiftId: tertiary,
    startOffset: index,
    nightShiftCount: isNightPattern(pattern) ? inferDefaultNightShiftCount(pattern, days) : 0,
    customPatternSequence: [],
    weeklyTemplateWeeks: buildDefaultWeeklyTemplateWeeks([primary, secondary, tertiary]),
  };
}

function getShiftNameById(shiftId: string, workShifts: WorkShift[]) {
  if (shiftId === OFF_SHIFT_TOKEN) return '휴무';
  return workShifts.find((shift) => shift.id === shiftId)?.name || '미지정';
}

function resolveShiftWorkDayMode(shift?: WorkShift | null) {
  return resolveConfiguredWorkDayMode(shift);
}

function shiftIncludesWeekend(shift?: WorkShift | null) {
  if (!shift) return false;
  return resolveShiftWorkDayMode(shift) === 'all_days';
}

function buildPatternSchedule(config: StaffConfig, monthDates: string[], workShifts: WorkShift[]) {
  const primary = config.primaryShiftId;
  const secondary = config.secondaryShiftId || primary;
  const tertiary = config.tertiaryShiftId || secondary || primary;
  const primaryShift = workShifts.find((shift) => shift.id === primary);
  const primaryIncludesWeekend = shiftIncludesWeekend(primaryShift);
  const customSequence = normalizeCustomPatternSequence(config.customPatternSequence || [], workShifts);
  const weeklyTemplateWeeks = normalizeWeeklyTemplateWeeks(config.weeklyTemplateWeeks || [], [
    ...new Set(
      (config.weeklyTemplateWeeks || [])
        .map((week) => week.shiftId)
        .concat([primary, secondary, tertiary])
        .filter(Boolean)
    ),
  ]);
  const fallbackCustomSequence =
    customSequence.length > 0
      ? customSequence
      : buildDefaultCustomPatternSequence([primary, secondary, tertiary]);
  const weeklyTemplateAnchor = buildWeeklyTemplateAnchor(monthDates);

  const baseRow = monthDates.map((date, dateIndex) => {
    const dayOfWeek = new Date(`${date}T00:00:00`).getDay();

    switch (config.pattern) {
      case '상근':
        return primaryIncludesWeekend || (dayOfWeek !== 0 && dayOfWeek !== 6) ? primary : OFF_SHIFT_TOKEN;
      case '2교대': {
        const sequence = [primary, secondary, OFF_SHIFT_TOKEN, OFF_SHIFT_TOKEN];
        return sequence[(dateIndex + config.startOffset) % sequence.length];
      }
      case '3교대': {
        const sequence = [primary, secondary, tertiary, OFF_SHIFT_TOKEN];
        return sequence[(dateIndex + config.startOffset) % sequence.length];
      }
      case '2일근무1일휴무': {
        const sequence = [primary, secondary || primary, OFF_SHIFT_TOKEN];
        return sequence[(dateIndex + config.startOffset) % sequence.length];
      }
      case '1일근무1일휴무': {
        const sequence = [primary, OFF_SHIFT_TOKEN];
        return sequence[(dateIndex + config.startOffset) % sequence.length];
      }
      case '야간전담': {
        const nightShift = tertiary || secondary || primary;
        const sequence = [nightShift, nightShift, OFF_SHIFT_TOKEN, OFF_SHIFT_TOKEN];
        return sequence[(dateIndex + config.startOffset) % sequence.length];
      }
      case CUSTOM_PATTERN_VALUE: {
        if (fallbackCustomSequence.length === 0) return OFF_SHIFT_TOKEN;
        return fallbackCustomSequence[(dateIndex + config.startOffset) % fallbackCustomSequence.length];
      }
      case WEEKLY_TEMPLATE_PATTERN_VALUE: {
        if (weeklyTemplateWeeks.length === 0) return OFF_SHIFT_TOKEN;
        const weekIndex = resolveWeeklyTemplateWeekIndex(date, weeklyTemplateAnchor, weeklyTemplateWeeks.length);
        const weekConfig = weeklyTemplateWeeks[weekIndex];
        if (!weekConfig?.shiftId || !weekConfig.activeWeekdays.includes(dayOfWeek)) {
          return OFF_SHIFT_TOKEN;
        }
        return weekConfig.shiftId;
      }
      default:
        return primaryIncludesWeekend || (dayOfWeek !== 0 && dayOfWeek !== 6) ? primary : OFF_SHIFT_TOKEN;
    }
  });

  if (!isNightPattern(config.pattern)) return baseRow;

  const days = monthDates.length;
  const nightShiftId = tertiary || secondary || primary;
  if (!nightShiftId) return baseRow;

  const desiredNightCount = clampNightShiftCount(
    Number.isFinite(config.nightShiftCount) ? config.nightShiftCount : inferDefaultNightShiftCount(config.pattern, days),
    days
  );
  const fallbackShiftId =
    config.pattern === '야간전담'
      ? OFF_SHIFT_TOKEN
      : [secondary, primary, OFF_SHIFT_TOKEN].find((shiftId) => shiftId && shiftId !== nightShiftId) || OFF_SHIFT_TOKEN;
  const baseNightDays = Array.from({ length: days }, (_, index) => index + 1).filter(
    (day) => baseRow[day - 1] === nightShiftId
  );
  const desiredNightDays = new Set<number>();
  const baseKeepCount = Math.min(desiredNightCount, baseNightDays.length);

  selectDistributedDays({
    candidateDays: baseNightDays,
    days,
    targetCount: baseKeepCount,
    seed: config.startOffset,
  }).forEach((day) => {
    desiredNightDays.add(day);
  });

  if (desiredNightDays.size < desiredNightCount) {
    const remaining = desiredNightCount - desiredNightDays.size;
    const allDays = Array.from({ length: days }, (_, index) => index + 1);
    const preferredCandidates =
      config.pattern === '야간전담'
        ? allDays.filter((day) => !desiredNightDays.has(day) && baseRow[day - 1] === OFF_SHIFT_TOKEN)
        : allDays.filter(
          (day) =>
            !desiredNightDays.has(day) &&
            baseRow[day - 1] !== OFF_SHIFT_TOKEN &&
            baseRow[day - 1] !== nightShiftId
        );

    selectDistributedDays({
      candidateDays: preferredCandidates,
      days,
      targetCount: Math.min(remaining, preferredCandidates.length),
      seed: config.startOffset + 1,
    }).forEach((day) => {
      desiredNightDays.add(day);
    });

    if (desiredNightDays.size < desiredNightCount) {
      const fallbackCandidates = allDays.filter((day) => !desiredNightDays.has(day));
      selectDistributedDays({
        candidateDays: fallbackCandidates,
        days,
        targetCount: desiredNightCount - desiredNightDays.size,
        seed: config.startOffset + 2,
      }).forEach((day) => {
        desiredNightDays.add(day);
      });
    }
  }

  return baseRow.map((shiftId, index) => {
    const day = index + 1;
    if (desiredNightDays.has(day)) return nightShiftId;
    if (shiftId === nightShiftId) return fallbackShiftId;
    return shiftId;
  });
}

function getShiftCode(name: string) {
  const normalized = normalizeShiftName(name);
  if (!normalized || normalized.includes('미지정')) return '?';
  if (normalized.includes('휴무') || normalized.includes('off') || normalized.includes('비번') || normalized.includes('오프')) return 'OFF';
  if (normalized.includes('휴가') || normalized.includes('연차')) return '휴';
  if (normalized.includes('데이') || normalized.includes('day') || normalized.includes('주간') || normalized.includes('상근') || /(?:^|[^a-z])d$/.test(normalized)) return 'D';
  if (normalized.includes('이브') || normalized.includes('evening') || normalized.includes('eve') || /(?:^|[^a-z])e$/.test(normalized)) return 'E';
  if (normalized.includes('나이트') || normalized.includes('night') || normalized.includes('야간') || /(?:^|[^a-z])n$/.test(normalized)) return 'N';
  return name.slice(0, 2);
}

function getShiftBadgeClass(name: string) {
  const normalized = normalizeShiftName(name);
  if (normalized.includes('휴무') || normalized.includes('off') || normalized.includes('비번') || normalized.includes('오프')) {
    return 'bg-zinc-100 text-zinc-500 border-zinc-200';
  }
  if (normalized.includes('휴가') || normalized.includes('연차')) {
    return 'bg-green-50 text-green-700 border-green-200';
  }
  if (normalized.includes('데이') || normalized.includes('day') || normalized.includes('주간') || normalized.includes('상근') || /(?:^|[^a-z])d$/.test(normalized)) {
    return 'bg-blue-50 text-blue-700 border-blue-200';
  }
  if (normalized.includes('이브') || normalized.includes('evening') || normalized.includes('eve') || /(?:^|[^a-z])e$/.test(normalized)) {
    return 'bg-orange-50 text-orange-700 border-orange-200';
  }
  if (normalized.includes('나이트') || normalized.includes('night') || normalized.includes('야간') || /(?:^|[^a-z])n$/.test(normalized)) {
    return 'bg-purple-50 text-purple-700 border-purple-200';
  }
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

function buildAssignmentKey(staffId: string, date: string) {
  return `${staffId}::${date}`;
}

function formatShiftHours(shift: WorkShift) {
  if (!shift.start_time || !shift.end_time) return '시간 미지정';
  return `${String(shift.start_time).slice(0, 5)} - ${String(shift.end_time).slice(0, 5)}`;
}

export default function AutoRosterPlanner({
  user,
  staffs = [],
  selectedCo = '전체',
  panelMode = 'planner',
}: {
  user?: any;
  staffs?: any[];
  selectedCo?: string;
  panelMode?: 'planner' | 'patterns' | 'rules';
}) {
  const canAccess = isManagerOrHigher(user);
  const isAdmin = user?.role === 'admin' || user?.company === 'SY INC.' || user?.permissions?.mso === true;
  const ownDepartment = getDepartmentName(user);
  const activeStaffs = useMemo(() => staffs.filter((staff: any) => staff?.status !== '퇴사'), [staffs]);
  const companyOptions = useMemo(
    () => Array.from(new Set(activeStaffs.map((staff: any) => staff.company).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko')),
    [activeStaffs]
  );

  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [workShifts, setWorkShifts] = useState<WorkShift[]>([]);
  const [staffConfigs, setStaffConfigs] = useState<Record<string, StaffConfig>>({});
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [plannerPattern, setPlannerPattern] = useState(CUSTOM_PATTERN_VALUE);
  const [plannerPrimaryShiftId, setPlannerPrimaryShiftId] = useState('');
  const [plannerSecondaryShiftId, setPlannerSecondaryShiftId] = useState('');
  const [plannerTertiaryShiftId, setPlannerTertiaryShiftId] = useState('');
  const [plannerStartOffset, setPlannerStartOffset] = useState(0);
  const [plannerNightShiftCount, setPlannerNightShiftCount] = useState(0);
  const [plannerCustomPatternSequence, setPlannerCustomPatternSequence] = useState<string[]>([]);
  const [plannerWeeklyTemplateWeeks, setPlannerWeeklyTemplateWeeks] = useState<WeeklyTemplateWeek[]>([]);
  const [manualEditMode, setManualEditMode] = useState(false);
  const [manualAssignments, setManualAssignments] = useState<ManualAssignmentMap>({});
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [wizardSelectedStaffIds, setWizardSelectedStaffIds] = useState<string[]>([]);
  const [wizardPattern, setWizardPattern] = useState('');
  const [wizardShiftIds, setWizardShiftIds] = useState<string[]>([]);
  const [wizardStartOffset, setWizardStartOffset] = useState(0);
  const [wizardNightShiftCount, setWizardNightShiftCount] = useState(0);
  const [wizardCustomPatternSequence, setWizardCustomPatternSequence] = useState<string[]>([]);
  const [wizardWeeklyTemplateWeeks, setWizardWeeklyTemplateWeeks] = useState<WeeklyTemplateWeek[]>([]);
  const [plannerPresetName, setPlannerPresetName] = useState('');
  const [savedWizardPresets, setSavedWizardPresets] = useState<RosterWizardPreset[]>([]);
  const [savedPatternProfiles, setSavedPatternProfiles] = useState<RosterPatternProfile[]>(
    () => readCachedPatternProfiles()
  );
  const [savedGenerationRules, setSavedGenerationRules] = useState<RosterGenerationRule[]>(
    () => readCachedGenerationRules()
  );
  const [patternDraft, setPatternDraft] = useState<RosterPatternProfile>(() =>
    buildDefaultPatternProfile(selectedCo !== '전체' ? selectedCo : user?.company || '')
  );
  const [generationRuleDraft, setGenerationRuleDraft] = useState<RosterGenerationRule>(() =>
    buildDefaultGenerationRule(selectedCo !== '전체' ? selectedCo : user?.company || '')
  );
  const [selectedPatternProfileId, setSelectedPatternProfileId] = useState('');
  const [selectedGenerationRuleId, setSelectedGenerationRuleId] = useState('');
  const [wizardSelectedPresetId, setWizardSelectedPresetId] = useState('');
  const [wizardOffOverrides, setWizardOffOverrides] = useState<Record<string, WizardOffOverride>>({});
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiSummary, setGeminiSummary] = useState('');
  const [geminiAppliedAt, setGeminiAppliedAt] = useState('');
  const [aiRecommendation, setAiRecommendation] = useState<GeminiRosterRecommendation | null>(null);
  const [leaveAppliedSummary, setLeaveAppliedSummary] = useState('');
  const [preferredOffSelections, setPreferredOffSelections] = useState<PreferredOffSelectionMap>({});
  const [preferredOffStaffId, setPreferredOffStaffId] = useState('');
  const [preferredOffDate, setPreferredOffDate] = useState('');
  const [selectedAiShiftIds, setSelectedAiShiftIds] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(ROSTER_WIZARD_PRESET_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      setSavedWizardPresets(
        parsed
          .map((preset) => normalizePresetRecord(preset))
          .filter((preset): preset is RosterWizardPreset => preset !== null)
      );
    } catch (error) {
      console.error('근무표 프리셋 로드 실패:', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(ROSTER_PATTERN_PROFILE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const normalizedProfiles = parsed
        .map((profile) => normalizePatternProfile(profile))
        .filter((profile): profile is RosterPatternProfile => profile !== null);
      setSavedPatternProfiles(normalizedProfiles);
      writeCachedPatternProfiles(normalizedProfiles);
    } catch (error) {
      console.error('교대방식 패턴 로드 실패:', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(ROSTER_GENERATION_RULE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const normalizedRules = parsed
        .map((rule) => normalizeGenerationRule(rule))
        .filter((rule): rule is RosterGenerationRule => rule !== null);
      setSavedGenerationRules(normalizedRules);
      writeCachedGenerationRules(normalizedRules);
    } catch (error) {
      console.error('근무규칙 로드 실패:', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        ROSTER_WIZARD_PRESET_STORAGE_KEY,
        JSON.stringify(savedWizardPresets)
      );
    } catch (error) {
      console.error('근무표 프리셋 저장 실패:', error);
    }
  }, [savedWizardPresets]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        ROSTER_PATTERN_PROFILE_STORAGE_KEY,
        JSON.stringify(savedPatternProfiles)
      );
      writeCachedPatternProfiles(savedPatternProfiles);
    } catch (error) {
      console.error('교대방식 패턴 저장 실패:', error);
    }
  }, [savedPatternProfiles]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        ROSTER_GENERATION_RULE_STORAGE_KEY,
        JSON.stringify(savedGenerationRules)
      );
      writeCachedGenerationRules(savedGenerationRules);
    } catch (error) {
      console.error('근무규칙 저장 실패:', error);
    }
  }, [savedGenerationRules]);

  useEffect(() => {
    if (!companyOptions.length) return;
    if (selectedCo !== '전체' && companyOptions.includes(selectedCo)) {
      setSelectedCompany(selectedCo);
      return;
    }
    if (!isAdmin) {
      setSelectedCompany(user?.company || companyOptions[0]);
      return;
    }
    if (!selectedCompany || !companyOptions.includes(selectedCompany)) {
      setSelectedCompany(user?.company && user.company !== 'SY INC.' ? user.company : companyOptions[0]);
    }
  }, [companyOptions, isAdmin, selectedCo, selectedCompany, user?.company]);

  const departmentOptions = useMemo(() => {
    if (!selectedCompany) return [];
    const list = Array.from(
      new Set(
        activeStaffs
          .filter((staff: any) => staff.company === selectedCompany)
          .map((staff: any) => getDepartmentName(staff))
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, 'ko'));

    if (!isAdmin) {
      return list;
    }
    return ['전체 부서', ...list];
  }, [activeStaffs, isAdmin, ownDepartment, selectedCompany]);

  useEffect(() => {
    if (!departmentOptions.length) return;
    const defaultDepartment = departmentOptions.includes(ownDepartment)
      ? ownDepartment
      : departmentOptions.find((department) => department !== '전체 부서') || departmentOptions[0];
    if (!selectedDepartment || !departmentOptions.includes(selectedDepartment) || selectedDepartment === '전체 부서') {
      setSelectedDepartment(defaultDepartment);
    }
  }, [departmentOptions, ownDepartment, selectedDepartment]);

  useEffect(() => {
    if (!selectedCompany) {
      setWorkShifts([]);
      return;
    }

    const loadWorkShifts = async () => {
      setLoadingShifts(true);
      try {
        const { data, error } = await withMissingColumnsFallback(
          (omittedColumns) => {
            const columns = [
              'id',
              'name',
              'start_time',
              'end_time',
              'description',
              'shift_type',
              'company_name',
              'weekly_work_days',
              'is_weekend_work',
            ].filter((column) => !omittedColumns.has(column));

            return supabase
              .from('work_shifts')
              .select(columns.join(', '))
              .eq('company_name', selectedCompany)
              .eq('is_active', true)
              .order('start_time', { ascending: true });
          },
          ['weekly_work_days', 'is_weekend_work', 'description']
        );

        if (error) throw error;
        setWorkShifts((data || []).map((shift: any) => ({
          ...shift,
          weekly_work_days: shift?.weekly_work_days ?? null,
          is_weekend_work: shift?.is_weekend_work ?? null,
          description: shift?.description ?? '',
        })));
      } catch (error) {
        console.error('근무형태 로드 실패:', error);
        setWorkShifts([]);
      } finally {
        setLoadingShifts(false);
      }
    };

    loadWorkShifts();
  }, [selectedCompany]);

  const offShift = useMemo(
    () => workShifts.find((shift) => ['휴무', 'off', '비번', '오프'].some((keyword) => normalizeShiftName(shift.name).includes(keyword))),
    [workShifts]
  );

  const workingShifts = useMemo(
    () => workShifts.filter((shift) => shift.id !== offShift?.id),
    [offShift?.id, workShifts]
  );

  const defaultShiftOrder = useMemo(() => buildDefaultShiftOrder(workingShifts), [workingShifts]);
  const companyPatternProfiles = useMemo(
    () =>
      savedPatternProfiles.filter(
        (profile) => !profile.companyName || !selectedCompany || profile.companyName === selectedCompany
      ),
    [savedPatternProfiles, selectedCompany]
  );
  const companyGenerationRules = useMemo(
    () =>
      savedGenerationRules.filter(
        (rule) => !rule.companyName || !selectedCompany || rule.companyName === selectedCompany
      ),
    [savedGenerationRules, selectedCompany]
  );
  const matchingPatternProfiles = useMemo(
    () =>
      companyPatternProfiles.filter((profile) =>
        matchPatternProfileForDepartment(profile, selectedDepartment, selectedCompany)
      ),
    [companyPatternProfiles, selectedDepartment, selectedCompany]
  );
  const matchingGenerationRules = useMemo(
    () =>
      companyGenerationRules.filter((rule) =>
        matchGenerationRuleForDepartment(rule, selectedDepartment, selectedCompany)
      ),
    [companyGenerationRules, selectedDepartment, selectedCompany]
  );
  const selectedPatternProfile = useMemo(
    () =>
      matchingPatternProfiles.find((profile) => profile.id === selectedPatternProfileId) ||
      companyPatternProfiles.find((profile) => profile.id === selectedPatternProfileId) ||
      null,
    [companyPatternProfiles, matchingPatternProfiles, selectedPatternProfileId]
  );
  const selectedGenerationRule = useMemo(
    () =>
      matchingGenerationRules.find((rule) => rule.id === selectedGenerationRuleId) ||
      companyGenerationRules.find((rule) => rule.id === selectedGenerationRuleId) ||
      null,
    [companyGenerationRules, matchingGenerationRules, selectedGenerationRuleId]
  );
  const patternRecommendedShiftIds = useMemo(() => {
    if (!selectedPatternProfile) return [];
    const validShiftIds = new Set(workingShifts.map((shift) => shift.id));
    return getPatternProfileShiftIds(selectedPatternProfile).filter((shiftId) => validShiftIds.has(shiftId));
  }, [selectedPatternProfile, workingShifts]);
  const teamRecommendationCategory = useMemo(
    () => getTeamRecommendationCategory(selectedDepartment),
    [selectedDepartment]
  );
  const defaultPlannerMode = useMemo(
    () => getDefaultPlannerMode(teamRecommendationCategory),
    [teamRecommendationCategory]
  );
  const usesStrictTeamRecommendation = teamRecommendationCategory !== 'general' || Boolean(selectedPatternProfile);
  const recommendedAiShiftIds = useMemo(
    () =>
      patternRecommendedShiftIds.length > 0
        ? patternRecommendedShiftIds
        : recommendShiftIdsForTeam(selectedDepartment, workingShifts),
    [patternRecommendedShiftIds, selectedDepartment, workingShifts]
  );
  const recommendedAiShifts = useMemo(() => {
    if (recommendedAiShiftIds.length === 0) {
      return usesStrictTeamRecommendation ? [] : workingShifts;
    }
    const recommendedIdSet = new Set(recommendedAiShiftIds);
    return workingShifts.filter((shift) => recommendedIdSet.has(shift.id));
  }, [recommendedAiShiftIds, usesStrictTeamRecommendation, workingShifts]);
  const monthDates = useMemo(() => getMonthDates(selectedMonth), [selectedMonth]);
  const monthDateSet = useMemo(() => new Set(monthDates), [monthDates]);
  const preferredOffStorageKey = useMemo(
    () => buildPreferredOffStorageKey(selectedCompany, selectedDepartment, selectedMonth),
    [selectedCompany, selectedDepartment, selectedMonth]
  );
  const companyLockedByHrFilter = selectedCo !== '전체';
  const teamOptions = useMemo(
    () => departmentOptions.filter((department) => department !== '전체 부서'),
    [departmentOptions]
  );

  useEffect(() => {
    if (matchingPatternProfiles.length === 0) {
      setSelectedPatternProfileId('');
      return;
    }

    if (selectedPatternProfileId && matchingPatternProfiles.some((profile) => profile.id === selectedPatternProfileId)) {
      return;
    }

    setSelectedPatternProfileId(matchingPatternProfiles[0].id);
  }, [matchingPatternProfiles, selectedPatternProfileId]);

  useEffect(() => {
    if (matchingGenerationRules.length === 0) {
      setSelectedGenerationRuleId('');
      return;
    }

    if (
      selectedGenerationRuleId &&
      matchingGenerationRules.some((rule) => rule.id === selectedGenerationRuleId)
    ) {
      return;
    }

    setSelectedGenerationRuleId(matchingGenerationRules[0].id);
  }, [matchingGenerationRules, selectedGenerationRuleId]);

  useEffect(() => {
    setManualAssignments({});
    setManualEditMode(false);
    setGeminiSummary('');
    setGeminiAppliedAt('');
    setAiRecommendation(null);
    setLeaveAppliedSummary('');
  }, [selectedMonth, selectedCompany, selectedDepartment]);

  useEffect(() => {
    if (!monthDates.length) {
      setPreferredOffDate('');
      return;
    }

    setPreferredOffDate((prev) => (monthDates.includes(prev) ? prev : monthDates[0]));
  }, [monthDates]);

  useEffect(() => {
    if (workingShifts.length === 0) {
      setSelectedAiShiftIds([]);
      return;
    }

    setSelectedAiShiftIds((prev) => {
      const recommendedBaseIds =
        recommendedAiShiftIds.length > 0
          ? recommendedAiShiftIds
          : usesStrictTeamRecommendation
            ? []
            : workingShifts.map((shift) => shift.id);
      const validShiftIds = new Set(recommendedBaseIds);
      const filtered = prev.filter((shiftId) => validShiftIds.has(shiftId));
      if (filtered.length > 0) return filtered;
      return recommendedBaseIds;
    });
  }, [recommendedAiShiftIds, usesStrictTeamRecommendation, workingShifts]);

  const targetStaffs = useMemo(() => {
    return activeStaffs.filter((staff: any) => {
      if (selectedCompany && staff.company !== selectedCompany) return false;
      if (selectedDepartment && selectedDepartment !== '전체 부서') {
        return getDepartmentName(staff) === selectedDepartment;
      }
      return true;
    });
  }, [activeStaffs, selectedCompany, selectedDepartment]);

  useEffect(() => {
    if (targetStaffs.length === 0) {
      setPreferredOffStaffId('');
      return;
    }

    setPreferredOffStaffId((prev) =>
      targetStaffs.some((staff: any) => String(staff.id) === prev) ? prev : String(targetStaffs[0].id)
    );
  }, [targetStaffs]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!selectedCompany || !selectedDepartment) {
      setPreferredOffSelections({});
      return;
    }

    try {
      const raw = window.localStorage.getItem(preferredOffStorageKey);
      if (!raw) {
        setPreferredOffSelections({});
        return;
      }

      const parsed = JSON.parse(raw);
      setPreferredOffSelections(normalizePreferredOffSelections(parsed, monthDateSet));
    } catch (error) {
      console.error('희망 OFF 로드 실패:', error);
      setPreferredOffSelections({});
    }
  }, [monthDateSet, preferredOffStorageKey, selectedCompany, selectedDepartment]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!selectedCompany || !selectedDepartment) return;

    try {
      const normalized = normalizePreferredOffSelections(preferredOffSelections, monthDateSet);
      if (Object.keys(normalized).length === 0) {
        window.localStorage.removeItem(preferredOffStorageKey);
        return;
      }

      window.localStorage.setItem(preferredOffStorageKey, JSON.stringify(normalized));
    } catch (error) {
      console.error('희망 OFF 저장 실패:', error);
    }
  }, [monthDateSet, preferredOffSelections, preferredOffStorageKey, selectedCompany, selectedDepartment]);
  const effectivePlannerPattern = plannerPattern;
  const plannerShiftIds = useMemo(
    () =>
      [plannerPrimaryShiftId, plannerSecondaryShiftId, plannerTertiaryShiftId]
        .filter(Boolean)
        .filter((shiftId, index, list) => list.indexOf(shiftId) === index),
    [plannerPrimaryShiftId, plannerSecondaryShiftId, plannerTertiaryShiftId]
  );
  const effectivePlannerCustomPatternSequence = useMemo(
    () =>
      isCustomPattern(effectivePlannerPattern)
        ? normalizeCustomPatternSequence(plannerCustomPatternSequence, workingShifts)
        : [],
    [effectivePlannerPattern, plannerCustomPatternSequence, workingShifts]
  );
  const effectivePlannerWeeklyTemplateWeeks = useMemo(
    () =>
      isWeeklyTemplatePattern(effectivePlannerPattern)
        ? normalizeWeeklyTemplateWeeks(plannerWeeklyTemplateWeeks, [
            ...new Set(
              plannerWeeklyTemplateWeeks
                .map((week) => week.shiftId)
                .concat(plannerShiftIds)
                .filter(Boolean)
            ),
          ])
        : [],
    [effectivePlannerPattern, plannerShiftIds, plannerWeeklyTemplateWeeks]
  );

  useEffect(() => {
    if (!workingShifts.length) return;
    const validShiftIds = new Set(workingShifts.map((shift) => shift.id));
    const fallbackPrimary = defaultShiftOrder[0]?.id || workingShifts[0]?.id || '';
    const fallbackSecondary = defaultShiftOrder[1]?.id || fallbackPrimary;
    const fallbackTertiary = defaultShiftOrder[2]?.id || fallbackSecondary || fallbackPrimary;

    setPlannerPrimaryShiftId((prev) => (!prev || !validShiftIds.has(prev) ? fallbackPrimary : prev));
    setPlannerSecondaryShiftId((prev) => (!prev || !validShiftIds.has(prev) ? fallbackSecondary : prev));
    setPlannerTertiaryShiftId((prev) => (!prev || !validShiftIds.has(prev) ? fallbackTertiary : prev));
  }, [defaultShiftOrder, workingShifts]);

  useEffect(() => {
    if (!targetStaffs.length || !workingShifts.length) return;
    const validShiftIds = new Set(workingShifts.map((shift) => shift.id));
    const fallbackPrimary = defaultShiftOrder[0]?.id || workingShifts[0]?.id || '';
    const fallbackSecondary = defaultShiftOrder[1]?.id || fallbackPrimary;
    const fallbackTertiary = defaultShiftOrder[2]?.id || fallbackSecondary || fallbackPrimary;

    setStaffConfigs((prev) => {
      const next: Record<string, StaffConfig> = {};
      targetStaffs.forEach((staff: any, index: number) => {
        const current = prev[staff.id];
        const baseConfig =
          current || buildInitialConfig(staff, index, defaultShiftOrder.length ? defaultShiftOrder : workingShifts, monthDates.length);
        const nextPattern = baseConfig.pattern || inferPattern(staff, workingShifts);
        const nextPrimaryShiftId = validShiftIds.has(baseConfig.primaryShiftId) ? baseConfig.primaryShiftId : fallbackPrimary;
        const nextSecondaryShiftId = validShiftIds.has(baseConfig.secondaryShiftId) ? baseConfig.secondaryShiftId : fallbackSecondary;
        const nextTertiaryShiftId = validShiftIds.has(baseConfig.tertiaryShiftId) ? baseConfig.tertiaryShiftId : fallbackTertiary;
        const nextWeeklyTemplateWeeks = normalizeWeeklyTemplateWeeks(
          baseConfig.weeklyTemplateWeeks || [],
          [
            ...new Set(
              (baseConfig.weeklyTemplateWeeks || [])
                .map((week) => week.shiftId)
                .concat([nextPrimaryShiftId, nextSecondaryShiftId, nextTertiaryShiftId])
                .filter(Boolean)
            ),
          ],
          baseConfig.weeklyTemplateWeeks?.length || 1
        );
        next[staff.id] = current
          ? {
              ...baseConfig,
              pattern: nextPattern,
              primaryShiftId: nextPrimaryShiftId,
              secondaryShiftId: nextSecondaryShiftId,
              tertiaryShiftId: nextTertiaryShiftId,
              nightShiftCount: isNightPattern(nextPattern)
                ? clampNightShiftCount(
                    Number.isFinite(baseConfig.nightShiftCount)
                      ? baseConfig.nightShiftCount
                      : inferDefaultNightShiftCount(nextPattern, monthDates.length),
                    monthDates.length
                  )
                : 0,
              customPatternSequence: normalizeCustomPatternSequence(baseConfig.customPatternSequence || [], workingShifts),
              weeklyTemplateWeeks: nextWeeklyTemplateWeeks,
            }
          : {
              ...baseConfig,
              pattern: nextPattern,
              primaryShiftId: nextPrimaryShiftId,
              secondaryShiftId: nextSecondaryShiftId,
              tertiaryShiftId: nextTertiaryShiftId,
              nightShiftCount: isNightPattern(nextPattern)
                ? clampNightShiftCount(
                    Number.isFinite(baseConfig.nightShiftCount)
                      ? baseConfig.nightShiftCount
                      : inferDefaultNightShiftCount(nextPattern, monthDates.length),
                    monthDates.length
                  )
                : 0,
              customPatternSequence: normalizeCustomPatternSequence(baseConfig.customPatternSequence || [], workingShifts),
              weeklyTemplateWeeks: nextWeeklyTemplateWeeks,
            };
      });
      return next;
    });
  }, [defaultShiftOrder, monthDates.length, targetStaffs, workingShifts]);

  useEffect(() => {
    if (!isNightPattern(effectivePlannerPattern)) {
      setPlannerNightShiftCount(0);
      return;
    }

    setPlannerNightShiftCount((prev) => {
      return clampNightShiftCount(prev, monthDates.length);
    });
  }, [effectivePlannerPattern, monthDates.length]);

  useEffect(() => {
    if (!workingShifts.length) return;
    if (!isCustomPattern(effectivePlannerPattern)) {
      setPlannerCustomPatternSequence([]);
      return;
    }

    setPlannerCustomPatternSequence((prev) => {
      const normalized = normalizeCustomPatternSequence(prev, workingShifts).filter(
        (token) => token === OFF_SHIFT_TOKEN || plannerShiftIds.includes(token)
      );
      if (normalized.length > 0) return normalized;
      return buildDefaultCustomPatternSequence(plannerShiftIds);
    });
  }, [effectivePlannerPattern, plannerShiftIds, workingShifts]);

  useEffect(() => {
    if (!workingShifts.length) return;
    if (!isWeeklyTemplatePattern(effectivePlannerPattern)) {
      setPlannerWeeklyTemplateWeeks([]);
      return;
    }

    setPlannerWeeklyTemplateWeeks((prev) =>
      normalizeWeeklyTemplateWeeks(prev, plannerShiftIds, prev.length || 1)
    );
  }, [effectivePlannerPattern, plannerShiftIds, workingShifts.length]);

  const wizardRequiredShiftCount = getRequiredShiftCount(wizardPattern);
  const wizardUsesCustomPattern = isCustomPattern(wizardPattern);
  const wizardUsesWeeklyTemplate = isWeeklyTemplatePattern(wizardPattern);
  const orderedWizardShiftIds = useMemo(
    () => workingShifts.filter((shift) => wizardShiftIds.includes(shift.id)).map((shift) => shift.id),
    [wizardShiftIds, workingShifts]
  );
  const effectiveWizardCustomPatternSequence = useMemo(
    () =>
      wizardUsesCustomPattern
        ? normalizeCustomPatternSequence(wizardCustomPatternSequence, workShifts)
        : [],
    [wizardCustomPatternSequence, wizardUsesCustomPattern, workShifts]
  );
  const effectiveWizardWeeklyTemplateWeeks = useMemo(
    () =>
      wizardUsesWeeklyTemplate
        ? normalizeWeeklyTemplateWeeks(
            wizardWeeklyTemplateWeeks,
            [
              ...new Set(
                wizardWeeklyTemplateWeeks
                  .map((week) => week.shiftId)
                  .concat(orderedWizardShiftIds)
                  .filter(Boolean)
              ),
            ],
            wizardWeeklyTemplateWeeks.length || 1
          )
        : [],
    [orderedWizardShiftIds, wizardUsesWeeklyTemplate, wizardWeeklyTemplateWeeks]
  );
  const userWizardPresets = useMemo(() => {
    const seen = new Set<string>();
    return savedWizardPresets
      .map((preset) => normalizePresetRecord(preset))
      .filter((preset): preset is RosterWizardPreset => preset !== null)
      .filter(
        (preset) =>
          isCustomPattern(preset.pattern) || isWeeklyTemplatePattern(preset.pattern)
      )
      .filter((preset) => {
        if (seen.has(preset.id)) return false;
        seen.add(preset.id);
        return true;
      });
  }, [savedWizardPresets]);
  const selectedWizardPreset = useMemo(
    () => userWizardPresets.find((preset) => preset.id === wizardSelectedPresetId) || null,
    [userWizardPresets, wizardSelectedPresetId]
  );
  const wizardSelectedStaffs = useMemo(
    () => targetStaffs.filter((staff: any) => wizardSelectedStaffIds.includes(String(staff.id))),
    [targetStaffs, wizardSelectedStaffIds]
  );
  const wizardOverrideDateOptions = useMemo(() => monthDates.slice(0, -1), [monthDates]);
  const wizardOverrideShiftOptions = useMemo(
    () =>
      orderedWizardShiftIds.length > 0
        ? workingShifts.filter((shift) => orderedWizardShiftIds.includes(shift.id))
        : defaultShiftOrder.length > 0
          ? defaultShiftOrder
          : workingShifts,
    [defaultShiftOrder, orderedWizardShiftIds, workingShifts]
  );

  useEffect(() => {
    if (!wizardOpen) return;
    const validStaffIds = new Set(targetStaffs.map((staff: any) => String(staff.id)));
    setWizardSelectedStaffIds((prev) => {
      const filtered = prev.filter((staffId) => validStaffIds.has(staffId));
      if (filtered.length > 0) return filtered;
      return targetStaffs.map((staff: any) => String(staff.id));
    });
  }, [targetStaffs, wizardOpen]);

  useEffect(() => {
    if (!wizardOpen || !wizardSelectedPresetId) return;

    setWizardShiftIds((prev) =>
      workingShifts.filter((shift) => prev.includes(shift.id)).map((shift) => shift.id)
    );
  }, [wizardOpen, wizardSelectedPresetId, workingShifts]);

  useEffect(() => {
    if (!wizardOpen || !wizardSelectedPresetId || !wizardUsesCustomPattern) return;

    setWizardCustomPatternSequence((prev) => {
      const normalized = normalizeCustomPatternSequence(prev, workShifts).filter(
        (token) => token === OFF_SHIFT_TOKEN || orderedWizardShiftIds.includes(token)
      );
      if (normalized.length > 0) return normalized;
      return buildDefaultCustomPatternSequence(orderedWizardShiftIds);
    });
  }, [orderedWizardShiftIds, wizardOpen, wizardSelectedPresetId, wizardUsesCustomPattern, workShifts]);

  useEffect(() => {
    if (!wizardOpen || !wizardSelectedPresetId) return;
    if (!wizardUsesWeeklyTemplate) {
      setWizardWeeklyTemplateWeeks([]);
      return;
    }

    setWizardWeeklyTemplateWeeks((prev) =>
      normalizeWeeklyTemplateWeeks(prev, orderedWizardShiftIds, prev.length || 1)
    );
  }, [orderedWizardShiftIds, wizardOpen, wizardSelectedPresetId, wizardUsesWeeklyTemplate]);

  useEffect(() => {
    if (!wizardOpen || !wizardSelectedPresetId) return;
    if (!isNightPattern(wizardPattern)) {
      setWizardNightShiftCount(0);
      return;
    }

    setWizardNightShiftCount((prev) => {
      return clampNightShiftCount(prev, monthDates.length);
    });
  }, [monthDates.length, wizardOpen, wizardPattern, wizardSelectedPresetId]);

  useEffect(() => {
    if (!wizardOpen) return;

    const defaultNextShiftId = wizardOverrideShiftOptions[0]?.id || '';
    const lastDateIndex = Math.max(wizardOverrideDateOptions.length - 1, 0);

    setWizardOffOverrides((prev) => {
      const next: Record<string, WizardOffOverride> = {};

      wizardSelectedStaffIds.forEach((staffId, index) => {
        const current = prev[staffId];
        const fallbackOffDate = wizardOverrideDateOptions[Math.min(index, lastDateIndex)] || '';
        const nextShiftId =
          current?.nextShiftId && wizardOverrideShiftOptions.some((shift) => shift.id === current.nextShiftId)
            ? current.nextShiftId
            : defaultNextShiftId;

        next[staffId] = {
          enabled: current?.enabled ?? false,
          offDate:
            current?.offDate && wizardOverrideDateOptions.includes(current.offDate)
              ? current.offDate
              : fallbackOffDate,
          nextShiftId,
        };
      });

      return next;
    });
  }, [wizardOpen, wizardOverrideDateOptions, wizardOverrideShiftOptions, wizardSelectedStaffIds]);

  const preferredOffEntries = useMemo(
    () =>
      targetStaffs
        .map((staff: any) => ({
          staff,
          dates: [...(preferredOffSelections[String(staff.id)] || [])].sort(),
        }))
        .filter((entry) => entry.dates.length > 0),
    [preferredOffSelections, targetStaffs]
  );
  const preferredOffCount = useMemo(
    () => preferredOffEntries.reduce((sum, entry) => sum + entry.dates.length, 0),
    [preferredOffEntries]
  );

  const addPreferredOffDate = () => {
    if (!preferredOffStaffId || !preferredOffDate) return;

    setPreferredOffSelections((prev) => {
      const nextDates = [...new Set([...(prev[preferredOffStaffId] || []), preferredOffDate])].sort();
      return {
        ...prev,
        [preferredOffStaffId]: nextDates,
      };
    });
  };

  const removePreferredOffDate = (staffId: string, date: string) => {
    setPreferredOffSelections((prev) => {
      const nextDates = (prev[staffId] || []).filter((item) => item !== date);
      if (nextDates.length === 0) {
        const { [staffId]: _removed, ...rest } = prev;
        return rest;
      }

      return {
        ...prev,
        [staffId]: nextDates,
      };
    });
  };

  const clearPreferredOffForStaff = (staffId: string) => {
    setPreferredOffSelections((prev) => {
      const { [staffId]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const clearAllPreferredOff = () => {
    setPreferredOffSelections({});
  };

  const setManualAssignment = ({
    staffId,
    date,
    nextShiftId,
    baseShiftId,
  }: {
    staffId: string;
    date: string;
    nextShiftId: string;
    baseShiftId: string;
  }) => {
    const assignmentKey = buildAssignmentKey(staffId, date);
    setManualAssignments((prev) => {
      if (nextShiftId === baseShiftId) {
        const { [assignmentKey]: _removed, ...rest } = prev;
        return rest;
      }

      return {
        ...prev,
        [assignmentKey]: nextShiftId,
      };
    });
  };

  const cycleManualAssignment = ({
    staffId,
    date,
    currentShiftId,
    baseShiftId,
  }: {
    staffId: string;
    date: string;
    currentShiftId: string;
    baseShiftId: string;
  }) => {
    const shiftSequence = [OFF_SHIFT_TOKEN, ...workingShifts.map((shift) => shift.id)];
    if (!shiftSequence.length) return;

    const currentIndex = Math.max(shiftSequence.findIndex((shiftId) => shiftId === currentShiftId), 0);
    const nextShiftId = shiftSequence[(currentIndex + 1) % shiftSequence.length];
    setManualAssignment({ staffId, date, nextShiftId, baseShiftId });
  };

  const previewRows = useMemo<PreviewRow[]>(() => {
    if (!aiRecommendation?.staffPlans?.length) return [];

    const validShiftIds = new Set(workingShifts.map((shift) => shift.id));
    const planByStaffId = new Map(
      aiRecommendation.staffPlans.map((plan) => [String(plan.staffId || ''), plan])
    );

    return targetStaffs
      .map((staff: any) => {
        const plan = planByStaffId.get(String(staff.id));
        if (!plan) return null;

        const baseSchedule = normalizeAiAssignments(plan.assignments, monthDates, validShiftIds);
        const config: StaffConfig = {
          enabled: true,
          pattern: plan.modeLabel || aiRecommendation.teamAnalysis?.workMode || '자동 생성',
          primaryShiftId: baseSchedule.find((shiftId) => shiftId !== OFF_SHIFT_TOKEN) || '',
          secondaryShiftId: '',
          tertiaryShiftId: '',
          startOffset: 0,
          nightShiftCount: 0,
          customPatternSequence: [],
          weeklyTemplateWeeks: [],
        };
        const cells = monthDates.map((date, index) => {
          const baseShiftId = baseSchedule[index] || OFF_SHIFT_TOKEN;
          const manualShiftId = manualAssignments[buildAssignmentKey(String(staff.id), date)];
          const shiftId = manualShiftId || baseShiftId;
          const shiftName = getShiftNameById(shiftId, workShifts);
          return {
            date,
            baseShiftId,
            shiftId,
            shiftName,
            code: getShiftCode(shiftName),
            badgeClass: getShiftBadgeClass(shiftName),
            isManual: Boolean(manualShiftId),
          };
        });

        return {
          staff,
          config,
          cells,
          counts: {
            work: cells.filter((cell) => cell.code !== 'OFF').length,
            off: cells.filter((cell) => cell.code === 'OFF').length,
            night: cells.filter((cell) => cell.code === 'N').length,
          },
        };
      })
      .filter((row): row is PreviewRow => Boolean(row));
  }, [aiRecommendation, manualAssignments, monthDates, targetStaffs, workShifts, workingShifts]);

  const summary = useMemo(() => {
    return {
      staffCount: targetStaffs.length,
      enabledCount: previewRows.length,
      shiftCount: workingShifts.length,
      manualCount: Object.keys(manualAssignments).length,
    };
  }, [manualAssignments, previewRows.length, targetStaffs.length, workingShifts.length]);

  const selectedAiShifts = useMemo(
    () => workingShifts.filter((shift) => selectedAiShiftIds.includes(shift.id)),
    [selectedAiShiftIds, workingShifts]
  );
  const plannerPatternPreviewGroups = useMemo<PlannerPatternPreviewGroup[]>(() => {
    if (targetStaffs.length === 0) return [];

    const groups = new Map<string, PlannerPatternPreviewGroup>();
    targetStaffs.forEach((staff: any) => {
      const resolvedGroup = resolvePlannerPatternGroup({
        staff,
        patternProfile: selectedPatternProfile,
        availableShifts: selectedAiShifts,
        allShifts: workShifts,
      });

      const previewGroup = resolvedGroup
        ? {
            key: resolvedGroup.key,
            label: resolvedGroup.label,
            mode: resolvedGroup.mode,
            source: resolvedGroup.source,
          }
        : {
            key: `default-${defaultPlannerMode}`,
            label:
              defaultPlannerMode === 'rotation'
                ? '\uC21C\uD658\uADFC\uBB34'
                : '\uAE30\uBCF8 \uACE0\uC815\uADFC\uBB34',
            mode: defaultPlannerMode,
            source: 'default' as const,
          };

      const existing = groups.get(previewGroup.key);
      if (existing) {
        existing.count += 1;
        return;
      }

      groups.set(previewGroup.key, {
        ...previewGroup,
        count: 1,
      });
    });

    return Array.from(groups.values());
  }, [defaultPlannerMode, selectedAiShifts, selectedPatternProfile, targetStaffs, workShifts]);

  const persistPatternProfiles = (nextProfiles: RosterPatternProfile[]) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        ROSTER_PATTERN_PROFILE_STORAGE_KEY,
        JSON.stringify(nextProfiles)
      );
      writeCachedPatternProfiles(nextProfiles);
    } catch (error) {
      console.error('교대방식 패턴 저장 실패:', error);
    }
  };

  const persistGenerationRules = (nextRules: RosterGenerationRule[]) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        ROSTER_GENERATION_RULE_STORAGE_KEY,
        JSON.stringify(nextRules)
      );
      writeCachedGenerationRules(nextRules);
    } catch (error) {
      console.error('근무규칙 저장 실패:', error);
    }
  };

  const resetPatternDraft = () => {
    setPatternDraft(buildDefaultPatternProfile(selectedCompany));
  };

  const resetGenerationRuleDraft = () => {
    setGenerationRuleDraft(buildDefaultGenerationRule(selectedCompany));
  };

  const updatePatternDraftField = (
    field: 'name' | 'description' | 'teamKeywords',
    value: string
  ) => {
    setPatternDraft((prev) => {
      if (field === 'teamKeywords') {
        return {
          ...prev,
          teamKeywords: value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
        };
      }

      return {
        ...prev,
        [field]: value,
      };
    });
  };

  const updateGenerationRuleDraftField = (
    field:
      | 'name'
      | 'description'
      | 'teamKeywords'
      | 'avoidDayAfterNight'
      | 'offDaysAfterNight'
      | 'nightBlockSize'
      | 'rotationNightCount'
      | 'maxConsecutiveWorkDays'
      | 'fixedShiftOnly'
      | 'balanceRotationBands'
      | 'distributeWeekendShifts'
      | 'minDayStaff'
      | 'minEveningStaff'
      | 'minNightStaff',
    value: string | number | boolean
  ) => {
    setGenerationRuleDraft((prev) => {
      if (field === 'teamKeywords') {
        return {
          ...prev,
          teamKeywords: String(value || '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
        };
      }

      if (
        field === 'offDaysAfterNight' ||
        field === 'nightBlockSize' ||
        field === 'rotationNightCount' ||
        field === 'maxConsecutiveWorkDays' ||
        field === 'minDayStaff' ||
        field === 'minEveningStaff' ||
        field === 'minNightStaff'
      ) {
        return {
          ...prev,
          [field]: Math.max(0, Math.floor(Number(value) || 0)),
        };
      }

      return {
        ...prev,
        [field]: value,
      };
    });
  };

  const updatePatternGroup = (
    groupId: string,
    patch: Partial<RosterPatternStaffGroup> & { matchKeywordsText?: string }
  ) => {
    setPatternDraft((prev) => ({
      ...prev,
      staffGroups: prev.staffGroups.map((group) => {
        if (group.id !== groupId) return group;

        return {
          ...group,
          ...patch,
          matchKeywords:
            patch.matchKeywordsText !== undefined
              ? patch.matchKeywordsText
                  .split(',')
                  .map((item) => item.trim())
                  .filter(Boolean)
              : patch.matchKeywords ?? group.matchKeywords,
        };
      }),
    }));
  };

  const togglePatternGroupShift = (groupId: string, shiftId: string) => {
    setPatternDraft((prev) => ({
      ...prev,
      staffGroups: prev.staffGroups.map((group) => {
        if (group.id !== groupId) return group;

        return {
          ...group,
          shiftIds: group.shiftIds.includes(shiftId)
            ? group.shiftIds.filter((currentId) => currentId !== shiftId)
            : [...group.shiftIds, shiftId],
        };
      }),
    }));
  };

  const addPatternGroup = () => {
    setPatternDraft((prev) => ({
      ...prev,
      staffGroups: [
        ...prev.staffGroups,
        {
          id: `group-${Date.now()}`,
          label: `그룹 ${prev.staffGroups.length + 1}`,
          mode: 'rotation',
          matchKeywords: [],
          shiftIds: [],
          note: '',
        },
      ],
    }));
  };

  const removePatternGroup = (groupId: string) => {
    setPatternDraft((prev) => ({
      ...prev,
      staffGroups: prev.staffGroups.filter((group) => group.id !== groupId),
    }));
  };

  const editPatternProfile = (profile: RosterPatternProfile) => {
    setPatternDraft({
      ...profile,
      teamKeywords: [...profile.teamKeywords],
      staffGroups: profile.staffGroups.map((group) => ({
        ...group,
        matchKeywords: [...group.matchKeywords],
        shiftIds: [...group.shiftIds],
      })),
    });
  };

  const savePatternProfile = () => {
    const nextName = patternDraft.name.trim();
    if (!nextName) {
      alert('패턴 이름을 입력하세요.');
      return;
    }

    if (patternDraft.teamKeywords.length === 0) {
      alert('적용할 팀 키워드를 한 개 이상 입력하세요.');
      return;
    }

    if (patternDraft.staffGroups.length === 0) {
      alert('직원 그룹을 한 개 이상 만들어 주세요.');
      return;
    }

    if (patternDraft.staffGroups.some((group) => group.shiftIds.length === 0)) {
      alert('각 그룹마다 연결할 근무유형을 한 개 이상 선택하세요.');
      return;
    }

    const nextProfile: RosterPatternProfile = {
      ...patternDraft,
      name: nextName,
      companyName: selectedCompany,
      description: patternDraft.description.trim(),
      updatedAt: new Date().toISOString(),
    };

    setSavedPatternProfiles((prev) => {
      const nextProfiles = [nextProfile, ...prev.filter((profile) => profile.id !== nextProfile.id)];
      persistPatternProfiles(nextProfiles);
      return nextProfiles;
    });
    setSelectedPatternProfileId(nextProfile.id);
    resetPatternDraft();
    alert(`"${nextName}" 교대방식 패턴을 저장했습니다.`);
  };

  const deletePatternProfile = (profileId: string) => {
    setSavedPatternProfiles((prev) => {
      const nextProfiles = prev.filter((profile) => profile.id !== profileId);
      persistPatternProfiles(nextProfiles);
      return nextProfiles;
    });
    if (selectedPatternProfileId === profileId) {
      setSelectedPatternProfileId('');
    }
    if (patternDraft.id === profileId) {
      resetPatternDraft();
    }
  };

  const editGenerationRule = (rule: RosterGenerationRule) => {
    setGenerationRuleDraft({
      ...rule,
      teamKeywords: [...rule.teamKeywords],
    });
  };

  const saveGenerationRule = () => {
    const nextName = generationRuleDraft.name.trim();
    if (!nextName) {
      alert('근무규칙 이름을 입력해 주세요.');
      return;
    }

    if (generationRuleDraft.teamKeywords.length === 0) {
      alert('적용할 팀 키워드를 한 개 이상 입력해 주세요.');
      return;
    }

    const nextRule: RosterGenerationRule = {
      ...generationRuleDraft,
      name: nextName,
      companyName: selectedCompany,
      description: generationRuleDraft.description.trim(),
      offDaysAfterNight: Math.max(0, Math.min(3, Math.floor(generationRuleDraft.offDaysAfterNight || 0))),
      nightBlockSize: Math.max(1, Math.min(3, Math.floor(generationRuleDraft.nightBlockSize || 1))),
      rotationNightCount: Math.max(0, Math.min(31, Math.floor(generationRuleDraft.rotationNightCount || 0))),
      maxConsecutiveWorkDays: Math.max(
        2,
        Math.min(7, Math.floor(generationRuleDraft.maxConsecutiveWorkDays || 5))
      ),
      minDayStaff: Math.max(0, Math.min(20, Math.floor(generationRuleDraft.minDayStaff || 0))),
      minEveningStaff: Math.max(0, Math.min(20, Math.floor(generationRuleDraft.minEveningStaff || 0))),
      minNightStaff: Math.max(0, Math.min(20, Math.floor(generationRuleDraft.minNightStaff || 0))),
      updatedAt: new Date().toISOString(),
    };

    setSavedGenerationRules((prev) => {
      const nextRules = [nextRule, ...prev.filter((rule) => rule.id !== nextRule.id)];
      persistGenerationRules(nextRules);
      return nextRules;
    });
    setSelectedGenerationRuleId(nextRule.id);
    resetGenerationRuleDraft();
    alert(`"${nextName}" 근무규칙을 저장했습니다.`);
  };

  const deleteGenerationRule = (ruleId: string) => {
    setSavedGenerationRules((prev) => {
      const nextRules = prev.filter((rule) => rule.id !== ruleId);
      persistGenerationRules(nextRules);
      return nextRules;
    });
    if (selectedGenerationRuleId === ruleId) {
      setSelectedGenerationRuleId('');
    }
    if (generationRuleDraft.id === ruleId) {
      resetGenerationRuleDraft();
    }
  };

  const requestGeminiRecommendation = async () => {
    if (!selectedCompany) {
      alert('사업체를 먼저 선택하세요.');
      return;
    }
    if (!selectedDepartment) {
      alert('팀을 먼저 선택하세요.');
      return;
    }
    if (workingShifts.length === 0) {
      alert('추천에 사용할 근무유형이 없습니다. 먼저 근무형태를 등록하세요.');
      return;
    }
    if (selectedAiShifts.length === 0) {
      alert('AI 생성에 사용할 근무유형을 한 개 이상 선택하세요.');
      return;
    }
    if (targetStaffs.length === 0) {
      alert('추천할 팀 직원이 없습니다.');
      return;
    }

    setGeminiLoading(true);
    setLeaveAppliedSummary('');
    try {
      const approvedLeaveRequestCount = 0;
      const approvedLeaveDayCount = 0;
      const response = await fetch('/api/ai/roster-recommendation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          selectedMonth,
          selectedCompany,
          selectedDepartment,
          monthDates,
          patternProfile: selectedPatternProfile
            ? {
                id: selectedPatternProfile.id,
                name: selectedPatternProfile.name,
                companyName: selectedPatternProfile.companyName,
                teamKeywords: selectedPatternProfile.teamKeywords,
                description: selectedPatternProfile.description,
                staffGroups: selectedPatternProfile.staffGroups,
              }
            : null,
          workShifts: selectedAiShifts.map((shift) => ({
            id: shift.id,
            name: shift.name,
            start_time: shift.start_time,
            end_time: shift.end_time,
            shift_type: shift.shift_type,
            description: shift.description,
            company_name: shift.company_name,
            weekly_work_days: shift.weekly_work_days,
            is_weekend_work: shift.is_weekend_work,
          })),
          staffs: targetStaffs.map((staff: any) => ({
            id: String(staff.id),
            name: String(staff.name || ''),
            employeeNo: String(staff.employee_no || ''),
            position: String(staff.position || ''),
            role: String(staff.role || ''),
            employmentType: String(staff.employment_type || ''),
            department: String(getDepartmentName(staff) || ''),
            assignedShiftId: String(staff.shift_id || ''),
            shiftType: String(staff.shift_type || ''),
            preferredOffDates: preferredOffSelections[String(staff.id)] || [],
          })),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Gemini 팀 추천 요청에 실패했습니다.');
      }

      const recommendation = payload as GeminiRosterRecommendation;
      const groupUsage = new Map<string, number>();
      const effectiveGenerationRule =
        selectedGenerationRule ||
        buildFallbackGenerationRuleForDepartment(selectedDepartment, selectedCompany, monthDates.length);

      if (!Array.isArray(recommendation.staffPlans) || recommendation.staffPlans.length === 0) {
        throw new Error('Gemini가 월간 근무표 초안을 돌려주지 않았습니다.');
      }

      if (!selectedPatternProfile && !recommendation.summary) {
        recommendation.summary = `${selectedDepartment} 팀 기준으로 월간 초안을 생성했습니다.`;
      }

      if (!selectedPatternProfile && groupUsage.size > 0) {
        recommendation.summary = `${selectedDepartment} 팀에 "${effectiveGenerationRule.name || '기본 근무규칙'}" 규칙을 적용해 월간 초안을 생성했습니다. 자동 감지 전담자: ${Array.from(groupUsage.entries())
          .map(([label, count]) => `${label} ${count}명`)
          .join(', ')}`;
      }

      setAiRecommendation(recommendation);
      setManualAssignments({});
      setManualEditMode(false);
      setGeminiSummary(
        recommendation.summary?.trim() || `${selectedDepartment} 팀 AI 근무표 초안을 적용했습니다.`
      );
      if (approvedLeaveDayCount > 0) {
        recommendation.summary = `${recommendation.summary} 승인 휴가 ${approvedLeaveRequestCount}건, ${approvedLeaveDayCount}일을 OFF로 반영했습니다.`;
      }
      setLeaveAppliedSummary(
        approvedLeaveDayCount > 0
          ? `승인 휴가 ${approvedLeaveRequestCount}건 · ${approvedLeaveDayCount}일 반영`
          : ''
      );
      if (approvedLeaveDayCount > 0) {
        setGeminiSummary(
          recommendation.summary?.trim() || `${selectedDepartment} ? ?⑦꽩 湲곕컲 珥덉븞???곸슜?섏뿀?듬땲??`
        );
      }
      setGeminiAppliedAt(new Date().toLocaleString('ko-KR'));
      alert('Gemini가 팀 특성을 분석해 월간 근무표 초안을 만들었습니다. 아래 미리보기에서 확인하세요.');
    } catch (error: any) {
      console.error('Gemini 팀 추천 실패:', error);
      alert(`Gemini 팀 추천 중 오류가 발생했습니다.\n${error?.message || '알 수 없는 오류'}`);
    } finally {
      setGeminiLoading(false);
    }
  };

  const generatePatternDraft = async () => {
    if (!selectedCompany) {
      alert('사업체를 먼저 선택하세요.');
      return;
    }
    if (!selectedDepartment) {
      alert('팀을 먼저 선택하세요.');
      return;
    }
    if (workingShifts.length === 0) {
      alert('생성에 사용할 근무유형이 없습니다. 먼저 근무형태를 등록하세요.');
      return;
    }
    if (selectedAiShifts.length === 0) {
      alert('자동 생성에 사용할 근무유형을 한 개 이상 선택하세요.');
      return;
    }
    if (targetStaffs.length === 0) {
      alert('생성할 대상 직원이 없습니다.');
      return;
    }

    setGeminiLoading(true);
    try {
      const shiftMap = new Map(selectedAiShifts.map((shift) => [shift.id, shift]));
      const monthDateSet = new Set(monthDates);
      const groupUsage = new Map<string, number>();
      const groupMemberIndexMap = new Map<string, number>();
      const groupSizeMap = new Map<string, number>();
      const weekendWorkCountsByGroup = new Map<string, number[]>();
      const rotationDailyBandCountsByGroup = new Map<
        string,
        Array<Record<'day' | 'evening' | 'night', number>>
      >();
      const effectiveGenerationRule =
        selectedGenerationRule ||
        buildFallbackGenerationRuleForDepartment(
          selectedDepartment,
          selectedCompany,
          monthDates.length
        );
      let approvedLeaveRequestCount = 0;
      let approvedLeaveDayCount = 0;
      let approvedLeaveBlockedDatesByStaff = new Map<string, Set<string>>();

      const targetStaffIds = targetStaffs
        .map((staff: any) => String(staff?.id || ''))
        .filter(Boolean);
      const targetStaffIdSet = new Set(targetStaffIds);

      if (targetStaffIds.length > 0 && monthDates.length > 0) {
        const { data: approvedLeaves, error: approvedLeavesError } = await supabase
          .from('leave_requests')
          .select('staff_id, start_date, end_date')
          .eq('status', '승인')
          .in('staff_id', targetStaffIds)
          .lte('start_date', monthDates[monthDates.length - 1])
          .gte('end_date', monthDates[0]);

        if (approvedLeavesError) {
          console.error('승인 휴가 반영 데이터 로드 실패:', approvedLeavesError);
        } else {
          approvedLeaveBlockedDatesByStaff = buildBlockedDatesByStaff(
            (approvedLeaves || []) as Array<{ staff_id: string; start_date: string; end_date: string }>,
            monthDateSet
          );
          approvedLeaveRequestCount = (approvedLeaves || []).length;
          approvedLeaveDayCount = countBlockedDateEntries(approvedLeaveBlockedDatesByStaff);
        }
      }
      const preferredOffBlockedDatesByStaff = buildPreferredOffDateMap(
        preferredOffSelections,
        targetStaffIdSet,
        monthDateSet
      );
      const preferredOffDateCount = countBlockedDateEntries(preferredOffBlockedDatesByStaff);
      const blockedDatesByStaff = mergeBlockedDateMaps(
        approvedLeaveBlockedDatesByStaff,
        preferredOffBlockedDatesByStaff
      );
      const resolvedGroupsByStaff = targetStaffs.map((staff: any) => {
        const resolvedGroup = resolvePlannerPatternGroup({
          staff,
          patternProfile: selectedPatternProfile,
          availableShifts: selectedAiShifts,
          allShifts: workShifts,
        });
        const groupKey = resolvedGroup?.key || `default-${defaultPlannerMode}`;
        groupSizeMap.set(groupKey, (groupSizeMap.get(groupKey) || 0) + 1);
        return {
          staffId: String(staff.id),
          resolvedGroup,
          groupKey,
        };
      });
      const recommendation: GeminiRosterRecommendation = {
        summary: '',
        leaveSummary:
          approvedLeaveDayCount > 0
            ? `승인 휴가 ${approvedLeaveRequestCount}건 · ${approvedLeaveDayCount}일 반영`
            : '',
        preferredOffSummary:
          preferredOffDateCount > 0 ? `희망 OFF ${preferredOffDateCount}건 반영` : '',
        teamAnalysis: {
          teamPurpose: selectedPatternProfile
            ? `${selectedPatternProfile.name} 패턴을 기준으로 ${selectedDepartment} 근무표를 생성`
            : `${selectedDepartment} 기본 규칙형 패턴으로 근무표를 생성`,
          workMode: selectedPatternProfile ? '패턴 + 규칙 기반 자동 생성' : '기본 규칙 자동 생성',
          includesNight: selectedAiShifts.some((shift) => resolveShiftBand(shift) === 'night'),
          reasoning: [
            selectedPatternProfile
              ? `${selectedPatternProfile.name} 패턴 적용`
              : '팀 기본 교대 패턴 적용',
            selectedGenerationRule
              ? `${selectedGenerationRule.name} 근무규칙 적용`
              : '팀 기본 근무규칙 적용',
          ],
          planningFocus: [
            '전담자와 순환 근무자 분리',
            '나이트 뒤 데이 금지와 OFF 반영',
            '3교대자 월 나이트 개수 반영',
          ],
        },
        staffPlans: targetStaffs.map((staff: any) => {
          const resolvedStaffGroup =
            resolvedGroupsByStaff.find((entry) => entry.staffId === String(staff.id)) || null;
          const resolvedGroup = resolvedStaffGroup?.resolvedGroup || null;
          const matchedGroup = resolvedGroup;
          const groupKey = resolvedStaffGroup?.groupKey || `default-${defaultPlannerMode}`;
          const totalStaffCount = groupSizeMap.get(groupKey) || 1;
          const groupMemberIndex = groupMemberIndexMap.get(groupKey) || 0;
          const blockedDateSet = blockedDatesByStaff.get(String(staff.id));
          groupMemberIndexMap.set(groupKey, groupMemberIndex + 1);
          const allowedShiftIds = (
            resolvedGroup?.shiftIds.filter((shiftId) => shiftMap.has(shiftId)) ||
            selectedAiShifts.map((shift) => shift.id)
          ).filter(Boolean);
          const rawMode: RosterPatternGroupMode = resolvedGroup?.mode || defaultPlannerMode;
          const effectiveMode: RosterPatternGroupMode =
            !effectiveGenerationRule.fixedShiftOnly && rawMode !== 'rotation'
              ? 'rotation'
              : rawMode;
          const sharedDailyBandCounts =
            effectiveMode === 'rotation' && effectiveGenerationRule.balanceRotationBands
              ? (() => {
                  const current =
                    rotationDailyBandCountsByGroup.get(groupKey) ||
                    Array.from({ length: monthDates.length }, () => ({
                      day: 0,
                      evening: 0,
                      night: 0,
                    }));
                  rotationDailyBandCountsByGroup.set(groupKey, current);
                  return current;
                })()
              : undefined;
          const sharedWeekendAssignmentCounts =
            effectiveMode === 'rotation' && effectiveGenerationRule.distributeWeekendShifts
              ? (() => {
                  const current =
                    weekendWorkCountsByGroup.get(groupKey) ||
                    Array.from({ length: Math.max(totalStaffCount, 1) }, () => 0);
                  if (current.length < totalStaffCount) {
                    current.push(...Array.from({ length: totalStaffCount - current.length }, () => 0));
                  }
                  weekendWorkCountsByGroup.set(groupKey, current);
                  return current;
                })()
              : undefined;
          const assignments =
            effectiveMode === 'rotation'
              ? buildRuleAwareRotationAssignments({
                  monthDates,
                  shiftMap,
                  shiftIds: allowedShiftIds,
                  staffIndex: groupMemberIndex,
                  rule: effectiveGenerationRule,
                  sharedDailyBandCounts,
                  totalStaffCount,
                  weekendAssignmentCounts: sharedWeekendAssignmentCounts,
                  blockedDateSet,
                })
              : buildProgrammaticAssignments({
                  monthDates,
                  shiftMap,
                  cycle: buildProgrammaticCycle(effectiveMode, allowedShiftIds, shiftMap),
                  staffIndex: groupMemberIndex,
                  mode: effectiveMode,
                  blockedDateSet,
                });

          if (resolvedGroup) {
            groupUsage.set(resolvedGroup.label, (groupUsage.get(resolvedGroup.label) || 0) + 1);
          }

          return {
            staffId: String(staff.id),
            modeLabel: resolvedGroup
              ? `${resolvedGroup.label} · ${PATTERN_GROUP_MODE_OPTIONS.find((option) => option.value === effectiveMode)?.label || effectiveMode}`
              : PATTERN_GROUP_MODE_OPTIONS.find((option) => option.value === effectiveMode)?.label || '기본 패턴',
            rationale: resolvedGroup
              ? `${resolvedGroup.label} 그룹 키워드와 연결된 근무유형을 기준으로 고정 사이클을 적용했습니다.`
              : '팀 기본 규칙과 선택한 근무유형 순서를 기준으로 자동 사이클을 적용했습니다.',
            assignments,
          };
        }),
      };

      recommendation.summary = selectedPatternProfile
        ? `${selectedDepartment} 팀에 "${selectedPatternProfile.name}" 패턴과 "${effectiveGenerationRule.name || '기본 근무규칙'}" 규칙을 적용해 월간 초안을 생성했습니다. ${Array.from(groupUsage.entries())
            .map(([label, count]) => `${label} ${count}명`)
            .join(', ')}`
        : `${selectedDepartment} 팀에 "${effectiveGenerationRule.name || '기본 근무규칙'}" 규칙을 적용해 월간 초안을 생성했습니다.`;

      setAiRecommendation(recommendation);
      setManualAssignments({});
      setManualEditMode(false);
      setGeminiSummary(
        recommendation.summary?.trim() || `${selectedDepartment} 팀 패턴 기반 초안이 적용되었습니다.`
      );
      setGeminiAppliedAt(new Date().toLocaleString('ko-KR'));
      alert('저장된 교대방식 패턴과 선택한 근무유형을 기준으로 월간 초안을 생성했습니다. 아래 미리보기에서 확인하세요.');
    } catch (error: any) {
      console.error('패턴 기반 근무표 생성 실패:', error);
      alert(`패턴 기반 근무표 생성 중 오류가 발생했습니다.\n${error?.message || '알 수 없는 오류'}`);
    } finally {
      setGeminiLoading(false);
    }
  };

  const updateConfig = (staff: any, index: number, patch: Partial<StaffConfig>) => {
    setStaffConfigs((prev) => {
      const current =
        prev[staff.id] ||
        buildInitialConfig(staff, index, defaultShiftOrder.length ? defaultShiftOrder : workingShifts, monthDates.length);
      const nextPattern = patch.pattern ?? current.pattern;
      const nextNightShiftCount = Object.prototype.hasOwnProperty.call(patch, 'nightShiftCount')
        ? patch.nightShiftCount || 0
        : current.nightShiftCount;
      const mergedConfig = {
        ...current,
        ...patch,
        pattern: nextPattern,
      };
      const nextWeeklyTemplateWeeks = normalizeWeeklyTemplateWeeks(
        mergedConfig.weeklyTemplateWeeks || [],
        [
          ...new Set(
            (mergedConfig.weeklyTemplateWeeks || [])
              .map((week) => week.shiftId)
              .concat([
                mergedConfig.primaryShiftId,
                mergedConfig.secondaryShiftId,
                mergedConfig.tertiaryShiftId,
              ])
              .filter(Boolean)
          ),
        ],
        mergedConfig.weeklyTemplateWeeks?.length || 1
      );

      return {
        ...prev,
        [staff.id]: {
          ...mergedConfig,
          nightShiftCount: isNightPattern(nextPattern)
            ? clampNightShiftCount(
              Number.isFinite(nextNightShiftCount)
                ? nextNightShiftCount
                : inferDefaultNightShiftCount(nextPattern, monthDates.length),
              monthDates.length
            )
            : 0,
          customPatternSequence: normalizeCustomPatternSequence(
            mergedConfig.customPatternSequence || [],
            workingShifts
          ),
          weeklyTemplateWeeks: nextWeeklyTemplateWeeks,
        },
      };
    });
  };

  const currentPlannerShifts = useMemo(
    () =>
      ((isWeeklyTemplatePattern(effectivePlannerPattern)
        ? effectivePlannerWeeklyTemplateWeeks.map((week) => week.shiftId)
        : effectivePlannerCustomPatternSequence.length > 0
        ? effectivePlannerCustomPatternSequence.filter((token) => token !== OFF_SHIFT_TOKEN)
        : [plannerPrimaryShiftId, plannerSecondaryShiftId, plannerTertiaryShiftId])
      )
        .filter(Boolean)
        .filter((shiftId, index, list) => list.indexOf(shiftId) === index)
        .map((shiftId) => getShiftNameById(shiftId, workShifts)),
    [
      effectivePlannerPattern,
      effectivePlannerCustomPatternSequence,
      effectivePlannerWeeklyTemplateWeeks,
      plannerPrimaryShiftId,
      plannerSecondaryShiftId,
      plannerTertiaryShiftId,
      workShifts,
    ]
  );
  const plannerUsesCustomPattern = isCustomPattern(effectivePlannerPattern);
  const plannerUsesWeeklyTemplate = isWeeklyTemplatePattern(effectivePlannerPattern);
  const availablePlannerShiftIds = useMemo(
    () =>
      [plannerPrimaryShiftId, plannerSecondaryShiftId, plannerTertiaryShiftId]
        .filter(Boolean)
        .filter((shiftId, index, list) => list.indexOf(shiftId) === index),
    [plannerPrimaryShiftId, plannerSecondaryShiftId, plannerTertiaryShiftId]
  );

  const appendPlannerCustomPatternStep = (token: string) => {
    setPlannerCustomPatternSequence((prev) => [...prev, token]);
  };

  const removePlannerCustomPatternStep = (index: number) => {
    setPlannerCustomPatternSequence((prev) => prev.filter((_, stepIndex) => stepIndex !== index));
  };

  const clearPlannerCustomPatternSequence = () => {
    setPlannerCustomPatternSequence([]);
  };

  const setPlannerWeeklyTemplateWeekCount = (count: number) => {
    setPlannerWeeklyTemplateWeeks((prev) =>
      normalizeWeeklyTemplateWeeks(prev, availablePlannerShiftIds, count)
    );
  };

  const updatePlannerWeeklyTemplateWeek = (
    weekIndex: number,
    patch: Partial<WeeklyTemplateWeek>
  ) => {
    setPlannerWeeklyTemplateWeeks((prev) => {
      const next = normalizeWeeklyTemplateWeeks(
        prev,
        availablePlannerShiftIds,
        Math.max(weekIndex + 1, prev.length || 1)
      );
      const current =
        next[weekIndex] || {
          shiftId: availablePlannerShiftIds[0] || '',
          activeWeekdays: [1, 2, 3, 4, 5],
        };
      next[weekIndex] = {
        shiftId: patch.shiftId ?? current.shiftId,
        activeWeekdays: patch.activeWeekdays
          ? normalizeActiveWeekdays(patch.activeWeekdays)
          : current.activeWeekdays,
      };
      return normalizeWeeklyTemplateWeeks(next, availablePlannerShiftIds, next.length);
    });
  };

  const togglePlannerWeeklyTemplateWeekday = (weekIndex: number, weekday: number) => {
    const currentWeek = effectivePlannerWeeklyTemplateWeeks[weekIndex];
    const nextWeekdays = currentWeek?.activeWeekdays.includes(weekday)
      ? currentWeek.activeWeekdays.filter((value) => value !== weekday)
      : [...(currentWeek?.activeWeekdays || []), weekday];
    updatePlannerWeeklyTemplateWeek(weekIndex, {
      activeWeekdays: nextWeekdays,
    });
  };

  const applyPlannerWeeklyTemplateWeekdays = (weekIndex: number, weekdays: number[]) => {
    updatePlannerWeeklyTemplateWeek(weekIndex, {
      activeWeekdays: weekdays,
    });
  };

  const resetWizardRuleSelection = () => {
    setWizardPattern('');
    setWizardShiftIds([]);
    setWizardStartOffset(0);
    setWizardNightShiftCount(0);
    setWizardCustomPatternSequence([]);
    setWizardWeeklyTemplateWeeks([]);
  };

  const openWizard = () => {
    const nextPattern = effectivePlannerPattern || '상근';
    const nextPlannerShiftIds =
      isWeeklyTemplatePattern(nextPattern)
        ? [
            ...new Set(
              effectivePlannerWeeklyTemplateWeeks
                .map((week) => week.shiftId)
                .concat([plannerPrimaryShiftId, plannerSecondaryShiftId, plannerTertiaryShiftId])
                .filter(Boolean)
            ),
          ]
        : [plannerPrimaryShiftId, plannerSecondaryShiftId, plannerTertiaryShiftId].filter(Boolean);

    setWizardStep(1);
    setWizardPattern(nextPattern);
    setWizardStartOffset(plannerStartOffset);
    setWizardNightShiftCount(
      isNightPattern(nextPattern)
        ? previewRows.length > 0 || summary.enabledCount > 0
          ? plannerNightShiftCount
          : inferDefaultNightShiftCount(nextPattern, monthDates.length)
        : 0
    );
    setWizardCustomPatternSequence(
      isCustomPattern(nextPattern)
        ? effectivePlannerCustomPatternSequence.length > 0
          ? effectivePlannerCustomPatternSequence
          : buildDefaultCustomPatternSequence(
              [plannerPrimaryShiftId, plannerSecondaryShiftId, plannerTertiaryShiftId].filter(Boolean)
            )
        : []
    );
    setWizardWeeklyTemplateWeeks(
      isWeeklyTemplatePattern(nextPattern)
        ? effectivePlannerWeeklyTemplateWeeks.length > 0
          ? effectivePlannerWeeklyTemplateWeeks
          : buildDefaultWeeklyTemplateWeeks(nextPlannerShiftIds, 1)
        : []
    );
    setWizardShiftIds(
      isCustomPattern(nextPattern)
        ? effectivePlannerCustomPatternSequence
            .filter((token) => token !== OFF_SHIFT_TOKEN)
            .filter((shiftId, index, list) => list.indexOf(shiftId) === index)
        : nextPlannerShiftIds
    );
    resetWizardRuleSelection();
    setWizardSelectedStaffIds(
      previewRows.length > 0 ? previewRows.map((row) => String(row.staff.id)) : targetStaffs.map((staff: any) => String(staff.id))
    );
    setWizardSelectedPresetId('');
    setWizardOffOverrides({});
    setWizardOpen(true);
  };

  const closeWizard = () => {
    setWizardOpen(false);
    setWizardStep(1);
    resetWizardRuleSelection();
    setWizardSelectedPresetId('');
    setWizardOffOverrides({});
  };

  const toggleWizardStaff = (staffId: string) => {
    setWizardSelectedStaffIds((prev) =>
      prev.includes(staffId) ? prev.filter((value) => value !== staffId) : [...prev, staffId]
    );
  };

  const applyWizardPreset = (preset: RosterWizardPreset) => {
    const normalizedPreset = normalizePresetRecord(preset);
    if (!normalizedPreset) return;

    const resolvedShiftIds = resolvePresetShiftIds(
      normalizedPreset,
      orderedWizardShiftIds
        .concat(defaultShiftOrder.map((shift) => shift.id))
        .concat(workingShifts.map((shift) => shift.id)),
      workingShifts
    );
    if (resolvedShiftIds.length === 0) {
      alert('적용할 근무유형이 없습니다. 먼저 근무유형을 등록하세요.');
      return;
    }

    const getShiftIdBySlot = (slot: number) => resolvedShiftIds[Math.max(0, slot - 1)] || resolvedShiftIds[0] || '';
    const nextCustomPatternSequence =
      normalizedPreset.pattern === CUSTOM_PATTERN_VALUE
        ? normalizedPreset.customPatternSlots
            .map((token) => (token === 'OFF' ? OFF_SHIFT_TOKEN : getShiftIdBySlot(token)))
            .filter(Boolean)
        : [];
    const nextWeeklyTemplateWeeks =
      normalizedPreset.pattern === WEEKLY_TEMPLATE_PATTERN_VALUE
        ? normalizeWeeklyTemplateWeeks(
            normalizedPreset.weeklyTemplateWeeks.map((week) => ({
              shiftId: getShiftIdBySlot(week.shiftSlot),
              activeWeekdays: week.activeWeekdays,
            })),
            resolvedShiftIds,
            normalizedPreset.weeklyTemplateWeeks.length || 1
          )
        : [];

    setWizardPattern(normalizedPreset.pattern);
    setWizardShiftIds(resolvedShiftIds);
    setWizardStartOffset(normalizedPreset.startOffset);
    setWizardNightShiftCount(
      isNightPattern(normalizedPreset.pattern)
        ? clampNightShiftCount(normalizedPreset.nightShiftCount, monthDates.length)
        : 0
    );
    setWizardCustomPatternSequence(
      normalizedPreset.pattern === CUSTOM_PATTERN_VALUE
        ? nextCustomPatternSequence.length > 0
          ? nextCustomPatternSequence
          : buildDefaultCustomPatternSequence(resolvedShiftIds)
        : []
    );
    setWizardWeeklyTemplateWeeks(nextWeeklyTemplateWeeks);
    setWizardSelectedPresetId(normalizedPreset.id);
  };

  const deleteWizardPreset = (presetId: string) => {
    setSavedWizardPresets((prev) => prev.filter((preset) => preset.id !== presetId));
    if (wizardSelectedPresetId === presetId) {
      setWizardSelectedPresetId('');
      resetWizardRuleSelection();
    }
  };

  const savePlannerPreset = () => {
    const nextName = plannerPresetName.trim();
    if (!nextName) {
      alert('자동생성 형식 이름을 입력하세요.');
      return;
    }
    if (plannerShiftIds.length === 0) {
      alert('형식으로 저장할 근무유형이 없습니다.');
      return;
    }
    if (
      isCustomPattern(effectivePlannerPattern) &&
      (effectivePlannerCustomPatternSequence.length === 0 ||
        !effectivePlannerCustomPatternSequence.some((token) => token !== OFF_SHIFT_TOKEN))
    ) {
      alert('커스텀 순환 순서를 만든 뒤 저장하세요.');
      return;
    }
    if (
      isWeeklyTemplatePattern(effectivePlannerPattern) &&
      !effectivePlannerWeeklyTemplateWeeks.some(
        (week) => Boolean(week.shiftId) && week.activeWeekdays.length > 0
      )
    ) {
      alert('주차 템플릿에는 근무가 들어가는 요일이 한 번 이상 포함되어야 합니다.');
      return;
    }

    const slotByShiftId = new Map(plannerShiftIds.map((shiftId, index) => [shiftId, index + 1]));
    const existingPreset = savedWizardPresets.find((preset) => preset.name.trim() === nextName);
    const nextPreset: RosterWizardPreset = {
      id: existingPreset?.id || `preset-${Date.now()}`,
      name: nextName,
      description: buildWizardPresetDescription(
        effectivePlannerPattern,
        effectivePlannerWeeklyTemplateWeeks,
        plannerShiftIds.length
      ),
      pattern: effectivePlannerPattern,
      shiftSlotCount: plannerShiftIds.length,
      shiftIds: plannerShiftIds,
      shiftNames: plannerShiftIds.map((shiftId) => getShiftNameById(shiftId, workShifts)),
      startOffset: plannerStartOffset,
      nightShiftCount: isNightPattern(effectivePlannerPattern) ? plannerNightShiftCount : 0,
      customPatternSlots: isCustomPattern(effectivePlannerPattern)
        ? effectivePlannerCustomPatternSequence
            .map((token) => (token === OFF_SHIFT_TOKEN ? 'OFF' : slotByShiftId.get(token) || 1))
            .filter((token) => token === 'OFF' || typeof token === 'number')
        : [],
      weeklyTemplateWeeks: isWeeklyTemplatePattern(effectivePlannerPattern)
        ? effectivePlannerWeeklyTemplateWeeks.map((week) => ({
            shiftSlot: slotByShiftId.get(week.shiftId) || 1,
            activeWeekdays: week.activeWeekdays,
          }))
        : [],
    };

    setSavedWizardPresets((prev) => [nextPreset, ...prev.filter((preset) => preset.id !== nextPreset.id)]);
    setPlannerPresetName('');
    alert(`"${nextName}" 자동생성 형식을 저장했습니다.`);
  };

  const applyPlannerPreset = (preset: RosterWizardPreset) => {
    const normalizedPreset = normalizePresetRecord(preset);
    if (!normalizedPreset) return;

    const resolvedShiftIds = resolvePresetShiftIds(
      normalizedPreset,
      plannerShiftIds
        .concat(defaultShiftOrder.map((shift) => shift.id))
        .concat(workingShifts.map((shift) => shift.id)),
      workingShifts
    );
    if (resolvedShiftIds.length === 0) {
      alert('적용할 근무유형이 없습니다. 먼저 근무유형을 등록하세요.');
      return;
    }

    const getShiftIdBySlot = (slot: number) => resolvedShiftIds[Math.max(0, slot - 1)] || resolvedShiftIds[0] || '';
    const nextCustomPatternSequence =
      normalizedPreset.pattern === CUSTOM_PATTERN_VALUE
        ? normalizedPreset.customPatternSlots
            .map((token) => (token === 'OFF' ? OFF_SHIFT_TOKEN : getShiftIdBySlot(token)))
            .filter(Boolean)
        : [];
    const nextWeeklyTemplateWeeks =
      normalizedPreset.pattern === WEEKLY_TEMPLATE_PATTERN_VALUE
        ? normalizeWeeklyTemplateWeeks(
            normalizedPreset.weeklyTemplateWeeks.map((week) => ({
              shiftId: getShiftIdBySlot(week.shiftSlot),
              activeWeekdays: week.activeWeekdays,
            })),
            resolvedShiftIds,
            normalizedPreset.weeklyTemplateWeeks.length || 1
          )
        : [];

    setPlannerPattern(normalizedPreset.pattern);
    setPlannerPrimaryShiftId(resolvedShiftIds[0] || '');
    setPlannerSecondaryShiftId(resolvedShiftIds[1] || resolvedShiftIds[0] || '');
    setPlannerTertiaryShiftId(resolvedShiftIds[2] || resolvedShiftIds[1] || resolvedShiftIds[0] || '');
    setPlannerStartOffset(normalizedPreset.startOffset);
    setPlannerNightShiftCount(
      isNightPattern(normalizedPreset.pattern)
        ? clampNightShiftCount(normalizedPreset.nightShiftCount, monthDates.length)
        : 0
    );
    setPlannerCustomPatternSequence(
      normalizedPreset.pattern === CUSTOM_PATTERN_VALUE
        ? nextCustomPatternSequence.length > 0
          ? nextCustomPatternSequence
          : buildDefaultCustomPatternSequence(resolvedShiftIds)
        : []
    );
    setPlannerWeeklyTemplateWeeks(nextWeeklyTemplateWeeks);
  };

  const updateWizardOffOverride = (staffId: string, patch: Partial<WizardOffOverride>) => {
    setWizardOffOverrides((prev) => {
      const current = prev[staffId] || {
        enabled: false,
        offDate: wizardOverrideDateOptions[0] || '',
        nextShiftId: wizardOverrideShiftOptions[0]?.id || '',
      };

      return {
        ...prev,
        [staffId]: {
          ...current,
          ...patch,
        },
      };
    });
  };

  const getWizardRuleValidationError = () => {
    if (!wizardSelectedPresetId) {
      return '먼저 저장한 자동생성 규칙을 불러오세요.';
    }
    if (!wizardPattern || orderedWizardShiftIds.length === 0) {
      return '불러온 규칙에 사용할 근무유형을 확인할 수 없습니다.';
    }
    if (
      wizardUsesCustomPattern &&
      (effectiveWizardCustomPatternSequence.length === 0 ||
        !effectiveWizardCustomPatternSequence.some((token) => token !== OFF_SHIFT_TOKEN))
    ) {
      return '불러온 순환 규칙에 실제 근무 순서가 없습니다.';
    }
    if (
      wizardUsesWeeklyTemplate &&
      !effectiveWizardWeeklyTemplateWeeks.some(
        (week) => Boolean(week.shiftId) && week.activeWeekdays.length > 0
      )
    ) {
      return '불러온 주차 규칙에 근무 요일이 없습니다.';
    }
    return null;
  };

  const applyWizard = () => {
    if (!selectedCompany) return alert('사업체를 먼저 선택하세요.');
    if (!selectedDepartment || selectedDepartment === '전체 부서') {
      return alert('근무표를 생성할 팀을 선택하세요.');
    }
    if (!wizardSelectedStaffIds.length) return alert('근무표를 생성할 직원을 한 명 이상 선택하세요.');
    if (!wizardUsesCustomPattern && !wizardUsesWeeklyTemplate && orderedWizardShiftIds.length < wizardRequiredShiftCount) {
      return alert(`${wizardPattern} 패턴에 필요한 근무유형 ${wizardRequiredShiftCount}개를 선택하세요.`);
    }
    if (wizardUsesCustomPattern && orderedWizardShiftIds.length === 0) {
      return alert('커스텀 패턴에 사용할 근무유형을 1개 이상 선택하세요.');
    }
    if (wizardUsesWeeklyTemplate && orderedWizardShiftIds.length === 0) {
      return alert('주차 템플릿에 사용할 근무유형을 1개 이상 선택하세요.');
    }
    if (
      wizardUsesCustomPattern &&
      (effectiveWizardCustomPatternSequence.length === 0 ||
        !effectiveWizardCustomPatternSequence.some((token) => token !== OFF_SHIFT_TOKEN))
    ) {
      return alert('커스텀 패턴 순서를 만들고, 실제 근무유형을 1개 이상 포함해 주세요.');
    }
    if (
      wizardUsesWeeklyTemplate &&
      !effectiveWizardWeeklyTemplateWeeks.some(
        (week) => Boolean(week.shiftId) && week.activeWeekdays.length > 0
      )
    ) {
      return alert('주차 템플릿에는 근무가 들어가는 요일을 최소 1일 이상 지정하세요.');
    }

    const primaryShiftId = orderedWizardShiftIds[0] || '';
    const secondaryShiftId = orderedWizardShiftIds[1] || primaryShiftId;
    const tertiaryShiftId = orderedWizardShiftIds[2] || secondaryShiftId || primaryShiftId;
    if (!primaryShiftId) return alert('근무유형을 한 개 이상 선택하세요.');
    const nextCustomPatternSequence = wizardUsesCustomPattern ? effectiveWizardCustomPatternSequence : [];
    const nextWeeklyTemplateWeeks = wizardUsesWeeklyTemplate ? effectiveWizardWeeklyTemplateWeeks : [];

    const selectedIndexMap = new Map<string, number>();
    wizardSelectedStaffIds.forEach((staffId, index) => {
      selectedIndexMap.set(staffId, index);
    });
    const nextManualAssignments: ManualAssignmentMap = {};

    wizardSelectedStaffIds.forEach((staffId) => {
      const override = wizardOffOverrides[staffId];
      if (!override?.enabled || !override.offDate) return;

      const offDateIndex = monthDates.indexOf(override.offDate);
      if (offDateIndex === -1) return;

      nextManualAssignments[buildAssignmentKey(staffId, override.offDate)] = OFF_SHIFT_TOKEN;

      const nextDate = monthDates[offDateIndex + 1];
      if (nextDate && override.nextShiftId) {
        nextManualAssignments[buildAssignmentKey(staffId, nextDate)] = override.nextShiftId;
      }
    });

    setPlannerPattern(wizardPattern);
    setPlannerPrimaryShiftId(primaryShiftId);
    setPlannerSecondaryShiftId(secondaryShiftId);
    setPlannerTertiaryShiftId(tertiaryShiftId);
    setPlannerStartOffset(wizardStartOffset);
    setPlannerNightShiftCount(isNightPattern(wizardPattern) ? wizardNightShiftCount : 0);
    setPlannerCustomPatternSequence(nextCustomPatternSequence);
    setPlannerWeeklyTemplateWeeks(nextWeeklyTemplateWeeks);

    setStaffConfigs((prev) => {
      const next = { ...prev };
      targetStaffs.forEach((staff: any, index: number) => {
        const current =
          prev[staff.id] ||
          buildInitialConfig(staff, index, defaultShiftOrder.length ? defaultShiftOrder : workingShifts, monthDates.length);
        const selectedIndex = selectedIndexMap.get(String(staff.id));

        next[staff.id] = {
          ...current,
          enabled: selectedIndex !== undefined,
          pattern: wizardPattern,
          primaryShiftId,
          secondaryShiftId,
          tertiaryShiftId,
          startOffset: selectedIndex !== undefined ? wizardStartOffset + selectedIndex : current.startOffset,
          nightShiftCount: isNightPattern(wizardPattern)
            ? clampNightShiftCount(wizardNightShiftCount, monthDates.length)
            : 0,
          customPatternSequence: nextCustomPatternSequence,
          weeklyTemplateWeeks: nextWeeklyTemplateWeeks,
        };
      });
      return next;
    });

    setManualAssignments(nextManualAssignments);
    closeWizard();
    alert(`${selectedDepartment} 팀 ${wizardSelectedStaffIds.length}명의 근무표 초안을 생성했습니다. 아래에서 임의 수정 후 저장하세요.`);
  };

  const ensureOffShift = async () => {
    if (offShift) return offShift;

    const payload = {
      name: '휴무',
      start_time: '00:00',
      end_time: '00:00',
      description: '근무표 자동편성에서 생성한 휴무 코드',
      company_name: selectedCompany,
      shift_type: '휴무',
      weekly_work_days: 0,
      is_weekend_work: true,
      is_shift: false,
      is_active: true,
    };

    const { data, error } = await supabase
      .from('work_shifts')
      .insert([payload])
      .select('id, name, start_time, end_time, shift_type, company_name')
      .single();

    if (error) throw error;

    const nextOffShift = data as WorkShift;
    setWorkShifts((prev) => [...prev, nextOffShift]);
    return nextOffShift;
  };

  const saveAssignments = async () => {
    const enabledRows = previewRows;
    if (!selectedCompany) return alert('사업체를 먼저 선택하세요.');
    if (!selectedDepartment) return alert('팀을 먼저 선택하세요.');
    if (!enabledRows.length) return alert('저장할 대상 직원이 없습니다.');
    if (!confirm(`${selectedMonth} ${selectedDepartment} 근무표를 저장하시겠습니까?\n기존 월간 편성은 덮어씁니다.`)) return;

    setSaving(true);
    try {
      const requiresOffShift = enabledRows.some((row) => row.cells.some((cell) => cell.shiftId === OFF_SHIFT_TOKEN));
      const resolvedOffShift = requiresOffShift ? await ensureOffShift() : null;
      const startDate = `${selectedMonth}-01`;
      const endDate = `${selectedMonth}-${String(monthDates.length).padStart(2, '0')}`;
      const staffIds = enabledRows.map((row) => row.staff.id);

      const { error: deleteError } = await supabase
        .from('shift_assignments')
        .delete()
        .in('staff_id', staffIds)
        .gte('work_date', startDate)
        .lte('work_date', endDate);

      if (deleteError) throw deleteError;

      const insertRows = enabledRows.flatMap((row) =>
        row.cells.map((cell) => ({
          staff_id: row.staff.id,
          work_date: cell.date,
          shift_id: cell.shiftId === OFF_SHIFT_TOKEN ? resolvedOffShift?.id || null : cell.shiftId || null,
          company_name: selectedCompany,
        }))
      );

      for (let index = 0; index < insertRows.length; index += 500) {
        const chunk = insertRows.slice(index, index + 500);
        const { error } = await supabase.from('shift_assignments').upsert(chunk, {
          onConflict: 'staff_id,work_date',
        });
        if (error) throw error;
      }

      alert(`${selectedDepartment} 팀 ${enabledRows.length}명의 ${selectedMonth} 근무표를 저장했습니다.`);
    } catch (error: any) {
      console.error('근무표 저장 실패:', error);
      alert(`근무표 저장에 실패했습니다.\n${error?.message || '알 수 없는 오류'}`);
    } finally {
      setSaving(false);
    }
  };

  if (!canAccess) {
    return (
      <div className="rounded-[20px] border border-red-100 bg-red-50 p-6 text-sm font-semibold text-red-600">
        부서장 이상만 교대근무 자동생성 기능을 사용할 수 있습니다.
      </div>
    );
  }

  if (panelMode === 'rules') {
    return (
      <div className="space-y-6" data-testid="roster-rule-manager">
        <div className="rounded-[24px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-bold text-[var(--foreground)]">근무규칙생성</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--toss-gray-3)]">
                나이트 뒤 데이 금지, OFF 일수, 3교대자 월 나이트 개수 같은 병동 운영 규칙을 저장해 근무표 자동생성에 반영합니다.
              </p>
            </div>
            <div className="rounded-[18px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] px-4 py-3 text-sm font-semibold text-[var(--foreground)]">
              적용 사업체 · {selectedCompany || '미선택'}
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="rounded-[24px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h4 className="text-lg font-bold text-[var(--foreground)]">규칙 편집</h4>
                <p className="mt-1 text-sm text-[var(--toss-gray-3)]">
                  병동팀처럼 3교대와 전담자가 섞이는 팀 기준으로, 월간 자동생성에 적용할 제약을 직접 만듭니다.
                </p>
              </div>
              <button
                type="button"
                onClick={resetGenerationRuleDraft}
                className="rounded-[14px] border border-[var(--toss-border)] bg-white px-4 py-3 text-sm font-bold text-[var(--foreground)]"
                data-testid="generation-rule-reset"
              >
                새 규칙
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold text-[var(--toss-gray-3)]">규칙 이름</span>
                <input
                  value={generationRuleDraft.name}
                  onChange={(event) => updateGenerationRuleDraftField('name', event.target.value)}
                  placeholder="예: 병동 기본 안전규칙"
                  className="rounded-[14px] border border-[var(--toss-border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="generation-rule-name-input"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold text-[var(--toss-gray-3)]">팀 키워드</span>
                <input
                  value={generationRuleDraft.teamKeywords.join(', ')}
                  onChange={(event) => updateGenerationRuleDraftField('teamKeywords', event.target.value)}
                  placeholder="예: 병동팀, 1병동"
                  className="rounded-[14px] border border-[var(--toss-border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="generation-rule-team-keywords-input"
                />
              </label>

              <div className="rounded-[16px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] px-4 py-3 md:col-span-2">
                <p className="text-sm font-bold text-[var(--foreground)]">일자별 최소 인원</p>
                <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
                  자동생성 시 각 날짜마다 우선 확보하려는 최소 D / E / N 인원입니다. 부족한 경우 가능한 범위 안에서 최대한 맞춥니다.
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-[var(--toss-gray-3)]">D 최소</span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={generationRuleDraft.minDayStaff}
                      onChange={(event) =>
                        updateGenerationRuleDraftField('minDayStaff', event.target.value)
                      }
                      className="rounded-[12px] border border-[var(--toss-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                      data-testid="generation-rule-min-day-staff"
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-[var(--toss-gray-3)]">E 최소</span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={generationRuleDraft.minEveningStaff}
                      onChange={(event) =>
                        updateGenerationRuleDraftField('minEveningStaff', event.target.value)
                      }
                      className="rounded-[12px] border border-[var(--toss-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                      data-testid="generation-rule-min-evening-staff"
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-[var(--toss-gray-3)]">N 최소</span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={generationRuleDraft.minNightStaff}
                      onChange={(event) =>
                        updateGenerationRuleDraftField('minNightStaff', event.target.value)
                      }
                      className="rounded-[12px] border border-[var(--toss-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                      data-testid="generation-rule-min-night-staff"
                    />
                  </label>
                </div>
              </div>
            </div>

            <label className="mt-4 flex flex-col gap-2">
              <span className="text-xs font-bold text-[var(--toss-gray-3)]">규칙 설명</span>
              <textarea
                value={generationRuleDraft.description}
                onChange={(event) => updateGenerationRuleDraftField('description', event.target.value)}
                placeholder="예: 병동 3교대자는 월 6번 나이트, 나이트 뒤 최소 하루 OFF"
                rows={3}
                className="rounded-[16px] border border-[var(--toss-border)] bg-white px-4 py-3 text-sm leading-6 text-[var(--foreground)] outline-none"
              />
            </label>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="flex items-center justify-between rounded-[16px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">나이트 다음 데이 금지</p>
                  <p className="mt-1 text-xs text-[var(--toss-gray-3)]">나이트 다음날은 OFF 또는 이브만 허용합니다.</p>
                </div>
                <input
                  type="checkbox"
                  checked={generationRuleDraft.avoidDayAfterNight}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('avoidDayAfterNight', event.target.checked)
                  }
                  className="h-5 w-5"
                  data-testid="generation-rule-avoid-day-after-night"
                />
              </label>

              <label className="flex items-center justify-between rounded-[16px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">전담자는 자기 시간대만</p>
                  <p className="mt-1 text-xs text-[var(--toss-gray-3)]">데이/이브/나이트 전담은 연결된 시간대만 근무합니다.</p>
                </div>
                <input
                  type="checkbox"
                  checked={generationRuleDraft.fixedShiftOnly}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('fixedShiftOnly', event.target.checked)
                  }
                  className="h-5 w-5"
                  data-testid="generation-rule-fixed-shift-only"
                />
              </label>

              <label className="flex items-center justify-between rounded-[16px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">순환근무 밴드 균형</p>
                  <p className="mt-1 text-xs text-[var(--toss-gray-3)]">병동 전체에서 데이/이브/나이트가 한쪽으로 치우치지 않게 분산합니다.</p>
                </div>
                <input
                  type="checkbox"
                  checked={generationRuleDraft.balanceRotationBands}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('balanceRotationBands', event.target.checked)
                  }
                  className="h-5 w-5"
                  data-testid="generation-rule-balance-bands"
                />
              </label>

              <label className="flex items-center justify-between rounded-[16px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">주말 근무 균등 분산</p>
                  <p className="mt-1 text-xs text-[var(--toss-gray-3)]">토·일 근무가 특정 직원에게 몰리지 않도록 OFF를 우선 분산합니다.</p>
                </div>
                <input
                  type="checkbox"
                  checked={generationRuleDraft.distributeWeekendShifts}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('distributeWeekendShifts', event.target.checked)
                  }
                  className="h-5 w-5"
                  data-testid="generation-rule-distribute-weekends"
                />
              </label>

              <label className="flex flex-col gap-2 rounded-[16px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] px-4 py-3">
                <span className="text-sm font-bold text-[var(--foreground)]">나이트 뒤 OFF 일수</span>
                <input
                  type="number"
                  min={0}
                  max={3}
                  value={generationRuleDraft.offDaysAfterNight}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('offDaysAfterNight', event.target.value)
                  }
                  className="rounded-[12px] border border-[var(--toss-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="generation-rule-off-days-after-night"
                />
              </label>

              <label className="flex flex-col gap-2 rounded-[16px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] px-4 py-3">
                <span className="text-sm font-bold text-[var(--foreground)]">나이트 연속 블록</span>
                <input
                  type="number"
                  min={1}
                  max={3}
                  value={generationRuleDraft.nightBlockSize}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('nightBlockSize', event.target.value)
                  }
                  className="rounded-[12px] border border-[var(--toss-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="generation-rule-night-block-size"
                />
              </label>

              <label className="flex flex-col gap-2 rounded-[16px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] px-4 py-3">
                <span className="text-sm font-bold text-[var(--foreground)]">최대 연속근무일</span>
                <input
                  type="number"
                  min={2}
                  max={7}
                  value={generationRuleDraft.maxConsecutiveWorkDays}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('maxConsecutiveWorkDays', event.target.value)
                  }
                  className="rounded-[12px] border border-[var(--toss-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="generation-rule-max-consecutive-work-days"
                />
              </label>

              <label className="flex flex-col gap-2 rounded-[16px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] px-4 py-3 md:col-span-2">
                <span className="text-sm font-bold text-[var(--foreground)]">3교대자 월 나이트 개수</span>
                <input
                  type="number"
                  min={0}
                  max={31}
                  value={generationRuleDraft.rotationNightCount}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('rotationNightCount', event.target.value)
                  }
                  className="rounded-[12px] border border-[var(--toss-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="generation-rule-rotation-night-count"
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={saveGenerationRule}
                className="rounded-[14px] bg-[var(--toss-blue)] px-4 py-3 text-sm font-bold text-white"
                data-testid="generation-rule-save"
              >
                규칙 저장
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[24px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm">
              <h4 className="text-lg font-bold text-[var(--foreground)]">저장된 규칙</h4>
              <p className="mt-1 text-sm text-[var(--toss-gray-3)]">
                팀 기준으로 자동 선택되며, 생성 화면에서 직접 골라 적용할 수도 있습니다.
              </p>

              {companyGenerationRules.length === 0 ? (
                <div className="mt-4 rounded-[18px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-5 text-sm font-semibold text-[var(--toss-gray-3)]">
                  아직 저장된 근무규칙이 없습니다.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {companyGenerationRules.map((rule) => (
                    <div
                      key={rule.id}
                      className="rounded-[18px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)]/80 p-4"
                      data-testid={`generation-rule-card-${rule.id}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[var(--foreground)]">{rule.name}</p>
                          <p className="mt-1 text-xs font-semibold text-[var(--toss-blue)]">
                            {rule.teamKeywords.join(', ')}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => editGenerationRule(rule)}
                            className="rounded-[10px] border border-[var(--toss-border)] bg-white px-3 py-2 text-xs font-bold text-[var(--foreground)]"
                            data-testid={`generation-rule-edit-${rule.id}`}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`"${rule.name}" 규칙을 삭제할까요?`)) {
                                deleteGenerationRule(rule.id);
                              }
                            }}
                            className="rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-600"
                            data-testid={`generation-rule-delete-${rule.id}`}
                          >
                            삭제
                          </button>
                        </div>
                        <span className="rounded-full border border-[var(--toss-border)] bg-white px-3 py-1">
                          연속근무 {rule.maxConsecutiveWorkDays}일
                        </span>
                        {rule.distributeWeekendShifts ? (
                          <span className="rounded-full border border-[var(--toss-border)] bg-white px-3 py-1">
                            주말 분산
                          </span>
                        ) : null}
                        {(rule.minDayStaff || rule.minEveningStaff || rule.minNightStaff) > 0 ? (
                          <span className="rounded-full border border-[var(--toss-border)] bg-white px-3 py-1">
                            최소 D/E/N {rule.minDayStaff}/{rule.minEveningStaff}/{rule.minNightStaff}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-[var(--foreground)]">
                        <span className="rounded-full border border-[var(--toss-border)] bg-white px-3 py-1">
                          월 나이트 {rule.rotationNightCount}개
                        </span>
                        <span className="rounded-full border border-[var(--toss-border)] bg-white px-3 py-1">
                          연속 나이트 {rule.nightBlockSize}개
                        </span>
                        <span className="rounded-full border border-[var(--toss-border)] bg-white px-3 py-1">
                          OFF {rule.offDaysAfterNight}일
                        </span>
                      </div>

                      {rule.description ? (
                        <p className="mt-3 text-sm leading-6 text-[var(--toss-gray-4)]">{rule.description}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (panelMode === 'patterns') {
    return (
      <div className="space-y-6" data-testid="roster-pattern-manager">
        <div className="rounded-[24px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-bold text-[var(--foreground)]">교대방식 패턴</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--toss-gray-3)]">
                팀별 기본 사이클과 전담자 그룹을 저장해 두고, 생성 화면에서 바로 불러와 월간 근무표를 자동 편성합니다.
              </p>
            </div>
            <div className="rounded-[18px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] px-4 py-3 text-sm font-semibold text-[var(--foreground)]">
              적용 사업체 · {selectedCompany || '미선택'}
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
          <div className="rounded-[24px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h4 className="text-lg font-bold text-[var(--foreground)]">패턴 편집</h4>
                <p className="mt-1 text-sm text-[var(--toss-gray-3)]">
                  예: 병동팀, 외래팀, 관리팀별 기본 패턴과 나이트전담/데이전담/순환근무 그룹을 저장합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={resetPatternDraft}
                className="rounded-[14px] border border-[var(--toss-border)] bg-white px-4 py-3 text-sm font-bold text-[var(--foreground)]"
                data-testid="pattern-profile-reset"
              >
                새 패턴
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold text-[var(--toss-gray-3)]">패턴 이름</span>
                <input
                  value={patternDraft.name}
                  onChange={(event) => updatePatternDraftField('name', event.target.value)}
                  placeholder="예: 병동 3교대 기본"
                  className="rounded-[14px] border border-[var(--toss-border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="pattern-name-input"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold text-[var(--toss-gray-3)]">팀 키워드</span>
                <input
                  value={patternDraft.teamKeywords.join(', ')}
                  onChange={(event) => updatePatternDraftField('teamKeywords', event.target.value)}
                  placeholder="예: 병동팀, 1병동, 간호병동"
                  className="rounded-[14px] border border-[var(--toss-border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="pattern-team-keywords-input"
                />
              </label>
            </div>

            <label className="mt-4 flex flex-col gap-2">
              <span className="text-xs font-bold text-[var(--toss-gray-3)]">패턴 설명</span>
              <textarea
                value={patternDraft.description}
                onChange={(event) => updatePatternDraftField('description', event.target.value)}
                placeholder="예: 병동 순환 3교대 + 나이트전담 1명 + 데이전담 1명"
                rows={3}
                className="rounded-[16px] border border-[var(--toss-border)] bg-white px-4 py-3 text-sm leading-6 text-[var(--foreground)] outline-none"
              />
            </label>

            <div className="mt-6 space-y-4">
              {patternDraft.staffGroups.map((group, index) => (
                <div
                  key={group.id}
                  className="rounded-[22px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)]/80 p-5"
                  data-testid={`pattern-group-card-${group.id}`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="grid flex-1 gap-3 md:grid-cols-2">
                      <label className="flex flex-col gap-2">
                        <span className="text-xs font-bold text-[var(--toss-gray-3)]">직원 그룹 이름</span>
                        <input
                          value={group.label}
                          onChange={(event) => updatePatternGroup(group.id, { label: event.target.value })}
                          placeholder={`그룹 ${index + 1}`}
                          className="rounded-[12px] border border-[var(--toss-border)] bg-white px-3 py-2.5 text-sm font-semibold text-[var(--foreground)] outline-none"
                          data-testid={`pattern-group-label-${group.id}`}
                        />
                      </label>
                      <label className="flex flex-col gap-2">
                        <span className="text-xs font-bold text-[var(--toss-gray-3)]">운영 방식</span>
                        <select
                          value={group.mode}
                          onChange={(event) =>
                            updatePatternGroup(group.id, {
                              mode: event.target.value as RosterPatternGroupMode,
                            })
                          }
                          className="rounded-[12px] border border-[var(--toss-border)] bg-white px-3 py-2.5 text-sm font-semibold text-[var(--foreground)] outline-none"
                          data-testid={`pattern-group-mode-${group.id}`}
                        >
                          {PATTERN_GROUP_MODE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePatternGroup(group.id)}
                      disabled={patternDraft.staffGroups.length === 1}
                      className="rounded-[12px] border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      그룹 삭제
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-bold text-[var(--toss-gray-3)]">직원 구분 키워드</span>
                      <input
                        value={group.matchKeywords.join(', ')}
                        onChange={(event) =>
                          updatePatternGroup(group.id, {
                            matchKeywords: event.target.value
                              .split(',')
                              .map((item) => item.trim())
                              .filter(Boolean),
                          })
                        }
                        placeholder="예: 나이트전담, 고정N, 야간전담"
                        className="rounded-[12px] border border-[var(--toss-border)] bg-white px-3 py-2.5 text-sm font-semibold text-[var(--foreground)] outline-none"
                      />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-bold text-[var(--toss-gray-3)]">메모</span>
                      <input
                        value={group.note || ''}
                        onChange={(event) => updatePatternGroup(group.id, { note: event.target.value })}
                        placeholder="예: N N OFF OFF 반복"
                        className="rounded-[12px] border border-[var(--toss-border)] bg-white px-3 py-2.5 text-sm font-semibold text-[var(--foreground)] outline-none"
                      />
                    </label>
                  </div>

                  <div className="mt-4">
                    <p className="text-xs font-bold text-[var(--toss-gray-3)]">연결 근무유형</p>
                    {workingShifts.length === 0 ? (
                      <div className="mt-2 rounded-[14px] border border-dashed border-[var(--toss-border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--toss-gray-3)]">
                        먼저 근무형태를 등록해 주세요.
                      </div>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {workingShifts.map((shift) => {
                          const active = group.shiftIds.includes(shift.id);
                          return (
                            <button
                              key={shift.id}
                              type="button"
                              onClick={() => togglePatternGroupShift(group.id, shift.id)}
                              className={`rounded-full border px-3 py-2 text-[11px] font-semibold transition-all ${
                                active
                                  ? `${getShiftBadgeClass(shift.name)} ring-2 ring-[var(--toss-blue)]/20`
                                  : 'border-[var(--toss-border)] bg-white text-[var(--foreground)]'
                              }`}
                              data-testid={`pattern-group-shift-${group.id}-${shift.id}`}
                            >
                              {shift.name} · {formatShiftHours(shift)}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={addPatternGroup}
                className="rounded-[14px] border border-[var(--toss-border)] bg-white px-4 py-3 text-sm font-bold text-[var(--foreground)]"
                data-testid="pattern-group-add"
              >
                그룹 추가
              </button>
              <button
                type="button"
                onClick={savePatternProfile}
                className="rounded-[14px] bg-[var(--toss-blue)] px-4 py-3 text-sm font-bold text-white"
                data-testid="pattern-profile-save"
              >
                패턴 저장
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[24px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm">
              <h4 className="text-lg font-bold text-[var(--foreground)]">저장된 패턴</h4>
              <p className="mt-1 text-sm text-[var(--toss-gray-3)]">
                선택한 사업체에 맞는 팀 패턴만 모아 보여줍니다.
              </p>

              {companyPatternProfiles.length === 0 ? (
                <div className="mt-4 rounded-[18px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-5 text-sm font-semibold text-[var(--toss-gray-3)]">
                  아직 저장된 교대방식 패턴이 없습니다.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {companyPatternProfiles.map((profile) => (
                    <div
                      key={profile.id}
                      className="rounded-[18px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)]/80 p-4"
                      data-testid={`pattern-profile-card-${profile.id}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[var(--foreground)]">{profile.name}</p>
                          <p className="mt-1 text-xs font-semibold text-[var(--toss-blue)]">
                            {profile.teamKeywords.join(', ')}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => editPatternProfile(profile)}
                            className="rounded-[10px] border border-[var(--toss-border)] bg-white px-3 py-2 text-xs font-bold text-[var(--foreground)]"
                            data-testid={`pattern-profile-edit-${profile.id}`}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`"${profile.name}" 패턴을 삭제할까요?`)) {
                                deletePatternProfile(profile.id);
                              }
                            }}
                            className="rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-600"
                            data-testid={`pattern-profile-delete-${profile.id}`}
                          >
                            삭제
                          </button>
                        </div>
                      </div>

                      {profile.description ? (
                        <p className="mt-3 text-sm leading-6 text-[var(--toss-gray-4)]">{profile.description}</p>
                      ) : null}

                      <div className="mt-3 flex flex-wrap gap-2">
                        {profile.staffGroups.map((group) => {
                          const modeLabel =
                            PATTERN_GROUP_MODE_OPTIONS.find((option) => option.value === group.mode)?.label ||
                            group.mode;
                          return (
                            <span
                              key={group.id}
                              className="rounded-full border border-[var(--toss-border)] bg-white px-3 py-1 text-[11px] font-semibold text-[var(--foreground)]"
                            >
                              {group.label} · {modeLabel}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-[24px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm">
              <h4 className="text-lg font-bold text-[var(--foreground)]">활용 방식</h4>
              <div className="mt-3 space-y-2 text-sm leading-6 text-[var(--toss-gray-4)]">
                <p>1. 팀 키워드로 어떤 팀에 쓸 패턴인지 지정합니다.</p>
                <p>2. 직원 그룹마다 전담자 키워드와 운영 방식, 연결 근무유형을 저장합니다.</p>
                <p>3. 생성 화면에서 팀과 패턴만 고르면 저장된 규칙으로 월간 초안을 자동 생성합니다.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const aiOnlyPlannerMode = true;
  if (aiOnlyPlannerMode) {
    return (
      <div className="space-y-6" data-testid="roster-pattern-planner">
        <div className="rounded-[24px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="shrink-0 text-xl font-bold text-[var(--foreground)]">패턴 기반 근무표 생성</h3>

            <label className="flex shrink-0 items-center gap-2">
              <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">팀</span>
              <select
                value={selectedDepartment}
                onChange={(event) => setSelectedDepartment(event.target.value)}
                className="min-w-[180px] rounded-[14px] border border-[var(--toss-border)] bg-white px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                data-testid="roster-team-select"
              >
                {teamOptions.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex shrink-0 items-center gap-2">
              <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">교대방식 패턴</span>
              <select
                value={selectedPatternProfileId}
                onChange={(event) => setSelectedPatternProfileId(event.target.value)}
                className="min-w-[220px] rounded-[14px] border border-[var(--toss-border)] bg-white px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                data-testid="roster-pattern-profile-select"
              >
                <option value="">팀 기준 기본 규칙</option>
                {companyPatternProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex shrink-0 items-center gap-2">
              <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">근무규칙</span>
              <select
                value={selectedGenerationRuleId}
                onChange={(event) => setSelectedGenerationRuleId(event.target.value)}
                className="min-w-[220px] rounded-[14px] border border-[var(--toss-border)] bg-white px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                data-testid="roster-generation-rule-select"
              >
                <option value="">팀 기준 기본 규칙</option>
                {companyGenerationRules.map((rule) => (
                  <option key={rule.id} value={rule.id}>
                    {rule.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <span className="shrink-0 text-[11px] font-bold text-[var(--toss-gray-3)]">적용 근무유형</span>
              {loadingShifts ? (
                <span className="text-[12px] font-semibold text-[var(--toss-blue)]">근무형태 불러오는 중...</span>
              ) : workingShifts.length === 0 ? (
                <span className="rounded-full border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] px-3 py-2 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                  등록된 근무형태가 없습니다.
                </span>
              ) : recommendedAiShifts.length === 0 ? (
                <span className="rounded-full border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] px-3 py-2 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                  이 팀에 맞는 추천 근무유형이 없습니다.
                </span>
              ) : (
                recommendedAiShifts.map((shift) => {
                  return (
                    <span
                      key={shift.id}
                      className={`rounded-full border px-3 py-2 text-[11px] font-semibold ${getShiftBadgeClass(shift.name)}`}
                      data-testid={`planner-shift-chip-${shift.id}`}
                    >
                      {shift.name}
                      {' · '}
                      {formatShiftHours(shift)}
                      {' · '}
                      {resolveConfiguredWorkDayMode(shift) === 'all_days' ? '주말 포함' : '주말 제외'}
                    </span>
                  );
                })
              )}
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-3">
              <label className="flex flex-col gap-0">
                <div className="rounded-[14px] border border-[var(--toss-border)] bg-[var(--input-bg)] px-3 py-2">
                  <SmartMonthPicker
                    value={selectedMonth}
                    onChange={(value) => setSelectedMonth(value)}
                    className="w-[150px]"
                    inputClassName="text-sm font-semibold text-[var(--foreground)]"
                  />
                </div>
              </label>
              <button
                type="button"
                onClick={generatePatternDraft}
                disabled={geminiLoading || loadingShifts || workingShifts.length === 0 || targetStaffs.length === 0}
                className="rounded-[14px] border border-[var(--toss-blue)] bg-[var(--toss-blue-light)] px-4 py-3 text-sm font-bold text-[var(--toss-blue)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="roster-auto-generate"
              >
                {geminiLoading ? '자동 생성 중...' : '근무표 자동 생성'}
              </button>
              <button
                type="button"
                onClick={saveAssignments}
                disabled={saving || loadingShifts || previewRows.length === 0}
                className="rounded-[14px] bg-[var(--toss-blue)] px-4 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? '저장 중...' : '월간 근무표 저장'}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="w-full rounded-[18px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)]/70 px-4 py-3 text-sm font-semibold text-[var(--foreground)]">
              {selectedPatternProfile
                ? '\uC120\uD0DD\uD55C \uD300 \uD328\uD134 \uD504\uB85C\uD544\uC744 \uAE30\uC900\uC73C\uB85C \uB370\uC774/\uC774\uBE0C/\uB098\uC774\uD2B8 \uC804\uB2F4\uC790\uC640 \uC21C\uD658 \uADFC\uBB34\uC790\uB97C \uAC19\uC774 \uD3B8\uC131\uD569\uB2C8\uB2E4.'
                : '\uC800\uC7A5\uB41C \uD300 \uD328\uD134 \uD504\uB85C\uD544\uC774 \uC5C6\uC5B4\uB3C4 \uC9C1\uC6D0\uC758 shift_type\uACFC \uBC30\uC815 \uADFC\uBB34\uB97C \uAE30\uC900\uC73C\uB85C \uB370\uC774/\uC774\uBE0C/\uB098\uC774\uD2B8 \uC804\uB2F4\uC790\uB97C \uC790\uB3D9 \uAC10\uC9C0\uD558\uACE0, \uB098\uBA38\uC9C0\uB294 \uC21C\uD658 \uADFC\uBB34\uB85C \uD3B8\uC131\uD569\uB2C8\uB2E4.'}
            </div>
            {plannerPatternPreviewGroups.length > 0 ? (
              <div
                className="w-full rounded-[18px] border border-[var(--toss-border)] bg-white px-4 py-3"
                data-testid="roster-pattern-group-preview"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {plannerPatternPreviewGroups.map((group) => {
                    const modeLabel =
                      PATTERN_GROUP_MODE_OPTIONS.find((option) => option.value === group.mode)?.label ||
                      group.mode;
                    const toneClass =
                      group.source === 'profile'
                        ? 'border-[var(--toss-blue)]/20 bg-[var(--toss-blue-light)]/60'
                        : group.source === 'auto'
                          ? 'border-emerald-200 bg-emerald-50'
                          : 'border-[var(--toss-border)] bg-[var(--toss-gray-1)]';

                    return (
                      <span
                        key={group.key}
                        className={`rounded-full border px-3 py-2 text-[11px] font-semibold text-[var(--foreground)] ${toneClass}`}
                      >
                        {group.label} {group.count}명 · {modeLabel}
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {selectedPatternProfile ? (
              <div className="rounded-[16px] border border-[var(--toss-blue)]/20 bg-[var(--toss-blue-light)]/60 px-4 py-3 text-sm font-semibold text-[var(--foreground)]">
                적용 패턴 · {selectedPatternProfile.name}
                {selectedPatternProfile.description ? ` · ${selectedPatternProfile.description}` : ''}
              </div>
            ) : (
              <div className="rounded-[16px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] px-4 py-3 text-sm font-semibold text-[var(--toss-gray-3)]">
                저장된 교대방식 패턴이 있으면 우선 적용하고, 없으면 팀 기본 규칙으로 자동 생성합니다.
              </div>
            )}
            {selectedGenerationRule ? (
              <div className="rounded-[16px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-[var(--foreground)]">
                적용 규칙 · {selectedGenerationRule.name}
              </div>
            ) : (
              <div className="rounded-[16px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] px-4 py-3 text-sm font-semibold text-[var(--toss-gray-3)]">
                저장된 규칙이 없으면 팀 기본 안전규칙으로 자동 생성합니다.
              </div>
            )}
            {matchingPatternProfiles.length === 0 && companyPatternProfiles.length === 0 ? (
              <div className="rounded-[16px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] px-4 py-3 text-sm font-semibold text-[var(--toss-gray-3)]">
                패턴 탭에서 팀별 교대방식 패턴을 먼저 저장할 수 있습니다.
              </div>
            ) : null}
            {matchingGenerationRules.length === 0 && companyGenerationRules.length === 0 ? (
              <div className="rounded-[16px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] px-4 py-3 text-sm font-semibold text-[var(--toss-gray-3)]">
                규칙 탭에서 팀별 근무규칙을 먼저 저장할 수 있습니다.
              </div>
            ) : null}
            <div
              className="w-full rounded-[18px] border border-amber-200 bg-amber-50/80 px-4 py-4"
              data-testid="preferred-off-manager"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">
                    Preferred Off
                  </p>
                  <h4 className="mt-1 text-base font-bold text-[var(--foreground)]">개인 희망 OFF</h4>
                  <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                    자동 생성 전에 직원별 희망 휴무일을 등록하면 해당 날짜를 OFF로 우선 반영합니다.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={preferredOffStaffId}
                    onChange={(event) => setPreferredOffStaffId(event.target.value)}
                    disabled={targetStaffs.length === 0}
                    className="rounded-[12px] border border-[var(--toss-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground)] disabled:opacity-50"
                    data-testid="preferred-off-staff-select"
                  >
                    {targetStaffs.length === 0 ? (
                      <option value="">직원 없음</option>
                    ) : (
                      targetStaffs.map((staff: any) => (
                        <option key={staff.id} value={String(staff.id)}>
                          {staff.name}
                        </option>
                      ))
                    )}
                  </select>
                  <select
                    value={preferredOffDate}
                    onChange={(event) => setPreferredOffDate(event.target.value)}
                    disabled={monthDates.length === 0}
                    className="rounded-[12px] border border-[var(--toss-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground)] disabled:opacity-50"
                    data-testid="preferred-off-date-select"
                  >
                    {monthDates.map((date) => (
                      <option key={date} value={date}>
                        {date}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={addPreferredOffDate}
                    disabled={!preferredOffStaffId || !preferredOffDate}
                    className="rounded-[12px] bg-amber-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                    data-testid="preferred-off-add"
                  >
                    희망 OFF 추가
                  </button>
                  <button
                    type="button"
                    onClick={clearAllPreferredOff}
                    disabled={preferredOffCount === 0}
                    className="rounded-[12px] border border-amber-200 bg-white px-3 py-2 text-sm font-bold text-amber-700 disabled:opacity-50"
                    data-testid="preferred-off-clear-all"
                  >
                    전체 비우기
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-semibold text-amber-700">
                  등록 {preferredOffCount}건
                </span>
                {preferredOffEntries.map((entry) => (
                  <span
                    key={`preferred-off-summary-${entry.staff.id}`}
                    className="rounded-full border border-amber-100 bg-white/80 px-3 py-1 text-[11px] font-semibold text-[var(--foreground)]"
                  >
                    {entry.staff.name} {entry.dates.length}일
                  </span>
                ))}
              </div>
              <div className="mt-3 space-y-2">
                {preferredOffEntries.length === 0 ? (
                  <p className="text-[12px] font-semibold text-[var(--toss-gray-3)]">
                    등록된 개인 희망 OFF가 없습니다.
                  </p>
                ) : (
                  preferredOffEntries.map((entry) => (
                    <div
                      key={`preferred-off-row-${entry.staff.id}`}
                      className="rounded-[14px] border border-amber-100 bg-white/90 px-3 py-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-[var(--foreground)]">{entry.staff.name}</p>
                          <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                            {entry.dates.length}일 등록
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => clearPreferredOffForStaff(String(entry.staff.id))}
                          className="rounded-full border border-amber-200 px-3 py-1 text-[11px] font-bold text-amber-700"
                        >
                          직원 비우기
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {entry.dates.map((date) => (
                          <button
                            type="button"
                            key={`${entry.staff.id}-${date}`}
                            onClick={() => removePreferredOffDate(String(entry.staff.id), date)}
                            className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700"
                            data-testid={`preferred-off-chip-${entry.staff.id}-${date}`}
                          >
                            {date} x
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {(geminiSummary || aiRecommendation?.teamAnalysis) && (
          <div
            className="rounded-[24px] border border-[var(--toss-blue)]/20 bg-[var(--toss-blue-light)]/60 p-6 shadow-sm"
            data-testid="roster-generation-summary"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="mt-2 text-sm font-semibold leading-6 text-[var(--foreground)]">
                  {geminiSummary}
                </p>
                {(leaveAppliedSummary || aiRecommendation?.leaveSummary) ? (
                  <span
                    className="mt-3 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700"
                    data-testid="roster-leave-coverage-summary"
                  >
                    {leaveAppliedSummary || aiRecommendation?.leaveSummary}
                  </span>
                ) : null}
                {aiRecommendation?.preferredOffSummary ? (
                  <span
                    className="mt-3 ml-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700"
                    data-testid="roster-preferred-off-summary"
                  >
                    {aiRecommendation.preferredOffSummary}
                  </span>
                ) : null}
              </div>
              {geminiAppliedAt && (
                <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                  적용 시각 {geminiAppliedAt}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="rounded-[24px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h4 className="text-base font-bold text-[var(--foreground)]">월간 근무표 미리보기</h4>
              <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                저장된 패턴과 팀 규칙으로 만든 초안을 바로 확인하고, 필요하면 셀을 눌러 수동으로 수정한 뒤 저장하세요.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setManualEditMode((prev) => !prev)}
                className={`rounded-full px-3 py-1 text-[11px] font-bold ${manualEditMode ? 'bg-orange-100 text-orange-700' : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)]'}`}
              >
                {manualEditMode ? '수동 수정 중' : '수동 수정'}
              </button>
              <button
                type="button"
                onClick={() => setManualAssignments({})}
                disabled={summary.manualCount === 0}
                className="rounded-full bg-[var(--toss-gray-1)] px-3 py-1 text-[11px] font-bold text-[var(--toss-gray-4)] disabled:opacity-40"
              >
                수정 초기화
              </button>
              <span className="rounded-full bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-bold text-[var(--toss-blue)]">
                {previewRows.length}명 표시 · 수동 수정 {summary.manualCount}건
              </span>
            </div>
          </div>

          {workingShifts.length === 0 ? (
            <div className="mt-4 rounded-[18px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-6 text-sm font-semibold text-[var(--toss-gray-3)]">
              선택한 사업체에 등록된 근무형태가 없습니다. 먼저 근무형태 관리에서 근무유형을 등록하세요.
            </div>
          ) : targetStaffs.length === 0 ? (
            <div className="mt-4 rounded-[18px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-6 text-sm font-semibold text-[var(--toss-gray-3)]">
              선택한 팀에 직원이 없습니다.
            </div>
          ) : previewRows.length === 0 ? (
            <div className="mt-4 rounded-[18px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-6 text-sm font-semibold text-[var(--toss-gray-3)]">
              근무표 자동 생성 버튼을 누르면 저장된 패턴 기준의 월간 초안이 여기에 표시됩니다.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="border-collapse" style={{ minWidth: `${260 + monthDates.length * 50}px` }}>
                <thead>
                  <tr>
                    <th className="sticky left-0 z-20 min-w-[260px] border-b border-[var(--toss-border)] bg-[var(--toss-card)] px-4 py-3 text-left text-[11px] font-bold text-[var(--toss-gray-3)]">
                      직원
                    </th>
                    {monthDates.map((date) => {
                      const day = Number(date.slice(-2));
                      const weekday = WEEKDAY_LABELS[new Date(`${date}T00:00:00`).getDay()];
                      return (
                        <th
                          key={date}
                          className="min-w-[50px] border-b border-[var(--toss-border)] bg-[var(--toss-card)] px-2 py-3 text-center text-[10px] font-bold text-[var(--toss-gray-3)]"
                        >
                          <div>{day}</div>
                          <div className="mt-1 text-[9px]">{weekday}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.staff.id} className="border-b border-[var(--toss-border)] last:border-b-0">
                      <td className="sticky left-0 z-10 bg-[var(--toss-card)] px-4 py-3">
                        <p className="text-sm font-bold text-[var(--foreground)]">{row.staff.name}</p>
                        <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                          {row.config.pattern} · {getDepartmentName(row.staff)}
                        </p>
                        <p className="mt-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">
                          근무 {row.counts.work} · OFF {row.counts.off} · N {row.counts.night}
                        </p>
                      </td>
                      {row.cells.map((cell) => (
                        <td key={cell.date} className="px-1 py-2 text-center">
                          <button
                            type="button"
                            disabled={!manualEditMode}
                            onClick={() =>
                              cycleManualAssignment({
                                staffId: String(row.staff.id),
                                date: cell.date,
                                currentShiftId: cell.shiftId,
                                baseShiftId: cell.baseShiftId,
                              })
                            }
                            className={`inline-flex h-8 min-w-[40px] items-center justify-center rounded-[10px] border px-1 text-[11px] font-black transition-all ${cell.badgeClass} ${manualEditMode ? 'cursor-pointer hover:scale-105' : 'cursor-default'} ${cell.isManual ? 'ring-2 ring-[var(--toss-blue)] ring-offset-1' : ''}`}
                            title={`${row.staff.name} ${cell.date} ${cell.shiftName}${manualEditMode ? ' · 클릭해서 변경' : ''}`}
                          >
                            {cell.code}
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
      <div className="rounded-[24px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="mt-2 text-xl font-bold text-[var(--foreground)]">교대근무 생성 마법사</h3>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-0">
              <div className="rounded-[14px] border border-[var(--toss-border)] bg-[var(--input-bg)] px-3 py-2">
                <SmartMonthPicker
                  value={selectedMonth}
                  onChange={(value) => setSelectedMonth(value)}
                  className="w-[150px]"
                  inputClassName="text-sm font-semibold text-[var(--foreground)]"
                />
              </div>
            </label>
            <button
              type="button"
              onClick={openWizard}
              className="rounded-[14px] border border-[var(--toss-border)] bg-white px-4 py-3 text-sm font-bold text-[var(--foreground)] transition-colors hover:border-[var(--toss-blue)] hover:text-[var(--toss-blue)]"
              data-testid="roster-wizard-open"
            >
              근무표 생성 마법사
            </button>
            <button
              type="button"
              onClick={requestGeminiRecommendation}
              disabled={geminiLoading || loadingShifts || workingShifts.length === 0 || targetStaffs.length === 0}
              className="rounded-[14px] border border-[var(--toss-blue)] bg-[var(--toss-blue-light)] px-4 py-3 text-sm font-bold text-[var(--toss-blue)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="roster-gemini-recommend"
            >
              {geminiLoading ? 'Gemini 추천 중...' : 'Gemini 팀 추천'}
            </button>
            <button
              type="button"
              onClick={saveAssignments}
              disabled={saving || loadingShifts || previewRows.length === 0}
              className="rounded-[14px] bg-[var(--toss-blue)] px-4 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? '저장 중...' : '월간 근무표 저장'}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4 xl:grid-cols-6">
          <div className="rounded-[18px] bg-[var(--toss-gray-1)] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">사업체</p>
            <p className="mt-2 text-base font-bold text-[var(--foreground)]">{selectedCompany || '-'}</p>
            {companyLockedByHrFilter && (
              <p className="mt-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">인사관리 사업체 필터와 연동 중</p>
            )}
          </div>
          <div className="rounded-[18px] bg-[var(--toss-gray-1)] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">팀</p>
            <p className="mt-2 text-base font-bold text-[var(--foreground)]">{selectedDepartment || '-'}</p>
          </div>
          <div className="rounded-[18px] bg-[var(--toss-gray-1)] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">대상 인원</p>
            <p className="mt-2 text-2xl font-bold text-[var(--foreground)]">{summary.staffCount}명</p>
          </div>
          <div className="rounded-[18px] bg-[var(--toss-gray-1)] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">편성 인원</p>
            <p className="mt-2 text-2xl font-bold text-[var(--foreground)]">{summary.enabledCount}명</p>
          </div>
          <div className="rounded-[18px] bg-[var(--toss-gray-1)] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">선택 패턴</p>
            <p className="mt-2 text-base font-bold text-[var(--foreground)]">{effectivePlannerPattern}</p>
          </div>
          <div className="rounded-[18px] bg-[var(--toss-gray-1)] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">수동 수정</p>
            <p className="mt-2 text-2xl font-bold text-[var(--foreground)]">{summary.manualCount}건</p>
          </div>
        </div>

        {geminiSummary && (
          <div
            className="mt-4 rounded-[20px] border border-[var(--toss-blue)]/20 bg-[var(--toss-blue-light)]/60 p-4"
            data-testid="roster-gemini-summary"
          >
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--toss-blue)]">
                  Gemini Team Recommendation
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-[var(--foreground)]">
                  {geminiSummary}
                </p>
              </div>
              {geminiAppliedAt && (
                <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                  적용 시각 {geminiAppliedAt}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-[24px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h4 className="text-base font-bold text-[var(--foreground)]">자동생성 규칙 만들기</h4>
            <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
              규칙은 여기서 직접 만들고 저장합니다. 마법사에서는 저장된 규칙만 불러와 생성합니다.
            </p>
          </div>
          {loadingShifts && <span className="text-[12px] font-semibold text-[var(--toss-blue)]">근무유형 불러오는 중...</span>}
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="rounded-[20px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-4">
            <div className="grid gap-3 md:grid-cols-2">
              {[
                { value: CUSTOM_PATTERN_VALUE, label: '순환 규칙', desc: '1차~3차와 OFF를 원하는 순서대로 반복' },
                { value: WEEKLY_TEMPLATE_PATTERN_VALUE, label: '주차 규칙', desc: '1~4주 주기로 요일별 근무를 반복' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPlannerPattern(option.value)}
                  className={`rounded-[18px] border p-4 text-left transition-all ${effectivePlannerPattern === option.value ? 'border-[var(--toss-blue)] bg-[var(--toss-blue-light)]/70 ring-1 ring-[var(--toss-blue)]/20' : 'border-[var(--toss-border)] bg-white hover:border-[var(--toss-blue)]/50'}`}
                  data-testid={option.value === CUSTOM_PATTERN_VALUE ? 'planner-rule-type-custom' : 'planner-rule-type-weekly'}
                >
                  <p className="text-sm font-bold text-[var(--foreground)]">{option.label}</p>
                  <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">{option.desc}</p>
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {[
                { label: '1차 근무', value: plannerPrimaryShiftId, setter: setPlannerPrimaryShiftId },
                { label: '2차 근무', value: plannerSecondaryShiftId, setter: setPlannerSecondaryShiftId },
                { label: '3차 근무', value: plannerTertiaryShiftId, setter: setPlannerTertiaryShiftId },
              ].map((field) => (
                <label key={field.label} className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">{field.label}</span>
                  <select
                    value={field.value}
                    onChange={(event) => field.setter(event.target.value)}
                    className="rounded-[14px] border border-[var(--toss-border)] bg-white px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                    data-testid={`planner-shift-${field.label.startsWith('1') ? '1' : field.label.startsWith('2') ? '2' : '3'}`}
                  >
                    {workingShifts.map((shift) => (
                      <option key={shift.id} value={shift.id}>
                        {shift.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-bold text-[var(--toss-blue)]">
                {selectedCompany || '사업체 미선택'} / {selectedDepartment || '팀 미선택'}
              </span>
              <span className="rounded-full border border-[var(--toss-border)] bg-white px-3 py-1 text-[11px] font-semibold text-[var(--foreground)]">
                규칙 타입: {effectivePlannerPattern}
              </span>
              {currentPlannerShifts.map((shiftName, index) => (
                <span
                  key={`${shiftName}-${index}`}
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${getShiftBadgeClass(shiftName)}`}
                >
                  {index + 1}차 · {shiftName} · {getShiftCode(shiftName)}
                </span>
              ))}
            </div>

            {plannerUsesCustomPattern && (
              <div className="mt-4 rounded-[18px] border border-dashed border-[var(--toss-blue)]/30 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-[var(--foreground)]">순환 규칙 조립</p>
                    <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                      1차~3차 근무와 OFF를 눌러 순서를 쌓으세요.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearPlannerCustomPatternSequence}
                    className="rounded-full border border-[var(--toss-border)] bg-white px-3 py-1 text-[11px] font-bold text-[var(--toss-gray-3)]"
                    data-testid="planner-custom-clear"
                  >
                    순서 비우기
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {availablePlannerShiftIds.map((shiftId, index) => {
                    const shiftName = getShiftNameById(shiftId, workShifts);
                    return (
                      <button
                        key={shiftId}
                        type="button"
                        onClick={() => appendPlannerCustomPatternStep(shiftId)}
                        className={`rounded-full border px-3 py-2 text-[11px] font-semibold transition-all hover:opacity-90 ${getShiftBadgeClass(shiftName)}`}
                        data-testid={`planner-custom-add-shift-${index + 1}`}
                      >
                        + {index + 1}차 {shiftName}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => appendPlannerCustomPatternStep(OFF_SHIFT_TOKEN)}
                    className="rounded-full border border-[var(--toss-border)] bg-[var(--toss-gray-1)] px-3 py-2 text-[11px] font-semibold text-[var(--foreground)] transition-all hover:border-[var(--toss-blue)]/40"
                    data-testid="planner-custom-add-off"
                  >
                    + OFF
                  </button>
                </div>

                {effectivePlannerCustomPatternSequence.length === 0 ? (
                  <div className="mt-4 rounded-[16px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
                    아직 규칙 순서가 없습니다.
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {effectivePlannerCustomPatternSequence.map((token, index) => {
                      const tokenLabel = getPatternSequenceLabel(token, workShifts);
                      return (
                        <div
                          key={`${token}-${index}`}
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-semibold ${token === OFF_SHIFT_TOKEN ? 'border-[var(--toss-border)] bg-[var(--toss-gray-1)] text-[var(--foreground)]' : getShiftBadgeClass(tokenLabel)}`}
                        >
                          <span>{index + 1}</span>
                          <span>{tokenLabel}</span>
                          <button
                            type="button"
                            onClick={() => removePlannerCustomPatternStep(index)}
                            className="rounded-full bg-white/80 px-2 py-[2px] text-[10px] font-black text-[var(--foreground)]"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {plannerUsesWeeklyTemplate && (
              <div className="mt-4 rounded-[18px] border border-dashed border-[var(--toss-blue)]/30 bg-white p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-bold text-[var(--foreground)]">주차 규칙 조립</p>
                    <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                      1~4주 주기로 반복할 요일과 근무를 직접 정하세요.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3, 4].map((count) => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => setPlannerWeeklyTemplateWeekCount(count)}
                        className={`rounded-full border px-3 py-1 text-[11px] font-bold ${effectivePlannerWeeklyTemplateWeeks.length === count ? 'border-[var(--toss-blue)] bg-[var(--toss-blue-light)] text-[var(--toss-blue)]' : 'border-[var(--toss-border)] bg-white text-[var(--toss-gray-3)]'}`}
                        data-testid={`planner-week-count-${count}`}
                      >
                        {count}주
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  {effectivePlannerWeeklyTemplateWeeks.map((week, weekIndex) => (
                    <div
                      key={`${week.shiftId}-${weekIndex}`}
                      className="rounded-[18px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="text-sm font-bold text-[var(--foreground)]">{getWeeklyTemplateWeekLabel(weekIndex)}</p>
                          <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                            반복 요일: {formatWeekdaySummary(week.activeWeekdays)}
                          </p>
                        </div>
                        <select
                          value={week.shiftId}
                          onChange={(event) =>
                            updatePlannerWeeklyTemplateWeek(weekIndex, { shiftId: event.target.value })
                          }
                          className="rounded-[14px] border border-[var(--toss-border)] bg-white px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                          data-testid={`planner-week-${weekIndex + 1}-shift`}
                        >
                          {availablePlannerShiftIds.map((shiftId) => (
                            <option key={shiftId} value={shiftId}>
                              {getShiftNameById(shiftId, workShifts)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {[
                          { label: '월~금', weekdays: [1, 2, 3, 4, 5] },
                          { label: '월~토', weekdays: [1, 2, 3, 4, 5, 6] },
                          { label: '월~일', weekdays: [1, 2, 3, 4, 5, 6, 0] },
                          { label: '휴무주', weekdays: [] },
                        ].map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => applyPlannerWeeklyTemplateWeekdays(weekIndex, preset.weekdays)}
                            className="rounded-full border border-[var(--toss-border)] bg-white px-3 py-1 text-[11px] font-bold text-[var(--foreground)]"
                            data-testid={`planner-week-${weekIndex + 1}-preset-${preset.weekdays.length === 5 ? 'weekdays' : preset.weekdays.length === 6 ? 'weekdays-sat' : preset.weekdays.length === 7 ? 'all-days' : 'off'}`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>

                      <div className="mt-4 grid grid-cols-7 gap-2">
                        {WEEKDAY_PICKER_ORDER.map((weekday) => {
                          const selected = week.activeWeekdays.includes(weekday);
                          return (
                            <button
                              key={`${weekIndex}-${weekday}`}
                              type="button"
                              onClick={() => togglePlannerWeeklyTemplateWeekday(weekIndex, weekday)}
                              className={`rounded-[12px] border px-2 py-3 text-[11px] font-bold transition-all ${selected ? 'border-[var(--toss-blue)] bg-[var(--toss-blue-light)] text-[var(--toss-blue)]' : 'border-[var(--toss-border)] bg-white text-[var(--toss-gray-3)]'}`}
                            >
                              {WEEKDAY_LABELS[weekday]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-[20px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-4">
            <div className="rounded-[18px] border border-[var(--toss-border)] bg-white p-4">
              <p className="text-sm font-bold text-[var(--foreground)]">규칙 저장</p>
              <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                지금 만든 규칙을 저장하면 자동생성 마법사에서 불러올 수 있습니다.
              </p>
              <div className="mt-4 grid gap-2">
                <input
                  type="text"
                  value={plannerPresetName}
                  onChange={(event) => setPlannerPresetName(event.target.value)}
                  placeholder="예: 외래 1주5일 / 2주6일"
                  className="rounded-[14px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="planner-preset-name"
                />
                <button
                  type="button"
                  onClick={savePlannerPreset}
                  className="rounded-[14px] bg-[var(--toss-blue)] px-4 py-3 text-sm font-bold text-white"
                  data-testid="planner-preset-save"
                >
                  규칙 저장
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-[18px] border border-[var(--toss-border)] bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">저장한 규칙</p>
                  <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                    저장한 규칙은 여기서 다시 적용하거나 삭제할 수 있습니다.
                  </p>
                </div>
                <span className="rounded-full bg-[var(--toss-blue-light)] px-3 py-1 text-[10px] font-bold text-[var(--toss-blue)]">
                  {userWizardPresets.length}개
                </span>
              </div>

              {userWizardPresets.length === 0 ? (
                <div className="mt-4 rounded-[16px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
                  아직 저장한 규칙이 없습니다.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {userWizardPresets.map((preset) => (
                    <div
                      key={preset.id}
                      className="rounded-[16px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-4"
                      data-testid={`planner-preset-${preset.id}`}
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-sm font-bold text-[var(--foreground)]">{preset.name}</p>
                          <p className="mt-1 text-[11px] font-semibold text-[var(--toss-blue)]">{preset.pattern}</p>
                          <p className="mt-2 text-[12px] leading-5 text-[var(--toss-gray-3)]">
                            {preset.description || buildWizardPresetDescription(preset.pattern, [], preset.shiftSlotCount)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => applyPlannerPreset(preset)}
                            className="rounded-full bg-[var(--toss-blue)] px-3 py-2 text-[11px] font-bold text-white"
                            data-testid={`planner-preset-apply-${preset.id}`}
                          >
                            규칙 적용
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteWizardPreset(preset.id)}
                            className="rounded-full border border-[var(--toss-border)] bg-white px-3 py-2 text-[11px] font-bold text-[var(--toss-gray-3)]"
                            data-testid={`planner-preset-delete-${preset.id}`}
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[24px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-base font-bold text-[var(--foreground)]">대상 직원 세부 조정</h4>
          </div>
          {loadingShifts && <span className="text-[12px] font-semibold text-[var(--toss-blue)]">근무형태 불러오는 중...</span>}
        </div>

        {workingShifts.length === 0 ? (
          <div className="mt-4 rounded-[18px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-6 text-sm font-semibold text-[var(--toss-gray-3)]">
            선택한 사업체에 등록된 근무유형이 없습니다. 먼저 근무형태 관리에서 주간/이브닝/나이트/휴무 코드를 등록하세요.
          </div>
        ) : targetStaffs.length === 0 ? (
          <div className="mt-4 rounded-[18px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-6 text-sm font-semibold text-[var(--toss-gray-3)]">
            선택한 팀에 직원이 없습니다. 생성 마법사에서 사업체와 팀을 다시 선택하세요.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2">
              <thead>
                <tr className="text-left text-[11px] font-bold text-[var(--toss-gray-3)]">
                  <th className="px-3 py-2">적용</th>
                  <th className="px-3 py-2">직원</th>
                  <th className="px-3 py-2">패턴</th>
                  <th className="px-3 py-2">주 근무</th>
                  <th className="px-3 py-2">보조 근무</th>
                  <th className="px-3 py-2">야간/3차</th>
                  <th className="px-3 py-2">시작 오프셋</th>
                  <th className="px-3 py-2">월 나이트</th>
                </tr>
              </thead>
              <tbody>
                {targetStaffs.map((staff: any, index: number) => {
                  const config =
                    staffConfigs[staff.id] ||
                    buildInitialConfig(staff, index, defaultShiftOrder.length ? defaultShiftOrder : workingShifts, monthDates.length);
                  const requiredShiftCount = getRequiredShiftCount(config.pattern);
                  const availablePatternOptions =
                    config.pattern === CUSTOM_PATTERN_VALUE
                      ? WIZARD_PATTERN_OPTIONS
                      : PATTERN_OPTIONS;
                  return (
                    <tr key={staff.id} className="rounded-[18px] bg-[var(--toss-gray-1)]">
                      <td className="rounded-l-[18px] px-3 py-3">
                        <input
                          type="checkbox"
                          checked={config.enabled}
                          onChange={(e) => updateConfig(staff, index, { enabled: e.target.checked })}
                          className="h-4 w-4 accent-[var(--toss-blue)]"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-sm font-bold text-[var(--foreground)]">{staff.name}</p>
                        <p className="text-[11px] text-[var(--toss-gray-3)]">
                          {getDepartmentName(staff)} · {staff.position || '직원'}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={config.pattern}
                          onChange={(e) =>
                            updateConfig(staff, index, {
                              pattern: e.target.value,
                              nightShiftCount: isNightPattern(e.target.value)
                                ? inferDefaultNightShiftCount(e.target.value, monthDates.length)
                                : 0,
                            })
                          }
                          className="w-full rounded-[12px] border border-[var(--toss-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                        >
                          {availablePatternOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {config.pattern === CUSTOM_PATTERN_VALUE && config.customPatternSequence.length > 0 && (
                          <p className="mt-2 text-[11px] font-medium text-[var(--toss-gray-3)]">
                            순환: {config.customPatternSequence.map((token) => getPatternSequenceLabel(token, workShifts)).join(' → ')}
                          </p>
                        )}
                        {isWeeklyTemplatePattern(config.pattern) && config.weeklyTemplateWeeks.length > 0 && (
                          <p className="mt-2 text-[11px] font-medium text-[var(--toss-gray-3)]">
                            {config.weeklyTemplateWeeks
                              .map(
                                (week, weekIndex) =>
                                  `${getWeeklyTemplateWeekLabel(weekIndex)} ${formatWeekdaySummary(week.activeWeekdays)}`
                              )
                              .join(' / ')}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={config.primaryShiftId}
                          onChange={(e) => updateConfig(staff, index, { primaryShiftId: e.target.value })}
                          className="w-full rounded-[12px] border border-[var(--toss-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                        >
                          {workingShifts.map((shift) => (
                            <option key={shift.id} value={shift.id}>
                              {shift.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={config.secondaryShiftId}
                          onChange={(e) => updateConfig(staff, index, { secondaryShiftId: e.target.value })}
                          disabled={requiredShiftCount < 2}
                          className="w-full rounded-[12px] border border-[var(--toss-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:bg-zinc-100"
                        >
                          {workingShifts.map((shift) => (
                            <option key={shift.id} value={shift.id}>
                              {shift.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={config.tertiaryShiftId}
                          onChange={(e) => updateConfig(staff, index, { tertiaryShiftId: e.target.value })}
                          disabled={requiredShiftCount < 3}
                          className="w-full rounded-[12px] border border-[var(--toss-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:bg-zinc-100"
                        >
                          {workingShifts.map((shift) => (
                            <option key={shift.id} value={shift.id}>
                              {shift.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min={0}
                          value={config.startOffset}
                          onChange={(e) => updateConfig(staff, index, { startOffset: Number(e.target.value) || 0 })}
                          disabled={isWeeklyTemplatePattern(config.pattern)}
                          className="w-24 rounded-[12px] border border-[var(--toss-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:bg-zinc-100"
                        />
                      </td>
                      <td className="rounded-r-[18px] px-3 py-3">
                        <input
                          type="number"
                          min={0}
                          max={monthDates.length}
                          value={config.nightShiftCount}
                          disabled={!isNightPattern(config.pattern)}
                          onChange={(e) =>
                            updateConfig(staff, index, {
                              nightShiftCount: clampNightShiftCount(Number(e.target.value) || 0, monthDates.length),
                            })
                          }
                          className="w-24 rounded-[12px] border border-[var(--toss-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:bg-zinc-100"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-[24px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h4 className="text-base font-bold text-[var(--foreground)]">월간 미리보기</h4>
            <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
              셀을 직접 눌러 D / E / N / OFF를 임의 수정할 수 있습니다. 저장하면 근태 쪽 `shift_assignments`에 바로 반영됩니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setManualEditMode((prev) => !prev)}
              className={`rounded-full px-3 py-1 text-[11px] font-bold ${manualEditMode ? 'bg-orange-100 text-orange-700' : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)]'}`}
            >
              {manualEditMode ? '수동 수정 중' : '수동 수정'}
            </button>
            <button
              type="button"
              onClick={() => setManualAssignments({})}
              disabled={summary.manualCount === 0}
              className="rounded-full bg-[var(--toss-gray-1)] px-3 py-1 text-[11px] font-bold text-[var(--toss-gray-4)] disabled:opacity-40"
            >
              수정 초기화
            </button>
            <span className="rounded-full bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-bold text-[var(--toss-blue)]">
              {previewRows.length}명 표시 · 수동 수정 {summary.manualCount}건
            </span>
          </div>
        </div>

        <p className="mt-3 text-[11px] text-[var(--toss-gray-3)]">
          수동 수정 모드에서는 셀을 클릭할 때 근무유형이 순환 변경됩니다. 생성 결과로 되돌리려면 같은 셀을 다시 순환하거나 `수정 초기화`를 사용하세요.
        </p>

        {previewRows.length === 0 ? (
          <div className="mt-4 rounded-[18px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-6 text-sm font-semibold text-[var(--toss-gray-3)]">
            생성 마법사로 팀과 직원을 선택하면 여기에서 월간 근무표를 확인할 수 있습니다.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="border-collapse" style={{ minWidth: `${260 + monthDates.length * 50}px` }}>
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 min-w-[260px] border-b border-[var(--toss-border)] bg-[var(--toss-card)] px-4 py-3 text-left text-[11px] font-bold text-[var(--toss-gray-3)]">
                    직원
                  </th>
                  {monthDates.map((date) => {
                    const day = Number(date.slice(-2));
                    const weekday = WEEKDAY_LABELS[new Date(`${date}T00:00:00`).getDay()];
                    return (
                      <th
                        key={date}
                        className="min-w-[50px] border-b border-[var(--toss-border)] bg-[var(--toss-card)] px-2 py-3 text-center text-[10px] font-bold text-[var(--toss-gray-3)]"
                      >
                        <div>{day}</div>
                        <div className="mt-1 text-[9px]">{weekday}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr key={row.staff.id} className="border-b border-[var(--toss-border)] last:border-b-0">
                    <td className="sticky left-0 z-10 bg-[var(--toss-card)] px-4 py-3">
                      <p className="text-sm font-bold text-[var(--foreground)]">{row.staff.name}</p>
                      <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                        {row.config.pattern} · {getDepartmentName(row.staff)}
                      </p>
                      <p className="mt-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">
                        근무 {row.counts.work} · OFF {row.counts.off} · N {row.counts.night}
                      </p>
                    </td>
                    {row.cells.map((cell) => (
                      <td key={cell.date} className="px-1 py-2 text-center">
                        <button
                          type="button"
                          disabled={!manualEditMode}
                          onClick={() => cycleManualAssignment({
                            staffId: String(row.staff.id),
                            date: cell.date,
                            currentShiftId: cell.shiftId,
                            baseShiftId: cell.baseShiftId,
                          })}
                          className={`inline-flex h-8 min-w-[40px] items-center justify-center rounded-[10px] border px-1 text-[11px] font-black transition-all ${cell.badgeClass} ${manualEditMode ? 'cursor-pointer hover:scale-105' : 'cursor-default'} ${cell.isManual ? 'ring-2 ring-[var(--toss-blue)] ring-offset-1' : ''}`}
                          title={`${row.staff.name} ${cell.date} ${cell.shiftName}${manualEditMode ? ' · 클릭하여 변경' : ''}`}
                        >
                          {cell.code}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>

      {wizardOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-[var(--toss-border)] bg-[var(--toss-card)] shadow-2xl">
            <div className="border-b border-[var(--toss-border)] bg-[var(--page-bg)] px-6 py-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="text-2xl font-black tracking-[-0.03em] text-[var(--foreground)]">
                    <span className="bg-gradient-to-r from-[var(--toss-blue)] to-fuchsia-500 bg-clip-text text-transparent">
                      RUN SHIFT
                    </span>{' '}
                    마법사
                  </h3>
                  <p className="mt-1 text-sm text-[var(--toss-gray-3)]">
                    팀을 카드로 선택하고, 직원을 고른 뒤, 근무유형을 체크해서 월간 근무표를 바로 생성합니다.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { step: 1 as WizardStep, label: '팀 선택' },
                    { step: 2 as WizardStep, label: '직원 선택' },
                    { step: 3 as WizardStep, label: '패턴 · 근무유형' },
                    { step: 4 as WizardStep, label: '예외 일정' },
                  ].map(({ step, label }) => (
                    <div
                      key={step}
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${wizardStep === step ? 'bg-[var(--toss-blue)] text-white' : wizardStep > step ? 'bg-[var(--toss-blue-light)] text-[var(--toss-blue)]' : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-3)]'}`}
                    >
                      {step}. {label}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              {wizardStep === 1 && (
                <div className="space-y-6">
                  <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
                    <div className="space-y-4">
                      <label className="flex flex-col gap-0">
                        <div className="rounded-[14px] border border-[var(--toss-border)] bg-[var(--input-bg)] px-3 py-2">
                          <SmartMonthPicker
                            value={selectedMonth}
                            onChange={(value) => setSelectedMonth(value)}
                            className="w-[150px]"
                            inputClassName="text-sm font-semibold text-[var(--foreground)]"
                          />
                        </div>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">사업체</span>
                        <select
                          value={selectedCompany}
                          onChange={(e) => setSelectedCompany(e.target.value)}
                          disabled={!isAdmin || companyLockedByHrFilter}
                          className="rounded-[14px] border border-[var(--toss-border)] bg-[var(--input-bg)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:bg-zinc-50"
                        >
                          {companyOptions.map((company) => (
                            <option key={company} value={company}>
                              {company}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-[22px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] px-5 py-4">
                        <p className="text-sm font-bold text-[var(--foreground)]">어떤 팀의 근무표를 만들까요?</p>
                        <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                          병동처럼 3교대 팀은 이후 단계에서 데이 / 이브닝 / 나이트를 체크해서 D / E / N / OFF 형태로 만들 수 있습니다.
                        </p>
                      </div>

                      {teamOptions.length === 0 ? (
                        <div className="rounded-[20px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-6 text-sm font-semibold text-[var(--toss-gray-3)]">
                          선택한 사업체에 등록된 팀이 없습니다.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          {teamOptions.map((department) => {
                            const teamStaffCount = activeStaffs.filter(
                              (staff: any) =>
                                staff.company === selectedCompany && getDepartmentName(staff) === department
                            ).length;
                            const selected = selectedDepartment === department;
                            return (
                              <button
                                key={department}
                                type="button"
                                onClick={() => setSelectedDepartment(department)}
                                className={`rounded-[24px] border px-7 py-6 text-left transition-all ${selected ? 'border-[var(--toss-blue)] bg-[var(--toss-blue-light)]/70 shadow-[0_18px_40px_rgba(37,99,235,0.12)] ring-1 ring-[var(--toss-blue)]/20' : 'border-[var(--toss-border)] bg-white hover:border-[var(--toss-blue)]/40 hover:shadow-[0_16px_32px_rgba(15,23,42,0.08)]'}`}
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div className={`flex h-12 w-12 items-center justify-center rounded-[16px] text-xl ${selected ? 'bg-white text-[var(--toss-blue)]' : 'bg-[var(--toss-gray-1)] text-[var(--toss-blue)]'}`}>
                                    🏥
                                  </div>
                                  {selected && (
                                    <span className="rounded-full bg-[var(--toss-blue)] px-3 py-1 text-[10px] font-bold text-white">
                                      선택됨
                                    </span>
                                  )}
                                </div>
                                <p className="mt-6 text-xl font-bold tracking-[-0.02em] text-[var(--foreground)]">{department}</p>
                                <p className="mt-3 text-sm text-[var(--toss-gray-3)]">
                                  {selectedCompany || '사업체 미선택'} · 직원 {teamStaffCount}명
                                </p>
                                <p className="mt-3 text-[12px] leading-5 text-[var(--toss-gray-3)]">
                                  {workingShifts.length >= 3 ? '3교대/야간전담 팀에 적합한 근무표를 생성할 수 있습니다.' : '등록된 근무유형 기준으로 월간 근무표를 생성합니다.'}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-base font-bold text-[var(--foreground)]">{selectedDepartment} 팀 직원 선택</h4>
                      <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                        근무표를 생성할 직원을 고르세요. 선택한 직원만 아래 미리보기에 생성됩니다.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setWizardSelectedStaffIds(targetStaffs.map((staff: any) => String(staff.id)))}
                        className="rounded-full border border-[var(--toss-border)] bg-white px-3 py-1 text-[11px] font-bold text-[var(--foreground)]"
                      >
                        전체 선택
                      </button>
                      <button
                        type="button"
                        onClick={() => setWizardSelectedStaffIds([])}
                        className="rounded-full border border-[var(--toss-border)] bg-white px-3 py-1 text-[11px] font-bold text-[var(--toss-gray-3)]"
                      >
                        전체 해제
                      </button>
                    </div>
                  </div>

                  {targetStaffs.length === 0 ? (
                    <div className="rounded-[20px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-6 text-sm font-semibold text-[var(--toss-gray-3)]">
                      선택한 팀에 직원이 없습니다.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {targetStaffs.map((staff: any) => {
                        const selected = wizardSelectedStaffIds.includes(String(staff.id));
                        return (
                          <button
                            key={staff.id}
                            type="button"
                            onClick={() => toggleWizardStaff(String(staff.id))}
                            className={`rounded-[18px] border p-4 text-left transition-all ${selected ? 'border-[var(--toss-blue)] bg-[var(--toss-blue-light)]/70 ring-1 ring-[var(--toss-blue)]/30' : 'border-[var(--toss-border)] bg-white hover:border-[var(--toss-blue)]/50'}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[var(--tab-bg)] text-sm font-bold text-[var(--toss-blue)]">
                                {String(staff.name || '?').slice(0, 1)}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-[var(--foreground)]">{staff.name}</p>
                                <p className="text-[11px] text-[var(--toss-gray-3)]">
                                  {getDepartmentName(staff)} · {staff.position || '직원'}
                                </p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {wizardStep === 3 && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-base font-bold text-[var(--foreground)]">자동생성 규칙 불러오기</h4>
                    <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                      바깥에서 저장한 규칙을 불러와서 이번 근무표 생성 기준으로 사용합니다.
                    </p>
                  </div>

                  <div className="rounded-[20px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-sm font-bold text-[var(--foreground)]">저장한 규칙 선택</p>
                        <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                          마법사 밖에서 직접 만든 규칙만 여기에 표시됩니다.
                        </p>
                      </div>
                      <div className="w-full lg:max-w-xl">
                        <select
                          value={wizardSelectedPresetId}
                          onChange={(event) => {
                            const nextId = event.target.value;
                            setWizardSelectedPresetId(nextId);
                            if (!nextId) {
                              resetWizardRuleSelection();
                              return;
                            }
                            const preset = userWizardPresets.find((item) => item.id === nextId);
                            if (preset) {
                              applyWizardPreset(preset);
                            }
                          }}
                          className="rounded-[14px] border border-[var(--toss-border)] bg-white px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                          data-testid="roster-wizard-preset-select"
                        >
                          <option value="">규칙을 선택하세요</option>
                          {userWizardPresets.map((preset) => (
                            <option key={preset.id} value={preset.id}>
                              {preset.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {userWizardPresets.length === 0 ? (
                      <div className="mt-4 rounded-[16px] border border-dashed border-[var(--toss-border)] bg-white p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
                        먼저 바깥의 `자동생성 규칙 만들기`에서 규칙을 저장하세요.
                      </div>
                    ) : wizardSelectedPresetId ? (
                      <div className="mt-4 rounded-[18px] border border-[var(--toss-border)] bg-white p-4">
                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-bold text-[var(--toss-blue)]">
                            선택된 규칙
                          </span>
                          <span
                            className="rounded-full border border-[var(--toss-border)] bg-white px-3 py-1 text-[11px] font-semibold text-[var(--foreground)]"
                            data-testid="roster-wizard-loaded-preset-name"
                          >
                            {selectedWizardPreset?.name || ''}
                          </span>
                          <span className="rounded-full border border-[var(--toss-border)] bg-white px-3 py-1 text-[11px] font-semibold text-[var(--foreground)]">
                            타입: {wizardPattern}
                          </span>
                          {orderedWizardShiftIds.map((shiftId, index) => (
                            <span
                              key={shiftId}
                              className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${getShiftBadgeClass(getShiftNameById(shiftId, workShifts))}`}
                            >
                              {index + 1}차 · {getShiftNameById(shiftId, workShifts)}
                            </span>
                          ))}
                        </div>

                        {wizardUsesCustomPattern && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {effectiveWizardCustomPatternSequence.map((token, index) => {
                              const tokenLabel = getPatternSequenceLabel(token, workShifts);
                              return (
                                <span
                                  key={`${token}-${index}`}
                                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${token === OFF_SHIFT_TOKEN ? 'border-[var(--toss-border)] bg-[var(--toss-gray-1)] text-[var(--foreground)]' : getShiftBadgeClass(tokenLabel)}`}
                                >
                                  {index + 1}. {tokenLabel}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {wizardUsesWeeklyTemplate && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {effectiveWizardWeeklyTemplateWeeks.map((week, index) => (
                              <span
                                key={`${week.shiftId}-${index}`}
                                className="rounded-full border border-[var(--toss-border)] bg-[var(--toss-gray-1)] px-3 py-1 text-[11px] font-semibold text-[var(--foreground)]"
                              >
                                {getWeeklyTemplateWeekLabel(index)} · {getShiftNameById(week.shiftId, workShifts)} · {formatWeekdaySummary(week.activeWeekdays)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-[16px] border border-dashed border-[var(--toss-border)] bg-white p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
                        사용할 규칙을 선택하면 요약이 표시됩니다.
                      </div>
                    )}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-[18px] bg-[var(--toss-gray-1)] p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">생성 대상</p>
                      <p className="mt-2 text-lg font-bold text-[var(--foreground)]">{wizardSelectedStaffIds.length}명</p>
                      <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">{selectedDepartment}</p>
                    </div>
                    <div className="rounded-[18px] bg-[var(--toss-gray-1)] p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">적용 방식</p>
                      <p className="mt-2 text-lg font-bold text-[var(--foreground)]">
                        {wizardPattern || '규칙 미선택'}
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                        저장된 규칙을 그대로 불러와 생성합니다.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {wizardStep === 4 && (
                <div className="space-y-6" data-testid="roster-wizard-step-4">
                  <div>
                    <h4 className="text-base font-bold text-[var(--foreground)]">직원별 예외 일정 설정</h4>
                    <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                      필요한 직원만 특정 날짜를 OFF로 고정하고, 다음날 근무를 지정하세요. 선택하지 않으면 기본 패턴대로 생성됩니다.
                    </p>
                  </div>

                  {wizardSelectedStaffs.length === 0 ? (
                    <div className="rounded-[20px] border border-dashed border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-6 text-sm font-semibold text-[var(--toss-gray-3)]">
                      먼저 직원을 한 명 이상 선택하세요.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      {wizardSelectedStaffs.map((staff: any, index: number) => {
                        const staffId = String(staff.id);
                        const override = wizardOffOverrides[staffId] || {
                          enabled: false,
                          offDate: wizardOverrideDateOptions[index] || wizardOverrideDateOptions[0] || '',
                          nextShiftId: wizardOverrideShiftOptions[0]?.id || '',
                        };
                        const offDateIndex = monthDates.indexOf(override.offDate);
                        const nextDate = offDateIndex >= 0 ? monthDates[offDateIndex + 1] || '' : '';

                        return (
                          <div
                            key={staffId}
                            className="rounded-[22px] border border-[var(--toss-border)] bg-white p-5 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="text-base font-bold text-[var(--foreground)]">{staff.name}</p>
                                <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                                  {getDepartmentName(staff)} · {staff.position || '직원'}
                                </p>
                              </div>
                              <label className="inline-flex items-center gap-2 rounded-full bg-[var(--toss-gray-1)] px-3 py-2 text-[11px] font-bold text-[var(--foreground)]">
                                <input
                                  type="checkbox"
                                  checked={override.enabled}
                                  onChange={(event) =>
                                    updateWizardOffOverride(staffId, { enabled: event.target.checked })
                                  }
                                  data-testid={`roster-wizard-off-toggle-${staffId}`}
                                />
                                OFF 예외 사용
                              </label>
                            </div>

                            {override.enabled ? (
                              <div className="mt-4 grid gap-3 md:grid-cols-2">
                                <label className="flex flex-col gap-1">
                                  <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">OFF 날짜</span>
                                  <select
                                    value={override.offDate}
                                    onChange={(event) =>
                                      updateWizardOffOverride(staffId, { offDate: event.target.value })
                                    }
                                    className="rounded-[14px] border border-[var(--toss-border)] bg-white px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                                    data-testid={`roster-wizard-off-date-${staffId}`}
                                  >
                                    {wizardOverrideDateOptions.map((date) => (
                                      <option key={date} value={date}>
                                        {date} ({WEEKDAY_LABELS[new Date(`${date}T00:00:00`).getDay()]})
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="flex flex-col gap-1">
                                  <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">OFF 다음날 근무</span>
                                  <select
                                    value={override.nextShiftId}
                                    onChange={(event) =>
                                      updateWizardOffOverride(staffId, { nextShiftId: event.target.value })
                                    }
                                    className="rounded-[14px] border border-[var(--toss-border)] bg-white px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                                    data-testid={`roster-wizard-post-off-shift-${staffId}`}
                                  >
                                    {wizardOverrideShiftOptions.map((shift) => (
                                      <option key={shift.id} value={shift.id}>
                                        {shift.name} · {getShiftCode(shift.name)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <div className="rounded-[16px] bg-[var(--toss-gray-1)] px-4 py-3 text-[12px] font-semibold text-[var(--foreground)] md:col-span-2">
                                  {override.offDate || '날짜 미선택'} OFF
                                  {nextDate
                                    ? ` → ${nextDate} ${getShiftNameById(override.nextShiftId, workShifts)}`
                                    : ' → 다음날 없음'}
                                </div>
                              </div>
                            ) : (
                              <p className="mt-4 text-[12px] text-[var(--toss-gray-3)]">
                                기본 패턴 그대로 생성됩니다.
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-[var(--toss-border)] px-6 py-4">
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <button
                  type="button"
                  onClick={closeWizard}
                  className="rounded-[14px] border border-[var(--toss-border)] bg-white px-4 py-3 text-sm font-bold text-[var(--foreground)]"
                >
                  닫기
                </button>
                <div className="flex flex-wrap justify-end gap-2">
                  {wizardStep > 1 && (
                    <button
                      type="button"
                      onClick={() => setWizardStep((prev) => (prev - 1) as WizardStep)}
                      className="rounded-[14px] border border-[var(--toss-border)] bg-white px-4 py-3 text-sm font-bold text-[var(--foreground)]"
                    >
                      이전
                    </button>
                  )}
                  {wizardStep < 4 ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (wizardStep === 1 && (!selectedCompany || !selectedDepartment)) {
                          alert('사업체와 팀을 먼저 선택하세요.');
                          return;
                        }
                        if (wizardStep === 2 && wizardSelectedStaffIds.length === 0) {
                          alert('직원을 한 명 이상 선택하세요.');
                          return;
                        }
                        if (
                          !wizardUsesCustomPattern &&
                          !wizardUsesWeeklyTemplate &&
                          wizardStep === 3 &&
                          orderedWizardShiftIds.length < wizardRequiredShiftCount
                        ) {
                          alert(`${wizardPattern} 패턴에 필요한 근무유형 ${wizardRequiredShiftCount}개를 선택하세요.`);
                          return;
                        }
                        if (wizardUsesCustomPattern && wizardStep === 3 && orderedWizardShiftIds.length === 0) {
                          alert('커스텀 패턴에 사용할 근무유형을 1개 이상 선택하세요.');
                          return;
                        }
                        if (wizardUsesWeeklyTemplate && wizardStep === 3 && orderedWizardShiftIds.length === 0) {
                          alert('주차 템플릿에 사용할 근무유형을 1개 이상 선택하세요.');
                          return;
                        }
                        if (
                          wizardUsesCustomPattern &&
                          wizardStep === 3 &&
                          (effectiveWizardCustomPatternSequence.length === 0 ||
                            !effectiveWizardCustomPatternSequence.some((token) => token !== OFF_SHIFT_TOKEN))
                        ) {
                          alert('커스텀 패턴 순서를 만들고, 실제 근무유형을 1개 이상 포함해 주세요.');
                          return;
                        }
                        if (
                          wizardUsesWeeklyTemplate &&
                          wizardStep === 3 &&
                          !effectiveWizardWeeklyTemplateWeeks.some(
                            (week) => Boolean(week.shiftId) && week.activeWeekdays.length > 0
                          )
                        ) {
                          alert('주차 템플릿에는 근무가 들어가는 요일을 최소 1일 이상 지정하세요.');
                          return;
                        }
                        setWizardStep((prev) => (prev + 1) as WizardStep);
                      }}
                      className="rounded-[14px] bg-[var(--toss-blue)] px-4 py-3 text-sm font-bold text-white"
                    >
                      다음
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={applyWizard}
                      className="rounded-[14px] bg-[var(--toss-blue)] px-4 py-3 text-sm font-bold text-white"
                    >
                      근무표 생성
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
