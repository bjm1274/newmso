/**
 * 예약된 인사발령 자동 적용.
 *
 * 배경
 * ----
 * 인사발령 등록 화면(PC `인사발령관리.tsx`, 모바일 `발령탭.tsx`)은 발령일이 미래면
 * `personnel_appointments` 에 `status='대기'` 로만 넣고 `staff_members` 는 건드리지 않는다.
 * (예전에는 발령일과 무관하게 즉시 반영해서 미래 발령이 오늘 적용되는 문제가 있었다.)
 *
 * 그런데 발령일이 지나도 아무것도 자동으로 적용되지 않아 담당자가 수동 재처리를 해야 했다.
 * 이 모듈이 그 공백을 메운다 — 매일 크론이 "발령일이 도래했는데 아직 대기인" 발령을 훑어
 * 등록 화면과 **동일한 규칙**으로 반영한다.
 *
 * 규칙(등록 화면과 반드시 일치시킬 것)
 * ------------------------------------
 *  - 값이 실제로 바뀔 때만 갱신한다. 특히 `role` 은 PRIVILEGED_STAFF_COLUMNS 라
 *    변하지 않는 값을 같이 보내면 권한 가드에 걸린다(lib/db/auth/policies.ts).
 *  - 퇴직·면직 발령은 `status='퇴사'`, `resigned_at=발령일` 까지 반영한다.
 *    role='inactive'·세션 회수 등 계정 정리는 오프보딩 플로우의 책임이라 건드리지 않는다.
 *  - 반영이 끝난 뒤에만 `status='발령완료'` 로 승격한다. 중간에 실패하면 '대기' 로 남아
 *    다음 실행에서 다시 시도되고, 화면에도 "미반영" 으로 드러난다.
 *
 * 날짜는 전부 KST 기준 `YYYY-MM-DD` 문자열 비교다(`new Date()` 로컬 비교 금지 —
 * 워커는 UTC 라 하루가 밀린다).
 */
import { getKoreanTodayString } from '@/lib/seoul-time';
import {
  getD1Binding,
  getD1Drizzle,
  personnel_appointments as personnelAppointmentsTable,
  staff_members as staffMembersTable,
  and,
  eq,
  lte,
} from '@/lib/db';

/** 아직 staff_members 에 반영되지 않은 발령 */
const PENDING_STATUS = '대기';
/** 반영이 끝난 발령 */
const APPLIED_STATUS = '발령완료';

/** 한 번의 실행에서 처리할 최대 건수 — 폭주 방지. */
const MAX_APPLY_PER_RUN = 500;

export type AppointmentApplyResult = {
  todayKey: string;
  scanned: number;
  applied: number;
  skipped: number;
  failed: number;
  errors: string[];
};

/**
 * 발령 종류가 퇴직·면직 계열인지.
 * 키워드는 `app/main/모바일/인사관리/발령필터.tsx` 의 classifyOrderType '퇴직' 버킷과 동일하게 유지할 것.
 */
function isSeparationOrder(orderType: string | null | undefined): boolean {
  const text = String(orderType ?? '').trim();
  if (!text) return false;
  return text.includes('퇴직') || text.includes('면직') || text.includes('퇴사');
}

/** `YYYY.MM.DD` / `YYYY-MM-DD` 를 ISO 키로 정규화. 형식이 아니면 null. */
function toIsoDateKey(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const normalized = raw.replace(/[./]/g, '-');
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

/** 값이 실제로 바뀔 때만 반환. 공백·동일값이면 null. */
function pickChanged(next: string | null | undefined, prev: string | null | undefined): string | null {
  const trimmed = String(next ?? '').trim();
  if (!trimmed || trimmed === String(prev ?? '').trim()) return null;
  return trimmed;
}

/**
 * 발령일이 도래한 대기 발령을 모두 적용한다.
 *
 * @param todayKey KST 기준 오늘(YYYY-MM-DD). 미지정 시 현재 KST 날짜.
 */
export async function applyDueAppointments(todayKey?: string): Promise<AppointmentApplyResult> {
  const today = toIsoDateKey(todayKey) ?? getKoreanTodayString();
  const result: AppointmentApplyResult = {
    todayKey: today,
    scanned: 0,
    applied: 0,
    skipped: 0,
    failed: 0,
    errors: [] };

  const d1 = await getD1Binding();
  if (!d1) {
    result.errors.push('D1 binding not available');
    return result;
  }
  const db = getD1Drizzle(d1);

  const due = await db
    .select({
      id: personnelAppointmentsTable.id,
      staff_id: personnelAppointmentsTable.staff_id,
      order_type: personnelAppointmentsTable.order_type,
      effective_date: personnelAppointmentsTable.effective_date,
      after_dept: personnelAppointmentsTable.after_dept,
      after_position: personnelAppointmentsTable.after_position,
      after_role: personnelAppointmentsTable.after_role })
    .from(personnelAppointmentsTable)
    .where(
      and(
        eq(personnelAppointmentsTable.status, PENDING_STATUS),
        lte(personnelAppointmentsTable.effective_date, today),
      ),
    )
    .limit(MAX_APPLY_PER_RUN);

  result.scanned = due.length;

  for (const row of due) {
    const appointmentId = String(row.id ?? '');
    const staffId = String(row.staff_id ?? '').trim();
    const effectiveDate = toIsoDateKey(row.effective_date);

    // 대상 직원이나 발령일이 성립하지 않으면 손대지 않는다(수동 확인 대상으로 남긴다).
    if (!appointmentId || !staffId || !effectiveDate) {
      result.skipped += 1;
      continue;
    }

    try {
      // 변경 전 값을 읽어 "실제로 달라지는 것만" 갱신한다.
      const beforeRows = await db
        .select({
          department: staffMembersTable.department,
          position: staffMembersTable.position,
          role: staffMembersTable.role })
        .from(staffMembersTable)
        .where(eq(staffMembersTable.id, staffId))
        .limit(1);

      if (beforeRows.length === 0) {
        result.skipped += 1;
        result.errors.push(`발령 ${appointmentId}: 대상 직원(${staffId})을 찾지 못했습니다.`);
        continue;
      }
      const before = beforeRows[0];

      const staffUpdates: Record<string, unknown> = {};
      const nextDept = pickChanged(row.after_dept, before.department);
      if (nextDept) staffUpdates.department = nextDept;
      const nextPosition = pickChanged(row.after_position, before.position);
      if (nextPosition) staffUpdates.position = nextPosition;
      const nextRole = pickChanged(row.after_role, before.role);
      if (nextRole) staffUpdates.role = nextRole;
      if (isSeparationOrder(row.order_type)) {
        staffUpdates.status = '퇴사';
        staffUpdates.resigned_at = effectiveDate;
      }

      if (Object.keys(staffUpdates).length > 0) {
        staffUpdates.updated_at = new Date().toISOString();
        await db.update(staffMembersTable).set(staffUpdates).where(eq(staffMembersTable.id, staffId));
      }

      // 반영이 끝난 뒤에만 승격한다. 실패하면 '대기' 로 남아 다음 실행에서 재시도된다.
      await db
        .update(personnelAppointmentsTable)
        .set({ status: APPLIED_STATUS })
        .where(eq(personnelAppointmentsTable.id, appointmentId));

      result.applied += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push(
        `발령 ${appointmentId} 적용 실패: ${String((error as { message?: string } | null)?.message || error || 'unknown')}`,
      );
    }
  }

  return result;
}
