// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
'use client';

import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { StaffMember } from '@/types';
import type { ToastType } from '@/lib/toast';
import type { RosterGenerationRule } from '@/lib/roster-generation-rules';
import {
  expandCoverageRoleTags,
  normalizeCoverageRoleTags,
} from '@/lib/roster-role-tags';
import {
  CUSTOM_PATTERN_VALUE,
  OFF_SHIFT_TOKEN,
  PATTERN_OPTIONS,
  WEEKLY_TEMPLATE_PATTERN_VALUE,
  type CoverageBand,
  type EditableGenerationRuleField,
  type ManualAssignmentMap,
  type RosterWizardPreset,
  type SelectedManualCell,
  type StaffBlockPreference,
  type StaffConfig,
  type StaffRestrictionDraft,
  type WeeklyTemplateWeek,
  type WizardGenerationBasis,
  type WizardNightRangeDraft,
  type WizardOffOverride,
  type WizardPairRule,
  type WizardStep,
  type WorkShift,
} from '../근무표자동편성-types';
import {
  buildAssignmentKey,
  buildDefaultCustomPatternSequence,
  buildDefaultStaffRestrictionDraft,
  buildDefaultWeeklyTemplateWeeks,
  buildGenerationRuleSummaryItems,
  buildInitialConfig,
  clampNightShiftCount,
  cloneGenerationRule,
  getRequiredShiftCount,
  inferDefaultNightShiftCount,
  isCustomPattern,
  isNightPattern,
  isWeeklyTemplatePattern,
  normalizeBlockedShiftBands,
  normalizeBlockedWeekdays,
  normalizeCustomPatternSequence,
  normalizePresetRecord,
  normalizeStaffBlockPreference,
  normalizeWeeklyTemplateWeeks,
  resolvePresetShiftIds,
} from '../근무표자동편성-engine';
import { useRosterWizardApplyAction } from './useRosterWizardApplyAction';
import { useRosterWizardRuleDraftActions } from './useRosterWizardRuleDraftActions';
import { useRosterWizardSync } from './useRosterWizardSync';

