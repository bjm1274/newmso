'use client';

import { isKoreanPublicHoliday } from '@/lib/korean-public-holidays';
import type { RosterGenerationRule } from '@/lib/roster-generation-rules';
import type {
  PreviewDailyCoverage,
  PreviewRow,
  RosterFeasibilityIssue,
  StaffConfig,
  StaffPlanningMeta,
  WorkShift,
  WizardPairRule,
} from '../근무표자동편성-types';
import { OFF_SHIFT_TOKEN } from '../근무표자동편성-types';
import {
  buildStaffRestrictionBlockedDateSet,
  canStaffCoverBand,
  clampNightShiftCount,
  coverageRoleMatchesRule,
  getAssignedShiftBand,
  getRoleCoverageTargetByBand,
  isWeekendDateKey,
  isWizardPairRuleSatisfiedAtDate,
  normalizeActivePairRules,
  normalizeBlockedShiftBands,
  normalizeBlockedWeekdays,
  summarizeRosterDateLabels,
} from '../근무표자동편성-engine';
import type { StructuralStaffingGap } from './roster-preview-model';

export type RosterWarningReportItem = {
  category:
    | 'headcount'
    | 'coverage'
    | 'night-range'
    | 'off-days'
    | 'restriction'
    | 'pair-rule';
  detail: string;
  id: string;
  severity: number;
  targetTestId: string;
  title: string;
  tone: 'red' | 'amber' | 'yellow';
};

export type RosterWarningReport = {
  coverageCount: number;
  headcountCount: number;
  items: RosterWarningReportItem[];
  nightRangeCount: number;
  offDaysCount: number;
  pairRuleCount: number;
  restrictionCount: number;
};

export function buildRosterFeasibilityIssues({
  previewGenerationRule,
  staffPlanningMeta,
  structuralStaffingGap,
}: {
  previewGenerationRule: RosterGenerationRule;
  staffPlanningMeta: StaffPlanningMeta[];
  structuralStaffingGap: StructuralStaffingGap;
}): RosterFeasibilityIssue[] {
  const issues: RosterFeasibilityIssue[] = [];

  if (structuralStaffingGap.isShortage) {
    issues.push({
      id: 'minimum-headcount-shortage',
      severity: 'blocking',
      targetTestId: 'roster-team-select',
      title: '\uCD5C\uC18C \uC778\uC6D0 \uD569\uACC4 \uCD08\uACFC',
      detail: '\uCD5C\uC18C \uC778\uC6D0 \uD569\uACC4\uAC00 \uD604\uC7AC \uC9C1\uC6D0 \uC218\uB97C \uCD08\uACFC\uD569\uB2C8\uB2E4.',
    });
  }

  (['day', 'evening', 'night'] as const).forEach((band) => {
    const dedicatedTarget =
      band === 'day'
        ? previewGenerationRule.minDedicatedDayStaff
        : band === 'evening'
          ? previewGenerationRule.minDedicatedEveningStaff
          : previewGenerationRule.minDedicatedNightStaff;
    const seniorTarget =
      band === 'day'
        ? previewGenerationRule.minSeniorDayStaff
        : band === 'evening'
          ? previewGenerationRule.minSeniorEveningStaff
          : previewGenerationRule.minSeniorNightStaff;
    const dedicatedAvailable = staffPlanningMeta.filter(
      (meta) => meta.dedicatedBand === band
    ).length;
    const seniorAvailable = staffPlanningMeta.filter(
      (meta) => meta.isSeniorStaff && canStaffCoverBand(meta, band)
    ).length;

    if (dedicatedTarget > 0 && dedicatedAvailable < dedicatedTarget) {
      issues.push({
        id: `dedicated-${band}-shortage`,
        severity: 'blocking',
        targetTestId: 'roster-active-generation-rule-summary',
        title: `${band.toUpperCase()} \uC804\uB2F4 \uBD80\uC871`,
        detail: `${band.toUpperCase()} \uD0C0\uC784 \uC804\uB2F4 \uCD5C\uC18C \uC778\uC6D0\uC744 \uB9CC\uC871\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`,
      });
    }

    if (seniorTarget > 0 && seniorAvailable < seniorTarget) {
      issues.push({
        id: `senior-${band}-shortage`,
        severity: 'blocking',
        targetTestId: 'roster-active-generation-rule-summary',
        title: `${band.toUpperCase()} \uC219\uB828 \uBD80\uC871`,
        detail: `${band.toUpperCase()} \uD0C0\uC784 \uCD5C\uC18C \uC219\uB828 \uC778\uC6D0\uC744 \uB9CC\uC871\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`,
      });
    }
  });

  previewGenerationRule.roleCoverageRules.forEach((roleRule) => {
    (['day', 'evening', 'night'] as const).forEach((band) => {
      const target = getRoleCoverageTargetByBand(roleRule, band);
      if (target <= 0) return;
      const available = staffPlanningMeta.filter(
        (meta) =>
          canStaffCoverBand(meta, band) &&
          coverageRoleMatchesRule(meta.coverageRoleMatcherText, roleRule)
      ).length;
      if (available >= target) return;

      issues.push({
        id: `role-${roleRule.id}-${band}`,
        severity: 'warning',
        targetTestId: 'roster-active-generation-rule-summary',
        title: `${roleRule.label} ${band.toUpperCase()} 부족`,
        detail: `${roleRule.label} ${band.toUpperCase()} 요구 인원을 모두 채우기 어렵습니다.`,
      });
    });
  });

  return issues;
}

