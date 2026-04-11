import {
  buildDefaultGenerationRule,
  type RosterGenerationRule,
} from '@/lib/roster-generation-rules';
import {
  buildDefaultPatternProfile,
  type RosterPatternProfile,
} from '@/lib/roster-pattern-profiles';

type HospitalThreeShiftShiftIds = {
  day: string;
  evening: string;
  night: string;
};

type HospitalThreeShiftDraftOptions = {
  companyName: string;
  companyId?: string | null;
  unitName: string;
  shiftIds: HospitalThreeShiftShiftIds;
};

function normalizeKeywordList(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );
}

function buildScopedToken(companyName: string, unitName: string) {
  const normalized = `${companyName}-${unitName}`
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');

  return encodeURIComponent(normalized || 'hospital-three-shift').replace(/%/g, '');
}

function buildTeamKeywords(unitName: string) {
  const normalizedUnitName = String(unitName || '').trim();
  return normalizeKeywordList([
    normalizedUnitName,
    normalizedUnitName.endsWith('팀') ? '' : `${normalizedUnitName}팀`,
    normalizedUnitName.endsWith('병동') ? '' : `${normalizedUnitName}병동`,
  ]);
}

export function buildHospitalThreeShiftPatternProfileDraft({
  companyName,
  companyId = null,
  unitName,
  shiftIds,
}: HospitalThreeShiftDraftOptions): RosterPatternProfile {
  const token = buildScopedToken(companyName, unitName);
  const draft = buildDefaultPatternProfile(companyName, companyId);

  return {
    ...draft,
    id: `hospital-pattern-${token}`,
    name: `${unitName} 기본 패턴`,
    companyName,
    companyId,
    teamKeywords: buildTeamKeywords(unitName),
    description: `${unitName} D/E/N 기본 패턴 초안`,
    staffGroups: [
      {
        id: `hospital-pattern-${token}-day`,
        label: '데이전담',
        mode: 'day_fixed',
        matchKeywords: ['데이전담', 'D전담', 'day'],
        shiftIds: [shiftIds.day],
        note: `${unitName} D 고정 근무`,
      },
      {
        id: `hospital-pattern-${token}-evening`,
        label: '이브전담',
        mode: 'evening_fixed',
        matchKeywords: ['이브전담', 'E전담', 'evening'],
        shiftIds: [shiftIds.evening],
        note: `${unitName} E 고정 근무`,
      },
      {
        id: `hospital-pattern-${token}-night`,
        label: '나이트전담',
        mode: 'night_fixed',
        matchKeywords: ['나이트전담', 'N전담', 'night'],
        shiftIds: [shiftIds.night],
        note: `${unitName} N 고정 근무`,
      },
      {
        id: `hospital-pattern-${token}-rotation`,
        label: '순환3교대',
        mode: 'rotation',
        matchKeywords: ['3교대', '순환', 'rotation'],
        shiftIds: [shiftIds.day, shiftIds.evening, shiftIds.night],
        note: `${unitName} D/E/N 순환 근무`,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function buildHospitalThreeShiftGenerationRuleDraft({
  companyName,
  companyId = null,
  unitName,
}: Omit<HospitalThreeShiftDraftOptions, 'shiftIds'>): RosterGenerationRule {
  const token = buildScopedToken(companyName, unitName);
  const draft = buildDefaultGenerationRule(companyName, companyId);

  return {
    ...draft,
    id: `hospital-rule-${token}`,
    name: `${unitName} 기본 안전규칙`,
    companyName,
    companyId,
    teamKeywords: buildTeamKeywords(unitName),
    description: `${unitName} 병동 기본 D/E/N 최소 인원 및 안전 규칙 초안`,
    minDayStaff: 1,
    minEveningStaff: 1,
    minNightStaff: 1,
    updatedAt: new Date().toISOString(),
  };
}
