#!/usr/bin/env node
// ============================================================
// validate-schema.mjs
// d1_schema_final.sql을 in-memory SQLite에 적용하여 문법 검증
// ============================================================

import Database from 'better-sqlite3';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const SCHEMA = join(REPO_ROOT, 'scripts', 'migrate-d1', 'output', 'd1_schema_final.sql');

// 문자열 리터럴과 주석을 고려한 SQL statement splitter
function splitStatements(sql) {
  const out = [];
  let cur = '';
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    // 한 줄 주석
    if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') { cur += sql[i++]; }
      continue;
    }
    // 블록 주석
    if (c === '/' && sql[i + 1] === '*') {
      cur += '/*'; i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) { cur += sql[i++]; }
      if (i < sql.length) { cur += '*/'; i += 2; }
      continue;
    }
    // 문자열 리터럴
    if (c === "'") {
      cur += c; i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") { cur += "''"; i += 2; continue; }
        if (sql[i] === "'") { cur += "'"; i++; break; }
        cur += sql[i++];
      }
      continue;
    }
    if (c === ';') {
      cur += ';';
      const trimmed = cur.trim();
      if (trimmed && !trimmed.replace(/--[^\n]*/g, '').trim().match(/^\s*$/)) {
        out.push(trimmed);
      }
      cur = '';
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

async function main() {
  const sql = await readFile(SCHEMA, 'utf8');
  const db = new Database(':memory:');

  // 우선 전체 적용 시도
  try {
    db.exec(sql);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'").all();
    console.log('✓ 전체 schema 적용 성공');
    console.log(`  테이블: ${tables.length}`);
    console.log(`  인덱스: ${indexes.length}`);
    return;
  } catch (err) {
    console.error(`✗ 전체 적용 실패: ${err.message}`);
    console.log('');
  }

  // Statement별로 정확히 분리해서 시도
  const statements = splitStatements(sql);
  console.log(`총 statement: ${statements.length}`);

  const db2 = new Database(':memory:');
  let ok = 0;
  const errors = [];
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    try {
      db2.exec(stmt);
      ok++;
    } catch (err) {
      const head = stmt.substring(0, 300).replace(/\n/g, ' ');
      errors.push({ idx: i, head, err: err.message });
      if (errors.length > 15) break;
    }
  }

  console.log(`statement 적용: ${ok} ok / ${errors.length} fail`);
  console.log('');
  for (const e of errors) {
    console.log(`──── [${e.idx}] ${e.err}`);
    console.log(`     ${e.head}...`);
    console.log('');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
