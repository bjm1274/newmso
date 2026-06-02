import { createHash } from 'node:crypto';
import { ensureWebPushConfigured, sendWebPushNotification } from '@/lib/web-push-cloudflare';
import { sendFcmBatch } from '@/lib/fcm-http';
import { shouldDeferStaleChatPush } from '@/lib/push-quiet-hours';
import { buildChatNotificationMetadata } from '@/lib/notification-metadata';
import { NOTICE_ROOM_ID } from '@/lib/constants';
import {
  getD1Binding,
  getD1Drizzle,
  messages as messagesTable,
  chat_rooms as chatRoomsTable,
  chat_push_jobs as chatPushJobsTable,
  notifications as notificationsTable,
  push_subscriptions as pushSubscriptionsTable,
  staff_members as staffMembersTable,
  room_notification_settings as roomNotificationSettingsTable,
  eq,
  and,
  inArray,
  isNull,
  lte,
  or,
  lt,
} from '@/lib/db';

type MessageRow = {
  id: string;
  room_id: string;
  sender_id: string | null;
  content: string | null;
  reply_to_id: string | null;
  created_at: string;
  file_url: string | null;
  file_kind: string | null;
  album_id: string | null;
  album_index: number | null;
  album_total: number | null;
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
  created_at?: string | null;
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

type ExistingChatNotificationRow = {
  id: string;
  user_id: string;
  type: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
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
const BOARD_META_START = '[[BOARD_META]]';
const BOARD_META_END = '[[/BOARD_META]]';

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

function buildQuietHoursDeferredPatch(job: QueueJobRow, supportsRetryColumns: boolean) {
  if (!supportsRetryColumns || !job.created_at) {
    return null;
  }

  const quietHoursDecision = shouldDeferStaleChatPush(job.created_at);
  if (!quietHoursDecision.defer || !quietHoursDecision.resumeAt) {
    return null;
  }

  return {
    processing_started_at: null,
    last_error: 'quiet-hours-deferred',
    next_attempt_at: quietHoursDecision.resumeAt.toISOString(),
    dead_lettered_at: null,
  };
}

function parseBoardMessageMetaType(content: string | null | undefined) {
  const rawContent = String(content || '');
  const startIndex = rawContent.indexOf(BOARD_META_START);
  const endIndex = rawContent.indexOf(BOARD_META_END);

  if (startIndex < 0 || endIndex <= startIndex) {
    return null;
  }

  const jsonText = rawContent
    .slice(startIndex + BOARD_META_START.length, endIndex)
    .trim();

  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText) as { type?: unknown };
    return String(parsed.type || '').trim() || null;
  } catch {
    return null;
  }
}

export function shouldSuppressBoardAutoAnnouncementPush(
  message: Pick<MessageRow, 'room_id' | 'content'>,
  room: Pick<ChatRoomRow, 'id' | 'type'>,
) {
  const messageRoomId = String(message.room_id || '').trim();
  const roomId = String(room.id || '').trim();
  const isNoticeRoom =
    messageRoomId === NOTICE_ROOM_ID ||
    roomId === NOTICE_ROOM_ID ||
    String(room.type || '').trim() === 'notice';

  return isNoticeRoom && parseBoardMessageMetaType(message.content) === 'board_post_link';
}

async function selectPendingChatPushJobsD1(limit: number) {
  const nowIso = new Date().toISOString();
  const staleThresholdIso = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const d1 = await getD1Binding();
  if (!d1) {
    return { jobs: [] as QueueJobRow[], supportsRetryColumns: true, missingQueueTable: false };
  }
  const db = getD1Drizzle(d1);
  const { asc } = await import('drizzle-orm');
  const rows = await db
    .select({
      id: chatPushJobsTable.id,
      message_id: chatPushJobsTable.message_id,
      room_id: chatPushJobsTable.room_id,
      created_at: chatPushJobsTable.created_at,
      attempt_count: chatPushJobsTable.attempt_count,
      next_attempt_at: chatPushJobsTable.next_attempt_at,
      dead_lettered_at: chatPushJobsTable.dead_lettered_at,
    })
    .from(chatPushJobsTable)
    .where(
      and(
        isNull(chatPushJobsTable.processed_at),
        isNull(chatPushJobsTable.dead_lettered_at),
        lte(chatPushJobsTable.next_attempt_at, nowIso),
        or(
          isNull(chatPushJobsTable.processing_started_at),
          lt(chatPushJobsTable.processing_started_at, staleThresholdIso),
        ),
      ),
    )
    .orderBy(asc(chatPushJobsTable.created_at))
    .limit(limit);
  return {
    jobs: rows as QueueJobRow[],
    supportsRetryColumns: true,
    missingQueueTable: false,
  };
}

function toFiniteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getAlbumPushContext(message: MessageRow) {
  const albumId = String(message.album_id || '').trim();
  const albumIndex = toFiniteNumber(message.album_index);
  const albumTotal = toFiniteNumber(message.album_total);
  const isAlbumBatch = Boolean(albumId && albumTotal && albumTotal > 1);
  const isLastAlbumItem = Boolean(
    isAlbumBatch &&
    albumIndex !== null &&
    albumTotal !== null &&
    albumIndex >= albumTotal - 1,
  );

  return {
    albumId: albumId || null,
    albumIndex,
    albumTotal,
    isAlbumBatch,
    isLastAlbumItem,
    notificationTag: isAlbumBatch ? `chat-album-${albumId}` : `chat-msg-${message.id}`,
  };
}

function buildPreview(message: MessageRow) {
  const albumContext = getAlbumPushContext(message);
  const content = String(message.content || '').trim();
  if (content) return content.slice(0, 80);
  if (albumContext.isAlbumBatch && message.file_kind === 'image' && albumContext.albumTotal) {
    return `사진 ${albumContext.albumTotal}장을 보냈습니다.`;
  }
  if (message.file_kind === 'image') return '사진을 보냈습니다.';
  if (message.file_kind === 'video') return '동영상을 보냈습니다.';
  if (message.file_url) return '파일을 보냈습니다.';
  return '새 메시지가 도착했습니다.';
}

async function resolveThreadRootIdForMessage(message: MessageRow) {
  let currentParentId = String(message.reply_to_id || '').trim();
  if (!currentParentId) return null;

  const visited = new Set<string>();
  let resolvedRootId = currentParentId;

  const d1 = await getD1Binding();
  if (!d1) return resolvedRootId || null;
  const db = getD1Drizzle(d1);

  while (currentParentId && !visited.has(currentParentId)) {
    visited.add(currentParentId);
    resolvedRootId = currentParentId;

    const rows = await db
      .select({ id: messagesTable.id, reply_to_id: messagesTable.reply_to_id })
      .from(messagesTable)
      .where(eq(messagesTable.id, currentParentId))
      .limit(1);
    const data = rows[0] ?? null;
    if (!data) break;
    currentParentId = String(data.reply_to_id || '').trim();
  }

  return resolvedRootId || null;
}

