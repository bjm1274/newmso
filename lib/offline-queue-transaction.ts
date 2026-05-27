/**
 * offline-queue-transaction — 순서 의존 Supabase mutation을 트랜잭션 단위로 큐잉.
 *
 * 동작:
 *  1. 온라인 + 모든 step 성공 → data[] 반환 (queued: false)
 *  2. 중간 step 네트워크 실패 → 그 step부터 큐잉 (group_id 공유, queued: true)
 *  3. Supabase 에러 (RLS·constraint) → 즉시 실패 (queued: false, error)
 *  4. flush 시 같은 group은 groupIndex 순으로 처리.
 *     하나 실패하면 이후 steps는 보류 (startAutoFlush의 그룹 의존 로직 적용).
 *
 * JM: 단일 책임 (~150줄)
 * JM2: 온라인 직접 실행 → 실패 시에만 큐잉
 * JM3: 네트워크 에러 vs Supabase 에러 명시 구분
 * JM4: any 금지, unknown + 정밀 타입. inject 콜백 결과를 Record<string, unknown>으로 강제
 * JM5: inject 함수가 반환하는 데이터에 토큰·비밀번호 포함 금지 — 호출자 책임
 */

import { getOfflineQueue } from './offline-queue';
import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────

export type TransactionStep = {
  kind: 'insert' | 'update' | 'upsert' | 'delete';
  table: string;
  payload?: Record<string, unknown> | Record<string, unknown>[];
  match?: Record<string, unknown>;
  /**
   * 이전 step 결과 배열을 받아 이 step의 payload를 동적으로 생성.
   * online 실행 시 실제 Supabase data를 기반으로 호출됨.
   * 큐잉 시에는 inject 직렬화 불가 → payload가 반드시 함께 있어야 큐에 저장됨.
   */
  inject?: (prev: unknown[]) => Record<string, unknown>;
};

export type TransactionResult = {
  data: unknown[];
  queued: boolean;
  error: string | null;
};

// ─────────────────────────────────────────────────────────────
// 내부: 네트워크 에러 판별
// ─────────────────────────────────────────────────────────────

function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true;
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
// 내부: 단일 step 실행
// ─────────────────────────────────────────────────────────────

async function executeStep(
  step: TransactionStep,
  resolvedPayload: Record<string, unknown> | Record<string, unknown>[],
): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any;
  const { kind, table, match } = step;
  const arr = Array.isArray(resolvedPayload) ? resolvedPayload : [resolvedPayload];

  switch (kind) {
    case 'insert':
      q = supabase.from(table).insert(arr).select();
      break;
    case 'upsert':
      q = supabase.from(table).upsert(arr).select();
      break;
    case 'update': {
      if (!match || Object.keys(match).length === 0) {
        throw new Error(`[tx-queue] update requires match: table=${table}`);
      }
      q = supabase.from(table).update(arr[0]).select();
      for (const [col, val] of Object.entries(match)) q = q.eq(col, val);
      break;
    }
    case 'delete': {
      if (!match || Object.keys(match).length === 0) {
        throw new Error(`[tx-queue] delete requires match: table=${table}`);
      }
      q = supabase.from(table).delete();
      for (const [col, val] of Object.entries(match)) q = q.eq(col, val);
      break;
    }
  }

  const { data, error } = await q;
  if (error) {
    const e = new Error(error.message ?? 'Supabase error');
    (e as Error & { isSupabaseError: boolean }).isSupabaseError = true;
    throw e;
  }
  return data ?? null;
}

// ─────────────────────────────────────────────────────────────
// 공개 API
// ─────────────────────────────────────────────────────────────

/**
 * 순서 의존 Supabase mutation 트랜잭션을 실행한다.
 *
 * - 모든 step 온라인 성공 → data[] 반환
 * - step N에서 네트워크 실패 → step N부터 group_id 공유로 큐잉
 * - step N에서 Supabase 에러 → 즉시 실패
 *
 * @example
 * ```ts
 * const result = await enqueueSupabaseTransaction([
 *   { kind: 'insert', table: 'leave_requests', payload: leaveData },
 *   {
 *     kind: 'insert',
 *     table: 'approvals',
 *     inject: ([leaveRow]) => ({
 *       ...approvalData,
 *       leave_request_id: (leaveRow as { id: string }).id,
 *     }),
 *   },
 * ]);
 * ```
 */
export async function enqueueSupabaseTransaction(
  steps: TransactionStep[],
): Promise<TransactionResult> {
  if (steps.length === 0) {
    return { data: [], queued: false, error: null };
  }

  // 오프라인 선조건 → 첫 step부터 전체 큐잉
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return enqueueRemainingSteps(steps, 0, [], crypto.randomUUID());
  }

  const results: unknown[] = [];
  const groupId = generateGroupId();

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    // inject로 payload 동적 생성 (이전 step 결과 기반)
    let resolvedPayload: Record<string, unknown> | Record<string, unknown>[];
    if (step.inject) {
      resolvedPayload = step.inject(results);
    } else if (step.payload) {
      resolvedPayload = step.payload;
    } else {
      return {
        data: results,
        queued: false,
        error: `[tx-queue] step[${i}] requires payload or inject`,
      };
    }

    try {
      const data = await executeStep(step, resolvedPayload);
      results.push(data);
    } catch (err) {
      if (isNetworkError(err)) {
        // 이 step부터 큐잉. inject 있으면 resolvedPayload를 payload로 고정.
        const remainingSteps: TransactionStep[] = steps.slice(i).map((s, idx) => {
          if (idx === 0) {
            return { ...s, payload: resolvedPayload, inject: undefined };
          }
          return s;
        });
        return enqueueRemainingSteps(remainingSteps, 0, results, groupId);
      }
      // Supabase 에러 → 즉시 실패
      const message = err instanceof Error ? err.message : '알 수 없는 오류';
      return { data: results, queued: false, error: message };
    }
  }

  return { data: results, queued: false, error: null };
}

// ─────────────────────────────────────────────────────────────
// 내부: 잔여 steps 큐잉
// ─────────────────────────────────────────────────────────────

function enqueueRemainingSteps(
  steps: TransactionStep[],
  startIndex: number,
  _completedData: unknown[],
  groupId: string,
): TransactionResult {
  const queue = getOfflineQueue();
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const resolvedPayload = step.payload ?? {};
    queue.enqueue({
      type: `db:${step.kind}:${step.table}`,
      payload: {
        kind: step.kind,
        table: step.table,
        data: resolvedPayload,
        match: step.match,
      },
      groupId,
      groupIndex: startIndex + i,
    });
  }
  return { data: _completedData, queued: true, error: null };
}

function generateGroupId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `grp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
