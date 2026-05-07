import type { WizardStep as RosterWizardStep } from './roster/roster-wizard-types';

// Compatibility facade for callers that still import roster types from the legacy top-level file.
export {
  MANAGER_POSITION_KEYWORDS,
  OFF_SHIFT_TOKEN,
  WEEKDAY_LABELS,
  SHIFT_META_MARKER,
  CUSTOM_PATTERN_VALUE,
  WEEKLY_TEMPLATE_PATTERN_VALUE,
  ROSTER_WIZARD_PRESET_STORAGE_KEY,
  ROSTER_PREFERRED_OFF_STORAGE_PREFIX,
  ROSTER_STAFF_NIGHT_RANGE_STORAGE_PREFIX,
  WEEKDAY_PICKER_ORDER,
  NEW_NURSE_TENURE_MONTHS,
  WIZARD_NIGHT_BLOCK_PRESET_OPTIONS,
  GENERATION_STYLE_OPTIONS,
  STAFF_BLOCK_PREFERENCE_OPTIONS,
  PARTIAL_REGENERATION_MODE_OPTIONS,
  PATTERN_OPTIONS,
  WIZARD_PATTERN_OPTIONS,
  PATTERN_GROUP_MODE_OPTIONS,
  STAFF_SHIFT_TYPE_OPTIONS,
} from './roster/roster-wizard-types';

export { ROSTER_PATTERN_PROFILE_STORAGE_KEY } from '@/lib/roster-pattern-profiles';
export { ROSTER_GENERATION_RULE_STORAGE_KEY } from '@/lib/roster-generation-rules';
export type { StaffMember } from '@/types';
export type { RosterPatternGroupMode, RosterPatternProfile, RosterPatternStaffGroup } from '@/lib/roster-pattern-profiles';
export type { RosterGenerationRule, RosterGenerationStyle } from '@/lib/roster-generation-rules';

export type {
  ManualAssignmentMap,
  StaffBlockPreference,
  PartialRegenerationMode,
  WorkShift,
  WeeklyTemplateWeek,
  RosterWizardPreset,
  StaffConfig,
  RosterGenerationStaffPlan,
  RosterGenerationTeamAnalysis,
  RosterGenerationDraft,
  PlannerResolvedPatternGroup,
  PlannerPatternPreviewGroup,
  PreviewCell,
  PreviewRow,
  PreviewDailyCoverage,
  StoredStaffNightRangeMap,
  GeneratedCoveragePlan,
  WizardOffOverride,
  WizardNightRangeDraft,
  CoverageBand,
  StaffRestrictionDraft,
  WizardPairRule,
  WizardGenerationBasis,
  EditableGenerationRuleField,
  StaffPlanningMeta,
  RosterFeasibilityIssue,
  SelectedManualCell,
  RosterPlanComparison,
  StaffShiftType,
} from './roster/roster-wizard-types';

export { parseRosterUpdatedAt, mergeRosterItemsByRecency } from './roster/roster-extra-utils-b';

export type WizardStep = Extract<RosterWizardStep, 1 | 2 | 3 | 4>;

