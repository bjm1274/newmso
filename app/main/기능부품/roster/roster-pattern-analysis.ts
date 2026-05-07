/**
 * Extracted pattern analysis and rule-evaluation helpers.
 */
import { getAssignedShiftBand,normalizeBlockedShiftBands,resolveShiftBand } from './roster-shift-utils';
import type { CoverageBand,WizardPairRule,WorkShift } from './roster-wizard-types';

export function computePatternDiversityMetrics(cells: import('./roster-wizard-types').PreviewCell[]) {
  const workTokens = cells
    .map((cell) => String(cell.code || '').trim().toUpperCase())
    .filter((token) => token && token !== 'OFF');

  if (workTokens.length === 0) {
    return { diversityScore: 0, longestSameBandStreak: 0, repeatedPatternCount: 0 };
  }

  const streakLengths: number[] = [];
  const transitionSet = new Set<string>();
  let longestSameBandStreak = 0;
  let currentStreak = 0;

  workTokens.forEach((token, index) => {
    if (index === 0 || workTokens[index - 1] !== token) {
      if (currentStreak > 0) streakLengths.push(currentStreak);
      currentStreak = 1;
    } else {
      currentStreak += 1;
    }
    if (index > 0) transitionSet.add(`${workTokens[index - 1]}->${token}`);
    longestSameBandStreak = Math.max(longestSameBandStreak, currentStreak);
  });
  if (currentStreak > 0) streakLengths.push(currentStreak);

  const repeatedPatternCount = Math.max(0, streakLengths.filter((length) => length >= 3).length - 1);
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

// ─── 제한 시프트 ID 필터 ──────────────────────────────────────────────────────

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
