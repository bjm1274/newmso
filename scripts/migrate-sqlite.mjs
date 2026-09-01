/**
 * scripts/migrate-sqlite.mjs
 *
 * 로컬/서버 SQLite DB 스키마 마이그레이션 실행 CLI 도구.
 * lib/db/migrations 의 모든 .sql 파일을 순차적으로 적용합니다.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const dbPath =
  process.env.DATABASE_PATH ||
  process.env.DB_PATH ||
  path.join(rootDir, 'data', 'allerp.sqlite');

const migrationsDir = path.join(rootDir, 'lib', 'db', 'migrations');

console.log(`[migrate-sqlite] Database path: ${dbPath}`);
console.log(`[migrate-sqlite] Migrations directory: ${migrationsDir}`);

const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = OFF'); // 마이그레이션 중 외래키 임시 비활성화

db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
`);

const appliedRows = db.prepare('SELECT name FROM _migrations').all();
const appliedSet = new Set(appliedRows.map((r) => r.name));

const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

console.log(`[migrate-sqlite] Found ${files.length} migration files in total.`);

function stripLeadingComments(str) {
  return str
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .trim();
}

function splitSqlStatements(sql) {
  if (sql.includes('--> statement-breakpoint')) {
    return sql
      .split('--> statement-breakpoint')
      .map(stripLeadingComments)
      .filter((s) => s.length > 0);
  }
  const stripped = stripLeadingComments(sql);
  return stripped ? [stripped] : [];
}

let appliedCount = 0;
let skippedCount = 0;

for (const file of files) {
  if (appliedSet.has(file)) {
    skippedCount++;
    continue;
  }

  const filePath = path.join(migrationsDir, file);
  const sqlContent = fs.readFileSync(filePath, 'utf8');
  const statements = splitSqlStatements(sqlContent);

  console.log(`[migrate-sqlite] Applying: ${file} (${statements.length} statements)...`);
  try {
    db.transaction(() => {
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        if (!stmt) continue;
        try {
          db.exec(stmt);
        } catch (stmtErr) {
          const msg = stmtErr.message || '';
          if (
            msg.includes('duplicate column name') ||
            msg.includes('already exists')
          ) {
            console.log(`  (Note: ${msg} - safely skipped)`);
            continue;
          }
          console.error(`[migrate-sqlite] Error at statement #${i + 1} in ${file}:`);
          console.error(stmt.slice(0, 300));
          throw stmtErr;
        }
      }
      db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(
        file,
        new Date().toISOString(),
      );
    })();
    appliedCount++;
    console.log(`[migrate-sqlite] ✔ Applied: ${file}`);
  } catch (err) {
    console.error(`[migrate-sqlite] ✖ Error in ${file}:`, err.message);
    process.exit(1);
  }
}

db.pragma('foreign_keys = ON');
console.log(
  `[migrate-sqlite] Migration completed! Applied: ${appliedCount}, Skipped: ${skippedCount}, Total: ${files.length}`,
);
db.close();
