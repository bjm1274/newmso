/**
 * Extracted custom-pattern and weekly-template helpers.
 */
import type { WeeklyTemplateWeek, WorkShift } from './roster-wizard-types';
import { OFF_SHIFT_TOKEN, WEEKDAY_LABELS, WEEKDAY_PICKER_ORDER } from './roster-wizard-types';

export function normalizeCustomPatternSequence(sequence: string[], workShifts: WorkShift[]) {
  const validShiftIds = new Set(workShifts.map((shift) => shift.id));
  return sequence.filter((token) => token === OFF_SHIFT_TOKEN || validShiftIds.has(token));
}

export function buildDefaultCustomPatternSequence(shiftIds: string[]) {
  const uniqueShiftIds = shiftIds.filter(Boolean).filter((shiftId, index, list) => list.indexOf(shiftId) === index);
  if (uniqueShiftIds.length === 0) return [];
  if (uniqueShiftIds.length === 1) return uniqueShiftIds;
  return [...uniqueShiftIds, OFF_SHIFT_TOKEN];
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
