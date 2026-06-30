import { sql } from 'drizzle-orm';
import { db } from './db-client';
import {
  getD1Binding,
  getD1Drizzle,
  system_settings as systemSettingsTable } from './db';

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
  missingCheckoutGraceHours: 8 };

function getDefaultStore(): LeavePolicyStore {
  return {
    version: 1,
    companies: {
      전체: { ...DEFAULT_LEAVE_POLICY_SETTINGS } } };
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
    ) };
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
      ...companies } };
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
    const { data, error } = await db.from('system_settings')
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
      [selectedCompany || '전체']: sanitizeSettings(settings) } };

  const payload = {
    key: LEAVE_POLICY_SETTINGS_KEY,
    value: nextStore,
    updated_at: new Date().toISOString() };

  // 클라이언트(브라우저)는 D1 binding 접근 불가 → compat db 경유
  if (typeof window !== 'undefined') {
    const { error } = await db.from('system_settings')
      .upsert(
        { key: payload.key, value: payload.value, updated_at: payload.updated_at },
        { onConflict: 'key' },
      );
    if (error) {
      throw new Error(`[leave-policy-settings] saveLeavePolicySettings (client): ${error.message}`);
    }
    writeLocalFallbackStore(nextStore);
    return nextStore;
  }

  // 서버: D1 직접 upsert — system_settings.key PK 충돌 시 value/updated_at 갱신
  const d1 = await getD1Binding();
  if (!d1) {
    throw new Error('[leave-policy-settings] D1 binding not available');
  }
  const drizzleDb = getD1Drizzle(d1);

  // value는 D1 스키마에서 text — jsonb → JSON.stringify
  await drizzleDb.insert(systemSettingsTable)
    .values({
      key: payload.key,
      value: JSON.stringify(payload.value),
      updated_at: payload.updated_at })
    .onConflictDoUpdate({
      target: systemSettingsTable.key,
      set: {
        value: sql`excluded.value`,
        updated_at: sql`excluded.updated_at` } });

  writeLocalFallbackStore(nextStore);
  return nextStore;
}
