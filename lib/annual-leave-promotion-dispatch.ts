/**
 * 연차사용촉진 자동 디스패치 (근로기준법 제61조)
 *
 * 매일 크론(KST 09:00)에서:
 *  - 1차 촉진일(만료 6개월 전) 도래 후 미발송 → 1차 통보
 *  - 2차 촉진일(만료 2개월 전) 도래 후 미발송 → 2차 통보
 * 당일 크론 실패로 놓친 경우에도 만료 전까지 소급 발송한다.
 *
 * 멱등성: annual_leave_promotion_logs (staff_id + stage/step + expiry_date)
 * 제외: 퇴사, 입사일 없음, 잔여 0, 연차계획서 제출(반려 제외), 이미 동일 차수 발송
 */

import {
  buildPromotionSentKey,
  clampLeaveRemaining,
  getStaffPromotionSchedule,
  resolveDuePromotionStage,
  resolveHireDateFromStaff,
} from '@/lib/annual-leave-promotion';
import { mirrorNotificationsToD1, type NotificationRow } from '@/lib/notification-utils';
// 통보일자는 KST 기준이어야 한다 — 이 코드는 크론(UTC 워커)에서 돌기 때문에
// toLocaleDateString('ko-KR') 만 쓰면 KST 09:00 이후 날짜가 하루 밀린다.
import { formatKoreanDateKey, formatKoreanDateLabel } from '@/lib/seoul-time';
import { loadNotificationAutomationSettings } from '@/lib/notification-automation-settings';
import {
  getD1Binding,
  getD1Drizzle,
  staff_members as staffMembersTable,
  annual_leave_promotion_logs as promotionLogsTable,
  approvals as approvalsTable,
  document_repository as documentRepositoryTable,
  eq,
  and,
  inArray,
  ne,
  or,
  like,
} from '@/lib/db';

export type PromotionDispatchResult = {
  scanned: number;
  sent: Array<{ staffId: string; staffName: string; stage: 1 | 2; expiryDate: string }>;
  skipped: number;
  errors: string[];
  disabled?: boolean;
};

type StaffRow = {
  id: string;
  name: string;
  company: string | null;
  company_id: string | null;
  department: string | null;
  position: string | null;
  status: string | null;
  annual_leave_total: number | null;
  annual_leave_used: number | null;
  join_date: string | null;
  joined_at: string | null;
  hire_date: string | null;
};

const PLAN_TYPES = ['연차계획서', '연차사용계획서'];

function isActiveEmploymentStatus(status: string | null | undefined): boolean {
  const s = String(status || '재직').trim();
  if (!s) return true;
  if (s === '재직' || s === 'active' || s === 'Active') return true;
  if (s === '퇴사' || s === '퇴직' || s === 'inactive' || s === 'resigned') return false;
  // 단체 채팅용 등 기타 상태는 촉진 제외 (급여 0 봇 계정 등)
  return s === '재직';
}

function buildPromotionDocument(params: {
  stage: 1 | 2;
  name: string;
  department: string | null;
  position: string | null;
  remaining: number;
  targetYear: number;
  expiryKey: string;
}): string {
  const stageLabel = params.stage === 1 ? '1차' : '2차';
  const bodyMain =
    params.stage === 1
      ? `이에 근로기준법 제61조 제1항에 의거하여, 회사는 귀하에게 미사용 연차유급휴가의 사용을 촉진하오니, 본 서면을 수령한 날로부터 10일 이내에 미사용 연차유급휴가에 대한 구체적인 사용계획서(계획 일자 지정)를 작성하여 전자결재 시스템을 통해 제출해 주시기 바랍니다.

기한 내에 사용 계획을 제출하지 아니할 경우, 근로기준법 제61조 제2항에 의거하여 회사가 임의로 휴가 사용 시기를 지정하여 통보하게 되며, 이에 따른 휴가 미사용에 대하여는 수당이 지급되지 아니함을 알려드립니다.`
      : `회사는 근로기준법 제61조 제1항에 의거하여 귀하에게 미사용 연차유급휴가 사용을 촉진하였으나, 귀하는 기한 내에 사용계획서를 제출하지 아니하였거나 2차 촉진 시기가 도래하였습니다.

이에 회사는 근로기준법 제61조에 따라 귀하의 미사용 연차유급휴가 총 ${params.remaining}일에 대하여 사용을 재차 촉진합니다. 만료일(${params.expiryKey}) 전까지 사용 시기를 확정해 주시기 바랍니다.

지정된 휴가일에 휴가를 사용하여야 하며, 미사용 시 수당 지급이 제한될 수 있음을 고지합니다.`;

  return `연차 유급휴가 사용촉진 통보서 (${stageLabel})

성 명: ${params.name}
소 속: ${params.department || '—'}
직 급: ${params.position || '—'}
미사용 연차: ${params.remaining} 일
만료 예정일: ${params.expiryKey}

귀하의 ${params.targetYear}년도 발생 연차유급휴가 중 현재까지 사용하지 아니한 휴가는 총 ${params.remaining}일입니다.

${bodyMain}

통보일자: ${formatKoreanDateLabel()}
`;
}

