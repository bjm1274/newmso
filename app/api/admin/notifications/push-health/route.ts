import { NextResponse } from 'next/server';
import {
  isAdminSession,
  isSystemMasterSession,
  readSessionFromRequest } from '@/lib/server-session';
import { collectChatPushQueueHealth } from '@/lib/chat-push-health';
import {
  getD1Binding,
  getD1Drizzle,
  resolveDataBackend,
  push_subscriptions as pushSubscriptionsTable,
  staff_members as staffMembersTable } from '@/lib/db';
import { logD1BindingMissing } from '@/lib/db/mirror-metrics';


export const dynamic = 'force-dynamic';

type PushSubscriptionRow = {
  id: string;
  staff_id: string | null;
  endpoint: string | null;
};

async function requireD1ForPushHealth(label: string) {
  const backend = await resolveDataBackend();
  const d1 = await getD1Binding();
  if (!d1) {
    logD1BindingMissing({ label, backend });
    throw new Error(`[push-health] D1 binding not available (${label})`);
  }
  return getD1Drizzle(d1);
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

    // Phase 8-H — admin 진단 read 호출은 D1 binding 직접 사용으로 전환.
    const queueSummary = await collectChatPushQueueHealth(null);

    const db = await requireD1ForPushHealth('push-health:select');
    const [subscriptionData, staffData] = await Promise.all([
      db
        .select({
          id: pushSubscriptionsTable.id,
          staff_id: pushSubscriptionsTable.staff_id,
          endpoint: pushSubscriptionsTable.endpoint })
        .from(pushSubscriptionsTable),
      db.select({ id: staffMembersTable.id }).from(staffMembersTable),
    ]);

    const subscriptionRows: PushSubscriptionRow[] = subscriptionData.map((row) => ({
      id: String(row.id || ''),
      staff_id: row.staff_id ?? null,
      endpoint: row.endpoint ?? null }));
    const validStaffIds = new Set(
      staffData.map((row) => String(row.id || '')),
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
        oldestPendingAt: queueSummary.oldestPendingAt || null },
      subscriptions: {
        total: subscriptionRows.length,
        nullStaff: nullStaffSubscriptions,
        orphan: orphanSubscriptions,
        duplicateEndpointGroups: duplicateEndpointInfo.duplicateGroups,
        duplicateRows: duplicateEndpointInfo.duplicateRows } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Push health check failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