export function buildRosterWarningReport({
  effectiveTargetStaffConfigs,
  monthDates,
  plannerPairRules,
  previewDailyCoverage,
  previewGenerationRule,
  previewRows,
  structuralStaffingGap,
  workShifts,
}: {
  effectiveTargetStaffConfigs: Map<string, StaffConfig>;
  monthDates: string[];
  plannerPairRules: WizardPairRule[];
  previewDailyCoverage: PreviewDailyCoverage[];
  previewGenerationRule: RosterGenerationRule;
  previewRows: PreviewRow[];
  structuralStaffingGap: StructuralStaffingGap;
  workShifts: WorkShift[];
}): RosterWarningReport {
  const items: RosterWarningReportItem[] = [];
  const warningShiftMap = new Map(workShifts.map((shift) => [shift.id, shift]));
  const previewRowByStaffId = new Map(
    previewRows.map((row) => [String(row.staff.id), row] as const)
  );
  const activePairRules = normalizeActivePairRules(
    plannerPairRules,
    new Set(previewRowByStaffId.keys())
  );

  if (structuralStaffingGap.isShortage) {
    items.push({
      id: 'headcount-shortage',
      category: 'headcount',
      tone: 'red',
      severity: 4,
      targetTestId: 'roster-staff-shortage-summary',
      title: '인원 부족',
      detail: `최소 기준 ${structuralStaffingGap.requiredHeadcount}명, 현재 ${structuralStaffingGap.availableHeadcount}명`,
    });
  }

  previewDailyCoverage.forEach((coverage) => {
    if (coverage.status !== 'warning') return;
    const month = Number(coverage.date.slice(5, 7));
    const day = Number(coverage.date.slice(8, 10));
    items.push({
      id: `coverage-${coverage.date}`,
      category: 'coverage',
      tone: 'red',
      severity: 3,
      targetTestId: `roster-preview-coverage-${coverage.date}`,
      title: `${month}월 ${day}일 인력 부족`,
      detail: coverage.statusDetail,
    });
  });

  previewRows.forEach((row) => {
    const config = effectiveTargetStaffConfigs.get(String(row.staff.id));
    const minimumNightCount = clampNightShiftCount(
      config?.minNightShiftCount || 0,
      monthDates.length
    );
    const maximumNightCount = clampNightShiftCount(
      config?.maxNightShiftCount || 0,
      monthDates.length
    );
    const minimumOffDays = Math.max(
      0,
      Math.floor(previewGenerationRule.minMonthlyOffDays || 0)
    );

    if (minimumNightCount > 0 && row.counts.night < minimumNightCount) {
      items.push({
        id: `night-min-${row.staff.id}`,
        category: 'night-range',
        tone: 'amber',
        severity: 2,
        targetTestId: `roster-config-row-${row.staff.id}`,
        title: `${row.staff.name} 나이트 최소 미달`,
        detail: `설정 ${minimumNightCount}회, 실제 ${row.counts.night}회`,
      });
    }

    if (maximumNightCount > 0 && row.counts.night > maximumNightCount) {
      items.push({
        id: `night-max-${row.staff.id}`,
        category: 'night-range',
        tone: 'amber',
        severity: 2,
        targetTestId: `roster-config-row-${row.staff.id}`,
        title: `${row.staff.name} 나이트 최대 초과`,
        detail: `설정 ${maximumNightCount}회, 실제 ${row.counts.night}회`,
      });
    }

    if (minimumOffDays > 0 && row.counts.off < minimumOffDays) {
      items.push({
        id: `off-days-${row.staff.id}`,
        category: 'off-days',
        tone: 'yellow',
        severity: 1,
        targetTestId: `roster-preview-row-${row.staff.id}`,
        title: `${row.staff.name} 최소 OFF 미달`,
        detail: `기준 ${minimumOffDays}회, 실제 ${row.counts.off}회`,
      });
    }

    if (!config) return;

    const blockedBandSet = new Set(
      normalizeBlockedShiftBands(config.blockedShiftBands || [])
    );
    const blockedWeekdaySet = new Set(
      normalizeBlockedWeekdays(config.blockedWeekdays || [])
    );
    const restrictionBlockedDateSet = buildStaffRestrictionBlockedDateSet(
      config,
      monthDates
    );
    const blockedBandDates: string[] = [];
    const blockedWeekdayDates: string[] = [];
    const weekendDates: string[] = [];
    const holidayDates: string[] = [];

    row.cells.forEach((cell, dateIndex) => {
      const shiftId = cell.shiftId || '';
      if (!shiftId || shiftId === OFF_SHIFT_TOKEN) return;

      const dateKey = monthDates[dateIndex] || '';
      if (!dateKey) return;

      const assignedBand = getAssignedShiftBand(shiftId, warningShiftMap);
      if (assignedBand && blockedBandSet.has(assignedBand)) {
        blockedBandDates.push(dateKey);
      }

      if (!restrictionBlockedDateSet.has(dateKey)) return;

      const weekday = new Date(`${dateKey}T00:00:00`).getDay();
      if (blockedWeekdaySet.has(weekday)) {
        blockedWeekdayDates.push(dateKey);
        return;
      }
      if (config.avoidWeekendWork && isWeekendDateKey(dateKey)) {
        weekendDates.push(dateKey);
        return;
      }
      if (config.avoidHolidayWork && isKoreanPublicHoliday(dateKey)) {
        holidayDates.push(dateKey);
      }
    });

    const restrictionFragments: string[] = [];
    if (blockedBandDates.length > 0) {
      restrictionFragments.push(
        `blocked bands ${summarizeRosterDateLabels(blockedBandDates)}`
      );
    }
    if (blockedWeekdayDates.length > 0) {
      restrictionFragments.push(
        `blocked weekdays ${summarizeRosterDateLabels(blockedWeekdayDates)}`
      );
    }
    if (weekendDates.length > 0) {
      restrictionFragments.push(
        `weekend restricted ${summarizeRosterDateLabels(weekendDates)}`
      );
    }
    if (holidayDates.length > 0) {
      restrictionFragments.push(
        `holiday restricted ${summarizeRosterDateLabels(holidayDates)}`
      );
    }

    if (restrictionFragments.length > 0) {
      items.push({
        id: `restriction-${row.staff.id}`,
        category: 'restriction',
        tone: 'amber',
        severity: 2,
        targetTestId: `roster-preview-row-${row.staff.id}`,
        title: `${row.staff.name} restriction conflict`,
        detail: restrictionFragments.join(' / '),
      });
    }
  });

  activePairRules.forEach((pairRule) => {
    const primaryRow = previewRowByStaffId.get(pairRule.primaryStaffId);
    const secondaryRow = previewRowByStaffId.get(pairRule.secondaryStaffId);
    if (!primaryRow || !secondaryRow) return;

    const violatedDates = monthDates.filter((_, dateIndex) => {
      const primaryShiftId =
        primaryRow.cells[dateIndex]?.shiftId || OFF_SHIFT_TOKEN;
      const secondaryShiftId =
        secondaryRow.cells[dateIndex]?.shiftId || OFF_SHIFT_TOKEN;

      return !isWizardPairRuleSatisfiedAtDate({
        rule: pairRule,
        primaryShiftId,
        secondaryShiftId,
        shiftMap: warningShiftMap,
      });
    });

    if (violatedDates.length === 0) return;

    items.push({
      id: `pair-rule-${pairRule.id}`,
      category: 'pair-rule',
      tone: 'amber',
      severity: 2,
      targetTestId: `roster-preview-row-${primaryRow.staff.id}`,
      title: `${primaryRow.staff.name} / ${secondaryRow.staff.name} 페어 규칙 위반`,
      detail: `${pairRule.band === 'night' ? 'NIGHT' : '같은 근무'} ${pairRule.mode === 'together' ? '같이' : '분리'} / ${summarizeRosterDateLabels(violatedDates)}`,
    });
  });

  const sortedItems = [...items].sort((left, right) => {
    if (left.severity !== right.severity) return right.severity - left.severity;
    return left.title.localeCompare(right.title, 'ko');
  });

  return {
    items: sortedItems,
    headcountCount: items.filter((item) => item.category === 'headcount').length,
    coverageCount: items.filter((item) => item.category === 'coverage').length,
    nightRangeCount: items.filter((item) => item.category === 'night-range').length,
    offDaysCount: items.filter((item) => item.category === 'off-days').length,
    restrictionCount: items.filter((item) => item.category === 'restriction').length,
    pairRuleCount: items.filter((item) => item.category === 'pair-rule').length,
  };
}