export async function dispatchAnnualLeavePromotions(
  now: Date = new Date(),
): Promise<PromotionDispatchResult> {
  const result: PromotionDispatchResult = {
    scanned: 0,
    sent: [],
    skipped: 0,
    errors: [],
  };
  const todayKey = formatKoreanDateKey(now);

  const automation = await loadNotificationAutomationSettings();
  if (automation.annualLeaveEnabled === false) {
    console.log('[annual-leave-promotion-dispatch] annualLeaveEnabled=false → 디스패치 스킵');
    return { ...result, disabled: true };
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
      department: staffMembersTable.department,
      position: staffMembersTable.position,
      status: staffMembersTable.status,
      annual_leave_total: staffMembersTable.annual_leave_total,
      annual_leave_used: staffMembersTable.annual_leave_used,
      join_date: staffMembersTable.join_date,
      joined_at: staffMembersTable.joined_at,
      hire_date: staffMembersTable.hire_date,
    })
    .from(staffMembersTable)) as StaffRow[];

  const logRows = await db
    .select({
      staff_id: promotionLogsTable.staff_id,
      stage: promotionLogsTable.stage,
      step: promotionLogsTable.step,
      expiry_date: promotionLogsTable.expiry_date,
      target_year: promotionLogsTable.target_year,
    })
    .from(promotionLogsTable);

  const sentSet = new Set<string>();
  for (const r of logRows) {
    const st = Number(r.stage ?? r.step);
    if (!st || (st !== 1 && st !== 2)) continue;
    let expiry = String(r.expiry_date || '').slice(0, 10);
    // 레거시 로그: expiry_date 없으면 target_year 로 약한 키 보강 (완전 일치는 어려움)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry) && r.target_year) {
      // stage 키만으로는 부족 — staff|stage|year 보조 키
      sentSet.add(`${r.staff_id}|${st}|Y${r.target_year}`);
      continue;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
      sentSet.add(buildPromotionSentKey(String(r.staff_id), st as 1 | 2, expiry));
    }
  }

  // 연차계획서: type 정확 일치 + 이름 유사 매칭
  const planRows = await db
    .select({
      sender_id: approvalsTable.sender_id,
      type: approvalsTable.type,
      status: approvalsTable.status,
    })
    .from(approvalsTable)
    .where(
      and(
        or(
          inArray(approvalsTable.type, PLAN_TYPES),
          like(approvalsTable.type, '%연차%계획%'),
        ),
        ne(approvalsTable.status, '반려'),
      ),
    );
  const planSet = new Set(
    planRows
      .map((r) => String(r.sender_id || '').trim())
      .filter(Boolean),
  );

  for (const s of staffs) {
    result.scanned += 1;

    if (!isActiveEmploymentStatus(s.status)) {
      result.skipped += 1;
      continue;
    }

    // 단체 채팅용 등 이름 패턴 — 연차 촉진 제외
    const name = String(s.name || '');
    if (/팀\d+$/.test(name) || name.includes('테스트') || name.startsWith('TEST_')) {
      result.skipped += 1;
      continue;
    }

    const hireDate = resolveHireDateFromStaff(s);
    const schedule = getStaffPromotionSchedule(hireDate, now);
    if (!schedule || !hireDate) {
      result.skipped += 1;
      continue;
    }

    const remaining = clampLeaveRemaining(s.annual_leave_total, s.annual_leave_used);
    if (remaining <= 0 || planSet.has(String(s.id))) {
      result.skipped += 1;
      continue;
    }

    const expiryKey = formatKoreanDateKey(schedule.expiryDate);
    const step1Key = formatKoreanDateKey(schedule.step1Date);
    const step2Key = formatKoreanDateKey(schedule.step2Date);

    const hasStage1 =
      sentSet.has(buildPromotionSentKey(s.id, 1, expiryKey)) ||
      sentSet.has(`${s.id}|1|Y${schedule.targetYear}`);
    const hasStage2 =
      sentSet.has(buildPromotionSentKey(s.id, 2, expiryKey)) ||
      sentSet.has(`${s.id}|2|Y${schedule.targetYear}`);

    const stage = resolveDuePromotionStage({
      todayKey,
      step1Key,
      step2Key,
      expiryKey,
      hasStage1,
      hasStage2,
      step1Enabled: automation.step1Enabled,
      step2Enabled: automation.step2Enabled,
    });

    if (stage === 0) {
      result.skipped += 1;
      continue;
    }

    try {
      const stageLabel = stage === 1 ? '1차' : '2차';
      const nowIso = now.toISOString();
      const body =
        stage === 1
          ? `${s.name}님, 미사용 연차 ${remaining}일에 대해 근로기준법에 따라 ${stageLabel} 촉진합니다. 만료 예정일 ${expiryKey}. [전자결재 > 작성하기 > 연차계획서]로 사용 계획을 제출해 주세요.`
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
          hire_date: hireDate,
          auto: true,
          catch_up: todayKey !== (stage === 1 ? step1Key : step2Key),
          link: '/main/전자결재?view=작성하기&type=연차계획서',
        },
        read_at: null,
      };
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
          meta: JSON.stringify({
            action: 'promote',
            stage,
            auto: true,
            catch_up: todayKey !== (stage === 1 ? step1Key : step2Key),
            hire_date: hireDate,
            step1: step1Key,
            step2: step2Key,
          }),
          created_at: nowIso,
        })
        .onConflictDoNothing();

      const docTitle = `연차유급휴가 사용촉진 통보서 (${stageLabel}) - ${s.name}`;
      const docContent = buildPromotionDocument({
        stage,
        name: s.name,
        department: s.department,
        position: s.position,
        remaining,
        targetYear: schedule.targetYear,
        expiryKey,
      });

      await db.insert(documentRepositoryTable).values({
        id: crypto.randomUUID(),
        title: docTitle,
        category: '연차촉진',
        content: docContent,
        company_name: s.company || '전체',
        created_by: s.id,
        version: 1,
        created_at: nowIso,
        updated_at: nowIso,
      });

      sentSet.add(buildPromotionSentKey(s.id, stage, expiryKey));
      result.sent.push({
        staffId: s.id,
        staffName: s.name,
        stage,
        expiryDate: expiryKey,
      });
    } catch (err) {
      result.errors.push(`${s.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(
    `[annual-leave-promotion-dispatch] scanned=${result.scanned} sent=${result.sent.length} skipped=${result.skipped} errors=${result.errors.length}`,
  );
  return result;
}

/**
 * 특정 만료일에 대해 1차+2차 촉진이 모두 완료되었는지 확인.
 * 자동소멸의 적법 요건(촉진 2회 이행) 검증에 사용.
 */
export async function hasCompletedBothPromotions(
  staffId: string,
  expiryDateKey: string,
): Promise<boolean> {
  const d1 = await getD1Binding();
  if (!d1) {
    throw new Error(
      '[annual-leave-promotion-dispatch] D1 binding not available (hasCompletedBothPromotions)',
    );
  }
  const db = getD1Drizzle(d1);
  const expiry = String(expiryDateKey || '').slice(0, 10);

  const rows = await db
    .select({
      stage: promotionLogsTable.stage,
      step: promotionLogsTable.step,
      expiry_date: promotionLogsTable.expiry_date,
    })
    .from(promotionLogsTable)
    .where(eq(promotionLogsTable.staff_id, staffId));

  let has1 = false;
  let has2 = false;
  for (const r of rows) {
    const st = Number(r.stage ?? r.step);
    const exp = String(r.expiry_date || '').slice(0, 10);
    // expiry 가 비어 있던 레거시 로그는 동일 staff 의 step 만으로 인정하지 않음 (오판 방지)
    if (exp && exp !== expiry) continue;
    if (!exp) continue;
    if (st === 1) has1 = true;
    if (st === 2) has2 = true;
  }
  return has1 && has2;
}
