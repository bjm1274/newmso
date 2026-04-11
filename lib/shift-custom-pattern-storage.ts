import {
  loadRosterPolicyStorageRecords,
  type RosterPolicyStorageRecord,
  upsertRosterPolicyStorageRecord,
} from '@/lib/roster-policy-storage';

export type CustomPatternStore = Record<string, string[]>;

export type ShiftCustomPatternStorageRecord = {
  scopeKey: string;
  companyName: string;
  companyId?: string | null;
  patterns: string[];
  createdAt?: string | null;
  updatedAt?: string | null;
};

const GLOBAL_SCOPE_KEY = '전체';

function normalizePatternList(patterns: unknown) {
  if (!Array.isArray(patterns)) return [];

  return Array.from(
    new Set(
      patterns
        .map((pattern) => String(pattern || '').trim())
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right, 'ko'));
}

export function normalizeCustomPatternStore(store: unknown): CustomPatternStore {
  if (!store || typeof store !== 'object') return {};

  return Object.entries(store as Record<string, unknown>).reduce<CustomPatternStore>(
    (accumulator, [scopeKey, patterns]) => {
      const normalizedScopeKey = String(scopeKey || '').trim();
      if (!normalizedScopeKey) return accumulator;
      accumulator[normalizedScopeKey] = normalizePatternList(patterns);
      return accumulator;
    },
    {}
  );
}

export function mergeCustomPatternStores(...stores: CustomPatternStore[]) {
  return stores.reduce<CustomPatternStore>((accumulator, store) => {
    Object.entries(normalizeCustomPatternStore(store)).forEach(([scopeKey, patterns]) => {
      accumulator[scopeKey] = normalizePatternList([
        ...(accumulator[scopeKey] || []),
        ...patterns,
      ]);
    });
    return accumulator;
  }, {});
}

function buildShiftCustomPatternPolicyId(scopeKey: string) {
  return `shift-custom-pattern:${encodeURIComponent(scopeKey || GLOBAL_SCOPE_KEY)}`;
}

function normalizeShiftCustomPatternStorageRecord(
  record: RosterPolicyStorageRecord
): ShiftCustomPatternStorageRecord | null {
  if (record.policyType !== 'shift_custom_pattern') return null;

  const payload = record.payload || {};
  const scopeKey = String(payload.scopeKey || record.companyName || GLOBAL_SCOPE_KEY).trim() || GLOBAL_SCOPE_KEY;
  const patterns = normalizePatternList(payload.patterns);

  if (patterns.length === 0) return null;

  return {
    scopeKey,
    companyName: String(payload.companyName || record.companyName || scopeKey).trim() || scopeKey,
    companyId: String(payload.companyId || record.companyId || '').trim() || null,
    patterns,
    createdAt: record.createdAt || null,
    updatedAt: String(payload.updatedAt || record.updatedAt || '').trim() || null,
  };
}

export function buildCustomPatternStoreFromRecords(records: ShiftCustomPatternStorageRecord[]) {
  return records.reduce<CustomPatternStore>((accumulator, record) => {
    const scopeKey = String(record.scopeKey || GLOBAL_SCOPE_KEY).trim() || GLOBAL_SCOPE_KEY;
    accumulator[scopeKey] = normalizePatternList([
      ...(accumulator[scopeKey] || []),
      ...(record.patterns || []),
    ]);
    return accumulator;
  }, {});
}

export async function loadShiftCustomPatternStorageRecords() {
  const result = await loadRosterPolicyStorageRecords('shift_custom_pattern');

  return {
    storageAvailable: result.storageAvailable,
    records: result.records
      .map((record) => normalizeShiftCustomPatternStorageRecord(record))
      .filter((record): record is ShiftCustomPatternStorageRecord => record !== null),
  };
}

export async function upsertShiftCustomPatternStorageRecord(record: ShiftCustomPatternStorageRecord) {
  const scopeKey = String(record.scopeKey || GLOBAL_SCOPE_KEY).trim() || GLOBAL_SCOPE_KEY;
  const companyName = String(record.companyName || scopeKey || GLOBAL_SCOPE_KEY).trim() || GLOBAL_SCOPE_KEY;
  const patterns = normalizePatternList(record.patterns);

  return upsertRosterPolicyStorageRecord({
    policyType: 'shift_custom_pattern',
    policyId: buildShiftCustomPatternPolicyId(scopeKey),
    companyId: record.companyId ?? null,
    companyName,
    name: `${scopeKey} custom shift patterns`,
    payload: {
      scopeKey,
      companyId: record.companyId ?? null,
      companyName,
      patterns,
      updatedAt: record.updatedAt ?? new Date().toISOString(),
    },
    updatedAt: record.updatedAt ?? new Date().toISOString(),
  });
}
