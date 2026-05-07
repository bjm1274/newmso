import { isKoreanPublicHoliday } from '@/lib/korean-public-holidays';
import { normalizeCoverageRoleTags } from '@/lib/roster-role-tags';
import type { StaffMember } from '@/types';
import type {
RosterGenerationRule,
RosterGenerationStyle,
RosterPatternGroupMode,
} from './근무표자동편성-types';
import {
CUSTOM_PATTERN_VALUE,
GENERATION_STYLE_OPTIONS,
MANAGER_POSITION_KEYWORDS,
NEW_NURSE_TENURE_MONTHS,
OFF_SHIFT_TOKEN,
ROSTER_PREFERRED_OFF_STORAGE_PREFIX,
ROSTER_STAFF_NIGHT_RANGE_STORAGE_PREFIX,
SHIFT_META_MARKER,
WEEKLY_TEMPLATE_PATTERN_VALUE,
type CoverageBand,
type StaffBlockPreference,
type StaffConfig,
type StaffPlanningMeta,
type StaffRestrictionDraft,
type StoredStaffNightRangeMap,
type WizardPairRule,
type WorkShift
} from './근무표자동편성-types';

export function getDepartmentName(target: StaffMember | null | undefined): string {
  return String(target?.department || (target as Record<string, unknown>)?.team || '');
}

export function isManagerOrHigher(user: StaffMember | null | undefined) {
  const position = String(user?.position || '');
  return (
    user?.role === 'admin' ||
    user?.company === 'SY INC.' ||
    user?.permissions?.mso === true ||
    MANAGER_POSITION_KEYWORDS.some((keyword) => position.includes(keyword))
  );
}

