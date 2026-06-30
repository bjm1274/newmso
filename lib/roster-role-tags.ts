import type { RosterRoleCoverageRule } from '@/lib/roster-generation-rules';

export type RosterRoleTagOption = {
  value: string;
  label: string;
  aliases?: string[];
};

export const DEFAULT_ROSTER_ROLE_TAG_OPTIONS: RosterRoleTagOption[] = [
  { value: '격리', label: '격리', aliases: ['isolation'] },
  { value: '책임', label: '책임', aliases: ['charge'] },
  { value: '프리셉터', label: '프리셉터', aliases: ['preceptor'] },
  { value: '신규교육', label: '신규교육', aliases: ['orientation'] },
  { value: '중환자', label: '중환자', aliases: ['icu'] },
  { value: '처치', label: '처치', aliases: ['procedure'] },
  { value: '응급', label: '응급', aliases: ['er', 'emergency'] },
  { value: '수술', label: '수술', aliases: ['or', 'surgery'] },
  { value: '투석', label: '투석', aliases: ['dialysis'] },
  { value: '감염', label: '감염', aliases: ['infection'] },
];

function normalizeRoleTagToken(value: string) {
  return String(value || '').trim().toLowerCase();
}

function uniqueByNormalizedValue(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = normalizeRoleTagToken(value);
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

export function normalizeCoverageRoleTags(value: unknown) {
  if (Array.isArray(value)) {
    return uniqueByNormalizedValue(value.map((item) => String(item || '').trim()).filter(Boolean));
  }

  return uniqueByNormalizedValue(
    String(value || '')
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

export function serializeCoverageRoleTags(value: unknown) {
  return normalizeCoverageRoleTags(value).join(', ');
}

export function toggleCoverageRoleTag(value: unknown, tag: string) {
  const nextTags = normalizeCoverageRoleTags(value);
  const normalizedTag = normalizeRoleTagToken(tag);
  if (!normalizedTag) return nextTags;

  const existingIndex = nextTags.findIndex((entry) => normalizeRoleTagToken(entry) === normalizedTag);
  if (existingIndex >= 0) {
    return nextTags.filter((_, index) => index !== existingIndex);
  }
  return [...nextTags, tag];
}

export function expandCoverageRoleTags(value: unknown, options: RosterRoleTagOption[] = DEFAULT_ROSTER_ROLE_TAG_OPTIONS) {
  const tags = normalizeCoverageRoleTags(value);
  const optionMap = new Map(
    options.flatMap((option) =>
      [option.value, ...(option.aliases || [])].map((candidate) => [normalizeRoleTagToken(candidate), option])
    )
  );

  return uniqueByNormalizedValue(
    tags.flatMap((tag) => {
      const option = optionMap.get(normalizeRoleTagToken(tag));
      return option ? [option.value, ...(option.aliases || [])] : [tag];
    })
  );
}

export function mergeRosterRoleTagOptions(...groups: Array<Array<RosterRoleTagOption | string> | undefined>) {
  const merged: RosterRoleTagOption[] = [];
  const seen = new Set<string>();

  groups.forEach((group) => {
    (group || []).forEach((entry) => {
      const option =
        typeof entry === 'string'
          ? {
              value: entry,
              label: entry }
          : entry;
      const normalized = normalizeRoleTagToken(option.value);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      merged.push({
        value: option.value,
        label: option.label || option.value,
        aliases: uniqueByNormalizedValue(option.aliases || []) });
    });
  });

  return merged;
}

export function summarizeRoleCoverageRule(rule: Pick<
  RosterRoleCoverageRule,
  'label' | 'keywords' | 'minDayStaff' | 'minEveningStaff' | 'minNightStaff'
>) {
  const targets = [
    rule.minDayStaff > 0 ? `D${rule.minDayStaff}` : '',
    rule.minEveningStaff > 0 ? `E${rule.minEveningStaff}` : '',
    rule.minNightStaff > 0 ? `N${rule.minNightStaff}` : '',
  ].filter(Boolean);
  const keywords = normalizeCoverageRoleTags(rule.keywords).slice(0, 2);

  return [String(rule.label || '').trim(), targets.join('/'), keywords.length ? keywords.join(', ') : '']
    .filter(Boolean)
    .join(' · ');
}

export function summarizeRoleCoverageRules(roleRules: RosterRoleCoverageRule[], maxItems = 2) {
  const items = (roleRules || [])
    .filter(
      (roleRule) =>
        normalizeCoverageRoleTags(roleRule.keywords).length > 0 &&
        (Number(roleRule.minDayStaff || 0) > 0 ||
          Number(roleRule.minEveningStaff || 0) > 0 ||
          Number(roleRule.minNightStaff || 0) > 0)
    )
    .map((roleRule) => summarizeRoleCoverageRule(roleRule));

  if (items.length <= maxItems) return items;
  return [...items.slice(0, maxItems), `+${items.length - maxItems}개 더보기`];
}
