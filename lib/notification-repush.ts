import { ensureWebPushConfigured, sendWebPushNotification } from '@/lib/web-push-cloudflare';
import { sendFcmBatch } from '@/lib/fcm-http';
import { isWithinPushQuietHours } from '@/lib/push-quiet-hours';
import { NOTICE_ROOM_ID } from '@/lib/constants';
import {
  toStringRecord,
  toMetadataRecord,
  collectUniqueFcmTokens,
  dedupeWebPushSubscriptions,
  invalidateExpiredFcmTokens,
  deleteExpiredWebPushSubscriptions } from '@/lib/notification-shared';
import {
  getD1Binding,
  getD1Drizzle,
  notifications as notificationsTable,
  push_subscriptions as pushSubscriptionsTable,
  eq,
  and,
  inArray,
  isNull,
  lte,
  gte } from '@/lib/db';

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
// 수정 H: inventory, board, 인사, payroll 추가 — 야간 발생 중요 알림 다음날 재발송
const REPUSH_ELIGIBLE_TYPES = new Set(['approval', 'notice', 'announcement', 'inventory', 'board', '인사', 'payroll']);
const CHAT_NOTIFICATION_TYPES = new Set(['message', 'mention', 'chat']);

function getNormalizedTypeCandidates(row: NotificationRow): string[] {
  const metadata = toMetadataRecord(row.metadata);
  return [row.type, metadata.type, metadata.notification_type]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
}

function isNoticeRoomMessage(row: NotificationRow): boolean {
  const metadata = toMetadataRecord(row.metadata);
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
  const metadata = toMetadataRecord(row.metadata);
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

function normalizeScopedUserIds(userIds?: string[] | null) {
  if (!Array.isArray(userIds) || userIds.length === 0) return [];
  return Array.from(new Set(userIds.map((id) => String(id || '').trim()).filter(Boolean)));
}

function buildRepushPayload(row: NotificationRow) {
  const metadata = toMetadataRecord(row.metadata);
  const type = String(row.type || metadata.type || 'notification');
  const title = String(row.title || '알림');
  const body = String(row.body || '').trim();
  const data = {
    ...metadata,
    id: row.id,
    notification_id: row.id,
    type };

  return {
    title,
    body,
    tag: `erp-notification-repush-${row.id}`,
    data };
}

async function patchNotificationMetadata(
  row: NotificationRow,
  metadataPatch: Record<string, unknown>,
) {
  const metadata = toMetadataRecord(row.metadata);
  const merged = { ...metadata, ...metadataPatch };

  const d1 = await getD1Binding();
  if (!d1) throw new Error('[notification-repush] D1 binding not available (patchNotificationMetadata)');
  const db = getD1Drizzle(d1);
  await db
    .update(notificationsTable)
    .set({ metadata: JSON.stringify(merged) })
    .where(eq(notificationsTable.id, String(row.id)));
}

export async function processUnreadNotificationRepushServer(
  limit = 50,
  userIds?: string[] | null,
): Promise<NotificationRepushResult> {
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
      reason: 'quiet-hours' };
  }

  const nowIso = now.toISOString();
  const minAgeCutoffIso = new Date(now.getTime() - REPUSH_MIN_AGE_HOURS * 60 * 60 * 1000).toISOString();
  const maxAgeCutoffIso = new Date(now.getTime() - REPUSH_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const scopedUserIds = normalizeScopedUserIds(userIds);

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
      created_at: notificationsTable.created_at })
    .from(notificationsTable)
    .where(and(...(conditions as Parameters<typeof and>)))
    .orderBy(asc(notificationsTable.created_at))
    .limit(limit);

  // D1 metadata는 TEXT → JSON.parse
  const notifications: NotificationRow[] = rawRows.map((row) => {
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
      created_at: row.created_at ?? null } satisfies NotificationRow;
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
      created_at: pushSubscriptionsTable.created_at })
    .from(pushSubscriptionsTable)
    .where(inArray(pushSubscriptionsTable.staff_id, targetUserIds));

  const subscriptionsByUser = new Map<string, PushSubscriptionRow[]>();
  (subRows as PushSubscriptionRow[]).forEach((row) => {
    const uid = String(row.staff_id || '').trim();
    if (!uid) return;
    subscriptionsByUser.set(uid, [...(subscriptionsByUser.get(uid) || []), row]);
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

    const metadata = toMetadataRecord(row.metadata);
    const repushAttempts = Number(metadata.repush_attempt_count || 0);

    if (repushAttempts >= DEFAULT_MAX_ATTEMPTS) {
      skipped += 1;
      continue;
    }

    const userSubscriptions = subscriptionsByUser.get(String(row.user_id || '').trim()) || [];

    // 기기 단위: 모든 고유 FCM + FCM 없는 행의 Web Push (모바일+PC 동시 지원)
    const uniqueFcmTokens = collectUniqueFcmTokens(userSubscriptions);
    const webPushTargets = dedupeWebPushSubscriptions(userSubscriptions);

    if (webPushTargets.length === 0 && uniqueFcmTokens.length === 0) {
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
          data: payloadData });
        rowSent += fcmResult.success.length > 0 ? 1 : 0;
        // error 토큰(5xx·네트워크 실패)은 일시 오류이므로 failed 카운트만 올리고 토큰은 유지.
        // expired 토큰(NOT_FOUND·INVALID_ARGUMENT·400·404)만 DB에서 null 처리.
        rowFailed += fcmResult.success.length === 0 && fcmResult.expired.length === 0 && fcmResult.error.length > 0 ? 1 : 0;
        if (fcmResult.expired.length > 0) {
          await invalidateExpiredFcmTokens(d1, fcmResult.expired);
        }
      } catch (fcmError) {
        rowFailed += 1;
        errors.push(`${row.id}: ${String((fcmError as Error)?.message || fcmError)}`);
      }
    } else if (pushDisabled && webPushTargets.length > 0) {
      rowFailed += 1;
    }

    const webTargets = webPushTargets;

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
      await deleteExpiredWebPushSubscriptions(d1, expiredSubscriptionIds);
    }

    try {
      await patchNotificationMetadata(row, {
        repush_attempt_count: repushAttempts + 1,
        repush_sent_at: nowIso,
        repush_result: rowSent > 0 ? 'sent' : pushDisabled && webTargets.length > 0 ? 'web-push-disabled' : 'failed' });
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
    errors };
}
