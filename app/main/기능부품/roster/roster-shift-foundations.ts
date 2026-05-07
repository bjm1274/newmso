/**
 * Extracted foundational shift and scope utilities.
 */

import type { RosterPatternGroupMode } from '@/lib/roster-pattern-profiles';
import type { StaffMember } from '@/types';
import type {
CoverageBand,
StaffBlockPreference,
StoredStaffNightRangeMap,
WorkShift
} from './roster-wizard-types';
import {
MANAGER_POSITION_KEYWORDS,
NEW_NURSE_TENURE_MONTHS,
OFF_SHIFT_TOKEN,
ROSTER_PREFERRED_OFF_STORAGE_PREFIX,
ROSTER_STAFF_NIGHT_RANGE_STORAGE_PREFIX,
SHIFT_META_MARKER
} from './roster-wizard-types';


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

export function isStaffNewNurse(staff: StaffMember, referenceDateKey: string) {
  const joinedAt = String(
    staff?.join_date || staff?.joined_at || staff?.hire_date || staff?.start_date || ''
  )
    .trim()
    .slice(0, 10);
  if (!joinedAt || !referenceDateKey) return false;

  const joinedDate = new Date(`${joinedAt}T00:00:00`);
  const referenceDate = new Date(`${referenceDateKey}T00:00:00`);
  if (Number.isNaN(joinedDate.getTime()) || Number.isNaN(referenceDate.getTime())) return false;
  if (joinedDate.getTime() > referenceDate.getTime()) return false;

  let monthDiff =
    (referenceDate.getFullYear() - joinedDate.getFullYear()) * 12 +
    (referenceDate.getMonth() - joinedDate.getMonth());
  if (referenceDate.getDate() < joinedDate.getDate()) monthDiff -= 1;

  return monthDiff >= 0 && monthDiff < NEW_NURSE_TENURE_MONTHS;
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

// ─── 날짜 유틸 ────────────────────────────────────────────────────────────────

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

export function isWeekendDateKey(dateKey: string) {
  const weekday = new Date(`${dateKey}T00:00:00`).getDay();
  return weekday === 0 || weekday === 6;
}

// ─── 스토리지 키 ─────────────────────────────────────────────────────────────

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

// ─── 정규화 유틸 ──────────────────────────────────────────────────────────────

export function normalizeShiftName(name: string) {
  return String(name || '').replace(/\s+/g, '').toLowerCase();
}

export function normalizeStaffBlockPreference(value: unknown): StaffBlockPreference {
  return value === 'short' || value === 'long' || value === 'night_focus' ? value : 'balanced';
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
      maxNightShiftCount: maxNightShiftCount > 0 ? Math.max(maxNightShiftCount, minNightShiftCount) : 0,
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

export function clampNightShiftCount(value: number, days: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(days, Math.floor(value)));
}

// ─── 부서/팀 분류 ─────────────────────────────────────────────────────────────

const OFFICE_PATTERN_KEYWORDS = ['통상', '상근', '일반', '주간', '고정', 'office', 'weekday', 'regular'];
const THREE_SHIFT_PATTERN_KEYWORDS = ['3교대', '3shift', '3-shift'];
const TWO_SHIFT_PATTERN_KEYWORDS = ['2교대', '2shift', '2-shift'];
const TWO_WORK_ONE_OFF_PATTERN_KEYWORDS = ['2일근무1일휴무'];
const ONE_WORK_ONE_OFF_PATTERN_KEYWORDS = ['1일근무1일휴무'];
const DAY_DEDICATED_PATTERN_KEYWORDS = ['데이전담', '주간전담', '주간고정', 'daydedicated', 'dayfixed', 'dayonly'];
const EVENING_DEDICATED_PATTERN_KEYWORDS = ['이브전담', '이브닝전담', '이브고정', 'eveningdedicated', 'eveningfixed', 'evefixed', 'eveonly'];
const NIGHT_DEDICATED_PATTERN_KEYWORDS = ['나이트전담', '야간전담', '야간고정', 'nightdedicated', 'nightfixed', 'nightonly'];
const FIXED_PATTERN_KEYWORDS = ['전담', '고정', 'fixed', 'dedicated', 'only'];
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

// keyword constants exported for external use
export {
DAY_DEDICATED_PATTERN_KEYWORDS,
EVENING_DEDICATED_PATTERN_KEYWORDS,FIXED_PATTERN_KEYWORDS,NIGHT_DEDICATED_PATTERN_KEYWORDS,OFFICE_PATTERN_KEYWORDS,ONE_WORK_ONE_OFF_PATTERN_KEYWORDS,THREE_SHIFT_PATTERN_KEYWORDS,
TWO_SHIFT_PATTERN_KEYWORDS,
TWO_WORK_ONE_OFF_PATTERN_KEYWORDS,WARD_TEAM_KEYWORDS
};

export function hasPatternKeyword(sources: Array<string | null | undefined>, keywords: string[]) {
  return sources
    .map((source) => normalizeShiftName(source ?? ''))
    .filter(Boolean)
    .some((source) => keywords.some((keyword) => source.includes(normalizeShiftName(keyword))));
}

export function getTeamRecommendationCategory(department: string) {
  const nd = normalizeShiftName(department);
  if (MANAGEMENT_TEAM_KEYWORDS.some((k) => nd.includes(normalizeShiftName(k)))) return 'management';
  if (WARD_TEAM_KEYWORDS.some((k) => nd.includes(normalizeShiftName(k)))) return 'ward';
  if (OUTPATIENT_TEAM_KEYWORDS.some((k) => nd.includes(normalizeShiftName(k)))) return 'outpatient';
  if (OFFICE_TEAM_KEYWORDS.some((k) => nd.includes(normalizeShiftName(k)))) return 'office';
  if (NUTRITION_TEAM_KEYWORDS.some((k) => nd.includes(normalizeShiftName(k)))) return 'nutrition';
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

// ─── 근무 유형 분류 ───────────────────────────────────────────────────────────

export function resolveShiftBand(shift: WorkShift): CoverageBand {
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

export function getAssignedShiftBand(token: string, shiftMap: Map<string, WorkShift>): CoverageBand | null {
  if (!token || token === OFF_SHIFT_TOKEN) return null;
  const shift = shiftMap.get(token);
  if (!shift) return null;
  return resolveShiftBand(shift);
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

export function getRosterModeGenerationPriority(mode: RosterPatternGroupMode) {
  switch (mode) {
    case 'day_fixed': return 0;
    case 'evening_fixed': return 1;
    case 'night_fixed': return 2;
    case 'rotation': return 3;
    default: return 4;
  }
}

// ─── 근무 목록 유틸 ───────────────────────────────────────────────────────────

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

export function sortShifts(shifts: WorkShift[]) {
  return [...shifts].sort((a, b) => {
    const aTime = String(a.start_time || '99:99').slice(0, 5);
    const bTime = String(b.start_time || '99:99').slice(0, 5);
    return aTime.localeCompare(bTime);
  });
}

export function pickShiftByKeywords(shifts: WorkShift[], keywords: string[]) {
  return shifts.find((shift) => keywords.some((keyword) => normalizeShiftName(shift.name).includes(keyword)));
}

export function recommendShiftIdsForTeam(department: string, shifts: WorkShift[]) {
  const category = getTeamRecommendationCategory(department);
  const dayShifts = shifts.filter((shift) => resolveShiftBand(shift) === 'day');
  const weekdayDayShifts = dayShifts.filter((shift) => resolveConfiguredWorkDayMode(shift) === 'weekdays');
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

  if (category === 'management') return withUnclassified(managementShifts);
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
