/**
 * Realtime Durable Object — WebSocket Hibernation
 *
 * 중요: WebSocketPair 는 [client, server] 인덱스/Object.values 로 꺼내야 한다.
 * pair.webSocket1 / webSocket2 는 런타임에 undefined → acceptWebSocket TypeError
 * (CF 로그 일 ~수천 Uncaught 의 주원인)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const WebSocketPair: any;

type WsAttachment = {
  userId: string;
  userName: string;
  subscriptions: string[];
  connectedAt: number;
  lastSeenAt: number;
};

/** Hibernation WebSocket (CF 확장 API) */
type HibernatableWebSocket = {
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  serializeAttachment: (value: unknown) => void;
  deserializeAttachment: () => unknown;
};

function getPairEnds(pair: any): { client: HibernatableWebSocket; server: HibernatableWebSocket } {
  // CF 공식: const [client, server] = Object.values(new WebSocketPair())
  // webSocket1/webSocket2 프로퍼티는 undefined → acceptWebSocket TypeError 원인
  const vals = Object.values(pair || {}) as HibernatableWebSocket[];
  if (vals.length >= 2 && vals[0] && vals[1]) {
    return { client: vals[0], server: vals[1] };
  }
  const client = pair?.[0] ?? pair?.client;
  const server = pair?.[1] ?? pair?.server;
  if (!client || !server) {
    throw new TypeError('WebSocketPair did not yield client/server sockets');
  }
  return { client, server };
}

/**
 * 소켓 1개가 유지할 수 있는 최대 구독 채널 수.
 *
 * 클라이언트는 (열려 있는 방 1개 × 채널 5종) + 전역 채널 몇 개를 보내므로 평상시 10개 안팎이다.
 * 여러 탭의 채널이 리더 탭으로 합쳐지는 경우를 감안해 여유를 둔다.
 */
const MAX_SUBSCRIPTIONS_PER_SOCKET = 100;

export class RealtimeHub {
  state: any;
  env: any;

