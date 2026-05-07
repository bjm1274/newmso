/**
 * Extracted roster policy/storage helper functions.
 */
import {
normalizeGenerationRule,
ROSTER_GENERATION_RULE_STORAGE_KEY,
type RosterGenerationRule,
} from '@/lib/roster-generation-rules';
import {
findPatternStaffGroup,
normalizePatternProfile,
ROSTER_PATTERN_PROFILE_STORAGE_KEY,
type RosterPatternProfile,
} from '@/lib/roster-pattern-profiles';
import { summarizeRoleCoverageRules } from '@/lib/roster-role-tags';
import type { StaffMember } from '@/types';
import {
getBandShiftIds,
getShiftNameById
} from './roster-extra-utils-a';
import {
getAssignedShiftBand,
getDepartmentName,
getGenerationStyleMeta,
hasPatternKeyword,
resolveShiftBand
} from './roster-shift-utils';
import type {
PlannerResolvedPatternGroup,
WizardPairRule,
WorkShift
} from './roster-wizard-types';

export function buildAssignmentKey(staffId: string, date: string) {
  return `${staffId}::${date}`;
}

// ─── 생성 규칙 관련 ───────────────────────────────────────────────────────────

export function cloneGenerationRule(rule: RosterGenerationRule | null | undefined) {
  if (!rule) return null;

  return {
    ...rule,
    teamKeywords: [...rule.teamKeywords],
    dateCoverageOverrides: (rule.dateCoverageOverrides || []).map((entry) => ({ ...entry })),
    roleCoverageRules: rule.roleCoverageRules.map((entry) => ({
      ...entry,
      keywords: [...entry.keywords],
    })),
  } satisfies RosterGenerationRule;
}

export function buildGenerationRuleSummaryItems(rule: RosterGenerationRule) {
  const items = [
    `생성 성향 ${getGenerationStyleMeta(rule.generationStyle).label}`,
    `최소 D/E/N ${rule.minDayStaff}/${rule.minEveningStaff}/${rule.minNightStaff}`,
    `나이트 후 OFF ${rule.offDaysAfterNight}일`,
    `나이트 블록 ${rule.nightBlockSize}일`,
    `최소 월 OFF ${rule.minMonthlyOffDays}일`,
    `최대 연속근무 ${rule.maxConsecutiveWorkDays}일`,
    rule.blockNewNurseSoloNight ? '신규 단독 NIGHT 금지' : '신규 단독 NIGHT 허용',
    rule.requireSeniorWithNewNurseNight ? '신규 NIGHT 선임 동반' : '신규 NIGHT 선임 동반 해제',
    rule.separateNewNursesByShift ? '신규간호사 분리 배치' : '신규간호사 분리 해제',
    rule.avoidDayAfterNight ? 'N 다음 DAY 금지' : 'N 다음 DAY 허용',
    rule.avoidDayAfterEvening ? 'E 다음 DAY 금지' : 'E 다음 DAY 허용',
    `역할 슬롯 ${rule.roleCoverageRules.length}개`,
  ];

  if (rule.maxConsecutiveEveningShifts > 0) items.push(`연속 EVENING 최대 ${rule.maxConsecutiveEveningShifts}일`);
  if (rule.maxConsecutiveWeekendWorkDays > 0) items.push(`연속 주말근무 최대 ${rule.maxConsecutiveWeekendWorkDays}일`);
  if (rule.minSeniorDayStaff > 0 || rule.minSeniorEveningStaff > 0 || rule.minSeniorNightStaff > 0) {
    items.push(`선임 D/E/N ${rule.minSeniorDayStaff}/${rule.minSeniorEveningStaff}/${rule.minSeniorNightStaff}`);
  }
  if (rule.minDedicatedDayStaff > 0 || rule.minDedicatedEveningStaff > 0 || rule.minDedicatedNightStaff > 0) {
    items.push(`전담 D/E/N ${rule.minDedicatedDayStaff}/${rule.minDedicatedEveningStaff}/${rule.minDedicatedNightStaff}`);
  }
  if (rule.weekendMinDayStaff > 0 || rule.weekendMinEveningStaff > 0 || rule.weekendMinNightStaff > 0) {
    items.push(`주말 D/E/N ${rule.weekendMinDayStaff}/${rule.weekendMinEveningStaff}/${rule.weekendMinNightStaff}`);
  }
  if (rule.holidayMinDayStaff > 0 || rule.holidayMinEveningStaff > 0 || rule.holidayMinNightStaff > 0) {
    items.push(`공휴일 D/E/N ${rule.holidayMinDayStaff}/${rule.holidayMinEveningStaff}/${rule.holidayMinNightStaff}`);
  }
  if ((rule.dateCoverageOverrides || []).length > 0) {
    items.push(`특정 날짜 인원 ${(rule.dateCoverageOverrides || []).length}건`);
  }

  const roleCoverageSummary = summarizeRoleCoverageRules(rule.roleCoverageRules);
  if (roleCoverageSummary.length > 0) items.push(...roleCoverageSummary);

  return items.filter(Boolean);
}

