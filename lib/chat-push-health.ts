type QueryErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
} | null | undefined;

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

function isMissingRelationError(error: QueryErrorLike, relationName?: string) {
  if (!error) return false;
  const code = String(error?.code || '');
  const message = String(error?.message || error?.details || '').toLowerCase();
  return code === '42P01' || (relationName ? message.includes(relationName.toLowerCase()) : false);
}

function isMissingColumnError(error: QueryErrorLike, columnName: string) {
  if (!error) return false;
  const code = String(error?.code || '');
  const message = String(error?.message || error?.details || '').toLowerCase();
  const hint = String(error?.hint || '').toLowerCase();
  const needle = columnName.toLowerCase();
  return (code === '42703' || !code) && (message.includes(needle) || hint.includes(needle));
}

function isQueueMigrationError(error: QueryErrorLike) {
  return (
    isMissingColumnError(error, 'processing_started_at') ||
    isMissingColumnError(error, 'next_attempt_at') ||
    isMissingColumnError(error, 'dead_lettered_at') ||
    isMissingColumnError(error, 'attempt_count')
  );
}

async function readQueueCount(query: PromiseLike<{ count?: number | null; error?: QueryErrorLike }>) {
  const result = await query;
  if (result.error) {
    if (isMissingRelationError(result.error, 'chat_push_jobs')) {
      return { count: 0, missingRelation: true, missingMigration: false };
    }
    if (isQueueMigrationError(result.error)) {
      return { count: 0, missingRelation: false, missingMigration: true };
    }
    throw result.error;
  }

  return {
    count: Number(result.count || 0),
    missingRelation: false,
    missingMigration: false,
  };
}

async function collectLegacyQueueHealth(
  supabase: any,
  totalCount?: number,
): Promise<ChatPushQueueHealth> {
  const fallbackRes = await supabase
    .from('chat_push_jobs')
    .select('id, created_at, processed_at, attempt_count')
    .limit(5000);

  if (fallbackRes.error) {
    if (isMissingRelationError(fallbackRes.error, 'chat_push_jobs')) {
      return emptyQueueHealth(false);
    }
    throw fallbackRes.error;
  }

  const rows = (fallbackRes.data || []) as Array<{
    id?: string | null;
    created_at?: string | null;
    processed_at?: string | null;
    attempt_count?: number | null;
  }>;

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

export async function collectChatPushQueueHealth(supabase: any): Promise<ChatPushQueueHealth> {
  const total = await readQueueCount(
    supabase.from('chat_push_jobs').select('id', { head: true, count: 'exact' }),
  );

  if (total.missingRelation) return emptyQueueHealth(false);

  const nowIso = new Date().toISOString();
  const [
    pending,
    ready,
    retrying,
    deadLettered,
    inFlight,
    oldestPending,
  ] = await Promise.all([
    readQueueCount(
      supabase
        .from('chat_push_jobs')
        .select('id', { head: true, count: 'exact' })
        .is('processed_at', null),
    ),
    readQueueCount(
      supabase
        .from('chat_push_jobs')
        .select('id', { head: true, count: 'exact' })
        .is('processed_at', null)
        .is('dead_lettered_at', null)
        .lte('next_attempt_at', nowIso),
    ),
    readQueueCount(
      supabase
        .from('chat_push_jobs')
        .select('id', { head: true, count: 'exact' })
        .is('processed_at', null)
        .gt('attempt_count', 0),
    ),
    readQueueCount(
      supabase
        .from('chat_push_jobs')
        .select('id', { head: true, count: 'exact' })
        .not('dead_lettered_at', 'is', null),
    ),
    readQueueCount(
      supabase
        .from('chat_push_jobs')
        .select('id', { head: true, count: 'exact' })
        .not('processing_started_at', 'is', null)
        .is('processed_at', null),
    ),
    supabase
      .from('chat_push_jobs')
      .select('created_at')
      .is('processed_at', null)
      .order('created_at', { ascending: true })
      .limit(1),
  ]);

  const countResults = [pending, ready, retrying, deadLettered, inFlight];
  if (countResults.some((result) => result.missingMigration)) {
    return collectLegacyQueueHealth(supabase, total.count);
  }
  if (countResults.some((result) => result.missingRelation)) {
    return emptyQueueHealth(false);
  }

  if (oldestPending.error) {
    if (isMissingRelationError(oldestPending.error, 'chat_push_jobs')) return emptyQueueHealth(false);
    if (isQueueMigrationError(oldestPending.error)) return collectLegacyQueueHealth(supabase, total.count);
    throw oldestPending.error;
  }

  const oldestPendingAt = String(oldestPending.data?.[0]?.created_at || '');

  return {
    migrationReady: true,
    total: total.count,
    pending: pending.count,
    ready: ready.count,
    retrying: retrying.count,
    deadLettered: deadLettered.count,
    inFlight: inFlight.count,
    oldestPendingAt,
  };
}
