/**
 * 연차사용촉진 자동 디스패치 (근로기준법 제61조)
 *
 * 매일 크론(KST 09:00)에서:
 *  - 1차 촉진일(만료 6개월 전) 도래 후 미발송 → 1차 통보
 *  - 2차 촉진일(만료 2개월 전) 도래 후 미발송 → 2차 통보
 * 당일 크론 실패로 놓친 경우에도 만료 전까지 소급 발송한다.
 *
 * 멱등성: annual_leave_promotion_logs 의 **PK(id) 를 (staff_id, stage, expiry_date)
 *   자연키로 만들어** 보장한다 — `buildPromotionLogId()` 참고. 그 조합에 UNIQUE
 *   인덱스는 없고(기존 데이터에 중복이 있어 새로 걸 수도 없다) 유니크는 PK 뿐이라,
 *   PK 자체를 자연키로 쓰는 것이 유일한 수단이다.
 * 제외: 퇴사, 입사일 없음, 잔여 0, 연차계획서 제출(반려 제외), 이미 동일 차수 발송
 */

import {
  buildPromotionSentKey,
  getStaffPromotionSchedule,
  resolveDuePromotionStage,
  resolveHireDateFromStaff,
} from '@/lib/annual-leave-promotion';
// 촉진 대상 판정은 원장(SSOT)으로 한다 — staff_members 미러가 아니다.
import { aggregateLedgerEntries, getLeaveCycle, type LedgerRowLike } from '@/lib/leave-cycle';
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
  leave_ledger as leaveLedgerTable,
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
  join_date: string | null;
  joined_at: string | null;
  hire_date: string | null;
};

const PLAN_TYPES = ['연차계획서', '연차사용계획서'];

/**
 * 촉진 로그의 결정적 PK — `alp-{staff_id}-{stage}-{expiry_date}`.
 *
 * 예전에는 크론이 `crypto.randomUUID()` + **타깃 없는** `onConflictDoNothing()` 이었다.
 * 무작위 id 는 절대 충돌하지 않으므로 그 절 자체가 무의미했고, 같은 촉진이 두 번
 * 기록되는 것을 아무것도 막지 못했다(운영 43행 중 (staff,step,expiry) 완전 중복 1쌍).
 *
 * 키 구성은 **`알림자동화설정.tsx` 의 수동 발송과 동일**하게 맞춘다. 같은 촉진을
 * 사람이 눌러 보내든 크론이 보내든 같은 행이 되어야 하기 때문이다.
 * `연차촉진시스템.tsx` 는 `alp-{staff}-{target_year}-{step}` 을 쓰지만 그 형태는
 * 쓰지 않는다 — 운영에 **같은 해에 만료일이 서로 다른 step1 로그**가 실제로 있다
 * (백정민: 2026-08-01 / 2026-11-01 / 2026-12-31). 연도로 뭉치면 그 셋이 한 id 로
 * 충돌해 뒤엣것이 DO NOTHING 으로 버려지고, 그러면
 * `hasCompletedBothPromotions(staffId, expiryKey)` 가 만료일을 정확히 대조하므로
 * **촉진 이행이 미이행으로 뒤집혀 연차 소멸 판정이 달라진다.** 만료일을 키에 그대로
 * 넣어야 sentSet·이행판정과 같은 식별자가 된다.
 */
