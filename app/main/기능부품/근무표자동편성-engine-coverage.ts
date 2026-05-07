import { isKoreanPublicHoliday } from '@/lib/korean-public-holidays';
import { buildDefaultGenerationRule } from '@/lib/roster-generation-rules';
import {
buildEmptyCoverageCounts,
countNextWorkStreak,
countPreviousBandStreak,
countPreviousWorkStreak,
getAssignedShiftBand,
getTeamRecommendationCategory,
isWeekendDateKey,
resolveConfiguredWorkDayMode,
resolveShiftBand,
sortShifts,
summarizeRosterDateLabels,
wouldViolateNightRecoveryWindow,
} from './근무표자동편성-engine-utils';
import {
OFF_SHIFT_TOKEN,
type GeneratedCoveragePlan,
type RosterGenerationRule,
type RosterPatternGroupMode,
type WorkShift
} from './근무표자동편성-types';

const _OFF = OFF_SHIFT_TOKEN;

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

  return {
    targets: baseTargets,
    sourceLabel: 'base rule',
  };
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
  if (getTeamRecommendationCategory(department) !== 'ward') {
    return rule;
  }

  return {
    ...rule,
    minDayStaff: Math.max(1, Math.floor(rule.minDayStaff || 0)),
    minEveningStaff: Math.max(1, Math.floor(rule.minEveningStaff || 0)),
    minNightStaff: Math.max(1, Math.floor(rule.minNightStaff || 0)),
  };
}

export function canAssignPlanShiftAtDate({
  plan,
  dateIndex,
  nextShiftId,
  monthDates,
  shiftMap,
  rule,
}: {
  plan: GeneratedCoveragePlan;
  dateIndex: number;
  nextShiftId: string;
  monthDates: string[];
  shiftMap: Map<string, WorkShift>;
  rule: RosterGenerationRule;
}) {
  const dateKey = monthDates[dateIndex] || '';
  if (!dateKey || plan.blockedDateSet?.has(dateKey)) return false;
  if (!plan.allowedShiftIds.includes(nextShiftId)) return false;

  const shift = shiftMap.get(nextShiftId);
  if (!shift) return false;

  const dayOfWeek = new Date(`${dateKey}T00:00:00`).getDay();
  if (resolveConfiguredWorkDayMode(shift) === 'weekdays' && (dayOfWeek === 0 || dayOfWeek === 6)) {
    return false;
  }

  const nextBand = resolveShiftBand(shift);
  const previousToken = dateIndex > 0 ? plan.assignments[dateIndex - 1] : '';
  const previousBand = getAssignedShiftBand(previousToken, shiftMap);
  const followingToken =
    dateIndex < plan.assignments.length - 1 ? plan.assignments[dateIndex + 1] : '';
  const followingBand = getAssignedShiftBand(followingToken, shiftMap);
  if (rule.avoidDayAfterNight && previousBand === 'night' && nextBand === 'day') {
    return false;
  }
  if (rule.avoidDayAfterEvening && previousBand === 'evening' && nextBand === 'day') {
    return false;
  }
  if (rule.avoidDayAfterNight && nextBand === 'night' && followingBand === 'day') {
    return false;
  }
  if (rule.avoidDayAfterEvening && nextBand === 'evening' && followingBand === 'day') {
    return false;
  }
  if (
    rule.maxConsecutiveEveningShifts > 0 &&
    nextBand === 'evening' &&
    countPreviousBandStreak(plan.assignments, dateIndex, shiftMap) >= rule.maxConsecutiveEveningShifts &&
    previousBand === 'evening'
  ) {
    return false;
  }

  if (
    wouldViolateNightRecoveryWindow(
      plan.assignments,
      dateIndex,
      nextShiftId,
      shiftMap,
      rule.offDaysAfterNight
    )
  ) {
    return false;
  }

  const currentToken = plan.assignments[dateIndex] || _OFF;
  if (currentToken === _OFF && nextBand) {
    const previousWorkStreak = countPreviousWorkStreak(plan.assignments, dateIndex);
    const nextWorkStreak = countNextWorkStreak(plan.assignments, dateIndex);
    const maxAllowedWorkDays = Math.max(2, Math.min(7, Math.floor(rule.maxConsecutiveWorkDays || 5)));
    if (previousWorkStreak + 1 + nextWorkStreak > maxAllowedWorkDays) {
      return false;
    }
  }

  return true;
}

