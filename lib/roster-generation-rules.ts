export const ROSTER_GENERATION_RULE_STORAGE_KEY = 'erp_roster_generation_rules_v1';

export type RosterRoleCoverageRule = {
  id: string;
  label: string;
  keywords: string[];
  minDayStaff: number;
  minEveningStaff: number;
  minNightStaff: number;
};

export type RosterDateCoverageOverride = {
  id: string;
  date: string;
  minDayStaff: number;
  minEveningStaff: number;
  minNightStaff: number;
};

export type RosterGenerationStyle = 'balanced' | 'block' | 'variety' | 'stable';

export type RosterGenerationRule = {
  id: string;
  name: string;
  companyName?: string;
  companyId?: string | null;
  teamKeywords: string[];
  description: string;
  generationStyle: RosterGenerationStyle;
  avoidDayAfterNight: boolean;
  avoidDayAfterEvening: boolean;
  avoidEveningAfterNight: boolean;
  maxConsecutiveEveningShifts: number;
  offDaysAfterNight: number;
  nightBlockSize: number;
  minRotationNightCount: number;
  maxRotationNightCount: number;
  minMonthlyOffDays: number;
  maxConsecutiveWorkDays: number;
  maxConsecutiveWeekendWorkDays: number;
  fixedShiftOnly: boolean;
  balanceRotationBands: boolean;
  distributeWeekendShifts: boolean;
  distributeHolidayShifts: boolean;
  separateNewNursesByShift: boolean;
  blockNewNurseSoloNight: boolean;
  requireSeniorWithNewNurseNight: boolean;
  minDayStaff: number;
  minEveningStaff: number;
  minNightStaff: number;
  weekendMinDayStaff: number;
  weekendMinEveningStaff: number;
  weekendMinNightStaff: number;
  holidayMinDayStaff: number;
  holidayMinEveningStaff: number;
  holidayMinNightStaff: number;
  minSeniorDayStaff: number;
  minSeniorEveningStaff: number;
  minSeniorNightStaff: number;
  minDedicatedDayStaff: number;
  minDedicatedEveningStaff: number;
  minDedicatedNightStaff: number;
  roleCoverageRules: RosterRoleCoverageRule[];
  dateCoverageOverrides: RosterDateCoverageOverride[];
  updatedAt: string;
};

let rosterGenerationRuleCache: RosterGenerationRule[] = [];

function normalizeKeywordList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }

  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeRoleCoverageRules(
  value: unknown,
  fallbackPrefix = 'role-rule'
): RosterRoleCoverageRule[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object') return null;
      const source = entry as Record<string, unknown>;
      const label = String(source.label || '').trim();
      const keywords = normalizeKeywordList(source.keywords);
      const minDayStaff = clampInteger(source.minDayStaff, 0, 20, 0);
      const minEveningStaff = clampInteger(source.minEveningStaff, 0, 20, 0);
      const minNightStaff = clampInteger(source.minNightStaff, 0, 20, 0);
      if (!label && keywords.length === 0) return null;
      if (minDayStaff <= 0 && minEveningStaff <= 0 && minNightStaff <= 0) return null;

      return {
        id: String(source.id || `${fallbackPrefix}-${index + 1}`),
        label: label || `역할 슬롯 ${index + 1}`,
        keywords,
        minDayStaff,
        minEveningStaff,
        minNightStaff,
      } satisfies RosterRoleCoverageRule;
    })
    .filter((rule): rule is RosterRoleCoverageRule => Boolean(rule));
}

