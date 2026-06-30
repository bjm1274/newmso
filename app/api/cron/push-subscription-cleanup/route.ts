import { NextResponse } from 'next/server';
import { runLicenseExpiryJobs, type LicenseExpiryJobsResult } from '@/lib/license-expiry-jobs';
import {
  runContractExpiryJobs,
  type ContractExpiryJobResult } from '@/lib/contract-expiry-jobs';
import {
  runInappNotificationJobs,
  type InappNotificationJobsResult } from '@/lib/inapp-notification-jobs';
import {
  getD1Binding,
  getD1Drizzle,
  push_subscriptions as pushSubscriptionsTable,
  staff_members as staffMembersTable,
  notifications as notificationsTable,
  chat_push_jobs as chatPushJobsTable,
  inArray,
  isNotNull,
  lt,
  and } from '@/lib/db';
import { logD1BindingMissing } from '@/lib/db/mirror-metrics';

async function requireD1ForCleanup(label: string) {
  const d1 = await getD1Binding();
  if (!d1) {
    logD1BindingMissing({ label, backend: 'd1' });
    throw new Error(`[push-subscription-cleanup] D1 binding not available (${label})`);
  }
  return getD1Drizzle(d1);
}

const CRON_SECRET = process.env.CRON_SECRET;

export const dynamic = 'force-dynamic';

type PushSubscriptionRow = {
  id: string;
  staff_id: string | null;
  endpoint: string | null;
};

async function deleteSubscriptionsByIds(ids: string[]) {
  if (ids.length === 0) return;

  // Phase 8-G — D1 직접 delete. inArray bind 한도(100)에 맞춰 청크 분할.
  const db = await requireD1ForCleanup('push_subscriptions:delete');
  const chunkSize = 100;
  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    await db.delete(pushSubscriptionsTable).where(inArray(pushSubscriptionsTable.id, chunk));
  }
}

function pickPreferredSubscription(rows: PushSubscriptionRow[]) {
  return [...rows].sort((left, right) => {
    const leftHasStaff = left.staff_id ? 1 : 0;
    const rightHasStaff = right.staff_id ? 1 : 0;
    if (leftHasStaff !== rightHasStaff) return rightHasStaff - leftHasStaff;
    return String(right.id).localeCompare(String(left.id));
  })[0];
}