export function buildPromotionLogId(
  staffId: string,
  stage: 1 | 2 | number,
  expiryDateKey: string,
): string {
  return `alp-${String(staffId)}-${Number(stage)}-${String(expiryDateKey || '').slice(0, 10)}`;
}

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
    const expiry = String(r.expiry_date || '').slice(0, 10);
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
      created_at: approvalsTable.created_at,
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
  // 계획서 제출일을 직원별로 모아 둔다.
  //
  // 예전에는 sender_id 만 Set 에 담고 `planSet.has(id)` 로 skip 했다. 대상 연도도,
  // 촉진 주기 필터도 없어서 **한 번이라도 계획서를 낸 직원은 그 뒤 모든 해의
  // 1·2차 촉진에서 영구 제외**됐다. 촉진 미이행은 연차 자동소멸의 적법 요건을
  // 무너뜨려 회사가 미사용 연차 수당 보상 의무를 계속 지게 된다.
  // approvals 에는 연도 아카이브도, type 문자열의 연도 표기도 없으므로
  // created_at 을 촉진 주기 창과 대조한다.
  const planDatesByStaff = new Map<string, string[]>();
  for (const r of planRows) {
    const senderId = String(r.sender_id || '').trim();
    if (!senderId) continue;
    const submittedOn = String(r.created_at || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(submittedOn)) continue;
    const list = planDatesByStaff.get(senderId);
    if (list) list.push(submittedOn);
    else planDatesByStaff.set(senderId, [submittedOn]);
  }

  // 촉진 대상 판정용 원장 전량 로드.
  //
  // 예전에는 staff_members.annual_leave_total/used 로 잔여를 계산했다. 그 두 컬럼은
  // 개인 요약 화면을 열 때 fire-and-forget 으로만 갱신되는 파생 미러라,
  // **화면을 한 번도 열지 않은 직원은 구값(대개 0)** 이 남아 촉진이 통째로
  // 누락되거나 반대로 잔여 0인 직원에게 오발송됐다. 원장을 직접 집계한다.
  // 직원 수만큼 쿼리를 날리지 않도록 한 번에 읽어 메모리에서 묶는다.
  const ledgerRows = await db
    .select({
      id: leaveLedgerTable.id,
      staff_id: leaveLedgerTable.staff_id,
      entry_type: leaveLedgerTable.entry_type,
      days: leaveLedgerTable.days,
      occurred_on: leaveLedgerTable.occurred_on,
      period_key: leaveLedgerTable.period_key,
    })
    .from(leaveLedgerTable);
  const ledgerByStaff = new Map<string, LedgerRowLike[]>();
  for (const row of ledgerRows) {
    const sid = String(row.staff_id || '').trim();
    if (!sid) continue;
    const list = ledgerByStaff.get(sid);
    if (list) list.push(row);
    else ledgerByStaff.set(sid, [row]);
  }

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

    const expiryKey = formatKoreanDateKey(schedule.expiryDate);
    const step1Key = formatKoreanDateKey(schedule.step1Date);
    const step2Key = formatKoreanDateKey(schedule.step2Date);

    // 잔여는 원장 기준 현재 주기 집계값이다 (미러 아님 — 위 주석 참고).
    const cycle = getLeaveCycle(hireDate, todayKey);
    if (!cycle) {
      result.skipped += 1;
      continue;
    }
    const remaining = aggregateLedgerEntries(ledgerByStaff.get(String(s.id)) ?? [], cycle).remaining;
    if (remaining <= 0) {
      result.skipped += 1;
      continue;
    }

    // 계획서 면제는 **이번 촉진 주기에 낸 계획서**만 인정한다.
    // 창은 1차 촉진일 ~ 만료일. 그 밖의 제출은 지난 주기 것이므로 면제되지 않는다.
    const submittedInCycle = (planDatesByStaff.get(String(s.id)) ?? []).some(
      (submittedOn) => submittedOn >= step1Key && submittedOn <= expiryKey,
    );
    if (submittedInCycle) {
      result.skipped += 1;
      continue;
    }

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
          id: buildPromotionLogId(s.id, stage, expiryKey),
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
        // 충돌 타깃을 PK 로 명시한다. 위 id 가 자연키라 같은 (직원, 차수, 만료일)
        // 재실행은 여기서 조용히 무시된다 — 통보는 sentSet 가 이미 막고 있으므로
        // 여기 도달 자체가 재시도·동시실행 같은 예외 경로다.
        .onConflictDoNothing({ target: promotionLogsTable.id });

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
