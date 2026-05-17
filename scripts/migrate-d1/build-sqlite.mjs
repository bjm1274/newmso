#!/usr/bin/env node
// ============================================================
// build-sqlite.mjs
// d1_schema_final.sql을 적용한 .sqlite 파일 생성
// (drizzle-kit pull / introspect 입력용)
// ============================================================

import Database from 'better-sqlite3';
import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const SCHEMA = join(REPO_ROOT, 'scripts', 'migrate-d1', 'output', 'd1_schema_final.sql');

// SQLite가 정규화한 단일 CREATE TABLE DDL에서 CHECK 제약 제거
// (drizzle-kit 0.31.x introspect 버그 우회)
function stripChecksFromTableDDL(ddl) {
  let out = '';
  let i = 0;
  while (i < ddl.length) {
    if (i + 5 <= ddl.length) {
      const word = ddl.substring(i, i + 5);
      const prev = i > 0 ? ddl[i - 1] : '(';
      const after = i + 5 < ddl.length ? ddl[i + 5] : '';
      if (word.toLowerCase() === 'check' && /[\s,(]/.test(prev) && /[\s(]/.test(after)) {
        let p = i + 5;
        while (p < ddl.length && /\s/.test(ddl[p])) p++;
        if (ddl[p] === '(') {
          let depth = 1;
          let end = p + 1;
          while (end < ddl.length && depth > 0) {
            if (ddl[end] === '(') depth++;
            else if (ddl[end] === ')') depth--;
            if (depth > 0) end++;
          }
          // 'CONSTRAINT name ' 패턴이 앞에 있으면 standalone CHECK → CONSTRAINT 통째로 제거
          const cm = out.match(/(,\s*)?CONSTRAINT\s+[\w_]+\s+$/i);
          if (cm) {
            out = out.substring(0, out.length - cm[0].length);
          }
          // inline CHECK인 경우 (column 정의 안): CHECK 부분만 제거, 컬럼 정의·트레일링 콤마는 보존
          i = end + 1;
          continue;
        }
      }
    }
    out += ddl[i++];
  }
  // 후처리: 연속 콤마, 트레일링 콤마, 리딩 콤마 정리
  out = out.replace(/,(\s*),/g, ',$1');       // ',  ,' → ','
  out = out.replace(/,(\s*\))/g, '$1');       // ', )' → ')'
  out = out.replace(/\((\s*),/g, '($1');      // '( ,' → '('
  return out;
}

async function buildSqlite(outPath, stripChecksMode) {
  if (existsSync(outPath)) await unlink(outPath);
  const sql = await readFile(SCHEMA, 'utf8');

  if (!stripChecksMode) {
    const db = new Database(outPath);
    db.exec(sql);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'").all();
    console.log(`✓ ${outPath}`);
    console.log(`  테이블: ${tables.length}, 인덱스: ${indexes.length}, stripChecks: ${stripChecksMode}`);
    db.close();
    return;
  }

  // CHECK 제거 모드: 먼저 임시 sqlite에 원본 적용 → sqlite_master에서 CREATE 가져옴
  // → CHECK 제거 → 새 sqlite에 적용
  const tempDb = new Database(':memory:');
  tempDb.exec(sql);
  const tables = tempDb.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL ORDER BY name").all();
  const indexes = tempDb.prepare("SELECT name, sql, tbl_name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL").all();
  tempDb.close();

  const newDb = new Database(outPath);
  newDb.exec('PRAGMA foreign_keys = OFF;'); // FK 일시 OFF로 순서 무관 적용
  let okT = 0, failT = 0, okI = 0, failI = 0;
  const errs = [];
  for (const t of tables) {
    const ddl = stripChecksFromTableDDL(t.sql);
    try { newDb.exec(ddl + ';'); okT++; }
    catch (e) { failT++; errs.push(`TABLE ${t.name}: ${e.message}\n  DDL: ${ddl.substring(0, 200)}`); }
  }
  for (const idx of indexes) {
    try { newDb.exec(idx.sql + ';'); okI++; }
    catch (e) { failI++; errs.push(`INDEX ${idx.name}: ${e.message}`); }
  }
  console.log(`✓ ${outPath}`);
  console.log(`  테이블: ${okT} ok / ${failT} fail, 인덱스: ${okI} ok / ${failI} fail`);
  if (errs.length > 0) {
    console.log(`  처음 5개 에러:`);
    errs.slice(0, 5).forEach((e) => console.log(`    ${e}`));
  }
  newDb.close();
}

async function main() {
  await buildSqlite(join(REPO_ROOT, 'scripts', 'migrate-d1', 'output', 'd1_schema.sqlite'), false);
  await buildSqlite(join(REPO_ROOT, 'scripts', 'migrate-d1', 'output', 'd1_schema_for_drizzle.sqlite'), true);
}

main().catch((e) => { console.error(e); process.exit(1); });
