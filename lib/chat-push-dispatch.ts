import { createHash } from 'node:crypto';
import { ensureWebPushConfigured, sendWebPushNotification } from '@/lib/web-push-cloudflare';
import { sendFcmBatch } from '@/lib/fcm-http';
import { shouldDeferStaleChatPush } from '@/lib/push-quiet-hours';
import { buildChatNotificationMetadata } from '@/lib/notification-metadata';
import { NOTICE_ROOM_ID } from '@/lib/constants';
import { parseMembersField } from '@/lib/chat-room-membership';
import { emitRealtimeSignal } from '@/lib/realtime/server-signal';
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
  sql } from '@/lib/db';

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
/**
 * 큐에 남은 채팅 푸시의 만료 시각(시간).
 *
 * 지난 며칠치 채팅 알림이 한꺼번에 폰에 뜨는 것은 알림이 아니라 사고다.
 * 크론이 멈췄다가 되살아나는 상황(실제로 CRON_SECRET 공백으로 12일간 정지)에서
 * 밀린 job 을 그대로 발송하면 19일 전 메시지 푸시가 쏟아진다.
 * 만료된 job 은 발송하지 않고 처리 완료로 닫는다 — 인앱 알림·안읽음 배지는
 * 메시지 자체로 이미 남아 있으므로 사용자가 놓치는 정보는 없다.
 */
const CHAT_PUSH_EXPIRY_HOURS = (() => {
  const parsed = Number(process.env.ERP_CHAT_PUSH_EXPIRY_HOURS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 24;
})();

export function isChatPushJobExpired(createdAt: string | null | undefined, now = Date.now()) {
  const created = Date.parse(String(createdAt || ''));
  if (!Number.isFinite(created)) return false;
  return now - created > CHAT_PUSH_EXPIRY_HOURS * 60 * 60 * 1000;
}
const BOARD_META_START = '[[BOARD_META]]';
const BOARD_META_END = '[[/BOARD_META]]';

/**
 * SQLite CURRENT_TIMESTAMP 형식('YYYY-MM-DD HH:MM:SS', UTC)을 ISO 8601 로 맞춘다.
 *
 * TEXT 타임스탬프는 사전순으로 비교되므로 한 컬럼 안에 두 형식이 섞이면
 * 시간 순서와 정렬 순서가 어긋난다. 이미 ISO 면 그대로 두고, 형식을 알 수 없으면
 * null 을 돌려 호출부가 현재 시각으로 대체하게 한다(잘못된 값을 흘리지 않는다).
 */
export function toIsoTimestamp(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (raw.includes('T')) return raw;

  const matched = raw.match(/^(\d{4}-\d{2}-\d{2})[ ](\d{2}:\d{2}:\d{2})(\.\d+)?$/);
  if (!matched) return null;

  // CURRENT_TIMESTAMP 는 UTC 라 Z 를 붙이는 게 맞다.
  return `${matched[1]}T${matched[2]}${matched[3] || '.000'}Z`;
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
      last_error: message };
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
    dead_lettered_at: exhausted ? now.toISOString() : null };
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
    dead_lettered_at: null };
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
      dead_lettered_at: chatPushJobsTable.dead_lettered_at })
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
    missingQueueTable: false };
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
    notificationTag: isAlbumBatch ? `chat-album-${albumId}` : `chat-msg-${message.id}` };
}

const STATIC_WORKER_LABELS = [
  "출근 완료", "모닝 커피", "넵!", "회의 중", "월루 중", "멘탈 붕괴", "분노", "눈물",
  "점심시간!", "월급날", "퇴근", "종이비행기", "퇴사 마렵다", "감사합니다", "멘붕",
  "체력 방전", "주말 언제 와?", "질문 있습니다", "최고", "주말 시작"
];

