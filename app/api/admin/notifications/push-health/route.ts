import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  isAdminSession,
  isSystemMasterSession,
  readSessionFromRequest,
} from '@/lib/server-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type QueueHealthRow = {
  id: string;
  created_at: string | null;
  processed_at?: string | null;
  processing_started_at?: string | null;
  attempt_count?: number | null;
  next_attempt_at?: string | null;
  dead_lettered_at?: string | null;
};

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

function isMissingColumnError(error: any, columnName: string) {
  if (!error) return false;
  const code = String(error?.code || '');
  const message = String(error?.message || error?.details || '').toLowerCase();
  return code === '42703' && message.includes(columnName.toLowerCase());
}

function groupDuplicateEndpoints(rows: PushSubscriptionRow[]) {
  const grouped = new Map<string, number>();
  for (const row of rows) {
    const endpoint = String(row.endpoint || '').trim();
    if (!endpoint) continue;
    grouped.set(endpoint, (grouped.get(endpoint) || 0) + 1);
  }

  let duplicateGroups = 0;
  let duplicateRows = 0;
  for (const count of grouped.values()) {
    if (count <= 1) continue;
    duplicateGroups += 1;
    duplicateRows += count - 1;
  }

  return { duplicateGroups, duplicateRows };
}

export async function GET(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session || (!isAdminSession(session.user) && !isSystemMasterSession(session.user))) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    const queueRes = await supabase
      .from('chat_push_jobs')
      .select(
        'id, created_at, processed_at, processing_started_at, attempt_count, next_attempt_at, dead_lettered_at',
      );

    let queueRows = [] as QueueHealthRow[];
    let queueMigrationReady = true;

    if (queueRes.error) {
      if (
        isMissingColumnError(queueRes.error, 'next_attempt_at') ||
        isMissingColumnError(queueRes.error, 'dead_lettered_at')
      ) {
        const fallbackQueueRes = await supabase
          .from('chat_push_jobs')
          .select('id, created_at, processed_at, processing_started_at, attempt_count');

        if (fallbackQueueRes.error) {
          throw fallbackQueueRes.error;
        }

        queueMigrationReady = false;
        queueRows = (fallbackQueueRes.data || []) as QueueHealthRow[];
      } else {
        throw queueRes.error;
      }
    } else {
      queueRows = (queueRes.data || []) as QueueHealthRow[];
    }

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

    const subscriptionRows = (subscriptionRes.data || []) as PushSubscriptionRow[];
    const validStaffIds = new Set(
      (staffRes.data || []).map((row: { id: string | null }) => String(row.id || '')),
    );
    const duplicateEndpointInfo = groupDuplicateEndpoints(subscriptionRows);

    const now = Date.now();
    const queueSummary = queueRows.reduce(
      (acc, row) => {
        const processedAt = row.processed_at ? Date.parse(String(row.processed_at)) : NaN;
        const nextAttemptAt = row.next_attempt_at ? Date.parse(String(row.next_attempt_at)) : NaN;
        const deadLettered = Boolean(row.dead_lettered_at);
        const isProcessed = Number.isFinite(processedAt);

        if (!isProcessed) {
          acc.pending += 1;
          if (!acc.oldestPendingAt || String(row.created_at || '') < acc.oldestPendingAt) {
            acc.oldestPendingAt = String(row.created_at || '');
          }
        }

        if (deadLettered) {
          acc.deadLettered += 1;
        } else if (!isProcessed) {
          if (row.attempt_count && row.attempt_count > 0) {
            acc.retrying += 1;
          }
          if (!queueMigrationReady || !Number.isFinite(nextAttemptAt) || nextAttemptAt <= now) {
            acc.ready += 1;
          }
        }

        if (row.processing_started_at) {
          acc.inFlight += 1;
        }

        return acc;
      },
      {
        pending: 0,
        ready: 0,
        retrying: 0,
        deadLettered: 0,
        inFlight: 0,
        oldestPendingAt: '',
      },
    );

    const nullStaffSubscriptions = subscriptionRows.filter(
      (row) => !String(row.staff_id || '').trim(),
    ).length;
    const orphanSubscriptions = subscriptionRows.filter((row) => {
      const staffId = String(row.staff_id || '').trim();
      return Boolean(staffId) && !validStaffIds.has(staffId);
    }).length;

    return NextResponse.json({
      ok: true,
      queue: {
        migrationReady: queueMigrationReady,
        total: queueRows.length,
        pending: queueSummary.pending,
        ready: queueSummary.ready,
        retrying: queueSummary.retrying,
        deadLettered: queueSummary.deadLettered,
        inFlight: queueSummary.inFlight,
        oldestPendingAt: queueSummary.oldestPendingAt || null,
      },
      subscriptions: {
        total: subscriptionRows.length,
        nullStaff: nullStaffSubscriptions,
        orphan: orphanSubscriptions,
        duplicateEndpointGroups: duplicateEndpointInfo.duplicateGroups,
        duplicateRows: duplicateEndpointInfo.duplicateRows,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Push health check failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