function buildDeterministicNotificationId(userId: string, stableKey: string) {
  const bytes = createHash('sha256')
    .update(`chat-notification:${userId}:${stableKey}`)
    .digest()
    .subarray(0, 16);

  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function choosePreferredChatNotification(rows: ExistingChatNotificationRow[]) {
  if (rows.length === 0) return null;

  const sorted = [...rows].sort((left, right) => {
    const leftHasDedupe = String(left.metadata?.dedupe_key || '').trim() ? 1 : 0;
    const rightHasDedupe = String(right.metadata?.dedupe_key || '').trim() ? 1 : 0;
    if (leftHasDedupe !== rightHasDedupe) return rightHasDedupe - leftHasDedupe;

    const leftCreatedAt = new Date(String(left.created_at || 0)).getTime();
    const rightCreatedAt = new Date(String(right.created_at || 0)).getTime();
    if (leftCreatedAt !== rightCreatedAt) return leftCreatedAt - rightCreatedAt;

    return String(left.id).localeCompare(String(right.id));
  });

  return {
    keep: sorted[0]!,
    staleIds: sorted.slice(1).map((row) => String(row.id)),
  };
}

async function getMutedUserIds(roomId: string) {
  try {
    const d1 = await getD1Binding();
    if (!d1) return new Set<string>();
    const db = getD1Drizzle(d1);
    const rows = await db
      .select({ user_id: roomNotificationSettingsTable.user_id })
      .from(roomNotificationSettingsTable)
      .where(
        and(
          eq(roomNotificationSettingsTable.room_id, roomId),
          eq(roomNotificationSettingsTable.notifications_enabled, 0),
        ),
      );
    return new Set(rows.map((row) => String(row.user_id)));
  } catch {
    return new Set<string>();
  }
}

async function updateChatPushJobByMessageId(
  messageId: string,
  patch: Record<string, unknown>,
) {
  const d1 = await getD1Binding();
  if (!d1) return;
  const db = getD1Drizzle(d1);
  await db
    .update(chatPushJobsTable)
    .set(patch as Parameters<ReturnType<typeof db.update>['set']>[0])
    .where(eq(chatPushJobsTable.message_id, messageId));
}

async function updateChatPushJobById(
  jobId: string,
  patch: Record<string, unknown>,
) {
  const d1 = await getD1Binding();
  if (!d1) return;
  const db = getD1Drizzle(d1);
  await db
    .update(chatPushJobsTable)
    .set(patch as Parameters<ReturnType<typeof db.update>['set']>[0])
    .where(eq(chatPushJobsTable.id, jobId));
}

async function fetchMessageAndRoom(
  messageId: string,
  roomId: string,
): Promise<{ message: MessageRow | null; room: ChatRoomRow | null }> {
  const d1 = await getD1Binding();
  if (!d1) return { message: null, room: null };
  const db = getD1Drizzle(d1);
  const [msgRows, roomRows] = await Promise.all([
    db
      .select({
        id: messagesTable.id,
        room_id: messagesTable.room_id,
        sender_id: messagesTable.sender_id,
        content: messagesTable.content,
        reply_to_id: messagesTable.reply_to_id,
        created_at: messagesTable.created_at,
        file_url: messagesTable.file_url,
        file_kind: messagesTable.file_kind,
        album_id: messagesTable.album_id,
        album_index: messagesTable.album_index,
        album_total: messagesTable.album_total,
      })
      .from(messagesTable)
      .where(eq(messagesTable.id, messageId))
      .limit(1),
    db
      .select({
        id: chatRoomsTable.id,
        name: chatRoomsTable.name,
        type: chatRoomsTable.type,
        members: chatRoomsTable.members,
      })
      .from(chatRoomsTable)
      .where(eq(chatRoomsTable.id, roomId))
      .limit(1),
  ]);

  const rawMsg = msgRows[0] ?? null;
  const rawRoom = roomRows[0] ?? null;

  if (!rawMsg || !rawRoom) return { message: null, room: null };

  // D1 members는 TEXT(JSON) → 파싱
  let parsedMembers: string[] | null = null;
  if (typeof rawRoom.members === 'string' && rawRoom.members.length > 0) {
    try {
      const parsed = JSON.parse(rawRoom.members) as unknown;
      if (Array.isArray(parsed)) parsedMembers = parsed.map((m) => String(m));
    } catch { parsedMembers = null; }
  } else if (Array.isArray(rawRoom.members)) {
    parsedMembers = (rawRoom.members as unknown[]).map((m) => String(m));
  }

  return {
    message: rawMsg as MessageRow,
    room: { ...rawRoom, members: parsedMembers } as ChatRoomRow,
  };
}

export async function dispatchChatPushForMessage(params: {
  roomId: string;
  messageId: string;
  expectedSenderId?: string;
}) {
  // ── 이중 발송 방지 + 초기 데이터 병렬 로드 ──
  const [, fetchResult, mutedIdsEarly] = await Promise.all([
    updateChatPushJobByMessageId(params.messageId, {
      processing_started_at: new Date().toISOString(),
    }),
    fetchMessageAndRoom(params.messageId, params.roomId),
    getMutedUserIds(params.roomId),
  ]);

  if (!fetchResult.message || !fetchResult.room) {
    await updateChatPushJobByMessageId(params.messageId, {
      processed_at: new Date().toISOString(),
      processing_started_at: null,
      last_error: 'message-or-room-not-found',
    });
    return {
      sent: 0,
      failed: 0,
      targets: 0,
      notificationsCreated: 0,
      pushDisabled: false,
      reason: 'message-or-room-not-found',
    } satisfies ChatPushDispatchResult;
  }

  const message = fetchResult.message;
  const room = fetchResult.room;
  const senderId = String(message.sender_id || '');
  const albumContext = getAlbumPushContext(message);

  if (params.expectedSenderId && senderId !== String(params.expectedSenderId)) {
    throw new Error('Only the message sender can trigger chat push.');
  }

  if (albumContext.isAlbumBatch && !albumContext.isLastAlbumItem) {
    await updateChatPushJobByMessageId(params.messageId, {
      processed_at: new Date().toISOString(),
      processing_started_at: null,
      last_error: 'album-batch-intermediate-suppressed',
    });
    return {
      sent: 0,
      failed: 0,
      targets: 0,
      notificationsCreated: 0,
      pushDisabled: false,
      reason: 'album-batch-intermediate',
    } satisfies ChatPushDispatchResult;
  }

  if (shouldSuppressBoardAutoAnnouncementPush(message, room)) {
    await updateChatPushJobByMessageId(params.messageId, {
      processed_at: new Date().toISOString(),
      processing_started_at: null,
      last_error: 'board-auto-announcement-suppressed',
    });
    return {
      sent: 0,
      failed: 0,
      targets: 0,
      notificationsCreated: 0,
      pushDisabled: false,
      reason: 'board-auto-announcement',
    } satisfies ChatPushDispatchResult;
  }

  let members = Array.isArray(room.members) ? room.members.map((id) => String(id)) : [];
  // 공지방은 members가 비어 있어도 전 직원에게 발송 (시드 단계에서 members가 미설정됨)
  const isNoticeRoom =
    String(room.id || '') === NOTICE_ROOM_ID || String(room.type || '').trim() === 'notice';
  if (members.length === 0 && isNoticeRoom) {
    const d1 = await getD1Binding();
    if (d1) {
      const db = getD1Drizzle(d1);
      const staffRows = await db.select({ id: staffMembersTable.id }).from(staffMembersTable);
      members = staffRows.map((row) => String(row.id || '').trim()).filter(Boolean);
    }
  }
  if (members.length === 0) {
    await updateChatPushJobByMessageId(params.messageId, {
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

  // 수정 K: 멘션된 사용자는 뮤트 여부와 무관하게 발송 대상에 포함
  // @[표시명](staff:staffId) 패턴에서 staffId 추출
  const mentionedIds = new Set<string>();
  const mentionPattern = /@\[.*?\]\(staff:([^)]+)\)/g;
  const contentStr = String(message.content || '');
  let mentionMatch: RegExpExecArray | null;
  while ((mentionMatch = mentionPattern.exec(contentStr)) !== null) {
    const mentionedId = String(mentionMatch[1] || '').trim();
    if (mentionedId) mentionedIds.add(mentionedId);
  }

  const targetIds = members.filter(
    (id) => id && id !== senderId && (!mutedIdsEarly.has(id) || mentionedIds.has(id)),
  );

  if (targetIds.length === 0) {
    await updateChatPushJobByMessageId(params.messageId, {
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

  let subscriptions: PushSubscriptionRow[] = [];
  let senderName = '새 메시지';

  {
    const d1 = await getD1Binding();
    if (!d1) throw new Error('[chat-push-dispatch] D1 binding not available (subscriptions)');
    const db = getD1Drizzle(d1);
    const [subRows, senderRows] = await Promise.all([
      db
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
        .where(inArray(pushSubscriptionsTable.staff_id, targetIds)),
      db
        .select({ name: staffMembersTable.name })
        .from(staffMembersTable)
        .where(eq(staffMembersTable.id, senderId))
        .limit(1),
    ]);
    subscriptions = subRows as PushSubscriptionRow[];
    senderName = String(senderRows[0]?.name || '새 메시지');
  }
  const title =
    room.type === 'notice'
      ? '공지 메시지'
      : room.name
        ? `${senderName} - ${room.name}`
        : senderName;

  const previewBody = buildPreview(message);
  const threadRootId = await resolveThreadRootIdForMessage(message);

  // 기존 알림 조회 (중복 방지용)
  // D1에서는 metadata JSON 텍스트 full-scan으로 message_id 필터
  // (JSONPath 필터 미지원) — metadata를 파싱 후 JS단에서 필터
  const existingNotificationsByUser = new Map<string, ExistingChatNotificationRow[]>();
  {
    const d1 = await getD1Binding();
    if (d1) {
      const db = getD1Drizzle(d1);
      const notifRows = await db
        .select({
          id: notificationsTable.id,
          user_id: notificationsTable.user_id,
          type: notificationsTable.type,
          metadata: notificationsTable.metadata,
          created_at: notificationsTable.created_at,
        })
        .from(notificationsTable)
        .where(
          and(
            inArray(notificationsTable.user_id, targetIds),
            inArray(notificationsTable.type, ['message', 'mention']),
          ),
        )
        .limit(500);

      for (const row of notifRows) {
        let parsedMeta: Record<string, unknown> | null = null;
        if (typeof row.metadata === 'string' && row.metadata.length > 0) {
          try {
            const p = JSON.parse(row.metadata) as unknown;
            if (p && typeof p === 'object' && !Array.isArray(p)) parsedMeta = p as Record<string, unknown>;
          } catch { parsedMeta = null; }
        }
        // message_id 필터
        if (!parsedMeta || String(parsedMeta.message_id || '') !== params.messageId) continue;
        const notifRow: ExistingChatNotificationRow = {
          id: String(row.id ?? ''),
          user_id: String(row.user_id ?? ''),
          type: row.type ?? null,
          metadata: parsedMeta,
          created_at: row.created_at ?? null,
        };
        const uid = String(notifRow.user_id || '').trim();
        if (!uid) continue;
        existingNotificationsByUser.set(uid, [
          ...(existingNotificationsByUser.get(uid) || []),
          notifRow,
        ]);
      }
    }
  }

  const staleNotificationIds = new Set<string>();
  const notificationStableKey =
    albumContext.isAlbumBatch && albumContext.albumId
      ? `album:${albumContext.albumId}`
      : `message:${params.messageId}`;
  const notificationRows: NotificationInsertRow[] = targetIds.map((targetId) => {
    const preferred = choosePreferredChatNotification(existingNotificationsByUser.get(targetId) || []);
    preferred?.staleIds.forEach((id) => staleNotificationIds.add(id));

    return {
      id: preferred?.keep?.id || buildDeterministicNotificationId(targetId, notificationStableKey),
      user_id: targetId,
      type: 'message',
      title,
      body: previewBody,
      metadata: buildChatNotificationMetadata({
        roomId: params.roomId,
        messageId: params.messageId,
        notificationType: 'message',
        dedupeKey:
          albumContext.isAlbumBatch && albumContext.albumId
            ? `chat:album:${albumContext.albumId}:${targetId}`
            : `chat:${params.messageId}:${targetId}`,
        extra: {
          album_id: albumContext.albumId,
          album_index: albumContext.albumIndex,
          album_total: albumContext.albumTotal,
          sender_name: senderName,
          room_name: room.name || '',
          created_at: message.created_at,
          is_thread_reply: Boolean(message.reply_to_id),
          reply_to_id: message.reply_to_id || null,
          thread_root_id: threadRootId,
        },
      }),
      read_at: null,
      created_at: message.created_at || new Date().toISOString(),
    };
  });

  // 알림 DB 저장은 백그라운드로 — push 전송과 병렬 실행
  const notificationInsertPromise: Promise<void> =
    notificationRows.length > 0
      ? (async () => {
          const d1 = await getD1Binding();
          if (!d1) return;
          const db = getD1Drizzle(d1);
          try {
            for (const row of notificationRows) {
              // metadata는 객체 → JSON.stringify
              await db
                .insert(notificationsTable)
                .values({
                  ...row,
                  metadata: JSON.stringify(row.metadata),
                })
                .onConflictDoUpdate({
                  target: notificationsTable.id,
                  set: {
                    title: row.title,
                    body: row.body,
                    metadata: JSON.stringify(row.metadata),
                  },
                });
            }
          } catch (err) {
            console.error('chat notification D1 insert failed', err);
          }
          if (staleNotificationIds.size > 0) {
            try {
              await db
                .delete(notificationsTable)
                .where(inArray(notificationsTable.id, Array.from(staleNotificationIds)));
            } catch (err) {
              console.error('chat notification D1 cleanup failed', err);
            }
          }
        })()
      : Promise.resolve();

  let pushDisabled = false;
  try {
    ensureWebPushConfigured();
  } catch {
    pushDisabled = true;
  }

  // FCM 토큰이 있는 staff_id 집합 — 이 기기에는 FCM만 발송, Web Push 제외 (이중 발송 방지)
  // FCM 토큰이 있는 staff_id 집합 — 이 기기에는 FCM만 발송, Web Push 제외 (이중 발송 방지)
  const staffIdsWithFcmToken = new Set<string>(
    subscriptions
      .filter((row) => row.fcm_token && row.staff_id && row.staff_id !== senderId)
      .map((row) => String(row.staff_id))
  );

  const uniqueSubscriptions = new Map<string, PushSubscriptionRow>();
  for (const row of subscriptions) {
    if (!row.endpoint || !row.staff_id || row.staff_id === senderId) continue;
    if (!row.p256dh || !row.auth || !/^https?:\/\//i.test(String(row.endpoint))) continue;
    // FCM 토큰이 있는 사용자는 Web Push 제외 (FCM으로만 발송)
    if (staffIdsWithFcmToken.has(row.staff_id)) continue;
    if (!uniqueSubscriptions.has(row.endpoint)) {
      uniqueSubscriptions.set(row.endpoint, row);
    }
  }

  // 같은 staff_id에 잔재 fcm_token이 여러 개 남아있을 수 있으므로
  // 사용자당 가장 최근(created_at 내림차순) 토큰 1개만 사용해 이중 발송 차단.
  const latestFcmTokenByStaffId = new Map<string, { token: string; createdAt: number }>();
  for (const row of subscriptions) {
    if (!row.fcm_token || !row.staff_id || row.staff_id === senderId) continue;
    const token = String(row.fcm_token).trim();
    if (!token) continue;
    const createdAt = row.created_at ? Date.parse(String(row.created_at)) : 0;
    const prev = latestFcmTokenByStaffId.get(row.staff_id);
    if (!prev || (Number.isFinite(createdAt) ? createdAt : 0) > prev.createdAt) {
      latestFcmTokenByStaffId.set(row.staff_id, {
        token,
        createdAt: Number.isFinite(createdAt) ? createdAt : 0,
      });
    }
  }
  const uniqueFcmTokens = Array.from(
    new Set(Array.from(latestFcmTokenByStaffId.values()).map((entry) => entry.token))
  );

  if (uniqueSubscriptions.size === 0 && uniqueFcmTokens.length === 0) {
    await Promise.all([
      notificationInsertPromise,
      updateChatPushJobByMessageId(params.messageId, {
        processed_at: new Date().toISOString(),
        processing_started_at: null,
        last_error: 'no-active-subscriptions',
      }),
    ]);

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
  let sent = 0;
  let failed = 0;
  const expiredIds: string[] = [];
  const notificationTag = albumContext.notificationTag;
  const payloadData = buildChatNotificationMetadata({
    roomId: params.roomId,
    messageId: params.messageId,
    notificationType: 'message',
    extra: {
      created_at: message.created_at,
      tag: notificationTag,
      is_thread_reply: Boolean(message.reply_to_id),
      reply_to_id: message.reply_to_id || null,
      thread_root_id: threadRootId,
      ...(albumContext.albumId ? { album_id: albumContext.albumId } : {}),
      ...(albumContext.albumIndex !== null ? { album_index: String(albumContext.albumIndex) } : {}),
      ...(albumContext.albumTotal !== null ? { album_total: String(albumContext.albumTotal) } : {}),
    },
  });
  const webPushPayload = JSON.stringify({
    title,
    body: previewBody,
    tag: notificationTag,
    data: payloadData,
  });
  const fcmPayloadData = Object.entries(payloadData).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      if (value === null || value === undefined) return acc;
      acc[key] = typeof value === 'string' ? value : JSON.stringify(value);
      return acc;
    },
    {},
  );

  const fcmPromise = (async () => {
    if (uniqueFcmTokens.length === 0) return;
    try {
      const fcmResult = await sendFcmBatch(uniqueFcmTokens, {
        title,
        body: previewBody,
        data: fcmPayloadData,
      });
      sent += fcmResult.success.length;
      // error 토큰(5xx·네트워크 실패)은 유효할 수 있으므로 무효화하지 않는다.
      // expired 토큰(NOT_FOUND·INVALID_ARGUMENT·400·404)만 DB에서 null 처리.
      if (fcmResult.expired.length > 0) {
        const d1b = await getD1Binding();
        if (d1b) {
          const dbFcm = getD1Drizzle(d1b);
          for (const expiredToken of fcmResult.expired) {
            await dbFcm
              .update(pushSubscriptionsTable)
              .set({ fcm_token: null })
              .where(eq(pushSubscriptionsTable.fcm_token, expiredToken));
          }
        }
      }
    } catch (fcmErr) {
      console.error('[FCM] batch send failed, falling back to web push where possible:', fcmErr);
    }
  })();

  // FCM 성공 토큰을 먼저 확정한 뒤에만 Web Push 대상을 계산해야
  // 동일 기기로 FCM + Web Push가 중복 발송되지 않는다.
  await fcmPromise;

  const webPushPromise = (async () => {
    if (pushDisabled) return;
    const payload = webPushPayload;

    const targets = Array.from(uniqueSubscriptions.values());

    if (targets.length === 0) return;

    const results = await Promise.allSettled(
      targets.map((subscription) =>
        sendWebPushNotification(subscription, payload).then(() => ({
          ok: true as const,
          id: subscription.id,
        }))
      )
    );
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled' && r.value.ok) {
        sent += 1;
      } else {
        failed += 1;
        const err = r.status === 'rejected' ? r.reason : null;
        const statusCode = Number(err?.statusCode || err?.status || 0);
        if (statusCode === 404 || statusCode === 410) {
          expiredIds.push(targets[i].id);
        }
      }
    }
  })();

  // 알림 저장은 FCM과 병렬로 시작해두고, Web Push는 FCM 결과 반영 후 마무리한다.
  await Promise.all([notificationInsertPromise, webPushPromise]);

  if (expiredIds.length > 0) {
    const d1b = await getD1Binding();
    if (d1b) {
      const dbExp = getD1Drizzle(d1b);
      await dbExp.delete(pushSubscriptionsTable).where(inArray(pushSubscriptionsTable.id, expiredIds));
    }
  }

  const hasUndeliveredWebPushTargets = uniqueSubscriptions.size > 0;

  if (pushDisabled && hasUndeliveredWebPushTargets) {
    await updateChatPushJobByMessageId(params.messageId, {
      processing_started_at: null,
      last_error: 'web-push-disabled',
    });

    return {
      sent,
      failed,
      targets: targetIds.length,
      notificationsCreated: notificationRows.length,
      pushDisabled: true,
      reason: 'web-push-disabled',
    } satisfies ChatPushDispatchResult;
  }

  await updateChatPushJobByMessageId(params.messageId, {
    processed_at: new Date().toISOString(),
    processing_started_at: null,
    last_error: pushDisabled && hasUndeliveredWebPushTargets ? 'web-push-disabled' : null,
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
  const queueSelection = await selectPendingChatPushJobsD1(limit);

  if (queueSelection.missingQueueTable) {
    return { processed: 0, sent: 0, failed: 0, skipped: 0, reason: 'queue-table-missing' };
  }

  const jobs = queueSelection.jobs;
  let processed = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const job of jobs) {
    const quietHoursPatch = buildQuietHoursDeferredPatch(job, queueSelection.supportsRetryColumns);
    if (quietHoursPatch) {
      skipped += 1;
      await updateChatPushJobById(job.id, quietHoursPatch);
      continue;
    }

    const nextAttemptCount = Number(job.attempt_count || 0) + 1;
    await updateChatPushJobById(job.id, {
      processing_started_at: new Date().toISOString(),
      attempt_count: nextAttemptCount,
      last_error: null,
    });

    try {
      const result = await dispatchChatPushForMessage({
        roomId: String(job.room_id),
        messageId: String(job.message_id),
      });
      processed += 1;
      sent += result.sent;
      failed += result.failed;
      if (result.reason === 'web-push-disabled') {
        skipped += 1;
        if (queueSelection.supportsRetryColumns) {
          await updateChatPushJobById(
            job.id,
            buildQueueFailurePatch(nextAttemptCount, result.reason, true),
          );
        } else {
          await updateChatPushJobById(job.id, {
            processed_at: new Date().toISOString(),
            processing_started_at: null,
            last_error: result.reason,
          });
        }
        continue;
      }
      if (result.reason) skipped += 1;
    } catch (error: unknown) {
      failed += 1;
      await updateChatPushJobById(
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
