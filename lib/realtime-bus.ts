/**
 * lib/realtime-bus.ts
 * Supabase Realtime 통합 dispatcher — 채널 공유 + 배치 dedup (JM2·JM3·JM4)
 *
 * 두 가지 콜백 모드:
 *   - subscribeRealtime: 단일 콜백 (배치 윈도우의 마지막 payload만 전달)
 *     payload를 사용하지 않고 단순히 "변경됨 → refetch" 패턴에 적합.
 *   - subscribeRealtimeBatched: 배치 콜백 (윈도우 안에 수신된 모든 payload를 array로 전달)
 *     payload 기반 필터링·증분 업데이트가 필요한 경우 사용.
 *
 * 동일 channelKey면 두 모드를 섞어 사용해도 채널은 1개로 공유.
 */

import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────

export type Unsubscribe = () => void;
export type RealtimeCallback = (payload: unknown) => void;
export type RealtimeBatchCallback = (payloads: unknown[]) => void;

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
  singleCallbacks: Set<RealtimeCallback>;
  batchCallbacks: Set<RealtimeBatchCallback>;
  pendingPayloads: unknown[];
  batchTimer: ReturnType<typeof setTimeout> | null;
  batchWindowMs: number;
};

const channelRegistry = new Map<string, ChannelEntry>();

// ─────────────────────────────────────────────
// 구현
// ─────────────────────────────────────────────

function getOrCreateEntry(
  channelKey: string,
  tables: TableFilter[],
  batchWindowMs: number,
): ChannelEntry {
  const existing = channelRegistry.get(channelKey);
  if (existing) {
    existing.batchWindowMs = batchWindowMs;
    return existing;
  }

  const channel = supabase.channel(channelKey);
  const entry: ChannelEntry = {
    channel,
    singleCallbacks: new Set(),
    batchCallbacks: new Set(),
    pendingPayloads: [],
    batchTimer: null,
    batchWindowMs,
  };
  channelRegistry.set(channelKey, entry);

  for (const { table, event = '*', filter } of tables) {
    const subscription: {
      event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
      schema: string;
      table: string;
      filter?: string;
    } = { event, schema: 'public', table };
    if (filter) subscription.filter = filter;
    channel.on('postgres_changes', subscription, (payload) => {
      handlePayload(channelKey, payload);
    });
  }

  channel.subscribe();
  return entry;
}

function makeUnsubscribe(
  channelKey: string,
  remove: (entry: ChannelEntry) => void,
): Unsubscribe {
  return () => {
    const entry = channelRegistry.get(channelKey);
    if (!entry) return;
    remove(entry);
    if (entry.singleCallbacks.size === 0 && entry.batchCallbacks.size === 0) {
      if (entry.batchTimer !== null) clearTimeout(entry.batchTimer);
      supabase.removeChannel(entry.channel);
      channelRegistry.delete(channelKey);
    }
  };
}

/**
 * 단일 콜백 모드 — 윈도우 내 마지막 payload만 callback에 전달.
 * payload를 사용하지 않고 단순 refetch 패턴에 적합.
 */
export function subscribeRealtime(
  channelKey: string,
  tables: TableFilter[],
  callback: RealtimeCallback,
  options?: RealtimeOptions,
): Unsubscribe {
  const batchWindowMs = options?.batchWindowMs ?? 1_000;
  const entry = getOrCreateEntry(channelKey, tables, batchWindowMs);
  entry.singleCallbacks.add(callback);
  return makeUnsubscribe(channelKey, (e) => {
    e.singleCallbacks.delete(callback);
  });
}

/**
 * 배치 콜백 모드 — 윈도우 내 수신된 모든 payload를 array로 callback에 전달.
 * payload 기반 필터링·증분 업데이트가 필요한 경우 사용.
 */
export function subscribeRealtimeBatched(
  channelKey: string,
  tables: TableFilter[],
  callback: RealtimeBatchCallback,
  options?: RealtimeOptions,
): Unsubscribe {
  const batchWindowMs = options?.batchWindowMs ?? 1_000;
  const entry = getOrCreateEntry(channelKey, tables, batchWindowMs);
  entry.batchCallbacks.add(callback);
  return makeUnsubscribe(channelKey, (e) => {
    e.batchCallbacks.delete(callback);
  });
}

// ─────────────────────────────────────────────
// 내부 헬퍼
// ─────────────────────────────────────────────

function handlePayload(channelKey: string, payload: unknown): void {
  const entry = channelRegistry.get(channelKey);
  if (!entry) return;

  entry.pendingPayloads.push(payload);

  if (entry.batchTimer !== null) return;

  entry.batchTimer = setTimeout(() => {
    const e = channelRegistry.get(channelKey);
    if (!e) return;
    const collected = e.pendingPayloads.slice();
    const last = collected[collected.length - 1];
    e.pendingPayloads = [];
    e.batchTimer = null;

    for (const cb of e.singleCallbacks) {
      try {
        cb(last);
      } catch {
        // callback 오류가 다른 callback을 막지 않도록 (JM3)
      }
    }
    for (const cb of e.batchCallbacks) {
      try {
        cb(collected);
      } catch {
        // (JM3)
      }
    }
  }, entry.batchWindowMs);
}
