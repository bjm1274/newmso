/**
 * roster-wizard-types.ts
 * 근무표 자동편성 마법사에서 사용하는 모든 타입, 인터페이스, 상수 정의
 * (React 의존성 없는 순수 타입/상수 모음)
 */

import type {
  RosterGenerationRule,
  RosterGenerationStyle,
} from '@/lib/roster-generation-rules';
import type { RosterPatternGroupMode, RosterPatternProfile } from '@/lib/roster-pattern-profiles';

// ─── 상수 ────────────────────────────────────────────────────────────────────

export const MANAGER_POSITION_KEYWORDS = [
  '팀장', '과장', '실장', '수간호사', '파트장', '센터장',
  '부장', '본부장', '이사', '원장', '병원장', '대표',
];

export const OFF_SHIFT_TOKEN = '__OFF__';
export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
export const SHIFT_META_MARKER = '[SHIFT_META]';
export const CUSTOM_PATTERN_VALUE = '커스텀';
export const WEEKLY_TEMPLATE_PATTERN_VALUE = '주차템플릿';
export const ROSTER_WIZARD_PRESET_STORAGE_KEY = 'erp_roster_wizard_presets_v1';
export const ROSTER_PREFERRED_OFF_STORAGE_PREFIX = 'erp_roster_preferred_off_v1';
export const ROSTER_STAFF_NIGHT_RANGE_STORAGE_PREFIX = 'erp_roster_staff_night_ranges_v1';
export const WEEKDAY_PICKER_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const NEW_NURSE_TENURE_MONTHS = 12;

export const WIZARD_NIGHT_BLOCK_PRESET_OPTIONS = [
  { id: 'single-night', label: 'N-OFF', nightBlockSize: 1, offDaysAfterNight: 1 },
  { id: 'double-night', label: 'N-N-OFF-OFF', nightBlockSize: 2, offDaysAfterNight: 2 },
  { id: 'double-night-short', label: 'N-N-OFF', nightBlockSize: 2, offDaysAfterNight: 1 },
  { id: 'triple-night', label: 'N-N-N-OFF-OFF', nightBlockSize: 3, offDaysAfterNight: 2 },
] as const;

export const GENERATION_STYLE_OPTIONS: Array<{ value: RosterGenerationStyle; label: string; detail: string }> = [
  { value: 'balanced', label: '균등형', detail: '야간, 주말, OFF 균형을 우선합니다.' },
  { value: 'block', label: '블록형', detail: '같은 밴드를 조금 더 길게 묶어 배치합니다.' },
  { value: 'variety', label: '다양성형', detail: '같은 패턴 반복을 줄이고 순환감을 높입니다.' },
  { value: 'stable', label: '안정형', detail: '전담 성향과 기존 흐름을 최대한 유지합니다.' },
];

export const STAFF_BLOCK_PREFERENCE_OPTIONS = [
  { value: 'short', label: '짧게', detail: '1~2일 단위 순환을 선호합니다.' },
  { value: 'balanced', label: '균형', detail: '짧은 블록과 긴 블록을 함께 허용합니다.' },
  { value: 'long', label: '길게', detail: '같은 밴드를 더 길게 묶는 편성을 선호합니다.' },
  { value: 'night_focus', label: '야간 묶음', detail: '나이트를 한 블록으로 몰아주는 쪽을 선호합니다.' },
] as const;

export const PARTIAL_REGENERATION_MODE_OPTIONS = [
  { value: 'minimize_changes', label: '변경 최소화', detail: '기존 편성을 최대한 유지합니다.' },
  { value: 'preserve_pattern', label: '패턴 유지', detail: '원래 블록 흐름과 전담 성향을 우선합니다.' },
  { value: 'rebalance_fairness', label: '공정성 보정', detail: '나이트와 주말 편중을 다시 나눕니다.' },
] as const;

export const PATTERN_OPTIONS = [
  { value: '상근', label: '상근', desc: '평일 근무, 주말 휴무' },
  { value: '2교대', label: '2교대', desc: '주/야 또는 A/B 2개 근무 순환' },
  { value: '3교대', label: '3교대', desc: '데이/이브닝/나이트 + OFF 순환' },
  { value: '2일근무1일휴무', label: '2일근무 1일휴무', desc: '이틀 근무 후 하루 OFF' },
  { value: '1일근무1일휴무', label: '1일근무 1일휴무', desc: '하루 근무 후 하루 OFF' },
  { value: '야간전담', label: '야간전담', desc: '나이트 중심 편성 + OFF 순환' },
  { value: WEEKLY_TEMPLATE_PATTERN_VALUE, label: '주차 템플릿', desc: '1~4주 주기를 기준으로 요일별 기본값 반복' },
];

export const WIZARD_PATTERN_OPTIONS = [
  ...PATTERN_OPTIONS,
  { value: CUSTOM_PATTERN_VALUE, label: CUSTOM_PATTERN_VALUE, desc: '선택한 근무유형과 OFF를 원하는 순서로 직접 조립' },
];

