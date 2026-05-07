'use client';

import { useMemo } from 'react';
import type { StaffMember } from '@/types';
import type { RosterGenerationRule } from '@/lib/roster-generation-rules';
import type { RosterPatternProfile, RosterPatternGroupMode } from '@/lib/roster-pattern-profiles';
import type {
  CoverageBand,
  RosterGenerationDraft,
  ManualAssignmentMap,
  StaffConfig,
  WizardPairRule,
  WorkShift,
} from '../근무표자동편성-types';
import {
  buildFairnessScoreboard,
  buildPreviewDailyCoverage,
  buildPreviewRows,
  buildRosterSummary,
  buildStaffPlanningMeta,
  buildStructuralStaffingGap,
} from './roster-preview-model';
import {
  buildRosterFeasibilityIssues,
  buildRosterWarningReport,
} from './roster-warning-model';

type UseRosterPreviewModelParams = {
  generatedDraft: RosterGenerationDraft | null;
  defaultPlannerMode: RosterPatternGroupMode;
  defaultShiftOrder: WorkShift[];
  defaultShiftPool: WorkShift[];
  effectiveTargetStaffConfigs: Map<string, StaffConfig>;
  enabledTargetStaffs: StaffMember[];
  manualAssignments: ManualAssignmentMap;
  monthDates: string[];
  plannerPairRules: WizardPairRule[];
  previewGenerationRule: RosterGenerationRule;
  selectedPlannerShiftIds: string[];
  selectedPatternProfile: RosterPatternProfile | null;
  staffCoverageRoleTags: Record<string, string[]>;
  staffDedicatedBandOverrides: Record<string, CoverageBand | ''>;
  targetStaffs: StaffMember[];
  workingShifts: WorkShift[];
  workShifts: WorkShift[];
};

export function useRosterPreviewModel({
  generatedDraft,
  defaultPlannerMode,
  defaultShiftOrder,
  defaultShiftPool,
  effectiveTargetStaffConfigs,
  enabledTargetStaffs,
  manualAssignments,
  monthDates,
  plannerPairRules,
  previewGenerationRule,
  selectedPlannerShiftIds,
  selectedPatternProfile,
  staffCoverageRoleTags,
  staffDedicatedBandOverrides,
  targetStaffs,
  workingShifts,
  workShifts,
}: UseRosterPreviewModelParams) {
  const selectedPlannerShifts = useMemo(
    () => defaultShiftPool.filter((shift) => selectedPlannerShiftIds.includes(shift.id)),
    [defaultShiftPool, selectedPlannerShiftIds]
  );

  const previewRows = useMemo(
    () =>
      buildPreviewRows({
        generatedDraft,
        defaultShiftPool,
        effectiveTargetStaffConfigs,
        enabledTargetStaffs,
        manualAssignments,
        monthDates,
        workShifts,
      }),
    [
      generatedDraft,
      defaultShiftPool,
      effectiveTargetStaffConfigs,
      enabledTargetStaffs,
      manualAssignments,
      monthDates,
      workShifts,
    ]
  );

  const staffPlanningMeta = useMemo(
    () =>
      buildStaffPlanningMeta({
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
      }),
    [
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
    ]
  );

  const previewDailyCoverage = useMemo(
    () =>
      buildPreviewDailyCoverage({
        monthDates,
        previewGenerationRule,
        previewRows,
      }),
    [monthDates, previewGenerationRule, previewRows]
  );

  const structuralStaffingGap = useMemo(
    () =>
      buildStructuralStaffingGap({
        enabledTargetStaffCount: enabledTargetStaffs.length,
        monthDates,
        previewGenerationRule,
      }),
    [enabledTargetStaffs.length, monthDates, previewGenerationRule]
  );

  const rosterFeasibilityIssues = useMemo(
    () =>
      buildRosterFeasibilityIssues({
        previewGenerationRule,
        staffPlanningMeta,
        structuralStaffingGap,
      }),
    [previewGenerationRule, staffPlanningMeta, structuralStaffingGap]
  );

  const blockingRosterIssues = useMemo(
    () => rosterFeasibilityIssues.filter((issue) => issue.severity === 'blocking'),
    [rosterFeasibilityIssues]
  );

  const summary = useMemo(
    () =>
      buildRosterSummary({
        manualAssignmentCount: Object.keys(manualAssignments).length,
        previewRowCount: previewRows.length,
        targetStaffCount: targetStaffs.length,
        workingShiftCount: workingShifts.length,
      }),
    [manualAssignments, previewRows.length, targetStaffs.length, workingShifts.length]
  );

  const fairnessScoreboard = useMemo(
    () =>
      buildFairnessScoreboard({
        monthDates,
        previewRows,
      }),
    [monthDates, previewRows]
  );

  const rosterWarningReport = useMemo(
    () =>
      buildRosterWarningReport({
        effectiveTargetStaffConfigs,
        monthDates,
        plannerPairRules,
        previewDailyCoverage,
        previewGenerationRule,
        previewRows,
        structuralStaffingGap,
        workShifts,
      }),
    [
      effectiveTargetStaffConfigs,
      monthDates,
      plannerPairRules,
      previewDailyCoverage,
      previewGenerationRule,
      previewRows,
      structuralStaffingGap,
      workShifts,
    ]
  );

  return {
    blockingRosterIssues,
    fairnessScoreboard,
    previewDailyCoverage,
    previewRows,
    rosterFeasibilityIssues,
    rosterWarningReport,
    selectedPlannerShifts,
    staffPlanningMeta,
    structuralStaffingGap,
    summary,
  };
}

