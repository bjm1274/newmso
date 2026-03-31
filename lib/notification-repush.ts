import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ensureWebPushConfigured, sendWebPushNotification } from '@/lib/web-push';
import { sendFcmBatch } from '@/lib/firebase-admin';

type NotificationRow = {
  id: string;
  user_id: string;
  type: string | null;
  title: string | null;
  body: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
};

type PushSubscriptionRow = {
  id: string;
  staff_id: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  fcm_token?: string | null;
};

export type NotificationRepushResult = {
  ok: boolean;
  scanned: number;
  eligible: number;
  sent: number;
  failed: number;
  skipped: number;
  pushDisabled: boolean;
  errors: string[];
};

const DEFAULT_DELAY_MINUTES = 10;
const DEFAULT_COOLDOWN_MINUTES = 20;
const DEFAULT_MAX_ATTEMPTS = 2;

function getAdminClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase service role configuration is missing.');
  }
  return createClient(supabaseUrl, serviceKey);
}

function normalizeScopedUserIds(userIds?: string[] | null) {
  if (!Array.isArray(userIds) || userIds.length === 0) return [];
  return Array.from(new Set(userIds.map((id) => String(id || '').trim()).filter(Boolean)));
}

function toMetadata(value: unknown) {
  return value && typeof value === 'object' ? { ...(value as Record<string, unknown>) } : {};
}

function toStringRecord(value: Record<string, unknown>) {
  return Object.entries(value).reduce<Record<string, string>>((acc, [key, entry]) => {
    if (entry === null || entry === undefined) return acc;
    acc[key] = typeof entry === 'string' ? entry : JSON.stringify(entry);
    return acc;
  }, {});
}

function parseIso(value: unknown) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildRepushPayload(row: NotificationRow) {
  const metadata = toMetadata(row.metadata);
  const type = String(row.type || metadata.type || 'notification');
  const title = String(row.title || '알림');
  const body = String(row.body || '').trim();
  const data = {
    ...metadata,
    id: row.id,
    notification_id: row.id,
    type,
  };

  return {
    title,
    body,
    tag: `erp-notification-repush-${row.id}`,
    data,
  };
}

async function patchNotificationMetadata(
  supabase: SupabaseClient,
  row: NotificationRow,
  metadataPatch: Record<string, unknown>,
) {
  const metadata = toMetadata(row.metadata);
  const { error } = await supabase
    .from('notifications')
    .update({ metadata: { ...metadata, ...metadataPatch } })
    .eq('id', row.id);

  if (error) {
    throw error;
  }
}

