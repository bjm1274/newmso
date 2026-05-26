/**
 * 인앱 알림 INSERT 후, 해당 사용자들에게 FCM/WebPush 푸시를 보내는 공통 헬퍼.
 *
 * 채팅 도메인 전용인 `lib/chat-push-dispatch.ts`와 책임이 분리되어 있다
 * (메시지 메타·앨범 배치·뮤트 룸 같은 채팅 특화 로직 없이, 임의 알림 row에
 * 대한 push 발송만 담당).
 *
 * 호출 시점: cron 인앱 알림 보강(`insertNotificationsChunked`)의 마지막,
 * 혹은 서버 라우트에서 알림 row를 직접 만든 직후.
 *
 * 정책:
 *   - 같은 staff_id가 push_subscriptions에 여러 행 갖고 있을 수 있음 →
 *     fcm_token은 created_at 내림차순 가장 최신 1개만 사용 (이중 발송 차단).
 *   - FCM 토큰이 있는 사용자에게는 FCM만 발송하고 Web Push는 건너뜀
 *     (동일 기기 이중 알림 방지 — 기존 chat-push-dispatch 정책과 동일).
 *   - WebPush 만료(404/410) endpoint는 push_subscriptions에서 즉시 삭제.
 *   - FCM 만료 토큰은 fcm_token=null로 무효화.
 *   - 푸시 실패 row가 있어도 전체를 중단하지 않고 로그만 남긴다.
 */
import 'server-only';
import { ensureWebPushConfigured, sendWebPushNotification } from '@/lib/web-push-cloudflare';
import { sendFcmBatch } from '@/lib/fcm-http';
import {
  getD1Binding,
  getD1Drizzle,
  push_subscriptions as pushSubscriptionsTable,
  inArray,
  eq,
} from '@/lib/db';

export type NotificationPushRow = {
  user_id: string;
  type: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown> | null;
};

type PushSubscriptionRow = {
  id: string;
  staff_id: string | null;
  endpoint: string | null;
  p256dh: string | null;
  auth: string | null;
  fcm_token: string | null;
  created_at: string | null;
};

export type DispatchPushResult = {
  targets: number;
  fcmSent: number;
  webPushSent: number;
  fcmExpired: number;
  webPushExpired: number;
  webPushDisabled: boolean;
  errors: string[];
};

function emptyResult(): DispatchPushResult {
  return {
    targets: 0,
    fcmSent: 0,
    webPushSent: 0,
    fcmExpired: 0,
    webPushExpired: 0,
    webPushDisabled: false,
    errors: [],
  };
}

function toStringRecord(value: Record<string, unknown> | null | undefined): Record<string, string> {
  if (!value) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null || entry === undefined) continue;
    out[key] = typeof entry === 'string' ? entry : JSON.stringify(entry);
  }
  return out;
}

function buildTagFor(row: NotificationPushRow): string {
  const meta = row.metadata ?? {};
  const dedupeKey =
    typeof meta.dedupe_key === 'string' && meta.dedupe_key
      ? meta.dedupe_key
      : '';
  if (dedupeKey) return `erp-${row.type}-${dedupeKey}`;
  const messageId =
    typeof meta.message_id === 'string' && meta.message_id
      ? meta.message_id
      : '';
  if (messageId) return `erp-${row.type}-${messageId}`;
  return `erp-${row.type}-${row.user_id}`;
}

async function loadSubscriptionsForUsers(
  userIds: string[],
): Promise<PushSubscriptionRow[]> {
  if (userIds.length === 0) return [];
  const d1 = await getD1Binding();
  if (!d1) return [];
  const db = getD1Drizzle(d1);

  const rows: PushSubscriptionRow[] = [];
  const chunkSize = 100; // D1 bind 한도 보호
  for (let i = 0; i < userIds.length; i += chunkSize) {
    const chunk = userIds.slice(i, i + chunkSize);
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
      .where(inArray(pushSubscriptionsTable.staff_id, chunk));

    for (const r of subRows) {
      rows.push({
        id: String(r.id ?? ''),
        staff_id: r.staff_id ?? null,
        endpoint: r.endpoint ?? null,
        p256dh: r.p256dh ?? null,
        auth: r.auth ?? null,
        fcm_token: r.fcm_token ?? null,
        created_at: r.created_at ?? null,
      });
    }
  }
  return rows;
}

/**
 * staff_id별로 최신 fcm_token 1개만 사용해 잔재 토큰 이중 발송을 차단.
 */
function buildLatestFcmTokenByStaffId(
  subscriptions: PushSubscriptionRow[],
): Map<string, string> {
  const latest = new Map<string, { token: string; createdAt: number }>();
  for (const row of subscriptions) {
    const staffId = String(row.staff_id || '').trim();
    const token = String(row.fcm_token || '').trim();
    if (!staffId || !token) continue;
    const createdAt = row.created_at ? Date.parse(String(row.created_at)) : 0;
    const numericCreatedAt = Number.isFinite(createdAt) ? createdAt : 0;
    const prev = latest.get(staffId);
    if (!prev || numericCreatedAt > prev.createdAt) {
      latest.set(staffId, { token, createdAt: numericCreatedAt });
    }
  }
  return new Map(Array.from(latest.entries()).map(([id, v]) => [id, v.token]));
}

