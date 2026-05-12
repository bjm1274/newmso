/**
 * lib/realtime-bus.ts
 * Supabase Realtime 통합 dispatcher — 채널 공유 + 배치 dedup (JM2·JM3·JM4)
 */

import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────

export type Unsubscribe = () => void;
export type RealtimeCallback = (payload: unknown) => void;

export type TableFilter = {
  table: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  /**
   * Postgres row filter (예: 'user_id=eq.abc').
   * filter가 다르면 호출자가 channelKey도 다르게 지정해야 채널 공유가 의도대로 동작.
   */
  filter?: string;
};

export type RealtimeOptions = {
  /** 배치 윈도우(ms). 윈도우 내 동일 테이블 이벤트는 1회만 호출. 기본 1000ms */
  batchWindowMs?: number;
};

// ─────────────────────────────────────────────
// 내부 상태
// ─────────────────────────────────────────────

type ChannelEntry = {
  channel: RealtimeChannel;
  callbacks: Set<RealtimeCallback>;
  /** 배치 윈도우 내 수신된 테이블 셋 */
  pendingTables: Set<string>;
  batchTimer: ReturnType<typeof setTimeout> | null;
  batchWindowMs: number;
};

const channelRegistry = new Map<string, ChannelEntry>();

// ─────────────────────────────────────────────
// 구현
// ─────────────────────────────────────────────

/**
 * Supabase Realtime 구독.
 *
 * - 동일 channelKey면 기존 채널을 공유 (Supabase 채널 1개)
 * - batchWindowMs 내 동일 테이블 이벤트는 1회만 callback 호출 (dedup)
 * - 반환된 Unsubscribe를 호출하면 해당 callback 제거.
 *   모든 callback이 제거되면 채널 unsubscribe.
 *
 * @example
 * const unsub = subscribeRealtime(
 *   'payroll-list',
 *   [{ table: 'payroll_records', event: '*' }],
 *   () => mutate(),
 * );
 * // cleanup
 * return () => unsub();
 */
export function subscribeRealtime(
  channelKey: string,
  tables: TableFilter[],
  callback: RealtimeCallback,
  options?: RealtimeOptions,
): Unsubscribe {
  const batchWindowMs = options?.batchWindowMs ?? 1_000;

  let entry = channelRegistry.get(channelKey);

  if (!entry) {
    // 신규 채널 생성
    const channel = supabase.channel(channelKey);

    entry = {
      channel,
      callbacks: new Set(),
      pendingTables: new Set(),
      batchTimer: null,
      batchWindowMs,
    };
    channelRegistry.set(channelKey, entry);

    // 테이블별 postgres_changes 등록
    for (const { table, event = '*', filter } of tables) {
      const subscription: {
        event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
        schema: string;
        table: string;
        filter?: string;
      } = { event, schema: 'public', table };
      if (filter) subscription.filter = filter;
      channel.on(
        'postgres_changes',
        subscription,
        (payload) => {
          handlePayload(channelKey, table, payload);
        },
      );
    }

    channel.subscribe();
  } else {
    // 기존 채널에 callback만 추가 (채널 재생성 없음)
    entry.batchWindowMs = batchWindowMs;
  }

  entry.callbacks.add(callback);

  return () => {
    const e = channelRegistry.get(channelKey);
    if (!e) return;
    e.callbacks.delete(callback);

    if (e.callbacks.size === 0) {
      // 모든 구독자 해제 → 채널 정리
      if (e.batchTimer !== null) {
        clearTimeout(e.batchTimer);
      }
      supabase.removeChannel(e.channel);
      channelRegistry.delete(channelKey);
    }
  };
}

// ─────────────────────────────────────────────
// 내부 헬퍼
// ─────────────────────────────────────────────

function handlePayload(
  channelKey: string,
  table: string,
  payload: unknown,
): void {
  const entry = channelRegistry.get(channelKey);
  if (!entry) return;

  // 배치 dedup: 이미 윈도우 내 같은 테이블 이벤트면 추가만
  entry.pendingTables.add(table);

  if (entry.batchTimer !== null) return;

  entry.batchTimer = setTimeout(() => {
    const e = channelRegistry.get(channelKey);
    if (!e) return;
    e.batchTimer = null;
    e.pendingTables.clear();

    // 등록된 모든 callback 호출
    for (const cb of e.callbacks) {
      try {
        cb(payload);
      } catch {
        // callback 오류가 다른 callback을 막지 않도록 (JM3)
      }
    }
  }, entry.batchWindowMs);
}
