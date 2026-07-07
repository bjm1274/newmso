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

// WS 상태 관리
let ws: WebSocket | null = null;
let wsErrorCount = 0;
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let wsPingTimer: ReturnType<typeof setInterval> | null = null;
let wsActive = false;
let sseSyncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// SSE 상태 관리 (Playwright E2E 호환용 fallback)
let sseSource: EventSource | null = null;
let sseErrorCount = 0;
let sseActive = false;
let sseReconnectTimer: ReturnType<typeof setTimeout> | null = null;

// Cross-Tab Leader Election
const myTabId = typeof window !== 'undefined'
  ? (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().substring(0, 8)
      : Math.random().toString(36).substring(2, 10))
  : 'server';
const activeTabs = new Map<string, { lastSeen: number; tables: string[] }>();
let isLeader = typeof window === 'undefined'; // Default to true on server, elected on client

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
      } else if (msg.type === 'change_ws') {
        if (!isLeader) {
          for (const entry of channelRegistry.values()) {
            processTailDataWebSocket(entry, msg.channels);
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

function processTailDataWebSocket(entry: ChannelEntry, changedChannels: string[]) {
  const changed: TableFilter[] = [];
  for (const tableFilter of entry.tables) {
    const key = tableFilter.table + (tableFilter.filter ? `:${tableFilter.filter}` : '');
    if (changedChannels.includes(key) || changedChannels.includes(tableFilter.table)) {
      changed.push(tableFilter);
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

function isPlaywrightEnv(): boolean {
  if (typeof window === 'undefined') return false;
  return (window as any).__playwright__ || 
    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.includes('Playwright'));
}

function syncRealtimeConnections() {
  if (typeof window === 'undefined') return;

  if (sseSyncDebounceTimer) clearTimeout(sseSyncDebounceTimer);
  sseSyncDebounceTimer = setTimeout(() => {
    if (isPlaywrightEnv()) {
      if (ws) {
        closeWebSocket();
      }
      syncSSEConnectionInternal();
    } else {
      if (sseSource) {
        sseSource.close();
        sseSource = null;
        sseActive = false;
      }
      syncWebSocketConnectionInternal();
    }
  }, 100);

  syncPollingIntervalsInternal();
}

function syncWebSocketConnectionInternal() {
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }

  if (!isLeader || isSuspended()) {
    if (ws) {
      logger.debug(`[polling-bus] Closing WebSocket (isLeader: ${isLeader}, isSuspended: ${isSuspended()})`);
      closeWebSocket();
    }
    return;
  }

  const channels = new Set<string>();
  for (const entry of channelRegistry.values()) {
    for (const t of entry.tables) {
      const canonicalKey = t.table + (t.filter ? `:${t.filter}` : '');
      channels.add(canonicalKey);
    }
  }
  activeTabs.forEach((info) => {
    info.tables.forEach((t) => channels.add(t));
  });

  if (channels.size === 0) {
    if (ws) {
      closeWebSocket();
    }
    return;
  }

  const channelList = Array.from(channels).sort();

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'subscribe',
      channels: channelList
    }));
    return;
  }

  if (ws && ws.readyState === WebSocket.CONNECTING) {
    return;
  }

  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const targetUrl = `${protocol}//${window.location.host}/api/realtime/ws`;
    logger.debug(`[polling-bus] Connecting WebSocket to ${targetUrl}`);

    ws = new WebSocket(targetUrl);

    ws.onopen = () => {
      logger.debug('[polling-bus] WebSocket connected');
      wsErrorCount = 0;
      wsActive = true;
      syncPollingIntervalsInternal();

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'subscribe',
          channels: channelList
        }));
      }

      if (wsPingTimer) clearInterval(wsPingTimer);
      wsPingTimer = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping', at: Date.now() }));
        }
      }, 30000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'change') {
          for (const entry of channelRegistry.values()) {
            processTailDataWebSocket(entry, data.channels);
          }
          if (bc) {
            bc.postMessage({ type: 'change_ws', channels: data.channels });
          }
        } else if (data.type === 'typing') {
          // 타이핑 상태 변경 이벤트를 커스텀 이벤트나 콜백으로 브로드캐스트할 수 있게 custom event 발행
          if (typeof window !== 'undefined') {
            const ev = new CustomEvent('realtime-typing', { detail: data });
            window.dispatchEvent(ev);
          }
        }
      } catch (err) {
        logger.warn('[polling-bus] Failed to parse WebSocket message', err);
      }
    };

    ws.onclose = (event) => {
      logger.debug(`[polling-bus] WebSocket closed: ${event.code} ${event.reason}`);
      wsActive = false;
      cleanupWebSocketState();
      syncPollingIntervalsInternal();
      
      if (!isSuspended() && isLeader) {
        wsErrorCount++;
        const delay = Math.min(30000, 1000 * Math.pow(2, wsErrorCount));
        logger.debug(`[polling-bus] Retrying WebSocket connection in ${delay}ms`);
        wsReconnectTimer = setTimeout(() => {
          syncRealtimeConnections();
        }, delay);
      }
    };

    ws.onerror = (err) => {
      logger.warn('[polling-bus] WebSocket error occurred', err);
    };

  } catch (err) {
    logger.error('[polling-bus] WebSocket initialization failed', err);
    wsActive = false;
    cleanupWebSocketState();
    syncPollingIntervalsInternal();
  }
}

