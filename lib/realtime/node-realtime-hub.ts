// ============================================================
// lib/realtime/node-realtime-hub.ts
// Node.js 환경 전용 WebSocket 실시간 허브 (ws 기반).
//
// Cloudflare Durable Objects(RealtimeHub)와 100% 동일한 프로토콜 및
// 세션 쿠키 인증, 방 멤버십 ACL, signal/change 브로드캐스트를 지원합니다.
// ============================================================

import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage, Server } from 'http';
import { verifySessionTokenWithSecret, SESSION_COOKIE_NAME } from '../session-edge';
import { getSqliteDb } from '../db/sqlite-manager';

type WsAttachment = {
  userId: string;
  userName: string;
  subscriptions: string[];
  connectedAt: number;
  lastSeenAt: number;
  signalWindowStart?: number;
  signalCount?: number;
};

const socketAttachments = new WeakMap<WebSocket, WsAttachment>();
const MAX_SUBSCRIPTIONS_PER_SOCKET = 100;
const SIGNAL_WINDOW_MS = 1000;
const MAX_SIGNALS_PER_WINDOW = 20;
const ROOM_SCOPED_CHANNEL_RE = /^[A-Za-z0-9_]+:room_id=eq\.(.+)$/;
const ROOM_ACL_TTL_MS = 60 * 1000;

function parseCookies(cookieHeader?: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const [name, ...value] = part.trim().split('=');
    if (!name) return acc;
    acc[name] = decodeURIComponent(value.join('='));
    return acc;
  }, {});
}

function parseRoomScopedChannel(channel: string): string | null {
  const m = ROOM_SCOPED_CHANNEL_RE.exec(channel);
  return m ? m[1] : null;
}

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

export class NodeRealtimeHub {
  private wss: WebSocketServer | null = null;
  private roomAclCache = new Map<string, { allowed: boolean; at: number }>();

  public initialize(server: Server) {
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', async (request: IncomingMessage, socket, head) => {
      const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);

      if (url.pathname !== '/api/realtime/ws') {
        return; // Next.js 등 다른 업그레이드 핸들러로 통과
      }

      const cookies = parseCookies(request.headers.cookie);
      const token = cookies[SESSION_COOKIE_NAME];
      const secret = String(process.env.SESSION_SECRET || 'dev-only-session-secret-change-this').trim();
      const session = token ? await verifySessionTokenWithSecret(token, secret) : null;

