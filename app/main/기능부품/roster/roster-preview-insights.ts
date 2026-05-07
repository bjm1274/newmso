'use client';

import { isKoreanPublicHoliday } from '@/lib/korean-public-holidays';
import type { RosterGenerationRule } from '@/lib/roster-generation-rules';
import {
computePatternDiversityMetrics,
getCoverageTargetsForDate
} from '../근무표자동편성-engine';
import type {
PreviewDailyCoverage,
PreviewRow
} from '../근무표자동편성-types';
import type { FairnessScoreboard,RosterPreviewSummary,StructuralStaffingGap } from './roster-preview-types';

export function buildPreviewDailyCoverage({
  monthDates,
  previewGenerationRule,
  previewRows,
}: {
  monthDates: string[];
  previewGenerationRule: RosterGenerationRule;
  previewRows: PreviewRow[];
}): PreviewDailyCoverage[] {
  if (previewRows.length === 0) return [];

  return monthDates.map((date, index) => {
    const { targets, sourceLabel } = getCoverageTargetsForDate(
      previewGenerationRule,
      date
    );
    const coverage: PreviewDailyCoverage = {
      date,
      day: 0,
      evening: 0,
      night: 0,
      targetDay: targets.day,
      targetEvening: targets.evening,
      targetNight: targets.night,
      targetSourceLabel: sourceLabel,
      status: 'balanced',
      statusLabel: '충족',
      statusDetail: '기준 충족',
    };

    previewRows.forEach((row) => {
      const code = row.cells[index]?.code;
      if (code === 'D') coverage.day += 1;
      if (code === 'E') coverage.evening += 1;
      if (code === 'N') coverage.night += 1;
    });

    const shortages: string[] = [];
    if (coverage.day < targets.day) {
      shortages.push(`D ${targets.day - coverage.day}`);
    }
    if (coverage.evening < targets.evening) {
      shortages.push(`E ${targets.evening - coverage.evening}`);
    }
    if (coverage.night < targets.night) {
      shortages.push(`N ${targets.night - coverage.night}`);
    }

    if (shortages.length > 0) {
      coverage.status = 'warning';
      coverage.statusLabel = '부족';
      coverage.statusDetail = `${shortages.join(' / ')} / ${sourceLabel}`;
      return coverage;
    }

    const exceedsMinimum =
      coverage.day > targets.day ||
      coverage.evening > targets.evening ||
      coverage.night > targets.night;
    if (exceedsMinimum) {
      return {
        ...coverage,
        status: 'extra',
        statusLabel: '여유',
        statusDetail: `${sourceLabel} / 기준 초과 배치`,
      };
    }

    return coverage;
  });
}

export function buildStructuralStaffingGap({
  enabledTargetStaffCount,
  monthDates,
  previewGenerationRule,
}: {
  enabledTargetStaffCount: number;
  monthDates: string[];
  previewGenerationRule: RosterGenerationRule;
}): StructuralStaffingGap {
  const requiredHeadcount = monthDates.reduce((maxRequired, dateKey) => {
    const { targets } = getCoverageTargetsForDate(previewGenerationRule, dateKey);
    return Math.max(maxRequired, targets.day + targets.evening + targets.night);
  }, 0);
  const availableHeadcount = enabledTargetStaffCount;
  const shortageCount = Math.max(0, requiredHeadcount - availableHeadcount);

  return {
    requiredHeadcount,
    availableHeadcount,
    shortageCount,
    isShortage: shortageCount > 0,
  };
}

