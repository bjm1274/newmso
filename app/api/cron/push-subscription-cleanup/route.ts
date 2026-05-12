import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runLicenseExpiryJobs, type LicenseExpiryJobsResult } from '@/lib/license-expiry-jobs';

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

async function deleteSubscriptionsByIds(
  supabase: ReturnType<typeof createAdminClient>,
  ids: string[],
) {
  if (ids.length === 0) return;

  const chunkSize = 200;
  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    const { error } = await supabase.from('push_subscriptions').delete().in('id', chunk);
    if (error) throw error;
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

async function cleanupPushSubscriptions() {
  const supabase = createAdminClient();

  const [subscriptionRes, staffRes] = await Promise.all([
    supabase.from('push_subscriptions').select('id, staff_id, endpoint'),
    supabase.from('staff_members').select('id'),
  ]);

  if (subscriptionRes.error) {
    throw subscriptionRes.error;
  }

  if (staffRes.error) {
    throw staffRes.error;
  }

  const validStaffIds = new Set(
    (staffRes.data || []).map((row: { id: string | null }) => String(row.id || '')),
  );

  const rows = (subscriptionRes.data || []) as PushSubscriptionRow[];
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

  await deleteSubscriptionsByIds(supabase, Array.from(deleteIds));

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

    return NextResponse.json({
      ok: true,
      ...result,
      licenseJobs,
      ...(licenseError ? { licenseError } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Push subscription cleanup failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