export function useRosterWizardState({
  applyGenerationRuleDraftFieldUpdate,
  defaultShiftOrder,
  defaultShiftPool,
  defaultWizardSelectedStaffIds,
  effectiveTargetStaffConfigs,
  hasExistingPreview,
  monthDates,
  orderedTargetStaffIds,
  plannerActions,
  plannerPairRules,
  plannerSeed,
  previewGenerationRule,
  recommendedPlannerShifts,
  savedWizardPresets,
  scope,
  selectedPlannerShifts,
  selectedGenerationRule,
  staffCoverageRoleTags,
  staffDedicatedBandOverrides,
  targetStaffs,
  toast,
}: any) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [wizardSelectedStaffIds, setWizardSelectedStaffIds] = useState<string[]>([]);
  const [wizardPattern, setWizardPattern] = useState('');
  const [wizardShiftIds, setWizardShiftIds] = useState<string[]>([]);
  const [wizardStartOffset, setWizardStartOffset] = useState(0);
  const [wizardNightShiftCount, setWizardNightShiftCount] = useState(0);
  const [wizardCustomPatternSequence, setWizardCustomPatternSequence] = useState<string[]>(
    []
  );
  const [wizardWeeklyTemplateWeeks, setWizardWeeklyTemplateWeeks] = useState<
    WeeklyTemplateWeek[]
  >([]);
  const [wizardSelectedPresetId, setWizardSelectedPresetId] = useState('');
  const [wizardOffOverrides, setWizardOffOverrides] = useState<
    Record<string, WizardOffOverride>
  >({});
  const [wizardGenerationBasis, setWizardGenerationBasis] =
    useState<WizardGenerationBasis>('saved_rule');
  const [wizardRuleDraft, setWizardRuleDraft] = useState<RosterGenerationRule>(
    () => cloneGenerationRule(previewGenerationRule) || previewGenerationRule
  );
  const [wizardNightRangeDrafts, setWizardNightRangeDrafts] = useState<
    Record<string, WizardNightRangeDraft>
  >({});
  const [wizardBlockPreferenceDrafts, setWizardBlockPreferenceDrafts] = useState<
    Record<string, StaffBlockPreference>
  >({});
  const [wizardDedicatedBandDrafts, setWizardDedicatedBandDrafts] = useState<
    Record<string, CoverageBand | ''>
  >({});
  const [wizardStaffRestrictionDrafts, setWizardStaffRestrictionDrafts] = useState<
    Record<string, StaffRestrictionDraft>
  >({});
  const [wizardCoverageRoleDrafts, setWizardCoverageRoleDrafts] = useState<
    Record<string, string[]>
  >({});
  const [wizardPairRules, setWizardPairRules] = useState<WizardPairRule[]>([]);

  const {
    effectiveWizardCustomPatternSequence,
    effectiveWizardWeeklyTemplateWeeks,
    orderedWizardShiftIds,
    selectedWizardPreset,
    userWizardPresets,
    wizardExcludedStaffs,
    wizardOverrideDateOptions,
    wizardOverrideShiftOptions,
    wizardRequiredShiftCount,
    wizardRuleSummaryItems,
    wizardSelectedStaffs,
    wizardUsesCustomPattern,
    wizardUsesWeeklyTemplate,
  } = useRosterWizardSync({
    defaultShiftOrder,
    defaultShiftPool,
    defaultWizardSelectedStaffIds,
    effectiveTargetStaffConfigs,
    monthDates,
    orderedTargetStaffIds,
    plannerPairRules,
    previewGenerationRule,
    savedWizardPresets,
    setWizardBlockPreferenceDrafts,
    setWizardCoverageRoleDrafts,
    setWizardCustomPatternSequence,
    setWizardDedicatedBandDrafts,
    setWizardNightRangeDrafts,
    setWizardNightShiftCount,
    setWizardOffOverrides,
    setWizardPairRules,
    setWizardRuleDraft,
    setWizardSelectedStaffIds,
    setWizardShiftIds,
    setWizardStaffRestrictionDrafts,
    setWizardWeeklyTemplateWeeks,
    staffCoverageRoleTags,
    staffDedicatedBandOverrides,
    targetStaffs,
    wizardCustomPatternSequence,
    wizardOpen,
    wizardPattern,
    wizardRuleDraft,
    wizardSelectedPresetId,
    wizardSelectedStaffIds,
    wizardShiftIds,
    wizardWeeklyTemplateWeeks,
  });

  const {
    addWizardDateCoverageOverride,
    addWizardRoleCoverageRule,
    applyWizardNightBlockPreset,
    removeWizardDateCoverageOverride,
    removeWizardRoleCoverageRule,
    updateWizardDateCoverageOverride,
    updateWizardRoleCoverageRule,
    updateWizardRuleDraftField,
  } = useRosterWizardRuleDraftActions({
    applyGenerationRuleDraftFieldUpdate,
    monthDates,
    setWizardRuleDraft,
  });

  const resetWizardRuleSelection = () => {
    setWizardPattern('');
    setWizardShiftIds([]);
    setWizardStartOffset(0);
    setWizardNightShiftCount(0);
    setWizardCustomPatternSequence([]);
    setWizardWeeklyTemplateWeeks([]);
  };

  const openWizard = () => {
    const defaultPlannerPattern = PATTERN_OPTIONS[0]?.value || '';
    const threeShiftPattern =
      PATTERN_OPTIONS.find(
        (option) =>
          !isCustomPattern(option.value) &&
          !isWeeklyTemplatePattern(option.value) &&
          getRequiredShiftCount(option.value) >= 3
      )?.value || defaultPlannerPattern;
    const nextPattern = plannerSeed.effectivePattern || defaultPlannerPattern;
    const nextPlannerShiftIds = isWeeklyTemplatePattern(nextPattern)
      ? [
          ...new Set(
            plannerSeed.effectiveWeeklyTemplateWeeks
              .map((week) => week.shiftId)
              .concat([
                plannerSeed.plannerPrimaryShiftId,
                plannerSeed.plannerSecondaryShiftId,
                plannerSeed.plannerTertiaryShiftId,
              ])
              .filter(Boolean)
          ),
        ]
      : [
          plannerSeed.plannerPrimaryShiftId,
          plannerSeed.plannerSecondaryShiftId,
          plannerSeed.plannerTertiaryShiftId,
        ].filter(Boolean);
    const recommendedWizardShiftIds = [
      ...new Set(
        (selectedPlannerShifts.length > 0 ? selectedPlannerShifts : recommendedPlannerShifts)
          .map((shift) => shift.id)
          .filter(Boolean)
      ),
    ].slice(0, 3);
    const resolvedWizardShiftIds =
      nextPlannerShiftIds.length > 0 ? nextPlannerShiftIds : recommendedWizardShiftIds;
    const resolvedWizardPattern =
      nextPlannerShiftIds.length === 0 && resolvedWizardShiftIds.length >= 3
        ? threeShiftPattern
        : nextPattern;

    setWizardStep(1);
    setWizardPattern(resolvedWizardPattern);
    setWizardStartOffset(plannerSeed.plannerStartOffset);
    setWizardNightShiftCount(
      isNightPattern(resolvedWizardPattern)
        ? hasExistingPreview
          ? plannerSeed.plannerNightShiftCount
          : inferDefaultNightShiftCount(resolvedWizardPattern, monthDates.length)
        : 0
    );
    setWizardCustomPatternSequence(
      isCustomPattern(resolvedWizardPattern)
        ? plannerSeed.effectiveCustomPatternSequence.length > 0
          ? plannerSeed.effectiveCustomPatternSequence
          : buildDefaultCustomPatternSequence(resolvedWizardShiftIds)
        : []
    );
    setWizardWeeklyTemplateWeeks(
      isWeeklyTemplatePattern(resolvedWizardPattern)
        ? plannerSeed.effectiveWeeklyTemplateWeeks.length > 0
          ? plannerSeed.effectiveWeeklyTemplateWeeks
          : buildDefaultWeeklyTemplateWeeks(resolvedWizardShiftIds, 1)
        : []
    );
    setWizardShiftIds(
      isCustomPattern(resolvedWizardPattern)
        ? plannerSeed.effectiveCustomPatternSequence
            .filter((token) => token !== OFF_SHIFT_TOKEN)
            .filter((shiftId, index, list) => list.indexOf(shiftId) === index)
        : resolvedWizardShiftIds
    );
    setWizardGenerationBasis(selectedGenerationRule ? 'saved_rule' : 'rotation_only');
    setWizardRuleDraft(cloneGenerationRule(previewGenerationRule) || previewGenerationRule);
    setWizardSelectedStaffIds(defaultWizardSelectedStaffIds);
    setWizardSelectedPresetId('');
    setWizardOffOverrides({});
    setWizardOpen(true);
  };

  const closeWizard = () => {
    setWizardOpen(false);
    setWizardStep(1);
    resetWizardRuleSelection();
    setWizardSelectedPresetId('');
    setWizardOffOverrides({});
  };

  const toggleWizardStaff = (staffId: string) => {
    setWizardSelectedStaffIds((prev) => {
      const next = prev.includes(staffId)
        ? prev.filter((value) => value !== staffId)
        : [...prev, staffId];
      return orderedTargetStaffIds.filter((candidateId) => next.includes(candidateId));
    });
  };

  const includeAllWizardStaff = () => {
    setWizardSelectedStaffIds(orderedTargetStaffIds);
  };

  const clearWizardStaffSelection = () => {
    setWizardSelectedStaffIds([]);
  };

  const applyWizardPreset = (preset: RosterWizardPreset) => {
    const normalizedPreset = normalizePresetRecord(preset);
    if (!normalizedPreset) return;

    const resolvedShiftIds = resolvePresetShiftIds(
      normalizedPreset,
      orderedWizardShiftIds
        .concat(defaultShiftOrder.map((shift) => shift.id))
        .concat(defaultShiftPool.map((shift) => shift.id)),
      defaultShiftPool
    );
    if (resolvedShiftIds.length === 0) {
      toast('적용할 근무유형이 없습니다. 먼저 근무유형을 등록하세요.', 'success');
      return;
    }

    const getShiftIdBySlot = (slot: number) =>
      resolvedShiftIds[Math.max(0, slot - 1)] || resolvedShiftIds[0] || '';
    const nextCustomPatternSequence =
      normalizedPreset.pattern === CUSTOM_PATTERN_VALUE
        ? normalizedPreset.customPatternSlots
            .map((token) =>
              token === 'OFF' ? OFF_SHIFT_TOKEN : getShiftIdBySlot(token)
            )
            .filter(Boolean)
        : [];
    const nextWeeklyTemplateWeeks =
      normalizedPreset.pattern === WEEKLY_TEMPLATE_PATTERN_VALUE
        ? normalizeWeeklyTemplateWeeks(
            normalizedPreset.weeklyTemplateWeeks.map((week) => ({
              shiftId: getShiftIdBySlot(week.shiftSlot),
              activeWeekdays: week.activeWeekdays,
            })),
            resolvedShiftIds,
            normalizedPreset.weeklyTemplateWeeks.length || 1
          )
        : [];

    setWizardPattern(normalizedPreset.pattern);
    setWizardShiftIds(resolvedShiftIds);
    setWizardStartOffset(normalizedPreset.startOffset);
    setWizardNightShiftCount(
      isNightPattern(normalizedPreset.pattern)
        ? clampNightShiftCount(normalizedPreset.nightShiftCount, monthDates.length)
        : 0
    );
    setWizardCustomPatternSequence(
      normalizedPreset.pattern === CUSTOM_PATTERN_VALUE
        ? nextCustomPatternSequence.length > 0
          ? nextCustomPatternSequence
          : buildDefaultCustomPatternSequence(resolvedShiftIds)
        : []
    );
    setWizardWeeklyTemplateWeeks(nextWeeklyTemplateWeeks);
    if (normalizedPreset.generationRule) {
      setWizardRuleDraft(
        cloneGenerationRule(normalizedPreset.generationRule) || previewGenerationRule
      );
    }
    if (
      normalizedPreset.staffNightRanges &&
      Object.keys(normalizedPreset.staffNightRanges).length > 0
    ) {
      setWizardNightRangeDrafts((prev) => {
        const next = { ...prev };
        Object.entries(normalizedPreset.staffNightRanges || {}).forEach(
          ([staffId, range]) => {
            next[staffId] = {
              minNightShiftCount: clampNightShiftCount(
                range.minNightShiftCount || 0,
                monthDates.length
              ),
              maxNightShiftCount: clampNightShiftCount(
                Math.max(
                  range.minNightShiftCount || 0,
                  range.maxNightShiftCount || 0
                ),
                monthDates.length
              ),
            };
          }
        );
        return next;
      });
    }
    if (normalizedPreset.staffBlockPreferences) {
      setWizardBlockPreferenceDrafts((prev) => ({
        ...prev,
        ...Object.fromEntries(
          Object.entries(normalizedPreset.staffBlockPreferences || {}).map(
            ([staffId, value]) => [
              staffId,
              normalizeStaffBlockPreference(value),
            ]
          )
        ),
      }));
    }
    if (normalizedPreset.staffDedicatedBands) {
      setWizardDedicatedBandDrafts((prev) => ({
        ...prev,
        ...normalizedPreset.staffDedicatedBands,
      }));
    }
    if (normalizedPreset.staffRestrictions) {
      setWizardStaffRestrictionDrafts((prev) => ({
        ...prev,
        ...Object.fromEntries(
          Object.entries(normalizedPreset.staffRestrictions || {}).map(
            ([staffId, restriction]) => [
              staffId,
              {
                ...buildDefaultStaffRestrictionDraft(),
                ...restriction,
              },
            ]
          )
        ),
      }));
    }
    if (normalizedPreset.staffCoverageRoleTags) {
      setWizardCoverageRoleDrafts((prev) => ({
        ...prev,
        ...Object.fromEntries(
          Object.entries(normalizedPreset.staffCoverageRoleTags || {}).map(
            ([staffId, tags]) => [staffId, normalizeCoverageRoleTags(tags)]
          )
        ),
      }));
    }
    setWizardPairRules(normalizedPreset.pairRules || []);
    setWizardSelectedPresetId(normalizedPreset.id);
  };

  const updateWizardOffOverride = (
    staffId: string,
    patch: Partial<WizardOffOverride>
  ) => {
    setWizardOffOverrides((prev) => {
      const current = prev[staffId] || {
        enabled: false,
        offDate: wizardOverrideDateOptions[0] || '',
        nextShiftId: wizardOverrideShiftOptions[0]?.id || '',
      };

      return {
        ...prev,
        [staffId]: {
          ...current,
          ...patch,
        },
      };
    });
  };

  const updateWizardNightRangeDraft = (
    staffId: string,
    field: keyof WizardNightRangeDraft,
    value: string
  ) => {
    setWizardNightRangeDrafts((prev) => {
      const current = prev[staffId] || {
        minNightShiftCount: 0,
        maxNightShiftCount: 0,
      };
      const nextValue = clampNightShiftCount(Number(value) || 0, monthDates.length);
      const next = {
        ...current,
        [field]: nextValue,
      };

      if (field === 'minNightShiftCount' && next.maxNightShiftCount > 0) {
        next.maxNightShiftCount = Math.max(
          next.minNightShiftCount,
          next.maxNightShiftCount
        );
      }
      if (field === 'maxNightShiftCount') {
        next.maxNightShiftCount = Math.max(
          next.minNightShiftCount,
          next.maxNightShiftCount
        );
      }

      return {
        ...prev,
        [staffId]: next,
      };
    });
  };

  const VALID_SHIFT_TYPE_VALUES = new Set(['DEN', 'DE', 'DN', 'EN', 'D', 'E', 'N', 'day', 'evening', 'night']);
  const updateWizardDedicatedBandDraft = (staffId: string, value: string) => {
    setWizardDedicatedBandDrafts((prev) => ({
      ...prev,
      [staffId]: VALID_SHIFT_TYPE_VALUES.has(value) ? value : '',
    }));
  };

  const updateWizardCoverageRoleDraft = (staffId: string, value: string) => {
    setWizardCoverageRoleDrafts((prev) => ({
      ...prev,
      [staffId]: normalizeCoverageRoleTags(value.split(',')),
    }));
  };

  const updateWizardStaffRestrictionDraft = (
    staffId: string,
    field: keyof StaffRestrictionDraft,
    value: string | boolean | CoverageBand[] | number[]
  ) => {
    setWizardStaffRestrictionDrafts((prev) => {
      const current = prev[staffId] || buildDefaultStaffRestrictionDraft();
      const nextValue =
        field === 'blockedShiftBands'
          ? normalizeBlockedShiftBands(value)
          : field === 'blockedWeekdays'
            ? normalizeBlockedWeekdays(value)
            : Boolean(value);

      return {
        ...prev,
        [staffId]: {
          ...current,
          [field]: nextValue,
        },
      };
    });
  };

  const addWizardPairRule = () => {
    const primaryStaffId = wizardSelectedStaffIds[0] || '';
    const secondaryStaffId = wizardSelectedStaffIds[1] || primaryStaffId;
    if (!primaryStaffId || !secondaryStaffId || primaryStaffId === secondaryStaffId) {
      return;
    }

    setWizardPairRules((prev) => [
      ...prev,
      {
        id: `pair-rule-${Date.now()}-${prev.length + 1}`,
        primaryStaffId,
        secondaryStaffId,
        mode: 'together',
        band: 'night',
      },
    ]);
  };

  const updateWizardPairRule = (
    ruleId: string,
    field: keyof Omit<WizardPairRule, 'id'>,
    value: string
  ) => {
    setWizardPairRules((prev) =>
      prev.map((rule) => {
        if (rule.id !== ruleId) return rule;
        if (field === 'mode' && value !== 'together' && value !== 'separate') {
          return rule;
        }
        if (field === 'band' && value !== 'night' && value !== 'work') {
          return rule;
        }
        return {
          ...rule,
          [field]: value,
        } as WizardPairRule;
      })
    );
  };

  const removeWizardPairRule = (ruleId: string) => {
    setWizardPairRules((prev) => prev.filter((rule) => rule.id !== ruleId));
  };


  const applyWizard = useRosterWizardApplyAction({
    closeWizard,
    defaultShiftOrder,
    defaultShiftPool,
    effectiveWizardCustomPatternSequence,
    effectiveWizardWeeklyTemplateWeeks,
    monthDates,
    orderedWizardShiftIds,
    plannerActions,
    previewGenerationRule,
    scope,
    targetStaffs,
    toast,
    wizardBlockPreferenceDrafts,
    wizardCoverageRoleDrafts,
    wizardDedicatedBandDrafts,
    wizardNightRangeDrafts,
    wizardNightShiftCount,
    wizardOffOverrides,
    wizardPairRules,
    wizardPattern,
    wizardRequiredShiftCount,
    wizardRuleDraft,
    wizardSelectedStaffIds,
    wizardStaffRestrictionDrafts,
    wizardStartOffset,
    wizardUsesCustomPattern,
    wizardUsesWeeklyTemplate,
  });

  return {
    addWizardDateCoverageOverride,
    addWizardPairRule,
    addWizardRoleCoverageRule,
    applyWizard,
    applyWizardNightBlockPreset,
    applyWizardPreset,
    clearWizardStaffSelection,
    closeWizard,
    effectiveWizardCustomPatternSequence,
    effectiveWizardWeeklyTemplateWeeks,
    includeAllWizardStaff,
    openWizard,
    orderedWizardShiftIds,
    removeWizardDateCoverageOverride,
    removeWizardPairRule,
    removeWizardRoleCoverageRule,
    resetWizardRuleSelection,
    selectedWizardPreset,
    setWizardGenerationBasis,
    setWizardSelectedPresetId,
    setWizardStep,
    toggleWizardStaff,
    updateWizardCoverageRoleDraft,
    updateWizardDateCoverageOverride,
    updateWizardDedicatedBandDraft,
    updateWizardNightRangeDraft,
    updateWizardOffOverride,
    updateWizardPairRule,
    updateWizardRoleCoverageRule,
    updateWizardRuleDraftField,
    updateWizardStaffRestrictionDraft,
    userWizardPresets,
    wizardCoverageRoleDrafts,
    wizardDedicatedBandDrafts,
    wizardExcludedStaffs,
    wizardGenerationBasis,
    wizardNightRangeDrafts,
    wizardOffOverrides,
    wizardOpen,
    wizardOverrideDateOptions,
    wizardOverrideShiftOptions,
    wizardPairRules,
    wizardPattern,
    wizardRequiredShiftCount,
    wizardRuleDraft,
    wizardRuleSummaryItems,
    wizardSelectedPresetId,
    wizardSelectedStaffIds,
    wizardSelectedStaffs,
    wizardStaffRestrictionDrafts,
    wizardStep,
    wizardUsesCustomPattern,
    wizardUsesWeeklyTemplate,
  };
}