export function buildFairnessScoreboard({
  monthDates,
  previewRows,
}: {
  monthDates: string[];
  previewRows: PreviewRow[];
}): FairnessScoreboard {
  if (previewRows.length === 0) {
    return {
      averageNight: 0,
      averageWeekend: 0,
      averageHoliday: 0,
      averageConsecutive: 0,
      averageDiversity: 0,
      holidayCount: 0,
      rows: [],
    };
  }

  const weekendDateSet = new Set(
    monthDates.filter((date) => {
      const weekday = new Date(`${date}T00:00:00`).getDay();
      return weekday === 0 || weekday === 6;
    })
  );
  const holidayDateSet = new Set(
    monthDates.filter((date) => isKoreanPublicHoliday(date))
  );
  const baseRows = previewRows.map((row) => {
    let weekendWorkCount = 0;
    let holidayWorkCount = 0;
    let currentConsecutiveWorkDays = 0;
    let maxConsecutiveWorkDays = 0;
    const diversityMetrics = computePatternDiversityMetrics(row.cells);

    row.cells.forEach((cell) => {
      const isWorkDay = cell.code !== 'OFF';
      if (isWorkDay) {
        currentConsecutiveWorkDays += 1;
        if (weekendDateSet.has(cell.date)) weekendWorkCount += 1;
        if (holidayDateSet.has(cell.date)) holidayWorkCount += 1;
        if (currentConsecutiveWorkDays > maxConsecutiveWorkDays) {
          maxConsecutiveWorkDays = currentConsecutiveWorkDays;
        }
      } else {
        currentConsecutiveWorkDays = 0;
      }
    });

    return {
      staffId: String(row.staff.id),
      staffName: String(row.staff.name || ''),
      nightCount: row.counts.night,
      weekendWorkCount,
      holidayWorkCount,
      maxConsecutiveWorkDays,
      diversityScore: diversityMetrics.diversityScore,
      longestSameBandStreak: diversityMetrics.longestSameBandStreak,
    };
  });

  const averageNight =
    baseRows.reduce((sum, row) => sum + row.nightCount, 0) /
    Math.max(baseRows.length, 1);
  const averageWeekend =
    baseRows.reduce((sum, row) => sum + row.weekendWorkCount, 0) /
    Math.max(baseRows.length, 1);
  const averageHoliday =
    baseRows.reduce((sum, row) => sum + row.holidayWorkCount, 0) /
    Math.max(baseRows.length, 1);
  const averageConsecutive =
    baseRows.reduce((sum, row) => sum + row.maxConsecutiveWorkDays, 0) /
    Math.max(baseRows.length, 1);
  const averageDiversity =
    baseRows.reduce((sum, row) => sum + row.diversityScore, 0) /
    Math.max(baseRows.length, 1);

  const rows = baseRows.map((row) => {
    const fairnessPenalty =
      Math.abs(row.nightCount - averageNight) * 8 +
      Math.abs(row.weekendWorkCount - averageWeekend) * 6 +
      Math.abs(row.holidayWorkCount - averageHoliday) * 10 +
      Math.max(0, row.maxConsecutiveWorkDays - averageConsecutive) * 7;
    const fairnessScore = Math.max(0, Math.round(100 - fairnessPenalty));
    const notes: string[] = [];

    if (row.nightCount > averageNight + 1) notes.push('나이트 많음');
    if (row.weekendWorkCount > averageWeekend + 1) notes.push('주말 많음');
    if (row.holidayWorkCount > averageHoliday + 0.5) notes.push('공휴일 많음');
    if (row.maxConsecutiveWorkDays > averageConsecutive + 1) {
      notes.push('연속근무 주의');
    }

    return {
      ...row,
      fairnessScore,
      note: notes[0] || '균형 양호',
    };
  });

  return {
    averageNight,
    averageWeekend,
    averageHoliday,
    averageConsecutive,
    averageDiversity,
    holidayCount: holidayDateSet.size,
    rows,
  };
}

export function buildRosterSummary({
  manualAssignmentCount,
  previewRowCount,
  targetStaffCount,
  workingShiftCount,
}: {
  manualAssignmentCount: number;
  previewRowCount: number;
  targetStaffCount: number;
  workingShiftCount: number;
}): RosterPreviewSummary {
  return {
    staffCount: targetStaffCount,
    enabledCount: previewRowCount,
    shiftCount: workingShiftCount,
    manualCount: manualAssignmentCount,
  };
}

