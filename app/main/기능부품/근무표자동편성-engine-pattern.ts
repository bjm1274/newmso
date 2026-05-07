import { normalizeGenerationRule as _normalizeGenerationRule } from '@/lib/roster-generation-rules';
import { findPatternStaffGroup } from '@/lib/roster-pattern-profiles';
import { normalizeCoverageRoleTags as _normalizeCoverageRoleTags } from '@/lib/roster-role-tags';
import type { StaffMember } from '@/types';
import {
clampNightShiftCount,
DAY_DEDICATED_PATTERN_KEYWORDS,
EVENING_DEDICATED_PATTERN_KEYWORDS,
FIXED_PATTERN_KEYWORDS,
getAssignedShiftBand,
getDepartmentName,
getShiftNameById,
hasPatternKeyword,
inferDefaultNightShiftCount,
isNightPattern,
isWeeklyTemplatePattern,
isWorkingBand,
NIGHT_DEDICATED_PATTERN_KEYWORDS,
normalizeBlockedShiftBands,
normalizeBlockedWeekdays,
normalizeShiftName,
normalizeStaffBlockPreference,
OFFICE_PATTERN_KEYWORDS,
ONE_WORK_ONE_OFF_PATTERN_KEYWORDS,
resolveConfiguredWorkDayMode,
resolveShiftBand,
selectDistributedDays,
sortShifts,
THREE_SHIFT_PATTERN_KEYWORDS,
TWO_SHIFT_PATTERN_KEYWORDS,
TWO_WORK_ONE_OFF_PATTERN_KEYWORDS
} from './근무표자동편성-engine-utils';
import {
CUSTOM_PATTERN_VALUE,
OFF_SHIFT_TOKEN,
WEEKDAY_LABELS,
WEEKDAY_PICKER_ORDER,
WEEKLY_TEMPLATE_PATTERN_VALUE,
type CoverageBand,
type PlannerResolvedPatternGroup,
type PreviewCell,
type RosterPatternGroupMode,
type RosterPatternProfile,
type RosterWizardPreset,
type StaffConfig,
type StaffRestrictionDraft,
type WeeklyTemplateWeek,
type WizardPairRule,
type WorkShift,
} from './근무표자동편성-types';

const _OFF = OFF_SHIFT_TOKEN;