      const user = session?.user;
      const effectiveUserId = String(user?.id || user?.user_id || user?.employee_no || user?.login_id || '').trim();
      if (!effectiveUserId) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      this.wss?.handleUpgrade(request, socket, head, (ws) => {
        const attachment: WsAttachment = {
          userId: effectiveUserId,
          userName: String(user?.name || '알 수 없음'),
          subscriptions: [],
          connectedAt: Date.now(),
          lastSeenAt: Date.now(),
        };
        socketAttachments.set(ws, attachment);
        this.setupWebSocket(ws);
      });
    });

    console.log('[NodeRealtimeHub] WebSocket Hub initialized on /api/realtime/ws');
  }

  private async canAccessRoom(userId: string, roomId: string): Promise<boolean> {
    const uid = String(userId || '').trim();
    const rid = String(roomId || '').trim();
    if (!uid || !rid) return false;

    const cacheKey = `${uid}\n${rid}`;
    const now = Date.now();
    const cached = this.roomAclCache.get(cacheKey);
    if (cached && now - cached.at < ROOM_ACL_TTL_MS) return cached.allowed;

    let allowed = false;
    try {
      const db = getSqliteDb();
      const row = db
        .prepare('SELECT type, members FROM chat_rooms WHERE id = ? LIMIT 1')
        .get(rid) as { type?: string; members?: unknown } | undefined;

      if (row) {
        allowed =
          String(row.type ?? '').trim() === 'notice' ||
          parseMembers(row.members).some((m) => m === uid);
      }
    } catch (err) {
      console.error('[NodeRealtimeHub] Room membership check failed:', err);
      return false;
    }

    this.roomAclCache.set(cacheKey, { allowed, at: now });
    if (this.roomAclCache.size > 2000) this.roomAclCache.clear();
    return allowed;
  }

  private setupWebSocket(ws: WebSocket) {
    ws.on('message', async (data: Buffer | string) => {
      const message = typeof data === 'string' ? data : data.toString('utf8');
      const attachment = socketAttachments.get(ws);
      if (!attachment) return;

      attachment.lastSeenAt = Date.now();

      try {
        const payload = JSON.parse(message) as {
          type?: string;
          at?: unknown;
          channels?: unknown;
          roomId?: string;
          payload?: unknown;
        };

        if (payload.type === 'ping') {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'pong',
                at: payload.at,
                serverTime: new Date().toISOString(),
              }),
            );
          }
          return;
        }

        if (payload.type === 'subscribe') {
          const newSubs = Array.isArray(payload.channels) ? payload.channels : [];
          const requestedSubs = Array.from(
            new Set(
              newSubs
                .map((c) => String(c || '').trim())
                .filter(Boolean),
            ),
          ).slice(0, MAX_SUBSCRIPTIONS_PER_SOCKET);

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
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'ready',
                serverTime: new Date().toISOString(),
              }),
            );
          }
          return;
        }

        if (payload.type === 'unsubscribe') {
          const removeSubs = Array.isArray(payload.channels)
            ? (payload.channels as unknown[]).map((c) => String(c))
            : [];
          attachment.subscriptions = (attachment.subscriptions || []).filter(
            (ch) => !removeSubs.includes(ch),
          );
          return;
        }

        if (payload.type === 'typing:start' || payload.type === 'typing:stop') {
          const roomId = payload.roomId;
          if (!roomId || !(await this.canAccessRoom(attachment.userId, roomId))) {
            return;
          }

          const isTyping = payload.type === 'typing:start';
          this.broadcast((otherWs, otherAttr) => {
            if (otherWs === ws) return;
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
          });
          return;
        }

        if (payload.type === 'signal') {
          const requested = Array.isArray(payload.channels)
            ? (payload.channels as unknown[]).map((c) => String(c))
            : [];

          const mySubs = attachment.subscriptions || [];
          const mySubSet = new Set(mySubs);
          const channels = requested.filter(
            (ch) => mySubSet.has(ch) || mySubs.some((sub) => sub.startsWith(`${ch}:`)),
          );
          if (channels.length === 0) return;

          const nowMs = Date.now();
          if (nowMs - (attachment.signalWindowStart ?? 0) >= SIGNAL_WINDOW_MS) {
            attachment.signalWindowStart = nowMs;
            attachment.signalCount = 0;
          }
          attachment.signalCount = (attachment.signalCount ?? 0) + 1;
          if (attachment.signalCount > MAX_SIGNALS_PER_WINDOW) return;

          this.broadcastChange(channels, payload.payload, ws);
        }
      } catch (err) {
        console.error('[NodeRealtimeHub] message parsing error:', err);
      }
    });

    ws.on('close', () => {
      socketAttachments.delete(ws);
    });

    ws.on('error', (err) => {
      console.error('[NodeRealtimeHub] socket error:', err);
      try {
        ws.close(1011, 'error');
      } catch {
        // ignore
      }
    });
  }

  private broadcast(callback: (ws: WebSocket, attachment: WsAttachment) => void) {
    if (!this.wss) return;
    for (const ws of this.wss.clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const attachment = socketAttachments.get(ws);
      if (!attachment) continue;
      try {
        callback(ws, attachment);
      } catch {
        // dead peer
      }
    }
  }

  public broadcastChange(channels: string[], payload?: unknown, senderWs?: WebSocket): number {
    let count = 0;
    const msg = JSON.stringify({
      type: 'change',
      channels,
      payload,
      serverTime: new Date().toISOString(),
    });

    this.broadcast((ws, attachment) => {
      if (senderWs && ws === senderWs) return;
      const hasSub = channels.some((ch) => attachment.subscriptions.includes(ch));
      if (hasSub) {
        ws.send(msg);
        count++;
      }
    });

    return count;
  }
}

export const globalRealtimeHub = new NodeRealtimeHub();

if (typeof globalThis !== 'undefined') {
  (globalThis as any).__allerp_realtime_hub = globalRealtimeHub;
}