export async function processUnreadNotificationRepushServer(
  limit = 50,
  userIds?: string[] | null,
): Promise<NotificationRepushResult> {
  const supabase = getAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const cutoffIso = new Date(now.getTime() - DEFAULT_DELAY_MINUTES * 60 * 1000).toISOString();
  const scopedUserIds = normalizeScopedUserIds(userIds);

  let notificationQuery = supabase
    .from('notifications')
    .select('id,user_id,type,title,body,metadata,created_at')
    .is('read_at', null)
    .lte('created_at', cutoffIso)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (scopedUserIds.length > 0) {
    notificationQuery = notificationQuery.in('user_id', scopedUserIds);
  }

  const { data, error } = await notificationQuery;
  if (error) {
    throw error;
  }

  const notifications = (data || []) as NotificationRow[];
  if (notifications.length === 0) {
    return {
      ok: true,
      scanned: 0,
      eligible: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      pushDisabled: false,
      errors: [],
    };
  }

  const targetUserIds = Array.from(new Set(notifications.map((row) => String(row.user_id || '')).filter(Boolean)));
  const { data: subscriptionRows, error: subscriptionError } = await supabase
    .from('push_subscriptions')
    .select('id, staff_id, endpoint, p256dh, auth, fcm_token')
    .in('staff_id', targetUserIds);

  if (subscriptionError) {
    throw subscriptionError;
  }

  const subscriptionsByUser = new Map<string, PushSubscriptionRow[]>();
  ((subscriptionRows || []) as PushSubscriptionRow[]).forEach((row) => {
    const userId = String(row.staff_id || '').trim();
    if (!userId) return;
    subscriptionsByUser.set(userId, [...(subscriptionsByUser.get(userId) || []), row]);
  });

  let pushDisabled = false;
  try {
    ensureWebPushConfigured();
  } catch {
    pushDisabled = true;
  }

  let eligible = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of notifications) {
    const metadata = toMetadata(row.metadata);
    const lastRepushAt = parseIso(metadata.repush_sent_at);
    const repushAttempts = Number(metadata.repush_attempt_count || 0);

    if (repushAttempts >= DEFAULT_MAX_ATTEMPTS) {
      skipped += 1;
      continue;
    }

    if (lastRepushAt && now.getTime() - lastRepushAt.getTime() < DEFAULT_COOLDOWN_MINUTES * 60 * 1000) {
      skipped += 1;
      continue;
    }

    const userSubscriptions = subscriptionsByUser.get(String(row.user_id || '').trim()) || [];
    const uniqueSubscriptions = new Map<string, PushSubscriptionRow>();
    userSubscriptions.forEach((subscription) => {
      if (!subscription.endpoint) return;
      if (!subscription.p256dh || !subscription.auth || !/^https?:\/\//i.test(String(subscription.endpoint))) return;
      if (!uniqueSubscriptions.has(subscription.endpoint)) {
        uniqueSubscriptions.set(subscription.endpoint, subscription);
      }
    });

    const uniqueFcmTokens = Array.from(
      new Set(
        userSubscriptions
          .map((subscription) => String(subscription.fcm_token || '').trim())
          .filter(Boolean),
      ),
    );

    if (uniqueSubscriptions.size === 0 && uniqueFcmTokens.length === 0) {
      skipped += 1;
      continue;
    }

    const payload = buildRepushPayload(row);
    const payloadJson = JSON.stringify(payload);
    const payloadData = toStringRecord(payload.data);
    eligible += 1;

    let rowSent = 0;
    let rowFailed = 0;
    const expiredSubscriptionIds: string[] = [];
    const successfulFcmTokens = new Set<string>();

    if (uniqueFcmTokens.length > 0) {
      try {
        const fcmResult = await sendFcmBatch(uniqueFcmTokens, {
          title: payload.title,
          body: payload.body,
          data: payloadData,
        });
        fcmResult.success.forEach((token) => successfulFcmTokens.add(String(token)));
        rowSent += fcmResult.success.length > 0 ? 1 : 0;
        rowFailed += fcmResult.success.length === 0 ? 1 : 0;
        if (fcmResult.expired.length > 0) {
          await supabase
            .from('push_subscriptions')
            .update({ fcm_token: null })
            .in('fcm_token', fcmResult.expired);
        }
      } catch (fcmError) {
        rowFailed += 1;
        errors.push(`${row.id}: ${String((fcmError as Error)?.message || fcmError)}`);
      }
    } else if (pushDisabled && uniqueSubscriptions.size > 0) {
      rowFailed += 1;
    }

    const webTargets = Array.from(uniqueSubscriptions.values()).filter((subscription) => {
      const fcmToken = String(subscription.fcm_token || '').trim();
      return !fcmToken || !successfulFcmTokens.has(fcmToken);
    });

    if (!pushDisabled && webTargets.length > 0) {
      const webResults = await Promise.allSettled(
        webTargets.map((subscription) =>
          sendWebPushNotification(subscription, payloadJson).then(() => ({ ok: true as const, id: subscription.id })),
        ),
      );

      for (let index = 0; index < webResults.length; index += 1) {
        const result = webResults[index];
        if (result.status === 'fulfilled' && result.value.ok) {
          rowSent += 1;
          continue;
        }

        rowFailed += 1;
        const failure = result.status === 'rejected' ? result.reason : null;
        const statusCode = Number(failure?.statusCode || failure?.status || 0);
        if (statusCode === 404 || statusCode === 410) {
          expiredSubscriptionIds.push(webTargets[index].id);
        }
      }
    }

    if (expiredSubscriptionIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', expiredSubscriptionIds);
    }

    try {
      await patchNotificationMetadata(supabase, row, {
        repush_attempt_count: repushAttempts + 1,
        repush_sent_at: nowIso,
        repush_result: rowSent > 0 ? 'sent' : pushDisabled && webTargets.length > 0 ? 'web-push-disabled' : 'failed',
      });
    } catch (metadataError) {
      errors.push(`${row.id}: ${String((metadataError as Error)?.message || metadataError)}`);
    }

    if (rowSent > 0) {
      sent += 1;
    } else {
      failed += 1;
    }
  }

  return {
    ok: true,
    scanned: notifications.length,
    eligible,
    sent,
    failed,
    skipped,
    pushDisabled,
    errors,
  };
}