async function invalidateExpiredFcmTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  const d1 = await getD1Binding();
  if (!d1) return;
  const db = getD1Drizzle(d1);
  for (const token of tokens) {
    try {
      await db
        .update(pushSubscriptionsTable)
        .set({ fcm_token: null })
        .where(eq(pushSubscriptionsTable.fcm_token, token));
    } catch (err) {
      console.error('[notification-push-dispatch] FCM token invalidate failed:', err);
    }
  }
}

async function deleteExpiredWebPushSubscriptions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const d1 = await getD1Binding();
  if (!d1) return;
  const db = getD1Drizzle(d1);
  try {
    await db.delete(pushSubscriptionsTable).where(inArray(pushSubscriptionsTable.id, ids));
  } catch (err) {
    console.error('[notification-push-dispatch] WebPush subscription delete failed:', err);
  }
}

type DispatchForUserParams = {
  row: NotificationPushRow;
  subscriptions: PushSubscriptionRow[];
  webPushEnabled: boolean;
};

async function dispatchSingleUser(
  params: DispatchForUserParams,
  result: DispatchPushResult,
): Promise<void> {
  const { row, subscriptions, webPushEnabled } = params;
  const userSubs = subscriptions.filter((s) => String(s.staff_id || '') === row.user_id);
  if (userSubs.length === 0) return;

  const latestFcm = buildLatestFcmTokenByStaffId(userSubs);
  const fcmToken = latestFcm.get(row.user_id) ?? '';
  const tag = buildTagFor(row);
  const data = toStringRecord({
    ...(row.metadata ?? {}),
    notification_type: row.type,
    tag,
  });

  if (fcmToken) {
    try {
      const fcmResult = await sendFcmBatch([fcmToken], {
        title: row.title,
        body: row.body,
        data,
      });
      result.fcmSent += fcmResult.success.length;
      if (fcmResult.expired.length > 0) {
        result.fcmExpired += fcmResult.expired.length;
        await invalidateExpiredFcmTokens(fcmResult.expired);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`fcm:${row.user_id}:${msg}`);
      console.error('[notification-push-dispatch] FCM send failed for', row.user_id, err);
    }
    // FCM 토큰이 있으면 WebPush는 건너뜀 — 동일 기기 이중 발송 방지
    return;
  }

  if (!webPushEnabled) return;

  const payloadJson = JSON.stringify({
    title: row.title,
    body: row.body,
    tag,
    data: { ...(row.metadata ?? {}), notification_type: row.type, tag },
  });

  // endpoint dedupe (같은 사용자의 잔재 구독 중복 발송 방지)
  const uniqueEndpoints = new Map<string, PushSubscriptionRow>();
  for (const sub of userSubs) {
    const endpoint = String(sub.endpoint || '').trim();
    if (!endpoint || !/^https?:\/\//i.test(endpoint)) continue;
    if (!sub.p256dh || !sub.auth) continue;
    if (!uniqueEndpoints.has(endpoint)) uniqueEndpoints.set(endpoint, sub);
  }

  const targets = Array.from(uniqueEndpoints.values());
  if (targets.length === 0) return;

  const expiredIds: string[] = [];
  const results = await Promise.allSettled(
    targets.map((sub) =>
      sendWebPushNotification(
        { endpoint: sub.endpoint!, p256dh: sub.p256dh!, auth: sub.auth! },
        payloadJson,
      ),
    ),
  );

  for (let i = 0; i < results.length; i += 1) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      result.webPushSent += 1;
    } else {
      const err = r.reason as { statusCode?: number; status?: number; message?: string } | undefined;
      const statusCode = Number(err?.statusCode || err?.status || 0);
      if (statusCode === 404 || statusCode === 410) {
        expiredIds.push(targets[i].id);
        result.webPushExpired += 1;
      } else {
        result.errors.push(
          `webpush:${row.user_id}:${err?.message ?? 'unknown'}`,
        );
      }
    }
  }

  if (expiredIds.length > 0) await deleteExpiredWebPushSubscriptions(expiredIds);
}

/**
 * 인앱 알림 row 목록에 대해 해당 사용자에게 푸시(FCM 우선, WebPush 폴백) 발송.
 * 푸시 실패는 격리되며 호출자(예: insertNotificationsChunked)의 결과에 영향 없음.
 */
export async function dispatchPushForNotificationRows(
  rows: NotificationPushRow[],
): Promise<DispatchPushResult> {
  const result = emptyResult();
  if (rows.length === 0) return result;

  const userIds = Array.from(
    new Set(rows.map((r) => String(r.user_id || '').trim()).filter(Boolean)),
  );
  if (userIds.length === 0) return result;
  result.targets = userIds.length;

  let subscriptions: PushSubscriptionRow[] = [];
  try {
    subscriptions = await loadSubscriptionsForUsers(userIds);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`load-subscriptions:${msg}`);
    console.error('[notification-push-dispatch] load subscriptions failed:', err);
    return result;
  }

  if (subscriptions.length === 0) return result;

  let webPushEnabled = true;
  try {
    ensureWebPushConfigured();
  } catch {
    webPushEnabled = false;
    result.webPushDisabled = true;
  }

  // 사용자 단위로 직렬 처리 — 동시성 폭주 방지 + 토큰 무효화 일관성.
  // 한 사용자 실패가 다른 사용자에게 전파되지 않도록 try/catch 격리(JM3).
  for (const row of rows) {
    try {
      await dispatchSingleUser({ row, subscriptions, webPushEnabled }, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`row:${row.user_id}:${msg}`);
      console.error('[notification-push-dispatch] row dispatch failed:', err);
    }
  }

  return result;
}