const STATIC_HOSPITAL_LABELS = [
  "인계 중", "Full Bed", "정시 퇴근 기원", "CPR", "EHR 로딩 중", "당직 후", "믹스 중",
  "환자 컴플레인", "폭풍 흡입", "수술 완료", "스테이션 지킴이", "멘탈 바사삭", "오더 확인",
  "처치 중", "바이탈 정상", "출근 전", "선생님!", "칼퇴 성공", "커피 수혈", "오늘도 무사히"
];

const STATIC_CAT_LABELS = [
  "미소 고양이", "하트 뿅뿅", "하트 날리기", "어리둥절", "시무룩", "곁눈질", "고민 중",
  "방긋", "웃픈 고양이", "엉엉", "식은땀", "오싹", "겁먹음", "최고!",
  "깜놀", "분노 폭발", "충격", "쿨쿨", "선글라스", "윙크 따봉", "흐뭇",
  "메롱", "헤헤 메롱", "깜짝이야", "쉿", "만세 축하", "슬픈 눈물", "따봉 고양이"
];

const ANIM_EMOTICON_LABELS: Record<string, string> = {
  "o-coffee": "커피수혈", "o-overtime": "야근각...", "o-leaveontime": "칼퇴!!", "o-monday": "월요병",
  "o-meltdown": "멘붕", "o-meeting": "회의중...", "o-deadline": "마감임박", "o-boss": "상사눈치",
  "o-praise": "칭찬받음", "o-swamped": "폭풍업무", "o-payday": "월급날", "o-angry": "빡침",
  "o-sleepy": "졸림", "o-blank": "멍...", "o-wanttogo": "퇴근하고파", "o-lunch": "점심뭐먹지",
  "o-fighting": "화이팅!", "o-existential": "현타옴", "o-approve": "결재부탁", "o-wfh": "칼답 대기",
  "h-night": "야간당직", "h-rounds": "회진중", "h-emergency": "응급!!", "h-chart": "차트작성",
  "h-inject": "주사들어갑니다", "h-care": "환자케어", "h-sanitize": "손소독", "h-mask": "마스크답답",
  "h-codeblue": "코드블루", "h-shift": "교대요청", "h-hungry": "밥은언제", "h-counsel": "보호자상담",
  "h-surgery": "수술중", "h-prescribe": "처방나갑니다", "h-off": "퇴근합니다", "h-thanks": "감사인사",
  "h-burnout": "번아웃", "h-coffee": "카페인충전", "h-cheer": "화이팅!", "h-drowsy": "졸음쏟아짐",
  "d-coding": "폭풍코딩", "d-bug": "버그발생!", "d-caffeine": "카페인 수혈", "d-compile": "컴파일중",
  "d-release": "배포성공!!", "d-lgtm": "LGTM!", "d-serverdown": "서버 터짐", "d-headphones": "개발몰입",
  "d-stackoverflow": "검색신공", "d-gitpush": "깃 푸시!", "d-turtle": "거북목 증후군", "d-specs": "기획 변경...",
  "d-refactor": "리팩토링", "d-keyboard": "키보드 샷건", "d-zoom": "화상회의", "d-salary": "연봉협상",
  "d-allnight": "철야코딩", "d-dbrecovery": "디비복구", "d-cleanup": "코드 정리", "d-approve": "승인대기"
};

function resolveStickerLabel(statId: string): string {
  const isHospital = statId.startsWith('hospital-');
  const isCat = statId.startsWith('cat-');
  const num = parseInt(statId.split('-')[1], 10);
  if (isNaN(num)) return statId;

  if (isCat) {
    return STATIC_CAT_LABELS[num - 1] || statId;
  }
  return isHospital
    ? STATIC_HOSPITAL_LABELS[num - 1] || statId
    : STATIC_WORKER_LABELS[num - 1] || statId;
}

