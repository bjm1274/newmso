// ============================================================
// lib/polling-bus.ts
// Supabase Realtime 채널을 대체하는 polling 기반 dispatcher.
//
// realtime-bus.ts와 동일한 API를 노출해 호출자가 import 한 줄만 바꾸면 됨.
//
// 동작:
//   1) 동일 channelKey의 구독을 1개로 dedup
//   2) setInterval로 /api/realtime/tail?tables=... 폴링
//   3) 직전 tail과 비교해 변경된 테이블이 있으면 콜백 호출
//      - subscribeRealtime: 변경된 테이블 정보(payload) 1건씩 전달
//      - subscribeRealtimeBatched: 변경된 모든 테이블을 배열로 전달
//   4) document.visibilityState='hidden'이면 polling 일시 중단
//      → 사용자가 탭 닫고 있을 때 Workers 요청 절감
//
// pollIntervalMs 권장:
//   - 채팅(messages, chat_rooms): 1000–2000ms
//   - 알림/할일: 3000–5000ms
//   - 게시판/결재: 5000–10000ms
//   - 관리자/통계: 10000–30000ms
// ============================================================

// ─────────────────────────────────────────────
// 타입 — realtime-bus.ts와 동일 시그니처
// ─────────────────────────────────────────────

export type Unsubscribe = () => void;
export type RealtimeCallback = (payload: unknown) => void;
export type RealtimeBatchCallback = (payloads: unknown[]) => void;

export type TableFilter = {
  table: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  filter?: string;
};

export type RealtimeOptions = {
  /** polling 간격 (ms). 기본 5000ms */
  pollIntervalMs?: number;
  /** 배치 콜백 윈도우 (ms). 폴링 모드에선 의미 없으나 호환성 위해 유지 */
  batchWindowMs?: number;
};

// ─────────────────────────────────────────────
// 내부 상태
// ─────────────────────────────────────────────

type ChannelEntry = {
  tables: TableFilter[];
  singleCallbacks: Set<RealtimeCallback>;
  batchCallbacks: Set<RealtimeBatchCallback>;
  pollIntervalMs: number;
  timer: ReturnType<typeof setInterval> | null;
  lastSeen: Record<string, string | null>;
  inFlight: boolean;
};

const channelRegistry = new Map<string, ChannelEntry>();
let visibilityHandlerInstalled = false;

function isHidden(): boolean {
  if (typeof document === 'undefined') return false;
  return document.visibilityState === 'hidden';
}

function ensureVisibilityHandler(): void {
  if (visibilityHandlerInstalled) return;
  if (typeof document === 'undefined') return;
  visibilityHandlerInstalled = true;
  document.addEventListener('visibilitychange', () => {
    // visibility 복귀 시 한 번 즉시 poll → 누락된 변경 빠르게 캐치
    if (isHidden()) return;
    for (const entry of channelRegistry.values()) {
      void pollOnce(entry);
    }
  });
}

async function pollOnce(entry: ChannelEntry): Promise<void> {
  if (entry.inFlight) return;
  if (isHidden()) return;
  entry.inFlight = true;
  try {
    const tables = entry.tables.map((t) => t.table).join(',');
    const res = await fetch(`/api/realtime/tail?tables=${encodeURIComponent(tables)}`, {
      credentials: 'same-origin',
    });
    if (!res.ok) return;
    const data = (await res.json()) as { ok: boolean; tail?: Record<string, string | null> };
    if (!data.ok || !data.tail) return;

    const changed: TableFilter[] = [];
    for (const tableFilter of entry.tables) {
      const next = data.tail[tableFilter.table] ?? null;
      const prev = entry.lastSeen[tableFilter.table] ?? null;
      if (next !== prev) {
        entry.lastSeen[tableFilter.table] = next;
        // 첫 polling에는 prev가 undefined → 호출 안 함 (false positive 방지)
        if (prev !== null && prev !== undefined) {
          changed.push(tableFilter);
        }
      }
    }
    if (changed.length === 0) return;
    const payloads = changed.map((t) => ({ table: t.table }));
    for (const cb of entry.singleCallbacks) {
      try {
        cb(payloads[payloads.length - 1]);
      } catch (err) {
        console.warn('[polling-bus] single callback error', err);
      }
    }
    if (entry.batchCallbacks.size > 0) {
      for (const cb of entry.batchCallbacks) {
        try {
          cb(payloads);
        } catch (err) {
          console.warn('[polling-bus] batch callback error', err);
        }
      }
    }
  } catch (err) {
    console.warn('[polling-bus] poll failed', err);
  } finally {
    entry.inFlight = false;
  }
}

function getOrCreateEntry(
  channelKey: string,
  tables: TableFilter[],
  pollIntervalMs: number,
): ChannelEntry {
  ensureVisibilityHandler();
  const existing = channelRegistry.get(channelKey);
  if (existing) {
    // 더 짧은 interval로 갱신 (가장 자주 호출 필요한 구독에 맞춤)
    if (pollIntervalMs < existing.pollIntervalMs) {
      existing.pollIntervalMs = pollIntervalMs;
      if (existing.timer) {
        clearInterval(existing.timer);
        existing.timer = setInterval(() => void pollOnce(existing), pollIntervalMs);
      }
    }
    return existing;
  }
  const entry: ChannelEntry = {
    tables,
    singleCallbacks: new Set(),
    batchCallbacks: new Set(),
    pollIntervalMs,
    timer: null,
    lastSeen: {},
    inFlight: false,
  };
  // 초기 tail을 한 번 가져와 baseline 설정 (false positive 방지)
  void pollOnce(entry);
  entry.timer = setInterval(() => void pollOnce(entry), pollIntervalMs);
  channelRegistry.set(channelKey, entry);
  return entry;
}

function makeUnsubscribe(channelKey: string, remove: (entry: ChannelEntry) => void): Unsubscribe {
  return () => {
    const entry = channelRegistry.get(channelKey);
    if (!entry) return;
    remove(entry);
    if (entry.singleCallbacks.size === 0 && entry.batchCallbacks.size === 0) {
      if (entry.timer) clearInterval(entry.timer);
      channelRegistry.delete(channelKey);
    }
  };
}

// ─────────────────────────────────────────────
// 공개 API — realtime-bus.ts와 호환
// ─────────────────────────────────────────────

export function subscribeRealtime(
  channelKey: string,
  tables: TableFilter[],
  callback: RealtimeCallback,
  options?: RealtimeOptions,
): Unsubscribe {
  const interval = options?.pollIntervalMs ?? 5000;
  const entry = getOrCreateEntry(channelKey, tables, interval);
  entry.singleCallbacks.add(callback);
  return makeUnsubscribe(channelKey, (e) => e.singleCallbacks.delete(callback));
}

export function subscribeRealtimeBatched(
  channelKey: string,
  tables: TableFilter[],
  callback: RealtimeBatchCallback,
  options?: RealtimeOptions,
): Unsubscribe {
  const interval = options?.pollIntervalMs ?? 5000;
  const entry = getOrCreateEntry(channelKey, tables, interval);
  entry.batchCallbacks.add(callback);
  return makeUnsubscribe(channelKey, (e) => e.batchCallbacks.delete(callback));
}
