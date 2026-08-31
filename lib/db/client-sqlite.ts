// ============================================================
// lib/db/client-sqlite.ts
// better-sqlite3 기반의 고성능 SQLite 클라이언트 및 D1 호환 어댑터.
//
// Node.js Standalone, Docker 및 로컬 환경에서 Cloudflare D1 바인딩 없이
// 동일한 API 인터페이스(Drizzle ORM 및 원시 쿼리)를 투명하게 실행.
// ============================================================

import 'server-only';
import type { D1Database, D1PreparedStatement, D1Result, D1ExecResult } from '@cloudflare/workers-types';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/d1';
import { getSqliteDb } from './sqlite-manager';
import * as schema from './schema';
import * as relations from './relations';

export class SqliteD1PreparedStatement {
  private db: Database.Database;
  private query: string;
  private params: unknown[] = [];

  constructor(db: Database.Database, query: string) {
    this.db = db;
    this.query = query;
  }

  bind(...params: unknown[]): D1PreparedStatement {
    const next = new SqliteD1PreparedStatement(this.db, this.query);
    next.params = params.map((p) => {
      if (typeof p === 'boolean') return p ? 1 : 0;
      if (p instanceof Date) return p.toISOString();
      if (p === undefined) return null;
      return p;
    });
    return next as unknown as D1PreparedStatement;
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const startTime = Date.now();
    const stmt = this.db.prepare(this.query);
    const results = stmt.all(...this.params) as T[];
    const duration = Date.now() - startTime;
    return {
      results,
      success: true,
      meta: {
        duration,
        changes: 0,
        last_row_id: 0,
        rows_read: results.length,
        rows_written: 0,
        served_by: 'local-better-sqlite3',
        size_after: 0,
      } as any,
    };
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const startTime = Date.now();
    const isSelect = /^\s*(SELECT|PRAGMA|WITH|EXPLAIN)\b/i.test(this.query);
    const stmt = this.db.prepare(this.query);
    if (isSelect) {
      const results = stmt.all(...this.params) as T[];
      const duration = Date.now() - startTime;
      return {
        results,
        success: true,
        meta: {
          duration,
          changes: 0,
          last_row_id: 0,
          rows_read: results.length,
          rows_written: 0,
          served_by: 'local-better-sqlite3',
          size_after: 0,
        } as any,
      };
    }

    const info = stmt.run(...this.params);
    const duration = Date.now() - startTime;
    return {
      results: [] as T[],
      success: true,
      meta: {
        duration,
        changes: info.changes,
        last_row_id: Number(info.lastInsertRowid),
        rows_read: 0,
        rows_written: info.changes,
        served_by: 'local-better-sqlite3',
        size_after: 0,
      } as any,
    };
  }

  async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
    const stmt = this.db.prepare(this.query);
    const row = stmt.get(...this.params) as Record<string, unknown> | undefined;
    if (!row) return null;
    if (colName) return (row[colName] as T) ?? null;
    return row as T;
  }

  async raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<any> {
    const stmt = this.db.prepare(this.query);
    const rows = stmt.raw().all(...this.params) as T[];
    if (options?.columnNames) {
      const colNames = stmt.columns().map((c) => c.name);
      return [colNames, ...rows];
    }
    return rows;
  }
}

export class SqliteD1Adapter {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getSqliteDb();
  }

  prepare(query: string): D1PreparedStatement {
    return new SqliteD1PreparedStatement(this.db, query) as unknown as D1PreparedStatement;
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const results: D1Result<T>[] = [];
    const transaction = this.db.transaction(() => {
      for (const stmt of statements) {
        const customStmt = stmt as unknown as SqliteD1PreparedStatement;
        const prep = (customStmt as any).db.prepare((customStmt as any).query);
        const params = (customStmt as any).params;
        const isSelect = /^\s*(SELECT|PRAGMA|WITH|EXPLAIN)\b/i.test((customStmt as any).query);
        if (isSelect) {
          const rows = prep.all(...params);
          results.push({
            results: rows,
            success: true,
            meta: { duration: 0, changes: 0, rows_read: rows.length, rows_written: 0 } as any,
          });
        } else {
          const info = prep.run(...params);
          results.push({
            results: [],
            success: true,
            meta: { duration: 0, changes: info.changes, rows_read: 0, rows_written: info.changes } as any,
          });
        }
      }
    });

    transaction();
    return results;
  }

  async exec(query: string): Promise<D1ExecResult> {
    const startTime = Date.now();
    this.db.exec(query);
    return {
      count: 0,
      duration: Date.now() - startTime,
    };
  }

  getNativeDb(): Database.Database {
    return this.db;
  }
}

let cachedAdapter: SqliteD1Adapter | null = null;

export function getSqliteD1Adapter(customDb?: Database.Database): D1Database {
  if (customDb) {
    return new SqliteD1Adapter(customDb) as unknown as D1Database;
  }
  if (!cachedAdapter) {
    cachedAdapter = new SqliteD1Adapter();
    if (typeof globalThis !== 'undefined') {
      (globalThis as any).__allerp_sqlite_adapter = cachedAdapter;
    }
  }
  return cachedAdapter as unknown as D1Database;
}

export function getSqliteDrizzle(customDb?: Database.Database) {
  const adapter = getSqliteD1Adapter(customDb);
  return drizzle(adapter, { schema: { ...schema, ...relations } });
}
