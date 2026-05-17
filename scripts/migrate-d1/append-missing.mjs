#!/usr/bin/env node
// ============================================================
// append-missing.mjs
// information_schema CSV → 누락 테이블 D1 DDL 생성
//
// 사용:
//   node scripts/migrate-d1/append-missing.mjs <CSV_PATH>
//
// 출력:
//   scripts/migrate-d1/output/d1_schema_missing.sql
// ============================================================

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const OUT = join(REPO_ROOT, 'scripts', 'migrate-d1', 'output', 'd1_schema_missing.sql');

const EXCLUDED_TABLES = new Set([
  'attendances_20260513_bulk_backup', // 사고 임시 백업
]);

// ─────────────────────────────────────────────────────────────
// CSV 파서 (RFC 4180 호환, double-quote escape 처리)
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// PostgreSQL udt → SQLite type
// ─────────────────────────────────────────────────────────────
function udtToSqlite(udt, type) {
  if (!udt) {
    // udt 없으면 type 폴백
    if (/character varying|varchar|character|text|date|time/i.test(type || '')) return 'TEXT';
    if (/integer|smallint|bigint|serial/i.test(type || '')) return 'INTEGER';
    if (/numeric|decimal|real|double/i.test(type || '')) return 'REAL';
    if (/bool/i.test(type || '')) return 'INTEGER';
    if (/json/i.test(type || '')) return 'TEXT';
    return 'TEXT';
  }
  if (udt.startsWith('_')) return 'TEXT'; // array (_text, _uuid 등)
  switch (udt) {
    case 'uuid': case 'text': case 'date': case 'timestamptz':
    case 'timestamp': case 'time': case 'timetz': case 'varchar':
    case 'bpchar': case 'name': case 'inet': case 'cidr':
    case 'character varying': case 'character':
      return 'TEXT';
    case 'int2': case 'int4': case 'int8': case 'oid':
      return 'INTEGER';
    case 'numeric': case 'float4': case 'float8': case 'money':
      return 'REAL';
    case 'bool':
      return 'INTEGER';
    case 'jsonb': case 'json':
      return 'TEXT';
    case 'bytea':
      return 'BLOB';
    default:
      if (/integer|smallint|bigint|serial/i.test(type)) return 'INTEGER';
      if (/numeric|decimal|real|double/i.test(type)) return 'REAL';
      if (/bool/i.test(type)) return 'INTEGER';
      if (/character|varying|text/i.test(type)) return 'TEXT';
      return 'TEXT';
  }
}

// ─────────────────────────────────────────────────────────────
// PostgreSQL default → SQLite default
// ─────────────────────────────────────────────────────────────
function defaultToSqlite(def) {
  if (def == null) return null;
  const s = String(def);
  // UUID 생성 함수는 SQLite에 없음 → 앱에서 채움
  if (/gen_random_uuid|uuid_generate_v4/i.test(s)) return null;
  // now() → CURRENT_TIMESTAMP
  if (/^(now\(\)|CURRENT_TIMESTAMP)/i.test(s)) return 'CURRENT_TIMESTAMP';
  // 'value'::cast 패턴
  const castMatch = s.match(/^('(?:[^']|'')*')::[\w\s\[\]]+$/);
  if (castMatch) return castMatch[1];
  // '{}'::jsonb, '[]'::jsonb
  if (/^'(\{\}|\[\])'::(jsonb?|text\[\])/.test(s)) {
    const m = s.match(/^'([^']*)'/);
    return m ? `'${m[1]}'` : null;
  }
  // 빈 배열 '{}'::text[]
  if (/^'\{\}'::\w+\[\]/.test(s)) return "'[]'";
  // 숫자 리터럴
  if (/^-?\d+(\.\d+)?$/.test(s)) return s;
  // boolean
  if (s === 'true') return '1';
  if (s === 'false') return '0';
  // 그대로 인용된 string
  if (/^'.*'$/.test(s)) return s;
  return null;
}

// ─────────────────────────────────────────────────────────────
// constraint def → SQLite 호환
// ─────────────────────────────────────────────────────────────
function constraintToSqlite(def) {
  let d = def;

  // 1단계: 모든 타입 캐스트 제거 (multi-word 타입 + array marker 포함)
  //   '::character varying', '::text[]', '::int', '::timestamp with time zone' 등
  d = d.replace(
    /::\s*(?:character\s+varying|double\s+precision|timestamp\s+with(?:out)?\s+time\s+zone|time\s+with(?:out)?\s+time\s+zone|\w+)(?:\s*\[\s*\])?/gi,
    '',
  );

  // 2단계: ARRAY[...] → (...)
  d = d.replace(/ARRAY\[([^\]]+)\]/g, '($1)');

  // 3단계: = ANY (...) → IN (...) - 괄호 균형 매칭으로 정확하게
  d = transformAnyToIn(d);

  // 4단계: public. schema prefix 제거
  d = d.replace(/\bpublic\./g, '');

  return d;
}

