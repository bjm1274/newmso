import { supabase } from './supabase';

export const LEAVE_POLICY_SETTINGS_KEY = 'leave_policy_rules_v1';

export type LeavePolicySettings = {
  respectPublicHolidays: boolean;
  respectSubstituteHolidays: boolean;
  grantCompDayForHolidayWork: boolean;
  lateAnomalyMinutes: number;
  earlyLeaveAnomalyMinutes: number;
  missingCheckoutGraceHours: number;
};

type LeavePolicyStore = {
  version: 1;
  companies: Record<string, LeavePolicySettings>;
};

export const DEFAULT_LEAVE_POLICY_SETTINGS: LeavePolicySettings = {
  respectPublicHolidays: true,
  respectSubstituteHolidays: true,
  grantCompDayForHolidayWork: false,
  lateAnomalyMinutes: 30,
  earlyLeaveAnomalyMinutes: 30,
  missingCheckoutGraceHours: 8,
};

function getDefaultStore(): LeavePolicyStore {
  return {
    version: 1,
    companies: {
      전체: { ...DEFAULT_LEAVE_POLICY_SETTINGS },
    },
  };
}

function sanitizeSettings(raw: unknown): LeavePolicySettings {
  const source = (raw ?? {}) as Partial<LeavePolicySettings>;
  return {
    respectPublicHolidays: source.respectPublicHolidays ?? DEFAULT_LEAVE_POLICY_SETTINGS.respectPublicHolidays,
    respectSubstituteHolidays:
      source.respectSubstituteHolidays ?? DEFAULT_LEAVE_POLICY_SETTINGS.respectSubstituteHolidays,
    grantCompDayForHolidayWork:
      source.grantCompDayForHolidayWork ?? DEFAULT_LEAVE_POLICY_SETTINGS.grantCompDayForHolidayWork,
    lateAnomalyMinutes: Math.max(
      5,
      Number(source.lateAnomalyMinutes ?? DEFAULT_LEAVE_POLICY_SETTINGS.lateAnomalyMinutes) || 30
    ),
    earlyLeaveAnomalyMinutes: Math.max(
      5,
      Number(source.earlyLeaveAnomalyMinutes ?? DEFAULT_LEAVE_POLICY_SETTINGS.earlyLeaveAnomalyMinutes) || 30
    ),
    missingCheckoutGraceHours: Math.max(
      1,
      Number(source.missingCheckoutGraceHours ?? DEFAULT_LEAVE_POLICY_SETTINGS.missingCheckoutGraceHours) || 8
    ),
  };
}

function sanitizeStore(raw: unknown): LeavePolicyStore {
  const base = getDefaultStore();
  const parsed = (raw ?? {}) as Partial<LeavePolicyStore>;
  const companies = Object.entries(parsed.companies || {}).reduce<Record<string, LeavePolicySettings>>((acc, [key, value]) => {
    acc[key] = sanitizeSettings(value);
    return acc;
  }, {});

  return {
    version: 1,
    companies: {
      ...base.companies,
      ...companies,
    },
  };
}

function readLocalFallbackStore(): LeavePolicyStore {
  if (typeof window === 'undefined') {
    return getDefaultStore();
  }

  try {
    const raw = window.localStorage.getItem(LEAVE_POLICY_SETTINGS_KEY);
    if (!raw) return getDefaultStore();
    return sanitizeStore(JSON.parse(raw));
  } catch {
    return getDefaultStore();
  }
}

function writeLocalFallbackStore(store: LeavePolicyStore) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LEAVE_POLICY_SETTINGS_KEY, JSON.stringify(store));
  } catch {
    // ignore local fallback write errors
  }
}

export async function loadLeavePolicyStore(): Promise<LeavePolicyStore> {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', LEAVE_POLICY_SETTINGS_KEY)
      .maybeSingle();

    if (error) throw error;

    const store = sanitizeStore(data?.value);
    writeLocalFallbackStore(store);
    return store;
  } catch {
    return readLocalFallbackStore();
  }
}

export async function loadLeavePolicySettings(selectedCompany = '전체'): Promise<LeavePolicySettings> {
  const store = await loadLeavePolicyStore();
  return sanitizeSettings(store.companies[selectedCompany] || store.companies.전체 || DEFAULT_LEAVE_POLICY_SETTINGS);
}

export async function saveLeavePolicySettings(selectedCompany: string, settings: LeavePolicySettings) {
  const current = await loadLeavePolicyStore();
  const nextStore: LeavePolicyStore = {
    version: 1,
    companies: {
      ...current.companies,
      [selectedCompany || '전체']: sanitizeSettings(settings),
    },
  };

  const payload = {
    key: LEAVE_POLICY_SETTINGS_KEY,
    value: nextStore,
    description: '휴일/대체휴무 및 근태 이상 탐지 규칙 설정',
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('system_settings').upsert(payload, { onConflict: 'key' });
  if (error) throw error;

  writeLocalFallbackStore(nextStore);
  return nextStore;
}
