import {
normalizeGenerationRule,
ROSTER_GENERATION_RULE_STORAGE_KEY
} from '@/lib/roster-generation-rules';
import {
normalizePatternProfile,
ROSTER_PATTERN_PROFILE_STORAGE_KEY
} from '@/lib/roster-pattern-profiles';
import { summarizeRoleCoverageRules } from '@/lib/roster-role-tags';
import {
getGenerationStyleMeta,
normalizeShiftName,
} from './근무표자동편성-engine-utils';
import type {
RosterGenerationRule,RosterPatternProfile,
RosterWizardPreset,WorkShift
} from './근무표자동편성-types';

export function cloneGenerationRule(rule: RosterGenerationRule | null | undefined) {
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

export function buildGenerationRuleSummaryItems(rule: RosterGenerationRule) {
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
      `주말 D/E/N ${rule.weekendMinDayStaff}/${rule.weekendMinEveningStaff}/${rule.weekendMinNightStaff}`
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

export function resolvePresetShiftIds(
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

export function getPatternSequenceLabel(token: string, workShifts: WorkShift[]) {
  const OFF_SHIFT_TOKEN = 'OFF';
  if (token === OFF_SHIFT_TOKEN) return 'OFF';
  return workShifts.find((shift) => shift.id === token)?.name || '미지정';
}

export function loadStoredPatternProfiles() {
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

export function loadStoredGenerationRules() {
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