function normalizeDateCoverageOverrides(
  value: unknown,
  fallbackPrefix = 'date-rule'
): RosterDateCoverageOverride[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object') return null;
      const source = entry as Record<string, unknown>;
      const date = String(source.date || '').trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

      const minDayStaff = clampInteger(source.minDayStaff, 0, 20, 0);
      const minEveningStaff = clampInteger(source.minEveningStaff, 0, 20, 0);
      const minNightStaff = clampInteger(source.minNightStaff, 0, 20, 0);
      if (minDayStaff <= 0 && minEveningStaff <= 0 && minNightStaff <= 0) {
        return null;
      }

      return {
        id: String(source.id || `${fallbackPrefix}-${index + 1}`),
        date,
        minDayStaff,
        minEveningStaff,
        minNightStaff,
      } satisfies RosterDateCoverageOverride;
    })
    .filter((entry): entry is RosterDateCoverageOverride => Boolean(entry))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function normalizeRule(rule: RosterGenerationRule): RosterGenerationRule {
  const minRotationNightCount = clampInteger(rule.minRotationNightCount, 0, 31, 4);
  const maxRotationNightCount = clampInteger(
    rule.maxRotationNightCount,
    minRotationNightCount,
    31,
    Math.max(minRotationNightCount, 6)
  );
  return {
    ...rule,
    generationStyle:
      rule.generationStyle === 'block' ||
      rule.generationStyle === 'variety' ||
      rule.generationStyle === 'stable'
        ? rule.generationStyle
        : 'balanced',
    teamKeywords: [...rule.teamKeywords],
    roleCoverageRules: normalizeRoleCoverageRules(
      rule.roleCoverageRules,
      `${String(rule.id || 'role-rule')}-slot`
    ),
    dateCoverageOverrides: normalizeDateCoverageOverrides(
      rule.dateCoverageOverrides,
      `${String(rule.id || 'date-rule')}-override`
    ),
    maxConsecutiveEveningShifts: clampInteger(rule.maxConsecutiveEveningShifts, 0, 7, 0),
    avoidEveningAfterNight: rule.avoidEveningAfterNight === true,
    offDaysAfterNight: clampInteger(rule.offDaysAfterNight, 0, 5, 1),
    nightBlockSize: clampInteger(rule.nightBlockSize, 1, 5, 2),
    minRotationNightCount,
    maxRotationNightCount,
    minMonthlyOffDays: clampInteger(rule.minMonthlyOffDays, 7, 31, 7),
    maxConsecutiveWorkDays: clampInteger(rule.maxConsecutiveWorkDays, 2, 7, 5),
    maxConsecutiveWeekendWorkDays: clampInteger(rule.maxConsecutiveWeekendWorkDays, 0, 4, 0),
    minDayStaff: clampInteger(rule.minDayStaff, 0, 20, 0),
    minEveningStaff: clampInteger(rule.minEveningStaff, 0, 20, 0),
    minNightStaff: clampInteger(rule.minNightStaff, 0, 20, 0),
    weekendMinDayStaff: clampInteger(rule.weekendMinDayStaff, 0, 20, 0),
    weekendMinEveningStaff: clampInteger(rule.weekendMinEveningStaff, 0, 20, 0),
    weekendMinNightStaff: clampInteger(rule.weekendMinNightStaff, 0, 20, 0),
    holidayMinDayStaff: clampInteger(rule.holidayMinDayStaff, 0, 20, 0),
    holidayMinEveningStaff: clampInteger(rule.holidayMinEveningStaff, 0, 20, 0),
    holidayMinNightStaff: clampInteger(rule.holidayMinNightStaff, 0, 20, 0),
    minSeniorDayStaff: clampInteger(rule.minSeniorDayStaff, 0, 20, 0),
    minSeniorEveningStaff: clampInteger(rule.minSeniorEveningStaff, 0, 20, 0),
    minSeniorNightStaff: clampInteger(rule.minSeniorNightStaff, 0, 20, 0),
    minDedicatedDayStaff: clampInteger(rule.minDedicatedDayStaff, 0, 20, 0),
    minDedicatedEveningStaff: clampInteger(rule.minDedicatedEveningStaff, 0, 20, 0),
    minDedicatedNightStaff: clampInteger(rule.minDedicatedNightStaff, 0, 20, 0),
  };
}

