/**
 * Realtime Durable Object — WebSocket Hibernation
 *
 * 중요: WebSocketPair 는 [client, server] 인덱스/Object.values 로 꺼내야 한다.
 * pair.webSocket1 / webSocket2 는 런타임에 undefined → acceptWebSocket TypeError
 * (CF 로그 일 ~수천 Uncaught 의 주원인)
 */

 
declare const WebSocketPair: any;

type WsAttachment = {
  userId: string;
  userName: string;
  subscriptions: string[];
  connectedAt: number;
  lastSeenAt: number;
  /** signal 발신 속도 제한 창의 시작 시각(ms) */
  signalWindowStart?: number;
  /** 현재 창에서 이 소켓이 보낸 signal 수 */
  signalCount?: number;
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

/**
 * 클라이언트발 signal 중계 속도 제한.
 * 정상 사용에서는 타이핑·읽음 갱신 정도라 초당 수 건을 넘지 않는다.
 * 한 소켓이 중계를 독점해 다른 구독자에게 프레임을 쏟아붓지 못하게 상한을 둔다.
 */
const SIGNAL_WINDOW_MS = 1000;
const MAX_SIGNALS_PER_WINDOW = 20;

/**
 * 방 스코프 채널 패턴 — `messages:room_id=eq.<roomId>` 형태.
 * 이 형태의 채널만 대화방 멤버십을 요구한다(테이블 전역 채널은 종전대로).
 */
const ROOM_SCOPED_CHANNEL_RE = /^[A-Za-z0-9_]+:room_id=eq\.(.+)$/;

/** 멤버십 판정 캐시 유효시간. 방 멤버 추가가 이 시간 안에 반영된다. */
const ROOM_ACL_TTL_MS = 60 * 1000;

function parseRoomScopedChannel(channel: string): string | null {
  const m = ROOM_SCOPED_CHANNEL_RE.exec(channel);
  return m ? m[1] : null;
}

/** lib/chat-room-membership.ts 의 parseMembersField 와 같은 규칙(DO 번들 최소화를 위해 인라인). */
function parseMembers(raw: unknown): string[] {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return [trimmed];
    }
  }
  if (Array.isArray(parsed)) {
    return parsed.map((m) => String(m ?? '').trim()).filter(Boolean);
  }
  if (parsed && typeof parsed === 'object') {
    return Object.values(parsed as Record<string, unknown>)
      .map((m) => String(m ?? '').trim())
      .filter(Boolean);
  }
  return [];
}

export class RealtimeHub {
  state: any;
  env: any;

  /**
   * `${userId}\n${roomId}` → { allowed, at }.
   *
   * attachment 에 넣지 않는 이유: serializeAttachment 는 용량 제한이 빡빡한데
   * subscriptions 만으로도 이미 크다. 캐시는 성능용이라 hibernation 으로
   * 날아가도 다음 조회에서 다시 채워지면 그만이다.
   */
  private roomAclCache = new Map<string, { allowed: boolean; at: number }>();

  constructor(state: any, env: any) {
    this.state = state;
    this.env = env;
  }