function replaceEmoticonCodes(content: string): string {
  return content.replace(/\[(emo|stat):([a-z0-9-]+)\]/g, (match, kind, id) => {
    if (kind === 'emo') {
      const label = ANIM_EMOTICON_LABELS[id];
      return label ? `(이모티콘: ${label})` : `(이모티콘)`;
    } else {
      const label = resolveStickerLabel(id);
      return label ? `(스티커: ${label})` : `(스티커)`;
    }
  });
}

function buildPreview(message: MessageRow) {
  const albumContext = getAlbumPushContext(message);
  let content = String(message.content || '').trim();
  if (content) {
    content = replaceEmoticonCodes(content);
    return content.slice(0, 80);
  }
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
    staleIds: sorted.slice(1).map((row) => String(row.id)) };
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

/** CAS claim — 다른 워커가 처리 중/완료면 false */
async function claimChatPushJobByMessageId(messageId: string): Promise<boolean> {
  const d1 = await getD1Binding();
  if (!d1) return true; // 바인딩 없으면 기존 경로 (로컬)
  const db = getD1Drizzle(d1);
  const nowIso = new Date().toISOString();
  const staleIso = new Date(Date.now() - 90_000).toISOString();
  try {
    const result = await db.run(sql`
      UPDATE chat_push_jobs
      SET processing_started_at = ${nowIso}
      WHERE message_id = ${messageId}
        AND processed_at IS NULL
        AND (
          processing_started_at IS NULL
          OR processing_started_at < ${staleIso}
        )
    `);
    const changes = Number((result as { meta?: { changes?: number }; changes?: number })?.meta?.changes
      ?? (result as { changes?: number })?.changes
      ?? 0);
    // D1 결과 형태가 환경마다 달라 changes 미제공이면 진행 허용
    if (!Number.isFinite(changes) || changes === 0) {
      // 재조회로 이미 처리/점유 여부 확인
      const existing = await db
        .select({
          processed_at: chatPushJobsTable.processed_at,
          processing_started_at: chatPushJobsTable.processing_started_at,
        })
        .from(chatPushJobsTable)
        .where(eq(chatPushJobsTable.message_id, messageId))
        .limit(1);
      const row = existing[0];
      if (row?.processed_at) return false;
      if (row?.processing_started_at) {
        const started = Date.parse(String(row.processing_started_at));
        if (Number.isFinite(started) && Date.now() - started < 90_000 && String(row.processing_started_at) !== nowIso) {
          return false;
        }
      }
    }
    return true;
  } catch {
    return true;
  }
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
        album_total: messagesTable.album_total })
      .from(messagesTable)
      .where(eq(messagesTable.id, messageId))
      .limit(1),
    db
      .select({
        id: chatRoomsTable.id,
        name: chatRoomsTable.name,
        type: chatRoomsTable.type,
        members: chatRoomsTable.members })
      .from(chatRoomsTable)
      .where(eq(chatRoomsTable.id, roomId))
      .limit(1),
  ]);

  const rawMsg = msgRows[0] ?? null;
  const rawRoom = roomRows[0] ?? null;

  if (!rawMsg || !rawRoom) return { message: null, room: null };

  // D1 members는 TEXT(JSON) → 파싱
  const parsedMembers = parseMembersField(rawRoom.members);

  return {
    message: rawMsg as MessageRow,
    room: { ...rawRoom, members: parsedMembers } as ChatRoomRow };
}

