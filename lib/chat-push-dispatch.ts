import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ensureWebPushConfigured, sendWebPushNotification } from '@/lib/web-push';
import { sendFcmBatch } from '@/lib/firebase-admin';

type MessageRow = {
  id: string;
  room_id: string;
  sender_id: string | null;
  content: string | null;
  created_at: string;
  file_url: string | null;
  file_kind: string | null;
};

type ChatRoomRow = {
  id: string;
  name: string | null;
  type: string | null;
  members: string[] | null;
};

type PushSubscriptionRow = {
  id: string;
  staff_id: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  fcm_token?: string | null;
};

type NotificationInsertRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  read_at: null;
  created_at: string;
};

type QueueJobRow = {
  id: string;
  message_id: string;
  room_id: string;
  created_at?: string | null;
  attempt_count?: number | null;
  next_attempt_at?: string | null;
  dead_lettered_at?: string | null;
};

export type ChatPushDispatchResult = {
  sent: number;
  failed: number;
  targets: number;
  notificationsCreated: number;
  pushDisabled: boolean;
  reason?: string;
};

const CHAT_PUSH_MAX_ATTEMPTS = 5;
const CHAT_PUSH_RETRY_DELAYS_MINUTES = [1, 5, 15, 30, 60];

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase service role configuration is missing.');
  }

  return createClient(supabaseUrl, serviceKey);
}

function isMissingRelationError(error: any, relationName: string) {
  if (!error) return false;
  const code = String(error?.code || '');
  const message = String(error?.message || error?.details || '').toLowerCase();
  const target = relationName.toLowerCase();
  return code === '42P01' || message.includes(target);
}

function isMissingColumnError(error: any, columnName: string) {
  if (!error) return false;
  const code = String(error?.code || '');
  const message = String(error?.message || error?.details || '').toLowerCase();
  return code === '42703' && message.includes(columnName.toLowerCase());
}

function getRetryDelayMinutes(attemptCount: number) {
  const index = Math.min(
    Math.max(attemptCount - 1, 0),
    CHAT_PUSH_RETRY_DELAYS_MINUTES.length - 1,
  );
  return CHAT_PUSH_RETRY_DELAYS_MINUTES[index];
}

function buildQueueFailurePatch(attemptCount: number, error: unknown, supportsRetryColumns: boolean) {
  const message = String((error as any)?.message || error || 'unknown-error');
  if (!supportsRetryColumns) {
    return {
      processing_started_at: null,
      last_error: message,
    };
  }

  const now = new Date();
  const exhausted = attemptCount >= CHAT_PUSH_MAX_ATTEMPTS;
  const retryAt = exhausted
    ? now
    : new Date(now.getTime() + getRetryDelayMinutes(attemptCount) * 60 * 1000);

  return {
    processing_started_at: null,
    last_error: message,
    next_attempt_at: retryAt.toISOString(),
    dead_lettered_at: exhausted ? now.toISOString() : null,
  };
}

async function selectPendingChatPushJobs(supabase: SupabaseClient, limit: number) {
  const nowIso = new Date().toISOString();
  // 2분 이내 processing_started_at이 설정된 job은 현재 다른 경로(API)에서 처리 중 → 건너뜀
  const staleThresholdIso = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const retryAwareSelection =
    'id, message_id, room_id, created_at, attempt_count, next_attempt_at, dead_lettered_at';

  const retryAwareRes = await supabase
    .from('chat_push_jobs')
    .select(retryAwareSelection)
    .is('processed_at', null)
    .is('dead_lettered_at', null)
    .or(`processing_started_at.is.null,processing_started_at.lt.${staleThresholdIso}`)
    .lte('next_attempt_at', nowIso)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (!retryAwareRes.error) {
    return {
      jobs: (retryAwareRes.data || []) as QueueJobRow[],
      supportsRetryColumns: true,
      missingQueueTable: false,
    };
  }

  if (
    isMissingColumnError(retryAwareRes.error, 'next_attempt_at') ||
    isMissingColumnError(retryAwareRes.error, 'dead_lettered_at')
  ) {
    const fallbackRes = await supabase
      .from('chat_push_jobs')
      .select('id, message_id, room_id, created_at, attempt_count')
      .is('processed_at', null)
      .or(`processing_started_at.is.null,processing_started_at.lt.${staleThresholdIso}`)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (!fallbackRes.error) {
      return {
        jobs: (fallbackRes.data || []) as QueueJobRow[],
        supportsRetryColumns: false,
        missingQueueTable: false,
      };
    }

    if (isMissingRelationError(fallbackRes.error, 'chat_push_jobs')) {
      return {
        jobs: [] as QueueJobRow[],
        supportsRetryColumns: false,
        missingQueueTable: true,
      };
    }

    throw fallbackRes.error;
  }

  if (isMissingRelationError(retryAwareRes.error, 'chat_push_jobs')) {
    return {
      jobs: [] as QueueJobRow[],
      supportsRetryColumns: false,
      missingQueueTable: true,
    };
  }

  throw retryAwareRes.error;
}

