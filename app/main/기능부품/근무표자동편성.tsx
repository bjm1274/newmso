'use client';
import { toast } from '@/lib/toast';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StaffMember } from '@/types';
import { isActiveStaff } from '@/lib/active-staff';
import {
  buildDefaultPatternProfile,
  findPatternStaffGroup,
  getPatternProfileShiftIds,
  matchPatternProfileForDepartment,
  normalizePatternProfile,
  readCachedPatternProfiles,
  ROSTER_PATTERN_PROFILE_STORAGE_KEY,
  type RosterPatternGroupMode,
  type RosterPatternProfile,
  type RosterPatternStaffGroup,
  writeCachedPatternProfiles,
} from '@/lib/roster-pattern-profiles';
import {
  buildDefaultGenerationRule,
  matchGenerationRuleForDepartment,
  normalizeGenerationRule,
  readCachedGenerationRules,
  ROSTER_GENERATION_RULE_STORAGE_KEY,
  type RosterGenerationRule,
  type RosterGenerationStyle,
  writeCachedGenerationRules,
} from '@/lib/roster-generation-rules';
import {
  buildBlockedDatesByStaff,
  buildPreferredOffDateMap,
  countBlockedDateEntries,
  mergeBlockedDateMaps,
  normalizePreferredOffSelections,
  type PreferredOffSelectionMap,
} from '@/lib/roster-date-utils';
import {
  expandCoverageRoleTags,
  normalizeCoverageRoleTags,
  serializeCoverageRoleTags,
  summarizeRoleCoverageRules,
} from '@/lib/roster-role-tags';
import {
  buildRosterSnapshotStorageKey,
  normalizeStoredRosterSnapshot,
  type StoredRosterSnapshot,
} from '@/lib/roster-snapshot-history';
import {
  deleteRosterPolicyStorageRecord,
  loadRosterPolicyStorageRecords,
  upsertRosterPolicyStorageRecord,
} from '@/lib/roster-policy-storage';
import { isKoreanPublicHoliday } from '@/lib/korean-public-holidays';
import { filterRosterShiftsForDepartment } from '@/lib/roster-shift-team-filter';
import { supabase } from '@/lib/supabase';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import RosterFairnessBoard from './roster/RosterFairnessBoard';
import RosterManualImpactPanel from './roster/RosterManualImpactPanel';
import RosterPartialRegenerationPanel from './roster/RosterPartialRegenerationPanel';
import RosterReviewPanel from './roster/RosterReviewPanel';
import RosterSnapshotPanel from './roster/RosterSnapshotPanel';
import RosterWarningReport from './roster/RosterWarningReport';
import SmartMonthPicker from './공통/SmartMonthPicker';

const MANAGER_POSITION_KEYWORDS = [
  '팀장',
  '과장',
  '실장',
  '수간호사',
  '파트장',
  '센터장',
  '부장',
  '본부장',
  '이사',
  '원장',
  '병원장',
  '대표',
];

const OFF_SHIFT_TOKEN = '__OFF__';
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const SHIFT_META_MARKER = '[SHIFT_META]';
const CUSTOM_PATTERN_VALUE = '커스텀';
const WEEKLY_TEMPLATE_PATTERN_VALUE = '주차템플릿';
const ROSTER_WIZARD_PRESET_STORAGE_KEY = 'erp_roster_wizard_presets_v1';
const ROSTER_PREFERRED_OFF_STORAGE_PREFIX = 'erp_roster_preferred_off_v1';
const ROSTER_STAFF_NIGHT_RANGE_STORAGE_PREFIX = 'erp_roster_staff_night_ranges_v1';
const WEEKDAY_PICKER_ORDER = [1, 2, 3, 4, 5, 6, 0];
const NEW_NURSE_TENURE_MONTHS = 12;
const WIZARD_NIGHT_BLOCK_PRESET_OPTIONS = [
  { id: 'single-night', label: 'N-OFF', nightBlockSize: 1, offDaysAfterNight: 1 },
  { id: 'double-night', label: 'N-N-OFF-OFF', nightBlockSize: 2, offDaysAfterNight: 2 },
  { id: 'double-night-short', label: 'N-N-OFF', nightBlockSize: 2, offDaysAfterNight: 1 },
  { id: 'triple-night', label: 'N-N-N-OFF-OFF', nightBlockSize: 3, offDaysAfterNight: 2 },
] as const;
const GENERATION_STYLE_OPTIONS: Array<{ value: RosterGenerationStyle; label: string; detail: string }> = [
  { value: 'balanced', label: '균등형', detail: '야간, 주말, OFF 균형을 우선합니다.' },
  { value: 'block', label: '블록형', detail: '같은 밴드를 조금 더 길게 묶어 배치합니다.' },
  { value: 'variety', label: '다양성형', detail: '같은 패턴 반복을 줄이고 순환감을 높입니다.' },
  { value: 'stable', label: '안정형', detail: '전담 성향과 기존 흐름을 최대한 유지합니다.' },
];
const STAFF_BLOCK_PREFERENCE_OPTIONS = [
  { value: 'short', label: '짧게', detail: '1~2일 단위 순환을 선호합니다.' },
  { value: 'balanced', label: '균형', detail: '짧은 블록과 긴 블록을 함께 허용합니다.' },
  { value: 'long', label: '길게', detail: '같은 밴드를 더 길게 묶는 편성을 선호합니다.' },
  { value: 'night_focus', label: '야간 묶음', detail: '나이트를 한 블록으로 몰아주는 쪽을 선호합니다.' },
] as const;
const PARTIAL_REGENERATION_MODE_OPTIONS = [
  { value: 'minimize_changes', label: '변경 최소화', detail: '기존 편성을 최대한 유지합니다.' },
  { value: 'preserve_pattern', label: '패턴 유지', detail: '원래 블록 흐름과 전담 성향을 우선합니다.' },
  { value: 'rebalance_fairness', label: '공정성 보정', detail: '나이트와 주말 편중을 다시 나눕니다.' },
] as const;

type ManualAssignmentMap = Record<string, string>;
type WizardStep = 1 | 2 | 3 | 4;
type StaffBlockPreference = (typeof STAFF_BLOCK_PREFERENCE_OPTIONS)[number]['value'];
type PartialRegenerationMode = (typeof PARTIAL_REGENERATION_MODE_OPTIONS)[number]['value'];

function parseRosterUpdatedAt(value: string | null | undefined) {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function mergeRosterItemsByRecency<T extends { id: string; updatedAt?: string | null }>(...collections: T[][]) {
  const merged = new Map<string, T>();

  collections.flat().forEach((item) => {
    const id = String(item?.id || '').trim();
    if (!id) return;

    const current = merged.get(id);
    if (!current || parseRosterUpdatedAt(item.updatedAt) >= parseRosterUpdatedAt(current.updatedAt)) {
      merged.set(id, item);
    }
  });

  return Array.from(merged.values()).sort(
    (left, right) => parseRosterUpdatedAt(right.updatedAt) - parseRosterUpdatedAt(left.updatedAt)
  );
}

const PATTERN_OPTIONS = [
  { value: '상근', label: '상근', desc: '평일 근무, 주말 휴무' },
  { value: '2교대', label: '2교대', desc: '주/야 또는 A/B 2개 근무 순환' },
  { value: '3교대', label: '3교대', desc: '데이/이브닝/나이트 + OFF 순환' },
  { value: '2일근무1일휴무', label: '2일근무 1일휴무', desc: '이틀 근무 후 하루 OFF' },
  { value: '1일근무1일휴무', label: '1일근무 1일휴무', desc: '하루 근무 후 하루 OFF' },
  { value: '야간전담', label: '야간전담', desc: '나이트 중심 편성 + OFF 순환' },
  { value: WEEKLY_TEMPLATE_PATTERN_VALUE, label: '주차 템플릿', desc: '1~4주 주기를 기준으로 요일별 기본값 반복' },
];
const WIZARD_PATTERN_OPTIONS = [
  ...PATTERN_OPTIONS,
  { value: CUSTOM_PATTERN_VALUE, label: CUSTOM_PATTERN_VALUE, desc: '선택한 근무유형과 OFF를 원하는 순서로 직접 조립' },
];
const PATTERN_GROUP_MODE_OPTIONS: Array<{ value: RosterPatternGroupMode; label: string; desc: string }> = [
  { value: 'day_fixed', label: '데이 전담', desc: '평일 중심으로 같은 근무를 반복합니다.' },
  { value: 'night_fixed', label: '나이트 전담', desc: 'N N OFF OFF 흐름으로 반복합니다.' },
  { value: 'rotation', label: '순환 교대', desc: 'D D E E N N OFF OFF OFF 흐름으로 순환합니다.' },
  { value: 'evening_fixed', label: '이브닝 전담', desc: 'E E OFF OFF 흐름으로 반복합니다.' },
];

type WorkShift = {
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

type WeeklyTemplateWeek = {
  shiftId: string;
  activeWeekdays: number[];
};

type RosterWizardPreset = {
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
  staffNightRanges?: Record<
    string,
    {
      minNightShiftCount: number;
      maxNightShiftCount: number;
    }
  >;
  staffBlockPreferences?: Record<string, StaffBlockPreference>;
  staffDedicatedBands?: Record<string, CoverageBand | ''>;
  staffCoverageRoleTags?: Record<string, string[]>;
  staffRestrictions?: Record<string, StaffRestrictionDraft>;
  pairRules?: WizardPairRule[];
};

/*
const BUILTIN_ROSTER_WIZARD_PRESETS: RosterWizardPreset[] = [
  {
    id: 'outpatient_weekday_sat_cycle',
    name: '외래 1주5일 / 2주6일',
    description: '1주차 월~금, 2주차 월~토를 반복하는 외래 전용 기본값',
    pattern: WEEKLY_TEMPLATE_PATTERN_VALUE,
    shiftSlotCount: 1,
    startOffset: 0,
    nightShiftCount: 0,
    customPatternSlots: [],
    weeklyTemplateWeeks: [
      { shiftSlot: 1, activeWeekdays: [1, 2, 3, 4, 5] },
      { shiftSlot: 1, activeWeekdays: [1, 2, 3, 4, 5, 6] },
    ],
  },
];

*/
type StaffConfig = {
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

type GeminiRosterStaffPlan = {
  staffId: string;
  modeLabel?: string;
  rationale?: string;
  assignments?: string[];
};

type GeminiTeamAnalysis = {
  teamPurpose?: string;
  workMode?: string;
  includesNight?: boolean;
  reasoning?: string[];
  planningFocus?: string[];
};

type GeminiRosterRecommendation = {
  summary?: string;
  teamAnalysis?: GeminiTeamAnalysis;
  staffPlans?: GeminiRosterStaffPlan[];
  leaveSummary?: string;
  preferredOffSummary?: string;
};

type PlannerResolvedPatternGroup = {
  key: string;
  label: string;
  mode: RosterPatternGroupMode;
  shiftIds: string[];
  rationale: string;
  source: 'profile' | 'auto';
};

type PlannerPatternPreviewGroup = {
  key: string;
  label: string;
  mode: RosterPatternGroupMode;
  count: number;
  source: 'profile' | 'auto' | 'default';
};

type PreviewCell = {
  date: string;
  baseShiftId: string;
  shiftId: string;
  shiftName: string;
  code: string;
  badgeClass: string;
  isManual: boolean;
};

type PreviewRow = {
  staff: StaffMember;
  config: StaffConfig;
  cells: PreviewCell[];
  counts: {
    work: number;
    off: number;
    night: number;
  };
};

type PreviewDailyCoverage = {
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

type StoredStaffNightRangeMap = Record<
  string,
  {
    minNightShiftCount: number;
    maxNightShiftCount: number;
  }
>;

type GeneratedCoveragePlan = {
  staffId: string;
  modeLabel: string;
  rationale: string;
  assignments: string[];
  effectiveMode: RosterPatternGroupMode;
  allowedShiftIds: string[];
  blockedDateSet?: Set<string>;
};

type WizardOffOverride = {
  enabled: boolean;
  offDate: string;
  nextShiftId: string;
};

type WizardNightRangeDraft = {
  minNightShiftCount: number;
  maxNightShiftCount: number;
};

type CoverageBand = 'day' | 'evening' | 'night';

type StaffRestrictionDraft = {
  blockedShiftBands: CoverageBand[];
  blockedWeekdays: number[];
  avoidWeekendWork: boolean;
  avoidHolidayWork: boolean;
  preferWeekendOff: boolean;
  preferHolidayOff: boolean;
  avoidConsecutiveEvening: boolean;
  preferEarlyMonthNight: boolean;
};

type WizardPairRule = {
  id: string;
  primaryStaffId: string;
  secondaryStaffId: string;
  mode: 'together' | 'separate';
  band: 'night' | 'work';
};

type WizardGenerationBasis = 'saved_rule' | 'rotation_only';

type EditableGenerationRuleField =
  | 'name'
  | 'description'
  | 'teamKeywords'
  | 'generationStyle'
  | 'avoidDayAfterNight'
  | 'avoidDayAfterEvening'
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

type StaffPlanningMeta = {
  staff: StaffMember;
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

type RosterFeasibilityIssue = {
  id: string;
  severity: 'blocking' | 'warning';
  targetTestId: string;
  title: string;
  detail: string;
};

type SelectedManualCell = {
  staffId: string;
  date: string;
} | null;

type RosterPlanComparison = {
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

function getDepartmentName(target: StaffMember | null | undefined): string {
  return String(target?.department || (target as Record<string, unknown>)?.team || '');
}

function isManagerOrHigher(user: StaffMember | null | undefined) {
  const position = String(user?.position || '');
  return (
    user?.role === 'admin' ||
    user?.company === 'SY INC.' ||
    user?.permissions?.mso === true ||
    MANAGER_POSITION_KEYWORDS.some((keyword) => position.includes(keyword))
  );
}

function getMonthDates(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  return Array.from(
    { length: daysInMonth },
    (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`
  );
}

function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

function getMonthEndDateKey(monthDates: string[]) {
  return monthDates[monthDates.length - 1] || '';
}

function normalizeStaffBlockPreference(value: unknown): StaffBlockPreference {
  return value === 'short' || value === 'long' || value === 'night_focus' ? value : 'balanced';
}

function buildDefaultStaffRestrictionDraft(): StaffRestrictionDraft {
  return {
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

function buildDepartmentScopeKey(primaryDepartment: string, includedDepartments: string[]) {
  const parts = [String(primaryDepartment || '').trim()]
    .concat(includedDepartments.map((department) => String(department || '').trim()))
    .filter(Boolean)
    .filter((department, index, list) => list.indexOf(department) === index)
    .sort((left, right) => left.localeCompare(right, 'ko'));

  return parts.join('|');
}

function buildDepartmentScopeLabel(primaryDepartment: string, includedDepartments: string[]) {
  const parts = [String(primaryDepartment || '').trim()]
    .concat(includedDepartments.map((department) => String(department || '').trim()))
    .filter(Boolean)
    .filter((department, index, list) => list.indexOf(department) === index);

  if (parts.length <= 1) return parts[0] || '';
  return parts.join(' + ');
}

function getGenerationStyleMeta(style: RosterGenerationStyle) {
  return (
    GENERATION_STYLE_OPTIONS.find((option) => option.value === style) ||
    GENERATION_STYLE_OPTIONS[0]
  );
}

function isStaffNewNurse(staff: StaffMember, referenceDateKey: string) {
  const joinedAt = String(
    staff?.join_date || staff?.joined_at || staff?.hire_date || staff?.start_date || ''
  )
    .trim()
    .slice(0, 10);
  if (!joinedAt || !referenceDateKey) return false;

  const joinedDate = new Date(`${joinedAt}T00:00:00`);
  const referenceDate = new Date(`${referenceDateKey}T00:00:00`);
  if (Number.isNaN(joinedDate.getTime()) || Number.isNaN(referenceDate.getTime())) {
    return false;
  }
  if (joinedDate.getTime() > referenceDate.getTime()) return false;

  let monthDiff =
    (referenceDate.getFullYear() - joinedDate.getFullYear()) * 12 +
    (referenceDate.getMonth() - joinedDate.getMonth());
  if (referenceDate.getDate() < joinedDate.getDate()) {
    monthDiff -= 1;
  }

  return monthDiff >= 0 && monthDiff < NEW_NURSE_TENURE_MONTHS;
}

function buildPreferredOffStorageKey(companyName: string, department: string, month: string) {
  return [
    ROSTER_PREFERRED_OFF_STORAGE_PREFIX,
    companyName || 'all-companies',
    department || 'all-departments',
    month || 'all-months',
  ].join('::');
}

function buildStaffNightRangeStorageKey(companyName: string, department: string) {
  return [
    ROSTER_STAFF_NIGHT_RANGE_STORAGE_PREFIX,
    companyName || 'all-companies',
    department || 'all-departments',
  ].join('::');
}

function normalizeStoredStaffNightRanges(
  value: unknown,
  targetStaffIds: Set<string>,
  days: number
): StoredStaffNightRangeMap {
  if (!value || typeof value !== 'object') return {};

  const normalized: StoredStaffNightRangeMap = {};
  Object.entries(value as Record<string, unknown>).forEach(([staffId, rawValue]) => {
    if (!targetStaffIds.has(staffId) || !rawValue || typeof rawValue !== 'object') return;
    const source = rawValue as Record<string, unknown>;
    const minNightShiftCount = clampNightShiftCount(Number(source.minNightShiftCount) || 0, days);
    const maxNightShiftCount = clampNightShiftCount(Number(source.maxNightShiftCount) || 0, days);

    if (minNightShiftCount <= 0 && maxNightShiftCount <= 0) return;

    normalized[staffId] = {
      minNightShiftCount,
      maxNightShiftCount:
        maxNightShiftCount > 0 ? Math.max(maxNightShiftCount, minNightShiftCount) : 0,
    };
  });

  return normalized;
}

function normalizeAiAssignments(
  assignments: string[] | undefined,
  monthDates: string[],
  validShiftIds: Set<string>
) {
  return monthDates.map((_, index) => {
    const token = Array.isArray(assignments) ? assignments[index] : '';
    if (token === OFF_SHIFT_TOKEN) return OFF_SHIFT_TOKEN;
    if (token && validShiftIds.has(token)) return token;
    return OFF_SHIFT_TOKEN;
  });
}

function normalizeShiftName(name: string) {
  return String(name || '').replace(/\s+/g, '').toLowerCase();
}

const OFFICE_PATTERN_KEYWORDS = [
  '통상',
  '상근',
  '일반',
  '주간',
  '고정',
  'office',
  'weekday',
  'regular',
];

const THREE_SHIFT_PATTERN_KEYWORDS = ['3교대', '3shift', '3-shift'];
const TWO_SHIFT_PATTERN_KEYWORDS = ['2교대', '2shift', '2-shift'];
const TWO_WORK_ONE_OFF_PATTERN_KEYWORDS = ['2일근무1일휴무'];
const ONE_WORK_ONE_OFF_PATTERN_KEYWORDS = ['1일근무1일휴무'];
const DAY_DEDICATED_PATTERN_KEYWORDS = [
  '데이전담',
  '주간전담',
  '주간고정',
  'daydedicated',
  'dayfixed',
  'dayonly',
];
const EVENING_DEDICATED_PATTERN_KEYWORDS = [
  '이브전담',
  '이브닝전담',
  '이브고정',
  'eveningdedicated',
  'eveningfixed',
  'evefixed',
  'eveonly',
];
const NIGHT_DEDICATED_PATTERN_KEYWORDS = [
  '나이트전담',
  '야간전담',
  '야간고정',
  'nightdedicated',
  'nightfixed',
  'nightonly',
];
const FIXED_PATTERN_KEYWORDS = ['전담', '고정', 'fixed', 'dedicated', 'only'];
const MANAGEMENT_TEAM_KEYWORDS = ['관리팀', '시설관리', '환경관리'];
const WARD_TEAM_KEYWORDS = ['병동', '입원', '간호', 'ward'];
const OUTPATIENT_TEAM_KEYWORDS = ['외래', '검사', '원무', 'opd', 'outpatient'];
const OFFICE_TEAM_KEYWORDS = ['총무', '수술', '행정', '경영지원', '인사', '재무', '구매'];
const NUTRITION_TEAM_KEYWORDS = ['영양', '식당', '조리', 'nutrition', 'kitchen'];
const MANAGEMENT_SHIFT_KEYWORDS = ['관리사', '시설관리'];
const WARD_SHIFT_KEYWORDS = ['병동', 'ward'];
const OUTPATIENT_SHIFT_KEYWORDS = ['외래', '검사', '원무', 'opd', 'outpatient'];
const OFFICE_SHIFT_KEYWORDS = ['통상', '상근', '일반', '주간', 'regular', 'office'];
const NUTRITION_SHIFT_KEYWORDS = ['영양', '식당', '조리', 'meal', 'kitchen', 'cafeteria'];

function hasPatternKeyword(sources: Array<string | null | undefined>, keywords: string[]) {
  return sources
    .map((source) => normalizeShiftName(source ?? ''))
    .filter(Boolean)
    .some((source) =>
      keywords.some((keyword) => source.includes(normalizeShiftName(keyword)))
    );
}

function resolveShiftBand(shift: WorkShift) {
  const normalized = normalizeShiftName(shift.name);
  const startHour = Number(String(shift.start_time || '').slice(0, 2) || '0');

  if (
    normalized.includes('night') ||
    normalized.includes('나이트') ||
    normalized.includes('야간') ||
    startHour >= 20 ||
    startHour <= 4
  ) {
    return 'night';
  }

  if (
    normalized.includes('evening') ||
    normalized.includes('eve') ||
    normalized.includes('이브') ||
    normalized.includes('오후') ||
    (startHour >= 12 && startHour < 20)
  ) {
    return 'evening';
  }

  return 'day';
}

function getShiftSearchText(shift: WorkShift) {
  return normalizeShiftName(
    [shift.name, shift.shift_type, shift.description].filter(Boolean).join(' ')
  );
}

function filterShiftsByKeywords(shifts: WorkShift[], keywords: string[]) {
  return shifts.filter((shift) => {
    const searchText = getShiftSearchText(shift);
    return keywords.some((keyword) => searchText.includes(normalizeShiftName(keyword)));
  });
}

function dedupeShiftIds(shifts: WorkShift[]) {
  return shifts
    .map((shift) => shift.id)
    .filter((shiftId, index, list) => list.indexOf(shiftId) === index);
}

function getTeamRecommendationCategory(department: string) {
  const normalizedDepartment = normalizeShiftName(department);

  if (
    MANAGEMENT_TEAM_KEYWORDS.some((keyword) =>
      normalizedDepartment.includes(normalizeShiftName(keyword))
    )
  ) {
    return 'management';
  }

  if (
    WARD_TEAM_KEYWORDS.some((keyword) =>
      normalizedDepartment.includes(normalizeShiftName(keyword))
    )
  ) {
    return 'ward';
  }

  if (
    OUTPATIENT_TEAM_KEYWORDS.some((keyword) =>
      normalizedDepartment.includes(normalizeShiftName(keyword))
    )
  ) {
    return 'outpatient';
  }

  if (
    OFFICE_TEAM_KEYWORDS.some((keyword) =>
      normalizedDepartment.includes(normalizeShiftName(keyword))
    )
  ) {
    return 'office';
  }

  if (
    NUTRITION_TEAM_KEYWORDS.some((keyword) =>
      normalizedDepartment.includes(normalizeShiftName(keyword))
    )
  ) {
    return 'nutrition';
  }

  return 'general';
}

function getDefaultPlannerMode(
  teamRecommendationCategory: ReturnType<typeof getTeamRecommendationCategory>
): RosterPatternGroupMode {
  if (teamRecommendationCategory === 'management' || teamRecommendationCategory === 'outpatient') {
    return 'day_fixed';
  }

  return 'rotation';
}

function recommendShiftIdsForTeam(department: string, shifts: WorkShift[]) {
  const category = getTeamRecommendationCategory(department);
  const dayShifts = shifts.filter((shift) => resolveShiftBand(shift) === 'day');
  const weekdayDayShifts = dayShifts.filter(
    (shift) => resolveConfiguredWorkDayMode(shift) === 'weekdays'
  );
  const managementShifts = filterShiftsByKeywords(shifts, MANAGEMENT_SHIFT_KEYWORDS);
  const wardShifts = filterShiftsByKeywords(shifts, WARD_SHIFT_KEYWORDS);
  const outpatientShifts = filterShiftsByKeywords(shifts, OUTPATIENT_SHIFT_KEYWORDS);
  const officeShifts = filterShiftsByKeywords(shifts, OFFICE_SHIFT_KEYWORDS);
  const nutritionShifts = filterShiftsByKeywords(shifts, NUTRITION_SHIFT_KEYWORDS);
  const allDayCycleShifts = shifts.filter(
    (shift) =>
      resolveConfiguredWorkDayMode(shift) === 'all_days' ||
      hasPatternKeyword([shift.name, shift.shift_type, shift.description], THREE_SHIFT_PATTERN_KEYWORDS)
  );

  if (category === 'management') {
    return dedupeShiftIds(managementShifts);
  }

  if (category === 'ward') {
    if (wardShifts.length > 0) return dedupeShiftIds(wardShifts);
    if (allDayCycleShifts.length > 0) return dedupeShiftIds(allDayCycleShifts);
    return [];
  }

  if (category === 'outpatient') {
    if (outpatientShifts.length > 0) return dedupeShiftIds(outpatientShifts);
    if (weekdayDayShifts.length > 0) return dedupeShiftIds(weekdayDayShifts);
    return [];
  }

  if (category === 'office') {
    if (officeShifts.length > 0) return dedupeShiftIds(officeShifts);
    if (weekdayDayShifts.length > 0) return dedupeShiftIds(weekdayDayShifts);
    return [];
  }

  if (category === 'nutrition') {
    if (nutritionShifts.length > 0) return dedupeShiftIds(nutritionShifts);
    if (weekdayDayShifts.length > 0) return dedupeShiftIds(weekdayDayShifts);
    return [];
  }

  if (weekdayDayShifts.length > 0) return dedupeShiftIds(weekdayDayShifts);
  return dedupeShiftIds(shifts);
}

function resolveConfiguredWorkDayMode(shift?: WorkShift | null) {
  if (!shift) return 'weekdays';
  if (String(shift.shift_type || '').includes('3교대')) return 'all_days';
  if (shift.is_weekend_work || Number(shift.weekly_work_days) >= 7) return 'all_days';

  const description = String(shift.description || '');
  const markerIndex = description.lastIndexOf(SHIFT_META_MARKER);
  if (markerIndex === -1) return 'weekdays';

  try {
    const parsedMeta = JSON.parse(description.slice(markerIndex + SHIFT_META_MARKER.length).trim());
    return parsedMeta?.work_day_mode === 'all_days' ? 'all_days' : 'weekdays';
  } catch {
    return 'weekdays';
  }
}

function pickShiftByKeywords(shifts: WorkShift[], keywords: string[]) {
  return shifts.find((shift) => keywords.some((keyword) => normalizeShiftName(shift.name).includes(keyword)));
}

function sortShifts(shifts: WorkShift[]) {
  return [...shifts].sort((a, b) => {
    const aTime = String(a.start_time || '99:99').slice(0, 5);
    const bTime = String(b.start_time || '99:99').slice(0, 5);
    return aTime.localeCompare(bTime);
  });
}

function buildProgrammaticCycle(
  mode: RosterPatternGroupMode,
  shiftIds: string[],
  shiftMap: Map<string, WorkShift>
) {
  const sortedShiftIds = sortShifts(
    shiftIds.map((shiftId) => shiftMap.get(shiftId)).filter((shift): shift is WorkShift => Boolean(shift))
  ).map((shift) => shift.id);

  if (sortedShiftIds.length === 0) return [OFF_SHIFT_TOKEN];

  const primaryShiftId = sortedShiftIds[0];
  const eveningShiftId =
    sortedShiftIds.find((shiftId) => resolveShiftBand(shiftMap.get(shiftId)!) === 'evening') ||
    primaryShiftId;
  const nightShiftId =
    sortedShiftIds.find((shiftId) => resolveShiftBand(shiftMap.get(shiftId)!) === 'night') ||
    primaryShiftId;

  if (mode === 'day_fixed') {
    return [primaryShiftId, primaryShiftId, primaryShiftId, primaryShiftId, primaryShiftId, OFF_SHIFT_TOKEN, OFF_SHIFT_TOKEN];
  }

  if (mode === 'night_fixed') {
    return [nightShiftId, nightShiftId, OFF_SHIFT_TOKEN, OFF_SHIFT_TOKEN];
  }

  if (mode === 'evening_fixed') {
    return [eveningShiftId, eveningShiftId, OFF_SHIFT_TOKEN, OFF_SHIFT_TOKEN];
  }

  const hasNightShift = sortedShiftIds.some(
    (shiftId) => resolveShiftBand(shiftMap.get(shiftId)!) === 'night'
  );
  return [...sortedShiftIds, OFF_SHIFT_TOKEN, ...(hasNightShift ? [OFF_SHIFT_TOKEN] : [])];
}

function buildProgrammaticAssignments({
  monthDates,
  shiftMap,
  cycle,
  staffIndex,
  mode,
  blockedDateSet,
  teamDailyBandCounts,
}: {
  monthDates: string[];
  shiftMap: Map<string, WorkShift>;
  cycle: string[];
  staffIndex: number;
  mode: RosterPatternGroupMode;
  blockedDateSet?: Set<string>;
  teamDailyBandCounts?: Array<Record<'day' | 'evening' | 'night', number>>;
}) {
  const cycleLength = Math.max(cycle.length, 1);
  const offset = staffIndex % cycleLength;

  return monthDates.map((date, index) => {
    if (blockedDateSet?.has(date)) return OFF_SHIFT_TOKEN;

    const token = cycle[(index + offset) % cycleLength] || OFF_SHIFT_TOKEN;
    if (token === OFF_SHIFT_TOKEN) return OFF_SHIFT_TOKEN;

    const shift = shiftMap.get(token);
    if (!shift) return OFF_SHIFT_TOKEN;

    const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
    if (resolveConfiguredWorkDayMode(shift) === 'weekdays' && (dayOfWeek === 0 || dayOfWeek === 6)) {
      return OFF_SHIFT_TOKEN;
    }

    const assignedBand = resolveShiftBand(shift);
    if (assignedBand && teamDailyBandCounts?.[index]) {
      teamDailyBandCounts[index][assignedBand] += 1;
    }

    return token;
  });
}

function getRosterModeGenerationPriority(mode: RosterPatternGroupMode) {
  switch (mode) {
    case 'day_fixed':
      return 0;
    case 'evening_fixed':
      return 1;
    case 'night_fixed':
      return 2;
    case 'rotation':
      return 3;
    default:
      return 4;
  }
}

function getAssignedShiftBand(token: string, shiftMap: Map<string, WorkShift>) {
  if (!token || token === OFF_SHIFT_TOKEN) return null;
  const shift = shiftMap.get(token);
  if (!shift) return null;
  return resolveShiftBand(shift);
}

function isSeniorPlannerStaff(staff: StaffMember) {
  const sources = [
    String(staff.position || ''),
    String(staff.role || ''),
    String(staff.job_title || ''),
  ].map((value) => normalizeShiftName(value));
  const keywords = ['수간호사', '책임', '파트장', '팀장', '부장', '과장', 'senior', 'charge', 'leader'];
  return keywords.some((keyword) => sources.some((source) => source.includes(normalizeShiftName(keyword))));
}

function getDedicatedBandFromMode(mode?: RosterPatternGroupMode | null): CoverageBand | null {
  if (mode === 'day_fixed') return 'day';
  if (mode === 'evening_fixed') return 'evening';
  if (mode === 'night_fixed') return 'night';
  return null;
}

function getFixedModeFromDedicatedBand(band?: string | null): RosterPatternGroupMode | null {
  if (band === 'day') return 'day_fixed';
  if (band === 'evening') return 'evening_fixed';
  if (band === 'night') return 'night_fixed';
  return null;
}

function getRoleCoverageTargetByBand(
  roleRule: Pick<
    RosterGenerationRule['roleCoverageRules'][number],
    'minDayStaff' | 'minEveningStaff' | 'minNightStaff'
  >,
  band: CoverageBand
) {
  if (band === 'day') return Number(roleRule.minDayStaff || 0);
  if (band === 'evening') return Number(roleRule.minEveningStaff || 0);
  return Number(roleRule.minNightStaff || 0);
}

function coverageRoleMatchesRule(
  coverageRoleMatcherText: string,
  roleRule: Pick<RosterGenerationRule['roleCoverageRules'][number], 'keywords'>
) {
  const normalizedText = normalizeShiftName(coverageRoleMatcherText);
  return normalizeCoverageRoleTags(roleRule.keywords).some((keyword) =>
    normalizedText.includes(normalizeShiftName(keyword))
  );
}

function buildPlannerCoverageRoleMatcherText(staff: StaffMember, coverageRoleTags: string[]) {
  return normalizeShiftName(
    [
      String(staff.name || ''),
      String(staff.position || ''),
      String(staff.role || ''),
      String(getDepartmentName(staff) || ''),
      String(staff.shift_type || ''),
      String(staff.shift_id || ''),
      coverageRoleTags.join(' '),
    ]
      .filter(Boolean)
      .join(' ')
  );
}

function canStaffCoverBand(meta: StaffPlanningMeta, band: CoverageBand) {
  return !meta.dedicatedBand || meta.dedicatedBand === band;
}

function isNightRecoverySlot(
  assignments: string[],
  index: number,
  shiftMap: Map<string, WorkShift>,
  recoveryDays: number
) {
  const maxRecoveryDays = Math.max(0, Math.floor(recoveryDays || 0));
  if (maxRecoveryDays <= 0) return false;

  for (let offset = 1; offset <= maxRecoveryDays; offset += 1) {
    const previousIndex = index - offset;
    if (previousIndex < 0) break;
    const band = getAssignedShiftBand(assignments[previousIndex] || '', shiftMap);
    if (band === 'night') return true;
    if (band) return false;
  }

  return false;
}

function wouldViolateNightRecoveryWindow(
  assignments: string[],
  index: number,
  nextShiftId: string,
  shiftMap: Map<string, WorkShift>,
  recoveryDays: number
) {
  const maxRecoveryDays = Math.max(0, Math.floor(recoveryDays || 0));
  if (maxRecoveryDays <= 0 || !nextShiftId || nextShiftId === OFF_SHIFT_TOKEN) {
    return false;
  }

  const nextBand = getAssignedShiftBand(nextShiftId, shiftMap);
  if (!nextBand) {
    return false;
  }

  if (nextBand !== 'night') {
    return isNightRecoverySlot(assignments, index, shiftMap, maxRecoveryDays);
  }

  let recoveryStartIndex = index + 1;
  while (recoveryStartIndex < assignments.length) {
    const followingBand = getAssignedShiftBand(assignments[recoveryStartIndex] || '', shiftMap);
    if (followingBand === 'night') {
      recoveryStartIndex += 1;
      continue;
    }
    break;
  }

  for (
    let recoveryIndex = recoveryStartIndex;
    recoveryIndex < assignments.length && recoveryIndex < recoveryStartIndex + maxRecoveryDays;
    recoveryIndex += 1
  ) {
    const band = getAssignedShiftBand(assignments[recoveryIndex] || '', shiftMap);
    if (band) {
      return true;
    }
  }

  return false;
}

function enforceNightRecoveryAssignments(
  assignments: string[],
  shiftMap: Map<string, WorkShift>,
  recoveryDays: number
) {
  const maxRecoveryDays = Math.max(0, Math.floor(recoveryDays || 0));
  const nextAssignments = [...assignments];

  if (maxRecoveryDays <= 0) {
    return nextAssignments.map((token) => token || OFF_SHIFT_TOKEN);
  }

  for (let index = 0; index < nextAssignments.length; index += 1) {
    const band = getAssignedShiftBand(nextAssignments[index] || '', shiftMap);
    if (band !== 'night') continue;

    const nextBand = getAssignedShiftBand(nextAssignments[index + 1] || '', shiftMap);
    if (nextBand === 'night') continue;

    for (let offset = 1; offset <= maxRecoveryDays; offset += 1) {
      const recoveryIndex = index + offset;
      if (recoveryIndex >= nextAssignments.length) break;
      nextAssignments[recoveryIndex] = OFF_SHIFT_TOKEN;
    }
  }

  return nextAssignments.map((token) => token || OFF_SHIFT_TOKEN);
}

function countPreviousBandStreak(
  assignments: string[],
  index: number,
  shiftMap: Map<string, WorkShift>
) {
  if (index <= 0) return 0;

  const previousBand = getAssignedShiftBand(assignments[index - 1], shiftMap);
  if (!previousBand) return 0;

  let streak = 0;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (getAssignedShiftBand(assignments[cursor], shiftMap) !== previousBand) {
      break;
    }
    streak += 1;
  }

  return streak;
}

function getRotationBandContinuityTarget({
  staffIndex,
  blockStartIndex,
  band,
  maxConsecutiveWorkDays,
  generationStyle,
  blockPreference,
}: {
  staffIndex: number;
  blockStartIndex: number;
  band: CoverageBand;
  maxConsecutiveWorkDays: number;
  generationStyle: RosterGenerationStyle;
  blockPreference?: StaffBlockPreference;
}) {
  const targetPool =
    generationStyle === 'variety'
      ? band === 'night'
        ? [1, 1, 2, 2, 3]
        : [1, 1, 2, 2, 3, 4]
      : generationStyle === 'block'
        ? band === 'night'
          ? [2, 3, 3, 4, 4]
          : [2, 3, 4, 4, 5]
        : generationStyle === 'stable'
          ? band === 'night'
            ? [2, 2, 3, 3, 4]
            : [2, 3, 3, 4, 5]
          : band === 'night'
            ? [1, 2, 3, 4]
            : [1, 2, 3, 4, 5];
  const seed =
    Math.abs(staffIndex * 17 + blockStartIndex * 13 + (band === 'day' ? 3 : band === 'evening' ? 5 : 7));
  let target = targetPool[seed % targetPool.length] || 1;

  if (blockPreference === 'short') {
    target = Math.min(target, band === 'night' ? 2 : 3);
  } else if (blockPreference === 'long') {
    target = Math.max(target, band === 'night' ? 3 : 4);
  } else if (blockPreference === 'night_focus' && band === 'night') {
    target = Math.max(target, 3);
  }

  return Math.max(1, Math.min(maxConsecutiveWorkDays, target));
}

function countPreviousWorkStreak(assignments: string[], index: number) {
  if (index <= 0) return 0;

  let streak = 0;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (!assignments[cursor] || assignments[cursor] === OFF_SHIFT_TOKEN) {
      break;
    }
    streak += 1;
  }

  return streak;
}

function countNextWorkStreak(assignments: string[], index: number) {
  if (index >= assignments.length - 1) return 0;

  let streak = 0;
  for (let cursor = index + 1; cursor < assignments.length; cursor += 1) {
    if (!assignments[cursor] || assignments[cursor] === OFF_SHIFT_TOKEN) {
      break;
    }
    streak += 1;
  }

  return streak;
}

function countPreviousTaggedWorkStreak(
  assignments: string[],
  monthDates: string[],
  index: number,
  isTaggedDate: (dateKey: string) => boolean
) {
  if (index <= 0) return 0;
  if (!isTaggedDate(monthDates[index] || '')) return 0;

  let streak = 0;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const dateKey = monthDates[cursor] || '';
    if (!isTaggedDate(dateKey)) {
      break;
    }
    if (!assignments[cursor] || assignments[cursor] === OFF_SHIFT_TOKEN) {
      break;
    }
    streak += 1;
  }

  return streak;
}

function canStillMeetMinimumStaffing({
  projectedCounts,
  minStaffingTargets,
  remainingStaff,
}: {
  projectedCounts: Record<'day' | 'evening' | 'night', number>;
  minStaffingTargets: Record<'day' | 'evening' | 'night', number>;
  remainingStaff: number;
}) {
  const requiredRemaining =
    Math.max(0, minStaffingTargets.day - projectedCounts.day) +
    Math.max(0, minStaffingTargets.evening - projectedCounts.evening) +
    Math.max(0, minStaffingTargets.night - projectedCounts.night);

  return requiredRemaining <= remainingStaff;
}

function isWeekendDateKey(dateKey: string) {
  const weekday = new Date(`${dateKey}T00:00:00`).getDay();
  return weekday === 0 || weekday === 6;
}

function normalizeBlockedShiftBands(value: unknown): CoverageBand[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter((entry): entry is CoverageBand => entry === 'day' || entry === 'evening' || entry === 'night')
    .filter((entry, index, list) => list.indexOf(entry) === index);
}

function normalizeBlockedWeekdays(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 6)
    .filter((entry, index, list) => list.indexOf(entry) === index)
    .sort((left, right) => left - right);
}

function buildStaffRestrictionBlockedDateSet(config: StaffConfig, monthDates: string[]) {
  const blocked = new Set<string>();
  const blockedWeekdays = new Set(normalizeBlockedWeekdays(config.blockedWeekdays || []));

  monthDates.forEach((dateKey) => {
    const weekday = new Date(`${dateKey}T00:00:00`).getDay();
    if (blockedWeekdays.has(weekday)) {
      blocked.add(dateKey);
      return;
    }
    if (config.avoidWeekendWork && isWeekendDateKey(dateKey)) {
      blocked.add(dateKey);
      return;
    }
    if (config.avoidHolidayWork && isKoreanPublicHoliday(dateKey)) {
      blocked.add(dateKey);
    }
  });

  return blocked;
}

function getCoverageTargetsForDate(rule: RosterGenerationRule, dateKey: string) {
  const baseTargets: Record<'day' | 'evening' | 'night', number> = {
    day: Math.max(0, Math.floor(rule.minDayStaff || 0)),
    evening: Math.max(0, Math.floor(rule.minEveningStaff || 0)),
    night: Math.max(0, Math.floor(rule.minNightStaff || 0)),
  };
  const specificOverride = (rule.dateCoverageOverrides || []).find((entry) => entry.date === dateKey);
  if (specificOverride) {
    return {
      targets: {
        day: Math.max(0, Math.floor(specificOverride.minDayStaff || 0)),
        evening: Math.max(0, Math.floor(specificOverride.minEveningStaff || 0)),
        night: Math.max(0, Math.floor(specificOverride.minNightStaff || 0)),
      } satisfies Record<'day' | 'evening' | 'night', number>,
      sourceLabel: `${dateKey} override`,
    };
  }

  const row = { diversityScore: 100 };
  const averageDiversity = 100;
  const notes: string[] = [];

  if (isKoreanPublicHoliday(dateKey)) {
    const hasHolidayOverride =
      (rule.holidayMinDayStaff || 0) > 0 ||
      (rule.holidayMinEveningStaff || 0) > 0 ||
      (rule.holidayMinNightStaff || 0) > 0;
    if (hasHolidayOverride) {
      if (row.diversityScore < Math.max(45, averageDiversity - 12)) notes.push('패턴 반복 높음');

      return {
        targets: {
          day: Math.max(0, Math.floor(rule.holidayMinDayStaff || 0)),
          evening: Math.max(0, Math.floor(rule.holidayMinEveningStaff || 0)),
          night: Math.max(0, Math.floor(rule.holidayMinNightStaff || 0)),
        } satisfies Record<'day' | 'evening' | 'night', number>,
        sourceLabel: 'holiday override',
      };
    }
  }

  if (isWeekendDateKey(dateKey)) {
    const hasWeekendOverride =
      (rule.weekendMinDayStaff || 0) > 0 ||
      (rule.weekendMinEveningStaff || 0) > 0 ||
      (rule.weekendMinNightStaff || 0) > 0;
    if (hasWeekendOverride) {
      return {
        targets: {
          day: Math.max(0, Math.floor(rule.weekendMinDayStaff || 0)),
          evening: Math.max(0, Math.floor(rule.weekendMinEveningStaff || 0)),
          night: Math.max(0, Math.floor(rule.weekendMinNightStaff || 0)),
        } satisfies Record<'day' | 'evening' | 'night', number>,
        sourceLabel: 'weekend override',
      };
    }
  }

  return {
    targets: baseTargets,
    sourceLabel: 'base rule',
  };
}

function buildFallbackGenerationRuleForDepartment(
  department: string,
  companyName: string,
  days: number
) {
  const category = getTeamRecommendationCategory(department);
  const baseRule = buildDefaultGenerationRule(companyName);

  return {
    ...baseRule,
    name: '',
    teamKeywords: department ? [department] : [],
    minRotationNightCount: category === 'ward' ? Math.max(3, Math.round(days / 7)) : 0,
    maxRotationNightCount: category === 'ward' ? Math.max(4, Math.round(days / 5)) : 0,
    maxConsecutiveEveningShifts: 0,
    offDaysAfterNight: category === 'ward' ? 1 : 0,
    nightBlockSize: category === 'ward' ? 4 : 1,
    maxConsecutiveWorkDays: category === 'ward' ? 5 : 6,
    maxConsecutiveWeekendWorkDays: category === 'ward' ? 2 : 0,
    distributeWeekendShifts: category === 'ward',
    distributeHolidayShifts: category === 'ward',
    separateNewNursesByShift: category === 'ward',
    minDayStaff: category === 'ward' ? 1 : 0,
    minEveningStaff: category === 'ward' ? 1 : 0,
    minNightStaff: category === 'ward' ? 1 : 0,
  };
}

function applyWardCoverageDefaults(rule: RosterGenerationRule, department: string) {
  if (getTeamRecommendationCategory(department) !== 'ward') {
    return rule;
  }

  return {
    ...rule,
    minDayStaff: Math.max(1, Math.floor(rule.minDayStaff || 0)),
    minEveningStaff: Math.max(1, Math.floor(rule.minEveningStaff || 0)),
    minNightStaff: Math.max(1, Math.floor(rule.minNightStaff || 0)),
  };
}

function enforceTeamMinimumCoverage({
  staffPlans,
  monthDates,
  shiftMap,
  rule,
}: {
  staffPlans: GeneratedCoveragePlan[];
  monthDates: string[];
  shiftMap: Map<string, WorkShift>;
  rule: RosterGenerationRule;
}) {
  const hasAnyMinimum = monthDates.some((dateKey) => {
    const { targets } = getCoverageTargetsForDate(rule, dateKey);
    return targets.day + targets.evening + targets.night > 0;
  });

  if (!hasAnyMinimum || staffPlans.length === 0) {
    return staffPlans;
  }

  const nextPlans = staffPlans.map((plan) => ({
    ...plan,
    assignments: [...plan.assignments],
  }));
  const weekendDateSet = new Set(
    monthDates.filter((date) => {
      const weekday = new Date(`${date}T00:00:00`).getDay();
      return weekday === 0 || weekday === 6;
    })
  );
  const holidayDateSet = new Set(monthDates.filter((date) => isKoreanPublicHoliday(date)));

  monthDates.forEach((_, dateIndex) => {
    const dateKey = monthDates[dateIndex] || '';
    const { targets: minTargets } = getCoverageTargetsForDate(rule, dateKey);
    const isWeekend = weekendDateSet.has(dateKey);
    const isHoliday = holidayDateSet.has(dateKey);
    const currentCounts = buildEmptyCoverageCounts();

    nextPlans.forEach((plan) => {
      const band = getAssignedShiftBand(plan.assignments[dateIndex] || '', shiftMap);
      if (band) currentCounts[band] += 1;
    });

    (['day', 'evening', 'night'] as const).forEach((targetBand) => {
      while (currentCounts[targetBand] < minTargets[targetBand]) {
        const candidate = nextPlans
          .map((plan) => {
            const targetShiftId = plan.allowedShiftIds.find(
              (shiftId) => resolveShiftBand(shiftMap.get(shiftId)!) === targetBand
            );
            if (
              !targetShiftId ||
              !canAssignPlanShiftAtDate({
                plan,
                dateIndex,
                nextShiftId: targetShiftId,
                monthDates,
                shiftMap,
                rule,
              })
            ) {
              return null;
            }

            const currentToken = plan.assignments[dateIndex] || OFF_SHIFT_TOKEN;
            const currentBand = getAssignedShiftBand(currentToken, shiftMap);
            const isOff = currentToken === OFF_SHIFT_TOKEN;
            const canSwapFromCurrentBand =
              currentBand !== null && currentCounts[currentBand] > minTargets[currentBand];
            if (!isOff && !canSwapFromCurrentBand) return null;

            return {
              plan,
              targetShiftId,
              currentBand,
              priority:
                plan.effectiveMode === 'rotation'
                  ? isOff
                    ? 0
                    : 1
                  : isOff
                    ? 2
                    : 3,
              weekendLoad: isWeekend
                ? plan.assignments.filter(
                    (token, assignmentIndex) =>
                      token !== OFF_SHIFT_TOKEN && weekendDateSet.has(monthDates[assignmentIndex] || '')
                  ).length
                : 0,
              holidayLoad: isHoliday
                ? plan.assignments.filter(
                    (token, assignmentIndex) =>
                      token !== OFF_SHIFT_TOKEN && holidayDateSet.has(monthDates[assignmentIndex] || '')
                  ).length
                : 0,
            };
          })
          .filter(
            (
              item
            ): item is {
              plan: GeneratedCoveragePlan & { assignments: string[] };
              targetShiftId: string;
              currentBand: 'day' | 'evening' | 'night' | null;
              priority: number;
              weekendLoad: number;
              holidayLoad: number;
            } => Boolean(item)
          )
          .sort((left, right) => {
            if (left.priority !== right.priority) return left.priority - right.priority;
            if (left.weekendLoad !== right.weekendLoad) return left.weekendLoad - right.weekendLoad;
            if (left.holidayLoad !== right.holidayLoad) return left.holidayLoad - right.holidayLoad;
            return left.plan.staffId.localeCompare(right.plan.staffId);
          })[0];

        if (!candidate) {
          break;
        }

        if (candidate.currentBand) {
          currentCounts[candidate.currentBand] = Math.max(0, currentCounts[candidate.currentBand] - 1);
        }
        candidate.plan.assignments[dateIndex] = candidate.targetShiftId;
        currentCounts[targetBand] += 1;

        const blockedBandDates: string[] = [];
        const blockedWeekdayDates: string[] = [];
        const weekendDates: string[] = [];
        const holidayDates: string[] = [];
        const restrictionFragments: string[] = [];
        const items: Array<{
          id: string;
          category: 'restriction';
          tone: 'amber';
          severity: number;
          targetTestId: string;
          title: string;
          detail: string;
        }> = [];
        const row = {
          staff: {
            id: '',
            name: '',
          },
        };
      }

      const blockedBandDates: string[] = [];
      const blockedWeekdayDates: string[] = [];
      const weekendDates: string[] = [];
      const holidayDates: string[] = [];
      const restrictionFragments: string[] = [];
      const items: Array<{
        id: string;
        category: 'restriction';
        tone: 'amber';
        severity: number;
        targetTestId: string;
        title: string;
        detail: string;
      }> = [];
      const row = {
        staff: {
          id: '',
          name: '',
        },
      };



      if (blockedBandDates.length > 0) {
        restrictionFragments.push(`금지 시간대 ${summarizeRosterDateLabels(blockedBandDates)}`);
      }
      if (blockedWeekdayDates.length > 0) {
        restrictionFragments.push(`금지 요일 ${summarizeRosterDateLabels(blockedWeekdayDates)}`);
      }
      if (weekendDates.length > 0) {
        restrictionFragments.push(`주말 근무 ${summarizeRosterDateLabels(weekendDates)}`);
      }
      if (holidayDates.length > 0) {
        restrictionFragments.push(`공휴일 근무 ${summarizeRosterDateLabels(holidayDates)}`);
      }

      if (restrictionFragments.length > 0) {
        items.push({
          id: `restriction-${row.staff.id}`,
          category: 'restriction',
          tone: 'amber',
          severity: 2,
          targetTestId: `roster-preview-row-${row.staff.id}`,
          title: `${row.staff.name} 개인 제한 위반`,
          detail: restrictionFragments.join(' · '),
        });
      }
    });
  });

  return nextPlans;
}

function enforceMinimumMonthlyOffDays({
  staffPlans,
  monthDates,
  shiftMap,
  rule,
}: {
  staffPlans: GeneratedCoveragePlan[];
  monthDates: string[];
  shiftMap: Map<string, WorkShift>;
  rule: RosterGenerationRule;
}) {
  const minimumOffDays = Math.max(
    0,
    Math.min(monthDates.length, Math.floor(rule.minMonthlyOffDays || 0))
  );
  if (minimumOffDays === 0 || staffPlans.length === 0) {
    return staffPlans;
  }

  const weekendDateSet = new Set(
    monthDates.filter((date) => {
      const weekday = new Date(`${date}T00:00:00`).getDay();
      return weekday === 0 || weekday === 6;
    })
  );
  const holidayDateSet = new Set(monthDates.filter((date) => isKoreanPublicHoliday(date)));
  const nextPlans = staffPlans.map((plan) => ({
    ...plan,
    assignments: [...plan.assignments],
  }));
  const dailyCounts = monthDates.map(() => buildEmptyCoverageCounts());

  nextPlans.forEach((plan) => {
    plan.assignments.forEach((token, dateIndex) => {
      const band = getAssignedShiftBand(token, shiftMap);
      if (band) {
        dailyCounts[dateIndex][band] += 1;
      }
    });
  });

  nextPlans.forEach((plan) => {
    let currentOffDays = plan.assignments.reduce(
      (count, token) => count + (!token || token === OFF_SHIFT_TOKEN ? 1 : 0),
      0
    );
    if (currentOffDays >= minimumOffDays) {
      return;
    }

    const candidateIndexes = plan.assignments
      .map((token, dateIndex) => {
        if (!token || token === OFF_SHIFT_TOKEN) return null;

        const band = getAssignedShiftBand(token, shiftMap);
        if (!band) return null;
        const { targets: minTargets } = getCoverageTargetsForDate(rule, monthDates[dateIndex] || '');
        if (dailyCounts[dateIndex][band] <= minTargets[band]) return null;

        const dateKey = monthDates[dateIndex] || '';
        return {
          dateIndex,
          band,
          isWeekend: weekendDateSet.has(dateKey),
          isHoliday: holidayDateSet.has(dateKey),
          surplus: dailyCounts[dateIndex][band] - minTargets[band],
          streak:
            countPreviousWorkStreak(plan.assignments, dateIndex) +
            1 +
            countNextWorkStreak(plan.assignments, dateIndex),
        };
      })
      .filter(
        (
          item
        ): item is {
          dateIndex: number;
          band: 'day' | 'evening' | 'night';
          isWeekend: boolean;
          isHoliday: boolean;
          surplus: number;
          streak: number;
        } => Boolean(item)
      )
      .sort((left, right) => {
        if (left.isHoliday !== right.isHoliday) return left.isHoliday ? -1 : 1;
        if (left.isWeekend !== right.isWeekend) return left.isWeekend ? -1 : 1;
        if (left.surplus !== right.surplus) return right.surplus - left.surplus;
        if (left.streak !== right.streak) return right.streak - left.streak;
        return left.dateIndex - right.dateIndex;
      });

    for (const candidate of candidateIndexes) {
      if (currentOffDays >= minimumOffDays) {
        break;
      }

      const currentToken = plan.assignments[candidate.dateIndex] || OFF_SHIFT_TOKEN;
      const currentBand = getAssignedShiftBand(currentToken, shiftMap);
      if (!currentBand) {
        continue;
      }
      const { targets: minTargets } = getCoverageTargetsForDate(
        rule,
        monthDates[candidate.dateIndex] || ''
      );
      if (dailyCounts[candidate.dateIndex][currentBand] <= minTargets[currentBand]) {
        continue;
      }

      plan.assignments[candidate.dateIndex] = OFF_SHIFT_TOKEN;
      dailyCounts[candidate.dateIndex][currentBand] = Math.max(
        0,
        dailyCounts[candidate.dateIndex][currentBand] - 1
      );
      currentOffDays += 1;
    }
  });

  return nextPlans;
}

function buildRuleAwareRotationAssignments({
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
        assignments[index] = OFF_SHIFT_TOKEN;
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
        assignments[dayIndex] = OFF_SHIFT_TOKEN;
      }
    });
  }

  const bandCounts: Record<'day' | 'evening' | 'night', number> = {
    day: 0,
    evening: 0,
    night: assignments.filter((token) => token === nightShiftId).length,
  };
  let weekendWorkCount = assignments.reduce((count, token, index) => {
    if (!token || token === OFF_SHIFT_TOKEN) return count;
    const dayOfWeek = new Date(`${monthDates[index]}T00:00:00`).getDay();
    return dayOfWeek === 0 || dayOfWeek === 6 ? count + 1 : count;
  }, 0);
  let holidayWorkCount = assignments.reduce((count, token, index) => {
    if (!token || token === OFF_SHIFT_TOKEN) return count;
    return holidayDateSet?.has(monthDates[index]) ? count + 1 : count;
  }, 0);

  const preferredFillOrder =
    rule.balanceRotationBands && staffIndex % 2 === 1
      ? [eveningShiftId, dayShiftId]
      : [dayShiftId, eveningShiftId];

  for (let index = 0; index < days; index += 1) {
    if (assignments[index]) continue;
    if (blockedDateSet?.has(monthDates[index])) {
      assignments[index] = OFF_SHIFT_TOKEN;
      continue;
    }

    if (isNightRecoverySlot(assignments, index, shiftMap, offDaysAfterNightMax)) {
      assignments[index] = OFF_SHIFT_TOKEN;
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
      assignments[index] = OFF_SHIFT_TOKEN;
      continue;
    }

    if (
      offIsFeasible &&
      ((isWeekend && staffConfig?.preferWeekendOff) || (isHoliday && staffConfig?.preferHolidayOff))
    ) {
      assignments[index] = OFF_SHIFT_TOKEN;
      continue;
    }

    if (rule.distributeWeekendShifts && isWeekend && offIsFeasible && weekendAssignmentCounts?.length) {
      const lowestWeekendLoad = Math.min(...weekendAssignmentCounts);
      if (weekendWorkCount > lowestWeekendLoad) {
        assignments[index] = OFF_SHIFT_TOKEN;
        continue;
      }
    }

    if (
      maxConsecutiveWeekendWorkDays > 0 &&
      isWeekend &&
      previousWeekendWorkStreak >= maxConsecutiveWeekendWorkDays &&
      offIsFeasible
    ) {
      assignments[index] = OFF_SHIFT_TOKEN;
      continue;
    }

    if (rule.distributeHolidayShifts && isHoliday && offIsFeasible && holidayAssignmentCounts?.length) {
      const lowestHolidayLoad = Math.min(...holidayAssignmentCounts);
      if (holidayWorkCount > lowestHolidayLoad) {
        assignments[index] = OFF_SHIFT_TOKEN;
        continue;
      }
    }

    if (candidates.length === 0) {
      assignments[index] = OFF_SHIFT_TOKEN;
      continue;
    }

    const orderedCandidates = [...candidates].sort((left, right) => {
        const leftBand = resolveShiftBand(shiftMap.get(left)!);
        const rightBand = resolveShiftBand(shiftMap.get(right)!);
        const currentCounts = staffingDayBandCounts[index] || { day: 0, evening: 0, night: 0 };
        const minStaffingTargets = coverageTargetsByDate[index] || buildEmptyCoverageCounts();
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
          minStaffingTargets,
          remainingStaff,
        });
        const rightFeasible = canStillMeetMinimumStaffing({
          projectedCounts: rightProjectedCounts,
          minStaffingTargets,
          remainingStaff,
        });

        if (leftFeasible !== rightFeasible) {
          return leftFeasible ? -1 : 1;
        }

        const leftUrgency = Math.max(
          0,
          minStaffingTargets[leftBand as 'day' | 'evening' | 'night'] -
            (currentCounts[leftBand as 'day' | 'evening' | 'night'] || 0)
        );
        const rightUrgency = Math.max(
          0,
          minStaffingTargets[rightBand as 'day' | 'evening' | 'night'] -
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
  const remainingStaff = Math.max(totalStaffCount - staffIndex - 1, 0);
  for (let index = 0; index < days; index += 1) {
    const token = assignments[index] || OFF_SHIFT_TOKEN;
    if (!token || token === OFF_SHIFT_TOKEN) {
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
      remainingStaff,
    });
    if (!canRestHere) continue;

    assignments[index] = OFF_SHIFT_TOKEN;
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

  return assignments.map((token) => token || OFF_SHIFT_TOKEN);
}

function buildDefaultShiftOrder(shifts: WorkShift[]) {
  const sorted = sortShifts(shifts);
  const bucket = [
    pickShiftByKeywords(sorted, ['day', '데이', '주간', '상근', '일근', '오전']),
    pickShiftByKeywords(sorted, ['evening', 'eve', '이브', '오후', '중간']),
    pickShiftByKeywords(sorted, ['night', '나이트', '야간']),
  ].filter(Boolean) as WorkShift[];

  const unique = [...bucket];
  sorted.forEach((shift) => {
    if (!unique.some((item) => item.id === shift.id)) {
      unique.push(shift);
    }
  });

  return unique.slice(0, 3);
}

function inferPattern(staff: StaffMember, shifts: WorkShift[]) {
  const assignedShift = shifts.find((shift) => shift.id === (staff as Record<string, unknown>)?.shift_id);
  const sources: Array<string | null | undefined> = [
    (staff as Record<string, unknown>)?.shift_type as string | undefined,
    assignedShift?.shift_type,
    assignedShift?.name,
  ];

  if (hasPatternKeyword(sources, THREE_SHIFT_PATTERN_KEYWORDS)) return '3교대';
  if (hasPatternKeyword(sources, TWO_SHIFT_PATTERN_KEYWORDS)) return '2교대';
  if (hasPatternKeyword(sources, TWO_WORK_ONE_OFF_PATTERN_KEYWORDS)) return '2일근무1일휴무';
  if (hasPatternKeyword(sources, ONE_WORK_ONE_OFF_PATTERN_KEYWORDS)) return '1일근무1일휴무';
  if (hasPatternKeyword(sources, NIGHT_DEDICATED_PATTERN_KEYWORDS)) return '야간전담';
  if (
    hasPatternKeyword(sources, OFFICE_PATTERN_KEYWORDS) ||
    (assignedShift && resolveConfiguredWorkDayMode(assignedShift) === 'weekdays')
  ) {
    return '상근';
  }
  if (shifts.length >= 3) return '3교대';
  return '상근';
}

function getBandShiftIds(
  band: 'day' | 'evening' | 'night',
  shifts: WorkShift[],
  preferredShiftId = ''
) {
  const bandShiftIds = sortShifts(shifts.filter((shift) => resolveShiftBand(shift) === band)).map(
    (shift) => shift.id
  );

  if (preferredShiftId && bandShiftIds.includes(preferredShiftId)) {
    return [preferredShiftId, ...bandShiftIds.filter((shiftId) => shiftId !== preferredShiftId)];
  }

  return bandShiftIds;
}

function inferDedicatedPatternGroup(
  staff: StaffMember,
  shifts: WorkShift[]
): PlannerResolvedPatternGroup | null {
  if (shifts.length === 0) return null;

  const s = staff as Record<string, unknown>;
  const assignedShift = shifts.find((shift) => shift.id === s?.shift_id) || null;
  const sources: Array<string | null | undefined> = [
    s?.shift_type as string | undefined,
    staff?.position,
    staff?.role,
    assignedShift?.shift_type,
    assignedShift?.name,
    assignedShift?.description,
  ];

  const buildGroup = (
    band: 'day' | 'evening' | 'night',
    mode: RosterPatternGroupMode,
    label: string,
    rationale: string
  ) => {
    const shiftIds = getBandShiftIds(band, shifts, assignedShift?.id || '');
    if (shiftIds.length === 0) return null;

    return {
      key: `auto-${mode}`,
      label,
      mode,
      shiftIds,
      rationale,
      source: 'auto' as const,
    };
  };

  if (hasPatternKeyword(sources, DAY_DEDICATED_PATTERN_KEYWORDS)) {
    return buildGroup(
      'day',
      'day_fixed',
      '데이전담',
      '직원 근무유형과 배정 근무를 기준으로 데이 전담자로 자동 감지했습니다.'
    );
  }

  if (hasPatternKeyword(sources, EVENING_DEDICATED_PATTERN_KEYWORDS)) {
    return buildGroup(
      'evening',
      'evening_fixed',
      '이브전담',
      '직원 근무유형과 배정 근무를 기준으로 이브 전담자로 자동 감지했습니다.'
    );
  }

  if (hasPatternKeyword(sources, NIGHT_DEDICATED_PATTERN_KEYWORDS)) {
    return buildGroup(
      'night',
      'night_fixed',
      '나이트전담',
      '직원 근무유형과 배정 근무를 기준으로 나이트 전담자로 자동 감지했습니다.'
    );
  }

  if (assignedShift && hasPatternKeyword(sources, FIXED_PATTERN_KEYWORDS)) {
    const assignedBand = resolveShiftBand(assignedShift);
    if (assignedBand === 'day') {
      return buildGroup(
        'day',
        'day_fixed',
        '데이전담',
        '고정 근무 힌트와 배정 근무 시간을 기준으로 데이 전담자로 판단했습니다.'
      );
    }
    if (assignedBand === 'evening') {
      return buildGroup(
        'evening',
        'evening_fixed',
        '이브전담',
        '고정 근무 힌트와 배정 근무 시간을 기준으로 이브 전담자로 판단했습니다.'
      );
    }
    if (assignedBand === 'night') {
      return buildGroup(
        'night',
        'night_fixed',
        '나이트전담',
        '고정 근무 힌트와 배정 근무 시간을 기준으로 나이트 전담자로 판단했습니다.'
      );
    }
  }

  return null;
}

function resolvePlannerPatternGroup({
  staff,
  patternProfile,
  availableShifts,
  allShifts,
}: {
  staff: StaffMember;
  patternProfile?: RosterPatternProfile | null;
  availableShifts: WorkShift[];
  allShifts: WorkShift[];
}): PlannerResolvedPatternGroup | null {
  const staffExtra = staff as Record<string, unknown>;
  const matchedGroup = patternProfile
    ? findPatternStaffGroup(patternProfile, {
        name: String(staff.name || ''),
        position: String(staff.position || ''),
        role: String(staff.role || ''),
        employmentType: String(staffExtra.employment_type || ''),
        department: String(getDepartmentName(staff) || ''),
        shiftType: String(staffExtra.shift_type || ''),
        assignedShiftId: String(staffExtra.shift_id || ''),
        assignedShiftName: getShiftNameById(String(staffExtra.shift_id || ''), allShifts),
      })
    : null;

  if (matchedGroup) {
    return {
      key: matchedGroup.id,
      label: matchedGroup.label,
      mode: matchedGroup.mode,
      shiftIds: matchedGroup.shiftIds,
      rationale: `${matchedGroup.label} 그룹 설정을 기준으로 고정 사이클을 적용했습니다.`,
      source: 'profile',
    };
  }

  return inferDedicatedPatternGroup(staff, availableShifts);
}

function isNightPattern(pattern: string) {
  return pattern === '3교대' || pattern === '야간전담';
}

function isCustomPattern(pattern: string) {
  return pattern === CUSTOM_PATTERN_VALUE;
}

function isWeeklyTemplatePattern(pattern: string) {
  return pattern === WEEKLY_TEMPLATE_PATTERN_VALUE;
}

function getRequiredShiftCount(pattern: string) {
  switch (pattern) {
    case '3교대':
      return 3;
    case '2교대':
    case '2일근무1일휴무':
      return 2;
    case CUSTOM_PATTERN_VALUE:
      return 1;
    default:
      return 1;
  }
}

function normalizeCustomPatternSequence(sequence: string[], workShifts: WorkShift[]) {
  const validShiftIds = new Set(workShifts.map((shift) => shift.id));
  return sequence.filter((token) => token === OFF_SHIFT_TOKEN || validShiftIds.has(token));
}

function buildDefaultCustomPatternSequence(shiftIds: string[]) {
  const uniqueShiftIds = shiftIds.filter(Boolean).filter((shiftId, index, list) => list.indexOf(shiftId) === index);
  if (uniqueShiftIds.length === 0) return [];
  if (uniqueShiftIds.length === 1) return uniqueShiftIds;
  return [...uniqueShiftIds, OFF_SHIFT_TOKEN];
}

function normalizeActiveWeekdays(activeWeekdays: number[]) {
  const orderMap = new Map(WEEKDAY_PICKER_ORDER.map((day, index) => [day, index]));
  return Array.from(new Set(activeWeekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))).sort(
    (left, right) => (orderMap.get(left) ?? 99) - (orderMap.get(right) ?? 99)
  );
}

function buildDefaultWeeklyTemplateWeeks(shiftIds: string[], weekCount = 1): WeeklyTemplateWeek[] {
  const normalizedShiftIds = shiftIds.filter(Boolean).filter((shiftId, index, list) => list.indexOf(shiftId) === index);
  const safeWeekCount = Math.max(1, Math.min(6, Math.floor(weekCount) || 1));
  const fallbackShiftId = normalizedShiftIds[0] || '';

  return Array.from({ length: safeWeekCount }, (_, index) => ({
    shiftId: normalizedShiftIds[index] || fallbackShiftId,
    activeWeekdays: [1, 2, 3, 4, 5],
  }));
}

function normalizeWeeklyTemplateWeeks(
  weeks: WeeklyTemplateWeek[],
  shiftIds: string[],
  desiredCount?: number
) {
  const normalizedShiftIds = shiftIds.filter(Boolean).filter((shiftId, index, list) => list.indexOf(shiftId) === index);
  const safeWeekCount = Math.max(1, Math.min(6, Math.floor(desiredCount ?? weeks.length ?? 1) || 1));
  const fallbackShiftId = normalizedShiftIds[0] || '';
  const sourceWeeks =
    Array.isArray(weeks) && weeks.length > 0 ? weeks : buildDefaultWeeklyTemplateWeeks(normalizedShiftIds, safeWeekCount);

  return Array.from({ length: safeWeekCount }, (_, index) => {
    const source = sourceWeeks[index] || sourceWeeks[sourceWeeks.length - 1] || {
      shiftId: fallbackShiftId,
      activeWeekdays: [1, 2, 3, 4, 5],
    };

    return {
      shiftId: normalizedShiftIds.includes(source.shiftId) ? source.shiftId : fallbackShiftId,
      activeWeekdays: normalizeActiveWeekdays(source.activeWeekdays || []),
    };
  });
}

function getWeeklyTemplateWeekLabel(index: number) {
  return `${index + 1}주차`;
}

function formatWeekdaySummary(activeWeekdays: number[]) {
  const normalized = normalizeActiveWeekdays(activeWeekdays);
  if (normalized.length === 0) return '전체 휴무';
  return normalized.map((day) => WEEKDAY_LABELS[day]).join(' · ');
}

function buildWeeklyTemplateAnchor(monthDates: string[]) {
  const firstDate = monthDates[0] ? new Date(`${monthDates[0]}T00:00:00`) : new Date();
  const anchor = new Date(firstDate);
  anchor.setHours(0, 0, 0, 0);
  return anchor;
}

function resolveWeeklyTemplateWeekIndex(date: string, anchor: Date, cycleLength: number) {
  const current = new Date(`${date}T00:00:00`);
  current.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((current.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24));
  const weekOffset = Math.floor(diffDays / 7);
  return ((weekOffset % cycleLength) + cycleLength) % cycleLength;
}

function buildWizardPresetDescription(pattern: string, weeklyTemplateWeeks: WeeklyTemplateWeek[], shiftCount: number) {
  if (isWeeklyTemplatePattern(pattern)) {
    return weeklyTemplateWeeks
      .map((week, index) => `${getWeeklyTemplateWeekLabel(index)} ${formatWeekdaySummary(week.activeWeekdays)}`)
      .join(' / ');
  }
  if (pattern === CUSTOM_PATTERN_VALUE) {
    return `커스텀 순환 · 근무유형 ${shiftCount}개`;
  }
  return `${pattern} · 근무유형 ${shiftCount}개`;
}

function normalizePresetRecord(record: Record<string, unknown>): RosterWizardPreset | null {
  if (!record || typeof record !== 'object') return null;
  const id = String(record.id || '').trim();
  const name = String(record.name || '').trim();
  if (!id || !name) return null;
  const generationRule = normalizeGenerationRule(record.generationRule);
  const shiftIds = Array.isArray(record.shiftIds)
    ? record.shiftIds
        .map((shiftId: unknown) => String(shiftId || '').trim())
        .filter(Boolean)
    : [];
  const shiftNames = Array.isArray(record.shiftNames)
    ? record.shiftNames
        .map((shiftName: unknown) => String(shiftName || '').trim())
        .filter(Boolean)
    : [];

  const customPatternSlots = Array.isArray(record.customPatternSlots)
    ? record.customPatternSlots
        .map((token: unknown) => {
          if (token === 'OFF') return 'OFF' as const;
          const slot = Number(token);
          return Number.isInteger(slot) && slot > 0 ? slot : null;
        })
        .filter((token: number | 'OFF' | null): token is number | 'OFF' => token !== null)
    : [];

  const weeklyTemplateWeeks = Array.isArray(record.weeklyTemplateWeeks)
    ? record.weeklyTemplateWeeks
        .map((week: unknown) => {
          const w = week as Record<string, unknown> | null | undefined;
          const shiftSlot = Number(w?.shiftSlot);
          if (!Number.isInteger(shiftSlot) || shiftSlot <= 0) return null;
          return {
            shiftSlot,
            activeWeekdays: normalizeActiveWeekdays(Array.isArray(w?.activeWeekdays) ? w.activeWeekdays as number[] : []),
          };
        })
        .filter(
          (
            week: {
              shiftSlot: number;
              activeWeekdays: number[];
            } | null
          ): week is {
            shiftSlot: number;
            activeWeekdays: number[];
          } => week !== null
        )
    : [];
  const staffNightRanges =
    record.staffNightRanges && typeof record.staffNightRanges === 'object'
      ? Object.fromEntries(
          Object.entries(record.staffNightRanges as Record<string, unknown>).map(([staffId, value]) => {
            const source = value as Record<string, unknown> | null | undefined;
            const minNightShiftCount = clampNightShiftCount(
              Number(source?.minNightShiftCount) || 0,
              31
            );
            const maxNightShiftCount = Math.max(
              minNightShiftCount,
              clampNightShiftCount(Number(source?.maxNightShiftCount) || 0, 31)
            );

            return [
              String(staffId || ''),
              {
                minNightShiftCount,
                maxNightShiftCount,
              },
            ];
          })
        )
      : {};
  const staffBlockPreferences =
    record.staffBlockPreferences && typeof record.staffBlockPreferences === 'object'
      ? Object.fromEntries(
          Object.entries(record.staffBlockPreferences as Record<string, unknown>).map(([staffId, value]) => [
            String(staffId || ''),
            normalizeStaffBlockPreference(value),
          ])
        )
      : {};
  const staffDedicatedBands =
    record.staffDedicatedBands && typeof record.staffDedicatedBands === 'object'
      ? Object.fromEntries(
          Object.entries(record.staffDedicatedBands as Record<string, unknown>).map(([staffId, value]) => {
            const normalizedValue = String(value || '').trim().toLowerCase();
            const band: CoverageBand | '' =
              normalizedValue === 'day' ||
              normalizedValue === 'evening' ||
              normalizedValue === 'night'
                ? (normalizedValue as CoverageBand)
                : '';
            return [String(staffId || ''), band];
          })
        )
      : {};
  const staffCoverageRoleTags =
    record.staffCoverageRoleTags && typeof record.staffCoverageRoleTags === 'object'
      ? Object.fromEntries(
          Object.entries(record.staffCoverageRoleTags as Record<string, unknown>).map(([staffId, value]) => [
            String(staffId || ''),
            normalizeCoverageRoleTags(Array.isArray(value) ? value : String(value || '').split(',')),
          ])
        )
      : {};
  const staffRestrictions =
    record.staffRestrictions && typeof record.staffRestrictions === 'object'
      ? Object.fromEntries(
          Object.entries(record.staffRestrictions as Record<string, unknown>).map(([staffId, value]) => {
            const source = value as Record<string, unknown> | null | undefined;
            return [
              String(staffId || ''),
              {
                blockedShiftBands: normalizeBlockedShiftBands(source?.blockedShiftBands),
                blockedWeekdays: normalizeBlockedWeekdays(source?.blockedWeekdays),
                avoidWeekendWork: Boolean(source?.avoidWeekendWork),
                avoidHolidayWork: Boolean(source?.avoidHolidayWork),
                preferWeekendOff: Boolean(source?.preferWeekendOff),
                preferHolidayOff: Boolean(source?.preferHolidayOff),
                avoidConsecutiveEvening: Boolean(source?.avoidConsecutiveEvening),
                preferEarlyMonthNight: Boolean(source?.preferEarlyMonthNight),
              } satisfies StaffRestrictionDraft,
            ];
          })
        )
      : {};
  const pairRules = Array.isArray(record.pairRules)
    ? record.pairRules
        .map((entry, index) => {
          const source = entry as Record<string, unknown> | null | undefined;
          const primaryStaffId = String(source?.primaryStaffId || '').trim();
          const secondaryStaffId = String(source?.secondaryStaffId || '').trim();
          const mode = String(source?.mode || '').trim();
          const band = String(source?.band || '').trim();
          if (!primaryStaffId || !secondaryStaffId || primaryStaffId === secondaryStaffId) return null;
          if (mode !== 'together' && mode !== 'separate') return null;
          if (band !== 'night' && band !== 'work') return null;
          return {
            id: String(source?.id || `pair-rule-${index + 1}`),
            primaryStaffId,
            secondaryStaffId,
            mode,
            band,
          } satisfies WizardPairRule;
        })
        .filter((entry): entry is WizardPairRule => Boolean(entry))
    : [];

  const inferredShiftSlotCount = Math.max(
    Number(record.shiftSlotCount) || 0,
    shiftIds.length,
    customPatternSlots.reduce((max: number, token: number | 'OFF') => (token === 'OFF' ? max : Math.max(max, token)), 0),
    weeklyTemplateWeeks.reduce((max: number, week: { shiftSlot: number; activeWeekdays: number[] }) => Math.max(max, week.shiftSlot), 0),
    1
  );

  return {
    id,
    name,
    description: String(record.description || '').trim(),
    pattern: String(record.pattern || '상근'),
    shiftSlotCount: inferredShiftSlotCount,
    shiftIds: shiftIds.slice(0, inferredShiftSlotCount),
    shiftNames: shiftNames.slice(0, inferredShiftSlotCount),
    startOffset: Math.max(0, Math.floor(Number(record.startOffset) || 0)),
    nightShiftCount: Math.max(0, Math.floor(Number(record.nightShiftCount) || 0)),
    customPatternSlots,
    weeklyTemplateWeeks,
    generationRule,
    staffNightRanges,
    staffBlockPreferences,
    staffDedicatedBands,
    staffCoverageRoleTags,
    staffRestrictions,
    pairRules,
  };
}

function cloneGenerationRule(rule: RosterGenerationRule | null | undefined) {
  if (!rule) return null;

  return {
    ...rule,
    teamKeywords: [...rule.teamKeywords],
    dateCoverageOverrides: (rule.dateCoverageOverrides || []).map((entry) => ({ ...entry })),
    roleCoverageRules: rule.roleCoverageRules.map((entry) => ({
      ...entry,
      keywords: [...entry.keywords],
    })),
  } satisfies RosterGenerationRule;
}

function buildGenerationRuleSummaryItems(rule: RosterGenerationRule) {
  const items = [
    `생성 성향 ${getGenerationStyleMeta(rule.generationStyle).label}`,
    `최소 D/E/N ${rule.minDayStaff}/${rule.minEveningStaff}/${rule.minNightStaff}`,
    `나이트 후 OFF ${rule.offDaysAfterNight}일`,
    `나이트 블록 ${rule.nightBlockSize}일`,
    `최소 월 OFF ${rule.minMonthlyOffDays}일`,
    `최대 연속근무 ${rule.maxConsecutiveWorkDays}일`,
    rule.blockNewNurseSoloNight ? '신규 단독 NIGHT 금지' : '신규 단독 NIGHT 허용',
    rule.requireSeniorWithNewNurseNight ? '신규 NIGHT 선임 동반' : '신규 NIGHT 선임 동반 해제',
    rule.separateNewNursesByShift ? '신규간호사 분리 배치' : '신규간호사 분리 해제',
    rule.avoidDayAfterNight ? 'N 다음 DAY 금지' : 'N 다음 DAY 허용',
    rule.avoidDayAfterEvening ? 'E 다음 DAY 금지' : 'E 다음 DAY 허용',
    `역할 슬롯 ${rule.roleCoverageRules.length}개`,
  ];

  if (rule.maxConsecutiveEveningShifts > 0) {
    items.push(`연속 EVENING 최대 ${rule.maxConsecutiveEveningShifts}일`);
  }
  if (rule.maxConsecutiveWeekendWorkDays > 0) {
    items.push(`연속 주말근무 최대 ${rule.maxConsecutiveWeekendWorkDays}일`);
  }
  if (
    rule.minSeniorDayStaff > 0 ||
    rule.minSeniorEveningStaff > 0 ||
    rule.minSeniorNightStaff > 0
  ) {
    items.push(
      `선임 D/E/N ${rule.minSeniorDayStaff}/${rule.minSeniorEveningStaff}/${rule.minSeniorNightStaff}`
    );
  }
  if (
    rule.minDedicatedDayStaff > 0 ||
    rule.minDedicatedEveningStaff > 0 ||
    rule.minDedicatedNightStaff > 0
  ) {
    items.push(
      `전담 D/E/N ${rule.minDedicatedDayStaff}/${rule.minDedicatedEveningStaff}/${rule.minDedicatedNightStaff}`
    );
  }

  if (
    rule.weekendMinDayStaff > 0 ||
    rule.weekendMinEveningStaff > 0 ||
    rule.weekendMinNightStaff > 0
  ) {
    items.push(
      `週末 D/E/N ${rule.weekendMinDayStaff}/${rule.weekendMinEveningStaff}/${rule.weekendMinNightStaff}`
    );
  }
  if (
    rule.holidayMinDayStaff > 0 ||
    rule.holidayMinEveningStaff > 0 ||
    rule.holidayMinNightStaff > 0
  ) {
    items.push(
      `공휴일 D/E/N ${rule.holidayMinDayStaff}/${rule.holidayMinEveningStaff}/${rule.holidayMinNightStaff}`
    );
  }
  if ((rule.dateCoverageOverrides || []).length > 0) {
    items.push(`특정 날짜 인원 ${(rule.dateCoverageOverrides || []).length}건`);
  }

  const roleCoverageSummary = summarizeRoleCoverageRules(rule.roleCoverageRules);
  if (roleCoverageSummary.length > 0) {
    items.push(...roleCoverageSummary);
  }

  return items.filter(Boolean);
}

function resolvePresetShiftIds(
  preset: RosterWizardPreset,
  fallbackShiftIds: string[],
  workShifts: WorkShift[]
) {
  const validShiftIds = new Set(workShifts.map((shift) => shift.id));
  const shiftIdByName = new Map<string, string>();

  workShifts.forEach((shift) => {
    const normalizedName = normalizeShiftName(shift.name);
    if (normalizedName && !shiftIdByName.has(normalizedName)) {
      shiftIdByName.set(normalizedName, shift.id);
    }
  });

  const resolvedPresetShiftIds = preset.shiftIds
    .map((shiftId, index) => {
      if (validShiftIds.has(shiftId)) return shiftId;
      const shiftName = preset.shiftNames[index] || '';
      return shiftIdByName.get(normalizeShiftName(shiftName)) || '';
    })
    .filter(Boolean);

  return [...resolvedPresetShiftIds, ...fallbackShiftIds.filter(Boolean), ...workShifts.map((shift) => shift.id)]
    .filter((shiftId, index, list) => list.indexOf(shiftId) === index)
    .slice(0, Math.max(1, preset.shiftSlotCount));
}

function getPatternSequenceLabel(token: string, workShifts: WorkShift[]) {
  if (token === OFF_SHIFT_TOKEN) return 'OFF';
  return getShiftNameById(token, workShifts);
}

function clampNightShiftCount(value: number, days: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(days, Math.floor(value)));
}

function inferDefaultNightShiftCount(pattern: string, days: number) {
  if (pattern === '야간전담') return Math.ceil(days / 2);
  if (pattern === '3교대') return Math.max(1, Math.round(days / 4));
  return 0;
}

function selectDistributedDays({
  candidateDays,
  days,
  targetCount,
  seed,
}: {
  candidateDays: number[];
  days: number;
  targetCount: number;
  seed: number;
}) {
  const sortedDays = [...candidateDays].sort((a, b) => a - b);
  if (targetCount <= 0 || sortedDays.length === 0) return [];
  if (targetCount >= sortedDays.length) return sortedDays;

  const picks: number[] = [];
  const used = new Set<number>();
  const normalizedSeed = ((seed % days) + days) % days;

  for (let index = 0; index < targetCount; index += 1) {
    const idealPosition = ((((index + 0.5) * days) / targetCount) + normalizedSeed) % days;
    let bestDay = sortedDays[0];
    let bestDistance = Number.POSITIVE_INFINITY;

    sortedDays.forEach((day) => {
      if (used.has(day)) return;
      const zeroBasedDay = day - 1;
      const directDistance = Math.abs(zeroBasedDay - idealPosition);
      const wrappedDistance = Math.min(directDistance, days - directDistance);
      if (wrappedDistance < bestDistance) {
        bestDistance = wrappedDistance;
        bestDay = day;
      }
    });

    used.add(bestDay);
    picks.push(bestDay);
  }

  return picks.sort((a, b) => a - b);
}

function buildInitialConfig(staff: StaffMember, index: number, shifts: WorkShift[], days: number): StaffConfig {
  const primary = shifts.find((shift) => shift.id === staff?.shift_id)?.id || shifts[0]?.id || '';
  const secondary = shifts[1]?.id || primary;
  const tertiary = shifts[2]?.id || secondary || primary;
  const pattern = inferPattern(staff, shifts);

  return {
    enabled: true,
    pattern,
    primaryShiftId: primary,
    secondaryShiftId: secondary,
    tertiaryShiftId: tertiary,
    startOffset: index,
    nightShiftCount: isNightPattern(pattern) ? inferDefaultNightShiftCount(pattern, days) : 0,
    minNightShiftCount: 0,
    maxNightShiftCount: 0,
    blockPreference: 'balanced',
    customPatternSequence: [],
    weeklyTemplateWeeks: buildDefaultWeeklyTemplateWeeks([primary, secondary, tertiary]),
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

function buildEmptyCoverageCounts() {
  return {
    day: 0,
    evening: 0,
    night: 0,
  } satisfies Record<'day' | 'evening' | 'night', number>;
}

function computePatternDiversityMetrics(cells: PreviewCell[]) {
  const workTokens = cells
    .map((cell) => String(cell.code || '').trim().toUpperCase())
    .filter((token) => token && token !== 'OFF');

  if (workTokens.length === 0) {
    return {
      diversityScore: 0,
      longestSameBandStreak: 0,
      repeatedPatternCount: 0,
    };
  }

  const streakLengths: number[] = [];
  const transitionSet = new Set<string>();
  let longestSameBandStreak = 0;
  let currentStreak = 0;

  workTokens.forEach((token, index) => {
    if (index === 0 || workTokens[index - 1] !== token) {
      if (currentStreak > 0) {
        streakLengths.push(currentStreak);
      }
      currentStreak = 1;
    } else {
      currentStreak += 1;
    }

    if (index > 0) {
      transitionSet.add(`${workTokens[index - 1]}->${token}`);
    }
    longestSameBandStreak = Math.max(longestSameBandStreak, currentStreak);
  });
  if (currentStreak > 0) {
    streakLengths.push(currentStreak);
  }

  const repeatedPatternCount = Math.max(
    0,
    streakLengths.filter((length) => length >= 3).length - 1
  );
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

function getRestrictedAllowedShiftIds(
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

function canAssignPlanShiftAtDate({
  plan,
  dateIndex,
  nextShiftId,
  monthDates,
  shiftMap,
  rule,
}: {
  plan: GeneratedCoveragePlan;
  dateIndex: number;
  nextShiftId: string;
  monthDates: string[];
  shiftMap: Map<string, WorkShift>;
  rule: RosterGenerationRule;
}) {
  const dateKey = monthDates[dateIndex] || '';
  if (!dateKey || plan.blockedDateSet?.has(dateKey)) return false;
  if (!plan.allowedShiftIds.includes(nextShiftId)) return false;

  const shift = shiftMap.get(nextShiftId);
  if (!shift) return false;

  const dayOfWeek = new Date(`${dateKey}T00:00:00`).getDay();
  if (resolveConfiguredWorkDayMode(shift) === 'weekdays' && (dayOfWeek === 0 || dayOfWeek === 6)) {
    return false;
  }

  const nextBand = resolveShiftBand(shift);
  const previousToken = dateIndex > 0 ? plan.assignments[dateIndex - 1] : '';
  const previousBand = getAssignedShiftBand(previousToken, shiftMap);
  const followingToken =
    dateIndex < plan.assignments.length - 1 ? plan.assignments[dateIndex + 1] : '';
  const followingBand = getAssignedShiftBand(followingToken, shiftMap);
  if (rule.avoidDayAfterNight && previousBand === 'night' && nextBand === 'day') {
    return false;
  }
  if (rule.avoidDayAfterEvening && previousBand === 'evening' && nextBand === 'day') {
    return false;
  }
  if (rule.avoidDayAfterNight && nextBand === 'night' && followingBand === 'day') {
    return false;
  }
  if (rule.avoidDayAfterEvening && nextBand === 'evening' && followingBand === 'day') {
    return false;
  }
  if (
    rule.maxConsecutiveEveningShifts > 0 &&
    nextBand === 'evening' &&
    countPreviousBandStreak(plan.assignments, dateIndex, shiftMap) >= rule.maxConsecutiveEveningShifts &&
    previousBand === 'evening'
  ) {
    return false;
  }

  if (
    wouldViolateNightRecoveryWindow(
      plan.assignments,
      dateIndex,
      nextShiftId,
      shiftMap,
      rule.offDaysAfterNight
    )
  ) {
    return false;
  }

  const currentToken = plan.assignments[dateIndex] || OFF_SHIFT_TOKEN;
  if (currentToken === OFF_SHIFT_TOKEN && nextBand) {
    const previousWorkStreak = countPreviousWorkStreak(plan.assignments, dateIndex);
    const nextWorkStreak = countNextWorkStreak(plan.assignments, dateIndex);
    const maxAllowedWorkDays = Math.max(2, Math.min(7, Math.floor(rule.maxConsecutiveWorkDays || 5)));
    if (previousWorkStreak + 1 + nextWorkStreak > maxAllowedWorkDays) {
      return false;
    }
  }

  return true;
}

function formatRosterShortDateLabel(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey;
  return `${Number(dateKey.slice(5, 7))}/${Number(dateKey.slice(8, 10))}`;
}

function summarizeRosterDateLabels(dateKeys: string[], limit = 3) {
  const uniqueLabels = [...new Set(dateKeys.filter(Boolean).map((dateKey) => formatRosterShortDateLabel(dateKey)))];
  if (uniqueLabels.length === 0) return '';
  if (uniqueLabels.length <= limit) return uniqueLabels.join(', ');
  return `${uniqueLabels.slice(0, limit).join(', ')} 외 ${uniqueLabels.length - limit}일`;
}

function isWorkingBand(
  band: ReturnType<typeof getAssignedShiftBand>
): band is 'day' | 'evening' | 'night' {
  return band === 'day' || band === 'evening' || band === 'night';
}

function isWizardPairRuleSatisfiedAtDate({
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

function normalizeActivePairRules(rules: WizardPairRule[], validStaffIds: Set<string>) {
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

function getShiftNameById(shiftId: string, workShifts: WorkShift[]) {
  if (shiftId === OFF_SHIFT_TOKEN) return '휴무';
  return workShifts.find((shift) => shift.id === shiftId)?.name || '미지정';
}

function resolveShiftWorkDayMode(shift?: WorkShift | null) {
  return resolveConfiguredWorkDayMode(shift);
}

function shiftIncludesWeekend(shift?: WorkShift | null) {
  if (!shift) return false;
  return resolveShiftWorkDayMode(shift) === 'all_days';
}

function buildPatternSchedule(config: StaffConfig, monthDates: string[], workShifts: WorkShift[]) {
  const primary = config.primaryShiftId;
  const secondary = config.secondaryShiftId || primary;
  const tertiary = config.tertiaryShiftId || secondary || primary;
  const primaryShift = workShifts.find((shift) => shift.id === primary);
  const primaryIncludesWeekend = shiftIncludesWeekend(primaryShift);
  const customSequence = normalizeCustomPatternSequence(config.customPatternSequence || [], workShifts);
  const weeklyTemplateWeeks = normalizeWeeklyTemplateWeeks(config.weeklyTemplateWeeks || [], [
    ...new Set(
      (config.weeklyTemplateWeeks || [])
        .map((week) => week.shiftId)
        .concat([primary, secondary, tertiary])
        .filter(Boolean)
    ),
  ]);
  const fallbackCustomSequence =
    customSequence.length > 0
      ? customSequence
      : buildDefaultCustomPatternSequence([primary, secondary, tertiary]);
  const weeklyTemplateAnchor = buildWeeklyTemplateAnchor(monthDates);

  const baseRow = monthDates.map((date, dateIndex) => {
    const dayOfWeek = new Date(`${date}T00:00:00`).getDay();

    switch (config.pattern) {
      case '상근':
        return primaryIncludesWeekend || (dayOfWeek !== 0 && dayOfWeek !== 6) ? primary : OFF_SHIFT_TOKEN;
      case '2교대': {
        const sequence = [primary, secondary, OFF_SHIFT_TOKEN, OFF_SHIFT_TOKEN];
        return sequence[(dateIndex + config.startOffset) % sequence.length];
      }
      case '3교대': {
        const sequence = [primary, secondary, tertiary, OFF_SHIFT_TOKEN];
        return sequence[(dateIndex + config.startOffset) % sequence.length];
      }
      case '2일근무1일휴무': {
        const sequence = [primary, secondary || primary, OFF_SHIFT_TOKEN];
        return sequence[(dateIndex + config.startOffset) % sequence.length];
      }
      case '1일근무1일휴무': {
        const sequence = [primary, OFF_SHIFT_TOKEN];
        return sequence[(dateIndex + config.startOffset) % sequence.length];
      }
      case '야간전담': {
        const nightShift = tertiary || secondary || primary;
        const sequence = [nightShift, nightShift, OFF_SHIFT_TOKEN, OFF_SHIFT_TOKEN];
        return sequence[(dateIndex + config.startOffset) % sequence.length];
      }
      case CUSTOM_PATTERN_VALUE: {
        if (fallbackCustomSequence.length === 0) return OFF_SHIFT_TOKEN;
        return fallbackCustomSequence[(dateIndex + config.startOffset) % fallbackCustomSequence.length];
      }
      case WEEKLY_TEMPLATE_PATTERN_VALUE: {
        if (weeklyTemplateWeeks.length === 0) return OFF_SHIFT_TOKEN;
        const weekIndex = resolveWeeklyTemplateWeekIndex(date, weeklyTemplateAnchor, weeklyTemplateWeeks.length);
        const weekConfig = weeklyTemplateWeeks[weekIndex];
        if (!weekConfig?.shiftId || !weekConfig.activeWeekdays.includes(dayOfWeek)) {
          return OFF_SHIFT_TOKEN;
        }
        return weekConfig.shiftId;
      }
      default:
        return primaryIncludesWeekend || (dayOfWeek !== 0 && dayOfWeek !== 6) ? primary : OFF_SHIFT_TOKEN;
    }
  });

  if (!isNightPattern(config.pattern)) return baseRow;

  const days = monthDates.length;
  const nightShiftId = tertiary || secondary || primary;
  if (!nightShiftId) return baseRow;

  const desiredNightCount = clampNightShiftCount(
    Number.isFinite(config.nightShiftCount) ? config.nightShiftCount : inferDefaultNightShiftCount(config.pattern, days),
    days
  );
  const fallbackShiftId =
    config.pattern === '야간전담'
      ? OFF_SHIFT_TOKEN
      : [secondary, primary, OFF_SHIFT_TOKEN].find((shiftId) => shiftId && shiftId !== nightShiftId) || OFF_SHIFT_TOKEN;
  const baseNightDays = Array.from({ length: days }, (_, index) => index + 1).filter(
    (day) => baseRow[day - 1] === nightShiftId
  );
  const desiredNightDays = new Set<number>();
  const baseKeepCount = Math.min(desiredNightCount, baseNightDays.length);

  selectDistributedDays({
    candidateDays: baseNightDays,
    days,
    targetCount: baseKeepCount,
    seed: config.startOffset,
  }).forEach((day) => {
    desiredNightDays.add(day);
  });

  if (desiredNightDays.size < desiredNightCount) {
    const remaining = desiredNightCount - desiredNightDays.size;
    const allDays = Array.from({ length: days }, (_, index) => index + 1);
    const preferredCandidates =
      config.pattern === '야간전담'
        ? allDays.filter((day) => !desiredNightDays.has(day) && baseRow[day - 1] === OFF_SHIFT_TOKEN)
        : allDays.filter(
          (day) =>
            !desiredNightDays.has(day) &&
            baseRow[day - 1] !== OFF_SHIFT_TOKEN &&
            baseRow[day - 1] !== nightShiftId
        );

    selectDistributedDays({
      candidateDays: preferredCandidates,
      days,
      targetCount: Math.min(remaining, preferredCandidates.length),
      seed: config.startOffset + 1,
    }).forEach((day) => {
      desiredNightDays.add(day);
    });

    if (desiredNightDays.size < desiredNightCount) {
      const fallbackCandidates = allDays.filter((day) => !desiredNightDays.has(day));
      selectDistributedDays({
        candidateDays: fallbackCandidates,
        days,
        targetCount: desiredNightCount - desiredNightDays.size,
        seed: config.startOffset + 2,
      }).forEach((day) => {
        desiredNightDays.add(day);
      });
    }
  }

  return baseRow.map((shiftId, index) => {
    const day = index + 1;
    if (desiredNightDays.has(day)) return nightShiftId;
    if (shiftId === nightShiftId) return fallbackShiftId;
    return shiftId;
  });
}

function getShiftCode(name: string) {
  const normalized = normalizeShiftName(name);
  if (!normalized || normalized.includes('미지정')) return '?';
  if (normalized.includes('휴무') || normalized.includes('off') || normalized.includes('비번') || normalized.includes('오프')) return 'OFF';
  if (normalized.includes('휴가') || normalized.includes('연차')) return '휴';
  if (normalized.includes('데이') || normalized.includes('day') || normalized.includes('주간') || normalized.includes('상근') || /(?:^|[^a-z])d$/.test(normalized)) return 'D';
  if (normalized.includes('이브') || normalized.includes('evening') || normalized.includes('eve') || /(?:^|[^a-z])e$/.test(normalized)) return 'E';
  if (normalized.includes('나이트') || normalized.includes('night') || normalized.includes('야간') || /(?:^|[^a-z])n$/.test(normalized)) return 'N';
  return name.slice(0, 2);
}

function getShiftBadgeClass(name: string) {
  const normalized = normalizeShiftName(name);
  if (normalized.includes('휴무') || normalized.includes('off') || normalized.includes('비번') || normalized.includes('오프')) {
    return 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)] border-[var(--border)]';
  }
  if (normalized.includes('휴가') || normalized.includes('연차')) {
    return 'bg-green-500/10 text-green-700 border-green-500/20';
  }
  if (normalized.includes('데이') || normalized.includes('day') || normalized.includes('주간') || normalized.includes('상근') || /(?:^|[^a-z])d$/.test(normalized)) {
    return 'bg-blue-500/10 text-blue-700 border-blue-500/20';
  }
  if (normalized.includes('이브') || normalized.includes('evening') || normalized.includes('eve') || /(?:^|[^a-z])e$/.test(normalized)) {
    return 'bg-orange-500/10 text-orange-700 border-orange-500/20';
  }
  if (normalized.includes('나이트') || normalized.includes('night') || normalized.includes('야간') || /(?:^|[^a-z])n$/.test(normalized)) {
    return 'bg-purple-500/10 text-purple-700 border-purple-500/20';
  }
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

function buildAssignmentKey(staffId: string, date: string) {
  return `${staffId}::${date}`;
}

function formatShiftHours(shift: WorkShift) {
  if (!shift.start_time || !shift.end_time) return '시간 미지정';
  return `${String(shift.start_time).slice(0, 5)} - ${String(shift.end_time).slice(0, 5)}`;
}

function loadStoredPatternProfiles() {
  if (typeof window === 'undefined') return [] as RosterPatternProfile[];

  try {
    const raw = window.localStorage.getItem(ROSTER_PATTERN_PROFILE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((profile) => normalizePatternProfile(profile))
      .filter((profile): profile is RosterPatternProfile => profile !== null);
  } catch (error) {
    console.error('근무 패턴 프로파일 로드 실패:', error);
    return [];
  }
}

function loadStoredGenerationRules() {
  if (typeof window === 'undefined') return [] as RosterGenerationRule[];

  try {
    const raw = window.localStorage.getItem(ROSTER_GENERATION_RULE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((rule) => normalizeGenerationRule(rule))
      .filter((rule): rule is RosterGenerationRule => rule !== null);
  } catch (error) {
    console.error('근무 규칙 로드 실패:', error);
    return [];
  }
}

export default function AutoRosterPlanner({
  user,
  staffs = [],
  initialDepartment,
  initialMonth,
  selectedCo = '전체',
  panelMode = 'planner',
  adminMode = false,
  onAssignmentsSaved,
}: {
  user?: StaffMember;
  staffs?: StaffMember[];
  initialDepartment?: string;
  initialMonth?: string;
  selectedCo?: string;
  panelMode?: 'planner' | 'patterns' | 'rules';
  adminMode?: boolean;
  onAssignmentsSaved?: () => void;
}) {
  const canAccess = isManagerOrHigher(user);
  const isAdmin = adminMode;
  const canManageRosterPolicies = adminMode;
  const canManageRosterAssignments = adminMode || canAccess;
  const ownDepartment = getDepartmentName(user);
  const activeStaffs = useMemo(() => staffs.filter((staff) => isActiveStaff(staff)), [staffs]);
  const companyOptions = useMemo(
    () => Array.from(new Set(activeStaffs.map((staff) => staff.company).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko')),
    [activeStaffs]
  );
  const companyIdByName = useMemo(() => {
    const next = new Map<string, string>();

    activeStaffs.forEach((staff) => {
      const companyName = String(staff.company || '').trim();
      const companyId = String(staff.company_id || '').trim();

      if (companyName && companyId && !next.has(companyName)) {
        next.set(companyName, companyId);
      }
    });

    return next;
  }, [activeStaffs]);

  const [selectedMonth, setSelectedMonth] = useState(initialMonth || new Date().toISOString().slice(0, 7));
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [includedDepartments, setIncludedDepartments] = useState<string[]>([]);
  const [workShifts, setWorkShifts] = useState<WorkShift[]>([]);
  const [staffConfigs, setStaffConfigs] = useState<Record<string, StaffConfig>>({});
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [plannerPattern, setPlannerPattern] = useState(CUSTOM_PATTERN_VALUE);
  const [plannerPrimaryShiftId, setPlannerPrimaryShiftId] = useState('');
  const [plannerSecondaryShiftId, setPlannerSecondaryShiftId] = useState('');
  const [plannerTertiaryShiftId, setPlannerTertiaryShiftId] = useState('');
  const [plannerStartOffset, setPlannerStartOffset] = useState(0);
  const [plannerNightShiftCount, setPlannerNightShiftCount] = useState(0);
  const [plannerCustomPatternSequence, setPlannerCustomPatternSequence] = useState<string[]>([]);
  const [plannerWeeklyTemplateWeeks, setPlannerWeeklyTemplateWeeks] = useState<WeeklyTemplateWeek[]>([]);
  const [manualEditMode, setManualEditMode] = useState(false);
  const [manualAssignments, setManualAssignments] = useState<ManualAssignmentMap>({});
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [wizardSelectedStaffIds, setWizardSelectedStaffIds] = useState<string[]>([]);
  const [wizardPattern, setWizardPattern] = useState('');
  const [wizardShiftIds, setWizardShiftIds] = useState<string[]>([]);
  const [wizardStartOffset, setWizardStartOffset] = useState(0);
  const [wizardNightShiftCount, setWizardNightShiftCount] = useState(0);
  const [wizardCustomPatternSequence, setWizardCustomPatternSequence] = useState<string[]>([]);
  const [wizardWeeklyTemplateWeeks, setWizardWeeklyTemplateWeeks] = useState<WeeklyTemplateWeek[]>([]);
  const [plannerPresetName, setPlannerPresetName] = useState('');
  const [savedWizardPresets, setSavedWizardPresets] = useState<RosterWizardPreset[]>([]);
  const [savedPatternProfiles, setSavedPatternProfiles] = useState<RosterPatternProfile[]>(
    () => readCachedPatternProfiles()
  );
  const [savedGenerationRules, setSavedGenerationRules] = useState<RosterGenerationRule[]>(
    () => readCachedGenerationRules()
  );
  const [patternDraft, setPatternDraft] = useState<RosterPatternProfile>(() =>
    buildDefaultPatternProfile(selectedCo !== '전체' ? selectedCo : user?.company || '')
  );
  const [generationRuleDraft, setGenerationRuleDraft] = useState<RosterGenerationRule>(() =>
    buildDefaultGenerationRule(selectedCo !== '전체' ? selectedCo : user?.company || '')
  );
  const [selectedPatternProfileId, setSelectedPatternProfileId] = useState('');
  const [selectedGenerationRuleId, setSelectedGenerationRuleId] = useState('');
  const [wizardSelectedPresetId, setWizardSelectedPresetId] = useState('');
  const [wizardOffOverrides, setWizardOffOverrides] = useState<Record<string, WizardOffOverride>>({});
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiSummary, setGeminiSummary] = useState('');
  const [geminiAppliedAt, setGeminiAppliedAt] = useState('');
  const [aiRecommendation, setAiRecommendation] = useState<GeminiRosterRecommendation | null>(null);
  const [leaveAppliedSummary, setLeaveAppliedSummary] = useState('');
  const [preferredOffSelections, setPreferredOffSelections] = useState<PreferredOffSelectionMap>({});
  const [preferredOffStaffId, setPreferredOffStaffId] = useState('');
  const [preferredOffDate, setPreferredOffDate] = useState('');
  const [selectedAiShiftIds, setSelectedAiShiftIds] = useState<string[]>([]);
  const [highlightedRosterTarget, setHighlightedRosterTarget] = useState('');
  const [rosterSnapshots, setRosterSnapshots] = useState<StoredRosterSnapshot<GeminiRosterRecommendation>[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState('');
  const [activeGenerationRuleOverride, setActiveGenerationRuleOverride] =
    useState<RosterGenerationRule | null>(null);
  const [wizardGenerationBasis, setWizardGenerationBasis] =
    useState<WizardGenerationBasis>('saved_rule');
  const [wizardRuleDraft, setWizardRuleDraft] = useState<RosterGenerationRule>(() =>
    buildDefaultGenerationRule(selectedCo !== '전체' ? selectedCo : user?.company || '')
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
  const [staffCoverageRoleTags, setStaffCoverageRoleTags] = useState<Record<string, string[]>>({});
  const [staffDedicatedBandOverrides, setStaffDedicatedBandOverrides] = useState<
    Record<string, CoverageBand | ''>
  >({});
  const [plannerPairRules, setPlannerPairRules] = useState<WizardPairRule[]>([]);
  const [selectedManualCell, setSelectedManualCell] = useState<SelectedManualCell>(null);
  const [partialRegenerationStaffId, setPartialRegenerationStaffId] = useState('');
  const [partialRegenerationStartDate, setPartialRegenerationStartDate] = useState('');
  const [partialRegenerationEndDate, setPartialRegenerationEndDate] = useState('');
  const [partialRegenerationMode, setPartialRegenerationMode] =
    useState<PartialRegenerationMode>('minimize_changes');
  const [partialRegenerationLoading, setPartialRegenerationLoading] = useState(false);

  useEffect(() => {
    if (!initialMonth || selectedMonth === initialMonth) return;
    setSelectedMonth(initialMonth);
  }, [initialMonth, selectedMonth]);

  const selectedCompanyId = useMemo(
    () => (selectedCompany ? companyIdByName.get(selectedCompany) || null : null),
    [companyIdByName, selectedCompany]
  );
  const [pendingSnapshotMeta, setPendingSnapshotMeta] = useState<{
    source: 'generated' | 'saved';
    label: string;
  } | null>(null);

  const selectedDepartmentScopeKey = useMemo(
    () => buildDepartmentScopeKey(selectedDepartment, includedDepartments),
    [includedDepartments, selectedDepartment]
  );
  const selectedDepartmentScopeLabel = useMemo(
    () => buildDepartmentScopeLabel(selectedDepartment, includedDepartments),
    [includedDepartments, selectedDepartment]
  );
  const rosterScopeLabel = selectedDepartmentScopeLabel || selectedDepartment;
  const rosterSnapshotStorageKey = useMemo(
    () => buildRosterSnapshotStorageKey(selectedCompany, selectedDepartmentScopeKey, selectedMonth),
    [selectedCompany, selectedDepartmentScopeKey, selectedMonth]
  );

  const resolvePolicyCompanyId = (companyName?: string, explicitCompanyId?: string | null) => {
    const normalizedExplicit = String(explicitCompanyId || '').trim();
    if (normalizedExplicit) return normalizedExplicit;

    const normalizedCompanyName = String(companyName || '').trim();
    if (!normalizedCompanyName) return null;

    return companyIdByName.get(normalizedCompanyName) || null;
  };

  const buildPatternProfileStorageRecord = (profile: RosterPatternProfile) => {
    const companyName = String(profile.companyName || '').trim() || '전체';
    const companyId = resolvePolicyCompanyId(companyName, profile.companyId);

    return {
      ...profile,
      companyName,
      companyId,
      updatedAt: profile.updatedAt || new Date().toISOString(),
    };
  };

  const buildGenerationRuleStorageRecord = (rule: RosterGenerationRule) => {
    const companyName = String(rule.companyName || '').trim() || '전체';
    const companyId = resolvePolicyCompanyId(companyName, rule.companyId);

    return {
      ...rule,
      companyName,
      companyId,
      updatedAt: rule.updatedAt || new Date().toISOString(),
    };
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(ROSTER_WIZARD_PRESET_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      setSavedWizardPresets(
        parsed
          .map((preset) => normalizePresetRecord(preset))
          .filter((preset): preset is RosterWizardPreset => preset !== null)
      );
    } catch (error) {
      console.error('근무표 프리셋 로드 실패:', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(ROSTER_PATTERN_PROFILE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const normalizedProfiles = parsed
        .map((profile) => normalizePatternProfile(profile))
        .filter((profile): profile is RosterPatternProfile => profile !== null);
      setSavedPatternProfiles(normalizedProfiles);
      writeCachedPatternProfiles(normalizedProfiles);
    } catch (error) {
      console.error('교대방식 패턴 로드 실패:', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(ROSTER_GENERATION_RULE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const normalizedRules = parsed
        .map((rule) => normalizeGenerationRule(rule))
        .filter((rule): rule is RosterGenerationRule => rule !== null);
      setSavedGenerationRules(normalizedRules);
      writeCachedGenerationRules(normalizedRules);
    } catch (error) {
      console.error('근무규칙 로드 실패:', error);
    }
  }, []);

  useEffect(() => {
    const localProfiles = mergeRosterItemsByRecency(readCachedPatternProfiles(), loadStoredPatternProfiles());
    if (localProfiles.length > 0) {
      setSavedPatternProfiles(localProfiles);
      writeCachedPatternProfiles(localProfiles);
    }

    const localRules = mergeRosterItemsByRecency(readCachedGenerationRules(), loadStoredGenerationRules());
    if (localRules.length > 0) {
      setSavedGenerationRules(localRules);
      writeCachedGenerationRules(localRules);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const syncUserId = typeof user?.id === 'string' ? user.id : null;

    const resolveCompanyId = (companyName?: string, explicitCompanyId?: string | null) => {
      const normalizedExplicit = String(explicitCompanyId || '').trim();
      if (normalizedExplicit) return normalizedExplicit;

      const normalizedCompanyName = String(companyName || '').trim();
      if (!normalizedCompanyName) return null;

      return companyIdByName.get(normalizedCompanyName) || null;
    };

    const hydrateSharedPolicies = async () => {
      try {
        const [patternResult, ruleResult] = await Promise.all([
          loadRosterPolicyStorageRecords('pattern_profile'),
          loadRosterPolicyStorageRecords('generation_rule'),
        ]);
        if (cancelled) return;

        const remoteProfiles = patternResult.records
          .map((record) => {
            const payload = record.payload || {};
            return normalizePatternProfile({
              ...payload,
              id: record.policyId,
              name: record.name,
              companyName: record.companyName,
              companyId: record.companyId,
              updatedAt: record.updatedAt || String((payload as Record<string, unknown>).updatedAt || ''),
            });
          })
          .filter((profile): profile is RosterPatternProfile => profile !== null);
        const remoteRules = ruleResult.records
          .map((record) => {
            const payload = record.payload || {};
            return normalizeGenerationRule({
              ...payload,
              id: record.policyId,
              name: record.name,
              companyName: record.companyName,
              companyId: record.companyId,
              updatedAt: record.updatedAt || String((payload as Record<string, unknown>).updatedAt || ''),
            });
          })
          .filter((rule): rule is RosterGenerationRule => rule !== null);

        const mergedProfiles = mergeRosterItemsByRecency(
          readCachedPatternProfiles(),
          loadStoredPatternProfiles(),
          remoteProfiles,
        );
        const mergedRules = mergeRosterItemsByRecency(
          readCachedGenerationRules(),
          loadStoredGenerationRules(),
          remoteRules,
        );

        setSavedPatternProfiles(mergedProfiles);
        setSavedGenerationRules(mergedRules);
        writeCachedPatternProfiles(mergedProfiles);
        writeCachedGenerationRules(mergedRules);

        if (canManageRosterPolicies && patternResult.storageAvailable) {
          const remoteProfilesById = new Map(remoteProfiles.map((profile) => [profile.id, profile]));
          const profilesToSync = mergedProfiles
            .map((profile) => {
              const companyName = String(profile.companyName || '').trim() || '전체';
              const companyId = resolveCompanyId(companyName, profile.companyId);
              return {
                ...profile,
                companyName,
                companyId,
                updatedAt: profile.updatedAt || new Date().toISOString(),
              };
            })
            .filter((profile) => {
              const remoteProfile = remoteProfilesById.get(profile.id);
              return !remoteProfile || parseRosterUpdatedAt(profile.updatedAt) > parseRosterUpdatedAt(remoteProfile.updatedAt);
            });

          await Promise.all(
            profilesToSync.map((profile) =>
              upsertRosterPolicyStorageRecord({
                policyType: 'pattern_profile',
                policyId: profile.id,
                companyId: profile.companyId,
                companyName: profile.companyName,
                name: profile.name,
                payload: profile as unknown as Record<string, unknown>,
                createdBy: syncUserId,
                updatedBy: syncUserId,
                updatedAt: profile.updatedAt,
              })
            )
          );
        }

        if (canManageRosterPolicies && ruleResult.storageAvailable) {
          const remoteRulesById = new Map(remoteRules.map((rule) => [rule.id, rule]));
          const rulesToSync = mergedRules
            .map((rule) => {
              const companyName = String(rule.companyName || '').trim() || '전체';
              const companyId = resolveCompanyId(companyName, rule.companyId);
              return {
                ...rule,
                companyName,
                companyId,
                updatedAt: rule.updatedAt || new Date().toISOString(),
              };
            })
            .filter((rule) => {
              const remoteRule = remoteRulesById.get(rule.id);
              return !remoteRule || parseRosterUpdatedAt(rule.updatedAt) > parseRosterUpdatedAt(remoteRule.updatedAt);
            });

          await Promise.all(
            rulesToSync.map((rule) =>
              upsertRosterPolicyStorageRecord({
                policyType: 'generation_rule',
                policyId: rule.id,
                companyId: rule.companyId,
                companyName: rule.companyName,
                name: rule.name,
                payload: rule as unknown as Record<string, unknown>,
                createdBy: syncUserId,
                updatedBy: syncUserId,
                updatedAt: rule.updatedAt,
              })
            )
          );
        }
      } catch (error) {
        console.error('근무표 공용 정책 저장소 동기화 실패:', error);
      }
    };

    void hydrateSharedPolicies();

    return () => {
      cancelled = true;
    };
  }, [canManageRosterPolicies, companyIdByName, user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        ROSTER_WIZARD_PRESET_STORAGE_KEY,
        JSON.stringify(savedWizardPresets)
      );
    } catch (error) {
      console.error('근무표 프리셋 저장 실패:', error);
    }
  }, [savedWizardPresets]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        ROSTER_PATTERN_PROFILE_STORAGE_KEY,
        JSON.stringify(savedPatternProfiles)
      );
      writeCachedPatternProfiles(savedPatternProfiles);
    } catch (error) {
      console.error('교대방식 패턴 저장 실패:', error);
    }
  }, [savedPatternProfiles]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        ROSTER_GENERATION_RULE_STORAGE_KEY,
        JSON.stringify(savedGenerationRules)
      );
      writeCachedGenerationRules(savedGenerationRules);
    } catch (error) {
      console.error('근무규칙 저장 실패:', error);
    }
  }, [savedGenerationRules]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(rosterSnapshotStorageKey);
      if (!raw) {
        setRosterSnapshots([]);
        setSelectedSnapshotId('');
        return;
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setRosterSnapshots([]);
        setSelectedSnapshotId('');
        return;
      }

      const normalized = parsed
        .map((item) => normalizeStoredRosterSnapshot<GeminiRosterRecommendation>(item))
        .filter((item): item is StoredRosterSnapshot<GeminiRosterRecommendation> => item !== null);

      setRosterSnapshots(normalized);
      setSelectedSnapshotId((prev) =>
        normalized.some((snapshot) => snapshot.id === prev) ? prev : normalized[0]?.id || ''
      );
    } catch (error) {
      console.error('근무표 스냅샷 로드 실패:', error);
      setRosterSnapshots([]);
      setSelectedSnapshotId('');
    }
  }, [rosterSnapshotStorageKey]);

  useEffect(() => {
    if (!companyOptions.length) return;
    if (selectedCo !== '전체' && companyOptions.includes(selectedCo)) {
      setSelectedCompany(selectedCo);
      return;
    }
    if (!isAdmin) {
      setSelectedCompany(user?.company || companyOptions[0]);
      return;
    }
    if (!selectedCompany || !companyOptions.includes(selectedCompany)) {
      setSelectedCompany(user?.company && user.company !== 'SY INC.' ? user.company : companyOptions[0]);
    }
  }, [companyOptions, isAdmin, selectedCo, selectedCompany, user?.company]);

  const departmentOptions = useMemo(() => {
    if (!selectedCompany) return [];
    const list = Array.from(
      new Set(
        activeStaffs
          .filter((staff) => staff.company === selectedCompany)
          .map((staff) => getDepartmentName(staff))
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, 'ko'));

    if (!isAdmin) {
      return list;
    }
    return ['전체 부서', ...list];
  }, [activeStaffs, isAdmin, ownDepartment, selectedCompany]);

  useEffect(() => {
    if (!departmentOptions.length) return;
    const forcedDepartment =
      initialDepartment && departmentOptions.includes(initialDepartment) ? initialDepartment : '';
    const defaultDepartment =
      forcedDepartment ||
      (departmentOptions.includes(ownDepartment)
        ? ownDepartment
        : departmentOptions.find((department) => department !== '전체 부서') || departmentOptions[0] || '');
    if (forcedDepartment && selectedDepartment !== forcedDepartment) {
      setSelectedDepartment(forcedDepartment);
      return;
    }
    if (!selectedDepartment || !departmentOptions.includes(selectedDepartment) || selectedDepartment === '전체 부서') {
      setSelectedDepartment(defaultDepartment);
    }
  }, [departmentOptions, initialDepartment, ownDepartment, selectedDepartment]);

  useEffect(() => {
    const validDepartments = new Set(
      departmentOptions.filter(
        (department) => department !== '전체 부서' && department !== selectedDepartment
      )
    );
    setIncludedDepartments((prev) => prev.filter((department) => validDepartments.has(department)));
  }, [departmentOptions, selectedDepartment]);

  useEffect(() => {
    if (!selectedCompany) {
      setWorkShifts([]);
      return;
    }

    const loadWorkShifts = async () => {
      setLoadingShifts(true);
      try {
        const { data, error } = await withMissingColumnsFallback(
          (omittedColumns) => {
            const columns = [
              'id',
              'name',
              'start_time',
              'end_time',
              'description',
              'shift_type',
              'company_name',
              'weekly_work_days',
              'is_weekend_work',
            ].filter((column) => !omittedColumns.has(column));

            return supabase
              .from('work_shifts')
              .select(columns.join(', '))
              .eq('company_name', selectedCompany)
              .eq('is_active', true)
              .order('start_time', { ascending: true });
          },
          ['weekly_work_days', 'is_weekend_work', 'description']
        );

        if (error) throw error;
        setWorkShifts(((data || []) as unknown as WorkShift[]).map((shift) => ({
          ...shift,
          weekly_work_days: shift?.weekly_work_days ?? null,
          is_weekend_work: shift?.is_weekend_work ?? null,
          description: shift?.description ?? '',
        })));
      } catch (error) {
        console.error('근무형태 로드 실패:', error);
        setWorkShifts([]);
      } finally {
        setLoadingShifts(false);
      }
    };

    loadWorkShifts();
  }, [selectedCompany]);

  const offShift = useMemo(
    () => workShifts.find((shift) => ['휴무', 'off', '비번', '오프'].some((keyword) => normalizeShiftName(shift.name).includes(keyword))),
    [workShifts]
  );

  const workingShifts = useMemo(
    () => workShifts.filter((shift) => shift.id !== offShift?.id),
    [offShift?.id, workShifts]
  );
  const teamScopedWorkingShifts = useMemo(() => {
    const scopedDepartments = [selectedDepartment, ...includedDepartments]
      .map((department) => String(department || '').trim())
      .filter(Boolean)
      .filter((department, index, list) => list.indexOf(department) === index);
    if (scopedDepartments.length === 0) return workingShifts;

    const scopedShiftMap = new Map<string, WorkShift>();
    scopedDepartments.forEach((department) => {
      filterRosterShiftsForDepartment(department, workingShifts, {
        includeOffShift: false,
      }).forEach((shift) => {
        if (!scopedShiftMap.has(shift.id)) {
          scopedShiftMap.set(shift.id, shift);
        }
      });
    });

    const scopedShifts = [...scopedShiftMap.values()];
    return scopedShifts.length > 0 ? scopedShifts : workingShifts;
  }, [includedDepartments, selectedDepartment, workingShifts]);
  const defaultShiftPool = teamScopedWorkingShifts.length > 0 ? teamScopedWorkingShifts : workingShifts;

  const defaultShiftOrder = useMemo(() => buildDefaultShiftOrder(defaultShiftPool), [defaultShiftPool]);
  const companyPatternProfiles = useMemo(
    () =>
      savedPatternProfiles.filter(
        (profile) => !profile.companyName || !selectedCompany || profile.companyName === selectedCompany
      ),
    [savedPatternProfiles, selectedCompany]
  );
  const companyGenerationRules = useMemo(
    () =>
      savedGenerationRules.filter(
        (rule) => !rule.companyName || !selectedCompany || rule.companyName === selectedCompany
      ),
    [savedGenerationRules, selectedCompany]
  );
  const matchingPatternProfiles = useMemo(
    () =>
      companyPatternProfiles.filter((profile) =>
        matchPatternProfileForDepartment(profile, selectedDepartment, selectedCompany)
      ),
    [companyPatternProfiles, selectedDepartment, selectedCompany]
  );
  const matchingGenerationRules = useMemo(
    () =>
      companyGenerationRules.filter((rule) =>
        matchGenerationRuleForDepartment(rule, selectedDepartment, selectedCompany)
      ),
    [companyGenerationRules, selectedDepartment, selectedCompany]
  );
  const selectedPatternProfile = useMemo(
    () =>
      matchingPatternProfiles.find((profile) => profile.id === selectedPatternProfileId) || null,
    [matchingPatternProfiles, selectedPatternProfileId]
  );
  const selectedGenerationRule = useMemo(
    () =>
      matchingGenerationRules.find((rule) => rule.id === selectedGenerationRuleId) || null,
    [matchingGenerationRules, selectedGenerationRuleId]
  );
  const patternRecommendedShiftIds = useMemo(() => {
    if (!selectedPatternProfile) return [];
    const validShiftIds = new Set(defaultShiftPool.map((shift) => shift.id));
    return getPatternProfileShiftIds(selectedPatternProfile).filter((shiftId) => validShiftIds.has(shiftId));
  }, [defaultShiftPool, selectedPatternProfile]);
  const teamRecommendationCategory = useMemo(
    () => getTeamRecommendationCategory(selectedDepartment),
    [selectedDepartment]
  );
  const defaultPlannerMode = useMemo(
    () => getDefaultPlannerMode(teamRecommendationCategory),
    [teamRecommendationCategory]
  );
  const usesStrictTeamRecommendation = teamRecommendationCategory !== 'general' || Boolean(selectedPatternProfile);
  const recommendedAiShiftIds = useMemo(
    () =>
      patternRecommendedShiftIds.length > 0
        ? patternRecommendedShiftIds
        : recommendShiftIdsForTeam(selectedDepartment, defaultShiftPool),
    [defaultShiftPool, patternRecommendedShiftIds, selectedDepartment]
  );
  const recommendedAiShifts = useMemo(() => {
    if (recommendedAiShiftIds.length === 0) {
      return usesStrictTeamRecommendation ? [] : defaultShiftPool;
    }
    const recommendedIdSet = new Set(recommendedAiShiftIds);
    return defaultShiftPool.filter((shift) => recommendedIdSet.has(shift.id));
  }, [defaultShiftPool, recommendedAiShiftIds, usesStrictTeamRecommendation]);
  const monthDates = useMemo(() => getMonthDates(selectedMonth), [selectedMonth]);
  const monthDateSet = useMemo(() => new Set(monthDates), [monthDates]);
  const preferredOffStorageKey = useMemo(
    () => buildPreferredOffStorageKey(selectedCompany, selectedDepartmentScopeKey, selectedMonth),
    [selectedCompany, selectedDepartmentScopeKey, selectedMonth]
  );
  const staffNightRangeStorageKey = useMemo(
    () => buildStaffNightRangeStorageKey(selectedCompany, selectedDepartmentScopeKey),
    [selectedCompany, selectedDepartmentScopeKey]
  );
  const companyLockedByHrFilter = selectedCo !== '전체';
  const teamOptions = useMemo(
    () => departmentOptions.filter((department) => department !== '전체 부서'),
    [departmentOptions]
  );
  const availableIncludedDepartments = useMemo(
    () => teamOptions.filter((department) => department !== selectedDepartment),
    [selectedDepartment, teamOptions]
  );
  const suyeonNursingDepartment = useMemo(
    () =>
      availableIncludedDepartments.find((department) => {
        const normalizedDepartment = String(department || '').replace(/\s+/g, '');
        return normalizedDepartment.includes('수연의원') && normalizedDepartment.includes('간호');
      }) || '',
    [availableIncludedDepartments]
  );
  const scopedRosterDepartments = useMemo(
    () =>
      [selectedDepartment, ...includedDepartments]
        .map((department) => String(department || '').trim())
        .filter((department, index, list) => department && list.indexOf(department) === index),
    [includedDepartments, selectedDepartment]
  );

  useEffect(() => {
    if (matchingPatternProfiles.length === 0) {
      setSelectedPatternProfileId('');
      return;
    }

    if (selectedPatternProfileId && matchingPatternProfiles.some((profile) => profile.id === selectedPatternProfileId)) {
      return;
    }

    setSelectedPatternProfileId(matchingPatternProfiles[0].id);
  }, [matchingPatternProfiles, selectedPatternProfileId]);

  useEffect(() => {
    if (matchingGenerationRules.length === 0) {
      setSelectedGenerationRuleId('');
      return;
    }

    if (
      selectedGenerationRuleId &&
      matchingGenerationRules.some((rule) => rule.id === selectedGenerationRuleId)
    ) {
      return;
    }

    setSelectedGenerationRuleId(matchingGenerationRules[0].id);
  }, [matchingGenerationRules, selectedGenerationRuleId]);

  useEffect(() => {
    setManualAssignments({});
    setManualEditMode(false);
    setSelectedManualCell(null);
    setGeminiSummary('');
    setGeminiAppliedAt('');
    setAiRecommendation(null);
    setLeaveAppliedSummary('');
    setActiveGenerationRuleOverride(null);
  }, [selectedMonth, selectedCompany, selectedDepartmentScopeKey]);

  useEffect(() => {
    if (!monthDates.length) {
      setPreferredOffDate('');
      return;
    }

    setPreferredOffDate((prev) => (monthDates.includes(prev) ? prev : monthDates[0]));
  }, [monthDates]);

  useEffect(() => {
    if (monthDates.length === 0) {
      setPartialRegenerationStartDate('');
      setPartialRegenerationEndDate('');
      return;
    }

    setPartialRegenerationStartDate((prev) => (monthDates.includes(prev) ? prev : monthDates[0]));
    setPartialRegenerationEndDate((prev) =>
      monthDates.includes(prev) ? prev : monthDates[Math.min(monthDates.length - 1, 2)]
    );
  }, [monthDates]);

  useEffect(() => {
    if (workingShifts.length === 0) {
      setSelectedAiShiftIds([]);
      return;
    }

    setSelectedAiShiftIds((prev) => {
      const recommendedBaseIds =
        recommendedAiShiftIds.length > 0
          ? recommendedAiShiftIds
          : usesStrictTeamRecommendation
            ? []
            : defaultShiftPool.map((shift) => shift.id);
      const validShiftIds = new Set(recommendedBaseIds);
      const filtered = prev.filter((shiftId) => validShiftIds.has(shiftId));
      if (filtered.length > 0) return filtered;
      return recommendedBaseIds;
    });
  }, [defaultShiftPool, recommendedAiShiftIds, usesStrictTeamRecommendation]);

  const targetStaffs = useMemo(() => {
    const scopedDepartments = new Set(
      [selectedDepartment, ...includedDepartments]
        .map((department) => String(department || '').trim())
        .filter(Boolean)
    );
    return activeStaffs.filter((staff) => {
      if (selectedCompany && staff.company !== selectedCompany) return false;
      if (selectedDepartment && selectedDepartment !== '전체 부서') {
        return scopedDepartments.has(getDepartmentName(staff));
      }
      return true;
    });
  }, [activeStaffs, includedDepartments, selectedCompany, selectedDepartment]);

  const orderedTargetStaffIds = useMemo(
    () => targetStaffs.map((staff) => String(staff.id)),
    [targetStaffs]
  );
  const enabledTargetStaffs = useMemo(
    () => targetStaffs.filter((staff) => staffConfigs[String(staff.id)]?.enabled !== false),
    [staffConfigs, targetStaffs]
  );
  const effectiveTargetStaffConfigs = useMemo(() => {
    const nextMap = new Map<string, StaffConfig>();

    targetStaffs.forEach((staff, index) => {
      nextMap.set(
        String(staff.id),
        staffConfigs[String(staff.id)] ||
          buildInitialConfig(
            staff,
            index,
            defaultShiftOrder.length ? defaultShiftOrder : defaultShiftPool,
            monthDates.length
          )
      );
    });

    return nextMap;
  }, [defaultShiftOrder, defaultShiftPool, monthDates.length, staffConfigs, targetStaffs]);
  const defaultWizardSelectedStaffIds = useMemo(() => {
    const enabledIds = orderedTargetStaffIds.filter((staffId) => staffConfigs[staffId]?.enabled !== false);
    return enabledIds.length > 0 ? enabledIds : orderedTargetStaffIds;
  }, [orderedTargetStaffIds, staffConfigs]);

  useEffect(() => {
    if (targetStaffs.length === 0) {
      setPreferredOffStaffId('');
      return;
    }

    setPreferredOffStaffId((prev) =>
      targetStaffs.some((staff) => String(staff.id) === prev) ? prev : String(targetStaffs[0].id)
    );
  }, [targetStaffs]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!selectedCompany || !selectedDepartment) {
      setPreferredOffSelections({});
      return;
    }

    try {
      const raw = window.localStorage.getItem(preferredOffStorageKey);
      if (!raw) {
        setPreferredOffSelections({});
        return;
      }

      const parsed = JSON.parse(raw);
      setPreferredOffSelections(normalizePreferredOffSelections(parsed, monthDateSet));
    } catch (error) {
      console.error('희망 OFF 로드 실패:', error);
      setPreferredOffSelections({});
    }
  }, [monthDateSet, preferredOffStorageKey, selectedCompany, selectedDepartment]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!selectedCompany || !selectedDepartment) return;

    try {
      const normalized = normalizePreferredOffSelections(preferredOffSelections, monthDateSet);
      if (Object.keys(normalized).length === 0) {
        window.localStorage.removeItem(preferredOffStorageKey);
        return;
      }

      window.localStorage.setItem(preferredOffStorageKey, JSON.stringify(normalized));
    } catch (error) {
      console.error('희망 OFF 저장 실패:', error);
    }
  }, [monthDateSet, preferredOffSelections, preferredOffStorageKey, selectedCompany, selectedDepartment]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!selectedCompany || !selectedDepartment) return;

    const targetStaffIdSet = new Set(targetStaffs.map((staff) => String(staff.id)));
    try {
      const raw = window.localStorage.getItem(staffNightRangeStorageKey);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      const normalized = normalizeStoredStaffNightRanges(parsed, targetStaffIdSet, monthDates.length);
      if (Object.keys(normalized).length === 0) return;

      setStaffConfigs((prev) => {
        const next = { ...prev };
        targetStaffs.forEach((staff, index) => {
          const staffId = String(staff.id);
          const stored = normalized[staffId];
          if (!stored) return;
          const current =
            next[staffId] ||
            buildInitialConfig(
              staff,
              index,
              defaultShiftOrder.length ? defaultShiftOrder : defaultShiftPool,
              monthDates.length
            );
          next[staffId] = {
            ...current,
            minNightShiftCount: stored.minNightShiftCount,
            maxNightShiftCount: stored.maxNightShiftCount,
          };
        });
        return next;
      });
    } catch (error) {
      console.error('직원별 나이트 범위 로드 실패:', error);
    }
  }, [
    defaultShiftOrder,
    monthDates.length,
    selectedCompany,
    selectedDepartment,
    staffNightRangeStorageKey,
    targetStaffs,
    workingShifts,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!selectedCompany || !selectedDepartment) return;

    try {
      const normalized: StoredStaffNightRangeMap = {};
      targetStaffs.forEach((staff) => {
        const config = effectiveTargetStaffConfigs.get(String(staff.id));
        if (!config) return;
        if ((config.minNightShiftCount || 0) <= 0 && (config.maxNightShiftCount || 0) <= 0) return;
        normalized[String(staff.id)] = {
          minNightShiftCount: clampNightShiftCount(config.minNightShiftCount || 0, monthDates.length),
          maxNightShiftCount: clampNightShiftCount(config.maxNightShiftCount || 0, monthDates.length),
        };
      });

      if (Object.keys(normalized).length === 0) {
        window.localStorage.removeItem(staffNightRangeStorageKey);
        return;
      }

      window.localStorage.setItem(staffNightRangeStorageKey, JSON.stringify(normalized));
    } catch (error) {
      console.error('직원별 나이트 범위 저장 실패:', error);
    }
  }, [
    effectiveTargetStaffConfigs,
    monthDates.length,
    selectedCompany,
    selectedDepartment,
    staffNightRangeStorageKey,
    targetStaffs,
  ]);
  const effectivePlannerPattern = plannerPattern;
  const plannerShiftIds = useMemo(
    () =>
      [plannerPrimaryShiftId, plannerSecondaryShiftId, plannerTertiaryShiftId]
        .filter(Boolean)
        .filter((shiftId, index, list) => list.indexOf(shiftId) === index),
    [plannerPrimaryShiftId, plannerSecondaryShiftId, plannerTertiaryShiftId]
  );
  const effectivePlannerCustomPatternSequence = useMemo(
    () =>
      isCustomPattern(effectivePlannerPattern)
        ? normalizeCustomPatternSequence(plannerCustomPatternSequence, defaultShiftPool)
        : [],
    [defaultShiftPool, effectivePlannerPattern, plannerCustomPatternSequence]
  );
  const effectivePlannerWeeklyTemplateWeeks = useMemo(
    () =>
      isWeeklyTemplatePattern(effectivePlannerPattern)
        ? normalizeWeeklyTemplateWeeks(plannerWeeklyTemplateWeeks, [
            ...new Set(
              plannerWeeklyTemplateWeeks
                .map((week) => week.shiftId)
                .concat(plannerShiftIds)
                .filter(Boolean)
            ),
          ])
        : [],
    [effectivePlannerPattern, plannerShiftIds, plannerWeeklyTemplateWeeks]
  );

  useEffect(() => {
    if (!defaultShiftPool.length) return;
    const validShiftIds = new Set(defaultShiftPool.map((shift) => shift.id));
    const fallbackPrimary = defaultShiftOrder[0]?.id || defaultShiftPool[0]?.id || '';
    const fallbackSecondary = defaultShiftOrder[1]?.id || fallbackPrimary;
    const fallbackTertiary = defaultShiftOrder[2]?.id || fallbackSecondary || fallbackPrimary;

    setPlannerPrimaryShiftId((prev) => (!prev || !validShiftIds.has(prev) ? fallbackPrimary : prev));
    setPlannerSecondaryShiftId((prev) => (!prev || !validShiftIds.has(prev) ? fallbackSecondary : prev));
    setPlannerTertiaryShiftId((prev) => (!prev || !validShiftIds.has(prev) ? fallbackTertiary : prev));
  }, [defaultShiftOrder, defaultShiftPool]);

  useEffect(() => {
    if (!targetStaffs.length || !defaultShiftPool.length) return;
    const validShiftIds = new Set(defaultShiftPool.map((shift) => shift.id));
    const fallbackPrimary = defaultShiftOrder[0]?.id || defaultShiftPool[0]?.id || '';
    const fallbackSecondary = defaultShiftOrder[1]?.id || fallbackPrimary;
    const fallbackTertiary = defaultShiftOrder[2]?.id || fallbackSecondary || fallbackPrimary;

    setStaffConfigs((prev) => {
      const next: Record<string, StaffConfig> = {};
      targetStaffs.forEach((staff, index) => {
        const current = prev[staff.id];
        const baseConfig =
          current || buildInitialConfig(staff, index, defaultShiftOrder.length ? defaultShiftOrder : defaultShiftPool, monthDates.length);
        const nextPattern = baseConfig.pattern || inferPattern(staff, defaultShiftPool);
        const nextPrimaryShiftId = validShiftIds.has(baseConfig.primaryShiftId) ? baseConfig.primaryShiftId : fallbackPrimary;
        const nextSecondaryShiftId = validShiftIds.has(baseConfig.secondaryShiftId) ? baseConfig.secondaryShiftId : fallbackSecondary;
        const nextTertiaryShiftId = validShiftIds.has(baseConfig.tertiaryShiftId) ? baseConfig.tertiaryShiftId : fallbackTertiary;
        const nextWeeklyTemplateWeeks = normalizeWeeklyTemplateWeeks(
          baseConfig.weeklyTemplateWeeks || [],
          [
            ...new Set(
              (baseConfig.weeklyTemplateWeeks || [])
                .map((week) => week.shiftId)
                .concat([nextPrimaryShiftId, nextSecondaryShiftId, nextTertiaryShiftId])
                .filter(Boolean)
            ),
          ],
          baseConfig.weeklyTemplateWeeks?.length || 1
        );
        next[staff.id] = current
          ? {
              ...baseConfig,
              pattern: nextPattern,
              primaryShiftId: nextPrimaryShiftId,
              secondaryShiftId: nextSecondaryShiftId,
              tertiaryShiftId: nextTertiaryShiftId,
              nightShiftCount: isNightPattern(nextPattern)
                ? clampNightShiftCount(
                    Number.isFinite(baseConfig.nightShiftCount)
                      ? baseConfig.nightShiftCount
                      : inferDefaultNightShiftCount(nextPattern, monthDates.length),
                    monthDates.length
                  )
                : 0,
              customPatternSequence: normalizeCustomPatternSequence(baseConfig.customPatternSequence || [], defaultShiftPool),
              weeklyTemplateWeeks: nextWeeklyTemplateWeeks,
              blockedShiftBands: normalizeBlockedShiftBands(baseConfig.blockedShiftBands || []),
              blockedWeekdays: normalizeBlockedWeekdays(baseConfig.blockedWeekdays || []),
              avoidWeekendWork: Boolean(baseConfig.avoidWeekendWork),
              avoidHolidayWork: Boolean(baseConfig.avoidHolidayWork),
            }
          : {
              ...baseConfig,
              pattern: nextPattern,
              primaryShiftId: nextPrimaryShiftId,
              secondaryShiftId: nextSecondaryShiftId,
              tertiaryShiftId: nextTertiaryShiftId,
              nightShiftCount: isNightPattern(nextPattern)
                ? clampNightShiftCount(
                    Number.isFinite(baseConfig.nightShiftCount)
                      ? baseConfig.nightShiftCount
                      : inferDefaultNightShiftCount(nextPattern, monthDates.length),
                    monthDates.length
                  )
                : 0,
              customPatternSequence: normalizeCustomPatternSequence(baseConfig.customPatternSequence || [], defaultShiftPool),
              weeklyTemplateWeeks: nextWeeklyTemplateWeeks,
              blockedShiftBands: normalizeBlockedShiftBands(baseConfig.blockedShiftBands || []),
              blockedWeekdays: normalizeBlockedWeekdays(baseConfig.blockedWeekdays || []),
              avoidWeekendWork: Boolean(baseConfig.avoidWeekendWork),
              avoidHolidayWork: Boolean(baseConfig.avoidHolidayWork),
            };
      });
      return next;
    });
  }, [defaultShiftOrder, defaultShiftPool, monthDates.length, targetStaffs]);

  useEffect(() => {
    if (!isNightPattern(effectivePlannerPattern)) {
      setPlannerNightShiftCount(0);
      return;
    }

    setPlannerNightShiftCount((prev) => {
      return clampNightShiftCount(prev, monthDates.length);
    });
  }, [effectivePlannerPattern, monthDates.length]);

  useEffect(() => {
    if (!defaultShiftPool.length) return;
    if (!isCustomPattern(effectivePlannerPattern)) {
      setPlannerCustomPatternSequence([]);
      return;
    }

    setPlannerCustomPatternSequence((prev) => {
      const normalized = normalizeCustomPatternSequence(prev, defaultShiftPool).filter(
        (token) => token === OFF_SHIFT_TOKEN || plannerShiftIds.includes(token)
      );
      if (normalized.length > 0) return normalized;
      return buildDefaultCustomPatternSequence(plannerShiftIds);
    });
  }, [defaultShiftPool, effectivePlannerPattern, plannerShiftIds]);

  useEffect(() => {
    if (!defaultShiftPool.length) return;
    if (!isWeeklyTemplatePattern(effectivePlannerPattern)) {
      setPlannerWeeklyTemplateWeeks([]);
      return;
    }

    setPlannerWeeklyTemplateWeeks((prev) =>
      normalizeWeeklyTemplateWeeks(prev, plannerShiftIds, prev.length || 1)
    );
  }, [defaultShiftPool.length, effectivePlannerPattern, plannerShiftIds]);

  const wizardRequiredShiftCount = getRequiredShiftCount(wizardPattern);
  const wizardUsesCustomPattern = isCustomPattern(wizardPattern);
  const wizardUsesWeeklyTemplate = isWeeklyTemplatePattern(wizardPattern);
  const orderedWizardShiftIds = useMemo(
    () => defaultShiftPool.filter((shift) => wizardShiftIds.includes(shift.id)).map((shift) => shift.id),
    [defaultShiftPool, wizardShiftIds]
  );
  const effectiveWizardCustomPatternSequence = useMemo(
    () =>
      wizardUsesCustomPattern
        ? normalizeCustomPatternSequence(wizardCustomPatternSequence, defaultShiftPool)
        : [],
    [defaultShiftPool, wizardCustomPatternSequence, wizardUsesCustomPattern]
  );
  const effectiveWizardWeeklyTemplateWeeks = useMemo(
    () =>
      wizardUsesWeeklyTemplate
        ? normalizeWeeklyTemplateWeeks(
            wizardWeeklyTemplateWeeks,
            [
              ...new Set(
                wizardWeeklyTemplateWeeks
                  .map((week) => week.shiftId)
                  .concat(orderedWizardShiftIds)
                  .filter(Boolean)
              ),
            ],
            wizardWeeklyTemplateWeeks.length || 1
          )
        : [],
    [orderedWizardShiftIds, wizardUsesWeeklyTemplate, wizardWeeklyTemplateWeeks]
  );
  const userWizardPresets = useMemo(() => {
    const seen = new Set<string>();
    return savedWizardPresets
      .map((preset) => normalizePresetRecord(preset))
      .filter((preset): preset is RosterWizardPreset => preset !== null)
      .filter(
        (preset) =>
          isCustomPattern(preset.pattern) || isWeeklyTemplatePattern(preset.pattern)
      )
      .filter((preset) => {
        if (seen.has(preset.id)) return false;
        seen.add(preset.id);
        return true;
      });
  }, [savedWizardPresets]);
  const selectedWizardPreset = useMemo(
    () => userWizardPresets.find((preset) => preset.id === wizardSelectedPresetId) || null,
    [userWizardPresets, wizardSelectedPresetId]
  );
  const wizardSelectedStaffs = useMemo(
    () => targetStaffs.filter((staff) => wizardSelectedStaffIds.includes(String(staff.id))),
    [targetStaffs, wizardSelectedStaffIds]
  );
  const wizardExcludedStaffs = useMemo(
    () => targetStaffs.filter((staff) => !wizardSelectedStaffIds.includes(String(staff.id))),
    [targetStaffs, wizardSelectedStaffIds]
  );
  const wizardOverrideDateOptions = useMemo(() => monthDates.slice(0, -1), [monthDates]);
  const wizardOverrideShiftOptions = useMemo(
    () =>
      orderedWizardShiftIds.length > 0
        ? defaultShiftPool.filter((shift) => orderedWizardShiftIds.includes(shift.id))
        : defaultShiftOrder.length > 0
          ? defaultShiftOrder
          : defaultShiftPool,
    [defaultShiftOrder, defaultShiftPool, orderedWizardShiftIds]
  );

  useEffect(() => {
    if (!wizardOpen) return;
    const validStaffIds = new Set(orderedTargetStaffIds);
    setWizardSelectedStaffIds((prev) => {
      const filtered = prev.filter((staffId) => validStaffIds.has(staffId));
      if (filtered.length > 0) return filtered;
      return defaultWizardSelectedStaffIds;
    });
  }, [defaultWizardSelectedStaffIds, orderedTargetStaffIds, wizardOpen]);

  useEffect(() => {
    if (!wizardOpen || !wizardSelectedPresetId) return;

    setWizardShiftIds((prev) =>
      defaultShiftPool.filter((shift) => prev.includes(shift.id)).map((shift) => shift.id)
    );
  }, [defaultShiftPool, wizardOpen, wizardSelectedPresetId]);

  useEffect(() => {
    if (!wizardOpen || !wizardSelectedPresetId || !wizardUsesCustomPattern) return;

    setWizardCustomPatternSequence((prev) => {
      const normalized = normalizeCustomPatternSequence(prev, defaultShiftPool).filter(
        (token) => token === OFF_SHIFT_TOKEN || orderedWizardShiftIds.includes(token)
      );
      if (normalized.length > 0) return normalized;
      return buildDefaultCustomPatternSequence(orderedWizardShiftIds);
    });
  }, [orderedWizardShiftIds, wizardOpen, wizardSelectedPresetId, wizardUsesCustomPattern, workShifts]);

  useEffect(() => {
    if (!wizardOpen || !wizardSelectedPresetId) return;
    if (!wizardUsesWeeklyTemplate) {
      setWizardWeeklyTemplateWeeks([]);
      return;
    }

    setWizardWeeklyTemplateWeeks((prev) =>
      normalizeWeeklyTemplateWeeks(prev, orderedWizardShiftIds, prev.length || 1)
    );
  }, [orderedWizardShiftIds, wizardOpen, wizardSelectedPresetId, wizardUsesWeeklyTemplate]);

  useEffect(() => {
    if (!wizardOpen || !wizardSelectedPresetId) return;
    if (!isNightPattern(wizardPattern)) {
      setWizardNightShiftCount(0);
      return;
    }

    setWizardNightShiftCount((prev) => {
      return clampNightShiftCount(prev, monthDates.length);
    });
  }, [monthDates.length, wizardOpen, wizardPattern, wizardSelectedPresetId]);

  useEffect(() => {
    if (!wizardOpen) return;

    const defaultNextShiftId = wizardOverrideShiftOptions[0]?.id || '';
    const lastDateIndex = Math.max(wizardOverrideDateOptions.length - 1, 0);

    setWizardOffOverrides((prev) => {
      const next: Record<string, WizardOffOverride> = {};

      wizardSelectedStaffIds.forEach((staffId, index) => {
        const current = prev[staffId];
        const fallbackOffDate = wizardOverrideDateOptions[Math.min(index, lastDateIndex)] || '';
        const nextShiftId =
          current?.nextShiftId && wizardOverrideShiftOptions.some((shift) => shift.id === current.nextShiftId)
            ? current.nextShiftId
            : defaultNextShiftId;

        next[staffId] = {
          enabled: current?.enabled ?? false,
          offDate:
            current?.offDate && wizardOverrideDateOptions.includes(current.offDate)
              ? current.offDate
              : fallbackOffDate,
          nextShiftId,
        };
      });

      return next;
    });
  }, [wizardOpen, wizardOverrideDateOptions, wizardOverrideShiftOptions, wizardSelectedStaffIds]);

  useEffect(() => {
    if (!wizardOpen) return;

    const nextNightRanges: Record<string, WizardNightRangeDraft> = {};
    const nextBlockPreferences: Record<string, StaffBlockPreference> = {};
    const nextDedicatedBands: Record<string, CoverageBand | ''> = {};
    const nextRestrictions: Record<string, StaffRestrictionDraft> = {};
    const nextCoverageRoles: Record<string, string[]> = {};

    targetStaffs.forEach((staff, index) => {
      const staffId = String(staff.id);
      const config =
        effectiveTargetStaffConfigs.get(staffId) ||
        buildInitialConfig(
          staff,
          index,
          defaultShiftOrder.length ? defaultShiftOrder : defaultShiftPool,
          monthDates.length
        );

      nextNightRanges[staffId] = {
        minNightShiftCount: clampNightShiftCount(config.minNightShiftCount || 0, monthDates.length),
        maxNightShiftCount: clampNightShiftCount(config.maxNightShiftCount || 0, monthDates.length),
      };
      nextBlockPreferences[staffId] = normalizeStaffBlockPreference(config.blockPreference);
      nextDedicatedBands[staffId] = staffDedicatedBandOverrides[staffId] || '';
      nextRestrictions[staffId] = {
        blockedShiftBands: normalizeBlockedShiftBands(config.blockedShiftBands || []),
        blockedWeekdays: normalizeBlockedWeekdays(config.blockedWeekdays || []),
        avoidWeekendWork: Boolean(config.avoidWeekendWork),
        avoidHolidayWork: Boolean(config.avoidHolidayWork),
        preferWeekendOff: Boolean(config.preferWeekendOff),
        preferHolidayOff: Boolean(config.preferHolidayOff),
        avoidConsecutiveEvening: Boolean(config.avoidConsecutiveEvening),
        preferEarlyMonthNight: Boolean(config.preferEarlyMonthNight),
      };
      nextCoverageRoles[staffId] = expandCoverageRoleTags(staffCoverageRoleTags[staffId] || []);
    });

    setWizardNightRangeDrafts(nextNightRanges);
    setWizardBlockPreferenceDrafts(nextBlockPreferences);
    setWizardDedicatedBandDrafts(nextDedicatedBands);
    setWizardStaffRestrictionDrafts(nextRestrictions);
    setWizardCoverageRoleDrafts(nextCoverageRoles);
    setWizardPairRules(plannerPairRules);
  }, [
    defaultShiftOrder,
    defaultShiftPool,
    effectiveTargetStaffConfigs,
    monthDates.length,
    plannerPairRules,
    staffCoverageRoleTags,
    staffDedicatedBandOverrides,
    targetStaffs,
    wizardOpen,
  ]);

  const preferredOffEntries = useMemo(
    () =>
      targetStaffs
        .map((staff) => ({
          staff,
          dates: [...(preferredOffSelections[String(staff.id)] || [])].sort(),
        }))
        .filter((entry) => entry.dates.length > 0),
    [preferredOffSelections, targetStaffs]
  );
  const preferredOffCount = useMemo(
    () => preferredOffEntries.reduce((sum, entry) => sum + entry.dates.length, 0),
    [preferredOffEntries]
  );

  const addPreferredOffDate = () => {
    if (!preferredOffStaffId || !preferredOffDate) return;

    setPreferredOffSelections((prev) => {
      const nextDates = [...new Set([...(prev[preferredOffStaffId] || []), preferredOffDate])].sort();
      return {
        ...prev,
        [preferredOffStaffId]: nextDates,
      };
    });
  };

  const removePreferredOffDate = useCallback((staffId: string, date: string) => {
    setPreferredOffSelections((prev) => {
      const nextDates = (prev[staffId] || []).filter((item) => item !== date);
      if (nextDates.length === 0) {
        const { [staffId]: _removed, ...rest } = prev;
        return rest;
      }

      return {
        ...prev,
        [staffId]: nextDates,
      };
    });
  }, []);

  const clearPreferredOffForStaff = useCallback((staffId: string) => {
    setPreferredOffSelections((prev) => {
      const { [staffId]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const clearAllPreferredOff = () => {
    setPreferredOffSelections({});
  };

  const setManualAssignment = ({
    staffId,
    date,
    nextShiftId,
    baseShiftId,
  }: {
    staffId: string;
    date: string;
    nextShiftId: string;
    baseShiftId: string;
  }) => {
    const assignmentKey = buildAssignmentKey(staffId, date);
    setManualAssignments((prev) => {
      if (nextShiftId === baseShiftId) {
        const { [assignmentKey]: _removed, ...rest } = prev;
        return rest;
      }

      return {
        ...prev,
        [assignmentKey]: nextShiftId,
      };
    });
  };

  const previewRows = useMemo<PreviewRow[]>(() => {
    if (!aiRecommendation?.staffPlans?.length) return [];

    const validShiftIds = new Set(defaultShiftPool.map((shift) => shift.id));
    const planByStaffId = new Map(
      aiRecommendation.staffPlans.map((plan) => [String(plan.staffId || ''), plan])
    );

    return enabledTargetStaffs
      .map((staff) => {
        const plan = planByStaffId.get(String(staff.id));
        if (!plan) return null;

        const baseSchedule = normalizeAiAssignments(plan.assignments, monthDates, validShiftIds);
        const config: StaffConfig = {
          enabled: true,
          pattern: plan.modeLabel || aiRecommendation.teamAnalysis?.workMode || '자동 생성',
          primaryShiftId: baseSchedule.find((shiftId) => shiftId !== OFF_SHIFT_TOKEN) || '',
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
        const resolvedConfig =
          effectiveTargetStaffConfigs.get(String(staff.id)) ||
          ({
            enabled: true,
            pattern: plan.modeLabel || aiRecommendation.teamAnalysis?.workMode || '',
            primaryShiftId: baseSchedule.find((shiftId) => shiftId !== OFF_SHIFT_TOKEN) || '',
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
          } satisfies StaffConfig);
        const cells = monthDates.map((date, index) => {
          const baseShiftId = baseSchedule[index] || OFF_SHIFT_TOKEN;
          const manualShiftId = manualAssignments[buildAssignmentKey(String(staff.id), date)];
          const shiftId = manualShiftId || baseShiftId;
          const shiftName = getShiftNameById(shiftId, workShifts);
          return {
            date,
            baseShiftId,
            shiftId,
            shiftName,
            code: getShiftCode(shiftName),
            badgeClass: getShiftBadgeClass(shiftName),
            isManual: Boolean(manualShiftId),
          };
        });

        return {
          staff,
          config: resolvedConfig,
          cells,
          counts: {
            work: cells.filter((cell) => cell.code !== 'OFF').length,
            off: cells.filter((cell) => cell.code === 'OFF').length,
            night: cells.filter((cell) => cell.code === 'N').length,
          },
        };
      })
      .filter((row): row is PreviewRow => Boolean(row));
  }, [
    aiRecommendation,
    defaultShiftPool,
    effectiveTargetStaffConfigs,
    enabledTargetStaffs,
    manualAssignments,
    monthDates,
    workShifts,
  ]);

  const serializePreviewRows = (rows: PreviewRow[]) =>
    rows.map((row) => ({
      staffId: String(row.staff.id),
      staffName: String(row.staff.name || row.staff.employee_name || `직원 ${row.staff.id}`),
      cells: row.cells.map((cell) => ({
        date: cell.date,
        shiftId: cell.shiftId,
        shiftName: cell.shiftName,
        code: cell.code,
        isManual: cell.isManual,
      })),
    }));

  const persistRosterSnapshots = (
    nextSnapshots: StoredRosterSnapshot<GeminiRosterRecommendation>[],
    nextSelectedSnapshotId?: string
  ) => {
    setRosterSnapshots(nextSnapshots);
    setSelectedSnapshotId(nextSelectedSnapshotId || nextSnapshots[0]?.id || '');
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(rosterSnapshotStorageKey, JSON.stringify(nextSnapshots));
    } catch (error) {
      console.error('근무표 스냅샷 저장 실패:', error);
    }
  };

  const captureRosterSnapshot = ({
    source,
    label,
    warningCount,
  }: {
    source: 'generated' | 'saved';
    label: string;
    warningCount: number;
  }) => {
    if (!selectedCompany || !selectedDepartment || !selectedMonth || previewRows.length === 0) return null;

    const snapshot: StoredRosterSnapshot<GeminiRosterRecommendation> = {
      id: `${source}-${Date.now()}`,
      label,
      source,
      createdAt: new Date().toISOString(),
      month: selectedMonth,
      company: selectedCompany,
      department: rosterScopeLabel,
      summary: {
        staffCount: previewRows.length,
        manualCount: Object.keys(manualAssignments).length,
        warningCount,
      },
      recommendation: aiRecommendation,
      manualAssignments: { ...manualAssignments },
      rows: serializePreviewRows(previewRows),
      leaveAppliedSummary,
    };

    const nextSnapshots = [snapshot, ...rosterSnapshots].slice(0, 12);
    persistRosterSnapshots(nextSnapshots, snapshot.id);
    return snapshot;
  };

  const previewGenerationRule = useMemo(
    () =>
      applyWardCoverageDefaults(
        activeGenerationRuleOverride ||
          selectedGenerationRule ||
          buildFallbackGenerationRuleForDepartment(
            selectedDepartment,
            selectedCompany,
            monthDates.length
          ),
        selectedDepartment
      ),
    [
      activeGenerationRuleOverride,
      monthDates.length,
      selectedCompany,
      selectedDepartment,
      selectedGenerationRule,
    ]
  );

  useEffect(() => {
    setWizardRuleDraft(previewGenerationRule);
  }, [previewGenerationRule]);

  const staffPlanningMeta = useMemo<StaffPlanningMeta[]>(() => {
    const referenceDateKey = getMonthEndDateKey(monthDates);
    const planningShifts = defaultShiftPool.filter((shift) => selectedAiShiftIds.includes(shift.id));

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
                  .filter((shift) => resolveShiftBand(shift) === getDedicatedBandFromMode(forcedMode))
                  .map((shift) => shift.id),
                rationale: '마법사에서 지정한 전담 시간대를 기준으로 생성합니다.',
                source: 'auto' as const,
              }
            : autoResolvedGroup;
      const coverageRoleTags = expandCoverageRoleTags(staffCoverageRoleTags[staffId] || []);

      return {
        staff,
        staffId,
        config,
        resolvedGroup,
        resolvedGroupMode: resolvedGroup?.mode || defaultPlannerMode,
        resolvedGroupLabel: resolvedGroup?.label || '기본',
        resolvedGroupReason: resolvedGroup?.rationale || '기본 팀 규칙을 적용합니다.',
        dedicatedBand:
          dedicatedBandOverride || getDedicatedBandFromMode(resolvedGroup?.mode || defaultPlannerMode),
        coverageRoleTags,
        coverageRoleMatcherText: buildPlannerCoverageRoleMatcherText(staff, coverageRoleTags),
        isSeniorStaff: isSeniorPlannerStaff(staff),
        isNewNurse: isStaffNewNurse(staff, referenceDateKey),
      };
    });
  }, [
    defaultPlannerMode,
    defaultShiftOrder,
    defaultShiftPool,
    effectiveTargetStaffConfigs,
    enabledTargetStaffs,
    monthDates,
    selectedAiShiftIds,
    selectedPatternProfile,
    staffCoverageRoleTags,
    staffDedicatedBandOverrides,
    workShifts,
  ]);

  const previewDailyCoverage = useMemo<PreviewDailyCoverage[]>(() => {
    if (previewRows.length === 0) return [];

    return monthDates.map((date, index) => {
      const { targets, sourceLabel } = getCoverageTargetsForDate(previewGenerationRule, date);
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
        coverage.statusDetail = `${shortages.join(' · ')} · ${sourceLabel}`;
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
          statusDetail: `${sourceLabel} · 기준 초과 배치`,
        };
      }

      return coverage;
    });
  }, [monthDates, previewGenerationRule, previewRows]);

  const structuralStaffingGap = useMemo(() => {
    const requiredHeadcount = monthDates.reduce((maxRequired, dateKey) => {
      const { targets } = getCoverageTargetsForDate(previewGenerationRule, dateKey);
      return Math.max(maxRequired, targets.day + targets.evening + targets.night);
    }, 0);
    const availableHeadcount = enabledTargetStaffs.length;
    const shortageCount = Math.max(0, requiredHeadcount - availableHeadcount);

    return {
      requiredHeadcount,
      availableHeadcount,
      shortageCount,
      isShortage: shortageCount > 0,
    };
  }, [enabledTargetStaffs.length, monthDates, previewGenerationRule]);

  const rosterFeasibilityIssues = useMemo<RosterFeasibilityIssue[]>(() => {
    const issues: RosterFeasibilityIssue[] = [];

    if (structuralStaffingGap.isShortage) {
      issues.push({
        id: 'minimum-headcount-shortage',
        severity: 'blocking',
        targetTestId: 'roster-team-select',
        title: '최소 인원 합계 초과',
        detail: '최소 인원 합계가 현재 직원 수를 초과합니다',
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
      const dedicatedAvailable = staffPlanningMeta.filter((meta) => meta.dedicatedBand === band).length;
      const seniorAvailable = staffPlanningMeta.filter(
        (meta) => meta.isSeniorStaff && canStaffCoverBand(meta, band)
      ).length;

      if (dedicatedTarget > 0 && dedicatedAvailable < dedicatedTarget) {
        issues.push({
          id: `dedicated-${band}-shortage`,
          severity: 'blocking',
          targetTestId: 'roster-active-generation-rule-summary',
          title: `${band.toUpperCase()} 전담 부족`,
          detail: `${band.toUpperCase()} 타임 전담 최소 인원을 만족할 수 없습니다`,
        });
      }

      if (seniorTarget > 0 && seniorAvailable < seniorTarget) {
        issues.push({
          id: `senior-${band}-shortage`,
          severity: 'blocking',
          targetTestId: 'roster-active-generation-rule-summary',
          title: `${band.toUpperCase()} 선임 부족`,
          detail: `${band.toUpperCase()} 타임 선임 최소 인원을 만족할 수 없습니다`,
        });
      }
    });

    previewGenerationRule.roleCoverageRules.forEach((roleRule) => {
      (['day', 'evening', 'night'] as const).forEach((band) => {
        const target = getRoleCoverageTargetByBand(roleRule, band);
        if (target <= 0) return;
        const available = staffPlanningMeta.filter(
          (meta) =>
            canStaffCoverBand(meta, band) && coverageRoleMatchesRule(meta.coverageRoleMatcherText, roleRule)
        ).length;
        if (available >= target) return;

        issues.push({
          id: `role-${roleRule.id}-${band}`,
          severity: 'warning',
          targetTestId: 'roster-active-generation-rule-summary',
          title: `${roleRule.label} ${band.toUpperCase()} 부족`,
          detail: `${roleRule.label} ${band.toUpperCase()} 요구 인원을 모두 채우기 어렵습니다`,
        });
      });
    });

    return issues;
  }, [previewGenerationRule, staffPlanningMeta, structuralStaffingGap]);

  const blockingRosterIssues = useMemo(
    () => rosterFeasibilityIssues.filter((issue) => issue.severity === 'blocking'),
    [rosterFeasibilityIssues]
  );

  const summary = useMemo(() => {
    return {
      staffCount: targetStaffs.length,
      enabledCount: previewRows.length,
      shiftCount: workingShifts.length,
      manualCount: Object.keys(manualAssignments).length,
    };
  }, [manualAssignments, previewRows.length, targetStaffs.length, workingShifts.length]);

  const fairnessScoreboard = useMemo(() => {
    if (previewRows.length === 0) {
      return {
        averageNight: 0,
        averageWeekend: 0,
        averageHoliday: 0,
        averageConsecutive: 0,
        averageDiversity: 0,
        holidayCount: 0,
        rows: [] as Array<{
          staffId: string;
          staffName: string;
          nightCount: number;
          weekendWorkCount: number;
          holidayWorkCount: number;
          maxConsecutiveWorkDays: number;
          diversityScore: number;
          longestSameBandStreak: number;
          fairnessScore: number;
          note: string;
        }>,
      };
    }

    const weekendDateSet = new Set(
      monthDates.filter((date) => {
        const weekday = new Date(`${date}T00:00:00`).getDay();
        return weekday === 0 || weekday === 6;
      })
    );
    const holidayDateSet = new Set(monthDates.filter((date) => isKoreanPublicHoliday(date)));
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
      baseRows.reduce((sum, row) => sum + row.nightCount, 0) / Math.max(baseRows.length, 1);
    const averageWeekend =
      baseRows.reduce((sum, row) => sum + row.weekendWorkCount, 0) / Math.max(baseRows.length, 1);
    const averageHoliday =
      baseRows.reduce((sum, row) => sum + row.holidayWorkCount, 0) / Math.max(baseRows.length, 1);
    const averageConsecutive =
      baseRows.reduce((sum, row) => sum + row.maxConsecutiveWorkDays, 0) / Math.max(baseRows.length, 1);
    const averageDiversity =
      baseRows.reduce((sum, row) => sum + row.diversityScore, 0) / Math.max(baseRows.length, 1);

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
      if (row.maxConsecutiveWorkDays > averageConsecutive + 1) notes.push('연속근무 주의');

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
  }, [monthDates, previewRows]);

  const rosterWarningReport = useMemo(() => {
    const items: Array<{
      id: string;
      category: 'headcount' | 'coverage' | 'night-range' | 'off-days' | 'restriction' | 'pair-rule';
      tone: 'red' | 'amber' | 'yellow';
      severity: number;
      targetTestId: string;
      title: string;
      detail: string;
    }> = [];
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
        detail: `최소 기준 ${structuralStaffingGap.requiredHeadcount}명 · 현재 ${structuralStaffingGap.availableHeadcount}명`,
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
      const minimumNightCount = clampNightShiftCount(config?.minNightShiftCount || 0, monthDates.length);
      const maximumNightCount = clampNightShiftCount(config?.maxNightShiftCount || 0, monthDates.length);
      const minimumOffDays = Math.max(0, Math.floor(previewGenerationRule.minMonthlyOffDays || 0));

      if (minimumNightCount > 0 && row.counts.night < minimumNightCount) {
        items.push({
          id: `night-min-${row.staff.id}`,
          category: 'night-range',
          tone: 'amber',
          severity: 2,
          targetTestId: `roster-config-row-${row.staff.id}`,
          title: `${row.staff.name} 나이트 최소 미달`,
          detail: `설정 ${minimumNightCount}회 · 실제 ${row.counts.night}회`,
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
          detail: `설정 ${maximumNightCount}회 · 실제 ${row.counts.night}회`,
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
          detail: `기준 ${minimumOffDays}일 · 실제 ${row.counts.off}일`,
        });
      }
      if (config) {
        const blockedBandSet = new Set(normalizeBlockedShiftBands(config.blockedShiftBands || []));
        const blockedWeekdaySet = new Set(normalizeBlockedWeekdays(config.blockedWeekdays || []));
        const restrictionBlockedDateSet = buildStaffRestrictionBlockedDateSet(config, monthDates);
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
          restrictionFragments.push(`blocked bands ${summarizeRosterDateLabels(blockedBandDates)}`);
        }
        if (blockedWeekdayDates.length > 0) {
          restrictionFragments.push(`blocked weekdays ${summarizeRosterDateLabels(blockedWeekdayDates)}`);
        }
        if (weekendDates.length > 0) {
          restrictionFragments.push(`weekend restricted ${summarizeRosterDateLabels(weekendDates)}`);
        }
        if (holidayDates.length > 0) {
          restrictionFragments.push(`holiday restricted ${summarizeRosterDateLabels(holidayDates)}`);
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
      }
    });

    activePairRules.forEach((pairRule) => {
      const primaryRow = previewRowByStaffId.get(pairRule.primaryStaffId);
      const secondaryRow = previewRowByStaffId.get(pairRule.secondaryStaffId);
      if (!primaryRow || !secondaryRow) return;

      const violatedDates = monthDates.filter((_, dateIndex) => {
        const primaryShiftId = primaryRow.cells[dateIndex]?.shiftId || OFF_SHIFT_TOKEN;
        const secondaryShiftId = secondaryRow.cells[dateIndex]?.shiftId || OFF_SHIFT_TOKEN;
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
        detail: `${pairRule.band === 'night' ? 'NIGHT' : '같은 근무'} ${pairRule.mode === 'together' ? '같이' : '분리'} · ${summarizeRosterDateLabels(violatedDates)}`,
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
  }, [
    effectiveTargetStaffConfigs,
    monthDates,
    plannerPairRules,
    previewDailyCoverage,
    previewGenerationRule,
    previewRows,
    structuralStaffingGap,
    workShifts,
  ]);

  const selectedRosterSnapshot = useMemo(
    () => rosterSnapshots.find((snapshot) => snapshot.id === selectedSnapshotId) || null,
    [rosterSnapshots, selectedSnapshotId]
  );

  const rosterSnapshotComparison = useMemo(() => {
    if (!selectedRosterSnapshot || previewRows.length === 0) return null;

    const currentAssignments = new Map<string, string>();
    const currentNames = new Map<string, string>();
    previewRows.forEach((row) => {
      currentNames.set(String(row.staff.id), String(row.staff.name || row.staff.employee_name || `직원 ${row.staff.id}`));
      row.cells.forEach((cell) => {
        currentAssignments.set(`${row.staff.id}:${cell.date}`, cell.shiftId);
      });
    });

    const snapshotAssignments = new Map<string, string>();
    const snapshotNames = new Map<string, string>();
    selectedRosterSnapshot.rows.forEach((row) => {
      snapshotNames.set(row.staffId, row.staffName);
      row.cells.forEach((cell) => {
        snapshotAssignments.set(`${row.staffId}:${cell.date}`, cell.shiftId);
      });
    });

    const allKeys = new Set([...currentAssignments.keys(), ...snapshotAssignments.keys()]);
    const changedStaffIds = new Set<string>();
    const changedDates = new Set<string>();

    allKeys.forEach((key) => {
      if ((currentAssignments.get(key) || '') === (snapshotAssignments.get(key) || '')) return;
      const [staffId, date] = key.split(':');
      changedStaffIds.add(staffId);
      changedDates.add(date);
    });

    const changedStaffPreview = Array.from(changedStaffIds)
      .slice(0, 5)
      .map((staffId) => currentNames.get(staffId) || snapshotNames.get(staffId) || staffId);

    return {
      changedCellCount: allKeys.size === 0 ? 0 : Array.from(allKeys).filter((key) => (currentAssignments.get(key) || '') !== (snapshotAssignments.get(key) || '')).length,
      changedStaffCount: changedStaffIds.size,
      changedDateCount: changedDates.size,
      changedStaffPreview,
    };
  }, [previewRows, selectedRosterSnapshot]);

  const activeGenerationRuleSummaryItems = useMemo(() => {
    const items = [
      `생성 성향 ${getGenerationStyleMeta(previewGenerationRule.generationStyle).label}`,
      `최소 D/E/N ${previewGenerationRule.minDayStaff}/${previewGenerationRule.minEveningStaff}/${previewGenerationRule.minNightStaff}`,
      `나이트 후 OFF ${previewGenerationRule.offDaysAfterNight}일`,
      previewGenerationRule.blockNewNurseSoloNight ? '신규 단독 NIGHT 금지' : '신규 단독 NIGHT 허용',
      `역할 슬롯 ${previewGenerationRule.roleCoverageRules.length}개`,
    ];
    const roleCoverageSummary = summarizeRoleCoverageRules(previewGenerationRule.roleCoverageRules);
    if (roleCoverageSummary.length > 0) {
      items.push(...roleCoverageSummary);
    }
    return items;
  }, [previewGenerationRule]);
  const wizardRuleSummaryItems = useMemo(
    () => buildGenerationRuleSummaryItems(wizardRuleDraft),
    [wizardRuleDraft]
  );

  const reviewPanelWarnings = useMemo(() => {
    const blockingItems = blockingRosterIssues.map((issue) => ({
      id: issue.id,
      title: issue.title,
      detail: issue.detail,
      priority: 'fatal' as const,
      targetTestId: issue.targetTestId,
    }));
    const reportItems = rosterWarningReport.items.slice(0, 6).map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.detail,
      priority: item.severity >= 3 ? ('warning' as const) : ('info' as const),
      targetTestId: item.targetTestId,
    }));

    return [...blockingItems, ...reportItems].filter(
      (item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index
    );
  }, [blockingRosterIssues, rosterWarningReport.items]);

  const reviewPanelSuggestions = useMemo(() => {
    const suggestions: Array<{
      id: string;
      title: string;
      detail: string;
      targetTestId: string;
    }> = [];

    if (blockingRosterIssues.length > 0) {
      suggestions.push({
        id: 'blocking-check',
        title: '차단 경고 먼저 확인',
        detail: 'AI 생성과 저장 전에 차단 경고 요약과 경고 리포트를 먼저 확인하세요.',
        targetTestId: 'roster-blocking-warning-summary',
      });
    }
    if (Object.keys(manualAssignments).length > 0) {
      suggestions.push({
        id: 'manual-review',
        title: '수동 수정 영향 점검',
        detail: '수동 수정한 셀이 있다면 영향 패널과 리뷰 패널에서 다시 확인하세요.',
        targetTestId: 'roster-manual-impact-panel',
      });
    }
    if (preferredOffCount > 0) {
      suggestions.push({
        id: 'preferred-off-review',
        title: '희망 OFF 반영 확인',
        detail: '희망 OFF와 승인 휴가가 생성 요약과 미리보기에서 OFF로 반영됐는지 확인하세요.',
        targetTestId: 'preferred-off-manager',
      });
    }

    return suggestions;
  }, [blockingRosterIssues.length, manualAssignments, preferredOffCount]);

  const rosterPlanComparisons = useMemo<RosterPlanComparison[]>(() => {
    if (previewRows.length === 0 || fairnessScoreboard.rows.length === 0) return [];

    const averageFairness =
      fairnessScoreboard.rows.reduce((sum, row) => sum + row.fairnessScore, 0) /
      Math.max(fairnessScoreboard.rows.length, 1);
    const baselineDeltas: Record<RosterGenerationStyle, { fairness: number; diversity: number; warnings: number }> = {
      balanced: { fairness: 0, diversity: 0, warnings: 0 },
      block: { fairness: 4, diversity: -10, warnings: -1 },
      variety: { fairness: -3, diversity: 10, warnings: 1 },
      stable: { fairness: 2, diversity: -2, warnings: -1 },
    };
    const activeDelta = baselineDeltas[previewGenerationRule.generationStyle] || baselineDeltas.balanced;
    const totalCells = previewRows.reduce((sum, row) => sum + row.cells.length, 0);

    return GENERATION_STYLE_OPTIONS.map((option) => {
      const delta = baselineDeltas[option.value] || baselineDeltas.balanced;
      const fairnessScore = Math.max(
        0,
        Math.min(100, Math.round(averageFairness - activeDelta.fairness + delta.fairness))
      );
      const diversityScore = Math.max(
        0,
        Math.min(100, Math.round(fairnessScoreboard.averageDiversity - activeDelta.diversity + delta.diversity))
      );
      const warningCount = Math.max(
        0,
        reviewPanelWarnings.length - activeDelta.warnings + delta.warnings
      );
      const changedCells =
        option.value === previewGenerationRule.generationStyle
          ? 0
          : Math.round(totalCells * (option.value === 'variety' ? 0.24 : option.value === 'block' ? 0.18 : 0.14));

      return {
        id: `compare-${option.value}`,
        title: option.label,
        description: option.detail,
        style: option.value,
        fairnessScore,
        diversityScore,
        warningCount,
        changedCells,
        recommendation:
          option.value === previewGenerationRule.generationStyle
            ? '현재 적용 중인 편성 성향입니다.'
            : option.value === 'variety'
              ? '반복 패턴을 줄이고 D/E/N 흐름을 더 유연하게 만들고 싶을 때 적합합니다.'
              : option.value === 'block'
                ? '긴 블록 편성과 안정적인 교대 흐름을 선호할 때 적합합니다.'
                : option.value === 'stable'
                  ? '전담자와 기존 흐름을 최대한 유지하면서 일부만 보정할 때 적합합니다.'
                  : '야간, OFF, 주말 분산을 평균적으로 유지할 때 적합합니다.',
      };
    });
  }, [
    fairnessScoreboard.averageDiversity,
    fairnessScoreboard.rows,
    previewGenerationRule.generationStyle,
    previewRows,
    reviewPanelWarnings.length,
  ]);

  const saveBlockingWarnings = useMemo(() => {
    const issueItems = blockingRosterIssues.map((issue) => ({
      id: issue.id,
      title: issue.title,
      detail: issue.detail,
      targetTestId: issue.targetTestId,
    }));
    const reportItems = rosterWarningReport.items
      .filter((item) => item.severity >= 2)
      .map((item) => ({
        id: item.id,
        title: item.title,
        detail: item.detail,
        targetTestId: item.targetTestId,
      }));

    return [...issueItems, ...reportItems].filter(
      (item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index
    );
  }, [blockingRosterIssues, rosterWarningReport.items]);

  const selectedManualCellDetails = useMemo(() => {
    if (!selectedManualCell) return null;

    const row = previewRows.find((previewRow) => String(previewRow.staff.id) === selectedManualCell.staffId);
    if (!row) return null;
    const cell = row.cells.find((previewCell) => previewCell.date === selectedManualCell.date);
    if (!cell) return null;

    const shiftMap = new Map(defaultShiftPool.map((shift) => [shift.id, shift]));
    const staffMeta = staffPlanningMeta.find((meta) => meta.staffId === selectedManualCell.staffId) || null;
    const currentBand = getAssignedShiftBand(cell.shiftId, shiftMap);
    const criticalNightCoverage =
      currentBand === 'night' &&
      ((previewGenerationRule.minDedicatedNightStaff > 0 && staffMeta?.dedicatedBand === 'night') ||
        (previewGenerationRule.minSeniorNightStaff > 0 && staffMeta?.isSeniorStaff));
    const explanations = [
      staffMeta?.resolvedGroupReason
        ? `기본 배치 기준: ${staffMeta.resolvedGroupReason}`
        : '기본 배치 기준: 저장된 패턴과 생성 규칙을 함께 반영했습니다.',
      staffMeta?.dedicatedBand
        ? `전담 밴드: ${staffMeta.dedicatedBand.toUpperCase()}`
        : '전담 밴드 강제는 없습니다.',
      (() => {
        const currentDateIndex = monthDates.indexOf(cell.date);
        if (currentDateIndex > 0) {
          const previousBand = getAssignedShiftBand(row.cells[currentDateIndex - 1]?.shiftId || '', shiftMap);
          if (cell.shiftId === OFF_SHIFT_TOKEN && previousBand === 'night') {
            return `나이트 후 회복 OFF ${previewGenerationRule.offDaysAfterNight}일 규칙이 반영된 자리입니다.`;
          }
        }
        return null;
      })(),
      preferredOffSelections[String(row.staff.id)]?.includes(cell.date)
        ? '희망 OFF가 등록된 날짜입니다.'
        : null,
      staffMeta?.config.preferWeekendOff && isWeekendDateKey(cell.date)
        ? '주말 OFF 선호가 반영될 수 있는 날짜입니다.'
        : null,
      staffMeta?.config.preferHolidayOff && isKoreanPublicHoliday(cell.date)
        ? '공휴일 OFF 선호가 반영될 수 있는 날짜입니다.'
        : null,
      staffMeta?.config.avoidConsecutiveEvening && currentBand === 'evening'
        ? '연속 이브닝 제한 선호를 함께 고려한 배치입니다.'
        : null,
      `생성 성향: ${getGenerationStyleMeta(previewGenerationRule.generationStyle).label}`,
      `개인 블록 선호: ${
        STAFF_BLOCK_PREFERENCE_OPTIONS.find(
          (option) => option.value === normalizeStaffBlockPreference(staffMeta?.config.blockPreference)
        )?.label || '균형'
      }`,
    ].filter((value): value is string => Boolean(value));

    const options = [OFF_SHIFT_TOKEN, ...defaultShiftPool.map((shift) => shift.id)].map((shiftId) => {
      const shift = shiftId === OFF_SHIFT_TOKEN ? null : shiftMap.get(shiftId);
      const band = getAssignedShiftBand(shiftId, shiftMap);
      const isCurrent = cell.shiftId === shiftId;
      const isBase = cell.baseShiftId === shiftId;
      const allowed = isCurrent ? true : !(criticalNightCoverage && band !== 'night');

      return {
        shiftId,
        label: shiftId === OFF_SHIFT_TOKEN ? 'OFF' : shift?.name || '근무',
        code: shiftId === OFF_SHIFT_TOKEN ? 'OFF' : getShiftCode(shift?.name || '근무'),
        hours: shift ? formatShiftHours(shift) : '휴무',
        allowed,
        reason: allowed ? '' : '현재 NIGHT 최소 커버를 깨뜨릴 수 있어 변경할 수 없습니다.',
        isCurrent,
        isBase,
      };
    });

    return {
      staffId: selectedManualCell.staffId,
      row,
      cell,
      options,
      explanations,
    };
  }, [
    defaultShiftPool,
    monthDates,
    preferredOffSelections,
    previewGenerationRule,
    previewRows,
    selectedManualCell,
    staffPlanningMeta,
  ]);

  const handleManualCellClick = useCallback(({
    staffId,
    date,
  }: {
    staffId: string;
    date: string;
    currentShiftId: string;
    baseShiftId: string;
  }) => {
    if (!manualEditMode) return;
    setSelectedManualCell({ staffId, date });
  }, [manualEditMode]);

  const handleManualImpactSelect = useCallback((shiftId: string) => {
    if (!selectedManualCellDetails) return;

    setManualAssignment({
      staffId: selectedManualCellDetails.staffId,
      date: selectedManualCellDetails.cell.date,
      nextShiftId: shiftId,
      baseShiftId: selectedManualCellDetails.cell.baseShiftId,
    });
    setSelectedManualCell(null);
  }, [selectedManualCellDetails]);

  const handlePartialRegeneration = async () => {
    const startIndex = monthDates.indexOf(partialRegenerationStartDate);
    const endIndex = monthDates.indexOf(partialRegenerationEndDate);
    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
      toast('부분 재생성 범위를 다시 확인하세요.', 'warning');
      return;
    }

    setPartialRegenerationLoading(true);
    try {
      if (!aiRecommendation?.staffPlans?.length || previewRows.length === 0) {
        toast('먼저 근무표를 생성한 뒤 부분 재생성을 실행해 주세요.', 'warning');
        return;
      }
      if (selectedAiShifts.length === 0) {
        toast('부분 재생성에 사용할 근무형태가 없습니다.', 'warning');
        return;
      }

      const shiftMap = new Map(selectedAiShifts.map((shift) => [shift.id, shift]));
      const validShiftIds = new Set(selectedAiShifts.map((shift) => shift.id));
      const effectiveGenerationRule: RosterGenerationRule =
        partialRegenerationMode === 'preserve_pattern'
          ? {
              ...previewGenerationRule,
              generationStyle: 'stable',
            }
          : partialRegenerationMode === 'rebalance_fairness'
            ? {
                ...previewGenerationRule,
                generationStyle: 'balanced',
                distributeWeekendShifts: true,
                distributeHolidayShifts: true,
              }
            : previewGenerationRule;
      const holidayDateSet = new Set(monthDates.filter((dateKey) => isKoreanPublicHoliday(dateKey)));
      const referenceDateKey = getMonthEndDateKey(monthDates);
      const monthDateSet = new Set(monthDates);
      const targetStaffIds = partialRegenerationStaffId
        ? [partialRegenerationStaffId]
        : previewRows.map((row) => String(row.staff.id));
      const targetStaffIdSet = new Set(targetStaffIds);
      const currentAssignmentsByStaff = new Map(
        previewRows.map((row) => [String(row.staff.id), row.cells.map((cell) => cell.shiftId)])
      );
      const aiPlanByStaffId = new Map(
        aiRecommendation.staffPlans.map((plan) => [String(plan.staffId || ''), plan])
      );
      const metaByStaffId = new Map(staffPlanningMeta.map((meta) => [meta.staffId, meta]));
      const teamDailyBandCounts = monthDates.map(() => buildEmptyCoverageCounts());
      let approvedLeaveBlockedDatesByStaff = new Map<string, Set<string>>();

      if (targetStaffIds.length > 0 && monthDates.length > 0) {
        const { data: approvedLeaves, error: approvedLeavesError } = await supabase
          .from('leave_requests')
          .select('staff_id, start_date, end_date')
          .eq('status', '승인')
          .in('staff_id', targetStaffIds)
          .lte('start_date', monthDates[monthDates.length - 1])
          .gte('end_date', monthDates[0]);

        if (approvedLeavesError) {
          console.error('승인된 연차 데이터 로드 실패:', approvedLeavesError);
        } else {
          approvedLeaveBlockedDatesByStaff = buildBlockedDatesByStaff(
            (approvedLeaves || []) as Array<{ staff_id: string; start_date: string; end_date: string }>,
            monthDateSet
          );
        }
      }

      const preferredOffBlockedDatesByStaff = buildPreferredOffDateMap(
        preferredOffSelections,
        targetStaffIdSet,
        monthDateSet
      );
      const blockedDatesByStaff = mergeBlockedDateMaps(
        approvedLeaveBlockedDatesByStaff,
        preferredOffBlockedDatesByStaff
      );

      previewRows.forEach((row) => {
        const staffId = String(row.staff.id);
        row.cells.forEach((cell, dateIndex) => {
          const keepCurrentAssignment =
            !targetStaffIdSet.has(staffId) || dateIndex < startIndex || dateIndex > endIndex;
          if (!keepCurrentAssignment) return;
          const band = getAssignedShiftBand(cell.shiftId || '', shiftMap);
          if (band) {
            teamDailyBandCounts[dateIndex][band] += 1;
          }
        });
      });

      const fairnessRowByStaffId = new Map(
        fairnessScoreboard.rows.map((row) => [row.staffId, row] as const)
      );
      const planningEntries = enabledTargetStaffs.map((staff, index) => {
        const staffId = String(staff.id);
        const fallbackConfig =
          effectiveTargetStaffConfigs.get(staffId) ||
          buildInitialConfig(
            staff,
            index,
            defaultShiftOrder.length ? defaultShiftOrder : defaultShiftPool,
            monthDates.length
          );
        const meta =
          metaByStaffId.get(staffId) ||
          ({
            staff,
            staffId,
            config: fallbackConfig,
            resolvedGroup: null,
            resolvedGroupMode: defaultPlannerMode,
            resolvedGroupLabel: '',
            resolvedGroupReason: '',
            dedicatedBand: null,
            coverageRoleTags: [],
            coverageRoleMatcherText: '',
            isSeniorStaff: isSeniorPlannerStaff(staff),
            isNewNurse: isStaffNewNurse(staff, referenceDateKey),
          } satisfies StaffPlanningMeta);
        const groupKey = meta.resolvedGroup?.key || `default-${defaultPlannerMode}`;
        return { staff, staffId, meta, groupKey };
      });
      const orderedPlanningEntries =
        partialRegenerationMode === 'rebalance_fairness'
          ? [...planningEntries].sort((left, right) => {
              const leftRow = fairnessRowByStaffId.get(left.staffId);
              const rightRow = fairnessRowByStaffId.get(right.staffId);
              const leftLoad =
                (leftRow?.nightCount || 0) +
                (leftRow?.weekendWorkCount || 0) +
                (leftRow?.holidayWorkCount || 0);
              const rightLoad =
                (rightRow?.nightCount || 0) +
                (rightRow?.weekendWorkCount || 0) +
                (rightRow?.holidayWorkCount || 0);
              if (leftLoad !== rightLoad) return leftLoad - rightLoad;
              return left.staffId.localeCompare(right.staffId, 'ko');
            })
          : planningEntries;
      const groupSizeMap = new Map<string, number>();
      orderedPlanningEntries.forEach((entry) => {
        groupSizeMap.set(entry.groupKey, (groupSizeMap.get(entry.groupKey) || 0) + 1);
      });
      const groupMemberIndexMap = new Map<string, number>();
      const nextPlansByStaffId = new Map(
        aiRecommendation.staffPlans.map((plan) => [
          String(plan.staffId || ''),
          {
            ...plan,
            assignments: [
              ...(currentAssignmentsByStaff.get(String(plan.staffId || '')) ||
                normalizeAiAssignments(plan.assignments, monthDates, validShiftIds)),
            ],
          },
        ])
      );

      orderedPlanningEntries
        .filter((entry) => targetStaffIdSet.has(entry.staffId))
        .forEach((entry) => {
          const { staff, staffId, meta, groupKey } = entry;
          const currentAssignments =
            currentAssignmentsByStaff.get(staffId) ||
            normalizeAiAssignments(aiPlanByStaffId.get(staffId)?.assignments, monthDates, validShiftIds);
          const restrictionBlockedDateSet = buildStaffRestrictionBlockedDateSet(meta.config, monthDates);
          const blockedDateSet = mergeBlockedDateMaps(
            blockedDatesByStaff,
            new Map([[staffId, restrictionBlockedDateSet]])
          ).get(staffId);
          const baseAllowedShiftIds = (
            meta.resolvedGroup?.shiftIds.filter((shiftId) => shiftMap.has(shiftId)) ||
            selectedAiShifts.map((shift) => shift.id)
          ).filter(Boolean);
          const allowedShiftIds = getRestrictedAllowedShiftIds(
            baseAllowedShiftIds,
            meta.config.blockedShiftBands,
            shiftMap
          );
          const rawMode = meta.resolvedGroup?.mode || defaultPlannerMode;
          const effectiveMode: RosterPatternGroupMode =
            !effectiveGenerationRule.fixedShiftOnly && rawMode !== 'rotation' ? 'rotation' : rawMode;
          const groupMemberIndex = groupMemberIndexMap.get(groupKey) || 0;
          groupMemberIndexMap.set(groupKey, groupMemberIndex + 1);
          const tempTeamDailyBandCounts = teamDailyBandCounts.map((counts) => ({ ...counts }));
          const generatedAssignments =
            effectiveMode === 'rotation'
              ? buildRuleAwareRotationAssignments({
                  monthDates,
                  shiftMap,
                  shiftIds: allowedShiftIds.length > 0 ? allowedShiftIds : [OFF_SHIFT_TOKEN],
                  staffIndex: groupMemberIndex,
                  rule: effectiveGenerationRule,
                  nightCountRange: {
                    min: meta.config.minNightShiftCount || 0,
                    max: meta.config.maxNightShiftCount || 0,
                  },
                  totalStaffCount: groupSizeMap.get(groupKey) || 1,
                blockedDateSet,
                holidayDateSet,
                isNewNurse: meta.isNewNurse,
                teamDailyBandCounts: tempTeamDailyBandCounts,
                staffConfig: meta.config,
              })
              : buildProgrammaticAssignments({
                  monthDates,
                  shiftMap,
                  cycle: buildProgrammaticCycle(
                    effectiveMode,
                    allowedShiftIds.length > 0 ? allowedShiftIds : [OFF_SHIFT_TOKEN],
                    shiftMap
                  ),
                  staffIndex: groupMemberIndex,
                  mode: effectiveMode,
                  blockedDateSet,
                  teamDailyBandCounts: tempTeamDailyBandCounts,
                });
          const recoveredAssignments = enforceNightRecoveryAssignments(
            generatedAssignments,
            shiftMap,
            effectiveGenerationRule.offDaysAfterNight
          );
          const existingPlan = nextPlansByStaffId.get(staffId);
          const mergedAssignments = [...currentAssignments];
          for (let dateIndex = startIndex; dateIndex <= endIndex; dateIndex += 1) {
            const generatedShiftId = recoveredAssignments[dateIndex] || OFF_SHIFT_TOKEN;
            const currentShiftId = currentAssignments[dateIndex] || OFF_SHIFT_TOKEN;
            let nextShiftId = generatedShiftId;

            if (partialRegenerationMode === 'minimize_changes' && currentShiftId !== generatedShiftId) {
              const currentIsAllowed =
                currentShiftId === OFF_SHIFT_TOKEN ||
                (allowedShiftIds.includes(currentShiftId) &&
                  canAssignPlanShiftAtDate({
                    plan: {
                      staffId,
                      modeLabel: existingPlan?.modeLabel || meta.resolvedGroupLabel || '부분 재생성',
                      rationale: existingPlan?.rationale || meta.resolvedGroupReason || '',
                      assignments: [...mergedAssignments],
                      effectiveMode,
                      allowedShiftIds: allowedShiftIds.length > 0 ? allowedShiftIds : [OFF_SHIFT_TOKEN],
                      blockedDateSet,
                    },
                    dateIndex,
                    nextShiftId: currentShiftId,
                    monthDates,
                    shiftMap,
                    rule: effectiveGenerationRule,
                  }));

              if (currentIsAllowed) {
                nextShiftId = currentShiftId;
              }
            }
            mergedAssignments[dateIndex] = nextShiftId;
            const band = getAssignedShiftBand(nextShiftId, shiftMap);
            if (band) {
              teamDailyBandCounts[dateIndex][band] += 1;
            }
          }
          if (existingPlan) {
            nextPlansByStaffId.set(staffId, {
              ...existingPlan,
              assignments: mergedAssignments,
            });
          }
        });

      setAiRecommendation({
        ...aiRecommendation,
        staffPlans: aiRecommendation.staffPlans.map((plan) => {
          const updatedPlan = nextPlansByStaffId.get(String(plan.staffId || ''));
          return updatedPlan || plan;
        }),
      });
      setManualAssignments((prev) => {
        const nextEntries = Object.entries(prev).filter(([assignmentKey]) => {
          const separatorIndex = assignmentKey.indexOf('::');
          if (separatorIndex === -1) return true;
          const staffId = assignmentKey.slice(0, separatorIndex);
          const date = assignmentKey.slice(separatorIndex + 2);
          if (partialRegenerationStaffId && staffId !== partialRegenerationStaffId) return true;
          const dateIndex = monthDates.indexOf(date);
          return dateIndex < startIndex || dateIndex > endIndex;
        });
        return Object.fromEntries(nextEntries);
      });
      setSelectedManualCell(null);
      setGeminiSummary('선택한 범위만 다시 생성했습니다.');
      setPendingSnapshotMeta({
        source: 'generated',
        label: `${selectedMonth} ${rosterScopeLabel} 부분 재생성`,
      });
      toast('선택한 범위만 다시 생성했습니다.', 'success');
      return;
    } catch (error) {
      console.error('부분 재생성 실패:', error);
      toast('부분 재생성 중 오류가 발생했습니다.', 'error');
    } finally {
      setPartialRegenerationLoading(false);
    }
  };

  useEffect(() => {
    if (!pendingSnapshotMeta) return;
    if (previewRows.length === 0 || !aiRecommendation?.staffPlans?.length) return;
    captureRosterSnapshot({
      source: pendingSnapshotMeta.source,
      label: pendingSnapshotMeta.label,
      warningCount: rosterWarningReport.items.length,
    });
    setPendingSnapshotMeta(null);
  }, [aiRecommendation, pendingSnapshotMeta, previewRows, rosterWarningReport.items.length]);

  const restoreRosterSnapshot = (snapshot: StoredRosterSnapshot<GeminiRosterRecommendation>) => {
    if (!snapshot.recommendation?.staffPlans?.length) {
      toast('복원할 근무표 초안 데이터가 없습니다.', 'warning');
      return;
    }
    setAiRecommendation(snapshot.recommendation);
    setManualAssignments(snapshot.manualAssignments || {});
    setManualEditMode(Object.keys(snapshot.manualAssignments || {}).length > 0);
    setGeminiSummary(`${snapshot.label} 스냅샷을 복원했습니다.`);
    setGeminiAppliedAt(snapshot.createdAt);
    setLeaveAppliedSummary(snapshot.leaveAppliedSummary || '');
    setSelectedSnapshotId(snapshot.id);
    toast(`${snapshot.label} 스냅샷을 복원했습니다.`, 'success');
  };

  const renderRosterSnapshotPanel = () => {
    if (!selectedCompany || !selectedDepartment) return null;

    return (
      <RosterSnapshotPanel
        snapshots={rosterSnapshots}
        selectedSnapshotId={selectedSnapshotId}
        selectedSnapshot={selectedRosterSnapshot}
        comparison={rosterSnapshotComparison}
        onSelectSnapshot={setSelectedSnapshotId}
        onRestoreSnapshot={restoreRosterSnapshot}
      />
    );
  };

  const renderRosterReviewPanel = () => {
    if (previewRows.length === 0) return null;

    return (
      <RosterReviewPanel
        enabledCount={summary.enabledCount}
        manualCount={summary.manualCount}
        blockingCount={blockingRosterIssues.length}
        warningCount={reviewPanelWarnings.length}
        warnings={reviewPanelWarnings}
        suggestions={reviewPanelSuggestions}
        fairnessRows={fairnessScoreboard.rows.slice(0, 5)}
        snapshotComparison={rosterSnapshotComparison}
        comparisons={rosterPlanComparisons}
        onJumpToWarning={jumpToRosterWarningTarget}
      />
    );
  };

  const renderRosterManualImpactPanel = () => {
    if (!selectedManualCellDetails) return null;

    return (
      <RosterManualImpactPanel
        staffName={String(selectedManualCellDetails.row.staff.name || '')}
        date={selectedManualCellDetails.cell.date}
        currentShiftName={selectedManualCellDetails.cell.shiftName}
        baseShiftName={
          selectedManualCellDetails.cell.baseShiftId === OFF_SHIFT_TOKEN
            ? 'OFF'
            : getShiftNameById(selectedManualCellDetails.cell.baseShiftId, workShifts)
        }
        manualOverride={selectedManualCellDetails.cell.isManual}
        options={selectedManualCellDetails.options}
        explanations={selectedManualCellDetails.explanations}
        onSelect={handleManualImpactSelect}
        onClose={() => setSelectedManualCell(null)}
      />
    );
  };

  const renderRosterPartialRegenerationPanel = () => {
    if (previewRows.length === 0) return null;

    return (
      <RosterPartialRegenerationPanel
        staffOptions={previewRows.map((row) => ({
          staffId: String(row.staff.id),
          staffName: String(row.staff.name || row.staff.employee_name || row.staff.id),
        }))}
        selectedStaffId={partialRegenerationStaffId}
        monthDates={monthDates}
        startDate={partialRegenerationStartDate}
        endDate={partialRegenerationEndDate}
        mode={partialRegenerationMode}
        modeOptions={PARTIAL_REGENERATION_MODE_OPTIONS}
        loading={partialRegenerationLoading}
        disabled={partialRegenerationLoading || monthDates.length === 0}
        onStaffChange={setPartialRegenerationStaffId}
        onStartDateChange={setPartialRegenerationStartDate}
        onEndDateChange={setPartialRegenerationEndDate}
        onModeChange={setPartialRegenerationMode}
        onSubmit={handlePartialRegeneration}
      />
    );
  };

  const jumpToRosterWarningTarget = useCallback((targetTestId: string) => {
    if (typeof document === 'undefined') return;
    const target = document.querySelector<HTMLElement>(`[data-testid="${targetTestId}"]`);
    if (!target) return;

    setHighlightedRosterTarget(targetTestId);
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    window.setTimeout(() => {
      setHighlightedRosterTarget((prev) => (prev === targetTestId ? '' : prev));
    }, 2200);
  }, []);

  const renderRosterWarningReport = () => {
    if (previewRows.length === 0) return null;

    return (
      <RosterWarningReport
        report={rosterWarningReport}
        onJumpToTarget={jumpToRosterWarningTarget}
      />
    );
  };

  const renderRosterFairnessBoard = () => {
    if (fairnessScoreboard.rows.length === 0) return null;

    return <RosterFairnessBoard scoreboard={fairnessScoreboard} />;
  };

  const selectedAiShifts = useMemo(
    () => defaultShiftPool.filter((shift) => selectedAiShiftIds.includes(shift.id)),
    [defaultShiftPool, selectedAiShiftIds]
  );
  const plannerPatternPreviewGroups = useMemo<PlannerPatternPreviewGroup[]>(() => {
    if (enabledTargetStaffs.length === 0) return [];

    const groups = new Map<string, PlannerPatternPreviewGroup>();
    enabledTargetStaffs.forEach((staff) => {
      const resolvedGroup = resolvePlannerPatternGroup({
        staff,
        patternProfile: selectedPatternProfile,
        availableShifts: selectedAiShifts,
        allShifts: workShifts,
      });

      const previewGroup = resolvedGroup
        ? {
            key: resolvedGroup.key,
            label: resolvedGroup.label,
            mode: resolvedGroup.mode,
            source: resolvedGroup.source,
          }
        : {
            key: `default-${defaultPlannerMode}`,
            label:
              defaultPlannerMode === 'rotation'
                ? '순환근무'
                : '기본 고정근무',
            mode: defaultPlannerMode,
            source: 'default' as const,
          };

      const existing = groups.get(previewGroup.key);
      if (existing) {
        existing.count += 1;
        return;
      }

      groups.set(previewGroup.key, {
        ...previewGroup,
        count: 1,
      });
    });

    return Array.from(groups.values());
  }, [defaultPlannerMode, enabledTargetStaffs, selectedAiShifts, selectedPatternProfile, workShifts]);

  const persistPatternProfiles = (nextProfiles: RosterPatternProfile[]) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        ROSTER_PATTERN_PROFILE_STORAGE_KEY,
        JSON.stringify(nextProfiles)
      );
      writeCachedPatternProfiles(nextProfiles);
    } catch (error) {
      console.error('교대방식 패턴 저장 실패:', error);
    }
  };

  const persistGenerationRules = (nextRules: RosterGenerationRule[]) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        ROSTER_GENERATION_RULE_STORAGE_KEY,
        JSON.stringify(nextRules)
      );
      writeCachedGenerationRules(nextRules);
    } catch (error) {
      console.error('근무규칙 저장 실패:', error);
    }
  };

  const resetPatternDraft = () => {
    setPatternDraft(buildDefaultPatternProfile(selectedCompany, selectedCompanyId));
  };

  const resetGenerationRuleDraft = () => {
    setGenerationRuleDraft(buildDefaultGenerationRule(selectedCompany, selectedCompanyId));
  };

  const syncPatternProfileToSharedStorage = async (profile: RosterPatternProfile) => {
    const record = buildPatternProfileStorageRecord(profile);

    const result = await upsertRosterPolicyStorageRecord({
      policyType: 'pattern_profile',
      policyId: record.id,
      companyId: record.companyId,
      companyName: record.companyName || '전체',
      name: record.name,
      payload: record as unknown as Record<string, unknown>,
      createdBy: typeof user?.id === 'string' ? user.id : null,
      updatedBy: typeof user?.id === 'string' ? user.id : null,
      updatedAt: record.updatedAt,
    });

    return result.storageAvailable;
  };

  const syncGenerationRuleToSharedStorage = async (rule: RosterGenerationRule) => {
    const record = buildGenerationRuleStorageRecord(rule);

    const result = await upsertRosterPolicyStorageRecord({
      policyType: 'generation_rule',
      policyId: record.id,
      companyId: record.companyId,
      companyName: record.companyName || '전체',
      name: record.name,
      payload: record as unknown as Record<string, unknown>,
      createdBy: typeof user?.id === 'string' ? user.id : null,
      updatedBy: typeof user?.id === 'string' ? user.id : null,
      updatedAt: record.updatedAt,
    });

    return result.storageAvailable;
  };

  const updatePatternDraftField = (
    field: 'name' | 'description' | 'teamKeywords',
    value: string
  ) => {
    setPatternDraft((prev) => {
      if (field === 'teamKeywords') {
        return {
          ...prev,
          teamKeywords: value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
        };
      }

      return {
        ...prev,
        [field]: value,
      };
    });
  };

  const applyGenerationRuleDraftFieldUpdate = (
    prev: RosterGenerationRule,
    field: EditableGenerationRuleField,
    value: string | number | boolean
  ) => {
    if (field === 'teamKeywords') {
      return {
        ...prev,
        teamKeywords: String(value || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      };
    }

    if (
      field === 'maxConsecutiveEveningShifts' ||
      field === 'offDaysAfterNight' ||
      field === 'nightBlockSize' ||
      field === 'minRotationNightCount' ||
      field === 'maxRotationNightCount' ||
      field === 'minMonthlyOffDays' ||
      field === 'maxConsecutiveWorkDays' ||
      field === 'maxConsecutiveWeekendWorkDays' ||
      field === 'minDayStaff' ||
      field === 'minEveningStaff' ||
      field === 'minNightStaff' ||
      field === 'weekendMinDayStaff' ||
      field === 'weekendMinEveningStaff' ||
      field === 'weekendMinNightStaff' ||
      field === 'holidayMinDayStaff' ||
      field === 'holidayMinEveningStaff' ||
      field === 'holidayMinNightStaff' ||
      field === 'minSeniorDayStaff' ||
      field === 'minSeniorEveningStaff' ||
      field === 'minSeniorNightStaff' ||
      field === 'minDedicatedDayStaff' ||
      field === 'minDedicatedEveningStaff' ||
      field === 'minDedicatedNightStaff'
    ) {
      return {
        ...prev,
        [field]: Math.max(0, Math.floor(Number(value) || 0)),
      };
    }

    return {
      ...prev,
      [field]: value,
    };
  };

  const updateGenerationRuleDraftField = (
    field: EditableGenerationRuleField,
    value: string | number | boolean
  ) => {
    setGenerationRuleDraft((prev) => applyGenerationRuleDraftFieldUpdate(prev, field, value));
  };

  const updateWizardRuleDraftField = (
    field: EditableGenerationRuleField,
    value: string | number | boolean
  ) => {
    setWizardRuleDraft((prev) => applyGenerationRuleDraftFieldUpdate(prev, field, value));
  };

  const applyWizardNightBlockPreset = useCallback((
    preset: (typeof WIZARD_NIGHT_BLOCK_PRESET_OPTIONS)[number]
  ) => {
    setWizardRuleDraft((prev) => ({
      ...prev,
      nightBlockSize: preset.nightBlockSize,
      offDaysAfterNight: preset.offDaysAfterNight,
    }));
  }, []);

  const addWizardDateCoverageOverride = () => {
    setWizardRuleDraft((prev) => ({
      ...prev,
      dateCoverageOverrides: [
        ...(prev.dateCoverageOverrides || []),
        {
          id: `date-coverage-${Date.now()}-${(prev.dateCoverageOverrides || []).length + 1}`,
          date: monthDates[0] || '',
          minDayStaff: 0,
          minEveningStaff: 0,
          minNightStaff: 0,
        },
      ],
    }));
  };

  const updateWizardDateCoverageOverride = useCallback((
    overrideId: string,
    field: 'date' | 'minDayStaff' | 'minEveningStaff' | 'minNightStaff',
    value: string | number
  ) => {
    setWizardRuleDraft((prev) => ({
      ...prev,
      dateCoverageOverrides: (prev.dateCoverageOverrides || []).map((entry) => {
        if (entry.id !== overrideId) return entry;
        if (field === 'date') {
          return {
            ...entry,
            date: String(value || '').slice(0, 10),
          };
        }
        return {
          ...entry,
          [field]: Math.max(0, Math.floor(Number(value) || 0)),
        };
      }),
    }));
  }, []);

  const removeWizardDateCoverageOverride = useCallback((overrideId: string) => {
    setWizardRuleDraft((prev) => ({
      ...prev,
      dateCoverageOverrides: (prev.dateCoverageOverrides || []).filter((entry) => entry.id !== overrideId),
    }));
  }, []);

  const addWizardRoleCoverageRule = () => {
    setWizardRuleDraft((prev) => {
      const nextIndex = prev.roleCoverageRules.length + 1;
      return {
        ...prev,
        roleCoverageRules: [
          ...prev.roleCoverageRules,
          {
            id: `role-slot-${Date.now()}-${nextIndex}`,
            label: `역할 슬롯 ${nextIndex}`,
            keywords: [],
            minDayStaff: 0,
            minEveningStaff: 0,
            minNightStaff: 0,
          },
        ],
      };
    });
  };

  const updateWizardRoleCoverageRule = useCallback((
    ruleId: string,
    field: 'label' | 'keywords' | 'minDayStaff' | 'minEveningStaff' | 'minNightStaff',
    value: string | number
  ) => {
    setWizardRuleDraft((prev) => ({
      ...prev,
      roleCoverageRules: prev.roleCoverageRules.map((rule) => {
        if (rule.id !== ruleId) return rule;
        if (field === 'keywords') {
          return {
            ...rule,
            keywords: normalizeCoverageRoleTags(String(value || '').split(',')),
          };
        }
        if (field === 'minDayStaff' || field === 'minEveningStaff' || field === 'minNightStaff') {
          return {
            ...rule,
            [field]: Math.max(0, Math.floor(Number(value) || 0)),
          };
        }
        return {
          ...rule,
          [field]: String(value || ''),
        };
      }),
    }));
  }, []);

  const removeWizardRoleCoverageRule = useCallback((ruleId: string) => {
    setWizardRuleDraft((prev) => ({
      ...prev,
      roleCoverageRules: prev.roleCoverageRules.filter((rule) => rule.id !== ruleId),
    }));
  }, []);

  const updatePatternGroup = useCallback((
    groupId: string,
    patch: Partial<RosterPatternStaffGroup> & { matchKeywordsText?: string }
  ) => {
    setPatternDraft((prev) => ({
      ...prev,
      staffGroups: prev.staffGroups.map((group) => {
        if (group.id !== groupId) return group;

        return {
          ...group,
          ...patch,
          matchKeywords:
            patch.matchKeywordsText !== undefined
              ? patch.matchKeywordsText
                  .split(',')
                  .map((item) => item.trim())
                  .filter(Boolean)
              : patch.matchKeywords ?? group.matchKeywords,
        };
      }),
    }));
  }, []);

  const togglePatternGroupShift = useCallback((groupId: string, shiftId: string) => {
    setPatternDraft((prev) => ({
      ...prev,
      staffGroups: prev.staffGroups.map((group) => {
        if (group.id !== groupId) return group;

        return {
          ...group,
          shiftIds: group.shiftIds.includes(shiftId)
            ? group.shiftIds.filter((currentId) => currentId !== shiftId)
            : [...group.shiftIds, shiftId],
        };
      }),
    }));
  }, []);

  const addPatternGroup = () => {
    setPatternDraft((prev) => ({
      ...prev,
      staffGroups: [
        ...prev.staffGroups,
        {
          id: `group-${Date.now()}`,
          label: `그룹 ${prev.staffGroups.length + 1}`,
          mode: 'rotation',
          matchKeywords: [],
          shiftIds: [],
          note: '',
        },
      ],
    }));
  };

  const removePatternGroup = useCallback((groupId: string) => {
    setPatternDraft((prev) => ({
      ...prev,
      staffGroups: prev.staffGroups.filter((group) => group.id !== groupId),
    }));
  }, []);

  const editPatternProfile = useCallback((profile: RosterPatternProfile) => {
    setPatternDraft({
      ...profile,
      teamKeywords: [...profile.teamKeywords],
      staffGroups: profile.staffGroups.map((group) => ({
        ...group,
        matchKeywords: [...group.matchKeywords],
        shiftIds: [...group.shiftIds],
      })),
    });
  }, []);

  const savePatternProfile = () => {
    if (!canManageRosterPolicies) {
      toast('근무 패턴 저장은 관리자 전용입니다.', 'warning');
      return;
    }
    const nextName = patternDraft.name.trim();
    if (!nextName) {
      toast('패턴 이름을 입력하세요.', 'warning');
      return;
    }

    if (patternDraft.teamKeywords.length === 0) {
      toast('적용할 팀 키워드를 한 개 이상 입력하세요.', 'warning');
      return;
    }

    if (patternDraft.staffGroups.length === 0) {
      toast('직원 그룹을 한 개 이상 만들어 주세요.');
      return;
    }

    if (patternDraft.staffGroups.some((group) => group.shiftIds.length === 0)) {
      toast('각 그룹마다 연결할 근무유형을 한 개 이상 선택하세요.', 'warning');
      return;
    }

    const nextProfile: RosterPatternProfile = {
      ...patternDraft,
      name: nextName,
      companyName: selectedCompany,
      companyId: selectedCompanyId,
      description: patternDraft.description.trim(),
      updatedAt: new Date().toISOString(),
    };

    const nextProfiles = [nextProfile, ...savedPatternProfiles.filter((profile) => profile.id !== nextProfile.id)];
    setSavedPatternProfiles(nextProfiles);
    persistPatternProfiles(nextProfiles);
    setSelectedPatternProfileId(nextProfile.id);
    resetPatternDraft();
    void syncPatternProfileToSharedStorage(nextProfile).catch((error) => {
      console.error('근무 패턴 공용 저장 실패:', error);
      toast('근무 패턴을 공용 저장소에 동기화하지 못했습니다. 현재 브라우저에는 저장되었습니다.', 'warning');
    });
    toast(`"${nextName}" 교대방식 패턴을 저장했습니다.`, 'success');
  };

  const deletePatternProfile = (profileId: string) => {
    if (!canManageRosterPolicies) {
      toast('근무 패턴 삭제는 관리자 전용입니다.', 'warning');
      return;
    }
    const nextProfiles = savedPatternProfiles.filter((profile) => profile.id !== profileId);
    setSavedPatternProfiles(nextProfiles);
    persistPatternProfiles(nextProfiles);
    if (selectedPatternProfileId === profileId) {
      setSelectedPatternProfileId('');
    }
    if (patternDraft.id === profileId) {
      resetPatternDraft();
    }
    void deleteRosterPolicyStorageRecord('pattern_profile', profileId).catch((error) => {
      console.error('근무 패턴 공용 삭제 실패:', error);
      toast('근무 패턴 공용 저장소 삭제에 실패했습니다. 현재 브라우저 기준으로는 삭제되었습니다.', 'warning');
    });
  };

  const editGenerationRule = useCallback((rule: RosterGenerationRule) => {
    setGenerationRuleDraft({
      ...rule,
      teamKeywords: [...rule.teamKeywords],
    });
  }, []);

  const saveGenerationRule = () => {
    if (!canManageRosterPolicies) {
      toast('근무 규칙 저장은 관리자 전용입니다.', 'warning');
      return;
    }
    const nextName = generationRuleDraft.name.trim();
    if (!nextName) {
      toast('근무규칙 이름을 입력해 주세요.', 'warning');
      return;
    }

    if (generationRuleDraft.teamKeywords.length === 0) {
      toast('적용할 팀 키워드를 한 개 이상 입력해 주세요.', 'warning');
      return;
    }

    const nextRule: RosterGenerationRule = {
      ...generationRuleDraft,
      name: nextName,
      companyName: selectedCompany,
      companyId: selectedCompanyId,
      description: generationRuleDraft.description.trim(),
      maxConsecutiveEveningShifts: Math.max(
        0,
        Math.min(7, Math.floor(generationRuleDraft.maxConsecutiveEveningShifts || 0))
      ),
      offDaysAfterNight: Math.max(0, Math.min(5, Math.floor(generationRuleDraft.offDaysAfterNight || 0))),
      nightBlockSize: Math.max(1, Math.min(5, Math.floor(generationRuleDraft.nightBlockSize || 1))),
      minRotationNightCount: Math.max(
        0,
        Math.min(31, Math.floor(generationRuleDraft.minRotationNightCount || 0))
      ),
      maxRotationNightCount: Math.max(
        Math.max(0, Math.min(31, Math.floor(generationRuleDraft.minRotationNightCount || 0))),
        Math.min(31, Math.floor(generationRuleDraft.maxRotationNightCount || 0))
      ),
      minMonthlyOffDays: Math.max(
        7,
        Math.min(31, Math.floor(generationRuleDraft.minMonthlyOffDays || 7))
      ),
      maxConsecutiveWorkDays: Math.max(
        2,
        Math.min(7, Math.floor(generationRuleDraft.maxConsecutiveWorkDays || 5))
      ),
      maxConsecutiveWeekendWorkDays: Math.max(
        0,
        Math.min(4, Math.floor(generationRuleDraft.maxConsecutiveWeekendWorkDays || 0))
      ),
      minDayStaff: Math.max(0, Math.min(20, Math.floor(generationRuleDraft.minDayStaff || 0))),
      minEveningStaff: Math.max(0, Math.min(20, Math.floor(generationRuleDraft.minEveningStaff || 0))),
      minNightStaff: Math.max(0, Math.min(20, Math.floor(generationRuleDraft.minNightStaff || 0))),
      weekendMinDayStaff: Math.max(0, Math.min(20, Math.floor(generationRuleDraft.weekendMinDayStaff || 0))),
      weekendMinEveningStaff: Math.max(0, Math.min(20, Math.floor(generationRuleDraft.weekendMinEveningStaff || 0))),
      weekendMinNightStaff: Math.max(0, Math.min(20, Math.floor(generationRuleDraft.weekendMinNightStaff || 0))),
      holidayMinDayStaff: Math.max(0, Math.min(20, Math.floor(generationRuleDraft.holidayMinDayStaff || 0))),
      holidayMinEveningStaff: Math.max(0, Math.min(20, Math.floor(generationRuleDraft.holidayMinEveningStaff || 0))),
      holidayMinNightStaff: Math.max(0, Math.min(20, Math.floor(generationRuleDraft.holidayMinNightStaff || 0))),
      dateCoverageOverrides: (generationRuleDraft.dateCoverageOverrides || [])
        .map((entry, index) => ({
          id: entry.id || `date-coverage-${index + 1}`,
          date: String(entry.date || '').slice(0, 10),
          minDayStaff: Math.max(0, Math.min(20, Math.floor(entry.minDayStaff || 0))),
          minEveningStaff: Math.max(0, Math.min(20, Math.floor(entry.minEveningStaff || 0))),
          minNightStaff: Math.max(0, Math.min(20, Math.floor(entry.minNightStaff || 0))),
        }))
        .filter(
          (entry) =>
            /^\d{4}-\d{2}-\d{2}$/.test(entry.date) &&
            (entry.minDayStaff > 0 || entry.minEveningStaff > 0 || entry.minNightStaff > 0)
        ),
      updatedAt: new Date().toISOString(),
    };

    const nextRules = [nextRule, ...savedGenerationRules.filter((rule) => rule.id !== nextRule.id)];
    setSavedGenerationRules(nextRules);
    persistGenerationRules(nextRules);
    setSelectedGenerationRuleId(nextRule.id);
    resetGenerationRuleDraft();
    void syncGenerationRuleToSharedStorage(nextRule).catch((error) => {
      console.error('근무 규칙 공용 저장 실패:', error);
      toast('근무 규칙을 공용 저장소에 동기화하지 못했습니다. 현재 브라우저에는 저장되었습니다.', 'warning');
    });
    toast(`"${nextName}" 근무규칙을 저장했습니다.`, 'success');
  };

  const migrateLegacyGenerationRules = async () => {
    if (!canManageRosterPolicies) {
      toast('근무 규칙 보정은 관리자 전용입니다.', 'warning');
      return;
    }

    const changedRules: RosterGenerationRule[] = [];
    const nextRules = savedGenerationRules.map((rule) => {
      if (selectedCompany && rule.companyName && rule.companyName !== selectedCompany) {
        return rule;
      }

      const normalizedTeamKeywords =
        rule.teamKeywords.length > 0
          ? rule.teamKeywords.map((keyword) => String(keyword || '').trim()).filter(Boolean)
          : selectedDepartment
            ? [selectedDepartment]
            : [];
      const isWardRule = normalizedTeamKeywords.some(
        (keyword) => getTeamRecommendationCategory(keyword) === 'ward'
      );
      if (!isWardRule) return rule;

      const nextRule: RosterGenerationRule = {
        ...rule,
        teamKeywords: normalizedTeamKeywords,
        generationStyle: rule.generationStyle === 'balanced' ? 'variety' : rule.generationStyle,
        maxConsecutiveEveningShifts: 0,
        nightBlockSize: Math.max(3, Math.floor(rule.nightBlockSize || 0)),
        minMonthlyOffDays: Math.max(8, Math.floor(rule.minMonthlyOffDays || 0)),
        distributeWeekendShifts: true,
        distributeHolidayShifts: true,
        updatedAt: new Date().toISOString(),
      };

      const hasChanged =
        nextRule.generationStyle !== rule.generationStyle ||
        nextRule.maxConsecutiveEveningShifts !== rule.maxConsecutiveEveningShifts ||
        nextRule.nightBlockSize !== rule.nightBlockSize ||
        nextRule.minMonthlyOffDays !== rule.minMonthlyOffDays ||
        nextRule.distributeWeekendShifts !== rule.distributeWeekendShifts ||
        nextRule.distributeHolidayShifts !== rule.distributeHolidayShifts ||
        nextRule.teamKeywords.join('|') !== rule.teamKeywords.join('|');
      if (!hasChanged) return rule;

      changedRules.push(nextRule);
      return nextRule;
    });

    if (changedRules.length === 0) {
      toast('보정할 예전 병동 근무 규칙이 없습니다.', 'success');
      return;
    }

    setSavedGenerationRules(nextRules);
    persistGenerationRules(nextRules);

    if (selectedGenerationRuleId) {
      const updatedSelectedRule = nextRules.find((rule) => rule.id === selectedGenerationRuleId);
      if (!updatedSelectedRule) {
        setSelectedGenerationRuleId('');
      }
    }
    if (generationRuleDraft.id) {
      const updatedDraftRule = nextRules.find((rule) => rule.id === generationRuleDraft.id);
      if (updatedDraftRule) {
        setGenerationRuleDraft({
          ...updatedDraftRule,
          teamKeywords: [...updatedDraftRule.teamKeywords],
        });
      }
    }

    const syncResults = await Promise.allSettled(
      changedRules.map((rule) => syncGenerationRuleToSharedStorage(rule))
    );
    if (syncResults.some((result) => result.status === 'rejected')) {
      console.error(
        '근무 규칙 일괄 보정 공용 저장 실패:',
        syncResults
          .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
          .map((result) => result.reason)
      );
      toast(
        `병동 규칙 ${changedRules.length}개를 보정했지만 일부 공용 저장은 실패했습니다. 현재 브라우저 기준으로는 적용되었습니다.`,
        'warning'
      );
      return;
    }

    toast(`병동 규칙 ${changedRules.length}개를 현재 추천 기본값으로 보정했습니다.`, 'success');
  };

  const deleteGenerationRule = (ruleId: string) => {
    if (!canManageRosterPolicies) {
      toast('근무 규칙 삭제는 관리자 전용입니다.', 'warning');
      return;
    }
    const nextRules = savedGenerationRules.filter((rule) => rule.id !== ruleId);
    setSavedGenerationRules(nextRules);
    persistGenerationRules(nextRules);
    if (selectedGenerationRuleId === ruleId) {
      setSelectedGenerationRuleId('');
    }
    if (generationRuleDraft.id === ruleId) {
      resetGenerationRuleDraft();
    }
    void deleteRosterPolicyStorageRecord('generation_rule', ruleId).catch((error) => {
      console.error('근무 규칙 공용 삭제 실패:', error);
      toast('근무 규칙 공용 저장소 삭제에 실패했습니다. 현재 브라우저 기준으로는 삭제되었습니다.', 'warning');
    });
  };

  const requestGeminiRecommendation = async () => {
    if (!selectedCompany) {
      toast('사업체를 먼저 선택하세요.', 'warning');
      return;
    }
    if (!selectedDepartment) {
      toast('팀을 먼저 선택하세요.', 'warning');
      return;
    }
    if (workingShifts.length === 0) {
      toast('추천에 사용할 근무유형이 없습니다. 먼저 근무유형을 등록하세요.', 'warning');
      return;
    }
    if (selectedAiShifts.length === 0) {
      toast('AI 추천에 사용할 근무유형을 한 개 이상 선택하세요.', 'warning');
      return;
    }
    if (enabledTargetStaffs.length === 0) {
      toast('추천할 대상 직원이 없습니다.', 'warning');
      return;
    }
    if (blockingRosterIssues.length > 0) {
      const message = '현재 조건으로는 AI 자동생성을 시작할 수 없습니다. 차단 경고를 먼저 확인하세요.';
      setGeminiSummary(message);
      toast('차단 경고를 먼저 확인하세요.', 'warning');
      return;
    }

    setGeminiLoading(true);
    setLeaveAppliedSummary('');
    try {
      const monthDateSet = new Set(monthDates);
      let approvedLeaveRequestCount = 0;
      let approvedLeaveDayCount = 0;
      let approvedLeaveBlockedDatesByStaff = new Map<string, Set<string>>();
      const targetStaffIds = enabledTargetStaffs
        .map((staff) => String(staff?.id || ''))
        .filter(Boolean);
      const targetStaffIdSet = new Set(targetStaffIds);

      if (targetStaffIds.length > 0 && monthDates.length > 0) {
        const { data: approvedLeaves, error: approvedLeavesError } = await supabase
          .from('leave_requests')
          .select('staff_id, start_date, end_date')
          .eq('status', '승인')
          .in('staff_id', targetStaffIds)
          .lte('start_date', monthDates[monthDates.length - 1])
          .gte('end_date', monthDates[0]);

        if (approvedLeavesError) {
          console.error('승인 휴가 반영 데이터 로드 실패:', approvedLeavesError);
        } else {
          approvedLeaveBlockedDatesByStaff = buildBlockedDatesByStaff(
            (approvedLeaves || []) as Array<{ staff_id: string; start_date: string; end_date: string }>,
            monthDateSet
          );
          approvedLeaveRequestCount = (approvedLeaves || []).length;
          approvedLeaveDayCount = countBlockedDateEntries(approvedLeaveBlockedDatesByStaff);
        }
      }

      const preferredOffBlockedDatesByStaff = buildPreferredOffDateMap(
        preferredOffSelections,
        targetStaffIdSet,
        monthDateSet
      );
      const preferredOffDateCount = countBlockedDateEntries(preferredOffBlockedDatesByStaff);
      const blockedDatesByStaff = mergeBlockedDateMaps(
        approvedLeaveBlockedDatesByStaff,
        preferredOffBlockedDatesByStaff
      );
      const preAssigned: Record<string, string> = {};
      blockedDatesByStaff.forEach((dates, staffId) => {
        dates.forEach((date) => {
          preAssigned[`${staffId}|${date}`] = OFF_SHIFT_TOKEN;
        });
      });
      const staffMetaById = new Map(staffPlanningMeta.map((meta) => [meta.staffId, meta]));
      const response = await fetch('/api/ai/roster-recommendation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          selectedMonth,
          selectedCompany,
          selectedDepartment: rosterScopeLabel,
          selectedDepartments: [selectedDepartment, ...includedDepartments].filter(Boolean),
          monthDates,
          patternProfile: selectedPatternProfile
            ? {
                id: selectedPatternProfile.id,
                name: selectedPatternProfile.name,
                companyName: selectedPatternProfile.companyName,
                teamKeywords: selectedPatternProfile.teamKeywords,
                description: selectedPatternProfile.description,
                staffGroups: selectedPatternProfile.staffGroups,
              }
            : null,
          generationBasis: wizardGenerationBasis === 'rotation_only' ? 'rotation_only' : 'saved_rule',
          constraints: {
            targetOffDays: previewGenerationRule.minMonthlyOffDays,
            minNightDays: previewGenerationRule.minRotationNightCount,
            targetNightDays: previewGenerationRule.maxRotationNightCount,
            maxNightDays: previewGenerationRule.maxRotationNightCount,
            minDayReq: previewGenerationRule.minDayStaff,
            minEveReq: previewGenerationRule.minEveningStaff,
            minNightReq: previewGenerationRule.minNightStaff,
            weekendMinDayReq: previewGenerationRule.weekendMinDayStaff,
            weekendMinEveReq: previewGenerationRule.weekendMinEveningStaff,
            weekendMinNightReq: previewGenerationRule.weekendMinNightStaff,
            holidayMinDayReq: previewGenerationRule.holidayMinDayStaff,
            holidayMinEveReq: previewGenerationRule.holidayMinEveningStaff,
            holidayMinNightReq: previewGenerationRule.holidayMinNightStaff,
            minSeniorDayReq: previewGenerationRule.minSeniorDayStaff,
            minSeniorEveReq: previewGenerationRule.minSeniorEveningStaff,
            minSeniorNightReq: previewGenerationRule.minSeniorNightStaff,
            minDedicatedDayReq: previewGenerationRule.minDedicatedDayStaff,
            minDedicatedEveReq: previewGenerationRule.minDedicatedEveningStaff,
            minDedicatedNightReq: previewGenerationRule.minDedicatedNightStaff,
            enableSkillMix: true,
            offDaysAfterNight: previewGenerationRule.offDaysAfterNight,
            nightBlockSize: previewGenerationRule.nightBlockSize,
            generationStyle: previewGenerationRule.generationStyle,
            maxConsecutiveWorkDays: previewGenerationRule.maxConsecutiveWorkDays,
            avoidDayAfterNight: previewGenerationRule.avoidDayAfterNight,
            avoidDayAfterEvening: previewGenerationRule.avoidDayAfterEvening,
            distributeWeekendShifts: previewGenerationRule.distributeWeekendShifts,
            distributeHolidayShifts: previewGenerationRule.distributeHolidayShifts,
            fixedShiftOnly: previewGenerationRule.fixedShiftOnly,
            preferredOffCount: preferredOffDateCount,
            blockNewNurseSoloNight: previewGenerationRule.blockNewNurseSoloNight,
            requireSeniorWithNewNurseNight: previewGenerationRule.requireSeniorWithNewNurseNight,
            roleCoverageRules: previewGenerationRule.roleCoverageRules,
            dateCoverageOverrides: previewGenerationRule.dateCoverageOverrides,
            pairRules: plannerPairRules,
          },
          preAssigned,
          workShifts: selectedAiShifts.map((shift) => ({
            id: shift.id,
            name: shift.name,
            start_time: shift.start_time,
            end_time: shift.end_time,
            shift_type: shift.shift_type,
            description: shift.description,
            company_name: shift.company_name,
            weekly_work_days: shift.weekly_work_days,
            is_weekend_work: shift.is_weekend_work,
          })),
          staffs: enabledTargetStaffs.map((staff) => {
            const staffId = String(staff.id);
            const meta = staffMetaById.get(staffId);

            return {
              id: staffId,
              name: String(staff.name || ''),
              employeeNo: String(staff.employee_no || ''),
              position: String(staff.position || ''),
              role: String(staff.role || ''),
              employmentType: String(staff.employment_type || ''),
              department: String(getDepartmentName(staff) || ''),
              assignedShiftId: String(staff.shift_id || ''),
              shiftType: String(staff.shift_type || ''),
              preferredOffDates: preferredOffSelections[staffId] || [],
              minNightShiftCount: meta?.config.minNightShiftCount || 0,
              maxNightShiftCount: meta?.config.maxNightShiftCount || 0,
              blockPreference: meta?.config.blockPreference || 'balanced',
              resolvedGroupLabel: meta?.resolvedGroupLabel || '',
              resolvedGroupMode: meta?.resolvedGroupMode || '',
              resolvedGroupReason: meta?.resolvedGroupReason || '',
              coverageRoleTags: meta?.coverageRoleTags || [],
              isNewNurse: meta?.isNewNurse || false,
              blockedShiftBands: meta?.config.blockedShiftBands || [],
              blockedWeekdays: meta?.config.blockedWeekdays || [],
              avoidWeekendWork: meta?.config.avoidWeekendWork || false,
              avoidHolidayWork: meta?.config.avoidHolidayWork || false,
              preferWeekendOff: meta?.config.preferWeekendOff || false,
              preferHolidayOff: meta?.config.preferHolidayOff || false,
              avoidConsecutiveEvening: meta?.config.avoidConsecutiveEvening || false,
              preferEarlyMonthNight: meta?.config.preferEarlyMonthNight || false,
            };
          }),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as
        | (GeminiRosterRecommendation & { error?: string })
        | { error?: string };
      if (!response.ok) {
        throw new Error(payload?.error || 'Gemini 팀 추천 요청에 실패했습니다.');
      }

      const recommendation = payload as GeminiRosterRecommendation;
      if (!Array.isArray(recommendation.staffPlans) || recommendation.staffPlans.length === 0) {
        throw new Error('Gemini가 월간 근무표 초안을 반환하지 않았습니다.');
      }
      const leaveSummary =
        approvedLeaveDayCount > 0
          ? `승인 휴가 ${approvedLeaveRequestCount}건 · ${approvedLeaveDayCount}일 반영`
          : '';
      const preferredOffSummary =
        preferredOffDateCount > 0 ? `희망 OFF ${preferredOffDateCount}건 반영` : '';
      const baseSummary =
        recommendation.summary?.trim() ||
        (selectedPatternProfile
          ? `${selectedDepartment} 팀 패턴과 생성 규칙을 반영해 AI 근무표 초안을 만들었습니다.`
          : `${selectedDepartment} 팀 기준으로 AI 근무표 초안을 만들었습니다.`);
      const summaryWithLeave =
        approvedLeaveDayCount > 0
          ? `${baseSummary} 승인 휴가 ${approvedLeaveRequestCount}건, ${approvedLeaveDayCount}일을 OFF로 반영했습니다.`
          : baseSummary;

      recommendation.summary = summaryWithLeave;
      recommendation.leaveSummary = recommendation.leaveSummary?.trim() || leaveSummary;
      recommendation.preferredOffSummary =
        recommendation.preferredOffSummary?.trim() || preferredOffSummary;

      setAiRecommendation(recommendation);
      setManualAssignments({});
      setManualEditMode(false);
      setSelectedManualCell(null);
      setGeminiSummary(summaryWithLeave);
      setLeaveAppliedSummary(leaveSummary);
      setGeminiAppliedAt(new Date().toLocaleString('ko-KR'));
      setPendingSnapshotMeta({
        source: 'generated',
        label: `${selectedMonth} ${rosterScopeLabel} AI 생성본`,
      });
      toast('Gemini가 팀 특성과 제약을 반영한 월간 근무표 초안을 만들었습니다. 아래 미리보기에서 확인하세요.', 'success');
    } catch (error: unknown) {
      console.error('Gemini 팀 추천 실패:', error);
      toast(`Gemini 팀 추천 중 오류가 발생했습니다.\n${(error as Error)?.message || '알 수 없는 오류'}`, 'error');
    } finally {
      setGeminiLoading(false);
    }
  };

  const generatePatternDraft = async () => {
    if (!selectedCompany) {
      toast('사업체를 먼저 선택하세요.', 'warning');
      return;
    }
    if (!selectedDepartment) {
      toast('팀을 먼저 선택하세요.', 'warning');
      return;
    }
    if (workingShifts.length === 0) {
      toast('생성에 사용할 근무유형이 없습니다. 먼저 근무형태를 등록하세요.', 'success');
      return;
    }
    if (selectedAiShifts.length === 0) {
      toast('자동 생성에 사용할 근무유형을 한 개 이상 선택하세요.', 'warning');
      return;
    }
    if (targetStaffs.length === 0) {
      toast('생성할 대상 직원이 없습니다.');
      return;
    }

    setGeminiLoading(true);
    try {
      const shiftMap = new Map(selectedAiShifts.map((shift) => [shift.id, shift]));
      const monthDateSet = new Set(monthDates);
      const groupUsage = new Map<string, number>();
      const groupMemberIndexMap = new Map<string, number>();
      const groupSizeMap = new Map<string, number>();
      const weekendWorkCountsByGroup = new Map<string, number[]>();
      const holidayWorkCountsByGroup = new Map<string, number[]>();
      const rotationDailyBandCountsByGroup = new Map<
        string,
        Array<Record<'day' | 'evening' | 'night', number>>
      >();
      const rotationNewNurseDailyBandCountsByGroup = new Map<
        string,
        Array<Record<'day' | 'evening' | 'night', number>>
      >();
      const effectiveGenerationRule = previewGenerationRule;
      const teamDailyBandCounts = Array.from({ length: monthDates.length }, () => ({
        day: 0,
        evening: 0,
        night: 0,
      }));
      const holidayDateSet = new Set(monthDates.filter((dateKey) => isKoreanPublicHoliday(dateKey)));
      const referenceDateKey = getMonthEndDateKey(monthDates);
      let approvedLeaveRequestCount = 0;
      let approvedLeaveDayCount = 0;
      let approvedLeaveBlockedDatesByStaff = new Map<string, Set<string>>();

      const targetStaffIds = enabledTargetStaffs
        .map((staff) => String(staff?.id || ''))
        .filter(Boolean);
      const targetStaffIdSet = new Set(targetStaffIds);

      if (targetStaffIds.length > 0 && monthDates.length > 0) {
        const { data: approvedLeaves, error: approvedLeavesError } = await supabase
          .from('leave_requests')
          .select('staff_id, start_date, end_date')
          .eq('status', '승인')
          .in('staff_id', targetStaffIds)
          .lte('start_date', monthDates[monthDates.length - 1])
          .gte('end_date', monthDates[0]);

        if (approvedLeavesError) {
          console.error('승인 휴가 반영 데이터 로드 실패:', approvedLeavesError);
        } else {
          approvedLeaveBlockedDatesByStaff = buildBlockedDatesByStaff(
            (approvedLeaves || []) as Array<{ staff_id: string; start_date: string; end_date: string }>,
            monthDateSet
          );
          approvedLeaveRequestCount = (approvedLeaves || []).length;
          approvedLeaveDayCount = countBlockedDateEntries(approvedLeaveBlockedDatesByStaff);
        }
      }
      const preferredOffBlockedDatesByStaff = buildPreferredOffDateMap(
        preferredOffSelections,
        targetStaffIdSet,
        monthDateSet
      );
      const preferredOffDateCount = countBlockedDateEntries(preferredOffBlockedDatesByStaff);
      const blockedDatesByStaff = mergeBlockedDateMaps(
        approvedLeaveBlockedDatesByStaff,
        preferredOffBlockedDatesByStaff
      );
      const resolvedGroupsByStaff = enabledTargetStaffs.map((staff) => {
        const config =
          effectiveTargetStaffConfigs.get(String(staff.id)) ||
          buildInitialConfig(
            staff,
            0,
            defaultShiftOrder.length ? defaultShiftOrder : defaultShiftPool,
            monthDates.length
          );
        const resolvedGroup = resolvePlannerPatternGroup({
          staff,
          patternProfile: selectedPatternProfile,
          availableShifts: selectedAiShifts,
          allShifts: workShifts,
        });
        const groupKey = resolvedGroup?.key || `default-${defaultPlannerMode}`;
        groupSizeMap.set(groupKey, (groupSizeMap.get(groupKey) || 0) + 1);
        return {
          staff,
          staffId: String(staff.id),
          config,
          resolvedGroup,
          groupKey,
        };
      });
      const generationOrderEntries = [...resolvedGroupsByStaff].sort((left, right) => {
        const leftRawMode: RosterPatternGroupMode = left.resolvedGroup?.mode || defaultPlannerMode;
        const rightRawMode: RosterPatternGroupMode = right.resolvedGroup?.mode || defaultPlannerMode;
        const leftMode: RosterPatternGroupMode =
          !effectiveGenerationRule.fixedShiftOnly && leftRawMode !== 'rotation' ? 'rotation' : leftRawMode;
        const rightMode: RosterPatternGroupMode =
          !effectiveGenerationRule.fixedShiftOnly && rightRawMode !== 'rotation' ? 'rotation' : rightRawMode;
        return getRosterModeGenerationPriority(leftMode) - getRosterModeGenerationPriority(rightMode);
      });
      const generatedStaffPlans: GeneratedCoveragePlan[] = generationOrderEntries.map((entry) => {
        const staff = entry.staff;
        const staffConfig = entry.config;
        const resolvedGroup = entry.resolvedGroup || null;
        const matchedGroup = resolvedGroup;
        const groupKey = entry.groupKey || `default-${defaultPlannerMode}`;
        const totalStaffCount = groupSizeMap.get(groupKey) || 1;
        const groupMemberIndex = groupMemberIndexMap.get(groupKey) || 0;
        const restrictionBlockedDateSet = buildStaffRestrictionBlockedDateSet(
          staffConfig,
          monthDates
        );
        const blockedDateSet = mergeBlockedDateMaps(
          blockedDatesByStaff,
          new Map([[String(staff.id), restrictionBlockedDateSet]])
        ).get(String(staff.id));
        const isNewNurse = isStaffNewNurse(staff, referenceDateKey);
        groupMemberIndexMap.set(groupKey, groupMemberIndex + 1);
        const baseAllowedShiftIds = (
          resolvedGroup?.shiftIds.filter((shiftId) => shiftMap.has(shiftId)) ||
          selectedAiShifts.map((shift) => shift.id)
        ).filter(Boolean);
        const allowedShiftIds = getRestrictedAllowedShiftIds(
          baseAllowedShiftIds,
          staffConfig.blockedShiftBands,
          shiftMap
        );
        const rawMode: RosterPatternGroupMode = resolvedGroup?.mode || defaultPlannerMode;
        const effectiveMode: RosterPatternGroupMode =
          !effectiveGenerationRule.fixedShiftOnly && rawMode !== 'rotation'
            ? 'rotation'
            : rawMode;
        const sharedDailyBandCounts =
          effectiveMode === 'rotation' && effectiveGenerationRule.balanceRotationBands
            ? (() => {
                const current =
                  rotationDailyBandCountsByGroup.get(groupKey) ||
                  Array.from({ length: monthDates.length }, () => ({
                    day: 0,
                    evening: 0,
                    night: 0,
                  }));
                rotationDailyBandCountsByGroup.set(groupKey, current);
                return current;
              })()
            : undefined;
        const sharedNewNurseDailyBandCounts =
          effectiveMode === 'rotation' && effectiveGenerationRule.separateNewNursesByShift
            ? (() => {
                const current =
                  rotationNewNurseDailyBandCountsByGroup.get(groupKey) ||
                  Array.from({ length: monthDates.length }, () => ({
                    day: 0,
                    evening: 0,
                    night: 0,
                  }));
                rotationNewNurseDailyBandCountsByGroup.set(groupKey, current);
                return current;
              })()
            : undefined;
        const sharedWeekendAssignmentCounts =
          effectiveMode === 'rotation' && effectiveGenerationRule.distributeWeekendShifts
            ? (() => {
                const current =
                  weekendWorkCountsByGroup.get(groupKey) ||
                  Array.from({ length: Math.max(totalStaffCount, 1) }, () => 0);
                if (current.length < totalStaffCount) {
                  current.push(...Array.from({ length: totalStaffCount - current.length }, () => 0));
                }
                weekendWorkCountsByGroup.set(groupKey, current);
                return current;
              })()
            : undefined;
        const sharedHolidayAssignmentCounts =
          effectiveMode === 'rotation' && effectiveGenerationRule.distributeHolidayShifts
            ? (() => {
                const current =
                  holidayWorkCountsByGroup.get(groupKey) ||
                  Array.from({ length: Math.max(totalStaffCount, 1) }, () => 0);
                if (current.length < totalStaffCount) {
                  current.push(...Array.from({ length: totalStaffCount - current.length }, () => 0));
                }
                holidayWorkCountsByGroup.set(groupKey, current);
                return current;
              })()
            : undefined;
        const assignments =
          effectiveMode === 'rotation'
            ? buildRuleAwareRotationAssignments({
                monthDates,
                shiftMap,
                shiftIds: allowedShiftIds,
                staffIndex: groupMemberIndex,
                rule: effectiveGenerationRule,
                nightCountRange: {
                  min: staffConfig?.minNightShiftCount || 0,
                  max: staffConfig?.maxNightShiftCount || 0,
                },
                sharedDailyBandCounts,
                sharedNewNurseDailyBandCounts,
                totalStaffCount,
                weekendAssignmentCounts: sharedWeekendAssignmentCounts,
                holidayAssignmentCounts: sharedHolidayAssignmentCounts,
                blockedDateSet,
                holidayDateSet,
                isNewNurse,
                teamDailyBandCounts,
                staffConfig,
              })
            : buildProgrammaticAssignments({
                monthDates,
                shiftMap,
                cycle: buildProgrammaticCycle(
                  effectiveMode,
                  allowedShiftIds.length > 0 ? allowedShiftIds : [OFF_SHIFT_TOKEN],
                  shiftMap
                ),
                staffIndex: groupMemberIndex,
                mode: effectiveMode,
                blockedDateSet,
                teamDailyBandCounts,
              });

        if (resolvedGroup) {
          groupUsage.set(resolvedGroup.label, (groupUsage.get(resolvedGroup.label) || 0) + 1);
        }

        return {
          staffId: String(staff.id),
          modeLabel: resolvedGroup
            ? `${resolvedGroup.label} · ${PATTERN_GROUP_MODE_OPTIONS.find((option) => option.value === effectiveMode)?.label || effectiveMode}`
            : PATTERN_GROUP_MODE_OPTIONS.find((option) => option.value === effectiveMode)?.label || '기본 패턴',
          rationale: resolvedGroup
            ? `${resolvedGroup.label} 그룹 키워드와 연결된 근무유형을 기준으로 고정 사이클을 적용했습니다.`
            : '팀 기본 규칙과 선택한 근무유형 순서를 기준으로 자동 사이클을 적용했습니다.',
          assignments,
          effectiveMode,
          allowedShiftIds: allowedShiftIds.length > 0 ? allowedShiftIds : [OFF_SHIFT_TOKEN],
          blockedDateSet,
        };
      });
      const coveredStaffPlans = enforceTeamMinimumCoverage({
        staffPlans: generatedStaffPlans,
        monthDates,
        shiftMap,
        rule: effectiveGenerationRule,
      });
      const coveredAndRestedStaffPlans = enforceMinimumMonthlyOffDays({
        staffPlans: coveredStaffPlans,
        monthDates,
        shiftMap,
        rule: effectiveGenerationRule,
      });
      const recoveredStaffPlans = coveredAndRestedStaffPlans.map((plan) => ({
        ...plan,
        assignments: enforceNightRecoveryAssignments(
          plan.assignments,
          shiftMap,
          effectiveGenerationRule.offDaysAfterNight
        ),
      }));

      const recommendation: GeminiRosterRecommendation = {
        summary: '',
        leaveSummary:
          approvedLeaveDayCount > 0
            ? `승인 휴가 ${approvedLeaveRequestCount}건 · ${approvedLeaveDayCount}일 반영`
            : '',
        preferredOffSummary:
          preferredOffDateCount > 0 ? `희망 OFF ${preferredOffDateCount}건 반영` : '',
        teamAnalysis: {
          teamPurpose: selectedPatternProfile
            ? `${selectedPatternProfile.name} 패턴을 기준으로 ${selectedDepartment} 근무표를 생성`
            : `${selectedDepartment} 기본 규칙형 패턴으로 근무표를 생성`,
          workMode: selectedPatternProfile ? '패턴 + 규칙 기반 자동 생성' : '기본 규칙 자동 생성',
          includesNight: selectedAiShifts.some((shift) => resolveShiftBand(shift) === 'night'),
          reasoning: [
            selectedPatternProfile
              ? `${selectedPatternProfile.name} 패턴 적용`
              : '팀 기본 교대 패턴 적용',
            selectedGenerationRule
              ? `${selectedGenerationRule.name} 근무규칙 적용`
              : '팀 기본 근무규칙 적용',
          ],
          planningFocus: [
            '전담자와 순환 근무자 분리',
            '나이트 뒤 데이 금지와 OFF 반영',
            '3교대자 월 나이트 최소·최대 반영',
          ],
        },
        staffPlans: recoveredStaffPlans.map((plan) => ({
          staffId: plan.staffId,
          modeLabel: plan.modeLabel,
          rationale: plan.rationale,
          assignments: plan.assignments,
        })),
      };

      recommendation.summary = selectedPatternProfile
        ? `${selectedDepartment} 팀에 "${selectedPatternProfile.name}" 패턴과 "${effectiveGenerationRule.name || '기본 근무규칙'}" 규칙을 적용해 월간 초안을 생성했습니다. ${Array.from(groupUsage.entries())
            .map(([label, count]) => `${label} ${count}명`)
            .join(', ')}`
        : `${selectedDepartment} 팀에 "${effectiveGenerationRule.name || '기본 근무규칙'}" 규칙을 적용해 월간 초안을 생성했습니다.`;

      setAiRecommendation(recommendation);
      setManualAssignments({});
      setManualEditMode(false);
      setGeminiSummary(
        recommendation.summary?.trim() || `${selectedDepartment} 팀 패턴 기반 초안이 적용되었습니다.`
      );
      setGeminiAppliedAt(new Date().toLocaleString('ko-KR'));
      setPendingSnapshotMeta({
        source: 'generated',
        label: `${selectedMonth} ${rosterScopeLabel} 패턴 생성본`,
      });
      toast('저장된 교대방식 패턴과 선택한 근무유형을 기준으로 월간 초안을 생성했습니다. 아래 미리보기에서 확인하세요.', 'success');
    } catch (error: unknown) {
      console.error('패턴 기반 근무표 생성 실패:', error);
      toast(`패턴 기반 근무표 생성 중 오류가 발생했습니다.\n${(error as Error)?.message || '알 수 없는 오류'}`, 'error');
    } finally {
      setGeminiLoading(false);
    }
  };

  const updateConfig = useCallback((staff: StaffMember, index: number, patch: Partial<StaffConfig>) => {
    setStaffConfigs((prev) => {
      const current =
        prev[staff.id] ||
        buildInitialConfig(staff, index, defaultShiftOrder.length ? defaultShiftOrder : defaultShiftPool, monthDates.length);
      const nextPattern = patch.pattern ?? current.pattern;
      const nextNightShiftCount = Object.prototype.hasOwnProperty.call(patch, 'nightShiftCount')
        ? patch.nightShiftCount || 0
        : current.nightShiftCount;
      const mergedConfig = {
        ...current,
        ...patch,
        pattern: nextPattern,
      };
      const nextWeeklyTemplateWeeks = normalizeWeeklyTemplateWeeks(
        mergedConfig.weeklyTemplateWeeks || [],
        [
          ...new Set(
            (mergedConfig.weeklyTemplateWeeks || [])
              .map((week) => week.shiftId)
              .concat([
                mergedConfig.primaryShiftId,
                mergedConfig.secondaryShiftId,
                mergedConfig.tertiaryShiftId,
              ])
              .filter(Boolean)
          ),
        ],
        mergedConfig.weeklyTemplateWeeks?.length || 1
      );
      const nextMinNightShiftCount = clampNightShiftCount(
        Number(mergedConfig.minNightShiftCount) || 0,
        monthDates.length
      );
      const nextMaxNightShiftCount = clampNightShiftCount(
        Number(mergedConfig.maxNightShiftCount) || 0,
        monthDates.length
      );

      return {
        ...prev,
        [staff.id]: {
          ...mergedConfig,
          nightShiftCount: isNightPattern(nextPattern)
            ? clampNightShiftCount(
              Number.isFinite(nextNightShiftCount)
                ? nextNightShiftCount
                : inferDefaultNightShiftCount(nextPattern, monthDates.length),
              monthDates.length
            )
            : 0,
          minNightShiftCount: nextMinNightShiftCount,
          maxNightShiftCount:
            nextMaxNightShiftCount > 0
              ? Math.max(nextMaxNightShiftCount, nextMinNightShiftCount)
              : 0,
          customPatternSequence: normalizeCustomPatternSequence(
            mergedConfig.customPatternSequence || [],
            workingShifts
          ),
          weeklyTemplateWeeks: nextWeeklyTemplateWeeks,
        },
      };
    });
  }, [defaultShiftOrder, defaultShiftPool, monthDates.length, workingShifts]);

  const currentPlannerShifts = useMemo(
    () =>
      ((isWeeklyTemplatePattern(effectivePlannerPattern)
        ? effectivePlannerWeeklyTemplateWeeks.map((week) => week.shiftId)
        : effectivePlannerCustomPatternSequence.length > 0
        ? effectivePlannerCustomPatternSequence.filter((token) => token !== OFF_SHIFT_TOKEN)
        : [plannerPrimaryShiftId, plannerSecondaryShiftId, plannerTertiaryShiftId])
      )
        .filter(Boolean)
        .filter((shiftId, index, list) => list.indexOf(shiftId) === index)
        .map((shiftId) => getShiftNameById(shiftId, workShifts)),
    [
      effectivePlannerPattern,
      effectivePlannerCustomPatternSequence,
      effectivePlannerWeeklyTemplateWeeks,
      plannerPrimaryShiftId,
      plannerSecondaryShiftId,
      plannerTertiaryShiftId,
      workShifts,
    ]
  );
  const plannerUsesCustomPattern = isCustomPattern(effectivePlannerPattern);
  const plannerUsesWeeklyTemplate = isWeeklyTemplatePattern(effectivePlannerPattern);
  const availablePlannerShiftIds = useMemo(
    () =>
      [plannerPrimaryShiftId, plannerSecondaryShiftId, plannerTertiaryShiftId]
        .filter(Boolean)
        .filter((shiftId, index, list) => list.indexOf(shiftId) === index),
    [plannerPrimaryShiftId, plannerSecondaryShiftId, plannerTertiaryShiftId]
  );

  const appendPlannerCustomPatternStep = useCallback((token: string) => {
    setPlannerCustomPatternSequence((prev) => [...prev, token]);
  }, []);

  const removePlannerCustomPatternStep = useCallback((index: number) => {
    setPlannerCustomPatternSequence((prev) => prev.filter((_, stepIndex) => stepIndex !== index));
  }, []);

  const clearPlannerCustomPatternSequence = useCallback(() => {
    setPlannerCustomPatternSequence([]);
  }, []);

  const setPlannerWeeklyTemplateWeekCount = useCallback((count: number) => {
    setPlannerWeeklyTemplateWeeks((prev) =>
      normalizeWeeklyTemplateWeeks(prev, availablePlannerShiftIds, count)
    );
  }, [availablePlannerShiftIds]);

  const updatePlannerWeeklyTemplateWeek = useCallback((
    weekIndex: number,
    patch: Partial<WeeklyTemplateWeek>
  ) => {
    setPlannerWeeklyTemplateWeeks((prev) => {
      const next = normalizeWeeklyTemplateWeeks(
        prev,
        availablePlannerShiftIds,
        Math.max(weekIndex + 1, prev.length || 1)
      );
      const current =
        next[weekIndex] || {
          shiftId: availablePlannerShiftIds[0] || '',
          activeWeekdays: [1, 2, 3, 4, 5],
        };
      next[weekIndex] = {
        shiftId: patch.shiftId ?? current.shiftId,
        activeWeekdays: patch.activeWeekdays
          ? normalizeActiveWeekdays(patch.activeWeekdays)
          : current.activeWeekdays,
      };
      return normalizeWeeklyTemplateWeeks(next, availablePlannerShiftIds, next.length);
    });
  }, [availablePlannerShiftIds]);

  const togglePlannerWeeklyTemplateWeekday = useCallback((weekIndex: number, weekday: number) => {
    const currentWeek = effectivePlannerWeeklyTemplateWeeks[weekIndex];
    const nextWeekdays = currentWeek?.activeWeekdays.includes(weekday)
      ? currentWeek.activeWeekdays.filter((value) => value !== weekday)
      : [...(currentWeek?.activeWeekdays || []), weekday];
    updatePlannerWeeklyTemplateWeek(weekIndex, {
      activeWeekdays: nextWeekdays,
    });
  }, [effectivePlannerWeeklyTemplateWeeks, updatePlannerWeeklyTemplateWeek]);

  const applyPlannerWeeklyTemplateWeekdays = useCallback((weekIndex: number, weekdays: number[]) => {
    updatePlannerWeeklyTemplateWeek(weekIndex, {
      activeWeekdays: weekdays,
    });
  }, [updatePlannerWeeklyTemplateWeek]);

  const resetWizardRuleSelection = useCallback(() => {
    setWizardPattern('');
    setWizardShiftIds([]);
    setWizardStartOffset(0);
    setWizardNightShiftCount(0);
    setWizardCustomPatternSequence([]);
    setWizardWeeklyTemplateWeeks([]);
  }, []);

  const openWizard = () => {
    const nextPattern = effectivePlannerPattern || '상근';
    const nextPlannerShiftIds =
      isWeeklyTemplatePattern(nextPattern)
        ? [
            ...new Set(
              effectivePlannerWeeklyTemplateWeeks
                .map((week) => week.shiftId)
                .concat([plannerPrimaryShiftId, plannerSecondaryShiftId, plannerTertiaryShiftId])
                .filter(Boolean)
            ),
          ]
        : [plannerPrimaryShiftId, plannerSecondaryShiftId, plannerTertiaryShiftId].filter(Boolean);
    const recommendedWizardShiftIds = [
      ...new Set(
        (selectedAiShifts.length > 0 ? selectedAiShifts : recommendedAiShifts)
          .map((shift) => shift.id)
          .filter(Boolean)
      ),
    ].slice(0, 3);
    const resolvedWizardShiftIds =
      nextPlannerShiftIds.length > 0 ? nextPlannerShiftIds : recommendedWizardShiftIds;
    const resolvedWizardPattern =
      nextPlannerShiftIds.length === 0 && resolvedWizardShiftIds.length >= 3 ? '3교대' : nextPattern;

    setWizardStep(1);
    setWizardPattern(resolvedWizardPattern);
    setWizardStartOffset(plannerStartOffset);
    setWizardNightShiftCount(
      isNightPattern(resolvedWizardPattern)
        ? previewRows.length > 0 || summary.enabledCount > 0
          ? plannerNightShiftCount
          : inferDefaultNightShiftCount(resolvedWizardPattern, monthDates.length)
        : 0
    );
    setWizardCustomPatternSequence(
      isCustomPattern(resolvedWizardPattern)
        ? effectivePlannerCustomPatternSequence.length > 0
          ? effectivePlannerCustomPatternSequence
          : buildDefaultCustomPatternSequence(resolvedWizardShiftIds)
        : []
    );
    setWizardWeeklyTemplateWeeks(
      isWeeklyTemplatePattern(resolvedWizardPattern)
        ? effectivePlannerWeeklyTemplateWeeks.length > 0
          ? effectivePlannerWeeklyTemplateWeeks
          : buildDefaultWeeklyTemplateWeeks(resolvedWizardShiftIds, 1)
        : []
    );
    setWizardShiftIds(
      isCustomPattern(resolvedWizardPattern)
        ? effectivePlannerCustomPatternSequence
            .filter((token) => token !== OFF_SHIFT_TOKEN)
            .filter((shiftId, index, list) => list.indexOf(shiftId) === index)
        : resolvedWizardShiftIds
    );
    setWizardGenerationBasis(selectedGenerationRule ? 'saved_rule' : 'rotation_only');
    setWizardRuleDraft({
      ...previewGenerationRule,
      teamKeywords: [...previewGenerationRule.teamKeywords],
      roleCoverageRules: previewGenerationRule.roleCoverageRules.map((rule) => ({
        ...rule,
        keywords: [...rule.keywords],
      })),
    });
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

  const toggleIncludedDepartment = useCallback((department: string) => {
    const normalizedDepartment = String(department || '').trim();
    if (!normalizedDepartment || normalizedDepartment === selectedDepartment) return;
    setIncludedDepartments((prev) =>
      prev.includes(normalizedDepartment)
        ? prev.filter((entry) => entry !== normalizedDepartment)
        : [...prev, normalizedDepartment]
    );
  }, [selectedDepartment]);

  const renderRosterScopeSummary = () => {
    if (!selectedDepartment) return null;

    const includesSuyeonNursingTeam =
      Boolean(suyeonNursingDepartment) && includedDepartments.includes(suyeonNursingDepartment);

    return (
      <div
        className="mt-4 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--muted)]/70 px-4 py-4"
        data-testid="roster-scope-summary"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">현재 스케줄표 범위</p>
            <p className="mt-1 text-sm font-bold text-[var(--foreground)]">{rosterScopeLabel}</p>
            <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
              병동팀을 기본으로 두고 함께 편성할 팀을 여기서 바로 추가하거나 뺄 수 있습니다.
            </p>
          </div>
          {suyeonNursingDepartment ? (
            <button
              type="button"
              onClick={() => toggleIncludedDepartment(suyeonNursingDepartment)}
              className={`rounded-[var(--radius-lg)] border px-4 py-2 text-[11px] font-bold transition-colors ${
                includesSuyeonNursingTeam
                  ? 'border-[var(--accent)] bg-[var(--toss-blue-light)] text-[var(--accent)]'
                  : 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]'
              }`}
              data-testid="roster-suyeon-team-toggle"
            >
              {includesSuyeonNursingTeam ? '수연의원 간호팀 제외' : '수연의원 간호팀 포함'}
            </button>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {scopedRosterDepartments.map((department, index) => {
            const isPrimaryDepartment = department === selectedDepartment;
            return isPrimaryDepartment ? (
              <span
                key={department}
                className="rounded-[var(--radius-md)] border border-[var(--accent)]/30 bg-[var(--toss-blue-light)] px-3 py-2 text-[11px] font-bold text-[var(--accent)]"
                data-testid={`roster-scope-chip-${index + 1}`}
              >
                기본 팀 · {department}
              </span>
            ) : (
              <button
                key={department}
                type="button"
                onClick={() => toggleIncludedDepartment(department)}
                className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[11px] font-bold text-[var(--foreground)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                data-testid={`roster-scope-chip-${index + 1}`}
              >
                포함 팀 · {department} ×
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const toggleWizardStaff = useCallback((staffId: string) => {
    setWizardSelectedStaffIds((prev) => {
      const next = prev.includes(staffId)
        ? prev.filter((value) => value !== staffId)
        : [...prev, staffId];
      return orderedTargetStaffIds.filter((candidateId) => next.includes(candidateId));
    });
  }, [orderedTargetStaffIds]);
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

    const getShiftIdBySlot = (slot: number) => resolvedShiftIds[Math.max(0, slot - 1)] || resolvedShiftIds[0] || '';
    const nextCustomPatternSequence =
      normalizedPreset.pattern === CUSTOM_PATTERN_VALUE
        ? normalizedPreset.customPatternSlots
            .map((token) => (token === 'OFF' ? OFF_SHIFT_TOKEN : getShiftIdBySlot(token)))
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
      setWizardRuleDraft(cloneGenerationRule(normalizedPreset.generationRule) || previewGenerationRule);
    }
    if (normalizedPreset.staffNightRanges && Object.keys(normalizedPreset.staffNightRanges).length > 0) {
      setWizardNightRangeDrafts((prev) => {
        const next = { ...prev };
        Object.entries(normalizedPreset.staffNightRanges || {}).forEach(([staffId, range]) => {
          next[staffId] = {
            minNightShiftCount: clampNightShiftCount(range.minNightShiftCount || 0, monthDates.length),
            maxNightShiftCount: clampNightShiftCount(
              Math.max(range.minNightShiftCount || 0, range.maxNightShiftCount || 0),
              monthDates.length
            ),
          };
        });
        return next;
      });
    }
    if (normalizedPreset.staffBlockPreferences) {
      setWizardBlockPreferenceDrafts((prev) => ({
        ...prev,
        ...Object.fromEntries(
          Object.entries(normalizedPreset.staffBlockPreferences || {}).map(([staffId, value]) => [
            staffId,
            normalizeStaffBlockPreference(value),
          ])
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
          Object.entries(normalizedPreset.staffRestrictions || {}).map(([staffId, restriction]) => [
            staffId,
            {
              ...buildDefaultStaffRestrictionDraft(),
              ...restriction,
            },
          ])
        ),
      }));
    }
    if (normalizedPreset.staffCoverageRoleTags) {
      setWizardCoverageRoleDrafts((prev) => ({
        ...prev,
        ...Object.fromEntries(
          Object.entries(normalizedPreset.staffCoverageRoleTags || {}).map(([staffId, tags]) => [
            staffId,
            normalizeCoverageRoleTags(tags),
          ])
        ),
      }));
    }
    setWizardPairRules(normalizedPreset.pairRules || []);
    setWizardSelectedPresetId(normalizedPreset.id);
  };

  const deleteWizardPreset = useCallback((presetId: string) => {
    setSavedWizardPresets((prev) => prev.filter((preset) => preset.id !== presetId));
    if (wizardSelectedPresetId === presetId) {
      setWizardSelectedPresetId('');
      resetWizardRuleSelection();
    }
  }, [wizardSelectedPresetId, resetWizardRuleSelection]);

  const savePlannerPreset = () => {
    if (!canManageRosterPolicies) {
      toast('자동생성 형식 저장은 관리자 전용입니다.', 'warning');
      return;
    }
    const nextName = plannerPresetName.trim();
    if (!nextName) {
      toast('자동생성 형식 이름을 입력하세요.', 'warning');
      return;
    }
    if (plannerShiftIds.length === 0) {
      toast('형식으로 저장할 근무유형이 없습니다.', 'success');
      return;
    }
    if (
      isCustomPattern(effectivePlannerPattern) &&
      (effectivePlannerCustomPatternSequence.length === 0 ||
        !effectivePlannerCustomPatternSequence.some((token) => token !== OFF_SHIFT_TOKEN))
    ) {
      toast('커스텀 순환 순서를 만든 뒤 저장하세요.', 'success');
      return;
    }
    if (
      isWeeklyTemplatePattern(effectivePlannerPattern) &&
      !effectivePlannerWeeklyTemplateWeeks.some(
        (week) => Boolean(week.shiftId) && week.activeWeekdays.length > 0
      )
    ) {
      toast('주차 템플릿에는 근무가 들어가는 요일이 한 번 이상 포함되어야 합니다.');
      return;
    }

    const slotByShiftId = new Map(plannerShiftIds.map((shiftId, index) => [shiftId, index + 1]));
    const existingPreset = savedWizardPresets.find((preset) => preset.name.trim() === nextName);
    const presetStaffNightRanges = Object.fromEntries(
      targetStaffs.map((staff, index) => {
        const staffId = String(staff.id);
        const current =
          effectiveTargetStaffConfigs.get(staffId) ||
          buildInitialConfig(
            staff,
            index,
            defaultShiftOrder.length ? defaultShiftOrder : defaultShiftPool,
            monthDates.length
          );
        const minNightShiftCount = clampNightShiftCount(current.minNightShiftCount || 0, monthDates.length);
        const maxNightShiftCount = clampNightShiftCount(
          Math.max(current.minNightShiftCount || 0, current.maxNightShiftCount || 0),
          monthDates.length
        );

        return [
          staffId,
          {
            minNightShiftCount,
            maxNightShiftCount,
          },
        ];
      })
    );
    const presetStaffBlockPreferences: Record<string, StaffBlockPreference> = Object.fromEntries(
      targetStaffs.map((staff, index) => {
        const staffId = String(staff.id);
        const current =
          effectiveTargetStaffConfigs.get(staffId) ||
          buildInitialConfig(
            staff,
            index,
            defaultShiftOrder.length ? defaultShiftOrder : defaultShiftPool,
            monthDates.length
          );
        return [staffId, normalizeStaffBlockPreference(current.blockPreference)];
      })
    );
    const presetDedicatedBands: Record<string, CoverageBand | ''> = Object.fromEntries(
      targetStaffs.map((staff) => [
        String(staff.id),
        (staffDedicatedBandOverrides[String(staff.id)] || '') as CoverageBand | '',
      ])
    );
    const presetStaffRestrictions: Record<string, StaffRestrictionDraft> = Object.fromEntries(
      targetStaffs.map((staff, index) => {
        const staffId = String(staff.id);
        const current =
          effectiveTargetStaffConfigs.get(staffId) ||
          buildInitialConfig(
            staff,
            index,
            defaultShiftOrder.length ? defaultShiftOrder : defaultShiftPool,
            monthDates.length
          );
        return [
          staffId,
          {
            blockedShiftBands: normalizeBlockedShiftBands(current.blockedShiftBands || []),
            blockedWeekdays: normalizeBlockedWeekdays(current.blockedWeekdays || []),
            avoidWeekendWork: Boolean(current.avoidWeekendWork),
            avoidHolidayWork: Boolean(current.avoidHolidayWork),
            preferWeekendOff: Boolean(current.preferWeekendOff),
            preferHolidayOff: Boolean(current.preferHolidayOff),
            avoidConsecutiveEvening: Boolean(current.avoidConsecutiveEvening),
            preferEarlyMonthNight: Boolean(current.preferEarlyMonthNight),
          },
        ];
      })
    );
    const presetCoverageRoleTags = Object.fromEntries(
      targetStaffs.map((staff) => [
        String(staff.id),
        expandCoverageRoleTags(staffCoverageRoleTags[String(staff.id)] || []),
      ])
    );
    const nextPreset: RosterWizardPreset = {
      id: existingPreset?.id || `preset-${Date.now()}`,
      name: nextName,
      description: buildWizardPresetDescription(
        effectivePlannerPattern,
        effectivePlannerWeeklyTemplateWeeks,
        plannerShiftIds.length
      ),
      pattern: effectivePlannerPattern,
      shiftSlotCount: plannerShiftIds.length,
      shiftIds: plannerShiftIds,
      shiftNames: plannerShiftIds.map((shiftId) => getShiftNameById(shiftId, workShifts)),
      startOffset: plannerStartOffset,
      nightShiftCount: isNightPattern(effectivePlannerPattern) ? plannerNightShiftCount : 0,
      customPatternSlots: isCustomPattern(effectivePlannerPattern)
        ? effectivePlannerCustomPatternSequence
            .map((token) => (token === OFF_SHIFT_TOKEN ? 'OFF' : slotByShiftId.get(token) || 1))
            .filter((token) => token === 'OFF' || typeof token === 'number')
        : [],
      weeklyTemplateWeeks: isWeeklyTemplatePattern(effectivePlannerPattern)
        ? effectivePlannerWeeklyTemplateWeeks.map((week) => ({
            shiftSlot: slotByShiftId.get(week.shiftId) || 1,
            activeWeekdays: week.activeWeekdays,
          }))
        : [],
      generationRule: cloneGenerationRule(previewGenerationRule),
      staffNightRanges: presetStaffNightRanges,
      staffBlockPreferences: presetStaffBlockPreferences,
      staffDedicatedBands: presetDedicatedBands,
      staffRestrictions: presetStaffRestrictions,
      staffCoverageRoleTags: presetCoverageRoleTags,
      pairRules: plannerPairRules,
    };

    setSavedWizardPresets((prev) => [nextPreset, ...prev.filter((preset) => preset.id !== nextPreset.id)]);
    setPlannerPresetName('');
    toast(`"${nextName}" 자동생성 형식을 저장했습니다.`, 'success');
  };

  const applyPlannerPreset = useCallback((preset: RosterWizardPreset) => {
    const normalizedPreset = normalizePresetRecord(preset);
    if (!normalizedPreset) return;

    const resolvedShiftIds = resolvePresetShiftIds(
      normalizedPreset,
      plannerShiftIds
        .concat(defaultShiftOrder.map((shift) => shift.id))
        .concat(defaultShiftPool.map((shift) => shift.id)),
      defaultShiftPool
    );
    if (resolvedShiftIds.length === 0) {
      toast('적용할 근무유형이 없습니다. 먼저 근무유형을 등록하세요.', 'success');
      return;
    }

    const getShiftIdBySlot = (slot: number) => resolvedShiftIds[Math.max(0, slot - 1)] || resolvedShiftIds[0] || '';
    const nextCustomPatternSequence =
      normalizedPreset.pattern === CUSTOM_PATTERN_VALUE
        ? normalizedPreset.customPatternSlots
            .map((token) => (token === 'OFF' ? OFF_SHIFT_TOKEN : getShiftIdBySlot(token)))
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

    setPlannerPattern(normalizedPreset.pattern);
    setPlannerPrimaryShiftId(resolvedShiftIds[0] || '');
    setPlannerSecondaryShiftId(resolvedShiftIds[1] || resolvedShiftIds[0] || '');
    setPlannerTertiaryShiftId(resolvedShiftIds[2] || resolvedShiftIds[1] || resolvedShiftIds[0] || '');
    setPlannerStartOffset(normalizedPreset.startOffset);
    setPlannerNightShiftCount(
      isNightPattern(normalizedPreset.pattern)
        ? clampNightShiftCount(normalizedPreset.nightShiftCount, monthDates.length)
        : 0
    );
    setPlannerCustomPatternSequence(
      normalizedPreset.pattern === CUSTOM_PATTERN_VALUE
        ? nextCustomPatternSequence.length > 0
          ? nextCustomPatternSequence
          : buildDefaultCustomPatternSequence(resolvedShiftIds)
        : []
    );
    setPlannerWeeklyTemplateWeeks(nextWeeklyTemplateWeeks);
    if (normalizedPreset.generationRule) {
      setSelectedGenerationRuleId('');
      setActiveGenerationRuleOverride(cloneGenerationRule(normalizedPreset.generationRule));
    }
    if (normalizedPreset.staffNightRanges && Object.keys(normalizedPreset.staffNightRanges).length > 0) {
      setStaffConfigs((prev) => {
        const next = { ...prev };
        targetStaffs.forEach((staff, index) => {
          const staffId = String(staff.id);
          const presetRange = normalizedPreset.staffNightRanges?.[staffId];
          if (!presetRange) return;

          const current =
            prev[staff.id] ||
            buildInitialConfig(
              staff,
              index,
              defaultShiftOrder.length ? defaultShiftOrder : defaultShiftPool,
              monthDates.length
            );
          next[staff.id] = {
            ...current,
            minNightShiftCount: clampNightShiftCount(
              presetRange.minNightShiftCount || 0,
              monthDates.length
            ),
            maxNightShiftCount: clampNightShiftCount(
              Math.max(
                presetRange.minNightShiftCount || 0,
                presetRange.maxNightShiftCount || 0
              ),
              monthDates.length
            ),
            blockPreference: normalizeStaffBlockPreference(
              normalizedPreset.staffBlockPreferences?.[staffId]
            ),
          };
          const restriction = normalizedPreset.staffRestrictions?.[staffId];
          if (restriction) {
            next[staff.id] = {
              ...next[staff.id],
              blockedShiftBands: normalizeBlockedShiftBands(restriction.blockedShiftBands),
              blockedWeekdays: normalizeBlockedWeekdays(restriction.blockedWeekdays),
              avoidWeekendWork: Boolean(restriction.avoidWeekendWork),
              avoidHolidayWork: Boolean(restriction.avoidHolidayWork),
              preferWeekendOff: Boolean(restriction.preferWeekendOff),
              preferHolidayOff: Boolean(restriction.preferHolidayOff),
              avoidConsecutiveEvening: Boolean(restriction.avoidConsecutiveEvening),
              preferEarlyMonthNight: Boolean(restriction.preferEarlyMonthNight),
            };
          }
        });
        return next;
      });
    }
    if (normalizedPreset.staffBlockPreferences) {
      setStaffConfigs((prev) => {
        const next = { ...prev };
        targetStaffs.forEach((staff, index) => {
          const staffId = String(staff.id);
          const blockPreference = normalizedPreset.staffBlockPreferences?.[staffId];
          if (!blockPreference) return;
          const current =
            prev[staff.id] ||
            buildInitialConfig(
              staff,
              index,
              defaultShiftOrder.length ? defaultShiftOrder : defaultShiftPool,
              monthDates.length
            );
          next[staff.id] = {
            ...current,
            blockPreference: normalizeStaffBlockPreference(blockPreference),
          };
        });
        return next;
      });
    }
    if (normalizedPreset.staffDedicatedBands) {
      setStaffDedicatedBandOverrides((prev) => {
        const next = { ...prev };
        Object.entries(normalizedPreset.staffDedicatedBands || {}).forEach(([staffId, band]) => {
          if (band) {
            next[staffId] = band;
            return;
          }
          delete next[staffId];
        });
        return next;
      });
    }
    if (normalizedPreset.staffRestrictions) {
      setStaffConfigs((prev) => {
        const next = { ...prev };
        targetStaffs.forEach((staff, index) => {
          const staffId = String(staff.id);
          const restriction = normalizedPreset.staffRestrictions?.[staffId];
          if (!restriction) return;
          const current =
            prev[staff.id] ||
            buildInitialConfig(
              staff,
              index,
              defaultShiftOrder.length ? defaultShiftOrder : defaultShiftPool,
              monthDates.length
            );
          next[staff.id] = {
            ...current,
            blockedShiftBands: normalizeBlockedShiftBands(restriction.blockedShiftBands),
            blockedWeekdays: normalizeBlockedWeekdays(restriction.blockedWeekdays),
            avoidWeekendWork: Boolean(restriction.avoidWeekendWork),
            avoidHolidayWork: Boolean(restriction.avoidHolidayWork),
            preferWeekendOff: Boolean(restriction.preferWeekendOff),
            preferHolidayOff: Boolean(restriction.preferHolidayOff),
            avoidConsecutiveEvening: Boolean(restriction.avoidConsecutiveEvening),
            preferEarlyMonthNight: Boolean(restriction.preferEarlyMonthNight),
          };
        });
        return next;
      });
    }
    if (normalizedPreset.staffCoverageRoleTags) {
      setStaffCoverageRoleTags((prev) => ({
        ...prev,
        ...Object.fromEntries(
          Object.entries(normalizedPreset.staffCoverageRoleTags || {}).map(([staffId, tags]) => [
            staffId,
            normalizeCoverageRoleTags(tags),
          ])
        ),
      }));
    }
    setPlannerPairRules(normalizedPreset.pairRules || []);
  }, [plannerShiftIds, defaultShiftOrder, defaultShiftPool, monthDates.length, targetStaffs, toast]);

  const updateWizardOffOverride = useCallback((staffId: string, patch: Partial<WizardOffOverride>) => {
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
  }, [wizardOverrideDateOptions, wizardOverrideShiftOptions]);

  const updateWizardNightRangeDraft = useCallback((
    staffId: string,
    field: keyof WizardNightRangeDraft,
    value: string
  ) => {
    setWizardNightRangeDrafts((prev) => {
      const current = prev[staffId] || { minNightShiftCount: 0, maxNightShiftCount: 0 };
      const nextValue = clampNightShiftCount(Number(value) || 0, monthDates.length);
      const next = {
        ...current,
        [field]: nextValue,
      };

      if (field === 'minNightShiftCount' && next.maxNightShiftCount > 0) {
        next.maxNightShiftCount = Math.max(next.minNightShiftCount, next.maxNightShiftCount);
      }
      if (field === 'maxNightShiftCount') {
        next.maxNightShiftCount = Math.max(next.minNightShiftCount, next.maxNightShiftCount);
      }

      return {
        ...prev,
        [staffId]: next,
      };
    });
  }, [monthDates.length]);

  const updateWizardBlockPreferenceDraft = useCallback((staffId: string, value: string) => {
    setWizardBlockPreferenceDrafts((prev) => ({
      ...prev,
      [staffId]: normalizeStaffBlockPreference(value),
    }));
  }, []);

  const updateWizardDedicatedBandDraft = useCallback((staffId: string, value: string) => {
    setWizardDedicatedBandDrafts((prev) => ({
      ...prev,
      [staffId]: value === 'day' || value === 'evening' || value === 'night' ? value : '',
    }));
  }, []);

  const updateWizardCoverageRoleDraft = useCallback((staffId: string, value: string) => {
    setWizardCoverageRoleDrafts((prev) => ({
      ...prev,
      [staffId]: normalizeCoverageRoleTags(value.split(',')),
    }));
  }, []);

  const updateWizardStaffRestrictionDraft = useCallback((
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
  }, []);

  const addWizardPairRule = () => {
    const primaryStaffId = wizardSelectedStaffIds[0] || '';
    const secondaryStaffId = wizardSelectedStaffIds[1] || primaryStaffId;
    if (!primaryStaffId || !secondaryStaffId || primaryStaffId === secondaryStaffId) return;
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

  const updateWizardPairRule = useCallback((
    ruleId: string,
    field: keyof Omit<WizardPairRule, 'id'>,
    value: string
  ) => {
    setWizardPairRules((prev) =>
      prev.map((rule) => {
        if (rule.id !== ruleId) return rule;
        if (field === 'mode' && value !== 'together' && value !== 'separate') return rule;
        if (field === 'band' && value !== 'night' && value !== 'work') return rule;
        return {
          ...rule,
          [field]: value,
        } as WizardPairRule;
      })
    );
  }, []);

  const removeWizardPairRule = useCallback((ruleId: string) => {
    setWizardPairRules((prev) => prev.filter((rule) => rule.id !== ruleId));
  }, []);

  const getWizardRuleValidationError = () => {
    if (!wizardSelectedPresetId) {
      return '먼저 저장한 자동생성 규칙을 불러오세요.';
    }
    if (!wizardPattern || orderedWizardShiftIds.length === 0) {
      return '불러온 규칙에 사용할 근무유형을 확인할 수 없습니다.';
    }
    if (
      wizardUsesCustomPattern &&
      (effectiveWizardCustomPatternSequence.length === 0 ||
        !effectiveWizardCustomPatternSequence.some((token) => token !== OFF_SHIFT_TOKEN))
    ) {
      return '불러온 순환 규칙에 실제 근무 순서가 없습니다.';
    }
    if (
      wizardUsesWeeklyTemplate &&
      !effectiveWizardWeeklyTemplateWeeks.some(
        (week) => Boolean(week.shiftId) && week.activeWeekdays.length > 0
      )
    ) {
      return '불러온 주차 규칙에 근무 요일이 없습니다.';
    }
    return null;
  };

  const applyWizard = () => {
    if (!selectedCompany) return toast('사업체를 먼저 선택하세요.', 'warning');
    if (!selectedDepartment || selectedDepartment === '전체 부서') {
      return toast('근무표를 생성할 팀을 선택하세요.', 'warning');
    }
    if (!wizardSelectedStaffIds.length) return toast('근무표를 생성할 직원을 한 명 이상 선택하세요.', 'warning');
    if (!wizardUsesCustomPattern && !wizardUsesWeeklyTemplate && orderedWizardShiftIds.length < wizardRequiredShiftCount) {
      return toast(`${wizardPattern} 패턴에 필요한 근무유형 ${wizardRequiredShiftCount}개를 선택하세요.`, 'warning');
    }
    if (wizardUsesCustomPattern && orderedWizardShiftIds.length === 0) {
      return toast('커스텀 패턴에 사용할 근무유형을 1개 이상 선택하세요.', 'warning');
    }
    if (wizardUsesWeeklyTemplate && orderedWizardShiftIds.length === 0) {
      return toast('주차 템플릿에 사용할 근무유형을 1개 이상 선택하세요.', 'warning');
    }
    if (
      wizardUsesCustomPattern &&
      (effectiveWizardCustomPatternSequence.length === 0 ||
        !effectiveWizardCustomPatternSequence.some((token) => token !== OFF_SHIFT_TOKEN))
    ) {
      return toast('커스텀 패턴 순서를 만들고, 실제 근무유형을 1개 이상 포함해 주세요.');
    }
    if (
      wizardUsesWeeklyTemplate &&
      !effectiveWizardWeeklyTemplateWeeks.some(
        (week) => Boolean(week.shiftId) && week.activeWeekdays.length > 0
      )
    ) {
      return toast('주차 템플릿에는 근무가 들어가는 요일을 최소 1일 이상 지정하세요.');
    }

    const primaryShiftId = orderedWizardShiftIds[0] || '';
    const secondaryShiftId = orderedWizardShiftIds[1] || primaryShiftId;
    const tertiaryShiftId = orderedWizardShiftIds[2] || secondaryShiftId || primaryShiftId;
    if (!primaryShiftId) return toast('근무유형을 한 개 이상 선택하세요.', 'warning');
    const nextCustomPatternSequence = wizardUsesCustomPattern ? effectiveWizardCustomPatternSequence : [];
    const nextWeeklyTemplateWeeks = wizardUsesWeeklyTemplate ? effectiveWizardWeeklyTemplateWeeks : [];

    const selectedIndexMap = new Map<string, number>();
    wizardSelectedStaffIds.forEach((staffId, index) => {
      selectedIndexMap.set(staffId, index);
    });
    const nextManualAssignments: ManualAssignmentMap = {};
    const nextGenerationRuleOverride: RosterGenerationRule = {
      ...wizardRuleDraft,
      name: wizardRuleDraft.name || previewGenerationRule.name || '월간 편성 규칙',
      companyName: selectedCompany,
      companyId: selectedCompanyId,
      teamKeywords:
        wizardRuleDraft.teamKeywords.length > 0
          ? wizardRuleDraft.teamKeywords
          : [selectedDepartment, ...includedDepartments].filter(Boolean),
      weekendMinDayStaff: Math.max(0, Math.floor(wizardRuleDraft.weekendMinDayStaff || 0)),
      weekendMinEveningStaff: Math.max(0, Math.floor(wizardRuleDraft.weekendMinEveningStaff || 0)),
      weekendMinNightStaff: Math.max(0, Math.floor(wizardRuleDraft.weekendMinNightStaff || 0)),
      holidayMinDayStaff: Math.max(0, Math.floor(wizardRuleDraft.holidayMinDayStaff || 0)),
      holidayMinEveningStaff: Math.max(0, Math.floor(wizardRuleDraft.holidayMinEveningStaff || 0)),
      holidayMinNightStaff: Math.max(0, Math.floor(wizardRuleDraft.holidayMinNightStaff || 0)),
      dateCoverageOverrides: (wizardRuleDraft.dateCoverageOverrides || [])
        .map((entry, index) => ({
          id: entry.id || `date-coverage-${index + 1}`,
          date: String(entry.date || '').slice(0, 10),
          minDayStaff: Math.max(0, Math.floor(entry.minDayStaff || 0)),
          minEveningStaff: Math.max(0, Math.floor(entry.minEveningStaff || 0)),
          minNightStaff: Math.max(0, Math.floor(entry.minNightStaff || 0)),
        }))
        .filter(
          (entry) =>
            /^\d{4}-\d{2}-\d{2}$/.test(entry.date) &&
            (entry.minDayStaff > 0 || entry.minEveningStaff > 0 || entry.minNightStaff > 0)
        ),
      roleCoverageRules: wizardRuleDraft.roleCoverageRules
        .map((rule, index) => ({
          ...rule,
          id: rule.id || `role-slot-${index + 1}`,
          label: String(rule.label || `역할 슬롯 ${index + 1}`).trim(),
          keywords: normalizeCoverageRoleTags(rule.keywords || []),
          minDayStaff: Math.max(0, Math.floor(rule.minDayStaff || 0)),
          minEveningStaff: Math.max(0, Math.floor(rule.minEveningStaff || 0)),
          minNightStaff: Math.max(0, Math.floor(rule.minNightStaff || 0)),
        }))
        .filter(
          (rule) =>
            (rule.label || '').trim() &&
            (rule.minDayStaff > 0 || rule.minEveningStaff > 0 || rule.minNightStaff > 0)
        ),
    };

    wizardSelectedStaffIds.forEach((staffId) => {
      const override = wizardOffOverrides[staffId];
      if (!override?.enabled || !override.offDate) return;

      const offDateIndex = monthDates.indexOf(override.offDate);
      if (offDateIndex === -1) return;

      nextManualAssignments[buildAssignmentKey(staffId, override.offDate)] = OFF_SHIFT_TOKEN;

      const nextDate = monthDates[offDateIndex + 1];
      if (nextDate && override.nextShiftId) {
        nextManualAssignments[buildAssignmentKey(staffId, nextDate)] = override.nextShiftId;
      }
    });

    setPlannerPattern(wizardPattern);
    setPlannerPrimaryShiftId(primaryShiftId);
    setPlannerSecondaryShiftId(secondaryShiftId);
    setPlannerTertiaryShiftId(tertiaryShiftId);
    setPlannerStartOffset(wizardStartOffset);
    setPlannerNightShiftCount(isNightPattern(wizardPattern) ? wizardNightShiftCount : 0);
    setPlannerCustomPatternSequence(nextCustomPatternSequence);
    setPlannerWeeklyTemplateWeeks(nextWeeklyTemplateWeeks);

    setStaffConfigs((prev) => {
      const next = { ...prev };
      targetStaffs.forEach((staff, index) => {
        const current =
          prev[staff.id] ||
          buildInitialConfig(staff, index, defaultShiftOrder.length ? defaultShiftOrder : defaultShiftPool, monthDates.length);
        const selectedIndex = selectedIndexMap.get(String(staff.id));

        next[staff.id] = {
          ...current,
          enabled: selectedIndex !== undefined,
          pattern: wizardPattern,
          primaryShiftId,
          secondaryShiftId,
          tertiaryShiftId,
          startOffset: selectedIndex !== undefined ? wizardStartOffset + selectedIndex : current.startOffset,
          nightShiftCount: isNightPattern(wizardPattern)
            ? clampNightShiftCount(wizardNightShiftCount, monthDates.length)
            : 0,
          minNightShiftCount:
            wizardNightRangeDrafts[String(staff.id)]?.minNightShiftCount ?? current.minNightShiftCount,
          maxNightShiftCount:
            wizardNightRangeDrafts[String(staff.id)]?.maxNightShiftCount ?? current.maxNightShiftCount,
          blockPreference:
            wizardBlockPreferenceDrafts[String(staff.id)] ?? current.blockPreference,
          customPatternSequence: nextCustomPatternSequence,
          weeklyTemplateWeeks: nextWeeklyTemplateWeeks,
          blockedShiftBands: normalizeBlockedShiftBands(
            wizardStaffRestrictionDrafts[String(staff.id)]?.blockedShiftBands || []
          ),
          blockedWeekdays: normalizeBlockedWeekdays(
            wizardStaffRestrictionDrafts[String(staff.id)]?.blockedWeekdays || []
          ),
          avoidWeekendWork: Boolean(
            wizardStaffRestrictionDrafts[String(staff.id)]?.avoidWeekendWork
          ),
          avoidHolidayWork: Boolean(
            wizardStaffRestrictionDrafts[String(staff.id)]?.avoidHolidayWork
          ),
          preferWeekendOff: Boolean(
            wizardStaffRestrictionDrafts[String(staff.id)]?.preferWeekendOff
          ),
          preferHolidayOff: Boolean(
            wizardStaffRestrictionDrafts[String(staff.id)]?.preferHolidayOff
          ),
          avoidConsecutiveEvening: Boolean(
            wizardStaffRestrictionDrafts[String(staff.id)]?.avoidConsecutiveEvening
          ),
          preferEarlyMonthNight: Boolean(
            wizardStaffRestrictionDrafts[String(staff.id)]?.preferEarlyMonthNight
          ),
        };
      });
      return next;
    });

    setStaffDedicatedBandOverrides((prev) => {
      const next = { ...prev };
      targetStaffs.forEach((staff) => {
        next[String(staff.id)] = wizardDedicatedBandDrafts[String(staff.id)] || '';
      });
      return next;
    });
    setStaffCoverageRoleTags((prev) => {
      const next = { ...prev };
      targetStaffs.forEach((staff) => {
        next[String(staff.id)] = expandCoverageRoleTags(wizardCoverageRoleDrafts[String(staff.id)] || []);
      });
      return next;
    });
    setActiveGenerationRuleOverride(nextGenerationRuleOverride);
    setPlannerPairRules(wizardPairRules);
    setSelectedManualCell(null);
    setManualAssignments(nextManualAssignments);
    closeWizard();
    toast(`${rosterScopeLabel} 팀 ${wizardSelectedStaffIds.length}명의 근무표 초안을 생성했습니다. 아래에서 임의 수정 후 저장하세요.`, 'success');
  };

  const ensureOffShift = async () => {
    if (offShift) return offShift;

    const payload = {
      name: '휴무',
      start_time: '00:00',
      end_time: '00:00',
      description: '근무표 자동편성에서 생성한 휴무 코드',
      company_name: selectedCompany,
      shift_type: '휴무',
      weekly_work_days: 0,
      is_weekend_work: true,
      is_shift: false,
      is_active: true,
    };

    const { data, error } = await supabase
      .from('work_shifts')
      .insert([payload])
      .select('id, name, start_time, end_time, shift_type, company_name')
      .single();

    if (error) throw error;

    const nextOffShift = data as WorkShift;
    setWorkShifts((prev) => [...prev, nextOffShift]);
    return nextOffShift;
  };

  const renderRosterWizardModal = () => {
    if (!wizardOpen) return null;

    return (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 px-4 py-4">
            <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
              <div className="border-b border-[var(--border)] bg-[var(--page-bg)] px-4 py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="text-2xl font-black tracking-[-0.03em] text-[var(--foreground)]">
                      <span className="bg-gradient-to-r from-[var(--accent)] to-fuchsia-500 bg-clip-text text-transparent">
                        RUN SHIFT
                      </span>{' '}
                      마법사
                    </h3>
                    <p className="mt-1 text-sm text-[var(--toss-gray-3)]">
                      팀을 카드로 선택하고, 직원을 고른 뒤, 근무유형을 체크해서 월간 근무표를 바로 생성합니다.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { step: 1 as WizardStep, label: '팀 선택' },
                      { step: 2 as WizardStep, label: '직원 선택' },
                      { step: 3 as WizardStep, label: '패턴 · 근무유형' },
                      { step: 4 as WizardStep, label: '예외 일정' },
                    ].map(({ step, label }) => (
                      <div
                        key={step}
                        className={`rounded-[var(--radius-md)] px-4 py-2 text-sm font-semibold ${wizardStep === step ? 'bg-[var(--accent)] text-white' : wizardStep > step ? 'bg-[var(--toss-blue-light)] text-[var(--accent)]' : 'bg-[var(--muted)] text-[var(--toss-gray-3)]'}`}
                      >
                        {step}. {label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
    
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {wizardStep === 1 && (
                  <div className="space-y-4">
                    <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
                      <div className="space-y-4">
                        <label className="flex flex-col gap-0">
                          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2">
                            <SmartMonthPicker
                              value={selectedMonth}
                              onChange={(value) => setSelectedMonth(value)}
                              className="w-[150px]"
                              inputClassName="text-sm font-semibold text-[var(--foreground)]"
                            />
                          </div>
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">사업체</span>
                          <select
                            value={selectedCompany}
                            onChange={(e) => setSelectedCompany(e.target.value)}
                            disabled={!isAdmin || companyLockedByHrFilter}
                            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:bg-[var(--tab-bg)]"
                          >
                            {companyOptions.map((company) => (
                              <option key={company} value={company}>
                                {company}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
    
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--muted)] px-5 py-4">
                          <p className="text-sm font-bold text-[var(--foreground)]">어떤 팀의 근무표를 만들까요?</p>
                          <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                            병동처럼 3교대 팀은 이후 단계에서 데이 / 이브닝 / 나이트를 체크해서 D / E / N / OFF 형태로 만들 수 있습니다.
                          </p>
                        </div>
    
                        {teamOptions.length === 0 ? (
                          <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
                            No teams are registered for the selected company.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            {teamOptions.map((department) => {
                              const teamStaffCount = activeStaffs.filter(
                                (staff) =>
                                  staff.company === selectedCompany && getDepartmentName(staff) === department
                              ).length;
                              const selected = selectedDepartment === department;
                              return (
                                <button
                                  key={department}
                                  type="button"
                                  onClick={() => setSelectedDepartment(department)}
                                  className={`rounded-[var(--radius-xl)] border px-7 py-4 text-left transition-all ${selected ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]/70 shadow-[0_18px_40px_rgba(37,99,235,0.12)] ring-1 ring-[var(--accent)]/20' : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/40 hover:shadow-[0_16px_32px_rgba(15,23,42,0.08)]'}`}
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div className={`flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)] text-xl ${selected ? 'bg-[var(--card)] text-[var(--accent)]' : 'bg-[var(--muted)] text-[var(--accent)]'}`}>
                                      W
                                    </div>
                                    {selected && (
                                      <span className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1 text-[10px] font-bold text-white">
                                        Selected
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-4 text-xl font-bold tracking-[-0.02em] text-[var(--foreground)]">{department}</p>
                                  <p className="mt-3 text-sm text-[var(--toss-gray-3)]">
                                    {selectedCompany || 'Company'} - Staff {teamStaffCount}
                                  </p>
                                  <p className="mt-3 text-[12px] leading-5 text-[var(--toss-gray-3)]">
                                    {workingShifts.length >= 3 ? 'Ideal for 3-shift or night-dedicated teams.' : 'Create a monthly roster from registered shift types.'}
                                  </p>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {selectedDepartment ? (
                          <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-bold text-[var(--foreground)]">같이 생성할 팀 추가</p>
                                <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                                  기본 팀 외에 함께 묶어 편성할 팀을 선택하세요. 수연의원 간호팀도 여기서 필요할 때만 포함할 수 있습니다.
                                </p>
                              </div>
                              <span className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-bold text-[var(--accent)]">
                                현재 범위 {rosterScopeLabel}
                              </span>
                            </div>
                            {availableIncludedDepartments.length === 0 ? (
                              <div className="mt-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-[12px] font-semibold text-[var(--toss-gray-3)]">
                                추가로 포함할 팀이 없습니다.
                              </div>
                            ) : (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {availableIncludedDepartments.map((department, index) => {
                                  const included = includedDepartments.includes(department);
                                  return (
                                    <button
                                      key={department}
                                      type="button"
                                      onClick={() => toggleIncludedDepartment(department)}
                                      className={`rounded-[var(--radius-md)] border px-3 py-2 text-[11px] font-bold transition-colors ${
                                        included
                                          ? 'border-[var(--accent)] bg-[var(--toss-blue-light)] text-[var(--accent)]'
                                          : 'border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]'
                                      }`}
                                      data-testid={`roster-wizard-include-team-${index + 1}`}
                                    >
                                      {included ? '포함중' : '추가'} · {department}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}
    
                {wizardStep === 2 && (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="text-base font-bold text-[var(--foreground)]">{rosterScopeLabel} 직원 선택</h4>
                        <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                          이번 자동편성에서 제외할 직원을 조정하세요.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span
                            className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-bold text-[var(--accent)]"
                            data-testid="roster-wizard-included-count"
                          >
                            포함 {wizardSelectedStaffIds.length}
                          </span>
                          <span
                            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-[11px] font-bold text-[var(--foreground)]"
                            data-testid="roster-wizard-excluded-count"
                          >
                            제외 {wizardExcludedStaffs.length}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={includeAllWizardStaff}
                          className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-[11px] font-bold text-[var(--foreground)]"
                          data-testid="roster-wizard-include-all"
                        >
                          전체 포함
                        </button>
                        <button
                          type="button"
                          onClick={clearWizardStaffSelection}
                          className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-[11px] font-bold text-[var(--toss-gray-3)]"
                          data-testid="roster-wizard-exclude-all"
                        >
                          전체 제외
                        </button>
                      </div>
                    </div>
    
                    {targetStaffs.length === 0 ? (
                      <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
                        No staff found in this team.
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {targetStaffs.map((staff) => {
                            const staffId = String(staff.id);
                            const selected = wizardSelectedStaffIds.includes(staffId);
                            return (
                              <div
                                key={staff.id}
                                className={`rounded-[var(--radius-xl)] border p-4 text-left transition-all ${selected ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]/70 ring-1 ring-[var(--accent)]/30' : 'border-[var(--border)] bg-[var(--muted)]/70'}`}
                                data-testid={`roster-wizard-staff-card-${staffId}`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--tab-bg)] text-sm font-bold text-[var(--accent)]">
                                      {String(staff.name || '?').slice(0, 1)}
                                    </div>
                                    <div>
                                      <p className="text-sm font-bold text-[var(--foreground)]">{staff.name}</p>
                                      <p className="text-[11px] text-[var(--toss-gray-3)]">
                                        {getDepartmentName(staff)} - {staff.position || 'Staff'}
                                      </p>
                                    </div>
                                  </div>
                                  <span
                                    className={`rounded-[var(--radius-md)] px-3 py-1 text-[10px] font-bold ${selected ? 'bg-[var(--card)] text-[var(--accent)]' : 'bg-[var(--toss-gray-2)] text-[var(--toss-gray-3)]'}`}
                                  >
                                    {selected ? 'Included' : 'Excluded'}
                                  </span>
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => toggleWizardStaff(staffId)}
                                    className={`rounded-[var(--radius-md)] px-3 py-2 text-[11px] font-bold transition-colors ${selected ? 'bg-rose-50 text-rose-600' : 'bg-[var(--accent)] text-white'}`}
                                    data-testid={`roster-wizard-toggle-${staffId}`}
                                  >
                                    {selected ? 'Exclude from this run' : 'Include again'}
                                  </button>
                                </div>
                                {!selected && (
                                  <p className="mt-3 text-[11px] text-[var(--toss-gray-3)]">Skipped in this run.</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {wizardExcludedStaffs.length > 0 && (
                          <div
                            className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-sm font-semibold text-[var(--foreground)]"
                            data-testid="roster-wizard-excluded-summary"
                          >
                            Excluded: {wizardExcludedStaffs.map((staff) => staff.name).join(', ')}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
    
                {wizardStep === 3 && (
                  <div className="space-y-4" data-testid="roster-wizard-step-3">
                    <div>
                      <h4 className="text-base font-bold text-[var(--foreground)]">자동생성 규칙 불러오기</h4>
                      <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                        바깥에서 저장한 규칙을 불러와서 이번 근무표 생성 기준으로 사용합니다.
                      </p>
                    </div>
    
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
                      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4">
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">생성 기준</span>
                            <select
                              value={wizardGenerationBasis}
                              onChange={(event) =>
                                setWizardGenerationBasis(event.target.value as WizardGenerationBasis)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-generation-basis-select"
                            >
                              <option value="saved_rule">저장 규칙 우선</option>
                              <option value="rotation_only">전원 순환 근무</option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">나이트 후 OFF</span>
                            <input
                              type="number"
                              min={0}
                              max={5}
                              value={wizardRuleDraft.offDaysAfterNight}
                              onChange={(event) =>
                                updateWizardRuleDraftField('offDaysAfterNight', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-off-days-after-night"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">최소 DAY</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.minDayStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('minDayStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-min-day-staff"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">최소 EVENING</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.minEveningStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('minEveningStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-min-evening-staff"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">최소 NIGHT</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.minNightStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('minNightStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-min-night-staff"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">주말 DAY</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.weekendMinDayStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('weekendMinDayStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-weekend-min-day-staff"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">주말 EVENING</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.weekendMinEveningStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('weekendMinEveningStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-weekend-min-evening-staff"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">주말 NIGHT</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.weekendMinNightStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('weekendMinNightStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-weekend-min-night-staff"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">공휴일 DAY</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.holidayMinDayStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('holidayMinDayStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-holiday-min-day-staff"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">공휴일 EVENING</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.holidayMinEveningStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('holidayMinEveningStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-holiday-min-evening-staff"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">공휴일 NIGHT</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.holidayMinNightStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('holidayMinNightStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-holiday-min-night-staff"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">나이트 최소</span>
                            <input
                              type="number"
                              min={0}
                              max={31}
                              value={wizardRuleDraft.minRotationNightCount}
                              onChange={(event) =>
                                updateWizardRuleDraftField('minRotationNightCount', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-rotation-night-min-count"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">나이트 최대</span>
                            <input
                              type="number"
                              min={0}
                              max={31}
                              value={wizardRuleDraft.maxRotationNightCount}
                              onChange={(event) =>
                                updateWizardRuleDraftField('maxRotationNightCount', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-rotation-night-max-count"
                            />
                          </label>
                          <label className="flex flex-col gap-1 md:col-span-2">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">최소 월 OFF</span>
                            <input
                              type="number"
                              min={0}
                              max={31}
                              value={wizardRuleDraft.minMonthlyOffDays}
                              onChange={(event) =>
                                updateWizardRuleDraftField('minMonthlyOffDays', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-min-monthly-off-days"
                            />
                          </label>
                        </div>
                        <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] p-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold text-[var(--foreground)]">특정 날짜 최소 인원</p>
                              <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                                평일 기준과 다르게 운영하는 날짜만 따로 최소 인원을 지정합니다.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={addWizardDateCoverageOverride}
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[11px] font-bold text-[var(--foreground)]"
                              data-testid="roster-wizard-date-coverage-add"
                            >
                              날짜 추가
                            </button>
                          </div>
                          <div className="mt-3 space-y-3">
                            {(wizardRuleDraft.dateCoverageOverrides || []).length === 0 ? (
                              <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[12px] font-semibold text-[var(--toss-gray-3)]">
                                아직 추가한 날짜별 최소 인원이 없습니다.
                              </div>
                            ) : (
                              (wizardRuleDraft.dateCoverageOverrides || []).map((entry, index) => (
                                <div
                                  key={entry.id}
                                  className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3 md:grid-cols-[minmax(160px,1.2fr)_repeat(3,minmax(0,1fr))_auto]"
                                >
                                  <label className="flex flex-col gap-1">
                                    <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">날짜</span>
                                    <select
                                      value={entry.date}
                                      onChange={(event) =>
                                        updateWizardDateCoverageOverride(entry.id, 'date', event.target.value)
                                      }
                                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                                      data-testid={`roster-wizard-date-coverage-date-${index + 1}`}
                                    >
                                      {monthDates.map((date) => (
                                        <option key={date} value={date}>
                                          {date}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="flex flex-col gap-1">
                                    <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">DAY</span>
                                    <input
                                      type="number"
                                      min={0}
                                      max={20}
                                      value={entry.minDayStaff}
                                      onChange={(event) =>
                                        updateWizardDateCoverageOverride(
                                          entry.id,
                                          'minDayStaff',
                                          event.target.value
                                        )
                                      }
                                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                                      data-testid={`roster-wizard-date-coverage-day-${index + 1}`}
                                    />
                                  </label>
                                  <label className="hidden">
                                    <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">블록 선호</span>
                                    <select
                                      value="balanced"
                                      onChange={() => undefined}
                                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                                      data-testid={`roster-wizard-date-coverage-block-preference-${index + 1}`}
                                    >
                                      {STAFF_BLOCK_PREFERENCE_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="flex flex-col gap-1">
                                    <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">EVENING</span>
                                    <input
                                      type="number"
                                      min={0}
                                      max={20}
                                      value={entry.minEveningStaff}
                                      onChange={(event) =>
                                        updateWizardDateCoverageOverride(
                                          entry.id,
                                          'minEveningStaff',
                                          event.target.value
                                        )
                                      }
                                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                                      data-testid={`roster-wizard-date-coverage-evening-${index + 1}`}
                                    />
                                  </label>
                                  <label className="flex flex-col gap-1">
                                    <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">NIGHT</span>
                                    <input
                                      type="number"
                                      min={0}
                                      max={20}
                                      value={entry.minNightStaff}
                                      onChange={(event) =>
                                        updateWizardDateCoverageOverride(
                                          entry.id,
                                          'minNightStaff',
                                          event.target.value
                                        )
                                      }
                                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                                      data-testid={`roster-wizard-date-coverage-night-${index + 1}`}
                                    />
                                  </label>
                                  <div className="flex items-end">
                                    <button
                                      type="button"
                                      onClick={() => removeWizardDateCoverageOverride(entry.id)}
                                      className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700"
                                      data-testid={`roster-wizard-date-coverage-remove-${index + 1}`}
                                    >
                                      삭제
                                    </button>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                        <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] p-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold text-[var(--foreground)]">Night block presets</p>
                              <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                                Apply common hospital night/recovery patterns with one tap.
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {WIZARD_NIGHT_BLOCK_PRESET_OPTIONS.map((preset) => {
                                const selected =
                                  wizardRuleDraft.nightBlockSize === preset.nightBlockSize &&
                                  wizardRuleDraft.offDaysAfterNight === preset.offDaysAfterNight;

                                return (
                                  <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => applyWizardNightBlockPreset(preset)}
                                    className={`rounded-[var(--radius-md)] border px-3 py-2 text-[11px] font-bold transition-colors ${selected ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]'}`}
                                    data-testid={`roster-wizard-night-preset-${preset.id}`}
                                  >
                                    {preset.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
    
                      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--muted)] p-4">
                        <div className="space-y-3">
                          <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--card)] px-3 py-3">
                            <span className="text-sm font-bold text-[var(--foreground)]">주말 분산</span>
                            <input
                              type="checkbox"
                              checked={wizardRuleDraft.distributeWeekendShifts}
                              onChange={(event) =>
                                updateWizardRuleDraftField('distributeWeekendShifts', event.target.checked)
                              }
                              data-testid="roster-wizard-rule-distribute-weekends"
                            />
                          </label>
                          <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--card)] px-3 py-3">
                            <span className="text-sm font-bold text-[var(--foreground)]">공휴일 분산</span>
                            <input
                              type="checkbox"
                              checked={wizardRuleDraft.distributeHolidayShifts}
                              onChange={(event) =>
                                updateWizardRuleDraftField('distributeHolidayShifts', event.target.checked)
                              }
                              data-testid="roster-wizard-rule-distribute-holidays"
                            />
                          </label>
                        </div>
                      </div>

                      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4">
                        <div>
                          <h5 className="text-sm font-bold text-[var(--foreground)]">Ward safety rules</h5>
                          <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                            Configure quick-return limits, new nurse protection, and rotation balancing.
                          </p>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">Night block size</span>
                            <input
                              type="number"
                              min={1}
                              max={5}
                              value={wizardRuleDraft.nightBlockSize}
                              onChange={(event) =>
                                updateWizardRuleDraftField('nightBlockSize', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-night-block-size"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">Max consecutive work</span>
                            <input
                              type="number"
                              min={2}
                              max={7}
                              value={wizardRuleDraft.maxConsecutiveWorkDays}
                              onChange={(event) =>
                                updateWizardRuleDraftField('maxConsecutiveWorkDays', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-max-consecutive-work-days"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">Max consecutive weekend</span>
                            <input
                              type="number"
                              min={0}
                              max={4}
                              value={wizardRuleDraft.maxConsecutiveWeekendWorkDays}
                              onChange={(event) =>
                                updateWizardRuleDraftField(
                                  'maxConsecutiveWeekendWorkDays',
                                  event.target.value
                                )
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-max-consecutive-weekend-work-days"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">Max consecutive evening</span>
                            <input
                              type="number"
                              min={0}
                              max={7}
                              value={wizardRuleDraft.maxConsecutiveEveningShifts}
                              onChange={(event) =>
                                updateWizardRuleDraftField(
                                  'maxConsecutiveEveningShifts',
                                  event.target.value
                                )
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-max-consecutive-evening-shifts"
                            />
                          </label>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-3">
                            <span className="text-sm font-bold text-[var(--foreground)]">Avoid D after N</span>
                            <input
                              type="checkbox"
                              checked={wizardRuleDraft.avoidDayAfterNight}
                              onChange={(event) =>
                                updateWizardRuleDraftField('avoidDayAfterNight', event.target.checked)
                              }
                              data-testid="roster-wizard-rule-avoid-day-after-night"
                            />
                          </label>
                          <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-3">
                            <span className="text-sm font-bold text-[var(--foreground)]">Avoid D after E</span>
                            <input
                              type="checkbox"
                              checked={wizardRuleDraft.avoidDayAfterEvening}
                              onChange={(event) =>
                                updateWizardRuleDraftField('avoidDayAfterEvening', event.target.checked)
                              }
                              data-testid="roster-wizard-rule-avoid-day-after-evening"
                            />
                          </label>
                          <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-3">
                            <span className="text-sm font-bold text-[var(--foreground)]">Keep fixed staff fixed</span>
                            <input
                              type="checkbox"
                              checked={wizardRuleDraft.fixedShiftOnly}
                              onChange={(event) =>
                                updateWizardRuleDraftField('fixedShiftOnly', event.target.checked)
                              }
                              data-testid="roster-wizard-rule-fixed-shift-only"
                            />
                          </label>
                          <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-3">
                            <span className="text-sm font-bold text-[var(--foreground)]">Balance D/E/N</span>
                            <input
                              type="checkbox"
                              checked={wizardRuleDraft.balanceRotationBands}
                              onChange={(event) =>
                                updateWizardRuleDraftField('balanceRotationBands', event.target.checked)
                              }
                              data-testid="roster-wizard-rule-balance-rotation-bands"
                            />
                          </label>
                          <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-3">
                            <span className="text-sm font-bold text-[var(--foreground)]">Separate new nurses</span>
                            <input
                              type="checkbox"
                              checked={wizardRuleDraft.separateNewNursesByShift}
                              onChange={(event) =>
                                updateWizardRuleDraftField(
                                  'separateNewNursesByShift',
                                  event.target.checked
                                )
                              }
                              data-testid="roster-wizard-rule-separate-new-nurses"
                            />
                          </label>
                          <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-3">
                            <span className="text-sm font-bold text-[var(--foreground)]">Block solo new nurse night</span>
                            <input
                              type="checkbox"
                              checked={wizardRuleDraft.blockNewNurseSoloNight}
                              onChange={(event) =>
                                updateWizardRuleDraftField(
                                  'blockNewNurseSoloNight',
                                  event.target.checked
                                )
                              }
                              data-testid="roster-wizard-rule-block-new-nurse-solo-night"
                            />
                          </label>
                          <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-3 md:col-span-2 xl:col-span-3">
                            <span className="text-sm font-bold text-[var(--foreground)]">Require senior with new nurse at night</span>
                            <input
                              type="checkbox"
                              checked={wizardRuleDraft.requireSeniorWithNewNurseNight}
                              onChange={(event) =>
                                updateWizardRuleDraftField(
                                  'requireSeniorWithNewNurseNight',
                                  event.target.checked
                                )
                              }
                              data-testid="roster-wizard-rule-require-senior-with-new-nurse-night"
                            />
                          </label>
                        </div>
                      </div>

                      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4">
                        <div>
                          <h5 className="text-sm font-bold text-[var(--foreground)]">Senior / dedicated minimum coverage</h5>
                          <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                            These minimums are checked in the wizard preset and in the final roster feasibility check.
                          </p>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">Senior DAY</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.minSeniorDayStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('minSeniorDayStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-min-senior-day-staff"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">Senior EVENING</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.minSeniorEveningStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('minSeniorEveningStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-min-senior-evening-staff"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">Senior NIGHT</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.minSeniorNightStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('minSeniorNightStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-min-senior-night-staff"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">Dedicated DAY</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.minDedicatedDayStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('minDedicatedDayStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-min-dedicated-day-staff"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">Dedicated EVENING</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.minDedicatedEveningStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('minDedicatedEveningStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-min-dedicated-evening-staff"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">Dedicated NIGHT</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={wizardRuleDraft.minDedicatedNightStaff}
                              onChange={(event) =>
                                updateWizardRuleDraftField('minDedicatedNightStaff', event.target.value)
                              }
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                              data-testid="roster-wizard-rule-min-dedicated-night-staff"
                            />
                          </label>
                        </div>
                      </div>

                      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--muted)] p-4">
                        <div>
                          <h5 className="text-sm font-bold text-[var(--foreground)]">Current wizard rule summary</h5>
                          <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                            All major 3-shift constraints selected in the wizard are listed here.
                          </p>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2" data-testid="roster-wizard-rule-summary">
                          {wizardRuleSummaryItems.map((item, index) => (
                            <span
                              key={`${item}-${index}`}
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[11px] font-semibold text-[var(--foreground)]"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
    
                    <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h5 className="text-sm font-bold text-[var(--foreground)]">역할 커버 슬롯</h5>
                          <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                            격리, 중환자실 등 특정 역할을 맡을 수 있는 인원을 타임별로 최소 지정합니다.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={addWizardRoleCoverageRule}
                          className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-[11px] font-bold text-[var(--foreground)]"
                          data-testid="roster-wizard-rule-role-coverage-add"
                        >
                          역할 슬롯 추가
                        </button>
                      </div>
    
                      <div className="mt-4 space-y-3">
                        {wizardRuleDraft.roleCoverageRules.length === 0 ? (
                          <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-[12px] font-semibold text-[var(--toss-gray-3)]">
                            추가한 역할 슬롯이 없습니다.
                          </div>
                        ) : (
                          wizardRuleDraft.roleCoverageRules.map((roleRule, index) => (
                            <div
                              key={roleRule.id}
                              className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] p-4"
                            >
                              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                                <label className="flex flex-col gap-1 xl:col-span-2">
                                  <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">슬롯 이름</span>
                                  <input
                                    value={roleRule.label}
                                    onChange={(event) =>
                                      updateWizardRoleCoverageRule(roleRule.id, 'label', event.target.value)
                                    }
                                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                                    data-testid={`roster-wizard-rule-role-slot-label-${index + 1}`}
                                  />
                                </label>
                                <label className="flex flex-col gap-1 xl:col-span-3">
                                  <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">키워드</span>
                                  <input
                                    value={serializeCoverageRoleTags(roleRule.keywords)}
                                    onChange={(event) =>
                                      updateWizardRoleCoverageRule(roleRule.id, 'keywords', event.target.value)
                                    }
                                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                                    data-testid={`roster-wizard-rule-role-slot-keywords-${index + 1}`}
                                  />
                                </label>
                                <label className="flex flex-col gap-1">
                                  <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">DAY</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={20}
                                    value={roleRule.minDayStaff}
                                    onChange={(event) =>
                                      updateWizardRoleCoverageRule(roleRule.id, 'minDayStaff', event.target.value)
                                    }
                                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                                    data-testid={`roster-wizard-rule-role-slot-day-${index + 1}`}
                                  />
                                </label>
                                <label className="flex flex-col gap-1">
                                  <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">EVENING</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={20}
                                    value={roleRule.minEveningStaff}
                                    onChange={(event) =>
                                      updateWizardRoleCoverageRule(roleRule.id, 'minEveningStaff', event.target.value)
                                    }
                                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                                  />
                                </label>
                                <label className="flex flex-col gap-1">
                                  <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">NIGHT</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={20}
                                    value={roleRule.minNightStaff}
                                    onChange={(event) =>
                                      updateWizardRoleCoverageRule(roleRule.id, 'minNightStaff', event.target.value)
                                    }
                                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                                    data-testid={`roster-wizard-rule-role-slot-night-${index + 1}`}
                                  />
                                </label>
                              </div>
                              <div className="mt-3 flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => removeWizardRoleCoverageRule(roleRule.id)}
                                  className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700"
                                >
                                  슬롯 삭제
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
    
                    <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--muted)] p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-sm font-bold text-[var(--foreground)]">저장한 규칙 선택</p>
                          <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                            마법사 밖에서 직접 만든 규칙만 여기에 표시됩니다.
                          </p>
                        </div>
                        <div className="w-full lg:max-w-xl">
                          <select
                            value={wizardSelectedPresetId}
                            onChange={(event) => {
                              const nextId = event.target.value;
                              setWizardSelectedPresetId(nextId);
                              if (!nextId) {
                                resetWizardRuleSelection();
                                return;
                              }
                              const preset = userWizardPresets.find((item) => item.id === nextId);
                              if (preset) {
                                applyWizardPreset(preset);
                              }
                            }}
                            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                            data-testid="roster-wizard-preset-select"
                          >
                            <option value="">규칙을 선택하세요</option>
                            {userWizardPresets.map((preset) => (
                              <option key={preset.id} value={preset.id}>
                                {preset.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {userWizardPresets.length === 0 ? (
                        <div className="mt-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--card)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
                          먼저 바깥의 `자동생성 규칙 만들기`에서 규칙을 저장하세요.
                        </div>
                      ) : wizardSelectedPresetId ? (
                        <div className="mt-4 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4">
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-bold text-[var(--accent)]">
                              선택된 규칙
                            </span>
                            <span
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-[11px] font-semibold text-[var(--foreground)]"
                              data-testid="roster-wizard-loaded-preset-name"
                            >
                              {selectedWizardPreset?.name || ''}
                            </span>
                            <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-[11px] font-semibold text-[var(--foreground)]">
                              타입: {wizardPattern}
                            </span>
                            {orderedWizardShiftIds.map((shiftId, index) => (
                              <span
                                key={shiftId}
                                className={`rounded-[var(--radius-md)] border px-3 py-1 text-[11px] font-semibold ${getShiftBadgeClass(getShiftNameById(shiftId, workShifts))}`}
                              >
                                {index + 1}차 · {getShiftNameById(shiftId, workShifts)}
                              </span>
                            ))}
                          </div>
    
                          {wizardUsesCustomPattern && (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {effectiveWizardCustomPatternSequence.map((token, index) => {
                                const tokenLabel = getPatternSequenceLabel(token, workShifts);
                                return (
                                  <span
                                    key={`${token}-${index}`}
                                    className={`rounded-[var(--radius-md)] border px-3 py-1 text-[11px] font-semibold ${token === OFF_SHIFT_TOKEN ? 'border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]' : getShiftBadgeClass(tokenLabel)}`}
                                  >
                                    {index + 1}. {tokenLabel}
                                  </span>
                                );
                              })}
                            </div>
                          )}
    
                          {wizardUsesWeeklyTemplate && (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {effectiveWizardWeeklyTemplateWeeks.map((week, index) => (
                                <span
                                  key={`${week.shiftId}-${index}`}
                                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] px-3 py-1 text-[11px] font-semibold text-[var(--foreground)]"
                                >
                                  {getWeeklyTemplateWeekLabel(index)} · {getShiftNameById(week.shiftId, workShifts)} · {formatWeekdaySummary(week.activeWeekdays)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mt-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--card)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
                          사용할 규칙을 선택하면 요약이 표시됩니다.
                        </div>
                      )}
                    </div>
    
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-[var(--radius-xl)] bg-[var(--muted)] p-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">생성 대상</p>
                        <p className="mt-2 text-lg font-bold text-[var(--foreground)]">{wizardSelectedStaffIds.length}명</p>
                        <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">{rosterScopeLabel}</p>
                      </div>
                      <div className="rounded-[var(--radius-xl)] bg-[var(--muted)] p-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">적용 방식</p>
                        <p className="mt-2 text-lg font-bold text-[var(--foreground)]">
                          {wizardPattern || '규칙 미선택'}
                        </p>
                        <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                          저장된 규칙을 그대로 불러와 생성합니다.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
    
                {wizardStep === 4 && (
                  <div className="space-y-4" data-testid="roster-wizard-step-4">
                    <div>
                      <h4 className="text-base font-bold text-[var(--foreground)]">직원별 예외 일정 설정</h4>
                      <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                        필요한 직원만 특정 날짜를 OFF로 고정하고, 다음날 근무를 지정하세요. 선택하지 않으면 기본 패턴대로 생성됩니다.
                      </p>
                    </div>
    
                    <div className="rounded-[var(--radius-xl)] border border-amber-200 bg-amber-50/70 p-4">
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="flex min-w-[180px] flex-1 flex-col gap-1">
                          <span className="text-[11px] font-bold text-amber-800">희망 OFF 직원</span>
                          <select
                            value={preferredOffStaffId}
                            onChange={(event) => setPreferredOffStaffId(event.target.value)}
                            className="rounded-[var(--radius-md)] border border-amber-200 bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                            data-testid="roster-wizard-preferred-off-staff-select"
                          >
                            {wizardSelectedStaffs.map((staff) => (
                              <option key={staff.id} value={String(staff.id)}>
                                {staff.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex min-w-[180px] flex-1 flex-col gap-1">
                          <span className="text-[11px] font-bold text-amber-800">희망 OFF 날짜</span>
                          <select
                            value={preferredOffDate}
                            onChange={(event) => setPreferredOffDate(event.target.value)}
                            className="rounded-[var(--radius-md)] border border-amber-200 bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                            data-testid="roster-wizard-preferred-off-date-select"
                          >
                            {monthDates.map((date) => (
                              <option key={date} value={date}>
                                {date}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={addPreferredOffDate}
                          className="rounded-[var(--radius-md)] bg-amber-500 px-4 py-3 text-sm font-bold text-white"
                          data-testid="roster-wizard-preferred-off-add"
                        >
                          희망 OFF 추가
                        </button>
                      </div>
                    </div>
    
                    {wizardSelectedStaffs.length > 0 ? (
                      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4">
                        <div className="space-y-3">
                          {wizardSelectedStaffs.map((staff) => {
                            const staffId = String(staff.id);
                            const nightRange = wizardNightRangeDrafts[staffId] || {
                              minNightShiftCount: 0,
                              maxNightShiftCount: 0,
                            };
                            const blockPreference =
                              wizardBlockPreferenceDrafts[staffId] || 'balanced';
                            const dedicatedBand = wizardDedicatedBandDrafts[staffId] || '';
                            const coverageTags = wizardCoverageRoleDrafts[staffId] || [];
                            const restrictions =
                              wizardStaffRestrictionDrafts[staffId] || buildDefaultStaffRestrictionDraft();

                            return (
                              <div
                                key={`wizard-personal-rule-${staffId}`}
                                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] p-4"
                              >
                                <div className="mb-3">
                                  <p className="text-sm font-bold text-[var(--foreground)]">{staff.name}</p>
                                  <p className="text-[11px] text-[var(--toss-gray-3)]">
                                    {getDepartmentName(staff)} · {staff.position || '직원'}
                                  </p>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                                  <label className="flex flex-col gap-1">
                                    <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">나이트 최소</span>
                                    <input
                                      type="number"
                                      min={0}
                                      max={31}
                                      value={nightRange.minNightShiftCount}
                                      onChange={(event) =>
                                        updateWizardNightRangeDraft(
                                          staffId,
                                          'minNightShiftCount',
                                          event.target.value
                                        )
                                      }
                                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                                      data-testid={`roster-wizard-night-min-${staffId}`}
                                    />
                                  </label>
                                  <label className="flex flex-col gap-1">
                                    <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">나이트 최대</span>
                                    <input
                                      type="number"
                                      min={0}
                                      max={31}
                                      value={nightRange.maxNightShiftCount}
                                      onChange={(event) =>
                                        updateWizardNightRangeDraft(
                                          staffId,
                                          'maxNightShiftCount',
                                          event.target.value
                                        )
                                      }
                                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                                      data-testid={`roster-wizard-night-max-${staffId}`}
                                    />
                                  </label>
                                  <label className="flex flex-col gap-1">
                                    <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">전담 밴드</span>
                                    <select
                                      value={dedicatedBand}
                                      onChange={(event) =>
                                        updateWizardDedicatedBandDraft(staffId, event.target.value)
                                      }
                                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                                      data-testid={`roster-wizard-dedicated-band-${staffId}`}
                                    >
                                      <option value="">자동</option>
                                      <option value="day">DAY 전담</option>
                                      <option value="evening">EVENING 전담</option>
                                      <option value="night">NIGHT 전담</option>
                                    </select>
                                  </label>
                                  <label className="flex flex-col gap-1">
                                    <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">역할 태그</span>
                                    <input
                                      value={serializeCoverageRoleTags(coverageTags)}
                                      onChange={(event) =>
                                        updateWizardCoverageRoleDraft(staffId, event.target.value)
                                      }
                                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                                      data-testid={`roster-wizard-role-tags-${staffId}`}
                                    />
                                  </label>
                                </div>
                                <div className="mt-3 space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3">
                                  <div>
                                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">금지 타임</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {(['day', 'evening', 'night'] as const).map((band) => {
                                        const selected = restrictions.blockedShiftBands.includes(band);
                                        return (
                                          <button
                                            key={`${staffId}-${band}`}
                                            type="button"
                                            onClick={() =>
                                              updateWizardStaffRestrictionDraft(
                                                staffId,
                                                'blockedShiftBands',
                                                selected
                                                  ? restrictions.blockedShiftBands.filter((value) => value !== band)
                                                  : [...restrictions.blockedShiftBands, band]
                                              )
                                            }
                                            className={`rounded-[var(--radius-md)] border px-3 py-2 text-[11px] font-bold ${selected ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]'}`}
                                            data-testid={`roster-wizard-blocked-band-${staffId}-${band}`}
                                          >
                                            {band.toUpperCase()}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">금지 요일</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {WEEKDAY_PICKER_ORDER.map((weekday) => {
                                        const selected = restrictions.blockedWeekdays.includes(weekday);
                                        return (
                                          <button
                                            key={`${staffId}-weekday-${weekday}`}
                                            type="button"
                                            onClick={() =>
                                              updateWizardStaffRestrictionDraft(
                                                staffId,
                                                'blockedWeekdays',
                                                selected
                                                  ? restrictions.blockedWeekdays.filter((value) => value !== weekday)
                                                  : [...restrictions.blockedWeekdays, weekday]
                                              )
                                            }
                                            className={`rounded-[var(--radius-md)] border px-3 py-2 text-[11px] font-bold ${selected ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]'}`}
                                            data-testid={`roster-wizard-blocked-weekday-${staffId}-${weekday}`}
                                          >
                                            {WEEKDAY_LABELS[weekday]}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2">
                                      <span className="text-[11px] font-bold text-[var(--foreground)]">주말 근무 금지</span>
                                      <input
                                        type="checkbox"
                                        checked={restrictions.avoidWeekendWork}
                                        onChange={(event) =>
                                          updateWizardStaffRestrictionDraft(
                                            staffId,
                                            'avoidWeekendWork',
                                            event.target.checked
                                          )
                                        }
                                        data-testid={`roster-wizard-avoid-weekend-${staffId}`}
                                      />
                                    </label>
                                    <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2">
                                      <span className="text-[11px] font-bold text-[var(--foreground)]">공휴일 근무 금지</span>
                                      <input
                                        type="checkbox"
                                        checked={restrictions.avoidHolidayWork}
                                        onChange={(event) =>
                                          updateWizardStaffRestrictionDraft(
                                            staffId,
                                            'avoidHolidayWork',
                                            event.target.checked
                                          )
                                        }
                                        data-testid={`roster-wizard-avoid-holiday-${staffId}`}
                                      />
                                    </label>
                                  </div>
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2">
                                      <span className="text-[11px] font-bold text-[var(--foreground)]">주말 OFF 선호</span>
                                      <input
                                        type="checkbox"
                                        checked={restrictions.preferWeekendOff}
                                        onChange={(event) =>
                                          updateWizardStaffRestrictionDraft(
                                            staffId,
                                            'preferWeekendOff',
                                            event.target.checked
                                          )
                                        }
                                        data-testid={`roster-wizard-prefer-weekend-off-${staffId}`}
                                      />
                                    </label>
                                    <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2">
                                      <span className="text-[11px] font-bold text-[var(--foreground)]">공휴일 OFF 선호</span>
                                      <input
                                        type="checkbox"
                                        checked={restrictions.preferHolidayOff}
                                        onChange={(event) =>
                                          updateWizardStaffRestrictionDraft(
                                            staffId,
                                            'preferHolidayOff',
                                            event.target.checked
                                          )
                                        }
                                        data-testid={`roster-wizard-prefer-holiday-off-${staffId}`}
                                      />
                                    </label>
                                    <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2">
                                      <span className="text-[11px] font-bold text-[var(--foreground)]">연속 EVENING 회피</span>
                                      <input
                                        type="checkbox"
                                        checked={restrictions.avoidConsecutiveEvening}
                                        onChange={(event) =>
                                          updateWizardStaffRestrictionDraft(
                                            staffId,
                                            'avoidConsecutiveEvening',
                                            event.target.checked
                                          )
                                        }
                                        data-testid={`roster-wizard-avoid-consecutive-evening-${staffId}`}
                                      />
                                    </label>
                                    <label className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2">
                                      <span className="text-[11px] font-bold text-[var(--foreground)]">월초 NIGHT 선호</span>
                                      <input
                                        type="checkbox"
                                        checked={restrictions.preferEarlyMonthNight}
                                        onChange={(event) =>
                                          updateWizardStaffRestrictionDraft(
                                            staffId,
                                            'preferEarlyMonthNight',
                                            event.target.checked
                                          )
                                        }
                                        data-testid={`roster-wizard-prefer-early-night-${staffId}`}
                                      />
                                    </label>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                    {wizardSelectedStaffs.length > 1 ? (
                      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-[var(--foreground)]">직원 페어 규칙</p>
                            <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                              같이 근무시키거나, 분리할 조합을 나이트 또는 같은 타임 기준으로 지정합니다.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={addWizardPairRule}
                            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-[11px] font-bold text-[var(--foreground)]"
                            data-testid="roster-wizard-pair-rule-add"
                          >
                            페어 추가
                          </button>
                        </div>
                        <div className="mt-3 space-y-3">
                          {wizardPairRules.length === 0 ? (
                            <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-[12px] font-semibold text-[var(--toss-gray-3)]">
                              아직 추가한 페어 규칙이 없습니다.
                            </div>
                          ) : (
                            wizardPairRules.map((pairRule, index) => (
                              <div
                                key={pairRule.id}
                                className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px_140px_auto]"
                              >
                                <select
                                  value={pairRule.primaryStaffId}
                                  onChange={(event) =>
                                    updateWizardPairRule(pairRule.id, 'primaryStaffId', event.target.value)
                                  }
                                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                                  data-testid={`roster-wizard-pair-primary-${index + 1}`}
                                >
                                  {wizardSelectedStaffs.map((staff) => (
                                    <option key={staff.id} value={String(staff.id)}>
                                      {staff.name}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={pairRule.secondaryStaffId}
                                  onChange={(event) =>
                                    updateWizardPairRule(pairRule.id, 'secondaryStaffId', event.target.value)
                                  }
                                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                                  data-testid={`roster-wizard-pair-secondary-${index + 1}`}
                                >
                                  {wizardSelectedStaffs.map((staff) => (
                                    <option key={staff.id} value={String(staff.id)}>
                                      {staff.name}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={pairRule.mode}
                                  onChange={(event) =>
                                    updateWizardPairRule(pairRule.id, 'mode', event.target.value)
                                  }
                                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                                  data-testid={`roster-wizard-pair-mode-${index + 1}`}
                                >
                                  <option value="together">같이</option>
                                  <option value="separate">분리</option>
                                </select>
                                <select
                                  value={pairRule.band}
                                  onChange={(event) =>
                                    updateWizardPairRule(pairRule.id, 'band', event.target.value)
                                  }
                                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                                  data-testid={`roster-wizard-pair-band-${index + 1}`}
                                >
                                  <option value="night">NIGHT 기준</option>
                                  <option value="work">같은 타임 기준</option>
                                </select>
                                <div className="flex items-center justify-end">
                                  <button
                                    type="button"
                                    onClick={() => removeWizardPairRule(pairRule.id)}
                                    className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700"
                                    data-testid={`roster-wizard-pair-remove-${index + 1}`}
                                  >
                                    삭제
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ) : null}

                    {wizardSelectedStaffs.length === 0 ? (
                      <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
                        먼저 직원을 한 명 이상 선택하세요.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        {wizardSelectedStaffs.map((staff, index) => {
                          const staffId = String(staff.id);
                          const override = wizardOffOverrides[staffId] || {
                            enabled: false,
                            offDate: wizardOverrideDateOptions[index] || wizardOverrideDateOptions[0] || '',
                            nextShiftId: wizardOverrideShiftOptions[0]?.id || '',
                          };
                          const offDateIndex = monthDates.indexOf(override.offDate);
                          const nextDate = offDateIndex >= 0 ? monthDates[offDateIndex + 1] || '' : '';
    
                          return (
                            <div
                              key={staffId}
                              className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <p className="text-base font-bold text-[var(--foreground)]">{staff.name}</p>
                                  <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                                    {getDepartmentName(staff)} · {staff.position || '직원'}
                                  </p>
                                </div>
                                <label className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2 text-[11px] font-bold text-[var(--foreground)]">
                                  <input
                                    type="checkbox"
                                    checked={override.enabled}
                                    onChange={(event) =>
                                      updateWizardOffOverride(staffId, { enabled: event.target.checked })
                                    }
                                    data-testid={`roster-wizard-off-toggle-${staffId}`}
                                  />
                                  OFF 예외 사용
                                </label>
                              </div>
    
                              {override.enabled ? (
                                <div className="mt-4 grid gap-3 md:grid-cols-2">
                                  <label className="flex flex-col gap-1">
                                    <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">OFF 날짜</span>
                                    <select
                                      value={override.offDate}
                                      onChange={(event) =>
                                        updateWizardOffOverride(staffId, { offDate: event.target.value })
                                      }
                                      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                                      data-testid={`roster-wizard-off-date-${staffId}`}
                                    >
                                      {wizardOverrideDateOptions.map((date) => (
                                        <option key={date} value={date}>
                                          {date} ({WEEKDAY_LABELS[new Date(`${date}T00:00:00`).getDay()]})
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="flex flex-col gap-1">
                                    <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">OFF 다음날 근무</span>
                                    <select
                                      value={override.nextShiftId}
                                      onChange={(event) =>
                                        updateWizardOffOverride(staffId, { nextShiftId: event.target.value })
                                      }
                                      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                                      data-testid={`roster-wizard-post-off-shift-${staffId}`}
                                    >
                                      {wizardOverrideShiftOptions.map((shift) => (
                                        <option key={shift.id} value={shift.id}>
                                          {shift.name} · {getShiftCode(shift.name)}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <div className="rounded-[var(--radius-lg)] bg-[var(--muted)] px-4 py-3 text-[12px] font-semibold text-[var(--foreground)] md:col-span-2">
                                    {override.offDate || '날짜 미선택'} OFF
                                    {nextDate
                                      ? ` → ${nextDate} ${getShiftNameById(override.nextShiftId, workShifts)}`
                                      : ' → 다음날 없음'}
                                  </div>
                                </div>
                              ) : (
                                <p className="mt-4 text-[12px] text-[var(--toss-gray-3)]">
                                  기본 패턴 그대로 생성됩니다.
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
    
              <div className="border-t border-[var(--border)] px-4 py-4">
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                  <button
                    type="button"
                    onClick={closeWizard}
                    className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-bold text-[var(--foreground)]"
                  >
                    닫기
                  </button>
                  <div className="flex flex-wrap justify-end gap-2">
                    {wizardStep > 1 && (
                      <button
                        type="button"
                        onClick={() => setWizardStep((prev) => (prev - 1) as WizardStep)}
                        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-bold text-[var(--foreground)]"
                        data-testid="roster-wizard-back"
                      >
                        이전
                      </button>
                    )}
                    {wizardStep < 4 ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (wizardStep === 1 && (!selectedCompany || !selectedDepartment)) {
                            toast('사업체와 팀을 먼저 선택하세요.', 'warning');
                            return;
                          }
                          if (wizardStep === 2 && wizardSelectedStaffIds.length === 0) {
                            toast('직원을 한 명 이상 선택하세요.', 'warning');
                            return;
                          }
                          if (
                            !wizardUsesCustomPattern &&
                            !wizardUsesWeeklyTemplate &&
                            wizardStep === 3 &&
                            orderedWizardShiftIds.length < wizardRequiredShiftCount
                          ) {
                            toast(`${wizardPattern} 패턴에 필요한 근무유형 ${wizardRequiredShiftCount}개를 선택하세요.`, 'warning');
                            return;
                          }
                          if (wizardUsesCustomPattern && wizardStep === 3 && orderedWizardShiftIds.length === 0) {
                            toast('커스텀 패턴에 사용할 근무유형을 1개 이상 선택하세요.', 'warning');
                            return;
                          }
                          if (wizardUsesWeeklyTemplate && wizardStep === 3 && orderedWizardShiftIds.length === 0) {
                            toast('주차 템플릿에 사용할 근무유형을 1개 이상 선택하세요.', 'warning');
                            return;
                          }
                          if (
                            wizardUsesCustomPattern &&
                            wizardStep === 3 &&
                            (effectiveWizardCustomPatternSequence.length === 0 ||
                              !effectiveWizardCustomPatternSequence.some((token) => token !== OFF_SHIFT_TOKEN))
                          ) {
                            toast('커스텀 패턴 순서를 만들고, 실제 근무유형을 1개 이상 포함해 주세요.');
                            return;
                          }
                          if (
                            wizardUsesWeeklyTemplate &&
                            wizardStep === 3 &&
                            !effectiveWizardWeeklyTemplateWeeks.some(
                              (week) => Boolean(week.shiftId) && week.activeWeekdays.length > 0
                            )
                          ) {
                            toast('주차 템플릿에는 근무가 들어가는 요일을 최소 1일 이상 지정하세요.');
                            return;
                          }
                          setWizardStep((prev) => (prev + 1) as WizardStep);
                        }}
                        className="rounded-[var(--radius-lg)] bg-[var(--accent)] px-4 py-3 text-sm font-bold text-white"
                        data-testid="roster-wizard-next"
                      >
                        다음
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={applyWizard}
                        className="rounded-[var(--radius-lg)] bg-[var(--accent)] px-4 py-3 text-sm font-bold text-white"
                        data-testid="roster-wizard-apply"
                      >
                        근무표 생성
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
    );
  };

  const saveAssignments = async () => {
    if (!canManageRosterAssignments) {
      toast('월간 근무표 저장은 관리자 전용입니다.', 'warning');
      return;
    }
    const enabledRows = previewRows;
    if (!selectedCompany) return toast('사업체를 먼저 선택하세요.', 'warning');
    if (!selectedDepartment) return toast('팀을 먼저 선택하세요.', 'warning');
    if (!enabledRows.length) return toast('저장할 대상 직원이 없습니다.', 'success');
    if (saveBlockingWarnings.length > 0) {
      toast('차단 경고가 남아 있어 저장할 수 없습니다. 경고 요약을 먼저 확인하세요.', 'warning');
      return;
    }
    if (!confirm(`${selectedMonth} ${rosterScopeLabel} 근무표를 저장하시겠습니까?\n기존 월간 편성은 덮어씁니다.`)) return;

    setSaving(true);
    try {
      const requiresOffShift = enabledRows.some((row) => row.cells.some((cell) => cell.shiftId === OFF_SHIFT_TOKEN));
      const resolvedOffShift = requiresOffShift ? await ensureOffShift() : null;
      const startDate = `${selectedMonth}-01`;
      const endDate = `${selectedMonth}-${String(monthDates.length).padStart(2, '0')}`;
      const staffIds = enabledRows.map((row) => row.staff.id);

      const { error: deleteError } = await supabase
        .from('shift_assignments')
        .delete()
        .in('staff_id', staffIds)
        .gte('work_date', startDate)
        .lte('work_date', endDate);

      if (deleteError) throw deleteError;

      const insertRows = enabledRows.flatMap((row) =>
        row.cells.map((cell) => ({
          staff_id: row.staff.id,
          work_date: cell.date,
          shift_id: cell.shiftId === OFF_SHIFT_TOKEN ? resolvedOffShift?.id || null : cell.shiftId || null,
          company_name: selectedCompany,
        }))
      );

      for (let index = 0; index < insertRows.length; index += 500) {
        const chunk = insertRows.slice(index, index + 500);
        const { error } = await supabase.from('shift_assignments').upsert(chunk, {
          onConflict: 'staff_id,work_date',
        });
        if (error) throw error;
      }

      captureRosterSnapshot({
        source: 'saved',
        label: `${selectedMonth} ${rosterScopeLabel} 저장본`,
        warningCount: rosterWarningReport.items.length,
      });
      onAssignmentsSaved?.();
      toast(`${rosterScopeLabel} 범위 ${enabledRows.length}명의 ${selectedMonth} 근무표를 저장했습니다.`, 'success');
    } catch (error: unknown) {
      console.error('근무표 저장 실패:', error);
      toast(`근무표 저장에 실패했습니다.\n${(error as Error)?.message || '알 수 없는 오류'}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!canAccess) {
    return (
      <div className="rounded-[var(--radius-xl)] border border-red-100 bg-red-500/10 p-4 text-sm font-semibold text-red-600">
        부서장 이상만 교대근무 자동생성 기능을 사용할 수 있습니다.
      </div>
    );
  }

  if ((panelMode === 'rules' || panelMode === 'patterns') && !canManageRosterPolicies) {
    return (
      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
        <h3 className="text-base font-bold text-[var(--foreground)]">관리자 전용 기능</h3>
        <p className="mt-2 text-sm text-[var(--toss-gray-3)]">
          근무 규칙과 근무 패턴 관리는 관리자 메뉴의 회사관리에서만 수정할 수 있습니다.
        </p>
      </div>
    );
  }

  if (panelMode === 'rules') {
    return (
      <div className="space-y-4" data-testid="roster-rule-manager">
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-bold text-[var(--foreground)]">근무규칙생성</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--toss-gray-3)]">
                나이트 뒤 데이 금지, OFF 일수, 3교대자 월 나이트 최소·최대 같은 병동 운영 규칙을 저장해 근무표 자동생성에 반영합니다.
              </p>
            </div>
            <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-sm font-semibold text-[var(--foreground)]">
              적용 사업체 · {selectedCompany || '미선택'}
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h4 className="text-lg font-bold text-[var(--foreground)]">규칙 편집</h4>
                <p className="mt-1 text-sm text-[var(--toss-gray-3)]">
                  병동팀처럼 3교대와 전담자가 섞이는 팀 기준으로, 월간 자동생성에 적용할 제약을 직접 만듭니다.
                </p>
              </div>
              <button
                type="button"
                onClick={migrateLegacyGenerationRules}
                className="rounded-[var(--radius-lg)] border border-[var(--accent)]/30 bg-[var(--toss-blue-light)] px-4 py-3 text-sm font-bold text-[var(--accent)]"
                data-testid="generation-rule-migrate-legacy"
              >
                예전 병동 규칙 보정
              </button>
              <button
                type="button"
                onClick={resetGenerationRuleDraft}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-bold text-[var(--foreground)]"
                data-testid="generation-rule-reset"
              >
                새 규칙
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold text-[var(--toss-gray-3)]">규칙 이름</span>
                <input
                  value={generationRuleDraft.name}
                  onChange={(event) => updateGenerationRuleDraftField('name', event.target.value)}
                  placeholder="예: 병동 기본 안전규칙"
                  className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="generation-rule-name-input"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold text-[var(--toss-gray-3)]">팀 키워드</span>
                <input
                  value={generationRuleDraft.teamKeywords.join(', ')}
                  onChange={(event) => updateGenerationRuleDraftField('teamKeywords', event.target.value)}
                  placeholder="예: 병동팀, 1병동"
                  className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="generation-rule-team-keywords-input"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold text-[var(--toss-gray-3)]">생성 성향</span>
                <select
                  value={generationRuleDraft.generationStyle}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('generationStyle', event.target.value)
                  }
                  className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="generation-rule-style-select"
                >
                  {GENERATION_STYLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-[var(--toss-gray-3)]">
                  {getGenerationStyleMeta(generationRuleDraft.generationStyle).detail}
                </span>
              </label>

              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3 md:col-span-2">
                <p className="text-sm font-bold text-[var(--foreground)]">일자별 최소 인원</p>
                <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
                  자동생성 시 각 날짜마다 우선 확보하려는 최소 D / E / N 인원입니다. 부족한 경우 가능한 범위 안에서 최대한 맞춥니다.
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-[var(--toss-gray-3)]">D 최소</span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={generationRuleDraft.minDayStaff}
                      onChange={(event) =>
                        updateGenerationRuleDraftField('minDayStaff', event.target.value)
                      }
                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                      data-testid="generation-rule-min-day-staff"
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-[var(--toss-gray-3)]">E 최소</span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={generationRuleDraft.minEveningStaff}
                      onChange={(event) =>
                        updateGenerationRuleDraftField('minEveningStaff', event.target.value)
                      }
                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                      data-testid="generation-rule-min-evening-staff"
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-[var(--toss-gray-3)]">N 최소</span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={generationRuleDraft.minNightStaff}
                      onChange={(event) =>
                        updateGenerationRuleDraftField('minNightStaff', event.target.value)
                      }
                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                      data-testid="generation-rule-min-night-staff"
                    />
                  </label>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-[var(--toss-gray-3)]">N 선임 최소</span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={generationRuleDraft.minSeniorNightStaff}
                      onChange={(event) =>
                        updateGenerationRuleDraftField('minSeniorNightStaff', event.target.value)
                      }
                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                      data-testid="generation-rule-min-senior-night-staff"
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-[var(--toss-gray-3)]">N 전담 최소</span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={generationRuleDraft.minDedicatedNightStaff}
                      onChange={(event) =>
                        updateGenerationRuleDraftField('minDedicatedNightStaff', event.target.value)
                      }
                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                      data-testid="generation-rule-min-dedicated-night-staff"
                    />
                  </label>
                </div>
              </div>
            </div>

            <label className="mt-4 flex flex-col gap-2">
              <span className="text-xs font-bold text-[var(--toss-gray-3)]">규칙 설명</span>
              <textarea
                value={generationRuleDraft.description}
                onChange={(event) => updateGenerationRuleDraftField('description', event.target.value)}
                placeholder="예: 병동 3교대자는 월 6번 나이트, 나이트 뒤 최소 하루 OFF"
                rows={3}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm leading-6 text-[var(--foreground)] outline-none"
              />
            </label>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">나이트 다음 데이 금지</p>
                  <p className="mt-1 text-xs text-[var(--toss-gray-3)]">나이트 다음날은 OFF 또는 이브만 허용합니다.</p>
                </div>
                <input
                  type="checkbox"
                  checked={generationRuleDraft.avoidDayAfterNight}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('avoidDayAfterNight', event.target.checked)
                  }
                  className="h-5 w-5"
                  data-testid="generation-rule-avoid-day-after-night"
                />
              </label>

              <label className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">이브 다음날 데이 금지</p>
                  <p className="mt-1 text-xs text-[var(--toss-gray-3)]">이브 근무 다음날에는 데이 대신 OFF나 이브/나이트만 배치합니다.</p>
                </div>
                <input
                  type="checkbox"
                  checked={generationRuleDraft.avoidDayAfterEvening}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('avoidDayAfterEvening', event.target.checked)
                  }
                  className="h-5 w-5"
                  data-testid="generation-rule-avoid-day-after-evening"
                />
              </label>

              <label className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">전담자는 자기 시간대만</p>
                  <p className="mt-1 text-xs text-[var(--toss-gray-3)]">데이/이브/나이트 전담은 연결된 시간대만 근무합니다.</p>
                </div>
                <input
                  type="checkbox"
                  checked={generationRuleDraft.fixedShiftOnly}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('fixedShiftOnly', event.target.checked)
                  }
                  className="h-5 w-5"
                  data-testid="generation-rule-fixed-shift-only"
                />
              </label>

              <label className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">순환근무 밴드 균형</p>
                  <p className="mt-1 text-xs text-[var(--toss-gray-3)]">병동 전체에서 데이/이브/나이트가 한쪽으로 치우치지 않게 분산합니다.</p>
                </div>
                <input
                  type="checkbox"
                  checked={generationRuleDraft.balanceRotationBands}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('balanceRotationBands', event.target.checked)
                  }
                  className="h-5 w-5"
                  data-testid="generation-rule-balance-bands"
                />
              </label>

              <label className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">주말 근무 균등 분산</p>
                  <p className="mt-1 text-xs text-[var(--toss-gray-3)]">토·일 근무가 특정 직원에게 몰리지 않도록 OFF를 우선 분산합니다.</p>
                </div>
                <input
                  type="checkbox"
                  checked={generationRuleDraft.distributeWeekendShifts}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('distributeWeekendShifts', event.target.checked)
                  }
                  className="h-5 w-5"
                  data-testid="generation-rule-distribute-weekends"
                />
              </label>

              <label className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">공휴일 근무 공정 배분</p>
                  <p className="mt-1 text-xs text-[var(--toss-gray-3)]">법정 공휴일 근무도 주말처럼 균등하게 분산합니다.</p>
                </div>
                <input
                  type="checkbox"
                  checked={generationRuleDraft.distributeHolidayShifts}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('distributeHolidayShifts', event.target.checked)
                  }
                  className="h-5 w-5"
                  data-testid="generation-rule-distribute-holidays"
                />
              </label>

              <label className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">신규간호사 분산 배치</p>
                  <p className="mt-1 text-xs text-[var(--toss-gray-3)]">입사 12개월 이하 간호사가 같은 근무에만 몰리지 않게 배치합니다.</p>
                </div>
                <input
                  type="checkbox"
                  checked={generationRuleDraft.separateNewNursesByShift}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('separateNewNursesByShift', event.target.checked)
                  }
                  className="h-5 w-5"
                  data-testid="generation-rule-separate-new-nurses"
                />
              </label>

              <label className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">신규 간호사 단독 NIGHT 금지</p>
                  <p className="mt-1 text-xs text-[var(--toss-gray-3)]">신규 간호사만 NIGHT에 남지 않도록 막습니다.</p>
                </div>
                <input
                  type="checkbox"
                  checked={generationRuleDraft.blockNewNurseSoloNight}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('blockNewNurseSoloNight', event.target.checked)
                  }
                  className="h-5 w-5"
                />
              </label>

              <label className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">신규 NIGHT 선임 동반</p>
                  <p className="mt-1 text-xs text-[var(--toss-gray-3)]">신규 간호사가 NIGHT면 반드시 선임이 함께 배치됩니다.</p>
                </div>
                <input
                  type="checkbox"
                  checked={generationRuleDraft.requireSeniorWithNewNurseNight}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('requireSeniorWithNewNurseNight', event.target.checked)
                  }
                  className="h-5 w-5"
                />
              </label>

              <label className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                <span className="text-sm font-bold text-[var(--foreground)]">나이트 뒤 OFF 일수</span>
                <input
                  type="number"
                  min={0}
                  max={5}
                  value={generationRuleDraft.offDaysAfterNight}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('offDaysAfterNight', event.target.value)
                  }
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="generation-rule-off-days-after-night"
                />
                <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">최대값 안에서 자동으로 조정됩니다.</span>
              </label>

              <label className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                <span className="text-sm font-bold text-[var(--foreground)]">나이트 연속 블록</span>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={generationRuleDraft.nightBlockSize}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('nightBlockSize', event.target.value)
                  }
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="generation-rule-night-block-size"
                />
                <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">최대 연속 일수까지만 나이트를 묶습니다.</span>
              </label>

              <label className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                <span className="text-sm font-bold text-[var(--foreground)]">최대 연속근무일</span>
                <input
                  type="number"
                  min={2}
                  max={7}
                  value={generationRuleDraft.maxConsecutiveWorkDays}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('maxConsecutiveWorkDays', event.target.value)
                  }
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="generation-rule-max-consecutive-work-days"
                />
              </label>

              <label className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                <span className="text-sm font-bold text-[var(--foreground)]">연속 이브 최대 횟수</span>
                <input
                  type="number"
                  min={0}
                  max={7}
                  value={generationRuleDraft.maxConsecutiveEveningShifts}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('maxConsecutiveEveningShifts', event.target.value)
                  }
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="generation-rule-max-consecutive-evening-shifts"
                />
                <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">0이면 제한하지 않습니다.</span>
              </label>

              <label className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                <span className="text-sm font-bold text-[var(--foreground)]">주말 연속근무 최대 일수</span>
                <input
                  type="number"
                  min={0}
                  max={4}
                  value={generationRuleDraft.maxConsecutiveWeekendWorkDays}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('maxConsecutiveWeekendWorkDays', event.target.value)
                  }
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="generation-rule-max-consecutive-weekend-work-days"
                />
                <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">0이면 토·일 연속근무 제한을 적용하지 않습니다.</span>
              </label>

              <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3 md:col-span-2">
                <span className="text-sm font-bold text-[var(--foreground)]">3교대자 월 나이트 범위</span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-2">
                    <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">최소</span>
                    <input
                      type="number"
                      min={0}
                      max={31}
                      value={generationRuleDraft.minRotationNightCount}
                      onChange={(event) =>
                        updateGenerationRuleDraftField('minRotationNightCount', event.target.value)
                      }
                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                      data-testid="generation-rule-rotation-night-min-count"
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">최대</span>
                    <input
                      type="number"
                      min={0}
                      max={31}
                      value={generationRuleDraft.maxRotationNightCount}
                      onChange={(event) =>
                        updateGenerationRuleDraftField('maxRotationNightCount', event.target.value)
                      }
                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                      data-testid="generation-rule-rotation-night-max-count"
                    />
                  </label>
                </div>
              </div>

              <label className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3 md:col-span-2">
                <span className="text-sm font-bold text-[var(--foreground)]">최소 OFF 일수</span>
                <input
                  type="number"
                  min={7}
                  max={31}
                  value={generationRuleDraft.minMonthlyOffDays}
                  onChange={(event) =>
                    updateGenerationRuleDraftField('minMonthlyOffDays', event.target.value)
                  }
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="generation-rule-min-monthly-off-days"
                />
                <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">최소 휴무일은 7일 이상부터 설정됩니다.</span>
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={saveGenerationRule}
                className="rounded-[var(--radius-lg)] bg-[var(--accent)] px-4 py-3 text-sm font-bold text-white"
                data-testid="generation-rule-save"
              >
                규칙 저장
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
              <h4 className="text-lg font-bold text-[var(--foreground)]">저장된 규칙</h4>
              <p className="mt-1 text-sm text-[var(--toss-gray-3)]">
                팀 기준으로 자동 선택되며, 생성 화면에서 직접 골라 적용할 수도 있습니다.
              </p>

              {companyGenerationRules.length === 0 ? (
                <div className="mt-4 rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-5 text-sm font-semibold text-[var(--toss-gray-3)]">
                  아직 저장된 근무규칙이 없습니다.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {companyGenerationRules.map((rule) => (
                    <div
                      key={rule.id}
                      className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--muted)]/80 p-4"
                      data-testid={`generation-rule-card-${rule.id}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[var(--foreground)]">{rule.name}</p>
                          <p className="mt-1 text-xs font-semibold text-[var(--accent)]">
                            {rule.teamKeywords.join(', ')}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => editGenerationRule(rule)}
                            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-bold text-[var(--foreground)]"
                            data-testid={`generation-rule-edit-${rule.id}`}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`"${rule.name}" 규칙을 삭제할까요?`)) {
                                deleteGenerationRule(rule.id);
                              }
                            }}
                            className="rounded-[var(--radius-md)] border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-600"
                            data-testid={`generation-rule-delete-${rule.id}`}
                          >
                            삭제
                          </button>
                        </div>
                        <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1">
                          연속근무 {rule.maxConsecutiveWorkDays}일
                        </span>
                        {rule.distributeWeekendShifts ? (
                          <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1">
                            주말 분산
                          </span>
                        ) : null}
                        {rule.distributeHolidayShifts ? (
                          <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1">
                            공휴일 분산
                          </span>
                        ) : null}
                        {rule.separateNewNursesByShift ? (
                          <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1">
                            신규간호사 분산
                          </span>
                        ) : null}
                        {(rule.minDayStaff || rule.minEveningStaff || rule.minNightStaff) > 0 ? (
                          <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1">
                            최소 D/E/N {rule.minDayStaff}/{rule.minEveningStaff}/{rule.minNightStaff}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-[var(--foreground)]">
                        <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1">
                          월 나이트 {rule.minRotationNightCount}~{rule.maxRotationNightCount}개
                        </span>
                        <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1">
                          연속 나이트 {rule.nightBlockSize}개
                        </span>
                        <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1">
                          OFF {rule.offDaysAfterNight}일
                        </span>
                        <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1">
                          최소 OFF {rule.minMonthlyOffDays}일
                        </span>
                        {rule.maxConsecutiveEveningShifts > 0 ? (
                          <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1">
                            연속 이브 최대 {rule.maxConsecutiveEveningShifts}회
                          </span>
                        ) : null}
                        {rule.maxConsecutiveWeekendWorkDays > 0 ? (
                          <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1">
                            주말 연속근무 최대 {rule.maxConsecutiveWeekendWorkDays}일
                          </span>
                        ) : null}
                      </div>

                      {rule.description ? (
                        <p className="mt-3 text-sm leading-6 text-[var(--toss-gray-4)]">{rule.description}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (panelMode === 'patterns') {
    return (
      <div className="space-y-4" data-testid="roster-pattern-manager">
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-bold text-[var(--foreground)]">교대방식 패턴</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--toss-gray-3)]">
                팀별 기본 사이클과 전담자 그룹을 저장해 두고, 생성 화면에서 바로 불러와 월간 근무표를 자동 편성합니다.
              </p>
            </div>
            <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-sm font-semibold text-[var(--foreground)]">
              적용 사업체 · {selectedCompany || '미선택'}
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
          <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h4 className="text-lg font-bold text-[var(--foreground)]">패턴 편집</h4>
                <p className="mt-1 text-sm text-[var(--toss-gray-3)]">
                  예: 병동팀, 외래팀, 관리팀별 기본 패턴과 나이트전담/데이전담/순환근무 그룹을 저장합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={resetPatternDraft}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-bold text-[var(--foreground)]"
                data-testid="pattern-profile-reset"
              >
                새 패턴
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold text-[var(--toss-gray-3)]">패턴 이름</span>
                <input
                  value={patternDraft.name}
                  onChange={(event) => updatePatternDraftField('name', event.target.value)}
                  placeholder="예: 병동 3교대 기본"
                  className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="pattern-name-input"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold text-[var(--toss-gray-3)]">팀 키워드</span>
                <input
                  value={patternDraft.teamKeywords.join(', ')}
                  onChange={(event) => updatePatternDraftField('teamKeywords', event.target.value)}
                  placeholder="예: 병동팀, 1병동, 간호병동"
                  className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="pattern-team-keywords-input"
                />
              </label>
            </div>

            <label className="mt-4 flex flex-col gap-2">
              <span className="text-xs font-bold text-[var(--toss-gray-3)]">패턴 설명</span>
              <textarea
                value={patternDraft.description}
                onChange={(event) => updatePatternDraftField('description', event.target.value)}
                placeholder="예: 병동 순환 3교대 + 나이트전담 1명 + 데이전담 1명"
                rows={3}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm leading-6 text-[var(--foreground)] outline-none"
              />
            </label>

            <div className="mt-4 space-y-4">
              {patternDraft.staffGroups.map((group, index) => (
                <div
                  key={group.id}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/80 p-5"
                  data-testid={`pattern-group-card-${group.id}`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="grid flex-1 gap-3 md:grid-cols-2">
                      <label className="flex flex-col gap-2">
                        <span className="text-xs font-bold text-[var(--toss-gray-3)]">직원 그룹 이름</span>
                        <input
                          value={group.label}
                          onChange={(event) => updatePatternGroup(group.id, { label: event.target.value })}
                          placeholder={`그룹 ${index + 1}`}
                          className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm font-semibold text-[var(--foreground)] outline-none"
                          data-testid={`pattern-group-label-${group.id}`}
                        />
                      </label>
                      <label className="flex flex-col gap-2">
                        <span className="text-xs font-bold text-[var(--toss-gray-3)]">운영 방식</span>
                        <select
                          value={group.mode}
                          onChange={(event) =>
                            updatePatternGroup(group.id, {
                              mode: event.target.value as RosterPatternGroupMode,
                            })
                          }
                          className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm font-semibold text-[var(--foreground)] outline-none"
                          data-testid={`pattern-group-mode-${group.id}`}
                        >
                          {PATTERN_GROUP_MODE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePatternGroup(group.id)}
                      disabled={patternDraft.staffGroups.length === 1}
                      className="rounded-[var(--radius-md)] border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      그룹 삭제
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-bold text-[var(--toss-gray-3)]">직원 구분 키워드</span>
                      <input
                        value={group.matchKeywords.join(', ')}
                        onChange={(event) =>
                          updatePatternGroup(group.id, {
                            matchKeywords: event.target.value
                              .split(',')
                              .map((item) => item.trim())
                              .filter(Boolean),
                          })
                        }
                        placeholder="예: 나이트전담, 고정N, 야간전담"
                        className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm font-semibold text-[var(--foreground)] outline-none"
                      />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-bold text-[var(--toss-gray-3)]">메모</span>
                      <input
                        value={group.note || ''}
                        onChange={(event) => updatePatternGroup(group.id, { note: event.target.value })}
                        placeholder="예: N N OFF OFF 반복"
                        className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm font-semibold text-[var(--foreground)] outline-none"
                      />
                    </label>
                  </div>

                  <div className="mt-4">
                    <p className="text-xs font-bold text-[var(--toss-gray-3)]">연결 근무유형</p>
                    {workingShifts.length === 0 ? (
                      <div className="mt-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-semibold text-[var(--toss-gray-3)]">
                        먼저 근무형태를 등록해 주세요.
                      </div>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {workingShifts.map((shift) => {
                          const active = group.shiftIds.includes(shift.id);
                          return (
                            <button
                              key={shift.id}
                              type="button"
                              onClick={() => togglePatternGroupShift(group.id, shift.id)}
                              className={`rounded-[var(--radius-md)] border px-3 py-2 text-[11px] font-semibold transition-all ${
                                active
                                  ? `${getShiftBadgeClass(shift.name)} ring-2 ring-[var(--accent)]/20`
                                  : 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]'
                              }`}
                              data-testid={`pattern-group-shift-${group.id}-${shift.id}`}
                            >
                              {shift.name} · {formatShiftHours(shift)}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={addPatternGroup}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-bold text-[var(--foreground)]"
                data-testid="pattern-group-add"
              >
                그룹 추가
              </button>
              <button
                type="button"
                onClick={savePatternProfile}
                className="rounded-[var(--radius-lg)] bg-[var(--accent)] px-4 py-3 text-sm font-bold text-white"
                data-testid="pattern-profile-save"
              >
                패턴 저장
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
              <h4 className="text-lg font-bold text-[var(--foreground)]">저장된 패턴</h4>
              <p className="mt-1 text-sm text-[var(--toss-gray-3)]">
                선택한 사업체에 맞는 팀 패턴만 모아 보여줍니다.
              </p>

              {companyPatternProfiles.length === 0 ? (
                <div className="mt-4 rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-5 text-sm font-semibold text-[var(--toss-gray-3)]">
                  아직 저장된 교대방식 패턴이 없습니다.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {companyPatternProfiles.map((profile) => (
                    <div
                      key={profile.id}
                      className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--muted)]/80 p-4"
                      data-testid={`pattern-profile-card-${profile.id}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[var(--foreground)]">{profile.name}</p>
                          <p className="mt-1 text-xs font-semibold text-[var(--accent)]">
                            {profile.teamKeywords.join(', ')}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => editPatternProfile(profile)}
                            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-bold text-[var(--foreground)]"
                            data-testid={`pattern-profile-edit-${profile.id}`}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`"${profile.name}" 패턴을 삭제할까요?`)) {
                                deletePatternProfile(profile.id);
                              }
                            }}
                            className="rounded-[var(--radius-md)] border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-600"
                            data-testid={`pattern-profile-delete-${profile.id}`}
                          >
                            삭제
                          </button>
                        </div>
                      </div>

                      {profile.description ? (
                        <p className="mt-3 text-sm leading-6 text-[var(--toss-gray-4)]">{profile.description}</p>
                      ) : null}

                      <div className="mt-3 flex flex-wrap gap-2">
                        {profile.staffGroups.map((group) => {
                          const modeLabel =
                            PATTERN_GROUP_MODE_OPTIONS.find((option) => option.value === group.mode)?.label ||
                            group.mode;
                          return (
                            <span
                              key={group.id}
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-[11px] font-semibold text-[var(--foreground)]"
                            >
                              {group.label} · {modeLabel}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
              <h4 className="text-lg font-bold text-[var(--foreground)]">활용 방식</h4>
              <div className="mt-3 space-y-2 text-sm leading-6 text-[var(--toss-gray-4)]">
                <p>1. 팀 키워드로 어떤 팀에 쓸 패턴인지 지정합니다.</p>
                <p>2. 직원 그룹마다 전담자 키워드와 운영 방식, 연결 근무유형을 저장합니다.</p>
                <p>3. 생성 화면에서 팀과 패턴만 고르면 저장된 규칙으로 월간 초안을 자동 생성합니다.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const aiOnlyPlannerMode = true;
  if (aiOnlyPlannerMode) {
    return (
      <div className="space-y-4" data-testid="roster-pattern-planner">
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="shrink-0 text-xl font-bold text-[var(--foreground)]">패턴 기반 근무표 생성</h3>

            <label className="flex w-full sm:w-auto shrink-0 items-center gap-2">
              <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">팀</span>
              <select
                value={selectedDepartment}
                onChange={(event) => setSelectedDepartment(event.target.value)}
                className="w-full sm:w-auto sm:min-w-[180px] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                data-testid="roster-team-select"
              >
                {teamOptions.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            </label>

            {selectedDepartment ? (
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <span className="shrink-0 text-[11px] font-bold text-[var(--toss-gray-3)]">추가 포함 팀</span>
                {availableIncludedDepartments.length === 0 ? (
                  <span className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                    선택 가능한 추가 팀 없음
                  </span>
                ) : (
                  availableIncludedDepartments.map((department, index) => {
                    const included = includedDepartments.includes(department);
                    return (
                      <button
                        key={department}
                        type="button"
                        onClick={() => toggleIncludedDepartment(department)}
                        className={`rounded-[var(--radius-md)] border px-3 py-2 text-[11px] font-bold transition-colors ${
                          included
                            ? 'border-[var(--accent)] bg-[var(--toss-blue-light)] text-[var(--accent)]'
                            : 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]'
                        }`}
                        data-testid={`roster-include-team-${index + 1}`}
                      >
                        {included ? '포함중' : '추가'} · {department}
                      </button>
                    );
                  })
                )}
              </div>
            ) : null}

            <label className="flex w-full sm:w-auto shrink-0 items-center gap-2">
              <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">교대방식 패턴</span>
              <select
                value={selectedPatternProfileId}
                onChange={(event) => setSelectedPatternProfileId(event.target.value)}
                className="w-full sm:w-auto sm:min-w-[220px] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                data-testid="roster-pattern-profile-select"
              >
                <option value="">팀 기준 기본 규칙</option>
                {matchingPatternProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex w-full sm:w-auto shrink-0 items-center gap-2">
              <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">근무규칙</span>
              <select
                value={selectedGenerationRuleId}
                onChange={(event) => setSelectedGenerationRuleId(event.target.value)}
                className="w-full sm:w-auto sm:min-w-[220px] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                data-testid="roster-generation-rule-select"
              >
                <option value="">팀 기준 기본 규칙</option>
                {matchingGenerationRules.map((rule) => (
                  <option key={rule.id} value={rule.id}>
                    {rule.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <span className="shrink-0 text-[11px] font-bold text-[var(--toss-gray-3)]">적용 근무유형</span>
              {loadingShifts ? (
                <span className="text-[12px] font-semibold text-[var(--accent)]">근무형태 불러오는 중...</span>
              ) : workingShifts.length === 0 ? (
                <span className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                  등록된 근무형태가 없습니다.
                </span>
              ) : recommendedAiShifts.length === 0 ? (
                <span className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                  이 팀에 맞는 추천 근무유형이 없습니다.
                </span>
              ) : (
                recommendedAiShifts.map((shift) => {
                  return (
                    <span
                      key={shift.id}
                      className={`rounded-[var(--radius-md)] border px-3 py-2 text-[11px] font-semibold ${getShiftBadgeClass(shift.name)}`}
                      data-testid={`planner-shift-chip-${shift.id}`}
                    >
                      {shift.name}
                      {' · '}
                      {formatShiftHours(shift)}
                      {' · '}
                      {resolveConfiguredWorkDayMode(shift) === 'all_days' ? '주말 포함' : '주말 제외'}
                    </span>
                  );
                })
              )}
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-3">
              <label className="flex flex-col gap-0">
                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2">
                  <SmartMonthPicker
                    value={selectedMonth}
                    onChange={(value) => setSelectedMonth(value)}
                    className="w-[150px]"
                    inputClassName="text-sm font-semibold text-[var(--foreground)]"
                  />
                </div>
              </label>
              <button
                type="button"
                onClick={openWizard}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-bold text-[var(--foreground)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                data-testid="roster-wizard-open"
              >
                근무표 생성 마법사
              </button>
              <button
                type="button"
                onClick={requestGeminiRecommendation}
                disabled={
                  geminiLoading ||
                  loadingShifts ||
                  workingShifts.length === 0 ||
                  enabledTargetStaffs.length === 0
                }
                className="rounded-[var(--radius-lg)] border border-[var(--accent)] bg-[var(--toss-blue-light)] px-4 py-3 text-sm font-bold text-[var(--accent)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="roster-gemini-recommend"
              >
                {geminiLoading ? 'Gemini 추천 중...' : 'Gemini 팀 추천'}
              </button>
                <button
                  type="button"
                  onClick={generatePatternDraft}
                  disabled={
                    geminiLoading ||
                    loadingShifts ||
                    workingShifts.length === 0 ||
                    enabledTargetStaffs.length === 0
                  }
                  className="rounded-[var(--radius-lg)] border border-[var(--accent)] bg-[var(--toss-blue-light)] px-4 py-3 text-sm font-bold text-[var(--accent)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  data-testid="roster-auto-generate"
                >
                {geminiLoading ? '자동 생성 중...' : '근무표 자동 생성'}
              </button>
              <button
                type="button"
                onClick={saveAssignments}
                disabled={!canManageRosterAssignments || saving || loadingShifts || previewRows.length === 0}
                className="rounded-[var(--radius-lg)] bg-[var(--accent)] px-4 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? '저장 중...' : '월간 근무표 저장'}
              </button>
            </div>
          </div>

          {renderRosterScopeSummary()}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="w-full rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--muted)]/70 px-4 py-3 text-sm font-semibold text-[var(--foreground)]">
              {selectedPatternProfile
                ? '선택한 팀 패턴 프로필을 기준으로 데이/이브/나이트 전담자와 순환 근무자를 같이 편성합니다.'
                : '저장된 팀 패턴 프로필이 없어도 직원의 shift_type과 배정 근무를 기준으로 데이/이브/나이트 전담자를 자동 감지하고, 나머지는 순환 근무로 편성합니다.'}
            </div>
            {plannerPatternPreviewGroups.length > 0 ? (
              <div
                className="w-full rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] px-4 py-3"
                data-testid="roster-pattern-group-preview"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {plannerPatternPreviewGroups.map((group) => {
                    const modeLabel =
                      PATTERN_GROUP_MODE_OPTIONS.find((option) => option.value === group.mode)?.label ||
                      group.mode;
                    const toneClass =
                      group.source === 'profile'
                        ? 'border-[var(--accent)]/20 bg-[var(--toss-blue-light)]/60'
                        : group.source === 'auto'
                          ? 'border-emerald-200 bg-emerald-50'
                          : 'border-[var(--border)] bg-[var(--muted)]';

                    return (
                      <span
                        key={group.key}
                        className={`rounded-[var(--radius-md)] border px-3 py-2 text-[11px] font-semibold text-[var(--foreground)] ${toneClass}`}
                      >
                        {group.label} {group.count}명 · {modeLabel}
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {selectedPatternProfile ? (
              <div className="rounded-[var(--radius-lg)] border border-[var(--accent)]/20 bg-[var(--toss-blue-light)]/60 px-4 py-3 text-sm font-semibold text-[var(--foreground)]">
                적용 패턴 · {selectedPatternProfile.name}
                {selectedPatternProfile.description ? ` · ${selectedPatternProfile.description}` : ''}
              </div>
            ) : (
              <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-sm font-semibold text-[var(--toss-gray-3)]">
                저장된 교대방식 패턴이 있으면 우선 적용하고, 없으면 팀 기본 규칙으로 자동 생성합니다.
              </div>
            )}
            {selectedGenerationRule ? (
              <div className="rounded-[var(--radius-lg)] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-[var(--foreground)]">
                적용 규칙 · {selectedGenerationRule.name}
              </div>
            ) : (
              <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-sm font-semibold text-[var(--toss-gray-3)]">
                저장된 규칙이 없으면 팀 기본 안전규칙으로 자동 생성합니다.
              </div>
            )}
            {matchingPatternProfiles.length === 0 && companyPatternProfiles.length === 0 ? (
              <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-sm font-semibold text-[var(--toss-gray-3)]">
                패턴 탭에서 팀별 교대방식 패턴을 먼저 저장할 수 있습니다.
              </div>
            ) : null}
            {matchingGenerationRules.length === 0 && companyGenerationRules.length === 0 ? (
              <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-sm font-semibold text-[var(--toss-gray-3)]">
                규칙 탭에서 팀별 근무규칙을 먼저 저장할 수 있습니다.
              </div>
            ) : null}
            <div
              className="w-full rounded-[var(--radius-xl)] border border-emerald-200 bg-emerald-50/80 px-4 py-4"
              data-testid="roster-active-generation-rule-summary"
            >
              <div className="flex flex-wrap items-center gap-2">
                {activeGenerationRuleSummaryItems.map((item, index) => (
                  <span
                    key={`active-rule-summary-${index}`}
                    className="rounded-[var(--radius-md)] border border-emerald-200 bg-[var(--card)] px-3 py-2 text-[11px] font-semibold text-[var(--foreground)]"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
            {rosterFeasibilityIssues.length > 0 ? (
              <div
                className="w-full rounded-[var(--radius-xl)] border border-amber-200 bg-amber-50/80 px-4 py-4"
                data-testid="roster-feasibility-summary"
              >
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-bold text-amber-800">생성 전 확인 필요</p>
                  {rosterFeasibilityIssues.map((issue) => (
                    <button
                      key={issue.id}
                      type="button"
                      onClick={() => jumpToRosterWarningTarget(issue.targetTestId)}
                      className={`rounded-[var(--radius-md)] border px-3 py-2 text-left text-[12px] font-semibold ${
                        issue.severity === 'blocking'
                          ? 'border-red-200 bg-red-50 text-red-700'
                          : 'border-amber-200 bg-[var(--card)] text-amber-800'
                      }`}
                    >
                      {issue.detail}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {saveBlockingWarnings.length > 0 ? (
              <div
                className="w-full rounded-[var(--radius-xl)] border border-red-200 bg-red-50/90 px-4 py-4"
                data-testid="roster-blocking-warning-summary"
              >
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-bold text-red-700">저장 전 차단 경고</p>
                  {saveBlockingWarnings.map((warning) => (
                    <button
                      key={warning.id}
                      type="button"
                      onClick={() => jumpToRosterWarningTarget(warning.targetTestId)}
                      className="rounded-[var(--radius-md)] border border-red-200 bg-[var(--card)] px-3 py-2 text-left text-[12px] font-semibold text-red-700"
                    >
                      {warning.detail}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div
              className="w-full rounded-[var(--radius-xl)] border border-amber-200 bg-amber-50/80 px-4 py-4"
              data-testid="preferred-off-manager"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">
                    Preferred Off
                  </p>
                  <h4 className="mt-1 text-base font-bold text-[var(--foreground)]">개인 희망 OFF</h4>
                  <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                    자동 생성 전에 직원별 희망 휴무일을 등록하면 해당 날짜를 OFF로 우선 반영합니다.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={preferredOffStaffId}
                    onChange={(event) => setPreferredOffStaffId(event.target.value)}
                    disabled={targetStaffs.length === 0}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] disabled:opacity-50"
                    data-testid="preferred-off-staff-select"
                  >
                    {targetStaffs.length === 0 ? (
                      <option value="">직원 없음</option>
                    ) : (
                      targetStaffs.map((staff) => (
                        <option key={staff.id} value={String(staff.id)}>
                          {staff.name}
                        </option>
                      ))
                    )}
                  </select>
                  <select
                    value={preferredOffDate}
                    onChange={(event) => setPreferredOffDate(event.target.value)}
                    disabled={monthDates.length === 0}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] disabled:opacity-50"
                    data-testid="preferred-off-date-select"
                  >
                    {monthDates.map((date) => (
                      <option key={date} value={date}>
                        {date}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={addPreferredOffDate}
                    disabled={!preferredOffStaffId || !preferredOffDate}
                    className="rounded-[var(--radius-md)] bg-amber-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                    data-testid="preferred-off-add"
                  >
                    희망 OFF 추가
                  </button>
                  <button
                    type="button"
                    onClick={clearAllPreferredOff}
                    disabled={preferredOffCount === 0}
                    className="rounded-[var(--radius-md)] border border-amber-200 bg-[var(--card)] px-3 py-2 text-sm font-bold text-amber-700 disabled:opacity-50"
                    data-testid="preferred-off-clear-all"
                  >
                    전체 비우기
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-[var(--radius-md)] border border-amber-200 bg-[var(--card)] px-3 py-1 text-[11px] font-semibold text-amber-700">
                  등록 {preferredOffCount}건
                </span>
                {preferredOffEntries.map((entry) => (
                  <span
                    key={`preferred-off-summary-${entry.staff.id}`}
                    className="rounded-[var(--radius-md)] border border-amber-100 bg-[var(--card)]/80 px-3 py-1 text-[11px] font-semibold text-[var(--foreground)]"
                  >
                    {entry.staff.name} {entry.dates.length}일
                  </span>
                ))}
              </div>
              <div className="mt-3 space-y-2">
                {preferredOffEntries.length === 0 ? (
                  <p className="text-[12px] font-semibold text-[var(--toss-gray-3)]">
                    등록된 개인 희망 OFF가 없습니다.
                  </p>
                ) : (
                  preferredOffEntries.map((entry) => (
                    <div
                      key={`preferred-off-row-${entry.staff.id}`}
                      className="rounded-[var(--radius-lg)] border border-amber-100 bg-[var(--card)]/90 px-3 py-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-[var(--foreground)]">{entry.staff.name}</p>
                          <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                            {entry.dates.length}일 등록
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => clearPreferredOffForStaff(String(entry.staff.id))}
                          className="rounded-[var(--radius-md)] border border-amber-200 px-3 py-1 text-[11px] font-bold text-amber-700"
                        >
                          직원 비우기
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {entry.dates.map((date) => (
                          <button
                            type="button"
                            key={`${entry.staff.id}-${date}`}
                            onClick={() => removePreferredOffDate(String(entry.staff.id), date)}
                            className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700"
                            data-testid={`preferred-off-chip-${entry.staff.id}-${date}`}
                          >
                            {date} x
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {renderRosterWizardModal()}
        {(geminiSummary || aiRecommendation?.teamAnalysis) && (
          <div
            className="rounded-[var(--radius-xl)] border border-[var(--accent)]/20 bg-[var(--toss-blue-light)]/60 p-4 shadow-sm"
            data-testid="roster-generation-summary"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="mt-2 text-sm font-semibold leading-6 text-[var(--foreground)]">
                  {geminiSummary}
                </p>
                {(leaveAppliedSummary || aiRecommendation?.leaveSummary) ? (
                  <span
                    className="mt-3 inline-flex rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700"
                    data-testid="roster-leave-coverage-summary"
                  >
                    {leaveAppliedSummary || aiRecommendation?.leaveSummary}
                  </span>
                ) : null}
                {aiRecommendation?.preferredOffSummary ? (
                  <span
                    className="mt-3 ml-2 inline-flex rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700"
                    data-testid="roster-preferred-off-summary"
                  >
                    {aiRecommendation.preferredOffSummary}
                  </span>
                ) : null}
                {structuralStaffingGap.isShortage ? (
                  <span
                    className="mt-3 ml-2 inline-flex rounded-[var(--radius-md)] border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-700"
                    data-testid="roster-staff-shortage-summary"
                  >
                    인원 부족 · 최소 {structuralStaffingGap.requiredHeadcount}명 / 현재 {structuralStaffingGap.availableHeadcount}명
                  </span>
                ) : null}
              </div>
              {geminiAppliedAt && (
                <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                  적용 시각 {geminiAppliedAt}
                </span>
              )}
            </div>
          </div>
        )}
        {renderRosterWarningReport()}
        {renderRosterFairnessBoard()}
        {renderRosterReviewPanel()}
        {renderRosterSnapshotPanel()}
        {renderRosterPartialRegenerationPanel()}
        {renderRosterManualImpactPanel()}

        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h4 className="text-base font-bold text-[var(--foreground)]">월간 근무표 미리보기</h4>
              <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                저장된 패턴과 팀 규칙으로 만든 초안을 바로 확인하고, 필요하면 셀을 눌러 수동으로 수정한 뒤 저장하세요.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setManualEditMode((prev) => !prev)}
                className={`rounded-[var(--radius-md)] px-3 py-1 text-[11px] font-bold ${manualEditMode ? 'bg-orange-500/20 text-orange-700' : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'}`}
              >
                {manualEditMode ? '수동 수정 중' : '수동 수정'}
              </button>
              <button
                type="button"
                onClick={() => setManualAssignments({})}
                disabled={summary.manualCount === 0}
                className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-1 text-[11px] font-bold text-[var(--toss-gray-4)] disabled:opacity-40"
              >
                수정 초기화
              </button>
              <span className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-bold text-[var(--accent)]">
                {previewRows.length}명 표시 · 수동 수정 {summary.manualCount}건
              </span>
            </div>
          </div>

          {workingShifts.length === 0 ? (
            <div className="mt-4 rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
              선택한 사업체에 등록된 근무형태가 없습니다. 먼저 근무형태 관리에서 근무유형을 등록하세요.
            </div>
          ) : targetStaffs.length === 0 ? (
            <div className="mt-4 rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
              선택한 팀에 직원이 없습니다.
            </div>
          ) : previewRows.length === 0 ? (
            <div className="mt-4 rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
              근무표 자동 생성 버튼을 누르면 저장된 패턴 기준의 월간 초안이 여기에 표시됩니다.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="border-collapse" style={{ minWidth: `${260 + monthDates.length * 64}px` }}>
                <thead>
                  <tr>
                    <th className="sticky left-0 z-20 min-w-[260px] border-b border-[var(--border)] bg-[var(--card)] px-4 py-3 text-left text-[11px] font-bold text-[var(--toss-gray-3)]">
                      직원
                    </th>
                    {monthDates.map((date, index) => {
                      const day = Number(date.slice(-2));
                      const weekday = WEEKDAY_LABELS[new Date(`${date}T00:00:00`).getDay()];
                      const coverage = previewDailyCoverage[index] || {
                        date,
                        day: 0,
                        evening: 0,
                        night: 0,
                        status: 'balanced' as const,
                        statusLabel: '충족',
                        statusDetail: '기준 충족',
                      };
                      const coverageToneClass =
                        coverage.status === 'warning'
                          ? 'border-red-500/20 bg-red-500/10 text-red-700'
                          : coverage.status === 'extra'
                            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300';
                      return (
                        <th
                          key={date}
                          className="min-w-[64px] border-b border-[var(--border)] bg-[var(--card)] px-2 py-3 text-center text-[10px] font-bold text-[var(--toss-gray-3)]"
                        >
                          <div>{day}</div>
                          <div className="mt-1 text-[9px]">{weekday}</div>
                          <div className={`mt-2 rounded-[var(--radius-md)] border px-2 py-0.5 text-[8px] font-bold ${coverageToneClass}`}>
                            {coverage.statusLabel}
                          </div>
                          <div
                            className={`mt-2 rounded-[var(--radius-md)] border px-1 py-1 text-[9px] font-semibold leading-4 shadow-sm transition-all ${
                              highlightedRosterTarget === `roster-preview-coverage-${date}`
                                ? 'border-[var(--accent)] bg-[var(--toss-blue-light)] ring-2 ring-[var(--accent)]/30'
                                : 'border-[var(--border)] bg-[var(--card)]'
                            }`}
                            data-testid={`roster-preview-coverage-${date}`}
                          >
                            <div className="text-[var(--accent)]">D {coverage.day}</div>
                            <div className="text-orange-600">E {coverage.evening}</div>
                            <div className="text-purple-600">N {coverage.night}</div>
                            <div className="mt-1 border-t border-[var(--border)] pt-1 text-[8px] text-[var(--toss-gray-3)]">
                              {coverage.statusDetail}
                            </div>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr
                      key={row.staff.id}
                      className={`border-b border-[var(--border)] last:border-b-0 ${
                        highlightedRosterTarget === `roster-preview-row-${row.staff.id}`
                          ? 'bg-[var(--toss-blue-light)]/40'
                          : ''
                      }`}
                      data-testid={`roster-preview-row-${row.staff.id}`}
                    >
                      <td className="sticky left-0 z-10 bg-[var(--card)] px-4 py-3">
                        <p className="text-sm font-bold text-[var(--foreground)]">{row.staff.name}</p>
                        <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                          {row.config.pattern} · {getDepartmentName(row.staff)}
                        </p>
                        <p className="mt-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">
                          근무 {row.counts.work} · OFF {row.counts.off} · N {row.counts.night}
                        </p>
                      </td>
                      {row.cells.map((cell) => (
                        <td key={cell.date} className="px-1 py-2 text-center">
                          <button
                            type="button"
                            disabled={!manualEditMode}
                            onClick={() =>
                              handleManualCellClick({
                                staffId: String(row.staff.id),
                                date: cell.date,
                                currentShiftId: cell.shiftId,
                                baseShiftId: cell.baseShiftId,
                              })
                            }
                            className={`inline-flex h-8 min-w-[40px] items-center justify-center rounded-[var(--radius-md)] border px-1 text-[11px] font-black transition-all ${cell.badgeClass} ${manualEditMode ? 'cursor-pointer hover:scale-105' : 'cursor-default'} ${cell.isManual ? 'ring-2 ring-[var(--accent)] ring-offset-1' : ''}`}
                            title={`${row.staff.name} ${cell.date} ${cell.shiftName}${manualEditMode ? ' · 클릭해서 변경' : ''}`}
                          >
                            {cell.code}
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="mt-2 text-xl font-bold text-[var(--foreground)]">교대근무 생성 마법사</h3>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-0">
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2">
                <SmartMonthPicker
                  value={selectedMonth}
                  onChange={(value) => setSelectedMonth(value)}
                  className="w-[150px]"
                  inputClassName="text-sm font-semibold text-[var(--foreground)]"
                />
              </div>
            </label>
            <button
              type="button"
              onClick={openWizard}
              className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-bold text-[var(--foreground)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
              data-testid="roster-wizard-open"
            >
              근무표 생성 마법사
            </button>
            <button
              type="button"
              onClick={requestGeminiRecommendation}
              disabled={geminiLoading || loadingShifts || workingShifts.length === 0 || targetStaffs.length === 0}
              className="rounded-[var(--radius-lg)] border border-[var(--accent)] bg-[var(--toss-blue-light)] px-4 py-3 text-sm font-bold text-[var(--accent)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="roster-gemini-recommend"
            >
              {geminiLoading ? 'Gemini 추천 중...' : 'Gemini 팀 추천'}
            </button>
            <button
              type="button"
              onClick={saveAssignments}
              disabled={!canManageRosterAssignments || saving || loadingShifts || previewRows.length === 0}
              className="rounded-[var(--radius-lg)] bg-[var(--accent)] px-4 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? '저장 중...' : '월간 근무표 저장'}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4 xl:grid-cols-6">
          <div className="rounded-[var(--radius-xl)] bg-[var(--muted)] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">사업체</p>
            <p className="mt-2 text-base font-bold text-[var(--foreground)]">{selectedCompany || '-'}</p>
            {companyLockedByHrFilter && (
              <p className="mt-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">인사관리 사업체 필터와 연동 중</p>
            )}
          </div>
          <div className="rounded-[var(--radius-xl)] bg-[var(--muted)] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">팀</p>
            <p className="mt-2 text-base font-bold text-[var(--foreground)]">{rosterScopeLabel || '-'}</p>
          </div>
          <div className="rounded-[var(--radius-xl)] bg-[var(--muted)] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">대상 인원</p>
            <p className="mt-2 text-2xl font-bold text-[var(--foreground)]">{summary.staffCount}명</p>
          </div>
          <div className="rounded-[var(--radius-xl)] bg-[var(--muted)] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">편성 인원</p>
            <p className="mt-2 text-2xl font-bold text-[var(--foreground)]">{summary.enabledCount}명</p>
          </div>
          <div className="rounded-[var(--radius-xl)] bg-[var(--muted)] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">선택 패턴</p>
            <p className="mt-2 text-base font-bold text-[var(--foreground)]">{effectivePlannerPattern}</p>
          </div>
          <div className="rounded-[var(--radius-xl)] bg-[var(--muted)] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">수동 수정</p>
            <p className="mt-2 text-2xl font-bold text-[var(--foreground)]">{summary.manualCount}건</p>
          </div>
        </div>

        {geminiSummary && (
          <div
            className="mt-4 rounded-[var(--radius-xl)] border border-[var(--accent)]/20 bg-[var(--toss-blue-light)]/60 p-4"
            data-testid="roster-gemini-summary"
          >
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                  Gemini Team Recommendation
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-[var(--foreground)]">
                  {geminiSummary}
                </p>
              </div>
              {geminiAppliedAt && (
                <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                  적용 시각 {geminiAppliedAt}
                </span>
              )}
            </div>
          </div>
        )}
        {renderRosterFairnessBoard()}
      </div>

      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h4 className="text-base font-bold text-[var(--foreground)]">자동생성 규칙 만들기</h4>
            <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
              규칙은 여기서 직접 만들고 저장합니다. 마법사에서는 저장된 규칙만 불러와 생성합니다.
            </p>
          </div>
          {loadingShifts && <span className="text-[12px] font-semibold text-[var(--accent)]">근무유형 불러오는 중...</span>}
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--muted)] p-4">
            <div className="grid gap-3 md:grid-cols-2">
              {[
                { value: CUSTOM_PATTERN_VALUE, label: '순환 규칙', desc: '1차~3차와 OFF를 원하는 순서대로 반복' },
                { value: WEEKLY_TEMPLATE_PATTERN_VALUE, label: '주차 규칙', desc: '1~4주 주기로 요일별 근무를 반복' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPlannerPattern(option.value)}
                  className={`rounded-[var(--radius-xl)] border p-4 text-left transition-all ${effectivePlannerPattern === option.value ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]/70 ring-1 ring-[var(--accent)]/20' : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/50'}`}
                  data-testid={option.value === CUSTOM_PATTERN_VALUE ? 'planner-rule-type-custom' : 'planner-rule-type-weekly'}
                >
                  <p className="text-sm font-bold text-[var(--foreground)]">{option.label}</p>
                  <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">{option.desc}</p>
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {[
                { label: '1차 근무', value: plannerPrimaryShiftId, setter: setPlannerPrimaryShiftId },
                { label: '2차 근무', value: plannerSecondaryShiftId, setter: setPlannerSecondaryShiftId },
                { label: '3차 근무', value: plannerTertiaryShiftId, setter: setPlannerTertiaryShiftId },
              ].map((field) => (
                <label key={field.label} className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">{field.label}</span>
                  <select
                    value={field.value}
                    onChange={(event) => field.setter(event.target.value)}
                    className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                    data-testid={`planner-shift-${field.label.startsWith('1') ? '1' : field.label.startsWith('2') ? '2' : '3'}`}
                  >
                    {workingShifts.map((shift) => (
                      <option key={shift.id} value={shift.id}>
                        {shift.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-bold text-[var(--accent)]">
                {selectedCompany || '사업체 미선택'} / {rosterScopeLabel || '팀 미선택'}
              </span>
              <span className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-[11px] font-semibold text-[var(--foreground)]">
                규칙 타입: {effectivePlannerPattern}
              </span>
              {currentPlannerShifts.map((shiftName, index) => (
                <span
                  key={`${shiftName}-${index}`}
                  className={`rounded-[var(--radius-md)] border px-3 py-1 text-[11px] font-semibold ${getShiftBadgeClass(shiftName)}`}
                >
                  {index + 1}차 · {shiftName} · {getShiftCode(shiftName)}
                </span>
              ))}
            </div>

            {plannerUsesCustomPattern && (
              <div className="mt-4 rounded-[var(--radius-xl)] border border-dashed border-[var(--accent)]/30 bg-[var(--card)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-[var(--foreground)]">순환 규칙 조립</p>
                    <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                      1차~3차 근무와 OFF를 눌러 순서를 쌓으세요.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearPlannerCustomPatternSequence}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-[11px] font-bold text-[var(--toss-gray-3)]"
                    data-testid="planner-custom-clear"
                  >
                    순서 비우기
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {availablePlannerShiftIds.map((shiftId, index) => {
                    const shiftName = getShiftNameById(shiftId, workShifts);
                    return (
                      <button
                        key={shiftId}
                        type="button"
                        onClick={() => appendPlannerCustomPatternStep(shiftId)}
                        className={`rounded-[var(--radius-md)] border px-3 py-2 text-[11px] font-semibold transition-all hover:opacity-90 ${getShiftBadgeClass(shiftName)}`}
                        data-testid={`planner-custom-add-shift-${index + 1}`}
                      >
                        + {index + 1}차 {shiftName}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => appendPlannerCustomPatternStep(OFF_SHIFT_TOKEN)}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-[11px] font-semibold text-[var(--foreground)] transition-all hover:border-[var(--accent)]/40"
                    data-testid="planner-custom-add-off"
                  >
                    + OFF
                  </button>
                </div>

                {effectivePlannerCustomPatternSequence.length === 0 ? (
                  <div className="mt-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
                    아직 규칙 순서가 없습니다.
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {effectivePlannerCustomPatternSequence.map((token, index) => {
                      const tokenLabel = getPatternSequenceLabel(token, workShifts);
                      return (
                        <div
                          key={`${token}-${index}`}
                          className={`inline-flex items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-[11px] font-semibold ${token === OFF_SHIFT_TOKEN ? 'border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]' : getShiftBadgeClass(tokenLabel)}`}
                        >
                          <span>{index + 1}</span>
                          <span>{tokenLabel}</span>
                          <button
                            type="button"
                            onClick={() => removePlannerCustomPatternStep(index)}
                            className="rounded-[var(--radius-md)] bg-[var(--card)]/80 px-2 py-[2px] text-[10px] font-black text-[var(--foreground)]"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {plannerUsesWeeklyTemplate && (
              <div className="mt-4 rounded-[var(--radius-xl)] border border-dashed border-[var(--accent)]/30 bg-[var(--card)] p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-bold text-[var(--foreground)]">주차 규칙 조립</p>
                    <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                      1~4주 주기로 반복할 요일과 근무를 직접 정하세요.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3, 4].map((count) => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => setPlannerWeeklyTemplateWeekCount(count)}
                        className={`rounded-[var(--radius-md)] border px-3 py-1 text-[11px] font-bold ${effectivePlannerWeeklyTemplateWeeks.length === count ? 'border-[var(--accent)] bg-[var(--toss-blue-light)] text-[var(--accent)]' : 'border-[var(--border)] bg-[var(--card)] text-[var(--toss-gray-3)]'}`}
                        data-testid={`planner-week-count-${count}`}
                      >
                        {count}주
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  {effectivePlannerWeeklyTemplateWeeks.map((week, weekIndex) => (
                    <div
                      key={`${week.shiftId}-${weekIndex}`}
                      className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--muted)] p-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="text-sm font-bold text-[var(--foreground)]">{getWeeklyTemplateWeekLabel(weekIndex)}</p>
                          <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                            반복 요일: {formatWeekdaySummary(week.activeWeekdays)}
                          </p>
                        </div>
                        <select
                          value={week.shiftId}
                          onChange={(event) =>
                            updatePlannerWeeklyTemplateWeek(weekIndex, { shiftId: event.target.value })
                          }
                          className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                          data-testid={`planner-week-${weekIndex + 1}-shift`}
                        >
                          {availablePlannerShiftIds.map((shiftId) => (
                            <option key={shiftId} value={shiftId}>
                              {getShiftNameById(shiftId, workShifts)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {[
                          { label: '월~금', weekdays: [1, 2, 3, 4, 5] },
                          { label: '월~토', weekdays: [1, 2, 3, 4, 5, 6] },
                          { label: '월~일', weekdays: [1, 2, 3, 4, 5, 6, 0] },
                          { label: '휴무주', weekdays: [] },
                        ].map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => applyPlannerWeeklyTemplateWeekdays(weekIndex, preset.weekdays)}
                            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-[11px] font-bold text-[var(--foreground)]"
                            data-testid={`planner-week-${weekIndex + 1}-preset-${preset.weekdays.length === 5 ? 'weekdays' : preset.weekdays.length === 6 ? 'weekdays-sat' : preset.weekdays.length === 7 ? 'all-days' : 'off'}`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>

                      <div className="mt-4 grid grid-cols-7 gap-2">
                        {WEEKDAY_PICKER_ORDER.map((weekday) => {
                          const selected = week.activeWeekdays.includes(weekday);
                          return (
                            <button
                              key={`${weekIndex}-${weekday}`}
                              type="button"
                              onClick={() => togglePlannerWeeklyTemplateWeekday(weekIndex, weekday)}
                              className={`rounded-[var(--radius-md)] border px-2 py-3 text-[11px] font-bold transition-all ${selected ? 'border-[var(--accent)] bg-[var(--toss-blue-light)] text-[var(--accent)]' : 'border-[var(--border)] bg-[var(--card)] text-[var(--toss-gray-3)]'}`}
                            >
                              {WEEKDAY_LABELS[weekday]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--muted)] p-4">
            <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4">
              <p className="text-sm font-bold text-[var(--foreground)]">규칙 저장</p>
              <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                지금 만든 규칙을 저장하면 자동생성 마법사에서 불러올 수 있습니다.
              </p>
              <div className="mt-4 grid gap-2">
                <input
                  type="text"
                  value={plannerPresetName}
                  onChange={(event) => setPlannerPresetName(event.target.value)}
                  placeholder="예: 외래 1주5일 / 2주6일"
                  className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-3 py-3 text-sm font-semibold text-[var(--foreground)] outline-none"
                  data-testid="planner-preset-name"
                />
                <button
                  type="button"
                  onClick={savePlannerPreset}
                  disabled={!canManageRosterPolicies}
                  className="rounded-[var(--radius-lg)] bg-[var(--accent)] px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  data-testid="planner-preset-save"
                >
                  규칙 저장
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">저장한 규칙</p>
                  <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                    저장한 규칙은 여기서 다시 적용하거나 삭제할 수 있습니다.
                  </p>
                </div>
                <span className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-3 py-1 text-[10px] font-bold text-[var(--accent)]">
                  {userWizardPresets.length}개
                </span>
              </div>

              {userWizardPresets.length === 0 ? (
                <div className="mt-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
                  아직 저장한 규칙이 없습니다.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {userWizardPresets.map((preset) => (
                    <div
                      key={preset.id}
                      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] p-4"
                      data-testid={`planner-preset-${preset.id}`}
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-sm font-bold text-[var(--foreground)]">{preset.name}</p>
                          <p className="mt-1 text-[11px] font-semibold text-[var(--accent)]">{preset.pattern}</p>
                          <p className="mt-2 text-[12px] leading-5 text-[var(--toss-gray-3)]">
                            {preset.description || buildWizardPresetDescription(preset.pattern, [], preset.shiftSlotCount)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => applyPlannerPreset(preset)}
                            className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-2 text-[11px] font-bold text-white"
                            data-testid={`planner-preset-apply-${preset.id}`}
                          >
                            규칙 적용
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteWizardPreset(preset.id)}
                            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[11px] font-bold text-[var(--toss-gray-3)]"
                            data-testid={`planner-preset-delete-${preset.id}`}
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-base font-bold text-[var(--foreground)]">대상 직원 세부 조정</h4>
          </div>
          {loadingShifts && <span className="text-[12px] font-semibold text-[var(--accent)]">근무형태 불러오는 중...</span>}
        </div>

        {workingShifts.length === 0 ? (
          <div className="mt-4 rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
            선택한 사업체에 등록된 근무유형이 없습니다. 먼저 근무형태 관리에서 주간/이브닝/나이트/휴무 코드를 등록하세요.
          </div>
        ) : targetStaffs.length === 0 ? (
          <div className="mt-4 rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
            선택한 팀에 직원이 없습니다. 생성 마법사에서 사업체와 팀을 다시 선택하세요.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2">
              <thead>
                <tr className="text-left text-[11px] font-bold text-[var(--toss-gray-3)]">
                  <th className="px-3 py-2">적용</th>
                  <th className="px-3 py-2">직원</th>
                  <th className="px-3 py-2">패턴</th>
                  <th className="px-3 py-2">주 근무</th>
                  <th className="px-3 py-2">보조 근무</th>
                  <th className="px-3 py-2">야간/3차</th>
                  <th className="px-3 py-2">시작 오프셋</th>
                  <th className="px-3 py-2">월 나이트</th>
                  <th className="px-3 py-2">나이트 최소</th>
                  <th className="px-3 py-2">나이트 최대</th>
                </tr>
              </thead>
              <tbody>
                {targetStaffs.map((staff, index) => {
                  const config =
                    staffConfigs[staff.id] ||
                    buildInitialConfig(staff, index, defaultShiftOrder.length ? defaultShiftOrder : defaultShiftPool, monthDates.length);
                  const requiredShiftCount = getRequiredShiftCount(config.pattern);
                  const availablePatternOptions =
                    config.pattern === CUSTOM_PATTERN_VALUE
                      ? WIZARD_PATTERN_OPTIONS
                      : PATTERN_OPTIONS;
                  return (
                    <tr
                      key={staff.id}
                      className={`rounded-[var(--radius-xl)] ${
                        highlightedRosterTarget === `roster-config-row-${staff.id}`
                          ? 'bg-[var(--toss-blue-light)]/50 ring-2 ring-[var(--accent)]/30'
                          : 'bg-[var(--muted)]'
                      }`}
                      data-testid={`roster-config-row-${staff.id}`}
                    >
                      <td className="rounded-l-[18px] px-3 py-3">
                        <input
                          type="checkbox"
                          checked={config.enabled}
                          onChange={(e) => updateConfig(staff, index, { enabled: e.target.checked })}
                          className="h-4 w-4 accent-[var(--accent)]"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-sm font-bold text-[var(--foreground)]">{staff.name}</p>
                        <p className="text-[11px] text-[var(--toss-gray-3)]">
                          {getDepartmentName(staff)} · {staff.position || '직원'}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={config.pattern}
                          onChange={(e) =>
                            updateConfig(staff, index, {
                              pattern: e.target.value,
                              nightShiftCount: isNightPattern(e.target.value)
                                ? inferDefaultNightShiftCount(e.target.value, monthDates.length)
                                : 0,
                            })
                          }
                          className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                        >
                          {availablePatternOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {config.pattern === CUSTOM_PATTERN_VALUE && config.customPatternSequence.length > 0 && (
                          <p className="mt-2 text-[11px] font-medium text-[var(--toss-gray-3)]">
                            순환: {config.customPatternSequence.map((token) => getPatternSequenceLabel(token, workShifts)).join(' → ')}
                          </p>
                        )}
                        {isWeeklyTemplatePattern(config.pattern) && config.weeklyTemplateWeeks.length > 0 && (
                          <p className="mt-2 text-[11px] font-medium text-[var(--toss-gray-3)]">
                            {config.weeklyTemplateWeeks
                              .map(
                                (week, weekIndex) =>
                                  `${getWeeklyTemplateWeekLabel(weekIndex)} ${formatWeekdaySummary(week.activeWeekdays)}`
                              )
                              .join(' / ')}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={config.primaryShiftId}
                          onChange={(e) => updateConfig(staff, index, { primaryShiftId: e.target.value })}
                          className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                        >
                          {workingShifts.map((shift) => (
                            <option key={shift.id} value={shift.id}>
                              {shift.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={config.secondaryShiftId}
                          onChange={(e) => updateConfig(staff, index, { secondaryShiftId: e.target.value })}
                          disabled={requiredShiftCount < 2}
                          className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:bg-[var(--tab-bg)]"
                        >
                          {workingShifts.map((shift) => (
                            <option key={shift.id} value={shift.id}>
                              {shift.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={config.tertiaryShiftId}
                          onChange={(e) => updateConfig(staff, index, { tertiaryShiftId: e.target.value })}
                          disabled={requiredShiftCount < 3}
                          className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:bg-[var(--tab-bg)]"
                        >
                          {workingShifts.map((shift) => (
                            <option key={shift.id} value={shift.id}>
                              {shift.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min={0}
                          value={config.startOffset}
                          onChange={(e) => updateConfig(staff, index, { startOffset: Number(e.target.value) || 0 })}
                          disabled={isWeeklyTemplatePattern(config.pattern)}
                          className="w-24 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:bg-[var(--tab-bg)]"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min={0}
                          max={monthDates.length}
                          value={config.nightShiftCount}
                          disabled={!isNightPattern(config.pattern)}
                          onChange={(e) =>
                            updateConfig(staff, index, {
                              nightShiftCount: clampNightShiftCount(Number(e.target.value) || 0, monthDates.length),
                            })
                          }
                          className="w-24 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:bg-[var(--tab-bg)]"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min={0}
                          max={monthDates.length}
                          value={config.minNightShiftCount}
                          onChange={(e) =>
                            updateConfig(staff, index, {
                              minNightShiftCount: clampNightShiftCount(Number(e.target.value) || 0, monthDates.length),
                            })
                          }
                          className="w-24 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                          data-testid={`staff-night-min-${staff.id}`}
                        />
                        <p className="mt-1 text-[10px] font-medium text-[var(--toss-gray-3)]">0이면 개인 최소 미적용</p>
                      </td>
                      <td className="rounded-r-[18px] px-3 py-3">
                        <input
                          type="number"
                          min={0}
                          max={monthDates.length}
                          value={config.maxNightShiftCount}
                          onChange={(e) =>
                            updateConfig(staff, index, {
                              maxNightShiftCount: clampNightShiftCount(Number(e.target.value) || 0, monthDates.length),
                            })
                          }
                          className="w-24 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                          data-testid={`staff-night-max-${staff.id}`}
                        />
                        <p className="mt-1 text-[10px] font-medium text-[var(--toss-gray-3)]">0이면 개인 최대 미적용</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h4 className="text-base font-bold text-[var(--foreground)]">월간 미리보기</h4>
            <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
              셀을 직접 눌러 D / E / N / OFF를 임의 수정할 수 있습니다. 저장하면 근태 쪽 `shift_assignments`에 바로 반영됩니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setManualEditMode((prev) => !prev)}
              className={`rounded-[var(--radius-md)] px-3 py-1 text-[11px] font-bold ${manualEditMode ? 'bg-orange-500/20 text-orange-700' : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'}`}
            >
              {manualEditMode ? '수동 수정 중' : '수동 수정'}
            </button>
            <button
              type="button"
              onClick={() => setManualAssignments({})}
              disabled={summary.manualCount === 0}
              className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-1 text-[11px] font-bold text-[var(--toss-gray-4)] disabled:opacity-40"
            >
              수정 초기화
            </button>
            <span className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-bold text-[var(--accent)]">
              {previewRows.length}명 표시 · 수동 수정 {summary.manualCount}건
            </span>
          </div>
        </div>

        <p className="mt-3 text-[11px] text-[var(--toss-gray-3)]">
          수동 수정 모드에서는 셀을 클릭할 때 근무유형이 순환 변경됩니다. 생성 결과로 되돌리려면 같은 셀을 다시 순환하거나 `수정 초기화`를 사용하세요.
        </p>

        {previewRows.length === 0 ? (
          <div className="mt-4 rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
            생성 마법사로 팀과 직원을 선택하면 여기에서 월간 근무표를 확인할 수 있습니다.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="border-collapse" style={{ minWidth: `${260 + monthDates.length * 50}px` }}>
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 min-w-[260px] border-b border-[var(--border)] bg-[var(--card)] px-4 py-3 text-left text-[11px] font-bold text-[var(--toss-gray-3)]">
                    직원
                  </th>
                  {monthDates.map((date) => {
                    const day = Number(date.slice(-2));
                    const weekday = WEEKDAY_LABELS[new Date(`${date}T00:00:00`).getDay()];
                    return (
                      <th
                        key={date}
                        className="min-w-[50px] border-b border-[var(--border)] bg-[var(--card)] px-2 py-3 text-center text-[10px] font-bold text-[var(--toss-gray-3)]"
                      >
                        <div>{day}</div>
                        <div className="mt-1 text-[9px]">{weekday}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr key={row.staff.id} className="border-b border-[var(--border)] last:border-b-0">
                    <td className="sticky left-0 z-10 bg-[var(--card)] px-4 py-3">
                      <p className="text-sm font-bold text-[var(--foreground)]">{row.staff.name}</p>
                      <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                        {row.config.pattern} · {getDepartmentName(row.staff)}
                      </p>
                      <p className="mt-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">
                        근무 {row.counts.work} · OFF {row.counts.off} · N {row.counts.night}
                      </p>
                    </td>
                    {row.cells.map((cell) => (
                      <td key={cell.date} className="px-1 py-2 text-center">
                        <button
                          type="button"
                          disabled={!manualEditMode}
                          onClick={() => handleManualCellClick({
                            staffId: String(row.staff.id),
                            date: cell.date,
                            currentShiftId: cell.shiftId,
                            baseShiftId: cell.baseShiftId,
                          })}
                          className={`inline-flex h-8 min-w-[40px] items-center justify-center rounded-[var(--radius-md)] border px-1 text-[11px] font-black transition-all ${cell.badgeClass} ${manualEditMode ? 'cursor-pointer hover:scale-105' : 'cursor-default'} ${cell.isManual ? 'ring-2 ring-[var(--accent)] ring-offset-1' : ''}`}
                          title={`${row.staff.name} ${cell.date} ${cell.shiftName}${manualEditMode ? ' · 클릭하여 변경' : ''}`}
                        >
                          {cell.code}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>

      {renderRosterWizardModal()}
    </>
  );
}
