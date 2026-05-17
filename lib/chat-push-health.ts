import {
  chat_push_jobs as chatPushJobsTable,
  getD1Binding,
  getD1Drizzle,
  resolveDataBackend,
  isNull,
  isNotNull,
  gt,
  lte,
  asc,
  and,
  sql,
} from './db';
import { logD1BindingMissing } from './db/mirror-metrics';

// ─────────────────────────────────────────────────────────────
// Phase 8-H — 서버 측 read 호출 D1 binding 직접 사용
// 외부 시그니처(collectChatPushQueueHealth)는 그대로 유지.
// supabase 인자는 더 이상 쿼리에 쓰이지 않지만 호환을 위해 받음(_supabase).
// ─────────────────────────────────────────────────────────────

type D1MissingTableError = { code: 'D1_MISSING_TABLE' };

function isMissingTableError(err: unknown): boolean {
  if (!err) return false;
  const message = err instanceof Error ? err.message : String(err);
  // D1 / better-sqlite3 둘 다 동일 문구로 떨어짐
  return /no such table|no such column.*chat_push_jobs|D1_ERROR.*table/i.test(message);
}

function isMissingColumnError(err: unknown, columnName: string): boolean {
  if (!err) return false;
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return message.includes('no such column') && message.includes(columnName.toLowerCase());
}

function isQueueMigrationError(err: unknown): boolean {
  return (
    isMissingColumnError(err, 'processing_started_at') ||
    isMissingColumnError(err, 'next_attempt_at') ||
    isMissingColumnError(err, 'dead_lettered_at') ||
    isMissingColumnError(err, 'attempt_count')
  );
}

export type ChatPushQueueHealth = {
  migrationReady: boolean;
  total: number;
  pending: number;
  ready: number;
  retrying: number;
  deadLettered: number;
  inFlight: number;
  oldestPendingAt: string;
};

function emptyQueueHealth(migrationReady = true): ChatPushQueueHealth {
  return {
    migrationReady,
    total: 0,
    pending: 0,
    ready: 0,
    retrying: 0,
    deadLettered: 0,
    inFlight: 0,
    oldestPendingAt: '',
  };
}

async function requireD1ForChatPushHealth(label: string) {
  const backend = await resolveDataBackend();
  const d1 = await getD1Binding();
  if (!d1) {
    logD1BindingMissing({ label, backend });
    throw new Error(`[chat_push_jobs] D1 binding not available (${label})`);
  }
  return getD1Drizzle(d1);
}

type ReadCountResult =
  | { kind: 'ok'; count: number }
  | { kind: 'missing_relation' }
  | { kind: 'missing_migration' };

async function safeCount(
  db: Awaited<ReturnType<typeof requireD1ForChatPushHealth>>,
  whereExpr?: ReturnType<typeof and>,
): Promise<ReadCountResult> {
  try {
    const builder = db
      .select({ count: sql<number>`count(*)` })
      .from(chatPushJobsTable);
    const rows = whereExpr ? await builder.where(whereExpr) : await builder;
    return { kind: 'ok', count: Number(rows[0]?.count ?? 0) };
  } catch (err) {
    if (isMissingTableError(err)) return { kind: 'missing_relation' };
    if (isQueueMigrationError(err)) return { kind: 'missing_migration' };
    throw err;
  }
}

type LegacyRow = {
  id?: string | null;
  created_at?: string | null;
  processed_at?: string | null;
  attempt_count?: number | null;
};

