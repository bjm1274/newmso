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
 *   - 기기(구독 행) 단위: FCM 토큰이 있는 행은 FCM, 없는 행은 Web Push.
 *     (과거 staff 단위 FCM 우선 → 모바일 있으면 PC Web Push 미발송 버그 수정)
 *   - 동일 staff 의 모든 고유 FCM 토큰 발송 (멀티 디바이스).
 *   - WebPush 만료(404/410) endpoint는 push_subscriptions에서 즉시 삭제.
 *   - FCM 만료 토큰은 fcm_token=null로 무효화.
 *   - 푸시 실패 row가 있어도 전체를 중단하지 않고 로그만 남긴다.
 */
import { ensureWebPushConfigured, sendWebPushNotification } from '@/lib/web-push';
import { sendFcmBatch } from '@/lib/fcm-http';
import { isWithinPushQuietHours } from '@/lib/push-quiet-hours';
import {
  toStringRecord,
  collectUniqueFcmTokens,
  dedupeWebPushSubscriptions,
  invalidateExpiredFcmTokens,
  deleteExpiredWebPushSubscriptions } from '@/lib/notification-shared';
import {
  getD1Binding,
  getD1Drizzle,
  push_subscriptions as pushSubscriptionsTable,
  inArray } from '@/lib/db';
import type { D1Database } from '@/lib/db/types';

export type NotificationPushRow = {
  /**
   * notifications.id. 있으면 푸시 tag 를 알림 단위로 갈라 주고(NB-02),
   * 페이로드의 notification_id 로 실려 푸시 탭 → 인앱 읽음처리가 동작한다(NB-04).
   * 호출부가 아직 안 넘기는 경로가 있어 optional 로 둔다.
   */
  id?: string | null;
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
  // 야간 방해금지(22~08시) 구간이라 발송을 건너뛴 경우 true.
  quietHoursSkipped: boolean;
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
    quietHoursSkipped: false,
    errors: [] };
}

function readStringField(meta: Record<string, unknown>, key: string): string {
  const value = meta[key];
  return typeof value === 'string' && value ? value : '';
}

/**
 * 같은 내용의 알림이 두 번 디스패치될 때만 같은 값이 나오는 결정적 해시.
 * (같은 알림의 FCM/WebPush 이중 도달은 서비스워커가 tag 로 합쳐야 하므로
 *  랜덤값을 쓰면 안 된다 — 결정적이어야 한다.)
 */
function stableContentSuffix(row: NotificationPushRow): string {
  const source = `${row.user_id}|${row.title}|${row.body}|${JSON.stringify(row.metadata ?? null)}`;
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) - hash + source.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/**
 * 푸시 tag — OS 알림 트레이의 교체 키이자 FCM `collapse_key`(lib/fcm-http.ts:139) 다.
 * 즉 같은 tag 는 트레이에서 서로를 대체하고, 단말이 오프라인이면 **FCM 서버 단계에서
 * 앞 건이 폐기**된다.
 *
 * 무엇을 합치고 무엇을 가르는가 (10차 NB-02):
 *  - `dedupe_key` 가 있으면 그 키로 합친다. 이건 **의도적으로 합쳐야 하는 채널**이다 —
 *    결재 지연 리마인더(`approval-delay:…`)처럼 같은 사안을 반복 알리는 종류는
 *    최신 1건만 트레이에 남는 것이 맞다.
 *  - 채팅은 `message_id`(메시지 단위) 로 이미 갈라져 있다. 방 단위 합치기는
 *    채팅 전용 경로(lib/chat-push-dispatch.ts)가 자기 tag 로 따로 한다.
 *  - 그 밖(결재 요청·재고·게시판·계약만료·system_alert 등)은 **건마다 별개 사안**이라
 *    합치면 안 된다. 예전 폴백 `erp-{type}-{user_id}` 는 사용자·타입당 하나뿐이라
 *    결재 요청 3건이 트레이에 1건으로 남았다. 알림 id 로 가른다.
 *  - id 를 못 받은 호출부(app/api/d1/mutate, lib/notification-utils)는 내용 해시로
 *    가른다 — 서로 다른 알림은 갈리고, 같은 알림의 재디스패치는 여전히 합쳐진다.
 */
function buildTagFor(row: NotificationPushRow): string {
  const meta = row.metadata ?? {};
  const dedupeKey = readStringField(meta, 'dedupe_key');
  if (dedupeKey) return `erp-${row.type}-${dedupeKey}`;
  const messageId = readStringField(meta, 'message_id');
  if (messageId) return `erp-${row.type}-${messageId}`;
  const notificationId = resolveNotificationId(row);
  if (notificationId) return `erp-${row.type}-${notificationId}`;
  // 알림 행 id 를 못 받은 호출부용 폴백.
  // metadata.id 는 **결재 문서 id** 라 같은 문서의 '결재 차례'와 '결재 승인'이 한 값으로 묶인다
  // — 그래서 내용 해시를 함께 붙여 단계까지 갈라 준다. 반대로 같은 알림이 두 번 디스패치되면
  // 두 조각 모두 같아 여전히 하나로 합쳐진다.
  const metaKey =
    readStringField(meta, 'id') || readStringField(meta, 'approval_id') || row.user_id;
  return `erp-${row.type}-${metaKey}-${stableContentSuffix(row)}`;
}

