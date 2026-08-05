import {
  getD1Binding,
  getD1Drizzle,
  push_subscriptions as pushSubscriptionsTable,
  staff_members as staffMembersTable,
  inArray } from '@/lib/db';

/**
 * 푸시 구독 정리 코어 (SSOT).
 *
 * 8차 D12-008: cron(`/api/cron/push-subscription-cleanup`)과 관리도구
 * (`system-master/_shared.cleanupPushSubscriptionsInternal`)에 같은 로직이 2벌 있었고
 * 관리도구 사본에는 `:415` "이하 공통 로직" 이라는 주석까지 붙어 복붙을 자인했다.
 *
 * 두 사본의 실측 차이는 **재직 판정 하나**였다.
 *  - cron: staff.status 를 조회해 '퇴사'/'퇴직' 을 제외 → 퇴사자 구독을 orphan 으로 삭제
 *  - 관리도구: staff.status 를 조회조차 하지 않음 → staff row 만 있으면 유지
 * 그래서 관리도구로 정리한 직후 통계와 cron 실행 후 통계가 어긋났다(퇴사자 수만큼).
 *
 * 정본은 cron 쪽이다 — 퇴사자에게 푸시 구독을 남겨 둘 이유가 없고, 어차피 매일 03시
 * (`wrangler.toml:47` `0 3 * * *`) cron 이 지워서 최대 24시간이면 cron 결과로 수렴했다.
 * 즉 관리도구 사본은 '느슨한 쪽'이 아니라 그냥 하루 뒤 뒤집히는 잘못된 결과였다.
 */

/** 구독을 정리 대상으로 볼 퇴사 상태 문자열. */
const RESIGNED_STATUSES = new Set(['퇴사', '퇴직']);

export type PushSubscriptionCleanupRow = {
  id: string;
  staff_id: string | null;
  endpoint: string | null;
};

export type PushSubscriptionCleanupResult = {
  totalBefore: number;
  deleted: number;
  emptyEndpoint: number;
  nullStaff: number;
  orphanStaff: number;
  duplicateGroups: number;
  duplicateRowsDeleted: number;
  totalAfter: number;
};

/** 같은 endpoint 가 여러 행일 때 남길 행: staff_id 가 있는 쪽 → id 내림차순. */
export function pickPreferredSubscription(rows: PushSubscriptionCleanupRow[]) {
  return [...rows].sort((left, right) => {
    const leftHasStaff = left.staff_id ? 1 : 0;
    const rightHasStaff = right.staff_id ? 1 : 0;
    if (leftHasStaff !== rightHasStaff) return rightHasStaff - leftHasStaff;
    return String(right.id).localeCompare(String(left.id));
  })[0];
}

/** 삭제 대상 id 와 사유별 집계를 계산하는 순수 함수 (DB 접근 없음). */
export function planPushSubscriptionCleanup(
  rows: PushSubscriptionCleanupRow[],
  validStaffIds: Set<string>,
) {
  const deleteIds = new Set<string>();
  const validRows: PushSubscriptionCleanupRow[] = [];

  let emptyEndpoint = 0;
  let nullStaff = 0;
  let orphanStaff = 0;

  for (const row of rows) {
    const endpoint = String(row.endpoint || '').trim();
    const staffId = String(row.staff_id || '').trim();

    if (!endpoint) {
      emptyEndpoint += 1;
      deleteIds.add(row.id);
      continue;
    }
    if (!staffId) {
      nullStaff += 1;
      deleteIds.add(row.id);
      continue;
    }
    if (!validStaffIds.has(staffId)) {
      orphanStaff += 1;
      deleteIds.add(row.id);
      continue;
    }

    validRows.push({ ...row, endpoint, staff_id: staffId });
  }

  const endpointGroups = new Map<string, PushSubscriptionCleanupRow[]>();
  for (const row of validRows) {
    const key = String(row.endpoint || '');
    const bucket = endpointGroups.get(key);
    if (bucket) bucket.push(row);
    else endpointGroups.set(key, [row]);
  }

  let duplicateGroups = 0;
  let duplicateRowsDeleted = 0;

  for (const group of endpointGroups.values()) {
    if (group.length <= 1) continue;
    duplicateGroups += 1;
    const keep = pickPreferredSubscription(group);
    for (const row of group) {
      if (row.id === keep.id) continue;
      duplicateRowsDeleted += 1;
      deleteIds.add(row.id);
    }
  }

  return {
    deleteIds: Array.from(deleteIds),
    emptyEndpoint,
    nullStaff,
    orphanStaff,
    duplicateGroups,
    duplicateRowsDeleted };
}

/** 조회 → 판정 → 삭제까지 한 번에. cron 과 관리도구가 옵션 없이 이 함수만 호출한다. */
export async function runPushSubscriptionCleanup(
  label: string,
): Promise<PushSubscriptionCleanupResult> {
  const d1 = await getD1Binding();
  if (!d1) throw new Error(`[push-subscription-cleanup] D1 binding not available (${label})`);
  const db = getD1Drizzle(d1);

  const [subscriptionRows, staffRows] = await Promise.all([
    db
      .select({
        id: pushSubscriptionsTable.id,
        staff_id: pushSubscriptionsTable.staff_id,
        endpoint: pushSubscriptionsTable.endpoint })
      .from(pushSubscriptionsTable),
    db
      .select({ id: staffMembersTable.id, status: staffMembersTable.status })
      .from(staffMembersTable),
  ]);

  const rows = subscriptionRows as PushSubscriptionCleanupRow[];
  const validStaffIds = new Set(
    staffRows
      .filter((row) => !RESIGNED_STATUSES.has(String(row.status ?? '').trim()))
      .map((row) => String(row.id || '')),
  );

  const plan = planPushSubscriptionCleanup(rows, validStaffIds);

  // inArray bind 한도에 맞춰 청크 분할(100 — 두 사본 중 보수적인 쪽을 채택).
  const chunkSize = 100;
  for (let index = 0; index < plan.deleteIds.length; index += chunkSize) {
    const chunk = plan.deleteIds.slice(index, index + chunkSize);
    await db.delete(pushSubscriptionsTable).where(inArray(pushSubscriptionsTable.id, chunk));
  }

  return {
    totalBefore: rows.length,
    deleted: plan.deleteIds.length,
    emptyEndpoint: plan.emptyEndpoint,
    nullStaff: plan.nullStaff,
    orphanStaff: plan.orphanStaff,
    duplicateGroups: plan.duplicateGroups,
    duplicateRowsDeleted: plan.duplicateRowsDeleted,
    totalAfter: rows.length - plan.deleteIds.length };
}