function buildPreview(message: MessageRow) {
  const content = String(message.content || '').trim();
  if (content) return content.slice(0, 80);
  if (message.file_kind === 'image') return '사진을 보냈습니다.';
  if (message.file_kind === 'video') return '동영상을 보냈습니다.';
  if (message.file_url) return '파일을 보냈습니다.';
  return '새 메시지가 도착했습니다.';
}

function buildDeterministicNotificationId(userId: string, messageId: string) {
  const bytes = createHash('sha256')
    .update(`chat-notification:${userId}:${messageId}`)
    .digest()
    .subarray(0, 16);

  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function getMutedUserIds(supabase: SupabaseClient, roomId: string) {
  try {
    const { data, error } = await supabase
      .from('room_notification_settings')
      .select('user_id')
      .eq('room_id', roomId)
      .eq('notifications_enabled', false);

    if (error) return new Set<string>();
    return new Set((data || []).map((row: { user_id: string }) => String(row.user_id)));
  } catch {
    return new Set<string>();
  }
}

async function updateChatPushJobByMessageId(
  supabase: SupabaseClient,
  messageId: string,
  patch: Record<string, unknown>,
) {
  const { error } = await supabase
    .from('chat_push_jobs')
    .update(patch)
    .eq('message_id', messageId);

  if (error && !isMissingRelationError(error, 'chat_push_jobs')) {
    console.error('chat_push_jobs update failed', error);
  }
}

async function updateChatPushJobById(
  supabase: SupabaseClient,
  jobId: string,
  patch: Record<string, unknown>,
) {
  const { error } = await supabase
    .from('chat_push_jobs')
    .update(patch)
    .eq('id', jobId);

  if (error && !isMissingRelationError(error, 'chat_push_jobs')) {
    console.error('chat_push_jobs update failed', error);
  }
}

export async function dispatchChatPushForMessage(params: {
  roomId: string;
  messageId: string;
  expectedSenderId?: string;
  supabase?: SupabaseClient;
}) {
  const supabase = params.supabase || getAdminClient();

  // ── 이중 발송 방지: 처리 시작 전 processing_started_at 선점 ──
  // 다른 경로(cron 등)가 같은 job을 동시에 처리하지 못하게 한다.
  await updateChatPushJobByMessageId(supabase, params.messageId, {
    processing_started_at: new Date().toISOString(),
  });

  const [messageRes, roomRes] = await Promise.all([
    supabase
      .from('messages')
      .select('id, room_id, sender_id, content, created_at, file_url, file_kind')
      .eq('id', params.messageId)
      .single(),
    supabase
      .from('chat_rooms')
      .select('id, name, type, members')
      .eq('id', params.roomId)
      .single(),
  ]);

  if (messageRes.error || roomRes.error || !messageRes.data || !roomRes.data) {
    return {
      sent: 0,
      failed: 0,
      targets: 0,
      notificationsCreated: 0,
      pushDisabled: false,
      reason: 'message-or-room-not-found',
    } satisfies ChatPushDispatchResult;
  }

  const message = messageRes.data as MessageRow;
  const room = roomRes.data as ChatRoomRow;
  const senderId = String(message.sender_id || '');

  if (params.expectedSenderId && senderId !== String(params.expectedSenderId)) {
    throw new Error('Only the message sender can trigger chat push.');
  }

  const members = Array.isArray(room.members) ? room.members.map((id) => String(id)) : [];
  if (members.length === 0) {
    await updateChatPushJobByMessageId(supabase, params.messageId, {
      processed_at: new Date().toISOString(),
      processing_started_at: null,
      last_error: null,
    });
    return {
      sent: 0,
      failed: 0,
      targets: 0,
      notificationsCreated: 0,
      pushDisabled: false,
      reason: 'no-room-members',
    } satisfies ChatPushDispatchResult;
  }

  const mutedIds = await getMutedUserIds(supabase, params.roomId);
  const targetIds = members.filter((id) => id && id !== senderId && !mutedIds.has(id));

  if (targetIds.length === 0) {
    await updateChatPushJobByMessageId(supabase, params.messageId, {
      processed_at: new Date().toISOString(),
      processing_started_at: null,
      last_error: null,
    });
    return {
      sent: 0,
      failed: 0,
      targets: 0,
      notificationsCreated: 0,
      pushDisabled: false,
      reason: 'no-targets',
    } satisfies ChatPushDispatchResult;
  }

  const [subscriptionRes, senderRes] = await Promise.all([
    supabase
      .from('push_subscriptions')
      .select('id, staff_id, endpoint, p256dh, auth, fcm_token')
      .in('staff_id', targetIds),
    supabase
      .from('staff_members')
      .select('name')
      .eq('id', senderId)
      .maybeSingle(),
  ]);

  if (subscriptionRes.error) {
    throw subscriptionRes.error;
  }

  const senderName = String((senderRes.data as { name?: string } | null)?.name || '새 메시지');
  const title =
    room.type === 'notice'
      ? '공지 메시지'
      : room.name
        ? `${senderName} - ${room.name}`
        : senderName;

  const previewBody = buildPreview(message);
  const notificationRows: NotificationInsertRow[] = targetIds.map((targetId) => ({
    id: buildDeterministicNotificationId(targetId, params.messageId),
    user_id: targetId,
    type: 'message',
    title,
    body: previewBody,
    metadata: {
      room_id: params.roomId,
      id: params.messageId,
      sender_name: senderName,
      type: 'message',
      created_at: message.created_at,
      dedupe_key: `chat:${params.messageId}:${targetId}`,
    },
    read_at: null,
    created_at: message.created_at || new Date().toISOString(),
  }));

  if (notificationRows.length > 0) {
    const { error: notificationInsertError } = await supabase
      .from('notifications')
      .upsert(notificationRows, { onConflict: 'id' });

    if (notificationInsertError) {
      console.error('chat notification insert failed', notificationInsertError);
    }
  }

  let pushDisabled = false;
  try {
    ensureWebPushConfigured();
  } catch {
    pushDisabled = true;
  }

  const uniqueSubscriptions = new Map<string, PushSubscriptionRow>();
  for (const row of (subscriptionRes.data || []) as PushSubscriptionRow[]) {
    if (!row.endpoint || !row.staff_id || row.staff_id === senderId) continue;
    if (!uniqueSubscriptions.has(row.endpoint)) {
      uniqueSubscriptions.set(row.endpoint, row);
    }
  }

  const uniqueFcmTokens = Array.from(
    new Set(
      ((subscriptionRes.data || []) as PushSubscriptionRow[])
        .filter((row) => row.fcm_token && row.staff_id && row.staff_id !== senderId)
        .map((row) => String(row.fcm_token))
        .filter(Boolean)
    )
  );

  if (uniqueSubscriptions.size === 0 && uniqueFcmTokens.length === 0) {
    await updateChatPushJobByMessageId(supabase, params.messageId, {
      processing_started_at: null,
      last_error: 'no-active-subscriptions',
    });

    return {
      sent: 0,
      failed: 0,
      targets: targetIds.length,
      notificationsCreated: notificationRows.length,
      pushDisabled: false,
      reason: 'no-active-subscriptions',
    } satisfies ChatPushDispatchResult;
  }

  // staff_id 기준으로 FCM 토큰이 있는 사용자 집합 구성 — Web Push + FCM 이중 발송 방지
  const staffIdsWithFcmToken = new Set(
    (subscriptionRes.data || [])
      .filter((r: PushSubscriptionRow) => r.fcm_token && r.staff_id && r.staff_id !== senderId)
      .map((r: PushSubscriptionRow) => String(r.staff_id))
  );

  let sent = 0;
  let failed = 0;
  const expiredIds: string[] = [];

  if (!pushDisabled) {
    const payload = JSON.stringify({
      title,
      body: previewBody,
      tag: `chat-msg-${params.messageId}`,
      data: {
        room_id: params.roomId,
        message_id: params.messageId,
        created_at: message.created_at,
        type: 'message',
      },
    });

    for (const subscription of uniqueSubscriptions.values()) {
      // FCM 토큰이 있는 구독 자체 또는 해당 staff_id가 FCM 구독을 별도로 보유하면 Web Push 생략
      if (subscription.fcm_token) continue;
      if (staffIdsWithFcmToken.has(String(subscription.staff_id))) continue;
      try {
        await sendWebPushNotification(subscription, payload);
        sent += 1;
      } catch (error: any) {
        failed += 1;
        const statusCode = Number(error?.statusCode || error?.status || 0);
        if (statusCode === 404 || statusCode === 410) {
          expiredIds.push(subscription.id);
        }
      }
    }
  }

  if (expiredIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', expiredIds);
  }

  // FCM 전송 (Web Push와 병렬 — 모바일 백그라운드 알림)
  try {
    if (uniqueFcmTokens.length > 0) {
      const fcmResult = await sendFcmBatch(uniqueFcmTokens, {
        title,
        body: previewBody,
        data: {
          room_id: params.roomId,
          message_id: params.messageId,
          type: 'message',
        },
      });
      sent += fcmResult.success.length;
      // 만료된 FCM 토큰 정리
      if (fcmResult.expired.length > 0) {
        await supabase
          .from('push_subscriptions')
          .update({ fcm_token: null })
          .in('fcm_token', fcmResult.expired);
      }
    }
  } catch (fcmErr) {
    console.error('[FCM] 배치 전송 오류:', fcmErr);
  }

  await updateChatPushJobByMessageId(supabase, params.messageId, {
    processed_at: new Date().toISOString(),
    processing_started_at: null,
    last_error: pushDisabled ? 'web-push-disabled' : null,
  });

  return {
    sent,
    failed,
    targets: targetIds.length,
    notificationsCreated: notificationRows.length,
    pushDisabled,
  } satisfies ChatPushDispatchResult;
}

export async function processPendingChatPushJobs(limit = 25) {
  const supabase = getAdminClient();
  const queueSelection = await selectPendingChatPushJobs(supabase, limit);

  if (queueSelection.missingQueueTable) {
    return { processed: 0, sent: 0, failed: 0, skipped: 0, reason: 'queue-table-missing' };
  }

  const jobs = queueSelection.jobs;
  let processed = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const job of jobs) {
    const nextAttemptCount = Number(job.attempt_count || 0) + 1;
    await updateChatPushJobById(supabase, job.id, {
      processing_started_at: new Date().toISOString(),
      attempt_count: nextAttemptCount,
      last_error: null,
    });

    try {
      const result = await dispatchChatPushForMessage({
        roomId: String(job.room_id),
        messageId: String(job.message_id),
        supabase,
      });
      processed += 1;
      sent += result.sent;
      failed += result.failed;
      if (result.reason) skipped += 1;
    } catch (error: any) {
      failed += 1;
      await updateChatPushJobById(
        supabase,
        job.id,
        buildQueueFailurePatch(nextAttemptCount, error, queueSelection.supportsRetryColumns),
      );
    }
  }

  return {
    processed,
    sent,
    failed,
    skipped,
  };
}
