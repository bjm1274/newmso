/**
 * 연차사용촉진 자동 디스패치 (근로기준법 제61조)
 *
 * 매일 도는 크론에서 각 직원의 입사일 기준 촉진 스케줄을 계산하여,
 *  - 1차 촉진일(만료 6개월 전) 도래 → 1차 통보 발송
 *  - 2차 촉진일(만료 2개월 전) 도래 → 2차 통보 발송
 * 을 자동 수행한다. (기존에는 관리자가 화면에서 버튼을 눌러야만 발송되었음)
 *
 * 멱등성: annual_leave_promotion_logs (staff_id, stage, expiry_date) 로 중복 발송 차단.
 * 제외 대상: 잔여연차 0, 이미 연차계획서 제출, 이미 동일 차수 통보 완료.
 */

import { getStaffPromotionSchedule } from '@/lib/annual-leave-promotion';
import { mirrorNotificationsToD1, type NotificationRow } from '@/lib/notification-utils';
import { formatKoreanDateKey } from '@/lib/seoul-time';
import { loadNotificationAutomationSettings } from '@/lib/notification-automation-settings';
import {
  getD1Binding,
  getD1Drizzle,
  staff_members as staffMembersTable,
  annual_leave_promotion_logs as promotionLogsTable,
  approvals as approvalsTable,
  eq,
  and,
  inArray,
  ne } from '@/lib/db';

export type PromotionDispatchResult = {
  scanned: number;
  sent: Array<{ staffId: string; staffName: string; stage: 1 | 2; expiryDate: string }>;
  skipped: number;
  errors: string[];
};

type StaffRow = {
  id: string;
  name: string;
  company: string | null;
  company_id: string | null;
  status: string | null;
  annual_leave_total: number | null;
  annual_leave_used: number | null;
  join_date: string | null;
  joined_at: string | null;
  hire_date: string | null;
};

const PLAN_TYPES = ['연차계획서', '연차사용계획서'];

