import 'server-only';
import { sql, eq } from 'drizzle-orm';
import {
  getD1Binding,
  getD1Drizzle,
  system_settings as systemSettingsTable,
} from './db';
import {
  DEFAULT_NOTIFICATION_AUTOMATION,
  NOTIFICATION_AUTOMATION_KEY,
  sanitizeNotificationAutomationSettings,
  type NotificationAutomationSettings,
} from './notification-automation-shared';

export * from './notification-automation-shared';

export async function loadNotificationAutomationSettings(): Promise<NotificationAutomationSettings> {
  try {
    const d1 = await getD1Binding();
    if (!d1) return { ...DEFAULT_NOTIFICATION_AUTOMATION };
    const drizzleDb = getD1Drizzle(d1);
    const rows = await drizzleDb
      .select({ value: systemSettingsTable.value })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, NOTIFICATION_AUTOMATION_KEY))
      .limit(1);
    const raw = rows[0]?.value;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return sanitizeNotificationAutomationSettings(parsed);
  } catch {
    return { ...DEFAULT_NOTIFICATION_AUTOMATION };
  }
}

export async function saveNotificationAutomationSettings(
  settings: NotificationAutomationSettings,
): Promise<void> {
  const next = sanitizeNotificationAutomationSettings(settings);
  const payload = {
    key: NOTIFICATION_AUTOMATION_KEY,
    value: next,
    updated_at: new Date().toISOString(),
  };

  const d1 = await getD1Binding();
  if (!d1) {
    throw new Error('[notification-automation-settings] D1 binding not available');
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
}