export function buildProgrammaticCycle(
  mode: RosterPatternGroupMode,
  shiftIds: string[],
  shiftMap: Map<string, WorkShift>
) {
  const sortedShiftIds = sortShifts(
    shiftIds.map((shiftId) => shiftMap.get(shiftId)).filter((shift): shift is WorkShift => Boolean(shift))
  ).map((shift) => shift.id);

  if (sortedShiftIds.length === 0) return [_OFF];

  const primaryShiftId = sortedShiftIds[0];
  const eveningShiftId =
    sortedShiftIds.find((shiftId) => resolveShiftBand(shiftMap.get(shiftId)!) === 'evening') ||
    primaryShiftId;
  const nightShiftId =
    sortedShiftIds.find((shiftId) => resolveShiftBand(shiftMap.get(shiftId)!) === 'night') ||
    primaryShiftId;

  if (mode === 'day_fixed') {
    return [primaryShiftId, primaryShiftId, primaryShiftId, primaryShiftId, primaryShiftId, _OFF, _OFF];
  }

  if (mode === 'night_fixed') {
    return [nightShiftId, nightShiftId, _OFF, _OFF];
  }

  if (mode === 'evening_fixed') {
    return [eveningShiftId, eveningShiftId, _OFF, _OFF];
  }

  const hasNightShift = sortedShiftIds.some(
    (shiftId) => resolveShiftBand(shiftMap.get(shiftId)!) === 'night'
  );
  return [...sortedShiftIds, _OFF, ...(hasNightShift ? [_OFF] : [])];
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
    if (blockedDateSet?.has(date)) return _OFF;

    const token = cycle[(index + offset) % cycleLength] || _OFF;
    if (token === _OFF) return _OFF;

    const shift = shiftMap.get(token);
    if (!shift) return _OFF;

    const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
    if (resolveConfiguredWorkDayMode(shift) === 'weekdays' && (dayOfWeek === 0 || dayOfWeek === 6)) {
      return _OFF;
    }

    const assignedBand = resolveShiftBand(shift);
    if (assignedBand && teamDailyBandCounts?.[index]) {
      teamDailyBandCounts[index][assignedBand] += 1;
    }

    return token;
  });
}

export function getRosterModeGenerationPriority(mode: RosterPatternGroupMode) {
  switch (mode) {
    case 'day_fixed':
      return 0;
    case 'evening_fixed':
      return 1;
    case 'night_fixed':
      return 2;
    case 'rotation':
      return 3;
    default:
      return 4;
  }
}

