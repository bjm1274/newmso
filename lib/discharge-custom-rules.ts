export type DischargeCustomRuleCategory =
  | 'missing'
  | 'overuse'
  | 'drg'
  | 'documentation'
  | 'quality';

export type DischargeCustomRuleSeverity = 'review' | 'warning' | 'critical';

export type DischargeCustomRuleMatchType =
  | 'contains_any'
  | 'contains_all'
  | 'missing_any'
  | 'drg_prefix';

export interface DischargeCustomRule {
  id: string;
  label: string;
  category: DischargeCustomRuleCategory;
  severity: DischargeCustomRuleSeverity;
  matchType: DischargeCustomRuleMatchType;
  keywords: string[];
  detail: string;
  basis: string;
  enabled: boolean;
}

const STORAGE_PREFIX = 'erp_discharge_custom_rules';

function getStorageKey(scope?: string) {
  const normalizedScope = String(scope || '').trim();
  return normalizedScope ? `${STORAGE_PREFIX}::${normalizedScope}` : STORAGE_PREFIX;
}

function uniqueStrings(values: unknown[]) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    next.push(normalized);
  }
  return next;
}

function normalizeCategory(value: unknown): DischargeCustomRuleCategory {
  const raw = String(value ?? '').trim();
  if (raw === 'missing' || raw === 'overuse' || raw === 'drg' || raw === 'documentation') {
    return raw;
  }
  return 'quality';
}

function normalizeSeverity(value: unknown): DischargeCustomRuleSeverity {
  const raw = String(value ?? '').trim();
  if (raw === 'warning' || raw === 'critical') return raw;
  return 'review';
}

function normalizeMatchType(value: unknown): DischargeCustomRuleMatchType {
  const raw = String(value ?? '').trim();
  if (raw === 'contains_all' || raw === 'missing_any' || raw === 'drg_prefix') {
    return raw;
  }
  return 'contains_any';
}

export function sanitizeDischargeCustomRule(raw: unknown): DischargeCustomRule | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<DischargeCustomRule>;
  const label = String(candidate.label ?? '').trim();
  const keywords = uniqueStrings(Array.isArray(candidate.keywords) ? candidate.keywords : []);
  const detail = String(candidate.detail ?? '').trim();
  if (!label || !keywords.length || !detail) return null;

  return {
    id: String(candidate.id ?? '').trim() || `discharge-custom-rule-${Date.now()}`,
    label,
    category: normalizeCategory(candidate.category),
    severity: normalizeSeverity(candidate.severity),
    matchType: normalizeMatchType(candidate.matchType),
    keywords,
    detail,
    basis: String(candidate.basis ?? '').trim() || '사용자 정의 규정',
    enabled: candidate.enabled !== false,
  };
}

export function sanitizeDischargeCustomRules(raw: unknown): DischargeCustomRule[] {
  if (!Array.isArray(raw)) return [];
  const next: DischargeCustomRule[] = [];
  const ids = new Set<string>();
  for (const item of raw) {
    const normalized = sanitizeDischargeCustomRule(item);
    if (!normalized) continue;
    if (ids.has(normalized.id)) {
      normalized.id = `${normalized.id}-${next.length + 1}`;
    }
    ids.add(normalized.id);
    next.push(normalized);
  }
  return next;
}

export function loadDischargeCustomRules(scope?: string) {
  if (typeof window === 'undefined') return [] as DischargeCustomRule[];
  try {
    const raw = window.localStorage.getItem(getStorageKey(scope));
    if (!raw) return [] as DischargeCustomRule[];
    return sanitizeDischargeCustomRules(JSON.parse(raw));
  } catch {
    return [] as DischargeCustomRule[];
  }
}

export function saveDischargeCustomRules(rules: DischargeCustomRule[], scope?: string) {
  if (typeof window === 'undefined') return;
  const payload = sanitizeDischargeCustomRules(rules);
  window.localStorage.setItem(getStorageKey(scope), JSON.stringify(payload));
  window.dispatchEvent(
    new CustomEvent('erp-discharge-custom-rules-updated', {
      detail: { scope: String(scope || '').trim() || 'global' },
    }),
  );
}