function syncSSEConnectionInternal() {
  if (sseReconnectTimer) {
    clearTimeout(sseReconnectTimer);
    sseReconnectTimer = null;
  }

  if (typeof window === 'undefined') {
    if (sseSource) {
      sseSource.close();
      sseSource = null;
      sseActive = false;
    }
    return;
  }

  if (!isLeader) {
    if (sseSource) {
      logger.debug(`[polling-bus] Tab ${myTabId} (follower) closing EventSource connection`);
      sseSource.close();
      sseSource = null;
      sseActive = false;
    }
    return;
  }

  if (isSuspended()) {
    if (sseSource) {
      logger.debug('[polling-bus] Suspended state: Closing EventSource connection');
      sseSource.close();
      sseSource = null;
      sseActive = false;
    }
    return;
  }

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
      sseActive = false;
    }
    return;
  }

  const tableList = Array.from(tables).sort().join(',');
  const targetUrl = `/api/realtime/stream?tables=${encodeURIComponent(tableList)}`;

  if (sseSource) {
    try {
      const currentUrl = new URL(sseSource.url, window.location.href);
      const currentTables = currentUrl.searchParams.get('tables');
      if (currentTables === tableList) {
        return;
      }
    } catch {
      // ignore
    }
    sseSource.close();
    sseSource = null;
    sseActive = false;
  }

  try {
    logger.debug(`[polling-bus] Connecting EventSource to ${targetUrl}`);
    sseSource = new EventSource(targetUrl, { withCredentials: true });

    sseSource.addEventListener('initial', (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data) as { tail: Record<string, string | null> };
        for (const entry of channelRegistry.values()) {
          for (const tableFilter of entry.tables) {
            const next = payload.tail[tableFilter.table] ?? null;
            if (entry.lastSeen[tableFilter.table] === undefined) {
              entry.lastSeen[tableFilter.table] = next;
            }
          }
        }
        if (bc) {
          bc.postMessage({ type: 'initial', tail: payload.tail });
        }
        sseErrorCount = 0;
        sseActive = true;
        syncPollingIntervalsInternal();
      } catch (err) {
        logger.warn('[polling-bus] Failed to parse initial payload', err);
      }
    });

    sseSource.addEventListener('change', (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data) as { tail: Record<string, string | null> };
        for (const entry of channelRegistry.values()) {
          processTailData(entry, payload.tail);
        }
        if (bc) {
          bc.postMessage({ type: 'change', tail: payload.tail });
        }
        sseErrorCount = 0;
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
      syncPollingIntervalsInternal();
      const delay = Math.min(30000, 1000 * Math.pow(2, sseErrorCount));
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

function closeWebSocket() {
  if (ws) {
    try {
      ws.close();
    } catch {}
    ws = null;
  }
  wsActive = false;
  cleanupWebSocketState();
}

function cleanupWebSocketState() {
  if (wsPingTimer) {
    clearInterval(wsPingTimer);
    wsPingTimer = null;
  }
}

function syncPollingIntervalsInternal() {
  for (const entry of channelRegistry.values()) {
    const isConnectionActive = wsActive || sseActive;
    if (!isLeader || isConnectionActive || isSuspended()) {
      if (entry.timer) {
        clearInterval(entry.timer);
        entry.timer = null;
      }
    } else {
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

  // WS 연결 업데이트 또는 폴링 시작
  syncRealtimeConnections();

  // 최초 1회 즉시 호출하여 초기 데이터 baseline 획득
  if (!wsActive && !isSuspended()) {
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

function getInterval(options?: RealtimeOptions): number {
  if (typeof window === 'undefined') return 15000;
  const hostname = window.location.hostname;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  const isPlaywright = (window as any).__playwright__ || 
    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.includes('Playwright'));
  
  if (isLocal || isPlaywright) {
    return options?.pollIntervalMs ?? 1000;
  } else {
    const minInterval = 30000;
    return Math.max(options?.pollIntervalMs ?? 15000, minInterval);
  }
}

export function subscribeRealtime(
  channelKey: string,
  tables: TableFilter[],
  callback: RealtimeCallback,
  options?: RealtimeOptions,
): Unsubscribe {
  const interval = getInterval(options);
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
  const interval = getInterval(options);
  const entry = getOrCreateEntry(channelKey, tables, interval);
  entry.batchCallbacks.add(callback);
  return makeUnsubscribe(channelKey, (e) => e.batchCallbacks.delete(callback));
}

export function pokeChannel(channelKey: string): void {
  const entry = channelRegistry.get(channelKey);
  if (!entry) return;

  const changedChannels = [channelKey];
  entry.tables.forEach(t => {
    changedChannels.push(t.table);
    changedChannels.push(t.table + (t.filter ? `:${t.filter}` : ''));
  });
  processTailDataWebSocket(entry, changedChannels);

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'signal',
      channels: Array.from(new Set(changedChannels))
    }));
  } else if (!entry.inFlight) {
    void pollOnce(entry);
  }
}

export function sendTypingSignal(roomId: string, isTyping: boolean, userName?: string): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: isTyping ? 'typing:start' : 'typing:stop',
      roomId
    }));
  } else {
    // Fallback: WebSocket 연결이 활성화되지 않은 상태에서는 기존 HTTP API 호출
    const method = isTyping ? 'POST' : 'DELETE';
    const body = isTyping ? { room_id: roomId, user_name: userName } : { room_id: roomId };
    void fetch('/api/chat/typing', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).catch(() => {});
  }
}