export function enforceTeamMinimumCoverage({
  staffPlans,
  monthDates,
  shiftMap,
  rule,
}: {
  staffPlans: GeneratedCoveragePlan[];
  monthDates: string[];
  shiftMap: Map<string, WorkShift>;
  rule: RosterGenerationRule;
}) {
  const hasAnyMinimum = monthDates.some((dateKey) => {
    const { targets } = getCoverageTargetsForDate(rule, dateKey);
    return targets.day + targets.evening + targets.night > 0;
  });

  if (!hasAnyMinimum || staffPlans.length === 0) {
    return staffPlans;
  }

  const nextPlans = staffPlans.map((plan) => ({
    ...plan,
    assignments: plan.assignments.map((token) => (!token || token === 'OFF' ? _OFF : token)),
  }));
  const weekendDateSet = new Set(
    monthDates.filter((date) => {
      const weekday = new Date(`${date}T00:00:00`).getDay();
      return weekday === 0 || weekday === 6;
    })
  );
  const holidayDateSet = new Set(monthDates.filter((date) => isKoreanPublicHoliday(date)));

  monthDates.forEach((_, dateIndex) => {
    const dateKey = monthDates[dateIndex] || '';
    const { targets: minTargets } = getCoverageTargetsForDate(rule, dateKey);
    const isWeekend = weekendDateSet.has(dateKey);
    const isHoliday = holidayDateSet.has(dateKey);
    const currentCounts = buildEmptyCoverageCounts();

    nextPlans.forEach((plan) => {
      const band = getAssignedShiftBand(plan.assignments[dateIndex] || '', shiftMap);
      if (band) currentCounts[band] += 1;
    });

    (['day', 'evening', 'night'] as const).forEach((targetBand) => {
      while (currentCounts[targetBand] < minTargets[targetBand]) {
        const candidate = nextPlans
          .map((plan) => {
            const targetShiftId = plan.allowedShiftIds.find(
              (shiftId) => resolveShiftBand(shiftMap.get(shiftId)!) === targetBand
            );
            if (
              !targetShiftId ||
              !canAssignPlanShiftAtDate({
                plan,
                dateIndex,
                nextShiftId: targetShiftId,
                monthDates,
                shiftMap,
                rule,
              })
            ) {
              return null;
            }

            const currentToken = plan.assignments[dateIndex] || _OFF;
            const currentBand = getAssignedShiftBand(currentToken, shiftMap);
            const isOff = currentToken === _OFF;
            const canSwapFromCurrentBand =
              currentBand !== null && currentCounts[currentBand] > minTargets[currentBand];
            if (!isOff && !canSwapFromCurrentBand) return null;

            return {
              plan,
              targetShiftId,
              currentBand,
              priority:
                plan.effectiveMode === 'rotation'
                  ? isOff
                    ? 0
                    : 1
                  : isOff
                    ? 2
                    : 3,
              weekendLoad: isWeekend
                ? plan.assignments.filter(
                    (token, assignmentIndex) =>
                      token !== _OFF && weekendDateSet.has(monthDates[assignmentIndex] || '')
                  ).length
                : 0,
              holidayLoad: isHoliday
                ? plan.assignments.filter(
                    (token, assignmentIndex) =>
                      token !== _OFF && holidayDateSet.has(monthDates[assignmentIndex] || '')
                  ).length
                : 0,
            };
          })
          .filter(
            (
              item
            ): item is {
              plan: GeneratedCoveragePlan & { assignments: string[] };
              targetShiftId: string;
              currentBand: 'day' | 'evening' | 'night' | null;
              priority: number;
              weekendLoad: number;
              holidayLoad: number;
            } => Boolean(item)
          )
          .sort((left, right) => {
            if (left.priority !== right.priority) return left.priority - right.priority;
            if (left.weekendLoad !== right.weekendLoad) return left.weekendLoad - right.weekendLoad;
            if (left.holidayLoad !== right.holidayLoad) return left.holidayLoad - right.holidayLoad;
            return left.plan.staffId.localeCompare(right.plan.staffId);
          })[0];

        if (!candidate) {
          break;
        }

        if (candidate.currentBand) {
          currentCounts[candidate.currentBand] = Math.max(0, currentCounts[candidate.currentBand] - 1);
        }
        candidate.plan.assignments[dateIndex] = candidate.targetShiftId;
        currentCounts[targetBand] += 1;

        const blockedBandDates: string[] = [];
        const blockedWeekdayDates: string[] = [];
        const weekendDates: string[] = [];
        const holidayDates: string[] = [];
        const restrictionFragments: string[] = [];
        const items: Array<{
          id: string;
          category: 'restriction';
          tone: 'amber';
          severity: number;
          targetTestId: string;
          title: string;
          detail: string;
        }> = [];
        const row = {
          staff: {
            id: '',
            name: '',
          },
        };

        if (blockedBandDates.length > 0) {
          restrictionFragments.push(`금지 시간대 ${summarizeRosterDateLabels(blockedBandDates)}`);
        }
        if (blockedWeekdayDates.length > 0) {
          restrictionFragments.push(`금지 요일 ${summarizeRosterDateLabels(blockedWeekdayDates)}`);
        }
        if (weekendDates.length > 0) {
          restrictionFragments.push(`주말 근무 ${summarizeRosterDateLabels(weekendDates)}`);
        }
        if (holidayDates.length > 0) {
          restrictionFragments.push(`공휴일 근무 ${summarizeRosterDateLabels(holidayDates)}`);
        }

        if (restrictionFragments.length > 0) {
          items.push({
            id: `restriction-${row.staff.id}`,
            category: 'restriction',
            tone: 'amber',
            severity: 2,
            targetTestId: `roster-preview-row-${row.staff.id}`,
            title: `${row.staff.name} 개인 제한 위반`,
            detail: restrictionFragments.join(' · '),
          });
        }
      }
    });
  });

  return nextPlans;
}

