import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  isAdminSession,
  isSystemMasterSession,
  readSessionFromRequest,
} from '@/lib/server-session';
import { collectChatPushQueueHealth } from '@/lib/chat-push-health';


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

    const queueSummary = await collectChatPushQueueHealth(supabase);

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
        migrationReady: queueSummary.migrationReady,
        total: queueSummary.total,
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
