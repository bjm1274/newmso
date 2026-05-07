
import {
  buildEmptyCoverageCounts,
  canStillMeetMinimumStaffing,
  getRotationBandContinuityTarget,
  resolveShiftBand,
} from './roster-shift-utils';

export function orderRuleAwareRotationCandidates({
  blockPreference,
  candidates,
  coverageTargetsByDate,
  dayBandCounts,
  index,
  isNewNurse,
  maxConsecutiveWorkDays,
  newNurseDayBandCounts,
  preferredFillOrder,
  previousBand,
  previousBandStreak,
  remainingStaff,
  rule,
  shiftMap,
  staffIndex,
  staffingDayBandCounts,
  bandCounts,
}: any) {
  return [...candidates].sort((left, right) => {
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

    if (leftFeasible !== rightFeasible) return leftFeasible ? -1 : 1;

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
    if (leftUrgency !== rightUrgency) return rightUrgency - leftUrgency;

    if (rule.separateNewNursesByShift && isNewNurse) {
      const leftNewNurseLoad =
        newNurseDayBandCounts[index]?.[leftBand as 'day' | 'evening' | 'night'] || 0;
      const rightNewNurseLoad =
        newNurseDayBandCounts[index]?.[rightBand as 'day' | 'evening' | 'night'] || 0;
      if (leftNewNurseLoad !== rightNewNurseLoad) return leftNewNurseLoad - rightNewNurseLoad;
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
        if (preferKeepingBlock) return leftKeepsBlock ? -1 : 1;
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
}
