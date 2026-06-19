// ============================================================
// verify-counts.mjs
// 로컬 D1에 백필된 125개 테이블의 행 수가 Supabase와 일치하는지 대조.
// 불일치 = 백필 중 행 누락(데이터 손실).
//
// 실행: node scripts/backfill-d1/verify-counts.mjs
// ============================================================
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, makeSupabase } from './run-helpers.mjs';
import { TABLE_DEFS } from './tables-full.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dir, '../..');
const tmpSql = join(repoRoot, 'tmp', 'verify_counts.sql');

await loadEnv();
const sb = makeSupabase();
const names = Object.keys(TABLE_DEFS);

// 1. Supabase 행 수 (head count)
const sbCounts = {};
for (const t of names) {
  const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true });
  sbCounts[t] = error ? -1 : (count ?? 0);
}

// 2. D1 행 수 — 서브쿼리 30개씩 배치. wrangler는 --file 원격 실행 시 결과 대신
//    요약만 반환하므로 반드시 --command 사용. 테이블명은 단순 식별자라 무인용.
const d1Mode = process.argv.includes('--remote') ? '--remote' : '--local';
const d1Counts = {};
const BATCH = 30;
for (let i = 0; i < names.length; i += BATCH) {
  const batch = names.slice(i, i + BATCH);
  const expr = batch.map((t) => `(SELECT count(*) FROM ${t}) AS ${t}`).join(', ');
  const raw = execSync(
    `npx wrangler d1 execute pchos-d1 ${d1Mode} --json --command "SELECT ${expr}"`,
    { encoding: 'utf8', cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 },
  );
  const parsed = JSON.parse(raw.slice(raw.indexOf('[')));
  Object.assign(d1Counts, parsed[0]?.results?.[0] ?? {});
}

// 3. 대조
let mismatch = 0;
let sbTotal = 0;
let d1Total = 0;
for (const t of names) {
  const s = sbCounts[t];
  const d = d1Counts[t] ?? 0;
  if (s >= 0) sbTotal += s;
  d1Total += d;
  if (s !== d) {
    console.log(`✗ ${t}: Supabase ${s} vs D1 ${d}`);
    mismatch += 1;
  }
}

console.log('─'.repeat(60));
console.log(`Supabase 합계: ${sbTotal.toLocaleString()}행`);
console.log(`로컬 D1 합계:  ${d1Total.toLocaleString()}행`);
console.log(mismatch === 0 ? '✓ 125개 테이블 행 수 전부 일치 — 행 누락 없음' : `✗ ${mismatch}개 테이블 불일치`);
process.exit(mismatch === 0 ? 0 : 1);