// ─── 페어 룰 유틸 ─────────────────────────────────────────────────────────────

export function isWorkingBand(
  band: ReturnType<typeof getAssignedShiftBand>
): band is 'day' | 'evening' | 'night' {
  return band === 'day' || band === 'evening' || band === 'night';
}

export function isWizardPairRuleSatisfiedAtDate({
  rule,
  primaryShiftId,
  secondaryShiftId,
  shiftMap,
}: {
  rule: WizardPairRule;
  primaryShiftId: string;
  secondaryShiftId: string;
  shiftMap: Map<string, WorkShift>;
}) {
  const primaryBand = getAssignedShiftBand(primaryShiftId, shiftMap);
  const secondaryBand = getAssignedShiftBand(secondaryShiftId, shiftMap);

  if (rule.band === 'night') {
    const primaryNight = primaryBand === 'night';
    const secondaryNight = secondaryBand === 'night';
    return rule.mode === 'together' ? primaryNight === secondaryNight : !(primaryNight && secondaryNight);
  }

  const primaryWorking = isWorkingBand(primaryBand);
  const secondaryWorking = isWorkingBand(secondaryBand);
  if (rule.mode === 'together') {
    if (!primaryWorking && !secondaryWorking) return true;
    return primaryWorking && secondaryWorking && primaryBand === secondaryBand;
  }

  return !(primaryWorking && secondaryWorking && primaryBand === secondaryBand);
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

// ─── 패턴 그룹 자동 감지 ──────────────────────────────────────────────────────

const DAY_DEDICATED_PATTERN_KEYWORDS = [
  '데이전담', '주간전담', '주간고정', 'daydedicated', 'dayfixed', 'dayonly',
];
const EVENING_DEDICATED_PATTERN_KEYWORDS = [
  '이브전담', '이브닝전담', '이브고정', 'eveningdedicated', 'eveningfixed', 'evefixed', 'eveonly',
];
const NIGHT_DEDICATED_PATTERN_KEYWORDS = [
  '나이트전담', '야간전담', '야간고정', 'nightdedicated', 'nightfixed', 'nightonly',
];
const FIXED_PATTERN_KEYWORDS = ['전담', '고정', 'fixed', 'dedicated', 'only'];

function inferDedicatedPatternGroup(
  staff: StaffMember,
  shifts: WorkShift[]
): PlannerResolvedPatternGroup | null {
  if (shifts.length === 0) return null;

  const s = staff as Record<string, unknown>;
  const assignedShift = shifts.find((shift) => shift.id === s?.shift_id) || null;
  const sources: Array<string | null | undefined> = [
    s?.shift_type as string | undefined,
    staff?.position,
    staff?.role,
    assignedShift?.shift_type,
    assignedShift?.name,
    assignedShift?.description,
  ];

  const buildGroup = (
    band: 'day' | 'evening' | 'night',
    mode: import('./roster-wizard-types').RosterPatternGroupMode,
    label: string,
    rationale: string
  ) => {
    const shiftIds = getBandShiftIds(band, shifts, assignedShift?.id || '');
    if (shiftIds.length === 0) return null;
    return { key: `auto-${mode}`, label, mode, shiftIds, rationale, source: 'auto' as const };
  };

  if (hasPatternKeyword(sources, DAY_DEDICATED_PATTERN_KEYWORDS)) {
    return buildGroup('day', 'day_fixed', '데이전담', '직원 근무유형과 배정 근무를 기준으로 데이 전담자로 자동 감지했습니다.');
  }
  if (hasPatternKeyword(sources, EVENING_DEDICATED_PATTERN_KEYWORDS)) {
    return buildGroup('evening', 'evening_fixed', '이브전담', '직원 근무유형과 배정 근무를 기준으로 이브 전담자로 자동 감지했습니다.');
  }
  if (hasPatternKeyword(sources, NIGHT_DEDICATED_PATTERN_KEYWORDS)) {
    return buildGroup('night', 'night_fixed', '나이트전담', '직원 근무유형과 배정 근무를 기준으로 나이트 전담자로 자동 감지했습니다.');
  }

  if (assignedShift && hasPatternKeyword(sources, FIXED_PATTERN_KEYWORDS)) {
    const assignedBand = resolveShiftBand(assignedShift);
    if (assignedBand === 'day') {
      return buildGroup('day', 'day_fixed', '데이전담', '고정 근무 힌트와 배정 근무 시간을 기준으로 데이 전담자로 판단했습니다.');
    }
    if (assignedBand === 'evening') {
      return buildGroup('evening', 'evening_fixed', '이브전담', '고정 근무 힌트와 배정 근무 시간을 기준으로 이브 전담자로 판단했습니다.');
    }
    if (assignedBand === 'night') {
      return buildGroup('night', 'night_fixed', '나이트전담', '고정 근무 힌트와 배정 근무 시간을 기준으로 나이트 전담자로 판단했습니다.');
    }
  }

  return null;
}

export function resolvePlannerPatternGroup({
  staff,
  patternProfile,
  availableShifts,
  allShifts,
}: {
  staff: StaffMember;
  patternProfile?: RosterPatternProfile | null;
  availableShifts: WorkShift[];
  allShifts: WorkShift[];
}): PlannerResolvedPatternGroup | null {
  const staffExtra = staff as Record<string, unknown>;
  const matchedGroup = patternProfile
    ? findPatternStaffGroup(patternProfile, {
        name: String(staff.name || ''),
        position: String(staff.position || ''),
        role: String(staff.role || ''),
        employmentType: String(staffExtra.employment_type || ''),
        department: String(getDepartmentName(staff) || ''),
        shiftType: String(staffExtra.shift_type || ''),
        assignedShiftId: String(staffExtra.shift_id || ''),
        assignedShiftName: getShiftNameById(String(staffExtra.shift_id || ''), allShifts),
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

// ─── 로컬스토리지 로드 유틸 ───────────────────────────────────────────────────

export function loadStoredPatternProfiles(storageKey: string = ROSTER_PATTERN_PROFILE_STORAGE_KEY): RosterPatternProfile[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((profile) => normalizePatternProfile(profile))
      .filter((profile): profile is RosterPatternProfile => profile !== null);
  } catch (error) {
    console.error('근무 패턴 프로파일 로드 실패:', error);
    return [];
  }
}

export function loadStoredGenerationRules(storageKey: string = ROSTER_GENERATION_RULE_STORAGE_KEY): RosterGenerationRule[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((rule) => normalizeGenerationRule(rule))
      .filter((rule): rule is RosterGenerationRule => rule !== null);
  } catch (error) {
    console.error('근무 규칙 로드 실패:', error);
    return [];
  }
}

// ─── 날짜/병합 유틸 ───────────────────────────────────────────────────────────

export function parseRosterUpdatedAt(value: string | null | undefined) {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function mergeRosterItemsByRecency<T extends { id: string; updatedAt?: string | null }>(
  ...collections: T[][]
) {
  const merged = new Map<string, T>();

  collections.flat().forEach((item) => {
    const id = String(item?.id || '').trim();
    if (!id) return;

    const current = merged.get(id);
    if (!current || parseRosterUpdatedAt(item.updatedAt) >= parseRosterUpdatedAt(current.updatedAt)) {
      merged.set(id, item);
    }
  });

  return Array.from(merged.values()).sort(
    (left, right) => parseRosterUpdatedAt(right.updatedAt) - parseRosterUpdatedAt(left.updatedAt)
  );
}
