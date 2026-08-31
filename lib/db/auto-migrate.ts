// ============================================================
// lib/db/auto-migrate.ts
// SQLite DB 초기화 및 lib/db/migrations/ 의 0000~0028 SQL 자동 마이그레이션 러너
// ============================================================

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { getSqliteDb } from './sqlite-manager';

function stripLeadingComments(str: string): string {
  return str
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .trim();
}

function splitSqlStatements(sql: string): string[] {
  if (sql.includes('--> statement-breakpoint')) {
    return sql
      .split('--> statement-breakpoint')
      .map(stripLeadingComments)
      .filter((s) => s.length > 0);
  }
  const stripped = stripLeadingComments(sql);
  return stripped ? [stripped] : [];
}

export function runAutoMigration(customDb?: Database.Database): {
  success: boolean;
  applied: string[];
  skipped: string[];
  errors: string[];
} {
  const db = customDb || getSqliteDb();

  // 1. 마이그레이션 기록 테이블 준비
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db.prepare('SELECT name FROM _migrations').all() as Array<{ name: string }>;
  const appliedSet = new Set(appliedRows.map((r) => r.name));

  // 2. 마이그레이션 디렉터리 경로 탐색
  const candidates = [
    path.join(process.cwd(), 'lib', 'db', 'migrations'),
    path.join(__dirname, 'migrations'),
    path.join(process.cwd(), 'dist', 'lib', 'db', 'migrations'),
  ];

  let migrationsDir = '';
  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      migrationsDir = dir;
      break;
    }
  }

  if (!migrationsDir) {
    console.warn('[auto-migrate] Migrations directory not found. Searched in:', candidates);
    return { success: false, applied: [], skipped: [], errors: ['Migrations directory not found'] };
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];
  // 마이그레이션 중 외래키 제약조건 및 ALTER TABLE 락 방지를 위해 일시 해제
  db.pragma('foreign_keys = OFF');

  try {
    for (const file of files) {
      if (appliedSet.has(file)) {
        skipped.push(file);
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, 'utf8');
      const statements = splitSqlStatements(sqlContent);

      try {
        console.log(`[auto-migrate] Applying migration: ${file}...`);
        db.transaction(() => {
          for (const stmt of statements) {
            if (!stmt) continue;
            try {
              db.exec(stmt);
            } catch (stmtErr: any) {
              const msg = stmtErr?.message || '';
              if (msg.includes('duplicate column name') || msg.includes('already exists')) {
                // 이미 적용된 컬럼 또는 인덱스 - 안전하게 스킵
                continue;
              }
              throw stmtErr;
            }
          }
          db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(
            file,
            new Date().toISOString(),
          );
        })();
        applied.push(file);
        console.log(`[auto-migrate] Successfully applied: ${file}`);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[auto-migrate] Failed to apply ${file}:`, errMsg);
        errors.push(`${file}: ${errMsg}`);
        break; // 실패 시 이후 마이그레이션 중단
      }
    }
  } finally {
    db.pragma('foreign_keys = ON');
  }

  return {
    success: errors.length === 0,
    applied,
    skipped,
    errors,
  };
}