export function buildDefaultShiftOrder(shifts: WorkShift[]) {
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

function pickShiftByKeywords(shifts: WorkShift[], keywords: string[]) {
  return shifts.find((shift) => keywords.some((keyword) => normalizeShiftName(shift.name).includes(keyword)));
}

export function inferPattern(staff: StaffMember, shifts: WorkShift[]) {
  const assignedShift = shifts.find((shift) => shift.id === (staff as Record<string, unknown>)?.shift_id);
  const sources: Array<string | null | undefined> = [
    (staff as Record<string, unknown>)?.shift_type as string | undefined,
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

export function getBandShiftIds(
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

export function inferDedicatedPatternGroup(
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
      '데이전담',
      '직원 근무유형과 배정 근무를 기준으로 데이 전담자로 자동 감지했습니다.'
    );
  }

  if (hasPatternKeyword(sources, EVENING_DEDICATED_PATTERN_KEYWORDS)) {
    return buildGroup(
      'evening',
      'evening_fixed',
      '이브전담',
      '직원 근무유형과 배정 근무를 기준으로 이브 전담자로 자동 감지했습니다.'
    );
  }

  if (hasPatternKeyword(sources, NIGHT_DEDICATED_PATTERN_KEYWORDS)) {
    return buildGroup(
      'night',
      'night_fixed',
      '나이트전담',
      '직원 근무유형과 배정 근무를 기준으로 나이트 전담자로 자동 감지했습니다.'
    );
  }

  if (assignedShift && hasPatternKeyword(sources, FIXED_PATTERN_KEYWORDS)) {
    const assignedBand = resolveShiftBand(assignedShift);
    if (assignedBand === 'day') {
      return buildGroup(
        'day',
        'day_fixed',
        '데이전담',
        '고정 근무 힌트와 배정 근무 시간을 기준으로 데이 전담자로 판단했습니다.'
      );
    }
    if (assignedBand === 'evening') {
      return buildGroup(
        'evening',
        'evening_fixed',
        '이브전담',
        '고정 근무 힌트와 배정 근무 시간을 기준으로 이브 전담자로 판단했습니다.'
      );
    }
    if (assignedBand === 'night') {
      return buildGroup(
        'night',
        'night_fixed',
        '나이트전담',
        '고정 근무 힌트와 배정 근무 시간을 기준으로 나이트 전담자로 판단했습니다.'
      );
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

export function getRequiredShiftCount(pattern: string) {
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

export function normalizeCustomPatternSequence(sequence: string[], workShifts: WorkShift[]) {
  const validShiftIds = new Set(workShifts.map((shift) => shift.id));
  return sequence.filter((token) => token === _OFF || validShiftIds.has(token));
}

export function buildDefaultCustomPatternSequence(shiftIds: string[]) {
  const uniqueShiftIds = shiftIds.filter(Boolean).filter((shiftId, index, list) => list.indexOf(shiftId) === index);
  if (uniqueShiftIds.length === 0) return [];
  if (uniqueShiftIds.length === 1) return uniqueShiftIds;
  return [...uniqueShiftIds, _OFF];
}

export function normalizeActiveWeekdays(activeWeekdays: number[]) {
  const orderMap = new Map(WEEKDAY_PICKER_ORDER.map((day, index) => [day, index]));
  return Array.from(new Set(activeWeekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))).sort(
    (left, right) => (orderMap.get(left) ?? 99) - (orderMap.get(right) ?? 99)
  );
}

export function buildDefaultWeeklyTemplateWeeks(shiftIds: string[], weekCount = 1): WeeklyTemplateWeek[] {
  const normalizedShiftIds = shiftIds.filter(Boolean).filter((shiftId, index, list) => list.indexOf(shiftId) === index);
  const safeWeekCount = Math.max(1, Math.min(6, Math.floor(weekCount) || 1));
  const fallbackShiftId = normalizedShiftIds[0] || '';

  return Array.from({ length: safeWeekCount }, (_, index) => ({
    shiftId: normalizedShiftIds[index] || fallbackShiftId,
    activeWeekdays: [1, 2, 3, 4, 5],
  }));
}

export function normalizeWeeklyTemplateWeeks(
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

export function getWeeklyTemplateWeekLabel(index: number) {
  return `${index + 1}주차`;
}

export function formatWeekdaySummary(activeWeekdays: number[]) {
  const normalized = normalizeActiveWeekdays(activeWeekdays);
  if (normalized.length === 0) return '전체 휴무';
  return normalized.map((day) => WEEKDAY_LABELS[day]).join(' · ');
}

export function buildWeeklyTemplateAnchor(monthDates: string[]) {
  const firstDate = monthDates[0] ? new Date(`${monthDates[0]}T00:00:00`) : new Date();
  const anchor = new Date(firstDate);
  anchor.setHours(0, 0, 0, 0);
  return anchor;
}

export function resolveWeeklyTemplateWeekIndex(date: string, anchor: Date, cycleLength: number) {
  const current = new Date(`${date}T00:00:00`);
  current.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((current.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24));
  const weekOffset = Math.floor(diffDays / 7);
  return ((weekOffset % cycleLength) + cycleLength) % cycleLength;
}

export function buildWizardPresetDescription(pattern: string, weeklyTemplateWeeks: WeeklyTemplateWeek[], shiftCount: number) {
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

export function normalizePresetRecord(record: Record<string, unknown>): RosterWizardPreset | null {
  if (!record || typeof record !== 'object') return null;
  const id = String(record.id || '').trim();
  const name = String(record.name || '').trim();
  if (!id || !name) return null;

  const generationRule = _normalizeGenerationRule(record.generationRule);
  const shiftIds = Array.isArray(record.shiftIds)
    ? record.shiftIds
        .map((shiftId: unknown) => String(shiftId || '').trim())
        .filter(Boolean)
    : [];
  const shiftNames = Array.isArray(record.shiftNames)
    ? record.shiftNames
        .map((shiftName: unknown) => String(shiftName || '').trim())
        .filter(Boolean)
    : [];

  const customPatternSlots = Array.isArray(record.customPatternSlots)
    ? record.customPatternSlots
        .map((token: unknown) => {
          if (token === 'OFF') return 'OFF' as const;
          const slot = Number(token);
          return Number.isInteger(slot) && slot > 0 ? slot : null;
        })
        .filter((token: number | 'OFF' | null): token is number | 'OFF' => token !== null)
    : [];

  const weeklyTemplateWeeks = Array.isArray(record.weeklyTemplateWeeks)
    ? record.weeklyTemplateWeeks
        .map((week: unknown) => {
          const w = week as Record<string, unknown> | null | undefined;
          const shiftSlot = Number(w?.shiftSlot);
          if (!Number.isInteger(shiftSlot) || shiftSlot <= 0) return null;
          return {
            shiftSlot,
            activeWeekdays: normalizeActiveWeekdays(Array.isArray(w?.activeWeekdays) ? w.activeWeekdays as number[] : []),
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
  const staffNightRanges =
    record.staffNightRanges && typeof record.staffNightRanges === 'object'
      ? Object.fromEntries(
          Object.entries(record.staffNightRanges as Record<string, unknown>).map(([staffId, value]) => {
            const source = value as Record<string, unknown> | null | undefined;
            const minNightShiftCount = clampNightShiftCount(
              Number(source?.minNightShiftCount) || 0,
              31
            );
            const maxNightShiftCount = Math.max(
              minNightShiftCount,
              clampNightShiftCount(Number(source?.maxNightShiftCount) || 0, 31)
            );

            return [
              String(staffId || ''),
              {
                minNightShiftCount,
                maxNightShiftCount,
              },
            ];
          })
        )
      : {};
  const staffBlockPreferences =
    record.staffBlockPreferences && typeof record.staffBlockPreferences === 'object'
      ? Object.fromEntries(
          Object.entries(record.staffBlockPreferences as Record<string, unknown>).map(([staffId, value]) => [
            String(staffId || ''),
            normalizeStaffBlockPreference(value),
          ])
        )
      : {};
  const staffDedicatedBands =
    record.staffDedicatedBands && typeof record.staffDedicatedBands === 'object'
      ? Object.fromEntries(
          Object.entries(record.staffDedicatedBands as Record<string, unknown>).map(([staffId, value]) => {
            const normalizedValue = String(value || '').trim().toLowerCase();
            const band: CoverageBand | '' =
              normalizedValue === 'day' ||
              normalizedValue === 'evening' ||
              normalizedValue === 'night'
                ? (normalizedValue as CoverageBand)
                : '';
            return [String(staffId || ''), band];
          })
        )
      : {};
  const staffCoverageRoleTags =
    record.staffCoverageRoleTags && typeof record.staffCoverageRoleTags === 'object'
      ? Object.fromEntries(
          Object.entries(record.staffCoverageRoleTags as Record<string, unknown>).map(([staffId, value]) => [
            String(staffId || ''),
            _normalizeCoverageRoleTags(Array.isArray(value) ? value : String(value || '').split(',')),
          ])
        )
      : {};
  const staffRestrictions =
    record.staffRestrictions && typeof record.staffRestrictions === 'object'
      ? Object.fromEntries(
          Object.entries(record.staffRestrictions as Record<string, unknown>).map(([staffId, value]) => {
            const source = value as Record<string, unknown> | null | undefined;
            return [
              String(staffId || ''),
              {
                blockedShiftBands: normalizeBlockedShiftBands(source?.blockedShiftBands),
                blockedWeekdays: normalizeBlockedWeekdays(source?.blockedWeekdays),
                avoidWeekendWork: Boolean(source?.avoidWeekendWork),
                avoidHolidayWork: Boolean(source?.avoidHolidayWork),
                preferWeekendOff: Boolean(source?.preferWeekendOff),
                preferHolidayOff: Boolean(source?.preferHolidayOff),
                avoidConsecutiveEvening: Boolean(source?.avoidConsecutiveEvening),
                preferEarlyMonthNight: Boolean(source?.preferEarlyMonthNight),
              } satisfies StaffRestrictionDraft,
            ];
          })
        )
      : {};
  const pairRules = Array.isArray(record.pairRules)
    ? record.pairRules
        .map((entry, index) => {
          const source = entry as Record<string, unknown> | null | undefined;
          const primaryStaffId = String(source?.primaryStaffId || '').trim();
          const secondaryStaffId = String(source?.secondaryStaffId || '').trim();
          const mode = String(source?.mode || '').trim();
          const band = String(source?.band || '').trim();
          if (!primaryStaffId || !secondaryStaffId || primaryStaffId === secondaryStaffId) return null;
          if (mode !== 'together' && mode !== 'separate') return null;
          if (band !== 'night' && band !== 'work') return null;
          return {
            id: String(source?.id || `pair-rule-${index + 1}`),
            primaryStaffId,
            secondaryStaffId,
            mode,
            band,
          } satisfies WizardPairRule;
        })
        .filter((entry): entry is WizardPairRule => Boolean(entry))
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
    generationRule,
    staffNightRanges,
    staffBlockPreferences,
    staffDedicatedBands,
    staffCoverageRoleTags,
    staffRestrictions,
    pairRules,
  };
}

export function buildInitialConfig(staff: StaffMember, index: number, shifts: WorkShift[], days: number): StaffConfig {
  const primary = shifts.find((shift) => shift.id === staff?.shift_id)?.id || shifts[0]?.id || '';
  const secondary = shifts[1]?.id || primary;
  const tertiary = shifts[2]?.id || secondary || primary;
  const pattern = inferPattern(staff, shifts);

  return {
    enabled: true,
    pattern,
    primaryShiftId: primary,
    secondaryShiftId: secondary,
    tertiaryShiftId: tertiary,
    startOffset: index,
    nightShiftCount: isNightPattern(pattern) ? inferDefaultNightShiftCount(pattern, days) : 0,
    minNightShiftCount: 0,
    maxNightShiftCount: 0,
    blockPreference: 'balanced',
    customPatternSequence: [],
    weeklyTemplateWeeks: buildDefaultWeeklyTemplateWeeks([primary, secondary, tertiary]),
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

export function computePatternDiversityMetrics(cells: PreviewCell[]) {
  const workTokens = cells
    .map((cell) => String(cell.code || '').trim().toUpperCase())
    .filter((token) => token && token !== 'OFF');

  if (workTokens.length === 0) {
    return {
      diversityScore: 0,
      longestSameBandStreak: 0,
      repeatedPatternCount: 0,
    };
  }

  const streakLengths: number[] = [];
  const transitionSet = new Set<string>();
  let longestSameBandStreak = 0;
  let currentStreak = 0;

  workTokens.forEach((token, index) => {
    if (index === 0 || workTokens[index - 1] !== token) {
      if (currentStreak > 0) {
        streakLengths.push(currentStreak);
      }
      currentStreak = 1;
    } else {
      currentStreak += 1;
    }

    if (index > 0) {
      transitionSet.add(`${workTokens[index - 1]}->${token}`);
    }
    longestSameBandStreak = Math.max(longestSameBandStreak, currentStreak);
  });
  if (currentStreak > 0) {
    streakLengths.push(currentStreak);
  }

  const repeatedPatternCount = Math.max(
    0,
    streakLengths.filter((length) => length >= 3).length - 1
  );
  const uniqueWorkTokens = new Set(workTokens);
  const uniqueStreakLengths = new Set(streakLengths);
  const rawScore =
    28 +
    uniqueWorkTokens.size * 18 +
    uniqueStreakLengths.size * 10 +
    transitionSet.size * 6 -
    Math.max(0, longestSameBandStreak - 3) * 9 -
    repeatedPatternCount * 6;

  return {
    diversityScore: Math.max(0, Math.min(100, Math.round(rawScore))),
    longestSameBandStreak,
    repeatedPatternCount,
  };
}

export function getRestrictedAllowedShiftIds(
  allowedShiftIds: string[],
  blockedShiftBands: CoverageBand[] | undefined,
  shiftMap: Map<string, WorkShift>
) {
  const blockedBandSet = new Set(normalizeBlockedShiftBands(blockedShiftBands));
  if (blockedBandSet.size === 0) return allowedShiftIds.filter(Boolean);

  return allowedShiftIds.filter((shiftId) => {
    const shift = shiftMap.get(shiftId);
    if (!shift) return false;
    return !blockedBandSet.has(resolveShiftBand(shift));
  });
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

export function buildPatternSchedule(config: StaffConfig, monthDates: string[], workShifts: WorkShift[]) {
  const primary = config.primaryShiftId;
  const secondary = config.secondaryShiftId || primary;
  const tertiary = config.tertiaryShiftId || secondary || primary;
  const primaryShift = workShifts.find((shift) => shift.id === primary);
  const primaryIncludesWeekend = primaryShift ? resolveConfiguredWorkDayMode(primaryShift) === 'all_days' : false;
  const customSequence = normalizeCustomPatternSequence(config.customPatternSequence || [], workShifts);
  const localWeeklyTemplateWeeks = normalizeWeeklyTemplateWeeks(config.weeklyTemplateWeeks || [], [
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
        return primaryIncludesWeekend || (dayOfWeek !== 0 && dayOfWeek !== 6) ? primary : _OFF;
      case '2교대': {
        const sequence = [primary, secondary, _OFF, _OFF];
        return sequence[(dateIndex + config.startOffset) % sequence.length];
      }
      case '3교대': {
        const sequence = [primary, secondary, tertiary, _OFF];
        return sequence[(dateIndex + config.startOffset) % sequence.length];
      }
      case '2일근무1일휴무': {
        const sequence = [primary, secondary || primary, _OFF];
        return sequence[(dateIndex + config.startOffset) % sequence.length];
      }
      case '1일근무1일휴무': {
        const sequence = [primary, _OFF];
        return sequence[(dateIndex + config.startOffset) % sequence.length];
      }
      case '야간전담': {
        const nightShift = tertiary || secondary || primary;
        const sequence = [nightShift, nightShift, _OFF, _OFF];
        return sequence[(dateIndex + config.startOffset) % sequence.length];
      }
      case CUSTOM_PATTERN_VALUE: {
        if (fallbackCustomSequence.length === 0) return _OFF;
        return fallbackCustomSequence[(dateIndex + config.startOffset) % fallbackCustomSequence.length];
      }
      case WEEKLY_TEMPLATE_PATTERN_VALUE: {
        if (localWeeklyTemplateWeeks.length === 0) return _OFF;
        const weekIndex = resolveWeeklyTemplateWeekIndex(date, weeklyTemplateAnchor, localWeeklyTemplateWeeks.length);
        const weekConfig = localWeeklyTemplateWeeks[weekIndex];
        if (!weekConfig?.shiftId || !weekConfig.activeWeekdays.includes(dayOfWeek)) {
          return _OFF;
        }
        return weekConfig.shiftId;
      }
      default:
        return primaryIncludesWeekend || (dayOfWeek !== 0 && dayOfWeek !== 6) ? primary : _OFF;
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
      ? _OFF
      : [secondary, primary, _OFF].find((shiftId) => shiftId && shiftId !== nightShiftId) || _OFF;
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
        ? allDays.filter((day) => !desiredNightDays.has(day) && baseRow[day - 1] === _OFF)
        : allDays.filter(
          (day) =>
            !desiredNightDays.has(day) &&
            baseRow[day - 1] !== _OFF &&
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
