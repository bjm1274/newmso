/**
 * 급여 자동 리마인더 디스패치
 *
 * 매일 도는 크론에서 KST 오늘 일(日)이 급여 자동화 설정의 payrollDay 와 일치하고
 * payrollEnabled=true 일 때만, HR/관리자에게 '급여명세서 발송을 확인하세요' 리마인더
 * 알림 한 건을 발송한다. (전 직원 급여명세서 일괄발송은 오발송 위험이 커 범위 밖.)
 *
 * 멱등성: system_settings(key='payroll_notice_last_sent', value=이번달 YYYY-MM) 로
 * 이번 달 이미 보냈으면 스킵. (새 테이블을 만들지 않고 system_settings upsert 재사용)
 * sendAdminNotifications 의 dedupeKey 가드와 더불어 이중으로 중복을 차단한다.
 */

import { sql, eq } from 'drizzle-orm';
import { sendAdminNotifications } from '@/lib/notification-utils';
import { getKoreanTodayString, getKoreanMonthString } from '@/lib/seoul-time';
import { loadNotificationAutomationSettings } from '@/lib/notification-automation-settings';
import {
  getD1Binding,
  getD1Drizzle,
  system_settings as systemSettingsTable } from '@/lib/db';

export const PAYROLL_NOTICE_LAST_SENT_KEY = 'payroll_notice_last_sent';

export type PayrollNoticeDispatchResult = {
  sent: boolean;
  reason?: string;
  month?: string;
};

export async function dispatchPayrollNotice(
  now: Date = new Date(),
): Promise<PayrollNoticeDispatchResult> {
  // 급여 자동화 설정. 로드 실패 시 DEFAULT(payrollEnabled=false)로 폴백 → 오발송 방지.
  const automation = await loadNotificationAutomationSettings();
  if (automation.payrollEnabled !== true) {
    return { sent: false, reason: 'payrollEnabled=false' };
  }

  // KST 기준 오늘 일(日)이 payrollDay 와 일치할 때만 발송.
  const todayKey = getKoreanTodayString(now); // 'YYYY-MM-DD'
  const todayDay = Number(todayKey.slice(8, 10));
  if (todayDay !== automation.payrollDay) {
    return { sent: false, reason: `day ${todayDay} !== payrollDay ${automation.payrollDay}` };
  }

  const monthKey = getKoreanMonthString(now); // 'YYYY-MM'

  const d1 = await getD1Binding();
  if (!d1) throw new Error('[payroll-notice-dispatch] D1 binding not available');
  const db = getD1Drizzle(d1);

  // 멱등 가드: 이번 달에 이미 보냈으면 스킵.
  const rows = await db
    .select({ value: systemSettingsTable.value })
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, PAYROLL_NOTICE_LAST_SENT_KEY))
    .limit(1);
  if (rows[0]?.value === monthKey) {
    return { sent: false, reason: 'already sent this month', month: monthKey };
  }

  await sendAdminNotifications([
    {
      type: 'INFO',
      title: '급여명세서 발송일',
      body: '오늘은 급여 지급일입니다. 급여명세서 발송을 확인해 주세요.',
      dedupeKey: `payroll-notice:${monthKey}` },
  ]);

  // 멱등 마킹: system_settings.key PK 충돌 시 value/updated_at 갱신
  // (새 테이블 금지 — notification-automation-settings 의 server upsert 패턴 재사용)
  await db
    .insert(systemSettingsTable)
    .values({
      key: PAYROLL_NOTICE_LAST_SENT_KEY,
      value: monthKey,
      updated_at: now.toISOString() })
    .onConflictDoUpdate({
      target: systemSettingsTable.key,
      set: {
        value: sql`excluded.value`,
        updated_at: sql`excluded.updated_at` } });

  return { sent: true, month: monthKey };
}
