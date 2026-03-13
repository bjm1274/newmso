export const ROSTER_GENERATION_RULE_STORAGE_KEY = 'erp_roster_generation_rules_v1';

export type RosterGenerationRule = {
  id: string;
  name: string;
  companyName?: string;
  teamKeywords: string[];
  description: string;
  avoidDayAfterNight: boolean;
  offDaysAfterNight: number;
  nightBlockSize: number;
  rotationNightCount: number;
  maxConsecutiveWorkDays: number;
  fixedShiftOnly: boolean;
  balanceRotationBands: boolean;
  distributeWeekendShifts: boolean;
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
  return {
    ...rule,
    teamKeywords: [...rule.teamKeywords],
    offDaysAfterNight: clampInteger(rule.offDaysAfterNight, 0, 3, 1),
    nightBlockSize: clampInteger(rule.nightBlockSize, 1, 3, 2),
    rotationNightCount: clampInteger(rule.rotationNightCount, 0, 31, 6),
    maxConsecutiveWorkDays: clampInteger(rule.maxConsecutiveWorkDays, 2, 7, 5),
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
    offDaysAfterNight: 1,
    nightBlockSize: 2,
    rotationNightCount: 6,
    maxConsecutiveWorkDays: 5,
    fixedShiftOnly: true,
    balanceRotationBands: true,
    distributeWeekendShifts: true,
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

  return normalizeRule({
    id,
    name,
    companyName: String(source.companyName || '').trim(),
    teamKeywords: normalizeKeywordList(source.teamKeywords),
    description: String(source.description || '').trim(),
    avoidDayAfterNight: source.avoidDayAfterNight !== false,
    offDaysAfterNight: clampInteger(source.offDaysAfterNight, 0, 3, 1),
    nightBlockSize: clampInteger(source.nightBlockSize, 1, 3, 2),
    rotationNightCount: clampInteger(source.rotationNightCount, 0, 31, 6),
    maxConsecutiveWorkDays: clampInteger(source.maxConsecutiveWorkDays, 2, 7, 5),
    fixedShiftOnly: source.fixedShiftOnly !== false,
    balanceRotationBands: source.balanceRotationBands !== false,
    distributeWeekendShifts: source.distributeWeekendShifts !== false,
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
