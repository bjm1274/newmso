import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ensureWebPushConfigured, sendWebPushNotification } from '@/lib/web-push-cloudflare';
import { sendFcmBatch } from '@/lib/fcm-http';
import { isWithinPushQuietHours } from '@/lib/push-quiet-hours';
import { NOTICE_ROOM_ID } from '@/lib/constants';
import {
  resolveDataBackend,
  getD1Binding,
  getD1Drizzle,
  notifications as notificationsTable,
  push_subscriptions as pushSubscriptionsTable,
  eq,
  and,
  inArray,
  isNull,
  lte,
  gte,
} from '@/lib/db';

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
  created_at?: string | null;
};

// 재알림 대상 — 공지/전자결재 등 중요 항목만. 채팅 메시지는 리마인드 대상에서 제외(공지방은 예외).
const REPUSH_ELIGIBLE_TYPES = new Set(['approval', 'notice', 'announcement']);
const CHAT_NOTIFICATION_TYPES = new Set(['message', 'mention', 'chat']);

function getNormalizedTypeCandidates(row: NotificationRow): string[] {
  const metadata = toMetadata(row.metadata);
  return [row.type, metadata.type, metadata.notification_type]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
}

function isNoticeRoomMessage(row: NotificationRow): boolean {
  const metadata = toMetadata(row.metadata);
  const roomId = String(metadata.room_id || '').trim();
  return Boolean(roomId) && roomId === NOTICE_ROOM_ID;
}

function isRepushEligible(row: NotificationRow): boolean {
  const typeCandidates = getNormalizedTypeCandidates(row);
  // 공지/결재 등 중요 알림은 무조건 재발송 대상
  if (typeCandidates.some((value) => REPUSH_ELIGIBLE_TYPES.has(value))) return true;
  // 공지방(NOTICE_ROOM_ID) 채팅은 중요 공지로 보고 재발송
  if (isNoticeRoomMessage(row)) return true;
  return false;
}

function isChatNotification(row: NotificationRow): boolean {
  const typeCandidates = getNormalizedTypeCandidates(row);
  if (typeCandidates.some((value) => CHAT_NOTIFICATION_TYPES.has(value))) return true;
  const metadata = toMetadata(row.metadata);
  // metadata.room_id가 있고 공지방이 아니면 일반 채팅 → 재알림 제외
  if (metadata.room_id && !isNoticeRoomMessage(row)) return true;
  return false;
}

export type NotificationRepushResult = {
  ok: boolean;
  scanned: number;
  eligible: number;
  sent: number;
  failed: number;
  skipped: number;
  pushDisabled: boolean;
  errors: string[];
  reason?: string;
};

