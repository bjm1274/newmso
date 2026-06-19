// ============================================================
// verify-coverage.mjs
// tables-full.mjs의 백필 정의가 D1 스키마(d1_schema_final.sql)를
// 빠짐없이 커버하는지 정적 검증. 컬럼 누락 = 백필 시 데이터 손실.
//
// 실행: node scripts/backfill-d1/verify-coverage.mjs
// ============================================================
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TABLE_DEFS, BACKFILL_ORDER_FULL } from './tables-full.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const SCHEMA = join(__dir, '../migrate-d1/output/d1_schema_final.sql');

// Supabase에 존재하지 않는 유령 테이블 — 백필 대상이 아니어야 함
const SURPLUS_11 = new Set([
  'approval_delegation', 'approval_form_types', 'asset_loan_item_settings',
  'company_seals', 'insurance_records', 'license_continuing_education',
  'login_logs', 'meeting_bookings', 'roster_approval_requests',
  'roster_policy_settings', 'roster_swap_requests',
]);

function parseSchema(sql) {
  const tables = {};
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([a-zA-Z_][a-zA-Z0-9_]*)["`]?\s*\(([\s\S]*?)\n\s*\);/g;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const cols = [];
    for (const line of m[2].split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('--')) continue;
      if (/^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK)\b/i.test(t)) continue;
      const cm = t.match(/^["`]?([a-zA-Z_][a-zA-Z0-9_]*)["`]?\s+/);
      if (cm) cols.push(cm[1]);
    }
    tables[m[1]] = cols;
  }
  return tables;
}

const schema = parseSchema(await readFile(SCHEMA, 'utf8'));
const activeTables = Object.keys(schema).filter((t) => !SURPLUS_11.has(t));
const defNames = Object.keys(TABLE_DEFS);

let issues = 0;

// 1. 125개 활성 테이블이 전부 TABLE_DEFS에 있는가
const missingDefs = activeTables.filter((t) => !TABLE_DEFS[t]);
if (missingDefs.length) {
  console.log(`✗ TABLE_DEFS 누락 ${missingDefs.length}개: ${missingDefs.join(', ')}`);
  issues += missingDefs.length;
}

// 2. TABLE_DEFS에 유령/잉여 테이블이 섞이지 않았는가
const ghostInDefs = defNames.filter((t) => SURPLUS_11.has(t) || !schema[t]);
if (ghostInDefs.length) {
  console.log(`✗ TABLE_DEFS에 유령/미존재 테이블: ${ghostInDefs.join(', ')}`);
  issues += ghostInDefs.length;
}

// 3. 각 테이블의 컬럼이 스키마와 일치하는가 (누락 = 데이터 손실)
for (const name of defNames) {
  const schemaCols = schema[name];
  if (!schemaCols) continue; // 2번에서 이미 보고
  const defCols = new Set(TABLE_DEFS[name].columns.map((c) => c.name));
  const missing = schemaCols.filter((c) => !defCols.has(c));
  const extra = [...defCols].filter((c) => !schemaCols.includes(c));
  if (missing.length || extra.length) {
    console.log(`✗ ${name}:`);
    if (missing.length) console.log(`    누락(데이터 손실 위험): ${missing.join(', ')}`);
    if (extra.length) console.log(`    잉여(D1에 없는 컬럼): ${extra.join(', ')}`);
    issues += 1;
  }
}

// 4. BACKFILL_ORDER_FULL이 TABLE_DEFS 전체를 정확히 포함하는가
const orderSet = new Set(BACKFILL_ORDER_FULL);
const notInOrder = defNames.filter((t) => !orderSet.has(t));
const dupOrder = BACKFILL_ORDER_FULL.length !== orderSet.size;
if (notInOrder.length) {
  console.log(`✗ BACKFILL_ORDER_FULL 누락: ${notInOrder.join(', ')}`);
  issues += notInOrder.length;
}
if (dupOrder) {
  console.log(`✗ BACKFILL_ORDER_FULL에 중복 항목 존재`);
  issues += 1;
}

console.log('─'.repeat(60));
console.log(`스키마 활성 테이블: ${activeTables.length}`);
console.log(`TABLE_DEFS 테이블:  ${defNames.length}`);
console.log(`BACKFILL_ORDER_FULL: ${BACKFILL_ORDER_FULL.length}`);
console.log(issues === 0 ? '✓ 검증 통과 — 컬럼 누락 없음' : `✗ 문제 ${issues}건`);
process.exit(issues === 0 ? 0 : 1);
