/**
 * Extracted staff-config and pattern schedule helpers.
 */
import type { StaffMember } from '@/types';
import type { StaffConfig, WorkShift } from './roster-wizard-types';
import { CUSTOM_PATTERN_VALUE, OFF_SHIFT_TOKEN, WEEKLY_TEMPLATE_PATTERN_VALUE } from './roster-wizard-types';
import { selectDistributedDays } from './roster-rotation-core';
import { clampNightShiftCount } from './roster-shift-utils';
import { inferPattern, isNightPattern } from './roster-pattern-detection';
import { shiftIncludesWeekend } from './roster-pattern-display';
import {
  buildDefaultCustomPatternSequence,
  buildDefaultWeeklyTemplateWeeks,
  buildWeeklyTemplateAnchor,
  normalizeCustomPatternSequence,
  normalizeWeeklyTemplateWeeks,
  resolveWeeklyTemplateWeekIndex,
} from './roster-pattern-template-utils';

export function inferDefaultNightShiftCount(pattern: string, days: number) {
  if (pattern === '야간전담') return Math.ceil(days / 2);
  if (pattern === '3교대') return Math.max(1, Math.round(days / 4));
  return 0;
}

// ─── StaffConfig 초기값 빌더 ──────────────────────────────────────────────────

export function buildInitialConfig(
  staff: StaffMember,
  index: number,
  shifts: WorkShift[],
  days: number
): StaffConfig {
  const primary = shifts.find((shift) => shift.id === (staff as Record<string, unknown>)?.shift_id)?.id || shifts[0]?.id || '';
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

// ─── 패턴 스케줄 빌더 ─────────────────────────────────────────────────────────

export function buildPatternSchedule(
  config: StaffConfig,
  monthDates: string[],
  workShifts: WorkShift[]
) {
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
    Number.isFinite(config.nightShiftCount)
      ? config.nightShiftCount
      : inferDefaultNightShiftCount(config.pattern, days),
    days
  );
  const fallbackShiftId =
    config.pattern === '야간전담'
      ? OFF_SHIFT_TOKEN
      : [secondary, primary, OFF_SHIFT_TOKEN].find(
          (shiftId) => shiftId && shiftId !== nightShiftId
        ) || OFF_SHIFT_TOKEN;
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
