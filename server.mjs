/**
 * server.mjs
 *
 * AllERP Server Next.js Standalone + WebSocket Hub + Cron Scheduler 통합 서버
 * (Node.js 20 런타임에서 외부 TS 컴파일러 없이 즉시 독립 실행)
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import next from 'next';
import Database from 'better-sqlite3';
import { WebSocketServer, WebSocket } from 'ws';
import cron from 'node-cron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);
const dbPath =
  process.env.DATABASE_PATH ||
  process.env.DB_PATH ||
  path.join(__dirname, 'data', 'allerp.sqlite');

// ============================================================
// 1. SQLite 데이터베이스 및 자동 마이그레이션
// ============================================================
function initSqliteDatabase() {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = OFF');
  db.pragma('cache_size = -64000');
  db.pragma('temp_store = MEMORY');

  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db.prepare('SELECT name FROM _migrations').all();
  const appliedSet = new Set(appliedRows.map((r) => r.name));

  const candidates = [
    path.join(__dirname, 'lib', 'db', 'migrations'),
    path.join(process.cwd(), 'lib', 'db', 'migrations'),
  ];

  let migrationsDir = '';
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      migrationsDir = c;
      break;
    }
  }

  if (migrationsDir) {
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let appliedCount = 0;
    for (const file of files) {
      if (appliedSet.has(file)) continue;

      const sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      const statements = sqlContent.includes('--> statement-breakpoint')
        ? sqlContent.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)
        : [sqlContent.trim()];

      db.transaction(() => {
        for (const stmt of statements) {
          if (!stmt) continue;
          try {
            db.exec(stmt);
          } catch (err) {
            const msg = err?.message || '';
            if (msg.includes('duplicate column name') || msg.includes('already exists')) {
              continue;
            }
            throw err;
          }
        }
        db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(
          file,
          new Date().toISOString(),
        );
      })();
      appliedCount++;
    }
    console.log(`[server] SQLite migrations checked (${appliedCount} newly applied).`);
  }

  db.pragma('foreign_keys = ON');

  // D1 호환 어댑터 객체 생성 및 globalThis 등록
  class SqliteD1PreparedStatement {
    constructor(db, query) {
      this.db = db;
      this.query = query;
      this.params = [];
    }
    bind(...params) {
      const next = new SqliteD1PreparedStatement(this.db, this.query);
      next.params = params.map((p) => {
        if (typeof p === 'boolean') return p ? 1 : 0;
        if (p instanceof Date) return p.toISOString();
        if (p === undefined) return null;
        return p;
      });
      return next;
    }
    async all() {
      const stmt = this.db.prepare(this.query);
      const results = stmt.all(...this.params);
      return { results, success: true, meta: { changes: 0 } };
    }
    async run() {
      const isSelect = /^\s*(SELECT|PRAGMA|WITH|EXPLAIN)\b/i.test(this.query);
      const stmt = this.db.prepare(this.query);
      if (isSelect) {
        const results = stmt.all(...this.params);
        return { results, success: true, meta: { changes: 0, rows_read: results.length } };
      }
      const info = stmt.run(...this.params);
      return { results: [], success: true, meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } };
    }
    async first(colName) {
      const stmt = this.db.prepare(this.query);
      const row = stmt.get(...this.params);
      if (!row) return null;
      return colName ? row[colName] ?? null : row;
    }
    async raw(options) {
      const stmt = this.db.prepare(this.query);
      const rows = stmt.raw().all(...this.params);
      if (options?.columnNames) {
        const colNames = stmt.columns().map((c) => c.name);
        return [colNames, ...rows];
      }
      return rows;
    }
  }

  class SqliteD1Adapter {
    constructor(db) {
      this.db = db;
    }
    prepare(query) {
      return new SqliteD1PreparedStatement(this.db, query);
    }
    async batch(statements) {
      const results = [];
      this.db.transaction(() => {
        for (const stmt of statements) {
          const prep = this.db.prepare(stmt.query);
          const isSelect = /^\s*(SELECT|PRAGMA|WITH|EXPLAIN)\b/i.test(stmt.query);
          if (isSelect) {
            results.push({ results: prep.all(...stmt.params), success: true });
          } else {
            const info = prep.run(...stmt.params);
            results.push({ results: [], success: true, meta: { changes: info.changes } });
          }
        }
      })();
      return results;
    }
    async exec(query) {
      this.db.exec(query);
      return { count: 0, duration: 0 };
    }
  }

  const adapter = new SqliteD1Adapter(db);
  globalThis.__allerp_db = db;
  globalThis.__allerp_sqlite_adapter = adapter;
  return db;
}

// ============================================================
// 2. WebSocket 실시간 허브 (/api/realtime/ws)
// ============================================================
function initWebSocketHub(server, db) {
  const wss = new WebSocketServer({ noServer: true });
  const socketAttachments = new WeakMap();
  const roomAclCache = new Map();
  const ROOM_ACL_TTL_MS = 60 * 1000;

  function parseCookies(cookieHeader) {
    if (!cookieHeader) return {};
    return cookieHeader.split(';').reduce((acc, part) => {
      const [name, ...value] = part.trim().split('=');
      if (!name) return acc;
      acc[name] = decodeURIComponent(value.join('='));
      return acc;
    }, {});
  }

  function parseMembers(raw) {
    let parsed = raw;
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) return [];
      try { parsed = JSON.parse(trimmed); } catch { parsed = [trimmed]; }
    }
    if (Array.isArray(parsed)) return parsed.map((m) => String(m ?? '').trim()).filter(Boolean);
    if (parsed && typeof parsed === 'object') return Object.values(parsed).map((m) => String(m ?? '').trim()).filter(Boolean);
    return [];
  }

  function canAccessRoom(userId, roomId) {
    const uid = String(userId || '').trim();
    const rid = String(roomId || '').trim();
    if (!uid || !rid) return false;

    const cacheKey = `${uid}\n${rid}`;
    const now = Date.now();
    const cached = roomAclCache.get(cacheKey);
    if (cached && now - cached.at < ROOM_ACL_TTL_MS) return cached.allowed;

    let allowed = false;
    try {
      const row = db
        .prepare('SELECT type, members FROM chat_rooms WHERE id = ? LIMIT 1')
        .get(rid);

      if (row) {
        allowed =
          String(row.type ?? '').trim() === 'notice' ||
          parseMembers(row.members).some((m) => m === uid);
      }
    } catch (err) {
      console.error('[WebSocket] Room membership check failed:', err);
      return false;
    }

    roomAclCache.set(cacheKey, { allowed, at: now });
    if (roomAclCache.size > 2000) roomAclCache.clear();
    return allowed;
  }

  function verifyToken(token) {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const [payloadB64, sigB64] = parts;
    const secret = String(process.env.SESSION_SECRET || 'dev-only-session-secret-change-this').trim();

    try {
      const expectedSig = crypto
        .createHmac('sha256', secret)
        .update(payloadB64)
        .digest('base64url');

      if (!crypto.timingSafeEqual(Buffer.from(sigB64), Buffer.from(expectedSig))) {
        return null;
      }

      const rawPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      if (rawPayload.exp && rawPayload.exp < Math.floor(Date.now() / 1000)) {
        return null;
      }
      return rawPayload;
    } catch {
      return null;
    }
  }

  server.on('upgrade', async (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname !== '/api/realtime/ws') return;

    const cookies = parseCookies(request.headers.cookie);
    const token = cookies['erp_session'];

    const payload = verifyToken(token);
    const user = payload?.user;
    const userId = String(user?.id || user?.user_id || user?.employee_no || user?.login_id || payload?.sub || payload?.id || '').trim();
    const userName = String(user?.name || payload?.name || '사용자').trim();

    if (!userId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      socketAttachments.set(ws, {
        userId,
        userName,
        subscriptions: [],
        connectedAt: Date.now(),
        lastSeenAt: Date.now(),
        isAlive: true,
      });
      setupWs(ws);
    });
  });

  function setupWs(ws) {
    ws.on('error', (err) => {
      console.error('[WebSocket] Socket error:', err.message);
    });

    ws.on('pong', () => {
      const attr = socketAttachments.get(ws);
      if (attr) attr.isAlive = true;
    });

    ws.on('message', (data) => {
      try {
        const payload = JSON.parse(data.toString('utf8'));
        const attr = socketAttachments.get(ws);
        if (!attr) return;
        attr.lastSeenAt = Date.now();
        attr.isAlive = true;

        if (payload.type === 'ping') {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'pong', at: payload.at, serverTime: new Date().toISOString() }));
          }
          return;
        }

        if (payload.type === 'subscribe') {
          const channels = Array.isArray(payload.channels) ? payload.channels : [];
          // 방 단위 채널은 멤버십 검증
          const allowedChannels = channels.filter((ch) => {
            const match = /^chat_messages:room_id=eq\.(.+)$/.exec(ch) || /^messages:room_id=eq\.(.+)$/.exec(ch);
            if (!match) return true;
            return canAccessRoom(attr.userId, match[1]);
          });
          attr.subscriptions = allowedChannels;
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ready', serverTime: new Date().toISOString() }));
          }
          return;
        }

        if (payload.type === 'typing:start' || payload.type === 'typing:stop') {
          const isTyping = payload.type === 'typing:start';
          const roomId = String(payload.roomId || '').trim();
          if (!roomId || !canAccessRoom(attr.userId, roomId)) return;

          // 해당 방 멤버에게만 브로드캐스트 (전역 브로드캐스트 차단)
          for (const client of wss.clients) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              const clientAttr = socketAttachments.get(client);
              if (clientAttr && canAccessRoom(clientAttr.userId, roomId)) {
                client.send(JSON.stringify({
                  type: 'typing',
                  roomId,
                  userId: attr.userId,
                  userName: attr.userName,
                  typing: isTyping,
                  serverTime: new Date().toISOString(),
                }));
              }
            }
          }
          return;
        }

        if (payload.type === 'signal') {
          const channels = Array.isArray(payload.channels) ? payload.channels : [];
          broadcastChange(channels, payload.payload, ws);
        }
      } catch (err) {
        console.error('[WebSocket] Message error:', err);
      }
    });
  }

  function broadcastChange(channels, payloadData, senderWs) {
    const msg = JSON.stringify({
      type: 'change',
      channels,
      payload: payloadData,
      serverTime: new Date().toISOString(),
    });

    for (const client of wss.clients) {
      if (senderWs && client === senderWs) continue;
      if (client.readyState !== WebSocket.OPEN) continue;
      const attr = socketAttachments.get(client);
      const hasSub = (channels || []).some((ch) => attr?.subscriptions?.includes(ch));
      if (hasSub) {
        client.send(msg);
      }
    }
  }

  // 30초 주기 Heartbeat 핑퐁 타이머 (좀비 커넥션 정리)
  const heartbeatInterval = setInterval(() => {
    for (const ws of wss.clients) {
      const attr = socketAttachments.get(ws);
      if (!attr) continue;
      if (attr.isAlive === false) {
        ws.terminate();
        continue;
      }
      attr.isAlive = false;
      ws.ping();
    }
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  globalThis.__allerp_realtime_hub = { broadcastChange };
  console.log('[server] WebSocket Hub mounted on /api/realtime/ws');
}

// ============================================================
// 3. Cron 스케줄러 (KST 타임존 고정)
// ============================================================
function initCronScheduler(serverPort) {
  const secret = String(process.env.CRON_SECRET || 'dev-only-cron-secret-change-this').trim();
  const baseUrl = `http://127.0.0.1:${serverPort}`;

  const CRONS = {
    // 1분마다: 채팅 푸시 고속 디스패치
    '*/1 * * * *': ['/api/cron/chat-push-dispatch'],
    // KST 00:00 (자정): DB 백업, 결근 자동 생성, 채팅 보존 주기 정리
    '0 0 * * *': ['/api/cron/backup', '/api/cron/absent-auto-create', '/api/cron/chat-retention'],
    // KST 03:00 (새벽): 푸시 구독 정리
    '0 3 * * *': ['/api/cron/push-subscription-cleanup'],
    // KST 09:00 (아침): 생일/연차/급여/인사발령/미읽음 알림 발송
    '0 9 * * *': [
      '/api/cron/unread-notification-repush',
      '/api/cron/leave-notice-announcements',
      '/api/cron/birthday-announcements',
      '/api/cron/annual-leave-accrual',
      '/api/cron/annual-leave-promotion',
      '/api/cron/annual-leave-expiry',
      '/api/cron/substitute-holiday',
      '/api/cron/payroll-notice',
      '/api/cron/appointment-apply',
    ],
  };

  for (const [expr, routes] of Object.entries(CRONS)) {
    cron.schedule(
      expr,
      async () => {
        for (const route of routes) {
          try {
            const startTime = Date.now();
            const res = await fetch(`${baseUrl}${route}`, {
              headers: { authorization: `Bearer ${secret}`, 'x-scheduled-cron': expr },
            });
            const duration = Date.now() - startTime;
            console.log(`[cron ${expr}] ✔ ${route} (${res.status} in ${duration}ms)`);
          } catch (err) {
            console.error(`[cron ${expr}] ✖ ${route} failed:`, err.message);
          }
        }
      },
      { timezone: 'Asia/Seoul' }
    );
  }
  console.log('[server] Cron Scheduler registered (4 active schedules, timezone: Asia/Seoul).');
}

// ============================================================
// 4. 메인 서버 기동
// ============================================================
async function start() {
  console.log('====================================================');
  console.log(` Starting AllERP Server on http://${hostname}:${port}`);
  console.log(` Database: ${dbPath}`);
  console.log('====================================================');

  const db = initSqliteDatabase();

  const app = next({ dev, hostname, port, dir: __dirname });
  const handle = app.getRequestHandler();
  await app.prepare();

  const server = http.createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (err) {
      console.error('[server] Request error:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  initWebSocketHub(server, db);

  server.listen(port, hostname, () => {
    console.log(`[server] ✔ AllERP Web App: http://${hostname}:${port}`);
    console.log(`[server] ✔ Health Check: http://${hostname}:${port}/api/health`);

    if (process.env.DISABLE_CRON !== 'true') {
      initCronScheduler(port);
    }
  });

  const shutdown = () => {
    console.log('\n[server] Shutting down AllERP Server...');
    server.close(() => {
      try { db.close(); } catch {}
      console.log('[server] Server closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error('[server] Startup error:', err);
  process.exit(1);
});
