/**
 * Extracted coverage and staffing-rule helpers.
 */
import type { StaffMember } from '@/types';
import {
  buildDefaultGenerationRule,
  type RosterGenerationRule,
} from '@/lib/roster-generation-rules';
import { isKoreanPublicHoliday } from '@/lib/korean-public-holidays';
import { normalizeCoverageRoleTags } from '@/lib/roster-role-tags';
import type {
  CoverageBand,
  StaffConfig,
  StaffPlanningMeta,
  StaffRestrictionDraft,
} from './roster-wizard-types';
import {
  getDepartmentName,
  getTeamRecommendationCategory,
  isWeekendDateKey,
  normalizeBlockedWeekdays,
  normalizeShiftName,
} from './roster-shift-foundations';


export function getRoleCoverageTargetByBand(
  roleRule: Pick<RosterGenerationRule['roleCoverageRules'][number], 'minDayStaff' | 'minEveningStaff' | 'minNightStaff'>,
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

// ─── 제한 조건 ─────────────────────────────────────────────────────────────────

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

export function buildStaffRestrictionBlockedDateSet(config: StaffConfig, monthDates: string[]) {
  const blocked = new Set<string>();
  const blockedWeekdays = new Set(normalizeBlockedWeekdays(config.blockedWeekdays || []));

  monthDates.forEach((dateKey) => {
    const weekday = new Date(`${dateKey}T00:00:00`).getDay();
    if (blockedWeekdays.has(weekday)) { blocked.add(dateKey); return; }
    if (config.avoidWeekendWork && isWeekendDateKey(dateKey)) { blocked.add(dateKey); return; }
    if (config.avoidHolidayWork && isKoreanPublicHoliday(dateKey)) { blocked.add(dateKey); }
  });

  return blocked;
}

// ─── 커버리지 타겟 계산 ────────────────────────────────────────────────────────

export function getCoverageTargetsForDate(rule: RosterGenerationRule, dateKey: string) {
  const baseTargets: Record<'day' | 'evening' | 'night', number> = {
    day: Math.max(0, Math.floor(rule.minDayStaff || 0)),
    evening: Math.max(0, Math.floor(rule.minEveningStaff || 0)),
    night: Math.max(0, Math.floor(rule.minNightStaff || 0)),
  };
  const specificOverride = (rule.dateCoverageOverrides || []).find((entry) => entry.date === dateKey);
  if (specificOverride) {
    return {
      targets: {
        day: Math.max(0, Math.floor(specificOverride.minDayStaff || 0)),
        evening: Math.max(0, Math.floor(specificOverride.minEveningStaff || 0)),
        night: Math.max(0, Math.floor(specificOverride.minNightStaff || 0)),
      } satisfies Record<'day' | 'evening' | 'night', number>,
      sourceLabel: `${dateKey} override`,
    };
  }

  if (isKoreanPublicHoliday(dateKey)) {
    const hasHolidayOverride =
      (rule.holidayMinDayStaff || 0) > 0 ||
      (rule.holidayMinEveningStaff || 0) > 0 ||
      (rule.holidayMinNightStaff || 0) > 0;
    if (hasHolidayOverride) {
      return {
        targets: {
          day: Math.max(0, Math.floor(rule.holidayMinDayStaff || 0)),
          evening: Math.max(0, Math.floor(rule.holidayMinEveningStaff || 0)),
          night: Math.max(0, Math.floor(rule.holidayMinNightStaff || 0)),
        } satisfies Record<'day' | 'evening' | 'night', number>,
        sourceLabel: 'holiday override',
      };
    }
  }

  if (isWeekendDateKey(dateKey)) {
    const hasWeekendOverride =
      (rule.weekendMinDayStaff || 0) > 0 ||
      (rule.weekendMinEveningStaff || 0) > 0 ||
      (rule.weekendMinNightStaff || 0) > 0;
    if (hasWeekendOverride) {
      return {
        targets: {
          day: Math.max(0, Math.floor(rule.weekendMinDayStaff || 0)),
          evening: Math.max(0, Math.floor(rule.weekendMinEveningStaff || 0)),
          night: Math.max(0, Math.floor(rule.weekendMinNightStaff || 0)),
        } satisfies Record<'day' | 'evening' | 'night', number>,
        sourceLabel: 'weekend override',
      };
    }
  }

  return { targets: baseTargets, sourceLabel: 'base rule' };
}

export function buildFallbackGenerationRuleForDepartment(
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
    minRotationNightCount: category === 'ward' ? Math.max(3, Math.round(days / 7)) : 0,
    maxRotationNightCount: category === 'ward' ? Math.max(4, Math.round(days / 5)) : 0,
    maxConsecutiveEveningShifts: 0,
    offDaysAfterNight: category === 'ward' ? 1 : 0,
    nightBlockSize: category === 'ward' ? 4 : 1,
    maxConsecutiveWorkDays: category === 'ward' ? 5 : 6,
    maxConsecutiveWeekendWorkDays: category === 'ward' ? 2 : 0,
    distributeWeekendShifts: category === 'ward',
    distributeHolidayShifts: category === 'ward',
    separateNewNursesByShift: category === 'ward',
    minDayStaff: category === 'ward' ? 1 : 0,
    minEveningStaff: category === 'ward' ? 1 : 0,
    minNightStaff: category === 'ward' ? 1 : 0,
  };
}

export function applyWardCoverageDefaults(rule: RosterGenerationRule, department: string) {
  if (getTeamRecommendationCategory(department) !== 'ward') return rule;
  return {
    ...rule,
    minDayStaff: Math.max(1, Math.floor(rule.minDayStaff || 0)),
    minEveningStaff: Math.max(1, Math.floor(rule.minEveningStaff || 0)),
    minNightStaff: Math.max(1, Math.floor(rule.minNightStaff || 0)),
  };
}
