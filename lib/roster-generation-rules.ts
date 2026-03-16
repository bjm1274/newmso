export const ROSTER_GENERATION_RULE_STORAGE_KEY = 'erp_roster_generation_rules_v1';

export type RosterGenerationRule = {
  id: string;
  name: string;
  companyName?: string;
  teamKeywords: string[];
  description: string;
  avoidDayAfterNight: boolean;
  avoidDayAfterEvening: boolean;
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
  minDayStaff: number;
  minEveningStaff: number;
  minNightStaff: number;
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
    teamKeywords: [...rule.teamKeywords],
    maxConsecutiveEveningShifts: clampInteger(rule.maxConsecutiveEveningShifts, 0, 7, 0),
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
  };
}

export function buildDefaultGenerationRule(companyName = ''): RosterGenerationRule {
  const stamp = Date.now();

  return {
    id: `roster-rule-${stamp}`,
    name: '',
    companyName,
    teamKeywords: [],
    description: '',
    avoidDayAfterNight: true,
    avoidDayAfterEvening: false,
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
    distributeWeekendShifts: true,
    distributeHolidayShifts: false,
    separateNewNursesByShift: false,
    minDayStaff: 0,
    minEveningStaff: 0,
    minNightStaff: 0,
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
    teamKeywords: normalizeKeywordList(source.teamKeywords),
    description: String(source.description || '').trim(),
    avoidDayAfterNight: source.avoidDayAfterNight !== false,
    avoidDayAfterEvening: source.avoidDayAfterEvening === true,
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
    minDayStaff: clampInteger(source.minDayStaff, 0, 20, 0),
    minEveningStaff: clampInteger(source.minEveningStaff, 0, 20, 0),
    minNightStaff: clampInteger(source.minNightStaff, 0, 20, 0),
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