export function getMonthDates(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  return Array.from(
    { length: daysInMonth },
    (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`
  );
}

export { formatDateKey } from '@/lib/roster-date-utils';

export function getMonthEndDateKey(monthDates: string[]) {
  return monthDates[monthDates.length - 1] || '';
}

export function normalizeStaffBlockPreference(value: unknown): StaffBlockPreference {
  return value === 'short' || value === 'long' || value === 'night_focus' ? value : 'balanced';
}

export function buildDefaultStaffRestrictionDraft(): StaffRestrictionDraft {
  return {
    blockedShiftBands: [],
    blockedWeekdays: [],
    avoidWeekendWork: false,
    avoidHolidayWork: false,
    preferWeekendOff: false,
    preferHolidayOff: false,
    avoidConsecutiveEvening: false,
    preferEarlyMonthNight: false,
  };
}

export function buildDepartmentScopeKey(primaryDepartment: string, includedDepartments: string[]) {
  const parts = [String(primaryDepartment || '').trim()]
    .concat(includedDepartments.map((department) => String(department || '').trim()))
    .filter(Boolean)
    .filter((department, index, list) => list.indexOf(department) === index)
    .sort((left, right) => left.localeCompare(right, 'ko'));

  return parts.join('|');
}

export function buildDepartmentScopeLabel(primaryDepartment: string, includedDepartments: string[]) {
  const parts = [String(primaryDepartment || '').trim()]
    .concat(includedDepartments.map((department) => String(department || '').trim()))
    .filter(Boolean)
    .filter((department, index, list) => list.indexOf(department) === index);

  if (parts.length <= 1) return parts[0] || '';
  return parts.join(' + ');
}

export function getGenerationStyleMeta(style: RosterGenerationStyle) {
  return (
    GENERATION_STYLE_OPTIONS.find((option) => option.value === style) ||
    GENERATION_STYLE_OPTIONS[0]
  );
}

export function isStaffNewNurse(staff: StaffMember, referenceDateKey: string) {
  const joinedAt = String(
    staff?.join_date || staff?.joined_at || staff?.hire_date || staff?.start_date || ''
  )
    .trim()
    .slice(0, 10);
  if (!joinedAt || !referenceDateKey) return false;

  const joinedDate = new Date(`${joinedAt}T00:00:00`);
  const referenceDate = new Date(`${referenceDateKey}T00:00:00`);
  if (Number.isNaN(joinedDate.getTime()) || Number.isNaN(referenceDate.getTime())) {
    return false;
  }
  if (joinedDate.getTime() > referenceDate.getTime()) return false;

  let monthDiff =
    (referenceDate.getFullYear() - joinedDate.getFullYear()) * 12 +
    (referenceDate.getMonth() - joinedDate.getMonth());
  if (referenceDate.getDate() < joinedDate.getDate()) {
    monthDiff -= 1;
  }

  return monthDiff >= 0 && monthDiff < NEW_NURSE_TENURE_MONTHS;
}

export function buildPreferredOffStorageKey(companyName: string, department: string, month: string) {
  return [
    ROSTER_PREFERRED_OFF_STORAGE_PREFIX,
    companyName || 'all-companies',
    department || 'all-departments',
    month || 'all-months',
  ].join('::');
}

export function buildStaffNightRangeStorageKey(companyName: string, department: string) {
  return [
    ROSTER_STAFF_NIGHT_RANGE_STORAGE_PREFIX,
    companyName || 'all-companies',
    department || 'all-departments',
  ].join('::');
}

export function clampNightShiftCount(value: number, days: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(days, Math.floor(value)));
}

export function normalizeStoredStaffNightRanges(
  value: unknown,
  targetStaffIds: Set<string>,
  days: number
): StoredStaffNightRangeMap {
  if (!value || typeof value !== 'object') return {};

  const normalized: StoredStaffNightRangeMap = {};
  Object.entries(value as Record<string, unknown>).forEach(([staffId, rawValue]) => {
    if (!targetStaffIds.has(staffId) || !rawValue || typeof rawValue !== 'object') return;
    const source = rawValue as Record<string, unknown>;
    const minNightShiftCount = clampNightShiftCount(Number(source.minNightShiftCount) || 0, days);
    const maxNightShiftCount = clampNightShiftCount(Number(source.maxNightShiftCount) || 0, days);

    if (minNightShiftCount <= 0 && maxNightShiftCount <= 0) return;

    normalized[staffId] = {
      minNightShiftCount,
      maxNightShiftCount:
        maxNightShiftCount > 0 ? Math.max(maxNightShiftCount, minNightShiftCount) : 0,
    };
  });

  return normalized;
}

export function normalizeGeneratedAssignments(
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

export function normalizeShiftName(name: string) {
  return String(name || '').replace(/\s+/g, '').toLowerCase();
}

export const OFFICE_PATTERN_KEYWORDS = [
  '통상',
  '상근',
  '일반',
  '주간',
  '고정',
  'office',
  'weekday',
  'regular',
];

export const THREE_SHIFT_PATTERN_KEYWORDS = ['3교대', '3shift', '3-shift'];
export const TWO_SHIFT_PATTERN_KEYWORDS = ['2교대', '2shift', '2-shift'];
export const TWO_WORK_ONE_OFF_PATTERN_KEYWORDS = ['2일근무1일휴무'];
export const ONE_WORK_ONE_OFF_PATTERN_KEYWORDS = ['1일근무1일휴무'];
export const DAY_DEDICATED_PATTERN_KEYWORDS = [
  '데이전담',
  '주간전담',
  '주간고정',
  'daydedicated',
  'dayfixed',
  'dayonly',
];
export const EVENING_DEDICATED_PATTERN_KEYWORDS = [
  '이브전담',
  '이브닝전담',
  '이브고정',
  'eveningdedicated',
  'eveningfixed',
  'evefixed',
  'eveonly',
];
export const NIGHT_DEDICATED_PATTERN_KEYWORDS = [
  '나이트전담',
  '야간전담',
  '야간고정',
  'nightdedicated',
  'nightfixed',
  'nightonly',
];
export const FIXED_PATTERN_KEYWORDS = ['전담', '고정', 'fixed', 'dedicated', 'only'];
export const MANAGEMENT_TEAM_KEYWORDS = ['관리팀', '시설관리', '환경관리'];
export const WARD_TEAM_KEYWORDS = ['병동', '입원', '간호', 'ward'];
export const OUTPATIENT_TEAM_KEYWORDS = ['외래', '검사', '원무', 'opd', 'outpatient'];
export const OFFICE_TEAM_KEYWORDS = ['총무', '수술', '행정', '경영지원', '인사', '재무', '구매'];
export const NUTRITION_TEAM_KEYWORDS = ['영양', '식당', '조리', 'nutrition', 'kitchen'];
export const MANAGEMENT_SHIFT_KEYWORDS = ['관리사', '시설관리'];
export const WARD_SHIFT_KEYWORDS = ['병동', 'ward'];
export const OUTPATIENT_SHIFT_KEYWORDS = ['외래', '검사', '원무', 'opd', 'outpatient'];
export const OFFICE_SHIFT_KEYWORDS = ['통상', '상근', '일반', '주간', 'regular', 'office'];
export const NUTRITION_SHIFT_KEYWORDS = ['영양', '식당', '조리', 'meal', 'kitchen', 'cafeteria'];

export function hasPatternKeyword(sources: Array<string | null | undefined>, keywords: string[]) {
  return sources
    .map((source) => normalizeShiftName(source ?? ''))
    .filter(Boolean)
    .some((source) =>
      keywords.some((keyword) => source.includes(normalizeShiftName(keyword)))
    );
}

export function resolveShiftBand(shift: WorkShift) {
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

export function getShiftSearchText(shift: WorkShift) {
  return normalizeShiftName(
    [shift.name, shift.shift_type, shift.description].filter(Boolean).join(' ')
  );
}

export function filterShiftsByKeywords(shifts: WorkShift[], keywords: string[]) {
  return shifts.filter((shift) => {
    const searchText = getShiftSearchText(shift);
    return keywords.some((keyword) => searchText.includes(normalizeShiftName(keyword)));
  });
}

export function dedupeShiftIds(shifts: WorkShift[]) {
  return shifts
    .map((shift) => shift.id)
    .filter((shiftId, index, list) => list.indexOf(shiftId) === index);
}

export function getTeamRecommendationCategory(department: string) {
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

export function getDefaultPlannerMode(
  teamRecommendationCategory: ReturnType<typeof getTeamRecommendationCategory>
): RosterPatternGroupMode {
  if (teamRecommendationCategory === 'management' || teamRecommendationCategory === 'outpatient') {
    return 'day_fixed';
  }

  return 'rotation';
}

export function recommendShiftIdsForTeam(department: string, shifts: WorkShift[]) {
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
  const categorizedShiftIds = new Set(
    [
      ...managementShifts,
      ...wardShifts,
      ...outpatientShifts,
      ...officeShifts,
      ...nutritionShifts,
    ].map((shift) => shift.id)
  );
  const unclassifiedShifts = shifts.filter((shift) => !categorizedShiftIds.has(shift.id));
  const withUnclassified = (primaryShifts: WorkShift[]) =>
    dedupeShiftIds([...primaryShifts, ...unclassifiedShifts]);
  const allDayCycleShifts = shifts.filter(
    (shift) =>
      resolveConfiguredWorkDayMode(shift) === 'all_days' ||
      hasPatternKeyword([shift.name, shift.shift_type, shift.description], THREE_SHIFT_PATTERN_KEYWORDS)
  );

  if (category === 'management') {
    return withUnclassified(managementShifts);
  }

  if (category === 'ward') {
    if (wardShifts.length > 0) return withUnclassified(wardShifts);
    if (allDayCycleShifts.length > 0) return withUnclassified(allDayCycleShifts);
    return [];
  }

  if (category === 'outpatient') {
    if (outpatientShifts.length > 0) return withUnclassified(outpatientShifts);
    if (weekdayDayShifts.length > 0) return withUnclassified(weekdayDayShifts);
    return [];
  }

  if (category === 'office') {
    if (officeShifts.length > 0) return withUnclassified(officeShifts);
    if (weekdayDayShifts.length > 0) return withUnclassified(weekdayDayShifts);
    return [];
  }

  if (category === 'nutrition') {
    if (nutritionShifts.length > 0) return withUnclassified(nutritionShifts);
    if (weekdayDayShifts.length > 0) return withUnclassified(weekdayDayShifts);
    return [];
  }

  if (weekdayDayShifts.length > 0) return dedupeShiftIds(weekdayDayShifts);
  return dedupeShiftIds(shifts);
}

export function resolveConfiguredWorkDayMode(shift?: WorkShift | null) {
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

export function pickShiftByKeywords(shifts: WorkShift[], keywords: string[]) {
  return shifts.find((shift) => keywords.some((keyword) => normalizeShiftName(shift.name).includes(keyword)));
}

export function sortShifts(shifts: WorkShift[]) {
  return [...shifts].sort((a, b) => {
    const aTime = String(a.start_time || '99:99').slice(0, 5);
    const bTime = String(b.start_time || '99:99').slice(0, 5);
    return aTime.localeCompare(bTime);
  });
}

export function getAssignedShiftBand(token: string, shiftMap: Map<string, WorkShift>) {
  if (!token || token === OFF_SHIFT_TOKEN) return null;
  const shift = shiftMap.get(token);
  if (!shift) return null;
  return resolveShiftBand(shift);
}

export function isSeniorPlannerStaff(staff: StaffMember) {
  const sources = [
    String(staff.position || ''),
    String(staff.role || ''),
    String(staff.job_title || ''),
  ].map((value) => normalizeShiftName(value));
  const keywords = ['수간호사', '책임', '파트장', '팀장', '부장', '과장', 'senior', 'charge', 'leader'];
  return keywords.some((keyword) => sources.some((source) => source.includes(normalizeShiftName(keyword))));
}

export function getDedicatedBandFromMode(mode?: RosterPatternGroupMode | null): CoverageBand | null {
  if (mode === 'day_fixed') return 'day';
  if (mode === 'evening_fixed') return 'evening';
  if (mode === 'night_fixed') return 'night';
  return null;
}

export function getFixedModeFromDedicatedBand(band?: string | null): RosterPatternGroupMode | null {
  if (band === 'day') return 'day_fixed';
  if (band === 'evening') return 'evening_fixed';
  if (band === 'night') return 'night_fixed';
  return null;
}

export function getRoleCoverageTargetByBand(
  roleRule: Pick<
    RosterGenerationRule['roleCoverageRules'][number],
    'minDayStaff' | 'minEveningStaff' | 'minNightStaff'
  >,
  band: CoverageBand
) {
  if (band === 'day') return Number(roleRule.minDayStaff || 0);
  if (band === 'evening') return Number(roleRule.minEveningStaff || 0);
  return Number(roleRule.minNightStaff || 0);
}

export function coverageRoleMatchesRule(
  coverageRoleMatcherText: string,
  roleRule: Pick<RosterGenerationRule['roleCoverageRules'][number], 'keywords'>
) {
  const normalizedText = normalizeShiftName(coverageRoleMatcherText);
  return normalizeCoverageRoleTags(roleRule.keywords).some((keyword) =>
    normalizedText.includes(normalizeShiftName(keyword))
  );
}

export function buildPlannerCoverageRoleMatcherText(staff: StaffMember, coverageRoleTags: string[]) {
  return normalizeShiftName(
    [
      String(staff.name || ''),
      String(staff.position || ''),
      String(staff.role || ''),
      String(getDepartmentName(staff) || ''),
      String(staff.shift_type || ''),
      String(staff.shift_id || ''),
      coverageRoleTags.join(' '),
    ]
      .filter(Boolean)
      .join(' ')
  );
}

export function canStaffCoverBand(meta: StaffPlanningMeta, band: CoverageBand) {
  return !meta.dedicatedBand || meta.dedicatedBand === band;
}

export function isNightRecoverySlot(
  assignments: string[],
  index: number,
  shiftMap: Map<string, WorkShift>,
  recoveryDays: number
) {
  const maxRecoveryDays = Math.max(0, Math.floor(recoveryDays || 0));
  if (maxRecoveryDays <= 0) return false;

  for (let offset = 1; offset <= maxRecoveryDays; offset += 1) {
    const previousIndex = index - offset;
    if (previousIndex < 0) break;
    const band = getAssignedShiftBand(assignments[previousIndex] || '', shiftMap);
    if (band === 'night') return true;
    if (band) return false;
  }

  return false;
}

export function wouldViolateNightRecoveryWindow(
  assignments: string[],
  index: number,
  nextShiftId: string,
  shiftMap: Map<string, WorkShift>,
  recoveryDays: number
) {
  const maxRecoveryDays = Math.max(0, Math.floor(recoveryDays || 0));
  if (maxRecoveryDays <= 0 || !nextShiftId || nextShiftId === OFF_SHIFT_TOKEN) {
    return false;
  }

  const nextBand = getAssignedShiftBand(nextShiftId, shiftMap);
  if (!nextBand) {
    return false;
  }

  if (nextBand !== 'night') {
    return isNightRecoverySlot(assignments, index, shiftMap, maxRecoveryDays);
  }

  let recoveryStartIndex = index + 1;
  while (recoveryStartIndex < assignments.length) {
    const followingBand = getAssignedShiftBand(assignments[recoveryStartIndex] || '', shiftMap);
    if (followingBand === 'night') {
      recoveryStartIndex += 1;
      continue;
    }
    break;
  }

  for (
    let recoveryIndex = recoveryStartIndex;
    recoveryIndex < assignments.length && recoveryIndex < recoveryStartIndex + maxRecoveryDays;
    recoveryIndex += 1
  ) {
    const band = getAssignedShiftBand(assignments[recoveryIndex] || '', shiftMap);
    if (band) {
      return true;
    }
  }

  return false;
}

export function enforceNightRecoveryAssignments(
  assignments: string[],
  shiftMap: Map<string, WorkShift>,
  recoveryDays: number
) {
  const maxRecoveryDays = Math.max(0, Math.floor(recoveryDays || 0));
  const nextAssignments = [...assignments];

  if (maxRecoveryDays <= 0) {
    return nextAssignments.map((token) => token || OFF_SHIFT_TOKEN);
  }

  for (let index = 0; index < nextAssignments.length; index += 1) {
    const band = getAssignedShiftBand(nextAssignments[index] || '', shiftMap);
    if (band !== 'night') continue;

    const nextBand = getAssignedShiftBand(nextAssignments[index + 1] || '', shiftMap);
    if (nextBand === 'night') continue;

    for (let offset = 1; offset <= maxRecoveryDays; offset += 1) {
      const recoveryIndex = index + offset;
      if (recoveryIndex >= nextAssignments.length) break;
      nextAssignments[recoveryIndex] = OFF_SHIFT_TOKEN;
    }
  }

  return nextAssignments.map((token) => token || OFF_SHIFT_TOKEN);
}

export function countPreviousBandStreak(
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

export function getRotationBandContinuityTarget({
  staffIndex,
  blockStartIndex,
  band,
  maxConsecutiveWorkDays,
  generationStyle,
  blockPreference,
}: {
  staffIndex: number;
  blockStartIndex: number;
  band: CoverageBand;
  maxConsecutiveWorkDays: number;
  generationStyle: RosterGenerationStyle;
  blockPreference?: StaffBlockPreference;
}) {
  const targetPool =
    generationStyle === 'variety'
      ? band === 'night'
        ? [1, 1, 2, 2, 3]
        : [1, 1, 2, 2, 3, 4]
      : generationStyle === 'block'
        ? band === 'night'
          ? [2, 3, 3, 4, 4]
          : [2, 3, 4, 4, 5]
        : generationStyle === 'stable'
          ? band === 'night'
            ? [2, 2, 3, 3, 4]
            : [2, 3, 3, 4, 5]
          : band === 'night'
            ? [1, 2, 3, 4]
            : [1, 2, 3, 4, 5];
  const seed =
    Math.abs(staffIndex * 17 + blockStartIndex * 13 + (band === 'day' ? 3 : band === 'evening' ? 5 : 7));
  let target = targetPool[seed % targetPool.length] || 1;

  if (blockPreference === 'short') {
    target = Math.min(target, band === 'night' ? 2 : 3);
  } else if (blockPreference === 'long') {
    target = Math.max(target, band === 'night' ? 3 : 4);
  } else if (blockPreference === 'night_focus' && band === 'night') {
    target = Math.max(target, 3);
  }

  return Math.max(1, Math.min(maxConsecutiveWorkDays, target));
}

export function countPreviousWorkStreak(assignments: string[], index: number) {
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

export function countNextWorkStreak(assignments: string[], index: number) {
  if (index >= assignments.length - 1) return 0;

  let streak = 0;
  for (let cursor = index + 1; cursor < assignments.length; cursor += 1) {
    if (!assignments[cursor] || assignments[cursor] === OFF_SHIFT_TOKEN) {
      break;
    }
    streak += 1;
  }

  return streak;
}

export function countPreviousTaggedWorkStreak(
  assignments: string[],
  monthDates: string[],
  index: number,
  isTaggedDate: (dateKey: string) => boolean
) {
  if (index <= 0) return 0;
  if (!isTaggedDate(monthDates[index] || '')) return 0;

  let streak = 0;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const dateKey = monthDates[cursor] || '';
    if (!isTaggedDate(dateKey)) {
      break;
    }
    if (!assignments[cursor] || assignments[cursor] === OFF_SHIFT_TOKEN) {
      break;
    }
    streak += 1;
  }

  return streak;
}

export function canStillMeetMinimumStaffing({
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

export function isWeekendDateKey(dateKey: string) {
  const weekday = new Date(`${dateKey}T00:00:00`).getDay();
  return weekday === 0 || weekday === 6;
}

export function normalizeBlockedShiftBands(value: unknown): CoverageBand[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter((entry): entry is CoverageBand => entry === 'day' || entry === 'evening' || entry === 'night')
    .filter((entry, index, list) => list.indexOf(entry) === index);
}

export function normalizeBlockedWeekdays(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 6)
    .filter((entry, index, list) => list.indexOf(entry) === index)
    .sort((left, right) => left - right);
}

export function buildStaffRestrictionBlockedDateSet(config: StaffConfig, monthDates: string[]) {
  const blocked = new Set<string>();
  const blockedWeekdays = new Set(normalizeBlockedWeekdays(config.blockedWeekdays || []));

  monthDates.forEach((dateKey) => {
    const weekday = new Date(`${dateKey}T00:00:00`).getDay();
    if (blockedWeekdays.has(weekday)) {
      blocked.add(dateKey);
      return;
    }
    if (config.avoidWeekendWork && isWeekendDateKey(dateKey)) {
      blocked.add(dateKey);
      return;
    }
    if (config.avoidHolidayWork && isKoreanPublicHoliday(dateKey)) {
      blocked.add(dateKey);
    }
  });

  return blocked;
}

export function buildEmptyCoverageCounts() {
  return {
    day: 0,
    evening: 0,
    night: 0,
  } satisfies Record<'day' | 'evening' | 'night', number>;
}

export function selectDistributedDays({
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

export function inferDefaultNightShiftCount(pattern: string, days: number) {
  if (pattern === '야간전담') return Math.ceil(days / 2);
  if (pattern === '3교대') return Math.max(1, Math.round(days / 4));
  return 0;
}

export function isNightPattern(pattern: string) {
  return pattern === '3교대' || pattern === '야간전담';
}

export function isCustomPattern(pattern: string) {
  return pattern === CUSTOM_PATTERN_VALUE;
}

export function isWeeklyTemplatePattern(pattern: string) {
  return pattern === WEEKLY_TEMPLATE_PATTERN_VALUE;
}

export function getShiftNameById(shiftId: string, workShifts: WorkShift[]) {
  if (shiftId === OFF_SHIFT_TOKEN) return '휴무';
  return workShifts.find((shift) => shift.id === shiftId)?.name || '미지정';
}

export function formatRosterShortDateLabel(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey;
  return `${Number(dateKey.slice(5, 7))}/${Number(dateKey.slice(8, 10))}`;
}

export function summarizeRosterDateLabels(dateKeys: string[], limit = 3) {
  const uniqueLabels = [...new Set(dateKeys.filter(Boolean).map((dateKey) => formatRosterShortDateLabel(dateKey)))];
  if (uniqueLabels.length === 0) return '';
  if (uniqueLabels.length <= limit) return uniqueLabels.join(', ');
  return `${uniqueLabels.slice(0, limit).join(', ')} 외 ${uniqueLabels.length - limit}일`;
}

export function isWorkingBand(
  band: ReturnType<typeof getAssignedShiftBand>
): band is 'day' | 'evening' | 'night' {
  return band === 'day' || band === 'evening' || band === 'night';
}

export function normalizeActivePairRules(rules: WizardPairRule[], validStaffIds: Set<string>) {
  return rules.filter((rule) => {
    const primaryStaffId = String(rule.primaryStaffId || '').trim();
    const secondaryStaffId = String(rule.secondaryStaffId || '').trim();
    return (
      primaryStaffId &&
      secondaryStaffId &&
      primaryStaffId !== secondaryStaffId &&
      validStaffIds.has(primaryStaffId) &&
      validStaffIds.has(secondaryStaffId)
    );
  });
}

export function resolveShiftWorkDayMode(shift?: WorkShift | null) {
  return resolveConfiguredWorkDayMode(shift);
}

export function shiftIncludesWeekend(shift?: WorkShift | null) {
  if (!shift) return false;
  return resolveShiftWorkDayMode(shift) === 'all_days';
}

export function getShiftCode(name: string) {
  const normalized = normalizeShiftName(name);
  if (!normalized || normalized.includes('미지정')) return '?';
  if (normalized.includes('휴무') || normalized.includes('off') || normalized.includes('비번') || normalized.includes('오프')) return 'OFF';
  if (normalized.includes('휴가') || normalized.includes('연차')) return '휴';
  if (normalized.includes('데이') || normalized.includes('day') || normalized.includes('주간') || normalized.includes('상근') || /(?:^|[^a-z])d$/.test(normalized)) return 'D';
  if (normalized.includes('이브') || normalized.includes('evening') || normalized.includes('eve') || /(?:^|[^a-z])e$/.test(normalized)) return 'E';
  if (normalized.includes('나이트') || normalized.includes('night') || normalized.includes('야간') || /(?:^|[^a-z])n$/.test(normalized)) return 'N';
  return name.slice(0, 2);
}

export function getShiftDisplayLabel(name: string) {
  const rawName = String(name || '').trim();
  const normalized = normalizeShiftName(rawName);
  if (!normalized || normalized.includes('미지정')) return '?';
  if (normalized.includes('휴무') || normalized.includes('off') || normalized.includes('비번') || normalized.includes('오프')) return '휴무';
  return rawName.replace(/\s*\([^)]*\)\s*$/, '').trim() || rawName;
}

export function getShiftBadgeClass(name: string) {
  const normalized = normalizeShiftName(name);
  if (normalized.includes('휴무') || normalized.includes('off') || normalized.includes('비번') || normalized.includes('오프')) {
    return 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)] border-[var(--border)]';
  }
  if (normalized.includes('휴가') || normalized.includes('연차')) {
    return 'bg-green-500/10 text-green-700 border-green-500/20';
  }
  if (normalized.includes('데이') || normalized.includes('day') || normalized.includes('주간') || normalized.includes('상근') || /(?:^|[^a-z])d$/.test(normalized)) {
    return 'bg-blue-500/10 text-blue-700 border-blue-500/20';
  }
  if (normalized.includes('이브') || normalized.includes('evening') || normalized.includes('eve') || /(?:^|[^a-z])e$/.test(normalized)) {
    return 'bg-orange-500/10 text-orange-700 border-orange-500/20';
  }
  if (normalized.includes('나이트') || normalized.includes('night') || normalized.includes('야간') || /(?:^|[^a-z])n$/.test(normalized)) {
    return 'bg-purple-500/10 text-purple-700 border-purple-500/20';
  }
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

export function buildAssignmentKey(staffId: string, date: string) {
  return `${staffId}::${date}`;
}

export function formatShiftHours(shift: WorkShift) {
  if (!shift.start_time || !shift.end_time) return '시간 미지정';
  return `${String(shift.start_time).slice(0, 5)} - ${String(shift.end_time).slice(0, 5)}`;
}
