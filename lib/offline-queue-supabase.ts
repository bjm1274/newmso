/**
 * offline-queue-supabase — Supabase mutation의 오프라인 큐 래퍼.
 *
 * 동작:
 *  1. 시도 → 성공 시 data 반환 (queued: false)
 *  2. 네트워크 실패 (navigator.onLine===false 또는 fetch TypeError) →
 *     queue.enqueue + queued: true 반환
 *  3. Supabase 에러 (RLS·constraint 등) → 즉시 실패 (queued: false, error)
 *
 * handler 등록 (startAutoFlush): 온라인 복귀 시 자동 replay.
 * 앱 진입점에서 한 번만 initOfflineQueueFlush()를 호출할 것.
 *
 * JM: 단일 책임 (~150줄)
 * JM2: startAutoFlush는 initOfflineQueueFlush()로 앱 1회만 등록
 * JM3: 네트워크 에러 vs Supabase 에러 명시 구분
 * JM4: any 금지, unknown 사용
 * JM5: payload는 호출자가 staff_id/user_id 포함 — 큐에 토큰·비밀번호 저장 금지
 */

import { getOfflineQueue, type QueuedAction } from './offline-queue';
import { supabase } from './supabase';
import { resolveInjectedPayload } from './offline-queue-transaction';

// ─────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────

export type MutationKind = 'insert' | 'update' | 'upsert' | 'delete';

export type EnqueueSupabaseMutationOpts<T = unknown> = {
  kind: MutationKind;
  table: string;
  payload: Record<string, unknown> | Record<string, unknown>[];
  /** update/delete 조건 */
  match?: Record<string, unknown>;
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
// Supabase mutation 실행 (큐 replay에서도 재사용)
// ─────────────────────────────────────────────────────────────

async function executeMutation<T>(
  kind: MutationKind,
  table: string,
  payload: Record<string, unknown> | Record<string, unknown>[],
  match?: Record<string, unknown>,
): Promise<T | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any;

  switch (kind) {
    case 'insert':
      q = supabase.from(table).insert(Array.isArray(payload) ? payload : [payload]).select();
      break;
    case 'update': {
      if (!match || Object.keys(match).length === 0) {
        throw new Error(`[offline-queue] update requires match: table=${table}`);
      }
      q = supabase.from(table).update(Array.isArray(payload) ? payload[0] : payload).select();
      for (const [col, val] of Object.entries(match)) {
        q = q.eq(col, val);
      }
      break;
    }
    case 'upsert':
      q = supabase.from(table).upsert(Array.isArray(payload) ? payload : [payload]).select();
      break;
    case 'delete': {
      if (!match || Object.keys(match).length === 0) {
        throw new Error(`[offline-queue] delete requires match: table=${table}`);
      }
      q = supabase.from(table).delete();
      for (const [col, val] of Object.entries(match)) {
        q = q.eq(col, val);
      }
      break;
    }
  }

  const { data, error } = await q;
  if (error) {
    const e = new Error(error.message ?? 'Supabase error');
    // Supabase 에러는 네트워크 에러가 아님을 명시
    (e as Error & { isSupabaseError: boolean }).isSupabaseError = true;
    throw e;
  }
  return (data as T | null) ?? null;
}

// ─────────────────────────────────────────────────────────────
// 공개 API
// ─────────────────────────────────────────────────────────────

/**
 * Supabase mutation을 시도하고, 네트워크 불가 시 오프라인 큐에 적재한다.
 */
export async function enqueueSupabaseMutation<T = unknown>(
  opts: EnqueueSupabaseMutationOpts<T>,
): Promise<MutationResult<T>> {
  const { kind, table, payload, match, onSuccess, onFailure } = opts;

  // 오프라인 선조건 — 즉시 큐잉
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const queueType = `db:${kind}:${table}`;
    const queuePayload: QueuedMutationPayload = { kind, table, data: payload, match };
    getOfflineQueue().enqueue({ type: queueType, payload: queuePayload });
    return { data: null, queued: true, error: null };
  }

  try {
    const data = await executeMutation<T>(kind, table, payload, match);
    if (onSuccess && data !== null) onSuccess(data);
    return { data, queued: false, error: null };
  } catch (err) {
    if (isNetworkError(err)) {
      // 네트워크 에러 → 큐잉
      const queueType = `db:${kind}:${table}`;
      const queuePayload: QueuedMutationPayload = { kind, table, data: payload, match };
      getOfflineQueue().enqueue({ type: queueType, payload: queuePayload });
      return { data: null, queued: true, error: null };
    }
    // Supabase 에러 (RLS·constraint 등) → 즉시 실패
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

    const resData = await executeMutation(p.kind as MutationKind, p.table, resolvedData, p.match);

    if (action.groupId) {
      transactionGroupResults.get(action.groupId)?.push(resData);
    }
  });

  return () => {
    flushInitialized = false;
    unsubscribe();
  };
}
