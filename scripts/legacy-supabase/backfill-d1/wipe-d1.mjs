// ============================================================
// wipe-d1.mjs
// 백필 대상 125개 테이블의 D1 데이터를 전부 삭제(DELETE FROM).
// dual-write 잔재/드리프트를 제거하고 fresh 재백필로 Supabase와
// 정확히 일치시키기 위함. 스키마는 유지.
//
// 실행: node scripts/backfill-d1/wipe-d1.mjs (--local|--remote) --confirm
// ============================================================
import { writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { refuseArchivedScript } from '../../_archived-guard.mjs';

refuseArchivedScript({
  name: 'legacy-supabase/backfill-d1/wipe-d1.mjs',
  what: '백필 대상 125개 테이블의 D1 데이터를 전부 DELETE 한다',
  risk: '대상 DB 의 해당 테이블이 전부 비워진다',
  insteadUse: 'Supabase 백필은 2026 D1 컷오버로 종료되었습니다. 이 절차는 더 이상 쓰이지 않습니다.',
});
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TABLE_DEFS } from './tables-full.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dir, '../..');

const mode = process.argv.includes('--remote')
  ? '--remote'
  : process.argv.includes('--local')
    ? '--local'
    : null;

if (!mode || !process.argv.includes('--confirm')) {
  console.error('사용: node scripts/backfill-d1/wipe-d1.mjs (--local|--remote) --confirm');
  process.exit(1);
}

const tables = Object.keys(TABLE_DEFS);
// FK 강제 해제 후 전 테이블 DELETE — 부모/자식 순서 무관하게 안전
const sql = 'PRAGMA foreign_keys=OFF;\n'
  + tables.map((t) => `DELETE FROM "${t}";`).join('\n') + '\n';

const tmpSql = join(repoRoot, 'tmp', 'wipe.sql');
mkdirSync(dirname(tmpSql), { recursive: true });
writeFileSync(tmpSql, sql, 'utf8');

console.log(`${tables.length}개 테이블 DELETE — ${mode}`);
execSync(`npx wrangler d1 execute pchos-d1 ${mode} --file=tmp/wipe.sql`, {
  stdio: 'inherit',
  cwd: repoRoot,
});
console.log('✓ wipe 완료');
