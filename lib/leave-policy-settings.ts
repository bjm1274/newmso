import 'server-only';
import { sql } from 'drizzle-orm';
import {
  getD1Binding,
  getD1Drizzle,
  system_settings as systemSettingsTable,
} from './db';
import {
  DEFAULT_LEAVE_POLICY_SETTINGS,
  LEAVE_POLICY_SETTINGS_KEY,
  sanitizeLeavePolicySettings,
  loadLeavePolicyStore,
  type LeavePolicySettings,
  type LeavePolicyStore,
} from './leave-policy-shared';

export * from './leave-policy-shared';

export async function saveLeavePolicySettings(selectedCompany: string, settings: LeavePolicySettings) {
  const current = await loadLeavePolicyStore();
  const nextStore: LeavePolicyStore = {
    version: 1,
    companies: {
      ...current.companies,
      [selectedCompany || '전체']: sanitizeLeavePolicySettings(settings),
    },
  };

  const payload = {
    key: LEAVE_POLICY_SETTINGS_KEY,
    value: nextStore,
    updated_at: new Date().toISOString(),
  };

  const d1 = await getD1Binding();
  if (!d1) {
    throw new Error('[leave-policy-settings] D1 binding not available');
  }
  const drizzleDb = getD1Drizzle(d1);

  await drizzleDb.insert(systemSettingsTable)
    .values({
      key: payload.key,
      value: JSON.stringify(payload.value),
      updated_at: payload.updated_at,
    })
    .onConflictDoUpdate({
      target: systemSettingsTable.key,
      set: {
        value: sql`excluded.value`,
        updated_at: sql`excluded.updated_at`,
      },
    });

  return nextStore;
}