export async function dispatchChatPushForMessage(params: {
  roomId: string;
  messageId: string;
  expectedSenderId?: string;
}) {
  // ── 멱등: 이미 처리된 job 은 즉시 스킵 (클라이언트+서버 동시 트리거 이중 푸시 방지) ──
  try {
    const d1 = await getD1Binding();
    if (d1) {
      const db = getD1Drizzle(d1);
      const existing = await db
        .select({
          processed_at: chatPushJobsTable.processed_at,
          processing_started_at: chatPushJobsTable.processing_started_at,
        })
        .from(chatPushJobsTable)
        .where(eq(chatPushJobsTable.message_id, params.messageId))
        .limit(1);
      const row = existing[0];
      if (row?.processed_at) {
        return {
          sent: 0,
          failed: 0,
          targets: 0,
          notificationsCreated: 0,
          pushDisabled: false,
          reason: 'already-processed',
        } satisfies ChatPushDispatchResult;
      }
      // 다른 워커가 2분 이내 처리 중이면 스킵 (stale 락은 cron 이 회수)
      if (row?.processing_started_at) {
        const started = Date.parse(String(row.processing_started_at));
        if (Number.isFinite(started) && Date.now() - started < 90_000) {
          return {
            sent: 0,
            failed: 0,
            targets: 0,
            notificationsCreated: 0,
            pushDisabled: false,
            reason: 'in-flight',
          } satisfies ChatPushDispatchResult;
        }
      }
    }
  } catch {
    // 조회 실패 시 기존 경로로 진행
  }

  // ── CAS claim 후 로드 (크론·즉시 디스패치 동시 발송 방지) ──
  const claimed = await claimChatPushJobByMessageId(params.messageId);
  if (!claimed) {
    return {
      sent: 0,
      failed: 0,
      targets: 0,
      notificationsCreated: 0,
      pushDisabled: false,
      reason: 'in-flight',
    } satisfies ChatPushDispatchResult;
  }
  const [fetchResult, mutedIdsEarly] = await Promise.all([
    fetchMessageAndRoom(params.messageId, params.roomId),
    getMutedUserIds(params.roomId),
  ]);

  if (!fetchResult.message || !fetchResult.room) {
    await updateChatPushJobByMessageId(params.messageId, {
      processed_at: new Date().toISOString(),
      processing_started_at: null,
      last_error: 'message-or-room-not-found' });
    return {
      sent: 0,
      failed: 0,
      targets: 0,
      notificationsCreated: 0,
      pushDisabled: false,
      reason: 'message-or-room-not-found' } satisfies ChatPushDispatchResult;
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
      last_error: 'album-batch-intermediate-suppressed' });
    return {
      sent: 0,
      failed: 0,
      targets: 0,
      notificationsCreated: 0,
      pushDisabled: false,
      reason: 'album-batch-intermediate' } satisfies ChatPushDispatchResult;
  }

  if (shouldSuppressBoardAutoAnnouncementPush(message, room)) {
    await updateChatPushJobByMessageId(params.messageId, {
      processed_at: new Date().toISOString(),
      processing_started_at: null,
      last_error: 'board-auto-announcement-suppressed' });
    return {
      sent: 0,
      failed: 0,
      targets: 0,
      notificationsCreated: 0,
      pushDisabled: false,
      reason: 'board-auto-announcement' } satisfies ChatPushDispatchResult;
  }

  let members = parseMembersField(room.members);
  // 공지방은 members가 비어 있어도 전 직원에게 발송 (시드 단계에서 members가 미설정됨)
  const isNoticeRoom =
    String(room.id || '') === NOTICE_ROOM_ID || String(room.type || '').trim() === 'notice';
  if (members.length === 0 && isNoticeRoom) {
    const d1 = await getD1Binding();
    if (d1) {
      const db = getD1Drizzle(d1);
      // 비용 가드: 전 직원 무제한 스캔 금지 — 재직자 위주 + 상한 800
      // (공지방 1건 푸시가 수천 FCM/WebPush 를 쏘면 $5 플랜·예외 로그 폭주)
      const staffRows = await db
        .select({ id: staffMembersTable.id, status: staffMembersTable.status })
        .from(staffMembersTable)
        .limit(800);
      members = staffRows
        .filter((row) => {
          const st = String(row.status || '').trim();
          if (!st) return true;
          return !/퇴직|퇴사|resign|inactive|leave_of_absence/i.test(st);
        })
        .map((row) => String(row.id || '').trim())
        .filter(Boolean);
    }
  }
  if (members.length === 0) {
    await updateChatPushJobByMessageId(params.messageId, {
      processed_at: new Date().toISOString(),
      processing_started_at: null,
      last_error: null });
    return {
      sent: 0,
      failed: 0,
      targets: 0,
      notificationsCreated: 0,
      pushDisabled: false,
      reason: 'no-room-members' } satisfies ChatPushDispatchResult;
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
      last_error: null });
    return {
      sent: 0,
      failed: 0,
      targets: 0,
      notificationsCreated: 0,
      pushDisabled: false,
      reason: 'no-targets' } satisfies ChatPushDispatchResult;
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
          created_at: pushSubscriptionsTable.created_at })
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
          created_at: notificationsTable.created_at })
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
          created_at: row.created_at ?? null };
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
    // 멘션 대상이면 type/metadata를 mention 으로 기록 (mention_only 방 설정·UI 멘션 탭 정상화)
    const isMention = mentionedIds.has(targetId);
    const rowType = isMention ? 'mention' : 'message';

    return {
      id: preferred?.keep?.id || buildDeterministicNotificationId(targetId, notificationStableKey),
      user_id: targetId,
      type: rowType,
      title,
      body: previewBody,
      metadata: buildChatNotificationMetadata({
        roomId: params.roomId,
        messageId: params.messageId,
        notificationType: rowType,
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
          thread_root_id: threadRootId } }),
      read_at: null,
      // **반드시 ISO 로 정규화한다.** message.created_at 를 그대로 복사하면 안 된다.
      // messages 는 SQLite CURRENT_TIMESTAMP('2026-07-28 11:50:08') 형식인데
      // 다른 알림(결재·재고 등)은 toISOString('2026-07-28T11:30:17.636Z') 로 들어온다.
      // notifications.created_at 은 TEXT 라 비교가 사전순이고 ' '(0x20) < 'T'(0x54) 이므로,
      // 같은 날짜면 채팅 알림이 항상 더 작다. /api/realtime/tail 은 테이블별
      // max(created_at) 변화로 갱신을 감지하는데, 새 채팅 알림이 max 를 못 올려서
      // **새 메시지 팝업·배지가 아예 뜨지 않았다.**
      // (프로덕션 확인: max=11:30 결재 알림, 실제 최신 채팅 알림=11:50)
      created_at: toIsoTimestamp(message.created_at) || new Date().toISOString() };
  });

  // 알림 DB 저장은 백그라운드로 — push 전송과 병렬 실행
  const notificationInsertPromise: Promise<void> =
    notificationRows.length > 0
      ? (async () => {
          const d1 = await getD1Binding();
          if (!d1) return;
          const db = getD1Drizzle(d1);
          try {
            // 순차 INSERT → 병렬화: N명 × 50ms RTT → ~50ms 고정
            await Promise.all(
              notificationRows.map((row) =>
                db
                  .insert(notificationsTable)
                  .values({
                    ...row,
                    metadata: JSON.stringify(row.metadata) })
                  .onConflictDoUpdate({
                    target: notificationsTable.id,
                    set: {
                      title: row.title,
                      body: row.body,
                      metadata: JSON.stringify(row.metadata) } })
              ),
            );
            // D1 직접 insert 는 /api/d1/mutate 를 거치지 않으므로 DO 시그널을 따로 쏜다.
            // 없으면 WS 활성 시 폴링이 꺼진 클라이언트에서 토스트·배지·채팅 리스트가 갱신되지 않는다.
            const signalChannels = new Set<string>(['notifications', 'messages', 'chat_rooms']);
            notificationRows.forEach((row) => {
              const uid = String(row.user_id || '').trim();
              if (uid) signalChannels.add(`notifications:user_id=eq.${uid}`);
            });
            if (params.roomId) {
              signalChannels.add(`messages:room_id=eq.${params.roomId}`);
            }
            void emitRealtimeSignal({
              channels: Array.from(signalChannels),
              source: 'chat-push-dispatch-notification-insert',
            }).catch(() => {});
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

  // 기기(구독 행) 단위로 채널을 분리한다.
  // 과거: staff 에 FCM 토큰이 하나라도 있으면 그 staff 의 모든 Web Push 를 스킵 →
  // 모바일(FCM) + PC 브라우저(Web Push) 동시 사용 시 PC 알림이 영구 미발송됐다.
  // 현재: 같은 행에 fcm_token 이 있으면 그 endpoint 웹푸시만 스킵(동일 기기 이중 방지).
  // FCM 없는 PC/다른 기기 Web Push 는 그대로 발송.
  const uniqueSubscriptions = new Map<string, PushSubscriptionRow>();
  for (const row of subscriptions) {
    if (!row.endpoint || !row.staff_id || row.staff_id === senderId) continue;
    if (!row.p256dh || !row.auth || !/^https?:\/\//i.test(String(row.endpoint))) continue;
    // 동일 구독 행에 FCM 이 있으면 이 endpoint 는 FCM 전용 (기기 단위 이중 발송 방지)
    if (String(row.fcm_token || '').trim()) continue;
    if (!uniqueSubscriptions.has(row.endpoint)) {
      uniqueSubscriptions.set(row.endpoint, row);
    }
  }

  // 모든 고유 FCM 토큰 발송 (기기 여러 대 지원).
  // 과거: staff 당 최신 1개만 → 두 번째 폰/태블릿 알림 누락.
  // 만료 토큰은 sendFcmBatch expired 경로에서 null 처리.
  const uniqueFcmTokens = Array.from(
    new Set(
      subscriptions
        .filter((row) => row.fcm_token && row.staff_id && row.staff_id !== senderId)
        .map((row) => String(row.fcm_token).trim())
        .filter(Boolean),
    ),
  );

  if (uniqueSubscriptions.size === 0 && uniqueFcmTokens.length === 0) {
    await Promise.all([
      notificationInsertPromise,
      updateChatPushJobByMessageId(params.messageId, {
        processed_at: new Date().toISOString(),
        processing_started_at: null,
        last_error: 'no-active-subscriptions' }),
    ]);

    return {
      sent: 0,
      failed: 0,
      targets: targetIds.length,
      notificationsCreated: notificationRows.length,
      pushDisabled: false,
      reason: 'no-active-subscriptions' } satisfies ChatPushDispatchResult;
  }

  // 기기별 채널 선택 완료 — FCM 행 / Web Push 전용 행 각각 발송
  let sent = 0;
  let failed = 0;
  const expiredIds: string[] = [];
  const notificationTag = albumContext.notificationTag;

  // 정적 스티커 단독 전송 시 이미지 URL 구성
  let stickerImageUrl: string | undefined = undefined;
  const trimmedContent = String(message.content || '').trim();
  const soloStatMatch = trimmedContent.match(/^\[stat:([a-z0-9-]+)\]$/);
  if (soloStatMatch) {
    const statId = soloStatMatch[1];
    const rawOrigin =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      '';
    const siteUrl = String(rawOrigin).trim();
    if (siteUrl) {
      stickerImageUrl = `${siteUrl.replace(/\/$/, '')}/emoticon/static/${statId}.png`;
    }
  }

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
      ...(albumContext.albumTotal !== null ? { album_total: String(albumContext.albumTotal) } : {}) } });
  const webPushPayload = JSON.stringify({
    title,
    body: previewBody,
    tag: notificationTag,
    data: payloadData,
    ...(stickerImageUrl ? { image: stickerImageUrl } : {}) });
  const fcmPayloadData = Object.entries(payloadData).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      if (value === null || value === undefined) return acc;
      acc[key] = typeof value === 'string' ? value : JSON.stringify(value);
      return acc;
    },
    {},
  );

  // FCM batch 결과를 바깥에서 참조해 WebPush 폴백 대상 계산에 사용한다.
  let fcmResult: { success: string[]; expired: string[]; error: string[] } | null = null;
  const fcmPromise = (async () => {
    if (uniqueFcmTokens.length === 0) return;
    try {
      fcmResult = await sendFcmBatch(uniqueFcmTokens, {
        title,
        body: previewBody,
        data: fcmPayloadData,
        ...(stickerImageUrl ? { image: stickerImageUrl } : {}) });
      sent += fcmResult.success.length;
      // error 토큰(400 페이로드·5xx·네트워크·OAuth 실패)은 유효할 수 있으므로 무효화하지 않는다.
      // expired 토큰(UNREGISTERED·NOT_FOUND·404·410)만 DB에서 null 처리.
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
      // batch 자체가 throw(예: 설정/OAuth 오류) → 모든 FCM 토큰을 미전달로 간주해 WebPush 폴백 대상에 포함.
      fcmResult = { success: [], expired: [], error: [...uniqueFcmTokens] };
    }
  })();

  // FCM 성공 토큰을 먼저 확정한 뒤에만 Web Push 대상을 계산해야
  // 동일 기기로 FCM + Web Push가 중복 발송되지 않는다.
  await fcmPromise;

  // ── FCM 미전달(error/expired) 기기에 대한 WebPush 폴백 ──
  // FCM 우선 정책으로 WebPush 에서 제외했던 기기라도, FCM 이 일시 실패(또는 토큰 만료)했고
  // 같은 구독행에 유효한 WebPush 키가 있으면 그 기기에 한해 WebPush 로 폴백한다.
  // (성공한 FCM 토큰의 기기는 제외 → 동일 메시지 이중발송 방지. 설령 겹쳐도 SW가 tag 로 중복 차단.)
  const webPushTargets = new Map<string, PushSubscriptionRow>(uniqueSubscriptions);
  if (fcmResult) {
    const settled: { success: string[]; expired: string[]; error: string[] } = fcmResult;
    const undeliveredFcmTokens = new Set<string>([...settled.error, ...settled.expired]);
    if (undeliveredFcmTokens.size > 0) {
      for (const row of subscriptions) {
        if (!row.fcm_token || !undeliveredFcmTokens.has(String(row.fcm_token))) continue;
        if (!row.endpoint || !row.staff_id || row.staff_id === senderId) continue;
        if (!row.p256dh || !row.auth || !/^https?:\/\//i.test(String(row.endpoint))) continue;
        if (!webPushTargets.has(row.endpoint)) {
          webPushTargets.set(row.endpoint, row);
        }
      }
    }
  }

  const webPushPromise = (async () => {
    if (pushDisabled) return;
    const payload = webPushPayload;

    const targets = Array.from(webPushTargets.values());

    if (targets.length === 0) return;

    const results = await Promise.allSettled(
      targets.map((subscription) =>
        sendWebPushNotification(subscription, payload).then(() => ({
          ok: true as const,
          id: subscription.id }))
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

  const hasUndeliveredWebPushTargets = webPushTargets.size > 0;

  if (pushDisabled && hasUndeliveredWebPushTargets) {
    await updateChatPushJobByMessageId(params.messageId, {
      processing_started_at: null,
      last_error: 'web-push-disabled' });

    return {
      sent,
      failed,
      targets: targetIds.length,
      notificationsCreated: notificationRows.length,
      pushDisabled: true,
      reason: 'web-push-disabled' } satisfies ChatPushDispatchResult;
  }

  // 전 대상 전송 실패는 '완료'가 아니다.
  //
  // 예전에는 무조건 processed_at 을 찍어 큐에서 종결했다. selectPendingChatPushJobsD1
  // 가 `isNull(processed_at)` 으로 고르므로, 푸시 서비스가 한 번 흔들리면 그
  // 메시지 알림은 **영구 미도달**이 됐다 — 재시도 컬럼이 이 경우에만 죽었다(9차 CRON-05).
  //
  // 만료된 구독(404/410)은 위에서 구독 자체를 지우므로 다음 시도에는 대상이
  // 줄고, 전부 사라지면 targets 0 → failed 0 이 되어 정상 종결된다. 즉 수렴한다.
  // 폭주는 큐 처리기의 attempt_count 증가 + CHAT_PUSH_MAX_ATTEMPTS 데드레터와
  // 만료 시간이 막는다.
  const allTargetsFailed = sent === 0 && failed > 0;
  if (allTargetsFailed) {
    await updateChatPushJobByMessageId(params.messageId, {
      processing_started_at: null,
      last_error: `all-targets-failed(${failed})` });
  } else {
    await updateChatPushJobByMessageId(params.messageId, {
      processed_at: new Date().toISOString(),
      processing_started_at: null,
      last_error: pushDisabled && hasUndeliveredWebPushTargets ? 'web-push-disabled' : null });
  }

  return {
    sent,
    failed,
    targets: targetIds.length,
    notificationsCreated: notificationRows.length,
    pushDisabled } satisfies ChatPushDispatchResult;
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
    // 만료된 job 은 발송하지 않고 닫는다 (크론 장기 정지 후 밀린 푸시 폭주 방지).
    if (isChatPushJobExpired(job.created_at)) {
      skipped += 1;
      await updateChatPushJobById(job.id, {
        processed_at: new Date().toISOString(),
        processing_started_at: null,
        last_error: 'expired-not-sent' });
      continue;
    }

    const quietHoursPatch = buildQuietHoursDeferredPatch(job, queueSelection.supportsRetryColumns);
    if (quietHoursPatch) {
      skipped += 1;
      await updateChatPushJobById(job.id, quietHoursPatch);
      continue;
    }

    const nextAttemptCount = Number(job.attempt_count || 0) + 1;
    // **processing_started_at 를 여기서 선점하면 안 된다.**
    //
    // dispatchChatPushForMessage 는 진입 직후 processing_started_at 이 90초 이내면
    // "다른 워커가 처리 중" 으로 보고 reason:'in-flight' 로 즉시 반환한다(:560-570).
    // 예전에는 이 루프가 dispatch 호출 **직전에** processing_started_at 을 now 로 써서,
    // 크론이 고른 모든 job 이 자기 자신의 락에 걸려 in-flight 로 튕겨 나갔다.
    // in-flight 는 예외도 아니고 web-push-disabled 도 아니라 실패 패치도 타지 않으므로
    // processed_at 도 dead_lettered_at 도 영원히 NULL — 5분마다 attempt_count 만 오르는
    // 라이브락이었다(프로덕션 최대 3,233회 시도, 데드레터 0건, 미처리 247건 잔류).
    // 락 선점은 dispatch 내부의 CAS claim(:423) 에 맡긴다. 여기서 고른 행은 select 단계에서
    // 이미 processing_started_at 이 2분 넘게 낡은 것만 통과하므로 claim(90초 기준)은 성립한다.
    await updateChatPushJobById(job.id, {
      attempt_count: nextAttemptCount,
      last_error: null });

    try {
      const result = await dispatchChatPushForMessage({
        roomId: String(job.room_id),
        messageId: String(job.message_id) });
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
            last_error: result.reason });
        }
        continue;
      }
      // in-flight 는 **아무 종결 상태도 쓰지 않은** 유일한 결과다(다른 reason 은 모두
      // processed_at 을 남긴다). 백오프를 걸어 두지 않으면 5분마다 무한 재시도가 되므로
      // 실패로 취급해 재시도 지연 + 시도 소진 시 데드레터까지 태운다.
      if (result.reason === 'in-flight') {
        skipped += 1;
        await updateChatPushJobById(
          job.id,
          buildQueueFailurePatch(nextAttemptCount, 'in-flight', queueSelection.supportsRetryColumns),
        );
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
    skipped };
}