/**
 * 인앱 읽음처리(NB-04)에 쓸 **notifications.id**. 없으면 빈 문자열.
 * metadata.id 는 결재 문서 id 라 여기 쓰면 안 된다 — 엉뚱한 행을 읽음 처리하려 든다.
 */
function resolveNotificationId(row: NotificationPushRow): string {
  const explicit = String(row.id ?? '').trim();
  if (explicit) return explicit;
  return readStringField(row.metadata ?? {}, 'notification_id');
}

async function loadSubscriptionsForUsers(
  d1: D1Database,
  userIds: string[],
): Promise<PushSubscriptionRow[]> {
  if (userIds.length === 0) return [];
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
        created_at: pushSubscriptionsTable.created_at })
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
        created_at: r.created_at ?? null });
    }
  }
  return rows;
}

type DispatchForUserParams = {
  d1: D1Database;
  row: NotificationPushRow;
  subscriptions: PushSubscriptionRow[];
  webPushEnabled: boolean;
};

async function dispatchSingleUser(
  params: DispatchForUserParams,
  result: DispatchPushResult,
): Promise<void> {
  const { d1, row, subscriptions, webPushEnabled } = params;
  const userSubs = subscriptions.filter((s) => String(s.staff_id || '') === row.user_id);
  if (userSubs.length === 0) return;

  const fcmTokens = collectUniqueFcmTokens(userSubs);
  const tag = buildTagFor(row);
  // NB-04 — 서비스워커 erpMarkNotificationAsRead 는 data.notification_id 가 없으면
  // 즉시 return 한다. 푸시를 탭해도 인앱 알림함이 안 읽음으로 남던 원인이다.
  const notificationId = resolveNotificationId(row);
  const data = toStringRecord({
    ...(row.metadata ?? {}),
    notification_type: row.type,
    ...(notificationId ? { notification_id: notificationId } : {}),
    tag });

  const undeliveredFcmTokens = new Set<string>();
  if (fcmTokens.length > 0) {
    try {
      const fcmResult = await sendFcmBatch(fcmTokens, {
        title: row.title,
        body: row.body,
        data });
      result.fcmSent += fcmResult.success.length;
      if (fcmResult.expired.length > 0) {
        result.fcmExpired += fcmResult.expired.length;
        await invalidateExpiredFcmTokens(d1, fcmResult.expired);
      }
      for (const token of [...fcmResult.error, ...fcmResult.expired]) {
        undeliveredFcmTokens.add(token);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`fcm:${row.user_id}:${msg}`);
      console.error('[notification-push-dispatch] FCM send failed for', row.user_id, err);
      // batch 자체 실패 시 전 토큰 미전달로 보고 WebPush 폴백 허용
      for (const token of fcmTokens) undeliveredFcmTokens.add(token);
    }
  }

  if (!webPushEnabled) return;

  const payloadJson = JSON.stringify({
    title: row.title,
    body: row.body,
    tag,
    data: {
      ...(row.metadata ?? {}),
      notification_type: row.type,
      ...(notificationId ? { notification_id: notificationId } : {}),
      tag } });

  // WebPush 전용 기기 + FCM 미전달 기기의 같은 행 WebPush 폴백
  const webPushCandidates = userSubs.filter((sub) => {
    const token = String(sub.fcm_token || '').trim();
    if (!token) return true;
    return undeliveredFcmTokens.has(token);
  });
  const targets = dedupeWebPushSubscriptions(webPushCandidates, { excludeFcmRows: false });
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

  if (expiredIds.length > 0) await deleteExpiredWebPushSubscriptions(d1, expiredIds);
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

  // 야간 방해금지(기본 22~08시 KST) — repush와 동일 함수로 발송을 건너뛴다.
  // 설정(ERP_PUSH_QUIET_HOURS_*) 및 사용자 야간 시간대를 존중.
  if (isWithinPushQuietHours()) {
    result.quietHoursSkipped = true;
    return result;
  }

  const userIds = Array.from(
    new Set(rows.map((r) => String(r.user_id || '').trim()).filter(Boolean)),
  );
  if (userIds.length === 0) return result;
  result.targets = userIds.length;

  const d1 = await getD1Binding();
  if (!d1) return result;

  let subscriptions: PushSubscriptionRow[] = [];
  try {
    subscriptions = await loadSubscriptionsForUsers(d1, userIds);
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
      await dispatchSingleUser({ d1, row, subscriptions, webPushEnabled }, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`row:${row.user_id}:${msg}`);
      console.error('[notification-push-dispatch] row dispatch failed:', err);
    }
  }

  return result;
}

export { dispatchPushForNotificationRows as dispatchNotificationPush };
