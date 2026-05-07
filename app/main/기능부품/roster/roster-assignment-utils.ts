/**
 * Extracted assignment-cycle and continuity helpers.
 */
import type { RosterPatternGroupMode } from '@/lib/roster-pattern-profiles';
import {
getAssignedShiftBand,
resolveConfiguredWorkDayMode,
resolveShiftBand,
sortShifts,
} from './roster-shift-foundations';
import type {
CoverageBand,
RosterGenerationStyle,
StaffBlockPreference,
WorkShift,
} from './roster-wizard-types';
import { GENERATION_STYLE_OPTIONS,OFF_SHIFT_TOKEN } from './roster-wizard-types';


export function buildEmptyCoverageCounts() {
  return { day: 0, evening: 0, night: 0 } satisfies Record<'day' | 'evening' | 'night', number>;
}

export function buildProgrammaticCycle(
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
  if (mode === 'night_fixed') return [nightShiftId, nightShiftId, OFF_SHIFT_TOKEN, OFF_SHIFT_TOKEN];
  if (mode === 'evening_fixed') return [eveningShiftId, eveningShiftId, OFF_SHIFT_TOKEN, OFF_SHIFT_TOKEN];

  const hasNightShift = sortedShiftIds.some((shiftId) => resolveShiftBand(shiftMap.get(shiftId)!) === 'night');
  return [...sortedShiftIds, OFF_SHIFT_TOKEN, ...(hasNightShift ? [OFF_SHIFT_TOKEN] : [])];
}

export function buildProgrammaticAssignments({
  monthDates,
  shiftMap,
  cycle,
  staffIndex,
  blockedDateSet,
  teamDailyBandCounts,
}: {
  monthDates: string[];
  shiftMap: Map<string, WorkShift>;
  cycle: string[];
  staffIndex: number;
  mode: RosterPatternGroupMode;
  blockedDateSet?: Set<string>;
  teamDailyBandCounts?: Array<Record<'day' | 'evening' | 'night', number>>;
}) {
  const cycleLength = Math.max(cycle.length, 1);
  const offset = staffIndex % cycleLength;

  return monthDates.map((date, index) => {
    if (blockedDateSet?.has(date)) return OFF_SHIFT_TOKEN;
    const token = cycle[(index + offset) % cycleLength] || OFF_SHIFT_TOKEN;
    if (token === OFF_SHIFT_TOKEN) return OFF_SHIFT_TOKEN;
    const shift = shiftMap.get(token);
    if (!shift) return OFF_SHIFT_TOKEN;
    const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
    if (resolveConfiguredWorkDayMode(shift) === 'weekdays' && (dayOfWeek === 0 || dayOfWeek === 6)) {
      return OFF_SHIFT_TOKEN;
    }
    const assignedBand = resolveShiftBand(shift);
    if (assignedBand && teamDailyBandCounts?.[index]) {
      teamDailyBandCounts[index][assignedBand] += 1;
    }
    return token;
  });
}

// ─── 야간 회복 규칙 ────────────────────────────────────────────────────────────

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
  if (maxRecoveryDays <= 0 || !nextShiftId || nextShiftId === OFF_SHIFT_TOKEN) return false;
  const nextBand = getAssignedShiftBand(nextShiftId, shiftMap);
  if (!nextBand) return false;

  if (nextBand !== 'night') return isNightRecoverySlot(assignments, index, shiftMap, maxRecoveryDays);

  let recoveryStartIndex = index + 1;
  while (recoveryStartIndex < assignments.length) {
    const followingBand = getAssignedShiftBand(assignments[recoveryStartIndex] || '', shiftMap);
    if (followingBand === 'night') { recoveryStartIndex += 1; continue; }
    break;
  }

  for (
    let recoveryIndex = recoveryStartIndex;
    recoveryIndex < assignments.length && recoveryIndex < recoveryStartIndex + maxRecoveryDays;
    recoveryIndex += 1
  ) {
    const band = getAssignedShiftBand(assignments[recoveryIndex] || '', shiftMap);
    if (band) return true;
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

  if (maxRecoveryDays <= 0) return nextAssignments.map((token) => token || OFF_SHIFT_TOKEN);

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

// ─── 연속 근무 스트릭 계산 ─────────────────────────────────────────────────────

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
    if (getAssignedShiftBand(assignments[cursor], shiftMap) !== previousBand) break;
    streak += 1;
  }
  return streak;
}

export function countPreviousWorkStreak(assignments: string[], index: number) {
  if (index <= 0) return 0;
  let streak = 0;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (!assignments[cursor] || assignments[cursor] === OFF_SHIFT_TOKEN) break;
    streak += 1;
  }
  return streak;
}

export function countNextWorkStreak(assignments: string[], index: number) {
  if (index >= assignments.length - 1) return 0;
  let streak = 0;
  for (let cursor = index + 1; cursor < assignments.length; cursor += 1) {
    if (!assignments[cursor] || assignments[cursor] === OFF_SHIFT_TOKEN) break;
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
    if (!isTaggedDate(dateKey)) break;
    if (!assignments[cursor] || assignments[cursor] === OFF_SHIFT_TOKEN) break;
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
      ? band === 'night' ? [1, 1, 2, 2, 3] : [1, 1, 2, 2, 3, 4]
      : generationStyle === 'block'
        ? band === 'night' ? [2, 3, 3, 4, 4] : [2, 3, 4, 4, 5]
        : generationStyle === 'stable'
          ? band === 'night' ? [2, 2, 3, 3, 4] : [2, 3, 3, 4, 5]
          : band === 'night' ? [1, 2, 3, 4] : [1, 2, 3, 4, 5];
  const seed = Math.abs(staffIndex * 17 + blockStartIndex * 13 + (band === 'day' ? 3 : band === 'evening' ? 5 : 7));
  let target = targetPool[seed % targetPool.length] || 1;

  if (blockPreference === 'short') target = Math.min(target, band === 'night' ? 2 : 3);
  else if (blockPreference === 'long') target = Math.max(target, band === 'night' ? 3 : 4);
  else if (blockPreference === 'night_focus' && band === 'night') target = Math.max(target, 3);

  return Math.max(1, Math.min(maxConsecutiveWorkDays, target));
}

// ─── 기타 ─────────────────────────────────────────────────────────────────────

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

export function getGenerationStyleMeta(style: RosterGenerationStyle) {
  return (
    GENERATION_STYLE_OPTIONS.find((option) => option.value === style) ||
    GENERATION_STYLE_OPTIONS[0]
  );
}

export function buildDepartmentScopeKey(primaryDepartment: string, includedDepartments: string[]) {
  const parts = [String(primaryDepartment || '').trim()]
    .concat(includedDepartments.map((d) => String(d || '').trim()))
    .filter(Boolean)
    .filter((d, i, list) => list.indexOf(d) === i)
    .sort((l, r) => l.localeCompare(r, 'ko'));
  return parts.join('|');
}

export function buildDepartmentScopeLabel(primaryDepartment: string, includedDepartments: string[]) {
  const parts = [String(primaryDepartment || '').trim()]
    .concat(includedDepartments.map((d) => String(d || '').trim()))
    .filter(Boolean)
    .filter((d, i, list) => list.indexOf(d) === i);
  if (parts.length <= 1) return parts[0] || '';
  return parts.join(' + ');
}
