// ============================================================
// lib/polling-bus.ts
// Supabase Realtime 채널을 대체하는 실시간 동기화 dispatcher.
//
// 동작:
//   1) 동일 channelKey의 구독을 1개로 dedup
//   2) 브라우저가 EventSource를 지원할 경우 Server-Sent Events(SSE) 스트리밍 사용
//      - /api/realtime/stream?tables=... 에 단일 커넥션 수립
//      - 변경 수신 시 해당 테이블을 구독하는 콜백 즉시 실행
//   3) EventSource 미지원 또는 연결 지속 실패 시, 기존 polling(/api/realtime/tail)으로 자동 Fallback
//   4) 스마트 백오프 (Smart Back-off):
//      - document.visibilityState === 'hidden'이거나
//      - 5분 이상 마우스/키보드 움직임이 없는 'Idle' 상태 시 SSE/폴링 연결 일시 중단
//      - 사용자 동작 발생 또는 탭 포커스 시 즉시 연결 재수립 및 변경 사항 스캔
// ============================================================

import { logger } from './logger';

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

// 스마트 백오프 및 활성 감지 변수
let visibilityHandlerInstalled = false;
let activityListenersInstalled = false;
let isIdle = false;
let lastActivityTime = typeof Date !== 'undefined' ? Date.now() : 0;
let idleCheckTimer: ReturnType<typeof setInterval> | null = null;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5분

// SSE 상태 관리
let sseSource: EventSource | null = null;
let sseErrorCount = 0;
const MAX_SSE_ERRORS = 3;
const useSSE = false;
let sseSyncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// Cross-Tab Leader Election & Self-Healing SSE
const myTabId = typeof window !== 'undefined'
  ? (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().substring(0, 8)
      : Math.random().toString(36).substring(2, 10))
  : 'server';
const activeTabs = new Map<string, { lastSeen: number; tables: string[] }>();
let isLeader = typeof window === 'undefined'; // Default to true on server, elected on client
let sseActive = false;
let sseReconnectTimer: ReturnType<typeof setTimeout> | null = null;

const bc = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('newmso-realtime-bus')
  : null;

if (typeof window !== 'undefined') {
  const updateLeaderState = () => {
    const now = Date.now();
    activeTabs.forEach((info, tabId) => {
      if (now - info.lastSeen > 8000) {
        activeTabs.delete(tabId);
      }
    });

    let smallestId = myTabId;
    activeTabs.forEach((_, tabId) => {
      if (tabId < smallestId) {
        smallestId = tabId;
      }
    });

    const nextIsLeader = smallestId === myTabId;
    if (nextIsLeader !== isLeader) {
      isLeader = nextIsLeader;
      logger.debug(`[polling-bus] Tab ${myTabId} leader status changed: ${isLeader}`);
      syncRealtimeConnections();
    }
  };

  if (bc) {
    bc.onmessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'ping') {
        activeTabs.set(msg.tabId, { lastSeen: Date.now(), tables: msg.tables || [] });
        updateLeaderState();
      } else if (msg.type === 'change') {
        if (!isLeader) {
          for (const entry of channelRegistry.values()) {
            processTailData(entry, msg.tail);
          }
        }
      } else if (msg.type === 'initial') {
        if (!isLeader) {
          for (const entry of channelRegistry.values()) {
            for (const tableFilter of entry.tables) {
              const key = tableFilter.table + (tableFilter.filter ? `:${tableFilter.filter}` : '');
              const next = msg.tail[key] ?? null;
              if (entry.lastSeen[key] === undefined) {
                entry.lastSeen[key] = next;
              }
            }
          }
        }
      }
    };
  }

  // Periodically send ping heartbeats to other tabs (every 3 seconds)
  setInterval(() => {
    if (!bc) return;
    const myTables = new Set<string>();
    for (const entry of channelRegistry.values()) {
      for (const t of entry.tables) {
        myTables.add(t.table);
      }
    }
    bc.postMessage({
      type: 'ping',
      tabId: myTabId,
      tables: Array.from(myTables)
    });
    updateLeaderState();
  }, 3000);
}

function isHidden(): boolean {
  if (typeof document === 'undefined') return false;
  return document.visibilityState === 'hidden';
}

function isSuspended(): boolean {
  return isHidden() || isIdle;
}

function ensureActivityHandlers(): void {
  if (activityListenersInstalled) return;
  if (typeof window === 'undefined') return;
  activityListenersInstalled = true;
  lastActivityTime = Date.now();

  const resetActivity = () => {
    lastActivityTime = Date.now();
    if (isIdle) {
      isIdle = false;
      logger.debug('[polling-bus] User active, resuming real-time');
      syncRealtimeConnections();
      // 재개 즉시 전체 채널 한번 폴링하여 지연 시간 해소
      triggerImmediateSync();
    }
  };

  const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
  for (const event of events) {
    window.addEventListener(event, resetActivity, { passive: true });
  }

  // 10초 주기로 사용자가 5분 이상 자리비움(Idle) 상태인지 확인
  idleCheckTimer = setInterval(() => {
    if (!isIdle && Date.now() - lastActivityTime > IDLE_TIMEOUT_MS) {
      isIdle = true;
      logger.debug('[polling-bus] User idle for 5 minutes, suspending real-time');
      syncRealtimeConnections();
    }
  }, 10000);
}

