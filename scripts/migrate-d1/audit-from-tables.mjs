// ============================================================
// audit-from-tables.mjs
// 클라이언트/코드 전체의 .from('테이블') 호출을 수집해
// POLICY_REGISTRY에 미등록인 테이블을 전수 도출.
// 미등록 테이블은 D1 컷오버 시 403 "Table not allowed".
//
// 실행: node scripts/migrate-d1/audit-from-tables.mjs
// ============================================================
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(import.meta.dirname, '..', '..');

// 1. policies.ts 등록 테이블 추출
const pol = readFileSync(join(REPO, 'lib/db/auth/policies.ts'), 'utf8');
const registered = new Set();
for (const m of pol.matchAll(/PUBLIC_ALL\('([a-z_][a-z0-9_]*)'\)/g)) registered.add(m[1]);
for (const m of pol.matchAll(/\btable:\s*'([a-z_][a-z0-9_]*)'/g)) registered.add(m[1]);
for (const m of pol.matchAll(/^\s+'([a-z_][a-z0-9_]*)',/gm)) registered.add(m[1]);

// 2. 코드베이스 .from('X') 수집
const fromTables = new Map(); // table -> 첫 사용 파일
const fromRe = /\.from\(\s*[`'"]([a-zA-Z_][a-zA-Z0-9_]*)[`'"]\s*\)/g;
function walk(dir) {
  for (const e of readdirSync(dir)) {
    if (['node_modules', '.next', '.open-next', '.git', '.wrangler'].includes(e)) continue;
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) { walk(p); continue; }
    if (!/\.(ts|tsx)$/.test(e)) continue;
    const txt = readFileSync(p, 'utf8');
    for (const m of txt.matchAll(fromRe)) {
      if (!fromTables.has(m[1])) fromTables.set(m[1], p.replace(REPO, '').replace(/\\/g, '/'));
    }
  }
}
walk(join(REPO, 'app'));
walk(join(REPO, 'lib'));

// 3. diff
const missing = [...fromTables.keys()].filter((t) => !registered.has(t)).sort();
console.log(`POLICY_REGISTRY 등록 테이블: ${registered.size}`);
console.log(`코드 내 .from() 테이블:     ${fromTables.size}`);
console.log(`미등록(누락):              ${missing.length}`);
console.log('');
for (const t of missing) console.log(`  ${t}   (예: ${fromTables.get(t)})`);
