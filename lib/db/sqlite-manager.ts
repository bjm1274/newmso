import 'server-only';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let globalSqliteInstance: Database.Database | null = null;

export function getDatabasePath(): string {
  if (process.env.DATABASE_PATH) {
    return process.env.DATABASE_PATH;
  }
  if (process.env.DB_PATH) {
    return process.env.DB_PATH;
  }
  const cwd = typeof process.cwd === 'function' ? process.cwd() : '.';
  return path.join(cwd, 'data', 'allerp.sqlite');
}

export function getSqliteDb(customPath?: string): Database.Database {
  if (globalSqliteInstance && !customPath) {
    return globalSqliteInstance;
  }

  const dbPath = customPath || getDatabasePath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath, {
    fileMustExist: false,
    verbose: process.env.DEBUG_SQL === 'true' ? console.log : undefined,
  });

  // 고성능 및 동시성/안정성 최적화 PRAGMA 설정
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('cache_size = -64000'); // 64MB 캐시
  db.pragma('temp_store = MEMORY');

  if (!customPath) {
    globalSqliteInstance = db;
  }

  return db;
}

export function closeSqliteDb(): void {
  if (globalSqliteInstance) {
    try {
      globalSqliteInstance.close();
    } catch {
      // ignore
    }
    globalSqliteInstance = null;
  }
}