async function collectLegacyQueueHealth(
  db: Awaited<ReturnType<typeof requireD1ForChatPushHealth>>,
  totalCount?: number,
): Promise<ChatPushQueueHealth> {
  let rows: LegacyRow[] = [];
  try {
    rows = await db
      .select({
        id: chatPushJobsTable.id,
        created_at: chatPushJobsTable.created_at,
        processed_at: chatPushJobsTable.processed_at,
        attempt_count: chatPushJobsTable.attempt_count,
      })
      .from(chatPushJobsTable)
      .limit(5000);
  } catch (err) {
    if (isMissingTableError(err)) return emptyQueueHealth(false);
    throw err;
  }

  return rows.reduce(
    (acc, row) => {
      const processedAt = row.processed_at ? Date.parse(String(row.processed_at)) : Number.NaN;
      const isProcessed = Number.isFinite(processedAt);

      if (!isProcessed) {
        acc.pending += 1;
        acc.ready += 1;
        if (!acc.oldestPendingAt || String(row.created_at || '') < acc.oldestPendingAt) {
          acc.oldestPendingAt = String(row.created_at || '');
        }
      }

      if (!isProcessed && Number(row.attempt_count || 0) > 0) {
        acc.retrying += 1;
      }

      return acc;
    },
    {
      ...emptyQueueHealth(false),
      total: Number(totalCount || rows.length),
    },
  );
}

// 호출지(예: app/api/admin/notifications/push-health)는 기존엔 supabase
// 클라이언트를 인자로 넘겨 주었다. 본 함수는 더 이상 supabase로 쿼리하지
// 않지만 외부 시그니처 유지를 위해 인자를 받아 두고 무시한다.
export async function collectChatPushQueueHealth(_supabase: unknown): Promise<ChatPushQueueHealth> {
  const db = await requireD1ForChatPushHealth('collectChatPushQueueHealth');

  const totalResult = await safeCount(db);
  if (totalResult.kind === 'missing_relation') return emptyQueueHealth(false);
  if (totalResult.kind === 'missing_migration') return collectLegacyQueueHealth(db);

  const nowIso = new Date().toISOString();

  const [pending, ready, retrying, deadLettered, inFlight] = await Promise.all([
    safeCount(db, isNull(chatPushJobsTable.processed_at)),
    safeCount(
      db,
      and(
        isNull(chatPushJobsTable.processed_at),
        isNull(chatPushJobsTable.dead_lettered_at),
        lte(chatPushJobsTable.next_attempt_at, nowIso),
      ),
    ),
    safeCount(
      db,
      and(
        isNull(chatPushJobsTable.processed_at),
        gt(chatPushJobsTable.attempt_count, 0),
      ),
    ),
    safeCount(db, isNotNull(chatPushJobsTable.dead_lettered_at)),
    safeCount(
      db,
      and(
        isNotNull(chatPushJobsTable.processing_started_at),
        isNull(chatPushJobsTable.processed_at),
      ),
    ),
  ]);

  const counts = [pending, ready, retrying, deadLettered, inFlight];
  if (counts.some((c) => c.kind === 'missing_migration')) {
    return collectLegacyQueueHealth(db, totalResult.count);
  }
  if (counts.some((c) => c.kind === 'missing_relation')) {
    return emptyQueueHealth(false);
  }

  let oldestPendingAt = '';
  try {
    const oldestRows = await db
      .select({ created_at: chatPushJobsTable.created_at })
      .from(chatPushJobsTable)
      .where(isNull(chatPushJobsTable.processed_at))
      .orderBy(asc(chatPushJobsTable.created_at))
      .limit(1);
    oldestPendingAt = String(oldestRows[0]?.created_at || '');
  } catch (err) {
    if (isMissingTableError(err)) return emptyQueueHealth(false);
    if (isQueueMigrationError(err)) return collectLegacyQueueHealth(db, totalResult.count);
    throw err;
  }

  const getCount = (r: ReadCountResult) => (r.kind === 'ok' ? r.count : 0);

  return {
    migrationReady: true,
    total: totalResult.count,
    pending: getCount(pending),
    ready: getCount(ready),
    retrying: getCount(retrying),
    deadLettered: getCount(deadLettered),
    inFlight: getCount(inFlight),
    oldestPendingAt,
  };
}

// 이전 시그니처/타입 호환을 위한 export — 사용처 없음.
export type { D1MissingTableError };