export const PATTERN_GROUP_MODE_OPTIONS: Array<{ value: RosterPatternGroupMode; label: string; desc: string }> = [
  { value: 'day_fixed', label: '데이 전담', desc: '평일 중심으로 같은 근무를 반복합니다.' },
  { value: 'night_fixed', label: '나이트 전담', desc: 'N N OFF OFF 흐름으로 반복합니다.' },
  { value: 'rotation', label: '순환 교대', desc: 'D D E E N N OFF OFF OFF 흐름으로 순환합니다.' },
  { value: 'evening_fixed', label: '이브닝 전담', desc: 'E E OFF OFF 흐름으로 반복합니다.' },
];

// ─── 파생 상수 ────────────────────────────────────────────────────────────────

export type StaffShiftType = 'DEN' | 'DE' | 'DN' | 'EN' | 'D' | 'E' | 'N';

export const STAFF_SHIFT_TYPE_OPTIONS: Array<{ value: StaffShiftType | ''; label: string; desc: string }> = [
  { value: '', label: '자동 (DEN순환)', desc: '데이/이브닝/나이트 자동 순환' },
  { value: 'DEN', label: 'DEN 풀순환', desc: '데이·이브닝·나이트 모두 수행' },
  { value: 'DE', label: 'DE 전담', desc: '데이·이브닝만 수행 (나이트 없음)' },
  { value: 'EN', label: 'EN 전담', desc: '이브닝·나이트만 수행 (데이 없음)' },
  { value: 'DN', label: 'DN 전담', desc: '데이·나이트만 수행 (이브닝 없음)' },
  { value: 'D', label: 'D 전담', desc: '데이만 수행' },
  { value: 'E', label: 'E 전담', desc: '이브닝만 수행' },
  { value: 'N', label: 'N 전담', desc: '나이트만 수행' },
];

export type StaffBlockPreference = (typeof STAFF_BLOCK_PREFERENCE_OPTIONS)[number]['value'];
export type PartialRegenerationMode = (typeof PARTIAL_REGENERATION_MODE_OPTIONS)[number]['value'];

// ─── 인터페이스/타입 ──────────────────────────────────────────────────────────

export type ManualAssignmentMap = Record<string, string>;
export type WizardStep = 1 | 2 | 3 | 4 | 5;
export type CoverageBand = 'day' | 'evening' | 'night';
export type WizardGenerationBasis = 'saved_rule' | 'rotation_only';

export type WorkShift = {
  id: string;
  name: string;
  start_time?: string | null;
  end_time?: string | null;
  description?: string | null;
  shift_type?: string | null;
  company_name?: string | null;
  weekly_work_days?: number | null;
  is_weekend_work?: boolean | null;
};

export type WeeklyTemplateWeek = {
  shiftId: string;
  activeWeekdays: number[];
};

export type RosterWizardPreset = {
  id: string;
  name: string;
  description: string;
  pattern: string;
  shiftSlotCount: number;
  shiftIds: string[];
  shiftNames: string[];
  startOffset: number;
  nightShiftCount: number;
  customPatternSlots: Array<number | 'OFF'>;
  weeklyTemplateWeeks: Array<{
    shiftSlot: number;
    activeWeekdays: number[];
  }>;
  generationRule?: RosterGenerationRule | null;
  staffNightRanges?: Record<string, { minNightShiftCount: number; maxNightShiftCount: number }>;
  staffBlockPreferences?: Record<string, StaffBlockPreference>;
  staffDedicatedBands?: Record<string, CoverageBand | ''>;
  staffCoverageRoleTags?: Record<string, string[]>;
  staffRestrictions?: Record<string, StaffRestrictionDraft>;
  pairRules?: WizardPairRule[];
};

export type StaffConfig = {
  enabled: boolean;
  pattern: string;
  primaryShiftId: string;
  secondaryShiftId: string;
  tertiaryShiftId: string;
  startOffset: number;
  nightShiftCount: number;
  minNightShiftCount: number;
  maxNightShiftCount: number;
  blockPreference: StaffBlockPreference;
  customPatternSequence: string[];
  weeklyTemplateWeeks: WeeklyTemplateWeek[];
  blockedShiftBands: CoverageBand[];
  blockedWeekdays: number[];
  avoidWeekendWork: boolean;
  avoidHolidayWork: boolean;
  preferWeekendOff: boolean;
  preferHolidayOff: boolean;
  avoidConsecutiveEvening: boolean;
  preferEarlyMonthNight: boolean;
};

export type RosterGenerationStaffPlan = {
  staffId: string;
  modeLabel?: string;
  rationale?: string;
  assignments?: string[];
};

export type RosterGenerationTeamAnalysis = {
  teamPurpose?: string;
  workMode?: string;
  includesNight?: boolean;
  reasoning?: string[];
  planningFocus?: string[];
};

export type RosterGenerationDraft = {
  summary?: string;
  teamAnalysis?: RosterGenerationTeamAnalysis;
  staffPlans?: RosterGenerationStaffPlan[];
  leaveSummary?: string;
  preferredOffSummary?: string;
};

export type PlannerResolvedPatternGroup = {
  key: string;
  label: string;
  mode: RosterPatternGroupMode;
  shiftIds: string[];
  rationale: string;
  source: 'profile' | 'auto';
};