export function enforceMinimumMonthlyOffDays({
  staffPlans,
  monthDates,
  shiftMap,
  rule,
}: {
  staffPlans: GeneratedCoveragePlan[];
  monthDates: string[];
  shiftMap: Map<string, WorkShift>;
  rule: RosterGenerationRule;
}) {
  const minimumOffDays = Math.max(
    0,
    Math.min(monthDates.length, Math.floor(rule.minMonthlyOffDays || 0))
  );
  if (minimumOffDays === 0 || staffPlans.length === 0) {
    return staffPlans;
  }

  const weekendDateSet = new Set(
    monthDates.filter((date) => {
      const weekday = new Date(`${date}T00:00:00`).getDay();
      return weekday === 0 || weekday === 6;
    })
  );
  const holidayDateSet = new Set(monthDates.filter((date) => isKoreanPublicHoliday(date)));
  const nextPlans = staffPlans.map((plan) => ({
    ...plan,
    assignments: plan.assignments.map((token) => (!token || token === 'OFF' ? _OFF : token)),
  }));
  const dailyCounts = monthDates.map(() => buildEmptyCoverageCounts());

  nextPlans.forEach((plan) => {
    plan.assignments.forEach((token, dateIndex) => {
      const band = getAssignedShiftBand(token, shiftMap);
      if (band) {
        dailyCounts[dateIndex][band] += 1;
      }
    });
  });

  nextPlans.forEach((plan) => {
    let currentOffDays = plan.assignments.reduce(
      (count, token) => count + (!token || token === _OFF ? 1 : 0),
      0
    );
    if (currentOffDays >= minimumOffDays) {
      return;
    }

    const candidateIndexes = plan.assignments
      .map((token, dateIndex) => {
        if (!token || token === _OFF) return null;

        const band = getAssignedShiftBand(token, shiftMap);
        if (!band) return null;
        const { targets: minTargets } = getCoverageTargetsForDate(rule, monthDates[dateIndex] || '');
        if (dailyCounts[dateIndex][band] <= minTargets[band]) return null;

        const dateKey = monthDates[dateIndex] || '';
        return {
          dateIndex,
          band,
          isWeekend: weekendDateSet.has(dateKey),
          isHoliday: holidayDateSet.has(dateKey),
          surplus: dailyCounts[dateIndex][band] - minTargets[band],
          streak:
            countPreviousWorkStreak(plan.assignments, dateIndex) +
            1 +
            countNextWorkStreak(plan.assignments, dateIndex),
        };
      })
      .filter(
        (
          item
        ): item is {
          dateIndex: number;
          band: 'day' | 'evening' | 'night';
          isWeekend: boolean;
          isHoliday: boolean;
          surplus: number;
          streak: number;
        } => Boolean(item)
      )
      .sort((left, right) => {
        if (left.isHoliday !== right.isHoliday) return left.isHoliday ? -1 : 1;
        if (left.isWeekend !== right.isWeekend) return left.isWeekend ? -1 : 1;
        if (left.surplus !== right.surplus) return right.surplus - left.surplus;
        if (left.streak !== right.streak) return right.streak - left.streak;
        return left.dateIndex - right.dateIndex;
      });

    for (const candidate of candidateIndexes) {
      if (currentOffDays >= minimumOffDays) {
        break;
      }

      const currentToken = plan.assignments[candidate.dateIndex] || _OFF;
      const currentBand = getAssignedShiftBand(currentToken, shiftMap);
      if (!currentBand) {
        continue;
      }
      const { targets: minTargets } = getCoverageTargetsForDate(
        rule,
        monthDates[candidate.dateIndex] || ''
      );
      if (dailyCounts[candidate.dateIndex][currentBand] <= minTargets[currentBand]) {
        continue;
      }

      plan.assignments[candidate.dateIndex] = _OFF;
      dailyCounts[candidate.dateIndex][currentBand] = Math.max(
        0,
        dailyCounts[candidate.dateIndex][currentBand] - 1
      );
      currentOffDays += 1;
    }
  });

  return nextPlans;
}

