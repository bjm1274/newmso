/**
 * Phase 8-A — 인앱 알림 보강 cron 공통 타입/유틸.
 */
import 'server-only';
import {
  getD1Binding,
  getD1Drizzle,
  notifications as notificationsTable,
  eq,
  and,
  inArray,
  gte } from '@/lib/db';

export type CheckJobResult = {
  detected: number;
  created: number;
  errors: string[];
};

export type NotificationInsertRow = {
  user_id: string;
  type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  read_at: null;
};

const DEDUPE_LOOKBACK_DAYS = 7;
const DEDUPE_LOOKBACK_MS = DEDUPE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

// D1 은 **쿼리 1건당 bound parameter 100개**가 한도다. 행 수가 아니라 bind 수가 기준이다.
// notifications 는 INSERT 컬럼이 8개라 100행 = 800 bind 로 13행부터 통째로 실패한다
// (같은 착각으로 보수교육 알림이 29일 연속 전량 실패했다 — 10차 CR10-01).
const D1_MAX_BIND_PARAMS = 100;
const NOTIFICATION_INSERT_COLUMNS = 8; // id·user_id·type·title·body·metadata·read_at·created_at
const NOTIFICATION_INSERT_CHUNK_ROWS = Math.floor(
  D1_MAX_BIND_PARAMS / NOTIFICATION_INSERT_COLUMNS,
); // = 12행 (96 bind)
const IN_ARRAY_CHUNK = 90;

export function dedupeCutoffIso(): string {
  return new Date(Date.now() - DEDUPE_LOOKBACK_MS).toISOString();
}

export function emptyResult(): CheckJobResult {
  return { detected: 0, created: 0, errors: [] };
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

function readDedupeKey(metadata: Record<string, unknown> | null): string {
  if (!metadata) return '';
  const value = metadata.dedupe_key;
  return typeof value === 'string' ? value : '';
}

/**
 * 최근 DEDUPE_LOOKBACK_DAYS 이내 같은 type + user_id 알림 중
 * metadata.dedupe_key 값 집합을 `${userId}|${dedupeKey}` 형식으로 반환.
 */
export async function loadExistingDedupeKeys(
  type: string,
  userIds: string[],
): Promise<Set<string>> {
  const sent = new Set<string>();
  if (userIds.length === 0) return sent;

  const cutoff = dedupeCutoffIso();
  const d1 = await getD1Binding();
  if (!d1) throw new Error('[inapp-notification-jobs/types] D1 binding not available (loadExistingDedupeKeys)');
  const db = getD1Drizzle(d1);
  // eq(type) + gte(cutoff) 로 이미 bind 2개를 쓴다 — inArray 는 100이 아니라 여유를 둔 90.
  const chunkSize = IN_ARRAY_CHUNK;
  for (let i = 0; i < userIds.length; i += chunkSize) {
    const chunk = userIds.slice(i, i + chunkSize);
    const rowsD1 = await db
      .select({ user_id: notificationsTable.user_id, metadata: notificationsTable.metadata })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.type, type),
          inArray(notificationsTable.user_id, chunk),
          gte(notificationsTable.created_at, cutoff),
        )
      );
    for (const row of rowsD1) {
      let metadata: Record<string, unknown> | null = null;
      if (typeof row.metadata === 'string' && row.metadata.length > 0) {
        try { metadata = JSON.parse(row.metadata) as Record<string, unknown>; } catch { metadata = null; }
      } else if (row.metadata && typeof row.metadata === 'object') {
        metadata = row.metadata as Record<string, unknown>;
      }
      const key = readDedupeKey(metadata);
      const uid = String(row.user_id ?? '');
      if (key && uid) sent.add(`${uid}|${key}`);
    }
  }
  return sent;
}

export async function insertNotificationsChunked(
  rows: NotificationInsertRow[],
): Promise<{ created: number; errors: string[] }> {
  const errors: string[] = [];
  let created = 0;
  const chunkSize = NOTIFICATION_INSERT_CHUNK_ROWS;

  const d1 = await getD1Binding();
  if (!d1) throw new Error('[inapp-notification-jobs/types] D1 binding not available (insertNotificationsChunked)');
  const db = getD1Drizzle(d1);

  // 성공적으로 INSERT된 row만 모아 chunk 단위로 푸시 발송.
  // (chunk insert 실패 시 해당 chunk는 push 대상에서 제외 → 중복 발송 차단)
  // NB-02/NB-04 — 푸시 tag 와 읽음처리에 쓰려면 **실제로 INSERT 된 알림 id** 가 필요하다.
  // 그래서 여기서 만든 id 를 push 단계까지 들고 간다.
  const successfullyInserted: (NotificationInsertRow & { id: string })[] = [];

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const chunkWithIds = chunk.map((row) => ({ ...row, id: crypto.randomUUID() }));
    const d1Rows = chunkWithIds.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      type: row.type,
      title: row.title,
      body: row.body,
      // metadata는 JSON 컬럼 → D1 write 전 직렬화
      metadata: row.metadata !== null && row.metadata !== undefined
        ? JSON.stringify(row.metadata)
        : null,
      read_at: row.read_at ?? null,
      created_at: new Date().toISOString() }));
    try {
      await db.insert(notificationsTable).values(d1Rows).onConflictDoNothing();
      created += chunk.length;
      successfullyInserted.push(...chunkWithIds);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  // INSERT 성공한 row에 대해서만 푸시 발송 (JM3: 푸시 실패가 insert 결과에 영향 없음).
  // 동적 import — 순환 의존 회피 + cron 외 경로에서 push 의존성 강제 로드 방지.
  if (successfullyInserted.length > 0) {
    try {
      const { dispatchPushForNotificationRows } = await import(
        '../notification-push-dispatch'
      );
      const pushRows = successfullyInserted.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        type: row.type,
        title: row.title,
        body: row.body,
        metadata: row.metadata ?? null }));
      const pushResult = await dispatchPushForNotificationRows(pushRows);
      if (pushResult.errors.length > 0) {
        console.warn(
          '[insertNotificationsChunked] push dispatch had errors:',
          pushResult.errors.slice(0, 5),
        );
      }
    } catch (err) {
      // 푸시 실패는 insert 결과에 영향 없음 — 로그만 남김
      console.error('[insertNotificationsChunked] push dispatch failed:', err);
    }
  }

  return { created, errors };
}