export async function dispatchAnnualLeavePromotions(now: Date = new Date()): Promise<PromotionDispatchResult> {
  const result: PromotionDispatchResult = { scanned: 0, sent: [], skipped: 0, errors: [] };
  const todayKey = formatKoreanDateKey(now);

  // 알림자동화설정 토글 존중. 로드 실패 시 DEFAULT(전부 켜짐)으로 폴백 → 회귀 방지.
  const automation = await loadNotificationAutomationSettings();
  if (automation.annualLeaveEnabled === false) {
    console.log('[annual-leave-promotion-dispatch] annualLeaveEnabled=false → 디스패치 스킵');
    return result;
  }

  const d1 = await getD1Binding();
  if (!d1) throw new Error('[annual-leave-promotion-dispatch] D1 binding not available');
  const db = getD1Drizzle(d1);

  const staffs = (await db
    .select({
      id: staffMembersTable.id,
      name: staffMembersTable.name,
      company: staffMembersTable.company,
      company_id: staffMembersTable.company_id,
      status: staffMembersTable.status,
      annual_leave_total: staffMembersTable.annual_leave_total,
      annual_leave_used: staffMembersTable.annual_leave_used,
      join_date: staffMembersTable.join_date,
      joined_at: staffMembersTable.joined_at,
      hire_date: staffMembersTable.hire_date })
    .from(staffMembersTable)) as StaffRow[];

  // 이미 발송된 (staff_id|stage|expiry_date) 셋
  const logRows = await db
    .select({ staff_id: promotionLogsTable.staff_id, stage: promotionLogsTable.stage, step: promotionLogsTable.step, expiry_date: promotionLogsTable.expiry_date })
    .from(promotionLogsTable);
  const sentSet = new Set<string>();
  for (const r of logRows) {
    const st = r.stage ?? r.step;
    if (st && r.expiry_date) sentSet.add(`${r.staff_id}|${st}|${String(r.expiry_date).slice(0, 10)}`);
  }

  // 연차계획서 제출자(반려 제외) 셋
  const planRows = await db
    .select({ sender_id: approvalsTable.sender_id })
    .from(approvalsTable)
    .where(and(inArray(approvalsTable.type, PLAN_TYPES), ne(approvalsTable.status, '반려')));
  const planSet = new Set(planRows.map((r) => String(r.sender_id || '')));

  for (const s of staffs) {
    result.scanned += 1;
    if (s.status && s.status !== '재직') {
      result.skipped += 1;
      continue;
    }
    const hireDate = s.hire_date || s.join_date || s.joined_at;
    const schedule = getStaffPromotionSchedule(hireDate, now);
    if (!schedule) {
      result.skipped += 1;
      continue;
    }

    const remaining = Math.max(0, (Number(s.annual_leave_total) || 0) - (Number(s.annual_leave_used) || 0));
    if (remaining <= 0 || planSet.has(s.id)) {
      result.skipped += 1;
      continue;
    }

    const expiryKey = formatKoreanDateKey(schedule.expiryDate);
    const step1Key = formatKoreanDateKey(schedule.step1Date);
    const step2Key = formatKoreanDateKey(schedule.step2Date);

    let stage: 1 | 2 | 0 = 0;
    if (automation.step2Enabled !== false && todayKey === step2Key && !sentSet.has(`${s.id}|2|${expiryKey}`)) stage = 2;
    else if (automation.step1Enabled !== false && todayKey === step1Key && !sentSet.has(`${s.id}|1|${expiryKey}`)) stage = 1;

    if (stage === 0) {
      result.skipped += 1;
      continue;
    }

    try {
      const stageLabel = stage === 1 ? '1차' : '2차';
      const nowIso = now.toISOString();
      const body =
        stage === 1
          ? `${s.name}님, 미사용 연차 ${remaining}일에 대해 근로기준법에 따라 ${stageLabel} 촉진합니다. [전자결재 > 작성하기 > 연차계획서]로 사용 계획을 제출해 주세요.`
          : `${s.name}님, 미사용 연차 ${remaining}일에 대해 ${stageLabel} 촉진합니다. 만료일(${expiryKey}) 전까지 사용 시기를 확정해 주세요.`;

      const notif: NotificationRow = {
        user_id: s.id,
        type: '인사',
        title: `📅 연차사용촉진 ${stageLabel} 통보 및 계획 제출 요청`,
        body,
        metadata: {
          type: 'annual_leave_promotion',
          stage,
          remaining,
          expiry_date: expiryKey,
          link: '/main/전자결재?view=작성하기&type=연차계획서' },
        read_at: null };
      await mirrorNotificationsToD1([notif]);

      await db
        .insert(promotionLogsTable)
        .values({
          id: crypto.randomUUID(),
          staff_id: s.id,
          company_name: s.company,
          target_year: schedule.targetYear,
          step: stage,
          stage,
          expiry_date: expiryKey,
          notified_at: nowIso,
          sent_at: nowIso,
          remain_days: remaining,
          remaining_days_at_notice: remaining,
          meta: JSON.stringify({ action: 'promote', stage, auto: true }),
          created_at: nowIso })
        .onConflictDoNothing();

      sentSet.add(`${s.id}|${stage}|${expiryKey}`);
      result.sent.push({ staffId: s.id, staffName: s.name, stage, expiryDate: expiryKey });
    } catch (err) {
      result.errors.push(`${s.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

/**
 * 특정 만료일에 대해 1차+2차 촉진이 모두 완료되었는지 확인.
 * 자동소멸의 적법 요건(촉진 2회 이행) 검증에 사용.
 */
export async function hasCompletedBothPromotions(staffId: string, expiryDateKey: string): Promise<boolean> {
  const d1 = await getD1Binding();
  if (!d1) throw new Error('[annual-leave-promotion-dispatch] D1 binding not available (hasCompletedBothPromotions)');
  const db = getD1Drizzle(d1);

  const rows = await db
    .select({ stage: promotionLogsTable.stage, step: promotionLogsTable.step })
    .from(promotionLogsTable)
    .where(and(eq(promotionLogsTable.staff_id, staffId), eq(promotionLogsTable.expiry_date, expiryDateKey)));

  let has1 = false;
  let has2 = false;
  for (const r of rows) {
    const st = r.stage ?? r.step;
    if (st === 1) has1 = true;
    if (st === 2) has2 = true;
  }
  return has1 && has2;
}
