'use client';

import type { RosterPatternGroupMode,RosterPatternProfile } from '@/lib/roster-pattern-profiles';
import { expandCoverageRoleTags } from '@/lib/roster-role-tags';
import type { StaffMember } from '@/types';
import {
buildAssignmentKey,
buildInitialConfig,
buildPlannerCoverageRoleMatcherText,
getDedicatedBandFromMode,
getFixedModeFromDedicatedBand,
getMonthEndDateKey,
getShiftBadgeClass,
getShiftCode,
getShiftDisplayLabel,
getShiftNameById,
isSeniorPlannerStaff,
isStaffNewNurse,
normalizeGeneratedAssignments,
resolvePlannerPatternGroup,
resolveShiftBand
} from '../근무표자동편성-engine';
import type {
CoverageBand,
ManualAssignmentMap,
PreviewRow,
RosterGenerationDraft,
StaffConfig,
StaffPlanningMeta,
WorkShift
} from '../근무표자동편성-types';
import { OFF_SHIFT_TOKEN } from '../근무표자동편성-types';

function buildFallbackPreviewConfig(
  patternLabel: string,
  primaryShiftId: string
): StaffConfig {
  return {
    enabled: true,
    pattern: patternLabel,
    primaryShiftId,
    secondaryShiftId: '',
    tertiaryShiftId: '',
    startOffset: 0,
    nightShiftCount: 0,
    minNightShiftCount: 0,
    maxNightShiftCount: 0,
    blockPreference: 'balanced',
    customPatternSequence: [],
    weeklyTemplateWeeks: [],
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

export function buildPreviewRows({
  generatedDraft,
  defaultShiftPool,
  effectiveTargetStaffConfigs,
  enabledTargetStaffs,
  manualAssignments,
  monthDates,
  workShifts,
}: {
  generatedDraft: RosterGenerationDraft | null;
  defaultShiftPool: WorkShift[];
  effectiveTargetStaffConfigs: Map<string, StaffConfig>;
  enabledTargetStaffs: StaffMember[];
  manualAssignments: ManualAssignmentMap;
  monthDates: string[];
  workShifts: WorkShift[];
}): PreviewRow[] {
  if (!generatedDraft?.staffPlans?.length) return [];

  const validShiftIds = new Set(defaultShiftPool.map((shift) => shift.id));
  const planByStaffId = new Map(
    generatedDraft.staffPlans.map((plan) => [String(plan.staffId || ''), plan])
  );

  const previewRows: PreviewRow[] = [];

  enabledTargetStaffs.forEach((staff) => {
    const plan = planByStaffId.get(String(staff.id));
    if (!plan) return;

    const baseSchedule = normalizeGeneratedAssignments(
      plan.assignments,
      monthDates,
      validShiftIds
    );
    const fallbackConfig = buildFallbackPreviewConfig(
      plan.modeLabel || generatedDraft.teamAnalysis?.workMode || '자동 생성',
      baseSchedule.find((shiftId) => shiftId !== OFF_SHIFT_TOKEN) || ''
    );
    const resolvedConfig =
      effectiveTargetStaffConfigs.get(String(staff.id)) || fallbackConfig;

    const cells = monthDates.map((date, index) => {
      const baseShiftId = baseSchedule[index] || OFF_SHIFT_TOKEN;
      const manualShiftId =
        manualAssignments[buildAssignmentKey(String(staff.id), date)];
      const shiftId = manualShiftId || baseShiftId;
      const shiftName = getShiftNameById(shiftId, workShifts);

      return {
        date,
        baseShiftId,
        shiftId,
        shiftName,
        code: getShiftCode(shiftName),
        displayLabel: getShiftDisplayLabel(shiftName),
        badgeClass: getShiftBadgeClass(shiftName),
        isManual: Boolean(manualShiftId),
      };
    });

    const counts = cells.reduce(
      (sum, cell) => {
        if (cell.code === 'OFF') sum.off += 1;
        else sum.work += 1;
        if (cell.code === 'N') sum.night += 1;
        return sum;
      },
      { work: 0, off: 0, night: 0 },
    );

    previewRows.push({
      staff,
      config: resolvedConfig,
      cells,
      counts,
    });
  });

  return previewRows;
}

export function buildStaffPlanningMeta({
  defaultPlannerMode,
  defaultShiftOrder,
  defaultShiftPool,
  effectiveTargetStaffConfigs,
  enabledTargetStaffs,
  monthDates,
  selectedPlannerShiftIds,
  selectedPatternProfile,
  staffCoverageRoleTags,
  staffDedicatedBandOverrides,
  workShifts,
}: {
  defaultPlannerMode: RosterPatternGroupMode;
  defaultShiftOrder: WorkShift[];
  defaultShiftPool: WorkShift[];
  effectiveTargetStaffConfigs: Map<string, StaffConfig>;
  enabledTargetStaffs: StaffMember[];
  monthDates: string[];
  selectedPlannerShiftIds: string[];
  selectedPatternProfile: RosterPatternProfile | null;
  staffCoverageRoleTags: Record<string, string[]>;
  staffDedicatedBandOverrides: Record<string, CoverageBand | ''>;
  workShifts: WorkShift[];
}): StaffPlanningMeta[] {
  const referenceDateKey = getMonthEndDateKey(monthDates);
  const planningShifts = defaultShiftPool.filter((shift) =>
    selectedPlannerShiftIds.includes(shift.id)
  );

  return enabledTargetStaffs.map((staff, index) => {
    const staffId = String(staff.id);
    const config =
      effectiveTargetStaffConfigs.get(staffId) ||
      buildInitialConfig(
        staff,
        index,
        defaultShiftOrder.length ? defaultShiftOrder : defaultShiftPool,
        monthDates.length
      );
    const autoResolvedGroup = resolvePlannerPatternGroup({
      staff,
      patternProfile: selectedPatternProfile,
      availableShifts: planningShifts,
      allShifts: workShifts,
    });
    const dedicatedBandOverride = staffDedicatedBandOverrides[staffId] || '';
    const forcedMode = getFixedModeFromDedicatedBand(dedicatedBandOverride);
    const resolvedGroup =
      forcedMode && autoResolvedGroup
        ? {
            ...autoResolvedGroup,
            mode: forcedMode,
            label:
              forcedMode === 'day_fixed'
                ? '데이전담'
                : forcedMode === 'evening_fixed'
                  ? '이브전담'
                  : '나이트전담',
            rationale: '마법사에서 지정한 전담 시간대를 우선 적용했습니다.',
          }
        : forcedMode
          ? {
              key: `${staffId}-${forcedMode}`,
              label:
                forcedMode === 'day_fixed'
                  ? '데이전담'
                  : forcedMode === 'evening_fixed'
                    ? '이브전담'
                    : '나이트전담',
              mode: forcedMode,
              shiftIds: planningShifts
                .filter(
                  (shift) =>
                    resolveShiftBand(shift) === getDedicatedBandFromMode(forcedMode)
                )
                .map((shift) => shift.id),
              rationale: '마법사에서 지정한 전담 시간대를 기준으로 생성했습니다.',
              source: 'auto' as const,
            }
          : autoResolvedGroup;
    const coverageRoleTags = expandCoverageRoleTags(
      staffCoverageRoleTags[staffId] || []
    );

    return {
      staff,
      staffId,
      config,
      resolvedGroup,
      resolvedGroupMode: resolvedGroup?.mode || defaultPlannerMode,
      resolvedGroupLabel: resolvedGroup?.label || '기본',
      resolvedGroupReason:
        resolvedGroup?.rationale || '기본 팀 규칙을 적용합니다.',
      dedicatedBand:
        dedicatedBandOverride ||
        getDedicatedBandFromMode(resolvedGroup?.mode || defaultPlannerMode),
      coverageRoleTags,
      coverageRoleMatcherText: buildPlannerCoverageRoleMatcherText(
        staff,
        coverageRoleTags
      ),
      isSeniorStaff: isSeniorPlannerStaff(staff),
      isNewNurse: isStaffNewNurse(staff, referenceDateKey),
    };
  });
}

