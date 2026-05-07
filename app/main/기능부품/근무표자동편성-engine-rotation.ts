import {
buildProgrammaticAssignments,
buildProgrammaticCycle,
getCoverageTargetsForDate,
} from './근무표자동편성-engine-coverage';
import {
buildEmptyCoverageCounts,
canStillMeetMinimumStaffing,
clampNightShiftCount,
countPreviousBandStreak,
countPreviousTaggedWorkStreak,
countPreviousWorkStreak,
getAssignedShiftBand,
getRotationBandContinuityTarget,
isNightRecoverySlot,
normalizeStaffBlockPreference,
resolveConfiguredWorkDayMode,
resolveShiftBand,
selectDistributedDays,
sortShifts
} from './근무표자동편성-engine-utils';
import type {
RosterGenerationRule,
StaffConfig,
WorkShift
} from './근무표자동편성-types';
import { OFF_SHIFT_TOKEN } from './근무표자동편성-types';

const _OFF = OFF_SHIFT_TOKEN;

export function buildRuleAwareRotationAssignments({
  monthDates,
  shiftMap,
  shiftIds,
  staffIndex,
  rule,
  nightCountRange,
  sharedDailyBandCounts,
  sharedNewNurseDailyBandCounts,
  totalStaffCount,
  weekendAssignmentCounts,
  holidayAssignmentCounts,
  blockedDateSet,
  holidayDateSet,
  isNewNurse = false,
  teamDailyBandCounts,
  staffConfig,
}: {
  monthDates: string[];
  shiftMap: Map<string, WorkShift>;
  shiftIds: string[];
  staffIndex: number;
  rule: RosterGenerationRule;
  nightCountRange?: {
    min?: number;
    max?: number;
  };
  sharedDailyBandCounts?: Array<Record<'day' | 'evening' | 'night', number>>;
  sharedNewNurseDailyBandCounts?: Array<Record<'day' | 'evening' | 'night', number>>;
  totalStaffCount: number;
  weekendAssignmentCounts?: number[];
  holidayAssignmentCounts?: number[];
  blockedDateSet?: Set<string>;
  holidayDateSet?: Set<string>;
  isNewNurse?: boolean;
  teamDailyBandCounts?: Array<Record<'day' | 'evening' | 'night', number>>;
  staffConfig?: StaffConfig;
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
        assignments[index] = _OFF;
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
  const staffingDayBandCounts = teamDailyBandCounts || dayBandCounts;
  const newNurseDayBandCounts =
    sharedNewNurseDailyBandCounts ||
    Array.from({ length: days }, () => ({
      day: 0,
      evening: 0,
      night: 0,
    }));
  const coverageTargetsByDate = monthDates.map((dateKey) => getCoverageTargetsForDate(rule, dateKey).targets);
  const averageNightLoadForMinimum =
    totalStaffCount > 0
      ? Math.ceil(
          coverageTargetsByDate.reduce((sum, targets) => sum + Math.max(0, targets.night || 0), 0) /
            totalStaffCount
        )
      : 0;
  const requestedMinimumNightCount =
    Number(nightCountRange?.min) > 0 ? Number(nightCountRange?.min) : rule.minRotationNightCount;
  const requestedMaximumNightCount =
    Number(nightCountRange?.max) > 0 ? Number(nightCountRange?.max) : rule.maxRotationNightCount;
  const minimumNightCount = clampNightShiftCount(requestedMinimumNightCount, days);
  const maximumNightCount = clampNightShiftCount(
    Math.max(requestedMaximumNightCount, minimumNightCount),
    days
  );
  const targetNightCount = clampNightShiftCount(
    Math.min(maximumNightCount, Math.max(minimumNightCount, averageNightLoadForMinimum)),
    days
  );
  const maxConsecutiveEveningShifts = Math.max(
    0,
    Math.min(7, Math.floor(rule.maxConsecutiveEveningShifts || 0))
  );
  const nightBlockMaxSize = Math.max(1, Math.min(5, Math.floor(rule.nightBlockSize || 1)));
  const offDaysAfterNightMax = Math.max(0, Math.min(5, Math.floor(rule.offDaysAfterNight || 0)));
  const maxConsecutiveWorkDays = Math.max(2, Math.min(7, Math.floor(rule.maxConsecutiveWorkDays || 5)));
  const maxConsecutiveWeekendWorkDays = Math.max(
    0,
    Math.min(4, Math.floor(rule.maxConsecutiveWeekendWorkDays || 0))
  );
  const blockPreference = normalizeStaffBlockPreference(staffConfig?.blockPreference);
  const preferredNightBlockSize =
    blockPreference === 'short'
      ? Math.min(nightBlockMaxSize, 2)
      : blockPreference === 'night_focus'
        ? nightBlockMaxSize
        : rule.generationStyle === 'variety'
          ? Math.min(nightBlockMaxSize, 2)
          : rule.generationStyle === 'block'
            ? nightBlockMaxSize
            : Math.max(1, Math.min(nightBlockMaxSize, Math.round((nightBlockMaxSize + 1) / 2)));
  if (targetNightCount > 0) {
    const blockCount = Math.ceil(targetNightCount / preferredNightBlockSize);
    const maxStartDay = Math.max(1, days - preferredNightBlockSize - offDaysAfterNightMax + 1);
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
              const nextEndDay = startDay + nightBlockMaxSize + offDaysAfterNightMax - 1;
              const normalizedChosenEndDay = chosenStartDay + nightBlockMaxSize + offDaysAfterNightMax - 1;
              return nextEndDay < chosenStartDay || startDay > normalizedChosenEndDay;
            })
        );

        if (availableStartDays.length === 0) return null;

        const nextStartDay = [...availableStartDays].sort((left, right) => {
          const leftNightLoad = Array.from({ length: nightBlockMaxSize }, (_, offset) => {
            const dayIndex = left + offset - 1;
            return dayBandCounts[dayIndex]?.night || 0;
          }).reduce((sum, value) => sum + value, 0);
          const rightNightLoad = Array.from({ length: nightBlockMaxSize }, (_, offset) => {
            const dayIndex = right + offset - 1;
            return dayBandCounts[dayIndex]?.night || 0;
          }).reduce((sum, value) => sum + value, 0);

          if (leftNightLoad !== rightNightLoad) return leftNightLoad - rightNightLoad;

          if (rule.separateNewNursesByShift && isNewNurse) {
            const leftNewNurseNightLoad = Array.from({ length: nightBlockMaxSize }, (_, offset) => {
              const dayIndex = left + offset - 1;
              return newNurseDayBandCounts[dayIndex]?.night || 0;
            }).reduce((sum, value) => sum + value, 0);
            const rightNewNurseNightLoad = Array.from({ length: nightBlockMaxSize }, (_, offset) => {
              const dayIndex = right + offset - 1;
              return newNurseDayBandCounts[dayIndex]?.night || 0;
            }).reduce((sum, value) => sum + value, 0);

            if (leftNewNurseNightLoad !== rightNewNurseNightLoad) {
              return leftNewNurseNightLoad - rightNewNurseNightLoad;
            }
          }

          if (staffConfig?.preferEarlyMonthNight) {
            if (left !== right) {
              return left - right;
            }
          }

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
    blockStartDays.forEach((startDay, blockIndex) => {
      const startIndex = startDay - 1;
      const actualNightBlockSize = Math.max(
        1,
        Math.min(preferredNightBlockSize, targetNightCount - placedNightCount, days - startIndex)
      );

      for (let offset = 0; offset < actualNightBlockSize && placedNightCount < targetNightCount; offset += 1) {
        const dayIndex = startIndex + offset;
        if (dayIndex >= days || assignments[dayIndex]) continue;
        assignments[dayIndex] = nightShiftId;
        dayBandCounts[dayIndex].night += 1;
        if (staffingDayBandCounts !== dayBandCounts) {
          staffingDayBandCounts[dayIndex].night += 1;
        }
        if (isNewNurse) {
          newNurseDayBandCounts[dayIndex].night += 1;
        }
        placedNightCount += 1;
      }

      const nextBlockStartDay = blockStartDays[blockIndex + 1] || days + 1;
      const availableGapAfterBlock = Math.max(
        0,
        nextBlockStartDay - startDay - actualNightBlockSize
      );
      const actualOffDaysAfterNight = Math.min(offDaysAfterNightMax, availableGapAfterBlock);

      for (let offset = 0; offset < actualOffDaysAfterNight; offset += 1) {
        const dayIndex = startIndex + actualNightBlockSize + offset;
        if (dayIndex >= days || assignments[dayIndex]) continue;
        assignments[dayIndex] = _OFF;
      }
    });
  }

  const bandCounts: Record<'day' | 'evening' | 'night', number> = {
    day: 0,
    evening: 0,
    night: assignments.filter((token) => token === nightShiftId).length,
  };
  let weekendWorkCount = assignments.reduce((count, token, index) => {
    if (!token || token === _OFF) return count;
    const dayOfWeek = new Date(`${monthDates[index]}T00:00:00`).getDay();
    return dayOfWeek === 0 || dayOfWeek === 6 ? count + 1 : count;
  }, 0);
  let holidayWorkCount = assignments.reduce((count, token, index) => {
    if (!token || token === _OFF) return count;
    return holidayDateSet?.has(monthDates[index]) ? count + 1 : count;
  }, 0);

  const preferredFillOrder =
    rule.balanceRotationBands && staffIndex % 2 === 1
      ? [eveningShiftId, dayShiftId]
      : [dayShiftId, eveningShiftId];

  for (let index = 0; index < days; index += 1) {
    if (assignments[index]) continue;
    if (blockedDateSet?.has(monthDates[index])) {
      assignments[index] = _OFF;
      continue;
    }

    if (isNightRecoverySlot(assignments, index, shiftMap, offDaysAfterNightMax)) {
      assignments[index] = _OFF;
      continue;
    }

    const date = monthDates[index];
    const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = holidayDateSet?.has(date) === true;
    const previousToken = index > 0 ? assignments[index - 1] : '';
    const previousBand = getAssignedShiftBand(previousToken, shiftMap);
    const previousBandStreak = countPreviousBandStreak(assignments, index, shiftMap);
    const previousWorkStreak = countPreviousWorkStreak(assignments, index);
    const previousWeekendWorkStreak =
      maxConsecutiveWeekendWorkDays > 0
        ? countPreviousTaggedWorkStreak(assignments, monthDates, index, (dateKey) => {
            const weekday = new Date(`${dateKey}T00:00:00`).getDay();
            return weekday === 0 || weekday === 6;
          })
        : 0;
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

    if (rule.avoidDayAfterEvening && previousBand === 'evening') {
      candidates = candidates.filter(
        (shiftId) => resolveShiftBand(shiftMap.get(shiftId)!) !== 'day'
      );
    }

    if (
      maxConsecutiveEveningShifts > 0 &&
      previousBand === 'evening' &&
      previousBandStreak >= maxConsecutiveEveningShifts
    ) {
      candidates = candidates.filter(
        (shiftId) => resolveShiftBand(shiftMap.get(shiftId)!) !== 'evening'
      );
    }

    if (staffConfig?.avoidConsecutiveEvening && previousBand === 'evening') {
      candidates = candidates.filter(
        (shiftId) => resolveShiftBand(shiftMap.get(shiftId)!) !== 'evening'
      );
    }

    const projectedOffCounts = {
      day: staffingDayBandCounts[index]?.day || 0,
      evening: staffingDayBandCounts[index]?.evening || 0,
      night: staffingDayBandCounts[index]?.night || 0,
    };
    const minStaffingTargets = coverageTargetsByDate[index] || buildEmptyCoverageCounts();
    const offIsFeasible = canStillMeetMinimumStaffing({
      projectedCounts: projectedOffCounts,
      minStaffingTargets,
      remainingStaff,
    });

    if (previousWorkStreak >= maxConsecutiveWorkDays && offIsFeasible) {
      assignments[index] = _OFF;
      continue;
    }

    if (
      offIsFeasible &&
      ((isWeekend && staffConfig?.preferWeekendOff) || (isHoliday && staffConfig?.preferHolidayOff))
    ) {
      assignments[index] = _OFF;
      continue;
    }

    if (rule.distributeWeekendShifts && isWeekend && offIsFeasible && weekendAssignmentCounts?.length) {
      const lowestWeekendLoad = Math.min(...weekendAssignmentCounts);
      if (weekendWorkCount > lowestWeekendLoad) {
        assignments[index] = _OFF;
        continue;
      }
    }

    if (
      maxConsecutiveWeekendWorkDays > 0 &&
      isWeekend &&
      previousWeekendWorkStreak >= maxConsecutiveWeekendWorkDays &&
      offIsFeasible
    ) {
      assignments[index] = _OFF;
      continue;
    }

    if (rule.distributeHolidayShifts && isHoliday && offIsFeasible && holidayAssignmentCounts?.length) {
      const lowestHolidayLoad = Math.min(...holidayAssignmentCounts);
      if (holidayWorkCount > lowestHolidayLoad) {
        assignments[index] = _OFF;
        continue;
      }
    }

    if (candidates.length === 0) {
      assignments[index] = _OFF;
      continue;
    }

    const orderedCandidates = [...candidates].sort((left, right) => {
        const leftBand = resolveShiftBand(shiftMap.get(left)!);
        const rightBand = resolveShiftBand(shiftMap.get(right)!);
        const currentCounts = staffingDayBandCounts[index] || { day: 0, evening: 0, night: 0 };
        const minTargets = coverageTargetsByDate[index] || buildEmptyCoverageCounts();
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
          minStaffingTargets: minTargets,
          remainingStaff,
        });
        const rightFeasible = canStillMeetMinimumStaffing({
          projectedCounts: rightProjectedCounts,
          minStaffingTargets: minTargets,
          remainingStaff,
        });

        if (leftFeasible !== rightFeasible) {
          return leftFeasible ? -1 : 1;
        }

        const leftUrgency = Math.max(
          0,
          minTargets[leftBand as 'day' | 'evening' | 'night'] -
            (currentCounts[leftBand as 'day' | 'evening' | 'night'] || 0)
        );
        const rightUrgency = Math.max(
          0,
          minTargets[rightBand as 'day' | 'evening' | 'night'] -
            (currentCounts[rightBand as 'day' | 'evening' | 'night'] || 0)
        );
        if (leftUrgency !== rightUrgency) {
          return rightUrgency - leftUrgency;
        }

        if (rule.separateNewNursesByShift && isNewNurse) {
          const leftNewNurseLoad =
            newNurseDayBandCounts[index]?.[leftBand as 'day' | 'evening' | 'night'] || 0;
          const rightNewNurseLoad =
            newNurseDayBandCounts[index]?.[rightBand as 'day' | 'evening' | 'night'] || 0;
          if (leftNewNurseLoad !== rightNewNurseLoad) {
            return leftNewNurseLoad - rightNewNurseLoad;
          }
        }

        if (previousBand && previousBand !== 'night') {
          const blockStartIndex = Math.max(0, index - previousBandStreak);
          const continuityTarget = getRotationBandContinuityTarget({
            staffIndex,
            blockStartIndex,
            band: previousBand,
            maxConsecutiveWorkDays,
            generationStyle: rule.generationStyle,
            blockPreference,
          });
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
    if (staffingDayBandCounts !== dayBandCounts) {
      staffingDayBandCounts[index][assignedBand as 'day' | 'evening' | 'night'] += 1;
    }
    if (isNewNurse) {
      newNurseDayBandCounts[index][assignedBand as 'day' | 'evening' | 'night'] += 1;
    }
    if (isWeekend) {
      weekendWorkCount += 1;
    }
    if (isHoliday) {
      holidayWorkCount += 1;
    }
  }

  let finalWorkStreak = 0;
  const remainingStaffFinal = Math.max(totalStaffCount - staffIndex - 1, 0);
  for (let index = 0; index < days; index += 1) {
    const token = assignments[index] || _OFF;
    if (!token || token === _OFF) {
      finalWorkStreak = 0;
      continue;
    }

    finalWorkStreak += 1;
    if (finalWorkStreak <= maxConsecutiveWorkDays) continue;

    const assignedBand = getAssignedShiftBand(token, shiftMap);
    if (!assignedBand) continue;

    const currentCounts = dayBandCounts[index] || { day: 0, evening: 0, night: 0 };
    const minStaffingTargets = coverageTargetsByDate[index] || buildEmptyCoverageCounts();
    const projectedCounts = {
      ...currentCounts,
      [assignedBand]: Math.max(0, (currentCounts[assignedBand as 'day' | 'evening' | 'night'] || 0) - 1),
    };
    const canRestHere = canStillMeetMinimumStaffing({
      projectedCounts,
      minStaffingTargets,
      remainingStaff: remainingStaffFinal,
    });
    if (!canRestHere) continue;

    assignments[index] = _OFF;
    dayBandCounts[index][assignedBand as 'day' | 'evening' | 'night'] = Math.max(
      0,
      (dayBandCounts[index][assignedBand as 'day' | 'evening' | 'night'] || 0) - 1
    );
    if (staffingDayBandCounts !== dayBandCounts) {
      staffingDayBandCounts[index][assignedBand as 'day' | 'evening' | 'night'] = Math.max(
        0,
        (staffingDayBandCounts[index][assignedBand as 'day' | 'evening' | 'night'] || 0) - 1
      );
    }
    if (isNewNurse) {
      newNurseDayBandCounts[index][assignedBand as 'day' | 'evening' | 'night'] = Math.max(
        0,
        (newNurseDayBandCounts[index][assignedBand as 'day' | 'evening' | 'night'] || 0) - 1
      );
    }
    bandCounts[assignedBand as 'day' | 'evening' | 'night'] = Math.max(
      0,
      (bandCounts[assignedBand as 'day' | 'evening' | 'night'] || 0) - 1
    );
    const dayOfWeek = new Date(`${monthDates[index]}T00:00:00`).getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      weekendWorkCount = Math.max(0, weekendWorkCount - 1);
    }
    if (holidayDateSet?.has(monthDates[index])) {
      holidayWorkCount = Math.max(0, holidayWorkCount - 1);
    }
    finalWorkStreak = 0;
  }

  if (weekendAssignmentCounts) {
    weekendAssignmentCounts[staffIndex] = weekendWorkCount;
  }
  if (holidayAssignmentCounts) {
    holidayAssignmentCounts[staffIndex] = holidayWorkCount;
  }

  return assignments.map((token) => token || _OFF);
}