export function buildDefaultGenerationRule(companyName = '', companyId: string | null = null): RosterGenerationRule {
  const stamp = Date.now();

  return {
    id: `roster-rule-${stamp}`,
    name: '',
    companyName,
    companyId,
    teamKeywords: [],
    description: '',
    generationStyle: 'balanced',
    avoidDayAfterNight: true,
    avoidDayAfterEvening: false,
    avoidEveningAfterNight: false,
    maxConsecutiveEveningShifts: 0,
    offDaysAfterNight: 1,
    nightBlockSize: 2,
    minRotationNightCount: 4,
    maxRotationNightCount: 6,
    minMonthlyOffDays: 7,
    maxConsecutiveWorkDays: 5,
    maxConsecutiveWeekendWorkDays: 0,
    fixedShiftOnly: true,
    balanceRotationBands: true,
    distributeWeekendShifts: false,
    distributeHolidayShifts: false,
    separateNewNursesByShift: true,
    blockNewNurseSoloNight: true,
    requireSeniorWithNewNurseNight: true,
    minDayStaff: 0,
    minEveningStaff: 0,
    minNightStaff: 0,
    weekendMinDayStaff: 0,
    weekendMinEveningStaff: 0,
    weekendMinNightStaff: 0,
    holidayMinDayStaff: 0,
    holidayMinEveningStaff: 0,
    holidayMinNightStaff: 0,
    minSeniorDayStaff: 0,
    minSeniorEveningStaff: 0,
    minSeniorNightStaff: 0,
    minDedicatedDayStaff: 0,
    minDedicatedEveningStaff: 0,
    minDedicatedNightStaff: 0,
    roleCoverageRules: [],
    dateCoverageOverrides: [],
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeGenerationRule(record: unknown): RosterGenerationRule | null {
  if (!record || typeof record !== 'object') return null;

  const source = record as Record<string, unknown>;
  const id = String(source.id || '').trim();
  const name = String(source.name || '').trim();
  if (!id || !name) return null;
  const legacyRotationNightCount = clampInteger(source.rotationNightCount, 0, 31, 6);
  const minRotationNightCount = clampInteger(
    source.minRotationNightCount,
    0,
    31,
    legacyRotationNightCount
  );
  const maxRotationNightCount = clampInteger(
    source.maxRotationNightCount,
    minRotationNightCount,
    31,
    Math.max(minRotationNightCount, legacyRotationNightCount)
  );

  return normalizeRule({
    id,
    name,
    companyName: String(source.companyName || '').trim(),
    companyId: String(source.companyId || '').trim() || null,
    teamKeywords: normalizeKeywordList(source.teamKeywords),
    description: String(source.description || '').trim(),
    generationStyle:
      source.generationStyle === 'block' ||
      source.generationStyle === 'variety' ||
      source.generationStyle === 'stable'
        ? source.generationStyle
        : 'balanced',
    avoidDayAfterNight: source.avoidDayAfterNight !== false,
    avoidDayAfterEvening: source.avoidDayAfterEvening === true,
    avoidEveningAfterNight: source.avoidEveningAfterNight === true,
    maxConsecutiveEveningShifts: clampInteger(source.maxConsecutiveEveningShifts, 0, 7, 0),
    offDaysAfterNight: clampInteger(source.offDaysAfterNight, 0, 5, 1),
    nightBlockSize: clampInteger(source.nightBlockSize, 1, 5, 2),
    minRotationNightCount,
    maxRotationNightCount,
    minMonthlyOffDays: clampInteger(source.minMonthlyOffDays, 7, 31, 7),
    maxConsecutiveWorkDays: clampInteger(source.maxConsecutiveWorkDays, 2, 7, 5),
    maxConsecutiveWeekendWorkDays: clampInteger(source.maxConsecutiveWeekendWorkDays, 0, 4, 0),
    fixedShiftOnly: source.fixedShiftOnly !== false,
    balanceRotationBands: source.balanceRotationBands !== false,
    distributeWeekendShifts: source.distributeWeekendShifts !== false,
    distributeHolidayShifts: source.distributeHolidayShifts === true,
    separateNewNursesByShift: source.separateNewNursesByShift === true,
    blockNewNurseSoloNight: source.blockNewNurseSoloNight !== false,
    requireSeniorWithNewNurseNight: source.requireSeniorWithNewNurseNight !== false,
    minDayStaff: clampInteger(source.minDayStaff, 0, 20, 0),
    minEveningStaff: clampInteger(source.minEveningStaff, 0, 20, 0),
    minNightStaff: clampInteger(source.minNightStaff, 0, 20, 0),
    weekendMinDayStaff: clampInteger(source.weekendMinDayStaff, 0, 20, 0),
    weekendMinEveningStaff: clampInteger(source.weekendMinEveningStaff, 0, 20, 0),
    weekendMinNightStaff: clampInteger(source.weekendMinNightStaff, 0, 20, 0),
    holidayMinDayStaff: clampInteger(source.holidayMinDayStaff, 0, 20, 0),
    holidayMinEveningStaff: clampInteger(source.holidayMinEveningStaff, 0, 20, 0),
    holidayMinNightStaff: clampInteger(source.holidayMinNightStaff, 0, 20, 0),
    minSeniorDayStaff: clampInteger(source.minSeniorDayStaff, 0, 20, 0),
    minSeniorEveningStaff: clampInteger(source.minSeniorEveningStaff, 0, 20, 0),
    minSeniorNightStaff: clampInteger(source.minSeniorNightStaff, 0, 20, 0),
    minDedicatedDayStaff: clampInteger(source.minDedicatedDayStaff, 0, 20, 0),
    minDedicatedEveningStaff: clampInteger(source.minDedicatedEveningStaff, 0, 20, 0),
    minDedicatedNightStaff: clampInteger(source.minDedicatedNightStaff, 0, 20, 0),
    roleCoverageRules: normalizeRoleCoverageRules(
      source.roleCoverageRules,
      `${id || 'role-rule'}-slot`
    ),
    dateCoverageOverrides: normalizeDateCoverageOverrides(
      source.dateCoverageOverrides,
      `${id || 'date-rule'}-override`
    ),
    updatedAt: String(source.updatedAt || new Date().toISOString()),
  });
}

export function readCachedGenerationRules() {
  return rosterGenerationRuleCache.map((rule) => normalizeRule(rule));
}

export function writeCachedGenerationRules(rules: RosterGenerationRule[]) {
  rosterGenerationRuleCache = rules.map((rule) => normalizeRule(rule));
}

function normalizeRuleText(value: string) {
  return String(value || '').replace(/\s+/g, '').toLowerCase();
}

export function matchGenerationRuleForDepartment(
  rule: RosterGenerationRule,
  department: string,
  companyName?: string
) {
  if (companyName && rule.companyName && rule.companyName !== companyName) {
    return false;
  }

  if (!department || rule.teamKeywords.length === 0) return false;
  const normalizedDepartment = normalizeRuleText(department);

  return rule.teamKeywords.some((keyword) =>
    normalizedDepartment.includes(normalizeRuleText(keyword))
  );
}