function ensureVisibilityHandler(): void {
  if (visibilityHandlerInstalled) return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  visibilityHandlerInstalled = true;

  document.addEventListener('visibilitychange', () => {
    logger.debug(`[polling-bus] visibilitychange: ${document.visibilityState}`);
    syncRealtimeConnections();
    if (!isSuspended()) {
      triggerImmediateSync();
    }
  });
}

// 전체 채널 강제 1회 스캔
function triggerImmediateSync() {
  for (const entry of channelRegistry.values()) {
    void pollOnce(entry);
  }
}

function processTailData(entry: ChannelEntry, tail: Record<string, string | null>) {
  const changed: TableFilter[] = [];
  for (const tableFilter of entry.tables) {
    const key = tableFilter.table + (tableFilter.filter ? `:${tableFilter.filter}` : '');
    const next = tail[key] ?? null;
    const prev = entry.lastSeen[key] ?? null;
    if (next !== prev) {
      entry.lastSeen[key] = next;
      // 첫 polling/연결에는 prev가 undefined이므로 콜백 호출 안 함 (false positive 방지)
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
      logger.warn('[polling-bus] single callback error', err);
    }
  }
  if (entry.batchCallbacks.size > 0) {
    for (const cb of entry.batchCallbacks) {
      try {
        cb(payloads);
      } catch (err) {
        logger.warn('[polling-bus] batch callback error', err);
      }
    }
  }
}

async function pollOnce(entry: ChannelEntry): Promise<void> {
  if (entry.inFlight) return;
  if (isSuspended()) return;
  entry.inFlight = true;
  try {
    const tableSet = new Set<string>();
    for (const t of entry.tables) {
      tableSet.add(t.table + (t.filter ? `:${t.filter}` : ''));
    }
    const tables = Array.from(tableSet).join(',');
    const res = await fetch(`/api/realtime/tail?tables=${encodeURIComponent(tables)}`, {
      credentials: 'same-origin' });
    if (!res.ok) return;
    const data = (await res.json()) as { ok: boolean; tail?: Record<string, string | null> };
    if (!data.ok || !data.tail) return;

    processTailData(entry, data.tail);

    // 타 탭으로 변경내용 브로드캐스트 (SSE 미사용 폴링 환경 대응)
    if (bc) {
      bc.postMessage({ type: 'change', tail: data.tail });
    }
  } catch (err) {
    logger.warn('[polling-bus] poll failed', err);
  } finally {
    entry.inFlight = false;
  }
}

function syncRealtimeConnections() {
  if (typeof window === 'undefined') return;

  // SSE 동기화 예약 (디바운스 적용)
  if (sseSyncDebounceTimer) clearTimeout(sseSyncDebounceTimer);
  sseSyncDebounceTimer = setTimeout(() => {
    syncSSEConnectionInternal();
  }, 100);

  // 폴링 타이머 동기화
  syncPollingIntervalsInternal();
}

