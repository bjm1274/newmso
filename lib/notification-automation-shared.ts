import { db } from './db-client';

export const NOTIFICATION_AUTOMATION_KEY = 'notification_automation_v1';

export type NotificationAutomationSettings = {
  payrollEnabled: boolean;
  payrollDay: number;
  annualLeaveEnabled: boolean;
  step1Enabled: boolean;
  step2Enabled: boolean;
};

export const DEFAULT_NOTIFICATION_AUTOMATION: NotificationAutomationSettings = {
  payrollEnabled: false,
  payrollDay: 25,
  annualLeaveEnabled: true,
  step1Enabled: true,
  step2Enabled: true,
};

export function sanitizeNotificationAutomationSettings(raw: unknown): NotificationAutomationSettings {
  const source = (raw ?? {}) as Partial<NotificationAutomationSettings>;
  const day = Number(source.payrollDay ?? DEFAULT_NOTIFICATION_AUTOMATION.payrollDay);
  return {
    payrollEnabled: source.payrollEnabled ?? DEFAULT_NOTIFICATION_AUTOMATION.payrollEnabled,
    payrollDay: Math.min(28, Math.max(1, Number.isFinite(day) ? day : DEFAULT_NOTIFICATION_AUTOMATION.payrollDay)),
    annualLeaveEnabled: source.annualLeaveEnabled ?? DEFAULT_NOTIFICATION_AUTOMATION.annualLeaveEnabled,
    step1Enabled: source.step1Enabled ?? DEFAULT_NOTIFICATION_AUTOMATION.step1Enabled,
    step2Enabled: source.step2Enabled ?? DEFAULT_NOTIFICATION_AUTOMATION.step2Enabled,
  };
}

export async function loadNotificationAutomationSettingsClient(): Promise<NotificationAutomationSettings> {
  try {
    const { data, error } = await db.from('system_settings')
      .select('value')
      .eq('key', NOTIFICATION_AUTOMATION_KEY)
      .maybeSingle();

    if (error) throw error;

    return sanitizeNotificationAutomationSettings(data?.value);
  } catch {
    return { ...DEFAULT_NOTIFICATION_AUTOMATION };
  }
}

export async function saveNotificationAutomationSettingsClient(
  settings: NotificationAutomationSettings,
): Promise<void> {
  const next = sanitizeNotificationAutomationSettings(settings);
  const payload = {
    key: NOTIFICATION_AUTOMATION_KEY,
    value: next,
    updated_at: new Date().toISOString(),
  };

  const { error } = await db.from('system_settings')
    .upsert(
      { key: payload.key, value: payload.value, updated_at: payload.updated_at },
      { onConflict: 'key' },
    );
  if (error) {
    throw new Error(`[notification-automation-settings] save (client): ${error.message}`);
  }
}