// 재알림 정책: 다음날 오전 9시에 1회만 재발송.
// cron(`0 0 * * *` = KST 09:00)에서 호출되며,
// 최소 12시간 ~ 최대 7일 사이의 안 읽은 중요 알림이 대상.
const REPUSH_MIN_AGE_HOURS = 12;
const REPUSH_MAX_AGE_DAYS = 7;
const DEFAULT_MAX_ATTEMPTS = 1;

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
  const merged = { ...metadata, ...metadataPatch };

  const backend = await resolveDataBackend();
  if (backend === 'd1') {
    const d1 = await getD1Binding();
    if (!d1) throw new Error('[notification-repush] D1 binding not available (patchNotificationMetadata)');
    const db = getD1Drizzle(d1);
    await db
      .update(notificationsTable)
      .set({ metadata: JSON.stringify(merged) })
      .where(eq(notificationsTable.id, String(row.id)));
    return;
  }

  // 기존 Supabase 경로
  const { error } = await supabase
    .from('notifications')
    .update({ metadata: merged })
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

  if (isWithinPushQuietHours(now)) {
    return {
      ok: true,
      scanned: 0,
      eligible: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      pushDisabled: false,
      errors: [],
      reason: 'quiet-hours',
    };
  }

  const nowIso = now.toISOString();
  const minAgeCutoffIso = new Date(now.getTime() - REPUSH_MIN_AGE_HOURS * 60 * 60 * 1000).toISOString();
  const maxAgeCutoffIso = new Date(now.getTime() - REPUSH_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const scopedUserIds = normalizeScopedUserIds(userIds);

  let notifications: NotificationRow[];
  let subscriptionsByUser: Map<string, PushSubscriptionRow[]>;

  const backend = await resolveDataBackend();
  if (backend === 'd1') {
    const d1 = await getD1Binding();
    if (!d1) throw new Error('[notification-repush] D1 binding not available (processUnreadNotificationRepushServer)');
    const db = getD1Drizzle(d1);

    // notifications 조회
    const baseConditions = [
      isNull(notificationsTable.read_at),
      lte(notificationsTable.created_at, minAgeCutoffIso),
      gte(notificationsTable.created_at, maxAgeCutoffIso),
    ];
    const conditions = scopedUserIds.length > 0
      ? [...baseConditions, inArray(notificationsTable.user_id, scopedUserIds)]
      : baseConditions;

    const { asc } = await import('drizzle-orm');
    const rawRows = await db
      .select({
        id: notificationsTable.id,
        user_id: notificationsTable.user_id,
        type: notificationsTable.type,
        title: notificationsTable.title,
        body: notificationsTable.body,
        metadata: notificationsTable.metadata,
        created_at: notificationsTable.created_at,
      })
      .from(notificationsTable)
      .where(and(...(conditions as Parameters<typeof and>)))
      .orderBy(asc(notificationsTable.created_at))
      .limit(limit);

    // D1 metadata는 TEXT → JSON.parse
    notifications = rawRows.map((row) => {
      let parsedMetadata: Record<string, unknown> | null = null;
      if (typeof row.metadata === 'string' && row.metadata.length > 0) {
        try {
          const parsed = JSON.parse(row.metadata) as unknown;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            parsedMetadata = parsed as Record<string, unknown>;
          }
        } catch { parsedMetadata = null; }
      } else if (row.metadata && typeof row.metadata === 'object') {
        parsedMetadata = row.metadata as Record<string, unknown>;
      }
      return {
        id: String(row.id ?? ''),
        user_id: String(row.user_id ?? ''),
        type: row.type ?? null,
        title: row.title ?? null,
        body: row.body ?? null,
        metadata: parsedMetadata,
        created_at: row.created_at ?? null,
      } satisfies NotificationRow;
    });

    if (notifications.length === 0) {
      return { ok: true, scanned: 0, eligible: 0, sent: 0, failed: 0, skipped: 0, pushDisabled: false, errors: [] };
    }

    const targetUserIds = Array.from(new Set(notifications.map((row) => String(row.user_id || '')).filter(Boolean)));
    const subRows = await db
      .select({
        id: pushSubscriptionsTable.id,
        staff_id: pushSubscriptionsTable.staff_id,
        endpoint: pushSubscriptionsTable.endpoint,
        p256dh: pushSubscriptionsTable.p256dh,
        auth: pushSubscriptionsTable.auth,
        fcm_token: pushSubscriptionsTable.fcm_token,
        created_at: pushSubscriptionsTable.created_at,
      })
      .from(pushSubscriptionsTable)
      .where(inArray(pushSubscriptionsTable.staff_id, targetUserIds));

    subscriptionsByUser = new Map<string, PushSubscriptionRow[]>();
    (subRows as PushSubscriptionRow[]).forEach((row) => {
      const uid = String(row.staff_id || '').trim();
      if (!uid) return;
      subscriptionsByUser.set(uid, [...(subscriptionsByUser.get(uid) || []), row]);
    });
  } else {
    // 기존 Supabase 경로
    let notificationQuery = supabase
      .from('notifications')
      .select('id,user_id,type,title,body,metadata,created_at')
      .is('read_at', null)
      .lte('created_at', minAgeCutoffIso)
      .gte('created_at', maxAgeCutoffIso)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (scopedUserIds.length > 0) {
      notificationQuery = notificationQuery.in('user_id', scopedUserIds);
    }

    const { data, error } = await notificationQuery;
    if (error) {
      throw error;
    }

    notifications = (data || []) as NotificationRow[];
    if (notifications.length === 0) {
      return { ok: true, scanned: 0, eligible: 0, sent: 0, failed: 0, skipped: 0, pushDisabled: false, errors: [] };
    }

    const targetUserIds = Array.from(new Set(notifications.map((row) => String(row.user_id || '')).filter(Boolean)));
    const { data: subscriptionRows, error: subscriptionError } = await supabase
      .from('push_subscriptions')
      .select('id, staff_id, endpoint, p256dh, auth, fcm_token, created_at')
      .in('staff_id', targetUserIds);

    if (subscriptionError) {
      throw subscriptionError;
    }

    subscriptionsByUser = new Map<string, PushSubscriptionRow[]>();
    ((subscriptionRows || []) as PushSubscriptionRow[]).forEach((row) => {
      const uid = String(row.staff_id || '').trim();
      if (!uid) return;
      subscriptionsByUser.set(uid, [...(subscriptionsByUser.get(uid) || []), row]);
    });
  }

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
    // 1) 채팅(message/mention)은 공지방을 제외하고 모두 재발송 대상에서 제외
    if (isChatNotification(row)) {
      skipped += 1;
      continue;
    }

    // 2) 공지/결재 등 중요 항목만 재발송 — 그 외 type은 스킵
    if (!isRepushEligible(row)) {
      skipped += 1;
      continue;
    }

    const metadata = toMetadata(row.metadata);
    const repushAttempts = Number(metadata.repush_attempt_count || 0);

    if (repushAttempts >= DEFAULT_MAX_ATTEMPTS) {
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

    // 같은 사용자의 잔재 fcm_token이 여러 개 남아있을 수 있으므로
    // 가장 최신(created_at 내림차순) 토큰 1개만 사용해 이중 발송 차단.
    let latestFcmToken: string | null = null;
    let latestFcmCreatedAt = -Infinity;
    for (const subscription of userSubscriptions) {
      const token = String(subscription.fcm_token || '').trim();
      if (!token) continue;
      const parsed = subscription.created_at ? Date.parse(String(subscription.created_at)) : 0;
      const createdAt = Number.isFinite(parsed) ? parsed : 0;
      if (createdAt > latestFcmCreatedAt) {
        latestFcmCreatedAt = createdAt;
        latestFcmToken = token;
      }
    }
    const uniqueFcmTokens = latestFcmToken ? [latestFcmToken] : [];

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
    if (uniqueFcmTokens.length > 0) {
      try {
        const fcmResult = await sendFcmBatch(uniqueFcmTokens, {
          title: payload.title,
          body: payload.body,
          data: payloadData,
        });
        rowSent += fcmResult.success.length > 0 ? 1 : 0;
        rowFailed += fcmResult.success.length === 0 ? 1 : 0;
        if (fcmResult.expired.length > 0) {
          const repushBackend = await resolveDataBackend();
          if (repushBackend === 'd1') {
            const d1b = await getD1Binding();
            if (d1b) {
              const dbRepush = getD1Drizzle(d1b);
              for (const expiredToken of fcmResult.expired) {
                await dbRepush
                  .update(pushSubscriptionsTable)
                  .set({ fcm_token: null })
                  .where(eq(pushSubscriptionsTable.fcm_token, expiredToken));
              }
            }
          } else {
            await supabase
              .from('push_subscriptions')
              .update({ fcm_token: null })
              .in('fcm_token', fcmResult.expired);
          }
        }
      } catch (fcmError) {
        rowFailed += 1;
        errors.push(`${row.id}: ${String((fcmError as Error)?.message || fcmError)}`);
      }
    } else if (pushDisabled && uniqueSubscriptions.size > 0) {
      rowFailed += 1;
    }

    const webTargets = Array.from(uniqueSubscriptions.values());

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
      const repushBackend = await resolveDataBackend();
      if (repushBackend === 'd1') {
        const d1b = await getD1Binding();
        if (d1b) {
          const dbRepush = getD1Drizzle(d1b);
          await dbRepush
            .delete(pushSubscriptionsTable)
            .where(inArray(pushSubscriptionsTable.id, expiredSubscriptionIds));
        }
      } else {
        await supabase.from('push_subscriptions').delete().in('id', expiredSubscriptionIds);
      }
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