function transformAnyToIn(sql) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const head = sql.substring(i, i + 20);
    const m = head.match(/^=\s*ANY\s*\(/);
    if (m) {
      const start = i + m[0].length;
      // 균형 잡힌 ) 찾기
      let depth = 1;
      let end = start;
      while (end < sql.length && depth > 0) {
        if (sql[end] === '(') depth++;
        else if (sql[end] === ')') {
          depth--;
          if (depth === 0) break;
        }
        end++;
      }
      let inner = sql.substring(start, end).trim();
      // 잉여 괄호 벗기기 (이중·삼중 괄호 케이스)
      while (inner.startsWith('(') && inner.endsWith(')')) {
        // 매칭되는 한 쌍인지 확인
        let d = 0, balanced = true;
        for (let k = 0; k < inner.length; k++) {
          if (inner[k] === '(') d++;
          else if (inner[k] === ')') d--;
          if (d === 0 && k < inner.length - 1) { balanced = false; break; }
        }
        if (balanced) inner = inner.slice(1, -1).trim();
        else break;
      }
      out += ` IN (${inner})`;
      i = end + 1;
    } else {
      out += sql[i++];
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────────────────
async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('사용: node append-missing.mjs <CSV_PATH>');
    process.exit(1);
  }

  const text = await readFile(csvPath, 'utf8');
  const rows = parseCsv(text);
  rows.shift(); // 헤더 제거

  // 그룹화
  const tables = new Map();
  for (const row of rows) {
    if (row.length < 4) continue;
    const [kind, name, sort, infoStr] = row;
    if (EXCLUDED_TABLES.has(name)) continue;
    if (!tables.has(name)) tables.set(name, { columns: [], constraints: [], indexes: [] });
    let info;
    try { info = JSON.parse(infoStr); } catch { continue; }
    const t = tables.get(name);
    if (kind === 'COLUMN') t.columns.push({ sort, ...info });
    else if (kind === 'CONSTRAINT') t.constraints.push({ cname: sort, ...info });
    else if (kind === 'INDEX') t.indexes.push({ iname: sort, ...info });
  }

  // DDL 생성
  const out = [
    '-- ============================================================',
    `-- 누락 테이블 DDL (information_schema 추출 자동 변환)`,
    `-- 생성일: ${new Date().toISOString()}`,
    `-- 테이블 수: ${tables.size}`,
    `-- 제외: ${[...EXCLUDED_TABLES].join(', ')}`,
    '-- ============================================================',
    '',
    'PRAGMA foreign_keys = ON;',
    '',
  ];

  const sortedTables = [...tables.keys()].sort();
  const stats = { columns: 0, constraints: 0, indexes: 0, skippedIdx: 0 };

  for (const tn of sortedTables) {
    const { columns, constraints, indexes } = tables.get(tn);
    columns.sort((a, b) => a.sort.localeCompare(b.sort));

    out.push(`-- ── ${tn}`);
    out.push(`CREATE TABLE IF NOT EXISTS ${tn} (`);

    const colLines = [];
    for (const col of columns) {
      const sqliteType = udtToSqlite(col.udt, col.type);
      const def = defaultToSqlite(col.default);
      const notNull = col.nullable === 'NO' && !def ? ' NOT NULL' : '';
      const defClause = def ? ` DEFAULT ${def}` : '';
      colLines.push(`  ${col.column} ${sqliteType}${notNull}${defClause}`);
      stats.columns++;
    }

    // 제약 (PK, UNIQUE, FK, CHECK)
    for (const c of constraints) {
      const transformed = constraintToSqlite(c.def);
      colLines.push(`  CONSTRAINT ${c.cname} ${transformed}`);
      stats.constraints++;
    }

    out.push(colLines.join(',\n'));
    out.push(');');
    out.push('');

    // INDEX
    for (const idx of indexes) {
      // pkey 인덱스는 PK 제약이 자동 생성 → skip
      if (idx.iname.endsWith('_pkey')) { stats.skippedIdx++; continue; }
      // UNIQUE constraint와 같은 이름의 인덱스는 constraint가 처리 → skip
      if (constraints.some((c) => c.cname === idx.iname && c.type === 'u')) {
        stats.skippedIdx++; continue;
      }
      let d = idx.def;
      // USING btree → 제거 (SQLite 기본)
      d = d.replace(/\s+USING\s+btree/gi, '');
      // USING gin/gist/brin/hash → SQLite 미지원, 인덱스 전체 skip
      if (/\s+USING\s+(gin|gist|brin|hash|spgist)/i.test(d)) {
        stats.skippedIdx++;
        continue;
      }
      // public. schema prefix 제거
      d = d.replace(/\bpublic\./g, '');
      // type cast 제거 ('value'::TYPE → 'value', col::TYPE → col)
      d = d.replace(/'([^']*)'(?:\s*::\s*\w+(?:\[\s*\])?)/g, "'$1'");
      d = d.replace(/\)::[\w\s]+(?=[\),\s])/g, ')'); // (...)::type → (...)
      d = d.replace(/::[\w\s]+(?=[\),\s])/g, ''); // 일반 ::type → 제거
      // NULLS LAST/FIRST 제거 (SQLite는 기본 정렬, 명시 미지원)
      d = d.replace(/\s+NULLS\s+(LAST|FIRST)/gi, '');
      d = d.replace(/^CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/i, 'CREATE $1INDEX IF NOT EXISTS ');
      if (!d.endsWith(';')) d += ';';
      out.push(d);
      stats.indexes++;
    }
    out.push('');
  }

  await writeFile(OUT, out.join('\n'));

  console.log(`✓ ${OUT}`);
  console.log(`  테이블: ${tables.size}`);
  console.log(`  컬럼: ${stats.columns}`);
  console.log(`  제약: ${stats.constraints}`);
  console.log(`  인덱스: ${stats.indexes} (skip ${stats.skippedIdx})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