function syncSSEConnectionInternal() {
  if (sseReconnectTimer) {
    clearTimeout(sseReconnectTimer);
    sseReconnectTimer = null;
  }

  if (!useSSE || typeof window === 'undefined') {
    if (sseSource) {
      sseSource.close();
      sseSource = null;
    }
    return;
  }

  // If not the leader, close EventSource connection
  if (!isLeader) {
    if (sseSource) {
      logger.debug(`[polling-bus] Tab ${myTabId} (follower) closing EventSource connection`);
      sseSource.close();
      sseSource = null;
    }
    return;
  }

  // 중단 상태인 경우 SSE 닫기
  if (isSuspended()) {
    if (sseSource) {
      logger.debug('[polling-bus] Suspended state: Closing EventSource connection');
      sseSource.close();
      sseSource = null;
    }
    return;
  }

  // 현재 구독된 고유 테이블 목록 추출 (본인 탭 + 타 탭)
  const tables = new Set<string>();
  for (const entry of channelRegistry.values()) {
    for (const t of entry.tables) {
      tables.add(t.table);
    }
  }
  activeTabs.forEach((info) => {
    info.tables.forEach((t) => tables.add(t));
  });

  if (tables.size === 0) {
    if (sseSource) {
      sseSource.close();
      sseSource = null;
    }
    return;
  }

  const tableList = Array.from(tables).sort().join(',');
  const targetUrl = `/api/realtime/stream?tables=${encodeURIComponent(tableList)}`;

  // 이미 연결되어 있고 대상 테이블 목록이 변경되지 않았으면 유지
  if (sseSource) {
    try {
      const currentUrl = new URL(sseSource.url, window.location.href);
      const currentTables = currentUrl.searchParams.get('tables');
      if (currentTables === tableList) {
        return;
      }
    } catch {
      // ignore parsing error
    }
    logger.debug('[polling-bus] Subscribed tables changed, reconnecting EventSource');
    sseSource.close();
    sseSource = null;
  }

  try {
    logger.debug(`[polling-bus] Connecting EventSource to ${targetUrl}`);
    sseSource = new EventSource(targetUrl, { withCredentials: true });

    sseSource.addEventListener('initial', (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data) as { tail: Record<string, string | null> };
        logger.debug('[polling-bus] SSE initial payload received:', payload);
        // 채널들에 초기 상태 시드값 주입 (false positive 방지용)
        for (const entry of channelRegistry.values()) {
          for (const tableFilter of entry.tables) {
            const next = payload.tail[tableFilter.table] ?? null;
            if (entry.lastSeen[tableFilter.table] === undefined) {
              entry.lastSeen[tableFilter.table] = next;
            }
          }
        }
        
        // 타 탭으로 브로드캐스트
        if (bc) {
          bc.postMessage({ type: 'initial', tail: payload.tail });
        }
        
        sseErrorCount = 0; // 에러 카운터 리셋
        sseActive = true;
        syncPollingIntervalsInternal();
      } catch (err) {
        logger.warn('[polling-bus] Failed to parse initial payload', err);
      }
    });

    sseSource.addEventListener('change', (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data) as { tail: Record<string, string | null> };
        // 변경 감지된 테이블들에 대해 콜백 처리 호출
        for (const entry of channelRegistry.values()) {
          processTailData(entry, payload.tail);
        }
        
        // 타 탭으로 브로드캐스트
        if (bc) {
          bc.postMessage({ type: 'change', tail: payload.tail });
        }
        
        sseErrorCount = 0; // 에러 카운터 리셋
        sseActive = true;
      } catch (err) {
        logger.warn('[polling-bus] Failed to parse change payload', err);
      }
    });

    sseSource.onerror = (e) => {
      logger.warn('[polling-bus] EventSource error occurred', e);
      sseErrorCount++;
      sseActive = false;
      if (sseSource) {
        sseSource.close();
        sseSource = null;
      }
      
      // 즉시 폴링 타이머 활성화 (백업)
      syncPollingIntervalsInternal();

      // 지수 백오프로 재연결 시도
      const delay = Math.min(30000, 1000 * Math.pow(2, sseErrorCount));
      logger.debug(`[polling-bus] Retrying EventSource in ${delay}ms`);
      if (sseReconnectTimer) clearTimeout(sseReconnectTimer);
      sseReconnectTimer = setTimeout(() => {
        syncRealtimeConnections();
      }, delay);
    };
  } catch (err) {
    logger.error('[polling-bus] EventSource initialization failed', err);
    sseActive = false;
    syncPollingIntervalsInternal();
  }
}

function syncPollingIntervalsInternal() {
  for (const entry of channelRegistry.values()) {
    // 리더가 아니거나, SSE가 활성화되어 있거나, 화면/사용자가 비활성(Suspended)인 경우 폴링 타이머 중단
    if (!isLeader || sseActive || isSuspended()) {
      if (entry.timer) {
        clearInterval(entry.timer);
        entry.timer = null;
      }
    } else {
      // 일반 폴링 모드로 동작해야 함 (리더이고, SSE가 꺼져있을 때만)
      if (!entry.timer) {
        entry.timer = setInterval(() => void pollOnce(entry), entry.pollIntervalMs);
      }
    }
  }
}

function getOrCreateEntry(
  channelKey: string,
  tables: TableFilter[],
  pollIntervalMs: number,
): ChannelEntry {
  ensureVisibilityHandler();
  ensureActivityHandlers();

  const existing = channelRegistry.get(channelKey);
  if (existing) {
    if (pollIntervalMs < existing.pollIntervalMs) {
      existing.pollIntervalMs = pollIntervalMs;
    }
    syncRealtimeConnections();
    return existing;
  }
  const entry: ChannelEntry = {
    tables,
    singleCallbacks: new Set(),
    batchCallbacks: new Set(),
    pollIntervalMs,
    timer: null,
    lastSeen: {},
    inFlight: false };

  channelRegistry.set(channelKey, entry);

  // SSE 연결 업데이트 또는 폴링 시작
  syncRealtimeConnections();

  // 최초 1회 즉시 호출하여 초기 데이터 baseline 획득
  if (!useSSE && !isSuspended()) {
    void pollOnce(entry);
  }

  return entry;
}

function makeUnsubscribe(channelKey: string, remove: (entry: ChannelEntry) => void): Unsubscribe {
  return () => {
    const entry = channelRegistry.get(channelKey);
    if (!entry) return;
    remove(entry);
    if (entry.singleCallbacks.size === 0 && entry.batchCallbacks.size === 0) {
      if (entry.timer) {
        clearInterval(entry.timer);
      }
      channelRegistry.delete(channelKey);
      syncRealtimeConnections();
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

// 본인이 변경을 발생시켰을 때 즉시 동기화
export function pokeChannel(channelKey: string): void {
  const entry = channelRegistry.get(channelKey);
  if (!entry || entry.inFlight) return;
  void pollOnce(entry);
}