  constructor(state: any, env: any) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/realtime/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected Upgrade: websocket', { status: 426 });
      }

      const userId = request.headers.get('x-realtime-user-id') || '';
      const userName = request.headers.get('x-realtime-user-name') || '알 수 없음';

      try {
        const pair = new WebSocketPair();
        const { client, server } = getPairEnds(pair);

        // Hibernation API — server 쪽만 accept
        this.state.acceptWebSocket(server);

        const attachment: WsAttachment = {
          userId,
          userName,
          subscriptions: [],
          connectedAt: Date.now(),
          lastSeenAt: Date.now(),
        };
        server.serializeAttachment(attachment);

        return new Response(null, {
          status: 101,
          webSocket: client,
        } as ResponseInit);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[RealtimeHub] acceptWebSocket failed:', message);
        return new Response(JSON.stringify({ ok: false, error: message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    if (url.pathname === '/internal/realtime/signal') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
      }

      try {
        const body = (await request.json()) as {
          channels?: string[];
          payload?: unknown;
        };
        const channels = Array.isArray(body.channels) ? body.channels : [];
        const websockets = this.state.getWebSockets();
        let broadcastCount = 0;

        for (const ws of websockets) {
          try {
            const attachment = ws.deserializeAttachment() as WsAttachment | null;
            if (attachment?.subscriptions?.length) {
              const hasSub = channels.some((ch) =>
                attachment.subscriptions.includes(ch),
              );
              if (hasSub) {
                ws.send(
                  JSON.stringify({
                    type: 'change',
                    channels,
                    payload: body.payload,
                    serverTime: new Date().toISOString(),
                  }),
                );
                broadcastCount++;
              }
            }
          } catch {
            // dead peer
          }
        }

        return new Response(JSON.stringify({ ok: true, broadcastCount }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return new Response(JSON.stringify({ ok: false, error: message }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response('Not Found', { status: 404 });
  }

  async webSocketMessage(ws: any, message: string | ArrayBuffer) {
    if (typeof message !== 'string') return;

    try {
      const data = JSON.parse(message) as {
        type?: string;
        at?: unknown;
        channels?: unknown;
        roomId?: string;
        payload?: unknown;
      };
      const attachment = ws.deserializeAttachment() as WsAttachment | null;
      if (!attachment) return;

      attachment.lastSeenAt = Date.now();

      if (data.type === 'ping') {
        try {
          ws.send(
            JSON.stringify({
              type: 'pong',
              at: data.at,
              serverTime: new Date().toISOString(),
            }),
          );
        } catch {
          /* closed */
        }
        ws.serializeAttachment(attachment);
        return;
      }

      if (data.type === 'subscribe') {
        // 클라이언트(lib/polling-bus.ts syncRealtimeConnections)는 매번 **현재 원하는 전체
        // 채널 목록**을 보낸다. 따라서 여기서는 누적이 아니라 **교체**해야 한다.
        //
        // 예전에는 기존 구독과 union 한 뒤 앞에서부터 80개로 잘랐다. 클라이언트가
        // unsubscribe 를 보내지 않으므로 방을 전환할 때마다 채널이 5개씩 쌓였고,
        // 약 15회 전환 후 상한이 포화되면 **새로 연 방의 messages 채널이 잘려나가**
        // 그 방만 실시간 갱신이 멈췄다(새로고침하면 복구되던 증상).
        const newSubs = Array.isArray(data.channels) ? data.channels : [];
        attachment.subscriptions = Array.from(
          new Set(
            newSubs
              .map((c) => String(c || '').trim())
              .filter(Boolean),
          ),
        ).slice(0, MAX_SUBSCRIPTIONS_PER_SOCKET);
        ws.serializeAttachment(attachment);
        try {
          ws.send(
            JSON.stringify({
              type: 'ready',
              serverTime: new Date().toISOString(),
            }),
          );
        } catch {
          /* closed */
        }
        return;
      }

      if (data.type === 'unsubscribe') {
        const removeSubs = Array.isArray(data.channels)
          ? (data.channels as unknown[]).map((c) => String(c))
          : [];
        attachment.subscriptions = (attachment.subscriptions || []).filter(
          (ch) => !removeSubs.includes(ch),
        );
        ws.serializeAttachment(attachment);
        return;
      }

      if (data.type === 'typing:start' || data.type === 'typing:stop') {
        const roomId = data.roomId;
        if (!roomId) return;

        const websockets = this.state.getWebSockets();
        const isTyping = data.type === 'typing:start';

        for (const otherWs of websockets) {
          if (otherWs === ws) continue;
          try {
            const otherAttr = otherWs.deserializeAttachment() as WsAttachment | null;
            if (!otherAttr?.subscriptions) continue;
            const roomChannel = `messages:room_id=eq.${roomId}`;
            if (
              otherAttr.subscriptions.includes(roomChannel) ||
              otherAttr.subscriptions.includes('messages')
            ) {
              otherWs.send(
                JSON.stringify({
                  type: 'typing',
                  roomId,
                  userId: attachment.userId,
                  userName: attachment.userName,
                  typing: isTyping,
                  serverTime: new Date().toISOString(),
                }),
              );
            }
          } catch {
            /* dead peer */
          }
        }
        ws.serializeAttachment(attachment);
        return;
      }

      if (data.type === 'signal') {
        const channels = Array.isArray(data.channels)
          ? (data.channels as unknown[]).map((c) => String(c))
          : [];
        const websockets = this.state.getWebSockets();

        for (const otherWs of websockets) {
          try {
            const otherAttr = otherWs.deserializeAttachment() as WsAttachment | null;
            if (!otherAttr?.subscriptions) continue;
            const hasSub = channels.some((ch) =>
              otherAttr.subscriptions.includes(ch),
            );
            if (hasSub) {
              otherWs.send(
                JSON.stringify({
                  type: 'change',
                  channels,
                  payload: data.payload,
                  serverTime: new Date().toISOString(),
                }),
              );
            }
          } catch {
            /* dead peer */
          }
        }
        ws.serializeAttachment(attachment);
      }
    } catch (err) {
      console.error(
        '[RealtimeHub] webSocketMessage error:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  async webSocketClose(
    ws: any,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ) {
    try {
      void ws;
    } catch {
      /* ignore */
    }
  }

  async webSocketError(ws: any, error: unknown) {
    console.error(
      '[RealtimeHub] webSocketError:',
      error instanceof Error ? error.message : error,
    );
    try {
      ws.close(1011, 'error');
    } catch {
      /* ignore */
    }
  }
}
