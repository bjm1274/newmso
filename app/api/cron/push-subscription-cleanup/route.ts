import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runLicenseExpiryJobs, type LicenseExpiryJobsResult } from '@/lib/license-expiry-jobs';
import {
  runContractExpiryJobs,
  type ContractExpiryJobResult,
} from '@/lib/contract-expiry-jobs';
import {
  getD1Binding,
  getD1Drizzle,
  resolveDataBackend,
  push_subscriptions as pushSubscriptionsTable,
  staff_members as staffMembersTable,
  notifications as notificationsTable,
  chat_push_jobs as chatPushJobsTable,
  inArray,
  isNull,
  isNotNull,
  lt,
  and,
} from '@/lib/db';
import { logD1BindingMissing } from '@/lib/db/mirror-metrics';

async function requireD1ForCleanup(label: string) {
  const backend = await resolveDataBackend();
  const d1 = await getD1Binding();
  if (!d1) {
    logD1BindingMissing({ label, backend });
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

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase service role configuration is missing.');
  }

  return createClient(supabaseUrl, serviceKey);
}

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

async function cleanupRetentionLogs(supabase: ReturnType<typeof createAdminClient>) {
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

  const backend = await resolveDataBackend();
  if (backend === 'd1') {
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

  // 기존 Supabase 경로
  // 읽음 처리되고 90일 경과한 알림은 삭제 (egress·storage 절감)
  const notifRes = await supabase
    .from('notifications')
    .delete({ count: 'estimated' })
    .not('read_at', 'is', null)
    .lt('read_at', notifCutoff);

  if (notifRes.error) {
    result.notificationsError = notifRes.error.message;
  } else {
    result.notificationsDeleted = notifRes.count ?? 0;
  }

  // 발송 처리(또는 폐기)된 chat_push_jobs 30일 경과 정리
  const pushRes = await supabase
    .from('chat_push_jobs')
    .delete({ count: 'estimated' })
    .not('processed_at', 'is', null)
    .lt('processed_at', pushCutoff);

  if (pushRes.error) {
    result.chatPushJobsError = pushRes.error.message;
  } else {
    result.chatPushJobsDeleted = pushRes.count ?? 0;
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
        endpoint: pushSubscriptionsTable.endpoint,
      })
      .from(pushSubscriptionsTable),
    db.select({ id: staffMembersTable.id }).from(staffMembersTable),
  ]);

  const validStaffIds = new Set(
    staffRows.map((row) => String(row.id || '')),
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
      staff_id: staffId,
    });
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
    totalAfter: rows.length - deleteIds.size,
  };
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
      const supabase = createAdminClient();
      licenseJobs = await runLicenseExpiryJobs(supabase);
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
      const supabase = createAdminClient();
      contractJobs = await runContractExpiryJobs(supabase);
    } catch (err) {
      contractError = err instanceof Error ? err.message : 'contract-expiry-jobs failed';
      console.error('[push-subscription-cleanup] contract jobs failed:', err);
    }

    // 알림/푸시잡 보관 정책 정리도 함께 (Supabase egress 절감)
    let retention: Awaited<ReturnType<typeof cleanupRetentionLogs>> | null = null;
    let retentionError: string | null = null;
    try {
      const supabase = createAdminClient();
      retention = await cleanupRetentionLogs(supabase);
    } catch (err) {
      retentionError = err instanceof Error ? err.message : 'retention cleanup failed';
      console.error('[push-subscription-cleanup] retention cleanup failed:', err);
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Push subscription cleanup failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
