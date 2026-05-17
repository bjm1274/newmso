// ============================================================
// lib/db/client-local.ts
// 로컬 SQLite + Drizzle (Node.js 개발 환경 / 마이그레이션 스크립트용)
//
// Workers 런타임에서는 사용 금지 (better-sqlite3 native binding).
// 사용:
//   import { getLocalDrizzle } from '@/lib/db/client-local';
//   const db = getLocalDrizzle('./scripts/migrate-d1/output/d1_schema.sqlite');
// ============================================================

import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import * as relations from './relations';

export type LocalClient = BetterSQLite3Database<typeof schema & typeof relations>;

export function getLocalDrizzle(dbPath: string): LocalClient {
  const sqlite = new Database(dbPath);
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema: { ...schema, ...relations } });
}