export type PlannerPatternPreviewGroup = {
  key: string;
  label: string;
  mode: RosterPatternGroupMode;
  count: number;
  source: 'profile' | 'auto' | 'default';
};

export type PreviewCell = {
  date: string;
  baseShiftId: string;
  shiftId: string;
  shiftName: string;
  code: string;
  displayLabel?: string;
  badgeClass: string;
  isManual: boolean;
};

export type PreviewRow = {
  staff: import('@/types').StaffMember;
  config: StaffConfig;
  cells: PreviewCell[];
  counts: {
    work: number;
    off: number;
    night: number;
  };
};

export type PreviewDailyCoverage = {
  date: string;
  day: number;
  evening: number;
  night: number;
  targetDay: number;
  targetEvening: number;
  targetNight: number;
  targetSourceLabel: string;
  status: 'warning' | 'balanced' | 'extra';
  statusLabel: string;
  statusDetail: string;
};

export type StoredStaffNightRangeMap = Record<
  string,
  { minNightShiftCount: number; maxNightShiftCount: number }
>;

export type GeneratedCoveragePlan = {
  staffId: string;
  modeLabel: string;
  rationale: string;
  assignments: string[];
  effectiveMode: RosterPatternGroupMode;
  allowedShiftIds: string[];
  blockedDateSet?: Set<string>;
};

export type WizardOffOverride = {
  enabled: boolean;
  offDate: string;
  nextShiftId: string;
};

export type WizardNightRangeDraft = {
  minNightShiftCount: number;
  maxNightShiftCount: number;
};

export type StaffRestrictionDraft = {
  blockedShiftBands: CoverageBand[];
  blockedWeekdays: number[];
  avoidWeekendWork: boolean;
  avoidHolidayWork: boolean;
  preferWeekendOff: boolean;
  preferHolidayOff: boolean;
  avoidConsecutiveEvening: boolean;
  preferEarlyMonthNight: boolean;
};

export type WizardPairRule = {
  id: string;
  primaryStaffId: string;
  secondaryStaffId: string;
  mode: 'together' | 'separate';
  band: 'night' | 'work';
};

export type CoverageValidationEntry = {
  date: string;
  band: CoverageBand;
  actual: number;
  required: number;
};

export type SurplusAllocationEntry = {
  date: string;
  staffId: string;
  staffName: string;
  currentShift: string;
  suggestedBand: CoverageBand;
};

export type EditableGenerationRuleField =
  | 'name'
  | 'description'
  | 'teamKeywords'
  | 'generationStyle'
  | 'avoidDayAfterNight'
  | 'avoidDayAfterEvening'
  | 'avoidEveningAfterNight'
  | 'maxConsecutiveEveningShifts'
  | 'offDaysAfterNight'
  | 'nightBlockSize'
  | 'minRotationNightCount'
  | 'maxRotationNightCount'
  | 'minMonthlyOffDays'
  | 'maxConsecutiveWorkDays'
  | 'maxConsecutiveWeekendWorkDays'
  | 'fixedShiftOnly'
  | 'balanceRotationBands'
  | 'distributeWeekendShifts'
  | 'distributeHolidayShifts'
  | 'separateNewNursesByShift'
  | 'blockNewNurseSoloNight'
  | 'requireSeniorWithNewNurseNight'
  | 'minDayStaff'
  | 'minEveningStaff'
  | 'minNightStaff'
  | 'weekendMinDayStaff'
  | 'weekendMinEveningStaff'
  | 'weekendMinNightStaff'
  | 'holidayMinDayStaff'
  | 'holidayMinEveningStaff'
  | 'holidayMinNightStaff'
  | 'minSeniorDayStaff'
  | 'minSeniorEveningStaff'
  | 'minSeniorNightStaff'
  | 'minDedicatedDayStaff'
  | 'minDedicatedEveningStaff'
  | 'minDedicatedNightStaff';

export type StaffPlanningMeta = {
  staff: import('@/types').StaffMember;
  staffId: string;
  config: StaffConfig;
  resolvedGroup: PlannerResolvedPatternGroup | null;
  resolvedGroupMode: RosterPatternGroupMode;
  resolvedGroupLabel: string;
  resolvedGroupReason: string;
  dedicatedBand: CoverageBand | null;
  coverageRoleTags: string[];
  coverageRoleMatcherText: string;
  isSeniorStaff: boolean;
  isNewNurse: boolean;
};

export type RosterFeasibilityIssue = {
  id: string;
  severity: 'blocking' | 'warning';
  targetTestId: string;
  title: string;
  detail: string;
};

export type SelectedManualCell = {
  staffId: string;
  date: string;
} | null;

export type RosterPlanComparison = {
  id: string;
  title: string;
  description: string;
  style: RosterGenerationStyle;
  fairnessScore: number;
  diversityScore: number;
  warningCount: number;
  changedCells: number;
  recommendation: string;
};

// Re-export for convenience (previously imported from lib)
export type { RosterGenerationRule, RosterGenerationStyle, RosterPatternGroupMode, RosterPatternProfile };

