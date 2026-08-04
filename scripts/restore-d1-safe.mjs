import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { refuseArchivedScript } from './_archived-guard.mjs';

refuseArchivedScript({
  name: 'restore-d1-safe.mjs',
  what: '덤프에서 위험 구문을 걸러낸 뒤 D1 에 복원한다',
  risk: '대상 DB 의 기존 데이터와 충돌하거나 덮어쓴다',
  insteadUse: '관리자 화면의 복원 기능 또는 scripts/run-backup-now.mjs 로 받은 최신 백업을 사용하세요.',
});

delete process.env.CLOUDFLARE_API_TOKEN;

function runWrangler(cmd) {
  return execSync(`cmd.exe /c "${cmd}"`, {
    env: { ...process.env, CLOUDFLARE_API_TOKEN: undefined },
    encoding: 'utf-8',
    maxBuffer: 1024 * 1024 * 100
  });
}

console.log('1. Applying D1 migrations to create all tables...');
try {
  const migOut = runWrangler('npx wrangler d1 migrations apply DB --remote');
  console.log('Migration Result:\n', migOut);
} catch (e) {
  console.log('Migration output/error:', e.stdout || e.message);
}

console.log('2. Preparing data-only SQL script for restore...');
const dumpPath = path.join('backups', 'pchos-d1-dump.sql');
const dumpSql = fs.readFileSync(dumpPath, 'utf-8');

// Replace CREATE TABLE IF NOT EXISTS or ignore existing tables, OR wrap with transaction
// In D1 dump, CREATE TABLE without IF NOT EXISTS might fail if migration already created them.
// Convert 'CREATE TABLE ' -> 'CREATE TABLE IF NOT EXISTS '
const safeSql = dumpSql.replace(/^CREATE TABLE /gm, 'CREATE TABLE IF NOT EXISTS ');
const safeSqlPath = path.join('backups', 'pchos-d1-dump-safe.sql');
fs.writeFileSync(safeSqlPath, safeSql, 'utf-8');

console.log('3. Executing safe D1 restore...');
try {
  const restoreOut = runWrangler(`npx wrangler d1 execute pchos-d1 --remote --file=${safeSqlPath}`);
  console.log('Restore Output:\n', restoreOut);
} catch (e) {
  // 마이그레이션 단계(위)는 테이블이 이미 있으면 실패해도 진행이 맞지만,
  // 데이터 복원 실패는 그대로 두면 행이 빠진 DB 를 성공으로 넘기게 된다.
  console.error('🛑 RESTORE FAILED:', e.stdout || e.message);
  process.exit(1);
}
