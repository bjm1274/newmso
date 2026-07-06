declare const WebSocketPair: any;

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

      const pair = new WebSocketPair();
      const client = (pair as any).webSocket1;
      const server = (pair as any).webSocket2;

      // WebSocket Hibernation API 사용
      this.state.acceptWebSocket(server);

      // attachment에 초기 상태 직렬화
      const attachment = {
        userId,
        userName,
        subscriptions: [] as string[],
        connectedAt: Date.now(),
        lastSeenAt: Date.now(),
      };
      server.serializeAttachment(attachment);

      return new Response(null, {
        status: 101,
        webSocket: client,
      } as any);
    }

    if (url.pathname === '/internal/realtime/signal') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
      }

      try {
        const body: { channels: string[]; payload?: any } = await request.json();
        const { channels, payload } = body;

        // 연결된 모든 WebSocket들 중 해당 채널을 구독하고 있는 WebSocket들을 찾아서 signal 전송
        const websockets = this.state.getWebSockets();
        let broadcastCount = 0;

        for (const ws of websockets) {
          const attachment = ws.deserializeAttachment() as any;
          if (attachment && attachment.subscriptions) {
            const hasSub = channels.some(ch => attachment.subscriptions.includes(ch));
            if (hasSub) {
              ws.send(JSON.stringify({
                type: 'change',
                channels,
                payload,
                serverTime: new Date().toISOString()
              }));
              broadcastCount++;
            }
          }
        }

        return new Response(JSON.stringify({ ok: true, broadcastCount }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('Not Found', { status: 404 });
  }

  // WebSocket Hibernation Handlers
  async webSocketMessage(ws: any, message: any) {
    if (typeof message !== 'string') return;

    try {
      const data = JSON.parse(message);
      const attachment = ws.deserializeAttachment() as any;
      if (!attachment) return;

      attachment.lastSeenAt = Date.now();

      if (data.type === 'ping') {
        ws.send(JSON.stringify({
          type: 'pong',
          at: data.at,
          serverTime: new Date().toISOString()
        }));
        ws.serializeAttachment(attachment);
        return;
      }

      if (data.type === 'subscribe') {
        const newSubs = Array.isArray(data.channels) ? data.channels : [];
        const currentSubs = attachment.subscriptions || [];
        const merged = Array.from(new Set([...currentSubs, ...newSubs]));
        attachment.subscriptions = merged;
        ws.serializeAttachment(attachment);

        ws.send(JSON.stringify({
          type: 'ready',
          serverTime: new Date().toISOString()
        }));
        return;
      }

      if (data.type === 'unsubscribe') {
        const removeSubs = Array.isArray(data.channels) ? data.channels : [];
        const currentSubs = attachment.subscriptions || [];
        const filtered = currentSubs.filter((ch: string) => !removeSubs.includes(ch));
        attachment.subscriptions = filtered;
        ws.serializeAttachment(attachment);
        return;
      }

      if (data.type === 'typing:start' || data.type === 'typing:stop') {
        const roomId = data.roomId;
        if (!roomId) return;
        
        // 같은 방을 보고 있는 다른 모든 접속자들에게 타이핑 이벤트를 전송
        const websockets = this.state.getWebSockets();
        const isTyping = data.type === 'typing:start';

        for (const otherWs of websockets) {
          if (otherWs === ws) continue; // 본인 제외
          const otherAttr = otherWs.deserializeAttachment() as any;
          if (otherAttr && otherAttr.subscriptions) {
            const roomChannel = `messages:room_id=eq.${roomId}`;
            if (otherAttr.subscriptions.includes(roomChannel) || otherAttr.subscriptions.includes('messages')) {
              otherWs.send(JSON.stringify({
                type: 'typing',
                roomId,
                userId: attachment.userId,
                userName: attachment.userName,
                typing: isTyping,
                serverTime: new Date().toISOString()
              }));
            }
          }
        }
        ws.serializeAttachment(attachment);
        return;
      }

      if (data.type === 'signal') {
        const channels = Array.isArray(data.channels) ? data.channels : [];
        const websockets = this.state.getWebSockets();

        for (const otherWs of websockets) {
          const otherAttr = otherWs.deserializeAttachment() as any;
          if (otherAttr && otherAttr.subscriptions) {
            const hasSub = channels.some((ch: string) => otherAttr.subscriptions.includes(ch));
            if (hasSub) {
              otherWs.send(JSON.stringify({
                type: 'change',
                channels,
                payload: data.payload,
                serverTime: new Date().toISOString()
              }));
            }
          }
        }
        ws.serializeAttachment(attachment);
        return;
      }

      ws.serializeAttachment(attachment);
    } catch (err) {
      console.error('[RealtimeHub] Error handling message:', err);
    }
  }

  async webSocketClose(ws: any, code: any, reason: any, wasClean: any) {
    // Close 처리
  }

  async webSocketError(ws: any, error: any) {
    console.error('[RealtimeHub] WebSocket error:', error);
  }
}