export function enforceMaxConsecutiveWorkDays({
  staffPlans,
  monthDates,
  shiftMap,
  rule,
}: {
  staffPlans: GeneratedCoveragePlan[];
  monthDates: string[];
  shiftMap: Map<string, WorkShift>;
  rule: RosterGenerationRule;
}) {
  const maxAllowedWorkDays = Math.max(
    2,
    Math.min(7, Math.floor(rule.maxConsecutiveWorkDays || 5))
  );
  if (staffPlans.length === 0 || maxAllowedWorkDays >= monthDates.length) {
    return staffPlans;
  }

  const minimumOffDays = Math.max(
    0,
    Math.min(monthDates.length, Math.floor(rule.minMonthlyOffDays || 0))
  );
  const nextPlans = staffPlans.map((plan) => ({
    ...plan,
    assignments: plan.assignments.map((token) => (!token || token === 'OFF' ? _OFF : token)),
  }));

  const countOffDays = (assignments: string[]) =>
    assignments.reduce((count, token) => count + (!token || token === _OFF ? 1 : 0), 0);

  const countDailyBands = () =>
    monthDates.map((_, dateIndex) => {
      const counts = buildEmptyCoverageCounts();
      nextPlans.forEach((plan) => {
        const band = getAssignedShiftBand(plan.assignments[dateIndex] || '', shiftMap);
        if (band) counts[band] += 1;
      });
      return counts;
    });

  const canReceiveShift = (
    plan: GeneratedCoveragePlan & { assignments: string[] },
    dateIndex: number,
    shiftId: string
  ) => {
    if ((plan.assignments[dateIndex] || _OFF) !== _OFF) return false;
    if (minimumOffDays > 0 && countOffDays(plan.assignments) <= minimumOffDays) return false;

    return canAssignPlanShiftAtDate({
      plan,
      dateIndex,
      nextShiftId: shiftId,
      monthDates,
      shiftMap,
      rule,
    });
  };

  let changed = true;
  let guard = nextPlans.length * monthDates.length * 3;

  while (changed && guard > 0) {
    changed = false;
    guard -= 1;
    const dailyCounts = countDailyBands();

    for (const plan of nextPlans) {
      let streak = 0;

      for (let dateIndex = 0; dateIndex < monthDates.length; dateIndex += 1) {
        const token = plan.assignments[dateIndex] || _OFF;
        if (token === _OFF) {
          streak = 0;
          continue;
        }

        streak += 1;
        if (streak <= maxAllowedWorkDays) continue;

        const band = getAssignedShiftBand(token, shiftMap);
        if (!band) continue;

        const { targets: minTargets } = getCoverageTargetsForDate(
          rule,
          monthDates[dateIndex] || ''
        );
        const currentCounts = dailyCounts[dateIndex] || buildEmptyCoverageCounts();

        if (currentCounts[band] > minTargets[band]) {
          plan.assignments[dateIndex] = _OFF;
          currentCounts[band] = Math.max(0, currentCounts[band] - 1);
          streak = 0;
          changed = true;
          continue;
        }

        const receiver = nextPlans
          .filter((candidate) => candidate.staffId !== plan.staffId)
          .filter((candidate) => canReceiveShift(candidate, dateIndex, token))
          .sort((left, right) => {
            const leftWorkCount = left.assignments.filter((assignment) => assignment && assignment !== _OFF).length;
            const rightWorkCount = right.assignments.filter((assignment) => assignment && assignment !== _OFF).length;
            if (leftWorkCount !== rightWorkCount) return leftWorkCount - rightWorkCount;
            return countOffDays(right.assignments) - countOffDays(left.assignments);
          })[0];

        if (!receiver) continue;

        plan.assignments[dateIndex] = _OFF;
        receiver.assignments[dateIndex] = token;
        streak = 0;
        changed = true;
      }
    }
  }

  return nextPlans;
}