  /**
   * 대화방 접근 가능 여부. notice 방은 전원 허용, 그 외는 members 포함 여부.
   *
   * 예전에는 이 검사가 아예 없었다. subscribe 는 클라이언트가 보낸 채널 문자열을
   * 정규화·슬라이스만 해서 그대로 저장했고, typing 브로드캐스트도 발신자 멤버십을
   * 보지 않았다. 그래서 로그인만 하면 `messages:room_id=eq.<남의 방>` 을 구독해
   * 그 방의 활동(변경 신호)을 관측하고, 그 방에 "입력 중" 표시를 위조할 수 있었다.
   */
  private async canAccessRoom(userId: string, roomId: string): Promise<boolean> {
    const uid = String(userId || '').trim();
    const rid = String(roomId || '').trim();
    if (!uid || !rid) return false;

    const cacheKey = `${uid}\n${rid}`;
    const now = Date.now();
    const cached = this.roomAclCache.get(cacheKey);
    if (cached && now - cached.at < ROOM_ACL_TTL_MS) return cached.allowed;

    const db = this.env?.DB;
    if (!db || typeof db.prepare !== 'function') {
      // 바인딩 자체가 없으면 판정 수단이 없다. 여기서 전부 막으면 설정 실수 하나로
      // 실시간이 통째로 죽으므로 통과시키되, 조용히 넘어가지 않도록 로그를 남긴다.
      console.error('[RealtimeHub] DB binding 없음 — 방 멤버십 검증을 건너뜀');
      return true;
    }

    let allowed = false;
    try {
      const row = await db
        .prepare('SELECT type, members FROM chat_rooms WHERE id = ? LIMIT 1')
        .bind(rid)
        .first();
      if (row) {
        allowed =
          String(row.type ?? '').trim() === 'notice' ||
          parseMembers(row.members).some((m) => m === uid);
      }
    } catch (err) {
      // 조회 실패는 fail-closed — 판정 못 한 방을 구독시키지 않는다.
      console.error(
        '[RealtimeHub] 방 멤버십 조회 실패:',
        err instanceof Error ? err.message : err,
      );
      return false;
    }

    this.roomAclCache.set(cacheKey, { allowed, at: now });
    // 캐시가 무한히 커지지 않게 상한을 둔다(소켓 수 × 방 수).
    if (this.roomAclCache.size > 2000) this.roomAclCache.clear();
    return allowed;
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
        const requestedSubs = Array.from(
          new Set(
            newSubs
              .map((c) => String(c || '').trim())
              .filter(Boolean),
          ),
        ).slice(0, MAX_SUBSCRIPTIONS_PER_SOCKET);

        // 방 스코프 채널(`...:room_id=eq.X`)은 멤버십을 확인한 것만 남긴다.
        // 방 단위로 한 번만 조회하고 결과를 재사용한다(같은 방의 5개 채널이 한 번에 온다).
        const roomVerdicts = new Map<string, boolean>();
        const acceptedSubs: string[] = [];
        for (const channel of requestedSubs) {
          const roomId = parseRoomScopedChannel(channel);
          if (!roomId) {
            acceptedSubs.push(channel);
            continue;
          }
          if (!roomVerdicts.has(roomId)) {
            roomVerdicts.set(roomId, await this.canAccessRoom(attachment.userId, roomId));
          }
          if (roomVerdicts.get(roomId)) acceptedSubs.push(channel);
        }
        attachment.subscriptions = acceptedSubs;
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

        // 발신자가 그 방의 멤버일 때만 중계한다.
        // 예전에는 검사가 없어 비멤버가 임의 방에 "입력 중" 표시를 띄울 수 있었다.
        if (!(await this.canAccessRoom(attachment.userId, roomId))) {
          ws.serializeAttachment(attachment);
          return;
        }

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
        const requested = Array.isArray(data.channels)
          ? (data.channels as unknown[]).map((c) => String(c))
          : [];

        // 발신자가 실제로 관여하는 채널로만 중계한다.
        //
        // 예전에는 클라이언트가 보낸 channels 를 그대로 믿고 그 채널을 구독한
        // **모든** 소켓에 change 프레임을 뿌렸다. 즉 아무 로그인 사용자나
        // 임의 채널에 가짜 변경 신호를 주입해 전 구독자를 재조회시킬 수 있었다.
        //
        // 단순 교집합으로 막으면 정상 동작이 깨진다. 클라이언트(polling-bus 의
        // pokeChannel)는 `messages:room_id=eq.X` 를 구독한 상태에서 bare `messages`
        // 채널로도 신호를 보낸다 — 다른 클라이언트의 전역 안읽음 목록을 깨우기 위해서다.
        // 그래서 "구독 중이거나, 구독 중인 필터 채널의 테이블 접두어인 경우" 를 허용한다.
        const mySubs = attachment.subscriptions || [];
        const mySubSet = new Set(mySubs);
        const channels = requested.filter(
          (ch) => mySubSet.has(ch) || mySubs.some((sub) => sub.startsWith(`${ch}:`)),
        );
        if (channels.length === 0) {
          ws.serializeAttachment(attachment);
          return;
        }

        // 소켓당 신호 발신 속도 제한 — 한 클라이언트가 중계를 독점하지 못하게 한다.
        const nowMs = Date.now();
        if (nowMs - (attachment.signalWindowStart ?? 0) >= SIGNAL_WINDOW_MS) {
          attachment.signalWindowStart = nowMs;
          attachment.signalCount = 0;
        }
        attachment.signalCount = (attachment.signalCount ?? 0) + 1;
        if (attachment.signalCount > MAX_SIGNALS_PER_WINDOW) {
          ws.serializeAttachment(attachment);
          return;
        }

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
