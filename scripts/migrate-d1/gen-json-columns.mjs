// ============================================================
// gen-json-columns.mjs
// information_schema CSV에서 jsonb/json/array(udt가 '_'로 시작) 컬럼을
// 추출해 lib/db/json-columns.ts 생성.
//
// D1(SQLite)은 이 컬럼들을 TEXT로 저장/반환하지만 Supabase 클라이언트는
// 객체/배열로 돌려준다. /api/d1/query가 반환 전 JSON.parse 해야 한다.
//
// 실행: node scripts/migrate-d1/gen-json-columns.mjs <CSV_PATH>
// ============================================================
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const OUT = join(REPO_ROOT, 'lib', 'db', 'json-columns.ts');

function parseCsv(text) {
  const rows = [];
  let i = 0, row = [], cell = '', inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQ = false; i++;
      } else { cell += c; i++; }
    } else {
      if (c === '"') { inQ = true; i++; }
      else if (c === ',') { row.push(cell); cell = ''; i++; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
      else if (c === '\r') { i++; }
      else { cell += c; i++; }
    }
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const csvPath = process.argv[2];
if (!csvPath) {
  console.error('사용: node gen-json-columns.mjs <CSV_PATH>');
  process.exit(1);
}

const text = await readFile(csvPath, 'utf8');
const rows = parseCsv(text);
rows.shift(); // 헤더

const map = {};
for (const row of rows) {
  if (row.length < 4) continue;
  const [kind, table, , infoStr] = row;
  if (kind !== 'COLUMN') continue;
  let info;
  try { info = JSON.parse(infoStr); } catch { continue; }
  const udt = String(info.udt ?? '');
  // jsonb / json / 배열(_text, _uuid, _jsonb 등) — 모두 D1에 TEXT(JSON 문자열)로 저장됨
  const isJsonLike = udt === 'jsonb' || udt === 'json' || udt.startsWith('_');
  if (!isJsonLike) continue;
  if (!map[table]) map[table] = [];
  map[table].push(info.column);
}

const tables = Object.keys(map).sort();
const lines = [
  '// ============================================================',
  '// lib/db/json-columns.ts  (자동 생성 — gen-json-columns.mjs)',
  `// 생성일: ${new Date().toISOString()}`,
  '//',
  '// Supabase jsonb/json/배열 컬럼 목록. D1(SQLite)은 TEXT로 저장/반환하므로',
  '// /api/d1/query가 반환 직전 이 컬럼들을 JSON.parse 해 객체/배열로 복원한다.',
  '// (Supabase 클라이언트가 원래 객체/배열로 돌려주던 것과 동작 일치시킴)',
  '// ============================================================',
  '',
  'export const JSON_COLUMNS: Readonly<Record<string, readonly string[]>> = {',
  ...tables.map((t) => `  ${/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t) ? t : JSON.stringify(t)}: [${map[t].map((c) => `'${c}'`).join(', ')}],`),
  '};',
  '',
];

await writeFile(OUT, lines.join('\n'), 'utf8');
console.log(`✓ ${OUT}`);
console.log(`  JSON/배열 컬럼 보유 테이블: ${tables.length}개`);
console.log(`  총 컬럼: ${Object.values(map).reduce((s, a) => s + a.length, 0)}개`);