async function cleanupRetentionLogs() {
  const result = { notificationsDeleted: 0, chatPushJobsDeleted: 0 } as {
    notificationsDeleted: number;
    chatPushJobsDeleted: number;
    notificationsError?: string;
    chatPushJobsError?: string;
  };

  const NOTIFICATION_RETENTION_DAYS = 90;
  const notifCutoff = new Date(
    Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const PUSH_JOB_RETENTION_DAYS = 30;
  const pushCutoff = new Date(
    Date.now() - PUSH_JOB_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // D1 경로: drizzle로 직접 삭제 (count 반환 없음 — 0으로 표기)
  const db = await requireD1ForCleanup('cleanupRetentionLogs');

  try {
    // 읽음 처리되고 90일 경과한 알림 삭제 (read_at IS NOT NULL AND read_at < notifCutoff)
    await db
      .delete(notificationsTable)
      .where(
        and(
          isNotNull(notificationsTable.read_at),
          lt(notificationsTable.read_at, notifCutoff),
        ),
      );
  } catch (err) {
    result.notificationsError = err instanceof Error ? err.message : String(err);
  }

  try {
    // 발송 처리된 chat_push_jobs 30일 경과 정리 (processed_at IS NOT NULL AND processed_at < pushCutoff)
    await db
      .delete(chatPushJobsTable)
      .where(
        and(
          isNotNull(chatPushJobsTable.processed_at),
          lt(chatPushJobsTable.processed_at, pushCutoff),
        ),
      );
  } catch (err) {
    result.chatPushJobsError = err instanceof Error ? err.message : String(err);
  }

  return result;
}

async function cleanupPushSubscriptions() {
  // Phase 8-G — D1 직접 select.
  const db = await requireD1ForCleanup('cleanup:select');
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

  // 재직 중인 staff_id 집합 — '퇴사' / '퇴직' 상태는 제외한다.
  // 퇴사자 행이 DB에 남아 있더라도 구독은 정리 대상으로 처리한다.
  const RESIGNED_STATUSES = new Set(['퇴사', '퇴직']);
  const validStaffIds = new Set(
    staffRows
      .filter((row) => !RESIGNED_STATUSES.has(String(row.status ?? '').trim()))
      .map((row) => String(row.id || '')),
  );

  const rows = subscriptionRows as PushSubscriptionRow[];
  const deleteIds = new Set<string>();
  const validRows: PushSubscriptionRow[] = [];

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

    validRows.push({
      ...row,
      endpoint,
      staff_id: staffId });
  }

  const endpointGroups = new Map<string, PushSubscriptionRow[]>();
  for (const row of validRows) {
    const key = String(row.endpoint || '');
    const bucket = endpointGroups.get(key);
    if (bucket) {
      bucket.push(row);
    } else {
      endpointGroups.set(key, [row]);
    }
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

  await deleteSubscriptionsByIds(Array.from(deleteIds));

  return {
    totalBefore: rows.length,
    deleted: deleteIds.size,
    emptyEndpoint,
    nullStaff,
    orphanStaff,
    duplicateGroups,
    duplicateRowsDeleted,
    totalAfter: rows.length - deleteIds.size };
}

export async function GET(req: Request) {
  if (!CRON_SECRET) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured', ok: false },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await cleanupPushSubscriptions();

    // 동일 새벽 시간대 정리 작업이라 license 만료/보수교육 알림도 함께 실행
    // (Workers Free Plan cron 5개 한도 → 별도 cron 대신 본 cron에 합침).
    // license 작업이 실패해도 cleanup 결과는 반환되어야 하므로 try/catch로 격리.
    let licenseJobs: LicenseExpiryJobsResult | null = null;
    let licenseError: string | null = null;
    try {
      licenseJobs = await runLicenseExpiryJobs();
    } catch (err) {
      licenseError = err instanceof Error ? err.message : 'license-expiry-jobs failed';
      console.error('[push-subscription-cleanup] license jobs failed:', err);
    }

    // 수습/계약 만료 7일 전 관리자 알림도 함께 실행
    // (Workers Free Plan cron 5개 한도 → 별도 cron 대신 본 cron에 합침).
    // 단독 잡 실패가 cleanup·license·retention 결과에 영향 없도록 try/catch 격리.
    let contractJobs: ContractExpiryJobResult | null = null;
    let contractError: string | null = null;
    try {
      contractJobs = await runContractExpiryJobs();
    } catch (err) {
      contractError = err instanceof Error ? err.message : 'contract-expiry-jobs failed';
      console.error('[push-subscription-cleanup] contract jobs failed:', err);
    }

    // 알림/푸시잡 보관 정책 정리도 함께 (Supabase egress 절감)
    let retention: Awaited<ReturnType<typeof cleanupRetentionLogs>> | null = null;
    let retentionError: string | null = null;
    try {
      retention = await cleanupRetentionLogs();
    } catch (err) {
      retentionError = err instanceof Error ? err.message : 'retention cleanup failed';
      console.error('[push-subscription-cleanup] retention cleanup failed:', err);
    }

    // 인앱 알림 보강(결재 차례/재고/급여/교육/근태/금지어/메시지) cron 통합 실행.
    // Workers Free Plan cron 5개 한도(wrangler.toml) 때문에 단독 cron 등록이 불가능 →
    // 본 새벽 정리 cron에 piggyback 한다. KST 12:00 1회/일 실행이라 즉시성은 낮지만
    // "영영 알림이 만들어지지 않는" 상태는 해소된다.
    // 더 자주 발송이 필요하다면 외부 cron 서비스(GitHub Actions, cron-job.org 등)에서
    // Bearer CRON_SECRET 로 /api/cron/inapp-notifications 를 5분 주기로 호출하면 된다.
    // 단독 잡 실패가 cleanup·license·contract·retention 결과에 영향 없도록 try/catch 격리.
    let inappNotifications: InappNotificationJobsResult | null = null;
    let inappNotificationsError: string | null = null;
    try {
      inappNotifications = await runInappNotificationJobs();
    } catch (err) {
      inappNotificationsError =
        err instanceof Error ? err.message : 'inapp-notification-jobs failed';
      console.error('[push-subscription-cleanup] inapp-notification-jobs failed:', err);
    }

    return NextResponse.json({
      ok: true,
      ...result,
      licenseJobs,
      ...(licenseError ? { licenseError } : {}),
      contractJobs,
      ...(contractError ? { contractError } : {}),
      retention,
      ...(retentionError ? { retentionError } : {}),
      inappNotifications,
      ...(inappNotificationsError ? { inappNotificationsError } : {}) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Push subscription cleanup failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
