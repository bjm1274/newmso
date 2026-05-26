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
  gte,
} from '@/lib/db';

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
  const chunkSize = 100;
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
  const chunkSize = 100;

  const d1 = await getD1Binding();
  if (!d1) throw new Error('[inapp-notification-jobs/types] D1 binding not available (insertNotificationsChunked)');
  const db = getD1Drizzle(d1);

  // 성공적으로 INSERT된 row만 모아 chunk 단위로 푸시 발송.
  // (chunk insert 실패 시 해당 chunk는 push 대상에서 제외 → 중복 발송 차단)
  const successfullyInserted: NotificationInsertRow[] = [];

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const d1Rows = chunk.map((row) => ({
      id: crypto.randomUUID(),
      user_id: row.user_id,
      type: row.type,
      title: row.title,
      body: row.body,
      // metadata는 JSON 컬럼 → D1 write 전 직렬화
      metadata: row.metadata !== null && row.metadata !== undefined
        ? JSON.stringify(row.metadata)
        : null,
      read_at: row.read_at ?? null,
      created_at: new Date().toISOString(),
    }));
    try {
      await db.insert(notificationsTable).values(d1Rows).onConflictDoNothing();
      created += chunk.length;
      successfullyInserted.push(...chunk);
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
        user_id: row.user_id,
        type: row.type,
        title: row.title,
        body: row.body,
        metadata: row.metadata ?? null,
      }));
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
