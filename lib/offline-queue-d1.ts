/**
 * offline-queue-d1 — D1 mutation의 오프라인 큐 래퍼.
 *
 * 동작:
 *  1. 시도 → 성공 시 data 반환 (queued: false)
 *  2. 네트워크 실패 (navigator.onLine===false 또는 fetch TypeError) →
 *     queue.enqueue + queued: true 반환
 *  3. D1 에러 → 즉시 실패 (queued: false, error)
 *
 * handler 등록 (startAutoFlush): 온라인 복귀 시 자동 replay.
 * 앱 진입점에서 한 번만 initOfflineQueueFlush()를 호출할 것.
 */

import { getOfflineQueue, type QueuedAction } from './offline-queue';
import { db } from './db-client';
import { resolveInjectedPayload } from './offline-queue-transaction';

// ─────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────

export type MutationKind = 'insert' | 'update' | 'upsert' | 'delete';

export type EnqueueD1MutationOpts<T = unknown> = {
  kind: MutationKind;
  table: string;
  payload: Record<string, unknown> | Record<string, unknown>[];
  /** update/delete 조건 */
  match?: Record<string, unknown>;
  /** upsert 충돌 기준 컬럼 (예: 'staff_id,date'). 미지정 시 PK 기준 */
  onConflict?: string;
  /** true면 충돌 시 DO NOTHING(기존 행 보존) */
  ignoreDuplicates?: boolean;
  retryable?: boolean;
  onSuccess?: (data: T) => void;
  onFailure?: (err: Error) => void;
};

export type MutationResult<T> = {
  data: T | null;
  queued: boolean;
  error: string | null;
};

// localStorage에 저장되는 큐 payload 형태
type QueuedMutationPayload = {
  kind: MutationKind;
  table: string;
  data: Record<string, unknown> | Record<string, unknown>[];
  match?: Record<string, unknown>;
  onConflict?: string;
  ignoreDuplicates?: boolean;
};

// ─────────────────────────────────────────────────────────────
// 네트워크 에러 판별
// ─────────────────────────────────────────────────────────────

function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true; // fetch failed
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (
      msg.includes('failed to fetch') ||
      msg.includes('network request failed') ||
      msg.includes('load failed') ||
      msg.includes('networkerror')
    ) {
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
// D1 mutation 실행 (큐 replay에서도 재사용)
// ─────────────────────────────────────────────────────────────

async function executeMutation<T>(
  kind: MutationKind,
  table: string,
  payload: Record<string, unknown> | Record<string, unknown>[],
  match?: Record<string, unknown>,
  onConflict?: string,
  ignoreDuplicates?: boolean,
): Promise<T | null> {
  let q: any;

  switch (kind) {
    case 'insert':
      q = db.from(table).insert(Array.isArray(payload) ? payload : [payload]).select();
      break;
    case 'update': {
      if (!match || Object.keys(match).length === 0) {
        throw new Error(`[offline-queue] update requires match: table=${table}`);
      }
      q = db.from(table).update(Array.isArray(payload) ? payload[0] : payload).select();
      for (const [col, val] of Object.entries(match)) {
        q = q.eq(col, val);
      }
      break;
    }
    case 'upsert':
      q = db
        .from(table)
        .upsert(
          Array.isArray(payload) ? payload : [payload],
          onConflict ? { onConflict, ...(ignoreDuplicates ? { ignoreDuplicates: true } : {}) } : undefined,
        )
        .select();
      break;
    case 'delete': {
      if (!match || Object.keys(match).length === 0) {
        throw new Error(`[offline-queue] delete requires match: table=${table}`);
      }
      q = db.from(table).delete();
      for (const [col, val] of Object.entries(match)) {
        q = q.eq(col, val);
      }
      break;
    }
  }

  const { data, error } = await q;
  if (error) {
    const e = new Error(error.message ?? 'D1 mutation error');
    (e as Error & { isD1Error: boolean }).isD1Error = true;
    throw e;
  }
  return (data as T | null) ?? null;
}

// ─────────────────────────────────────────────────────────────
// 공개 API
// ─────────────────────────────────────────────────────────────

/**
 * D1 mutation을 시도하고, 네트워크 불가 시 오프라인 큐에 적재한다.
 */
export async function enqueueD1Mutation<T = unknown>(
  opts: EnqueueD1MutationOpts<T>,
): Promise<MutationResult<T>> {
  const { kind, table, payload, match, onConflict, ignoreDuplicates, onSuccess, onFailure } = opts;

  // 오프라인 선조건 — 즉시 큐잉
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const queueType = `db:${kind}:${table}`;
    const queuePayload: QueuedMutationPayload = { kind, table, data: payload, match, onConflict, ignoreDuplicates };
    getOfflineQueue().enqueue({ type: queueType, payload: queuePayload });
    return { data: null, queued: true, error: null };
  }

  try {
    const data = await executeMutation<T>(kind, table, payload, match, onConflict, ignoreDuplicates);
    if (onSuccess && data !== null) onSuccess(data);
    return { data, queued: false, error: null };
  } catch (err) {
    if (isNetworkError(err)) {
      const queueType = `db:${kind}:${table}`;
      const queuePayload: QueuedMutationPayload = { kind, table, data: payload, match, onConflict, ignoreDuplicates };
      getOfflineQueue().enqueue({ type: queueType, payload: queuePayload });
      return { data: null, queued: true, error: null };
    }
    const message = err instanceof Error ? err.message : '알 수 없는 오류';
    if (onFailure) onFailure(err instanceof Error ? err : new Error(message));
    return { data: null, queued: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────
// 자동 flush 초기화 (앱 진입점에서 1회만 호출)
// ─────────────────────────────────────────────────────────────

let flushInitialized = false;

// 캐시를 플러시할 때 각 트랜잭션 그룹별로 실행 결과(성공한 행 데이터 등)를 누적 보관합니다.
const transactionGroupResults = new Map<string, unknown[]>();

/**
 * 앱 마운트 시 1회 호출. online 이벤트 시 큐를 자동 replay한다.
 * 이미 초기화되어 있으면 no-op.
 */
export function initOfflineQueueFlush(): () => void {
  if (flushInitialized) return () => {};
  flushInitialized = true;

  const queue = getOfflineQueue();

  const unsubscribe = queue.startAutoFlush(async (action: QueuedAction) => {
    if (!action.type.startsWith('db:')) return;

    const p = action.payload as QueuedMutationPayload;
    if (!p || typeof p.kind !== 'string' || typeof p.table !== 'string') return;

    let resolvedData = p.data;
    if (action.groupId) {
      let groupResults = transactionGroupResults.get(action.groupId);
      if (!groupResults) {
        groupResults = [];
        transactionGroupResults.set(action.groupId, groupResults);
      }
      resolvedData = resolveInjectedPayload(p.data, groupResults) as Record<string, unknown> | Record<string, unknown>[];
    }

    const resData = await executeMutation(p.kind as MutationKind, p.table, resolvedData, p.match, p.onConflict, p.ignoreDuplicates);

    if (action.groupId) {
      transactionGroupResults.get(action.groupId)?.push(resData);
    }
  });

  return () => {
    flushInitialized = false;
    unsubscribe();
  };
}
