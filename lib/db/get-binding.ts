// ============================================================
// lib/db/get-binding.ts
// Next.js API route에서 Cloudflare D1 binding을 가져오는 헬퍼.
//
// OpenNext on Cloudflare Workers는 getCloudflareContext()로 env에 접근.
// 로컬 개발(`next dev`)에서는 Cloudflare context가 없으므로 undefined 반환.
// ============================================================

import type { D1Database } from '@cloudflare/workers-types';
import { getDataBackend, type DataBackend } from './types';

// CloudflareEnv 타입 보강 — wrangler.toml의 [[d1_databases]] binding과 [vars]
declare global {
  interface CloudflareEnv {
    DB?: D1Database;
    DATA_BACKEND?: string;
  }
}

let cachedLocalD1: D1Database | undefined = undefined;

function getLocalD1Mock(): D1Database | undefined {
  if (cachedLocalD1) return cachedLocalD1;

  try {
    const fs = eval("require('fs')");
    const path = eval("require('path')");
    const Database = eval("require('better-sqlite3')");

    const dir = path.join(process.cwd(), '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
    if (!fs.existsSync(dir)) {
      console.warn('[getLocalD1Mock] wrangler local D1 state directory not found at:', dir);
      return undefined;
    }

    const files = fs.readdirSync(dir);
    const sqliteFile = files.find((f: string) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
    if (!sqliteFile) {
      console.warn('[getLocalD1Mock] No .sqlite file found in:', dir);
      return undefined;
    }

    const dbPath = path.join(dir, sqliteFile);
    console.log('[getLocalD1Mock] Connecting to local D1 SQLite database:', dbPath);

    class MockD1Database {
      private db: any;

      constructor(dbPath: string) {
        this.db = new Database(dbPath);
        this.db.pragma('foreign_keys = ON');
      }

      prepare(query: string) {
        return new MockD1PreparedStatement(this.db, query);
      }

      async batch(statements: any[]) {
        const results = [];
        for (const stmt of statements) {
          results.push(await stmt.all());
        }
        return results;
      }

      async exec(query: string) {
        this.db.exec(query);
        return { count: 0, duration: 0 };
      }
    }

    class MockD1PreparedStatement {
      private db: any;
      private query: string;
      private params: any[] = [];

      constructor(db: any, query: string) {
        this.db = db;
        this.query = query;
      }

      bind(...params: any[]) {
        this.params = params.map((p) => {
          if (typeof p === 'boolean') return p ? 1 : 0;
          return p;
        });
        return this;
      }

      async all() {
        const stmt = this.db.prepare(this.query);
        const results = stmt.all(...this.params);
        return {
          results,
          success: true,
          meta: { duration: 0, changes: 0, rows_read: results.length, rows_written: 0 },
        };
      }

      async run() {
        const stmt = this.db.prepare(this.query);
        const info = stmt.run(...this.params);
        return {
          success: true,
          meta: { duration: 0, changes: info.changes, rows_read: 0, rows_written: info.changes },
        };
      }

      async first() {
        const stmt = this.db.prepare(this.query);
        const row = stmt.get(...this.params);
        return row || null;
      }

      async raw() {
        const stmt = this.db.prepare(this.query);
        return stmt.raw().all(...this.params);
      }
    }

    cachedLocalD1 = new MockD1Database(dbPath) as unknown as D1Database;
    return cachedLocalD1;
  } catch (err) {
    console.error('[getLocalD1Mock] Failed to initialize mock D1 database:', err);
    return undefined;
  }
}

/**
 * D1 binding을 가져옴. Workers 외 환경이거나 binding이 없으면 undefined.
 *
 * Next.js API route에서 사용:
 *   const d1 = await getD1Binding();
 *   if (d1) { ... use d1 ... }
 */
export async function getD1Binding(): Promise<D1Database | undefined> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const { env } = await getCloudflareContext({ async: true });
    if (env.DB) return env.DB;
  } catch {
    // ignore
  }

  if (process.env.NODE_ENV === 'development') {
    return getLocalD1Mock();
  }

  return undefined;
}

/**
 * 현재 백엔드 모드 — wrangler.toml [vars].DATA_BACKEND 또는 process.env.DATA_BACKEND
 *
 * 동기 호출이 가능하면 그쪽을 우선 시도하고, async context만 가능하면 그것 사용.
 */
export async function resolveDataBackend(): Promise<DataBackend> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const { env } = await getCloudflareContext({ async: true });
    const v = env.DATA_BACKEND;
    if (v) return getDataBackend(v);
  } catch {
    // not in Workers — fall back to process.env
  }
  return getDataBackend();
}
