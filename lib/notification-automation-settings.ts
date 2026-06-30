import { sql, eq } from 'drizzle-orm';
import { db } from './db-client';
import {
  getD1Binding,
  getD1Drizzle,
  system_settings as systemSettingsTable } from './db';

export const NOTIFICATION_AUTOMATION_KEY = 'notification_automation_v1';

export type NotificationAutomationSettings = {
  payrollEnabled: boolean;
  payrollDay: number;
  annualLeaveEnabled: boolean;
  step1Enabled: boolean;
  step2Enabled: boolean;
};

// 회귀 방지: 연차촉진 관련(annualLeaveEnabled/step1Enabled/step2Enabled)은
// 현행 동작(항상 발송)을 유지하기 위해 기본값을 true로 둔다.
// 급여 자동발송은 트리거 cron이 별도 과제이므로 기본 비활성(false).
export const DEFAULT_NOTIFICATION_AUTOMATION: NotificationAutomationSettings = {
  payrollEnabled: false,
  payrollDay: 25,
  annualLeaveEnabled: true,
  step1Enabled: true,
  step2Enabled: true };

function sanitizeSettings(raw: unknown): NotificationAutomationSettings {
  const source = (raw ?? {}) as Partial<NotificationAutomationSettings>;
  const day = Number(source.payrollDay ?? DEFAULT_NOTIFICATION_AUTOMATION.payrollDay);
  return {
    payrollEnabled: source.payrollEnabled ?? DEFAULT_NOTIFICATION_AUTOMATION.payrollEnabled,
    payrollDay: Math.min(28, Math.max(1, Number.isFinite(day) ? day : DEFAULT_NOTIFICATION_AUTOMATION.payrollDay)),
    annualLeaveEnabled: source.annualLeaveEnabled ?? DEFAULT_NOTIFICATION_AUTOMATION.annualLeaveEnabled,
    step1Enabled: source.step1Enabled ?? DEFAULT_NOTIFICATION_AUTOMATION.step1Enabled,
    step2Enabled: source.step2Enabled ?? DEFAULT_NOTIFICATION_AUTOMATION.step2Enabled };
}

export async function loadNotificationAutomationSettings(): Promise<NotificationAutomationSettings> {
  // 서버(크론/Worker)는 db compat 대신 D1 binding을 직접 읽는다.
  // dispatchAnnualLeavePromotions가 getD1Binding+drizzle로 동작하는 컨텍스트와 동일 경로라
  // compat 라우팅 가용성에 의존하지 않는다. 실패 시 DEFAULT(전부 켜짐) 폴백 → 회귀 방지.
  if (typeof window === 'undefined') {
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
      // D1에서 value는 text(JSON) — 파싱. 비JSON/누락 시 sanitize가 DEFAULT로 보정.
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return sanitizeSettings(parsed);
    } catch {
      return { ...DEFAULT_NOTIFICATION_AUTOMATION };
    }
  }

  // 클라이언트(브라우저)는 D1 binding 접근 불가 → compat db 경유.
  try {
    const { data, error } = await db.from('system_settings')
      .select('value')
      .eq('key', NOTIFICATION_AUTOMATION_KEY)
      .maybeSingle();

    if (error) throw error;

    return sanitizeSettings(data?.value);
  } catch {
    return { ...DEFAULT_NOTIFICATION_AUTOMATION };
  }
}

export async function saveNotificationAutomationSettings(
  settings: NotificationAutomationSettings,
): Promise<void> {
  const next = sanitizeSettings(settings);
  const payload = {
    key: NOTIFICATION_AUTOMATION_KEY,
    value: next,
    updated_at: new Date().toISOString() };

  // 클라이언트(브라우저)는 D1 binding 접근 불가 → compat db 경유
  if (typeof window !== 'undefined') {
    const { error } = await db.from('system_settings')
      .upsert(
        { key: payload.key, value: payload.value, updated_at: payload.updated_at },
        { onConflict: 'key' },
      );
    if (error) {
      throw new Error(`[notification-automation-settings] save (client): ${error.message}`);
    }
    return;
  }

  // 서버: D1 직접 upsert — system_settings.key PK 충돌 시 value/updated_at 갱신
  const d1 = await getD1Binding();
  if (!d1) {
    throw new Error('[notification-automation-settings] D1 binding not available');
  }
  const drizzleDb = getD1Drizzle(d1);

  // value는 D1 스키마에서 text — JSON.stringify
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
}
